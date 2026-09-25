// 入口：渲染器 / 后处理 / 资源生成 / 主循环
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TX from './core/textures.js';
import { audio } from './core/audio.js';
import { Input } from './core/input.js';
import { CollisionWorld } from './core/collision.js';
import { nextFrame } from './core/util.js';
import { buildDorm } from './world/dorm.js';
import { buildRuinTextures, decorateRuin } from './world/ruin.js';
import { buildToonTextures, decorateToon } from './world/toon.js';
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
const saveSettings = () => { try { localStorage.setItem('dorm404', JSON.stringify(settings)); } catch (e) { /* 忽略 */ } };

// ---------- 渲染 ----------
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
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.gtao = new GTAOPass(scene, camera, 1, 1);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
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
    const b = { normal: [0.22, 0.45, 0.93], ruin: [0.3, 0.5, 0.88], toon: [0.3, 0.5, 0.95], space: [0.42, 0.55, 0.84], finale: [0.28, 0.5, 0.9] }[theme] || [0.22, 0.45, 0.93];
    this.bloom.strength = b[0]; this.bloom.radius = b[1]; this.bloom.threshold = b[2];
    this.renderer.toneMappingExposure = { toon: 0.98, space: 1.0, finale: 1.1 }[theme] || 1.05;
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
    }
    this.gtao.enabled = q === 'high' && this.theme !== 'toon' && this.theme !== 'space';
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
  }
  render(dt = 0, t = 0) {
    this.grade.update(dt, t, this.width / Math.max(1, this.height));
    // 阴影只在灯亮时更新，省性能
    if (!this.shadowLights) {
      this.shadowLights = [];
      this.scene.traverse((o) => { if (o.isLight && o.castShadow) this.shadowLights.push(o); });
    }
    for (const l of this.shadowLights) {
      // 静态阴影（洗手间的灯）：只在第一次和开关门时由游戏逻辑手动刷新
      if (l.userData.staticShadow) { l.shadow.autoUpdate = false; if (l.shadow.map === null) l.shadow.needsUpdate = true; continue; }
      const on = l.intensity > 0.01;
      if (l.shadow.map === null || on !== l.userData.shadowOn) { l.userData.shadowOn = on; l.shadow.needsUpdate = true; }
      l.shadow.autoUpdate = on;
    }
    if (this.useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
  // 四个章节共用一套布局，换章时整个宿舍拆掉重建成另一种画风
  const THEMES = {
    normal: { tex: () => T, decorate: null },
    ruin: { tex: () => buildRuinTextures(T), decorate: decorateRuin },
    toon: { tex: () => buildToonTextures(T), decorate: decorateToon },
    space: { tex: () => buildSpaceTextures(T), decorate: decorateSpace, outside: buildSpaceOutside },
  };
  const buildWorld = (theme) => {
    collision.boxes.length = 0;
    // 结局：不是宿舍了，是征兵站门前的广场
    if (theme === 'finale') return buildFinale(scene);
    const th = THEMES[theme] || THEMES.normal;
    const refs = buildDorm(scene, th.tex(), collision, { faceImg, theme, decorate: th.decorate, outside: th.outside });
    setupMirrors(refs);
    return refs;
  };
  const refs = buildWorld('normal');

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

  const game = new Game({ gfx, scene, camera, refs, ch, ctrl, input, ui, audio, collision, faceImg, settings, saveSettings, buildWorld });
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

  if (input.isTouch) { input.bindTouch(document.getElementById('stick'), document.querySelector('#stick i')); ui.bindTouchButtons(input); }

  ui.loading(1, '准备就绪');
  await nextFrame();
  ui.hideLoading();
  ui.showTitle({
    defaultName: settings.name,
    defaultMode: settings.mode,
    quality: settings.quality,
    onQuality: (q) => { settings.quality = q; gfx.setQuality(q); saveSettings(); },
    unlocked: settings.unlocked || 1,
    defaultChapter: Math.min(settings.chapter || 1, settings.unlocked || 1),
    onStart: ({ name, mode, quality, chapter }) => {
      audio.init();
      settings.name = name; settings.mode = mode; settings.quality = quality;
      if (mode === 'game') settings.chapter = chapter;
      saveSettings();
      game.startIntro({ name, chapter, view: mode === 'view' });
    },
  });

  // 主循环
  const timer = new THREE.Timer();
  timer.connect(document);
  const frame = (ts) => {
    requestAnimationFrame(frame);
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.05);
    game.update(dt);
    gfx.render(dt, game.time);
  };
  requestAnimationFrame(frame);

  // 调试接口（方便测试）
  // ff(秒)：不渲染、只推进游戏逻辑（自动化测试时用，软件渲染一帧要好几秒）
  const ff = async (sec) => { for (let i = 0; i < sec / 0.05; i++) { game.update(0.05); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0)); } };
  window.__game = { game, gfx, scene, camera, get refs() { return game.refs; }, ch, ctrl, input, ui, audio, THREE, ff };
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#111;color:#f88;font:16px sans-serif;padding:20px;text-align:center;z-index:99';
  d.textContent = '启动失败：' + (e && e.message ? e.message : e) + '（请使用最新版 Chrome / Edge / Safari 打开）';
  document.body.appendChild(d);
});
