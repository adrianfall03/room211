// 卡通渲染工具：三阶色带的 MeshToonMaterial、固定像素宽度的"反向外壳"描边、整个场景一键卡通化
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from '../core/tex_toon.js';

export const GRAD = toonGradient([0.5, 0.78, 1.0]);
// 日式动画（赛璐璐）：只有亮 / 暗两阶，暗部偏冷的蓝紫色
export const GRAD_ANIME = colorGradient([[0.52, 0.56, 0.8], [1, 1, 1]]);
export const outlineUniforms = { resolution: { value: new THREE.Vector2(1280, 720) } };
// 各种画风：色带、描边颜色和粗细、颜色往马卡龙靠多少、边缘光
export const STYLES = {
  toon: { gradient: GRAD, outlineColor: '#3a2438', thickness: 2.2, pastel: { sat: 1.2, light: 0.12 }, rim: 0 },
  anime: { gradient: GRAD_ANIME, outlineColor: '#1c2440', thickness: 1.7, pastel: { sat: 1.12, light: 0.08 }, rim: 0.32 },
};

function colorGradient(steps) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((c, i) => { d[i * 4] = Math.round(c[0] * 255); d[i * 4 + 1] = Math.round(c[1] * 255); d[i * 4 + 2] = Math.round(c[2] * 255); d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// 边缘光：动画里人物轮廓上那一圈亮边（硬边，偏青色）
export function addRim(m, strength = 0.32, color = [0.72, 0.9, 1.0]) {
  if (!m || m.userData.rim === strength) return m;
  m.userData.rim = strength;
  const key = `rim${strength}`;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += vec3(${color.map((v) => v.toFixed(3)).join(',')}) * smoothstep(0.6, 0.72, rimF) * ${strength.toFixed(3)} * (0.35 + 0.65 * diffuseColor.rgb);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}

const _hsl = { h: 0, s: 0, l: 0 };
// 颜色卡通化：饱和一点、亮一点（往马卡龙色靠）
export function pastel(color, { sat = 1.2, light = 0.12, minL = 0.18 } = {}) {
  const c = color.clone();
  c.getHSL(_hsl);
  _hsl.s = Math.min(1, _hsl.s * sat + 0.04);
  _hsl.l = Math.max(minL, _hsl.l + (0.78 - _hsl.l) * light);
  c.setHSL(_hsl.h, _hsl.s, _hsl.l);
  return c;
}

const mcache = new Map();
export function toonMat(color, { emissive = null, emissiveIntensity = 1, map = null, side = THREE.FrontSide, transparent = false, opacity = 1, gradient = GRAD, rim = 0 } = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${side}|${transparent}|${opacity}|${gradient.id}|${rim}`;
  if (!map && mcache.has(key)) return mcache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, map, side, transparent, opacity });
  if (rim) addRim(m, rim);
  if (emissive) { m.emissive.set(emissive); m.emissiveIntensity = emissiveIntensity; }
  if (!map) mcache.set(key, m);
  return m;
}

// ---------- 描边：沿平滑法线外扩、固定屏幕像素宽度，只画背面 ----------
const OUTLINE_VERT = /* glsl */ `
  uniform vec2 resolution; uniform float thickness;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec3 n = normalize(normalMatrix * normal);
    vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
    float l = length(dir);
    dir = l > 1e-5 ? dir / l : vec2(0.0);
    // 远处的线细一点，近处也别太粗
    float px = thickness * clamp(2.4 / max(clip.w, 0.01), 0.45, 1.0);
    clip.xy += dir * px * 2.0 / resolution * clip.w;
    gl_Position = clip;
  }`;
const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 color;
  void main() { gl_FragColor = vec4(color, 1.0); }`;
const omats = new Map();
export function outlineMat(color = '#3a2438', thickness = 2.2) {
  const key = `${color}|${thickness}`;
  if (!omats.has(key)) {
    omats.set(key, new THREE.ShaderMaterial({
      uniforms: { resolution: outlineUniforms.resolution, thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
      vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide,
    }));
  }
  return omats.get(key);
}
// 平滑法线版几何（同一位置的顶点合并后重新算法线，方块的角才不会裂开）
const hullCache = new WeakMap();
export function hullGeometry(geo) {
  if (hullCache.has(geo)) return hullCache.get(geo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  let m;
  try { m = mergeVertices(g, 1e-4); } catch (e) { m = g; }
  m.computeVertexNormals();
  hullCache.set(geo, m);
  return m;
}
const _noRay = () => {};
export function addOutline(mesh, { color, thickness } = {}) {
  if (mesh.userData.outline) return mesh.userData.outline;
  const o = new THREE.Mesh(hullGeometry(mesh.geometry), outlineMat(color, thickness));
  o.castShadow = false; o.receiveShadow = false;
  o.userData.noRay = true; o.userData.isOutline = true;
  o.raycast = _noRay;
  mesh.add(o);
  mesh.userData.outline = o;
  return o;
}

// ---------- 整个宿舍卡通化 ----------
// MeshStandardMaterial → MeshToonMaterial（颜色往马卡龙色靠），并给够大的实体物件加描边。
// 返回 旧材质 → 新材质 的映射，运行时会改的材质（开关指示灯、灯管）要跟着换引用
export function toonifyScene(root, { skip = () => false, outline = true, minR = 0.045, maxR = 2.6, style = 'toon', rim = null } = {}) {
  const ST = STYLES[style] || STYLES.toon;
  const rimS = rim === null ? 0 : rim;
  const map = new Map();
  const convert = (m) => {
    if (!m || !m.isMeshStandardMaterial) return m;
    if (map.has(m)) return map.get(m);
    const t = new THREE.MeshToonMaterial({
      color: m.map ? m.color.clone().lerp(new THREE.Color(1, 1, 1), 0.15) : pastel(m.color, ST.pastel),
      map: m.map, gradientMap: ST.gradient,
      transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite,
      alphaMap: m.alphaMap, alphaTest: m.alphaTest,
      emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
      polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor,
    });
    // 金属在卡通里没有反射，提亮一点免得发黑
    if (m.metalness > 0.5 && !m.map) t.color.lerp(new THREE.Color('#e8eef8'), 0.35);
    t.name = m.name;
    if (rimS && !m.transparent) addRim(t, rimS);
    map.set(m, t);
    return t;
  };
  const outlined = [];
  const sph = new THREE.Sphere();
  const visit = (o) => {
    if (skip(o)) return;
    if (o.isMesh && !o.userData.isOutline) {
      if (!o.userData.origMat) o.userData.origMat = o.material;
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
      if (outline && !o.userData.noOutline) outlined.push(o);
    }
    for (const c of o.children.slice()) visit(c);
  };
  visit(root);
  if (outline) {
    for (const o of outlined) {
      const g = o.geometry;
      const type = g.type;
      if (type === 'PlaneGeometry' || type === 'CircleGeometry' || type === 'RingGeometry' || type === 'ShapeGeometry') continue;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m.transparent || !m.isMeshToonMaterial || m.side === THREE.DoubleSide && g.parameters && g.parameters.openEnded)) continue;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sph.copy(g.boundingSphere);
      const s = o.getWorldScale(new THREE.Vector3());
      const r = sph.radius * Math.max(s.x, s.y, s.z);
      if (r < minR || r > maxR) continue;
      addOutline(o, { color: ST.outlineColor, thickness: ST.thickness });
    }
  }
  return map;
}

// 换画风：已经卡通化的角色换一套色带 / 描边 / 边缘光（第三章 → 第四章）
export function restyleToon(root, style = 'anime', { rim = null } = {}) {
  const ST = STYLES[style] || STYLES.toon;
  const r = rim === null ? ST.rim : rim;
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.isOutline) { o.material = outlineMat(ST.outlineColor, ST.thickness); return; }
    for (const m of [].concat(o.material)) {
      if (!m || !m.isMeshToonMaterial || done.has(m)) continue;
      done.add(m);
      m.gradientMap = ST.gradient;
      if (r && !m.transparent) addRim(m, r);
      else if (!r && m.userData.rim) { m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => ''; m.userData.rim = 0; }
      m.needsUpdate = true;
    }
  });
  root.userData.toonStyle = style;
}
// 角色统一入口：没卡通化就卡通化，卡通化过就换画风
export function ensureToonStyle(root, style, opts = {}) {
  if (root.userData.toonStyle === style) return;
  const ST = STYLES[style] || STYLES.toon;
  if (!root.userData.toon) {
    toonifyScene(root, { minR: 0.015, maxR: 1, style, rim: ST.rim, ...opts });
    root.userData.toon = true;
    root.userData.toonStyle = style;
  } else restyleToon(root, style);
}
// 变回写实：换回原来的材质、摘掉描边（结局的征兵报到现场是写实画风）
export function untoonify(root) {
  if (!root.userData.toon) return;
  const outlines = [];
  root.traverse((o) => {
    if (o.userData.isOutline) { outlines.push(o); return; }
    if (o.isMesh && o.userData.origMat) { o.material = o.userData.origMat; delete o.userData.outline; }
  });
  for (const o of outlines) o.parent && o.parent.remove(o);
  root.userData.toon = false;
  root.userData.toonStyle = null;
}
