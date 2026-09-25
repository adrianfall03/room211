// 第三章：雨林 211 —— 同一间宿舍，被塞进了热带雨林里一棵大树的树洞底下。晚上 22:30，外面在下大暴雨。
//   写实电影感（和第二章的废墟、第四章的空间站一个路子）：
//   · 墙是活树的木质内壁（竖向木纤维、树瘤、渗水的暗痕、墙根的苔藓），天花板是压实的泥土和细根，
//     几条粗大的树根横着穿过天花板、顺着墙往下扎进地板，根上挂着须根、长着层孔菌，常春藤顺着根往上爬；
//   · 窗外是暴雨里的雨林：远景的树冠剪影、近处的芭蕉叶和龟背竹、三层雨幕、玻璃上的水珠和往下淌的水痕，
//     隔一会儿一道闪电——整片林子一层层亮出来，冷白的光从窗口斜着打进屋里（带阴影和光柱），几秒后滚过一声雷；
//   · 屋里很暗：只有暖色的钨丝灯串、窗边书桌上的一盏煤油马灯、穿衣镜那圈化妆灯泡、两台电脑屏幕的冷光、马手里的手机；
//   · 所有材质受潮：去一点饱和、压暗、世界坐标噪声的霉斑（越靠近地面越重）；天花板的根上往下滴水，地上一小滩积水；
//   · 室友们还是鸡（打游戏）、马（躺床上刷手机）、猴（对着镜子摆造型），但是写实的毛发和羽毛（见 animals.js）
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TJ from '../core/tex_jungle.js';
import { mulberry32, clamp, lerp } from '../core/util.js';
import { LightShafts } from './fx.js';
import { Chicken, Chick, Horse, Monkey } from './animals.js';
import { Batch } from './spacelook.js';

export function buildJungleTextures(B) {
  const T = {};
  T.floor = TJ.genWetFloor(); T.floorDirt = TJ.genFloorLitter();
  const w = TJ.genTreeWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  T.ceiling = TJ.genRootCeiling();
  let s = 1;
  const dmp = (t, o = {}) => TJ.damp(t, { seed: s++, ...o });
  T.woodDark = dmp(B.woodDark, { dark: 0.7 });
  T.woodLight = dmp(B.woodLight, { dark: 0.72 });
  T.woodOrange = dmp(B.woodOrange, { dark: 0.7 });
  T.doorWood = dmp(B.doorWood, { dark: 0.7, mold: 16 });
  T.blackLaminate = dmp(B.blackLaminate, { dark: 0.9 });
  T.curtain = dmp(B.curtain, { dark: 0.72, mold: 14 });
  T.net = dmp(B.net, { dark: 0.8, mold: 2 });
  for (const k of ['grayCloth', 'pinkCloth', 'blackCloth', 'blueCloth', 'whiteCloth', 'bamboo', 'floral', 'polka', 'yellowDots', 'patternRoll']) T[k] = dmp(B[k], { dark: 0.74, mold: 8 });
  T.cardboard = dmp(B.cardboard, { dark: 0.72, mold: 12 }); T.cardboard350 = dmp(B.cardboard350, { dark: 0.72, mold: 12 });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  T.windowView = TJ.genJungleSky();
  T.clockFace = TJ.genClockFaceDamp(B.clockFace);
  T.mousepad = dmp(B.mousepad, { dark: 0.8, wrap: false });
  return T;
}

// ---------- 受潮：去饱和、压暗、世界坐标噪声的霉斑（越靠近地面越重）----------
const MOLD_FUNCS = /* glsl */ `
varying vec3 vJW;
float jh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float jn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(jh(i), jh(i + vec3(1, 0, 0)), f.x), mix(jh(i + vec3(0, 1, 0)), jh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(jh(i + vec3(0, 0, 1)), jh(i + vec3(1, 0, 1)), f.x), mix(jh(i + vec3(0, 1, 1)), jh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const MOLD_APPLY = /* glsl */ `
#include <map_fragment>
{
  float n1 = jn(vJW * 2.1), n2 = jn(vJW * 6.3 + 4.0), n3 = jn(vJW * 27.0);
  float g = smoothstep(0.45, 0.95, n1 * 0.6 + n2 * 0.4);
  float low = 1.0 - smoothstep(0.0, 0.9, vJW.y);
  float m = clamp(g * 0.4 + low * 0.18 + (n3 - 0.5) * 0.12, 0.0, 0.55);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.55, 0.4), m);
}`;
function moldify(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvJW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${MOLD_FUNCS}`)
      .replace('#include <map_fragment>', MOLD_APPLY);
  };
  m.customProgramCacheKey = () => 'jungleMold';
  m.needsUpdate = true;
}
const _hsl = {};
const OLIVE = new THREE.Color('#4a4a36'), MUD = new THREE.Color('#6a6250');
function dampMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.jungle) return;
  m.userData.jungle = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    // 刷白漆的铁床架、白塑料这些"太亮"的东西受了潮都发黄发灰
    m.color.setHSL(_hsl.h, _hsl.s * 0.6, Math.min(0.46, _hsl.l * 0.72 + 0.01));
    if (_hsl.l > 0.55) m.color.lerp(MUD, 0.22);
  } else m.color.multiplyScalar(0.9);
  if (m.metalness > 0.45) { m.roughness = Math.max(m.roughness, 0.55); m.color.lerp(OLIVE, 0.18); }
  else if (!m.transparent) m.roughness = Math.max(m.roughness, 0.4);
  m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.6;
  if (m.emissive && m.emissiveIntensity > 0 && !m.emissiveMap) m.emissiveIntensity *= 0.5;
  if (!m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) moldify(m);
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
const noRay = (o) => { o.traverse((c) => { c.userData.noRay = true; if (c.isMesh) c.raycast = () => {}; }); return o; };
const _v = V();

// 一条会变细的树根：沿曲线的管子，半径从 r0 渐变到 r1，截面有点不规则；u 沿着根按米平铺
function rootGeo(pts, r0, r1, { radial = 10, wobble = 1, seed = 1, per = 0.6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V(...p))));
  const len = curve.getLength();
  const tseg = Math.max(6, Math.round(len * 16));
  const g = new THREE.TubeGeometry(curve, tseg, 1, radial, false);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const rr = mulberry32(seed * 7 + 1);
  const bumps = Array.from({ length: 4 }, () => [rr() * 6.28, 1 + rr() * 3, 0.5 + rr()]);
  const c = V();
  for (let i = 0; i <= tseg; i++) {
    const t = i / tseg;
    curve.getPointAt(t, c);
    const r = lerp(r0, r1, Math.pow(t, 0.85)) * (1 + Math.sin(t * 19 + seed) * 0.05 * wobble);
    const around = Math.max(1, Math.round((2 * Math.PI * r) / 0.25));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j, ang = (j / radial) * Math.PI * 2;
      let b = 1; for (const [ph, f, a] of bumps) b += Math.sin(ang * 2 + ph + t * f * 5) * 0.08 * a * wobble;
      _v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r * b).add(c);
      pos.setXYZ(k, _v.x, _v.y, _v.z);
      uv.setXY(k, (t * len) / per, (j / radial) * around);
    }
  }
  g.computeVertexNormals();
  return { geo: g, curve };
}

// 雨幕：一张雨丝贴图往下滚（加法混合，闪电时跟着亮）
const RAIN_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const RAIN_FRAG = /* glsl */ `
  uniform sampler2D map; uniform float time, speed, flash, alpha, slant; uniform vec2 rep;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv * rep + vec2(time * slant, time * speed);
    float a = texture2D(map, uv).a;
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.1, vUv.y);
    vec3 c = vec3(0.6, 0.68, 0.76) * (0.3 + flash * 3.0);
    gl_FragColor = vec4(c * a * alpha * edge, a * alpha * edge);
  }`;
// 窗玻璃：外面挂着的水珠 + 几道往下淌的水痕（按高度图算一点高光），闪电时水珠一下子全亮起来
const GLASS_FRAG = /* glsl */ `
  uniform sampler2D drops; uniform float time, flash, glow; uniform vec2 rep;
  varying vec2 vUv;
  // 两层水珠：挂着不动的 + 一列一列往下滑的
  float D(vec2 uv) {
    float h = texture2D(drops, uv).r;
    float col = floor(uv.x * 7.0);
    float slide = fract(sin(col * 12.9898) * 43758.5453);
    float h2 = texture2D(drops, vec2(uv.x * 1.3 + 0.37, uv.y * 1.3 + time * (0.05 + slide * 0.12))).r * step(0.55, slide);
    return max(h, h2);
  }
  void main() {
    vec2 uv = vUv * rep;
    float d = D(uv);
    // 用高度图的梯度当法线：水珠像一颗颗小透镜，暗的身子 + 朝上那一侧的边上一点点亮（反着屋里的暖光 / 闪电）
    vec2 e = vec2(1.5 / 512.0, 0.0);
    vec2 gr = vec2(D(uv + e.xy) - D(uv - e.xy), D(uv + e.yx) - D(uv - e.yx));
    float rim = clamp(length(gr) * 1.5, 0.0, 1.0);
    float hl = pow(clamp(dot(gr, vec2(-0.55, 0.83)) * 1.4, 0.0, 1.0), 3.0);
    float body = smoothstep(0.1, 0.55, d);
    vec3 c = vec3(0.015, 0.018, 0.02) + vec3(1.0, 0.8, 0.56) * hl * glow * 1.4 + vec3(0.72, 0.8, 1.0) * (rim * 0.35 + hl) * flash * 2.4;
    gl_FragColor = vec4(c, body * 0.3 + hl * 0.35 + rim * 0.05 + 0.025);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function decorateJungle(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, LAYOUT } = ctx;
  const { SZ, WR, WW } = LAYOUT;
  const rnd = mulberry32(3030);
  const props = new THREE.Group(); props.name = 'jungleProps';
  const P = (o) => { props.add(o); return o; };
  const clean = new Set(); // 自己建好的写实材质：不再过一遍"受潮"
  const keep = (m) => { m.userData.jungle = true; clean.add(m); return m; };

  // ===== 0. 收拾：地上的复习资料收掉，雾气层、涂鸦不要；窗帘半拉着 =====
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh) o.visible = false; });
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.sticky.visible = false;
  refs.studentId.visible = false;
  refs.curtain.layout(0.32); refs.curtain.f = 0.32;
  M.curtain.emissiveIntensity = 0.0;
  refs.gap.line.color.set('#ffc890');

  // ===== 1. 墙 / 天花板 / 地板 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0.4 });
  M.wall.needsUpdate = true;
  Object.assign(M.ceiling, { roughness: 1, envMapIntensity: 0.2 }); M.ceiling.color.setScalar(1.8);
  M.floor.normalScale.set(0.9, 0.9); M.floor.envMapIntensity = 0.9;
  // 门外的走廊也是树洞里的通道：天花板压暗
  for (const o of refs.corridor.children) if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.position.y > 2.5) o.material = std('#2e261e', 0.95);

  // ===== 2. 树根：横穿天花板的几条粗根 + 顺着墙扎进地板的根 + 须根 + 层孔菌 + 常春藤 =====
  const bark = TJ.genBark();
  const barkM = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), map: bark.map, normalMap: bark.normalMap, roughnessMap: bark.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.5, 1.5), envMapIntensity: 0.3 }));
  const rootsB = new Batch();
  const I4 = new THREE.Matrix4();
  const curves = [];
  const R = (pts, r0, r1, o = {}) => { const { geo, curve } = rootGeo(pts, r0, r1, o); rootsB.add(geo, barkM, I4); geo.dispose(); curves.push({ curve, r0, r1 }); return curve; };
  // 天花板上横着的（两头扎进东西两面墙里）
  R([[-1.95, 2.98, -2.9], [-1.2, 2.9, -3.0], [-0.3, 2.85, -2.86], [0.5, 2.89, -3.05], [1.3, 2.93, -2.95], [1.95, 2.99, -2.9]], 0.13, 0.08, { seed: 1 });
  R([[1.95, 2.97, -0.2], [1.1, 2.9, -0.36], [0.2, 2.84, -0.22], [-0.7, 2.9, -0.45], [-1.95, 2.97, -0.3]], 0.15, 0.09, { seed: 2 });
  R([[-1.95, 2.98, 1.0], [-0.9, 2.91, 0.85], [0.1, 2.87, 1.05], [1.0, 2.92, 0.9], [1.95, 2.99, 1.0]], 0.11, 0.07, { seed: 3 });
  R([[1.95, 2.97, 3.3], [0.9, 2.9, 3.45], [-0.2, 2.87, 3.3], [-1.2, 2.93, 3.42], [-1.95, 2.98, 3.3]], 0.13, 0.08, { seed: 4 });
  // 顺着房间长边的两条（避开两盏灯管）
  for (const s of [-1, 1]) R([[s * 0.76, 3.0, -3.75], [s * 0.82, 2.93, -2.4], [s * 0.88, 2.92, -1.6], [s * 0.74, 2.91, -0.4], [s * 0.8, 2.92, 0.9], [s * 0.88, 2.94, 2.3], [s * 0.78, 2.96, 3.6], [s * 0.74, 3.0, 4.65]], 0.1, 0.06, { seed: 5 + s });
  // 顺着墙往下扎的：东墙（床和衣架之间）、南墙（垃圾桶上方）、西墙（杂物桌上方）
  R([[1.83, 3.02, 3.2], [1.73, 2.6, 3.28], [1.75, 2.0, 3.18], [1.72, 1.3, 3.3], [1.74, 0.6, 3.22], [1.66, 0.12, 3.3], [1.45, 0.0, 3.36]], 0.17, 0.07, { seed: 8 });
  R([[1.74, 1.4, 3.26], [1.7, 1.1, 3.05], [1.72, 0.7, 2.95], [1.7, 0.3, 2.9]], 0.06, 0.02, { seed: 9 });
  R([[0.66, 3.02, 4.55], [0.6, 2.6, 4.44], [0.66, 1.9, 4.45], [0.58, 1.2, 4.44], [0.64, 0.62, 4.45], [0.62, 0.3, 4.6]], 0.14, 0.06, { seed: 10 });
  // 南墙：一条根沿着洗手间门的上沿拱过去
  R([[-0.72, 3.02, 4.5], [-0.55, 2.8, 4.44], [-0.2, 2.73, 4.43], [0.2, 2.74, 4.43], [0.5, 2.82, 4.44], [0.62, 2.95, 4.5]], 0.07, 0.07, { seed: 11 });
  R([[-1.83, 3.02, 2.15], [-1.73, 2.5, 2.2], [-1.75, 1.8, 2.12], [-1.72, 1.2, 2.22], [-1.75, 0.8, 2.1]], 0.15, 0.06, { seed: 12 });
  R([[-1.74, 1.9, 2.15], [-1.72, 1.6, 2.45], [-1.74, 1.1, 2.6]], 0.05, 0.015, { seed: 13 });
  // 窗框：窗洞四周一圈树皮的"唇"（窗户像是开在树干上的一个洞）
  {
    const pts = [];
    const cx = 0, cy = 1.75, hw = 1.4, hh = 0.86;
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const e = 1 / Math.pow(Math.pow(Math.abs(c), 5) + Math.pow(Math.abs(s), 5), 1 / 5); // 圆角矩形
      pts.push(V(cx + c * e * hw + Math.sin(a * 7) * 0.02, cy + s * e * hh + Math.sin(a * 5 + 1) * 0.02, -3.57));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const g = new THREE.TubeGeometry(curve, 160, 1, 8, true);
    const pos = g.attributes.position, uv = g.attributes.uv, c = V();
    for (let i = 0; i <= 160; i++) {
      curve.getPointAt(i / 160, c);
      const r = 0.05 + 0.025 * Math.sin(i * 0.37) + 0.015 * Math.sin(i * 1.3);
      for (let j = 0; j <= 8; j++) { const k = i * 9 + j; _v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); _v.z = Math.max(_v.z, -3.6); pos.setXYZ(k, _v.x, _v.y, _v.z); uv.setXY(k, (i / 160) * 14, j / 8); }
    }
    g.computeVertexNormals();
    rootsB.add(g, barkM, I4); g.dispose();
  }
  rootsB.build(props, { cast: true, name: 'roots' });
  // 须根：从天花板的根上垂下来的细根
  const hairB = new Batch();
  const hairM = keep(std('#4a3a2a', 0.92));
  for (const { curve, r0 } of curves.slice(0, 6)) {
    for (let k = 0; k < 9; k++) {
      const p = curve.getPointAt(0.08 + rnd() * 0.84);
      if (p.y < 2.6) continue;
      const L = 0.12 + rnd() * (Math.abs(p.x) < 0.7 ? 0.35 : 0.2);
      const pts = [p.clone().add(V(0, -r0 * 0.5, 0))];
      for (let q = 1; q <= 4; q++) pts.push(pts[q - 1].clone().add(V((rnd() - 0.5) * 0.04, -L / 4, (rnd() - 0.5) * 0.04)));
      const { geo } = rootGeo(pts, 0.008 + rnd() * 0.006, 0.0015, { radial: 5, wobble: 0.3, seed: k + 20, per: 0.3 });
      hairB.add(geo, hairM, I4); geo.dispose();
    }
  }
  hairB.build(props, { cast: false, name: 'rootHairs' }).forEach(noRay);
  // 层孔菌：一片片半圆的小架子，长在往下扎的那几条根上
  const fungusM = keep(std('#a8967a', 0.85));
  const fungusB = new Batch();
  const shelf = new THREE.CylinderGeometry(1, 1, 0.25, 16, 1, false, 0, Math.PI);
  for (const [x, y, z, ry, s] of [[1.66, 1.55, 3.18, -Math.PI / 2, 0.05], [1.66, 1.47, 3.32, -Math.PI / 2, 0.035], [1.67, 0.95, 3.12, -Math.PI / 2, 0.04], [0.62, 1.55, 4.36, Math.PI, 0.05], [0.66, 1.45, 4.37, Math.PI, 0.03], [-1.66, 1.6, 2.12, Math.PI / 2, 0.045], [-1.66, 1.5, 2.26, Math.PI / 2, 0.03]]) {
    const m4 = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(s, s * 1.2, s * 0.8));
    fungusB.add(shelf, fungusM, m4);
  }
  fungusB.build(props, { cast: false, name: 'fungus' });
  // 常春藤：顺着往下扎的根爬（一片片叶子）
  const ivyTex = TJ.genLeaf('ivy', { S: 128, color: '#1f3318', vein: '#3a5a26' });
  const ivyM = keep(new THREE.MeshStandardMaterial({ map: ivyTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }));
  const ivyCurves = curves.filter((c) => c.curve.points[0].y > 2.9 && c.curve.points[c.curve.points.length - 1].y < 1.5);
  const ivyN = 150;
  const ivy = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.08), ivyM, ivyN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < ivyN; i++) {
    const cv = ivyCurves[i % ivyCurves.length].curve;
    const p = cv.getPointAt(0.1 + rnd() * 0.85);
    e.set((rnd() - 0.5) * 2, rnd() * 6.28, (rnd() - 0.5) * 2); q.setFromEuler(e);
    m4.compose(p.add(V((rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.18)), q, V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.7));
    ivy.setMatrixAt(i, m4);
  }
  ivy.castShadow = true; ivy.receiveShadow = true;
  P(noRay(ivy));

  // ===== 3. 窗户：暴雨里的雨林 =====
  const flashU = { value: 0 };
  const timeU = { value: 0 };
  // 玻璃：水珠 + 水痕
  const glassU = { drops: { value: TJ.genGlassDrops() }, time: timeU, flash: flashU, glow: { value: 0.18 }, rep: { value: new THREE.Vector2(2.2, 1.3) } };
  if (refs.glassPane) {
    refs.glassPane.material = new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: RAIN_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false });
    refs.glassPane.userData.keepMat = true;
  }
  // 远景（宿舍原来那张窗外画面的位置）+ 中景、近景两层叶子
  refs.view.material.color.setScalar(1.15);
  const layer = (tex, w, h, x, y, z, c = 0.35) => {
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(c, c, c) }), { x, y, z, cast: false, recv: false });
    P(noRay(m)); return m;
  };
  const mid = layer(TJ.genJungleNear({ seed: 3362, density: 1.1, tone: '#0e1611' }), 8.5, 4.6, 0, 1.9, -5.6);
  const near = layer(TJ.genJungleNear({ seed: 3363, density: 0.55, tone: '#121c14' }), 5.2, 3.4, 0.2, 1.8, -4.25);
  // 三层雨幕
  const rainTex = TJ.genRainStreaks();
  const rainMats = [];
  const rain = (w, h, x, y, z, speed, alpha, rep) => {
    const U = { map: { value: rainTex }, time: timeU, flash: flashU, speed: { value: speed }, alpha: { value: alpha }, slant: { value: 0.04 }, rep: { value: new THREE.Vector2(rep[0], rep[1]) } };
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({ uniforms: U, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), { x, y, z, cast: false, recv: false });
    m.renderOrder = 4; rainMats.push(m.material);
    P(noRay(m)); return m;
  };
  rain(3.2, 2.2, 0, 1.75, -3.8, 1.9, 0.75, [2.2, 1.3]);
  rain(6.0, 3.6, 0, 1.9, -4.9, 1.5, 0.6, [3.5, 2]);
  rain(9.0, 4.8, 0, 2.0, -6.3, 1.2, 0.5, [5, 2.6]);
  // 洗手间窗外也在下
  rain(2.2, 2.2, 0, 1.7, WR.z1 + 0.5, 1.9, 0.65, [1.6, 1.3]).rotation.y = Math.PI;
  rain(5.0, 3.8, 0, 2.2, WR.z1 + 2.2, 1.4, 0.5, [3, 2]).rotation.y = Math.PI;
  // 闪电从窗口斜着打进来的光柱
  const boltDir = V(0.12, -0.5, 1).normalize();
  refs.shafts = new LightShafts({ rects: [{ cx: -0.66, cy: 1.75, w: 1.22, h: 1.45 }, { cx: 0.66, cy: 1.75, w: 1.22, h: 1.45 }], planeZ: -3.56, dir: boltDir, length: 4.6, color: '#c4d4ff', intensity: 0, slices: 5 });
  P(refs.shafts.group);
  // 窗台里侧积了一点水
  const sillWet = mesh(new THREE.PlaneGeometry(2.6, 0.12), keep(std('#1a1c1a', 0.05, 0.2, { transparent: true, opacity: 0.55 })), { y: 0.962, z: -3.44, rx: -Math.PI / 2, cast: false });
  P(noRay(sillWet));

  // 暴风雨：隔一会儿一道闪电（两三下连闪），远的暗、近的亮，雷声按距离晚到
  const storm = {
    flash: 0, pulses: [], t: 3 + rnd() * 3, onThunder: null,
    strike(power = 1, dist = 0.3) {
      const now = timeU.value;
      const n = 2 + Math.floor(Math.random() * 3);
      let at = now;
      for (let k = 0; k < n; k++) { this.pulses.push({ at, a: power * (k === 0 ? 0.7 : 0.5 + Math.random() * 0.6), d: 0.05 + Math.random() * 0.08 }); at += 0.06 + Math.random() * 0.22; }
      if (this.onThunder) this.onThunder(dist, 0.25 + dist * 4.5);
    },
    update(dt) {
      this.t -= dt;
      if (this.t <= 0) {
        this.t = 7 + Math.random() * 11;
        const near = Math.random() < 0.4;
        this.strike(near ? 0.85 + Math.random() * 0.3 : 0.25 + Math.random() * 0.3, near ? 0.12 + Math.random() * 0.25 : 0.55 + Math.random() * 0.4);
      }
      const now = timeU.value;
      let f = 0;
      this.pulses = this.pulses.filter((p) => now - p.at < 1.2);
      for (const p of this.pulses) { const x = now - p.at; if (x < 0) continue; f += p.a * (x < p.d ? 1 : Math.exp(-(x - p.d) * 16)); }
      this.flash = Math.min(1.6, f);
    },
  };
  refs.storm = storm;

  // ===== 4. 门：车锁换成一条生锈的铁链 + 一把老铜锁，链子上缠着藤 =====
  refs.lock.group.visible = false;
  const chain = new THREE.Group(); chain.name = 'vineChain';
  const linkGeo = new THREE.TorusGeometry(0.022, 0.0055, 6, 12); linkGeo.scale(1, 1.6, 1);
  const rust = keep(std('#7a5238', 0.62, 0.55));
  const curve = refs.lock.curve;
  const N = Math.floor(curve.getLength() / 0.03);
  const links = new THREE.InstancedMesh(linkGeo, rust, N);
  {
    const tan = V(), up = V(0, 1, 0), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = curve.getPointAt(t);
      curve.getTangentAt(t, tan);
      qq.setFromUnitVectors(up, tan); q2.setFromAxisAngle(tan, (i % 2) * Math.PI / 2);
      mm.compose(p, q2.multiply(qq), V(1, 1, 1));
      links.setMatrixAt(i, mm);
    }
  }
  links.castShadow = true;
  chain.add(links);
  // 缠在链子上的藤：一根细藤绕着链子螺旋着走，几片叶子
  {
    const pts = [], tan = V(), nrm = V(), bin = V();
    for (let k = 0; k <= 90; k++) {
      const t = k / 90, p = curve.getPointAt(t);
      curve.getTangentAt(t, tan);
      nrm.set(0, 1, 0).cross(tan).normalize(); bin.copy(tan).cross(nrm).normalize();
      const a = t * 34;
      pts.push(p.clone().addScaledVector(nrm, Math.cos(a) * 0.028).addScaledVector(bin, Math.sin(a) * 0.028));
    }
    chain.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.004, 5), keep(std('#2e3a1c', 0.8)), { cast: false }));
    const vl = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.06), ivyM, 26);
    for (let i = 0; i < 26; i++) { const p = pts[(i * 3.4) | 0]; e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e); m4.compose(p, q, V(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.5)); vl.setMatrixAt(i, m4); }
    chain.add(vl);
  }
  const padlock = new THREE.Group();
  padlock.position.set(-1.56, 0.58, 3.63); padlock.rotation.y = 1.2;
  const brass = keep(std('#b8913e', 0.3, 0.9));
  padlock.add(mesh(new THREE.BoxGeometry(0.09, 0.075, 0.035), brass));
  padlock.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 16, Math.PI), keep(std('#8a8478', 0.35, 0.9)), { y: 0.037 }));
  for (let i = 0; i < 3; i++) padlock.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 12), keep(std('#3a2e1e', 0.45, 0.7)), { x: -0.025 + i * 0.025, y: -0.012, z: 0.02, rx: Math.PI / 2 }));
  // 铜锈：一层绿
  padlock.add(mesh(new THREE.BoxGeometry(0.092, 0.02, 0.037), keep(std('#4a6a52', 0.7, 0.3)), { y: -0.03, cast: false }));
  chain.add(padlock);
  P(chain);
  mark('door', chain);
  const dropped = new THREE.Group(); dropped.visible = false;
  const coil = [];
  for (let i = 0; i <= 50; i++) { const a = i * 0.42; coil.push(V(-1.24 + Math.cos(a) * 0.13, 0.012 + i * 0.001, 3.5 + Math.sin(a) * 0.1)); }
  dropped.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.009, 6), rust));
  P(dropped);
  refs.vineLock = { group: chain, links, N, lock: padlock, dropped };

  // ===== 5. 地毯、海报、植物 =====
  const rug = mesh(new THREE.CircleGeometry(0.85, 48), keep(new THREE.MeshStandardMaterial({ map: TJ.genRugReal(), transparent: true, alphaTest: 0.2, roughness: 1 })), { x: -0.05, y: 0.006, z: 0.55, rx: -Math.PI / 2, cast: false });
  P(rug);
  const poster = (kind, x, y, z, ry, w = 0.42) => {
    const g = new THREE.PlaneGeometry(w, w * 1.42, 6, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w + 0.5, v = p.getY(i) / (w * 1.42) + 0.5; p.setZ(i, Math.sin(u * 9 + v * 4) * 0.003 + Math.max(0, v - 0.85) ** 2 * 0.25 * (u > 0.7 ? 1 : 0.3)); }
    g.computeVertexNormals();
    const m = mesh(g, keep(new THREE.MeshStandardMaterial({ map: TJ.genPosterReal(kind), roughness: 0.85, side: THREE.DoubleSide })), { x, y, z, ry, cast: false });
    P(m); mark(`poster_${kind}`, m);
    return m;
  };
  poster('chicken', 1.79, 1.72, 0.25, -Math.PI / 2, 0.46);
  poster('horse', -1.79, 2.22, -1.07, Math.PI / 2, 0.36);
  poster('monkey', -1.32, 1.72, SZ - 0.01, Math.PI, 0.4);
  poster('sleep', -1.58, 1.7, -3.588, 0, 0.34);
  // 龟背竹：窗边角落一大盆
  const potM = keep(std('#6a3e2a', 0.9));
  const soilM = keep(std('#1e1610', 1));
  const stemM = keep(std('#3a4a22', 0.7));
  const monTex = TJ.genLeaf('monstera', { color: '#1d3a1c', vein: '#3c6a2e', seed: 1 });
  const leafM = keep(new THREE.MeshStandardMaterial({ map: monTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }));
  const bentLeaf = (w, h, bend = 0.25) => {
    const g = new THREE.PlaneGeometry(w, h, 6, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / w, y = p.getY(i) / h + 0.5; p.setZ(i, -Math.abs(x) * w * 0.35 + y * y * h * bend); }
    g.translate(0, h / 2, 0); g.computeVertexNormals();
    return g;
  };
  const monstera = new THREE.Group(); monstera.position.set(1.58, 0, -3.42);
  monstera.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.32, 20), potM, { y: 0.16 }));
  monstera.add(mesh(new THREE.CircleGeometry(0.15, 20), soilM, { y: 0.3, rx: -Math.PI / 2, cast: false }));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3, h = 0.35 + rnd() * 0.55, out = 0.12 + rnd() * 0.12;
    const tip = V(Math.cos(a) * out, 0.3 + h, Math.sin(a) * out);
    monstera.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.3, 0), V(Math.cos(a) * out * 0.3, 0.3 + h * 0.6, Math.sin(a) * out * 0.3), tip]), 10, 0.008, 5), stemM, { cast: false }));
    const leaf = mesh(bentLeaf(0.32 + rnd() * 0.12, 0.34 + rnd() * 0.12), leafM, { x: tip.x, y: tip.y, z: tip.z });
    leaf.rotation.set(-0.9 - rnd() * 0.5, -a - Math.PI / 2, 0, 'YXZ');
    monstera.add(leaf);
  }
  P(monstera); mark('plant', monstera);
  block(1.4, 1.8, -3.6, -3.22);
  // 蕨：窗台上两盆、窗边书桌上一盆
  const fernTex = TJ.genLeaf('fern', { color: '#22401e', vein: '#4a7a34', seed: 2 });
  const fernM = keep(new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }));
  const fern = (x, y, z, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 14), potM, { y: 0.04 }));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + rnd() * 0.4; const f = mesh(bentLeaf(0.07, 0.24 + rnd() * 0.08, 0.9), fernM, { y: 0.07 }); f.rotation.set(-0.5 - rnd() * 0.4, a, 0, 'YXZ'); g.add(f); }
    P(g); return g;
  };
  fern(-0.9, 0.955, -3.47); fern(0.95, 0.955, -3.47, 0.85); fern(-0.2, 0.74, -3.05, 0.95);

  // ===== 6. 灯：钨丝灯串、马灯、化妆镜灯泡、电脑屏幕、手机 =====
  // 钨丝灯串：沿着两面长墙的墙顶挂一圈（暖白，不是彩色的）
  const bulbSpots = [];
  const strings = [
    [V(1.74, 2.76, -3.45), V(1.74, 2.76, 4.35), 9],
    [V(-1.74, 2.76, -3.45), V(-1.74, 2.76, 3.4), 8],
    [V(-1.3, 2.64, -3.5), V(1.3, 2.64, -3.5), 3],
  ];
  const wireB = new Batch();
  const wireM = keep(std('#141210', 0.6));
  for (const [a, b, spans] of strings) {
    for (let sp = 0; sp < spans; sp++) {
      const p0 = a.clone().lerp(b, sp / spans), p1 = a.clone().lerp(b, (sp + 1) / spans);
      const pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10, p = p0.clone().lerp(p1, t); p.y -= Math.sin(t * Math.PI) * 0.15; pts.push(p); if (k > 0 && k < 10 && k % 2 === 0) bulbSpots.push({ p: p.clone(), ph: rnd() * 6.28, k: 0.8 + rnd() * 0.4 }); }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.003, 4);
      wireB.add(g, wireM, I4); g.dispose();
    }
  }
  wireB.build(props, { cast: false, name: 'bulbWire' }).forEach(noRay);
  const fairyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbSpots.length);
  fairyMesh.geometry.scale(1, 1.35, 1);
  const warm = new THREE.Color('#ffae5a');
  bulbSpots.forEach((f, i) => { m4.makeTranslation(f.p.x, f.p.y - 0.03, f.p.z); fairyMesh.setMatrixAt(i, m4); fairyMesh.setColorAt(i, warm); });
  P(noRay(fairyMesh));
  // 煤油马灯：窗边书桌上
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
  P(lanternG); mark('lantern', lanternG);
  // 穿衣镜那一圈化妆灯泡（猴子最爱）
  const bulbs = [];
  const bulbMat = keep(new THREE.MeshStandardMaterial({ color: '#f4e2c0', emissive: new THREE.Color('#ffc27a'), emissiveIntensity: 2.2, roughness: 0.2 }));
  {
    const mg = refs.mirrorG;
    const pts = [];
    for (let i = 0; i < 6; i++) { pts.push([-0.16, -0.62 + i * 0.25]); pts.push([0.16, -0.62 + i * 0.25]); }
    pts.push([0, 0.74], [-0.09, 0.73], [0.09, 0.73]);
    for (const [x, y] of pts) { const b = mesh(new THREE.SphereGeometry(0.018, 10, 8), bulbMat, { x, y, z: -0.03, cast: false }); mg.add(b); bulbs.push(b); }
    mg.add(mesh(new THREE.BoxGeometry(0.37, 1.53, 0.02), keep(new THREE.MeshStandardMaterial({ map: T.woodDark, roughness: 0.6 })), { z: -0.004, cast: false }));
  }
  // 爆米花桶（鸡们打游戏时的零食）
  const popcorn = new THREE.Group(); popcorn.position.set(1.62, 0.76, 0.72);
  const pcC = TX.makeCanvas(64, 64), pcx = pcC.getContext('2d');
  pcx.fillStyle = '#d8d0bc'; pcx.fillRect(0, 0, 64, 64); pcx.fillStyle = '#8a2a22'; for (let x = 0; x < 64; x += 16) pcx.fillRect(x, 0, 8, 64);
  pcx.fillStyle = 'rgba(40,40,20,0.2)'; for (let k = 0; k < 200; k++) pcx.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5);
  const bucket = mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.16, 18, 1, true), keep(new THREE.MeshStandardMaterial({ map: TX.toTex(pcC), roughness: 0.85, side: THREE.DoubleSide })), { y: 0.08 });
  popcorn.add(bucket);
  const kernelM = keep(std('#e2d6b4', 0.9));
  for (let i = 0; i < 16; i++) { const g = new THREE.IcosahedronGeometry(0.02, 0); popcorn.add(mesh(g, kernelM, { x: (rnd() - 0.5) * 0.1, y: 0.155 + rnd() * 0.04, z: (rnd() - 0.5) * 0.1, rx: rnd() * 3, ry: rnd() * 3, cast: false })); }
  P(popcorn); mark('popcorn', popcorn);

  // ===== 7. 一只壁虎：趴在北墙上，时不时蹿一段 =====
  {
    const gk = new THREE.Group();
    const skin = TJ.genSkin({ base: '#7a7652', bumps: 1.5, seed: 3491 });
    skin.map.repeat.set(3, 1); skin.normalMap.repeat.set(3, 1);
    const gm = keep(new THREE.MeshStandardMaterial({ map: skin.map, normalMap: skin.normalMap, roughness: 0.45 }));
    const body = mesh(new THREE.CapsuleGeometry(0.014, 0.07, 6, 10), gm, { rz: Math.PI / 2, s: [1, 1, 0.55] });
    gk.add(body);
    gk.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), gm, { x: 0.058, s: [1.3, 1, 0.55] }));
    for (const s of [-1, 1]) gk.add(mesh(new THREE.SphereGeometry(0.004, 6, 5), keep(std('#0a0806', 0.15)), { x: 0.066, y: s * 0.011, z: 0.005, cast: false }));
    const legs = [];
    for (const [x, s] of [[0.03, 1], [0.03, -1], [-0.03, 1], [-0.03, -1]]) { const l = mesh(new THREE.CapsuleGeometry(0.004, 0.022, 4, 6), gm, { x, y: s * 0.02, rz: s * (x > 0 ? -0.6 : 0.6), cast: false }); gk.add(l); legs.push(l); }
    const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.045, 0, 0), V(-0.09, 0.01, 0), V(-0.13, -0.01, 0), V(-0.16, 0.012, 0)]), 12, 0.006, 5), gm, { cast: false });
    gk.add(tail);
    gk.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ visible: false })));
    gk.rotation.set(0, 0, 0);
    gk.position.set(0.3, 2.74, -3.585);
    P(gk); mark('gecko', gk);
    const path = [[0.3, 2.74], [-0.6, 2.8], [-1.1, 2.7], [-1.58, 2.45], [-1.6, 1.6], [-1.58, 2.5], [-0.2, 2.78], [0.9, 2.76], [1.58, 2.4], [1.6, 1.5], [1.56, 2.5], [1.0, 2.72]];
    const st = { i: 0, wait: 2, p: new THREE.Vector2(0.3, 2.74) };
    refs.gecko = { group: gk, state: st, spook: () => { st.wait = 0; st.fast = 1.5; } };
    refs.updaters.push((dt, t) => {
      if (st.wait > 0) { st.wait -= dt; tail.rotation.z = Math.sin(t * 2) * 0.12; return; }
      const nx = path[(st.i + 1) % path.length];
      const dx = nx[0] - st.p.x, dy = nx[1] - st.p.y, d = Math.hypot(dx, dy);
      const sp = st.fast > 0 ? 1.4 : 0.55;
      st.fast = (st.fast || 0) - dt;
      if (d < 0.02) { st.i = (st.i + 1) % path.length; st.wait = 1 + Math.random() * 5; return; }
      const k = Math.min(d, sp * dt);
      st.p.x += (dx / d) * k; st.p.y += (dy / d) * k;
      gk.position.set(st.p.x, st.p.y, -3.585);
      gk.rotation.z = Math.atan2(dy, dx);
      const w = Math.sin(t * 28);
      legs.forEach((l, i) => (l.rotation.z = (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1) * (0.6 + w * 0.35 * (i < 2 ? 1 : -1))));
      tail.rotation.z = Math.sin(t * 20) * 0.3;
    });
  }

  // ===== 8. 漏雨：天花板的根上往下滴水，地上一小滩积水 =====
  {
    const HOLE = V(-0.3, 2.78, -2.86);
    const puddleMat = keep(new THREE.MeshStandardMaterial({ color: '#141612', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.72 }));
    const pg = new THREE.CircleGeometry(0.36, 40);
    { const p = pg.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.75 + 0.3 * Math.sin(i * 1.7) * Math.sin(i * 0.53); p.setXY(i, p.getX(i) * k, p.getY(i) * k * 0.8); } }
    P(mesh(pg, puddleMat, { x: HOLE.x + 0.05, y: 0.004, z: HOLE.z + 0.12, rx: -Math.PI / 2, cast: false }));
    const ripples = [];
    for (let k = 0; k < 3; k++) {
      const rm = new THREE.MeshBasicMaterial({ color: '#b8c0b8', transparent: true, opacity: 0, depthWrite: false });
      const rg = mesh(new THREE.RingGeometry(0.9, 1, 32), rm, { x: HOLE.x, y: 0.006, z: HOLE.z, rx: -Math.PI / 2, s: 0.01, cast: false, recv: false });
      P(noRay(rg)); ripples.push({ m: rg, t: 10 });
    }
    const drop = mesh(new THREE.SphereGeometry(0.01, 8, 6), keep(std('#c8d4d8', 0.05, 0, { transparent: true, opacity: 0.8 })), { x: HOLE.x, y: HOLE.y, z: HOLE.z, s: [1, 1.6, 1], cast: false });
    P(noRay(drop));
    refs.drip = { drop, ripples, x: HOLE.x, z: HOLE.z, t: 0, period: 1.1, onDrip: null };
    refs.updaters.push((dt) => {
      const D = refs.drip;
      D.t += dt;
      const k = D.t / D.period;
      if (k >= 1) { D.t = 0; const r = ripples.find((x) => x.t > 1) || ripples[0]; r.t = 0; if (D.onDrip) D.onDrip(); }
      const fall = Math.max(0, (k - 0.55) / 0.45);
      drop.position.y = HOLE.y - fall * fall * (HOLE.y - 0.01);
      drop.visible = k > 0.2;
      drop.scale.set(1, k < 0.55 ? 0.6 + k : 1.8, 1);
      for (const r of ripples) { r.t += dt; const kk = Math.min(1, r.t / 1.1); r.m.scale.setScalar(0.02 + kk * 0.3); r.m.material.opacity = (1 - kk) * 0.4; }
    });
  }

  // ===== 9. 灯光：暴风雨的夜里，屋里只有几盏暖色的小灯 =====
  const L = refs.lights;
  L.hemi.color.set('#50665f'); L.hemi.groundColor.set('#4a3a2a');
  // "太阳"改成闪电：冷白色，平时 0，闪的时候从窗口斜着打进来（带阴影）
  L.sun.color.set('#c4d2ff'); L.sun.position.set(-1.2, 8.5, -11.5); L.sun.target.position.set(0.2, 0, 0.8); L.sun.intensity = 0;
  L.winLight.color.set('#7890a8'); L.winLight.position.z = -3.63; // 放到窗框后面：别把窗框本身照成一条亮线
  L.monLight.color.set('#9fb8e8'); L.monLight.distance = 3.4; L.monLight.position.set(1.32, 1.1, -0.28);
  refs.lights.wc.color.set('#e8dcb8');
  // 点光源很贵（全屏时每盏 ~1.5ms）：整间屋子只用 4 盏——马灯（顺便照亮窗边的天花板）、化妆镜、灯串、屏幕
  const lantern = new THREE.PointLight('#ff9a42', 2.2, 6, 1.5); lantern.position.set(0.62, 0.98, -3.22); P(lantern);
  // 化妆镜那圈灯泡的光：往门口偏一点，顺便把门、铁链和门边的开关照出来
  //   （贴着镜子、在猴子站的那块地方里面：人走不过去，不会把主角的头发照爆）
  const vanity = new THREE.PointLight('#ffc27a', 3.8, 4.6, 1.4); vanity.position.set(-0.66, 1.9, 4.36); P(vanity);
  // 灯串的光：两盏贴着天花板的暖光，把根的轮廓从底下照出来
  const fairyL = new THREE.PointLight('#ffae62', 1.3, 8, 1.2); fairyL.position.set(0, 2.62, 0.2); P(fairyL);
  refs.jungleLights = { lantern, vanity, fairyL, fairyMesh, bulbSpots, bulbs, bulbMat, flame, flameM };

  // ===== 10. 电脑屏幕：两台都在打同一款游戏；马们手机上的短视频 =====
  const screens = [];
  for (const [mon, seed] of [[refs.monitor.group, 0], [refs.monitor2, 3]]) {
    const c = TX.makeCanvas(320, 180);
    TJ.drawGameScreenReal(c, 0, { seed });
    const tex = TX.toTex(c, { wrap: false });
    const sm = mon.userData.screenMat;
    sm.map = tex; sm.toneMapped = false; sm.color && sm.color.setScalar(0.72); sm.needsUpdate = true;
    screens.push({ canvas: c, tex, seed, off: false, boss: false });
  }
  refs.gameScreens = screens;
  const feeds = [0, 1, 2].map((i) => { const c = TX.makeCanvas(96, 192); TJ.drawPhoneFeedReal(c, 0, i * 7); return { canvas: c, tex: TX.toTex(c, { wrap: false }), seed: i * 7 }; });
  refs.feeds = feeds;

  // ===== 11. 动物室友们 =====
  const animals = new THREE.Group(); animals.name = 'animals';
  const A = {};
  // 鸡 × 2：坐在两张书桌前打游戏（一只白来航、一只红褐色的土鸡）
  refs.stoolMe.position.set(0.95, 0, 0.25);
  refs.stool2.position.set(0.95, 0, -0.8); refs.stool2.rotation.y = Math.PI / 2;
  A.chickA = new Chicken({ name: '咯咯', breed: 'white', headset: '#6a8aff' });
  A.chickA.root.position.set(0.95, 0, 0.25); A.chickA.root.rotation.y = Math.PI / 2;
  A.chickB = new Chicken({ name: '哒哒', breed: 'brown', headset: '#ff5ab0', scale: 1.18 });
  A.chickB.root.position.set(0.95, 0, -0.8); A.chickB.root.rotation.y = Math.PI / 2;
  A.chick = new Chick({ name: '小黄' });
  A.chick.root.position.set(0.42, 0, -0.28); A.chick.root.rotation.y = Math.PI / 2 - 0.3;
  block(0.32, 0.52, -0.38, -0.18);
  // 马 × 3：下铺仰躺 / 下铺侧躺 / 上铺趴着
  A.horseA = new Horse({ name: '马大哈', coat: '#8a5a38', mane: '#1e140e', muzzle: '#3a302c', pj: '#5f7890', pj2: '#cfcabc', feed: feeds[0].tex, baseYaw: 0.55, seed: 1 });
  A.horseA.lieOn(V(-1.3, 0.66, 0.28), V(0, 0, -1), 'back');
  A.horseB = new Horse({ name: '马赛克', coat: '#cfc8bc', mane: '#8a847c', muzzle: '#6a5a58', pj: '#8a6a70', pj2: '#d8d0c4', feed: feeds[1].tex, seed: 2 });
  A.horseB.lieOn(V(-1.38, 0.66, -2.25), V(0, 0, -1), 'side', V(1, 0, 0));
  A.horseC = new Horse({ name: '马上睡', coat: '#3e2a20', mane: '#140e0a', muzzle: '#2a2220', pj: '#5a7a60', pj2: '#cfd0c0', feed: feeds[2].tex, baseYaw: 0.5, seed: 3 });
  A.horseC.lieOn(V(1.3, 1.69, -2.25), V(0, 0, -1), 'belly');
  // 猴 × 2：穿衣镜前一只，洗手间镜子前一只
  A.monkeyA = new Monkey({ name: '猴赛雷', accessory: 'chain', seed: 1 });
  A.monkeyA.root.position.set(-0.67, 0, 3.98);
  block(-0.88, -0.46, 3.8, 4.16);
  A.monkeyB = new Monkey({ name: '美猴', fur: '#5a4028', face: '#a87464', quiff: '#1e140c', accessory: 'band', seed: 2 });
  A.monkeyB.root.position.set(1.12, 0, 5.5);
  block(0.94, 1.3, 5.34, 5.66);
  for (const [id, a] of Object.entries(A)) { animals.add(a.root); mark(id, a.root); a.id = id; }
  refs.animals = A;
  refs.animalList = Object.values(A);
  P(animals);

  // ===== 12. 更新：暴风雨、雨幕、玻璃、叶子晃、灯串、屏幕 =====
  let scrT = 0, feedT = 0;
  const _c = new THREE.Color();
  const outside = refs.outside;
  refs.updaters.push((dt, t) => {
    timeU.value = t;
    storm.update(dt);
    const f = storm.flash;
    flashU.value = f;
    // 窗外：平时只是一片暗，闪电的时候一层层亮出来
    refs.view.material.color.setScalar(1.15 + f * 2.2);
    mid.material.color.setScalar(0.62 + f * 3.2);
    near.material.color.setScalar(0.5 + f * 3.4);
    near.position.x = 0.2 + Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.3) * 0.012;
    near.rotation.z = Math.sin(t * 0.7) * 0.012;
    mid.position.x = Math.sin(t * 0.5 + 1) * 0.02;
    if (outside && outside.flash) outside.flash(f);
    // 光柱只在闪电的那一下出现
    const S = refs.shafts;
    S.uniforms.intensity.value = f * 0.045; S.uniforms.time.value = t;
    S.group.visible = f > 0.02;
    // 钨丝灯串：暖光，个别灯泡接触不良，一闪一闪
    bulbSpots.forEach((b, i) => {
      const flick = (i % 7 === 3) ? (Math.sin(t * 13 + b.ph) > 0.3 ? 1 : 0.35) : 1;
      fairyMesh.setColorAt(i, _c.copy(warm).multiplyScalar((1.4 + Math.sin(t * 0.7 + b.ph) * 0.12) * b.k * flick));
    });
    fairyMesh.instanceColor.needsUpdate = true;
    // 游戏画面约 15 帧/秒，短视频约 10 帧/秒
    scrT -= dt; feedT -= dt;
    if (scrT <= 0) { scrT = 0.066; for (const s of screens) { TJ.drawGameScreenReal(s.canvas, t, s); s.tex.needsUpdate = true; } }
    if (feedT <= 0) { feedT = 0.1; for (const fd of feeds) { TJ.drawPhoneFeedReal(fd.canvas, t, fd.seed); fd.tex.needsUpdate = true; } }
  });
  add(props);

  // ===== 13. 全场受潮（自己建的写实材质、窗外、动物不动）=====
  const skip = new Set();
  for (const g of [refs.outside.group, animals]) g.traverse((o) => skip.add(o));
  const seen = new Set(clean);
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      dampMaterial(m);
    }
  });
}
