// 第四章：冰封 211 —— 同一间宿舍，被搬进了《冰汽时代》那样的末日寒潮里：零下七十度，暴风雪就要来了。
//   写实电影感（和第二、三、五章一个路子）：
//   · 墙：下半截铆钉铁板护墙、上半截熏黑的红砖；天花板是木板 + 铁梁；地板是旧木板，墙根、门缝底下、窗下积着吹进来的雪；
//   · 所有东西都冻住了：一个"结霜"着色器给所有材质蒙上一层霜（朝上的面积雪、竖面结霜花），天花板的梁、管子、床架上挂满冰柱；
//     暖炉烧起来之后，炉子周围出现一圈"热区"，越烧越大——热区里的霜一圈圈化开（化开的边上湿湿的一圈暗痕），冰柱滴水、变短；
//   · 屋里：铸铁暖炉（烧起来之后炉肚子发红）、煤箱、墙上的蒸汽管和压力表、气动传送管、宣传画和法典告示、冻成铁板的晾衣绳；
//     我的书桌前坐着宿舍的蒸汽自动机「老铁」（见 automaton.js），它面前是一台打字机；
//   · 窗户上一层厚厚的冰花，擦开之后才看得见外面：暴风雪夜里的环形城市——陨石坑一样的大坑，中间立着一座巨大的蒸汽熔炉，
//     一圈圈落满雪的木屋亮着暖光，探照灯在雪里扫来扫去，熔炉的烟柱被风吹歪；
//   · 灯：炉火（橘红、一跳一跳）、窗边书桌上的一盏马灯、熔炉透过窗户照进来的一点橘光、暴风雪的冷光；
//   · 门上是一条冻满冰碴的铁链 + 一把黄铜"蒸汽压力锁"，三个表盘分别刻着 🏭🔥⚙️
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TF from '../core/tex_frost.js';
import { genFur } from '../core/tex_jungle.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { Batch, compact } from './spacelook.js';
import { Automaton } from './automaton.js';

export function buildFrostTextures(B) {
  const T = {};
  T.floor = TF.genPlankFloor(); T.floorDirt = TF.genFloorSnow();
  const w = TF.genFrostWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  const c = TF.genFrostCeiling(); T.ceiling = c.map; T.ceilingN = c.normalMap;
  let s = 1;
  const ch = (t, o = {}) => TF.chill(t, { seed: s++, ...o });
  T.woodDark = ch(B.woodDark, { dark: 0.6 });
  T.woodLight = ch(B.woodLight, { dark: 0.62 });
  T.woodOrange = ch(B.woodOrange, { dark: 0.58 });
  T.doorWood = ch(B.doorWood, { dark: 0.55, rime: 16 });
  T.blackLaminate = ch(B.blackLaminate, { dark: 0.9 });
  T.curtain = ch(B.curtain, { dark: 0.5, rime: 14 });
  T.net = ch(B.net, { dark: 0.8, rime: 2 });
  for (const k of ['grayCloth', 'pinkCloth', 'blackCloth', 'blueCloth', 'whiteCloth', 'bamboo', 'floral', 'polka', 'yellowDots', 'patternRoll']) T[k] = ch(B[k], { dark: 0.66, rime: 8 });
  T.cardboard = ch(B.cardboard, { dark: 0.62 }); T.cardboard350 = ch(B.cardboard350, { dark: 0.62 });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.windowView = TF.genStormSky(256, 128);
  T.clockFace = ch(B.clockFace, { dark: 0.8, rime: 6, wrap: false });
  T.mousepad = ch(B.mousepad, { dark: 0.8, wrap: false });
  return T;
}

// ---------- 结霜：朝上的面积雪、竖着的面结一层霜花；暖炉周围的"热区"里霜化掉，化开的边上一圈湿的暗痕 ----------
// 所有材质共用同一组 uniform：改一次，整间屋子一起变
export const FROST_U = {
  uFrost: { value: 1 },
  uHeatPos: { value: new THREE.Vector3(-1.47, 0, 2.02) },
  uHeatR: { value: 0 },
};
const FROST_FUNCS = /* glsl */ `
uniform float uFrost; uniform vec3 uHeatPos; uniform float uHeatR;
varying vec3 vFW;
float fh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const FROST_APPLY = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float n1 = fn3(vFW * 2.3), n2 = fn3(vFW * 8.7 + 7.0), n3 = fn3(vFW * 37.0 + 3.0);
  float d = length(vFW.xz - uHeatPos.xz);
  float melt = 1.0 - smoothstep(uHeatR - 0.7, uHeatR + 0.12, d);
  float fz = uFrost * (1.0 - melt);
  // 朝上的面：积了一层雪；竖着的面：一块块的霜花；越靠墙根、越靠天花板越重
  float snow = smoothstep(0.5, 0.92, wn.y) * smoothstep(0.28, 0.58, n1 * 0.65 + n2 * 0.35);
  float rime = smoothstep(0.38, 0.8, n1 * 0.5 + n2 * 0.5);
  float low = 1.0 - smoothstep(0.0, 1.1, vFW.y), high = smoothstep(2.2, 3.0, vFW.y);
  // 地板上走来走去，积不住雪：只留一层薄薄的霜（墙根、门口、窗下的雪堆是另外画的）
  float floorK = smoothstep(0.015, 0.08, vFW.y);
  float amt = clamp(snow * mix(0.18, 0.95, floorK) + rime * mix(0.22, 0.3 + low * 0.35 + high * 0.35, floorK) + (n3 - 0.5) * 0.18 * floorK, 0.0, 0.92) * fz;
  vec3 frostCol = vec3(0.74, 0.82, 0.92) * (0.82 + n3 * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, frostCol, amt);
  roughnessFactor = mix(roughnessFactor, 0.5 + n3 * 0.35, amt);
  metalnessFactor = mix(metalnessFactor, 0.0, amt);
  // 刚化开的那一圈：湿的、发暗、反光
  float wet = uFrost * melt * (1.0 - smoothstep(0.0, 1.1, uHeatR - d)) * step(0.05, uHeatR);
  diffuseColor.rgb *= 1.0 - wet * 0.3;
  roughnessFactor = mix(roughnessFactor, 0.18, wet * 0.8);
}`;
function frostify(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FROST_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        fw = instanceMatrix * fw;
        #endif
        vFW = (modelMatrix * fw).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FROST_FUNCS}`)
      .replace('#include <normal_fragment_maps>', FROST_APPLY);
  };
  m.customProgramCacheKey = () => 'frost211';
  m.needsUpdate = true;
}
const _hsl = {};
function chillMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.frost) return;
  m.userData.frost = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * 0.55, Math.min(0.5, _hsl.l * 0.7 + 0.01));
  } else m.color.multiplyScalar(0.9);
  if (m.metalness > 0.45) m.roughness = Math.max(m.roughness, 0.45);
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.5;
  if (m.emissive && m.emissiveIntensity > 0 && !m.emissiveMap) m.emissiveIntensity *= 0.4;
  if (!m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) frostify(m);
}

// ---------- 小工具 ----------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
const noRay = (o) => { o.traverse((c) => { c.userData.noRay = true; if (c.isMesh || c.isSprite || c.isPoints) c.raycast = () => {}; }); return o; };
const cylBetween = (a, b, r, seg = 12) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};

// 雪：顶点着色器里算每一片雪花的位置（风吹 + 左右飘 + 循环），CPU 一点不费
const SNOW_VERT = /* glsl */ `
  attribute vec4 seed;
  uniform float time, wind, size, density; uniform vec3 boxMin, boxSize;
  varying float vA;
  void main() {
    float fall = 0.8 + seed.w * 1.2;
    vec3 p = seed.xyz * boxSize;
    p.y -= time * fall;
    p.x += time * wind * (0.7 + seed.w * 0.6) + sin(time * (0.7 + seed.w) + seed.x * 40.0) * 0.35;
    p.z += sin(time * 0.9 + seed.y * 30.0) * 0.25;
    p = mod(p, boxSize) + boxMin;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * (0.5 + seed.w) * 300.0 / max(0.5, -mv.z);
    vA = step(seed.w, density) * clamp(-mv.z / 1.5, 0.0, 1.0);
  }`;
const SNOW_FRAG = /* glsl */ `
  uniform vec3 color; uniform float bright;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c)) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(color * bright * a, a * 0.9);
  }`;
function snowField({ n = 3000, min, size, flake = 0.035, wind = 1.6, color = '#e6eef8' }) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(n * 4), rnd = mulberry32(n + 11);
  for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const U = { time: { value: 0 }, wind: { value: wind }, size: { value: flake }, density: { value: 0.7 }, boxMin: { value: min }, boxSize: { value: size }, color: { value: new THREE.Color(color) }, bright: { value: 1 } };
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = 3;
  noRay(m);
  return { points: m, U };
}

// ---------- 窗外：陨石坑里的城市 + 大熔炉 ----------
//   相机的远裁剪面是 60m：所有东西都放在 58m 以内（天空、坑壁是贴图，城市和熔炉是真的几何体）
//   室外全用不受光照的 MeshBasic：颜色自己"烘"好，屋里开关灯不影响外面
const GEN = V(0.8, -12, -30); // 熔炉底座中心：隔着大坑、正对着窗户
// 熔炉塔身上"信号灯柱"的位置（本地坐标）：9 盏灯从 y=M0 开始往上每 MS 一盏
const MAST = { M0: 11.7, MS: 0.62, z: (y) => 3.95 - (y - 11.3) * 0.1 };
export const MAST_WORLD = V(GEN.x, GEN.y + MAST.M0 + MAST.MS * 4, GEN.z + MAST.z(MAST.M0 + MAST.MS * 4) + 0.3);
function buildCity(P, rnd) {
  const city = new THREE.Group(); city.name = 'frostCity';
  city.userData.noAO = true; // 不参与 GTAO（见 main.js）
  const basic = (o) => new THREE.MeshBasicMaterial({ fog: false, ...o });
  const glowTex = TF.genGlow(128, [255, 200, 130]);
  const glowWhite = TF.genGlow(64, [255, 236, 210]);
  const addGlow = (pos, size, color, op = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    s.position.copy(pos); s.scale.set(size, size, 1);
    city.add(s); return s;
  };
  // 天空 + 大坑对面的坑壁（两层剪影）
  const sky = mesh(new THREE.PlaneGeometry(160, 90), basic({ map: TF.genStormSky(), depthWrite: false }), { x: 0.8, y: 18, z: -58.5, cast: false, recv: false });
  sky.renderOrder = -2; city.add(sky);
  const rimFar = mesh(new THREE.PlaneGeometry(150, 26), basic({ map: TF.genCraterRim(1024, 256, { seed: 4171, lights: 30 }), transparent: true, depthWrite: false, color: new THREE.Color(0.7, 0.76, 0.86) }), { x: 0.8, y: 9, z: -58, cast: false, recv: false });
  rimFar.renderOrder = -1; city.add(rimFar);

  // ---- 一圈圈台地 + 小木屋：大坑像个碗，对面的台地一层层往上爬、正对着我们 ----
  const hutGeo = (() => {
    const body = new THREE.BoxGeometry(1.6, 1.1, 1.4); body.translate(0, 0.55, 0);
    const roof = new THREE.CylinderGeometry(0.01, 1.15, 0.7, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.05, 1, 0.92); roof.translate(0, 1.45, 0);
    const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
    col(body, '#2e2824'); col(roof, '#7c8898');
    const nb = body.toNonIndexed(), nr = roof.toNonIndexed();
    const g = new THREE.BufferGeometry();
    const merge = (k) => { const a = nb.attributes[k].array, b = nr.attributes[k].array, o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    g.setAttribute('position', new THREE.BufferAttribute(merge('position'), 3));
    g.setAttribute('color', new THREE.BufferAttribute(merge('color'), 3));
    return g;
  })();
  const huts = [], wins = [], lamps = [];
  const cam = V(0, 1.6, -2);
  const RING = (k) => ({ R: 9 + k * 3.5, y: GEN.y + 0.8 + k * 2.3 });
  for (let k = 0; k < 6; k++) {
    const { R, y } = RING(k);
    const n = Math.floor((R * Math.PI * 2) / 2.5);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 + k * 0.37 + (rnd() - 0.5) * 0.04;
      const p = V(GEN.x + Math.sin(th) * (R + (rnd() - 0.5) * 0.8), y, GEN.z + Math.cos(th) * (R + (rnd() - 0.5) * 0.8));
      if (p.z > -6 || p.distanceTo(cam) > 57) continue;
      huts.push({ p, ry: th + (rnd() - 0.5) * 0.3, s: 0.8 + rnd() * 0.5 });
      if (rnd() < 0.72) {
        const to = cam.clone().sub(p).setY(0).normalize();
        wins.push({ p: p.clone().addScaledVector(to, 0.78).setY(y + 0.5 + rnd() * 0.15), ry: Math.atan2(to.x, to.z), on: rnd() });
      }
      if (i % 3 === 0) lamps.push(V(GEN.x + Math.sin(th + 0.05) * (R - 1.5), y + 1.7, GEN.z + Math.cos(th + 0.05) * (R - 1.5)));
    }
    // 台地：一圈落满雪的环
    const ring = new THREE.RingGeometry(R - 1.7, R + 1.8, 72, 1);
    ring.rotateX(-Math.PI / 2);
    const tone = 0.075 + k * 0.012;
    city.add(mesh(ring, basic({ color: new THREE.Color(tone * 0.86, tone * 0.93, tone * 1.1) }), { x: GEN.x, y: y - 0.02, z: GEN.z, cast: false, recv: false }));
    // 往上一层台地的挡土墙（对面那半圈正对着我们）
    if (k < 5) city.add(mesh(new THREE.CylinderGeometry(R + 1.8, R + 1.8, 2.32, 72, 1, true), basic({ color: new THREE.Color(0.1, 0.105, 0.125), side: THREE.DoubleSide }), { x: GEN.x, y: y + 1.14, z: GEN.z, cast: false, recv: false }));
  }
  const hutIM = new THREE.InstancedMesh(hutGeo, basic({ vertexColors: true }), huts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V();
  const fadeCol = new THREE.Color();
  huts.forEach((h, i) => {
    m4.compose(h.p, q.setFromAxisAngle(V(0, 1, 0), h.ry), sc.set(h.s, h.s, h.s));
    hutIM.setMatrixAt(i, m4);
    const f = clamp((h.p.distanceTo(cam) - 15) / 40, 0, 1); // 越远越被风雪吞掉
    hutIM.setColorAt(i, fadeCol.setRGB(lerp(1, 0.62, f), lerp(1, 0.68, f), lerp(1, 0.8, f)));
  });
  city.add(hutIM);
  // 亮着的小窗
  const winIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 0.3), basic({ toneMapped: false }), wins.length);
  wins.forEach((w, i) => {
    m4.compose(w.p, q.setFromAxisAngle(V(0, 1, 0), w.ry), sc.set(1, 1, 1));
    winIM.setMatrixAt(i, m4);
    const b = 1.0 + w.on * 1.6;
    winIM.setColorAt(i, fadeCol.setRGB(b * 1.6, b * 0.85, b * 0.35));
  });
  city.add(winIM);
  // 路灯：一颗颗暖色的光点
  const lampIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowWhite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, color: new THREE.Color(2.2, 1.4, 0.7) }), lamps.length);
  lamps.forEach((p, i) => { m4.compose(p, q.identity(), sc.set(1.2, 1.2, 1.2)); lampIM.setMatrixAt(i, m4); });
  city.add(lampIM);

  // ---- 大熔炉 ----
  const gen = new THREE.Group(); gen.position.copy(GEN); city.add(gen);
  const skin = TF.genGeneratorSkin(); skin.repeat.set(4, 2);
  const ironM = basic({ map: skin, color: new THREE.Color(0.42, 0.38, 0.37) });
  const darkM = basic({ color: new THREE.Color(0.055, 0.055, 0.065) });
  const hotM = basic({ color: new THREE.Color(3.2, 1.3, 0.35), toneMapped: false });
  const lathe = (pts, mat, seg = 40) => gen.add(mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat, { cast: false, recv: false }));
  // 底座：宽大的一圈，往上收成炉膛；炉膛上一圈竖着的发光的通风口；再往上是越来越细的塔身，顶上一圈平台 + 烟囱
  lathe([[7, 0], [7.2, 1.4], [6.0, 2.8], [5.8, 5.6], [4.9, 6.6], [4.6, 10], [3.7, 11.3], [3.2, 16.3], [2.7, 18.9], [4.3, 19.5], [4.4, 20.3], [1.8, 20.5], [1.7, 23.3], [2.0, 23.7], [1.9, 24], [0, 24]], ironM);
  // 零件按材质合批：发光的通风口一个网格、黑铁的箍 / 斜撑 / 灯柱一个网格
  const genB = new Batch(), M4 = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), S1 = V(1, 1, 1);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    genB.add(new THREE.PlaneGeometry(0.7, 2.2), hotM, M4.compose(V(Math.sin(a) * 5.86, 4.2, Math.cos(a) * 5.86), Q.setFromEuler(E.set(0, a, 0)), S1));
  }
  // 塔身上的铁箍、斜撑（一圈 6 根从平台斜下去的桁架）
  for (const y of [7.6, 10.2, 12.8, 15.2, 17.6]) genB.add(new THREE.TorusGeometry(y < 10.5 ? 4.75 : 3.72 - (y - 11.3) * 0.1, 0.15, 6, 40), darkM, M4.compose(V(0, y, 0), Q.setFromEuler(E.set(Math.PI / 2, 0, 0)), S1));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    genB.add(cylBetween(V(Math.sin(a) * 4.1, 19.5, Math.cos(a) * 4.1), V(Math.sin(a) * 8.6, 0, Math.cos(a) * 8.6), 0.24, 6), darkM, M4.identity());
  }
  const vents = [];
  // 平台上一圈护栏灯
  const crownMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color('#ffc070'), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const crownIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), crownMat, 20);
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; crownIM.setMatrixAt(k, M4.compose(V(GEN.x + Math.sin(a) * 4.45, GEN.y + 20.6, GEN.z + Math.cos(a) * 4.45), Q.identity(), S1)); }
  city.add(crownIM);
  const crownLamps = [];
  // 信号灯柱：塔身正面（朝着我们）一根竖杆上 9 盏灯，亮着几盏就是 🏭 那一位
  const mid = MAST.M0 + MAST.MS * 4;
  genB.add(new THREE.BoxGeometry(0.22, MAST.MS * 9 + 0.4, 0.22), darkM, M4.compose(V(0, mid, MAST.z(mid) - 0.12), Q.setFromEuler(E.set(-0.1, 0, 0)), S1));
  const lampOn = basic({ color: new THREE.Color(3.4, 0.9, 0.35), toneMapped: false });
  const lampOff = basic({ color: new THREE.Color(0.025, 0.022, 0.022) });
  const sigLamps = [];
  for (let k = 0; k < 9; k++) {
    const y = MAST.M0 + k * MAST.MS, z = MAST.z(y) + 0.04;
    genB.add(new THREE.BoxGeometry(0.42, 0.36, 0.2), darkM, M4.makeTranslation(0, y, z - 0.08));
    const lamp = mesh(new THREE.CircleGeometry(0.13, 16), lampOff, { y, z: z + 0.03, cast: false, recv: false });
    gen.add(lamp);
    const gl = addGlow(V(GEN.x, GEN.y + y, GEN.z + z + 0.25), 0.55, '#ff5a2a', 0);
    sigLamps.push({ lamp, gl });
  }
  genB.build(gen, { cast: false, name: 'generator' }).forEach((m) => { m.receiveShadow = false; });
  const setLamps = (n) => sigLamps.forEach((s, k) => { const on = k < n; s.lamp.material = on ? lampOn : lampOff; s.gl.material.opacity = on ? 0.7 : 0; });
  // 熔炉的光：炉膛一圈大光晕 + 塔顶一团
  const coreGlow = addGlow(V(GEN.x, GEN.y + 3.8, GEN.z + 4), 15, '#ff8a3a', 0.5);
  const crownGlow = addGlow(V(GEN.x, GEN.y + 21.2, GEN.z + 1), 7, '#ffb060', 0.35);
  // 烟柱：一团团烟从烟囱里冒出来，被风吹歪
  const puffTex = TF.genPuff();
  const smoke = [];
  for (let k = 0; k < 16; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color('#3a3a40'), transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    city.add(s); smoke.push({ s, t: k / 16 });
  }
  // 探照灯：两座瞭望塔，光柱在雪里扫来扫去
  const beamTex = TF.genBeam();
  const beams = [];
  for (const [x, z, y0, ph] of [[-13, -21, -6.5, 0], [15, -36, -2.5, 2.2]]) {
    const tower = new THREE.Group(); tower.position.set(x, y0, z); city.add(tower);
    tower.add(mesh(new THREE.CylinderGeometry(0.35, 0.7, 7, 6), darkM, { y: 3.5, cast: false, recv: false }));
    tower.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), darkM, { y: 7.5, cast: false, recv: false }));
    const head = new THREE.Group(); head.position.y = 8.1; tower.add(head);
    const bm = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
    for (const r of [0, Math.PI / 2]) {
      const pl = mesh(new THREE.PlaneGeometry(4, 28), bm, { cast: false, recv: false });
      pl.geometry.translate(0, -14, 0); pl.rotation.y = r;
      const pivot = new THREE.Group(); pivot.add(pl); head.add(pivot);
      pivot.rotation.x = Math.PI / 2 - 0.3;
    }
    addGlow(V(x, y0 + 8.1, z), 2.4, '#fff0d0', 0.9);
    beams.push({ head, ph });
  }
  // 我们楼外面：一根裹着雪的大蒸汽管、窗外的路灯
  const pipeM = basic({ color: new THREE.Color(0.14, 0.13, 0.13) });
  const snowTopM = basic({ color: new THREE.Color(0.62, 0.68, 0.78) });
  city.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 16), pipeM, { x: 0, y: -3.2, z: -7.5, rz: Math.PI / 2, cast: false, recv: false }));
  city.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 30, 16, 1, false, -Math.PI / 2 + 0.6, Math.PI - 1.2), snowTopM, { x: 0, y: -3.18, z: -7.5, rz: Math.PI / 2, cast: false, recv: false }));
  city.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 8), pipeM, { x: -3.2, y: -3.6, z: -9.5, cast: false, recv: false }));
  addGlow(V(-3.2, -0.5, -9.4), 2.6, '#ffc890', 0.9);
  // 几层风雪的"雾墙"：离得越远越被吞掉
  const hazeTex = (() => { const c = TX.makeCanvas(8, 128), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(60,70,88,0.0)'); g.addColorStop(0.4, 'rgba(70,80,98,0.5)'); g.addColorStop(1, 'rgba(40,46,58,0.75)'); x.fillStyle = g; x.fillRect(0, 0, 8, 128); return TX.toTex(c, { wrap: false }); })();
  const hazes = [];
  for (const [z, op, w] of [[-16, 0.28, 60], [-27, 0.35, 90], [-42, 0.4, 120], [-54, 0.45, 140]]) {
    const hz = mesh(new THREE.PlaneGeometry(w, 44), basic({ map: hazeTex, transparent: true, opacity: op, depthWrite: false }), { x: 0.8, y: 0, z, cast: false, recv: false });
    city.add(hz); hazes.push(hz);
  }
  noRay(city);
  P(city);
  return {
    city, setLamps, coreGlow, crownGlow, vents, hotM, smoke, beams, crownLamps, hazes,
    // 城市的呼吸：烟、探照灯、护栏灯；overdrive 0..1 熔炉超载
    update(dt, t, overdrive = 0) {
      const flick = 0.92 + Math.sin(t * 3.1) * 0.04 + Math.sin(t * 7.3) * 0.03;
      coreGlow.material.opacity = (0.5 + overdrive * 0.5) * flick;
      coreGlow.scale.setScalar(15 + overdrive * 6);
      crownGlow.material.opacity = 0.3 + overdrive * 0.4;
      hotM.color.setRGB(3.2 * (1 + overdrive * 0.8) * flick, 1.3 * (1 + overdrive * 0.6) * flick, 0.35);
      for (const s of smoke) {
        s.t = (s.t + dt * (0.045 + overdrive * 0.03)) % 1;
        const k = s.t;
        s.s.position.set(GEN.x + k * k * 16 + Math.sin(t * 0.3 + k * 6) * 0.8, GEN.y + 24 + k * 18, GEN.z - k * 4);
        const sz = 3.5 + k * 11 + overdrive * 3;
        s.s.scale.set(sz, sz, 1);
        s.s.material.opacity = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k) * (0.75 + overdrive * 0.2);
        s.s.material.color.setRGB(0.22 + (1 - k) * 0.2 * (1 + overdrive), 0.2 + (1 - k) * 0.12, 0.22);
      }
      for (const b of beams) b.head.rotation.y = Math.sin(t * 0.23 + b.ph) * 1.1 + b.ph;
      crownMat.opacity = 0.8 + Math.sin(t * 2) * 0.1 + overdrive * 0.2;
    },
  };
}

export function decorateFrost(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, LAYOUT } = ctx;
  const { SZ, WR, DOOR, WW } = LAYOUT;
  const rnd = mulberry32(4040);
  const props = new THREE.Group(); props.name = 'frostProps';
  const P = (o) => { props.add(o); return o; };
  const clean = new Set(); // 自己建好的写实材质：不再过一遍"结霜"（冰、雪、火、灯）
  const keep = (m) => { m.userData.frost = true; clean.add(m); return m; };
  const F = { heat: FROST_U };
  refs.frost = F;

  // ===== 0. 收拾：电子产品一律收掉（这个世界里没有电脑和手机），空调、灯管换掉；地上的复习资料留几张 =====
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  for (const o of [refs.sticky, refs.studentId, refs.phone, refs.monitor.group, refs.keyboard, refs.mouse, refs.tower, refs.strip, refs.monitor2, refs.headset, refs.ac, refs.remote, refs.helmet, refs.stoolH, refs.blackTable, refs.broom, refs.pinkBag]) if (o) o.visible = false;
  for (const fx of refs.fixtures) fx.visible = false;
  const D1 = refs.desks.D1, D2 = refs.desks.D2;
  // 我的书桌上的鼠标垫、第二张书桌上的键盘（它们没有单独的引用）
  for (const c of D1.children) if (c.isMesh && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.x - 0.26) < 0.01) c.visible = false;
  for (const c of D2.children) if (Math.abs(c.position.x + 0.05) < 0.01 && Math.abs(c.position.z - 0.1) < 0.01) c.visible = false;
  // 黑色杂物桌那一片（杂物、桌下的箱子）换成暖炉；头盔凳子也搬走（它的碰撞一起去掉）
  for (const o of refs.sections.sw) {
    const p = o.position;
    if (p.x < -1.15 && p.z > 1.2 && p.z < 2.8) o.visible = false;
  }
  collision.boxes = collision.boxes.filter((b) => !(Math.abs(b.minX + 1.0) < 1e-6 && Math.abs(b.minZ - 2.05) < 1e-6));
  // 窗边书桌右半边腾出来架望远镜
  for (const o of refs.sections.far) { const p = o.position; if (p.y > 0.7 && p.x > 0.02 && p.x < 0.42 && p.z < -2.9) o.visible = false; }
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh && rnd() < 0.6) o.visible = false; });
  refs.curtain.layout(0.2); refs.curtain.f = 0.2;
  M.curtain.emissiveIntensity = 0;
  refs.gap.line.color.set('#9fb4d8');
  refs.view.visible = false;

  // ===== 1. 墙 / 天花板 / 地板 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2), envMapIntensity: 0.35 });
  M.wall.needsUpdate = true;
  T.ceiling.repeat.set(3, 6.75); T.ceilingN.repeat.set(3, 6.75);
  Object.assign(M.ceiling, { normalMap: T.ceilingN, roughness: 0.9, envMapIntensity: 0.2 }); M.ceiling.needsUpdate = true;
  M.floor.normalScale.set(1, 1); M.floor.envMapIntensity = 0.5;
  M.floorDirt.polygonOffsetFactor = -2;
  for (const o of refs.corridor.children) if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.position.y > 2.5) o.material = std('#1c1a18', 0.95);

  // ===== 2. 天花板的铁梁 + 墙上的蒸汽管 + 压力表 =====
  const ironM = keep(std('#2a2826', 0.55, 0.75));
  const pipeMat = std('#3a3430', 0.5, 0.8); // 管子会结霜（交给结霜着色器）
  const copperM = std('#8a5434', 0.4, 0.85);
  const brassM = keep(std('#b08a4a', 0.32, 0.9));
  const beamB = new Batch(), I4 = new THREE.Matrix4();
  const beamZ = [-2.7, -0.4, 1.0, 3.25];
  for (const z of beamZ) {
    const web = new THREE.BoxGeometry(3.6, 0.14, 0.03), fl = new THREE.BoxGeometry(3.6, 0.018, 0.12);
    beamB.add(web, pipeMat, I4.makeTranslation(0, 2.92, z));
    beamB.add(fl, pipeMat, I4.makeTranslation(0, 2.85, z));
    for (let x = -1.7; x <= 1.7; x += 0.2) beamB.add(new THREE.SphereGeometry(0.008, 5, 4), pipeMat, I4.makeTranslation(x, 2.87, z + 0.05));
  }
  // 蒸汽管：两面长墙的墙顶各一根、天花板上横过去一根、暖炉边上一根竖管（压力表在它上面）、东北角一根
  const pipes = [
    [V(-1.71, 2.64, -3.5), V(-1.71, 2.64, 3.5), 0.045], [V(1.71, 2.64, -3.5), V(1.71, 2.64, 4.38), 0.045],
    [V(-1.71, 2.78, 1.45), V(1.71, 2.78, 1.45), 0.04], [V(-1.71, 2.64, 1.45), V(-1.71, 2.78, 1.45), 0.04], [V(1.71, 2.64, 1.45), V(1.71, 2.78, 1.45), 0.04],
    [V(-1.72, 0.18, 2.62), V(-1.72, 2.64, 2.62), 0.05], [V(1.71, 0.05, -3.5), V(1.71, 2.64, -3.5), 0.045],
  ];
  const pipeB = new Batch();
  for (const [a, b, r] of pipes) {
    pipeB.add(cylBetween(a, b, r, 14), pipeMat, I4.identity());
    // 法兰
    const len = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    for (let s = 0.6; s < len - 0.2; s += 1.2) { const p = a.clone().addScaledVector(dir, s); pipeB.add(cylBetween(p.clone().addScaledVector(dir, -0.02), p.clone().addScaledVector(dir, 0.02), r * 1.55, 12), pipeMat, I4.identity()); }
  }
  // 管卡
  for (let z = -3.0; z < 3.5; z += 1.3) { pipeB.add(new THREE.BoxGeometry(0.09, 0.03, 0.03), ironM, I4.makeTranslation(-1.755, 2.64, z)); pipeB.add(new THREE.BoxGeometry(0.09, 0.03, 0.03), ironM, I4.makeTranslation(1.755, 2.64, z)); }
  beamB.build(props, { cast: true, name: 'beams' });
  pipeB.build(props, { cast: false, name: 'pipes' }).forEach((m) => mark('pipe', m));
  // 阀门手轮（竖管上）
  const valve = new THREE.Group(); valve.position.set(-1.64, 1.05, 2.62); valve.rotation.y = Math.PI / 2;
  valve.add(mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 24), keep(std('#8a2a1e', 0.5, 0.4))));
  for (let k = 0; k < 3; k++) valve.add(mesh(new THREE.BoxGeometry(0.15, 0.012, 0.012), keep(std('#8a2a1e', 0.5, 0.4)), { rz: (k / 3) * Math.PI }));
  valve.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), ironM, { rx: Math.PI / 2, z: -0.04 }));
  compact(valve);
  P(valve); mark('valve', valve);
  refs.valve = valve;
  // 压力表：🔥 那一位（暖炉烧起来之后指针慢慢爬上去，停在数字上）
  const gC = TX.makeCanvas(256, 256);
  const gauge = TF.drawGaugeFace(gC, { label: 'PSI ×10' });
  const gaugeG = new THREE.Group(); gaugeG.position.set(-1.64, 1.55, 2.62); gaugeG.rotation.y = Math.PI / 2;
  gaugeG.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 32), brassM, { rx: Math.PI / 2 }));
  gaugeG.add(mesh(new THREE.TorusGeometry(0.118, 0.01, 8, 32), brassM, { z: 0.026 }));
  gaugeG.add(mesh(new THREE.CircleGeometry(0.11, 32), keep(new THREE.MeshStandardMaterial({ map: TX.toTex(gC, { wrap: false }), roughness: 0.55, emissive: new THREE.Color('#fff2d8'), emissiveMap: TX.toTex(gC, { wrap: false }), emissiveIntensity: 0.05 })), { z: 0.026, cast: false }));
  const needle = new THREE.Group(); needle.position.z = 0.03; gaugeG.add(needle);
  needle.add(mesh(new THREE.BoxGeometry(0.008, 0.09, 0.003), keep(std('#6a1008', 0.4)), { y: 0.035, cast: false }));
  needle.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12), brassM, { rx: Math.PI / 2, cast: false }));
  needle.rotation.z = gauge.angleOf(-1);
  const gaugeFrost = mesh(new THREE.CircleGeometry(0.112, 32), keep(new THREE.MeshStandardMaterial({ map: TF.genMirrorFrost(), transparent: true, opacity: 0.85, roughness: 0.6, depthWrite: false })), { z: 0.034, cast: false });
  gaugeG.add(gaugeFrost);
  gaugeG.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), ironM, { rx: Math.PI / 2, z: -0.06 }));
  compact(gaugeG, [needle]);
  P(gaugeG); mark('gauge', gaugeG);
  refs.gauge = { group: gaugeG, needle, angleOf: gauge.angleOf, frost: gaugeFrost, value: -1 };

  // ===== 3. 铸铁暖炉 + 烟道 + 煤箱 + 炉子上的一锅汤 =====
  const castM = std('#1c1a19', 0.62, 0.55);
  const bellyM = keep(new THREE.MeshStandardMaterial({ color: '#1e1b1a', roughness: 0.6, metalness: 0.55, emissive: new THREE.Color('#ff3a0e'), emissiveIntensity: 0 }));
  const fireM = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.03, 0.01), toneMapped: false }));
  const stove = new THREE.Group(); stove.position.set(-1.47, 0, 2.02); stove.rotation.y = Math.PI / 2; // 炉门朝东（屋里）
  stove.add(mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), castM, { y: 0.1 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stove.add(mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.1, 8), castM, { x: sx * 0.24, y: 0.05, z: sz * 0.24 }));
  const bp = [[0.2, 0], [0.24, 0.06], [0.27, 0.2], [0.275, 0.34], [0.25, 0.48], [0.22, 0.56], [0.23, 0.6], [0.2, 0.62]].map(([r, y]) => new THREE.Vector2(r, y));
  stove.add(mesh(new THREE.LatheGeometry(bp, 32), bellyM, { y: 0.12 }));
  for (const y of [0.2, 0.46, 0.7]) stove.add(mesh(new THREE.TorusGeometry(y === 0.46 ? 0.28 : 0.255, 0.012, 6, 32), brassM, { y, rx: Math.PI / 2 }));
  stove.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.04, 32), castM, { y: 0.76 }));
  stove.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), ironM, { y: 0.785 }));
  // 炉门（朝 +z 本地 = 屋里）：铸铁门 + 一排发光的格栅缝
  const hinge = new THREE.Group(); hinge.position.set(-0.12, 0.4, 0.27); stove.add(hinge); // 合页在左边
  const door = new THREE.Group(); door.position.set(0.12, 0, 0); hinge.add(door);
  door.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), castM, { rx: Math.PI / 2 }));
  door.add(mesh(new THREE.CircleGeometry(0.1, 24), fireM, { z: 0.0155, cast: false }));
  for (let k = -3; k <= 3; k++) door.add(mesh(new THREE.BoxGeometry(0.19 * Math.sqrt(1 - (k / 4) ** 2), 0.012, 0.014), castM, { y: k * 0.026, z: 0.022, cast: false }));
  door.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), brassM, { x: 0.1, z: 0.04, rz: Math.PI / 2 }));
  // 下面的灰门
  stove.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), castM, { y: 0.17, z: 0.25 }));
  // 烟道：竖着上去，拐个弯钻进西墙
  const flue = new THREE.Group(); stove.add(flue);
  flue.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.7, 16), castM, { y: 1.65 }));
  flue.add(mesh(new THREE.TorusGeometry(0.15, 0.075, 12, 16, Math.PI / 2), castM, { y: 2.5, z: -0.15, rz: 0, ry: Math.PI / 2, rx: 0 }));
  flue.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 16), castM, { y: 2.65, z: -0.26, rx: Math.PI / 2 }));
  flue.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), brassM, { y: 1.3 }));
  // 炉子上：一口锅（锯末汤）
  const pot = new THREE.Group(); pot.position.set(0.05, 0.79, 0.05); stove.add(pot);
  pot.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.13, 20, 1, true), keep(std('#3a3634', 0.45, 0.7, { side: THREE.DoubleSide })), { y: 0.065 }));
  pot.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 20), keep(std('#2a2622', 0.5, 0.7)), { y: 0.005 }));
  const soupM = keep(std('#6a5234', 0.35, 0));
  const soup = mesh(new THREE.CircleGeometry(0.11, 20), soupM, { y: 0.1, rx: -Math.PI / 2, cast: false });
  pot.add(soup);
  pot.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 20), keep(std('#3a3634', 0.45, 0.7)), { y: 0.14, x: 0.06, rz: 0.25 }));
  for (const s of [-1, 1]) pot.add(mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), ironM, { x: s * 0.125, y: 0.11, ry: Math.PI / 2 }));
  const soupIce = mesh(new THREE.CircleGeometry(0.108, 20), keep(std('#c8d6e4', 0.2, 0, { transparent: true, opacity: 0.85 })), { y: 0.102, rx: -Math.PI / 2, cast: false });
  pot.add(soupIce);
  P(stove); mark('stove', stove);
  mark('soup', pot);
  refs.stove = { group: stove, door: hinge, fireM, bellyM, pot, soupIce, soupM, pos: V(-1.47, 0, 2.02) };
  // 火钳和铲子靠在炉子边上
  const tools = new THREE.Group(); tools.position.set(-1.72, 0, 2.42);
  tools.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), ironM, { y: 0.4, rz: 0.12 }));
  tools.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.78, 6), ironM, { x: 0.06, y: 0.39, rz: 0.08 }));
  tools.add(mesh(new THREE.BoxGeometry(0.09, 0.012, 0.1), ironM, { x: 0.02, y: 0.03, rz: 0.08 }));
  P(tools);
  // 煤箱：木头箱子 + 铁皮包角，盖子冻住了（一层冰壳）
  const crate = new THREE.Group(); crate.position.set(-1.5, 0, 1.47);
  const crateWood = K.M.woodOrange;
  crate.add(mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), crateWood, { y: 0.17 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) crate.add(mesh(new THREE.BoxGeometry(0.04, 0.35, 0.04), ironM, { x: sx * 0.22, y: 0.175, z: sz * 0.16 }));
  const lid = new THREE.Group(); lid.position.set(0, 0.34, -0.17); crate.add(lid);
  lid.add(mesh(new THREE.BoxGeometry(0.48, 0.03, 0.36), crateWood, { y: 0.015, z: 0.17 }));
  lid.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 0.03), ironM, { y: 0.03, z: 0.34 }));
  const crateIce = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.38), keep(std('#c4d8ec', 0.12, 0, { transparent: true, opacity: 0.72 })), { y: 0.37, cast: false });
  crate.add(crateIce);
  const coalM = keep(std('#141312', 0.55, 0.2));
  const coalB = new Batch();
  for (let k = 0; k < 22; k++) { const g = new THREE.IcosahedronGeometry(0.035 + rnd() * 0.03, 0); coalB.add(g, coalM, I4.makeTranslation((rnd() - 0.5) * 0.36, 0.28 + rnd() * 0.04, (rnd() - 0.5) * 0.24)); }
  coalB.build(crate, { cast: false, name: 'coal' });
  compact(crate, [lid]);
  P(crate); mark('coalCrate', crate);
  refs.coalCrate = { group: crate, lid, ice: crateIce };
  // 炉子里的煤（添进去之后才出现，在炉门后面烧）
  const coalIn = new THREE.Group(); coalIn.visible = false; stove.add(coalIn);
  const emberM = keep(new THREE.MeshStandardMaterial({ color: '#1a0e08', emissive: new THREE.Color('#ff5a18'), emissiveIntensity: 2.5, roughness: 0.8 }));
  for (let k = 0; k < 7; k++) coalIn.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), emberM, { x: (rnd() - 0.5) * 0.18, y: 0.3 + rnd() * 0.05, z: 0.1 + rnd() * 0.08, cast: false }));
  refs.stove.coalIn = coalIn;
  compact(stove, [hinge, coalIn, pot]); compact(hinge); // 静态零件合批（炉门会开、炉子里的煤会出现、汤里的冰会化）

  // ===== 4. 雪：门缝底下、窗下、墙角的雪堆；窗台里侧的一溜雪；冰镐插在门口的雪堆里 =====
  const snowS = TF.genSnowSurface();
  snowS.map.repeat.set(2, 2); snowS.normalMap.repeat.set(2, 2); snowS.roughnessMap.repeat.set(2, 2);
  const snowM = keep(new THREE.MeshStandardMaterial({ map: snowS.map, normalMap: snowS.normalMap, roughnessMap: snowS.roughnessMap, roughness: 1, color: new THREE.Color('#dfe8f4'), envMapIntensity: 0.6 }));
  const drift = (x, z, rx, rz, h, ry = 0, seed = 1) => {
    const g = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position, rr = mulberry32(seed);
    const ph = [rr() * 6, rr() * 6];
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      const k = 1 + Math.sin(X * 5 + ph[0]) * 0.08 + Math.sin(Z * 7 + ph[1]) * 0.06;
      p.setXYZ(i, X * rx, Math.pow(Math.max(0, Y), 1.4) * h * k, Z * rz);
    }
    g.computeVertexNormals();
    const m = mesh(g, snowM, { x, y: 0.001, z, ry, cast: false });
    P(m); return m;
  };
  const doorDrift = drift(-1.55, 4.02, 0.32, 0.5, 0.12, 0, 3);
  mark('snowdrift', doorDrift);
  drift(-1.6, -3.4, 0.22, 0.28, 0.1, 0.3, 4); drift(1.55, -3.4, 0.26, 0.24, 0.14, 0, 5); drift(1.62, 3.55, 0.18, 0.22, 0.09, 0, 6); drift(-0.2, -3.5, 0.5, 0.12, 0.05, 0, 7);
  // 窗台里侧的一溜雪
  P(mesh(new THREE.BoxGeometry(2.7, 0.025, 0.14), snowM, { y: 0.97, z: -3.52, cast: false }));
  // 冰镐：斜插在门口那堆雪里
  const pick = new THREE.Group(); pick.position.set(-1.38, 0.05, 4.12); pick.rotation.set(0.35, 0.6, -0.25);
  pick.add(mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.62, 8), keep(std('#5a3a22', 0.7)), { y: 0.31 }));
  pick.add(mesh(new THREE.BoxGeometry(0.3, 0.035, 0.025), keep(std('#3a3c40', 0.35, 0.9)), { y: 0.6 }));
  pick.add(mesh(new THREE.ConeGeometry(0.018, 0.12, 6), keep(std('#3a3c40', 0.35, 0.9)), { x: 0.2, y: 0.6, rz: -Math.PI / 2 }));
  pick.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), keep(std('#8a1e14', 0.8)), { y: 0.08 }));
  P(pick); mark('icePick', pick);
  refs.icePick = pick;

  // ===== 5. 冰柱：梁底、管子底下、床架、窗框、门框上都挂着；热区里的会滴水、变短 =====
  const iceM = keep(new THREE.MeshStandardMaterial({ color: '#cfe4f8', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.82, envMapIntensity: 1.4, emissive: new THREE.Color('#223344'), emissiveIntensity: 0.25 }));
  const icicles = [];
  const addIce = (x, y, z, len, r) => icicles.push({ x, y, z, len, r, k: 1 });
  for (const z of beamZ) for (let x = -1.65; x <= 1.65; x += 0.09 + rnd() * 0.16) if (rnd() < 0.55) addIce(x, 2.84, z + (rnd() - 0.5) * 0.08, 0.05 + rnd() ** 2 * 0.28, 0.008 + rnd() * 0.01);
  for (const [a, b] of pipes.slice(0, 3)) { const len = a.distanceTo(b); for (let s = 0.1; s < len; s += 0.12 + rnd() * 0.2) if (rnd() < 0.5) { const p = a.clone().lerp(b, s / len); addIce(p.x, p.y - 0.045, p.z, 0.04 + rnd() ** 2 * 0.22, 0.006 + rnd() * 0.008); } }
  for (let x = -1.3; x <= 1.3; x += 0.07 + rnd() * 0.08) addIce(x, 2.53, -3.56, 0.04 + rnd() ** 2 * 0.16, 0.006 + rnd() * 0.007);
  for (const [bx, bz] of [[-1.325, 0.21], [-1.325, -2.34], [1.325, 1.81], [1.325, -2.34]]) {
    for (let k = 0; k < 14; k++) { const side = rnd() < 0.5 ? -1 : 1; addIce(bx + side * 0.46, 1.38, bz - 0.95 + rnd() * 1.9, 0.03 + rnd() ** 2 * 0.12, 0.005 + rnd() * 0.006); }
  }
  for (let z = DOOR.z0 + 0.05; z < DOOR.z1; z += 0.06 + rnd() * 0.05) addIce(-1.72, 2.05, z, 0.03 + rnd() ** 2 * 0.12, 0.006 + rnd() * 0.005);
  // 洗手间：窗框上沿、洗漱台的台沿
  for (let x = WW.x0 + 0.04; x < WW.x1 - 0.03; x += 0.05 + rnd() * 0.05) addIce(x, WW.y1 - 0.02, WR.z1 + 0.02, 0.04 + rnd() ** 2 * 0.2, 0.006 + rnd() * 0.007);
  for (let x = 0.6; x < 1.75; x += 0.06 + rnd() * 0.08) addIce(x, 0.77, WR.z1 - 0.52, 0.03 + rnd() ** 2 * 0.1, 0.005 + rnd() * 0.005);
  const icGeo = new THREE.ConeGeometry(1, 1, 7, 1); icGeo.rotateX(Math.PI); icGeo.translate(0, -0.5, 0);
  const icIM = new THREE.InstancedMesh(icGeo, iceM, icicles.length);
  icIM.castShadow = false; icIM.receiveShadow = false;
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = V();
  icicles.forEach((ic) => { ic.d = Math.hypot(ic.x - F.heat.uHeatPos.value.x, ic.z - F.heat.uHeatPos.value.z); ic.q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.1, rnd() * 6, (rnd() - 0.5) * 0.1)); });
  const layoutIce = () => { icicles.forEach((ic, i) => { m4.compose(sv.set(ic.x, ic.y, ic.z), ic.q, V(ic.r, ic.len * ic.k, ic.r)); icIM.setMatrixAt(i, m4); }); icIM.instanceMatrix.needsUpdate = true; };
  layoutIce();
  P(noRay(icIM));
  // 冻着发条钥匙的那根大冰柱：挂在天花板那根横管上
  const keyIce = new THREE.Group(); keyIce.position.set(-0.55, 2.74, 1.45);
  const bigIce = mesh(icGeo, iceM, { s: [0.06, 0.5, 0.06], cast: false });
  keyIce.add(bigIce);
  const keyM = keep(std('#c8a050', 0.3, 0.95));
  const keyObj = new THREE.Group();
  keyObj.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), keyM, { cast: false }));
  for (const s of [-1, 1]) keyObj.add(mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), keyM, { x: s * 0.024, y: 0.06, ry: Math.PI / 2, cast: false }));
  keyObj.add(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.008), keyM, { x: 0.008, y: -0.045, cast: false }));
  keyObj.position.set(0, -0.2, 0); keyObj.rotation.z = 0.2;
  keyIce.add(keyObj);
  P(keyIce); mark('keyIce', keyIce);
  refs.keyIce = { group: keyIce, ice: bigIce, key: keyObj, k: 1 };
  refs.icicles = { list: icicles, layout: layoutIce, im: icIM };

  // ===== 6. 门：铁皮加固 + 冻满冰碴的铁链 + 黄铜"蒸汽压力锁" =====
  const dp = refs.door.pivot, DW = DOOR.z1 - DOOR.z0 - 0.02;
  const strapB = new Batch();
  for (const y of [0.35, 1.0, 1.7]) {
    strapB.add(new THREE.BoxGeometry(DW - 0.02, 0.07, 0.012), ironM, I4.makeTranslation(-DW / 2, y, -0.028));
    for (let k = 0; k < 6; k++) strapB.add(new THREE.SphereGeometry(0.008, 6, 4), ironM, I4.makeTranslation(-0.06 - k * ((DW - 0.12) / 5), y, -0.035));
  }
  strapB.build(dp, { cast: true, name: 'doorStraps' });
  refs.lock.group.visible = false;
  const chain = new THREE.Group(); chain.name = 'frostChain';
  const linkGeo = new THREE.TorusGeometry(0.022, 0.0058, 6, 12); linkGeo.scale(1, 1.6, 1);
  const chainM = keep(std('#7a7670', 0.4, 0.85));
  const curve = refs.lock.curve;
  const N = Math.floor(curve.getLength() / 0.03);
  const links = new THREE.InstancedMesh(linkGeo, chainM, N);
  {
    const tan = V(), up = V(0, 1, 0), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), p = curve.getPointAt(t);
      curve.getTangentAt(t, tan);
      qq.setFromUnitVectors(up, tan); q2.setFromAxisAngle(tan, (i % 2) * Math.PI / 2);
      mm.compose(p, q2.multiply(qq), V(1, 1, 1));
      links.setMatrixAt(i, mm);
    }
  }
  links.castShadow = true;
  chain.add(links);
  // 链子上的冰碴：一截截冰壳 + 往下挂的小冰柱
  const crust = new THREE.Group();
  {
    const cb = new Batch(), e = new THREE.Euler();
    for (let k = 0; k < 18; k++) {
      const t = 0.05 + (k / 18) * 0.9, p = curve.getPointAt(t);
      cb.add(new THREE.IcosahedronGeometry(0.016 + rnd() * 0.012, 0), iceM, m4.compose(p, q0.setFromEuler(e.set(rnd() * 3, rnd() * 3, 0)), sv.set(1, 1, 1)));
      if (rnd() < 0.6) cb.add(icGeo, iceM, m4.compose(p.clone().setY(p.y - 0.01), q0.identity(), sv.set(0.006, 0.03 + rnd() * 0.05, 0.006)));
    }
    cb.build(crust, { cast: false, name: 'crust' });
  }
  chain.add(crust);
  const padlock = new THREE.Group();
  padlock.position.set(-1.66, 0.8, 3.69); padlock.rotation.y = 1.25; // 挂在链子上、比桌面高一点（进门时镜头要看得见它）
  padlock.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.045), brassM));
  padlock.add(mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), keep(std('#7a7670', 0.35, 0.9)), { y: 0.05 }));
  // 三个小表盘 + 一个放气阀
  const dialC = TX.makeCanvas(64, 64), dx = dialC.getContext('2d');
  dx.fillStyle = '#e8dcc0'; dx.beginPath(); dx.arc(32, 32, 30, 0, 6.28); dx.fill(); dx.strokeStyle = '#2a2016'; dx.lineWidth = 3; dx.stroke();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28; dx.fillStyle = '#2a2016'; dx.fillRect(32 + Math.cos(a) * 22 - 1, 32 + Math.sin(a) * 22 - 1, 3, 3); }
  const dialM = keep(new THREE.MeshStandardMaterial({ map: TX.toTex(dialC, { wrap: false }), roughness: 0.5 }));
  for (let i = 0; i < 3; i++) {
    padlock.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 16), brassM, { x: -0.035 + i * 0.035, y: -0.01, z: 0.024, rx: Math.PI / 2 }));
    padlock.add(mesh(new THREE.CircleGeometry(0.013, 16), dialM, { x: -0.035 + i * 0.035, y: -0.01, z: 0.0295, cast: false }));
  }
  padlock.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), copperM, { x: 0.065, y: 0.02, rz: Math.PI / 2 }));
  padlock.add(mesh(new THREE.BoxGeometry(0.125, 0.02, 0.05), iceM, { y: -0.052, cast: false }));
  // 锁上一盏小指示灯：锁着是红的
  const lockLampM = keep(new THREE.MeshStandardMaterial({ color: '#300a06', emissive: new THREE.Color('#ff3a1a'), emissiveIntensity: 2.2 }));
  padlock.add(mesh(new THREE.SphereGeometry(0.009, 10, 8), lockLampM, { x: -0.045, y: 0.03, z: 0.024, cast: false }));
  compact(padlock);
  chain.add(padlock);
  P(chain);
  mark('door', chain);
  const dropped = new THREE.Group(); dropped.visible = false;
  const coil = [];
  for (let i = 0; i <= 50; i++) { const a = i * 0.42; coil.push(V(-1.24 + Math.cos(a) * 0.13, 0.012 + i * 0.001, 3.5 + Math.sin(a) * 0.1)); }
  dropped.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.009, 6), chainM));
  P(dropped);
  refs.frostLock = { group: chain, links, N, lock: padlock, crust, dropped, lamp: lockLampM };

  // ===== 7. 窗户：一层厚厚的冰花（擦开之后才看得见外面）+ 窗外 =====
  const ferns = TX.makeCanvas(768, 448);
  TF.drawIceFerns(ferns);
  const fernTex = TX.toTex(ferns, { wrap: false });
  const fernGlowC = TX.makeCanvas(128, 64), fgx = fernGlowC.getContext('2d');
  { const gr = fgx.createRadialGradient(72, 36, 2, 72, 36, 70); gr.addColorStop(0, '#ffb070'); gr.addColorStop(0.45, '#a04a18'); gr.addColorStop(1, '#101418'); fgx.fillStyle = gr; fgx.fillRect(0, 0, 128, 64); }
  const fernM = keep(new THREE.MeshStandardMaterial({ map: fernTex, color: new THREE.Color('#9aa8b8'), transparent: true, roughness: 0.75, depthWrite: false, emissive: new THREE.Color('#ffffff'), emissiveMap: TX.toTex(fernGlowC, { wrap: false }), emissiveIntensity: 0.55 }));
  const fernMesh = mesh(new THREE.PlaneGeometry(2.62, 1.5), fernM, { y: 1.75, z: -3.6 + 0.018, cast: false, recv: false });
  fernMesh.renderOrder = 4;
  P(noRay(fernMesh));
  // 窗外透进来的一团熔炉的光（冰花被从后面照亮）
  const backGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TF.genGlow(128, [255, 160, 90]), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  backGlow.position.set(0.35, 1.5, -3.75); backGlow.scale.set(2.4, 1.6, 1);
  P(noRay(backGlow));
  refs.windowFrost = { canvas: ferns, tex: fernTex, mat: fernM, glow: backGlow, glowK: 1 };
  // 窗外：窗台上的雪、外面挂着的冰柱
  P(mesh(new THREE.BoxGeometry(2.8, 0.12, 0.35), snowM, { y: 0.93, z: -3.85, cast: false }));
  for (let x = -1.35; x <= 1.35; x += 0.05 + rnd() * 0.07) { const len = 0.06 + rnd() ** 2 * 0.45; P(noRay(mesh(icGeo, iceM, { x, y: 2.6, z: -3.72, s: [0.01 + rnd() * 0.012, len, 0.01 + rnd() * 0.012], cast: false }))); }
  const city = buildCity(P, rnd);
  refs.frostCity = city;
  // 窗外的雪：近处大片、远处细密
  const snowNear = snowField({ n: 1400, min: V(-6, -5, -12), size: V(12, 11, 8.2), flake: 0.03, wind: 1.8 });
  const snowFar = snowField({ n: 3500, min: V(-24, -14, -40), size: V(48, 32, 28), flake: 0.09, wind: 3.2 });
  P(snowNear.points); P(snowFar.points);
  // 洗手间窗外也在下（往南）
  const snowWC = snowField({ n: 900, min: V(-4, -3, WR.z1 + 0.3), size: V(8, 7, 5), flake: 0.03, wind: -1.4 });
  P(snowWC.points);
  refs.snow = [snowNear, snowFar, snowWC];

  // ===== 8. 穿衣镜上的霜（屋里热起来之后才化）=====
  const mirrorFrost = mesh(new THREE.PlaneGeometry(0.228, 1.388), keep(new THREE.MeshStandardMaterial({ map: TF.genMirrorFrost(), transparent: true, opacity: 0.94, roughness: 0.7, depthWrite: false })), { z: -0.026, ry: Math.PI, cast: false, recv: false });
  refs.mirrorG.add(noRay(mirrorFrost));
  refs.mirrorFrost = mirrorFrost;

  // ===== 9. 床上的毛皮褥子、冻成铁板的晾衣绳 =====
  const peltT = TF.genPelt({ seed: 4261, base: '#7a6a58' }), peltT2 = TF.genPelt({ seed: 4262, base: '#9a9288' });
  for (const [x, z, ry, t, y] of [[-1.3, 0.35, 0.05, peltT, 0.47], [-1.3, -2.1, -0.04, peltT2, 0.47], [1.3, 1.6, 0.03, peltT2, 0.47], [1.28, -2.3, -0.06, peltT, 0.47], [1.3, -2.2, 0.02, peltT, 1.53]]) {
    const g = new THREE.PlaneGeometry(0.9, 1.3, 8, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i); p.setZ(i, -Math.max(0, Math.abs(X) - 0.38) * 1.4 + Math.sin(X * 9 + Y * 5) * 0.01); }
    g.computeVertexNormals();
    P(mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), { x, y: y + 0.05, z, rx: -Math.PI / 2, rz: ry, cast: false }));
  }
  const lineA = V(-0.84, 2.56, -0.25), lineB = V(0.84, 2.56, -0.95);
  P(mesh(cylBetween(lineA, lineB, 0.004, 5), keep(std('#8a8478', 0.8)), { cast: false }));
  const laundry = new THREE.Group();
  const shirtCols = ['#4a5a6a', '#6a4a3a', '#8a8a80', '#2a2a2e'];
  for (let k = 0; k < 4; k++) {
    const p = lineA.clone().lerp(lineB, 0.18 + k * 0.21);
    const w = k === 3 ? 0.14 : 0.42, h = k === 3 ? 0.22 : 0.52;
    const g = new THREE.PlaneGeometry(w, h, 4, 6);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getY(i) * 7 + k) * 0.015);
    g.computeVertexNormals(); g.translate(0, -h / 2, 0);
    const m = mesh(g, std(shirtCols[k], 0.9, 0, { side: THREE.DoubleSide }), { x: p.x, y: p.y, z: p.z, ry: Math.atan2(lineB.x - lineA.x, lineB.z - lineA.z) + Math.PI / 2, rx: 0.04, cast: true });
    laundry.add(m);
  }
  P(laundry); mark('laundry', laundry);

  // ===== 10. 宣传画、法典、气动传送管 =====
  const poster = (kind, x, y, z, ry, w = 0.4) => {
    const g = new THREE.PlaneGeometry(w, w * 1.42, 4, 6);
    const m = mesh(g, new THREE.MeshStandardMaterial({ map: TF.genFrostPoster(kind), roughness: 0.85 }), { x, y, z, ry, cast: false });
    P(m); mark(`poster_${kind}`, m);
    return m;
  };
  poster('survive', 1.79, 1.75, 3.32, -Math.PI / 2, 0.42);
  poster('law', -1.79, 1.76, 3.18, Math.PI / 2, 0.34);
  poster('coal', -1.58, 1.7, -3.588, 0, 0.32);
  poster('automaton', 1.58, 1.7, -3.588, 0, 0.32);
  // 气动传送管：南墙上一个黄铜收件箱，一根玻璃管一直通到天花板
  const tube = new THREE.Group(); tube.position.set(0.97, 1.3, SZ - 0.09); tube.rotation.y = Math.PI;
  tube.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.16), brassM));
  tube.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), ironM, { y: -0.13, z: 0.08 }));
  tube.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 16, 1, true), keep(new THREE.MeshStandardMaterial({ color: '#cfe0e8', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide })), { y: 0.93, z: 0.0, cast: false }));
  for (const y of [0.18, 0.9, 1.6]) tube.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 16), brassM, { y }));
  tube.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), keep(new THREE.MeshStandardMaterial({ color: '#301008', emissive: new THREE.Color('#ff4a20'), emissiveIntensity: 0 })), { x: 0.08, y: 0.1, z: 0.085, rx: Math.PI / 2 }));
  const tubeLamp = tube.children[tube.children.length - 1];
  const capsule = new THREE.Group(); capsule.position.set(-0.03, -0.09, 0.09); capsule.rotation.set(0, 0, Math.PI / 2 - 0.2);
  capsule.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 14), brassM, { cast: false }));
  capsule.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 14), keep(std('#5a3018', 0.8)), { cast: false }));
  tube.add(capsule);
  const flyCap = capsule.clone(); flyCap.visible = false; flyCap.position.set(0, 1.6, 0); flyCap.rotation.set(0, 0, 0); tube.add(flyCap);
  compact(tube, [capsule, flyCap]);
  P(tube); mark('tube', tube);
  refs.tube = { group: tube, capsule, flyCap, lamp: tubeLamp };

  // ===== 11. 窗边书桌：马灯、黄铜望远镜；第二张书桌：一摞书、一盏油灯；我的书桌：打字机 =====
  const lanternG = new THREE.Group(); lanternG.position.set(0.62, 0.74, -3.28);
  const lanternMetal = keep(std('#2a2a26', 0.55, 0.7));
  lanternG.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 18), lanternMetal, { y: 0.035 }));
  lanternG.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 16), lanternMetal, { y: 0.24 }));
  lanternG.add(mesh(new THREE.ConeGeometry(0.05, 0.05, 16), lanternMetal, { y: 0.28 }));
  lanternG.add(mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 18, Math.PI), lanternMetal, { y: 0.29 }));
  for (const s of [-1, 1]) lanternG.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.19, 5), lanternMetal, { x: s * 0.058, y: 0.165, cast: false }));
  const chimney = mesh(new THREE.SphereGeometry(0.05, 18, 12), keep(std('#e8dcc0', 0.08, 0, { transparent: true, opacity: 0.22, depthWrite: false })), { y: 0.15, s: [1, 1.5, 1], cast: false });
  chimney.renderOrder = 3; lanternG.add(chimney);
  const flameM = new THREE.MeshBasicMaterial({ color: '#ffb050', toneMapped: false });
  const flame = mesh(new THREE.SphereGeometry(0.012, 10, 8), flameM, { y: 0.13, s: [1, 2.2, 1], cast: false });
  lanternG.add(flame);
  compact(lanternG, [flame]);
  P(lanternG); mark('lantern', lanternG);
  // 黄铜望远镜：架在窗边书桌上，对着窗外
  const scope = new THREE.Group(); scope.position.set(0.22, 0.74, -3.22);
  scope.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), lanternMetal, { x: -0.06, y: 0.1, z: 0.04, rz: 0.3, rx: -0.2 }));
  scope.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), lanternMetal, { x: 0.06, y: 0.1, z: 0.04, rz: -0.3, rx: -0.2 }));
  scope.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), lanternMetal, { y: 0.1, z: -0.05, rx: 0.35 }));
  const barrel = new THREE.Group(); barrel.position.set(0, 0.21, 0); barrel.rotation.set(-Math.PI / 2 + 0.12, 0, 0); scope.add(barrel);
  barrel.add(mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.28, 16), brassM, { y: 0.06 }));
  barrel.add(mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.18, 16), brassM, { y: -0.16 }));
  barrel.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 16), lanternMetal, { y: 0.2 }));
  compact(scope);
  P(scope); mark('spyglass', scope);
  refs.spyglass = scope;
  // 第二张书桌：一摞书 + 一只冻住的墨水瓶
  const books2 = new THREE.Group();
  for (let i = 0; i < 5; i++) { const b = K.book(0.2, 0.035, 0.27, ['#3a2a22', '#2a3a44', '#5a4a2a', '#222', '#6a2a22'][i]); b.position.set((rnd() - 0.5) * 0.03, 0.017 + i * 0.036, (rnd() - 0.5) * 0.03); b.rotation.y = (rnd() - 0.5) * 0.3; books2.add(b); }
  books2.position.set(0.05, 0.76, -0.14); D2.add(books2);
  // 打字机（老铁在用）
  const tw = new THREE.Group(); tw.position.set(1.43, 0.76, 0.26); tw.rotation.y = -Math.PI / 2;
  const twM = keep(std('#161412', 0.35, 0.6));
  tw.add(mesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), twM, { y: 0.03 }));
  tw.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.1), twM, { y: 0.09, z: -0.08 }));
  tw.add(mesh(new THREE.BoxGeometry(0.37, 0.004, 0.005), brassM, { y: 0.061, z: 0.13, cast: false }));
  const keyCapM = keep(std('#e8e0cc', 0.4)), keyRimM = keep(std('#1a1816', 0.4, 0.6));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
    const x = -0.14 + c * 0.031 + (r % 2) * 0.012, z = 0.1 - r * 0.028, y = 0.068 + r * 0.012;
    tw.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 10), keyCapM, { x, y, z, cast: false }));
    tw.add(mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.004, 10), keyRimM, { x, y: y - 0.004, z, cast: false }));
  }
  tw.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 16), keep(std('#0e0e0e', 0.5)), { y: 0.15, z: -0.1, rz: Math.PI / 2 }));
  for (const s of [-1, 1]) tw.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), brassM, { x: s * 0.185, y: 0.15, z: -0.1, rz: Math.PI / 2 }));
  tw.add(mesh(new THREE.BoxGeometry(0.08, 0.008, 0.01), brassM, { x: 0.2, y: 0.16, z: -0.06, rz: 0.4 }));
  const paperC = TX.makeCanvas(256, 320);
  TF.drawTypewriterPaper(paperC, ['211 号住所', '住户：4 人', '自动机：老铁', '……']);
  const paperTex = TX.toTex(paperC, { wrap: false });
  const paperM = keep(new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color('#fff4e0'), emissiveMap: paperTex, emissiveIntensity: 0.06 }));
  const sheet = mesh(new THREE.PlaneGeometry(0.2, 0.25), paperM, { y: 0.27, z: -0.12, rx: -0.2, cast: false });
  tw.add(sheet);
  compact(tw, [sheet]);
  P(tw); mark('typewriter', tw);
  refs.typewriter = { group: tw, canvas: paperC, tex: paperTex, kbLocal: null };

  // ===== 12. 自动机「老铁」：坐在我的书桌前（凳子上） =====
  refs.stoolMe.position.set(0.95, 0, 0.25);
  const bot = new Automaton({ name: '老铁' });
  bot.root.position.set(0.95, 0, 0.25); bot.root.rotation.y = Math.PI / 2;
  P(bot.root); mark('automaton', bot.root);
  refs.automaton = bot;
  collision.boxes = collision.boxes.filter((b) => b.id !== 'stoolMe');
  block(0.72, 1.23, 0.02, 0.48, 'automaton');
  // 打字机键盘中心：换算到自动机自己的坐标系里
  bot.root.updateMatrixWorld(true); tw.updateMatrixWorld(true);
  refs.typewriter.kbLocal = bot.root.worldToLocal(tw.localToWorld(V(0, 0.08, 0.05)));

  // ===== 13. 灯 =====
  const L = refs.lights;
  L.hemi.color.set('#5e7290'); L.hemi.groundColor.set('#2e2824');
  // "太阳"：熔炉透过窗户照进来的一点橘光（带窗框的影子）
  L.sun.color.set('#ff9a52'); L.sun.position.set(0.9, 4.2, -26); L.sun.target.position.set(0, 0.4, 1.2); L.sun.intensity = 0.8;
  L.winLight.color.set('#8fa2c0'); L.winLight.position.z = -3.63;
  L.monLight.color.set('#ffae3a'); L.monLight.distance = 2.4; L.monLight.position.set(1.18, 1.35, 0.25); L.monLight.intensity = 0;
  L.wc.color.set('#a8bcdc');
  for (const s of L.ceilSpots) s.color.set('#ffd9a8');
  // 吊灯：两盏带铁丝罩的灯泡（开关控制）
  const bulbM = keep(new THREE.MeshStandardMaterial({ color: '#f4e2c0', emissive: new THREE.Color('#ffc27a'), emissiveIntensity: 0, roughness: 0.2 }));
  for (const z of [2.3, -1.6]) {
    const pend = new THREE.Group(); pend.position.set(0, 3.0, z);
    pend.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 5), keep(std('#111', 0.6)), { y: -0.25, cast: false }));
    pend.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.05, 10), ironM, { y: -0.52 }));
    pend.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), bulbM, { y: -0.58, s: [1, 1.3, 1], cast: false }));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pend.add(mesh(new THREE.TorusGeometry(0.065, 0.003, 4, 16, Math.PI), ironM, { y: -0.58, ry: a, cast: false })); }
    pend.add(mesh(new THREE.TorusGeometry(0.065, 0.004, 4, 18), ironM, { y: -0.58, rx: Math.PI / 2, cast: false }));
    compact(pend);
    P(pend);
  }
  L.tubeMats.length = 0; L.tubeMats.push(bulbM);
  for (const s of L.ceilSpots) s.position.y = 2.38;
  // 炉火：一盏从炉门往屋里打的聚光（带阴影，床架的影子投到东墙上）+ 一盏贴着炉子的暖光
  const stoveSpot = new THREE.SpotLight('#ff8a3a', 0, 9, 1.25, 0.9, 1.4);
  stoveSpot.position.set(-1.1, 0.45, 2.02); stoveSpot.target.position.set(1.5, 0.3, 2.0);
  stoveSpot.castShadow = true; stoveSpot.shadow.mapSize.set(1024, 1024);
  stoveSpot.shadow.bias = -0.0006; stoveSpot.shadow.normalBias = 0.02; stoveSpot.shadow.radius = 4;
  stoveSpot.shadow.camera.near = 0.1; stoveSpot.shadow.camera.far = 8;
  P(stoveSpot); P(stoveSpot.target);
  const stoveGlow = new THREE.PointLight('#ff7a30', 0, 3.2, 1.6); stoveGlow.position.set(-1.2, 0.6, 2.02); P(stoveGlow);
  const lantern = new THREE.PointLight('#ffa050', 1.6, 5, 1.5); lantern.position.set(0.62, 0.98, -3.22); P(lantern);
  refs.frostLights = { stoveSpot, stoveGlow, lantern, flame, flameM, bulbM, emberM };

  // ===== 14. 洗手间：水龙头下挂着冻住的水柱，花洒也冻住了，毛巾冻成了板 =====
  for (const w of refs.sink.streams) { w.visible = true; w.material = iceM; w.scale.set(1.3, 1, 1.3); }
  // 洗手间没有暖气：瓷砖、墙漆都冷下来（原来的"自发光"关掉，颜色压暗偏蓝）
  for (const m of Object.values(refs.wcMats)) { m.emissiveIntensity = 0.015; m.color.setRGB(0.62, 0.68, 0.78); }
  // 洗漱台上方的镜子也结了一层霜
  const wcM = refs.wcMirror;
  P(noRay(mesh(new THREE.PlaneGeometry(1.1, 0.56), keep(new THREE.MeshStandardMaterial({ map: TF.genMirrorFrost(), transparent: true, opacity: 0.9, roughness: 0.7, depthWrite: false })), { x: wcM.position.x, y: wcM.position.y, z: WR.z1 - 0.022, ry: Math.PI, cast: false, recv: false })));
  // 窗台里侧一溜雪、地漏旁边一小片冰
  P(mesh(new THREE.BoxGeometry(WW.x1 - WW.x0 + 0.06, 0.03, 0.12), snowM, { x: (WW.x0 + WW.x1) / 2, y: WW.y0 + 0.015, z: WR.z1 - 0.02, cast: false }));
  P(noRay(mesh(new THREE.CircleGeometry(0.42, 28), keep(std('#b8cce0', 0.05, 0, { transparent: true, opacity: 0.55, depthWrite: false })), { x: 0.3, y: 0.004, z: 5.9, rx: -Math.PI / 2, s: [1, 0.7, 1], cast: false })));
  add(props);

  // ===== 15. 全场结霜（自己建的写实材质、窗外、雪、冰不动）=====
  const skip = new Set();
  for (const g of [refs.outside.group, city.city]) g.traverse((o) => skip.add(o));
  const seen = new Set(clean);
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      chillMaterial(m);
    }
  });

  // ===== 16. 每帧：窗外的城市、雪、冰花背后的光、冰柱化、炉火 =====
  refs.updaters.push((dt, t) => {
    for (const s of refs.snow) s.U.time.value = t;
    city.update(dt, t, F.overdrive || 0);
    // 冰花背后透过来的熔炉光：窗户擦干净之后就没有了（不然隔着玻璃看出去一片橘红）
    backGlow.material.opacity = (0.4 + (F.overdrive || 0) * 0.4) * (0.92 + Math.sin(t * 3) * 0.05) * refs.windowFrost.glowK;
    backGlow.visible = refs.windowFrost.glowK > 0.01;
  });
}
