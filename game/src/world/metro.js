// 第四章：地铁 211 —— 2077 年，地面上已经住不了人，人都躲进了地铁站。宿舍成了站台边上的一间值班室。
//   写实电影感（参考《地铁》系列）：
//   · 墙：碎了一大片的米白色地铁瓷砖（露出水泥、天花板往下淌着黑色烟熏）+ 暗红色花岗岩墙裙；地板是裂了的灰色花岗岩；天花板是水泥 + 工字钢梁 + 一捆捆电缆；
//   · 窗外就是站台：两条轨道、站名墙"ОБЩЕЖИТИЕ · 211"、一节停在远处轨道上的老车厢（车身上有室友用粉笔画的"正"字）、
//     站台上的帐篷、沙袋、烧着火的油桶、两头黑洞洞的隧道口和一盏红色信号灯。站台的灯坏了，要摇手摇发电机才亮；
//   · 屋里：气密门（大杠杆门把 + 门上的数字密码盘）、门上方一盏红色应急灯、沙袋、五只弹药箱（其中一只是"热"的）、
//     我的书桌上的野战电话、盖革计数器、煤油灯，窗边书桌上的手摇发电机，床上一把吉他，杂物桌上的蜡烛神龛和烧水壶；
//   · 洗手间成了毒气间：绿色的毒雾、浮在半空里噼啪作响的"异常"，靠近它会看见墙上走过去一串影子；
//     洗手间的窗外是一条检修隧道，三只戴防毒面具的猴子会压着轨道车经过；
//   · 灯：红色应急灯、蜡烛、煤油灯、手电筒（F）；发电机摇起来以后，站台的钠灯从窗户里照进来（"太阳"那盏灯）
//     点光一共三盏（应急灯、蜡烛、煤油灯）：每多一盏，整间屋子每个像素都要多算一遍光照
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TM from '../core/tex_metro.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { Batch, compact } from './spacelook.js';

export function buildMetroTextures(B) {
  const T = {};
  T.floor = TM.genMetroFloor(); T.floorDirt = TM.genMetroGrime();
  const w = TM.genMetroWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  const c = TM.genMetroCeiling(); T.ceiling = c.map; T.ceilingN = c.normalMap;
  let s = 1;
  const du = (t, o = {}) => TM.dusty(t, { seed: s++, ...o });
  T.woodDark = du(B.woodDark, { dark: 0.62 });
  T.woodLight = du(B.woodLight, { dark: 0.6 });
  T.woodOrange = du(B.woodOrange, { dark: 0.58 });
  T.doorWood = du(B.doorWood, { dark: 0.58 });
  T.blackLaminate = du(B.blackLaminate, { dark: 0.9 });
  T.curtain = du(B.curtain, { dark: 0.6 });
  T.net = du(B.net, { dark: 0.8, dust: 2 });
  for (const k of ['grayCloth', 'pinkCloth', 'blackCloth', 'blueCloth', 'whiteCloth', 'bamboo', 'floral', 'polka', 'yellowDots', 'patternRoll']) T[k] = du(B[k], { dark: 0.62, dust: 8 });
  T.cardboard = du(B.cardboard, { dark: 0.6 }); T.cardboard350 = du(B.cardboard350, { dark: 0.6 });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.windowView = B.windowView;
  T.clockFace = du(B.clockFace, { dark: 0.75, wrap: false });
  T.mousepad = du(B.mousepad, { dark: 0.8, wrap: false });
  return T;
}

// 五只弹药箱摆在哪（x, z, 朝向）
export const CRATES = [[-0.92, 2.15, 0.1], [1.05, 2.62, 1.45], [0.6, -2.2, 0.25], [-1.1, -1.02, 1.62], [1.28, -1.72, 1.57]];
export const ANOMALY = new THREE.Vector3(0.35, 1.3, 5.55); // 洗手间里浮着的"异常"

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
const noRay = (o) => { o.traverse((c) => { c.userData.noRay = true; if (c.isMesh || c.isSprite || c.isPoints || c.isLine || c.isLineSegments) c.raycast = () => {}; }); return o; };
const cylBetween = (a, b, r, seg = 12) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};
const sagCurve = (a, b, sag, n = 12) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
  return new THREE.CatmullRomCurve3(pts);
};
const softTex = (() => {
  const cache = {};
  return (kind = 'glow') => {
    if (cache[kind]) return cache[kind];
    const S = 128, c = TX.makeCanvas(S, S), g = c.getContext('2d');
    if (kind === 'glow') {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,245,225,0.7)'); gr.addColorStop(0.55, 'rgba(255,230,190,0.14)'); gr.addColorStop(1, 'rgba(255,220,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    } else {
      // 一团毒雾：几个软圆叠在一起
      const rnd = mulberry32(4401);
      for (let k = 0; k < 14; k++) {
        const x = 30 + rnd() * 68, y = 30 + rnd() * 68, r = 18 + rnd() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
      }
    }
    cache[kind] = TX.toTex(c, { wrap: false });
    return cache[kind];
  };
})();
const glowSprite = (color, size, op = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex('glow'), color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(size, size, 1);
  return noRay(s);
};
// 站台上的东西：真的被灯照着（"太阳"那盏灯 + 火桶的点光），另外自己带一点点底光，灯灭的时候不至于一片死黑
//   站台的钠灯挂在站台上方、朝着车厢那边照——和从窗户照进屋里的那盏"太阳"方向相反，所以站台上的东西被灯照亮的那一下，
//   用"自发光"一起调亮（buildPlatform 的 update 里按 K 调 emissiveIntensity）
const LIT = [];
const lit = (c, rough = 0.8, metal = 0, k = 0.03, extra = {}) => {
  const m = std(c, rough, metal, { emissive: new THREE.Color(c).multiplyScalar(k), emissiveIntensity: 1, ...extra });
  if (m.map) m.emissiveMap = m.map;
  LIT.push(m);
  return m;
};

// ---------- 落满了灰：旧材质去饱和、压暗；朝上的面蒙一层灰，越往上越黑（烟熏）----------
const DUST_FUNCS = /* glsl */ `
varying vec3 vDW;
float dh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh(i), dh(i + vec3(1, 0, 0)), f.x), mix(dh(i + vec3(0, 1, 0)), dh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dh(i + vec3(0, 0, 1)), dh(i + vec3(1, 0, 1)), f.x), mix(dh(i + vec3(0, 1, 1)), dh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const DUST_APPLY = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float n1 = dn(vDW * 2.6), n2 = dn(vDW * 9.0 + 3.0), n3 = dn(vDW * 33.0);
  float up = smoothstep(0.45, 0.9, wn.y) * smoothstep(0.02, 0.08, vDW.y);
  float dust = clamp(up * (0.35 + n1 * 0.4) + (n3 - 0.5) * 0.1, 0.0, 0.65);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.31, 0.27) * (0.8 + n2 * 0.4), dust);
  roughnessFactor = mix(roughnessFactor, 0.95, dust);
  float soot = smoothstep(2.0, 2.95, vDW.y) * (0.4 + n1 * 0.5);
  diffuseColor.rgb *= 1.0 - soot * 0.55;
  diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.9, n1 * 0.6 + n2 * 0.4) * 0.3;
}`;
function dustify(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 dw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        dw = instanceMatrix * dw;
        #endif
        vDW = (modelMatrix * dw).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${DUST_FUNCS}`)
      .replace('#include <normal_fragment_maps>', DUST_APPLY);
  };
  m.customProgramCacheKey = () => 'dust211';
  m.needsUpdate = true;
}
const _hsl = {};
function dustMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.dust) return;
  m.userData.dust = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * 0.5, Math.min(0.5, _hsl.l * 0.7 + 0.01));
  } else m.color.multiplyScalar(0.9);
  if (m.metalness > 0.45) m.roughness = Math.max(m.roughness, 0.5);
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.45;
  if (m.emissive && m.emissiveIntensity > 0 && !m.emissiveMap) m.emissiveIntensity *= 0.3;
  if (!m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) dustify(m);
}

// ================= 窗外：站台 =================
//   相机的远裁剪面是 60m；站台上的东西都在 30m 以内
function buildPlatform(T, rnd) {
  LIT.length = 0;
  const P = new THREE.Group(); P.name = 'metroPlatform';
  P.userData.noAO = true;
  const I4 = new THREE.Matrix4();
  // 站台地面（花岗岩，和屋里一样的地砖）
  const pf = T.floor.map.clone(); pf.repeat.set(26, 3); pf.needsUpdate = true;
  const platM = lit('#8a847a', 0.8, 0, 0.02, { map: pf });
  P.add(mesh(new THREE.BoxGeometry(34, 0.3, 3.44), platM, { y: -0.15, z: -5.48, cast: false }));
  P.add(mesh(new THREE.BoxGeometry(34, 0.02, 0.28), lit('#a8902a', 0.6, 0, 0.05), { y: 0.005, z: -7.04, cast: false })); // 站台边上的黄线
  P.add(mesh(new THREE.BoxGeometry(34, 1.1, 0.1), lit('#3a3630', 0.9), { y: -0.55, z: -7.2, cast: false })); // 站台侧壁
  // 轨道：道床、枕木、钢轨、第三轨
  P.add(mesh(new THREE.BoxGeometry(34, 0.1, 6.6), lit('#2a2622', 1), { y: -1.15, z: -10.5, cast: false }));
  const tb = new Batch();
  const sleeperM = lit('#3a2e24', 0.9), railM = lit('#6a6a64', 0.35, 0.8, 0.04);
  for (const zc of [-8.8, -12.0]) {
    for (let x = -17; x < 17; x += 0.6) tb.add(new THREE.BoxGeometry(0.22, 0.12, 2.4), sleeperM, I4.makeTranslation(x, -1.05, zc));
    for (const s of [-0.76, 0.76]) tb.add(new THREE.BoxGeometry(34, 0.14, 0.07), railM, I4.makeTranslation(0, -0.93, zc + s));
    tb.add(new THREE.BoxGeometry(34, 0.1, 0.12), lit('#4a4a44', 0.6, 0.5), I4.makeTranslation(0, -0.9, zc - 1.4));
  }
  tb.build(P, { cast: false, name: 'tracks' });
  // 远处的墙：瓷砖 + 站名；天花板
  const wm = T.wall.clone(); wm.repeat.set(17, 1.8); wm.needsUpdate = true;
  P.add(mesh(new THREE.PlaneGeometry(34, 6), lit('#b8b0a0', 0.85, 0, 0.02, { map: wm }), { y: 1.9, z: -13.8, cast: false }));
  const plaque = mesh(new THREE.PlaneGeometry(8, 2), lit('#ffffff', 0.5, 0.3, 0.04, { map: TM.genMetroSign('station') }), { x: 0.5, y: 3.4, z: -13.75, cast: false });
  P.add(plaque);
  P.add(mesh(new THREE.PlaneGeometry(34, 10.2), lit('#2a2824', 1), { y: 4.8, z: -8.7, rx: Math.PI / 2, cast: false }));
  // 柱子（站台边上一排）
  const colM = lit('#8a7e6e', 0.35, 0.05, 0.03);
  for (const x of [-9, -4.6, 4.6, 9]) {
    P.add(mesh(new THREE.BoxGeometry(0.9, 4.8, 0.9), colM, { x, y: 2.4, z: -6.4 }));
    P.add(mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), lit('#5a5048', 0.6), { x, y: 4.65, z: -6.4 }));
  }
  // 两头的隧道口 + 红色信号灯
  for (const s of [-1, 1]) {
    P.add(mesh(new THREE.PlaneGeometry(0.1, 0.1), lit('#000', 1), { x: s * 16.9, y: 1.2, z: -10.5, ry: -s * Math.PI / 2, cast: false }));
    const arch = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.4, 24, 1, true, 0, Math.PI), lit('#1a1814', 1, 0, 0, { side: THREE.DoubleSide }), { x: s * 16.8, y: 1.0, z: -10.5, rz: Math.PI / 2, ry: 0, cast: false });
    P.add(arch);
    const sig = glowSprite('#ff2a1a', 0.7, 0.9); sig.position.set(s * 15.5, 1.6, -13.4); P.add(sig);
  }
  // 远处轨道上那节老车厢
  const train = new THREE.Group(); train.position.set(1.2, 0, -12.0); P.add(train);
  const sideTex = TM.genTrainSide();
  const bodyM = lit('#5a6a70', 0.6, 0.35, 0.03);
  train.add(mesh(new THREE.BoxGeometry(19, 3.0, 2.7), bodyM, { y: 1.0, cast: false }));
  train.add(mesh(new THREE.PlaneGeometry(19, 3.0), lit('#ffffff', 0.6, 0.3, 0.03, { map: sideTex }), { y: 1.0, z: 1.352, cast: false }));
  train.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 19, 20, 1, false, 0, Math.PI), bodyM, { y: 2.5, rz: Math.PI / 2, s: [1, 1, 0.25], cast: false }));
  for (const x of [-6.5, 6.5]) train.add(mesh(new THREE.BoxGeometry(2.4, 0.7, 2.2), lit('#1a1a18', 0.8, 0.4), { x, y: -0.65, cast: false })); // 转向架
  // 粉笔"正"字
  const tallyC = TX.makeCanvas(512, 256);
  const tallyTex = TX.toTex(tallyC, { wrap: false });
  const tallyM = new THREE.MeshStandardMaterial({ map: tallyTex, transparent: true, roughness: 0.95, depthWrite: false, emissive: new THREE.Color('#ffffff'), emissiveMap: tallyTex, emissiveIntensity: 0.04 });
  const tally = mesh(new THREE.PlaneGeometry(2.6, 1.3), tallyM, { x: -0.65, y: 1.05, z: 1.36, cast: false }); // 世界 x ≈ 0.55：窗户右半扇正对着（左半扇钉了木板、中间有窗框）
  train.add(tally);
  // 帐篷、沙袋、火桶
  const tentM = lit('#4a4a36', 0.95, 0, 0.03), bagM = lit('#6a5a40', 0.95, 0, 0.03);
  for (const [x, z, s] of [[-6.8, -4.9, 1], [6.4, -5.0, 0.9], [-12, -5.1, 1.1]]) {
    const tent = new THREE.Group(); tent.position.set(x, 0, z); tent.scale.setScalar(s); P.add(tent);
    const tg = new THREE.CylinderGeometry(0.01, 1.2, 1.5, 4, 1); tg.rotateY(Math.PI / 4);
    tent.add(mesh(tg, tentM, { y: 0.75, s: [1.4, 1, 1], cast: false }));
    tent.add(mesh(new THREE.PlaneGeometry(0.6, 0.9), lit('#0a0806', 1), { y: 0.45, z: 0.86, rx: -0.5, cast: false }));
  }
  const bb = new Batch();
  for (let k = 0; k < 14; k++) { const x = -1.9 + (k % 7) * 0.58 + (Math.floor(k / 7) % 2) * 0.29, y = 0.14 + Math.floor(k / 7) * 0.24; bb.add(new THREE.CapsuleGeometry(0.13, 0.32, 4, 8), bagM, I4.compose(V(x, y, -6.78), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.2)), V(1, 1, 0.8))); }
  bb.build(P, { cast: false, name: 'sandbags' });
  const barrel = new THREE.Group(); barrel.position.set(-3.1, 0, -5.4); P.add(barrel);
  barrel.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), lit('#3a2a1e', 0.7, 0.5, 0.12), { y: 0.45, cast: false }));
  const fireGlow = glowSprite('#ff8a3a', 1.6, 0.9); fireGlow.position.set(0, 1.05, 0); barrel.add(fireGlow);
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.0, 0.3), toneMapped: false, transparent: true, opacity: 0.85 });
  const flames = [0, 1, 2].map((k) => { const f = mesh(new THREE.ConeGeometry(0.1, 0.4, 8), flameM, { x: (k - 1) * 0.1, y: 1.0, cast: false }); barrel.add(f); return f; });
  // 火桶不单独点一盏灯：一盏点光要把整间屋子每个像素都多算一遍（实测 1.9ms / 帧），火光只照得到桶边上那一小块，用光晕 + 火苗就够了
  // 灯串：柱子之间拉着的电线上挂着一串灯泡（发电机摇起来才亮）
  const bulbM = new THREE.MeshStandardMaterial({ color: '#3a3020', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0, roughness: 0.3 });
  const wireM = lit('#101010', 0.7);
  const bulbs = [];
  const xs = [-16, -9, -4.6, 4.6, 9, 16];
  for (let k = 0; k < xs.length - 1; k++) {
    const a = V(xs[k], 3.9, -6.4), b = V(xs[k + 1], 3.9, -6.4);
    const curve = sagCurve(a, b, 0.9, 16);
    P.add(mesh(new THREE.TubeGeometry(curve, 24, 0.012, 4), wireM, { cast: false }));
    for (let t = 0.15; t < 0.9; t += 0.24) { const p = curve.getPoint(t); P.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbM, { x: p.x, y: p.y - 0.08, z: p.z, cast: false })); const g = glowSprite('#ffb060', 0.8, 0); g.position.set(p.x, p.y - 0.08, p.z); P.add(g); bulbs.push(g); }
  }
  // 站台上方挂着的钠灯（发电机摇起来才亮）
  const sodiumM = new THREE.MeshStandardMaterial({ color: '#2a2016', emissive: new THREE.Color('#ffa040'), emissiveIntensity: 0, roughness: 0.4 });
  const floods = [];
  for (const x of [-6.8, -2.3, 2.3, 6.8]) {
    P.add(mesh(new THREE.BoxGeometry(0.8, 0.12, 0.3), lit('#2a2a26', 0.5, 0.6), { x, y: 4.4, z: -5.2, cast: false }));
    P.add(mesh(new THREE.BoxGeometry(0.7, 0.03, 0.22), sodiumM, { x, y: 4.33, z: -5.2, cast: false }));
    const g = glowSprite('#ffa048', 2.6, 0); g.position.set(x, 4.2, -5.2); P.add(g); floods.push(g);
  }
  // 幽灵列车：近处那条轨道上，平时藏着
  const ghost = new THREE.Group(); ghost.visible = false; ghost.position.set(-60, 0, -8.8); P.add(ghost);
  const gM = lit('#3a4448', 0.5, 0.4, 0.05), winM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.9), toneMapped: false });
  for (let k = 0; k < 3; k++) {
    const car = new THREE.Group(); car.position.x = -k * 19.6; ghost.add(car);
    car.add(mesh(new THREE.BoxGeometry(19, 3.0, 2.7), gM, { y: 1.0, cast: false }));
    for (let w = 0; w < 6; w++) car.add(mesh(new THREE.PlaneGeometry(1.1, 0.8), winM, { x: -7.5 + w * 3, y: 1.4, z: 1.36, cast: false }));
  }
  for (const s of [-0.7, 0.7]) { const hl = glowSprite('#fff4dc', 2.4, 1); hl.position.set(9.6, 0.4, s); ghost.add(hl); }
  const litMats = LIT.slice();
  let lastK = -1;
  return {
    group: P, tally: { canvas: tallyC, tex: tallyTex, mat: tallyM, mesh: tally }, train, ghost, bulbs, floods, bulbM, sodiumM, fireGlow, flames, platM,
    update(dt, t, K) {
      if (Math.abs(K - lastK) > 0.002) { lastK = K; for (const m of litMats) m.emissiveIntensity = 1 + K * 9; }
      const fl = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23 + 1) * 0.05 + (Math.random() - 0.5) * 0.08;
      fireGlow.material.opacity = 0.75 * fl;
      flames.forEach((f, i) => { f.scale.set(1, 0.8 + Math.sin(t * 13 + i * 2) * 0.25, 1); f.position.x = (i - 1) * 0.1 + Math.sin(t * 7 + i) * 0.02; });
      for (const b of bulbs) b.material.opacity = K * 0.85;
      for (const f of floods) f.material.opacity = K * 0.7;
      bulbM.emissiveIntensity = K * 2.2; sodiumM.emissiveIntensity = K * 3;
      tallyM.emissiveIntensity = 0.04 + K * 0.32;
    },
  };
}

// ================= 洗手间窗外：检修隧道 + 三只戴防毒面具的猴子压着轨道车经过 =================
function makeMonkey(maskM, coatM) {
  const fur = std('#4a3424', 0.95, 0, { emissive: new THREE.Color('#4a3424').multiplyScalar(0.25) });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.12, 0.2, 6, 12), coatM, { cast: false }));
  const head = new THREE.Group(); head.position.y = 0.28; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.1, 18, 14), fur, { cast: false }));
  // 防毒面具：面罩 + 两只圆镜片 + 一只滤罐
  head.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), maskM, { y: -0.01, z: 0.05, s: [1, 1, 0.7], cast: false }));
  for (const s of [-1, 1]) head.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 14), std('#8a9a9a', 0.1, 0.6, { emissive: new THREE.Color('#3a4a4a') }), { x: s * 0.034, y: 0.015, z: 0.1, rx: Math.PI / 2, cast: false }));
  head.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), std('#3a4a2a', 0.6, 0, { emissive: new THREE.Color('#1a2214') }), { y: -0.07, z: 0.12, rx: 1.2, cast: false }));
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), fur, { x: s * 0.1, y: 0.01, s: [0.55, 1, 1], cast: false }));
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.13, 0.12, 0); body.add(sh);
    sh.add(mesh(new THREE.CapsuleGeometry(0.035, 0.2, 5, 8), coatM, { y: -0.12, cast: false }));
    sh.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), fur, { y: -0.25, cast: false }));
    arms.push(sh);
  }
  return { root, body, head, arms };
}
export function buildMetroOutside() {
  const group = new THREE.Group(); group.name = 'metroOutside';
  group.userData.noAO = true;
  const WZ = 6.46, ZC = 8.9; // 洗手间后墙外表面 / 隧道中心线
  // 隧道：一圈圈铸铁管片（半个圆筒 + 一道道法兰）
  const tubM = std('#2a2826', 0.7, 0.5, { side: THREE.BackSide, emissive: new THREE.Color('#141210') });
  const tun = mesh(new THREE.CylinderGeometry(2.4, 2.4, 30, 24, 1, true), tubM, { y: 1.6, z: ZC, rz: Math.PI / 2, cast: false });
  group.add(tun);
  const rb = new Batch(), I4 = new THREE.Matrix4();
  const ringM = std('#1e1c1a', 0.6, 0.5, { emissive: new THREE.Color('#0e0c0a') });
  for (let x = -14; x <= 14; x += 1.0) { const g = new THREE.TorusGeometry(2.36, 0.05, 6, 24); g.rotateY(Math.PI / 2); rb.add(g, ringM, I4.makeTranslation(x, 1.6, ZC)); }
  for (const s of [-0.62, 0.62]) rb.add(new THREE.BoxGeometry(30, 0.1, 0.06), std('#5a5a54', 0.35, 0.8, { emissive: new THREE.Color('#1a1a18') }), I4.makeTranslation(0, -0.55, ZC + s));
  for (let x = -14; x < 14; x += 0.6) rb.add(new THREE.BoxGeometry(0.2, 0.08, 1.8), std('#2a2018', 0.9, 0, { emissive: new THREE.Color('#0e0a08') }), I4.makeTranslation(x, -0.66, ZC));
  rb.build(group, { cast: false, name: 'tunnelRings' });
  group.add(mesh(new THREE.BoxGeometry(30, 0.2, 4), std('#1a1814', 1, 0, { emissive: new THREE.Color('#0a0908') }), { y: -0.8, z: ZC, cast: false }));
  // 轨道车 + 三只猴子
  const cart = new THREE.Group(); cart.position.set(-9, -0.45, ZC); cart.visible = false; group.add(cart);
  const cartM = std('#5a4030', 0.7, 0.3, { emissive: new THREE.Color('#2a1e16') });
  cart.add(mesh(new THREE.BoxGeometry(2.2, 0.12, 1.5), cartM, { y: 0.3, cast: false }));
  for (const x of [-0.8, 0.8]) for (const z of [-0.62, 0.62]) cart.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), std('#2a2a28', 0.5, 0.7, { emissive: new THREE.Color('#141412') }), { x, y: 0.16, z, rx: Math.PI / 2, cast: false }));
  const pumpBar = new THREE.Group(); pumpBar.position.set(0, 0.95, 0); cart.add(pumpBar);
  cart.add(mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), cartM, { y: 0.65, cast: false }));
  pumpBar.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 0.06), std('#3a3a36', 0.5, 0.6, { emissive: new THREE.Color('#1a1a18') }), { cast: false }));
  const head = glowSprite('#fff0d0', 1.2, 1); head.position.set(1.15, 0.6, 0); cart.add(head);
  cart.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, 1.4), toneMapped: false }), { x: 1.12, y: 0.6, cast: false }));
  const maskM = std('#2a2e2a', 0.6, 0, { emissive: new THREE.Color('#141614') }), coatM = std('#4a4a3a', 0.9, 0, { emissive: new THREE.Color('#22221a') });
  const monkeys = [0, 1, 2].map((i) => { const m = makeMonkey(maskM, coatM); m.root.position.set((i - 1) * 0.55, 0.52, (i === 1 ? -0.25 : 0.1)); m.root.rotation.y = Math.PI; cart.add(m.root); return m; });
  const state = { t: 0, dur: 0 };
  const POSE = [[[-2.6, 0, 0.35], [-2.6, 0, -0.35]], [[-1.6, 0, 1.9], [-1.6, 0, -1.9]], [[-2.2, 0, 0.18], [-2.2, 0, -0.18]]];
  return {
    group,
    trigger(dur = 5) { state.t = 0; state.dur = dur; },
    get busy() { return state.t < state.dur; },
    update(dt, t) {
      state.t += dt;
      const on = state.t < state.dur;
      cart.visible = on;
      if (!on) return;
      const k = state.t / state.dur;
      // 从左边隧道深处压过来，在窗前放慢、摆个造型，再往右边压走
      const e = k < 0.5 ? smoothstep(0, 0.5, k) * 0.5 : 0.5 + smoothstep(0.5, 1, k) * 0.5;
      cart.position.x = lerp(-8, 8, e);
      pumpBar.rotation.z = Math.sin(t * 7) * 0.35 * (Math.abs(k - 0.5) > 0.12 ? 1 : 0.2);
      const pose = clamp(1 - Math.abs(k - 0.5) / 0.14, 0, 1);
      monkeys.forEach((m, i) => {
        const P = POSE[i];
        m.arms.forEach((a, s) => { a.rotation.set(lerp(-1.4 + Math.sin(t * 7) * 0.3, P[s][0], pose), 0, lerp(0, P[s][2], pose)); });
        m.head.rotation.y = Math.sin(t * 2 + i) * 0.2 * (1 - pose);
      });
    },
  };
}

// ================= 墙上走过去的影子（剪影贴图）=================
function genShadowPerson(seed) {
  const W = 128, H = 256, c = TX.makeCanvas(W, H), g = c.getContext('2d'), rnd = mulberry32(seed);
  g.fillStyle = '#000';
  const cx = W / 2, pack = rnd() < 0.6, lean = (rnd() - 0.5) * 6;
  g.beginPath(); g.ellipse(cx + lean, 34, 15, 18, 0, 0, 6.28); g.fill(); // 头（戴着帽子 / 兜帽）
  if (rnd() < 0.5) { g.beginPath(); g.ellipse(cx + lean, 22, 20, 8, 0, 0, 6.28); g.fill(); }
  g.beginPath(); g.moveTo(cx - 26, 58); g.quadraticCurveTo(cx, 48, cx + 26, 58); g.lineTo(cx + 22, 150); g.lineTo(cx - 22, 150); g.closePath(); g.fill(); // 身子（大衣）
  if (pack) { g.beginPath(); g.ellipse(cx - 24, 96, 14, 30, 0, 0, 6.28); g.fill(); } // 背包
  // 腿：迈着步
  g.lineCap = 'round'; g.strokeStyle = '#000'; g.lineWidth = 16;
  g.beginPath(); g.moveTo(cx - 8, 146); g.lineTo(cx - 20, 240); g.stroke();
  g.beginPath(); g.moveTo(cx + 8, 146); g.lineTo(cx + 18, 240); g.stroke();
  // 胳膊
  g.lineWidth = 11;
  g.beginPath(); g.moveTo(cx - 20, 66); g.lineTo(cx - 30, 140); g.stroke();
  g.beginPath(); g.moveTo(cx + 20, 66); g.lineTo(cx + 34, 132); g.stroke();
  if (rnd() < 0.5) { g.lineWidth = 5; g.beginPath(); g.moveTo(cx + 30, 110); g.lineTo(cx + 60, 60); g.stroke(); } // 扛着的枪 / 棍子
  // 边缘虚一点：影子不是硬的
  g.globalCompositeOperation = 'destination-in';
  g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  return TX.toTex(c, { wrap: false });
}

// ================= 装修值班室 =================
export function decorateMetro(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, LAYOUT } = ctx;
  const { SZ, WR, DOOR, WW } = LAYOUT;
  const rnd = mulberry32(4040);
  const props = new THREE.Group(); props.name = 'metroProps';
  const P = (o) => { props.add(o); return o; };
  const clean = new Set();
  const keep = (m) => { m.userData.dust = true; clean.add(m); return m; };
  const I4 = new THREE.Matrix4();
  refs.metro = {};

  // ===== 0. 收拾：电子产品、空调、日光灯、窗帘；原来的篮子、纸箱让给弹药箱 =====
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.view.visible = false;
  refs.curtain.left.visible = false; refs.curtain.right.visible = false; refs.curtainRod.visible = false;
  for (const o of [refs.sticky, refs.studentId, refs.phone, refs.monitor.group, refs.keyboard, refs.mouse, refs.tower, refs.strip, refs.monitor2, refs.headset, refs.ac, refs.remote, refs.helmet, refs.stoolH, refs.broom, refs.pinkBag, refs.latiao, refs.farLamp, refs.basket, refs.calendar.group]) if (o) o.visible = false;
  root.traverse((o) => { if (o.userData.iid === 'box350') o.visible = false; });
  for (const fx of refs.fixtures) fx.visible = false;
  refs.lock.group.visible = false; refs.lock.dropped.visible = false;
  collision.setEnabled('lockCable', false);
  const D1 = refs.desks.D1, D2 = refs.desks.D2;
  for (const c of D1.children) if (c.isMesh && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.x - 0.26) < 0.01) c.visible = false;
  if (D2) for (const c of D2.children) if (Math.abs(c.position.x + 0.05) < 0.01 && Math.abs(c.position.z - 0.1) < 0.01) c.visible = false;
  collision.boxes = collision.boxes.filter((b) => !(Math.abs(b.minX + 1.0) < 1e-6 && Math.abs(b.minZ - 2.05) < 1e-6) && !(Math.abs(b.minX - 0.36) < 1e-6 && Math.abs(b.minZ + 2.42) < 1e-6));
  for (const o of refs.sections.far) { const p = o.position; if (p.y > 0.7 && p.x > 0.15 && p.z > -3.35) o.visible = false; }
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh && rnd() < 0.5) o.visible = false; });
  refs.gap.line.color.set('#3a2a20');

  // ===== 1. 墙 / 天花板 / 地板 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(1.0, 1.0), envMapIntensity: 0.6 });
  M.wall.needsUpdate = true;
  T.ceiling.repeat.set(3.6, 8.1); T.ceilingN.repeat.set(3.6, 8.1);
  Object.assign(M.ceiling, { normalMap: T.ceilingN, roughness: 0.95, envMapIntensity: 0.2 }); M.ceiling.needsUpdate = true;
  M.floor.normalScale.set(1, 1); M.floor.envMapIntensity = 0.5;
  M.floorDirt.polygonOffsetFactor = -2;
  keep(M.wall); keep(M.ceiling); keep(M.floor); keep(M.floorDirt);
  root.traverse((o) => { if (o.isMesh && o.material === M.ceiling) o.castShadow = true; }); // 站台的灯只该从窗户照进来

  // ===== 2. 天花板：工字钢梁、电缆、管子 =====
  const steelM = keep(std('#2a2826', 0.6, 0.6));
  const cb = new Batch();
  for (const z of [-2.2, 0.4, 3.0]) {
    cb.add(new THREE.BoxGeometry(3.6, 0.22, 0.02), steelM, I4.makeTranslation(0, 2.89, z));
    for (const y of [2.79, 2.99]) cb.add(new THREE.BoxGeometry(3.6, 0.02, 0.14), steelM, I4.makeTranslation(0, y, z));
  }
  const cableCols = ['#141414', '#1e1a16', '#2a2016', '#16161a', '#201c18', '#3a2a1a'];
  for (let k = 0; k < 6; k++) {
    for (const side of [-1, 1]) {
      const x = side * (1.7 - k * 0.022), y = 2.7 - k * 0.018;
      cb.add(cylBetween(V(x, y, -3.55), V(x, y, 4.4), 0.009 + (k % 3) * 0.003, 6), keep(std(cableCols[k], 0.7)), I4.identity());
    }
  }
  for (let z = -3.2; z < 4.4; z += 0.5) for (const s of [-1, 1]) cb.add(new THREE.BoxGeometry(0.1, 0.1, 0.02), steelM, I4.makeTranslation(s * 1.72, 2.68, z));
  cb.add(cylBetween(V(-1.62, 2.55, -3.55), V(-1.62, 2.55, 3.5), 0.06, 14), keep(std('#3a3a34', 0.5, 0.6)), I4.identity());
  cb.build(props, { cast: false, name: 'ceilingSteel' });
  // 从天花板垂下来的几根电线（有一根头上接着一只光秃秃的灯泡，开关控制）
  for (const [x, z, len] of [[0.6, -0.6, 0.5], [-0.3, 1.9, 0.35], [0.2, 3.6, 0.6]]) P(mesh(new THREE.TubeGeometry(sagCurve(V(x, 2.99, z), V(x + 0.3, 2.99, z + 0.4), len, 10), 16, 0.006, 4), keep(std('#141414', 0.7)), { cast: false }));

  // ===== 3. 窗户：铁框 + 铁丝夹心玻璃，一边钉了两块木板 =====
  const winM = keep(std('#2a2a26', 0.5, 0.6));
  refs.win.traverse((o) => { if (o.isMesh && o.material === M.alu) o.material = winM; });
  if (refs.glassPane) refs.glassPane.material = keep(new THREE.MeshStandardMaterial({ map: TM.genWireGlass(), transparent: true, roughness: 0.3, metalness: 0.2, depthWrite: false }));
  const boards = new Batch(), plankM = keep(std('#4a3a28', 0.85, 0, { map: T.woodDark }));
  for (const [y, r] of [[1.45, 0.08], [2.02, -0.06]]) boards.add(new THREE.BoxGeometry(1.25, 0.14, 0.025), plankM, I4.compose(V(-0.68, y, -3.56), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, r)), V(1, 1, 1)));
  boards.build(props, { cast: true, name: 'boards' });
  for (const [x, y] of [[-1.2, 1.5], [-0.16, 1.4], [-1.18, 2.08], [-0.2, 1.96]]) P(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), keep(std('#6a6a60', 0.4, 0.8)), { x, y, z: -3.545, rx: Math.PI / 2, cast: false }));

  // ===== 4. 窗外：站台 =====
  const plat = buildPlatform(T, rnd);
  add(plat.group);
  refs.platform = plat;

  // ===== 5. 气密门：钢门 + 杠杆门把 + 门上的数字密码盘 =====
  const dp = refs.door.pivot, DW = DOOR.z1 - DOOR.z0 - 0.02;
  const doorSteel = keep(std('#3a4238', 0.6, 0.45));
  refs.door.slab.material = doorSteel;
  for (const c of dp.children) if (c !== refs.door.slab) c.visible = false;
  const rb = new Batch();
  rb.add(new THREE.BoxGeometry(DW - 0.08, 0.04, 0.03), doorSteel, I4.makeTranslation(-DW / 2, 0.08, -0.034));
  rb.add(new THREE.BoxGeometry(DW - 0.08, 0.04, 0.03), doorSteel, I4.makeTranslation(-DW / 2, 1.96, -0.034));
  for (const x of [-0.06, -(DW - 0.06)]) rb.add(new THREE.BoxGeometry(0.04, 1.9, 0.03), doorSteel, I4.makeTranslation(x, 1.02, -0.034));
  rb.add(new THREE.BoxGeometry(0.03, 1.8, 0.03), doorSteel, I4.makeTranslation(-DW / 2, 1.02, -0.034));
  for (let k = 0; k < 10; k++) rb.add(new THREE.SphereGeometry(0.008, 6, 4), doorSteel, I4.makeTranslation(-0.06 - (k % 5) * ((DW - 0.12) / 4), k < 5 ? 0.12 : 1.92, -0.052));
  rb.build(dp, { cast: true, name: 'doorRibs' }).forEach((m) => mark('door', m));
  // 杠杆门把：一根粗铁杠，锁着的时候平放，开的时候往上掰
  const lev = new THREE.Group(); lev.position.set(-(DW - 0.1), 1.05, -0.06); dp.add(lev);
  lev.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 14), keep(std('#5a5a54', 0.45, 0.7)), { rx: Math.PI / 2 }));
  lev.add(mesh(new THREE.BoxGeometry(0.46, 0.04, 0.035), keep(std('#8a1a14', 0.6, 0.3)), { x: 0.22, z: -0.02 }));
  mark('door', lev);
  // 数字密码盘：一块旧键盘、一个红色数码管小屏
  const pad = new THREE.Group(); pad.position.set(-(DW - 0.12), 1.42, -0.05); dp.add(pad);
  pad.add(mesh(new THREE.BoxGeometry(0.13, 0.18, 0.035), keep(std('#1e201c', 0.5, 0.4))));
  const lcdC = TX.makeCanvas(128, 48), lcdTex = TX.toTex(lcdC, { wrap: false });
  const lcdM = keep(new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
  pad.add(mesh(new THREE.PlaneGeometry(0.1, 0.035), lcdM, { y: 0.058, z: -0.0185, ry: Math.PI, cast: false }));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) pad.add(mesh(new THREE.BoxGeometry(0.026, 0.02, 0.01), keep(std('#8a8a80', 0.5, 0.3)), { x: -0.032 + c * 0.032, y: 0.02 - r * 0.027, z: -0.02, cast: false }));
  mark('door', pad);
  dp.add(mesh(new THREE.PlaneGeometry(0.34, 0.13), keep(new THREE.MeshStandardMaterial({ map: TM.genMetroSign('hermetic'), roughness: 0.8 })), { x: -DW / 2, y: 1.72, z: -0.052, ry: Math.PI, cast: false }));
  const drawLcd = (text, color = '#ff3a1a') => {
    const g = lcdC.getContext('2d');
    g.fillStyle = '#140604'; g.fillRect(0, 0, 128, 48);
    g.fillStyle = color; g.font = `bold 26px ${TM.STENCIL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 8; g.fillText(text, 64, 26); g.shadowBlur = 0;
    lcdTex.needsUpdate = true;
  };
  drawLcd('ЗАКРЫТО');
  refs.metroLock = { lever: lev, pad, drawLcd };
  // 门上方的红色应急灯（带铁罩）
  const emerg = new THREE.Group(); emerg.position.set(-1.72, 2.36, (DOOR.z0 + DOOR.z1) / 2);
  emerg.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), steelM));
  const redM = keep(new THREE.MeshStandardMaterial({ color: '#3a0804', emissive: new THREE.Color('#ff2010'), emissiveIntensity: 2.2, roughness: 0.3 }));
  emerg.add(mesh(new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), redM, { x: 0.05, rz: -Math.PI / 2, cast: false }));
  for (let k = 0; k < 3; k++) emerg.add(mesh(new THREE.TorusGeometry(0.065, 0.004, 4, 14, Math.PI), steelM, { x: 0.05, rx: (k / 3) * Math.PI, ry: Math.PI / 2, cast: false }));
  compact(emerg);
  P(emerg);
  const redLight = new THREE.PointLight('#ff3018', 1.25, 5.5, 1.6); redLight.position.set(-1.55, 2.3, (DOOR.z0 + DOOR.z1) / 2); P(redLight);

  // ===== 6. 弹药箱：五只，刷着编号；其中一只"热"（里面是一小块会发光的东西）=====
  const crates = CRATES.map(([x, z, ry], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const sideM = keep(new THREE.MeshStandardMaterial({ map: TM.genAmmoCrate(0), roughness: 0.85 }));
    const woodM = keep(std('#34402a', 0.85));
    g.add(mesh(new THREE.BoxGeometry(0.56, 0.26, 0.32), [woodM, woodM, woodM, woodM, sideM, sideM], { y: 0.13 }));
    const lid = new THREE.Group(); lid.position.set(0, 0.26, -0.16); g.add(lid);
    lid.add(mesh(new THREE.BoxGeometry(0.58, 0.04, 0.34), woodM, { y: 0.02, z: 0.16 }));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 10, Math.PI), keep(std('#8a7a58', 0.9)), { x: s * 0.29, y: 0.18, ry: Math.PI / 2, cast: false }));
      lid.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), keep(std('#6a6a60', 0.4, 0.7)), { x: s * 0.2, y: 0.0, z: 0.33, cast: false }));
    }
    const inside = new THREE.Group(); inside.position.y = 0.2; g.add(inside);
    P(g); mark(`crate${i}`, g);
    block(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    return { group: g, lid, inside, sideM, num: 0, open: false };
  });
  refs.crates = crates;

  // ===== 7. 我的书桌：野战电话、盖革计数器、煤油灯；窗边书桌上的手摇发电机 =====
  const DT = 0.76;
  const phone = new THREE.Group(); phone.position.set(1.55, DT, 0.46); phone.rotation.y = -Math.PI / 2;
  const oliveM = keep(std('#3a4230', 0.6, 0.1));
  phone.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), oliveM, { y: 0.07 }));
  phone.add(mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), keep(std('#2a2e22', 0.6)), { y: 0.005 }));
  const handset = new THREE.Group(); handset.position.set(0, 0.16, 0); phone.add(handset);
  handset.add(mesh(new THREE.CapsuleGeometry(0.018, 0.14, 4, 8), keep(std('#141414', 0.5)), { rz: Math.PI / 2, cast: false }));
  for (const s of [-1, 1]) handset.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.035, 12), keep(std('#141414', 0.5)), { x: s * 0.09, y: -0.012, cast: false }));
  const crankP = new THREE.Group(); crankP.position.set(0.14, 0.08, 0); phone.add(crankP);
  crankP.add(mesh(new THREE.BoxGeometry(0.01, 0.07, 0.012), keep(std('#6a6a60', 0.4, 0.8)), { y: -0.03, cast: false }));
  compact(phone, [handset, crankP]);
  P(phone); mark('phone211', phone);
  refs.fieldPhone = { group: phone, handset };
  const geig = new THREE.Group(); geig.position.set(1.45, DT, -0.05); geig.rotation.y = -Math.PI / 2 + 0.3;
  geig.add(mesh(new THREE.BoxGeometry(0.16, 0.09, 0.1), keep(std('#b8901a', 0.55, 0.1)), { y: 0.045 }));
  const dialC = TX.makeCanvas(64, 64), dg = dialC.getContext('2d');
  dg.fillStyle = '#e8e0c8'; dg.beginPath(); dg.arc(32, 32, 30, 0, 6.28); dg.fill(); dg.strokeStyle = '#1a1814'; dg.lineWidth = 2;
  for (let k = 0; k <= 10; k++) { const a = Math.PI * 1.2 + (k / 10) * Math.PI * 0.6; dg.beginPath(); dg.moveTo(32 + Math.cos(a) * 20, 40 + Math.sin(a) * 20); dg.lineTo(32 + Math.cos(a) * 26, 40 + Math.sin(a) * 26); dg.stroke(); }
  dg.fillStyle = '#8a1a14'; dg.font = 'bold 12px sans-serif'; dg.textAlign = 'center'; dg.fillText('☢', 32, 50);
  geig.add(mesh(new THREE.CircleGeometry(0.032, 20), keep(new THREE.MeshStandardMaterial({ map: TX.toTex(dialC, { wrap: false }), roughness: 0.5 })), { y: 0.06, z: 0.051, cast: false }));
  geig.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10), keep(std('#2a2a28', 0.5, 0.6)), { x: 0.02, y: 0.03, z: -0.1, rx: Math.PI / 2 - 0.2, cast: false }));
  geig.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI), keep(std('#1a1a18', 0.6)), { y: 0.095, cast: false }));
  compact(geig);
  P(geig); mark('geiger', geig);
  refs.geigerObj = geig;
  // 煤油灯（借"显示器的灯"那盏点光）
  const kl = new THREE.Group(); kl.position.set(1.62, DT, 0.05);
  const klM = keep(std('#3a3024', 0.5, 0.6));
  kl.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 16), klM, { y: 0.03 }));
  kl.add(mesh(new THREE.SphereGeometry(0.055, 16, 12), keep(new THREE.MeshStandardMaterial({ color: '#f0e0c0', transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false })), { y: 0.13, s: [1, 1.3, 1], cast: false }));
  const klFlameM = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.45), toneMapped: false }));
  const klFlame = mesh(new THREE.SphereGeometry(0.012, 8, 6), klFlameM, { y: 0.12, s: [1, 2.2, 1], cast: false });
  kl.add(klFlame);
  kl.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 12), klM, { y: 0.23 }));
  P(noRay(kl));
  // 手摇发电机：窗边书桌右半边，铸铁机身 + 一只摇把 + 一只小电压表，电线一直拉到窗框上
  const dyn = new THREE.Group(); dyn.position.set(0.45, 0.74, -3.2);
  const castM = keep(std('#3a3a2e', 0.55, 0.5));
  dyn.add(mesh(new THREE.BoxGeometry(0.34, 0.04, 0.24), castM, { y: 0.02 }));
  dyn.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 20), castM, { y: 0.13, rz: Math.PI / 2 }));
  for (let k = 0; k < 6; k++) dyn.add(mesh(new THREE.BoxGeometry(0.22, 0.008, 0.012), castM, { y: 0.13 + Math.cos((k / 6) * 6.28) * 0.092, z: Math.sin((k / 6) * 6.28) * 0.092, rx: (k / 6) * 6.28, cast: false }));
  const crank = new THREE.Group(); crank.position.set(0.13, 0.13, 0); dyn.add(crank);
  crank.add(mesh(new THREE.BoxGeometry(0.02, 0.16, 0.025), keep(std('#6a6a60', 0.4, 0.8)), { x: 0.01, y: -0.07, cast: false }));
  crank.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 10), keep(std('#4a2a18', 0.6)), { x: 0.05, y: -0.14, rz: Math.PI / 2, cast: false }));
  const vC = TX.makeCanvas(64, 64);
  const vTex = TX.toTex(vC, { wrap: false });
  const vm = mesh(new THREE.CircleGeometry(0.035, 20), keep(new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: vTex, emissiveIntensity: 0.05 })), { x: -0.08, y: 0.13, z: 0.1, cast: false });
  dyn.add(vm);
  dyn.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), keep(std('#b8a878', 0.4, 0.7)), { x: -0.08, y: 0.13, z: 0.092, rx: Math.PI / 2, cast: false }));
  compact(dyn, [crank, vm]);
  P(dyn); mark('dynamo', dyn);
  P(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.35, 0.8, -3.3), V(0.3, 0.9, -3.5), V(0.9, 1.2, -3.56), V(1.3, 2.5, -3.56)]), 24, 0.008, 5), keep(std('#141414', 0.6)), { cast: false }));
  const drawVolt = (k) => {
    const g = vC.getContext('2d');
    g.fillStyle = '#e8e0c8'; g.beginPath(); g.arc(32, 32, 32, 0, 6.28); g.fill();
    g.strokeStyle = '#1a1814'; g.lineWidth = 1.5;
    for (let j = 0; j <= 8; j++) { const a = Math.PI * 1.15 + (j / 8) * Math.PI * 0.7; g.beginPath(); g.moveTo(32 + Math.cos(a) * 20, 44 + Math.sin(a) * 20); g.lineTo(32 + Math.cos(a) * 26, 44 + Math.sin(a) * 26); g.stroke(); }
    g.fillStyle = '#8a1a14'; g.fillRect(40, 16, 10, 4);
    const a = Math.PI * 1.15 + clamp(k, 0, 1) * Math.PI * 0.7;
    g.strokeStyle = '#8a1a14'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 44); g.lineTo(32 + Math.cos(a) * 24, 44 + Math.sin(a) * 24); g.stroke();
    vTex.needsUpdate = true;
  };
  drawVolt(0);
  refs.dynamo = { group: dyn, crank, drawVolt };

  // ===== 8. 门边挂着的防毒面具；床上的吉他；杂物桌上的蜡烛神龛 + 烧水壶 =====
  const mask = new THREE.Group(); mask.position.set(-1.72, 1.6, 3.02); mask.rotation.y = Math.PI / 2;
  const rubber = keep(std('#1e201c', 0.75));
  mask.add(mesh(new THREE.SphereGeometry(0.1, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.75), rubber, { s: [1, 1.2, 0.7], rx: -0.3 }));
  for (const s of [-1, 1]) {
    mask.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 18), keep(std('#6a6a60', 0.3, 0.7)), { x: s * 0.042, y: 0.03, z: 0.06, rx: Math.PI / 2 }));
    mask.add(mesh(new THREE.CircleGeometry(0.03, 18), keep(std('#8aa0a0', 0.08, 0.5, { transparent: true, opacity: 0.6 })), { x: s * 0.042, y: 0.03, z: 0.071, cast: false }));
  }
  mask.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 14), rubber, { y: -0.08, z: 0.05, rx: 1.0 }));
  const maskCan = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 16), keep(std('#4a5236', 0.5, 0.4)), { y: -0.13, z: 0.1, rx: 1.0 });
  mask.add(maskCan);
  mask.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 5, 16, Math.PI), keep(std('#2a2a26', 0.8)), { y: 0.02, z: -0.02, rx: -0.3 }));
  P(mask); mark('gasmask', mask);
  refs.gasmaskObj = mask;
  P(mesh(new THREE.PlaneGeometry(0.24, 0.34), keep(new THREE.MeshStandardMaterial({ map: TM.genMetroSign('filters'), roughness: 0.85 })), { x: -1.788, y: 1.72, z: 2.45, ry: Math.PI / 2, cast: false }));
  // 吉他：斜放在{A}的下铺上
  const gtr = new THREE.Group(); gtr.position.set(-1.28, 0.53, 0.35); gtr.rotation.set(-Math.PI / 2, 0, 0.5);
  const gwood = keep(std('#6a3a1a', 0.35, 0.05, { map: T.woodOrange }));
  gtr.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 24), gwood, { y: -0.12, rx: Math.PI / 2, s: [1, 1, 1] }));
  gtr.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 24), gwood, { y: 0.1, rx: Math.PI / 2 }));
  gtr.add(mesh(new THREE.CircleGeometry(0.05, 20), keep(std('#0a0806', 0.8)), { y: 0.02, z: 0.047, cast: false }));
  gtr.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.025), keep(std('#2a1a0e', 0.5)), { y: 0.45, z: 0.02 }));
  gtr.add(mesh(new THREE.BoxGeometry(0.07, 0.14, 0.02), keep(std('#1a1008', 0.5)), { y: 0.76, z: 0.02 }));
  for (let k = 0; k < 6; k++) gtr.add(mesh(new THREE.BoxGeometry(0.002, 0.82, 0.002), keep(std('#c8c0a8', 0.3, 0.9)), { x: -0.02 + k * 0.008, y: 0.3, z: 0.05, cast: false }));
  compact(gtr);
  P(gtr); mark('guitar', gtr);
  // 蜡烛神龛：杂物桌上一排高高低低的蜡烛、一张四个人的合照、一只烧水壶
  const T0 = 0.75;
  const candleM = keep(std('#d8ccb0', 0.7)), flameM2 = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.45), toneMapped: false }));
  const candles = [];
  for (const [x, z, h] of [[-1.62, 1.52, 0.12], [-1.55, 1.6, 0.2], [-1.66, 1.68, 0.08], [-1.5, 1.74, 0.15], [-1.62, 1.84, 0.1]]) {
    P(mesh(new THREE.CylinderGeometry(0.018, 0.02, h, 10), candleM, { x, y: T0 + h / 2, z, cast: false }));
    const f = mesh(new THREE.SphereGeometry(0.008, 8, 6), flameM2, { x, y: T0 + h + 0.018, z, s: [1, 2.2, 1], cast: false });
    P(noRay(f)); candles.push(f);
  }
  const photo = mesh(new THREE.PlaneGeometry(0.16, 0.12), keep(new THREE.MeshStandardMaterial({ color: '#8a8070', roughness: 0.8 })), { x: -1.76, y: T0 + 0.2, z: 1.68, ry: Math.PI / 2, rx: 0, cast: false });
  P(photo);
  const shrineLight = new THREE.PointLight('#ffa050', 1.6, 4.6, 1.5); shrineLight.position.set(-1.45, 1.05, 1.68); P(shrineLight);
  mark('shrine', photo); for (const f of candles) mark('shrine', f);
  const kettle = new THREE.Group(); kettle.position.set(-1.5, T0, 2.3);
  kettle.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), keep(std('#2a2a28', 0.5, 0.6)), { y: 0.025 }));
  kettle.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), keep(std('#6a6a64', 0.35, 0.8)), { y: 0.12, s: [1, 0.85, 1] }));
  kettle.add(mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.1, 8), keep(std('#6a6a64', 0.35, 0.8)), { x: 0.08, y: 0.14, rz: -0.9 }));
  kettle.add(mesh(new THREE.TorusGeometry(0.05, 0.007, 5, 12, Math.PI), keep(std('#1a1a18', 0.6)), { y: 0.19, cast: false }));
  compact(kettle);
  P(kettle); mark('kettle', kettle);
  refs.kettle = kettle;
  refs.shrine = { candles, light: shrineLight };

  // ===== 9. 沙袋、线路图、站规、出口牌 =====
  const bagM = keep(std('#6a5a40', 0.95));
  const sb = new Batch();
  for (let k = 0; k < 8; k++) { const x = 1.2 + (k % 3) * 0.2 + (Math.floor(k / 3) % 2) * 0.1, y = 0.12 + Math.floor(k / 3) * 0.2, z = 3.1 + (k % 2) * 0.3; sb.add(new THREE.CapsuleGeometry(0.1, 0.28, 4, 8), bagM, I4.compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, (rnd() - 0.5) * 0.3, 0)), V(1, 1, 0.75))); }
  sb.build(props, { cast: true, name: 'sandbags' }).forEach((m) => mark('sandbags', m));
  block(1.05, 1.75, 2.95, 3.55);
  P(mesh(new THREE.PlaneGeometry(0.6, 0.45), keep(new THREE.MeshStandardMaterial({ map: TM.genMetroSign('map'), roughness: 0.85 })), { x: 1.788, y: 1.62, z: -0.75, ry: -Math.PI / 2, cast: false }));
  mark('metroMap', props.children[props.children.length - 1]);
  const rules = mesh(new THREE.PlaneGeometry(0.26, 0.36), keep(new THREE.MeshStandardMaterial({ map: TM.genMetroSign('rules'), roughness: 0.85 })), { x: 0.9, y: 1.62, z: SZ - 0.012, ry: Math.PI, cast: false });
  P(rules); mark('rules', rules);
  P(mesh(new THREE.PlaneGeometry(0.34, 0.13), keep(new THREE.MeshStandardMaterial({ map: TM.genMetroSign('exit'), roughness: 0.7, emissive: new THREE.Color('#2a8a4a'), emissiveIntensity: 0.25 })), { x: -1.788, y: 2.3, z: 3.2, ry: Math.PI / 2, cast: false }));

  // ===== 10. 老鼠：沿着墙根跑来跑去 =====
  const ratM = keep(std('#2e2620', 0.9)), tailM = keep(std('#6a5048', 0.6));
  const rats = [];
  const ratPaths = [
    [V(-1.65, 0, 3.6), V(-1.65, 0, 2.9), V(-1.25, 0, 2.85), V(-1.25, 0, 1.3)],
    [V(1.7, 0, -3.3), V(0.9, 0, -3.3), V(0.9, 0, -2.6), V(0.2, 0, -2.6)],
    [V(-1.7, 0, -0.9), V(-0.85, 0, -0.9), V(-0.85, 0, -1.3), V(-1.7, 0, -1.3)],
    [V(1.7, 0, 3.7), V(0.9, 0, 3.8), V(0.4, 0, 4.3)],
  ];
  for (const path of ratPaths) {
    const r = new THREE.Group();
    const body = new THREE.Group(); r.add(body);
    body.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), ratM, { y: 0.04, s: [0.8, 0.75, 1.5], cast: false }));
    body.add(mesh(new THREE.ConeGeometry(0.028, 0.07, 10), ratM, { y: 0.04, z: 0.1, rx: Math.PI / 2, cast: false }));
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.012, 6, 5), ratM, { x: s * 0.02, y: 0.07, z: 0.07, cast: false }));
    const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.03, -0.06), V(0.02, 0.02, -0.14), V(-0.02, 0.012, -0.22)]), 8, 0.004, 4), tailM, { cast: false });
    body.add(tail);
    r.position.copy(path[0]);
    P(noRay(r));
    rats.push({ o: r, path, i: 0, dir: 1, wait: rnd() * 4, speed: 0.9 + rnd() * 0.5 });
  }
  refs.rats = rats;

  // ===== 11. 灯 =====
  const L = refs.lights;
  L.hemi.color.set('#4a4a40'); L.hemi.groundColor.set('#1a1612');
  // "太阳"：站台上的钠灯从窗户照进来（发电机摇起来才亮）——从北边高处打下来，窗框、木板的影子落在书桌和地上
  L.sun.color.set('#ffa048'); L.sun.position.set(0.6, 7.5, -10.5); L.sun.target.position.set(0, 0, -1.6); L.sun.intensity = 0;
  L.winLight.color.set('#c89060'); L.winLight.intensity = 0; L.winLight.position.z = -3.63;
  L.monLight.color.set('#ffae50'); L.monLight.distance = 4.4; L.monLight.position.set(1.55, 1.05, 0.05); L.monLight.intensity = 1.0;
  L.wc.color.set('#9ab86a');
  // 舱顶：两盏带铁罩的灯泡（开关控制，电压不稳，一闪一闪）
  const bulbM = keep(new THREE.MeshStandardMaterial({ color: '#f4e8d0', emissive: new THREE.Color('#ffc890'), emissiveIntensity: 0, roughness: 0.2 }));
  for (const z of [2.3, -1.6]) {
    const pend = new THREE.Group(); pend.position.set(0, 3.0, z);
    pend.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.4, 5), keep(std('#111', 0.6)), { y: -0.2, cast: false }));
    pend.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.05, 10), steelM, { y: -0.42 }));
    pend.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), bulbM, { y: -0.48, s: [1, 1.3, 1], cast: false }));
    for (let k = 0; k < 6; k++) pend.add(mesh(new THREE.TorusGeometry(0.06, 0.003, 4, 14, Math.PI), steelM, { y: -0.48, ry: (k / 6) * Math.PI * 2, cast: false }));
    compact(pend);
    P(pend);
  }
  L.tubeMats.length = 0; L.tubeMats.push(bulbM);
  for (const s of L.ceilSpots) { s.color.set('#ffc890'); s.position.y = 2.45; }
  refs.metroLights = { bulbM, redLight, redM, klFlame, klFlameM };

  // ===== 12. 洗手间 → 毒气间：绿雾、浮在半空的"异常"、墙上的影子；窗外是检修隧道 =====
  for (const m of Object.values(refs.wcMats)) { m.emissiveIntensity *= 0.2; m.color.multiplyScalar(0.62); }
  // 洗手间玻璃门上贴着"毒气"警告
  const leaf = refs.wcDoor.pivot, lw = LAYOUT.WC.x1 - LAYOUT.WC.x0 - 0.02;
  const dangerTex = TM.genMetroSign('danger');
  for (const s of [-1, 1]) leaf.add(mesh(new THREE.PlaneGeometry(0.28, 0.28), keep(new THREE.MeshStandardMaterial({ map: dangerTex, roughness: 0.7 })), { x: -lw / 2, y: 1.45, z: s * 0.024, ry: s < 0 ? Math.PI : 0, cast: false }));
  // 绿雾：几团慢慢飘的软雾
  const fogM = new THREE.SpriteMaterial({ map: softTex('fog'), color: new THREE.Color('#7a9a4a'), transparent: true, opacity: 0.32, depthWrite: false });
  const fogs = [];
  for (let k = 0; k < 12; k++) {
    const s = new THREE.Sprite(fogM.clone());
    const x = -1.5 + rnd() * 3.0, y = 0.3 + rnd() * 1.8, z = WR.z0 + 0.3 + rnd() * (WR.z1 - WR.z0 - 0.6);
    s.position.set(x, y, z); s.scale.set(1.4 + rnd(), 1.0 + rnd() * 0.6, 1);
    s.userData.base = s.position.clone(); s.userData.ph = rnd() * 6.28;
    s.renderOrder = 5;
    refs.wcRoom.add(noRay(s)); fogs.push(s);
  }
  // "异常"：一团浮在半空、噼啪放电的蓝白色光
  const anom = new THREE.Group(); anom.position.copy(ANOMALY);
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.7, 2.2), toneMapped: false, transparent: true, opacity: 0.9 });
  anom.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), coreM, { cast: false }));
  const aGlow = glowSprite('#9ac8ff', 0.9, 0.8); anom.add(aGlow);
  const aGlow2 = glowSprite('#c8e0ff', 0.35, 1); anom.add(aGlow2);
  const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 7 * 2 * 3), 3));
  const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.9, 2.4), toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  arcs.frustumCulled = false;
  anom.add(arcs);
  refs.wcRoom.add(noRay(anom));
  const anomHit = mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), { x: ANOMALY.x, y: ANOMALY.y, z: ANOMALY.z });
  refs.wcRoom.add(anomHit); mark('anomaly', anomHit);
  // 墙上的影子：一个个剪影贴着洗手间的后墙走过去（平时藏着）
  const shadowTex = [genShadowPerson(1), genShadowPerson(2), genShadowPerson(3), genShadowPerson(4)];
  const shadows = [];
  for (let k = 0; k < 9; k++) {
    const m = mesh(new THREE.PlaneGeometry(0.85, 1.7), new THREE.MeshBasicMaterial({ map: shadowTex[k % 4], transparent: true, opacity: 0, depthWrite: false, color: '#000000', fog: false }), { x: -0.6, y: 0.87, z: WR.z1 - 0.022, ry: Math.PI, cast: false, recv: false });
    m.visible = false; m.renderOrder = 6; // 画在绿雾后面：影子不被雾染成绿的
    refs.wcRoom.add(noRay(m)); shadows.push(m);
  }
  refs.anomaly = { group: anom, core: coreM, glow: aGlow, glow2: aGlow2, arcs, hit: anomHit, fogs, fogM, shadows, alive: true };
  // 洗手间的窗：玻璃脏得发绿
  refs.wcWin.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) { o.material = o.material.clone(); o.material.color.set('#6a7a50'); o.material.opacity = 0.3; } });

  add(props);

  // ===== 13. 全场落灰（自己建的写实材质、站台、窗外不动）=====
  const skip = new Set();
  for (const g of [refs.outside.group, plat.group]) g.traverse((o) => skip.add(o));
  const seen = new Set(clean);
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      dustMaterial(m);
    }
  });
}
