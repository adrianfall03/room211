// 入口：渲染器 / 后处理 / 资源生成 / 主循环
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShadowCache } from './core/shadows.js';
import { patchLightSkip } from './core/lightskip.js';
import * as TX from './core/textures.js';
import { audio } from './core/audio.js';
import { Input } from './core/input.js';
import { CollisionWorld } from './core/collision.js';
import { nextFrame } from './core/util.js';
import { buildDorm } from './world/dorm.js';
import { buildRuinTextures, decorateRuin } from './world/ruin.js';
import { buildShipTextures, decorateShip, buildShipOutside } from './world/ship.js';
import { buildMetroTextures, decorateMetro, buildMetroOutside } from './world/metro.js';
import { buildJungleTextures, decorateJungle } from './world/jungle.js';
import { buildFrostTextures, decorateFrost } from './world/frost.js';
import { buildSpaceTextures, decorateSpace, buildSpaceOutside } from './world/space.js';
import { buildFinale } from './world/finale.js';
import { GradePass, CSS_GRADES } from './core/grade.js';
import { createCharacter } from './player/character.js';
import { Controller } from './player/controller.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';

// 准考证头像 assets/face.jpg 只放在本地（不进 git）：开发模式和 build:face 会用上；默认打包的公开版不带它，准考证上画剪影
const faceUrl = import.meta.env.MODE === 'production' ? null
  : Object.values(import.meta.glob('./assets/face.jpg', { eager: true, query: '?url', import: 'default' }))[0] ?? null;

// ---------- 设置（本地记忆，失败时用默认值）----------
const isMobile = matchMedia('(pointer: coarse)').matches;
const settings = { sens: 1, vol: 0.8, quality: isMobile ? 'low' : 'high', invertY: false, name: '', mode: 'game' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('dorm404') || '{}')); } catch (e) { /* 忽略 */ }
// 存档升级：原来的第四章（太空舱）挪到了第五章，中间插进来一章「冰封 211」——以前打到第四章的，第四、五章都算解锁
if ((settings.v || 1) < 2) { if (settings.unlocked >= 4) settings.unlocked += 1; if (settings.chapter >= 4) settings.chapter += 1; settings.v = 2; }
// 第二次升级：第二章和雨林之间又插进来两章（船舱 211、地铁 211）——雨林 / 冰封 / 太空舱各往后挪两章，解锁进度跟着挪
if (settings.v < 3) { if (settings.unlocked >= 3) settings.unlocked += 2; if (settings.chapter >= 3) settings.chapter += 2; settings.v = 3; }
const saveSettings = () => { try { localStorage.setItem('dorm404', JSON.stringify(settings)); } catch (e) { /* 忽略 */ } };

// ---------- 渲染 ----------
patchLightSkip(); // 关着的灯 / 照不到的像素不算光照，必须在任何材质编译之前（见 core/lightskip.js）
// 场景本身照旧用 4×MSAA 画，画完解析成普通贴图，后面的 GTAO / 描边 / Bloom / 调色都在普通缓冲里做。
// 以前整条后处理链的缓冲全是 4×MSAA 半浮点，每个全屏 pass 都要多读写 4 倍的数据、再 resolve 一次，白白发热。
class MSAARenderPass extends RenderPass {
  constructor(scene, camera) {
    super(scene, camera);
    this.msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false }));
    this.copy.material.uniforms.tDiffuse.value = this.msaa.texture;
  }
  setSize(w, h) { this.msaa.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    super.render(renderer, writeBuffer, this.msaa, dt, mask);
    renderer.setRenderTarget(readBuffer);
    this.copy.render(renderer);
  }
}

// GTAO 放到半分辨率算：AO 本来就是很柔和的低频信号，还要经过泊松降噪，半分辨率算完再双线性放大几乎看不出区别，
// 法线 / AO / 降噪三步的开销都只剩四分之一。结果直接乘到当前画面上，省掉原来先整屏拷贝一遍的那一步。
class HalfResGTAOPass extends GTAOPass {
  constructor(...args) {
    super(...args);
    this.output = GTAOPass.OUTPUT.Off; // 只算 AO，输出由下面自己做
    this.needsSwap = false;
  }
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }
  // 画法线 / 深度之前要藏起来的东西。GTAO 用覆盖材质把整个场景重画一遍，覆盖材质是写深度的，
  // 原本不写深度的透明物体（窗口的体积光柱切片、玻璃、雾……）也会被当成实心面画进去：
  // 光柱从窗口斜着伸进屋里四米多，等于半空里立起一排看不见的墙，墙两边被算成"墙角"一块块压黑，
  // 真正的地板和家具反而被挡住、没有 AO——站在窗边往屋里回头看，光柱穿过的那一片屋子就发黑（第二章黄昏、第五章阳光照进舱里时最明显）。
  // 这里只留"主画面里会写深度的表面"：GTAOPass 原本就去掉的点、线，再加上所有不写深度的材质。
  // 用图层掩码只屏蔽物体自己（visible = false 会连它的子物体一起藏掉）
  _overrideVisibility() {
    const cache = this._maskCache || (this._maskCache = []);
    const noDepth = (m) => (Array.isArray(m) ? m.every((x) => !x || !x.depthWrite) : !m || !m.depthWrite);
    const hideAll = (o) => { cache.push(o, o.layers.mask); o.layers.mask = 0; for (const c of o.children) hideAll(c); };
    const visit = (o) => {
      if (!o.visible) return;
      // userData.noAO：整棵子树都不参与（第四章窗外的城市：隔着窗上半透明的冰花，AO 会把后面的房子"印"到冰花上）
      if (o.userData.noAO) { hideAll(o); return; }
      if (o.isPoints || o.isLine || o.isLine2 || ((o.isMesh || o.isSprite) && noDepth(o.material))) { cache.push(o, o.layers.mask); o.layers.mask = 0; }
      const c = o.children;
      for (let i = 0; i < c.length; i++) visit(c[i]);
    };
    visit(this.scene);
  }
  _restoreVisibility() {
    const cache = this._maskCache;
    for (let i = 0; i < cache.length; i += 2) cache[i].layers.mask = cache[i + 1];
    cache.length = 0;
  }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
    this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
    this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
    this._renderPass(renderer, this.blendMaterial, readBuffer);
  }
}

class Gfx {
  constructor(container) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;
    this.quality = 'high';
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.outlined = null;
  }
  init(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.shadows = new ShadowCache(this.renderer, scene);
    // 后处理缓冲：不用多重采样、也不要深度（场景在 MSAARenderPass 自己的缓冲里画）
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new MSAARenderPass(scene, camera);
    this.gtao = new HalfResGTAOPass(scene, camera, 1, 1);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    // 降噪半径按半分辨率折半，模糊范围和原来全分辨率时一样
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, rings: 2, samples: 12 });
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    this.outline.edgeStrength = 2.6;
    this.outline.edgeGlow = 0.4;
    this.outline.edgeThickness = 1.2;
    this.outline.pulsePeriod = 2.2;
    this.outline.visibleEdgeColor.set('#7ffbe4');
    this.outline.hiddenEdgeColor.set('#1d4a44');
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.93);
    this.grade = new GradePass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.outline);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.theme = 'normal';
    this.bloomBase = { strength: 0.22, radius: 0.45, threshold: 0.93 };
    window.addEventListener('resize', () => this.resize());
  }
  // 每一章的画面风格：调色、Bloom、AO
  setTheme(theme, instant = false) {
    this.theme = theme;
    this.grade.set(theme, instant);
    const b = { normal: [0.22, 0.45, 0.93], ruin: [0.3, 0.5, 0.88], ship: [0.3, 0.45, 0.86], metro: [0.36, 0.5, 0.84], jungle: [0.3, 0.45, 0.86], frost: [0.34, 0.5, 0.85], space: [0.28, 0.42, 0.88], finale: [0.28, 0.5, 0.9] }[theme] || [0.22, 0.45, 0.93];
    this.bloom.strength = b[0]; this.bloom.radius = b[1]; this.bloom.threshold = b[2];
    this.renderer.toneMappingExposure = { ship: 1.12, metro: 1.14, jungle: 1.15, frost: 1.12, space: 1.12, finale: 1.1 }[theme] || 1.05;
    this.setQuality(this.quality);
  }
  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(pr);
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
      this.shadows.invalidate();
    }
    this.gtao.enabled = q === 'high';
    this.bloom.enabled = q !== 'low';
    this.useComposer = q !== 'low';
    this.canvas.style.filter = this.useComposer ? '' : (CSS_GRADES[this.theme] || '');
    this.resize();
  }
  setOutline(obj) {
    this.outlined = obj;
    if (this.outline) this.outline.selectedObjects = obj ? [obj] : [];
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.renderer.getDrawingBufferSize(this.bufferSize || (this.bufferSize = new THREE.Vector2()));
    this.dirty = true; // 改了尺寸，画布被清空了：暂停中也要补画一帧
  }
  render(dt = 0, t = 0) {
    this.dirty = false;
    this.grade.update(dt, t, this.width / Math.max(1, this.height));
    // 阴影：这一帧第一次画主场景时更新一次（灯灭着的不画、不动的东西用缓存），见 core/shadows.js
    this.shadows.arm();
    // viewScene：第五章彩蛋里有几个镜头直接拍"那天晚上的 211"（另一个场景）；那边不受太空舱的裁剪面影响
    const sc = this.viewScene || this.scene;
    if (this.renderPass.scene !== sc) { this.renderPass.scene = sc; this.gtao.scene = sc; }
    const planes = this.renderer.clippingPlanes;
    if (sc !== this.scene) this.renderer.clippingPlanes = [];
    if (this.useComposer) this.composer.render();
    else this.renderer.render(sc, this.camera);
    this.renderer.clippingPlanes = planes;
  }
}

// ---------- 贴图生成 ----------
async function buildTextures(ui) {
  const T = {};
  const steps = [
    ['铺地砖……', () => { T.floor = TX.genFloor(); T.floorDirt = TX.genFloorDirt(); }],
    ['刷墙（顺便把墙根弄脏）……', () => { T.wall = TX.genWall(); T.ceiling = TX.genCeiling(); }],
    ['打磨旧木桌……', () => {
      T.woodDark = TX.genWood({ base: '#6a321f', dark: '#3f1d10', light: '#8c4b2e', seed: 5 });
      T.woodLight = TX.genWood({ base: '#d4bc93', dark: '#b39468', light: '#e8d5b0', seed: 6, rings: 7 });
      T.woodOrange = TX.genWood({ base: '#b3602c', dark: '#84401a', light: '#cf7a3e', seed: 7 });
      T.doorWood = TX.genWood({ base: '#5a2e1c', dark: '#3a1a0e', light: '#7a4028', seed: 8, rings: 5 });
      T.blackLaminate = TX.genBlackLaminate();
    }],
    ['挂窗帘、支蚊帐……', () => {
      T.curtain = TX.genCloth({ base: '#6f737b', seed: 61, contrast: 1.2 }); T.curtain.repeat.set(4, 3);
      T.net = TX.genNet(); T.net.repeat.set(10, 10);
      T.grayCloth = TX.genCloth({ base: '#8b929c', seed: 62 }); T.grayCloth.repeat.set(3, 3);
      T.pinkCloth = TX.genCloth({ base: '#e3a3b4', seed: 63 }); T.pinkCloth.repeat.set(3, 3);
      T.blackCloth = TX.genCloth({ base: '#232327', seed: 64, vertical: false }); T.blackCloth.repeat.set(2, 2);
      T.blueCloth = TX.genCloth({ base: '#3d6db5', seed: 65, vertical: false }); T.blueCloth.repeat.set(2, 2);
      T.whiteCloth = TX.genCloth({ base: '#e8e5de', seed: 66, vertical: false, contrast: 0.5 }); T.whiteCloth.repeat.set(2, 2);
    }],
    ['铺凉席、晒被子……', () => {
      T.bamboo = TX.genBambooMat(); T.bamboo.repeat.set(2, 4);
      T.floral = TX.genFloral(); T.floral.repeat.set(2, 2);
      T.polka = TX.genPolka(); T.polka.repeat.set(3, 2);
      T.yellowDots = TX.genYellowDots();
      T.patternRoll = TX.genPatternRoll(); T.patternRoll.repeat.set(1, 2);
    }],
    ['堆纸箱、散落复习资料……', () => {
      T.cardboard = TX.genCardboard();
      T.cardboard350 = TX.genCardboard({ print: '350' });
      T.paperMath = [1, 2, 3, 4].map((i) => TX.genPaper(i % 3 === 0 ? 'lined' : 'math', i));
      T.foldedNote1 = TX.genFoldedNote(1);
      T.foldedNote2 = TX.genFoldedNote(2);
      T.notebook = TX.genNotebookSpread();
      T.stickyMain = TX.genStickyNote('给睡神\n的一封信');
      T.suitNote = TX.genStickyNote('密码？\n最怕的\n那一天', '#a8e4ff');
      T.roster = TX.genDutyRoster(Array(7).fill('')); // 室友名字每局随机，开局时再填
    }],
    ['画窗外的风景……', () => {
      T.windowView = TX.genWindowView();
      T.clockFace = TX.genClockFace();
      T.mousepad = TX.genMousepad();
    }],
  ];
  for (let i = 0; i < steps.length; i++) {
    ui.loading(0.05 + (i / steps.length) * 0.6, steps[i][0]);
    await nextFrame();
    steps[i][1]();
  }
  return T;
}

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

// ---------- 启动 ----------
async function boot() {
  const app = document.getElementById('app');
  const ui = new UI(audio);
  ui.loading(0.02, '正在打开 211 宿舍的门……');
  await nextFrame();
  const gfx = new Gfx(app);
  TX.setAniso(Math.min(8, gfx.renderer.capabilities.getMaxAnisotropy()));
  const faceImg = faceUrl ? await loadImage(faceUrl) : null;
  const T = await buildTextures(ui);

  ui.loading(0.7, '摆放家具和杂物……');
  await nextFrame();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050608');
  const pmrem = new THREE.PMREMGenerator(gfx.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 60);
  const collision = new CollisionWorld();
  let ch = null;
  // 镜子：低画质不渲染真反射；洗漱台那面只在人进了洗手间时才算；第一人称时头是隐藏的，照镜子时临时显示出来
  const setupMirrors = (refs) => {
    for (const m of refs.mirrors) {
      const at = m.mesh.getWorldPosition(new THREE.Vector3());
      // 离远了镜子在屏幕上很小，不值得把整个场景再画一遍
      m.enabled = () => gfx.quality !== 'low' && (!m.inZone || m.inZone(camera)) && camera.position.distanceTo(at) < m.maxDist;
      m.pre = () => { const v = ch.J.neck.visible; ch.J.neck.visible = true; return v; };
      m.post = (v) => { ch.J.neck.visible = v; };
    }
  };
  // 七个章节共用一套布局，换章时整个宿舍拆掉重建成另一种画风
  const THEMES = {
    normal: { tex: () => T, decorate: null },
    ruin: { tex: () => buildRuinTextures(T), decorate: decorateRuin },
    ship: { tex: () => buildShipTextures(T), decorate: decorateShip, outside: buildShipOutside },
    metro: { tex: () => buildMetroTextures(T), decorate: decorateMetro, outside: buildMetroOutside },
    jungle: { tex: () => buildJungleTextures(T), decorate: decorateJungle },
    frost: { tex: () => buildFrostTextures(T), decorate: decorateFrost },
    space: { tex: () => buildSpaceTextures(T), decorate: decorateSpace, outside: buildSpaceOutside },
  };
  const buildWorld = (theme) => {
    collision.boxes.length = 0;
    // 结局：不是宿舍了，是征兵站门前的广场
    if (theme === 'finale') return buildFinale(scene, gfx.renderer);
    const th = THEMES[theme] || THEMES.normal;
    const refs = buildDorm(scene, th.tex(), collision, { faceImg, theme, decorate: th.decorate, outside: th.outside });
    setupMirrors(refs);
    return refs;
  };
  const refs = buildWorld('normal');
  // 第五章彩蛋：书架背后"那天晚上的 211"——另搭一间写实画风的宿舍，放在单独的场景里（不动主场景的碰撞和灯光）
  const buildPast = () => {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color('#050608');
    const pastRefs = buildDorm(sc, T, new CollisionWorld(), { faceImg, theme: 'normal' });
    for (const m of pastRefs.mirrors) m.enabled = () => false;
    return { scene: sc, refs: pastRefs };
  };

  ui.loading(0.82, '照着照片捏主角……');
  await nextFrame();
  ch = createCharacter();
  scene.add(ch.root);

  const input = new Input(gfx.canvas);
  input.sensitivity = settings.sens;
  const ctrl = new Controller({ camera, character: ch, input, collision, camBoxes: refs.camBoxes, bounds: refs.bounds, audio });
  ctrl.sensitivity = settings.sens;
  ctrl.invertY = settings.invertY;

  gfx.init(scene, camera);
  gfx.setQuality(settings.quality);
  audio.setVolume(settings.vol);

  const game = new Game({ gfx, scene, camera, refs, ch, ctrl, input, ui, audio, collision, faceImg, settings, saveSettings, buildWorld, buildPast });
  game.enterTitle();
  game.update(0.016);

  ui.loading(0.9, '预热着色器……');
  await nextFrame();
  try {
    if (gfx.renderer.compileAsync) {
      // 预编译着色器，最多等 4 秒（后台标签页里可能不会推进）
      await Promise.race([gfx.renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 4000))]);
    }
  } catch (e) { /* 忽略 */ }
  gfx.render();

  if (input.isTouch) { input.bindTouch(document.getElementById('stick'), document.querySelector('#stick i')); ui.bindTouchButtons(input); document.body.classList.add('is-touch'); }

  ui.loading(1, '准备就绪');
  await nextFrame();
  ui.hideLoading();
  // 名字、画质不放在标题上了：名字沿用以前存下的（没有就叫"我"），画质在暂停菜单里改
  ui.showTitle({
    lastChapter: Math.min(settings.chapter || 1, settings.unlocked || 1),
    onStart: ({ mode, chapter }) => {
      audio.init();
      settings.mode = mode;
      if (mode === 'game') settings.chapter = chapter;
      saveSettings();
      game.startIntro({ name: settings.name || '', chapter, view: mode === 'view' });
    },
  });

  // 主循环：最多约 60 帧/秒。高刷屏（MacBook 的 120Hz ProMotion 等）上 rAF 一秒来 120 次，
  // 每次都画的话 GPU 的活直接翻倍；这里按屏幕刷新间隔隔几次画一次（120Hz → 60，144Hz → 72），节奏均匀不抖
  //   · 弹窗（线索本、密码锁、纸条……）打开时：后面的场景压暗又糊着，30 帧就够了；
  //   · 窗口不在前台时的标题画面：30 帧（镜头慢慢飘，没人盯着看）；
  //   · 暂停菜单：画面定格，不推进也不重画——切到别的窗口时会自动暂停，以前暂停着也一直满帧在画。
  //     窗口大小 / 画质变了才补画一帧（gfx.dirty）
  const MAX_FPS = 60, CALM_FPS = 30;
  const timer = new THREE.Timer();
  timer.connect(document);
  let rafAvg = 1000 / MAX_FPS, rafLast = 0, rafSkip = 0;
  const frame = (ts) => {
    requestAnimationFrame(frame);
    const d = ts - rafLast;
    rafLast = ts;
    if (d > 2 && d < 50) rafAvg += (d - rafAvg) * 0.05;
    const calm = ui.modalOpen || (game.state === 'title' && !document.hasFocus());
    if (++rafSkip < Math.max(1, Math.floor(1000 / (calm ? CALM_FPS : MAX_FPS) / rafAvg + 0.2))) return;
    rafSkip = 0;
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (window.__hold) return; // 自动化测试：暂停主循环，用 ff() 推进、render() 手动画一帧
    if (game.paused) {
      input.endFrame(); // 暂停时按过的键不留到继续游戏以后
      if (gfx.dirty) { game.beforeRender(); gfx.render(0, game.time); }
      return;
    }
    game.update(dt);
    game.beforeRender();
    gfx.render(dt, game.time);
  };
  requestAnimationFrame(frame);

  // 调试接口（方便测试）
  // ff(秒)：不渲染、只推进游戏逻辑（自动化测试时用，软件渲染一帧要好几秒）
  const ff = async (sec) => { for (let i = 0; i < sec / 0.05; i++) { game.update(0.05); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0)); } };
  window.__game = { game, gfx, scene, camera, get refs() { return game.refs; }, ch, ctrl, input, ui, audio, THREE, ff, render: () => { game.beforeRender(); gfx.render(0.016, game.time); } };
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#111;color:#f88;font:16px sans-serif;padding:20px;text-align:center;z-index:99';
  d.textContent = '启动失败：' + (e && e.message ? e.message : e) + '（请使用最新版 Chrome / Edge / Safari 打开）';
  document.body.appendChild(d);
});
