// 洗手间窗外：楼下草地、一棵大树，树枝上吊着三只荡来荡去的猴子（彩蛋）
//   室外一律用 MeshBasicMaterial + 顶点色里“烘焙”好的明暗：白天的亮度不受屋里开关灯影响，也省灯光计算
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../core/textures.js';
import { mulberry32, clamp, lerp, easeInOut } from '../core/util.js';

const SUN = new THREE.Vector3(0.35, 0.8, -0.5).normalize(); // 阳光从楼这一侧的斜上方照过去，朝窗户的一面是亮的
const _zAxis = new THREE.Vector3(0, 0, 1);
const _col = new THREE.Color();

// 给几何体刷顶点色：环境光 + 按法线算的“阳光”，可选每个面随机深浅
function paint(geo, color, { shade = 0.4, jitter = 0, rnd = null, flat = false } = {}) {
  const g = flat && geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal || flat) g.computeVertexNormals();
  const n = g.attributes.normal, cnt = n.count;
  const col = new Float32Array(cnt * 3);
  const base = _col.set(color).clone();
  let j = 1;
  for (let i = 0; i < cnt; i++) {
    if (jitter && (!flat || i % 3 === 0)) j = 1 + ((rnd ? rnd() : Math.random()) - 0.5) * jitter;
    const d = Math.max(0, n.getX(i) * SUN.x + n.getY(i) * SUN.y + n.getZ(i) * SUN.z);
    const k = (1 - shade + shade * d) * j;
    col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const vcMat = () => new THREE.MeshBasicMaterial({ vertexColors: true });

// 两点之间的一根树枝（圆锥台）
function limb(a, b, r0, r1, seg = 7) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// ---------------- 猴子 ----------------
const DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UPPER = 0.17, LOWER = 0.17; // 上臂 / 前臂长度（猴子本地单位）

function makeMonkey(fur, face) {
  const sph = (r, color, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, shade = 0.45) => {
    const g = new THREE.SphereGeometry(r, 16, 12);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    return paint(g, color, { shade });
  };
  const cyl = (r0, r1, len, color, y0 = 0) => { const g = new THREE.CylinderGeometry(r1, r0, len, 8); g.translate(0, y0 - len / 2, 0); return paint(g, color); };
  const mat = vcMat();
  const root = new THREE.Group();
  const torso = new THREE.Group(); root.add(torso);
  // 身体（肩线在原点，身体往下挂）
  torso.add(new THREE.Mesh(mergeGeometries([sph(0.1, fur, 1, 1.6, 0.85, 0, -0.15, 0), sph(0.07, face, 1, 1.45, 0.6, 0, -0.17, -0.055)]), mat));
  const head = new THREE.Group(); head.position.set(0, 0.075, 0); torso.add(head);
  const headParts = [
    sph(0.095, fur), sph(0.07, face, 1.05, 0.95, 0.55, 0, -0.012, -0.065), sph(0.042, face, 1.15, 0.8, 0.85, 0, -0.045, -0.1),
    sph(0.014, '#1a120c', 1, 1, 1, 0, -0.058, -0.137, 0.1), // 嘴
  ];
  for (const s of [-1, 1]) {
    headParts.push(sph(0.014, '#16100b', 1, 1, 1, s * 0.03, 0.014, -0.112, 0.1));
    headParts.push(sph(0.005, '#ffffff', 1, 1, 1, s * 0.03 + 0.004, 0.019, -0.124, 0));
    headParts.push(sph(0.033, face, 0.55, 1, 1, s * 0.094, 0.008, -0.01));
    headParts.push(sph(0.045, fur, 1.2, 0.35, 0.8, s * 0.03, 0.05, -0.07)); // 眉骨上的毛
  }
  head.add(new THREE.Mesh(mergeGeometries(headParts), mat));
  // 两段式手臂：肩 → 上臂 → 肘 → 前臂 + 手
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.1, -0.035, 0); torso.add(sh);
    const up = new THREE.Group(); sh.add(up);
    up.add(new THREE.Mesh(cyl(0.025, 0.02, UPPER, fur), mat));
    const el = new THREE.Group(); el.position.y = -UPPER; up.add(el);
    el.add(new THREE.Mesh(mergeGeometries([cyl(0.02, 0.016, LOWER, fur), sph(0.025, face, 1, 1.25, 0.8, 0, -LOWER - 0.008, 0)]), mat));
    return { sh, up, el, pole: new THREE.Vector3(side, -1, 0.35).normalize() };
  };
  const armR = arm(1), armL = arm(-1);
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.05, -0.27, 0); torso.add(hp);
    hp.add(new THREE.Mesh(mergeGeometries([cyl(0.03, 0.02, 0.2, fur), sph(0.027, face, 1, 0.7, 1.6, 0, -0.205, -0.018)]), mat));
    return hp;
  };
  const legR = leg(1), legL = leg(-1);
  const tail = new THREE.Group(); tail.position.set(0, -0.28, 0.07); torso.add(tail);
  const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.09, 0.12), new THREE.Vector3(0, -0.03, 0.27), new THREE.Vector3(0, 0.12, 0.31), new THREE.Vector3(0.02, 0.2, 0.25)]);
  tail.add(new THREE.Mesh(paint(new THREE.TubeGeometry(tc, 24, 0.014, 6), fur), mat));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { root, torso, head, armR, armL, legR, legL, tail };
}

// 两骨骼 IK：把手放到 target（躯干坐标系）
function solveArm(arm, target) {
  const S = arm.sh.position;
  const d = _a.subVectors(target, S);
  const len = clamp(d.length(), Math.abs(UPPER - LOWER) + 0.01, UPPER + LOWER - 0.002);
  d.normalize();
  const x = (UPPER * UPPER - LOWER * LOWER + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
  const p = _b.copy(arm.pole).addScaledVector(d, -arm.pole.dot(d)).normalize();
  const E = _c.copy(S).addScaledVector(d, x).addScaledVector(p, h);
  const u = _d.subVectors(E, S).normalize();
  arm.up.quaternion.setFromUnitVectors(DOWN, u);
  const f = _e.copy(S).addScaledVector(d, len).sub(E).normalize().applyQuaternion(_q.copy(arm.up.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(DOWN, f);
}

// 三不猴：不看、不听、不说（手的位置按头部坐标给，头转向镜头时手跟着脸走）
const POSES = [
  { R: new THREE.Vector3(0.034, 0.012, -0.135), L: new THREE.Vector3(-0.034, 0.012, -0.135) },
  { R: new THREE.Vector3(0.112, 0.008, -0.01), L: new THREE.Vector3(-0.112, 0.008, -0.01) },
  { R: new THREE.Vector3(0.02, -0.052, -0.152), L: new THREE.Vector3(-0.024, -0.06, -0.15) },
];
const _poseT = new THREE.Vector3();
const SH_R = new THREE.Vector3(0.1, -0.035, 0);

export function buildOutside({ ground = -3.3 } = {}) {
  const g = new THREE.Group(); g.name = 'outside';
  const rnd = mulberry32(2112);
  // 远景 + 楼下草地
  const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 34), new THREE.MeshBasicMaterial({ map: TX.genParkView(), fog: false }));
  back.position.set(0, 7, 34); back.rotation.y = Math.PI; g.add(back);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(80, 28), new THREE.MeshBasicMaterial({ map: TX.genLawn(), fog: false }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, ground, 6.5 + 14); g.add(lawn);

  // 大树：树干 + 树枝合成一个网格，树叶合成一个网格
  const bark = '#6a4a31';
  const T0 = new THREE.Vector3(1.9, ground, 9.9), T1 = new THREE.Vector3(1.75, 3.2, 9.75), T2 = new THREE.Vector3(1.6, 6.2, 9.9);
  const MB = { a: new THREE.Vector3(1.75, 2.36, 9.62), b: new THREE.Vector3(-1.95, 2.74, 8.62) }; // 猴子吊着的那根横枝
  const wood = [
    limb(T0, T1, 0.26, 0.2, 9), limb(T1, T2, 0.2, 0.1, 8),
    limb(MB.a, MB.b, 0.085, 0.04), limb(MB.b, new THREE.Vector3(-2.6, 3.05, 8.35), 0.04, 0.018),
    limb(new THREE.Vector3(1.7, 3.6, 9.8), new THREE.Vector3(3.6, 4.6, 8.9), 0.09, 0.03),
    limb(new THREE.Vector3(1.65, 4.3, 9.85), new THREE.Vector3(-0.6, 5.6, 10.8), 0.08, 0.03),
    limb(new THREE.Vector3(1.8, 1.4, 9.8), new THREE.Vector3(3.4, 2.2, 10.9), 0.1, 0.04),
    limb(new THREE.Vector3(-0.4, 2.52, 9.06), new THREE.Vector3(-0.9, 3.4, 9.9), 0.035, 0.015),
  ].map((x) => paint(x, bark, { shade: 0.5 }));
  g.add(new THREE.Mesh(mergeGeometries(wood), vcMat()));
  const leaves = [];
  const blob = (x, y, z, r, color) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (rnd() - 0.5) * 0.28; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); }
    geo.translate(x, y, z);
    leaves.push(paint(geo, color, { shade: 0.5, jitter: 0.22, rnd, flat: true }));
  };
  const greens = ['#4f8a2e', '#3f7a28', '#5f9a36', '#467f2f'];
  const crown = [[1.6, 6.3, 9.9, 1.5], [0.4, 5.7, 10.3, 1.2], [2.9, 5.6, 9.6, 1.25], [1.7, 5.0, 11.0, 1.3], [-0.7, 5.3, 10.9, 1.0],
    [3.7, 4.7, 8.9, 0.9], [-2.5, 3.6, 8.6, 0.7], [-1.2, 3.8, 9.9, 0.8], [3.3, 2.5, 11.0, 0.9], [0.2, 4.2, 11.4, 1.0], [2.6, 3.6, 10.8, 0.95]];
  crown.forEach(([x, y, z, r], i) => blob(x, y, z, r, greens[i % greens.length]));
  // 远一点的几棵树
  const far = [[-6.5, 13, 1.5], [-3.2, 16, 1.9], [5.2, 14, 1.6], [8.5, 18, 2.2], [-9.5, 19, 2.0], [0.8, 20, 2.1]];
  for (const [x, z, r] of far) {
    blob(x, ground + 2.6 + r, z, r, greens[(x * 7) & 3]);
    blob(x + r * 0.6, ground + 2.1 + r * 0.6, z - 0.3, r * 0.7, greens[(z * 3) & 3]);
    leaves.push(paint(limb(new THREE.Vector3(x, ground, z), new THREE.Vector3(x, ground + 2.8, z), 0.18, 0.12), bark, { shade: 0.5, flat: true }));
  }
  // 楼脚下一排灌木
  for (let x = -7; x <= 7; x += 1.1) blob(x + (rnd() - 0.5) * 0.4, ground + 0.35, 7.2 + rnd() * 0.3, 0.55 + rnd() * 0.2, greens[(rnd() * 4) | 0]);
  g.add(new THREE.Mesh(mergeGeometries(leaves), vcMat()));

  // 三只猴子（大、中、小），单手吊在横枝上荡
  const furs = [['#6d4a2b', '#e3c49a'], ['#7a5433', '#ead0a6'], ['#8a6040', '#f0d8b2']];
  const scales = [1.12, 0.95, 0.78];
  const monkeys = [0.3, 0.5, 0.7].map((t, i) => {
    const mk = makeMonkey(furs[i][0], furs[i][1]);
    const grip = MB.a.clone().lerp(MB.b, t);
    mk.root.position.copy(grip);
    mk.root.rotation.y = (rnd() - 0.5) * 0.35;
    mk.root.scale.setScalar(scales[i]);
    g.add(mk.root);
    return { ...mk, grip, phase: rnd() * 6.28, amp: 0.42 + rnd() * 0.18, w: 2.0 + rnd() * 0.5, idx: i };
  });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.noRay = true; } });

  // ---- 动画 ----
  const state = { b: 0, target: 0, hold: 0 }; // b：0=吊着荡，1=坐在树枝上摆造型
  const hangT = new THREE.Vector3(), poseT = new THREE.Vector3(), tmp = new THREE.Vector3();
  const _inv = new THREE.Matrix4(), _pos = new THREE.Vector3(), _hp = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const update = (dt, t, camera) => {
    if (state.hold > 0) { state.hold -= dt; if (state.hold <= 0) state.target = 0; }
    const db = state.target - state.b;
    state.b += Math.sign(db) * Math.min(Math.abs(db), dt / (db > 0 ? 0.7 : 0.85));
    const e = easeInOut(state.b);
    for (const m of monkeys) {
      const tt = t * m.w + m.phase;
      // 吊着：以抓握点为轴的单摆
      const th = Math.sin(tt) * m.amp;
      const tilt = -0.28 + Math.sin(tt + 1.2) * 0.08;
      const L = (UPPER + LOWER) * 0.96;
      // 肩膀在摆的坐标系里正下方 L 处；躯干原点 = 肩 - R(tilt)·SH_R
      _pos.set(0, -L, 0).sub(tmp.copy(SH_R).applyAxisAngle(_zAxis, tilt)).applyAxisAngle(_zAxis, th);
      const hangRz = th + tilt;
      // 坐着：屁股坐在树枝上，身体稍微前倾，轻轻晃
      _hp.set(0, 0.36 + Math.sin(t * 3 + m.idx) * 0.008, -0.01);
      const jump = Math.sin(Math.PI * e) * 0.14;
      m.torso.position.set(lerp(_pos.x, _hp.x, e), lerp(_pos.y, _hp.y, e) + jump, lerp(_pos.z, _hp.z, e) - jump * 0.4);
      m.torso.rotation.set(lerp(Math.sin(tt * 0.5) * 0.08, 0.1, e), 0, lerp(hangRz, Math.sin(t * 2.2 + m.idx) * 0.04, e));
      m.torso.updateMatrix();
      // 头：吊着时东张西望，坐着时看向窗户里的人
      let hy = Math.sin(t * 0.9 + m.idx * 2) * 0.5, hx = Math.sin(t * 1.3 + m.idx) * 0.15;
      if (camera && e > 0.01) {
        m.torso.updateWorldMatrix(true, false);
        camLocal.copy(camera.position).applyMatrix4(_inv.copy(m.torso.matrixWorld).invert()).sub(m.head.position);
        const cy = clamp(Math.atan2(-camLocal.x, -camLocal.z), -0.8, 0.8), cx = clamp(Math.atan2(camLocal.y, Math.hypot(camLocal.x, camLocal.z)), -0.5, 0.5);
        hy = lerp(hy, cy, e); hx = lerp(hx, cx * 0.8, e);
      }
      m.head.rotation.set(hx, hy, 0);
      const toTorso = (v) => _poseT.copy(v).applyEuler(m.head.rotation).add(m.head.position);
      // 右手：吊着时抓住树枝（抓握点 = 猴子根节点原点），坐着时摆造型
      _inv.copy(m.torso.matrix).invert();
      hangT.set(0, 0, 0).applyMatrix4(_inv);
      const P = POSES[m.idx];
      solveArm(m.armR, poseT.copy(hangT).lerp(toTorso(P.R), e));
      // 左手：吊着时在空中乱抓
      hangT.set(-0.25, -0.08 + Math.sin(tt * 1.3) * 0.09, -0.05 + Math.cos(tt * 1.3) * 0.06);
      solveArm(m.armL, poseT.copy(hangT).lerp(toTorso(P.L), e));
      // 腿、尾巴
      const kick = Math.sin(tt * 1.7);
      m.legR.rotation.set(lerp(0.35 + kick * 0.35, 1.25, e), 0, lerp(0.15, 0.05, e));
      m.legL.rotation.set(lerp(0.35 - kick * 0.35, 1.25 + Math.sin(t * 2.4) * 0.12 * e, e), 0, lerp(-0.15, -0.05, e));
      m.tail.rotation.set(lerp(Math.sin(tt) * 0.3, -1.0 + Math.sin(t * 1.6 + m.idx) * 0.15, e), 0, lerp(Math.sin(tt * 0.7) * 0.4, 0, e));
    }
  };
  const trigger = (sec = 4.5) => { state.target = 1; state.hold = sec; };
  return { group: g, update, trigger, get busy() { return state.b > 0.02 || state.target > 0; } };
}
