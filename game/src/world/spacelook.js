// 第五章"写实电影感"的公用工具：
//   · 颜色表：原来动画风的高饱和配色 → 用旧了的空间站配色（米白、深灰、青绿漆、褪色的安全橙）
//   · 材质工厂 std / glow：所有第五章的设备都从这里拿材质
//   · 做旧：世界坐标噪声的淡淡脏印（比第二章轻得多——这里是"用旧了"，不是"废弃"）
//   · 合批：墙上、天花板上那一大堆不会动的杂物（线缆、货包、设备盒）按材质合成几个网格，draw call 不会涨
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { genPanel } from '../core/tex_space.js';

const REAL = {
  // 白 / 浅灰 → 米白、旧塑料
  '#eef2f7': '#c4bfaf', '#f4f7fb': '#cbc6b7', '#f4f6fa': '#cdc8ba', '#f6f8fc': '#d6d7d1', '#e8edf3': '#b7b2a2', '#dfe5ee': '#b3ae9e',
  '#dfe8f5': '#c3beb0', '#fbf8f0': '#ddd8c9', '#fff6d8': '#e2dbc4', '#fff6c8': '#e4dcc0', '#ffffff': '#dcd9d0',
  // 深蓝 → 深灰
  '#243452': '#2a2f2d', '#1a2238': '#1c201f', '#1f2c4a': '#232826', '#2e3f62': '#353b38', '#0c1a33': '#0e1211', '#1a2a4a': '#202523',
  // 钢 → 旧金属
  '#8d9bb0': '#7a807c', '#b9c3d2': '#8c908a', '#d8dde6': '#a4a7a1', '#c9d1dc': '#8a8e88', '#6f7d93': '#5d625f',
  // 彩色 → 褪色
  '#ff9a3d': '#a8702f', '#ff8a3d': '#a45a2c', '#ff9a4d': '#a36a38', '#2ec4c9': '#3d676b', '#ffd23f': '#b48f2c',
  '#ff4a5a': '#8c2c25', '#e8202a': '#9c2320', '#ff5a6a': '#b0352c', '#3a6fd8': '#2e4a70', '#3a5f9a': '#333f48', '#7fd48a': '#4c6a47',
  '#8a5aff': '#4b3e66', '#bfe8ff': '#8f9d9c', '#8fd8ff': '#9fb4b8', '#7fd0ff': '#9fb4b8', '#9fe0ff': '#a8bcc0', '#cfe3ee': '#a9b6b6',
  '#f0c9a0': '#d6b08c', '#8a5a3a': '#6a4a36',
};
// 发光的东西：大片的青色灯带 → 暗一点的冷白 LED；小指示灯保持亮（它们本来就小）
const GLOW = {
  '#7fe8ff': '#a9d8c4', '#7fe0ff': '#b8dccb', '#8fe8ff': '#b8dccb', '#8fffc0': '#62ff8e', '#ffd23f': '#ffb04a', '#ff8a9a': '#ff5a3e',
  '#ff4a5a': '#ff3a26', '#ffb45a': '#ffae55', '#cfefff': '#dfe6dc', '#7fffb0': '#62ff8e',
};
export const real = (c) => (typeof c === 'string' && REAL[c.toLowerCase()]) || c;
export const realGlow = (c) => (typeof c === 'string' && GLOW[c.toLowerCase()]) || c;
// 同样参数的材质只建一份：设备上几百个零件共用几十种材质，合批（compact）时才合得起来
const _matCache = new Map();
const matKey = (kind, color, o) => kind + color + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v && v.isColor ? v.getHexString() : v));
function cached(kind, color, o, make) {
  const key = matKey(kind, color, o);
  let m = _matCache.get(key);
  if (!m) { m = make(); _matCache.set(key, m); m.addEventListener('dispose', () => _matCache.delete(key)); }
  return m;
}
export const std = (color, o = {}) => cached('s', real(color), o, () => new THREE.MeshStandardMaterial({ color: real(color), roughness: 0.6, metalness: 0, ...o }));
export const glow = (color, o = {}) => cached('g', realGlow(color), o, () => new THREE.MeshBasicMaterial({ color: realGlow(color), toneMapped: false, ...o }));
// 带面板纹理的刷漆金属：面板缝、四角螺丝、脏印、刮痕（贴图是中性灰，颜色靠材质的 color 乘上去）
const _panelTex = new Map();
export function panelTex(k = 1) {
  if (!_panelTex.has(k)) _panelTex.set(k, genPanel({ base: '#d6d4ce', seed: 20 + k }));
  return _panelTex.get(k);
}
export const panel = (color, { seed = 1, ...o } = {}) => std(color, { roughness: 0.58, map: panelTex(seed), ...o });
// 常用的几种写实材质
export const MAT = {
  paint: (c = '#b3ae9e', r = 0.62) => std(c, { roughness: r }),
  metal: (c = '#8a8f8a', r = 0.42, m = 0.7) => std(c, { roughness: r, metalness: m }),
  plastic: (c = '#2a2d2b', r = 0.5) => std(c, { roughness: r }),
  rubber: (c = '#161817') => std(c, { roughness: 0.92 }),
  fabric: (c = '#cfc8b4', map = null) => std(c, { roughness: 0.95, map }),
};

// ---------- 旧材质的"降火"：太亮太艳的颜色压一压 ----------
const _hsl = {};
export function tame(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.tamed) return;
  m.userData.tamed = true;
  if (!m.map) {
    m.color.getHSL(_hsl);
    m.color.setHSL(_hsl.h, Math.min(_hsl.s, 0.55) * 0.85, Math.min(_hsl.l, 0.8));
  }
  if (m.emissive && m.emissiveIntensity > 0 && !m.userData.keepEmissive && !m.emissiveMap) m.emissiveIntensity *= 0.6;
  if (!m.transparent) m.roughness = Math.max(m.roughness, 0.3);
}

// ---------- 做旧着色器 ----------
const USED_FUNCS = /* glsl */ `
varying vec3 vUsedW;
float uh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float un(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uh(i), uh(i + vec3(1, 0, 0)), f.x), mix(uh(i + vec3(0, 1, 0)), uh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(uh(i + vec3(0, 0, 1)), uh(i + vec3(1, 0, 1)), f.x), mix(uh(i + vec3(0, 1, 1)), uh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
const USED_APPLY = /* glsl */ `
#include <map_fragment>
{
  float n1 = un(vUsedW * 2.7), n2 = un(vUsedW * 9.0 + 5.0), n3 = un(vUsedW * 31.0);
  float g = smoothstep(0.5, 0.95, n1 * 0.6 + n2 * 0.4);
  float dirt = clamp(g * 0.42 + (n3 - 0.5) * 0.1, 0.0, 0.45);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.6, 0.6, 0.56), dirt);
}`;
function used(m) {
  m.userData.used = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUsedW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvUsedW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${USED_FUNCS}`)
      .replace('#include <map_fragment>', USED_APPLY);
  };
  m.customProgramCacheKey = () => 'used';
  m.needsUpdate = true;
}
export function weather(root, { skip = () => false } = {}) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (!m.isMeshStandardMaterial) continue;
      tame(m);
      if (m.transparent || m.userData.used || m.userData.clean || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue;
      used(m);
    }
  });
}

// ---------- 合批 ----------
export class Batch {
  constructor() { this.m = new Map(); }
  add(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(matrix);
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat).push(g);
  }
  // 把一个搭好的物体（放在世界坐标里）整个收进来
  addObject(o) {
    o.updateMatrixWorld(true);
    o.traverse((c) => { if (c.isMesh && c.visible) this.add(c.geometry, c.material, c.matrixWorld); });
  }
  build(parent, { cast = true, name = 'spaceClutter' } = {}) {
    const out = [];
    for (const [mat, list] of this.m) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.name = name;
      parent.add(mesh); out.push(mesh);
    }
    this.m.clear();
    return out;
  }
}

// 把一个物体里"不会单独动"的网格按材质合并成几个，留在原来的组里：
//   交互 / 描边 / 射线检测都认组上的 iid，不受影响；keep 里的子树（会转的风扇、会闪的灯、会被抽走的书……）原样保留
export function compact(group, keep = []) {
  const skip = new Set(keep.filter(Boolean));
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const b = new Batch(), remove = [];
  const visit = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && o !== group && o.visible && !o.isInstancedMesh && !Array.isArray(o.material) && !o.material.transparent && !o.userData.keepMat && o.children.length === 0) {
      b.add(o.geometry, o.material, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      remove.push(o);
    }
    for (const c of o.children.slice()) visit(c);
  };
  visit(group);
  if (remove.length < 3) return group;
  for (const o of remove) o.parent.remove(o);
  const iid = group.userData.iid;
  for (const m of b.build(group, { cast: true, name: 'compact' })) if (iid) m.userData.iid = iid;
  return group;
}
