// 第三章：动物园 211 —— 同一间宿舍，变成了温馨的卡通世界，晚上 22:30，快熄灯了。
//   马卡龙配色 + 三阶卡通着色 + 描边；彩灯、夜光星星、化妆镜灯泡、地毯、气球、海报；
//   室友们变成了一群拟人化的鸡（打游戏）、马（躺床上刷手机）、猴（对着镜子摆造型）
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TT from '../core/tex_toon.js';
import { mulberry32 } from '../core/util.js';
import { toonifyScene, toonMat, addOutline, GRAD } from './toonkit.js';
import { LightShafts } from './fx.js';
import { Chicken, Chick, Horse, Monkey } from './animals.js';

export function buildToonTextures(B) {
  const T = {};
  T.floor = TT.genFloorToon(); T.floorDirt = TT.genFloorDirtToon();
  T.wall = TT.genWallToon();
  const cs = TT.genCeilingStars(); T.ceiling = cs.map; T.ceilingEm = cs.emissiveMap;
  T.woodDark = TT.genWoodToon({ base: '#eaa878', line: '#c47a4a', seed: 1 });
  T.woodLight = TT.genWoodToon({ base: '#ffe2b8', line: '#e8b888', seed: 2 });
  T.woodOrange = TT.genWoodToon({ base: '#ffb88a', line: '#e08a5a', seed: 3 });
  T.doorWood = TT.genWoodToon({ base: '#ff9f8f', line: '#d8705f', seed: 4 });
  T.blackLaminate = TT.genFlat('#b9a8f2', { S: 64 });
  T.curtain = TT.genCurtainToon(); T.curtain.repeat.set(4, 3);
  T.net = TT.genNetToon(); T.net.repeat.set(10, 10);
  const flat = (c, o, r) => { const t = TT.genFlat(c, o); t.repeat.set(r[0], r[1]); return t; };
  T.grayCloth = flat('#bcd8ff', { pattern: 'dots', fg: '#ffffff', S: 64, step: 16, r: 3 }, [3, 3]);
  T.pinkCloth = flat('#ffc2d8', { pattern: 'hearts', fg: '#ffffff', S: 64, step: 32, r: 6 }, [3, 3]);
  T.blackCloth = flat('#958ccc', { pattern: 'stripes', fg: '#aaa2e0', S: 32, step: 8 }, [2, 2]);
  T.blueCloth = flat('#8fc6ff', { pattern: 'stars', fg: '#fff3a8', S: 64, step: 32, r: 7 }, [2, 2]);
  T.whiteCloth = flat('#fff8ee', { pattern: 'dots', fg: '#ffd8e0', S: 64, step: 16, r: 2.5 }, [2, 2]);
  T.bamboo = flat('#cdf2cd', { pattern: 'stripes', fg: '#b4e4b4', S: 32, step: 8 }, [2, 4]);
  T.floral = TT.genFloralToon(); T.floral.repeat.set(2, 2);
  T.polka = flat('#6f7ed8', { pattern: 'dots', fg: '#ffffff', S: 128, step: 16, r: 3.2 }, [3, 2]);
  T.yellowDots = TT.genFlat('#ffe88a', { pattern: 'dots', fg: '#7aa0ff', S: 64, step: 21, r: 7 });
  T.patternRoll = flat('#ffb3c8', { pattern: 'check', fg: '#fff0f5', S: 64, step: 16 }, [1, 2]);
  T.cardboard = TT.genCardboardToon(); T.cardboard350 = TT.genCardboardToon({ print: '350' });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.windowView = TT.genWindowViewNight();
  T.clockFace = TT.genClockFaceToon();
  T.mousepad = TT.genMousepadToon();
  return T;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function tmesh(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, outline = true, emissive = null, ei = 1, cast = true } = {}) {
  const m = new THREE.Mesh(geo, toonMat(color, { emissive, emissiveIntensity: ei }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = true;
  if (outline) addOutline(m);
  return m;
}

export function decorateToon(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, LAYOUT } = ctx;
  const { SZ, DOOR, WR } = LAYOUT;
  const rnd = mulberry32(3030);
  const props = new THREE.Group(); props.name = 'toonProps';
  const P = (o) => { props.add(o); return o; };

  // ===== 收拾一下：地上的复习资料收掉，紫光涂鸦、雾气层不要了，窗帘拉开看月亮 =====
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh) o.visible = false; });
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.sticky.visible = false;
  refs.studentId.visible = false;
  refs.curtain.layout(0.2); refs.curtain.f = 0.2;
  M.curtain.emissiveIntensity = 0.03;

  // ===== 门：车锁换成一把粉色爱心锁 + 糖果色的塑料链子 =====
  refs.lock.group.visible = false;
  const chain = new THREE.Group(); chain.name = 'heartChain';
  const curve = refs.lock.curve;
  const N = Math.floor(curve.getLength() / 0.034);
  const cols = ['#ff8fb1', '#ffd36e', '#8fe3ff', '#b6ff8f', '#d9b3ff'];
  const linkGeo = new THREE.TorusGeometry(0.02, 0.007, 8, 14); linkGeo.scale(1, 1.5, 1);
  const tan = V(), up = V(0, 1, 0), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const l = new THREE.Mesh(linkGeo, toonMat(cols[i % cols.length]));
    l.position.copy(curve.getPointAt(t));
    curve.getTangentAt(t, tan);
    q1.setFromUnitVectors(up, tan); q2.setFromAxisAngle(tan, (i % 2) * Math.PI / 2);
    l.quaternion.copy(q2.multiply(q1)); l.castShadow = true;
    chain.add(l);
  }
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.05); heart.bezierCurveTo(-0.08, 0.0, -0.05, 0.06, 0, 0.03); heart.bezierCurveTo(0.05, 0.06, 0.08, 0.0, 0, -0.05);
  const hGeo = new THREE.ExtrudeGeometry(heart, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 });
  hGeo.center();
  const lockG = new THREE.Group(); lockG.position.set(-1.56, 0.6, 3.63); lockG.rotation.y = 1.2;
  lockG.add(tmesh(hGeo, '#ff6a9a', { s: 1.1 }));
  lockG.add(tmesh(new THREE.TorusGeometry(0.028, 0.007, 8, 16, Math.PI), '#e8e8f0', { y: 0.045 }));
  for (let i = 0; i < 3; i++) lockG.add(tmesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), ['#ffd36e', '#8fe3ff', '#b6ff8f'][i], { x: -0.022 + i * 0.022, y: -0.01, z: 0.024, rx: Math.PI / 2, outline: false }));
  chain.add(lockG);
  P(chain);
  mark('door', chain);
  const dropped = new THREE.Group(); dropped.visible = false;
  for (let i = 0; i < 26; i++) { const a = i * 0.55; const l = new THREE.Mesh(linkGeo, toonMat(cols[i % cols.length])); l.position.set(-1.24 + Math.cos(a) * 0.12, 0.012 + i * 0.001, 3.5 + Math.sin(a) * 0.09); l.rotation.set(Math.PI / 2, 0, a); dropped.add(l); }
  P(dropped);
  refs.heartLock = { group: chain, lock: lockG, dropped };

  // ===== 地毯、气球、植物、海报 =====
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), new THREE.MeshToonMaterial({ map: TT.genRugToon(), gradientMap: GRAD, transparent: true, alphaTest: 0.2 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-0.05, 0.006, 0.55); rug.receiveShadow = true;
  P(rug);
  const poster = (kind, x, y, z, ry, w = 0.42) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.42), new THREE.MeshToonMaterial({ map: TT.genPosterToon(kind), gradientMap: GRAD }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
    P(m); mark(`poster_${kind}`, m);
    return m;
  };
  poster('chicken', 1.793, 1.72, 0.25, -Math.PI / 2, 0.46);
  poster('horse', -1.793, 2.22, -1.07, Math.PI / 2, 0.36);
  poster('monkey', -1.32, 1.72, SZ - 0.008, Math.PI, 0.4);
  poster('sleep', -1.58, 1.7, -3.592, 0, 0.34);
  // 气球：拴在我床的床柱上，慢慢飘
  const balloons = [];
  [['#ff8fb1', 0.8, 2.55, 2.75], ['#8fe3ff', 0.65, 2.45, 2.62], ['#ffd36e', 0.72, 2.62, 2.45]].forEach(([c, x, y, z], i) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(tmesh(new THREE.SphereGeometry(0.13, 18, 14), c, { s: [1, 1.18, 1], emissive: c, ei: 0.12 }));
    g.add(tmesh(new THREE.ConeGeometry(0.02, 0.03, 8), c, { y: -0.16, rx: Math.PI, outline: false }));
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, y - 1.72, 4), toonMat('#f0f0f0'));
    str.position.y = -(y - 1.72) / 2 - 0.16; g.add(str);
    P(g); balloons.push({ g, x, y, z, ph: i * 2.1 });
  });
  // 盆栽：窗台上的小仙人掌（有脸）+ 窗边角落的大龟背竹
  const cactus = (x, y, z, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    g.add(tmesh(new THREE.CylinderGeometry(0.05, 0.04, 0.06, 14), '#ff9f8f', { y: 0.03 }));
    g.add(tmesh(new THREE.CapsuleGeometry(0.035, 0.07, 6, 12), '#7fd48a', { y: 0.12 }));
    g.add(tmesh(new THREE.CapsuleGeometry(0.015, 0.03, 4, 8), '#7fd48a', { x: 0.04, y: 0.13, rz: -0.8 }));
    g.add(tmesh(new THREE.SphereGeometry(0.012, 8, 6), '#ff8fb1', { y: 0.19, outline: false }));
    for (const s2 of [-1, 1]) g.add(tmesh(new THREE.SphereGeometry(0.006, 6, 5), '#3a2a3a', { x: s2 * 0.013, y: 0.13, z: 0.033, outline: false }));
    P(g); return g;
  };
  cactus(-0.9, 0.955, -3.5); cactus(0.95, 0.955, -3.5, 0.8); cactus(-0.2, 0.74, -3.05, 0.9);
  const monstera = new THREE.Group(); monstera.position.set(1.58, 0, -3.42);
  monstera.add(tmesh(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 16), '#ffd2b5', { y: 0.15 }));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, h = 0.45 + rnd() * 0.45;
    const leaf = tmesh(new THREE.SphereGeometry(0.14, 12, 8), i % 2 ? '#4fc98a' : '#6ad8a0', { x: Math.cos(a) * 0.16, y: 0.3 + h, z: Math.sin(a) * 0.16, s: [1, 0.2, 0.7], rx: 0.3, ry: -a });
    monstera.add(leaf);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, h, 5), toonMat('#3fae6a'));
    stem.position.set(Math.cos(a) * 0.08, 0.3 + h / 2, Math.sin(a) * 0.08); stem.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); monstera.add(stem);
  }
  P(monstera); mark('plant', monstera);
  block(1.4, 1.8, -3.6, -3.22);
  // 窗边书桌上的蘑菇小夜灯
  const shroom = new THREE.Group(); shroom.position.set(0.62, 0.74, -3.28);
  shroom.add(tmesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 12), '#fff4e2', { y: 0.05 }));
  const capMat = new THREE.MeshToonMaterial({ color: '#ff8f9a', emissive: new THREE.Color('#ff6a7a'), emissiveIntensity: 0.9, gradientMap: GRAD });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.position.y = 0.09; shroom.add(cap); addOutline(cap);
  for (let i = 0; i < 5; i++) shroom.add(tmesh(new THREE.SphereGeometry(0.014, 8, 6), '#ffffff', { x: Math.cos(i * 1.3) * 0.055, y: 0.14 + (i % 2) * 0.02, z: Math.sin(i * 1.3) * 0.055, outline: false, emissive: '#ffffff', ei: 0.5 }));
  P(shroom);
  // 爆米花桶 + 能量饮料（打游戏的鸡们的零食）
  const popcorn = new THREE.Group(); popcorn.position.set(1.62, 0.76, 0.72);
  const pcTex = TX.makeCanvas(64, 64), pcx = pcTex.getContext('2d');
  pcx.fillStyle = '#fff'; pcx.fillRect(0, 0, 64, 64); pcx.fillStyle = '#ff5a6a'; for (let x = 0; x < 64; x += 16) pcx.fillRect(x, 0, 8, 64);
  const pcm = new THREE.MeshToonMaterial({ map: TX.toTex(pcTex), gradientMap: GRAD });
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.16, 16, 1, true), pcm); bucket.position.y = 0.08; bucket.material.side = THREE.DoubleSide; popcorn.add(bucket);
  for (let i = 0; i < 14; i++) popcorn.add(tmesh(new THREE.SphereGeometry(0.022, 8, 6), '#fff6d0', { x: (rnd() - 0.5) * 0.1, y: 0.16 + rnd() * 0.04, z: (rnd() - 0.5) * 0.1, outline: false }));
  P(popcorn); mark('popcorn', popcorn);

  // ===== 化妆镜：穿衣镜一圈小灯泡（照镜子的猴子最爱）=====
  const bulbs = [];
  {
    const mg = refs.mirrorG;
    const bm = new THREE.MeshBasicMaterial({ color: '#ffe6b0' });
    const pts = [];
    for (let i = 0; i < 6; i++) { pts.push([-0.16, -0.62 + i * 0.25]); pts.push([0.16, -0.62 + i * 0.25]); }
    pts.push([0, 0.74], [-0.09, 0.73], [0.09, 0.73]);
    for (const [x, y] of pts) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), bm); b.position.set(x, y, -0.03); mg.add(b); bulbs.push(b); }
    mg.add(tmesh(new THREE.BoxGeometry(0.36, 1.52, 0.02), '#ffc2d8', { z: -0.005, outline: false }));
  }
  // ===== 彩灯：沿着两面长墙的墙顶挂一圈 =====
  const fairy = [];
  const strings = [
    [V(1.76, 2.75, -3.45), V(1.76, 2.75, 4.35), 9],
    [V(-1.76, 2.75, -3.45), V(-1.76, 2.75, 3.4), 8],
    [V(-1.3, 2.62, -3.52), V(1.3, 2.62, -3.52), 3],
  ];
  const wirePts = [];
  for (const [a, b, spans] of strings) {
    for (let sp = 0; sp < spans; sp++) {
      const p0 = a.clone().lerp(b, sp / spans), p1 = a.clone().lerp(b, (sp + 1) / spans);
      const pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10, p = p0.clone().lerp(p1, t); p.y -= Math.sin(t * Math.PI) * 0.16; pts.push(p); if (k > 0 && k < 10 && k % 2 === 0) fairy.push({ p: p.clone(), c: new THREE.Color(cols[fairy.length % cols.length]), ph: rnd() * 6.28 }); }
      wirePts.push(pts);
    }
  }
  const wireGeo = [];
  for (const pts of wirePts) { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.004, 4), toonMat('#4a3a5a')); m.castShadow = false; P(m); }
  const fairyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), fairy.length);
  const m4 = new THREE.Matrix4();
  fairy.forEach((f, i) => { m4.makeTranslation(f.p.x, f.p.y - 0.02, f.p.z); fairyMesh.setMatrixAt(i, m4); fairyMesh.setColorAt(i, f.c); });
  P(fairyMesh);

  // ===== 灯光：月光 + 暖色小灯 + 电脑屏幕的彩光 + 手机的冷光 =====
  const L = refs.lights;
  L.hemi.color.set('#9aa6ff'); L.hemi.groundColor.set('#ffb8a8');
  L.sun.color.set('#9ab4ff'); L.sun.position.set(1.4, 6.2, -10.5); L.sun.target.position.set(-0.2, 0, 0.5);
  L.winLight.color.set('#a8c0ff');
  L.monLight.color.set('#8fe3ff'); L.monLight.distance = 3.4;
  const glow2 = new THREE.PointLight('#ff8fe0', 1.2, 3.2, 1.6); glow2.position.set(1.32, 1.1, -0.8); P(glow2);
  const vanity = new THREE.PointLight('#ffe0b0', 1.4, 2.6, 1.6); vanity.position.set(-0.67, 1.45, 4.05); P(vanity);
  const fairyL = new THREE.PointLight('#ffb8d0', 1.2, 6.5, 1.3); fairyL.position.set(0, 2.45, 0.4); P(fairyL);
  const phoneA = new THREE.PointLight('#bfe8ff', 0.8, 1.1, 1.6); P(phoneA);
  const phoneB = new THREE.PointLight('#bfe8ff', 0.8, 1.1, 1.6); P(phoneB);
  refs.toonLights = { glow2, vanity, fairyL, phoneA, phoneB, fairyMesh, fairy, bulbs };
  // 月光从窗户斜着照进来
  const moonDir = V(-1.6, -6.2, 11).normalize();
  refs.shafts = new LightShafts({ rects: [{ cx: -0.66, cy: 1.75, w: 1.22, h: 1.45 }, { cx: 0.66, cy: 1.75, w: 1.22, h: 1.45 }], planeZ: -3.56, dir: moonDir, length: 4.2, color: '#a8c4ff', intensity: 0.022, slices: 5 });
  P(refs.shafts.group);
  // 流星（窗外，隔一会儿划过去一颗）
  const starC = TX.makeCanvas(256, 16), sx = starC.getContext('2d');
  const sg = sx.createLinearGradient(0, 0, 256, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.85, 'rgba(255,250,220,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,1)');
  sx.fillStyle = sg; sx.fillRect(0, 5, 256, 6);
  const shoot = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.06), new THREE.MeshBasicMaterial({ map: TX.toTex(starC, { wrap: false }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  shoot.visible = false; P(shoot);
  refs.shootingStar = { mesh: shoot, t: 3 };

  // ===== 电脑屏幕：两台都在打同一款游戏 =====
  const screens = [];
  for (const [mon, seed] of [[refs.monitor.group, 0], [refs.monitor2, 3]]) {
    const c = TX.makeCanvas(320, 180);
    TT.drawGameScreen(c, 0, { seed });
    const tex = TX.toTex(c, { wrap: false });
    mon.userData.screenMat.map = tex; mon.userData.screenMat.toneMapped = false; mon.userData.screenMat.needsUpdate = true;
    screens.push({ canvas: c, tex, seed, off: false, boss: false });
  }
  refs.gameScreens = screens;
  // 马们手机上的短视频
  const feeds = [0, 1, 2].map((i) => { const c = TX.makeCanvas(96, 192); TT.drawPhoneFeed(c, 0, i * 7); return { canvas: c, tex: TX.toTex(c, { wrap: false }), seed: i * 7 }; });
  refs.feeds = feeds;

  // 镜框离镜面太近（在反射的裁剪容差之内），加了描边会把整面镜子的倒影挡住
  const mirrorPos = refs.mirrors.map((m) => m.mesh.getWorldPosition(V()));
  const wp = V();
  root.traverse((o) => { if (o.isMesh && !o.isReflector && mirrorPos.some((p) => o.getWorldPosition(wp).distanceTo(p) < 0.05)) o.userData.noOutline = true; });
  // ===== 整个宿舍卡通化（动物单独建，不参与）=====
  const map = toonifyScene(root, { skip: (o) => o === refs.outside.group || o.userData.keepMat, minR: 0.05 });
  props.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.material = map.get(o.material) || o.material; });
  const R = (m) => map.get(m) || m;
  L.tubeMats = L.tubeMats.map(R);
  refs.strip.userData.switchMat = R(refs.strip.userData.switchMat);
  K.M.curtain = R(K.M.curtain);
  const ceilMat = R(K.M.ceiling);
  ceilMat.emissiveMap = T.ceilingEm; ceilMat.emissive = new THREE.Color('#ffffff'); ceilMat.emissiveIntensity = 0.85; ceilMat.needsUpdate = true;
  refs.ceilMat = ceilMat;
  // 门漆成珊瑚粉，门缝漏出来的走廊灯也暖一点
  refs.gap.line.color.set('#ffe0b0');

  // ===== 动物室友们 =====
  const animals = new THREE.Group(); animals.name = 'animals';
  const A = {};
  // 鸡 × 2：坐在两张书桌前打游戏
  refs.stoolMe.position.set(0.95, 0, 0.25);
  refs.stool2.position.set(0.95, 0, -0.8); refs.stool2.rotation.y = Math.PI / 2;
  A.chickA = new Chicken({ name: '咯咯', headset: '#6a8aff' });
  A.chickA.root.position.set(0.95, 0, 0.25); A.chickA.root.rotation.y = Math.PI / 2;
  A.chickB = new Chicken({ name: '哒哒', color: '#fff3e0', comb: '#ff7a4a', headset: '#ff5ab0', scale: 1.18 });
  A.chickB.root.position.set(0.95, 0, -0.8); A.chickB.root.rotation.y = Math.PI / 2;
  A.chick = new Chick({ name: '小黄' });
  A.chick.root.position.set(0.42, 0, -0.28); A.chick.root.rotation.y = Math.PI / 2 - 0.3;
  block(0.32, 0.52, -0.38, -0.18);
  // 马 × 3：下铺仰躺 / 下铺侧躺 / 上铺趴着
  A.horseA = new Horse({ name: '马大哈', coat: '#c98a5a', mane: '#6a3a3a', pj: '#9fd4ff', feed: feeds[0].tex, baseYaw: 0.55 });
  A.horseA.lieOn(V(-1.3, 0.66, 0.28), V(0, 0, -1), 'back');
  A.horseB = new Horse({ name: '马赛克', coat: '#f2ece6', muzzle: '#ffe8f0', mane: '#b08aff', pj: '#ffc2d8', feed: feeds[1].tex });
  A.horseB.lieOn(V(-1.38, 0.66, -2.25), V(0, 0, -1), 'side', V(1, 0, 0));
  A.horseC = new Horse({ name: '马上睡', coat: '#7a5040', muzzle: '#e8c8a8', mane: '#ffd36e', pj: '#bfeed6', feed: feeds[2].tex, baseYaw: 0.5 });
  A.horseC.lieOn(V(1.3, 1.69, -2.25), V(0, 0, -1), 'belly');
  // 猴 × 2：穿衣镜前一只，洗手间镜子前一只
  A.monkeyA = new Monkey({ name: '猴赛雷', accessory: 'chain' });
  A.monkeyA.root.position.set(-0.67, 0, 3.98);
  block(-0.88, -0.46, 3.8, 4.16);
  A.monkeyB = new Monkey({ name: '美猴', fur: '#8a5a3a', quiff: '#3a2418', accessory: 'band' });
  A.monkeyB.root.position.set(1.12, 0, 5.5);
  block(0.94, 1.3, 5.34, 5.66);
  for (const [id, a] of Object.entries(A)) { animals.add(a.root); mark(id, a.root); a.id = id; }
  // 看手机的脸被屏幕照亮
  refs.animals = A;
  refs.animalList = Object.values(A);
  P(animals);

  // 更新：气球、彩灯、流星、屏幕
  let scrT = 0, feedT = 0;
  const _c = new THREE.Color();
  refs.updaters.push((dt, t) => {
    for (const b of balloons) { b.g.position.set(b.x + Math.sin(t * 0.7 + b.ph) * 0.03, b.y + Math.sin(t * 1.1 + b.ph) * 0.04, b.z + Math.cos(t * 0.6 + b.ph) * 0.03); b.g.rotation.z = Math.sin(t * 0.8 + b.ph) * 0.1; }
    fairy.forEach((f, i) => { const k = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.4 + f.ph)); fairyMesh.setColorAt(i, _c.copy(f.c).multiplyScalar(0.6 + k * 1.3)); });
    fairyMesh.instanceColor.needsUpdate = true;
    refs.shafts.update(dt, t);
    const S = refs.shootingStar;
    S.t -= dt;
    if (S.t <= 0) { S.t = 6 + Math.random() * 8; S.k = 0; S.x0 = -2 + Math.random() * 2; }
    if (S.k !== undefined && S.k < 1) {
      S.k += dt * 1.4;
      S.mesh.visible = S.k < 1;
      S.mesh.position.set(S.x0 + S.k * 3, 2.9 - S.k * 1.2, -5.5);
      S.mesh.rotation.z = -0.38;
      S.mesh.material.opacity = Math.sin(Math.min(1, S.k) * Math.PI);
    }
    // 游戏画面约 15 帧/秒，短视频约 10 帧/秒
    scrT -= dt; feedT -= dt;
    if (scrT <= 0) { scrT = 0.066; for (const s of screens) { TT.drawGameScreen(s.canvas, t, s); s.tex.needsUpdate = true; } }
    if (feedT <= 0) { feedT = 0.1; for (const f of feeds) { TT.drawPhoneFeed(f.canvas, t, f.seed); f.tex.needsUpdate = true; } }
    // 手机的光跟着马的手机走
    A.horseA.phone.getWorldPosition(phoneA.position); phoneA.position.y -= 0.05;
    A.horseB.phone.getWorldPosition(phoneB.position); phoneB.position.x -= 0.05;
  });
  add(props);
}
