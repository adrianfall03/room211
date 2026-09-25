// 211 宿舍：按照两段素材视频还原的场景布局
//   坐标：x ∈ [-1.8, 1.8]（西→东），z ∈ [-3.6, 4.5]（北窗 → 南墙），层高 3.0m
//   面朝南墙（洗手间那面）时左东右西：南墙正中间是通往洗手池 / 厕所的白框玻璃门，门右边挂着穿衣镜；
//   宿舍门在右手边那面墙（西墙）的最里头，门框北边紧挨着门边折叠桌。
//   洗手间在南墙背后，可以推门走进去（洗漱台、厕所隔间），后墙的窗外是一棵大树——树上有三只猴子。
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { beginMirror, endMirror } from './mirrorcull.js';
import { Kit } from './kit.js';
import { buildOutside } from './outside.js';
import { LightShafts } from './fx.js';
import * as TX from '../core/textures.js';
import { mulberry32 } from '../core/util.js';

export const ROOM = { minX: -1.8, maxX: 1.8, minZ: -3.6, maxZ: 4.5, H: 3.0 };
const SZ = ROOM.maxZ; // 南墙的室内墙面
const TW = 0.16; // 墙厚
const DOOR = { z0: 3.63, z1: 4.39, h: 2.05 }; // 宿舍门：西墙最里头
const WC = { x0: -0.39, x1: 0.39, h: 2.03, top: 2.62 }; // 洗手间玻璃门：南墙正中间（门扇 + 上方亮子）
const WR = { x0: -1.8, x1: 1.8, z0: SZ + TW, z1: 6.3, h: 2.7 }; // 洗手间（和房间一样宽）
const WW = { x0: -0.45, x1: 0.45, y0: 1.0, y1: 2.42 }; // 洗手间后墙上的窗
const CUB = { x: -0.6, dz0: 4.74, dz1: 5.44 }; // 厕所隔间：隔墙位置 + 隔间门的范围
export const LAYOUT = { ROOM, SZ, TW, DOOR, WC, WR, WW, CUB };
// 书架前地上那三本书的位置 / 姿态（x, y, z, rx, ry, rz, 颜色）：第一章就躺在那儿；第四章彩蛋里，它们正是从书架上被推下来的
export const FALLEN_BOOKS = [
  [-1.18, 0.03, -1.2, 0, 0.5, 0, '#1d3f8a', 0.06],
  [-1.02, 0.028, -0.9, 0, -0.9, 0, '#8a2020', 0.055],
  [-1.32, 0.075, -0.98, 0, 1.9, 0.3, '#2a6a40', 0.065],
];

const UV_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const UV_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec3 lightPos; uniform vec3 lightDir; uniform float cosOuter; uniform float cosInner; uniform float on; uniform float range;
varying vec2 vUv; varying vec3 vWorld;
void main(){
  vec4 c = texture2D(map, vUv);
  vec3 L = vWorld - lightPos; float d = length(L); L /= max(d, 1e-4);
  float spot = smoothstep(cosOuter, cosInner, dot(L, lightDir));
  float att = 1.0 - smoothstep(range * 0.55, range, d);
  float a = c.a * spot * att * on;
  gl_FragColor = vec4(c.rgb * 3.2 * a, a);
}`;

// theme：'normal' 原版 / 'ruin' 几十年后的废弃 211 / 'toon' 卡通动物 211 / 'space' 失重太空舱 211。
//   三个版本共用同一套布局；decorate(ctx) 在布局搭好之后替换材质、增减道具（见 ruin.js / toon.js）
export function buildDorm(scene, T, collision, { faceImg = null, theme = 'normal', decorate = null, outside: outsideFn = null } = {}) {
  RectAreaLightUniformsLib.init();
  const K = new Kit(T);
  const M = K.M;
  const rnd = mulberry32(404);
  const refs = { K, T, theme, interact: {}, occluders: [], camBoxes: [], lights: {}, dyn: {}, mirrors: [], updaters: [] };
  const root = new THREE.Group();
  root.name = 'dorm';
  refs.root = root;
  scene.add(root);
  const add = (o, p = root) => { p.add(o); return o; };
  const mark = (id, o) => {
    refs.interact[id] = o;
    o.traverse((c) => { c.userData.iid = id; });
    return o;
  };
  const occl = (o) => { o.traverse((c) => { if (c.isMesh) refs.occluders.push(c); }); return o; };
  const camBox = (x0, x1, y0, y1, z0, z1) => { const b = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)); refs.camBoxes.push(b); return b; };
  const block = (x0, x1, z0, z1, id = '', h = 0) => { collision.add(x0, x1, z0, z1, id); if (h) camBox(x0, x1, 0, h, z0, z1); };
  const place = (o, x, y, z, ry = 0, p = root) => { o.position.set(x, y, z); o.rotation.y = ry; p.add(o); return o; };
  // 分区记录：某一段代码往 root / 洗手间里加了哪些东西（太空舱要把床、书桌、杂物整片换掉）
  const secs = [], wcSecs = [];
  const section = (name) => secs.push([name, root.children.length]);
  const wcSection = (name) => wcSecs.push([name, refs.wcRoom.children.length]);
  const slices = (list, parent) => { const out = {}; list.forEach(([n, i], k) => { out[n] = parent.children.slice(i, k + 1 < list.length ? list[k + 1][1] : parent.children.length); }); return out; };
  // 把平面的 UV 映射到 [u0,u1]×[v0,v1]（贴图按米平铺时用，拼接处的砖缝能对齐）
  const uvRect = (geo, u0, u1, v0, v1) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); return geo; };

  // ===== UV 显形材质（共享 uniform）=====
  const uvU = {
    lightPos: { value: new THREE.Vector3(0, -10, 0) },
    lightDir: { value: new THREE.Vector3(0, -1, 0) },
    cosOuter: { value: Math.cos(0.36) },
    cosInner: { value: Math.cos(0.2) },
    on: { value: 0 },
    range: { value: 4.5 },
  };
  refs.uvUniforms = uvU;
  const uvMat = (tex) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, ...uvU },
    vertexShader: UV_VERT, fragmentShader: UV_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  // ================= 房间外壳 =================
  const RL = SZ - ROOM.minZ, RC = (SZ + ROOM.minZ) / 2; // 房间长度 / 中心
  const floor = add(K.mesh(uvRect(new THREE.PlaneGeometry(3.6, RL), 0, 1, 0, RL / 7.2), M.floor, { rx: -Math.PI / 2, z: RC, cast: false }));
  occl(floor);
  add(K.mesh(new THREE.PlaneGeometry(3.6, RL), M.floorDirt, { rx: -Math.PI / 2, y: 0.002, z: RC, cast: false }));
  const ceil = add(K.mesh(new THREE.PlaneGeometry(3.6, RL), M.ceiling, { rx: Math.PI / 2, y: 3.0, z: RC, cast: false }));
  occl(ceil);
  const wall = (x0, x1, y0, y1, z0, z1) => {
    const m = K.mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), M.wall, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 });
    K.worldUV(m, 0.5, 1 / 3);
    add(m); occl(m);
    return m;
  };
  // 西墙：最里头留出宿舍门洞，再往南接着洗手间那一段（北边这一大段就在书架背后，第四章的彩蛋要"透"过它）
  refs.westWall = wall(-1.8 - TW, -1.8, 0, 3, -3.6 - TW, DOOR.z0);
  wall(-1.8 - TW, -1.8, DOOR.h, 3, DOOR.z0, DOOR.z1);
  wall(-1.8 - TW, -1.8, 0, 3, DOOR.z1, WR.z1 + TW);
  // 东墙
  wall(1.8, 1.8 + TW, 0, 3, -3.6 - TW, WR.z1 + TW);
  // 北墙（窗）
  wall(-1.8, 1.8, 0, 0.95, -3.6 - TW, -3.6);
  wall(-1.8, 1.8, 2.55, 3, -3.6 - TW, -3.6);
  wall(-1.8, -1.35, 0.95, 2.55, -3.6 - TW, -3.6);
  wall(1.35, 1.8, 0.95, 2.55, -3.6 - TW, -3.6);
  // 南墙：正中间留出洗手间门洞
  wall(-1.8, WC.x0, 0, 3, SZ, SZ + TW);
  wall(WC.x0, WC.x1, WC.top, 3, SZ, SZ + TW);
  wall(WC.x1, 1.8, 0, 3, SZ, SZ + TW);
  // 洗手间后墙：留出窗洞
  wall(-1.8 - TW, WW.x0, 0, 3, WR.z1, WR.z1 + TW);
  wall(WW.x1, 1.8 + TW, 0, 3, WR.z1, WR.z1 + TW);
  wall(WW.x0, WW.x1, 0, WW.y0, WR.z1, WR.z1 + TW);
  wall(WW.x0, WW.x1, WW.y1, 3, WR.z1, WR.z1 + TW);
  // 碰撞：房间 + 洗手间的外圈；南墙只在玻璃门那里有个口子（门关着时另有一块碰撞）
  block(-3, -1.8, -4, 8); block(1.8, 3, -4, 8); block(-3, 3, -5, -3.6); block(-3, 3, WR.z1, 8);
  block(-3, WC.x0, SZ, SZ + TW); block(WC.x1, 3, SZ, SZ + TW);
  camBox(-3, -1.8, 0, 3, -4, 8); camBox(1.8, 3, 0, 3, -4, 8); camBox(-3, 3, 0, 3, -5, -3.6); camBox(-3, 3, 0, 3, WR.z1, 8);
  camBox(-3, WC.x0, 0, 3, SZ, SZ + TW); camBox(WC.x1, 3, 0, 3, SZ, SZ + TW); camBox(WC.x0, WC.x1, WC.h, 3, SZ, SZ + TW);
  camBox(-3, 3, 2.98, 4, -4, SZ + TW); // 房间天花板
  camBox(-3, 3, WR.h - 0.02, 4, SZ, 8); // 洗手间吊顶
  // 门槛
  const sillM = K.std('#c9c6bd', 0.35);
  add(K.mesh(K.box(TW, 0.012, DOOR.z1 - DOOR.z0), sillM, { x: -1.8 - TW / 2, y: 0.006, z: (DOOR.z0 + DOOR.z1) / 2, cast: false }));
  add(K.mesh(K.box(WC.x1 - WC.x0, 0.012, TW), sillM, { x: 0, y: 0.006, z: SZ + TW / 2, cast: false }));
  // 墙上插座
  for (const [x, z, ry] of [[1.79, -0.9, -Math.PI / 2], [1.79, 0.55, -Math.PI / 2], [-1.79, 1.5, Math.PI / 2], [-0.95, SZ - 0.01, Math.PI]]) {
    const s = K.group({ x, y: 0.32, z, ry });
    s.add(K.mesh(K.rbox(0.086, 0.086, 0.01, 0.004), M.plasticWhite, { cast: false }));
    s.add(K.mesh(K.box(0.03, 0.012, 0.003), K.std('#555'), { y: 0.012, z: 0.006, cast: false }));
    add(s);
  }

  // ================= 窗户 + 窗外 =================
  const win = add(K.group({ z: -3.6 }));
  const fw = 0.05;
  win.add(K.mesh(K.box(2.7, fw, 0.08), M.alu, { y: 0.95 + fw / 2 }));
  win.add(K.mesh(K.box(2.7, fw, 0.08), M.alu, { y: 2.55 - fw / 2 }));
  win.add(K.mesh(K.box(fw, 1.6, 0.08), M.alu, { x: -1.35 + fw / 2, y: 1.75 }));
  win.add(K.mesh(K.box(fw, 1.6, 0.08), M.alu, { x: 1.35 - fw / 2, y: 1.75 }));
  win.add(K.mesh(K.box(fw * 0.8, 1.6, 0.06), M.alu, { x: 0.0, y: 1.75, z: 0.012 }));
  win.add(K.mesh(K.box(2.62, 1.5, 0.004), M.glass, { y: 1.75, z: -0.01, cast: false }));
  win.add(K.mesh(K.box(2.8, 0.035, 0.18), K.std('#dcd6ca', 0.5), { y: 0.94, z: 0.07 }));
  const view = K.mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: T.windowView, fog: false }), { y: 1.9, z: -3.2, cast: false, recv: false });
  win.add(view);
  refs.win = win; refs.view = view;
  // 雾气层（哈气显字）
  const fogC = TX.makeCanvas(512, 320);
  const fogTex = TX.toTex(fogC, { wrap: false });
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.12, depthWrite: false });
  const fog = K.mesh(new THREE.PlaneGeometry(2.58, 1.48), fogMat, { y: 1.75, z: 0.012, cast: false, recv: false });
  win.add(fog);
  refs.fog = { canvas: fogC, tex: fogTex, mat: fogMat, mesh: fog };
  refs.glassPane = win.children.find((o) => o.material === M.glass);
  // 拉开窗帘后，阳光斜着照进来的光柱（第一章）
  if (theme === 'normal') {
    const sunDir = new THREE.Vector3(-2.1, -6.5, 10.2).normalize();
    refs.shafts = new LightShafts({ rects: [{ cx: -0.66, cy: 1.75, w: 1.22, h: 1.45 }, { cx: 0.66, cy: 1.75, w: 1.22, h: 1.45 }], planeZ: -3.56, dir: sunDir, length: 4.4, color: '#ffe0a8', intensity: 0.028, slices: 6 });
    add(refs.shafts.group);
  }
  const glassHit = K.mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ visible: false }), { y: 1.75, z: 0.02 });
  win.add(glassHit);
  mark('window', glassHit);

  // ================= 窗帘 =================
  const curtainPanel = (side) => {
    const W = 1.86, H = 2.62;
    const geo = new THREE.PlaneGeometry(W, H, 72, 6);
    const base = geo.attributes.position.array.slice();
    const m = K.mesh(geo, M.curtain, { cast: true, recv: true });
    m.userData = { base, W, H, side };
    add(m);
    return m;
  };
  const cL = curtainPanel(-1), cR = curtainPanel(1);
  const layoutCurtain = (m, f) => {
    const { base, W, side } = m.userData;
    const pos = m.geometry.attributes.position;
    const k = 12;
    const Lf = (1.3 * W) / k, wf = (W * f) / k;
    const a = 0.5 * Math.sqrt(Math.max(0, (Lf / 2) ** 2 - (wf / 2) ** 2)) + 0.004;
    const anchor = side < 0 ? -1.8 : 1.8;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      const u = (bx + W / 2) / W;
      const t = side < 0 ? u : 1 - u;
      const x = anchor - side * t * W * f;
      const yy = by + 1.62;
      const low = Math.max(0, (1.2 - yy)) * 0.02;
      const z = -3.46 + a * Math.sin(t * k * Math.PI * 2) + low * Math.sin(t * 7);
      pos.setXYZ(i, x, yy, z);
    }
    pos.needsUpdate = true;
    m.geometry.computeVertexNormals();
    m.geometry.computeBoundingSphere();
  };
  layoutCurtain(cL, 1); layoutCurtain(cR, 1);
  refs.curtain = { left: cL, right: cR, layout: (f) => { layoutCurtain(cL, f); layoutCurtain(cR, f); }, f: 1 };
  mark('curtain', cL); mark('curtain', cR); refs.interact.curtain = cL;
  occl(cL); occl(cR);
  refs.curtainRod = add(K.mesh(K.cyl(0.013, 0.013, 3.6, 10), M.chrome, { y: 2.94, z: -3.46, rz: Math.PI / 2 }));

  // ================= 宿舍门：西墙最里头（面朝洗手间门时的右手边）+ 自行车锁 =================
  // 合页在南边：门往屋里开，开到头贴着南墙。门扇沿本地 -x 展开（= 世界 -z，朝北），本地 -z 是屋里那一面
  const DW = DOOR.z1 - DOOR.z0 - 0.02, dcz = (DOOR.z0 + DOOR.z1) / 2;
  const doorPivot = add(K.group({ x: -1.8 - 0.025, z: DOOR.z1 - 0.01, ry: -Math.PI / 2 }));
  const slab = K.mesh(K.box(DW, 2.02, 0.045), M.doorWood, { x: -DW / 2, y: 1.01 });
  doorPivot.add(slab);
  doorPivot.add(K.mesh(K.box(DW - 0.18, 0.012, 0.004), K.std('#3a1e12', 0.5), { x: -DW / 2, y: 0.5, z: -0.024, cast: false }));
  const hx = -(DW - 0.08);
  const handle = K.group({ x: hx, y: 1.0, z: -0.028 });
  handle.add(K.mesh(K.cyl(0.028, 0.028, 0.012, 16), M.chrome, { rx: Math.PI / 2 }));
  handle.add(K.mesh(K.rbox(0.13, 0.02, 0.022, 0.008), M.chrome, { x: 0.055, z: -0.03 }));
  handle.add(K.mesh(K.cyl(0.012, 0.012, 0.03, 10), M.chrome, { z: -0.015, rx: Math.PI / 2 }));
  doorPivot.add(handle);
  doorPivot.add(K.mesh(K.cyl(0.018, 0.018, 0.01, 14), M.chrome, { x: hx, y: 1.14, z: -0.026, rx: Math.PI / 2 }));
  doorPivot.add(K.mesh(K.cyl(0.008, 0.008, 0.01, 10), M.chrome, { x: -DW / 2, y: 1.55, z: -0.026, rx: Math.PI / 2 }));
  const roster = K.mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ map: T.roster, roughness: 0.9 }), { x: -DW / 2, y: 1.28, z: -0.0235, ry: Math.PI, cast: false });
  doorPivot.add(roster);
  mark('door', slab);
  mark('roster', roster);
  refs.door = { pivot: doorPivot, slab, base: -Math.PI / 2, openAngle: -1.48, z: dcz };
  const frameM = K.std('#3b2216', 0.5);
  add(K.mesh(K.box(0.2, 2.1, 0.06), frameM, { x: -1.8, y: 1.05, z: DOOR.z0 - 0.03 }));
  add(K.mesh(K.box(0.2, 2.1, 0.06), frameM, { x: -1.8, y: 1.05, z: DOOR.z1 + 0.03 }));
  add(K.mesh(K.box(0.2, 0.06, DOOR.z1 - DOOR.z0 + 0.12), frameM, { x: -1.8, y: 2.08, z: dcz }));
  // 门缝漏光（走廊的灯）
  const gapMat = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
  add(K.mesh(new THREE.PlaneGeometry(DW + 0.02, 0.012), gapMat, { x: -1.802, y: 0.006, z: dcz, ry: Math.PI / 2, cast: false, recv: false }));
  const glowC = TX.makeCanvas(64, 64), gctx = glowC.getContext('2d');
  const gg = gctx.createLinearGradient(0, 0, 0, 64);
  gg.addColorStop(0, 'rgba(255,240,210,0.55)'); gg.addColorStop(1, 'rgba(255,240,210,0)');
  gctx.fillStyle = gg; gctx.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.MeshBasicMaterial({ map: TX.toTex(glowC, { wrap: false }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  add(K.mesh(new THREE.PlaneGeometry(DW + 0.1, 0.45), glowMat, { x: -1.8 + 0.225, y: 0.004, z: dcz, rx: -Math.PI / 2, rz: Math.PI / 2, cast: false, recv: false }));

  // 自行车锁（橙色钢缆）：一头绕着门把手，另一头拴在门边折叠桌的铁桌腿上
  const lockG = add(K.group());
  const cablePts = [
    [-1.772, 1.03, 3.76], [-1.755, 0.985, 3.735], [-1.735, 0.93, 3.7], [-1.68, 0.82, 3.66], [-1.6, 0.66, 3.61],
    [-1.5, 0.5, 3.57], [-1.43, 0.37, 3.54], [-1.37, 0.33, 3.55], [-1.352, 0.31, 3.505], [-1.395, 0.29, 3.48], [-1.435, 0.32, 3.51],
    [-1.49, 0.44, 3.585], [-1.57, 0.6, 3.64], [-1.66, 0.78, 3.7], [-1.73, 0.92, 3.745], [-1.765, 0.99, 3.775], [-1.778, 1.035, 3.77],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  lockG.add(K.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts), 140, 0.0075, 8), K.std('#e2522b', 0.45)));
  const lockBody = K.group({ x: -1.56, y: 0.6, z: 3.63, ry: 1.2 });
  lockBody.add(K.mesh(K.rbox(0.05, 0.14, 0.05, 0.012), K.std('#141414', 0.35, 0.3)));
  for (let i = 0; i < 4; i++) lockBody.add(K.mesh(K.cyl(0.018, 0.018, 0.018, 12), K.std('#c8c8c8', 0.3, 0.9), { y: 0.045 - i * 0.03, z: 0.02 }));
  lockG.add(lockBody);
  mark('door', lockG);
  refs.lock = { group: lockG, body: lockBody, curve: new THREE.CatmullRomCurve3(cablePts) };
  collision.add(-1.8, -1.52, 3.6, 3.82, 'lockCable');
  const droppedLock = add(K.group({ visible: false }));
  const coil = [];
  for (let i = 0; i <= 40; i++) { const a = i * 0.45; coil.push(new THREE.Vector3(-1.22 + Math.cos(a) * 0.12, 0.01 + i * 0.0008, 3.5 + Math.sin(a) * 0.09)); }
  droppedLock.add(K.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 120, 0.0075, 8), K.std('#e2522b', 0.45)));
  droppedLock.visible = false;
  refs.lock.dropped = droppedLock;

  // ================= 穿衣镜（真实反射）=================
  // 同一时间只渲染一层反射；低画质、覆盖材质的 pass（GTAO / 描边）或不在可见区域时用普通反光材质代替
  const mirrorFake = new THREE.MeshStandardMaterial({ color: '#c9d0d4', metalness: 1, roughness: 0.06 });
  let reflecting = false;
  const culled = [];
  const makeMirror = (w, h, cfg = {}) => {
    const m = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 768, textureHeight: 768, color: 0xb4b4b4, clipBias: 0.003, multisample: 0 });
    const refl = m.material, reflect = m.onBeforeRender;
    const c = { mesh: m, enabled: () => true, inZone: null, maxDist: 4.2, pre: null, post: null, ...cfg };
    refs.mirrors.push(c);
    m.onBeforeRender = function (renderer, scn, cam, ...rest) {
      if (reflecting) return;
      const on = c.enabled(cam);
      this.material = on ? refl : mirrorFake;
      if (!on || scn.overrideMaterial) return;
      const st0 = c.pre ? c.pre() : null;
      reflecting = true;
      // 只画镜子里看得见的那一块（见 mirrorcull.js）
      beginMirror(this, cam, scn, culled);
      try { reflect.call(this, renderer, scn, cam, ...rest); } finally { endMirror(culled); reflecting = false; }
      if (c.post) c.post(st0);
    };
    return m;
  };
  // 南墙上、玻璃门右边（西边）
  const mw = 0.24, mh = 1.4;
  const mirrorG = add(K.group({ x: -0.67, y: 0.25 + mh / 2, z: SZ }));
  mirrorG.add(K.mesh(K.box(mw + 0.03, mh + 0.03, 0.022), K.std('#f4f3ee', 0.4), { z: -0.011 }));
  const mirror = makeMirror(mw - 0.012, mh - 0.012);
  mirror.position.z = -0.0235;
  mirror.rotation.y = Math.PI;
  mirrorG.add(mirror);
  mark('mirror', mirrorG);
  refs.mirrorG = mirrorG; refs.mirror = mirror;

  // ================= 洗手间白框玻璃门（南墙正中间，能推开走进去）=================
  const wcw = WC.x1 - WC.x0;
  const whiteF = K.std('#f1efe9', 0.35, 0.05);
  const doorGlass = new THREE.MeshStandardMaterial({ color: '#e2eef2', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const frostGlass = new THREE.MeshStandardMaterial({ color: '#eef3f2', transparent: true, opacity: 0.74, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide, emissive: '#f6efe0', emissiveIntensity: 0.12 });
  const wcDoor = add(K.group({ name: 'wcDoor' }));
  // 门套（屋里、洗手间两面都有）
  for (const z of [SZ - 0.01, SZ + TW + 0.01]) {
    wcDoor.add(K.mesh(K.box(0.05, WC.top + 0.05, 0.04), whiteF, { x: WC.x0 - 0.025, y: (WC.top + 0.05) / 2, z }));
    wcDoor.add(K.mesh(K.box(0.05, WC.top + 0.05, 0.04), whiteF, { x: WC.x1 + 0.025, y: (WC.top + 0.05) / 2, z }));
    wcDoor.add(K.mesh(K.box(wcw + 0.1, 0.05, 0.04), whiteF, { x: 0, y: WC.top + 0.025, z }));
  }
  // 门扇：合页在东边，往洗手间里开；上半截清玻璃、下半截磨砂，把手在西边（两面都有）
  const lw = wcw - 0.02, lh = WC.h, st = 0.055, lz = SZ + 0.05;
  const leaf = K.group({ x: WC.x1 - 0.01, z: lz });
  leaf.add(K.mesh(K.box(st, lh, 0.04), whiteF, { x: -lw + st / 2, y: lh / 2 }));
  leaf.add(K.mesh(K.box(st, lh, 0.04), whiteF, { x: -st / 2, y: lh / 2 }));
  leaf.add(K.mesh(K.box(lw - 2 * st, 0.07, 0.04), whiteF, { x: -lw / 2, y: lh - 0.035 }));
  leaf.add(K.mesh(K.box(lw - 2 * st, 0.07, 0.04), whiteF, { x: -lw / 2, y: 0.93 }));
  leaf.add(K.mesh(K.box(lw - 2 * st, 0.13, 0.04), whiteF, { x: -lw / 2, y: 0.065 }));
  leaf.add(K.mesh(new THREE.PlaneGeometry(lw - 2 * st, lh - 1.035), doorGlass, { x: -lw / 2, y: (0.965 + lh - 0.07) / 2, cast: false, recv: false }));
  leaf.add(K.mesh(new THREE.PlaneGeometry(lw - 2 * st, 0.765), frostGlass, { x: -lw / 2, y: 0.5125, cast: false, recv: false }));
  for (const s of [-1, 1]) {
    const wch = K.group({ x: -lw + 0.075, y: 1.0, z: s * 0.022 });
    wch.add(K.mesh(K.cyl(0.024, 0.024, 0.012, 14), M.chrome, { rx: Math.PI / 2 }));
    wch.add(K.mesh(K.rbox(0.11, 0.018, 0.02, 0.007), M.chrome, { x: 0.048, z: s * 0.02 }));
    leaf.add(wch);
  }
  wcDoor.add(leaf);
  // 门上的亮子
  wcDoor.add(K.mesh(K.box(wcw, 0.07, 0.05), whiteF, { x: 0, y: lh + 0.035, z: lz }));
  wcDoor.add(K.mesh(K.box(wcw, 0.05, 0.05), whiteF, { x: 0, y: WC.top - 0.025, z: lz }));
  wcDoor.add(K.mesh(new THREE.PlaneGeometry(wcw - 0.02, WC.top - lh - 0.12), doorGlass, { x: 0, y: (lh + 0.07 + WC.top - 0.05) / 2, z: lz, cast: false, recv: false }));
  mark('wcDoor', wcDoor);
  collision.add(WC.x0, WC.x1, SZ, SZ + TW, 'wcShut');
  collision.add(WC.x1 - 0.1, WC.x1 + 0.02, SZ + 0.12, lz + lw, 'wcOpen');
  collision.setEnabled('wcOpen', false);
  const wcCam = camBox(WC.x0, WC.x1, 0, WC.h, SZ, SZ + TW);
  refs.wcDoor = { pivot: leaf, group: wcDoor, open: false, openAngle: 1.5, camBox: wcCam, closedBox: wcCam.clone(), glass: [doorGlass, frostGlass] };

  // ================= 洗手间（南墙背后，可以走进去）=================
  const wcRoom = add(K.group({ name: 'washroom' }));
  refs.wcRoom = wcRoom;
  const wcx = (WR.x0 + WR.x1) / 2, wcz = (WR.z0 + WR.z1) / 2, tileH = 1.6;
  // 有真灯照着；材质只留一点自发光，让隔间角落不至于死黑
  const lit = (o, k) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o, emissive: o.map ? '#fff3de' : o.color, emissiveMap: o.map || null, emissiveIntensity: k });
  const wTile = lit({ map: TX.genTiles({ n: 4, base: '#eeede7', seed: 7 }), roughness: 0.22 }, 0.1); // 1m 一张贴图 → 25cm 墙砖
  const wPaint = lit({ color: '#ebe5c6', roughness: 0.9 }, 0.08); // 视频里洗手间上半截墙是淡黄色的
  const wFloor = lit({ map: TX.genTiles({ n: 2, base: '#b9b5ab', grout: '#8b8880', gap: 4, jitter: 14, seed: 9, speck: 500 }), roughness: 0.55 }, 0.06); // 0.6m 一张 → 30cm 地砖
  const wCeil = lit({ map: TX.genStripCeiling(), roughness: 0.35, metalness: 0.3 }, 0.12); // 铝扣板吊顶
  wcRoom.add(K.mesh(uvRect(new THREE.PlaneGeometry(WR.x1 - WR.x0, WR.z1 - SZ), WR.x0 / 0.6, WR.x1 / 0.6, 0, (WR.z1 - SZ) / 0.6), wFloor, { x: wcx, y: 0.001, z: (SZ + WR.z1) / 2, rx: -Math.PI / 2, cast: false }));
  wcRoom.add(K.mesh(uvRect(new THREE.PlaneGeometry(WR.x1 - WR.x0, WR.z1 - WR.z0), 0, 4.5, 0, 2), wCeil, { x: wcx, y: WR.h, z: wcz, rx: Math.PI / 2, cast: false }));
  // 墙面：1.6m 以下贴白砖，上面刷淡黄漆。at(u) 把墙面横坐标 u 换成世界 (x, z)
  const wcPanel = (at, ry, u0, u1, y0, y1) => {
    for (const [a, b, mat] of [[y0, Math.min(y1, tileH), wTile], [Math.max(y0, tileH), y1, wPaint]]) {
      if (b - a < 0.001) continue;
      const geo = new THREE.PlaneGeometry(u1 - u0, b - a);
      if (mat === wTile) uvRect(geo, u0, u1, a, b);
      const [x, z] = at((u0 + u1) / 2);
      wcRoom.add(K.mesh(geo, mat, { x, y: (a + b) / 2, z, ry, cast: false }));
    }
  };
  const backAt = (u) => [-u, WR.z1 - 0.002];
  wcPanel(backAt, Math.PI, -WW.x0, -WR.x0, 0, WR.h); // x ∈ [-1.8, -0.45]
  wcPanel(backAt, Math.PI, -WR.x1, -WW.x1, 0, WR.h); // x ∈ [0.45, 1.8]
  wcPanel(backAt, Math.PI, -WW.x1, -WW.x0, 0, WW.y0);
  wcPanel(backAt, Math.PI, -WW.x1, -WW.x0, WW.y1, WR.h);
  wcPanel((u) => [WR.x0 + 0.002, -u], Math.PI / 2, -WR.z1, -WR.z0, 0, WR.h);
  wcPanel((u) => [WR.x1 - 0.002, u], -Math.PI / 2, WR.z0, WR.z1, 0, WR.h);
  const frontAt = (u) => [u, WR.z0 + 0.002];
  wcPanel(frontAt, 0, WR.x0, WC.x0 - 0.05, 0, WR.h);
  wcPanel(frontAt, 0, WC.x1 + 0.05, WR.x1, 0, WR.h);
  wcPanel(frontAt, 0, WC.x0 - 0.05, WC.x1 + 0.05, WC.top + 0.05, WR.h);
  // 吸顶灯 + 真正的灯（阴影只烘一次，开关门时再更新）
  wcRoom.add(K.mesh(K.cyl(0.15, 0.16, 0.04, 24), M.plasticWhite, { x: 0, y: WR.h - 0.02, z: wcz, cast: false }));
  wcRoom.add(K.mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: '#fff6e4' }), { x: 0, y: WR.h - 0.041, z: wcz, rx: Math.PI / 2, cast: false, recv: false }));
  const wcSpot = new THREE.SpotLight('#fff0d8', 8, 7.5, 1.05, 0.6, 2);
  wcSpot.position.set(0, WR.h - 0.08, wcz);
  wcSpot.target.position.set(0, 0, wcz - 0.25);
  wcSpot.castShadow = true;
  wcSpot.shadow.mapSize.set(1024, 1024);
  wcSpot.shadow.bias = -0.0008; wcSpot.shadow.normalBias = 0.02; wcSpot.shadow.radius = 3;
  wcSpot.shadow.camera.near = 0.15; wcSpot.shadow.camera.far = 8;
  wcSpot.userData.staticShadow = true;
  add(wcSpot); add(wcSpot.target);
  refs.lights.wc = wcSpot;

  // ---- 后墙的窗：黄色铁窗框 + 推拉窗（东边那扇推到了一起，西半边开着）+ 窗外的防盗栏杆 ----
  const yF = lit({ color: '#d7ab38', roughness: 0.5, metalness: 0.1 }, 0.1);
  const winGlass = new THREE.MeshStandardMaterial({ color: '#dcebf0', transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const wz = WR.z1 + 0.05, wxc = (WW.x0 + WW.x1) / 2, wwid = WW.x1 - WW.x0, tb = 2.04;
  const wcWin = K.group({ name: 'wcWindow' });
  wcWin.add(K.mesh(K.box(0.04, WW.y1 - WW.y0, 0.05), yF, { x: WW.x0 + 0.02, y: (WW.y0 + WW.y1) / 2, z: wz }));
  wcWin.add(K.mesh(K.box(0.04, WW.y1 - WW.y0, 0.05), yF, { x: WW.x1 - 0.02, y: (WW.y0 + WW.y1) / 2, z: wz }));
  for (const y of [WW.y0 + 0.02, tb, WW.y1 - 0.02]) wcWin.add(K.mesh(K.box(wwid, 0.04, 0.05), yF, { x: wxc, y, z: wz }));
  wcWin.add(K.mesh(K.box(0.03, WW.y1 - tb, 0.04), yF, { x: wxc, y: (tb + WW.y1) / 2, z: wz }));
  wcWin.add(K.mesh(new THREE.PlaneGeometry(wwid - 0.06, WW.y1 - tb - 0.06), winGlass, { x: wxc, y: (tb + WW.y1) / 2, z: wz, cast: false }));
  const sashW = wwid / 2 - 0.02, sashH = tb - WW.y0 - 0.06;
  for (const [dx, dz] of [[0.012, -0.018], [0.0, 0.012]]) {
    const s = K.group({ x: wxc + sashW / 2 + 0.01 + dx, y: (WW.y0 + tb) / 2, z: wz + dz });
    for (const sx of [-1, 1]) s.add(K.mesh(K.box(0.028, sashH, 0.025), yF, { x: sx * (sashW / 2 - 0.014) }));
    for (const sy of [-1, 1]) s.add(K.mesh(K.box(sashW, 0.028, 0.025), yF, { y: sy * (sashH / 2 - 0.014) }));
    s.add(K.mesh(new THREE.PlaneGeometry(sashW - 0.05, sashH - 0.05), winGlass, { cast: false }));
    wcWin.add(s);
  }
  const barM = K.std('#3a3935', 0.45, 0.6);
  for (let x = WW.x0 + 0.07; x < WW.x1 - 0.03; x += 0.1) wcWin.add(K.mesh(K.cyl(0.008, 0.008, WW.y1 - WW.y0, 8), barM, { x, y: (WW.y0 + WW.y1) / 2, z: WR.z1 + TW - 0.02, cast: false }));
  for (const y of [1.35, 1.95]) wcWin.add(K.mesh(K.box(wwid, 0.025, 0.008), barM, { x: wxc, y, z: WR.z1 + TW - 0.03, cast: false }));
  wcWin.add(K.mesh(K.box(wwid + 0.08, 0.03, 0.15), wTile, { x: wxc, y: WW.y0 - 0.015, z: WR.z1 + 0.03 }));
  const winHit = K.mesh(new THREE.PlaneGeometry(wwid, WW.y1 - WW.y0), new THREE.MeshBasicMaterial({ visible: false }), { x: wxc, y: (WW.y0 + WW.y1) / 2, z: WR.z1 + 0.01, ry: Math.PI });
  wcWin.add(winHit);
  wcRoom.add(wcWin);
  mark('wcWindow', wcWin);
  refs.wcWin = wcWin;

  wcSection('sink');
  // ---- 洗漱台（后墙东半边）：瓷砖台面、两个白瓷盆、龙头、镜子、牙杯 ----
  const sx0 = 0.55, sx1 = WR.x1 - 0.02, sxc = (sx0 + sx1) / 2, sz = WR.z1 - 0.26, sTop = 0.82;
  const ceramic = lit({ color: '#f5f5f2', roughness: 0.12 }, 0.08);
  const sink = K.group({ name: 'sink' });
  // 台面：挖两个椭圆洞放脸盆
  const topShape = new THREE.Shape();
  const cw = sx1 - sx0, cd = 0.52;
  topShape.moveTo(-cw / 2, -cd / 2); topShape.lineTo(cw / 2, -cd / 2); topShape.lineTo(cw / 2, cd / 2); topShape.lineTo(-cw / 2, cd / 2); topShape.lineTo(-cw / 2, -cd / 2);
  for (const bx of [-0.3, 0.3]) { const h = new THREE.Path(); h.absellipse(bx, -0.02, 0.17, 0.12, 0, Math.PI * 2, true); topShape.holes.push(h); }
  const topGeo = new THREE.ExtrudeGeometry(topShape, { depth: 0.06, bevelEnabled: false, curveSegments: 28 });
  topGeo.rotateX(-Math.PI / 2);
  sink.add(K.mesh(topGeo, ceramic, { x: sxc, y: sTop - 0.06, z: sz }));
  sink.add(K.mesh(K.box(sx1 - sx0, 0.16, 0.025), wTile, { x: sxc, y: sTop - 0.12, z: sz - 0.25 }));
  for (const x of [sx0 + 0.05, sxc, sx1 - 0.05]) sink.add(K.mesh(K.box(0.07, sTop - 0.2, 0.46), wTile, { x, y: (sTop - 0.2) / 2, z: sz }));
  const streams = [];
  for (const bx of [sxc - 0.3, sxc + 0.3]) {
    const bg = K.group({ x: bx, y: sTop + 0.002, z: sz + 0.02 });
    bg.add(K.mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.13, 28, 1, true), lit({ color: '#f7f7f4', roughness: 0.1, side: THREE.DoubleSide }, 0.08), { y: -0.065, s: [1, 1, 0.72], cast: false }));
    bg.add(K.mesh(new THREE.CircleGeometry(0.13, 24), ceramic, { y: -0.128, rx: -Math.PI / 2, s: [1, 0.72, 1], cast: false }));
    bg.add(K.mesh(K.cyl(0.02, 0.02, 0.004, 12), M.chrome, { y: -0.126, cast: false }));
    sink.add(bg);
    const tap = K.group({ x: bx, y: sTop, z: WR.z1 - 0.07 });
    tap.add(K.mesh(K.cyl(0.014, 0.018, 0.17, 12), M.chrome, { y: 0.085, cast: false }));
    tap.add(K.mesh(K.cyl(0.011, 0.011, 0.13, 10), M.chrome, { y: 0.16, z: -0.06, rx: Math.PI / 2, cast: false }));
    tap.add(K.mesh(K.rbox(0.07, 0.014, 0.02, 0.006), M.chrome, { y: 0.19, z: 0.02, cast: false }));
    sink.add(tap);
    const water = K.mesh(K.cyl(0.006, 0.009, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.55, roughness: 0.05, emissive: '#9fc8ee', emissiveIntensity: 0.25 }), { x: bx, y: sTop + 0.05, z: WR.z1 - 0.19, cast: false, recv: false });
    water.visible = false;
    sink.add(water); streams.push(water);
  }
  sink.add(K.mesh(K.rbox(0.16, 0.035, 0.045, 0.012), K.std('#f2f2f2', 0.4), { x: sx1 - 0.12, y: sTop + 0.018, z: sz - 0.12, ry: 0.4, cast: false }));
  const shampoo = K.bottle({ h: 0.2, r: 0.035, label: null, cap: '#2a6fd8', mat: K.std('#f0d45a', 0.35) });
  shampoo.position.set(sx0 + 0.1, sTop, sz + 0.1); sink.add(shampoo);
  wcRoom.add(sink);
  mark('sink', sink);
  occl(sink);
  refs.sink = { streams, group: sink, top: sTop, x0: sx0, x1: sx1 };
  block(sx0, WR.x1, WR.z1 - 0.54, WR.z1, '', sTop + 0.04);
  // 洗漱台上方的镜子（只在人进了洗手间时才算真反射）
  const wcMirror = makeMirror(1.1, 0.56, { inZone: (cam) => cam.position.z > SZ + 0.05 });
  wcMirror.position.set(sxc, 1.48, WR.z1 - 0.016); wcMirror.rotation.y = Math.PI;
  wcRoom.add(wcMirror);
  wcRoom.add(K.mesh(K.box(1.14, 0.6, 0.012), K.std('#d9dde0', 0.3, 0.6), { x: sxc, y: 1.48, z: WR.z1 - 0.008, cast: false }));
  mark('wcMirror', wcMirror);
  refs.wcMirror = wcMirror;
  wcRoom.add(K.mesh(K.box(1.1, 0.012, 0.11), doorGlass, { x: sxc, y: 1.16, z: WR.z1 - 0.06, cast: false }));
  [['#e24b4b', '#3a8ee8'], ['#3a8ee8', '#f2c230'], ['#57b86a', '#e24b4b'], ['#f2efe6', '#57b86a']].forEach(([cc, bc], i) => {
    const cup = K.cup(cc);
    cup.position.set(sxc - 0.36 + i * 0.24, 1.166, WR.z1 - 0.06);
    cup.add(K.mesh(K.box(0.008, 0.17, 0.006), K.std(bc, 0.4), { x: 0.01, y: 0.1, rz: 0.18, cast: false }));
    cup.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    wcRoom.add(cup);
  });
  const saveC = TX.makeCanvas(256, 96), sv = saveC.getContext('2d');
  sv.fillStyle = '#1f7a4d'; sv.fillRect(0, 0, 256, 96); sv.fillStyle = '#fff'; sv.font = 'bold 46px "PingFang SC",sans-serif'; sv.textAlign = 'center'; sv.fillText('节约用水', 128, 64);
  wcRoom.add(K.mesh(new THREE.PlaneGeometry(0.28, 0.105), new THREE.MeshBasicMaterial({ map: TX.toTex(saveC, { wrap: false }) }), { x: sxc, y: 1.94, z: WR.z1 - 0.006, ry: Math.PI, cast: false, recv: false }));

  wcSection('cubicle');
  // ---- 厕所隔间（西边）：隔墙 + 往里开的隔间门 + 蹲坑、水箱、花洒、纸巾、涂鸦 ----
  const cubM = lit({ color: '#c3ced6', roughness: 0.45 }, 0.08);
  const cubWalls = K.group();
  cubWalls.add(K.mesh(K.box(0.04, 2.05, CUB.dz0 - WR.z0), cubM, { x: CUB.x, y: 1.025, z: (WR.z0 + CUB.dz0) / 2 }));
  cubWalls.add(K.mesh(K.box(0.04, 2.05, WR.z1 - CUB.dz1), cubM, { x: CUB.x, y: 1.025, z: (CUB.dz1 + WR.z1) / 2 }));
  cubWalls.add(K.mesh(K.box(0.04, 0.05, CUB.dz1 - CUB.dz0), cubM, { x: CUB.x, y: 2.025, z: (CUB.dz0 + CUB.dz1) / 2 }));
  wcRoom.add(cubWalls); occl(cubWalls);
  block(CUB.x - 0.03, CUB.x + 0.03, WR.z0, CUB.dz0, '', 2.05);
  block(CUB.x - 0.03, CUB.x + 0.03, CUB.dz1, WR.z1, '', 2.05);
  // 隔间门：合页在北边，本地 +x = 世界 +z，本地 -z 是洗手间那一面
  const cdw = CUB.dz1 - CUB.dz0 - 0.01;
  const cubDoor = K.group({ x: CUB.x, z: CUB.dz0 + 0.005, ry: -Math.PI / 2 });
  cubDoor.add(K.mesh(K.box(cdw, 1.85, 0.035), cubM, { x: cdw / 2, y: 1.02 }));
  for (let k = 0; k < 5; k++) cubDoor.add(K.mesh(K.box(cdw * 0.55, 0.012, 0.04), K.std('#8e9aa3', 0.5), { x: cdw / 2, y: 0.25 + k * 0.035, cast: false }));
  for (const s of [-1, 1]) {
    cubDoor.add(K.mesh(K.rbox(0.06, 0.03, 0.03, 0.008), M.chrome, { x: cdw - 0.07, y: 1.02, z: s * 0.03, cast: false }));
    cubDoor.add(K.mesh(K.box(0.05, 0.022, 0.004), K.std('#3fae5a', 0.4, 0, { emissive: '#3fae5a', emissiveIntensity: 0.4 }), { x: cdw - 0.07, y: 1.09, z: s * 0.02, cast: false }));
  }
  wcRoom.add(cubDoor);
  mark('cubDoor', cubDoor);
  collision.add(CUB.x - 0.03, CUB.x + 0.03, CUB.dz0, CUB.dz1, 'cubShut');
  collision.add(CUB.x - cdw - 0.02, CUB.x, CUB.dz0 - 0.03, CUB.dz0 + 0.1, 'cubOpen');
  collision.setEnabled('cubOpen', false);
  const cubCam = camBox(CUB.x - 0.03, CUB.x + 0.03, 0, 1.95, CUB.dz0, CUB.dz1);
  refs.cubDoor = { pivot: cubDoor, open: false, base: -Math.PI / 2, openAngle: -1.45, camBox: cubCam, closedBox: cubCam.clone() };
  wcSection('toilet');
  // 蹲坑
  const pan = K.group({ x: -1.2, z: 5.72 });
  pan.add(K.mesh(K.rbox(0.44, 0.03, 0.64, 0.014, 3), ceramic, { y: 0.012, cast: false }));
  pan.add(K.mesh(new THREE.CircleGeometry(0.15, 28), K.std('#7d8488', 0.2), { y: 0.029, z: 0.04, rx: -Math.PI / 2, s: [1, 1.55, 1], cast: false }));
  pan.add(K.mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), ceramic, { y: 0.02, z: -0.26, s: [1, 0.5, 0.55], cast: false }));
  wcRoom.add(pan);
  // 高位水箱 + 拉绳
  const tank = K.group({ x: WR.x0 + 0.1, y: 1.86, z: 5.72 });
  tank.add(K.mesh(K.rbox(0.16, 0.26, 0.42, 0.02), K.std('#f2f2ef', 0.3), {}));
  tank.add(K.mesh(K.cyl(0.018, 0.018, 1.72, 10), K.std('#e8e8e4', 0.35), { x: 0.02, y: -0.99, z: -0.12, cast: false }));
  tank.add(K.mesh(K.cyl(0.004, 0.004, 0.5, 6), K.std('#dddddd', 0.6), { x: 0.09, y: -0.36, z: 0.12, cast: false }));
  tank.add(K.mesh(K.sph(0.022, 12, 10), K.std('#e84a3a', 0.4), { x: 0.09, y: -0.62, z: 0.12, cast: false }));
  wcRoom.add(tank);
  mark('toilet', tank); mark('toilet', pan); refs.interact.toilet = pan;
  // 花洒
  const shower = K.group({ x: WR.x0 + 0.03, z: 6.1 });
  shower.add(K.mesh(K.cyl(0.012, 0.012, 1.0, 10), M.chrome, { x: 0.02, y: 1.55, cast: false }));
  shower.add(K.mesh(K.cyl(0.012, 0.012, 0.22, 10), M.chrome, { x: 0.12, y: 2.05, rz: Math.PI / 2, cast: false }));
  shower.add(K.mesh(K.cyl(0.07, 0.05, 0.03, 20), M.chrome, { x: 0.24, y: 2.02, rz: -0.35, cast: false }));
  shower.add(K.mesh(K.rbox(0.1, 0.1, 0.06, 0.02), M.chrome, { x: 0.04, y: 1.1, cast: false }));
  wcRoom.add(shower);
  mark('shower', shower);
  // 纸巾架 + 小垃圾桶 + 隔板涂鸦
  wcRoom.add(K.mesh(K.cyl(0.055, 0.055, 0.1, 16), K.std('#f7f6f1', 0.9), { x: CUB.x - 0.08, y: 0.72, z: 5.95, rx: Math.PI / 2, cast: false }));
  wcRoom.add(K.mesh(K.box(0.03, 0.03, 0.14), M.chrome, { x: CUB.x - 0.035, y: 0.78, z: 5.95, cast: false }));
  const cubBin = K.trashCan(); cubBin.scale.setScalar(0.75); place(cubBin, CUB.x - 0.22, 0, 6.12, 0, wcRoom);
  cubBin.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  const graf = K.mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: TX.genGraffiti(), transparent: true, roughness: 0.8, depthWrite: false }), { x: CUB.x - 0.022, y: 1.38, z: 5.88, ry: -Math.PI / 2, cast: false });
  wcRoom.add(graf);
  mark('graffiti', graf);
  wcSection('wcMisc');
  // 靠门这边：晾毛巾的绳子、水桶拖把、蓝色脸盆、地漏
  wcRoom.add(K.mesh(K.cyl(0.004, 0.004, 1.3, 6), K.std('#dddddd', 0.6), { x: 1.12, y: 2.3, z: 4.95, rz: Math.PI / 2, cast: false }));
  const towels = K.group();
  [['#4f86d6', 0.62], ['#e89ab0', 0.92], ['#f1ede2', 1.22], ['#57b86a', 1.52]].forEach(([c, x], i) => {
    const g = new THREE.PlaneGeometry(0.24, 0.5, 4, 8);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getY(k) * 9 + i) * 0.012);
    g.computeVertexNormals();
    towels.add(K.mesh(g, lit({ color: c, roughness: 0.95, side: THREE.DoubleSide }, 0.06), { x, y: 2.05, z: 4.95, cast: false }));
  });
  wcRoom.add(towels);
  mark('towels', towels);
  const bucket = K.group({ x: 1.58, z: 5.15 });
  bucket.add(K.mesh(K.cyl(0.14, 0.11, 0.3, 20, true), lit({ color: '#d63a32', roughness: 0.5, side: THREE.DoubleSide }, 0.06), { y: 0.15 }));
  bucket.add(K.mesh(K.cyl(0.11, 0.11, 0.008, 20), K.std('#b52e28', 0.5), { y: 0.004 }));
  const mop = K.group({ x: 0.05, z: 0.12, rz: -0.12, rx: 0.1 });
  mop.add(K.mesh(K.cyl(0.012, 0.012, 1.3, 8), K.std('#6b8fb0', 0.4), { y: 0.75 }));
  mop.add(K.mesh(K.cyl(0.09, 0.13, 0.12, 12), K.std('#9a968c', 1), { y: 0.06 }));
  bucket.add(mop);
  wcRoom.add(bucket);
  mark('wcBucket', bucket);
  block(1.42, WR.x1, 4.98, 5.34);
  const wcBasin = K.group({ x: 0.88, z: 5.97 }); // 塞在洗漱台底下
  wcBasin.add(K.mesh(K.cyl(0.19, 0.15, 0.1, 24, true), lit({ color: '#63b6e6', roughness: 0.4, side: THREE.DoubleSide }, 0.06), { y: 0.05, cast: false }));
  wcBasin.add(K.mesh(K.cyl(0.15, 0.15, 0.006, 24), K.std('#4ea2d6', 0.4), { y: 0.003, cast: false }));
  wcRoom.add(wcBasin);
  wcRoom.add(K.mesh(K.box(0.12, 0.004, 0.12), K.std('#8f9296', 0.3, 0.8), { x: 0.1, y: 0.003, z: 5.95, cast: false }));

  // ================= 窗外：楼下草地、大树、三只猴子（彩蛋）=================
  const outside = (outsideFn || buildOutside)({ ground: -3.3, theme });
  add(outside.group);
  refs.outside = outside;

  // ================= 门外：西侧走廊（开门后可见）=================
  const corridor = add(K.group({ name: 'corridor' }));
  refs.corridor = corridor;
  const CX0 = -4.4, CX1 = -1.8 - TW, CZ0 = -4.2, CZ1 = WR.z1, CY = 2.9, ccx = (CX0 + CX1) / 2;
  const cfm = M.floor.clone();
  cfm.map = M.floor.map.clone(); cfm.map.repeat.set(1, 1); cfm.map.needsUpdate = true;
  cfm.normalMap = null; cfm.roughnessMap = null; cfm.roughness = 0.35;
  const cfl = K.mesh(new THREE.PlaneGeometry(CX1 - CX0, CZ1 - CZ0), cfm, { x: ccx, z: (CZ0 + CZ1) / 2, rx: -Math.PI / 2, cast: false });
  K.worldUV(cfl, 1 / 1.2); corridor.add(cfl);
  corridor.add(K.mesh(new THREE.PlaneGeometry(CX1 - CX0, CZ1 - CZ0), K.std('#f2f2ee', 0.9), { x: ccx, y: CY, z: (CZ0 + CZ1) / 2, rx: Math.PI / 2, cast: false }));
  wall(CX0 - TW, CX0, 0, 3, CZ0, CZ1 + TW); // 对面的墙
  wall(CX0 - TW, CX1, 0, 3, CZ1, CZ1 + TW); // 南头
  wall(CX0 - TW, -1.8, 0, 3, CZ0 - TW, CZ0); // 北头
  wall(CX1, -1.8, 0, 3, CZ0, -3.6 - TW);
  // 正对着的 212 宿舍门
  const d212 = K.group({ x: CX0 + 0.03, z: dcz, ry: Math.PI / 2 });
  d212.add(K.mesh(K.box(0.9, 2.04, 0.045), M.doorWood, { y: 1.02 }));
  d212.add(K.mesh(K.box(1.02, 2.1, 0.03), frameM, { y: 1.05, z: -0.02 }));
  d212.add(K.mesh(K.cyl(0.028, 0.028, 0.012, 16), M.chrome, { x: -0.36, y: 1.0, z: 0.03, rx: Math.PI / 2 }));
  const numC = TX.makeCanvas(128, 64), nc = numC.getContext('2d');
  nc.fillStyle = '#f4f1e6'; nc.fillRect(0, 0, 128, 64); nc.fillStyle = '#b3261e'; nc.font = 'bold 44px Arial'; nc.textAlign = 'center'; nc.fillText('212', 64, 48);
  d212.add(K.mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: TX.toTex(numC, { wrap: false }) }), { y: 1.75, z: 0.024, cast: false }));
  corridor.add(d212);
  const exitC = TX.makeCanvas(256, 96), ex = exitC.getContext('2d');
  ex.fillStyle = '#0a9a4a'; ex.fillRect(0, 0, 256, 96); ex.fillStyle = '#fff'; ex.font = 'bold 44px "PingFang SC",sans-serif'; ex.textAlign = 'center'; ex.fillText('安全出口 →', 128, 64);
  corridor.add(K.mesh(new THREE.PlaneGeometry(0.56, 0.21), new THREE.MeshBasicMaterial({ map: TX.toTex(exitC, { wrap: false }) }), { x: CX0 + 0.012, y: 2.32, z: dcz - 0.95, ry: Math.PI / 2, cast: false }));
  const hyd = K.group({ x: CX0 + 0.07, y: 1.05, z: dcz + 1.35, ry: Math.PI / 2 });
  hyd.add(K.mesh(K.box(0.7, 0.85, 0.14), K.std('#c8251d', 0.4, 0.2)));
  const hydC = TX.makeCanvas(256, 64), hc = hydC.getContext('2d');
  hc.fillStyle = '#fff'; hc.font = 'bold 40px "PingFang SC",sans-serif'; hc.textAlign = 'center'; hc.fillText('消 火 栓', 128, 48);
  hyd.add(K.mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: TX.toTex(hydC, { wrap: false }), transparent: true }), { y: 0.3, z: 0.075, cast: false }));
  corridor.add(hyd);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffaf0' });
  for (const z of [5.0, dcz - 0.2, 0.9, -2.4]) corridor.add(K.mesh(K.box(0.2, 0.03, 1.0), lampMat, { x: ccx, y: CY - 0.02, z, cast: false }));
  const corLight = new THREE.PointLight('#fff4e0', 0, 9, 1.6);
  corLight.position.set(ccx + 0.3, 2.4, dcz);
  corridor.add(corLight);
  refs.lights.corridor = corLight;
  refs.exit = { x: ccx, doorZ: dcz };
  refs.corridorSigns = { exit: exitC, d212 };
  refs.gap = { line: gapMat, glow: glowMat };

  // ================= 灯光 =================
  const hemi = new THREE.HemisphereLight('#c9d6ea', '#6a5a48', 0.32);
  add(hemi);
  const winLight = new THREE.RectAreaLight('#d8e4ff', 2.2, 2.6, 1.6);
  winLight.position.set(0, 1.75, -3.52);
  winLight.lookAt(0, 1.75, 0);
  add(winLight);
  const sun = new THREE.DirectionalLight('#ffe0b0', 0);
  sun.position.set(1.8, 6.5, -10);
  sun.target.position.set(-0.3, 0, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 2; sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  add(sun); add(sun.target);
  const ceilSpots = [], tubeMats = [], fixtures = [];
  for (const z of [2.3, -1.6]) {
    const fx = K.fluorescent();
    fx.position.set(0, 2.965, z);
    add(fx);
    fixtures.push(fx);
    tubeMats.push(fx.userData.tubeMat);
    const sp = new THREE.SpotLight('#f4f7ff', 0, 12, 1.3, 0.85, 1.4);
    sp.position.set(0, 2.9, z);
    sp.target.position.set(0, 0, z);
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.bias = -0.0006; sp.shadow.normalBias = 0.02; sp.shadow.radius = 4;
    sp.shadow.camera.near = 0.3; sp.shadow.camera.far = 6;
    add(sp); add(sp.target);
    ceilSpots.push(sp);
  }
  const monLight = new THREE.PointLight('#ffe6b0', 1.2, 3.2, 1.6);
  monLight.position.set(1.32, 1.1, 0.28);
  add(monLight);
  refs.lights = { ...refs.lights, hemi, winLight, sun, ceilSpots, tubeMats, monLight };
  refs.fixtures = fixtures;

  // ================= 天花板：空调、时钟、开关 =================
  const ac = K.acUnit();
  place(ac, -1.8 + 0.115, 2.52, dcz, Math.PI / 2); // 宿舍门正上方（西墙）
  mark('ac', ac);
  refs.ac = ac;
  const clock = K.wallClock();
  place(clock, 1.22, 2.32, SZ - 0.015, Math.PI);
  mark('clock', clock);
  refs.clock = clock;
  const sw = K.group({ x: -1.795, y: 1.35, z: 3.43, ry: Math.PI / 2 }); // 门框北边、折叠桌上方
  sw.add(K.mesh(K.rbox(0.086, 0.086, 0.012, 0.004), M.plasticWhite, { cast: false }));
  const rocker = K.mesh(K.rbox(0.04, 0.05, 0.012, 0.003), K.std('#f7f7f4', 0.3), { z: 0.008, rx: 0.12, cast: false });
  sw.add(rocker);
  add(sw);
  mark('switch', sw);
  refs.switchRocker = rocker;
  refs.sw = sw;

  section('sw');
  // ================= 西南角：门边折叠桌（靠西墙，紧挨着宿舍门框）+ 黑色杂物桌 =================
  const fold = K.blackTable({ w: 0.75, d: 0.45, h: 0.72 });
  place(fold, -1.565, 0, 3.19, -Math.PI / 2);
  const pinkBag = K.shoppingBag({ color: '#c78fa6', w: 0.4, h: 0.44, d: 0.22 });
  place(pinkBag, -1.57, 0.72, 3.02, Math.PI / 2 + 0.12);
  mark('pinkBag', pinkBag);
  const wb = K.bottle({ h: 0.3, r: 0.04, label: 'water' });
  place(wb, -1.71, 0.72, 3.36);
  const smallBox = K.mesh(K.box(0.09, 0.05, 0.13), [K.std('#e8dcc0', 0.8), K.std('#e8dcc0', 0.8), K.std('#e8dcc0', 0.8), K.std('#e8dcc0', 0.8), K._labelMat('snack'), K.std('#e8dcc0', 0.8)], { y: 0.025 });
  const sb = K.group(); sb.add(smallBox); place(sb, -1.46, 0.72, 3.42, 0.3);
  const redShoebox = K.mesh(K.box(0.34, 0.12, 0.22), [K.std('#b8352a', 0.7), K.std('#b8352a', 0.7), K.std('#b8352a', 0.7), K.std('#b8352a', 0.7), K._labelMat('shoebox'), K.std('#b8352a', 0.7)], { y: 0.06 });
  const rsb = K.group(); rsb.add(redShoebox); place(rsb, -1.6, 0, 3.26, Math.PI / 2 + 0.25);
  place(K.cardboardBox(0.3, 0.16, 0.24), -1.6, 0, 2.95, Math.PI / 2 - 0.2);
  place(K.clothPile({ mat: M.blackCloth, sx: 0.24, sy: 0.14, sz: 0.22, seed: 3 }), -1.47, 0, 3.44);
  place(K.plasticBag('#f0f0f0', 0.14, 8), -1.44, 0, 2.87);
  const broom = K.broom(); broom.rotation.z = 0.12; place(broom, -1.5, 0, 3.5, 1.25);
  mark('foldTable', fold); mark('broom', broom);
  refs.foldTable = fold; refs.pinkBag = pinkBag; refs.broom = broom;
  block(-1.8, -1.32, 2.8, 3.6, '', 0.8);

  const bt = K.blackTable({ w: 1.5, d: 0.6, h: 0.75 });
  place(bt, -1.48, 0, 2.02, Math.PI / 2);
  mark('blackTable', bt);
  refs.blackTable = bt;
  block(-1.8, -1.18, 1.27, 2.77, '', 0.8);
  const T0 = 0.75;
  const basin = K.group();
  basin.add(K.mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.1, 24, 1, true), K.std('#f2c318', 0.4, 0, { side: THREE.DoubleSide }), { y: 0.05 }));
  basin.add(K.mesh(K.cyl(0.12, 0.12, 0.005, 24), K.std('#f2c318', 0.4), { y: 0.003 }));
  place(basin, -1.52, T0, 2.54);
  const clutterBT = [
    [K.bottle({ h: 0.33, r: 0.045, label: 'water', cap: '#1d6ac8' }), -1.65, 2.27],
    [K.bottle({ h: 0.25, r: 0.033, label: 'juice', cap: '#f5a300' }), -1.36, 2.2],
    [K.bottle({ h: 0.25, r: 0.033, label: 'cola', cap: '#c00', tint: '#3a1a10' }), -1.6, 1.87],
    [K.bottle({ h: 0.25, r: 0.033, label: 'tea', cap: '#2a2', tint: '#a0421a' }), -1.3, 1.54],
    [K.noodleBowl(), -1.62, 1.52],
    [K.noodleBowl(), -1.45, 1.7],
    [K.cup('#e8e4dc'), -1.3, 1.94],
    [K.cup('#d9423a'), -1.66, 2.04],
    [K.can('cola'), -1.28, 2.4],
    [K.tissueBox(), -1.62, 1.36],
  ];
  for (const [o, x, z] of clutterBT) place(o, x, T0, z, rnd() * 3);
  const sbag = K.snackBag('chips'); sbag.rotation.set(-Math.PI / 2 + 0.2, 0, 0.5); place(sbag, -1.42, T0 + 0.03, 1.82);
  const sbag2 = K.snackBag('latiao', 0.12, 0.18); sbag2.rotation.set(-Math.PI / 2 + 0.1, 0, -0.3); place(sbag2, -1.56, T0 + 0.03, 2.08);
  const thermos = K.group(); thermos.add(K.mesh(K.cyl(0.04, 0.04, 0.26, 16), K.std('#8a9ab0', 0.25, 0.8), { y: 0.13 })); place(thermos, -1.7, T0, 2.64);
  // 遥控器（线索道具）
  const remote = K.remote();
  place(remote, -1.34, T0, 2.22, 0.4);
  mark('remote', remote);
  refs.remote = remote;
  // 桌下
  place(K.storageBox({ w: 0.45, h: 0.26, d: 0.36, lid: '#dfe6ec' }), -1.5, 0, 1.67, Math.PI / 2);
  place(K.clothPile({ mat: M.blueCloth, sx: 0.2, sy: 0.1, sz: 0.18, seed: 12 }), -1.45, 0, 2.42);
  place(K.bottle({ h: 0.3, r: 0.04, label: 'water' }), -1.25, 0, 2.62, 0);
  // 凳子 + 红白头盔
  const stoolH = K.stool();
  place(stoolH, -0.84, 0, 2.2, 0.2);
  block(-1.0, -0.68, 2.05, 2.35);
  const helmet = K.helmet();
  place(helmet, -0.84, 0.455 + 0.035, 2.2, 1.3);
  mark('helmet', helmet);
  refs.helmet = helmet;
  refs.helmetHome = { x: -0.84, y: 0.49, z: 2.2, ry: 1.3 };
  mark('stoolH', stoolH);
  refs.stoolH = stoolH;

  section('west');
  // ================= 西侧：上下铺 W1（室友A）/ 书架 / W2（室友B）=================
  const W1 = K.bunkBed({ aisle: 1, ladderEnd: 1, lower: 'floral', upperNet: true, seed: 1 });
  place(W1, -1.325, 0, 0.21);
  mark('bedW1', W1);
  refs.beds = { W1 };
  block(-1.8, -0.84, -0.8, 1.22, '', 2.8);
  const W2 = K.bunkBed({ aisle: 1, ladderEnd: 1, lower: 'blue', upperNet: true, lowerNet: true, seed: 2 });
  place(W2, -1.325, 0, -2.34);
  mark('bedW2', W2);
  refs.beds.W2 = W2;
  block(-1.8, -0.84, -3.35, -1.33, '', 2.8);
  const shelf = K.shelfUnit({ w: 0.45, h: 1.7, d: 0.35, shelves: 4, seed: 5 });
  place(shelf, -1.62, 0, -1.07, Math.PI / 2);
  mark('shelf', shelf);
  refs.shelf = shelf;
  block(-1.8, -1.44, -1.3, -0.85, '', 1.7);
  // 书架前的地上掉了三本书——昨晚打游戏时"自己"从书架上掉下来的（第四章的隐藏结局会揭晓是谁推的）
  refs.fallenBooks = FALLEN_BOOKS.map(([x, y, z, rx, ry, rz, c, th]) => {
    const b = K.book(0.2, th, 0.24, c);
    b.position.set(x, y, z); b.rotation.set(rx, ry, rz);
    return mark('fallenBooks', place(b, x, y, z, ry));
  });
  refs.fallenBooks.forEach((b, i) => b.rotation.set(FALLEN_BOOKS[i][3], FALLEN_BOOKS[i][4], FALLEN_BOOKS[i][5]));
  // 挂着的蓝色塑料袋、浅蓝毛巾
  const hang = (mat, w, h, x, y, z, ry = Math.PI / 2) => {
    const geo = new THREE.PlaneGeometry(w, h, 8, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22 + p.getY(i) * 3) * 0.02);
    geo.computeVertexNormals();
    return place(K.mesh(geo, mat), x, y, z, ry);
  };
  hang(K.std('#9fc4e8', 0.9, 0, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 0.5, 0.9, -0.84, 1.25, -0.2);
  hang(K.std('#3f78d0', 0.35, 0, { side: THREE.DoubleSide }), 0.35, 0.45, -0.84, 1.55, 0.6);
  hang(M.blueCloth, 0.4, 0.6, -0.84, 1.5, -1.7);
  hang(K.std('#e8e4d8', 0.9, 0, { side: THREE.DoubleSide }), 0.3, 0.5, -0.84, 1.3, -2.8);
  // W1 床下
  place(K.clothPile({ mat: M.blackCloth, sx: 0.3, sy: 0.12, sz: 0.25, seed: 21 }), -1.1, 0, 0.9);
  place(K.shoePair({ upper: '#1b1b1b', sole: '#eee' }, 0.13, 1.2), -1.05, 0, -0.5);
  place(K.cardboardBox(0.4, 0.22, 0.3), -1.45, 0, -0.2, 0.1);
  place(K.bottle({ h: 0.3, r: 0.04, label: 'water' }), -1.0, 0, 0.3);

  section('eastS');
  // ================= 东侧：鞋架 / 收纳 / E1（你的床）=================
  const rack = K.shoeRack({ tiers: 7 });
  place(rack, 1.63, 0, SZ - 0.34, -Math.PI / 2);
  mark('shoeRack', rack);
  refs.rack = rack;
  block(1.46, 1.8, SZ - 0.66, SZ, '', 1.35);
  const shoeStyles = [
    { upper: '#1c1c1e', sole: '#f2f2f0' }, { upper: '#e8e6e0', sole: '#f5f5f2' }, { upper: '#2b2b33', sole: '#fff', accent: '#e33' },
    { upper: '#b33a2c', sole: '#eee' }, { upper: '#3a3f4a', sole: '#ddd' }, { upper: '#f0efe9', sole: '#e8e8e8' }, { upper: '#1a1a1a', sole: '#111' },
  ];
  rack.userData.shelfYs.forEach((y, i) => {
    if (i === 3) return;
    const pr = K.shoePair(shoeStyles[i % shoeStyles.length], 0.14, Math.PI);
    pr.position.set((i % 2 ? -0.12 : 0.12), y + 0.01, 0.02);
    pr.rotation.x = -0.12;
    pr.scale.setScalar(0.92);
    rack.add(pr);
  });
  const sbox = K.storageBox({ w: 0.5, h: 0.3, d: 0.38 });
  place(sbox, 1.18, 0, SZ - 0.25, 0.05);
  const cap = K.whiteCap(); place(cap, 1.28, 0.33, SZ - 0.28, 2.6);
  place(K.clothPile({ mat: M.blackCloth, sx: 0.2, sy: 0.07, sz: 0.16, seed: 31 }), 1.08, 0.33, SZ - 0.24);
  mark('storageBox', sbox);
  block(0.92, 1.44, SZ - 0.45, SZ, '', 0.6);
  const polka = K.softBox({ w: 0.5, h: 0.34, d: 0.3, mat: M.polka, sag: 0.05, seed: 41 });
  place(polka, 1.22, 0, SZ - 0.71, 0.08);
  mark('polkaBag', polka);
  block(0.96, 1.48, SZ - 0.87, SZ - 0.56);
  // 视频二里玻璃门左边那个灰色翻盖垃圾桶
  const bin = K.group();
  bin.add(K.mesh(K.rbox(0.3, 0.52, 0.26, 0.03), K.std('#6f757b', 0.5), { y: 0.26 }));
  bin.add(K.mesh(K.rbox(0.31, 0.05, 0.27, 0.02), K.std('#4f555a', 0.45), { y: 0.545 }));
  bin.add(K.mesh(K.box(0.14, 0.05, 0.004), K.std('#e8e8e2', 0.6), { y: 0.47, z: -0.132, cast: false }));
  place(bin, 0.66, 0, SZ - 0.2, 0);
  mark('bin', bin);
  refs.bin = bin;
  block(0.5, 0.82, SZ - 0.34, SZ, '', 0.58);
  const box350 = K.cardboardBox(0.36, 0.24, 0.26, M.cardboard350);
  place(box350, 1.05, 0, 2.62, 0.4);
  mark('box350', box350);
  const E1 = K.bunkBed({ aisle: -1, ladderEnd: -1, lower: 'gray', upperNet: true, lowerCurtain: 'gray', seed: 3 });
  place(E1, 1.325, 0, 1.81);
  mark('bedE1', E1);
  refs.beds.E1 = E1;
  block(0.84, 1.8, 0.8, 2.82, '', 2.8);
  // 花纹长卷 + 蓝色衣架（挂在床柱上）
  const roll = K.mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.15, 20), M.patternRoll, { rz: 0.06 });
  place(roll, 0.79, 1.18, 2.7);
  mark('patternRoll', roll);
  const hg = K.hanger('#3aa0e8'); place(hg, 0.82, 1.72, 2.55, Math.PI / 2);
  // 行李箱（你的，装着准考证）
  const suit = K.suitcase();
  place(suit, 0.55, 0, 1.45);
  mark('suitcase', suit);
  refs.suitcase = suit;
  block(0.33, 0.77, 1.1, 1.8, 'suitcase', 0.3);
  const suitNote = K.sticky(T.suitNote, 0.07);
  suitNote.rotation.x = -Math.PI / 2; suitNote.rotation.z = 0.2;
  suitNote.position.set(-0.31, 0.122, -0.15);
  suit.userData.lidPivot.add(suitNote);
  mark('suitNote', suitNote);
  refs.suitNote = suitNote;
  // 箱内道具：准考证 + 紫光手电
  const tkC = TX.makeCanvas(512, 360);
  TX.drawTicket(tkC, { name: '我', faceImg });
  const ticketTex = TX.toTex(tkC, { wrap: false });
  const ticket = K.mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshStandardMaterial({ map: ticketTex, roughness: 0.8 }), { rx: -Math.PI / 2, cast: false });
  ticket.position.set(-0.05, 0.172, -0.12);
  ticket.rotation.z = Math.PI / 2 + 0.1;
  suit.add(ticket);
  mark('ticket', ticket);
  refs.ticket = { mesh: ticket, canvas: tkC, tex: ticketTex };
  const uvl = K.uvFlashlight();
  uvl.position.set(0.08, 0.185, 0.18); uvl.rotation.y = 0.6;
  suit.add(uvl);
  mark('uvLight', uvl);
  refs.uvItem = uvl;

  section('desks');
  // ================= 东侧：书桌 D1（你的）/ D2（室友C）=================
  const D1 = K.oldDesk({ w: 1.0, d: 0.55, h: 0.76, drawer: true });
  place(D1, 1.515, 0, 0.25, -Math.PI / 2);
  occl(D1);
  block(1.23, 1.8, -0.25, 0.75, '', 0.78);
  refs.drawer = D1.userData.drawer;
  refs.desks = { D1 };
  mark('drawer', D1.userData.drawer);
  const DT = 0.76;
  const dl = (o, lx, lz, ry = 0, y = DT) => { o.position.set(lx, y, lz); o.rotation.y = ry; D1.add(o); return o; };
  // 显示器（胜利画面）
  const scrC = TX.makeCanvas(1024, 576);
  TX.drawMobaScreen(scrC);
  const scrTex = TX.toTex(scrC, { wrap: false });
  const mon = K.monitor(scrTex, { bright: 1.0 });
  dl(mon, 0.05, -0.14);
  mark('monitor', mon);
  refs.monitor = { group: mon, canvas: scrC, tex: scrTex };
  const sticky = K.sticky(T.stickyMain, 0.08);
  sticky.position.set(-0.22, mon.userData.screenCenterY + 0.12, 0.018);
  sticky.rotation.z = 0.12;
  mon.add(sticky);
  mark('sticky', sticky);
  refs.sticky = sticky;
  // 键盘 + 紫光图层
  const kbC = TX.makeCanvas(1024, 340); TX.drawKeyboard(kbC);
  const kbUVC = TX.makeCanvas(1024, 340);
  const kbUVTex = TX.toTex(kbUVC, { wrap: false });
  refs.kbUV = { canvas: kbUVC, tex: kbUVTex };
  const kb = K.keyboard(TX.toTex(kbC, { wrap: false }), null, uvMat(kbUVTex));
  dl(kb, -0.12, 0.09);
  mark('keyboard', kb);
  refs.keyboard = kb;
  dl(K.mousepad(T.mousepad), 0.26, 0.1, 0, DT + 0.001);
  const mouse = K.mouse(); dl(mouse, 0.3, 0.14, 0.1, DT + 0.004);
  mark('mouse', mouse);
  refs.mouse = mouse;
  const phone = K.phone(); dl(phone, -0.4, 0.16, 0.25);
  mark('phone', phone);
  refs.phone = phone;
  const calC = TX.makeCanvas(512, 440);
  const calTex = TX.toTex(calC, { wrap: false });
  refs.calendar = { canvas: calC, tex: calTex };
  const cal = K.deskCalendar(calTex); dl(cal, 0.38, -0.13, -0.35);
  mark('calendar', cal);
  refs.calendar.group = cal;
  const nb = K.notebookOpen(T.notebook); dl(nb, -0.33, -0.1, 0.2);
  mark('notebook', nb);
  refs.notebook = nb;
  const sid = K.studentId(); dl(sid, 0.42, -0.02, 0.4, DT + 0.002);
  mark('studentId', sid);
  refs.studentId = sid;
  const apple = K.apple(); dl(apple, 0.44, -0.2, 0);
  mark('apple', apple);
  refs.apple = apple;
  dl(K.earphones(7), -0.02, -0.05, 1.2);
  const p1 = K.paper(T.paperMath[0], 0.21, 0.297, 3); dl(p1, 0.12, -0.02, 0.3, DT + 0.001);
  // 充电线：手机 → 桌沿 → 插线板
  const cableD = [new THREE.Vector3(-0.4, DT + 0.005, 0.24), new THREE.Vector3(-0.42, DT + 0.005, 0.28), new THREE.Vector3(-0.44, DT - 0.01, 0.3), new THREE.Vector3(-0.43, 0.4, 0.32), new THREE.Vector3(-0.35, 0.1, 0.25), new THREE.Vector3(-0.2, 0.03, 0.12)];
  D1.add(K.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cableD), 40, 0.0025, 6), M.plasticWhite));
  const strip = K.powerStrip(); dl(strip, -0.1, 0.1, 0.15, 0);
  mark('strip', strip);
  refs.strip = strip;
  const tower = K.pcTower(); dl(tower, 0.3, -0.05, 0, 0);
  mark('pcTower', tower);
  refs.tower = tower;
  // 抽屉里的东西
  const drawerNote = K.mesh(new THREE.PlaneGeometry(0.1, 0.07), new THREE.MeshStandardMaterial({ map: T.foldedNote2, roughness: 0.9 }), { rx: -Math.PI / 2, y: -0.036, z: 0.02, cast: false });
  refs.drawer.add(drawerNote);
  mark('drawerNote', drawerNote);
  refs.drawerNote = drawerNote;
  const latiao = K.snackBag('latiao', 0.1, 0.15);
  latiao.rotation.set(-Math.PI / 2, 0, 0.4); latiao.position.set(0.1, -0.03, -0.06); latiao.scale.set(1, 1, 0.5);
  refs.drawer.add(latiao);
  mark('latiao', latiao);
  refs.latiao = latiao;
  // 凳子
  const stoolMe = K.stool();
  place(stoolMe, 0.93, 0, 0.25, Math.PI / 2);
  refs.stoolMe = stoolMe;
  block(0.78, 1.08, 0.1, 0.4, 'stoolMe');
  mark('stoolMe', stoolMe);
  refs.sit = { x: 0.9, z: 0.25, yaw: Math.PI / 2 };
  // 紫光涂鸦（东墙，显示器上方；内容开局时按室友名字绘制）
  const doodleC = TX.makeCanvas(1024, 512);
  const doodleTex = TX.toTex(doodleC, { wrap: false });
  const doodle = K.mesh(new THREE.PlaneGeometry(1.7, 0.85), uvMat(doodleTex), { x: 1.795, y: 1.72, z: -0.3, ry: -Math.PI / 2, cast: false, recv: false });
  add(doodle);
  refs.doodle = { canvas: doodleC, tex: doodleTex, mesh: doodle };

  const D2 = K.oldDesk({ w: 1.0, d: 0.55, h: 0.76, drawer: false });
  place(D2, 1.515, 0, -0.8, -Math.PI / 2);
  occl(D2);
  block(1.23, 1.8, -1.3, -0.3, '', 0.78);
  refs.desks.D2 = D2;
  const d2 = (o, lx, lz, ry = 0, y = DT) => { o.position.set(lx, y, lz); o.rotation.y = ry; D2.add(o); return o; };
  const offC = TX.makeCanvas(64, 36); const oc = offC.getContext('2d'); oc.fillStyle = '#060708'; oc.fillRect(0, 0, 64, 36);
  const mon2 = K.monitor(TX.toTex(offC, { wrap: false }), { bright: 1 }); d2(mon2, 0.0, -0.14);
  mark('monitor2', mon2);
  refs.monitor2 = mon2;
  const kb2C = TX.makeCanvas(512, 170); TX.drawKeyboard(kb2C);
  d2(K.keyboard(TX.toTex(kb2C, { wrap: false })), -0.05, 0.1);
  const hs = K.headset(); d2(hs, 0.35, -0.05, 0.3, DT + 0.03);
  mark('headset', hs);
  refs.headset = hs;
  d2(K.tissueBox(), -0.36, -0.12, 0.2);
  d2(K.bottle({ h: 0.3, r: 0.04, label: 'water' }), 0.4, -0.18);
  const fold2 = K.mesh(K.box(0.24, 0.012, 0.31), K.std('#f2c230', 0.5), { y: 0.006 }); const fg2 = K.group(); fg2.add(fold2); d2(fg2, 0.25, 0.15, 0.2);
  mark('folder', fg2);
  const p2 = K.paper(T.paperMath[1], 0.21, 0.297, 5); d2(p2, 0.3, 0.1, -0.4, DT + 0.013);
  const stool2 = K.stool(); place(stool2, 1.0, 0, -0.85, 1.4);
  refs.stool2 = stool2;
  block(0.85, 1.15, -1.0, -0.7);
  place(K.clothPile({ mat: M.grayCloth, sx: 0.16, sy: 0.08, sz: 0.14, seed: 51 }), 1.0, 0.46, -0.85);

  section('eastN');
  // ================= 东侧：E2（室友C，粉色床帘）=================
  const E2 = K.bunkBed({ aisle: -1, ladderEnd: 1, lower: 'white', upperNet: true, lowerCurtain: 'pink', seed: 4 });
  place(E2, 1.325, 0, -2.34);
  mark('bedE2', E2);
  refs.beds.E2 = E2;
  block(0.84, 1.8, -3.35, -1.33, '', 2.8);
  // 蓝色脏衣篓（小钥匙在袜子里）
  const basket = K.basket({ color: '#2d6fd8', r: 0.2, h: 0.38 });
  place(basket, 0.58, 0, -2.2);
  place(K.clothPile({ mat: M.blackCloth, sx: 0.17, sy: 0.12, sz: 0.17, seed: 61 }), 0, 0.3, 0, 0, basket);
  place(K.clothPile({ mat: M.grayCloth, sx: 0.12, sy: 0.08, sz: 0.1, seed: 62 }), 0.05, 0.36, 0.04, 0, basket);
  const sock = K.mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), K.std('#e8e8e2', 0.95), { x: -0.05, y: 0.4, z: -0.02, rz: Math.PI / 2 - 0.3, ry: 0.5 });
  basket.add(sock);
  mark('basket', basket);
  refs.basket = basket;
  block(0.36, 0.8, -2.42, -1.98, '', 0.4);

  section('far');
  // ================= 北侧：窗前书桌 =================
  const od = K.oldDesk({ w: 0.86, d: 0.5, h: 0.74, drawer: false, mat: M.woodOrange });
  place(od, -0.43, 0, -3.17, Math.PI);
  const bd = K.blackTable({ w: 0.82, d: 0.5, h: 0.74 });
  place(bd, 0.43, 0, -3.17);
  mark('farDesks', od); mark('farDesks', bd); refs.interact.farDesks = od;
  refs.farDesks = { od, bd };
  block(-0.86, 0.84, -3.45, -2.9, '', 0.78);
  const FT = 0.74;
  const books = K.group();
  for (let i = 0; i < 6; i++) { const b = K.book(0.2, 0.03, 0.27, ['#284f8f', '#8a2020', '#e3d5b8', '#2a6a40', '#333', '#b0772a'][i]); b.position.set((rnd() - 0.5) * 0.03, 0.015 + i * 0.031, (rnd() - 0.5) * 0.03); b.rotation.y = (rnd() - 0.5) * 0.3; books.add(b); }
  place(books, -0.6, FT, -3.2, 0.2);
  place(K.clothPile({ mat: M.whiteCloth, sx: 0.2, sy: 0.08, sz: 0.16, seed: 71 }), -0.28, FT, -3.25);
  place(K.plasticBag('#bcd7f5', 0.16, 72), -0.2, FT + 0.2, -3.28);
  const farItems = [
    [K.bottle({ h: 0.3, r: 0.04, label: 'water' }), 0.15, -3.25], [K.bottle({ h: 0.22, r: 0.035, label: 'water' }), 0.25, -3.3],
    [K.bottle({ h: 0.26, r: 0.034, label: 'tea', tint: '#a0421a' }), 0.34, -3.2], [K.cup('#e0463a'), 0.52, -3.12],
    [K.bottle({ h: 0.18, r: 0.03, label: null, cap: '#eee', mat: M.plasticWhite }), 0.62, -3.28], [K.cup('#f0efe8'), 0.7, -3.1],
    [K.noodleBowl(), 0.45, -3.3], [K.can('cola'), 0.08, -3.05],
  ];
  for (const [o, x, z] of farItems) place(o, x, FT, z, rnd() * 3);
  const lamp = K.group();
  lamp.add(K.mesh(K.cyl(0.07, 0.08, 0.02, 16), M.plasticWhite, { y: 0.01 }));
  lamp.add(K.mesh(K.cyl(0.008, 0.008, 0.35, 8), M.plasticWhite, { y: 0.18, rz: 0.2 }));
  lamp.add(K.mesh(new THREE.ConeGeometry(0.07, 0.1, 16, 1, true), K.std('#f3f3f0', 0.4, 0, { side: THREE.DoubleSide }), { x: -0.06, y: 0.36, rz: 0.9 }));
  place(lamp, -0.75, FT, -3.35, 0.4);
  refs.farLamp = lamp;
  place(K.trashCan(), 0.0, 0, -3.2);
  place(K.storageBox({ w: 0.42, h: 0.26, d: 0.32, lid: '#9aa0a8' }), 0.55, 0, -3.15, 0.1);
  const blackChair = K.stool(); blackChair.traverse((o) => { if (o.isMesh) o.material = K.std('#1b1b1d', 0.5); }); place(blackChair, -0.45, 0, -2.75, 0.3);
  refs.blackChair = blackChair;

  section('floor');
  // ================= 地上散落的杂物（视频里的“名场面”）=================
  place(K.flipFlopPair('#e8742a', 0.4), -0.15, 0, 0.75);
  place(K.flipFlopPair('#ef7d2e', -0.8), 0.35, 0, -1.45);
  place(K.shoePair({ upper: '#9aa0a8', sole: '#e8e8e8' }, 0.14, 0.2), 0.08, 0, -2.55);
  place(K.shoePair({ upper: '#b9bec4', sole: '#f0f0f0' }, 0.13, -0.5), -0.35, 0, -2.4);
  const blueSandal = K.flipFlop('#2f5fc0'); place(blueSandal, -0.55, 0, -1.85, 1.1);
  place(K.clothPile({ mat: M.blackCloth, sx: 0.32, sy: 0.1, sz: 0.28, seed: 81 }), 0.45, 0, -1.72);
  place(K.clothPile({ mat: M.blackCloth, sx: 0.26, sy: 0.12, sz: 0.2, seed: 82 }), 0.12, 0, -0.95);
  const stripeBag = K.softBox({ w: 0.26, h: 0.12, d: 0.14, mat: K.std('#141414', 0.7), seed: 83 });
  place(stripeBag, 0.3, 0, -0.85, 0.8);
  place(K.mesh(K.box(0.27, 0.02, 0.02), K.std('#d22', 0.6)), 0, 0.08, 0, 0, stripeBag);
  const ybag = K.softBox({ w: 0.36, h: 0.3, d: 0.2, mat: M.yellowDots, sag: 0.05, seed: 84 });
  place(ybag, 0.7, 0, -0.6, 1.2);
  mark('yellowBag', ybag);
  const tote = K.shoppingBag({ color: '#d9352b', w: 0.42, h: 0.3, d: 0.14 });
  place(tote, -0.62, 0, -0.35, 1.5);
  tote.children[0].material = [K.std('#d9352b', 0.8), K.std('#d9352b', 0.8), new THREE.MeshBasicMaterial({ visible: false }), K.std('#d9352b', 0.8), K.std('#f2f0ea', 0.8), K.std('#d9352b', 0.8)];
  mark('toteBag', tote);
  const redBag = K.softBox({ w: 0.5, h: 0.42, d: 0.3, mat: K.std('#e0412e', 0.55), sag: 0.04, seed: 85 });
  place(redBag, -0.62, 0, -2.85, 0.3);
  mark('redBag', redBag);
  for (let i = 0; i < 9; i++) {
    const pp = K.paper(T.paperMath[i % T.paperMath.length], 0.21, 0.297, 10 + i);
    place(pp, -0.5 + rnd() * 1.1, 0.004 + i * 0.0006, -2.2 + rnd() * 4.6, rnd() * 6);
    mark('paper', pp);
  }
  const floorBottles = [[-0.2, -1.2], [0.6, 0.3], [-0.7, 1.5], [0.2, -2.0]];
  floorBottles.forEach(([x, z], i) => {
    const b = K.bottle({ h: 0.25, r: 0.033, label: i % 2 ? 'water' : 'tea', tint: i % 2 ? null : '#a0421a' });
    b.rotation.z = Math.PI / 2; b.position.y = 0.033;
    const gr = K.group(); gr.add(b);
    place(gr, x, 0, z, rnd() * 6);
  });
  place(K.plasticBag('#f4f4f4', 0.12, 91), -0.3, 0, -0.6);
  place(K.plasticBag('#e0e8f0', 0.1, 92), 0.5, 0, 2.1);
  const wrappers = [[0.1, 0.4], [-0.4, -1.5], [0.3, 1.9], [-0.1, 2.6]];
  for (const [x, z] of wrappers) { const s = K.snackBag(rnd() < 0.5 ? 'chips' : 'latiao', 0.1, 0.14); s.rotation.set(-Math.PI / 2, 0, rnd() * 6); s.scale.z = 0.4; place(s, x, 0.01, z); }
  section('misc');
  // 门口 AC 纸条（初始隐藏，空调打开后飘落）
  const acNote = K.mesh(new THREE.PlaneGeometry(0.11, 0.075), new THREE.MeshStandardMaterial({ map: T.foldedNote1, roughness: 0.9, side: THREE.DoubleSide }), { cast: true });
  acNote.visible = false;
  add(acNote);
  mark('acNote', acNote);
  refs.acNote = acNote;

  // 电池（头盔里）
  const batt = K.group();
  for (let i = 0; i < 2; i++) { batt.add(K.mesh(K.cyl(0.007, 0.007, 0.05, 10), K.std('#1b7a3a', 0.4, 0.2), { x: i * 0.016, rz: Math.PI / 2 })); }
  batt.visible = false;
  add(batt);
  refs.batteries = batt;

  // 碰撞：房间边界
  refs.bounds = { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: WR.z1 };
  refs.sections = slices(secs, root);
  refs.wcSections = slices(wcSecs, refs.wcRoom);

  // 主题：替换材质、增减道具
  if (decorate) {
    root.updateMatrixWorld(true);
    decorate({ THREE, K, M, T, TX, root, refs, collision, rnd, add, mark, occl, camBox, block, place, uvRect, wall, makeMirror, LAYOUT });
  }

  // 静态物体矩阵冻结，减轻 CPU
  root.updateMatrixWorld(true);
  // 门外走廊、窗外的东西不投影（省掉阴影 pass 的绘制）
  const wp = new THREE.Vector3();
  root.traverse((o) => { if (o.isMesh && (o.getWorldPosition(wp).z > WR.z1 + 0.2 || wp.x < -1.9)) o.castShadow = false; });
  return refs;
}
