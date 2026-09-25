// 第三章的动物室友：拟人化的鸡（打游戏）、马（躺床上刷手机）、猴（对着镜子没完没了地摆造型）、一只小黄鸡。
//   写实电影感：羽毛 / 短毛 / 绒毛的贴图 + 法线 + 一层 sheen（毛发边缘那圈柔光），裸露的皮肤有褶子，
//   眼睛是湿润的虹膜（清漆反光），眨眼是真的眼皮合上；没有描边、没有腮红、头顶也不冒漫画气泡——情绪全靠动作和声音。
//   程序化建模：手臂用两骨骼 IK 放到目标点上，每种动物有几套状态（常态 / 被打断 / 聊天 / 欢呼）
import * as THREE from 'three';
import * as TJ from '../core/tex_jungle.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SPH = new THREE.SphereGeometry(1, 28, 20);
const SPH_LO = new THREE.SphereGeometry(1, 14, 10);
// 眼皮：球面顶上的一顶"帽子"（绕 x 轴转下来就盖住了眼睛）
const LID = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, 1.25);
const gcache = new Map();
const CAP = (r, l) => { const k = `c${r},${l}`; if (!gcache.has(k)) gcache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.001, l), 8, 14)); return gcache.get(k); };
const CYL = (r0, r1, h) => { const k = `y${r0},${r1},${h}`; if (!gcache.has(k)) gcache.set(k, new THREE.CylinderGeometry(r0, r1, h, 16)); return gcache.get(k); };
const CONE = (r, h) => { const k = `k${r},${h}`; if (!gcache.has(k)) gcache.set(k, new THREE.ConeGeometry(r, h, 16)); return gcache.get(k); };

// ---------- 材质：同一套参数只建一份 ----------
const mcache = new Map();
const cached = (key, make) => { if (!mcache.has(key)) mcache.set(key, make()); return mcache.get(key); };
const std = (color, rough = 0.55, metal = 0) => cached(`s${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
// 毛发 / 羽毛：贴图 + 法线 + sheen
function hairMat(key, make, { rough = 0.82, sheen = 0.6, sheenColor = '#ffffff', sheenRough = 0.5, normal = 0.9, repeat = [3, 2] } = {}) {
  return cached(`h${key}`, () => {
    const t = make();
    for (const x of [t.map, t.normalMap]) x.repeat.set(repeat[0], repeat[1]);
    return new THREE.MeshPhysicalMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(normal, normal), roughness: rough, sheen, sheenColor: new THREE.Color(sheenColor), sheenRoughness: sheenRough });
  });
}
const skinMat = (base, { rough = 0.55, bumps = 1, repeat = [2, 2], seed = 3431 } = {}) => cached(`k${base}${rough}${bumps}`, () => {
  const t = TJ.genSkin({ base, bumps, seed });
  for (const x of [t.map, t.normalMap]) x.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: rough });
});
const eyeMat = (o) => cached(`e${JSON.stringify(o)}`, () => new THREE.MeshPhysicalMaterial({ map: TJ.genEye(o), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }));
const fabricMat = (key, draw, repeat = [2, 3]) => cached(`f${key}`, () => {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'), 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.92, sheen: 0.5, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.7 });
});

function part(parent, geo, mat, { x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, cast = true } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? std(mat) : mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// 眼睛：湿润的眼球（虹膜画在贴图上）+ 一片眼皮。eye.userData.lid 的 rotation.x 决定睁多大
const LID_OPEN = -0.15, LID_SHUT = Math.PI / 2 + 0.2;
function eye(parent, x, y, z, r, ry, ball, lidMat) {
  const g = grp(parent, x, y, z);
  g.rotation.y = ry;
  part(g, SPH_LO, ball, { sx: r, sy: r, sz: r, cast: false });
  const lid = part(g, LID, lidMat, { sx: r * 1.14, sy: r * 1.14, sz: r * 1.14, cast: false });
  lid.rotation.x = LID_OPEN;
  g.userData.lid = lid;
  return g;
}
// 写实画风里不冒漫画气泡：表情全靠动作
const NO_EMOTE = { show() {}, update() {} };

// ---------- 两骨骼 IK（和窗外猴子同一套）----------
const DOWN = V(0, -1, 0);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _t = V(), _w = V();
const _q = new THREE.Quaternion();
function makeArm(parent, side, pos, L1, L2, r1, r2, m1, m2, hand) {
  const sh = grp(parent, pos.x, pos.y, pos.z);
  const up = grp(sh);
  part(up, CAP(r1, Math.max(0.001, L1 - r1)), m1, { y: -L1 / 2 });
  const el = grp(up, 0, -L1, 0);
  part(el, CAP(r2, Math.max(0.001, L2 - r2)), m2, { y: -L2 / 2 });
  const hd = grp(el, 0, -L2, 0);
  if (hand) hand(hd);
  return { sh, up, el, hand: hd, L1, L2, side, pole: V(side * 0.5, -0.2, -1).normalize(), cur: null };
}
function solveArm(arm, target, pole = arm.pole) {
  const { L1, L2 } = arm;
  const S = arm.sh.position;
  const d = _a.subVectors(target, S);
  const len = clamp(d.length(), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.002);
  d.normalize();
  const x = (L1 * L1 - L2 * L2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  const p = _b.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const E = _c.copy(S).addScaledVector(d, x).addScaledVector(p, h);
  const u = _d.subVectors(E, S).normalize();
  arm.up.quaternion.setFromUnitVectors(DOWN, u);
  const f = _e.copy(S).addScaledVector(d, len).sub(E).normalize().applyQuaternion(_q.copy(arm.up.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(DOWN, f);
}
// 手的目标点平滑地追过去
function reach(arm, target, dt, speed = 14, pole) {
  if (!arm.cur) arm.cur = target.clone();
  arm.cur.x = damp(arm.cur.x, target.x, speed, dt);
  arm.cur.y = damp(arm.cur.y, target.y, speed, dt);
  arm.cur.z = damp(arm.cur.z, target.z, speed, dt);
  solveArm(arm, arm.cur, pole);
}
function makeLeg(parent, side, pos, L1, L2, r1, r2, m1, m2, foot) {
  const hip = grp(parent, pos.x, pos.y, pos.z);
  part(hip, CAP(r1, Math.max(0.001, L1 - r1)), m1, { y: -L1 / 2 });
  const knee = grp(hip, 0, -L1, 0);
  part(knee, CAP(r2, Math.max(0.001, L2 - r2)), m2, { y: -L2 / 2 });
  const ft = grp(knee, 0, -L2, 0);
  if (foot) foot(ft);
  return { hip, knee, foot: ft, side };
}
// 让物体的本地 +y、+z 分别指向给定的世界方向（躺着、趴着用）
function orient(obj, yDir, zDir) {
  const y = yDir.clone().normalize(), z = zDir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// ---------- 公共：看向玩家、眨眼 ----------
class Creature {
  constructor(kind, name) {
    this.kind = kind; this.name = name;
    this.root = new THREE.Group(); this.root.name = `${kind}:${name}`;
    this.state = 'idle'; this.stateT = 0;
    this.blinkT = 1 + Math.random() * 3; this.blink = 0;
    this.eyes = []; this.lookW = 0; this.talkT = 0;
    this.headYaw = 0; this.headPitch = 0;
    this.phase = Math.random() * 10;
    this.fx = null; this.audio = null;
    this.emote = NO_EMOTE;
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  talk(sec = 2.8) { this.talkT = sec; }
  // squint：1 = 睁开，越小眯得越紧
  _blink(dt, squint = 1) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 1.8 + Math.random() * 3.5; }
    if (this.blink > 0) this.blink -= dt;
    const k = this.blink > 0 ? 0 : squint;
    for (const e of this.eyes) {
      const lid = e.userData.lid;
      const want = lerp(LID_SHUT, LID_OPEN, e.userData.wink ? 0 : k);
      lid.rotation.x = damp(lid.rotation.x, want, 34, dt);
    }
  }
  // 把世界坐标的玩家位置换到头的父节点坐标系里，算出转头角度
  _lookAt(headParent, head, target, dt, w, maxYaw = 1.1, maxPitch = 0.6) {
    let yaw = 0, pitch = 0;
    if (target && w > 0.001) {
      headParent.updateWorldMatrix(true, false);
      _t.copy(target);
      headParent.worldToLocal(_t).sub(head.position);
      yaw = clamp(Math.atan2(_t.x, _t.z), -maxYaw, maxYaw);
      pitch = clamp(-Math.atan2(_t.y, Math.hypot(_t.x, _t.z)), -maxPitch, maxPitch);
    }
    this.headYaw = damp(this.headYaw, yaw * w, 6, dt);
    this.headPitch = damp(this.headPitch, pitch * w, 6, dt);
  }
  worldHead(out = V()) { return this.head.getWorldPosition(out); }
}

// ======================= 鸡：打游戏 =======================
// breed：'white' 白来航 / 'brown' 红褐色的土鸡
export class Chicken extends Creature {
  constructor({ name, breed = 'white', headset = '#6a8aff', scale = 1.18 } = {}) {
    super('chicken', name);
    const R = this.root;
    R.scale.setScalar(scale); this.scale = scale;
    const white = breed === 'white';
    // 羽毛：顺着往下的一层层软羽（颜色有深浅），边缘一圈 sheen
    const F = hairMat(`feather${breed}`, () => TJ.genFur(white
      ? { base: '#d8d1c2', dark: '#8a8474', light: '#f4f0e6', seed: 3411, len: 16, width: 2.4, n: 2600, jitter: 0.3 }
      : { base: '#7a3a18', dark: '#2a1006', light: '#c8803e', seed: 3412, len: 16, width: 2.4, n: 2600, jitter: 0.3, spots: 30 }), { rough: 0.85, sheen: 0.7, sheenColor: white ? '#ffffff' : '#f0b070', normal: 0.7, repeat: [4, 2] });
    const neckF = white ? F : hairMat('feathergold', () => TJ.genFur({ base: '#b06a2a', dark: '#5a2a0c', light: '#f0b060', seed: 3413, len: 22, width: 1.8, n: 2600, jitter: 0.2 }), { rough: 0.7, sheen: 0.9, sheenColor: '#ffd090', normal: 0.6, repeat: [3, 1] });
    const tailF = white ? F : hairMat('feathertail', () => TJ.genFur({ base: '#5a2a10', dark: '#1a0a04', light: '#9a5a28', seed: 3414, len: 40, width: 1.6, n: 2000, jitter: 0.1 }), { rough: 0.6, sheen: 0.8, sheenColor: '#e0a060', repeat: [1, 1] });
    const comb = skinMat('#9c1f18', { rough: 0.42, bumps: 1.6, repeat: [3, 3] });
    const beak = std('#c9a045', 0.36);
    const leg = skinMat('#c8a040', { rough: 0.5, bumps: 1.8, repeat: [2, 6], seed: 3435 });
    const eyeM = eyeMat({ iris: '#d07a18', pupil: 0.42, sclera: '#5a3410', irisR: 0.7 });
    this.body = grp(R, 0, 0.4, 0);
    const T = this.torso = grp(this.body);
    // 身子：一颗往上收成脖子的"蛋"（车床旋转出来的轮廓），胸口再鼓出去一块
    const prof = [[0.001, -0.07], [0.1, -0.05], [0.17, 0.0], [0.215, 0.08], [0.23, 0.17], [0.215, 0.26], [0.18, 0.34], [0.13, 0.41], [0.088, 0.46], [0.066, 0.51], [0.056, 0.56], [0.001, 0.585]].map(([r, y]) => new THREE.Vector2(r, y));
    const bodyGeo = cached('gChickBody', () => new THREE.LatheGeometry(prof, 28));
    part(T, bodyGeo, F, { sz: 1.12 });
    part(T, SPH, F, { y: 0.15, z: 0.09, sx: 0.17, sy: 0.19, sz: 0.15 });
    part(T, CAP(0.068, 0.12), neckF, { y: 0.46, z: 0.01, rx: 0.12 });
    // 尾羽：几根收拢的、往后上方翘的长羽
    for (let i = -2; i <= 2; i++) part(T, SPH, tailF, { x: i * 0.022, y: 0.3 + (2 - Math.abs(i)) * 0.02, z: -0.2, sx: 0.022, sy: 0.14, sz: 0.045, rx: -0.95 - Math.abs(i) * 0.08, rz: i * 0.1 });
    const H = this.head = grp(T, 0, 0.6, 0.03);
    part(H, SPH, neckF, { sx: 0.06, sy: 0.066, sz: 0.074 });
    // 鸡冠：一排锯齿
    for (let k = 0; k < 5; k++) part(H, SPH_LO, comb, { y: 0.065 + Math.sin((k / 4) * Math.PI) * 0.018, z: 0.045 - k * 0.022, sx: 0.008, sy: 0.022 + Math.sin((k / 4) * Math.PI) * 0.01, sz: 0.014, cast: false });
    part(H, SPH, comb, { y: 0.05, z: 0.0, sx: 0.009, sy: 0.02, sz: 0.052 });
    // 喙：上喙 + 会动的下喙
    part(H, CONE(0.017, 0.045), beak, { y: 0.0, z: 0.088, rx: Math.PI / 2 + 0.25, sx: 1.1, sz: 0.8 });
    this.beak = grp(H, 0, -0.012, 0.064);
    part(this.beak, CONE(0.012, 0.03), beak, { z: 0.018, rx: Math.PI / 2 + 0.45, sx: 1.0, sz: 0.6, cast: false });
    // 肉垂 + 耳叶
    for (const s of [-1, 1]) part(H, SPH, comb, { x: s * 0.011, y: -0.048, z: 0.055, sx: 0.01, sy: 0.022, sz: 0.014, cast: false });
    for (const s of [-1, 1]) part(H, SPH_LO, white ? '#e8e2d6' : comb, { x: s * 0.056, y: -0.02, z: 0.0, sx: 0.007, sy: 0.012, sz: 0.011, cast: false });
    // 眼睛长在头两侧
    this.eyes = [eye(H, 0.047, 0.014, 0.034, 0.012, 1.05, eyeM, neckF), eye(H, -0.047, 0.014, 0.034, 0.012, -1.05, eyeM, neckF)];
    // 电竞耳机：耳罩外面一圈会变色的灯
    this.rgb = new THREE.MeshStandardMaterial({ color: '#111114', emissive: new THREE.Color(headset), emissiveIntensity: 1.1, roughness: 0.4 });
    const plastic = std('#16171a', 0.38);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 8, 30, Math.PI), plastic);
    band.position.set(0, 0.012, -0.012); band.castShadow = true; H.add(band);
    for (const s of [-1, 1]) {
      part(H, CYL(0.034, 0.034, 0.026), plastic, { x: s * 0.075, y: 0.0, z: -0.012, rz: Math.PI / 2 });
      part(H, CYL(0.03, 0.03, 0.012), std('#2a2a2e', 0.9), { x: s * 0.062, y: 0.0, z: -0.012, rz: Math.PI / 2, cast: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 24), this.rgb); ring.position.set(s * 0.089, 0, -0.012); ring.rotation.y = Math.PI / 2; H.add(ring);
    }
    const mic = new THREE.Mesh(CYL(0.004, 0.004, 0.09), plastic); mic.position.set(-0.07, -0.04, 0.04); mic.rotation.set(1.2, 0, -0.3); H.add(mic);
    // 翅膀当手：收拢的一片飞羽
    const wingHand = (h) => { part(h, SPH, tailF === F ? F : tailF, { y: -0.04, sx: 0.016, sy: 0.07, sz: 0.038, rz: 0.1 }); part(h, SPH, F, { x: 0.006, y: -0.02, sx: 0.018, sy: 0.045, sz: 0.036 }); };
    this.armL = makeArm(T, 1, V(0.2, 0.33, 0), 0.14, 0.13, 0.048, 0.04, F, F, wingHand);
    this.armR = makeArm(T, -1, V(-0.2, 0.33, 0), 0.14, 0.13, 0.048, 0.04, F, F, wingHand);
    for (const a of [this.armL, this.armR]) part(a.up, SPH, F, { x: a.side * 0.022, y: -0.08, z: -0.03, sx: 0.03, sy: 0.12, sz: 0.07 });
    const toes = (f) => { for (let k = -1; k <= 1; k++) part(f, CAP(0.008, 0.055), leg, { z: 0.032, x: k * 0.018, rx: Math.PI / 2, ry: k * 0.4, cast: false }); };
    this.legL = makeLeg(this.body, 1, V(0.09, 0.04, 0.03), 0.12, 0.17, 0.058, 0.013, F, leg, toes);
    this.legR = makeLeg(this.body, -1, V(-0.09, 0.04, 0.03), 0.12, 0.17, 0.058, 0.013, F, leg, toes);
    this.hype = 0; this.nextHype = 3 + Math.random() * 6; this.hue = Math.random();
    this.setState('game');
  }
  update(dt, t, ctx) {
    this.stateT += dt;
    const s = this.state, T = this.torso, st = this.stateT;
    const sc = this.scale;
    const seat = 0.46 / sc + 0.085;
    const stand = 0.46 / sc + 0.262; // 站在凳子上
    const pl = ctx.player;
    let lookW = this.talkT > 0 ? 1 : 0;
    this.talkT -= dt;
    let bodyY = seat, lean = 0.28, beakOpen = 0, squint = 1;
    // 耳机的 RGB 灯
    this.hue = (this.hue + dt * 0.25) % 1;
    this.rgb.emissive.setHSL(this.hue, 0.85, 0.5);
    if (s === 'game') {
      // 坐着，身体前倾，翅膀在键盘鼠标上狂按；时不时激动一下
      this.nextHype -= dt;
      if (this.nextHype <= 0 && this.hype <= 0) {
        this.hype = 1.4; this.nextHype = 6 + Math.random() * 9;
        if (this.audio && ctx.near(this)) this.audio.bawk();
      }
      const hy = this.hype > 0 ? Math.sin((1 - this.hype / 1.4) * Math.PI) : 0;
      this.hype = Math.max(0, this.hype - dt);
      bodyY = seat + hy * 0.14 + Math.abs(Math.sin(t * 7 + this.phase)) * 0.006;
      lean = 0.3 - hy * 0.35 + Math.sin(t * 2.3 + this.phase) * 0.03;
      beakOpen = hy * 0.6 + (Math.sin(t * 13) > 0.6 ? 0.15 : 0);
      const tap = Math.sin(t * 26 + this.phase) * 0.012;
      const kb = ctx.kbLocal, ms = ctx.mouseLocal;
      if (hy > 0.2) {
        _w.set(0.34, 0.95 + Math.sin(t * 22) * 0.08, 0.2); this._armTo(this.armL, _w, dt, 20);
        _w.set(-0.34, 0.95 + Math.sin(t * 22 + 1) * 0.08, 0.2); this._armTo(this.armR, _w, dt, 20);
      } else {
        _w.set(kb.x + 0.04 + tap, kb.y + 0.02 + Math.abs(Math.sin(t * 19 + this.phase)) * 0.025, kb.z); this._armTo(this.armL, _w, dt);
        _w.set(ms.x + Math.sin(t * 3.1) * 0.02, ms.y + 0.02, ms.z + Math.sin(t * 2.3) * 0.02); this._armTo(this.armR, _w, dt);
      }
      // 啄米式点头
      this.head.position.z = 0.03 + Math.sin(t * 8 + this.phase) * 0.012 + hy * 0.03;
      this.head.rotation.x = 0.12 - hy * 0.4;
      this._legsSit(t);
    } else if (s === 'rage') {
      // 断电了！蹦起来、狂拍翅膀、鸡毛乱飞
      bodyY = stand + Math.abs(Math.sin(t * 11)) * 0.12;
      lean = -0.15 + Math.sin(t * 9) * 0.1;
      beakOpen = 0.5 + Math.sin(t * 20) * 0.4;
      _w.set(0.5, 0.35 + Math.sin(t * 28) * 0.22, 0.05); this._armTo(this.armL, _w, dt, 40);
      _w.set(-0.5, 0.35 + Math.sin(t * 28 + 0.5) * 0.22, 0.05); this._armTo(this.armR, _w, dt, 40);
      this._legsStand(t, 1);
      this.head.rotation.x = -0.25 + Math.sin(t * 15) * 0.15;
      lookW = 0.6;
      if (st > 2.6) this.setState('sulk');
    } else if (s === 'sulk') {
      // 叉着翅膀、气鼓鼓地盯着你，时不时跺脚
      bodyY = stand; lean = -0.05; squint = 0.55;
      _w.set(-0.08, 0.2, 0.2); this._armTo(this.armL, _w, dt, 10);
      _w.set(0.08, 0.23, 0.22); this._armTo(this.armR, _w, dt, 10);
      this._legsStand(t, 0);
      this.legR.hip.rotation.x = Math.max(0, Math.sin(t * 6)) * -0.25;
      this.head.rotation.x = 0.05;
      lookW = 1;
      beakOpen = this.talkT > 0 ? Math.max(0, Math.sin(t * 16)) * 0.5 : 0;
    } else if (s === 'cheer') {
      bodyY = stand + Math.abs(Math.sin(t * 8 + this.phase)) * 0.18;
      lean = -0.1; beakOpen = 0.4;
      _w.set(0.35, 0.85 + Math.sin(t * 16) * 0.1, 0.1); this._armTo(this.armL, _w, dt, 20);
      _w.set(-0.35, 0.85 + Math.sin(t * 16 + 1) * 0.1, 0.1); this._armTo(this.armR, _w, dt, 20);
      this._legsStand(t, 1);
      lookW = 1;
    }
    this.body.position.y = damp(this.body.position.y, bodyY, 12, dt);
    T.rotation.x = damp(T.rotation.x, lean, 8, dt);
    this.beak.rotation.x = damp(this.beak.rotation.x, beakOpen * 0.5 + (this.talkT > 0 ? Math.max(0, Math.sin(t * 18)) * 0.3 : 0), 25, dt);
    this._lookAt(T, this.head, pl, dt, lookW);
    this.head.rotation.y = this.headYaw;
    if (lookW > 0.5) this.head.rotation.x = this.headPitch;
    this._blink(dt, squint);
  }
  _armTo(arm, pRoot, dt, speed = 14) {
    // pRoot：根节点（未缩放）坐标 → 躯干坐标
    this.root.updateWorldMatrix(true, true);
    _t.copy(pRoot);
    this.root.localToWorld(_t);
    this.torso.worldToLocal(_t);
    reach(arm, _t, dt, speed);
  }
  _legsSit(t) {
    for (const L of [this.legL, this.legR]) {
      L.hip.rotation.set(-1.45, 0, L.side * 0.12);
      L.knee.rotation.x = 1.1 + Math.sin(t * 3.2 + L.side * 1.3 + this.phase) * 0.35; // 脚丫子晃来晃去
    }
  }
  _legsStand(t, hop) {
    for (const L of [this.legL, this.legR]) {
      L.hip.rotation.set(Math.sin(t * 11 + L.side) * 0.3 * hop, 0, L.side * 0.08);
      L.knee.rotation.x = 0.1;
    }
  }
}

// ======================= 小黄鸡：在旁边加油 =======================
export class Chick extends Creature {
  constructor({ name = '小黄' } = {}) {
    super('chick', name);
    const R = this.root;
    const down = hairMat('chickdown', () => TJ.genFur({ base: '#e8c65a', dark: '#b8902a', light: '#fff0a8', seed: 3441, len: 7, width: 1.6, n: 3500, jitter: 2.2 }), { rough: 0.9, sheen: 1, sheenColor: '#fff4c0', sheenRoughness: 0.35, repeat: [3, 2] });
    const beak = std('#d89a3a', 0.4);
    const eyeM = eyeMat({ iris: '#1a120a', pupil: 0.7, sclera: '#0a0806', irisR: 0.9 });
    this.body = grp(R, 0, 0.1, 0);
    part(this.body, SPH, down, { sx: 0.1, sy: 0.095, sz: 0.105 });
    this.head = grp(this.body, 0, 0.1, 0.03);
    part(this.head, SPH, down, { sx: 0.068, sy: 0.066, sz: 0.068 });
    part(this.head, CONE(0.014, 0.03), beak, { y: -0.008, z: 0.07, rx: Math.PI / 2 });
    this.eyes = [eye(this.head, 0.042, 0.014, 0.038, 0.012, 0.85, eyeM, down), eye(this.head, -0.042, 0.014, 0.038, 0.012, -0.85, eyeM, down)];
    this.wings = [-1, 1].map((s) => { const w = grp(this.body, s * 0.09, 0.02, 0); part(w, SPH, down, { y: -0.02, sx: 0.018, sy: 0.045, sz: 0.04 }); return w; });
    for (const s of [-1, 1]) part(R, CAP(0.007, 0.05), '#c89a40', { x: s * 0.035, y: 0.02, z: 0.02, rx: Math.PI / 2, cast: false });
    this.happy = 0;
    this.setState('cheer');
  }
  pet() { this.happy = 2.2; }
  update(dt, t, ctx) {
    this.stateT += dt;
    const hop = this.happy > 0 ? Math.abs(Math.sin(t * 12)) * 0.1 : Math.max(0, Math.sin(t * 5 + this.phase)) ** 3 * 0.06;
    this.happy = Math.max(0, this.happy - dt);
    this.body.position.y = 0.1 + hop;
    const squish = 1 + (hop < 0.01 ? 0.05 : -0.03);
    this.body.scale.set(squish, 2 - squish, squish);
    const flap = this.happy > 0 ? Math.sin(t * 30) * 0.8 : Math.sin(t * 10) * 0.3 * (hop > 0.02 ? 1 : 0);
    this.wings[0].rotation.z = -0.3 - Math.abs(flap);
    this.wings[1].rotation.z = 0.3 + Math.abs(flap);
    const w = this.happy > 0 || this.talkT > 0 ? 1 : 0;
    this.talkT -= dt;
    this._lookAt(this.body, this.head, ctx.player, dt, w, 1.2);
    this.head.rotation.y = this.headYaw + (w ? 0 : Math.sin(t * 1.3) * 0.3);
    this.head.rotation.z = Math.sin(t * 2 + this.phase) * 0.12;
    this._blink(dt, this.happy > 0 ? 0.3 : 1);
  }
}

// ======================= 马：躺在床上刷手机 =======================
export class Horse extends Creature {
  constructor({ name, coat = '#8a5a38', mane = '#241810', muzzle = '#3a302c', pj = '#6f8aa0', pj2 = '#d8d4c8', feed = null, pose = 'back', baseYaw = 0, seed = 1 } = {}) {
    super('horse', name);
    this.pose = pose; this.baseYaw = baseYaw;
    const R = this.root;
    const C = hairMat(`coat${coat}`, () => TJ.genFur({ base: coat, dark: '#000000', light: '#ffffff', seed: 3450 + seed, len: 6, width: 0.9, n: 4200, jitter: 0.25 }), { rough: 0.6, sheen: 0.55, sheenColor: '#ffffff', sheenRoughness: 0.4, normal: 0.7, repeat: [3, 2] });
    const Mn = hairMat(`mane${mane}`, () => TJ.genFur({ base: mane, dark: '#000000', light: '#8a7a6a', seed: 3460 + seed, len: 30, width: 1.4, n: 3000, jitter: 0.2 }), { rough: 0.55, sheen: 0.8, sheenColor: '#ffffff', sheenRoughness: 0.3, repeat: [2, 1] });
    const Mz = skinMat(muzzle, { rough: 0.5, bumps: 0.7, seed: 3437 });
    const eyeM = eyeMat({ iris: '#3a2210', pupil: 0.62, sclera: '#1a100a', irisR: 1.0, slit: true });
    const hoofM = std('#23201c', 0.55);
    this.body = grp(R);
    const T = this.torso = grp(this.body);
    // 条纹棉睡衣
    const pjMat = fabricMat(`pj${pj}${pj2}`, (x, S) => { x.fillStyle = pj; x.fillRect(0, 0, S, S); x.fillStyle = pj2; for (let i = 0; i < S; i += 32) x.fillRect(0, i, S, 12); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 1500; i++) x.fillRect(Math.random() * S, Math.random() * S, 1, 1); });
    part(T, SPH, pjMat, { y: 0.22, sx: 0.2, sy: 0.28, sz: 0.16 });
    part(T, CAP(0.075, 0.1), C, { y: 0.5, z: 0.02, rx: 0.2 });
    const H = this.head = grp(T, 0, 0.62, 0.05);
    // 马头是长的：颅骨 + 往前下方伸出去的长脸 + 口鼻
    part(H, SPH, C, { y: 0.05, z: -0.02, sx: 0.1, sy: 0.11, sz: 0.12 });
    part(H, SPH, C, { y: -0.005, z: 0.13, sx: 0.078, sy: 0.08, sz: 0.17, rx: 0.3 });
    part(H, SPH, Mz, { y: -0.06, z: 0.27, sx: 0.07, sy: 0.066, sz: 0.075 });
    for (const s of [-1, 1]) part(H, SPH_LO, '#0e0a08', { x: s * 0.03, y: -0.05, z: 0.335, sx: 0.012, sy: 0.018, sz: 0.008, rz: s * 0.3, cast: false });
    this.jaw = grp(H, 0, -0.085, 0.14);
    part(this.jaw, SPH, Mz, { z: 0.1, sx: 0.055, sy: 0.026, sz: 0.1 });
    this.eyes = [eye(H, 0.086, 0.06, 0.05, 0.026, 0.95, eyeM, C), eye(H, -0.086, 0.06, 0.05, 0.026, -0.95, eyeM, C)];
    for (const s of [-1, 1]) {
      part(H, CONE(0.028, 0.1), C, { x: s * 0.055, y: 0.18, z: -0.04, rx: 0.2, rz: -s * 0.2, sz: 0.6 });
      part(H, CONE(0.016, 0.06), '#3a2a24', { x: s * 0.056, y: 0.175, z: -0.03, rx: 0.2, rz: -s * 0.2, sz: 0.4, cast: false });
    }
    // 鬃毛：脖子后面一整排 + 额前一撮
    const maneG = grp(H);
    [[0.16, -0.04, 0.05], [0.12, -0.1, 0.055], [0.04, -0.14, 0.055], [-0.05, -0.16, 0.05], [-0.13, -0.15, 0.045]].forEach(([y, z, r], i) => part(maneG, SPH, Mn, { y, z, sx: r * 0.55, sy: r * 1.3, sz: r * 1.1, rx: -0.3 + i * 0.1 }));
    part(maneG, SPH, Mn, { y: 0.14, z: 0.06, sx: 0.03, sy: 0.05, sz: 0.045, rx: 0.9 });
    for (let i = 0; i < 3; i++) part(T, SPH, Mn, { y: 0.52 - i * 0.07, z: -0.07, sx: 0.03, sy: 0.055, sz: 0.05 });
    const hoof = (h) => part(h, CYL(0.04, 0.046, 0.05), hoofM, { y: -0.015 });
    this.armL = makeArm(T, 1, V(0.19, 0.44, 0.02), 0.25, 0.24, 0.048, 0.04, pjMat, C, hoof);
    this.armR = makeArm(T, -1, V(-0.19, 0.44, 0.02), 0.25, 0.24, 0.048, 0.04, pjMat, C, hoof);
    this.legL = makeLeg(this.body, 1, V(0.09, 0.02, 0), 0.22, 0.21, 0.065, 0.048, pjMat, C, hoof);
    this.legR = makeLeg(this.body, -1, V(-0.09, 0.02, 0), 0.22, 0.21, 0.065, 0.048, pjMat, C, hoof);
    const tail = grp(this.body, 0, 0.03, -0.14);
    for (let k = -1; k <= 1; k++) part(tail, CAP(0.02, 0.22), Mn, { x: k * 0.018, y: -0.11, z: -0.03, rx: 0.5, rz: k * 0.15 });
    this.tail = tail;
    // 手机（屏幕是一张一直在上滑的短视频画布）
    this.phoneP = V(0.12, 0.8, 0.4);
    this.phone = grp(T, this.phoneP.x, this.phoneP.y, this.phoneP.z);
    part(this.phone, new THREE.BoxGeometry(1, 1, 1), std('#0c0c0e', 0.25, 0.3), { sx: 0.072, sy: 0.15, sz: 0.009 });
    if (feed) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.14), new THREE.MeshBasicMaterial({ map: feed, toneMapped: false, color: '#b8b8b8' }));
      scr.position.z = -0.005; scr.rotation.y = Math.PI; this.phone.add(scr);
      this.screen = scr;
    }
    this.phone.rotation.x = -0.5;
    this.laugh = 0; this.nextLaugh = 3 + Math.random() * 6;
    this.setState('scroll');
  }
  update(dt, t, ctx) {
    this.stateT += dt;
    const s = this.state, T = this.torso;
    let lookW = this.talkT > 0 ? 0.9 : 0;
    this.talkT -= dt;
    let jaw = 0, squint = 1, shake = 0;
    const phoneP = this.phoneP;
    if (s === 'scroll') {
      this.nextLaugh -= dt;
      if (this.nextLaugh <= 0 && this.laugh <= 0) {
        this.laugh = 1.6; this.nextLaugh = 5 + Math.random() * 8;
        if (this.audio && ctx.near(this)) this.audio.giggle();
      }
      const lg = this.laugh > 0 ? Math.sin((1 - this.laugh / 1.6) * Math.PI) : 0;
      this.laugh = Math.max(0, this.laugh - dt);
      jaw = lg * (0.4 + Math.abs(Math.sin(t * 18)) * 0.3);
      shake = lg * Math.sin(t * 30) * 0.05;
      squint = 1 - lg * 0.5;
      // 左蹄托着手机，右蹄往上划
      const swipe = ((t * 0.45 + this.phase) % 1);
      const sw = swipe > 0.8 ? (swipe - 0.8) / 0.2 : 0;
      _w.copy(phoneP).add(V(0.045, -0.04, 0)); reach(this.armL, _w, dt, 12, V(1, -0.6, 0));
      _w.copy(phoneP).add(V(-0.02, -0.06 + sw * 0.09, -0.01)); reach(this.armR, _w, dt, 20, V(-1, -0.6, 0));
      this.phone.position.lerp(phoneP, 1 - Math.exp(-dt * 6));
      this.head.rotation.x = damp(this.head.rotation.x, 0.25, 5, dt);
    } else if (s === 'blind') {
      // 开灯了！啊我的眼睛——两只蹄子捂着眼睛乱蹬
      _w.set(0.08, 0.72, 0.2); reach(this.armL, _w, dt, 16, V(1, -0.3, 0.5));
      _w.set(-0.08, 0.72, 0.2); reach(this.armR, _w, dt, 16, V(-1, -0.3, 0.5));
      this.phone.position.lerp(V(0.16, 0.3, 0.25), 1 - Math.exp(-dt * 5));
      jaw = 0.6; shake = Math.sin(t * 25) * 0.08;
      squint = 0;
      if (this.stateT > 2.8) this.setState('squint');
    } else if (s === 'squint') {
      // 眯着眼睛、手机放下来了，勉强抬头看你
      _w.set(0.12, 0.3, 0.2); reach(this.armL, _w, dt, 8);
      _w.set(-0.12, 0.3, 0.2); reach(this.armR, _w, dt, 8);
      this.phone.position.lerp(V(0.16, 0.3, 0.25), 1 - Math.exp(-dt * 5));
      squint = 0.4; lookW = 1;
      jaw = this.talkT > 0 ? Math.max(0, Math.sin(t * 15)) * 0.4 : 0;
    } else if (s === 'cheer') {
      _w.set(0.25, 0.95, 0.25 + Math.sin(t * 10) * 0.08); reach(this.armL, _w, dt, 16);
      _w.set(-0.25, 0.95, 0.25 + Math.sin(t * 10 + 1) * 0.08); reach(this.armR, _w, dt, 16);
      jaw = 0.5; lookW = 1;
    }
    // 腿：躺着时膝盖立起来晃；趴着时小腿翘在空中蹬
    for (const L of [this.legL, this.legR]) {
      const k = Math.sin(t * (this.pose === 'belly' ? 3.5 : 1.2) + L.side * 1.7 + this.phase);
      const kick = s === 'blind' ? Math.sin(t * 16 + L.side * 2) * 0.4 : 0;
      if (this.pose === 'belly') { L.hip.rotation.set(0.1, 0, L.side * 0.1); L.knee.rotation.x = -1.3 - k * 0.5 + kick; }
      else if (this.pose === 'side') { L.hip.rotation.set(-1.0 + k * 0.1 + kick, 0, L.side * 0.1); L.knee.rotation.x = 1.4; }
      else { L.hip.rotation.set(-0.9 + (L.side > 0 ? k * 0.15 : 0) + kick, 0, L.side * 0.18); L.knee.rotation.x = 1.5 - (L.side > 0 ? k * 0.15 : 0); }
    }
    this.tail.rotation.x = Math.sin(t * 2 + this.phase) * 0.3;
    this.jaw.rotation.x = damp(this.jaw.rotation.x, jaw * 0.45, 20, dt);
    T.rotation.z = shake;
    if (ctx.player) this._lookAt(T, this.head, ctx.player, dt, lookW, 0.9, 0.5);
    this.head.rotation.y = this.headYaw + this.baseYaw * (1 - lookW);
    if (lookW > 0.5) this.head.rotation.x = 0.1 + this.headPitch * 0.6;
    this._blink(dt, squint);
  }
  // 放到床上：back 仰躺 / side 侧躺（脸朝 faceDir）/ belly 趴着。headDir：头朝向（世界）
  lieOn(pos, headDir, pose = this.pose, faceDir = V(1, 0, 0)) {
    this.pose = pose;
    this.root.position.copy(pos);
    const up = V(0, 1, 0);
    if (pose === 'back') orient(this.root, headDir, up);
    else if (pose === 'belly') orient(this.root, headDir, up.clone().negate());
    else orient(this.root, headDir, faceDir);
  }
}

// ======================= 猴：对着镜子没完没了地摆造型 =======================
const MONKEY_POSES = [
  { name: 'flex', L: V(0.28, 0.62, 0.02), R: V(-0.28, 0.62, 0.02), yaw: 0, tilt: 0, lean: -0.05, wink: 0 },
  { name: 'hair', L: V(0.2, 0.08, 0.05), R: V(-0.05, 0.72, 0.08), yaw: 0.25, tilt: 0.15, lean: 0, wink: 0, comb: true },
  { name: 'gun', L: V(0.2, 0.08, 0.05), R: V(-0.12, 0.42, 0.42), yaw: -0.2, tilt: -0.1, lean: 0.05, wink: 1 },
  { name: 'kiss', L: V(0.2, 0.08, 0.05), R: V(-0.04, 0.5, 0.2), yaw: 0, tilt: 0.1, lean: 0.08, wink: 2, kiss: true },
  { name: 'profile', L: V(0.2, 0.08, 0.05), R: V(-0.2, 0.08, 0.05), yaw: 0.7, tilt: 0.05, lean: 0, wink: 0 },
  { name: 'peace', L: V(0.2, 0.08, 0.05), R: V(-0.12, 0.62, 0.14), yaw: -0.15, tilt: -0.25, lean: 0, wink: 1 },
];
export class Monkey extends Creature {
  constructor({ name, fur = '#6e5034', face = '#b88270', quiff = '#3a2818', accessory = 'chain', seed = 1 } = {}) {
    super('monkey', name);
    const R = this.root;
    const Fu = hairMat(`mfur${fur}`, () => TJ.genFur({ base: fur, dark: '#1a120a', light: '#c8a878', seed: 3470 + seed, len: 13, width: 1.1, n: 4500, jitter: 0.4 }), { rough: 0.8, sheen: 0.8, sheenColor: '#f0d8b0', sheenRoughness: 0.45, repeat: [3, 2] });
    const Q = hairMat(`mq${quiff}`, () => TJ.genFur({ base: quiff, dark: '#000000', light: '#8a6a4a', seed: 3480 + seed, len: 24, width: 1.3, n: 2500, angle: -Math.PI / 2, jitter: 0.3 }), { rough: 0.6, sheen: 0.9, sheenColor: '#ffe0b0', sheenRoughness: 0.35, repeat: [2, 2] });
    const Sk = skinMat(face, { rough: 0.58, bumps: 1.3, seed: 3436 + seed });
    const eyeM = eyeMat({ iris: '#5a3212', pupil: 0.46, sclera: '#d8c8b0', irisR: 0.55 });
    this.body = grp(R, 0, 0.42, 0);
    const T = this.torso = grp(this.body);
    part(T, SPH, Fu, { y: 0.2, sx: 0.16, sy: 0.22, sz: 0.13 });
    part(T, SPH, Sk, { y: 0.17, z: 0.07, sx: 0.1, sy: 0.14, sz: 0.075 });
    const H = this.head = grp(T, 0, 0.52, 0.01);
    part(H, SPH, Fu, { sx: 0.15, sy: 0.145, sz: 0.14 });
    // 脸：裸露的皮肤，眉骨、突出的口鼻
    part(H, SPH, Sk, { y: 0.0, z: 0.075, sx: 0.1, sy: 0.1, sz: 0.075 });
    part(H, SPH, Sk, { y: -0.05, z: 0.105, sx: 0.075, sy: 0.058, sz: 0.06 });
    part(H, SPH, Fu, { y: 0.058, z: 0.1, sx: 0.1, sy: 0.022, sz: 0.04, rx: -0.2 });
    for (const s of [-1, 1]) {
      part(H, SPH, Sk, { x: s * 0.148, y: 0.01, sx: 0.022, sy: 0.042, sz: 0.036 });
      part(H, SPH_LO, '#2a1610', { x: s * 0.012, y: -0.03, z: 0.16, sx: 0.006, sy: 0.005, sz: 0.004, cast: false });
    }
    this.eyes = [eye(H, 0.037, 0.024, 0.118, 0.022, 0.22, eyeM, Sk), eye(H, -0.037, 0.024, 0.118, 0.022, -0.22, eyeM, Sk)];
    // 嘴：一道深色的缝；飞吻时嘟起来
    this.mouth = grp(H, 0, -0.078, 0.148);
    const smile = part(this.mouth, CAP(0.0045, 0.045), '#2a1410', { rz: Math.PI / 2, cast: false });
    this.kissMouth = part(this.mouth, SPH_LO, skinMat('#9a5a50', { rough: 0.4, bumps: 0.5, seed: 3439 }), { z: 0.004, sx: 0.016, sy: 0.014, sz: 0.014, cast: false });
    this.kissMouth.visible = false; this.smile = smile;
    // 精心打理过的发型
    const q = grp(H, 0, 0.12, 0.02);
    [[0, 0.02, 0.07, 0.05, -0.5], [0, 0.04, 0.02, 0.055, -0.2], [0, 0.03, -0.05, 0.045, 0.2]].forEach(([x, y, z, r, rx]) => part(q, SPH, Q, { x, y, z, sx: r * 1.1, sy: r * 0.8, sz: r * 1.3, rx }));
    part(q, SPH, Q, { y: 0.05, z: 0.11, sx: 0.035, sy: 0.03, sz: 0.06, rx: -0.9 });
    this.quiff = q;
    if (accessory === 'chain') {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 40), std('#c9a24a', 0.22, 1));
      chain.position.set(0, 0.4, 0.02); chain.rotation.x = Math.PI / 2 - 0.35; T.add(chain);
      part(T, CYL(0.022, 0.022, 0.006), std('#c9a24a', 0.25, 1), { y: 0.33, z: 0.105, rx: Math.PI / 2 - 0.2 });
    } else if (accessory === 'band') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.016, 8, 36), fabricMat('band', (x, S) => { x.fillStyle = '#6a2a34'; x.fillRect(0, 0, S, S); x.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < S; i += 4) x.fillRect(0, i, S, 1); }, [6, 1]));
      band.position.set(0, 0.06, 0); band.rotation.x = Math.PI / 2 + 0.2; band.castShadow = true; H.add(band);
    }
    const hand = (h) => { part(h, SPH, Sk, { y: -0.02, sx: 0.036, sy: 0.046, sz: 0.03 }); part(h, CAP(0.01, 0.03), Sk, { x: 0.026, y: -0.01, z: 0.018, rz: -0.8, cast: false }); };
    this.armL = makeArm(T, 1, V(0.15, 0.36, 0), 0.2, 0.19, 0.04, 0.034, Fu, Fu, hand);
    this.armR = makeArm(T, -1, V(-0.15, 0.36, 0), 0.2, 0.19, 0.04, 0.034, Fu, Fu, hand);
    // 梳子（右手）
    this.comb = grp(this.armR.hand, 0, -0.06, 0.02);
    part(this.comb, new THREE.BoxGeometry(1, 1, 1), std('#2a1a14', 0.4), { sx: 0.018, sy: 0.1, sz: 0.008 });
    this.comb.visible = false;
    const foot = (f) => part(f, SPH, Sk, { z: 0.035, y: -0.01, sx: 0.04, sy: 0.022, sz: 0.07 });
    this.legL = makeLeg(this.body, 1, V(0.07, 0.03, 0), 0.19, 0.19, 0.046, 0.04, Fu, Fu, foot);
    this.legR = makeLeg(this.body, -1, V(-0.07, 0.03, 0), 0.19, 0.19, 0.046, 0.04, Fu, Fu, foot);
    const tc = new THREE.CatmullRomCurve3([V(0, 0.08, -0.1), V(0, 0.02, -0.28), V(0.05, 0.2, -0.4), V(0.12, 0.38, -0.34), V(0.08, 0.44, -0.24), V(0.02, 0.38, -0.22)]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tc, 40, 0.018, 8), Fu);
    tail.castShadow = true; this.tail = grp(this.body); this.tail.add(tail);
    this.pi = 0; this.poseT = 0; this.helmet = null; this.homeYaw = 0;
    this.cur = { ...MONKEY_POSES[0], L: MONKEY_POSES[0].L.clone(), R: MONKEY_POSES[0].R.clone() };
    this.setState('pose');
  }
  wearHelmet(h) {
    this.helmet = h;
    this.head.add(h);
    h.position.set(0, 0.045, -0.005); h.rotation.set(0, 0, 0); h.scale.setScalar(1.22);
    h.traverse((o) => { o.userData.noRay = true; });
    this.quiff.visible = false;
  }
  update(dt, t, ctx) {
    this.stateT += dt;
    const s = this.state;
    const pl = ctx.player;
    let tgt = null, lookW = 0, faceYaw = this.homeYaw;
    if (s === 'pose' || s === 'proud') {
      this.poseT -= dt;
      if (this.poseT <= 0) {
        this.pi = (this.pi + 1 + (Math.random() < 0.3 ? 1 : 0)) % MONKEY_POSES.length;
        this.poseT = (s === 'proud' ? 1.6 : 2.1) + Math.random() * 0.8;
      }
      tgt = MONKEY_POSES[this.pi];
      if (s === 'proud' && tgt.name === 'hair') tgt = MONKEY_POSES[0];
    } else if (s === 'talk' || s === 'turn') {
      tgt = { L: V(0.2, 0.08, 0.05), R: V(-0.12, 0.3 + Math.max(0, Math.sin(t * 5)) * 0.2, 0.2), yaw: 0, tilt: 0.1, lean: 0, wink: 0 };
      lookW = 1;
      if (pl) {
        this.root.updateWorldMatrix(true, false);
        faceYaw = Math.atan2(pl.x - this.root.position.x, pl.z - this.root.position.z);
      }
      if (s === 'talk' && this.stateT > 3.2) this.setState(this.helmet ? 'proud' : 'pose');
    } else if (s === 'cheer') {
      tgt = { L: V(0.25, 0.85, 0.1), R: V(-0.25, 0.85 + Math.sin(t * 12) * 0.05, 0.1), yaw: 0, tilt: 0, lean: -0.1, wink: 0 };
      lookW = 1;
      if (pl) faceYaw = Math.atan2(pl.x - this.root.position.x, pl.z - this.root.position.z);
    }
    const c = this.cur, k = 1 - Math.exp(-dt * 7);
    c.L.lerp(tgt.L, k); c.R.lerp(tgt.R, k);
    c.yaw = lerp(c.yaw, tgt.yaw, k); c.tilt = lerp(c.tilt, tgt.tilt, k); c.lean = lerp(c.lean, tgt.lean, k);
    // 梳头时手在头顶来回刷
    const R = c.R.clone();
    if (tgt.comb && s !== 'talk') { R.z += Math.sin(t * 7) * 0.08; R.x += Math.sin(t * 3.5) * 0.03; }
    this.comb.visible = !!tgt.comb;
    solveArm(this.armL, c.L, V(1, -0.2, -0.6).normalize());
    solveArm(this.armR, R, V(-1, -0.2, -0.6).normalize());
    this.root.rotation.y = dampAngle(this.root.rotation.y, faceYaw, 5, dt);
    this.torso.rotation.set(c.lean + Math.sin(t * 2) * 0.02, c.yaw * 0.6, Math.sin(t * 1.7) * 0.03);
    this._lookAt(this.torso, this.head, pl, dt, lookW, 1.0, 0.4);
    this.head.rotation.set(this.headPitch * lookW + (s === 'proud' ? -0.15 : 0), c.yaw * 0.5 + this.headYaw, c.tilt);
    // 站姿：重心在两条腿之间换来换去
    const sway = Math.sin(t * 1.5 + this.phase);
    this.body.position.y = 0.42 + (s === 'cheer' ? Math.abs(Math.sin(t * 8)) * 0.12 : 0);
    this.legL.hip.rotation.set(0, 0, 0.05 + sway * 0.04); this.legR.hip.rotation.set(0, 0, -0.05 + sway * 0.04);
    this.legL.knee.rotation.x = 0.04; this.legR.knee.rotation.x = 0.04 + Math.max(0, -sway) * 0.15;
    this.tail.rotation.y = Math.sin(t * 1.8 + this.phase) * 0.3;
    // 眨眼 / wink / 嘟嘴
    this.eyes[1].userData.wink = tgt.wink === 1 && s !== 'talk';
    this.eyes[0].userData.wink = false;
    this.kissMouth.visible = tgt.wink === 2; this.smile.visible = !this.kissMouth.visible;
    this._blink(dt, 1);
  }
}
