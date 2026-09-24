// 第二章：废弃的 211 —— 同一间宿舍，只是被遗弃了三十年。
//   材质统一"做旧"（去饱和 + 世界坐标噪声的污垢 / 铁锈），再往原布局上加：钉死的窗户、破窗帘、蜘蛛网、
//   吊在电线上晃的灯泡、老式显示器、电闸、铁链挂锁、蒙灰的镜子、天花板漏水、满地碎渣、一只老鼠……
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TR from '../core/tex_ruin.js';
import { mulberry32, clamp, lerp } from '../core/util.js';
import { LightShafts } from './fx.js';

// ---------- 贴图：大部分在原版贴图上做旧，墙地面、窗帘、窗外等重新画 ----------
export function buildRuinTextures(B) {
  const T = {};
  const age = (t, o = {}) => TR.aged(t, { seed: (Math.random() * 1000) | 0, ...o });
  T.floor = TR.genFloorRuin(); T.floorDirt = TR.genFloorDirtRuin();
  T.wall = TR.genWallRuin(); T.ceiling = TR.genCeilingRuin();
  T.woodDark = age(B.woodDark, { sepia: 0.5, dark: 0.62, fade: 0.25 });
  T.woodLight = age(B.woodLight, { sepia: 0.6, dark: 0.66 });
  T.woodOrange = age(B.woodOrange, { sepia: 0.6, dark: 0.6 });
  T.doorWood = age(B.doorWood, { sepia: 0.5, dark: 0.62, stains: 14 });
  T.blackLaminate = age(B.blackLaminate, { sepia: 0.4, dark: 1.2, fade: 0.35 });
  T.curtain = TR.genCurtainRuin(); T.curtain.repeat.set(2, 1);
  T.net = TR.genNetRuin(); T.net.repeat.set(5, 5);
  for (const k of ['grayCloth', 'pinkCloth', 'blackCloth', 'blueCloth', 'whiteCloth']) T[k] = age(B[k], { sepia: 0.55, dark: 0.66, stains: 6 });
  for (const k of ['bamboo', 'floral', 'polka', 'yellowDots', 'patternRoll']) T[k] = age(B[k], { sepia: 0.6, dark: 0.64, stains: 8 });
  T.cardboard = age(B.cardboard, { sepia: 0.5, dark: 0.7 }); T.cardboard350 = age(B.cardboard350, { sepia: 0.5, dark: 0.7 });
  T.paperMath = B.paperMath.map((p) => age(p, { sepia: 0.8, dark: 0.85, wrap: false }));
  for (const k of ['foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster', 'mousepad']) T[k] = age(B[k], { sepia: 0.7, dark: 0.8, wrap: false });
  T.windowView = TR.genWindowViewRuin();
  T.clockFace = TR.genClockFaceRuin(B.clockFace);
  return T;
}

// ---------- 材质做旧：去饱和、发暗、世界坐标噪声的污垢；金属生锈 ----------
const GRIME_FUNCS = /* glsl */ `
varying vec3 vRuinW;
float rh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rh(i), rh(i + vec3(1, 0, 0)), f.x), mix(rh(i + vec3(0, 1, 0)), rh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rh(i + vec3(0, 0, 1)), rh(i + vec3(1, 0, 1)), f.x), mix(rh(i + vec3(0, 1, 1)), rh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const GRIME_APPLY = /* glsl */ `
#include <map_fragment>
{
  float n1 = rn(vRuinW * 2.3), n2 = rn(vRuinW * 7.1 + 3.0), n3 = rn(vRuinW * 23.0);
  float g = smoothstep(0.4, 0.95, n1 * 0.6 + n2 * 0.4);
  float low = 1.0 - smoothstep(0.0, 0.6, vRuinW.y);
  float dirt = clamp(g * 0.6 + low * 0.25 + (n3 - 0.5) * 0.18, 0.0, 0.8);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.46, 0.39, 0.3), dirt);
  #ifdef RUIN_RUST
    float r = smoothstep(0.35, 0.75, n2 * 0.65 + n3 * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.18, 0.07) * (0.65 + n3 * 0.6), r * 0.8);
  #endif
}`;
function grimeify(m, rust) {
  if (m.userData.ruin) return;
  m.userData.ruin = true;
  if (rust) m.defines = { ...(m.defines || {}), RUIN_RUST: '' };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRuinW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRuinW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRIME_FUNCS}`)
      .replace('#include <map_fragment>', GRIME_APPLY);
  };
  m.customProgramCacheKey = () => (rust ? 'ruinRust' : 'ruin');
  m.needsUpdate = true;
}
const _hsl = {};
const OLD = new THREE.Color('#7d6a50');
function ageMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.ruin) return;
  const metal = m.metalness > 0.45;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * 0.5, _hsl.l * 0.8 + 0.02);
    m.color.lerp(OLD, 0.2);
  } else m.color.multiplyScalar(0.92);
  if (metal) { m.metalness = 0.3; m.roughness = 0.8; m.color.lerp(new THREE.Color('#6a5040'), 0.35); }
  else if (!m.transparent) m.roughness = Math.max(m.roughness, 0.72);
  if (m.transparent && !m.map) { m.color.lerp(new THREE.Color('#c8bc9a'), 0.45); m.opacity = Math.min(0.7, Math.max(m.opacity, 0.25)); m.roughness = 0.6; }
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.45;
  if (m.emissiveIntensity > 0 && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) m.emissiveIntensity *= 0.35;
  if (!m.transparent) grimeify(m, metal);
}

// ---------- 小工具 ----------
const std = (color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function canvasTex(w, h, draw) { const c = TX.makeCanvas(w, h); draw(c.getContext('2d'), w, h); return TX.toTex(c, { wrap: false }); }
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}

// 整张的放射状蜘蛛网（贴成三角形罩住墙角）
function webTexture() {
  return canvasTex(512, 512, (ctx, S) => {
    const rnd = mulberry32(911);
    const cx = S / 2, cy = S / 2, spokes = 14;
    const angs = Array.from({ length: spokes }, (_, k) => (k / spokes) * Math.PI * 2 + (rnd() - 0.5) * 0.15);
    ctx.strokeStyle = 'rgba(235,232,225,0.8)'; ctx.lineWidth = 1.8;
    for (const a of angs) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * S, cy + Math.sin(a) * S); ctx.stroke(); }
    ctx.lineWidth = 1.2;
    for (let r = 12; r < S * 0.7; r *= 1.14 + rnd() * 0.05) {
      ctx.strokeStyle = `rgba(230,228,220,${0.3 + rnd() * 0.4})`;
      ctx.beginPath();
      for (let k = 0; k <= spokes; k++) {
        const a0 = angs[k % spokes], a1 = angs[(k + 1) % spokes] + (k + 1 === spokes ? Math.PI * 2 : 0);
        const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
        const mx = (x0 + x1) / 2 - cx, my = (y0 + y1) / 2 - cy;
        if (k === 0) ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx + mx * 0.9, cy + my * 0.9, x1, y1);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 30; k++) { ctx.fillStyle = `rgba(200,195,185,${0.2 + rnd() * 0.4})`; ctx.beginPath(); ctx.arc(cx + (rnd() - 0.5) * S * 0.9, cy + (rnd() - 0.5) * S * 0.9, 1 + rnd() * 3, 0, 6.28); ctx.fill(); }
  });
}

export function decorateRuin(ctx) {
  const { K, M, T, root, refs, collision, add, mark, occl, block, place, LAYOUT } = ctx;
  const { SZ, DOOR, WR, WC } = LAYOUT;
  const rnd = mulberry32(2056);
  const themed = new THREE.Group(); themed.name = 'ruinProps';
  const ADD = (o) => { themed.add(o); return o; };

  // ===== 1. 全场做旧 =====
  const seen = new Set();
  const outsideMeshes = new Set();
  refs.outside.group.traverse((o) => outsideMeshes.add(o));
  root.traverse((o) => {
    if (!o.isMesh || outsideMeshes.has(o)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (m.isMeshStandardMaterial) ageMaterial(m);
      else if (m.isMeshBasicMaterial && m.map && o !== refs.view) m.color.multiplyScalar(0.55);
    }
  });
  refs.gap.line.color.set('#6a5a44'); refs.gap.glow.opacity = 0.35;
  M.curtain.alphaTest = 0.5; M.curtain.transparent = false; M.curtain.emissiveIntensity = 0.02;
  M.net.color.set('#d8c8a0');
  refs.curtain.layout(0.62); refs.curtain.f = 0.62;
  refs.curtainRod.rotation.z = Math.PI / 2 + 0.035; refs.curtainRod.position.y = 2.9;
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;

  // ===== 2. 窗户：玻璃碎了，钉着几块木板，木板缝里漏进夕阳 =====
  if (refs.glassPane) refs.glassPane.visible = false;
  const brokenTex = canvasTex(1024, 600, (c2, W, H) => {
    c2.fillStyle = 'rgba(190,175,140,0.34)'; c2.fillRect(0, 0, W, H);
    const r = mulberry32(912);
    for (let k = 0; k < 900; k++) { c2.fillStyle = `rgba(70,60,40,${r() * 0.25})`; c2.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 6); }
    c2.globalCompositeOperation = 'destination-out';
    c2.beginPath(); const hx = W * 0.72, hy = H * 0.3;
    for (let a = 0; a < Math.PI * 2; a += 0.3) { const rr = 110 + r() * 110; c2.lineTo(hx + Math.cos(a) * rr * 1.3, hy + Math.sin(a) * rr); }
    c2.fill();
    c2.globalCompositeOperation = 'source-over';
    c2.strokeStyle = 'rgba(240,235,220,0.7)'; c2.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      let x = hx, y = hy, a = r() * Math.PI * 2;
      c2.beginPath(); c2.moveTo(x, y);
      for (let s = 0; s < 10; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 40; y += Math.sin(a) * 40; c2.lineTo(x, y); }
      c2.stroke();
    }
  });
  const broken = mesh(new THREE.PlaneGeometry(2.6, 1.5), std('#ffffff', 0.3, 0, { map: brokenTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), { y: 1.75, z: -3.6, cast: false });
  ADD(broken);
  const plankGeo = new THREE.BoxGeometry(2.75, 0.2, 0.025);
  const boards = [[1.12, -0.03], [1.43, 0.02], [1.78, -0.015], [2.13, 0.03], [2.44, -0.02]];
  boards.forEach(([y, rz], i) => {
    const p = mesh(plankGeo, std('#ffffff', 0.9, 0, { map: TR.genPlank(i) }), { y, z: -3.53, rz });
    ADD(p);
    for (const x of [-1.25, 1.25]) ADD(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 6), std('#3a2a20', 0.5, 0.5), { x, y: y + x * rz, z: -3.515, rx: Math.PI / 2, cast: false }));
  });
  // 斜着钉的一块
  ADD(mesh(plankGeo, std('#ffffff', 0.9, 0, { map: TR.genPlank(7) }), { x: 0.1, y: 1.75, z: -3.505, rz: 0.52, s: [0.62, 1, 1] }));
  // 光从木板缝里漏进来（黄昏的低角度阳光）
  const sunDir = new THREE.Vector3(0.2, -0.36, 1).normalize();
  const gaps = [1.275, 1.605, 1.955, 2.29].map((y) => ({ cx: 0, cy: y, w: 2.5, h: 0.1 }));
  const shafts = new LightShafts({ rects: gaps, planeZ: -3.52, dir: sunDir, length: 4.2, color: '#ffb070', intensity: 0.07, slices: 4 });
  ADD(shafts.group);
  refs.shafts = shafts;
  // 窗台上爬进来的藤蔓
  const vineCurve = new THREE.CatmullRomCurve3([[1.3, 2.5, -3.62], [1.05, 2.35, -3.5], [1.2, 1.9, -3.45], [1.45, 1.4, -3.4], [1.6, 0.95, -3.4], [1.72, 0.5, -3.45], [1.75, 0.05, -3.5]].map((p) => new THREE.Vector3(...p)));
  ADD(mesh(new THREE.TubeGeometry(vineCurve, 60, 0.008, 5), std('#3a3a22', 0.9), { cast: false }));
  const leafTex = canvasTex(64, 64, (c2, S) => { c2.fillStyle = '#4a5a2a'; c2.beginPath(); c2.ellipse(S / 2, S / 2, S * 0.28, S * 0.45, 0, 0, 6.28); c2.fill(); c2.strokeStyle = '#2a3a18'; c2.lineWidth = 2; c2.beginPath(); c2.moveTo(S / 2, 4); c2.lineTo(S / 2, S - 4); c2.stroke(); });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.07), std('#ffffff', 0.9, 0, { map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }), 46);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 46; i++) {
    const p = vineCurve.getPoint(i / 46);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
    m4.compose(p.add(new THREE.Vector3((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.04)), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.6));
    leaves.setMatrixAt(i, m4);
  }
  leaves.castShadow = true;
  ADD(leaves);

  // ===== 3. 天花板：灯管掉了一头，另一根只剩灯架；中间吊着一个光秃秃的灯泡 =====
  const [fxA, fxB] = refs.fixtures;
  {
    const pivot = new THREE.Vector3(0.62, 2.965, fxA.position.z);
    const ang = 0.62;
    const off = fxA.position.clone().sub(pivot).applyAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    fxA.position.copy(pivot).add(off);
    fxA.rotation.z = ang;
    fxB.children[1].visible = false;
  }
  refs.lights.tubeMats.forEach((m) => { m.emissiveIntensity = 0; });
  const bulbG = new THREE.Group(); bulbG.position.set(0.05, 2.99, 0.55); ADD(bulbG);
  const cordLen = 0.85;
  bulbG.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, cordLen, 5), std('#1a1614', 0.7), { y: -cordLen / 2, cast: false }));
  bulbG.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 10), std('#2a241e', 0.5, 0.4), { y: -cordLen - 0.02 }));
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#d8c89a', emissive: '#ffb45a', emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.9 });
  bulbMat.userData.ruin = true;
  const bulb = mesh(new THREE.SphereGeometry(0.035, 14, 10), bulbMat, { y: -cordLen - 0.07, s: [1, 1.25, 1], cast: false });
  bulbG.add(bulb);
  ADD(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12), std('#2a241e', 0.6), { x: 0.05, y: 2.994, z: 0.55, cast: false }));
  const bulbSpot = new THREE.SpotLight('#ffb766', 0, 7.5, 1.32, 0.85, 1.6);
  bulbSpot.position.set(0, -cordLen - 0.12, 0);
  bulbSpot.castShadow = true;
  bulbSpot.shadow.mapSize.set(1024, 1024);
  bulbSpot.shadow.bias = -0.0008; bulbSpot.shadow.normalBias = 0.02; bulbSpot.shadow.radius = 3;
  bulbSpot.shadow.camera.near = 0.1; bulbSpot.shadow.camera.far = 7;
  bulbG.add(bulbSpot);
  const bulbTarget = new THREE.Object3D(); bulbTarget.position.set(0, -3, 0); bulbG.add(bulbTarget); bulbSpot.target = bulbTarget;
  const bulbFill = new THREE.PointLight('#ffb766', 0, 3.2, 1.8);
  bulbFill.position.set(0, -cordLen - 0.05, 0);
  bulbG.add(bulbFill);
  refs.bulb = { group: bulbG, spot: bulbSpot, fill: bulbFill, mat: bulbMat, mesh: bulb };
  // 天花板上一个漏水的破洞，底下一滩积水、一堆掉下来的墙皮
  const HOLE = new THREE.Vector3(-0.25, 2.995, 0.15);
  const holeTex = canvasTex(256, 256, (c2, S) => {
    const r = mulberry32(913);
    c2.clearRect(0, 0, S, S);
    const g = c2.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(10,8,6,1)'); g.addColorStop(0.45, 'rgba(40,32,24,0.95)'); g.addColorStop(0.7, 'rgba(110,90,60,0.6)'); g.addColorStop(1, 'rgba(120,100,70,0)');
    c2.fillStyle = g; c2.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) { const rr = S * (0.34 + r() * 0.14); c2.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); }
    c2.fill();
    c2.strokeStyle = 'rgba(90,50,30,0.9)'; c2.lineWidth = 4;
    for (let k = 0; k < 4; k++) { c2.beginPath(); c2.moveTo(S * 0.2, S * (0.3 + k * 0.13)); c2.lineTo(S * 0.8, S * (0.33 + k * 0.12)); c2.stroke(); }
  });
  ADD(mesh(new THREE.PlaneGeometry(0.8, 0.8), std('#ffffff', 1, 0, { map: holeTex, transparent: true, depthWrite: false }), { x: HOLE.x, y: HOLE.y, z: HOLE.z, rx: Math.PI / 2, cast: false, recv: false }));
  const puddleMat = new THREE.MeshStandardMaterial({ color: '#2a2a26', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.72 });
  puddleMat.userData.ruin = true;
  const puddleGeo = new THREE.CircleGeometry(0.42, 40);
  { const p = puddleGeo.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.75 + 0.3 * Math.sin(i * 1.7) * Math.sin(i * 0.53); p.setXY(i, p.getX(i) * k, p.getY(i) * k * 0.8); } }
  const puddle = mesh(puddleGeo, puddleMat, { x: HOLE.x + 0.05, y: 0.004, z: HOLE.z + 0.1, rx: -Math.PI / 2, cast: false });
  ADD(puddle);
  const ripples = [];
  for (let k = 0; k < 3; k++) {
    const rm = new THREE.MeshBasicMaterial({ color: '#d8d0c0', transparent: true, opacity: 0, depthWrite: false });
    const rg = mesh(new THREE.RingGeometry(0.9, 1, 32), rm, { x: HOLE.x, y: 0.006, z: HOLE.z, rx: -Math.PI / 2, s: 0.01, cast: false, recv: false });
    ADD(rg); ripples.push({ m: rg, t: 10 });
  }
  const drop = mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: '#c8d4d8', roughness: 0.05, transparent: true, opacity: 0.8 }), { x: HOLE.x, y: 2.95, z: HOLE.z, s: [1, 1.6, 1], cast: false });
  ADD(drop);
  refs.drip = { drop, ripples, x: HOLE.x, z: HOLE.z, t: 0, period: 1.35, onDrip: null };
  for (let k = 0; k < 9; k++) {
    const g = new THREE.DodecahedronGeometry(0.04 + rnd() * 0.07, 0);
    g.scale(1, 0.4 + rnd() * 0.4, 1);
    ADD(mesh(g, std(rnd() < 0.5 ? '#b8ae98' : '#8e8676', 0.95), { x: HOLE.x - 0.45 + rnd() * 0.3, y: 0.02, z: HOLE.z - 0.35 + rnd() * 0.5, ry: rnd() * 6 }));
  }

  // ===== 4. 门：车锁换成了一条生锈的铁链 + 一把老挂锁 =====
  refs.lock.group.visible = false;
  const chain = new THREE.Group(); chain.name = 'chain';
  const linkGeo = new THREE.TorusGeometry(0.022, 0.0055, 6, 12);
  linkGeo.scale(1, 1.6, 1);
  const rust = std('#6a4a36', 0.85, 0.35);
  const curve = refs.lock.curve;
  const N = Math.floor(curve.getLength() / 0.03);
  const links = new THREE.InstancedMesh(linkGeo, rust, N);
  const tan = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tan);
    qq.setFromUnitVectors(up, tan);
    q2.setFromAxisAngle(tan, (i % 2) * Math.PI / 2);
    mm.compose(p, q2.multiply(qq), new THREE.Vector3(1, 1, 1));
    links.setMatrixAt(i, mm);
  }
  links.castShadow = true;
  chain.add(links);
  const padlock = new THREE.Group();
  padlock.position.set(-1.56, 0.58, 3.63); padlock.rotation.y = 1.2;
  padlock.add(mesh(new THREE.BoxGeometry(0.09, 0.075, 0.035), std('#8a6a3a', 0.55, 0.6)));
  padlock.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI), std('#9a9088', 0.4, 0.8), { y: 0.037 }));
  for (let i = 0; i < 3; i++) padlock.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 10), std('#3a3028', 0.5, 0.5), { x: -0.025 + i * 0.025, y: -0.012, z: 0.02, rx: Math.PI / 2 }));
  chain.add(padlock);
  ADD(chain);
  mark('door', chain);
  const chainDrop = new THREE.Group(); chainDrop.visible = false;
  const coil = [];
  for (let i = 0; i <= 50; i++) { const a = i * 0.42; coil.push(new THREE.Vector3(-1.24 + Math.cos(a) * 0.13, 0.012 + i * 0.001, 3.5 + Math.sin(a) * 0.1)); }
  chainDrop.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.009, 6), rust));
  ADD(chainDrop);
  refs.chain = { group: chain, padlock, dropped: chainDrop };

  // ===== 5. 电闸：门边原来开关的位置 =====
  refs.sw.visible = false;
  const fuse = new THREE.Group(); fuse.position.set(-1.78, 1.42, 3.43); fuse.rotation.y = Math.PI / 2;
  fuse.add(mesh(new THREE.BoxGeometry(0.24, 0.32, 0.08), std('#6e7470', 0.6, 0.5), { z: 0.04 }));
  fuse.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.01), std('#2a2a28', 0.7), { y: -0.02, z: 0.082 }));
  const warn = canvasTex(128, 64, (c2, W, H) => { c2.fillStyle = '#e8c23a'; c2.fillRect(0, 0, W, H); c2.fillStyle = '#1a1a1a'; c2.font = `bold 30px ${TX.SANS}`; c2.textAlign = 'center'; c2.fillText('⚡ 电闸', W / 2, 42); });
  fuse.add(mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshStandardMaterial({ map: warn, roughness: 0.8 }), { y: 0.12, z: 0.081, cast: false }));
  const lever = new THREE.Group(); lever.position.set(0, -0.02, 0.09); lever.rotation.x = 0.9;
  lever.add(mesh(new THREE.BoxGeometry(0.018, 0.12, 0.012), std('#b8b0a0', 0.4, 0.7), { y: 0.06 }));
  lever.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10), std('#8a1a1a', 0.6), { y: 0.125, rz: Math.PI / 2 }));
  fuse.add(lever);
  const fuseLamp = new THREE.MeshStandardMaterial({ color: '#3a1010', emissive: '#ff3020', emissiveIntensity: 0 });
  fuseLamp.userData.ruin = true;
  fuse.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), fuseLamp, { x: 0.08, y: -0.11, z: 0.085, cast: false }));
  ADD(fuse);
  mark('fuse', fuse);
  refs.fuse = { group: fuse, lever, lamp: fuseLamp };

  // ===== 6. 我的书桌：老式 CRT 显示器、旧日记本 =====
  const D1 = refs.desks.D1;
  refs.monitor.group.visible = false;
  const crtC = TX.makeCanvas(256, 192);
  TR.drawCRT(crtC, { on: false });
  const crtTex = TX.toTex(crtC, { wrap: false });
  const crt = new THREE.Group(); crt.position.set(0.05, 0.76, 0);
  const beige = std('#b8ab8c', 0.7);
  crt.add(mesh(new THREE.BoxGeometry(0.44, 0.36, 0.26), beige, { y: 0.2 }));
  crt.add(mesh(new THREE.BoxGeometry(0.32, 0.26, 0.14), beige, { y: 0.2, z: -0.19 }));
  crt.add(mesh(new THREE.BoxGeometry(0.28, 0.02, 0.24), beige, { y: 0.01, z: -0.02 }));
  refs.keyboard.position.z = 0.215; refs.keyboard.position.x = -0.08;
  const scrGeo = new THREE.PlaneGeometry(0.34, 0.26, 8, 6);
  { const p = scrGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 0.17, y = p.getY(i) / 0.13; p.setZ(i, (1 - x * x * 0.5 - y * y * 0.5) * 0.018); } scrGeo.computeVertexNormals(); }
  const crtMat = new THREE.MeshBasicMaterial({ map: crtTex });
  crt.add(mesh(scrGeo, crtMat, { y: 0.205, z: 0.136, cast: false }));
  crt.add(mesh(new THREE.BoxGeometry(0.4, 0.32, 0.01), std('#a89c80', 0.7), { y: 0.2, z: 0.132 }));
  const crtLed = new THREE.MeshStandardMaterial({ color: '#1a3a1a', emissive: '#40ff60', emissiveIntensity: 0 });
  crtLed.userData.ruin = true;
  crt.add(mesh(new THREE.SphereGeometry(0.006, 6, 5), crtLed, { x: 0.17, y: 0.05, z: 0.138, cast: false }));
  D1.add(crt);
  mark('crt', crt);
  refs.crt = { group: crt, canvas: crtC, tex: crtTex, led: crtLed, on: false };
  refs.sticky.visible = false;
  refs.notebook.visible = false;
  refs.studentId.visible = false;
  const diary = new THREE.Group(); diary.position.set(-0.3, 0.76, -0.08); diary.rotation.y = 0.35;
  const cover = TR.genDiaryCover();
  const coverMat = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.85 });
  const side = std('#4a261c', 0.8), pages = std('#c8b890', 0.95);
  diary.add(mesh(new THREE.BoxGeometry(0.17, 0.035, 0.24), [pages, pages, coverMat, side, pages, pages], { y: 0.018 }));
  D1.add(diary);
  mark('diary', diary);
  refs.diary = diary;
  // 苹果烂成了一小坨
  refs.apple.scale.set(0.8, 0.55, 0.8);
  refs.apple.traverse((o) => { if (o.isMesh) o.material = std('#3a2418', 0.9); });

  // ===== 7. 室友 C 的书桌：盖着一块发霉的白布，掀开有张旧照片 =====
  {
    const x0 = 1.24, x1 = 1.8, z0 = -1.3, z1 = -0.3, top = 0.79;
    const W = 0.95, Dp = 1.6, cx = 1.33, cz = -0.8;
    const g = new THREE.PlaneGeometry(W, Dp, 48, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const out = Math.hypot(dx, dz);
      let y = top;
      // 显示器撑起来的"帐篷"
      const mz = Math.max(0, 1 - Math.max(0, Math.abs(z - cz) - 0.24) / 0.12);
      y = Math.max(y, (1.22 - Math.abs(x - 1.655) * 1.4) * mz + top * (1 - mz));
      y += Math.sin(x * 31 + z * 7) * 0.006;
      if (out > 0) y = Math.max(0.015, top - out * 3.4) + Math.sin(z * 24 + x * 5) * 0.02 * Math.min(1, out * 4);
      p.setXYZ(i, Math.min(x, 1.795) - cx, y, z - cz);
    }
    g.computeVertexNormals();
    const sheetTex = TR.aged(TX.genCloth({ base: '#d8d4c8', seed: 919, vertical: false, contrast: 0.4 }), { seed: 919, sepia: 0.6, dark: 0.85, stains: 12 });
    const sheet = mesh(g, std('#ffffff', 0.95, 0, { map: sheetTex, side: THREE.DoubleSide }), { x: cx, z: cz });
    ADD(sheet);
    mark('sheet', sheet);
    refs.sheet = sheet;
    refs.monitor2.visible = false;
    refs.headset.visible = false;
    // 旧照片（名字开局再写）
    const phC = TX.makeCanvas(320, 240);
    const phTex = TX.toTex(phC, { wrap: false });
    const frame = new THREE.Group(); frame.position.set(1.45, 0.76, -0.62); frame.rotation.y = -Math.PI / 2 - 0.35;
    frame.add(mesh(new THREE.BoxGeometry(0.2, 0.16, 0.012), std('#4a3020', 0.6), { y: 0.085, rx: -0.2 }));
    frame.add(mesh(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshStandardMaterial({ map: phTex, roughness: 0.6 }), { y: 0.086, z: 0.008, rx: -0.2, cast: false }));
    frame.visible = false;
    ADD(frame);
    mark('photo', frame);
    refs.photo = { group: frame, canvas: phC, tex: phTex };
  }

  // ===== 8. 蒙灰的穿衣镜：擦干净才能看到口红写的字 =====
  {
    const mg = refs.mirrorG;
    const gC = TX.makeCanvas(128, 512);
    TR.drawGrime(gC, 3);
    const gTex = TX.toTex(gC, { wrap: false });
    const grime = mesh(new THREE.PlaneGeometry(0.228, 1.388), new THREE.MeshStandardMaterial({ map: gTex, transparent: true, roughness: 1, depthWrite: false }), { z: -0.028, ry: Math.PI, cast: false });
    mg.add(grime);
    const lC = TX.makeCanvas(128, 256);
    const lTex = TX.toTex(lC, { wrap: false });
    const lip = mesh(new THREE.PlaneGeometry(0.2, 0.4), new THREE.MeshBasicMaterial({ map: lTex, transparent: true, depthWrite: false }), { y: 0.1, z: -0.026, ry: Math.PI, cast: false, recv: false });
    lip.visible = false; // 擦的时候才露出来（脏污层是半透明的）
    mg.add(lip);
    refs.grime = { canvas: gC, tex: gTex, mesh: grime, lipCanvas: lC, lipTex: lTex, lip };
  }
  // 洗手间镜子裂了
  {
    const crack = canvasTex(512, 256, (c2, W, H) => {
      const r = mulberry32(915);
      c2.clearRect(0, 0, W, H);
      c2.strokeStyle = 'rgba(255,255,255,0.75)'; c2.lineWidth = 2;
      const cx = W * 0.35, cy = H * 0.45;
      for (let k = 0; k < 16; k++) { let x = cx, y = cy, a = r() * 6.28; c2.beginPath(); c2.moveTo(x, y); for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 30; y += Math.sin(a) * 30; c2.lineTo(x, y); } c2.stroke(); }
      for (let k = 1; k < 4; k++) { c2.beginPath(); c2.arc(cx, cy, k * 22, 0, 6.28); c2.stroke(); }
      c2.fillStyle = 'rgba(120,100,70,0.35)'; c2.fillRect(0, 0, W, H);
    });
    const wm = refs.wcMirror;
    ADD(mesh(new THREE.PlaneGeometry(1.1, 0.56), new THREE.MeshBasicMaterial({ map: crack, transparent: true, depthWrite: false }), { x: wm.position.x, y: wm.position.y, z: wm.position.z - 0.003, ry: Math.PI, cast: false, recv: false }));
  }

  // ===== 9. 墙上刻满的"正"字、撕了一半的旧海报、地上的旧报纸 =====
  {
    const tally = mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshStandardMaterial({ map: TR.genTally(), transparent: true, depthWrite: false, roughness: 1 }), { x: 0.95, y: 1.66, z: SZ - 0.008, ry: Math.PI, cast: false });
    ADD(tally); mark('tally', tally);
    const poster = mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshStandardMaterial({ map: TR.genOldPoster(), transparent: true, alphaTest: 0.3, roughness: 0.9 }), { x: 1.793, y: 1.62, z: -0.35, ry: -Math.PI / 2, rz: 0.05, cast: false });
    ADD(poster); mark('poster', poster);
    const news = mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshStandardMaterial({ map: TR.genNewspaper(), roughness: 0.95, side: THREE.DoubleSide }), { x: -0.95, y: 0.006, z: 3.05, rx: -Math.PI / 2, rz: 0.4, cast: false });
    ADD(news); mark('newspaper', news);
  }

  // ===== 10. 东倒西歪的家具、散落的碎渣 =====
  {
    const sh = refs.stoolH;
    sh.rotation.set(0, 0.25, Math.PI / 2); sh.position.set(-0.62, 0.16, 2.25);
    const hm = refs.helmet;
    hm.position.set(-0.98, 0.1, 2.5); hm.rotation.set(0.3, 1.9, 1.2);
    refs.helmetHome = { x: -0.98, y: 0.1, z: 2.5, ry: 1.9 };
    const bc = refs.blackChair; bc.rotation.set(Math.PI / 2, 0, 0.4); bc.position.set(-0.35, 0.16, -2.7);
    refs.shelf.rotation.z = 0.05; refs.shelf.position.x += 0.03;
    // 书架前面掉了一地的书
    for (let i = 0; i < 7; i++) {
      const b = K.book(0.17, 0.025, 0.24, ['#4a3a2a', '#5a2a22', '#6a6048', '#2a3a2a'][i % 4]);
      b.position.set(-1.2 + rnd() * 0.3, 0.013 + (i % 3) * 0.025, -1.2 + rnd() * 0.4); b.rotation.y = rnd() * 6;
      ADD(b);
    }
    // 碎玻璃
    const shardMat = std('#c8d0c8', 0.15, 0.1, { transparent: true, opacity: 0.5 });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.03 + rnd() * 0.06, rnd() * 0.02); s.lineTo(rnd() * 0.04, 0.03 + rnd() * 0.05); s.lineTo(0, 0);
      ADD(mesh(new THREE.ShapeGeometry(s), shardMat, { x: -0.8 + rnd() * 1.6, y: 0.004, z: -3.35 + rnd() * 0.5, rx: -Math.PI / 2, rz: rnd() * 6, cast: false }));
    }
    // 老收音机（窗边书桌上，原来台灯的位置）
    refs.farLamp.visible = false;
    const radio = new THREE.Group(); radio.position.set(-0.72, 0.74, -3.28); radio.rotation.y = 0.3;
    radio.add(mesh(new THREE.BoxGeometry(0.32, 0.19, 0.12), std('#6a4028', 0.6), { y: 0.095 }));
    const grille = canvasTex(128, 96, (c2, W, H) => { c2.fillStyle = '#c8b48a'; c2.fillRect(0, 0, W, H); c2.fillStyle = '#3a2a1a'; for (let y = 6; y < H; y += 8) for (let x = 6; x < W * 0.55; x += 8) { c2.beginPath(); c2.arc(x, y, 2.2, 0, 6.28); c2.fill(); } c2.fillStyle = '#e8dcb8'; c2.fillRect(W * 0.62, H * 0.3, W * 0.32, H * 0.3); c2.strokeStyle = '#a02010'; c2.lineWidth = 2; c2.beginPath(); c2.moveTo(W * 0.74, H * 0.3); c2.lineTo(W * 0.74, H * 0.6); c2.stroke(); });
    radio.add(mesh(new THREE.PlaneGeometry(0.3, 0.17), new THREE.MeshStandardMaterial({ map: grille, roughness: 0.8 }), { y: 0.095, z: 0.061, cast: false }));
    for (const x of [0.08, 0.13]) radio.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), std('#2a1a10', 0.5), { x, y: 0.04, z: 0.064, rx: Math.PI / 2 }));
    radio.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3, 5), std('#aaa', 0.3, 0.8), { x: 0.12, y: 0.32, rz: -0.4 }));
    ADD(radio);
    mark('radio', radio);
    refs.radio = radio;
  }

  // ===== 11. 蜘蛛网 =====
  const webMat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, color: '#9a968c' });
  const cornerWeb = (C, a, b, c, s) => {
    const P = [a, b, c].map((d) => C.clone().addScaledVector(d, s));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((p) => [p.x, p.y, p.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0.98, 0.02, 0.15, 0.98, 0.15], 2));
    const m = new THREE.Mesh(g, webMat); m.userData.noRay = true; m.raycast = () => {};
    ADD(m);
  };
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const nX = X.clone().negate(), nY = Y.clone().negate(), nZ = Z.clone().negate();
  cornerWeb(new THREE.Vector3(-1.79, 2.99, -3.59), X, nY, Z, 0.7);
  cornerWeb(new THREE.Vector3(1.79, 2.99, -3.59), nX, nY, Z, 0.55);
  cornerWeb(new THREE.Vector3(-1.79, 2.99, SZ - 0.01), X, nY, nZ, 0.6);
  cornerWeb(new THREE.Vector3(1.79, 2.99, SZ - 0.01), nX, nY, nZ, 0.75);
  cornerWeb(new THREE.Vector3(-1.79, 2.69, WR.z1 - 0.01), X, nY, nZ, 0.5);
  cornerWeb(new THREE.Vector3(1.79, 2.69, WR.z1 - 0.01), nX, nY, nZ, 0.45);
  cornerWeb(new THREE.Vector3(1.79, 0.01, -0.28), nX, Y, Z, 0.35);
  cornerWeb(new THREE.Vector3(-1.79, 0.01, 1.28), X, Y, Z, 0.3);
  cornerWeb(new THREE.Vector3(-1.79, 2.99, 1.25), X, nY, Z, 0.5);
  cornerWeb(new THREE.Vector3(1.79, 2.99, -1.3), nX, nY, nZ, 0.45);
  // 床架顶上挂的网
  for (const [x, z, sx] of [[-0.87, -0.78, 1], [0.87, -1.35, -1], [0.87, 2.82, -1], [-0.87, -3.33, 1]]) {
    const g = new THREE.PlaneGeometry(0.5, 0.3);
    const m = new THREE.Mesh(g, webMat); m.position.set(x, 2.87, z + 0.25); m.rotation.y = Math.PI / 2 * sx; m.userData.noRay = true; m.raycast = () => {};
    ADD(m);
  }

  // ===== 12. 一只老鼠：沿着墙根跑来跑去，被人靠近就溜 =====
  {
    const rat = new THREE.Group();
    const fur = std('#5a524a', 0.9), pink = std('#c8888a', 0.7);
    const body = mesh(new THREE.SphereGeometry(0.045, 12, 8), fur, { y: 0.04, s: [0.9, 0.75, 1.6] });
    rat.add(body);
    rat.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), fur, { y: 0.045, z: 0.07, s: [0.9, 0.85, 1.3] }));
    rat.add(mesh(new THREE.ConeGeometry(0.014, 0.03, 8), pink, { y: 0.04, z: 0.108, rx: Math.PI / 2 }));
    for (const s of [-1, 1]) {
      rat.add(mesh(new THREE.CircleGeometry(0.016, 10), pink, { x: s * 0.02, y: 0.075, z: 0.06, ry: s * 0.4, cast: false }));
      rat.add(mesh(new THREE.SphereGeometry(0.005, 6, 5), std('#050505', 0.2), { x: s * 0.015, y: 0.055, z: 0.093, cast: false }));
    }
    const tailPts = [[0, 0.03, -0.07], [0, 0.02, -0.12], [0.02, 0.01, -0.17], [0.04, 0.01, -0.22]].map((p) => new THREE.Vector3(...p));
    const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), 12, 0.004, 5), pink);
    rat.add(tail);
    const hit = mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), { y: 0.06 });
    rat.add(hit);
    ADD(rat);
    mark('rat', rat);
    const path = [[1.62, 3.0, 2.5], [1.66, 1.6, 1.2], [1.2, 0.85, 0.2], [0.35, 1.05, 0], [-0.55, 1.25, 1.5], [-1.2, 0.95, 2.2], [-1.2, -0.3, 0.5], [-0.3, -0.2, 0], [0.9, -1.9, 1.0], [1.62, -1.75, 2.8], [1.6, 0.1, 0.4]];
    const st = { i: 0, p: new THREE.Vector3(path[0][0], 0, path[0][1]), wait: 1, flee: 0 };
    rat.position.copy(st.p);
    refs.rat = { group: rat, state: st, spook: () => { st.flee = 2.5; st.wait = 0; } };
    refs.updaters.push((dt, t, game) => {
      const pl = game && game.ctrl ? game.ctrl.pos : null;
      if (pl && st.flee <= 0 && pl.distanceTo(st.p) < 0.9) { st.flee = 1.5; st.wait = 0; }
      st.flee -= dt;
      if (st.wait > 0) {
        st.wait -= dt;
        body.rotation.x = Math.sin(t * 12) * 0.05; // 闻来闻去
        rat.rotation.y += Math.sin(t * 3) * dt * 0.8;
        tail.rotation.y = Math.sin(t * 4) * 0.3;
        return;
      }
      const nx = path[(st.i + 1) % path.length];
      const tgt = new THREE.Vector3(nx[0], 0, nx[1]);
      const d = tgt.clone().sub(st.p);
      const dist = d.length();
      const sp = st.flee > 0 ? 2.4 : 0.9;
      if (dist < 0.03) { st.i = (st.i + 1) % path.length; st.wait = st.flee > 0 ? 0.1 : nx[2]; return; }
      st.p.addScaledVector(d.normalize(), Math.min(dist, sp * dt));
      rat.position.set(st.p.x, Math.abs(Math.sin(t * 30)) * 0.006, st.p.z);
      rat.rotation.y = Math.atan2(d.x, d.z);
      tail.rotation.y = Math.sin(t * 20) * 0.35;
    });
  }

  // ===== 12.5 灯泡亮了以后，几只飞蛾绕着它扑腾 =====
  const mothMat = new THREE.MeshBasicMaterial({ color: '#2a2018', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const moths = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Group();
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), mothMat); w.position.x = s * 0.01; w.scale.set(1, 0.7, 1); m.add(w); }
    m.visible = false; m.userData.noRay = true;
    ADD(m); moths.push({ m, ph: rnd() * 6.28, r: 0.12 + rnd() * 0.14, sp: 2 + rnd() * 2.5, h: (rnd() - 0.5) * 0.2 });
  }
  refs.updaters.push((dt, t) => {
    const lit = bulbMat.emissiveIntensity > 1;
    const c = bulb.getWorldPosition(new THREE.Vector3());
    for (const o of moths) {
      o.m.visible = lit;
      if (!lit) continue;
      const a = t * o.sp + o.ph;
      o.m.position.set(c.x + Math.cos(a) * o.r + Math.sin(t * 7 + o.ph) * 0.02, c.y + o.h + Math.sin(a * 1.7) * 0.06, c.z + Math.sin(a) * o.r);
      o.m.rotation.set(0, -a, 0);
      const f = Math.abs(Math.sin(t * 40 + o.ph));
      o.m.children[0].rotation.y = f * 1.2; o.m.children[1].rotation.y = -f * 1.2;
    }
  });

  // ===== 13. 动画：灯泡晃、滴水、CRT 雪花 =====
  refs.updaters.push((dt, t) => {
    bulbG.rotation.x = Math.sin(t * 1.1) * 0.07 + Math.sin(t * 0.37) * 0.03;
    bulbG.rotation.z = Math.sin(t * 0.83 + 1) * 0.05;
    shafts.update(dt, t);
    // 滴水
    const D = refs.drip;
    D.t += dt;
    const k = D.t / D.period;
    if (k >= 1) {
      D.t = 0;
      const r = ripples.find((x) => x.t > 1) || ripples[0];
      r.t = 0;
      if (D.onDrip) D.onDrip();
    }
    const fall = Math.max(0, (k - 0.55) / 0.45);
    drop.position.y = 2.95 - fall * fall * 2.94;
    drop.visible = k > 0.2;
    drop.scale.set(1, k < 0.55 ? 0.6 + k : 1.8, 1);
    for (const r of ripples) {
      r.t += dt;
      const kk = Math.min(1, r.t / 1.1);
      r.m.scale.setScalar(0.02 + kk * 0.3);
      r.m.material.opacity = (1 - kk) * 0.45;
    }
  });

  // 灯光的初始值（黄昏）：真正的亮度由第二章的逻辑每帧控制
  const L = refs.lights;
  L.sun.position.set(-2.2, 4.6, -12.5);
  L.sun.target.position.set(0.3, 0, 1.2);
  L.sun.color.set('#ffa060');
  L.winLight.color.set('#ff9a60');
  L.hemi.color.set('#b8a0a0'); L.hemi.groundColor.set('#4a3a2a');
  L.monLight.color.set('#9fffc0'); L.monLight.intensity = 0;
  refs.lights.wc.color.set('#e8d8a0');

  themed.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.userData.ruin) grimeify(o.material, o.material.metalness > 0.3); });
  add(themed);
  occl(refs.sheet);
}
