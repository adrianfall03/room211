// 第七章：地堡 211 —— 公元 1403 年，波希米亚（参考《天国：拯救》）。
//   宿舍成了拉泰城堡底下凿在岩石里的一间地堡：守军的营房兼储藏室。库曼人天亮就要攻城，室友们被叫上城墙守夜去了。
//   写实电影感（和第三、四、六、八章一个路子）：
//   · 石头砌的墙（墙根返潮、墙顶熏黑）、筒形拱顶 + 三道拱肋、大小不一的石板地（碎稻草、脚印、狗爪印）；
//   · 屋里：西墙一座石头壁炉（柴火、吊着的一锅菜粥），炉前羊皮上趴着一条狗「杂毛」（mutt.js）；
//     我的书桌成了炼金台（炭炉上一口铜锅、蒸馏器、研钵、沙漏、风箱、墙上挂着晒干的草药和配方）；
//     第二张书桌上是骰子盘；门边一张搁板桌上摆着面包、奶酪、一串香肠、一罐啤酒；东南角一台磨刀石；
//     {B}的铁皮箱子（上了锁）、墙角一排皮靴、墙上的长矛、波希米亚双尾白狮旗、大盾、圣母像；两盏铁环蜡烛吊灯、墙上的火把；
//   · 北墙的大窗户砌死了，只留一扇尖拱小窗（铁栅栏 + 里面两扇木窗板）：推开是月光下的萨扎瓦河谷——
//     山脚下的拉泰城、教堂的尖塔，远山上库曼人的营火，天边烧红了的斯卡利茨，右手边的城墙上室友们举着火把巡逻；
//   · 洗手间成了澡堂：大木浴桶冒着热气、木桶、木板茅厕；窗外是城堡的院子，三只猴子被锁在颈手枷上示众。
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TC from '../core/tex_castle.js';
import * as TF from '../core/tex_frost.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { Batch, compact } from './spacelook.js';
import { Mutt } from './mutt.js';

// 一些位置：章节逻辑里也要用
export const HEARTH = new THREE.Vector3(-1.5, 0, 2.02);
export const DOG_HOME = new THREE.Vector3(-0.95, 0, 2.0);
export const GRIND = new THREE.Vector3(1.22, 0, 3.22);
export const BOARD = new THREE.Vector3(1.47, 0.78, -0.8); // 骰子盘中心（盘面高度）
export const WINDOW_C = new THREE.Vector3(0, 1.78, -3.6);
export const MOON_DIR = new THREE.Vector3(0.36, 0.34, -0.87).normalize();

// ---------- 旧东西过一遍"烟熏"：去一点饱和、压暗、偏暖褐 ----------
function smoked(src, { seed = 1, dark = 0.72, soot = 10, wrap = true, repeat = null } = {}) {
  const img = src.image || src, W = img.width, H = img.height;
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed * 37 + 5);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    p[i] = lerp(p[i], l, 0.45) * (dark + 0.04); p[i + 1] = lerp(p[i + 1], l, 0.45) * dark; p[i + 2] = lerp(p[i + 2], l, 0.45) * (dark - 0.06);
  }
  ctx.putImageData(d, 0, 0);
  for (let k = 0; k < soot * 30; k++) {
    ctx.fillStyle = `rgba(${20 + rnd() * 20},${16 + rnd() * 14},${10},${0.05 + rnd() * 0.12})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 2, 0, 6.28); ctx.fill();
  }
  const t = TX.toTex(c, { wrap });
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (src.repeat) t.repeat.copy(src.repeat);
  return t;
}
// 竖着一条条的橡木板（门、窗板、搁板桌）
function genPlanks({ seed = 7401, W = 256, H = 512, n = 4, base = '#4a3220', dark = '#2a1a10' } = {}) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d'), N = TX.createNoise(seed), cb = TX.hexToRgb(base), cd = TX.hexToRgb(dark);
  const pw = W / n;
  TX.pixels(c, (x, y, d, i) => {
    const pk = Math.floor(x / pw), lx = x - pk * pw;
    const g = N.fbm(x / W * 2 + pk * 3.1, y / H * 16, 3, 2, 16), k = N.fbm(x / W * 8 + pk, y / H * 3, 3, 8, 3);
    const t = clamp(g * 0.8 + (k - 0.5) * 0.6 + (pk % 2) * 0.08, 0, 1);
    let r = lerp(cb[0], cd[0], t), gg = lerp(cb[1], cd[1], t), b = lerp(cb[2], cd[2], t);
    if (lx < 2 || lx > pw - 2) { r *= 0.35; gg *= 0.35; b *= 0.35; }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  });
  // 木结
  const rnd = mulberry32(seed);
  for (let k = 0; k < 6; k++) {
    const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 6;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    gr.addColorStop(0, 'rgba(20,10,4,0.8)'); gr.addColorStop(0.5, 'rgba(40,24,12,0.4)'); gr.addColorStop(1, 'rgba(40,24,12,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 2.2, 0, 0, 6.28); ctx.fill();
  }
  return TX.toTex(c);
}

export function buildCastleTextures(B) {
  const T = {};
  T.floor = TC.genFlagstone();
  T.floorDirt = TC.genStrawLitter();
  const w = TC.genCastleWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  const v = TC.genVault(); T.ceiling = v.map; T.ceilingN = v.normalMap;
  let s = 1;
  const sm = (t, o = {}) => smoked(t, { seed: s++, ...o });
  T.woodDark = sm(B.woodDark, { dark: 0.75 });
  T.woodLight = sm(B.woodLight, { dark: 0.55 });
  T.woodOrange = sm(B.woodOrange, { dark: 0.6 });
  T.doorWood = sm(B.doorWood, { dark: 0.7 });
  T.blackLaminate = sm(B.blackLaminate, { dark: 0.8 });
  T.curtain = sm(B.curtain, { dark: 0.6 });
  T.net = B.net;
  // 床上的东西：稻草席、羊毛毯（格子 / 素色）、茜草红、菘蓝蓝、亚麻
  T.bamboo = TC.genStraw(); T.bamboo.repeat.set(2, 4);
  T.floral = TC.genWool({ base: '#5a4230', stripe: '#2e2418', stripe2: '#7a3222', seed: 7152 }); T.floral.repeat.set(2, 2);
  T.grayCloth = TC.genWool({ base: '#6a665c', plaid: false, seed: 7153 }); T.grayCloth.repeat.set(3, 3);
  T.pinkCloth = TC.genWool({ base: '#6a2a22', stripe: '#4a1c16', seed: 7154 }); T.pinkCloth.repeat.set(3, 3);
  T.blackCloth = TC.genWool({ base: '#2a2622', plaid: false, seed: 7155 }); T.blackCloth.repeat.set(2, 2);
  T.blueCloth = TC.genWool({ base: '#3a4658', stripe: '#262e3a', seed: 7156 }); T.blueCloth.repeat.set(2, 2);
  T.whiteCloth = TC.genWool({ base: '#b0a48a', plaid: false, seed: 7157 }); T.whiteCloth.repeat.set(2, 2);
  for (const k of ['polka', 'yellowDots', 'patternRoll']) T[k] = sm(B[k], { dark: 0.6 });
  T.cardboard = B.cardboard; T.cardboard350 = B.cardboard350;
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.windowView = B.windowView;
  T.clockFace = sm(B.clockFace, { dark: 0.7, wrap: false });
  T.mousepad = B.mousepad;
  return T;
}

// ---------- 全场"用旧了"：墙顶和天花板熏黑、墙根返潮、朝上的面落一层灰（世界坐标噪声）----------
const AGE_FUNCS = /* glsl */ `
varying vec3 vAW;
float ah(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float an(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ah(i), ah(i + vec3(1, 0, 0)), f.x), mix(ah(i + vec3(0, 1, 0)), ah(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ah(i + vec3(0, 0, 1)), ah(i + vec3(1, 0, 1)), f.x), mix(ah(i + vec3(0, 1, 1)), ah(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const AGE_APPLY = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float n1 = an(vAW * 2.4), n2 = an(vAW * 9.0 + 5.0);
  float up = smoothstep(0.5, 0.9, wn.y) * smoothstep(0.02, 0.1, vAW.y);
  float dust = clamp(up * (0.2 + n1 * 0.35), 0.0, 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.27, 0.22) * (0.8 + n2 * 0.4), dust);
  roughnessFactor = mix(roughnessFactor, 0.95, dust);
  float soot = smoothstep(1.9, 2.9, vAW.y) * (0.35 + n1 * 0.5);
  diffuseColor.rgb *= 1.0 - soot * 0.5;
  diffuseColor.rgb *= 1.0 - smoothstep(0.6, 0.92, n1 * 0.6 + n2 * 0.4) * 0.25;
}`;
function ageify(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 aw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        aw = instanceMatrix * aw;
        #endif
        vAW = (modelMatrix * aw).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${AGE_FUNCS}`)
      .replace('#include <normal_fragment_maps>', AGE_APPLY);
  };
  m.customProgramCacheKey = () => 'castle211';
  m.needsUpdate = true;
}
const _hsl = {};
function ageMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.aged) return;
  m.userData.aged = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * 0.6, Math.min(0.55, _hsl.l * 0.75 + 0.01));
  } else m.color.multiplyScalar(0.92);
  if (m.metalness > 0.45) m.roughness = Math.max(m.roughness, 0.45);
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.45;
  if (m.emissive && m.emissiveIntensity > 0 && !m.emissiveMap) m.emissiveIntensity *= 0.35;
  if (!m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) ageify(m);
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
const noRay = (o) => { o.traverse((c) => { c.userData.noRay = true; if (c.isMesh || c.isSprite || c.isPoints || c.isLine || c.isLineSegments) c.raycast = () => {}; }); return o; };
const cylBetween = (a, b, r0, r1 = r0, seg = 10) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};
const _glowCache = {};
const glowTex = (inner = [255, 190, 110]) => { const k = inner.join(); return _glowCache[k] || (_glowCache[k] = TF.genGlow(128, inner)); };
const glowSprite = (inner, size, op = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(inner), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(size, size, 1);
  return noRay(s);
};
// 火苗：几片交叉的"火舌"（加色混合的锥体），每帧跳一跳
const FLAME_M = (b = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6 * b, 1.25 * b, 0.35 * b), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function makeFlame(size = 1, n = 3, bright = 1) {
  const g = new THREE.Group();
  const m = FLAME_M(bright);
  const tongues = [];
  for (let k = 0; k < n; k++) {
    const t = mesh(new THREE.ConeGeometry(0.05 * size, 0.2 * size, 8, 1, true), m, { x: (k - (n - 1) / 2) * 0.03 * size, y: 0.1 * size, ry: k * 1.3, cast: false, recv: false });
    g.add(t); tongues.push(t);
  }
  const core = mesh(new THREE.SphereGeometry(0.04 * size, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3 * bright, 2.2 * bright, 1.1 * bright), toneMapped: false }), { y: 0.04 * size, s: [1, 1.5, 1], cast: false, recv: false });
  g.add(core);
  noRay(g);
  let ph = Math.random() * 10;
  return {
    group: g, mat: m,
    update(dt, t, k = 1) {
      ph += dt;
      tongues.forEach((q, i) => {
        const f = 0.75 + Math.sin(t * (9 + i * 3) + i * 2 + ph) * 0.15 + Math.sin(t * 23 + i * 5) * 0.1;
        q.scale.set(k * (0.9 + Math.sin(t * 7 + i) * 0.1), k * f, k);
        q.position.x = (i - (n - 1) / 2) * 0.03 * size * k + Math.sin(t * 5 + i * 3) * 0.01 * size;
      });
      core.scale.set(k, 1.5 * k, k);
      g.visible = k > 0.02;
    },
  };
}

// 炉膛里的大火：几张"火舌"贴图的精灵叠在一起（锥体叠多了会糊成一团白），各自一伸一缩、左右摆
let _flameTex = null;
function flameTex() {
  if (_flameTex) return _flameTex;
  const W = 64, H = 128, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H; // 0 = 底，1 = 尖
    const wd = 0.92 * Math.pow(1 - v, 0.85) * Math.min(1, v * 4 + 0.35);
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W * 2 - 1) / Math.max(wd, 1e-3);
      const a = Math.pow(clamp(1 - u, 0, 1), 1.4) * smoothstep(0, 0.12, v) * (1 - smoothstep(0.75, 1, v));
      const hot = clamp(a * (1.2 - v), 0, 1);
      const i = (y * W + x) * 4;
      d[i] = 255; d[i + 1] = 60 + 125 * hot; d[i + 2] = 10 + 45 * hot * hot; d[i + 3] = 255 * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  _flameTex = new THREE.CanvasTexture(c); _flameTex.colorSpace = THREE.SRGBColorSpace;
  return _flameTex;
}
function makeFire(n = 5, w = 0.2, h = 0.36, op = 0.55) {
  const g = new THREE.Group();
  const tongues = [];
  for (let k = 0; k < n; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.center.set(0.5, 0.05);
    const x = (k - (n - 1) / 2) / Math.max(1, n - 1) * w * 1.1;
    const sc = 1 - Math.abs(x) / (w * 1.4);
    s.position.set(0, 0, x); g.add(s);
    tongues.push({ s, x, sc, ph: Math.random() * 10 });
  }
  noRay(g);
  return {
    group: g,
    update(dt, t, k = 1) {
      for (const q of tongues) {
        const f = 0.8 + Math.sin(t * 8.3 + q.ph) * 0.12 + Math.sin(t * 19 + q.ph * 3) * 0.08;
        q.s.scale.set(w * q.sc * k * (0.9 + Math.sin(t * 6 + q.ph) * 0.1), h * q.sc * f * k, 1);
        q.s.position.z = q.x + Math.sin(t * 4.7 + q.ph * 2) * 0.012;
        q.s.material.rotation = Math.sin(t * 3.1 + q.ph) * 0.08;
      }
      g.visible = k > 0.02;
    },
  };
}

// ================= 窗外：月光下的萨扎瓦河谷 =================
//   相机的远裁剪面是 60m：天空是一个跟着镜头走的球（半径 50），远山是几圈贴着剪影贴图的弧面，也跟着镜头挪一点（看起来就在很远的地方）；
//   山脚下的拉泰城（房子、教堂、灯火）、河、城墙和巡逻的人影是真的几何体。全部不受光照（MeshBasic），颜色自己"烘"好
const SKY_VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`;
const SKY_FRAG = /* glsl */ `
  uniform float uTime, uDawn, uFire; uniform vec3 uMoon; varying vec3 vDir;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float el = d.y;
    // 夜空：地平线附近一层发灰的蓝，往上越来越深
    vec3 col = mix(vec3(0.05, 0.065, 0.11), vec3(0.008, 0.012, 0.03), smoothstep(-0.05, 0.6, el));
    // 天快亮了：东边（+x）地平线上一抹暗红，越往后越亮
    vec2 hd = normalize(d.xz + 1e-4);
    float east = pow(max(0.0, dot(hd, normalize(vec2(1.0, -0.35)))), 3.0);
    col += vec3(0.32, 0.13, 0.06) * east * (1.0 - smoothstep(-0.05, 0.3, el)) * (0.25 + uDawn * 1.6);
    col = mix(col, mix(vec3(0.62, 0.42, 0.34), vec3(0.2, 0.3, 0.48), smoothstep(0.0, 0.5, el)), uDawn * 0.55);
    // 斯卡利茨在烧：西北边（-x）地平线上一大片暗红，一跳一跳
    float west = pow(max(0.0, dot(hd, normalize(vec2(-0.75, -1.0)))), 6.0);
    col += vec3(0.42, 0.12, 0.03) * west * (1.0 - smoothstep(-0.05, 0.22, el)) * uFire;
    // 云：一条条被月光照亮边缘的暗云
    vec2 cp = d.xz / max(0.12, el + 0.18) * 1.4 + vec2(uTime * 0.01, 0.0);
    float cl = smoothstep(0.45, 0.8, fbm(cp));
    float mlit = pow(max(0.0, dot(d, uMoon)), 6.0);
    col = mix(col, vec3(0.03, 0.035, 0.05) + vec3(0.22, 0.24, 0.28) * mlit * 1.4, cl * 0.8 * smoothstep(-0.02, 0.1, el));
    // 星星：不在云后面、天亮以后看不见
    vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(el, -1.0, 1.0))) * 160.0;
    float st = h(floor(sp));
    float star = step(0.9975, st) * smoothstep(0.03, 0.3, el) * (1.0 - cl) * (1.0 - uDawn * 0.9);
    col += vec3(0.9, 0.92, 1.0) * star * (0.6 + 0.4 * sin(uTime * 3.0 + st * 400.0));
    // 月亮：月面 + 两层月晕
    float md = dot(d, uMoon);
    float disc = smoothstep(0.99955, 0.99968, md);
    float spots = fbm(d.xy * 400.0) * 0.25;
    col = mix(col, vec3(1.0, 0.97, 0.88) * (1.0 - spots), disc);
    col += vec3(0.5, 0.55, 0.65) * pow(max(0.0, md), 600.0) * 0.5 + vec3(0.25, 0.28, 0.34) * pow(max(0.0, md), 40.0) * 0.18 * (1.0 - cl * 0.6);
    gl_FragColor = vec4(col, 1.0);
  }`;
function buildVista(rnd) {
  const P = new THREE.Group(); P.name = 'castleVista';
  P.userData.noAO = true;
  const far = new THREE.Group(); P.add(far); // 远处的东西：跟着镜头挪（看起来在无穷远）
  const I4 = new THREE.Matrix4();
  const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), fog: false, ...o });
  // 天空
  const skyU = { uTime: { value: 0 }, uDawn: { value: 0 }, uFire: { value: 1 }, uMoon: { value: MOON_DIR.clone() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  far.add(noRay(sky));
  // 一圈圈的山：弧面 + 剪影贴图（越远越淡、越蓝）
  const hill = (r, y0, h, tex, color, a0 = Math.PI - 1.1, aL = 2.2) => {
    const g = new THREE.CylinderGeometry(r, r, h, 64, 1, true, a0, aL);
    const m = mesh(g, basic(color, { map: tex, transparent: true, alphaTest: 0.5, side: THREE.BackSide }), { y: y0 + h / 2, z: WINDOW_C.z, cast: false, recv: false });
    return noRay(m);
  };
  const hills = [
    hill(46, -14, 22, TC.genHills({ seed: 7501, top: 0.26, amp: 0.1, trees: 0.6, color: '#8a94ac', rim: '#c8d0e0' }), '#4a5470'),
    hill(40, -16, 20, TC.genHills({ seed: 7502, top: 0.36, amp: 0.14, trees: 1, color: '#6a7488' }), '#2c3446'),
    hill(33, -18, 18, TC.genHills({ seed: 7503, top: 0.42, amp: 0.22, trees: 1.2, color: '#4a5262' }), '#1a2130'),
  ];
  hills.forEach((h, i) => { h.renderOrder = -9 + i; (i < 2 ? far : P).add(h); }); // 最近的那一道山不跟镜头走（山脚下的城在它前面）
  // 远山上的营火（库曼人）：一个个一跳一跳的橘色光点
  const fires = [];
  for (let k = 0; k < 34; k++) {
    const a = Math.PI - 0.95 + rnd() * 1.9, r = 36 + rnd() * 8;
    const s = glowSprite([255, 150, 60], 0.5 + rnd() * 0.5, 0.9);
    s.position.set(Math.sin(a) * r, -3.6 + rnd() * 3.2 - (r < 40 ? 1.5 : 0), WINDOW_C.z + Math.cos(a) * r);
    s.renderOrder = -5;
    s.userData.ph = rnd() * 10; s.userData.base = s.scale.x;
    far.add(s); fires.push(s);
  }
  // 斯卡利茨在烧：西北边的地平线上一大团火光 + 往上翻的黑烟
  const burnAt = V(-24, 0.2, WINDOW_C.z - 38);
  const burn = glowSprite([255, 120, 40], 10, 0.8); burn.position.copy(burnAt); burn.renderOrder = -6; far.add(burn);
  const burn2 = glowSprite([255, 180, 80], 4, 0.9); burn2.position.copy(burnAt).add(V(0, -0.6, 0.5)); burn2.renderOrder = -6; far.add(burn2);
  const smokeTex = TF.genPuff(128, 7511);
  const smokes = [];
  for (let k = 0; k < 9; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: new THREE.Color('#1a1210'), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    s.renderOrder = -7; s.userData.t = k / 9;
    far.add(noRay(s)); smokes.push(s);
  }
  // 山谷：河、田、拉泰城（这些是近处的，不跟镜头走）
  const near = new THREE.Group(); P.add(near);
  const valleyY = -10;
  // 山谷底下一层：暗绿灰的田野（竖着一条条的田垄）
  const fieldC = TX.makeCanvas(256, 256), fx = fieldC.getContext('2d');
  fx.fillStyle = '#10141a'; fx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) { fx.fillStyle = `rgba(${30 + rnd() * 20},${36 + rnd() * 24},${40 + rnd() * 20},0.5)`; fx.fillRect(rnd() * 256, rnd() * 256, 20 + rnd() * 60, 10 + rnd() * 40); }
  near.add(noRay(mesh(new THREE.PlaneGeometry(90, 60), basic('#ffffff', { map: TX.toTex(fieldC) }), { y: valleyY - 0.05, z: WINDOW_C.z - 30, rx: -Math.PI / 2, cast: false, recv: false })));
  // 河：一条弯弯的带子，月光在上面碎成一片
  const riverPts = [V(-40, 0, -46), V(-14, 0, -34), V(-2, 0, -28), V(10, 0, -31), V(22, 0, -22), V(40, 0, -26)];
  const rc = new THREE.CatmullRomCurve3(riverPts);
  const rg = new THREE.BufferGeometry(); const rpos = [], ruv = [], ridx = [];
  const NR = 80;
  for (let i = 0; i <= NR; i++) {
    const t = i / NR, p = rc.getPoint(t), tan = rc.getTangent(t), nx = -tan.z, nz = tan.x, w = 1.6 + Math.sin(t * 9) * 0.3;
    rpos.push(p.x + nx * w, valleyY, p.z + nz * w, p.x - nx * w, valleyY, p.z - nz * w);
    ruv.push(t * 8, 0, t * 8, 1);
    if (i < NR) { const a = i * 2; ridx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.setIndex(ridx);
  const glintC = TX.makeCanvas(256, 64), gx = glintC.getContext('2d');
  gx.fillStyle = '#0a1018'; gx.fillRect(0, 0, 256, 64);
  for (let k = 0; k < 160; k++) { gx.fillStyle = `rgba(${170 + rnd() * 60},${180 + rnd() * 60},${200 + rnd() * 50},${0.2 + rnd() * 0.6})`; gx.fillRect(rnd() * 256, 18 + rnd() * 28, 2 + rnd() * 8, 1); }
  const glintT = TX.toTex(glintC);
  const river = mesh(rg, basic('#ffffff', { map: glintT, side: THREE.DoubleSide }), { cast: false, recv: false });
  near.add(noRay(river));
  // 拉泰城：一片挤在一起的房子（抹灰的墙、黑瓦的坡顶），零零星星几扇亮着的窗，中间一座教堂的尖塔
  const wallM = basic('#4c4e56'), wallM2 = basic('#3a3c44'), roofM = basic('#1a1a20'), winM = basic('#ffffff', { map: TC.genWindowLit(), toneMapped: false });
  winM.color.setRGB(1.6, 1.3, 0.9);
  const hb = new Batch();
  const house = (x, z, w, d, h, ry, lit) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
    hb.add(new THREE.BoxGeometry(w, h, d), rnd() < 0.5 ? wallM : wallM2, I4.compose(V(x, valleyY + h / 2, z), q, V(1, 1, 1)));
    const roof = new THREE.CylinderGeometry(0.01, w * 0.62, h * 0.8, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, d / w);
    hb.add(roof, roofM, I4.compose(V(x, valleyY + h + h * 0.4, z), q, V(1, 1, 1)));
    if (lit) {
      const off = V((rnd() - 0.5) * w * 0.5, h * 0.45 - valleyY * 0 , d / 2 + 0.01).applyQuaternion(q);
      hb.add(new THREE.PlaneGeometry(0.35, 0.4), winM, I4.compose(V(x + off.x, valleyY + h * 0.5, z + off.z), q, V(1, 1, 1)));
    }
  };
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 9;
    const x = -3 + Math.cos(a) * r * 1.4, z = -34 + Math.sin(a) * r * 0.7;
    house(x, z, 1.4 + rnd() * 1.2, 1.4 + rnd() * 1.2, 1.2 + rnd() * 1.0, (rnd() - 0.5) * 0.8, rnd() < 0.35);
  }
  // 教堂：长长的中殿 + 一座尖塔
  hb.add(new THREE.BoxGeometry(2.4, 3.2, 6), wallM, I4.makeTranslation(-2, valleyY + 1.6, -35));
  { const g = new THREE.CylinderGeometry(0.01, 1.8, 2.4, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, 2.5); hb.add(g, roofM, I4.makeTranslation(-2, valleyY + 4.4, -35)); }
  hb.add(new THREE.BoxGeometry(1.6, 7, 1.6), wallM, I4.makeTranslation(-2, valleyY + 3.5, -31.5));
  { const g = new THREE.ConeGeometry(1.25, 4.5, 4); g.rotateY(Math.PI / 4); hb.add(g, roofM, I4.makeTranslation(-2, valleyY + 9.2, -31.5)); }
  // 城墙：从窗户右下方往远处伸出去一段，垛口一个个立着，中间一座圆塔
  const cwM = basic('#2e3038'), cwM2 = basic('#23252c');
  const wallA = V(1.2, -2.5, -7), wallB = V(9, -2.2, -19);
  const wdir = wallB.clone().sub(wallA), wlen = wdir.length(); wdir.normalize();
  const wq = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), wdir);
  hb.add(new THREE.BoxGeometry(wlen, 7, 1.2), cwM, I4.compose(wallA.clone().addScaledVector(wdir, wlen / 2).add(V(0, -3.5, 0)), wq, V(1, 1, 1)));
  for (let s = 0.3; s < wlen; s += 0.9) hb.add(new THREE.BoxGeometry(0.5, 0.7, 1.2), cwM2, I4.compose(wallA.clone().addScaledVector(wdir, s).add(V(0, 0.35, 0)), wq, V(1, 1, 1)));
  const towerAt = wallA.clone().addScaledVector(wdir, wlen * 0.55);
  hb.add(new THREE.CylinderGeometry(1.6, 1.8, 11, 16), cwM, I4.makeTranslation(towerAt.x + 0.5, towerAt.y - 3.5, towerAt.z));
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; hb.add(new THREE.BoxGeometry(0.5, 0.7, 0.5), cwM2, I4.makeTranslation(towerAt.x + 0.5 + Math.cos(a) * 1.6, towerAt.y + 2.3, towerAt.z + Math.sin(a) * 1.6)); }
  // 窗下的岩壁：几块黑乎乎的石头，挡住最近处
  for (let k = 0; k < 9; k++) hb.add(new THREE.DodecahedronGeometry(1 + rnd() * 1.5, 0), cwM2, I4.compose(V(-4 + rnd() * 8, -3.2 - rnd() * 2, -5.2 - rnd() * 2.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), V(1.4, 0.8, 1)));
  hb.build(near, { cast: false, name: 'vistaTown' }).forEach((m) => noRay(m));
  // 城墙上的火把 + 巡逻的人影（室友们）
  const wallTorches = [];
  for (const s of [0.25, 0.8]) {
    const p = wallA.clone().addScaledVector(wdir, wlen * s).add(V(0, 1.1, 0));
    const gl = glowSprite([255, 170, 80], 2.2, 0.8); gl.position.copy(p); near.add(gl); wallTorches.push(gl);
  }
  const sentries = [0, 1, 2].map((k) => {
    const m = noRay(mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ map: TC.genSentry(k), transparent: true, alphaTest: 0.4, color: new THREE.Color('#0a0a0c'), side: THREE.DoubleSide, fog: false }), { cast: false, recv: false }));
    const torch = glowSprite([255, 170, 80], 1.2, 0.9); torch.position.set(-0.3, 0.55, 0.05); m.add(torch);
    near.add(m);
    return { m, torch, u: 0.1 + k * 0.33, dir: k % 2 ? -1 : 1, speed: 0.025 + k * 0.006 };
  });
  // 火箭：从远山上射过来的一道道火光（剧情里用）
  const arrowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const arrows = [];
  for (let k = 0; k < 14; k++) {
    const a = noRay(mesh(new THREE.CylinderGeometry(0.03, 0.12, 1.4, 5), arrowM, { cast: false, recv: false }));
    const g = glowSprite([255, 170, 80], 1.1, 0.9); a.add(g); g.position.y = 0.6;
    a.visible = false; near.add(a);
    arrows.push({ o: a, t: -1, from: V(), to: V(), dur: 2 });
  }
  const _t = V(), _d = V();
  return {
    group: P, far, skyU, hills, fires, burn, burn2, smokes, sentries, arrows, river: glintT,
    // 放一排火箭：从远山上射向城墙
    volley(n = 8) {
      let k = 0;
      for (const ar of arrows) {
        if (k >= n || ar.t >= 0) continue;
        ar.from.set(-12 + Math.random() * 24, 2 + Math.random() * 2, WINDOW_C.z - 36 - Math.random() * 6);
        ar.to.copy(wallA).addScaledVector(wdir, Math.random() * wlen).add(V(0, 0.5, 0));
        ar.dur = 2.2 + Math.random() * 0.8;
        ar.t = -k * 0.12 - Math.random() * 0.2;
        k++;
      }
    },
    update(dt, t, cam, { dawn = 0, fire = 1 } = {}) {
      // 远处的东西跟着镜头走一大半：看起来在很远的地方
      if (cam) far.position.set(cam.position.x * 0.92, cam.position.y * 0.92 - 1.6 * 0.92, (cam.position.z - WINDOW_C.z) * 0.92);
      skyU.uTime.value = t; skyU.uDawn.value = dawn; skyU.uFire.value = fire;
      for (const f of fires) { const k = 0.75 + Math.sin(t * 7 + f.userData.ph) * 0.12 + Math.sin(t * 17 + f.userData.ph * 3) * 0.08; f.material.opacity = k * (1 - dawn * 0.6); f.scale.setScalar(f.userData.base * (0.9 + k * 0.2)); }
      const fl = 0.8 + Math.sin(t * 3) * 0.08 + Math.sin(t * 7.3) * 0.06;
      burn.material.opacity = 0.7 * fl * fire; burn2.material.opacity = 0.9 * fl * fire;
      smokes.forEach((s) => {
        const k = (s.userData.t + t * 0.02) % 1;
        s.position.copy(burnAt).add(V(k * 6 + Math.sin(k * 5 + s.userData.t * 9) * 1.5, 1 + k * 14, -k * 2));
        s.scale.setScalar(4 + k * 12);
        s.material.opacity = Math.sin(k * Math.PI) * 0.55 * fire;
      });
      glintT.offset.x = (t * 0.05) % 1;
      for (const w of wallTorches) w.material.opacity = 0.7 + Math.sin(t * 11 + w.position.x) * 0.1;
      // 巡逻：在城墙上来回走
      for (const s of sentries) {
        s.u += s.dir * s.speed * dt;
        if (s.u > 0.92) s.dir = -1; if (s.u < 0.05) s.dir = 1;
        _t.copy(wallA).addScaledVector(wdir, wlen * s.u).add(V(0, 0.95, 0));
        s.m.position.copy(_t);
        if (cam) { s.m.lookAt(cam.position.x, _t.y, cam.position.z); }
        s.m.scale.x = s.dir;
        s.torch.material.opacity = 0.8 + Math.sin(t * 13 + s.u * 40) * 0.1;
      }
      // 火箭
      for (const a of arrows) {
        if (a.t < 0) { if (a.t > -1) { a.t += dt; if (a.t >= 0) { a.o.visible = true; } } continue; }
        a.t += dt / a.dur;
        if (a.t >= 1) { a.t = -1; a.o.visible = false; continue; }
        const k = a.t;
        _t.lerpVectors(a.from, a.to, k); _t.y += Math.sin(k * Math.PI) * 9;
        _d.lerpVectors(a.from, a.to, k + 0.02); _d.y += Math.sin((k + 0.02) * Math.PI) * 9;
        a.o.position.copy(_t);
        a.o.quaternion.setFromUnitVectors(V(0, 1, 0), _d.sub(_t).normalize());
      }
    },
  };
}

// ================= 洗手间窗外：城堡的院子，颈手枷上锁着三只示众的猴子 =================
function makeMonkey(furM, faceM) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  // 身子弯着腰（脖子和手卡在枷板上，身子在后面）
  body.add(mesh(new THREE.CapsuleGeometry(0.11, 0.2, 6, 12), furM, { z: 0.16, y: -0.05, rx: 1.2, cast: false }));
  const head = new THREE.Group(); root.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.095, 18, 14), furM, { cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), faceM, { y: -0.01, z: -0.06, s: [1.05, 0.95, 0.6], cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.04, 12, 10), faceM, { y: -0.04, z: -0.1, s: [1.15, 0.8, 0.8], cast: false }));
  const eyeM = std('#140c08', 0.2);
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.013, 8, 6), eyeM, { x: s * 0.03, y: 0.015, z: -0.108, cast: false }));
    head.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), faceM, { x: s * 0.094, y: 0.008, s: [0.5, 1, 1], cast: false }));
  }
  const mouth = mesh(new THREE.SphereGeometry(0.018, 10, 8), std('#3a1410', 0.6), { y: -0.062, z: -0.128, s: [1.4, 0.5, 0.6], cast: false });
  head.add(mouth);
  const tongue = mesh(new THREE.SphereGeometry(0.014, 8, 6), std('#c05a60', 0.5), { y: -0.07, z: -0.14, s: [1, 0.5, 1.6], cast: false });
  tongue.visible = false; head.add(tongue);
  const hands = [-1, 1].map((s) => { const h = mesh(new THREE.SphereGeometry(0.028, 10, 8), faceM, { x: s * 0.24, y: 0.0, z: -0.02, s: [1, 1.2, 0.8], cast: false }); root.add(h); return h; });
  return { root, head, mouth, tongue, hands };
}
export function buildCastleOutside() {
  const group = new THREE.Group(); group.name = 'castleOutside';
  group.userData.noAO = true;
  const WZ = 6.46, rnd = mulberry32(7601);
  const lit = (c, k = 0.35) => std(c, 0.9, 0, { emissive: new THREE.Color(c).multiplyScalar(k) });
  // 院子地面：泥 + 石子
  const gC = TX.makeCanvas(256, 256), gx = gC.getContext('2d');
  gx.fillStyle = '#2a2218'; gx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 500; k++) { const v = 40 + rnd() * 50; gx.fillStyle = `rgba(${v},${v - 6},${v - 14},0.8)`; gx.beginPath(); gx.ellipse(rnd() * 256, rnd() * 256, 3 + rnd() * 7, 2 + rnd() * 5, rnd() * 3, 0, 6.28); gx.fill(); }
  const gT = TX.toTex(gC); gT.repeat.set(4, 4);
  group.add(mesh(new THREE.PlaneGeometry(16, 12), lit('#ffffff', 0.25).clone(), { y: 0.55, z: WZ + 6, rx: -Math.PI / 2, cast: false }));
  group.children[0].material.map = gT; group.children[0].material.emissiveMap = gT;
  // 对面：几栋木筋墙的房子，窗户透着火光
  const houseM = lit('#6a6254', 0.3), beamM = lit('#2a1e14', 0.2), roofM2 = lit('#2a2420', 0.2);
  for (const [x, w] of [[-3.5, 3], [0, 3.2], [3.6, 3.4]]) {
    group.add(mesh(new THREE.BoxGeometry(w, 4, 1), houseM, { x, y: 2.5, z: WZ + 9.5, cast: false }));
    for (let k = -1; k <= 1; k++) group.add(mesh(new THREE.BoxGeometry(0.12, 4, 0.05), beamM, { x: x + k * w * 0.33, y: 2.5, z: WZ + 8.98, cast: false }));
    group.add(mesh(new THREE.BoxGeometry(w, 0.14, 0.05), beamM, { x, y: 2.2, z: WZ + 8.98, cast: false }));
    const roof = new THREE.CylinderGeometry(0.01, w * 0.72, 1.6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 0.5);
    group.add(mesh(roof, roofM2, { x, y: 5.3, z: WZ + 9.5, cast: false }));
    const wm = new THREE.MeshBasicMaterial({ map: TC.genWindowLit(), color: new THREE.Color(1.4, 1.1, 0.8), toneMapped: false });
    group.add(noRay(mesh(new THREE.PlaneGeometry(0.5, 0.6), wm, { x: x + (rnd() - 0.5) * w * 0.4, y: 3.2, z: WZ + 8.96, ry: Math.PI, cast: false })));
  }
  // 火把：一根木桩上插着，照着颈手枷
  const post = new THREE.Group(); post.position.set(1.6, 0.55, WZ + 3.2); group.add(post);
  post.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), beamM, { y: 0.9, cast: false }));
  const tFlame = makeFlame(1.2, 3); tFlame.group.position.set(0, 1.85, 0); post.add(tFlame.group);
  const tGlow = glowSprite([255, 170, 80], 2.6, 0.8); tGlow.position.set(0, 1.95, 0); post.add(tGlow);
  // 颈手枷：两根柱子、上下两块木板，三个脖子洞 + 六个手洞
  const pil = new THREE.Group(); pil.position.set(-0.1, 0.55, WZ + 2.4); group.add(pil); // 猴脸朝 -z：冲着窗户
  const woodM = lit('#5a4028', 0.25);
  for (const s of [-1, 1]) pil.add(mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), woodM, { x: s * 1.15, y: 0.75, cast: false }));
  pil.add(mesh(new THREE.BoxGeometry(2.4, 0.16, 0.1), woodM, { y: 1.14, cast: false }));
  pil.add(mesh(new THREE.BoxGeometry(2.4, 0.16, 0.1), woodM, { y: 0.98, cast: false }));
  pil.add(mesh(new THREE.BoxGeometry(2.5, 0.06, 0.14), woodM, { y: 1.25, cast: false }));
  const furM = lit('#4a3424', 0.3), faceM = lit('#c8a488', 0.25);
  const monkeys = [-0.72, 0, 0.72].map((x, i) => {
    const m = makeMonkey(furM, faceM);
    m.root.position.set(x, 1.06, 0.02);
    m.root.scale.setScalar(1.15);
    pil.add(m.root);
    return { ...m, ph: i * 1.7 };
  });
  const state = { t: 0, dur: 0 };
  return {
    group,
    trigger(dur = 4.5) { state.t = 0; state.dur = dur; },
    get busy() { return state.t < state.dur; },
    update(dt, t) {
      state.t += dt;
      const on = state.t < state.dur;
      const k = on ? Math.min(1, state.t * 3) * Math.min(1, (state.dur - state.t) * 2) : 0;
      tFlame.update(dt, t, 1);
      const f = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.05;
      tGlow.material.opacity = 0.75 * f;
      monkeys.forEach((m, i) => {
        // 平时耷拉着脑袋打瞌睡；被人一看：抬头、做鬼脸、吐舌头、手指头乱动
        m.head.rotation.x = lerp(0.35 + Math.sin(t * 0.8 + m.ph) * 0.05, -0.15 + Math.sin(t * 6 + m.ph) * 0.12, k);
        m.head.rotation.z = lerp(Math.sin(t * 0.5 + m.ph) * 0.08, Math.sin(t * 8 + m.ph) * 0.25, k);
        m.tongue.visible = k > 0.5 && (i !== 1 || Math.sin(t * 4) > 0);
        m.mouth.scale.set(1.4, lerp(0.5, 1.4, k), 0.6);
        m.hands.forEach((h, j) => { h.position.y = Math.sin(t * 14 + j * 2 + m.ph) * 0.02 * k; });
      });
    },
  };
}

// ================= 装修地堡 =================
export function decorateCastle(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, camBox, LAYOUT } = ctx;
  const { SZ, WR, DOOR, WW, TW } = LAYOUT;
  const rnd = mulberry32(7700);
  const props = new THREE.Group(); props.name = 'castleProps';
  const P = (o) => { props.add(o); return o; };
  const clean = new Set();
  const keep = (m) => { m.userData.aged = true; clean.add(m); return m; };
  const I4 = new THREE.Matrix4();
  const flames = []; // 每帧跳动的火苗 [flame, 强度函数]
  refs.castle = {};

  // ===== 0. 收拾：这个年代没有的东西一律收掉 =====
  refs.fog.mesh.visible = false; refs.doodle.mesh.visible = false; refs.view.visible = false;
  refs.curtain.left.visible = false; refs.curtain.right.visible = false; refs.curtainRod.visible = false;
  refs.win.visible = false;
  for (const fx of refs.fixtures) fx.visible = false;
  refs.lock.group.visible = false; refs.lock.dropped.visible = false;
  collision.setEnabled('lockCable', false);
  for (const o of [refs.ac, refs.clock, refs.sw, refs.suitcase, refs.shelf]) if (o) o.visible = false;
  const hideAll = (list, keepList = []) => { for (const o of list) if (!keepList.includes(o)) o.visible = false; };
  const S_ = refs.sections;
  hideAll(S_.sw); hideAll(S_.floor); hideAll(S_.misc);
  hideAll(S_.eastS, [refs.beds.E1]);
  hideAll(S_.far, [refs.farDesks.od]);
  hideAll(S_.eastN, [refs.beds.E2]);
  hideAll(S_.west, [refs.beds.W1, refs.beds.W2, ...refs.fallenBooks]);
  hideAll(S_.desks, [refs.desks.D1, refs.desks.D2, refs.stoolMe, refs.stool2]);
  const D1 = refs.desks.D1, D2 = refs.desks.D2;
  for (const D of [D1, D2]) for (const c of D.children) if (c.position.y >= 0.759 || (c.geometry && c.geometry.type === 'TubeGeometry') || c === refs.strip || c === refs.tower) c.visible = false;
  for (const c of refs.drawer.children) if (!c.isMesh) c.visible = false;
  // 碰撞：搬走的东西（头盔凳、脏衣篓、行李箱、收纳袋、收纳箱、垃圾桶）
  const drop = (x0, z0) => { collision.boxes = collision.boxes.filter((b) => !(Math.abs(b.minX - x0) < 1e-3 && Math.abs(b.minZ - z0) < 1e-3)); };
  drop(-1.0, 2.05); drop(0.36, -2.42); drop(0.96, SZ - 0.87); drop(0.92, SZ - 0.45); drop(0.5, SZ - 0.34);
  collision.boxes = collision.boxes.filter((b) => b.id !== 'suitcase');
  refs.gap.line.color.set('#5a3a1e');
  refs.gap.glow.color.set('#6a4420');

  // ===== 1. 墙 / 地 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0.25 });
  M.wall.needsUpdate = true;
  M.floor.normalScale.set(1.3, 1.3); M.floor.envMapIntensity = 0.4;
  M.floorDirt.polygonOffsetFactor = -2;
  keep(M.wall); keep(M.floor); keep(M.floorDirt);
  root.traverse((o) => { if (o.isMesh && o.material === M.ceiling) o.visible = false; });
  for (const o of refs.corridor.children) if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.position.y > 2.5) o.material = std('#1a1612', 0.95);

  // ===== 2. 筒形拱顶 + 三道拱肋 =====
  const VR = 2.425, VC = 0.575, VA = Math.asin(1.8 / VR);
  const vaultM = keep(new THREE.MeshStandardMaterial({ map: T.ceiling, normalMap: T.ceilingN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, side: THREE.BackSide, envMapIntensity: 0.2 }));
  {
    const z0 = -3.6 - TW, z1 = SZ + TW;
    const g = new THREE.CylinderGeometry(VR, VR, z1 - z0, 48, 1, true, Math.PI - VA, 2 * VA);
    g.rotateX(Math.PI / 2); g.translate(0, VC, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getX(i), p.getY(i) - VC); uv.setXY(i, p.getZ(i) / 2, (a * VR) / 2); }
    const vault = mesh(g, vaultM, { cast: true });
    P(vault); refs.occluders.push(vault);
  }
  const ribM = M.wall;
  const ribZ = [-2.75, 0.35, 3.3];
  const ribB = new Batch();
  for (const z of ribZ) {
    const sh = new THREE.Shape(), a0 = Math.PI / 2 - VA, a1 = Math.PI / 2 + VA, n = 24;
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * (k / n); const x = Math.cos(a) * (VR - 0.005), y = VC + Math.sin(a) * (VR - 0.005); if (k === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
    for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * (k / n); sh.lineTo(Math.cos(a) * (VR - 0.13), VC + Math.sin(a) * (VR - 0.13)); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, z - 0.14);
    ribB.add(g, ribM, I4.identity());
    // 拱脚下面的托石
    for (const s of [-1, 1]) ribB.add(new THREE.BoxGeometry(0.2, 0.16, 0.34), ribM, I4.makeTranslation(s * 1.71, 2.12, z));
  }
  ribB.build(props, { cast: true, name: 'ribs' });
  // 镜头别钻进拱顶两边低下去的地方
  for (const s of [-1, 1]) {
    for (const [a, b, y] of [[1.55, 1.8, 2.2], [1.2, 1.55, 2.44], [0.8, 1.2, 2.68]]) camBox(s > 0 ? a : -b, s > 0 ? b : -a, y, 4, -3.6, SZ);
  }

  // ===== 3. 北墙：大窗户砌死，只留一扇尖拱小窗（铁栅栏 + 两扇木窗板）=====
  const OX = 0.42, OY0 = 1.12, OSP = 1.9, OR = 0.6; // 窗洞半宽、窗台、拱脚、拱的半径
  const archTop = (x) => { const cx = x <= 0 ? -OX + OR : OX - OR; return OSP + Math.sqrt(Math.max(0, OR * OR - (x - cx) ** 2)); };
  {
    const sh = new THREE.Shape();
    sh.moveTo(-1.36, 0.94); sh.lineTo(1.36, 0.94); sh.lineTo(1.36, 2.56); sh.lineTo(-1.36, 2.56); sh.lineTo(-1.36, 0.94);
    const hole = new THREE.Path();
    hole.moveTo(-OX, OY0); hole.lineTo(-OX, OSP);
    for (let k = 1; k <= 12; k++) { const x = -OX + (OX * k) / 12; hole.lineTo(x, archTop(x)); }
    for (let k = 1; k <= 12; k++) { const x = (OX * k) / 12; hole.lineTo(x, archTop(x)); }
    hole.lineTo(OX, OY0); hole.lineTo(-OX, OY0);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: 1 });
    const infill = mesh(g, M.wall, { z: -3.6 - TW });
    K.worldUV(infill, 0.5, 1 / 3);
    P(infill); refs.occluders.push(infill);
  }
  const EMB_Z = -3.6 - TW + 0.3; // 窗洞里侧的墙面
  // 窗台：一块厚石板
  P(mesh(new THREE.BoxGeometry(OX * 2 + 0.1, 0.06, 0.34), M.wall, { y: OY0 - 0.03, z: EMB_Z - 0.14 }));
  // 铁栅栏（在墙的正中间）
  const ironM = keep(std('#1e1c1a', 0.55, 0.7));
  const barB = new Batch();
  for (const x of [-0.28, -0.09, 0.09, 0.28]) barB.add(cylBetween(V(x, OY0, -3.68), V(x, archTop(x), -3.68), 0.012, 0.012, 6), ironM, I4.identity());
  for (const y of [1.45, 1.85]) barB.add(cylBetween(V(-OX, y, -3.68), V(OX, y, -3.68), 0.01, 0.01, 6), ironM, I4.identity());
  barB.build(props, { cast: true, name: 'grille' });
  // 两扇木窗板：合页在窗洞两边，往屋里开
  const plankT = genPlanks({ seed: 7402, n: 3, base: '#4a3220', dark: '#24160c' });
  const shutterM = keep(new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.85 }));
  const shutters = [-1, 1].map((s) => {
    const hinge = new THREE.Group(); hinge.position.set(s * (OX + 0.02), 0, EMB_Z + 0.03); P(hinge);
    const leaf = new THREE.Group(); hinge.add(leaf);
    const w = OX + 0.02, h = 1.42;
    leaf.add(mesh(new THREE.BoxGeometry(w, h, 0.035), shutterM, { x: -s * w / 2, y: OY0 + h / 2 - 0.02 }));
    for (const y of [OY0 + 0.25, OY0 + 1.1]) leaf.add(mesh(new THREE.BoxGeometry(w * 0.85, 0.04, 0.012), ironM, { x: -s * w * 0.45, y, z: 0.024 }));
    // 窗板上沿随着尖拱削掉一点（拿一块墙色的三角挡着）
    return { hinge, leaf, s };
  });
  // 窗闩：一根横木（关着的时候插在两扇窗板上）
  const bar = mesh(new THREE.BoxGeometry(OX * 2 + 0.16, 0.05, 0.04), keep(std('#3a2616', 0.8)), { y: 1.55, z: EMB_Z + 0.075 });
  P(bar);
  // 关着的窗板缝里透进来的一线月光
  const leak = glowSprite([150, 170, 220], 1.2, 0.25); leak.position.set(0, 1.7, EMB_Z + 0.08); leak.scale.set(0.12, 1.3, 1); P(leak);
  const winHit = mesh(new THREE.PlaneGeometry(OX * 2 + 0.1, 1.45), new THREE.MeshBasicMaterial({ visible: false }), { y: OY0 + 0.72, z: EMB_Z + 0.1 });
  P(winHit); mark('window', winHit);
  refs.castle.shutters = { list: shutters, bar, leak, hit: winHit, open: 0 };
  // 窗外
  const vista = buildVista(rnd);
  add(vista.group);
  refs.vista = vista;

  // ===== 4. 橡木门：竖条木板 + 三道铁合页 + 一圈铆钉 + 大铁环门把 + 门上的小窥视窗 =====
  const dp = refs.door.pivot, DW = DOOR.z1 - DOOR.z0 - 0.02;
  const oakM = keep(new THREE.MeshStandardMaterial({ map: genPlanks({ seed: 7403, n: 5, base: '#3e2a1a', dark: '#1e1208' }), roughness: 0.8 }));
  refs.door.slab.material = oakM; refs.door.slab.scale.z = 1.6;
  for (const c of dp.children) if (c !== refs.door.slab) c.visible = false;
  const db = new Batch();
  for (const y of [0.3, 1.05, 1.78]) {
    for (const z of [-0.042, 0.042]) {
      db.add(new THREE.BoxGeometry(DW * 0.82, 0.06, 0.01), ironM, I4.makeTranslation(-DW * 0.41, y, z));
      for (let k = 0; k < 6; k++) db.add(new THREE.SphereGeometry(0.009, 6, 4), ironM, I4.makeTranslation(-0.04 - k * DW * 0.14, y, z * 1.2));
    }
    const curl = new THREE.TorusGeometry(0.035, 0.009, 5, 12, Math.PI * 1.5); curl.rotateZ(Math.PI / 2);
    db.add(curl, ironM, I4.makeTranslation(-DW * 0.82, y + 0.035, -0.044));
  }
  // 一圈铆钉
  for (let k = 0; k < 14; k++) { const y = 0.12 + k * 0.14; db.add(new THREE.SphereGeometry(0.008, 6, 4), ironM, I4.makeTranslation(-DW + 0.05, y, -0.044)); }
  // 窥视窗：一个小方框 + 两根铁条
  db.add(new THREE.BoxGeometry(0.16, 0.12, 0.012), ironM, I4.makeTranslation(-DW / 2, 1.52, -0.043));
  db.build(dp, { cast: true, name: 'doorIron' }).forEach((m) => mark('door', m));
  const ring = new THREE.Group(); ring.position.set(-(DW - 0.12), 1.0, -0.05); dp.add(ring);
  ring.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), ironM, { rx: Math.PI / 2 }));
  ring.add(mesh(new THREE.TorusGeometry(0.055, 0.009, 8, 20), ironM, { y: -0.055, z: -0.012 }));
  mark('door', ring);
  // 门框：两块立着的石头 + 一块门楣
  root.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === '3b2216' && Math.abs(o.position.x + 1.8) < 0.01) o.visible = false; });
  for (const z of [DOOR.z0 - 0.06, DOOR.z1 + 0.06]) { const m = mesh(new THREE.BoxGeometry(0.1, 2.14, 0.14), M.wall, { x: -1.76, y: 1.07, z }); K.worldUV(m, 0.5, 1 / 3); P(m); }
  { const m = mesh(new THREE.BoxGeometry(0.12, 0.2, DOOR.z1 - DOOR.z0 + 0.3), M.wall, { x: -1.76, y: 2.14, z: (DOOR.z0 + DOOR.z1) / 2 }); K.worldUV(m, 0.5, 1 / 3); P(m); }

  // ===== 5. 壁炉（西墙，原来杂物桌的位置）+ 吊着的一锅菜粥 + 炉前的羊皮和狗 =====
  const HZ = HEARTH.z, HX0 = -1.8, HX1 = -1.25, HZ0 = HZ - 0.65, HZ1 = HZ + 0.65;
  const hearthB = new Batch();
  const wallBox = (x0, x1, y0, y1, z0, z1) => { const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), M.wall, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }); m.updateMatrixWorld(true); K.worldUV(m, 0.5, 1 / 3); hearthB.add(m.geometry, M.wall, m.matrixWorld); };
  wallBox(HX0, HX1, 0, 1.0, HZ0, HZ0 + 0.2); // 两边的炉壁
  wallBox(HX0, HX1, 0, 1.0, HZ1 - 0.2, HZ1);
  wallBox(HX0, HX1 + 0.05, 0, 0.06, HZ0 - 0.05, HZ1 + 0.05); // 炉膛底石
  // 炉罩：从门楣上方一路收到墙里（梯台）
  {
    const g = new THREE.BoxGeometry(HX1 - HX0 + 0.06, 1.1, HZ1 - HZ0 + 0.08);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) { p.setX(i, p.getX(i) < 0 ? p.getX(i) : p.getX(i) - 0.28); p.setZ(i, p.getZ(i) * 0.5); }
    }
    g.computeVertexNormals();
    const m = mesh(g, M.wall, { x: (HX0 + HX1 + 0.06) / 2, y: 1.14 + 0.55, z: HZ });
    m.updateMatrixWorld(true); K.worldUV(m, 0.5, 1 / 3);
    hearthB.add(m.geometry, M.wall, m.matrixWorld);
    wallBox(HX0, HX0 + 0.3, 2.24, 2.9, HZ - 0.34, HZ + 0.34); // 烟道
  }
  hearthB.build(props, { cast: true, name: 'hearth' }).forEach((m) => { mark('hearth', m); refs.occluders.push(m); });
  // 门楣：一根被熏黑的橡木梁
  P(mark('hearth', mesh(new THREE.BoxGeometry(0.62, 0.16, HZ1 - HZ0 + 0.1), keep(std('#2a1c12', 0.85, 0, { map: T.woodDark })), { x: -1.51, y: 1.07, z: HZ })));
  // 炉膛里：灰、柴火、炭火、火苗
  P(mesh(new THREE.PlaneGeometry(0.5, 0.86), keep(std('#2a2622', 1)), { x: -1.55, y: 0.062, z: HZ, rx: -Math.PI / 2, cast: false }));
  const logM = keep(std('#3a2818', 0.9, 0, { map: T.woodDark }));
  for (const [x, z, r, ry] of [[-1.58, HZ - 0.12, 0.05, 0.3], [-1.55, HZ + 0.12, 0.045, -0.4], [-1.6, HZ, 0.04, 1.4]]) P(mesh(new THREE.CylinderGeometry(r, r, 0.55, 10), logM, { x, y: 0.12, z, rz: Math.PI / 2, ry, cast: false }));
  const emberM = keep(new THREE.MeshStandardMaterial({ color: '#1a0e08', emissive: new THREE.Color('#ff5018'), emissiveIntensity: 2.2, roughness: 0.8 }));
  const emB = new Batch();
  for (let k = 0; k < 16; k++) emB.add(new THREE.IcosahedronGeometry(0.02 + rnd() * 0.025, 0), emberM, I4.makeTranslation(-1.56 + (rnd() - 0.5) * 0.25, 0.08 + rnd() * 0.03, HZ + (rnd() - 0.5) * 0.5));
  emB.build(props, { cast: false, name: 'embers' });
  const fireF = [];
  for (const [dx, dz, w, h, op] of [[0, -0.02, 0.44, 0.42, 0.42], [-0.05, 0.03, 0.3, 0.3, 0.3]]) { const f = makeFire(5, w, h, op); f.group.position.set(-1.57 + dx, 0.1, HZ + dz); P(f.group); fireF.push(f); }
  const fireGlow = glowSprite([255, 150, 60], 1.1, 0.3); fireGlow.position.set(-1.45, 0.45, HZ); P(fireGlow);
  // 柴架（炉膛两边的铁架）
  for (const dz of [-0.28, 0.28]) P(mesh(new THREE.BoxGeometry(0.3, 0.025, 0.025), ironM, { x: -1.5, y: 0.1, z: HZ + dz }));
  // 吊锅：铁链从炉罩里垂下来，锅里咕嘟着一锅菜粥
  P(mesh(cylBetween(V(-1.55, 1.12, HZ), V(-1.55, 0.72, HZ), 0.006, 0.006, 5), ironM, { cast: false }));
  const pot = new THREE.Group(); pot.position.set(-1.55, 0.5, HZ);
  const potPts = [[0.02, 0], [0.12, 0.01], [0.16, 0.08], [0.16, 0.16], [0.14, 0.2], [0.145, 0.21]].map(([r, y]) => new THREE.Vector2(r, y));
  pot.add(mesh(new THREE.LatheGeometry(potPts, 24), keep(std('#1a1816', 0.5, 0.6, { side: THREE.DoubleSide }))));
  pot.add(mesh(new THREE.CircleGeometry(0.14, 24), keep(std('#6a5a34', 0.45)), { y: 0.18, rx: -Math.PI / 2, cast: false }));
  pot.add(mesh(new THREE.TorusGeometry(0.15, 0.006, 5, 20, Math.PI), ironM, { y: 0.21, cast: false }));
  P(pot); mark('pot', pot);
  refs.castle.pot = pot;
  // 火钳、铲子靠在炉边
  P(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), ironM, { x: -1.22, y: 0.4, z: HZ1 + 0.08, rz: 0.1 }));
  P(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.78, 6), ironM, { x: -1.2, y: 0.39, z: HZ1 + 0.12, rz: 0.06 }));
  // 羊皮 + 一小堆稻草：杂毛的窝
  const peltM = keep(new THREE.MeshStandardMaterial({ map: TF.genPelt({ seed: 7710, base: '#b8a88a' }), roughness: 1 }));
  { const g = new THREE.CircleGeometry(0.42, 24); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); const r = 1 + Math.sin(a * 5) * 0.08 + Math.sin(a * 3 + 1) * 0.06; p.setXY(i, p.getX(i) * r * 0.8, p.getY(i) * r * 1.25); } P(mesh(g, peltM, { x: DOG_HOME.x, y: 0.012, z: DOG_HOME.z, rx: -Math.PI / 2, cast: false })); }
  const strawM = keep(new THREE.MeshStandardMaterial({ map: T.bamboo, roughness: 1, color: '#c8b080' }));
  const strawB = new Batch();
  for (let k = 0; k < 90; k++) {
    const a = rnd() * 6.28, r = 0.3 + rnd() * 0.25;
    const x = DOG_HOME.x + Math.cos(a) * r * 0.8, z = DOG_HOME.z + Math.sin(a) * r * 1.2;
    strawB.add(cylBetween(V(x, 0.01, z), V(x + (rnd() - 0.5) * 0.2, 0.01 + rnd() * 0.02, z + (rnd() - 0.5) * 0.2), 0.003, 0.003, 3), strawM, I4.identity());
  }
  strawB.build(props, { cast: false, name: 'straw' });
  // 狗
  const mutt = new Mutt();
  mutt.root.position.copy(DOG_HOME);
  P(mutt.root); mark('mutt', mutt.root);
  refs.mutt = mutt;
  // 炉火的光：一盏从炉口往屋里打的聚光（带影子，床架的影子投到东墙上）
  const hearthSpot = new THREE.SpotLight('#ff8a3a', 0, 9, 1.3, 0.9, 1.4);
  hearthSpot.position.set(-1.15, 0.5, HZ); hearthSpot.target.position.set(1.5, 0.35, HZ);
  hearthSpot.castShadow = true; hearthSpot.shadow.mapSize.set(1024, 1024);
  hearthSpot.shadow.bias = -0.0006; hearthSpot.shadow.normalBias = 0.02; hearthSpot.shadow.radius = 4;
  hearthSpot.shadow.camera.near = 0.1; hearthSpot.shadow.camera.far = 8;
  P(hearthSpot); P(hearthSpot.target);

  // ===== 6. 门边的搁板桌：面包、奶酪、一串香肠、一罐啤酒 =====
  const tableM = keep(new THREE.MeshStandardMaterial({ map: genPlanks({ seed: 7404, W: 256, H: 256, n: 3, base: '#5a3e26', dark: '#3a2616' }), roughness: 0.8 }));
  const ft = new THREE.Group(); ft.position.set(-1.53, 0, 3.12); P(ft);
  ft.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.86), tableM, { y: 0.72 }));
  for (const z of [-0.3, 0.3]) for (const s of [-1, 1]) ft.add(mesh(new THREE.BoxGeometry(0.04, 0.76, 0.05), tableM, { x: s * 0.12, y: 0.35, z, rz: s * 0.28 }));
  ft.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.66), tableM, { y: 0.2 }));
  compact(ft); mark('foodTable', ft);
  const T0 = 0.745;
  const breadM = keep(std('#8a5a2a', 0.7)), crumbM = keep(std('#d8c49a', 0.9));
  const bread = new THREE.Group(); bread.position.set(-1.62, T0, 2.95);
  bread.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), breadM, { y: 0.03, s: [1.2, 0.55, 0.9] }));
  bread.add(mesh(new THREE.CircleGeometry(0.06, 14), crumbM, { x: 0.105, y: 0.03, ry: Math.PI / 2, s: [0.8, 0.5, 1], cast: false }));
  P(bread); mark('bread', bread);
  const cheese = new THREE.Group(); cheese.position.set(-1.44, T0, 3.02);
  cheese.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 20, 1, false, 0.6, Math.PI * 2 - 0.6), keep(std('#d8a848', 0.6)), { y: 0.03 }));
  P(cheese); mark('bread', cheese);
  // 香肠：一块木板上盘着一串
  const sBoard = new THREE.Group(); sBoard.position.set(-1.5, T0, 3.32);
  sBoard.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), tableM, { y: 0.01 }));
  const sausM = keep(std('#6a2a18', 0.45));
  const sausages = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group(); g.position.set(-0.06 + k * 0.04, 0.035, 0); g.rotation.y = (k - 1.5) * 0.15;
    g.add(mesh(new THREE.CapsuleGeometry(0.014, 0.1, 4, 8), sausM, { rx: Math.PI / 2 }));
    sBoard.add(g); sausages.push(g);
  }
  P(sBoard); mark('sausage', sBoard);
  refs.castle.sausages = sausages;
  // 啤酒：陶罐 + 木头酒杯
  const jug = new THREE.Group(); jug.position.set(-1.66, T0, 3.42);
  const jugPts = [[0.001, 0], [0.05, 0.005], [0.07, 0.06], [0.065, 0.14], [0.04, 0.2], [0.045, 0.23]].map(([r, y]) => new THREE.Vector2(r, y));
  jug.add(mesh(new THREE.LatheGeometry(jugPts, 18), keep(std('#8a5a3a', 0.55))));
  jug.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), keep(std('#8a5a3a', 0.55)), { x: 0.06, y: 0.14, rz: -Math.PI / 2 }));
  P(jug); mark('beer', jug);
  const tank = new THREE.Group(); tank.position.set(-1.42, T0, 3.5);
  tank.add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 14, 1, true), keep(std('#6a4a2a', 0.7, 0, { side: THREE.DoubleSide })), { y: 0.06 }));
  tank.add(mesh(new THREE.CircleGeometry(0.038, 14), keep(std('#c89a4a', 0.2)), { y: 0.1, rx: -Math.PI / 2, cast: false }));
  for (const y of [0.02, 0.1]) tank.add(mesh(new THREE.TorusGeometry(0.044, 0.004, 4, 16), ironM, { y, rx: Math.PI / 2, cast: false }));
  P(tank); mark('beer', tank);
  // 一根蜡烛
  const candleM = keep(std('#d8c8a0', 0.7));
  const smallCandle = (x, y, z, h = 0.1, parent = props) => {
    const c = mesh(new THREE.CylinderGeometry(0.014, 0.016, h, 10), candleM, { x, y: y + h / 2, z, cast: false });
    parent.add(c);
    const f = makeFlame(0.35, 2); f.group.position.set(x, y + h, z); parent.add(f.group);
    flames.push([f, () => 1]);
    return f;
  };
  smallCandle(-1.7, T0, 3.1, 0.08);

  // ===== 7. 墙上的火把（门边 + 磨刀石上方）=====
  const torch = (x, y, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; P(g);
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), ironM, { z: 0.02 }));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 10), ironM, { y: 0.02, z: 0.09, rx: -0.5 }));
    g.add(mesh(cylBetween(V(0, -0.15, 0.03), V(0, 0.18, 0.14), 0.016, 0.02, 8), keep(std('#4a3220', 0.8)), {}));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.08, 8), keep(std('#1a1410', 0.9)), { y: 0.2, z: 0.145, rx: -0.33 }));
    const f = makeFlame(1.5, 3); f.group.position.set(0, 0.23, 0.155); g.add(f.group);
    const gl = glowSprite([255, 160, 70], 0.9, 0.55); gl.position.set(0, 0.33, 0.16); g.add(gl);
    flames.push([f, () => 1]);
    mark('sconce', g);
    return { g, f, gl };
  };
  const torchW = torch(-1.795, 1.62, 2.98, Math.PI / 2);
  const torchE = torch(1.795, 1.62, 3.3, -Math.PI / 2);
  const torchLight = new THREE.PointLight('#ff9a4a', 2.2, 5.5, 1.5); torchLight.position.set(-1.58, 1.95, 2.98); P(torchLight);

  // ===== 8. 两盏铁环蜡烛吊灯（从拱顶正中垂下来）=====
  const chandeliers = [];
  for (const z of [2.3, -1.6]) {
    const g = new THREE.Group(); g.position.set(0, 2.32, z); P(g);
    g.add(mesh(new THREE.TorusGeometry(0.32, 0.014, 6, 36), ironM, { rx: Math.PI / 2 }));
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; g.add(mesh(cylBetween(V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), V(0, 0.66, 0), 0.004, 0.004, 4), ironM, { cast: false })); }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 0.32, zz = Math.sin(a) * 0.32;
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.02, 8), ironM, { x, y: 0.02, z: zz, cast: false }));
      smallCandle(x, 0.03, zz, 0.07 + rnd() * 0.05, g);
    }
    chandeliers.push(g);
  }
  refs.castle.chandeliers = chandeliers;

  // ===== 9. 炼金台（我的书桌）=====
  const DT = 0.76;
  const copperM = keep(std('#9a5a34', 0.35, 0.85)), brassM = keep(std('#a8843a', 0.35, 0.85));
  const glassM = keep(new THREE.MeshStandardMaterial({ color: '#d8e8e0', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  const bench = new THREE.Group(); bench.name = 'alchemy'; P(bench);
  // 炭炉：三条腿的铁盆 + 炭
  const brazier = new THREE.Group(); brazier.position.set(1.56, DT, -0.02); bench.add(brazier);
  brazier.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.06, 18, 1, true), keep(std('#1c1a18', 0.6, 0.6, { side: THREE.DoubleSide })), { y: 0.09 }));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; brazier.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 5), ironM, { x: Math.cos(a) * 0.07, y: 0.035, z: Math.sin(a) * 0.07, cast: false })); }
  const coalM = keep(new THREE.MeshStandardMaterial({ color: '#141210', emissive: new THREE.Color('#ff4a14'), emissiveIntensity: 0.4, roughness: 0.8 }));
  const cb = new Batch();
  for (let k = 0; k < 10; k++) cb.add(new THREE.IcosahedronGeometry(0.018 + rnd() * 0.012, 0), coalM, I4.makeTranslation((rnd() - 0.5) * 0.12, 0.1 + rnd() * 0.02, (rnd() - 0.5) * 0.12));
  cb.build(brazier, { cast: false, name: 'coal' });
  const bFlame = makeFlame(0.9, 3); bFlame.group.position.set(0, 0.11, 0); brazier.add(bFlame.group);
  // 铜锅（架在三脚架上）+ 锅里的汤
  for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28 + 0.5; brazier.add(mesh(cylBetween(V(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), V(Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06), 0.005, 0.005, 5), ironM, { cast: false })); }
  const cauldron = new THREE.Group(); cauldron.position.set(0, 0.2, 0); brazier.add(cauldron);
  const cPts = [[0.001, 0], [0.05, 0.004], [0.085, 0.04], [0.09, 0.08], [0.08, 0.1], [0.085, 0.105]].map(([r, y]) => new THREE.Vector2(r, y));
  cauldron.add(mesh(new THREE.LatheGeometry(cPts, 22), keep(std('#8a4a2a', 0.35, 0.85, { side: THREE.DoubleSide }))));
  const brewM = keep(new THREE.MeshStandardMaterial({ color: '#4a0e14', roughness: 0.2, emissive: new THREE.Color('#000000'), emissiveIntensity: 1 }));
  const brew = mesh(new THREE.CircleGeometry(0.08, 22), brewM, { y: 0.075, rx: -Math.PI / 2, cast: false });
  cauldron.add(brew);
  // 风箱：两块木板 + 皮囊 + 铜嘴，嘴对着炭炉
  const bellows = new THREE.Group(); bellows.position.set(1.44, DT + 0.03, -0.22); bellows.rotation.set(0, 0.15, 0); bench.add(bellows);
  const bWood = keep(std('#5a3a22', 0.75, 0, { map: T.woodOrange }));
  const bShape = new THREE.Shape(); bShape.moveTo(0, 0.12); bShape.quadraticCurveTo(0.09, 0.1, 0.07, -0.08); bShape.lineTo(0.02, -0.14); bShape.lineTo(-0.02, -0.14); bShape.lineTo(-0.07, -0.08); bShape.quadraticCurveTo(-0.09, 0.1, 0, 0.12);
  const bGeo = new THREE.ShapeGeometry(bShape); bGeo.rotateX(-Math.PI / 2);
  const bTop = new THREE.Group(); bellows.add(bTop);
  bTop.add(mesh(new THREE.ExtrudeGeometry(bShape, { depth: 0.012, bevelEnabled: false }).rotateX(-Math.PI / 2), bWood, { y: 0.045 }));
  bellows.add(mesh(new THREE.ExtrudeGeometry(bShape, { depth: 0.012, bevelEnabled: false }).rotateX(-Math.PI / 2), bWood, { y: 0 }));
  const bag = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 16), keep(std('#3a2416', 0.7)), { y: 0.025, z: 0.0, s: [1, 1, 1.3] });
  bellows.add(bag);
  bellows.add(mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.1, 8), brassM, { y: 0.02, z: 0.19, rx: Math.PI / 2 }));
  bGeo.dispose();
  // 研钵 + 研杵
  const mortar = new THREE.Group(); mortar.position.set(1.34, DT, 0.22); bench.add(mortar);
  const mPts = [[0.001, 0], [0.045, 0.002], [0.055, 0.03], [0.05, 0.06], [0.04, 0.062], [0.042, 0.035], [0.001, 0.02]].map(([r, y]) => new THREE.Vector2(r, y));
  mortar.add(mesh(new THREE.LatheGeometry(mPts, 20), keep(std('#8a8478', 0.8))));
  const pestle = new THREE.Group(); pestle.position.set(0, 0.035, 0); pestle.rotation.set(0.35, 0, 0.3); mortar.add(pestle);
  pestle.add(mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.13, 10), keep(std('#8a8478', 0.8)), { y: 0.065 }));
  const paste = mesh(new THREE.CircleGeometry(0.036, 14), keep(std('#3a5a22', 0.6)), { y: 0.036, rx: -Math.PI / 2, cast: false });
  paste.visible = false; mortar.add(paste);
  const leafM = keep(std('#3a6a2a', 0.7, 0, { side: THREE.DoubleSide }));
  const leaves = [];
  for (let k = 0; k < 9; k++) { const l = mesh(new THREE.CircleGeometry(0.018, 6), leafM, { x: (rnd() - 0.5) * 0.04, y: 0.045 + k * 0.002, z: (rnd() - 0.5) * 0.04, rx: -Math.PI / 2 + (rnd() - 0.5) * 0.4, rz: rnd() * 6, s: [1, 1.8, 1], cast: false }); l.visible = false; mortar.add(l); leaves.push(l); }
  // 沙漏
  const hg = new THREE.Group(); hg.position.set(1.33, DT, 0.44); bench.add(hg);
  const hgInner = new THREE.Group(); hgInner.position.y = 0.08; hg.add(hgInner);
  for (const y of [-0.075, 0.075]) hgInner.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 16), keep(std('#4a3020', 0.7)), { y }));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; hgInner.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 6), keep(std('#4a3020', 0.7)), { x: Math.cos(a) * 0.033, z: Math.sin(a) * 0.033, cast: false })); }
  for (const s of [-1, 1]) hgInner.add(mesh(new THREE.SphereGeometry(0.027, 14, 10), glassM, { y: s * 0.034, s: [1, 1.3, 1], cast: false }));
  const sandM = keep(std('#c8a868', 0.9));
  const sandTop = mesh(new THREE.ConeGeometry(0.02, 0.03, 12), sandM, { y: 0.025, rx: Math.PI, cast: false });
  const sandBot = mesh(new THREE.ConeGeometry(0.022, 0.018, 12), sandM, { y: -0.058, cast: false });
  hgInner.add(sandTop, sandBot);
  // 蒸馏器：玻璃曲颈瓶 → 细管 → 接收瓶（熬好的救世主酒就滴在这里）
  const alem = new THREE.Group(); alem.position.set(1.64, DT, 0.34); bench.add(alem);
  alem.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), keep(std('#4a3020', 0.7)), { y: 0.025 }));
  alem.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), glassM, { y: 0.1, cast: false }));
  const retortLiquid = mesh(new THREE.SphereGeometry(0.045, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), keep(new THREE.MeshStandardMaterial({ color: '#5a1a14', roughness: 0.2, transparent: true, opacity: 0.8 })), { y: 0.1, cast: false });
  alem.add(retortLiquid);
  alem.add(mesh(cylBetween(V(0, 0.15, 0), V(-0.16, 0.12, 0.26), 0.008, 0.005, 8), glassM, { cast: false }));
  const flask = new THREE.Group(); flask.position.set(1.48, DT, 0.62); bench.add(flask);
  flask.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), glassM, { y: 0.045, cast: false }));
  flask.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 10), glassM, { y: 0.1, cast: false }));
  const schnappsM = keep(new THREE.MeshStandardMaterial({ color: '#c8a030', roughness: 0.15, transparent: true, opacity: 0.85, emissive: new THREE.Color('#ffb040'), emissiveIntensity: 0 }));
  const schnapps = mesh(new THREE.SphereGeometry(0.038, 14, 10, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), schnappsM, { y: 0.045, cast: false });
  schnapps.scale.y = 0.001; flask.add(schnapps);
  const drip = mesh(new THREE.SphereGeometry(0.006, 8, 6), schnappsM, { x: 1.48 - 1.48, y: 0.14, cast: false }); drip.visible = false; flask.add(drip);
  const flaskGlow = glowSprite([255, 200, 90], 0.35, 0); flaskGlow.position.set(0, 0.05, 0); flask.add(flaskGlow);
  // 蜡烛 + 一本摊开的炼金书
  smallCandle(1.7, DT, 0.66, 0.12);
  const book = new THREE.Group(); book.position.set(1.62, DT, 0.08); book.rotation.y = -Math.PI / 2 + 0.1;
  for (const s of [-1, 1]) { const pg = mesh(new THREE.BoxGeometry(0.12, 0.012, 0.17), keep(std('#d8c49a', 0.9)), { x: s * 0.062, y: 0.01, rz: s * 0.06 }); book.add(pg); }
  book.add(mesh(new THREE.BoxGeometry(0.26, 0.006, 0.18), keep(std('#3a2012', 0.7)), { y: 0.003 }));
  bench.add(book);
  compact(brazier, [cauldron, bFlame.group]);
  // 墙上：晒干的草药一束束挂着，还有一张配方
  const herbCols = ['#3a5a2a', '#5a6a4a', '#4a4a2a', '#2a3a22', '#6a5a3a'];
  const herbs = new THREE.Group(); bench.add(herbs);
  for (let k = 0; k < 5; k++) {
    const z = -0.18 + k * 0.17, y = 1.55 - (k % 2) * 0.06;
    herbs.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 5), keep(std('#8a7a5a', 0.9)), { x: 1.775, y: y + 0.03, z, cast: false }));
    herbs.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 8), keep(std(herbCols[k], 0.95)), { x: 1.76, y: y - 0.1, z, rx: Math.PI }));
    if (k === 2) for (let j = 0; j < 5; j++) herbs.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), keep(std('#2a1030', 0.3)), { x: 1.73 + (rnd() - 0.5) * 0.03, y: y - 0.12 - rnd() * 0.08, z: z + (rnd() - 0.5) * 0.05, cast: false })); // 颠茄的黑果子
  }
  mark('herbs', herbs);
  const recipe = mesh(new THREE.PlaneGeometry(0.24, 0.32), keep(new THREE.MeshStandardMaterial({ map: TC.genParchment({ seed: 7801, title: '救世主酒', lines: 10 }), transparent: true, roughness: 0.9 })), { x: 1.787, y: 1.12, z: 0.3, ry: -Math.PI / 2, cast: false });
  P(recipe); mark('recipe', recipe);
  P(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6), ironM, { x: 1.782, y: 1.26, z: 0.3, rz: Math.PI / 2, cast: false }));
  // 匕首插在桌上，底下压着一封信
  const letter = new THREE.Group(); letter.position.set(1.33, DT + 0.002, 0.0); letter.rotation.y = 0.3;
  letter.add(mesh(new THREE.PlaneGeometry(0.15, 0.2), keep(new THREE.MeshStandardMaterial({ map: TC.genParchment({ seed: 7802, lines: 9 }), transparent: true, roughness: 0.9, side: THREE.DoubleSide })), { rx: -Math.PI / 2, cast: false }));
  const dagger = new THREE.Group(); dagger.position.set(0.01, 0, -0.02); dagger.rotation.set(0.12, 0.4, -0.08); letter.add(dagger);
  dagger.add(mesh(new THREE.BoxGeometry(0.018, 0.1, 0.004), keep(std('#b8bcc0', 0.3, 0.9)), { y: 0.02 }));
  dagger.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.012), ironM, { y: 0.075 }));
  dagger.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8), keep(std('#2a1a10', 0.7)), { y: 0.12 }));
  dagger.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), brassM, { y: 0.165 }));
  P(letter); mark('letter', letter);
  bench.traverse((o) => { if (o.isMesh && !o.userData.iid) o.userData.iid = 'bench'; });
  mark('bench', brazier); mark('bench', bellows); mark('bench', mortar); mark('bench', hg); mark('bench', alem); mark('bench', flask); mark('bench', book);
  refs.castle.bench = { brazier, coalM, bFlame, cauldron, brewM, brew, bellows, bTop, bag, mortar, pestle, paste, leaves, hg, hgInner, sandTop, sandBot, alem, retortLiquid, flask, schnapps, schnappsM, drip, flaskGlow, letter };

  // ===== 10. 磨刀石（东南角）=====
  const grind = new THREE.Group(); grind.position.copy(GRIND); P(grind);
  const gWood = keep(std('#4a3220', 0.8, 0, { map: T.woodDark }));
  for (const x of [-0.25, 0.25]) grind.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.62), gWood, { x, y: 0.03 }));
  for (const z of [-0.17, 0.17]) {
    grind.add(mesh(new THREE.BoxGeometry(0.06, 0.66, 0.06), gWood, { x: -0.1, y: 0.33, z, rz: -0.25 }));
    grind.add(mesh(new THREE.BoxGeometry(0.06, 0.66, 0.06), gWood, { x: 0.1, y: 0.33, z, rz: 0.25 }));
  }
  // 水槽
  const trough = new THREE.Group(); grind.add(trough);
  trough.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.2), gWood, { y: 0.24 }));
  for (const s of [-1, 1]) { trough.add(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.02), gWood, { y: 0.32, z: s * 0.1 })); trough.add(mesh(new THREE.BoxGeometry(0.02, 0.16, 0.2), gWood, { x: s * 0.25, y: 0.32 })); }
  const waterM = keep(new THREE.MeshStandardMaterial({ color: '#2a3a3a', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
  const water = mesh(new THREE.PlaneGeometry(0.48, 0.18), waterM, { y: 0.36, rx: -Math.PI / 2, cast: false });
  water.visible = false; trough.add(water);
  // 砂轮 + 轴 + 摇把
  const wheel = new THREE.Group(); wheel.position.set(0, 0.64, 0); grind.add(wheel);
  const whetT = TC.genWhetstone();
  const wheelFace = keep(new THREE.MeshStandardMaterial({ map: whetT, roughness: 0.95 }));
  const wheelRim = keep(std('#9a8e74', 0.95));
  wheel.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 36), [wheelRim, wheelFace, wheelFace], { rx: Math.PI / 2 }));
  wheel.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), ironM, { rx: Math.PI / 2 }));
  wheel.add(mesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), ironM, { y: 0.08, z: 0.25 }));
  wheel.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), keep(std('#3a2416', 0.7)), { y: 0.16, z: 0.3, rx: Math.PI / 2 }));
  // 磨剑的时候，剑架在砂轮前上方
  const grindSword = new THREE.Group(); grindSword.visible = false; grind.add(grindSword);
  compact(trough, [water]);
  mark('grindstone', grind);
  block(GRIND.x - 0.3, GRIND.x + 0.3, GRIND.z - 0.24, GRIND.z + 0.24, 'grindstone', 0.9);
  refs.castle.grind = { group: grind, wheel, water, grindSword };

  // ===== 11. {A}的锈剑：靠在他床边 =====
  const makeSword = () => {
    const g = new THREE.Group();
    const L = 0.78, bw = 0.046;
    const bg = new THREE.BoxGeometry(bw, L, 0.008, 1, 10, 1);
    const p = bg.attributes.position, uv = bg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const tip = clamp((L / 2 - y) / (L * 0.12), 0, 1);
      p.setX(i, p.getX(i) * (0.55 + 0.45 * Math.min(1, tip * 1.6)) * (y > L / 2 - L * 0.12 ? tip : 1));
      uv.setXY(i, (y + L / 2) / L, p.getX(i) / bw + 0.5);
    }
    bg.computeVertexNormals();
    const c = TX.makeCanvas(512, 64); TC.drawBlade(c, { rust: 1 });
    const tex = TX.toTex(c, { wrap: false });
    const bladeM = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.55 }));
    g.add(mesh(bg, bladeM, { y: L / 2 + 0.02 }));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.022, 0.026), ironM, { y: 0.01 }));
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.13, 10), keep(std('#3a2416', 0.7)), { y: -0.065 }));
    g.add(mesh(new THREE.SphereGeometry(0.026, 12, 10), ironM, { y: -0.14, s: [1, 0.8, 0.5] }));
    return { g, canvas: c, tex, bladeM };
  };
  const sword = makeSword();
  sword.g.position.set(-0.8, 0.8, -0.72); sword.g.rotation.set(0.0, Math.PI / 2, Math.PI - 0.22);
  P(sword.g); mark('sword', sword.g);
  // 磨剑时架在砂轮上的那一把（同一张剑身贴图）
  const sword2 = makeSword();
  sword2.bladeM.map = sword.tex;
  sword2.g.rotation.set(Math.PI / 2, 0, 0); sword2.g.position.set(-0.22, 0.86, -0.25);
  grindSword.add(sword2.g);
  refs.castle.sword = { group: sword.g, canvas: sword.canvas, tex: sword.tex, mat: sword.bladeM, m2: sword2.bladeM };

  // ===== 12. {B}的箱子：铁皮包角的木箱，上了锁；里面是骰子和几枚格罗申 =====
  const chest = new THREE.Group(); chest.position.set(-0.6, 0, -1.95); P(chest);
  const chestWood = keep(new THREE.MeshStandardMaterial({ map: genPlanks({ seed: 7405, W: 256, H: 256, n: 4, base: '#5a3a22', dark: '#321e10' }), roughness: 0.8 }));
  chest.add(mesh(new THREE.BoxGeometry(0.4, 0.34, 0.64), chestWood, { y: 0.17 }));
  for (const z of [-0.24, 0, 0.24]) chest.add(mesh(new THREE.BoxGeometry(0.41, 0.34, 0.04), ironM, { y: 0.17, z }));
  chest.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.08), ironM, { x: 0.205, y: 0.28 }));
  chest.add(mesh(new THREE.BoxGeometry(0.004, 0.03, 0.014), keep(std('#050505', 1)), { x: 0.216, y: 0.27, cast: false }));
  const lid = new THREE.Group(); lid.position.set(-0.2, 0.34, 0); chest.add(lid);
  lid.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.66), chestWood, { x: 0.2, y: 0.03 }));
  { const g = new THREE.CylinderGeometry(0.21, 0.21, 0.66, 16, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); lid.add(mesh(g, chestWood, { x: 0.2, y: 0.06, s: [1, 0.25, 1] })); }
  for (const z of [-0.24, 0, 0.24]) lid.add(mesh(new THREE.BoxGeometry(0.43, 0.065, 0.04), ironM, { x: 0.2, y: 0.03, z }));
  lid.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.06), ironM, { x: 0.41, y: -0.02 }));
  // 箱子里：皮骰盅、几枚格罗申
  const inside = new THREE.Group(); inside.position.y = 0.3; chest.add(inside);
  inside.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14, 1, true), keep(std('#4a2a16', 0.8, 0, { side: THREE.DoubleSide })), { x: 0.05, y: -0.02, z: 0.1, cast: false }));
  const coinM = keep(std('#c8c0b0', 0.35, 0.9));
  for (let k = 0; k < 7; k++) inside.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 12), coinM, { x: -0.05 + rnd() * 0.12, y: -0.06, z: -0.15 + rnd() * 0.12, cast: false }));
  compact(chest, [lid, inside]); compact(lid);
  mark('chest', chest);
  block(-0.82, -0.38, -2.29, -1.61, 'chest', 0.5);
  refs.castle.chest = { group: chest, lid, inside };

  // ===== 13. 皮靴（东南角，原来鞋架的位置；有一只里面塞着开锁器）=====
  const leatherM = keep(std('#3a2416', 0.65));
  const bootB = new Batch();
  const boot = (x, z, ry, lying = false) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const sh = new THREE.Group(); g.add(sh);
    if (lying) { sh.rotation.x = -Math.PI / 2 + 0.1; sh.position.set(0, 0.05, 0.12); }
    sh.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 12, 1, true), leatherM, { y: 0.23 }));
    sh.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), leatherM, { y: 0.39, rx: Math.PI / 2 }));
    sh.add(mesh(new THREE.BoxGeometry(0.085, 0.07, 0.24), leatherM, { y: 0.035, z: 0.06 }));
    sh.add(mesh(new THREE.BoxGeometry(0.09, 0.015, 0.26), keep(std('#1a120c', 0.8)), { y: 0.007, z: 0.06 }));
    bootB.addObject(g);
  };
  boot(1.6, 3.95, -0.2); boot(1.48, 3.99, 0.1); boot(1.62, 4.2, -0.35); boot(1.46, 4.26, 0.2); boot(1.34, 4.1, 1.2, true);
  bootB.build(props, { cast: true, name: 'boots' }).forEach((m) => mark('boots', m));

  // ===== 14. 骰子盘（第二张书桌）+ 六颗骰子 =====
  const board = new THREE.Group(); board.position.set(BOARD.x, 0.76, BOARD.z); P(board);
  board.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 32), [keep(std('#3a2416', 0.7)), keep(new THREE.MeshStandardMaterial({ map: TC.genDiceBoard(), roughness: 0.7 })), keep(std('#3a2416', 0.7))], { y: 0.01 }));
  board.add(mesh(new THREE.TorusGeometry(0.19, 0.012, 6, 32), keep(std('#2a1a10', 0.7)), { y: 0.022, rx: Math.PI / 2 }));
  mark('diceBoard', board);
  const DIE_STYLES = [
    { name: '骨白', bg: '#e2d6b8', pip: '#2a1a10' },
    { name: '橡木', bg: '#8a5a32', pip: '#1a0e06', grain: true },
    { name: '红漆', bg: '#9a2218', pip: '#f0e0c0' },
    { name: '黑', bg: '#1e1a18', pip: '#e8e0d0' },
    { name: '镀金', bg: '#c89a3a', pip: '#3a2410' },
    { name: '绿漆', bg: '#2a5a3a', pip: '#f0e8d0' },
  ];
  const dice = DIE_STYLES.map((st, i) => {
    const faces = TC.genDieFaces({ bg: st.bg, pip: st.pip, seed: i, grain: st.grain });
    const mats = faces.map((t) => keep(new THREE.MeshStandardMaterial({ map: t, roughness: st.name === '镀金' ? 0.35 : 0.5, metalness: st.name === '镀金' ? 0.6 : 0 })));
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), mats);
    m.castShadow = true; m.receiveShadow = true;
    m.visible = false;
    noRay(m);
    P(m);
    return { mesh: m, style: st, value: 1 };
  });
  refs.castle.dice = dice;
  // 桌上的蜡烛、一只木杯
  smallCandle(1.68, 0.76, -1.16, 0.1);
  const cup = new THREE.Group(); cup.position.set(1.64, 0.76, -0.42);
  cup.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 12, 1, true), keep(std('#6a4a2a', 0.7, 0, { side: THREE.DoubleSide })), { y: 0.045 }));
  cup.add(mesh(new THREE.CircleGeometry(0.03, 12), keep(std('#6a4a2a', 0.7)), { y: 0.002, rx: -Math.PI / 2 }));
  P(cup);

  // ===== 15. 符木（被狗叼走的那根）=====
  const tallyC = TX.makeCanvas(512, 64);
  const tallyTex = TX.toTex(tallyC, { wrap: false });
  const tallyM = keep(new THREE.MeshStandardMaterial({ map: tallyTex, roughness: 0.8 }));
  const tally = mesh(new THREE.BoxGeometry(0.3, 0.024, 0.03), tallyM, {});
  tally.visible = false;
  P(tally); mark('tally', tally);
  refs.castle.tally = { mesh: tally, canvas: tallyC, tex: tallyTex };
  // 门缝底下塞进来的纸条（剧情里才出现）
  const note = mesh(new THREE.PlaneGeometry(0.14, 0.1), keep(new THREE.MeshStandardMaterial({ map: TC.genParchment({ seed: 7803, W: 192, H: 140, lines: 5 }), transparent: true, roughness: 0.9, side: THREE.DoubleSide })), { y: 0.004, rx: -Math.PI / 2, rz: 0.4, cast: false });
  note.visible = false;
  P(note); mark('note', note);
  refs.castle.note = note;

  // ===== 16. 书架：羊皮面的抄本、卷轴、陶罐 =====
  const shelf = new THREE.Group(); shelf.position.set(-1.62, 0, -1.07); shelf.rotation.y = Math.PI / 2; P(shelf);
  const shM = keep(std('#3a2616', 0.8, 0, { map: T.woodDark }));
  const shW = 0.46, shH = 1.7, shD = 0.34;
  for (const s of [-1, 1]) shelf.add(mesh(new THREE.BoxGeometry(0.03, shH, shD), shM, { x: s * (shW / 2 - 0.015), y: shH / 2 }));
  shelf.add(mesh(new THREE.BoxGeometry(shW, shH, 0.015), shM, { y: shH / 2, z: -shD / 2 }));
  const bookMats = ['#4a2a1a', '#2a1a14', '#5a3a22', '#3a2a24', '#6a2a1a', '#2a2a22'].map((c) => keep(std(c, 0.75)));
  const scrollM = keep(std('#c8b088', 0.9)), jarMats = ['#6a4a32', '#4a4a3a', '#8a6a4a'].map((c) => keep(std(c, 0.6)));
  for (let i = 0; i < 5; i++) {
    const y = 0.02 + i * 0.41;
    shelf.add(mesh(new THREE.BoxGeometry(shW - 0.04, 0.025, shD - 0.02), shM, { y }));
    if (i === 4) break;
    let x = -shW / 2 + 0.04;
    while (x < shW / 2 - 0.08) {
      const k = rnd();
      if (k < 0.6) {
        const bw = 0.04 + rnd() * 0.04, bh = 0.22 + rnd() * 0.1;
        shelf.add(mesh(new THREE.BoxGeometry(bw, bh, 0.22 + rnd() * 0.05), bookMats[(rnd() * bookMats.length) | 0], { x: x + bw / 2, y: y + 0.012 + bh / 2, z: 0.02, rz: rnd() < 0.15 ? 0.15 : 0 }));
        x += bw + 0.006;
      } else if (k < 0.8) {
        for (let j = 0; j < 3; j++) shelf.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 10), scrollM, { x: x + 0.03, y: y + 0.035 + j * 0.035, z: 0.02, rx: Math.PI / 2, ry: (rnd() - 0.5) * 0.4 }));
        x += 0.08;
      } else {
        const jr = 0.035 + rnd() * 0.02;
        shelf.add(mesh(new THREE.CylinderGeometry(jr * 0.8, jr, 0.1 + rnd() * 0.06, 12), jarMats[(rnd() * 3) | 0], { x: x + jr, y: y + 0.07, z: 0.03 }));
        x += jr * 2 + 0.02;
      }
    }
  }
  compact(shelf); mark('shelf', shelf);

  // ===== 17. 墙上：旗、大盾、长矛、圣母像；窗边桌上的地图、锅盔和油灯 =====
  // 旗（南墙东半边，高处）
  const banner = new THREE.Group(); banner.position.set(0.9, 2.34, SZ - 0.04); banner.rotation.y = Math.PI; P(banner);
  {
    const g = new THREE.PlaneGeometry(0.46, 0.66, 8, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 14 + p.getY(i) * 3) * 0.012 + (0.33 - p.getY(i)) * 0.02);
    g.computeVertexNormals();
    banner.add(mesh(g, keep(new THREE.MeshStandardMaterial({ map: TC.genBanner(), transparent: true, alphaTest: 0.4, roughness: 0.95, side: THREE.DoubleSide })), { cast: false }));
    banner.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.56, 8), keep(std('#3a2616', 0.7)), { y: 0.34, rz: Math.PI / 2 }));
    for (const s of [-1, 1]) banner.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), brassM, { x: s * 0.28, y: 0.34 }));
  }
  mark('banner', banner);
  // 大盾（南墙根，靠着）
  const pavise = new THREE.Group(); pavise.position.set(0.74, 0, SZ - 0.1); pavise.rotation.set(-0.12, Math.PI, 0); P(pavise);
  pavise.add(mesh(new THREE.BoxGeometry(0.52, 1.0, 0.04), [keep(std('#3a2a1a', 0.8)), keep(std('#3a2a1a', 0.8)), keep(std('#3a2a1a', 0.8)), keep(std('#3a2a1a', 0.8)), keep(new THREE.MeshStandardMaterial({ map: TC.genShieldFace(), roughness: 0.75 })), keep(std('#3a2a1a', 0.8))], { y: 0.52 }));
  pavise.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.05), keep(std('#6a1a12', 0.7)), { y: 0.52, z: 0.015 }));
  mark('shield', pavise);
  block(0.45, 1.02, SZ - 0.22, SZ, 'pavise', 1.0);
  // 长矛：东墙上两根，横着架在木钉上
  const spearB = new Batch();
  for (const [y, z0, z1] of [[1.9, -1.35, 0.55], [2.06, -1.1, 0.8]]) {
    spearB.add(cylBetween(V(1.765, y, z0), V(1.765, y, z1), 0.013, 0.013, 8), keep(std('#4a3220', 0.8)), I4.identity());
    spearB.add(new THREE.ConeGeometry(0.022, 0.2, 6).rotateX(Math.PI / 2), keep(std('#8a8e92', 0.35, 0.85)), I4.makeTranslation(1.765, y, z1 + 0.1));
    for (const z of [z0 + 0.3, z1 - 0.35]) spearB.add(new THREE.BoxGeometry(0.06, 0.02, 0.02), gWood, I4.makeTranslation(1.775, y - 0.02, z));
  }
  spearB.build(props, { cast: true, name: 'spears' }).forEach((m) => mark('spears', m));
  // 圣母像 + 十字架 + 两根蜡烛（南墙东头）
  const shrine = new THREE.Group(); shrine.position.set(1.42, 0, SZ - 0.02); shrine.rotation.y = Math.PI; P(shrine);
  shrine.add(mesh(new THREE.BoxGeometry(0.42, 0.03, 0.12), gWood, { y: 1.16, z: 0.06 }));
  shrine.add(mesh(new THREE.PlaneGeometry(0.2, 0.28), keep(new THREE.MeshStandardMaterial({ map: TC.genIcon(), roughness: 0.6, metalness: 0.2 })), { y: 1.36, z: 0.012, cast: false }));
  shrine.add(mesh(new THREE.BoxGeometry(0.024, 0.2, 0.02), gWood, { y: 1.66, z: 0.012 }));
  shrine.add(mesh(new THREE.BoxGeometry(0.12, 0.024, 0.02), gWood, { y: 1.7, z: 0.012 }));
  for (const x of [-0.14, 0.14]) smallCandle(x, 1.175, 0.07, 0.09, shrine);
  mark('shrine', shrine);
  // 窗边书桌：一张手绘地图 + 一顶锅盔 + 一盏角灯
  const od = refs.farDesks.od;
  for (const c of od.children) if (c.position.y >= 0.759) c.visible = false;
  P(mark('map', mesh(new THREE.PlaneGeometry(0.5, 0.36), keep(new THREE.MeshStandardMaterial({ map: TC.genMap(), roughness: 0.9 })), { x: -0.45, y: 0.745, z: -3.14, rx: -Math.PI / 2, rz: 0.08, cast: false })));
  const kettle = new THREE.Group(); kettle.position.set(0.5, 0.74, -3.18); kettle.rotation.set(0.1, 0.4, 0.05);
  kettle.add(mesh(new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), keep(std('#6a6a66', 0.45, 0.7)), { y: 0.03 }));
  kettle.add(mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.02, 24), keep(std('#6a6a66', 0.45, 0.7)), { y: 0.03 }));
  P(kettle); mark('kettleHat', kettle);
  // 窗边：{A}{B}的木桌（原来黑桌子那一张）
  const wt = new THREE.Group(); wt.position.set(0.43, 0, -3.17); P(wt);
  wt.add(mesh(new THREE.BoxGeometry(0.82, 0.04, 0.5), tableM, { y: 0.72 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) wt.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), tableM, { x: sx * 0.36, y: 0.35, z: sz * 0.2 }));
  compact(wt); mark('farDesks', wt);
  const lantern = new THREE.Group(); lantern.position.set(-0.76, 0.745, -3.3);
  lantern.add(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), ironM));
  lantern.add(mesh(new THREE.ConeGeometry(0.07, 0.06, 4), ironM, { y: 0.19, ry: Math.PI / 4 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lantern.add(mesh(new THREE.BoxGeometry(0.008, 0.16, 0.008), ironM, { x: sx * 0.045, y: 0.08, z: sz * 0.045, cast: false }));
  lantern.add(mesh(new THREE.BoxGeometry(0.085, 0.14, 0.085), keep(new THREE.MeshStandardMaterial({ color: '#d8b070', transparent: true, opacity: 0.4, roughness: 0.5, emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 0.5, depthWrite: false })), { y: 0.08, cast: false }));
  P(lantern); mark('farDesks', lantern);
  const lanternF = smallCandle(-0.76, 0.75, -3.3, 0.05);
  void lanternF;
  const lanternGlow = glowSprite([255, 170, 80], 0.5, 0.5); lanternGlow.position.set(-0.76, 0.85, -3.3); P(lanternGlow);

  // ===== 18. 床：铁架床刷成木头色，蚊帐拆了，铺稻草席、羊毛毯、羊皮 =====
  Object.assign(M.frame, { map: T.woodDark, color: new THREE.Color('#8a6a4a'), roughness: 0.8, metalness: 0 });
  M.frame.needsUpdate = true;
  for (const bed of Object.values(refs.beds)) {
    bed.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === M.net || o.position.y > 1.9) { o.visible = false; return; }
      const m = o.material;
      if (m && m.color && !m.map) {
        const hx = m.color.getHexString();
        if (hx === 'e8e4da') { m.color.set('#9a8460'); m.map = T.bamboo; m.needsUpdate = true; } // 床垫 → 塞稻草的粗布垫子
        else if (['f0e6d2', 'c7d8ec', 'f3c9d4'].includes(hx)) m.color.set(['#b0a080', '#a09070', '#a89878'][(rnd() * 3) | 0]); // 枕头 → 亚麻
        else if (hx === '9aa2ad') m.color.set('#6a5a44');
      }
    });
  }
  const peltT = TF.genPelt({ seed: 7720, base: '#8a7a64' }), peltT2 = TF.genPelt({ seed: 7721, base: '#a09480' });
  for (const [x, z, ry, t, y] of [[-1.3, 0.4, 0.05, peltT, 0.47], [1.3, -2.2, -0.06, peltT2, 0.47], [1.3, 1.5, 0.03, peltT, 1.53]]) {
    const g = new THREE.PlaneGeometry(0.9, 1.2, 8, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i); p.setZ(i, -Math.max(0, Math.abs(X) - 0.38) * 1.4 + Math.sin(X * 9 + Y * 5) * 0.01); }
    g.computeVertexNormals();
    P(mesh(g, keep(new THREE.MeshStandardMaterial({ map: t, roughness: 1 })), { x, y: y + 0.05, z, rx: -Math.PI / 2, rz: ry, cast: false }));
  }

  // ===== 19. 穿衣镜 → 一面磨亮的铜镜（木框）；洗手间的玻璃门 → 木框 + 油浸羊皮纸 =====
  for (const c of refs.mirrorG.children) if (c.isMesh && c !== refs.mirror && c.material.color) c.material = keep(std('#3a2616', 0.8, 0, { map: T.woodDark }));
  if (refs.mirror.material && refs.mirror.material.uniforms && refs.mirror.material.uniforms.color) refs.mirror.material.uniforms.color.value.set('#b89068');
  refs.wcDoor.group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const hx = o.material.color && o.material.color.getHexString();
    if (hx === 'f1efe9') o.material = keep(std('#4a3220', 0.8, 0, { map: T.woodDark }));
    else if (o.material.metalness >= 0.9) o.material = ironM;
  });
  const [dg, fg] = refs.wcDoor.glass;
  dg.color.set('#c8a068'); dg.opacity = 0.3;
  fg.color.set('#b8905a'); fg.opacity = 0.78; fg.emissive.set('#5a3a1a'); fg.emissiveIntensity = 0.25;

  // ===== 20. 灯 =====
  const L = refs.lights;
  L.hemi.color.set('#5a5a66'); L.hemi.groundColor.set('#2a1e14');
  // "太阳" = 月光：从北边窗户斜着照进来（窗栅栏的影子落在书桌和地上）；窗板关着的时候几乎没有
  L.sun.color.set('#9ab0d8'); L.sun.position.copy(MOON_DIR).multiplyScalar(22); L.sun.target.position.set(0, 0, -2.2); L.sun.intensity = 0;
  L.sun.shadow.camera.left = -3; L.sun.shadow.camera.right = 3; L.sun.shadow.camera.top = 3; L.sun.shadow.camera.bottom = -3; L.sun.shadow.camera.updateProjectionMatrix();
  L.winLight.color.set('#7a8cb8'); L.winLight.width = 0.84; L.winLight.height = 1.3; L.winLight.position.set(0, 1.78, -3.44); L.winLight.intensity = 0;
  L.monLight.color.set('#ffa04a'); L.monLight.distance = 2.8; L.monLight.decay = 1.6; L.monLight.position.set(1.45, 1.05, 0.2); L.monLight.intensity = 0.8;
  L.wc.color.set('#ffae66');
  for (const [i, s] of L.ceilSpots.entries()) { s.color.set('#ffb468'); s.position.set(0, 2.25, i === 0 ? 2.3 : -1.6); s.target.position.set(0, 0, i === 0 ? 2.3 : -1.6); s.angle = 1.25; s.penumbra = 1; s.decay = 1.5; s.distance = 9; }
  L.tubeMats.length = 0;
  refs.castleLights = { hearthSpot, torchLight, fireF, fireGlow, emberM, torchW, torchE, lanternGlow };

  // ===== 21. 洗手间 → 澡堂：大木浴桶、木桶、木板茅厕、挂着的油灯 =====
  const wm = refs.wcMats;
  const stoneT = T.wall.clone(); stoneT.repeat.set(0.5, 1 / 3); stoneT.needsUpdate = true;
  const stoneN = T.wallN.clone(); stoneN.repeat.set(0.5, 1 / 3); stoneN.needsUpdate = true;
  Object.assign(wm.wTile, { map: stoneT, normalMap: stoneN, emissiveMap: null, color: new THREE.Color('#ffffff'), emissive: new THREE.Color('#2a2016'), emissiveIntensity: 0.25, roughness: 0.95 }); wm.wTile.needsUpdate = true;
  Object.assign(wm.wPaint, { color: new THREE.Color('#7a7264'), emissive: new THREE.Color('#1e1812'), emissiveIntensity: 0.3, roughness: 0.95 }); wm.wPaint.needsUpdate = true;
  const flT = T.floor.map.clone(); flT.repeat.set(0.5, 0.5); flT.needsUpdate = true;
  Object.assign(wm.wFloor, { map: flT, emissiveMap: null, color: new THREE.Color('#d8d0c0'), emissive: new THREE.Color('#161210'), emissiveIntensity: 0.25, roughness: 0.9 }); wm.wFloor.needsUpdate = true;
  const ceilT = genPlanks({ seed: 7406, n: 4, base: '#3a2616', dark: '#1a0e06' }); ceilT.repeat.set(1, 0.5);
  Object.assign(wm.wCeil, { map: ceilT, emissiveMap: null, color: new THREE.Color('#ffffff'), emissive: new THREE.Color('#140c06'), emissiveIntensity: 0.25, metalness: 0, roughness: 0.9 }); wm.wCeil.needsUpdate = true;
  for (const k of ['wTile', 'wPaint', 'wFloor', 'wCeil']) keep(wm[k]);
  const WS = refs.wcSections;
  hideAll(WS.sink);
  for (const o of WS.toilet) if (o.userData.iid !== 'graffiti') o.visible = false;
  for (const o of WS.wcMisc) { if (o.userData.iid === 'towels' || o.position.y > 2.2) continue; o.visible = false; } // 毛巾和晾毛巾的绳子留着
  const wcBlockIds = collision.boxes.filter((b) => (b.minX > 0.5 && b.minZ > WR.z1 - 0.6) || (Math.abs(b.minX - 1.42) < 1e-3 && Math.abs(b.minZ - 4.98) < 1e-3));
  collision.boxes = collision.boxes.filter((b) => !wcBlockIds.includes(b));
  // 吸顶灯拆掉
  for (const o of refs.wcRoom.children) if (o.isMesh && o.position.y > WR.h - 0.1 && (o.geometry.type === 'CylinderGeometry' || o.geometry.type === 'CircleGeometry')) o.visible = false;
  // 隔间：刷成木板
  const plankWM = keep(new THREE.MeshStandardMaterial({ map: genPlanks({ seed: 7407, n: 4, base: '#4a3220', dark: '#2a1a0e' }), roughness: 0.85, emissive: new THREE.Color('#140c06'), emissiveIntensity: 0.3 }));
  for (const o of WS.cubicle) o.traverse((c) => {
    if (!c.isMesh || !c.material || !c.material.color) return;
    if (c.material === M.chrome || c.material.metalness >= 0.9) c.material = ironM;
    else if (c.material.color.getHexString() === '3fae5a') c.visible = false; // "无人"的绿牌子
    else c.material = plankWM;
  });
  // 毛巾 → 亚麻布
  for (const o of WS.wcMisc) if (o.userData.iid === 'towels') o.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.color.set(['#b8a888', '#a89878', '#c0b090', '#9a8a6a'][(rnd() * 4) | 0]); c.material.emissiveIntensity = 0.03; } });
  // 大木浴桶
  const tubG = new THREE.Group(); tubG.position.set(0.95, 0, 5.72); refs.wcRoom.add(tubG);
  const staveT = genPlanks({ seed: 7408, W: 512, H: 128, n: 22, base: '#6a4a2c', dark: '#3a2616' });
  staveT.repeat.set(1, 1);
  const tubM = keep(new THREE.MeshStandardMaterial({ map: staveT, roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color('#1a1008'), emissiveIntensity: 0.3 }));
  tubG.add(mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.62, 32, 1, true), tubM, { y: 0.31, s: [1, 1, 0.8] }));
  tubG.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 32), tubM, { y: 0.01, s: [1, 1, 0.8] }));
  for (const y of [0.1, 0.5]) tubG.add(mesh(new THREE.TorusGeometry(0.47 + (y - 0.1) * 0.08, 0.01, 5, 36), ironM, { y, rx: Math.PI / 2, s: [1, 0.8, 1] }));
  const tubWaterM = keep(new THREE.MeshStandardMaterial({ color: '#3a4a44', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.85, emissive: new THREE.Color('#0a0c0a') }));
  const tubWater = mesh(new THREE.CircleGeometry(0.48, 32), tubWaterM, { y: 0.52, rx: -Math.PI / 2, s: [1, 0.8, 1], cast: false });
  tubG.add(tubWater);
  // 桶边搭着一块亚麻布、一把木瓢
  {
    // 布：一张细分的平面，按"弧长"搭过桶沿——里面一截垂进桶里，外面一截垂下来，带几道褶
    const g = new THREE.PlaneGeometry(0.34, 0.2, 16, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) - 0.03, z = p.getY(i) + 0.02;
      const rx = -0.5 * Math.sqrt(1 - (z / 0.4) ** 2), R = 0.022;
      let x, y;
      if (s < -R) { x = rx + R; y = 0.625 - (-s - R); }
      else if (s > R) { x = rx - R; y = 0.625 - (s - R); }
      else { const a = (s + R) / (2 * R) * Math.PI; x = rx + R * Math.cos(a); y = 0.625 + R * Math.sin(a) * 0.6; }
      const wr = Math.sin(z * 60 + s * 8) * 0.004 * Math.min(1, Math.abs(s) * 12);
      p.setXYZ(i, x + (s > 0 ? -wr : wr), y, z + Math.sin(s * 30) * 0.004);
    }
    g.computeVertexNormals();
    tubG.add(mesh(g, keep(std('#b8a888', 0.95, 0, { side: THREE.DoubleSide })), { cast: false }));
  }
  tubG.add(mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), keep(std('#6a4a2c', 0.8, 0, { side: THREE.DoubleSide })), { x: 0.2, y: 0.54, z: -0.1 }));
  mark('tub', tubG);
  block(0.42, 1.48, 5.3, 6.16, 'tub', 0.62);
  // 木桶（打水用）
  const bucket = new THREE.Group(); bucket.position.set(1.6, 0, 4.98); refs.wcRoom.add(bucket);
  bucket.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.26, 16, 1, true), tubM, { y: 0.13 }));
  bucket.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 16), tubM, { y: 0.005 }));
  for (const y of [0.05, 0.2]) bucket.add(mesh(new THREE.TorusGeometry(0.12, 0.006, 4, 18), ironM, { y, rx: Math.PI / 2 }));
  bucket.add(mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 18, Math.PI), ironM, { y: 0.26 }));
  mark('bucket', bucket);
  refs.castle.bucket = bucket;
  // 木板茅厕（隔间里）
  const gard = new THREE.Group(); gard.position.set(-1.28, 0, 5.92); refs.wcRoom.add(gard);
  gard.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), plankWM, { y: 0.225 }));
  gard.add(mesh(new THREE.CircleGeometry(0.1, 16), keep(std('#050404', 1)), { y: 0.452, rx: -Math.PI / 2, cast: false }));
  mark('toilet', gard);
  block(-1.8, -0.88, 5.66, 6.3, 'garderobe', 0.45);
  // 吊着的油灯
  const oil = new THREE.Group(); oil.position.set(0.15, 2.2, 5.5); refs.wcRoom.add(oil);
  oil.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), ironM, { y: 0.25, cast: false }));
  oil.add(mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 12), keep(std('#6a5a3a', 0.4, 0.8)), { cast: false }));
  const oilF = makeFlame(0.5, 2); oilF.group.position.set(0, 0.03, 0); oil.add(oilF.group);
  flames.push([oilF, () => 1]);
  const oilGlow = glowSprite([255, 170, 80], 0.5, 0.6); oilGlow.position.set(0, 0.08, 0); oil.add(oilGlow);
  L.wc.position.set(0.15, 2.1, 5.5); L.wc.target.position.set(0.3, 0, 5.4);
  // 浴桶冒的热气
  refs.castle.tub = { group: tubG, water: tubWater, at: V(0.95, 0.6, 5.72) };
  // 洗手间的窗：拆掉黄铁框和玻璃，只留铁条（窗外是院子）
  refs.wcWin.traverse((o) => { if (o.isMesh && o.material && o.material.visible !== false && o.material.color) { const hx = o.material.color.getHexString(); if (hx !== '3a3935') o.visible = false; else o.material = ironM; } });

  add(props);

  // ===== 22. 全场做旧（自己建的写实材质、窗外不动）=====
  const skip = new Set();
  for (const g of [refs.outside.group, vista.group, mutt.root]) g.traverse((o) => skip.add(o));
  const seen = new Set(clean);
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      ageMaterial(m);
    }
  });

  // ===== 23. 每帧：火苗、窗外 =====
  refs.castle.flames = flames;
  refs.updaters.push((dt, t, g) => {
    for (const [f, k] of flames) f.update(dt, t, k());
    vista.update(dt, t, g && g.camera, refs.castle.sky || {});
  });
}
