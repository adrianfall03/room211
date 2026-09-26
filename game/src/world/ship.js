// 第三章：船舱 211 —— 同一间宿舍，成了一艘老货轮船头底下的船员舱：凌晨四点，北大西洋，天亮之前。
//   写实电影感（和第二、五、六、七章一个路子）：
//   · 墙：铆接钢板舱壁（下绿上白、一道红腰线），漆皮起泡、铆钉淌锈、墙根一圈盐霜；地板是红丹漆的花纹钢板；天花板是甲板底面 + 横梁 + 管子；
//   · 整间屋子在晃：船在涌浪里横摇、纵摇——吊着的马灯来回摆，地上没过脚背的积水跟着晃到一边、又晃回来，桌上的扳手滑来滑去，
//     人也跟着一歪一歪；窗外的海平线斜过来、又斜回去（见 SHIP_MOTION 和 chapter3.js 的 world()）；
//   · 北墙的大窗户换成了三个铜边舷窗，里面扣着拧死的铁盖（舷窗盖），拧开之后才看得见外面：月光下的海、远处一座灯塔；
//   · 屋里：水密门（转轮 + 一圈压紧把手）、我的书桌成了电报台（电子管收音机、电键、纸带收报机）、窗边书桌成了海图桌、
//     南墙上的手摇舱底泵、天花板上兜着杂物的货网、救生圈、救生衣、船钟、船上的铜钟……
//   · 灯：一盏吊在链子上来回摆的马灯（跟着摆的点光）、两盏带铁罩的舱顶灯（开关控制）、电报台的琥珀色刻度灯、从舷窗照进来的月光（带舷窗的圆影子），
//     灯塔闪光的时候，月光那一束会猛地一亮
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TS from '../core/tex_ship.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { Batch, compact } from './spacelook.js';

export function buildShipTextures(B) {
  const T = {};
  T.floor = TS.genDeckFloor(); T.floorDirt = TS.genDeckGrime();
  const w = TS.genHullWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  const c = TS.genShipCeiling(); T.ceiling = c.map; T.ceilingN = c.normalMap;
  let s = 1;
  const br = (t, o = {}) => TS.brine(t, { seed: s++, ...o });
  T.woodDark = br(B.woodDark, { dark: 0.66 });
  T.woodLight = br(B.woodLight, { dark: 0.64 });
  T.woodOrange = br(B.woodOrange, { dark: 0.62 });
  T.doorWood = br(B.doorWood, { dark: 0.6 });
  T.blackLaminate = br(B.blackLaminate, { dark: 0.9 });
  T.curtain = br(B.curtain, { dark: 0.6 });
  T.net = br(B.net, { dark: 0.8, salt: 1 });
  for (const k of ['grayCloth', 'pinkCloth', 'blackCloth', 'blueCloth', 'whiteCloth', 'bamboo', 'floral', 'polka', 'yellowDots', 'patternRoll']) T[k] = br(B[k], { dark: 0.7, mold: 6 });
  T.cardboard = br(B.cardboard, { dark: 0.62, mold: 8 }); T.cardboard350 = br(B.cardboard350, { dark: 0.62, mold: 8 });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.notebook = TS.genLogbookSpread();
  T.windowView = B.windowView; // 窗户整个换成了舷窗，这张用不上
  T.clockFace = TS.genShipClockFace();
  T.mousepad = br(B.mousepad, { dark: 0.8, wrap: false });
  return T;
}

// ---------- 船的晃动：横摇（绕南北轴）+ 纵摇（绕东西轴）+ 上下起伏 ----------
//   roll > 0：东边往下沉 —— 地上的水往东边淌、吊灯往东边摆、人往东边歪（在屋子的坐标里，重力往东偏了 roll 这么多）
//   pitch > 0：船头（北边）往下扎 —— 水往北淌
export const SHIP_MOTION = {
  roll(t, k = 1) { return (0.058 * Math.sin((t * 6.2832) / 9.4) + 0.018 * Math.sin((t * 6.2832) / 5.3 + 1.1)) * k; },
  pitch(t, k = 1) { return (0.02 * Math.sin((t * 6.2832) / 6.8 + 0.6) + 0.006 * Math.sin((t * 6.2832) / 3.9 + 2.0)) * k; },
  heave(t) { return 0.45 * Math.sin((t * 6.2832) / 7.6 + 0.3) + 0.15 * Math.sin((t * 6.2832) / 4.1); },
};
export const SEA_Y = -1.25; // 平静时的海面（世界坐标）：舷窗中心在 1.72，离海面三米
export const PORTHOLES = [-0.56, 0, 0.56]; // 北墙三个舷窗的 x（中心高 1.72）：挨得近一点，两边的床架才挡不住
const PSC = 0.85; // 舷窗的大小（按 20cm 半径建模再整体缩放）
export const LIGHTHOUSE = new THREE.Vector3(-7.5, SEA_Y + 11.6, -48); // 灯塔的灯室（世界坐标，不算晃动）

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
// 两点之间下垂的绳子（抛物线近似的悬链线）
const sagCurve = (a, b, sag, n = 12) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
  return new THREE.CatmullRomCurve3(pts);
};
const glowTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = TX.makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,250,235,0.75)'); gr.addColorStop(0.5, 'rgba(255,236,200,0.16)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    t = TX.toTex(c, { wrap: false });
    return t;
  };
})();
const glowSprite = (color, size, op = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  s.scale.set(size, size, 1);
  return noRay(s);
};

// ---------- 泡在海风里：旧材质去饱和、压暗；世界坐标噪声的锈斑、霉点；墙根往上一圈水渍，湿的地方发亮 ----------
const BRINE_FUNCS = /* glsl */ `
varying vec3 vBW;
float bh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float bn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1, 0, 0)), f.x), mix(bh(i + vec3(0, 1, 0)), bh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh(i + vec3(0, 0, 1)), bh(i + vec3(1, 0, 1)), f.x), mix(bh(i + vec3(0, 1, 1)), bh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const BRINE_APPLY = /* glsl */ `
#include <roughnessmap_fragment>
{
  float n1 = bn(vBW * 3.1), n2 = bn(vBW * 11.0 + 4.0), n3 = bn(vBW * 37.0);
  // 泡过水的那一截：比水面高一点的一圈暗痕，水面以下湿透
  float wetLine = 1.0 - smoothstep(0.1, 0.24 + n2 * 0.06, vBW.y);
  diffuseColor.rgb *= 1.0 - wetLine * 0.35;
  roughnessFactor = mix(roughnessFactor, 0.2, wetLine * 0.75);
  // 锈斑 / 霉点
  float g = smoothstep(0.55, 0.9, n1 * 0.6 + n2 * 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.6, 0.5), g * 0.45 + (n3 - 0.5) * 0.08);
  // 盐霜：一点点白
  float salt = smoothstep(0.82, 0.95, n3) * smoothstep(0.35, 0.2, abs(vBW.y - 0.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.77, 0.72), salt * 0.5);
}`;
function brinify(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 bw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        bw = instanceMatrix * bw;
        #endif
        vBW = (modelMatrix * bw).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${BRINE_FUNCS}`)
      .replace('#include <roughnessmap_fragment>', BRINE_APPLY);
  };
  m.customProgramCacheKey = () => 'brine211';
  m.needsUpdate = true;
}
const _hsl = {};
function brineMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.brine) return;
  m.userData.brine = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * 0.62, Math.min(0.55, _hsl.l * 0.74 + 0.01));
  } else m.color.multiplyScalar(0.92);
  if (m.metalness > 0.45) m.roughness = Math.max(m.roughness, 0.4);
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.55;
  if (m.emissive && m.emissiveIntensity > 0 && !m.emissiveMap) m.emissiveIntensity *= 0.35;
  if (!m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) brinify(m);
}

// ================= 窗外：夜里的海 + 天 + 灯塔（整个跟着船晃）=================
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uMoonDir, uHorizon, uZenith, uDawnCol; uniform float uTime, uDawn, uFlash;
varying vec3 vDir;
float sh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh(i), sh(i + vec3(1, 0, 0)), f.x), mix(sh(i + vec3(0, 1, 0)), sh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sh(i + vec3(0, 0, 1)), sh(i + vec3(1, 0, 1)), f.x), mix(sh(i + vec3(0, 1, 1)), sh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * sn(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, el));
  // 东边（+x）海平线上快天亮了
  float east = pow(max(0.0, d.x * 0.8 + 0.2), 3.0) * (1.0 - smoothstep(0.0, 0.25, el));
  col += uDawnCol * east * uDawn;
  // 云：慢慢飘，月亮从后面把云边照亮
  float md = max(0.0, dot(d, uMoonDir));
  vec3 cp = d * 3.2 + vec3(uTime * 0.004, 0.0, uTime * 0.002);
  float cl = fbm(cp * vec3(1.0, 2.2, 1.0));
  float cloud = smoothstep(0.46, 0.7, cl) * smoothstep(0.02, 0.12, el);
  vec3 cc = mix(vec3(0.012, 0.016, 0.022), vec3(0.16, 0.19, 0.23), pow(md, 12.0) + smoothstep(0.62, 0.48, cl) * 0.12);
  // 星星
  vec3 sp = floor(d * 380.0);
  float star = step(0.9975, sh(sp)) * smoothstep(0.05, 0.3, el) * (0.5 + 0.5 * sin(uTime * 2.0 + sh(sp + 3.0) * 30.0));
  col += vec3(0.8, 0.85, 1.0) * star * 0.6 * (1.0 - cloud);
  // 月亮 + 月晕
  float disc = smoothstep(0.99955, 0.9997, md);
  col += vec3(0.9, 0.92, 0.88) * disc * 3.0 * (1.0 - cloud * 0.85);
  col += vec3(0.45, 0.5, 0.56) * pow(md, 400.0) * 0.8 + vec3(0.12, 0.14, 0.17) * pow(md, 24.0);
  col = mix(col, cc, cloud);
  col += vec3(1.0, 0.95, 0.8) * uFlash * 0.04 * smoothstep(0.3, 0.0, el);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SEA_VERT = /* glsl */ `
uniform float uTime, uHeave;
varying vec3 vW, vN; varying float vH;
void wave(vec2 p, vec2 dir, float A, float L, float S, inout float h, inout vec2 gr) {
  vec2 d = normalize(dir); float k = 6.2832 / L; float ph = k * dot(d, p) - k * S * uTime;
  h += A * sin(ph); gr += A * k * cos(ph) * d;
}
void main() {
  vec2 p = position.xz;
  p.y += uTime * 3.0; // 船往北开：海面相对往南流
  float h = 0.0; vec2 gr = vec2(0.0);
  wave(p, vec2(0.35, 1.0), 0.55, 34.0, 6.5, h, gr);
  wave(p, vec2(-0.5, 1.0), 0.32, 19.0, 4.8, h, gr);
  wave(p, vec2(0.9, 0.6), 0.18, 11.0, 3.6, h, gr);
  wave(p, vec2(-0.2, 1.0), 0.09, 5.7, 2.7, h, gr);
  wave(p, vec2(0.7, -0.3), 0.045, 3.1, 2.0, h, gr);
  vec3 pos = position; pos.y += h + uHeave;
  vH = h;
  vN = normalize(mat3(modelMatrix) * normalize(vec3(-gr.x, 1.0, -gr.y)));
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FRAG = /* glsl */ `
uniform vec3 uMoonDir, uHorizon, uZenith, uDeep, uFlashPos; uniform float uTime, uFlash, uDawn;
varying vec3 vW, vN; varying float vH;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec2 q = vW.xz * 1.7 + vec2(0.0, uTime * 5.0);
  vec3 N = normalize(vN + vec3(vn(q) - 0.5, 0.0, vn(q + 17.0) - 0.5) * 0.12);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 skyR = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, R.y));
  float m = max(0.0, dot(R, uMoonDir));
  // 月光在海面上铺出的一条碎银子
  float glit = pow(m, 300.0) * 22.0 + pow(m, 40.0) * 0.5;
  glit *= 0.6 + 0.8 * step(0.55, vn(vW.xz * 9.0 + uTime * 2.0));
  vec3 col = mix(uDeep, skyR, fres) + vec3(0.72, 0.78, 0.84) * glit * (0.3 + 0.7 * fres);
  // 浪尖上的白沫
  float foam = smoothstep(0.55, 0.9, vH) * smoothstep(0.4, 0.75, vn(vW.xz * 1.3 + uTime * 0.6));
  col = mix(col, vec3(0.18, 0.2, 0.22), foam * 0.7);
  // 灯塔闪的时候，海面上一道暖光
  vec3 fl = normalize(uFlashPos - vW);
  col += vec3(1.0, 0.92, 0.75) * uFlash * (pow(max(0.0, dot(R, fl)), 30.0) * 3.0 + 0.02);
  col += vec3(0.25, 0.18, 0.14) * uDawn * fres * 0.4;
  float d = length(vW.xz - cameraPosition.xz);
  col = mix(col, uHorizon, smoothstep(12.0, 56.0, d));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// 舷窗玻璃：一层水珠；浪打上来时一大片水往下淌
const GLASS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLASS_FRAG = /* glsl */ `
uniform float uTime, uWash, uSeed; varying vec2 vUv;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float drops(vec2 uv, float n, float seed, float keep) {
  vec2 p = uv * n + seed;
  vec2 c = floor(p), f = fract(p) - 0.5;
  vec2 o = vec2(hh(c + 3.0) - 0.5, hh(c + 7.0) - 0.5) * 0.5;
  float rad = 0.07 + 0.2 * hh(c + 11.0);
  float d = length((f + o) * vec2(1.0, 0.85));
  return (1.0 - smoothstep(rad * 0.75, rad, d)) * step(keep, hh(c)) * (0.5 + 0.5 * smoothstep(rad * 0.3, rad * 0.9, d));
}
void main() {
  // 两层大小不一的水珠：水珠本身是暗的（折射着外面的夜），边上一圈亮
  float d1 = drops(vUv, 30.0, uSeed, 0.7), d2 = drops(vUv, 70.0, uSeed + 5.0, 0.55);
  float drop = max(d1, d2 * 0.7);
  // 浪打上来之后淌下来的水帘
  float sx = floor(vUv.x * 40.0);
  float run = smoothstep(0.3, 1.0, sin(vUv.y * 30.0 + uTime * (6.0 + hh(vec2(sx, 1.0)) * 5.0) + hh(vec2(sx, 2.0)) * 20.0)) * uWash;
  vec3 col = mix(vec3(0.04, 0.06, 0.07), vec3(0.7, 0.78, 0.82), smoothstep(0.55, 1.0, drop));
  float a = clamp(drop * 0.28 + run * 0.35 + 0.03 + uWash * 0.25, 0.0, 0.85);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function buildSea(rnd) {
  const pivot = new THREE.Group(); pivot.name = 'shipSea';
  pivot.userData.noAO = true;
  pivot.position.set(0, -1.0, 0.45); // 横摇 / 纵摇的转轴：大概在船的重心那儿
  const world = new THREE.Group(); world.position.set(0, 1.0, -0.45); pivot.add(world);
  const moonDir = V(-0.26, 0.4, -1).normalize();
  const U = {
    uTime: { value: 0 }, uHeave: { value: 0 }, uDawn: { value: 0 }, uFlash: { value: 0 },
    uMoonDir: { value: moonDir }, uFlashPos: { value: LIGHTHOUSE.clone() },
    uHorizon: { value: new THREE.Color('#1c2731') }, uZenith: { value: new THREE.Color('#03060a') }, uDeep: { value: new THREE.Color('#03080b') }, uDawnCol: { value: new THREE.Color('#4a2f2a') },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(56, 48, 24), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -2; sky.frustumCulled = false;
  world.add(noRay(sky));
  const seaGeo = new THREE.PlaneGeometry(116, 116, 180, 180); seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false }));
  sea.position.y = SEA_Y; sea.frustumCulled = false;
  world.add(noRay(sea));
  // ---- 灯塔：礁石小岛 + 白塔红腰带 + 灯室 ----
  const lh = new THREE.Group(); lh.position.set(LIGHTHOUSE.x, SEA_Y, LIGHTHOUSE.z); world.add(lh);
  const basic = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), fog: false });
  const rockB = new Batch(), I4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < 16; k++) {
    const a = rnd() * 6.28, r = rnd() * 4.5, s = 1.2 + rnd() * 2.2;
    rockB.add(new THREE.DodecahedronGeometry(1, 0), basic('#07090b'), I4.compose(V(Math.cos(a) * r, -0.4 + rnd() * 1.2, Math.sin(a) * r * 0.6), q.setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3)), V(s, s * 0.7, s)));
  }
  rockB.build(lh, { cast: false, name: 'rocks' });
  lh.add(mesh(new THREE.CylinderGeometry(0.75, 1.1, 9, 18), basic('#6a7078'), { y: 5.5, cast: false, recv: false }));
  lh.add(mesh(new THREE.CylinderGeometry(0.93, 0.98, 1.4, 18), basic('#3a1612'), { y: 4.4, cast: false, recv: false }));
  lh.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.15, 18), basic('#15181b'), { y: 10.05, cast: false, recv: false }));
  lh.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 12), basic('#e8d8a8'), { y: 10.6, cast: false, recv: false }));
  lh.add(mesh(new THREE.ConeGeometry(0.72, 0.7, 12), basic('#101214'), { y: 11.45, cast: false, recv: false }));
  const flash = glowSprite('#fff4d8', 9, 0); flash.position.set(0, 10.6, 0.4); lh.add(flash);
  const lamp = glowSprite('#ffe8b8', 2.2, 0.6); lamp.position.set(0, 10.6, 0.3); lh.add(lamp);
  // 光束：从灯室朝船这边打过来的一道光（闪的时候才看得见）
  const beamGeo = new THREE.CylinderGeometry(0.2, 3.5, 34, 20, 1, true); beamGeo.translate(0, 17, 0); beamGeo.rotateX(Math.PI / 2);
  const beamM = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uK; varying vec3 vP; void main(){ float a = uK * 0.18 * (1.0 - smoothstep(0.0, 34.0, vP.z)); gl_FragColor = vec4(vec3(1.0, 0.94, 0.8) * a, a); }',
  });
  const beam = mesh(beamGeo, beamM, { y: 10.6, cast: false, recv: false });
  beam.lookAt(0, 1.72, 0); // 朝着船（这时候整个海还没晃：本地坐标就是世界坐标）
  lh.add(noRay(beam));
  // ---- 远处一艘货轮的灯（桅灯白、左舷红、右舷绿）----
  const ship2 = new THREE.Group(); ship2.position.set(24, SEA_Y, -52); world.add(ship2);
  ship2.add(mesh(new THREE.BoxGeometry(9, 1.6, 1.8), basic('#050607'), { y: 0.6, ry: 0.3, cast: false, recv: false }));
  ship2.add(mesh(new THREE.BoxGeometry(2, 2.2, 1.6), basic('#050607'), { x: 3, y: 2.4, ry: 0.3, cast: false, recv: false }));
  for (const [x, y, c, s] of [[-3.5, 4.2, '#fff6e0', 0.9], [3.2, 3.8, '#fff0d0', 0.8], [1.5, 1.6, '#ff3a2a', 0.6], [3.6, 3.0, '#ffe0a8', 0.5]]) { const g = glowSprite(c, s, 0.9); g.position.set(x, y, 0); ship2.add(g); }
  return {
    pivot, U, sea, sky, lh: { group: lh, flash, lamp, beam, beamM },
    update(dt, t, roll, pitch, flashK, dawn) {
      U.uTime.value = t; U.uHeave.value = SHIP_MOTION.heave(t) * 0.8; U.uFlash.value = flashK; U.uDawn.value = dawn;
      pivot.rotation.set(pitch, 0, roll);
      flash.material.opacity = flashK;
      beamM.uniforms.uK.value = flashK;
      lamp.material.opacity = 0.4 + flashK * 0.5;
      ship2.position.x = 24 - t * 0.05;
    },
  };
}

// ================= 鲸：一头座头鲸（剧情里会在舷窗外跃出海面）=================
function buildWhale() {
  const root = new THREE.Group(); root.name = 'whale'; root.visible = false;
  const skin = std('#1c2226', 0.55, 0.05), belly = std('#6a6e6a', 0.7);
  // 身体：沿 +z 的纺锤体（车削），头大尾细
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.85) * 1.25 * (1 - t * 0.35);
    prof.push(new THREE.Vector2(Math.max(0.02, r), (t - 0.45) * 12));
  }
  const bodyGeo = new THREE.LatheGeometry(prof, 28); bodyGeo.rotateX(Math.PI / 2);
  const body = mesh(bodyGeo, skin, { cast: false, recv: false }); body.scale.set(1, 0.82, 1);
  root.add(body);
  // 肚皮上浅色的一道（褶沟）
  const bellyM = mesh(bodyGeo.clone(), belly, { y: -0.12, cast: false, recv: false }); bellyM.scale.set(0.93, 0.72, 0.9); bellyM.position.z = 0.4; root.add(bellyM);
  // 长长的胸鳍（座头鲸的招牌）
  for (const s of [-1, 1]) {
    const fin = new THREE.Group(); fin.position.set(s * 0.95, -0.35, 2.2); fin.rotation.set(0.2, s * 0.9, s * -0.5); root.add(fin);
    fin.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 3.6), belly, { z: -1.8, cast: false, recv: false }));
  }
  // 尾鳍
  const fluke = new THREE.Group(); fluke.position.set(0, 0, -6.4); root.add(fluke);
  const fs = new THREE.Shape();
  fs.moveTo(0, 0.3); fs.bezierCurveTo(1.2, 0.5, 2.2, -0.2, 2.5, -1.0); fs.bezierCurveTo(1.6, -0.6, 0.8, -0.8, 0, -0.35);
  fs.bezierCurveTo(-0.8, -0.8, -1.6, -0.6, -2.5, -1.0); fs.bezierCurveTo(-2.2, -0.2, -1.2, 0.5, 0, 0.3);
  const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.12, bevelEnabled: false }); fg.rotateX(-Math.PI / 2);
  fluke.add(mesh(fg, skin, { cast: false, recv: false }));
  return { root, fluke };
}

// ================= 洗手间舷窗外：救生艇吊在吊艇架上，里面猫着三只穿救生衣的猴子 =================
// 船外面照不到屋里的灯：救生艇和猴子自己带一点"甲板灯照着"的亮（emissive），不另外加灯（加灯会让所有材质重编译）
const lamp = (c, rough = 0.8, k = 0.32) => std(c, rough, 0, { emissive: new THREE.Color(c).multiplyScalar(k), emissiveIntensity: 1 });
function makeMonkey(vestM) {
  const fur = lamp('#4a3424', 0.95), face = lamp('#b89878', 0.8), dark = std('#120c08', 0.4);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.12, 0.18, 6, 12), fur, { cast: false }));
  body.add(mesh(new THREE.CapsuleGeometry(0.135, 0.12, 6, 12), vestM, { y: 0.04, cast: false })); // 救生衣
  body.add(mesh(new THREE.BoxGeometry(0.04, 0.02, 0.02), std('#c8ccd0', 0.3, 0.6), { y: 0.1, z: 0.13, cast: false }));
  const head = new THREE.Group(); head.position.y = 0.27; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.1, 18, 14), fur, { cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.072, 16, 12), face, { y: -0.015, z: 0.05, s: [1, 0.9, 0.65], cast: false }));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), face, { x: s * 0.1, y: 0.01, s: [0.55, 1, 1], cast: false }));
    head.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), dark, { x: s * 0.03, y: 0.01, z: 0.098, cast: false }));
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.13, 0.12, 0); body.add(sh);
    sh.add(mesh(new THREE.CapsuleGeometry(0.035, 0.2, 5, 8), fur, { y: -0.12, cast: false }));
    sh.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), face, { y: -0.25, cast: false }));
    arms.push(sh);
  }
  return { root, body, head, arms };
}
export function buildShipOutside() {
  const group = new THREE.Group(); group.name = 'shipOutside';
  group.userData.noAO = true;
  const WZ = 6.3 + 0.16; // 洗手间后墙外表面
  const davitM = lamp('#cdc6b0', 0.6, 0.18), boatM = lamp('#c85a1e', 0.55, 0.3), boatIn = lamp('#e0dacb', 0.7, 0.22), ropeM = lamp('#8a7a58', 0.9, 0.2);
  // 吊艇架：两根弯臂从船舷伸出来
  for (const x of [-1.6, 1.6]) {
    const pts = [V(x, -0.8, WZ + 0.1), V(x, 1.8, WZ + 0.2), V(x, 2.9, WZ + 0.8), V(x, 3.0, WZ + 1.9)];
    group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 8), davitM, { cast: false }));
  }
  const boat = new THREE.Group(); boat.position.set(0, 1.32, WZ + 1.9); group.add(boat);
  // 艇身：一个两头尖的"碗"
  const hull = new THREE.LatheGeometry([new THREE.Vector2(0.01, -0.5), new THREE.Vector2(0.5, -0.42), new THREE.Vector2(0.72, -0.1), new THREE.Vector2(0.75, 0.15)], 24);
  const hm = mesh(hull, boatM, { cast: false }); hm.scale.set(1, 1, 2.6); hm.material.side = THREE.DoubleSide; boat.add(hm);
  boat.add(mesh(new THREE.BoxGeometry(1.3, 0.04, 3.4), boatIn, { y: 0.0, cast: false }));
  for (const z of [-0.9, 0, 0.9]) boat.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 0.25), boatIn, { y: 0.1, z, cast: false }));
  boat.add(mesh(new THREE.TorusGeometry(0.74, 0.03, 6, 32), std('#e8e2d0', 0.5), { y: 0.15, rx: Math.PI / 2, s: [1, 2.6, 1], cast: false }));
  for (const x of [-1.6, 1.6]) group.add(mesh(cylBetween(V(x * 0.9, 3.0, WZ + 1.9), V(x * 0.3, 1.2, WZ + 1.9), 0.012, 5), ropeM, { cast: false }));
  const vestM = lamp('#d0561c', 0.6, 0.35);
  // 吊艇架上的一盏甲板灯
  const dl = glowSprite('#ffd8a0', 0.9, 0.9); dl.position.set(-1.6, 3.0, WZ + 1.2); group.add(dl);
  group.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 1.2), toneMapped: false }), { x: -1.6, y: 3.0, z: WZ + 1.2, cast: false }));
  const monkeys = [0, 1, 2].map((i) => { const m = makeMonkey(vestM); m.root.position.set((i - 1) * 0.42, -0.15, 0.2 + (i - 1) * 0.15); m.root.rotation.y = Math.PI; boat.add(m.root); return m; });
  const state = { t: 0, dur: 0 };
  // 三不猴的手势：捂眼睛 / 捂耳朵 / 捂嘴
  const POSE = [
    [[-2.6, 0, 0.35], [-2.6, 0, -0.35]],
    [[-1.6, 0, 1.9], [-1.6, 0, -1.9]],
    [[-2.2, 0, 0.18], [-2.2, 0, -0.18]],
  ];
  return {
    group,
    trigger(dur = 5) { state.t = 0; state.dur = dur; },
    get busy() { return state.t < state.dur; },
    update(dt, t) {
      state.t += dt;
      // 救生艇跟着船晃
      boat.rotation.z = SHIP_MOTION.roll(t) * 1.8 + Math.sin(t * 1.3) * 0.03;
      boat.rotation.x = Math.sin(t * 0.9) * 0.04;
      const on = state.t < state.dur;
      const k = on ? Math.min(1, state.t / 0.6, (state.dur - state.t) / 0.6) : 0;
      monkeys.forEach((m, i) => {
        m.root.position.y = lerp(-0.32, 0.02, k) + Math.sin(t * 3 + i) * 0.01 * k;
        m.head.rotation.y = Math.sin(t * 1.2 + i * 2) * 0.3 * (1 - k);
        const P = POSE[i];
        m.arms.forEach((a, s) => { a.rotation.set(P[s][0] * k, P[s][1], P[s][2] * k); });
      });
    },
  };
}

// ================= 装修船舱 =================
export function decorateShip(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, camBox, LAYOUT } = ctx;
  const { SZ, WR, DOOR, WW, TW } = LAYOUT;
  const rnd = mulberry32(3030);
  const props = new THREE.Group(); props.name = 'shipProps';
  const P = (o) => { props.add(o); return o; };
  const clean = new Set();
  const keep = (m) => { m.userData.brine = true; clean.add(m); return m; };
  const I4 = new THREE.Matrix4();
  const S = { h: 0.1 }; // 共享状态：积水的深度（屋子中心处的水面高度）
  refs.ship = S;

  // ===== 0. 收拾：电子产品、空调、日光灯、窗帘、原来的大窗户都收掉 =====
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.win.visible = false; refs.view.visible = false;
  refs.curtain.left.visible = false; refs.curtain.right.visible = false; refs.curtainRod.visible = false;
  for (const o of [refs.sticky, refs.studentId, refs.phone, refs.monitor.group, refs.keyboard, refs.mouse, refs.tower, refs.strip, refs.monitor2, refs.headset, refs.ac, refs.remote, refs.helmet, refs.stoolH, refs.broom, refs.pinkBag, refs.latiao, refs.farLamp, refs.bin]) if (o) o.visible = false;
  for (const fx of refs.fixtures) fx.visible = false;
  refs.lock.group.visible = false; refs.lock.dropped.visible = false;
  collision.setEnabled('lockCable', false);
  const D1 = refs.desks.D1, D2 = refs.desks.D2;
  for (const c of D1.children) if (c.isMesh && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.x - 0.26) < 0.01) c.visible = false;
  refs.calendar.group.visible = false;
  // 笔记本 → 航海日志（贴图在 buildShipTextures 里换了），挪到电报台左手边
  refs.notebook.position.set(-0.17, 0.76, 0.135);
  mark('logbook', refs.notebook);
  if (D2) for (const c of D2.children) if (Math.abs(c.position.x + 0.05) < 0.01 && Math.abs(c.position.z - 0.1) < 0.01) c.visible = false;
  // 头盔凳子搬走（连同碰撞）；垃圾桶的位置给舱底泵
  collision.boxes = collision.boxes.filter((b) => !(Math.abs(b.minX + 1.0) < 1e-6 && Math.abs(b.minZ - 2.05) < 1e-6) && !(Math.abs(b.minX - 0.5) < 1e-6 && Math.abs(b.minZ - (SZ - 0.34)) < 1e-6));
  // 窗边书桌：前半边腾出来铺海图、让扳手滑
  for (const o of refs.sections.far) { const p = o.position; if (p.y > 0.7 && p.z > -3.3) o.visible = false; }
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh && rnd() < 0.7) o.visible = false; });
  // 蚊帐收掉（船上的铺位挂帘子，不挂蚊帐）
  root.traverse((o) => { if (o.isMesh && o.material && o.material.map === T.net) o.visible = false; });
  refs.gap.line.color.set('#5a6a78');

  // ===== 1. 墙 / 天花板 / 地板 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.55 });
  M.wall.needsUpdate = true;
  T.ceiling.repeat.set(3.6, 8.1); T.ceilingN.repeat.set(3.6, 8.1);
  Object.assign(M.ceiling, { normalMap: T.ceilingN, roughness: 0.75, envMapIntensity: 0.3 }); M.ceiling.needsUpdate = true;
  M.floor.normalScale.set(1.2, 1.2); M.floor.envMapIntensity = 0.7; M.floor.roughness = 1;
  M.floorDirt.polygonOffsetFactor = -2;
  keep(M.wall); keep(M.ceiling); keep(M.floor); keep(M.floorDirt);
  // 月光只该从舷窗透进来：天花板原来不投影，斜着照进来的月光会从北墙顶上"翻"进屋里
  root.traverse((o) => { if (o.isMesh && o.material === M.ceiling) o.castShadow = true; });

  // ===== 2. 北墙：原来的大窗洞补上钢板，开三个舷窗 =====
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-1.35, 0.95); plateShape.lineTo(1.35, 0.95); plateShape.lineTo(1.35, 2.55); plateShape.lineTo(-1.35, 2.55); plateShape.lineTo(-1.35, 0.95);
  for (const px of PORTHOLES) { const h = new THREE.Path(); h.absarc(px, 1.72, 0.2 * PSC, 0, Math.PI * 2, true); plateShape.holes.push(h); }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.16, bevelEnabled: false, curveSegments: 40 });
  const plate = mesh(plateGeo, M.wall, { z: -3.76 });
  K.worldUV(plate, 0.5, 1 / 3);
  add(plate); refs.occluders.push(plate);
  const brassM = keep(std('#9a7438', 0.32, 0.9));
  const steelPaint = keep(std('#bdb6a0', 0.55, 0.25));
  const rubberM = keep(std('#141414', 0.9));
  const hexGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6); hexGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.LatheGeometry([[0.2, 0], [0.2, 0.018], [0.212, 0.032], [0.25, 0.036], [0.268, 0.024], [0.272, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 48); rimGeo.rotateX(Math.PI / 2);
  const portholes = PORTHOLES.map((px, idx) => {
    const g = new THREE.Group(); g.position.set(px, 1.72, -3.6); g.scale.set(PSC, PSC, 1); g.userData.idx = idx;
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 40, 1, true), keep(std('#8a8474', 0.6, 0.4, { side: THREE.DoubleSide })), { z: -0.08, rx: Math.PI / 2, cast: false }));
    g.add(mesh(rimGeo, brassM, { z: 0.0 }));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; g.add(mesh(hexGeo, brassM, { x: Math.cos(a) * 0.245, y: Math.sin(a) * 0.245, z: 0.04, cast: false })); }
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 40), brassM, { z: -0.1, cast: false }));
    // 玻璃：水珠 + 浪打上来时的水帘
    const glassU = { uTime: { value: 0 }, uWash: { value: 0 }, uSeed: { value: idx * 13.7 } };
    const glass = mesh(new THREE.CircleGeometry(0.2, 40), new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false }), { z: -0.1, cast: false, recv: false });
    glass.renderOrder = 3;
    g.add(noRay(glass));
    // 舷窗盖（铁盖）：合页在左边，往屋里、往左翻开贴到墙上
    const hinge = new THREE.Group(); hinge.position.set(-0.29, 0, 0.05); g.add(hinge);
    const lid = new THREE.Group(); lid.position.set(0.29, 0, 0); hinge.add(lid);
    lid.add(mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.026, 40), steelPaint, { rx: Math.PI / 2 }));
    lid.add(mesh(new THREE.TorusGeometry(0.228, 0.011, 6, 40), rubberM, { z: -0.014, cast: false }));
    lid.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), steelPaint, { z: 0.018, rx: Math.PI / 2 }));
    lid.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 0.03), steelPaint, { x: -0.25, z: 0.005 }));
    for (let k = 0; k < 3; k++) lid.add(mesh(new THREE.BoxGeometry(0.3, 0.012, 0.012), steelPaint, { z: 0.019, rz: (k / 3) * Math.PI, cast: false }));
    for (const y of [-0.12, 0.12]) hinge.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 10), brassM, { y, cast: false }));
    // 两个蝶形螺母（压紧铁盖的"狗"）：螺杆挂在舷窗框上、翻上来卡住铁盖的右边
    const dogs = [-0.35, 0.35].map((a) => {
      const piv = new THREE.Group(); piv.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0.02); piv.rotation.z = a; g.add(piv);
      const arm = new THREE.Group(); piv.add(arm);
      arm.add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 8), brassM, { z: 0.035, rx: Math.PI / 2, cast: false }));
      const nut = new THREE.Group(); nut.position.z = 0.058; arm.add(nut);
      nut.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 8), brassM, { rx: Math.PI / 2, cast: false }));
      for (const s of [-1, 1]) nut.add(mesh(new THREE.BoxGeometry(0.018, 0.034, 0.005), brassM, { x: 0, y: s * 0.024, cast: false }));
      return { piv, arm, nut };
    });
    compact(lid);
    P(g); mark('porthole', g);
    return { group: g, px, idx, hinge, lid, dogs, glassU, open: false, busy: false };
  });
  refs.portholes = portholes;

  // ===== 3. 窗外：海、天、灯塔、远处的货轮（整个跟着船晃）+ 会跃出海面的鲸 =====
  const sea = buildSea(rnd);
  add(sea.pivot);
  refs.sea = sea;
  const whale = buildWhale();
  sea.pivot.children[0].add(whale.root);
  refs.whale = whale;

  // ===== 4. 天花板：横梁 + 沿墙顶的管子 + 电缆桥架；东墙那根管子的法兰在漏水 =====
  const beamM = keep(std('#b2ab96', 0.6, 0.3));
  const pipeM = std('#5a6058', 0.5, 0.6);
  const bb = new Batch();
  for (const z of [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2]) {
    bb.add(new THREE.BoxGeometry(3.6, 0.2, 0.012), beamM, I4.makeTranslation(0, 2.9, z));
    bb.add(new THREE.BoxGeometry(3.6, 0.012, 0.09), beamM, I4.makeTranslation(0, 2.8, z));
    // 肘板
    for (const x of [-1.72, 1.72]) bb.add(new THREE.BoxGeometry(0.16, 0.16, 0.01), beamM, I4.makeTranslation(x, 2.78, z));
  }
  // 东墙上的肋骨（船壳的框架）
  for (let z = -3.3; z < 4.4; z += 0.6) bb.add(new THREE.BoxGeometry(0.05, 2.9, 0.012), beamM, I4.makeTranslation(1.775, 1.45, z));
  bb.build(props, { cast: true, name: 'beams' });
  const pipes = [
    [V(-1.7, 2.62, -3.5), V(-1.7, 2.62, 3.5), 0.04], [V(1.68, 2.66, -3.5), V(1.68, 2.66, 4.38), 0.045],
    [V(-1.62, 2.72, -3.5), V(-1.62, 2.72, 3.5), 0.028],
  ];
  const pb = new Batch();
  for (const [a, b, r] of pipes) {
    pb.add(cylBetween(a, b, r, 12), pipeM, I4.identity());
    const len = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    for (let s = 0.7; s < len - 0.2; s += 1.4) { const p = a.clone().addScaledVector(dir, s); pb.add(cylBetween(p.clone().addScaledVector(dir, -0.02), p.clone().addScaledVector(dir, 0.02), r * 1.6, 12), pipeM, I4.identity()); }
  }
  // 电缆桥架（西墙顶上）
  for (let z = -3.4; z < 3.5; z += 0.3) pb.add(new THREE.BoxGeometry(0.2, 0.01, 0.02), keep(std('#3a3a36', 0.6, 0.5)), I4.makeTranslation(-1.55, 2.84, z));
  for (let k = 0; k < 5; k++) pb.add(cylBetween(V(-1.62 + k * 0.03, 2.86, -3.4), V(-1.62 + k * 0.03, 2.86, 3.5), 0.01, 6), keep(std(['#1a1a1a', '#2a2622', '#3a2a1a', '#1a1a22', '#222'][k], 0.7)), I4.identity());
  pb.build(props, { cast: false, name: 'pipes' });
  // 漏水的法兰（东墙管子上，第二张书桌上方）
  const leak = new THREE.Group(); leak.position.set(1.68, 2.66, -1.35);
  leak.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), pipeM, { rx: Math.PI / 2 }));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; leak.add(mesh(hexGeo, keep(std('#6a4a2a', 0.5, 0.6)), { x: Math.sin(a) * 0.058, y: Math.cos(a) * 0.058, z: 0.028, cast: false })); }
  P(leak); mark('leak', leak);
  refs.leak = { group: leak, on: true, pos: V(1.62, 2.6, -1.3) };

  // ===== 5. 地上的积水：跟着船晃（水面永远是平的，屋子在晃）=====
  const waterN = TS.genWaterNormal(); waterN.repeat.set(3, 7);
  const waterM = keep(new THREE.MeshStandardMaterial({ color: '#122824', roughness: 0.13, metalness: 0.1, transparent: true, opacity: 0.84, normalMap: waterN, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 1.2, depthWrite: false }));
  const RL = SZ - (-3.6), RC = (SZ - 3.6) / 2;
  const wg = new THREE.PlaneGeometry(3.6, RL, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = mesh(wg, waterM, { y: S.h, z: RC, cast: false, recv: true });
  water.renderOrder = 2;
  P(noRay(water));
  refs.water = { mesh: water, mat: waterM, normal: waterN, zc: RC };
  // 甲板上刷的白漆字（被水盖着）
  const stC = TX.makeCanvas(512, 256);
  const stTex = TX.toTex(stC, { wrap: false });
  const stencil = mesh(new THREE.PlaneGeometry(1.2, 0.6), keep(new THREE.MeshStandardMaterial({ map: stTex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })), { y: 0.004, z: -0.35, rx: -Math.PI / 2, cast: false });
  P(stencil); mark('stencil', stencil);
  refs.stencil = { mesh: stencil, canvas: stC, tex: stTex };
  // 漂在水上的东西：一只拖鞋、一个塑料瓶、一只纸船
  const floaters = [];
  const flip = new THREE.Group();
  flip.add(mesh(new THREE.BoxGeometry(0.1, 0.018, 0.26), std('#2a5a8a', 0.8), { cast: false }));
  flip.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 10, Math.PI), std('#e8e0d0', 0.7), { y: 0.01, z: 0.03, cast: false }));
  floaters.push({ o: P(flip), x: -0.3, z: 1.4, ph: 0.3 });
  const bottle = K.bottle({ h: 0.26, r: 0.035, label: 'water' }); bottle.rotation.z = Math.PI / 2;
  floaters.push({ o: P(bottle), x: 0.35, z: -1.6, ph: 2.1, lie: true });
  const boatP = new THREE.Group();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, 0.06, 0, -0.06, 0.02, -0.03, 0.06, 0.02, -0.03, 0, 0, 0, -0.06, 0.02, 0.03, 0.06, 0.02, 0.03, 0, 0, 0], 3));
  pg.computeVertexNormals();
  boatP.add(mesh(pg, std('#e8e2d0', 0.9, 0, { side: THREE.DoubleSide, map: T.paperMath[0] }), { cast: false }));
  floaters.push({ o: P(boatP), x: 0.1, z: 2.6, ph: 4.4 });
  refs.floaters = floaters;
  noRay(flip); noRay(bottle); noRay(boatP);

  // ===== 6. 窗边书桌 → 海图桌：海图、分规、平行尺、一只马克杯；桌上滑来滑去的扳手 =====
  const FT = 0.74;
  P(mesh(new THREE.PlaneGeometry(1.0, 0.62), keep(new THREE.MeshStandardMaterial({ map: TS.genChart(), roughness: 0.85 })), { x: -0.18, y: FT + 0.003, z: -3.22, rx: -Math.PI / 2, rz: 0.03, cast: false }));
  const divid = new THREE.Group(); divid.position.set(0.12, FT + 0.01, -3.25); divid.rotation.y = 0.6;
  for (const s of [-1, 1]) divid.add(mesh(new THREE.BoxGeometry(0.006, 0.004, 0.15), brassM, { x: s * 0.018, z: 0.07, ry: s * 0.12, cast: false }));
  P(divid);
  P(mesh(new THREE.BoxGeometry(0.34, 0.01, 0.07), keep(std('#3a2a1a', 0.5)), { x: -0.45, y: FT + 0.008, z: -3.12, ry: -0.2, cast: false }));
  const mug = K.cup('#e8e2d0'); mug.position.set(0.55, FT, -3.3); P(mug);
  mark('chart', P(mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshBasicMaterial({ visible: false }), { x: -0.18, y: FT + 0.006, z: -3.22, rx: -Math.PI / 2 })));
  // 活动扳手
  const wrench = new THREE.Group(); wrench.position.set(0.3, FT + 0.012, -2.98); wrench.rotation.y = 0.15;
  const wM = keep(std('#8a8e90', 0.35, 0.9));
  wrench.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.028), wM, { cast: false }));
  wrench.add(mesh(new THREE.BoxGeometry(0.05, 0.016, 0.07), wM, { x: 0.12, cast: false }));
  wrench.add(mesh(new THREE.BoxGeometry(0.03, 0.016, 0.025), wM, { x: 0.15, z: -0.03, cast: false }));
  wrench.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), keep(std('#6a6e70', 0.4, 0.8)), { x: 0.1, z: 0.012, rz: Math.PI / 2, cast: false }));
  wrench.add(mesh(new THREE.BoxGeometry(0.1, 0.014, 0.03), keep(std('#8a1a14', 0.7)), { x: -0.06, cast: false }));
  P(wrench); mark('wrench', wrench);
  refs.wrench = { group: wrench, x: 0.3, v: 0, y: FT + 0.012, z: -2.98, taken: false };

  // ===== 7. 我的书桌 → 电报台：电子管收音机、电键、纸带收报机、耳机；天线从天花板上垂下来 =====
  const DT = 0.76;
  const radio = new THREE.Group(); radio.position.set(1.6, DT, 0.4); radio.rotation.y = -Math.PI / 2; // 正面朝西（屋里）
  const caseM = keep(std('#3a2a1c', 0.55, 0.05, { map: T.woodDark }));
  const panelM = keep(std('#2a2c2a', 0.45, 0.4));
  radio.add(mesh(new THREE.BoxGeometry(0.46, 0.28, 0.26), caseM, { y: 0.14 }));
  radio.add(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.01), panelM, { y: 0.14, z: 0.131 }));
  // 琥珀色刻度窗
  const dialM = keep(new THREE.MeshStandardMaterial({ color: '#2a1a08', emissive: new THREE.Color('#ffa040'), emissiveIntensity: 0, roughness: 0.4 }));
  radio.add(mesh(new THREE.PlaneGeometry(0.24, 0.07), dialM, { x: -0.05, y: 0.19, z: 0.137, cast: false }));
  const needle = mesh(new THREE.BoxGeometry(0.003, 0.06, 0.002), keep(std('#c83a1a', 0.5)), { x: -0.1, y: 0.19, z: 0.139, cast: false });
  radio.add(needle);
  // 调谐"魔眼"（绿色的电子管指示）
  const eyeM = keep(new THREE.MeshStandardMaterial({ color: '#0a1a0a', emissive: new THREE.Color('#3aff6a'), emissiveIntensity: 0, roughness: 0.3 }));
  radio.add(mesh(new THREE.CircleGeometry(0.02, 20), eyeM, { x: 0.14, y: 0.19, z: 0.137, cast: false }));
  for (const [x, r] of [[-0.14, 0.024], [-0.05, 0.02], [0.05, 0.02], [0.14, 0.028]]) radio.add(mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.025, 20), keep(std('#1a1614', 0.4)), { x, y: 0.08, z: 0.145, rx: Math.PI / 2 }));
  // 顶上的散热格栅，里面透出电子管的光
  const tubeM = keep(new THREE.MeshStandardMaterial({ color: '#1a0e06', emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0, roughness: 0.3 }));
  for (let k = 0; k < 4; k++) radio.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), tubeM, { x: -0.12 + k * 0.08, y: 0.25, z: -0.02, cast: false }));
  for (let k = 0; k < 9; k++) radio.add(mesh(new THREE.BoxGeometry(0.44, 0.004, 0.006), panelM, { y: 0.281, z: -0.1 + k * 0.025, cast: false }));
  // 天线接线柱（背面顶上）
  radio.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), brassM, { x: 0.18, y: 0.3, z: -0.1, cast: false }));
  // 电源开关
  const pwr = mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), keep(std('#c8c0a8', 0.4, 0.5)), { x: 0.19, y: 0.06, z: 0.14, rx: 0.4, cast: false });
  radio.add(pwr);
  compact(radio, [needle, pwr]);
  P(radio); mark('radio', radio);
  // 电键（发报用的键）
  const keyG = new THREE.Group(); keyG.position.set(1.32, DT, 0.2); keyG.rotation.y = -Math.PI / 2;
  keyG.add(mesh(new THREE.BoxGeometry(0.08, 0.012, 0.14), keep(std('#1a1614', 0.4)), { y: 0.006 }));
  const lever = new THREE.Group(); lever.position.set(0, 0.03, -0.03); keyG.add(lever);
  lever.add(mesh(new THREE.BoxGeometry(0.012, 0.008, 0.12), brassM, { z: 0.04, cast: false }));
  lever.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 16), keep(std('#101010', 0.4)), { y: 0.008, z: 0.1, cast: false }));
  P(keyG); mark('morseKey', keyG);
  // 纸带收报机：一卷纸 + 压纸轮，纸带从出口吐出来，沿着桌面往屋里伸
  const inker = new THREE.Group(); inker.position.set(1.62, DT, -0.12); inker.rotation.y = -Math.PI / 2;
  inker.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), panelM, { y: 0.05 }));
  inker.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), keep(std('#e0d6bc', 0.9)), { x: -0.05, y: 0.16, rz: Math.PI / 2, rx: Math.PI / 2 }));
  inker.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 10), brassM, { x: 0.06, y: 0.1, z: 0.07, rx: Math.PI / 2, cast: false }));
  compact(inker);
  P(inker);
  const tapeC = TX.makeCanvas(1024, 40);
  TS.drawTape(tapeC, [], { n: 0 });
  const tapeTex = TX.toTex(tapeC, { wrap: false });
  const tapeM = keep(new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.9, side: THREE.DoubleSide }));
  const tapeG = new THREE.Group(); tapeG.position.set(1.53, DT + 0.004, -0.12); // 纸带从收报机出口往西（-x）伸，最长伸到桌沿
  const tape = mesh(new THREE.PlaneGeometry(1, 0.025), tapeM, { x: -0.5, rx: -Math.PI / 2, cast: false });
  tapeG.add(tape); tapeG.scale.x = 0.001;
  P(tapeG); mark('tape', tape);
  refs.radio = { group: radio, dialM, eyeM, tubeM, needle, pwr, lever, tapeG, tapeC, tapeTex, on: false, warm: 0 };
  // 摩尔斯电码表：钉在东墙上
  const chartTex = TS.genMorseChart();
  const mc = mesh(new THREE.PlaneGeometry(0.3, 0.425), keep(new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.9 })), { x: 1.788, y: 1.5, z: 0.4, ry: -Math.PI / 2, cast: false });
  P(mc); mark('morseChart', mc);
  refs.morseChart = chartTex;
  // 天线：天花板上一个瓷绝缘子，一根线垂下来，线头耷拉在墙边
  const ins = new THREE.Group(); ins.position.set(1.55, 2.94, 0.45);
  ins.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.06, 12), keep(std('#e8e0d0', 0.2)), { cast: false }));
  P(ins);
  const antTop = V(1.55, 2.9, 0.45), antPlug = V(1.6 + 0.1, DT + 0.3, 0.4 + 0.18);
  const antLoose = V(1.74, 1.3, 0.7);
  const antM = keep(std('#1a1a1a', 0.6));
  const antWire = mesh(new THREE.TubeGeometry(sagCurve(antTop, antLoose, 0.18, 16), 24, 0.005, 5), antM, { cast: false });
  P(antWire);
  const antEnd = new THREE.Group(); antEnd.position.copy(antLoose);
  antEnd.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), keep(std('#8a1a14', 0.5)), { cast: false }));
  antEnd.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), brassM, { y: -0.035, cast: false }));
  P(antEnd); mark('antenna', antEnd);
  refs.antenna = { wire: antWire, end: antEnd, top: antTop, plug: antPlug, loose: antLoose, connected: false, rebuild(p, sag) { antWire.geometry.dispose(); antWire.geometry = new THREE.TubeGeometry(sagCurve(antTop, p, sag, 16), 24, 0.005, 5); } };

  // ===== 8. 手摇舱底泵（南墙，洗手间门东边）=====
  const pump = new THREE.Group(); pump.position.set(0.74, 0, SZ - 0.13);
  const castM = keep(std('#2a3430', 0.6, 0.5));
  pump.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 20), castM, { y: 0.45 }));
  pump.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20), castM, { y: 0.02 }));
  pump.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 20), castM, { y: 0.93 }));
  pump.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 12), castM, { x: 0.16, y: 0.72, rz: Math.PI / 2 })); // 出水口
  pump.add(mesh(cylBetween(V(0.28, 0.72, 0), V(0.28, 0.72, 0.13), 0.03, 10), castM, { cast: false }));
  pump.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), castM, { y: 0.1, x: -0.1, rz: Math.PI / 2 })); // 进水口（伸进水里）
  // 摇杆的支架
  pump.add(mesh(new THREE.BoxGeometry(0.04, 0.2, 0.08), castM, { y: 1.06 }));
  const leverPiv = new THREE.Group(); leverPiv.position.set(0, 1.12, 0); pump.add(leverPiv);
  const pumpLever = new THREE.Group(); pumpLever.visible = false; leverPiv.add(pumpLever);
  const barM = keep(std('#6a6e70', 0.4, 0.8)), gripM = keep(std('#8a1a14', 0.7));
  pumpLever.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 10), barM, { z: -0.36, rx: Math.PI / 2, cast: false }));
  pumpLever.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), gripM, { z: -0.72, rx: Math.PI / 2, cast: false }));
  pump.add(mesh(new THREE.PlaneGeometry(0.16, 0.2), keep(new THREE.MeshStandardMaterial({ map: TS.genCrateSide('BILGE', '舱底泵', 3241), roughness: 0.8 })), { y: 0.55, z: 0.105, cast: false }));
  compact(pump, [leverPiv]);
  P(pump); mark('pump', pump);
  block(0.58, 0.92, SZ - 0.28, SZ, 'pump', 1.1);
  refs.pump = { group: pump, piv: leverPiv, lever: pumpLever, strokes: 0 };

  // ===== 9. 天花板上的货网：兜着行李袋、一卷绳子……还有泵把手 =====
  const NX0 = -0.62, NX1 = 0.62, NZ0 = 0.15, NZ1 = 1.55, NY = 2.93, SAG = 0.42;
  const netY = (x, z) => NY - SAG * (1 - ((x - (NX0 + NX1) / 2) / ((NX1 - NX0) / 2)) ** 2) * (1 - ((z - (NZ0 + NZ1) / 2) / ((NZ1 - NZ0) / 2)) ** 2);
  const ropeM = keep(std('#9a8a64', 0.95));
  const nb = new Batch();
  const line = (pts) => { for (let i = 0; i < pts.length - 1; i++) nb.add(cylBetween(pts[i], pts[i + 1], 0.005, 4), ropeM, I4.identity()); };
  for (let i = 0; i <= 8; i++) { const x = lerp(NX0, NX1, i / 8); const pts = []; for (let j = 0; j <= 10; j++) { const z = lerp(NZ0, NZ1, j / 10); pts.push(V(x, netY(x, z), z)); } line(pts); }
  for (let j = 0; j <= 10; j++) { const z = lerp(NZ0, NZ1, j / 10); const pts = []; for (let i = 0; i <= 8; i++) { const x = lerp(NX0, NX1, i / 8); pts.push(V(x, netY(x, z), z)); } line(pts); }
  for (const [x, z] of [[NX0, NZ0], [NX1, NZ0], [NX0, NZ1], [NX1, NZ1]]) nb.add(new THREE.TorusGeometry(0.03, 0.008, 6, 12), brassM, I4.makeTranslation(x, NY + 0.02, z));
  const netMeshes = nb.build(props, { cast: false, name: 'cargoNet' });
  // 网里的东西
  const duffel = mesh(new THREE.CapsuleGeometry(0.14, 0.4, 6, 12), std('#4a5a3a', 0.95), { x: -0.25, y: netY(-0.25, 0.6) + 0.13, z: 0.6, rz: Math.PI / 2, ry: 0.3 });
  P(duffel);
  const coil = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), ropeM, { x: 0.3, y: netY(0.3, 1.2) + 0.04, z: 1.2, rx: Math.PI / 2 });
  P(coil);
  const netLever = new THREE.Group(); netLever.position.set(0.12, netY(0.12, 0.85) + 0.03, 0.85); netLever.rotation.set(0, 0.7, 0.08);
  netLever.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 10), barM, { rz: Math.PI / 2, cast: false }));
  netLever.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), gripM, { x: -0.36, rz: Math.PI / 2, cast: false }));
  P(netLever);
  // 整张网的射线目标（网眼太细，点不中）
  const netHit = mesh(new THREE.BoxGeometry(NX1 - NX0, 0.3, NZ1 - NZ0), new THREE.MeshBasicMaterial({ visible: false }), { x: 0, y: NY - SAG + 0.12, z: (NZ0 + NZ1) / 2 });
  P(netHit);
  for (const o of [...netMeshes, duffel, coil, netLever, netHit]) mark('cargoNet', o);
  refs.cargoNet = { lever: netLever, hit: netHit };

  // ===== 10. 水密门：钢门 + 一圈压紧把手 + 中间的转轮 + 门上的转盘密码锁 =====
  const dp = refs.door.pivot, DW = DOOR.z1 - DOOR.z0 - 0.02;
  const doorSteel = keep(std('#4a5a52', 0.55, 0.35));
  refs.door.slab.material = doorSteel;
  for (const c of dp.children) if (c !== refs.door.slab) c.visible = false; // 原来的门把手、猫眼、值日表
  const rb = new Batch();
  for (const y of [0.35, 1.0, 1.65]) rb.add(new THREE.BoxGeometry(DW - 0.1, 0.05, 0.03), doorSteel, I4.makeTranslation(-DW / 2, y, -0.034));
  rb.add(new THREE.BoxGeometry(0.05, 1.9, 0.03), doorSteel, I4.makeTranslation(-DW / 2, 1.0, -0.034));
  rb.build(dp, { cast: true, name: 'doorRibs' }).forEach((m) => mark('door', m));
  const wheel = new THREE.Group(); wheel.position.set(-DW / 2, 1.08, -0.07); dp.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.15, 0.013, 8, 28), keep(std('#8a1a14', 0.55, 0.3))));
  for (let k = 0; k < 3; k++) wheel.add(mesh(new THREE.BoxGeometry(0.3, 0.018, 0.012), keep(std('#8a1a14', 0.55, 0.3)), { rz: (k / 3) * Math.PI, cast: false }));
  wheel.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), doorSteel, { rx: Math.PI / 2, z: 0.02 }));
  const doorDogs = [];
  for (const [x, y] of [[-0.05, 0.3], [-0.05, 1.75], [-(DW - 0.05), 0.3], [-(DW - 0.05), 1.75], [-DW / 2, 1.98], [-(DW - 0.05), 1.05]]) {
    const d = new THREE.Group(); d.position.set(x, y, -0.04); dp.add(d);
    d.add(mesh(new THREE.BoxGeometry(0.03, 0.14, 0.022), keep(std('#6a6e6a', 0.45, 0.7)), { y: 0.05, cast: false }));
    d.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), keep(std('#6a6e6a', 0.45, 0.7)), { rx: Math.PI / 2, cast: false }));
    doorDogs.push(d);
  }
  // 门上的转盘密码锁：一个黄铜小盒子、三个转盘、一盏指示灯
  const combo = new THREE.Group(); combo.position.set(-(DW - 0.14), 1.28, -0.06); dp.add(combo);
  combo.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.04), brassM));
  for (let i = 0; i < 3; i++) combo.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 16), keep(std('#1a1614', 0.4)), { x: -0.045 + i * 0.045, y: -0.01, z: -0.024, rx: Math.PI / 2, cast: false }));
  const lockLampM = keep(new THREE.MeshStandardMaterial({ color: '#300a06', emissive: new THREE.Color('#ff3a1a'), emissiveIntensity: 2.2 }));
  combo.add(mesh(new THREE.SphereGeometry(0.008, 10, 8), lockLampM, { x: 0.06, y: 0.04, z: -0.022, cast: false }));
  // 门上的标牌（屋里那一面）
  dp.add(mesh(new THREE.PlaneGeometry(0.22, 0.275), keep(new THREE.MeshStandardMaterial({ map: TS.genShipSign('door'), roughness: 0.7 })), { x: -DW / 2, y: 1.6, z: -0.05, ry: Math.PI, cast: false }));
  mark('door', wheel); mark('door', combo);
  for (const d of doorDogs) mark('door', d);
  refs.shipLock = { wheel, dogs: doorDogs, combo, lamp: lockLampM };
  // 门框：包一圈加厚的钢框
  const frameB = new Batch();
  frameB.add(new THREE.BoxGeometry(0.06, 2.16, 0.1), doorSteel, I4.makeTranslation(-1.77, 1.08, DOOR.z0 - 0.05));
  frameB.add(new THREE.BoxGeometry(0.06, 2.16, 0.1), doorSteel, I4.makeTranslation(-1.77, 1.08, DOOR.z1 + 0.05));
  frameB.add(new THREE.BoxGeometry(0.06, 0.1, DOOR.z1 - DOOR.z0 + 0.2), doorSteel, I4.makeTranslation(-1.77, 2.1, (DOOR.z0 + DOOR.z1) / 2));
  frameB.add(new THREE.BoxGeometry(0.16, 0.05, DOOR.z1 - DOOR.z0), doorSteel, I4.makeTranslation(-1.8 - TW / 2 + 0.08, 0.025, (DOOR.z0 + DOOR.z1) / 2));
  frameB.build(props, { cast: true, name: 'doorFrame' });

  // ===== 11. 救生圈、救生衣、铜钟、船钟、气压计、灭火器、标牌、木箱 =====
  const ring = mesh(new THREE.TorusGeometry(0.26, 0.07, 14, 36), keep(new THREE.MeshStandardMaterial({ map: TS.genLifeRing(), roughness: 0.65 })), { x: -1.77, y: 2.2, z: 0.25, ry: Math.PI / 2 });
  P(ring); mark('lifeRing', ring);
  P(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), brassM, { x: -1.76, y: 2.47, z: 0.25, rz: Math.PI / 2, cast: false }));
  // 救生衣：三件挂在门边
  const vestM = keep(std('#c85518', 0.6)), stripM = keep(std('#b8bcc0', 0.3, 0.6));
  const vests = new THREE.Group();
  [2.95, 3.18, 3.41].forEach((z, i) => {
    const v = new THREE.Group(); v.position.set(-1.72, 1.62 - (i % 2) * 0.03, z); v.rotation.set(0, Math.PI / 2, (i - 1) * 0.04);
    v.add(mesh(new THREE.BoxGeometry(0.3, 0.46, 0.1), vestM, { y: -0.2 }));
    v.add(mesh(new THREE.BoxGeometry(0.1, 0.18, 0.09), vestM, { y: 0.08 }));
    for (const y of [-0.12, -0.3]) v.add(mesh(new THREE.BoxGeometry(0.31, 0.03, 0.105), stripM, { y, cast: false }));
    v.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), brassM, { y: 0.19, rx: Math.PI / 2, cast: false }));
    vests.add(v);
  });
  compact(vests);
  P(vests); mark('vests', vests);
  P(mesh(new THREE.PlaneGeometry(0.16, 0.2), keep(new THREE.MeshStandardMaterial({ map: TS.genShipSign('vest'), roughness: 0.7 })), { x: -1.788, y: 2.02, z: 3.18, ry: Math.PI / 2, cast: false }));
  // 铜钟：南墙上、镜子和西墙之间，高过门顶
  const bell = new THREE.Group(); bell.position.set(-1.28, 2.18, SZ - 0.12);
  bell.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), brassM, { y: 0.16, z: 0.06 }));
  bell.add(mesh(new THREE.LatheGeometry([[0.01, 0.12], [0.05, 0.11], [0.065, 0.05], [0.075, -0.02], [0.095, -0.07], [0.1, -0.08]].map(([r, y]) => new THREE.Vector2(r, y)), 24), keep(std('#b8883a', 0.25, 0.95, { side: THREE.DoubleSide }))));
  const clapper = new THREE.Group(); clapper.position.y = 0.08; bell.add(clapper);
  clapper.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), brassM, { y: -0.07, cast: false }));
  clapper.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), brassM, { y: -0.14, cast: false }));
  const bellRope = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), ropeM, { y: -0.3, cast: false });
  clapper.add(bellRope);
  P(bell); mark('bell', bell);
  P(mesh(new THREE.PlaneGeometry(0.2, 0.25), keep(new THREE.MeshStandardMaterial({ map: TS.genShipSign('bell'), roughness: 0.8 })), { x: -1.28, y: 1.72, z: SZ - 0.012, ry: Math.PI, cast: false }));
  refs.bell = { group: bell, clapper };
  // 船钟：原来的挂钟换成黄铜外壳；旁边一只气压计
  refs.clock.children[0].material = brassM;
  const baro = new THREE.Group(); baro.position.set(0.82, 2.32, SZ - 0.02); baro.rotation.y = Math.PI;
  baro.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 32), brassM, { rx: Math.PI / 2 }));
  const bC = TX.makeCanvas(128, 128), bx = bC.getContext('2d');
  bx.fillStyle = '#e6dfca'; bx.beginPath(); bx.arc(64, 64, 64, 0, 6.28); bx.fill();
  bx.strokeStyle = '#1a1814'; bx.lineWidth = 2; for (let k = 0; k <= 20; k++) { const a = Math.PI * 0.8 + (k / 20) * Math.PI * 1.4; bx.beginPath(); bx.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); bx.lineTo(64 + Math.cos(a) * (k % 5 ? 54 : 58), 64 + Math.sin(a) * (k % 5 ? 54 : 58)); bx.stroke(); }
  bx.fillStyle = '#1a1814'; bx.font = 'bold 11px Georgia'; bx.textAlign = 'center';
  bx.fillText('STORMY', 30, 84); bx.fillText('RAIN', 42, 30); bx.fillText('CHANGE', 64, 20); bx.fillText('FAIR', 88, 30); bx.fillText('暴风', 98, 84);
  bx.strokeStyle = '#6a1a10'; bx.lineWidth = 3; bx.beginPath(); bx.moveTo(64, 64); bx.lineTo(64 + Math.cos(Math.PI * 0.95) * 44, 64 + Math.sin(Math.PI * 0.95) * 44); bx.stroke();
  baro.add(mesh(new THREE.CircleGeometry(0.115, 32), keep(new THREE.MeshStandardMaterial({ map: TX.toTex(bC, { wrap: false }), roughness: 0.5 })), { z: 0.021, cast: false }));
  compact(baro);
  P(baro); mark('barometer', baro);
  // 传声筒：一根铜管从天花板顺着西墙下来，喇叭口上扣着哨子盖——甲板上的人往里一吹，这边就"嘘——"地响
  const vp = new THREE.Group(); vp.position.set(-1.74, 0, 1.42);
  vp.add(mesh(cylBetween(V(0, 2.95, 0), V(0, 1.62, 0), 0.028, 12), brassM));
  vp.add(mesh(new THREE.TorusGeometry(0.05, 0.028, 8, 16, Math.PI / 2), brassM, { x: 0.05, y: 1.62, rz: Math.PI, ry: 0 }));
  vp.add(mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.12, 20, 1, true), keep(std('#9a7438', 0.32, 0.9, { side: THREE.DoubleSide })), { x: 0.12, y: 1.57, rz: Math.PI / 2 }));
  const whistle = new THREE.Group(); whistle.position.set(0.185, 1.57, 0); vp.add(whistle);
  whistle.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), brassM, { rz: Math.PI / 2 }));
  whistle.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), brassM, { x: 0.02, rz: Math.PI / 2, cast: false }));
  for (const y of [2.6, 2.0]) vp.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.07), keep(std('#3a3a36', 0.5, 0.6)), { x: -0.02, y }));
  compact(vp, [whistle]);
  P(vp); mark('voicePipe', vp);
  refs.voicePipe = { group: vp, whistle, mouth: V(-1.55, 1.57, 1.42) };
  // 灭火器 + 禁止吸烟
  const ext = new THREE.Group(); ext.position.set(-1.66, 0, 2.62);
  ext.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 16), keep(std('#a01810', 0.45)), { y: 0.33 }));
  ext.add(mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), keep(std('#a01810', 0.45)), { y: 0.6 }));
  ext.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), keep(std('#1a1a1a', 0.5)), { y: 0.68 }));
  ext.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), keep(std('#1a1a1a', 0.6)), { x: 0.06, y: 0.5, rz: 0.2, cast: false }));
  compact(ext);
  P(ext); mark('extinguisher', ext);
  P(mesh(new THREE.PlaneGeometry(0.2, 0.25), keep(new THREE.MeshStandardMaterial({ map: TS.genShipSign('smoke'), roughness: 0.7 })), { x: 1.4, y: 1.9, z: SZ - 0.012, ry: Math.PI, cast: false }));
  // 木箱：西墙边摞着两只（原来头盔凳子那儿）
  const crateM = keep(new THREE.MeshStandardMaterial({ map: TS.genCrateSide('FRAGILE', '易碎 · 211 号货轮', 3251), roughness: 0.85 }));
  const crateM2 = keep(new THREE.MeshStandardMaterial({ map: TS.genCrateSide('COCOA', '热可可 · 船员伙食', 3252), roughness: 0.85 }));
  const crates = new THREE.Group();
  crates.add(mesh(new THREE.BoxGeometry(0.46, 0.4, 0.4), crateM, { x: -0.84, y: 0.2, z: 2.2, ry: 0.15 }));
  crates.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.34), crateM2, { x: -0.86, y: 0.55, z: 2.22, ry: -0.2 }));
  P(crates); mark('crates', crates);
  block(-1.1, -0.6, 1.98, 2.44);
  // 杂物桌上的保温壶：热可可（免费提示）
  root.traverse((o) => { if (o.isMesh && o.parent && Math.abs(o.parent.position.x + 1.7) < 0.01 && Math.abs(o.parent.position.z - 2.64) < 0.01) mark('thermos', o.parent); });

  // ===== 12. 灯 =====
  const L = refs.lights;
  L.hemi.color.set('#4e5e6c'); L.hemi.groundColor.set('#2a2420');
  // "太阳"：月光。从北边斜着照进来，只有舷窗盖打开的地方才透进来（墙和铁盖都投影），在地上、床上印出一个个圆的光斑；灯塔闪的时候它猛地一亮
  L.sun.color.set('#a8bcd8'); L.sun.position.set(-2.2, 6.2, -12.5); L.sun.target.position.set(0, 0.3, 0.2); L.sun.intensity = 0;
  L.winLight.color.set('#7a8ea8'); L.winLight.intensity = 0; L.winLight.position.z = -3.63;
  L.monLight.color.set('#ffa040'); L.monLight.distance = 2.2; L.monLight.position.set(1.3, 1.15, 0.4); L.monLight.intensity = 0;
  L.wc.color.set('#c8d4dc');
  // 舱顶灯：两盏带铁罩的防水灯（开关控制）
  const bulbM = keep(new THREE.MeshStandardMaterial({ color: '#f4e8d0', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.2 }));
  const cageM = keep(std('#3a3a36', 0.5, 0.6));
  for (const z of [2.3, -1.6]) {
    const f = new THREE.Group(); f.position.set(0, 2.98, z);
    f.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), cageM, { y: -0.02 }));
    f.add(mesh(new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), bulbM, { y: -0.04, rx: Math.PI, cast: false }));
    for (let k = 0; k < 4; k++) f.add(mesh(new THREE.TorusGeometry(0.085, 0.004, 4, 16, Math.PI), cageM, { y: -0.04, ry: (k / 4) * Math.PI, rz: Math.PI, cast: false }));
    compact(f);
    P(f);
  }
  L.tubeMats.length = 0; L.tubeMats.push(bulbM);
  for (const s of L.ceilSpots) { s.color.set('#ffd9a8'); s.position.y = 2.9; }
  // 马灯：链子吊在天花板上，跟着船来回摆（灯也跟着走）
  const lanternPiv = new THREE.Group(); lanternPiv.position.set(0, 2.97, -1.25);
  const chainM = keep(std('#3a3a36', 0.5, 0.7));
  for (let k = 0; k < 8; k++) lanternPiv.add(mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), chainM, { y: -0.03 - k * 0.055, ry: (k % 2) * Math.PI / 2, s: [1, 1.5, 1], cast: false }));
  const lan = new THREE.Group(); lan.position.y = -0.62; lanternPiv.add(lan);
  const lanM = keep(std('#2a2a26', 0.5, 0.7));
  lan.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 18), lanM, { y: -0.14 }));
  lan.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.04, 16), lanM, { y: 0.1 }));
  lan.add(mesh(new THREE.ConeGeometry(0.06, 0.06, 16), lanM, { y: 0.15 }));
  lan.add(mesh(new THREE.TorusGeometry(0.03, 0.004, 5, 12), lanM, { y: 0.19, cast: false }));
  for (const s of [-1, 1]) lan.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 5), lanM, { x: s * 0.065, y: -0.01, cast: false }));
  lan.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.18, 18, 1, true), keep(new THREE.MeshStandardMaterial({ color: '#f0e0c0', transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide })), { y: -0.02, cast: false }));
  const flameM = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.35, 0.5), toneMapped: false }));
  const flame = mesh(new THREE.SphereGeometry(0.012, 8, 6), flameM, { y: -0.04, s: [1, 2.2, 1], cast: false });
  lan.add(flame);
  const lanLight = new THREE.PointLight('#ffa860', 1.8, 6, 1.5); lanLight.position.y = -0.02; lan.add(lanLight);
  noRay(lanternPiv);
  P(lanternPiv);
  refs.lantern = { piv: lanternPiv, body: lan, light: lanLight, flame, flameM, ang: V(), vel: V() };
  refs.shipLights = { bulbM };

  // ===== 13. 洗手间：舷窗、钩篙、瓷砖泛黄 =====
  refs.wcWin.visible = false;
  const wcPlateShape = new THREE.Shape();
  wcPlateShape.moveTo(WW.x0, WW.y0); wcPlateShape.lineTo(WW.x1, WW.y0); wcPlateShape.lineTo(WW.x1, WW.y1); wcPlateShape.lineTo(WW.x0, WW.y1); wcPlateShape.lineTo(WW.x0, WW.y0);
  { const h = new THREE.Path(); h.absarc(0, 1.72, 0.2, 0, Math.PI * 2, true); wcPlateShape.holes.push(h); }
  const wcPlate = mesh(new THREE.ExtrudeGeometry(wcPlateShape, { depth: TW, bevelEnabled: false, curveSegments: 40 }), refs.wcMats.wPaint, { z: WR.z1 });
  refs.wcRoom.add(wcPlate);
  const wcPort = new THREE.Group(); wcPort.position.set(0, 1.72, WR.z1); wcPort.rotation.y = Math.PI;
  wcPort.add(mesh(rimGeo, brassM));
  wcPort.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 40, 1, true), keep(std('#8a8474', 0.6, 0.4, { side: THREE.DoubleSide })), { z: -0.08, rx: Math.PI / 2, cast: false }));
  const wcGlassU = { uTime: { value: 0 }, uWash: { value: 0 }, uSeed: { value: 41 } };
  const wcGlass = mesh(new THREE.CircleGeometry(0.2, 40), new THREE.ShaderMaterial({ uniforms: wcGlassU, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false }), { z: -0.12, cast: false, recv: false });
  wcPort.add(noRay(wcGlass));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; wcPort.add(mesh(hexGeo, brassM, { x: Math.cos(a) * 0.245, y: Math.sin(a) * 0.245, z: 0.04, cast: false })); }
  refs.wcRoom.add(wcPort);
  mark('wcWindow', wcPort);
  refs.portGlass = [...portholes.map((p) => p.glassU), wcGlassU];
  for (const m of Object.values(refs.wcMats)) { m.emissiveIntensity *= 0.3; m.color.multiplyScalar(0.8); }
  // 钩篙：靠在淋浴那个角落
  const hook = new THREE.Group(); hook.position.set(-1.68, 0, 6.05); hook.rotation.set(0.06, 0, -0.12);
  hook.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, 2.1, 8), keep(std('#6a4a2a', 0.7)), { y: 1.05 }));
  hook.add(mesh(new THREE.ConeGeometry(0.02, 0.1, 8), keep(std('#6a6e70', 0.4, 0.8)), { y: 2.14 }));
  hook.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI * 1.3), keep(std('#6a6e70', 0.4, 0.8)), { x: 0.04, y: 2.05, rz: 0.4 }));
  P(hook); mark('boatHook', hook);
  refs.boatHook = hook;
  // 洗手间地上也有一小滩水
  P(noRay(mesh(new THREE.CircleGeometry(0.5, 28), keep(std('#1a2a28', 0.05, 0.1, { transparent: true, opacity: 0.6, depthWrite: false })), { x: -0.9, y: 0.006, z: 5.6, rx: -Math.PI / 2, s: [1, 0.7, 1], cast: false })));

  // ===== 14. 穿衣镜上一层盐花 =====
  const saltC = TX.makeCanvas(64, 256), sx = saltC.getContext('2d'), srnd = mulberry32(3261);
  for (let k = 0; k < 260; k++) { sx.fillStyle = `rgba(220,222,210,${0.05 + srnd() * 0.18})`; sx.beginPath(); sx.arc(srnd() * 64, srnd() * 256, 0.5 + srnd() * 2.5, 0, 6.28); sx.fill(); }
  const sg = sx.createLinearGradient(0, 180, 0, 256); sg.addColorStop(0, 'rgba(200,200,190,0)'); sg.addColorStop(1, 'rgba(200,200,190,0.45)'); sx.fillStyle = sg; sx.fillRect(0, 180, 64, 76);
  refs.mirrorG.add(noRay(mesh(new THREE.PlaneGeometry(0.228, 1.388), keep(new THREE.MeshBasicMaterial({ map: TX.toTex(saltC, { wrap: false }), transparent: true, depthWrite: false })), { z: -0.026, ry: Math.PI, cast: false, recv: false })));

  add(props);

  // ===== 15. 全场过一遍"海风"：去饱和、压暗、锈斑、墙根水渍（自己建的写实材质、窗外不动）=====
  const skip = new Set();
  for (const g of [refs.outside.group, sea.pivot]) g.traverse((o) => skip.add(o));
  const seen = new Set(clean);
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      brineMaterial(m);
    }
  });
}
