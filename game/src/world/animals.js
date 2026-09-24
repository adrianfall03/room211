// 第三章的动物室友：拟人化的鸡（打游戏）、马（躺床上刷手机）、猴（对着镜子没完没了地摆造型）、一只小黄鸡。
//   全部程序化建模：三阶卡通着色 + 描边；手臂用两骨骼 IK 放到目标点上，每种动物有几套状态（常态 / 被打断 / 聊天 / 欢呼）
import * as THREE from 'three';
import { toonMat, addOutline, GRAD } from './toonkit.js';
import { Emote } from './fx.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SPH = new THREE.SphereGeometry(1, 22, 16);
const SPH_LO = new THREE.SphereGeometry(1, 12, 9);
const gcache = new Map();
const CAP = (r, l) => { const k = `c${r},${l}`; if (!gcache.has(k)) gcache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.001, l), 6, 12)); return gcache.get(k); };
const CYL = (r0, r1, h) => { const k = `y${r0},${r1},${h}`; if (!gcache.has(k)) gcache.set(k, new THREE.CylinderGeometry(r0, r1, h, 14)); return gcache.get(k); };
const CONE = (r, h) => { const k = `k${r},${h}`; if (!gcache.has(k)) gcache.set(k, new THREE.ConeGeometry(r, h, 14)); return gcache.get(k); };

function part(parent, geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, outline = true, emissive = null, ei = 0.35, cast = true } = {}) {
  const m = new THREE.Mesh(geo, toonMat(color, { emissive, emissiveIntensity: ei }));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m);
  if (outline) addOutline(m, { thickness: 2.6 });
  return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// 大眼睛：眼白 + 黑眼珠 + 高光。返回的 group 缩放 y 就是眨眼
function eye(parent, x, y, z, r, ry = 0) {
  const g = grp(parent, x, y, z);
  g.rotation.y = ry;
  part(g, SPH, '#f8f8f8', { sx: r, sy: r * 1.18, sz: r * 0.62, emissive: '#ffffff', ei: 0.12 });
  const pupil = grp(g, 0, 0, 0);
  part(pupil, SPH_LO, '#2a1830', { z: r * 0.36, sx: r * 0.6, sy: r * 0.74, sz: r * 0.36, outline: false });
  const hl = new THREE.Mesh(SPH_LO, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  hl.position.set(-r * 0.2, r * 0.3, r * 0.62); hl.scale.setScalar(r * 0.22);
  pupil.add(hl);
  g.userData.pupil = pupil;
  return g;
}

// ---------- 两骨骼 IK（和窗外猴子同一套）----------
const DOWN = V(0, -1, 0);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _t = V(), _w = V();
const _q = new THREE.Quaternion();
function makeArm(parent, side, pos, L1, L2, r1, r2, c1, c2, hand) {
  const sh = grp(parent, pos.x, pos.y, pos.z);
  const up = grp(sh);
  part(up, CAP(r1, Math.max(0.001, L1 - r1)), c1, { y: -L1 / 2 });
  const el = grp(up, 0, -L1, 0);
  part(el, CAP(r2, Math.max(0.001, L2 - r2)), c2, { y: -L2 / 2 });
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
function makeLeg(parent, side, pos, L1, L2, r1, r2, c1, c2, foot) {
  const hip = grp(parent, pos.x, pos.y, pos.z);
  part(hip, CAP(r1, Math.max(0.001, L1 - r1)), c1, { y: -L1 / 2 });
  const knee = grp(hip, 0, -L1, 0);
  part(knee, CAP(r2, Math.max(0.001, L2 - r2)), c2, { y: -L2 / 2 });
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

// ---------- 公共：看向玩家、眨眼、表情气泡 ----------
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
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  talk(sec = 2.8) { this.talkT = sec; }
  _blink(dt, squint = 1) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 1.8 + Math.random() * 3.5; }
    if (this.blink > 0) this.blink -= dt;
    const k = this.blink > 0 ? 0.08 : squint;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, e.userData.wink ? 0.08 : k, 30, dt);
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
export class Chicken extends Creature {
  constructor({ name, color = '#f4ebe0', comb = '#ff5a6a', headset = '#6a5aff', scale = 1.18 } = {}) {
    super('chicken', name);
    const R = this.root;
    R.scale.setScalar(scale); this.scale = scale;
    this.body = grp(R, 0, 0.4, 0);
    const T = this.torso = grp(this.body);
    part(T, SPH, color, { y: 0.21, sx: 0.25, sy: 0.3, sz: 0.24 });
    part(T, SPH, '#fff1cc', { y: 0.16, z: 0.1, sx: 0.18, sy: 0.2, sz: 0.16, outline: false });
    // 尾巴：几根往上翘的羽毛
    for (let i = -1; i <= 1; i++) part(T, SPH, i ? color : '#ffe8b0', { x: i * 0.07, y: 0.36, z: -0.2, sx: 0.05, sy: 0.14, sz: 0.04, rx: -0.6, rz: i * 0.4 });
    const H = this.head = grp(T, 0, 0.52, 0.03);
    part(H, SPH, color, { sx: 0.18, sy: 0.17, sz: 0.17 });
    for (const [z, r, y] of [[0.06, 0.045, 0.16], [0.0, 0.058, 0.19], [-0.07, 0.048, 0.165]]) part(H, SPH, comb, { y, z, sx: r * 0.7, sy: r, sz: r });
    part(H, CONE(0.05, 0.1), '#ffb030', { y: -0.005, z: 0.2, rx: Math.PI / 2, sy: 1, sx: 1.2, sz: 0.8 });
    this.beak = grp(H, 0, -0.035, 0.15);
    part(this.beak, CONE(0.04, 0.07), '#ff9a20', { z: 0.05, rx: Math.PI / 2 + 0.25, sx: 1.1, sz: 0.6 });
    part(H, SPH, comb, { y: -0.1, z: 0.15, sx: 0.028, sy: 0.045, sz: 0.025 });
    this.eyes = [eye(H, 0.075, 0.035, 0.125, 0.048, 0.4), eye(H, -0.075, 0.035, 0.125, 0.048, -0.4)];
    for (const s of [-1, 1]) part(H, SPH_LO, '#ffa0b4', { x: s * 0.12, y: -0.04, z: 0.1, sx: 0.035, sy: 0.02, sz: 0.02, outline: false });
    // 电竞耳机：发光的耳罩
    this.rgb = new THREE.MeshToonMaterial({ color: '#222233', emissive: new THREE.Color(headset), emissiveIntensity: 0.8 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 8, 26, Math.PI), toonMat('#2a2a3a'));
    band.position.y = 0.01; H.add(band); addOutline(band);
    for (const s of [-1, 1]) {
      part(H, CYL(0.07, 0.07, 0.05), '#2a2a3a', { x: s * 0.18, y: 0.0, rz: Math.PI / 2 });
      const ring = new THREE.Mesh(CYL(0.052, 0.052, 0.052), this.rgb); ring.position.set(s * 0.185, 0, 0); ring.rotation.z = Math.PI / 2; H.add(ring);
    }
    const mic = new THREE.Mesh(CYL(0.008, 0.008, 0.16), toonMat('#2a2a3a')); mic.position.set(-0.17, -0.07, 0.08); mic.rotation.set(1.2, 0, -0.3); H.add(mic);
    // 翅膀当手：三根羽毛手指
    const wingHand = (h) => { for (let k = -1; k <= 1; k++) part(h, SPH, k ? color : '#ffe8b0', { x: k * 0.025, y: -0.03, sx: 0.022, sy: 0.05, sz: 0.018, rz: k * 0.3 }); };
    this.armL = makeArm(T, 1, V(0.23, 0.33, 0), 0.14, 0.13, 0.052, 0.046, color, color, wingHand);
    this.armR = makeArm(T, -1, V(-0.23, 0.33, 0), 0.14, 0.13, 0.052, 0.046, color, color, wingHand);
    for (const a of [this.armL, this.armR]) part(a.up, SPH, color, { x: a.side * 0.03, y: -0.08, z: -0.03, sx: 0.035, sy: 0.12, sz: 0.07 });
    const toes = (f) => { for (let k = -1; k <= 1; k++) part(f, CAP(0.012, 0.06), '#ff9a20', { z: 0.035, x: k * 0.022, rx: Math.PI / 2, ry: k * 0.4 }); };
    this.legL = makeLeg(this.body, 1, V(0.1, 0.04, 0.03), 0.12, 0.17, 0.06, 0.016, color, '#ff9a20', toes);
    this.legR = makeLeg(this.body, -1, V(-0.1, 0.04, 0.03), 0.12, 0.17, 0.06, 0.016, color, '#ff9a20', toes);
    this.emote = new Emote(R, 1.05);
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
    this.rgb.emissive.setHSL(this.hue, 0.9, 0.55);
    if (s === 'game') {
      // 坐着，身体前倾，翅膀在键盘鼠标上狂按；时不时激动一下
      this.nextHype -= dt;
      if (this.nextHype <= 0 && this.hype <= 0) {
        this.hype = 1.4; this.nextHype = 6 + Math.random() * 9;
        this.emote.show(Math.random() < 0.6 ? '!' : 'star', 1.2);
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
      // 小鸡啄米式点头
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
      // 叉着翅膀、气鼓鼓地盯着你
      bodyY = stand; lean = -0.05; squint = 0.55;
      _w.set(-0.08, 0.2, 0.2); this._armTo(this.armL, _w, dt, 10);
      _w.set(0.08, 0.23, 0.22); this._armTo(this.armR, _w, dt, 10);
      this._legsStand(t, 0);
      this.legR.hip.rotation.x = Math.max(0, Math.sin(t * 6)) * -0.25; // 跺脚
      this.head.rotation.x = 0.05;
      lookW = 1;
      beakOpen = this.talkT > 0 ? Math.max(0, Math.sin(t * 16)) * 0.5 : 0;
      if (st > 1 && Math.floor(st / 3.2) !== Math.floor((st - dt) / 3.2)) this.emote.show('anger', 1.2);
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
    this.beak.rotation.x = damp(this.beak.rotation.x, beakOpen * 0.6 + (this.talkT > 0 ? Math.max(0, Math.sin(t * 18)) * 0.35 : 0), 25, dt);
    this._lookAt(T, this.head, pl, dt, lookW);
    this.head.rotation.y = this.headYaw;
    if (lookW > 0.5) this.head.rotation.x = this.headPitch;
    this._blink(dt, squint);
    this.emote.update(dt);
  }
  _armTo(arm, pRoot, dt, speed = 14) {
    // pRoot：根节点（未缩放）坐标 → 躯干坐标
    this.root.updateWorldMatrix(true, true);
    _t.copy(pRoot).divideScalar(1);
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
    this.body = grp(R, 0, 0.1, 0);
    part(this.body, SPH, '#ffe066', { sx: 0.11, sy: 0.1, sz: 0.1 });
    this.head = grp(this.body, 0, 0.12, 0.01);
    part(this.head, SPH, '#ffe066', { sx: 0.08, sy: 0.075, sz: 0.075 });
    part(this.head, SPH, '#ffe066', { y: 0.07, z: -0.01, sx: 0.015, sy: 0.035, sz: 0.012, rz: 0.3 });
    part(this.head, CONE(0.02, 0.04), '#ff9a20', { y: -0.01, z: 0.08, rx: Math.PI / 2 });
    this.eyes = [eye(this.head, 0.032, 0.015, 0.06, 0.022, 0.4), eye(this.head, -0.032, 0.015, 0.06, 0.022, -0.4)];
    for (const s of [-1, 1]) part(this.head, SPH_LO, '#ffa0b4', { x: s * 0.052, y: -0.02, z: 0.05, sx: 0.016, sy: 0.009, sz: 0.01, outline: false });
    this.wings = [-1, 1].map((s) => { const w = grp(this.body, s * 0.1, 0.02, 0); part(w, SPH, '#ffd83a', { y: -0.02, sx: 0.02, sy: 0.05, sz: 0.04 }); return w; });
    for (const s of [-1, 1]) part(R, CAP(0.01, 0.05), '#ff9a20', { x: s * 0.04, y: 0.02, z: 0.02, rx: Math.PI / 2 });
    this.emote = new Emote(R, 0.42);
    this.happy = 0;
    this.setState('cheer');
  }
  pet() { this.happy = 2.2; this.emote.show('heart', 1.8, 0.2); }
  update(dt, t, ctx) {
    this.stateT += dt;
    const hop = this.happy > 0 ? Math.abs(Math.sin(t * 12)) * 0.12 : Math.max(0, Math.sin(t * 5 + this.phase)) ** 3 * 0.08;
    this.happy = Math.max(0, this.happy - dt);
    this.body.position.y = 0.1 + hop;
    const squish = 1 + (hop < 0.01 ? 0.08 : -0.04);
    this.body.scale.set(squish, 2 - squish, squish);
    const flap = this.happy > 0 ? Math.sin(t * 30) * 0.8 : Math.sin(t * 10) * 0.3 * (hop > 0.02 ? 1 : 0);
    this.wings[0].rotation.z = -0.3 - Math.abs(flap);
    this.wings[1].rotation.z = 0.3 + Math.abs(flap);
    const w = this.happy > 0 || this.talkT > 0 ? 1 : 0;
    this.talkT -= dt;
    this._lookAt(this.body, this.head, ctx.player, dt, w, 1.2);
    this.head.rotation.y = this.headYaw + (w ? 0 : Math.sin(t * 1.3) * 0.3);
    this.head.rotation.z = Math.sin(t * 2 + this.phase) * 0.12;
    this._blink(dt, this.happy > 0 ? 0.25 : 1);
    this.emote.update(dt);
  }
}

// ======================= 马：躺在床上刷手机 =======================
export class Horse extends Creature {
  constructor({ name, coat = '#c98a5a', muzzle = '#f5dcc0', mane = '#6a3a3a', pj = '#9fd4ff', pj2 = '#ffffff', feed = null, pose = 'back', baseYaw = 0 } = {}) {
    super('horse', name);
    this.pose = pose; this.baseYaw = baseYaw;
    const R = this.root;
    this.body = grp(R);
    const T = this.torso = grp(this.body);
    // 条纹睡衣
    const pjTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = pj; x.fillRect(0, 0, 64, 64); x.fillStyle = pj2; for (let i = 0; i < 64; i += 16) x.fillRect(0, i, 64, 7);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); return t;
    })();
    const pjMat = new THREE.MeshToonMaterial({ color: '#ffffff', map: pjTex, gradientMap: GRAD });
    const torsoMesh = new THREE.Mesh(SPH, pjMat); torsoMesh.position.y = 0.22; torsoMesh.scale.set(0.2, 0.28, 0.16); torsoMesh.castShadow = true; T.add(torsoMesh); addOutline(torsoMesh);
    part(T, CAP(0.075, 0.1), coat, { y: 0.5, z: 0.02, rx: 0.2 });
    const H = this.head = grp(T, 0, 0.62, 0.05);
    part(H, SPH, coat, { y: 0.04, sx: 0.12, sy: 0.13, sz: 0.14 });
    part(H, SPH, muzzle, { y: -0.05, z: 0.13, sx: 0.1, sy: 0.08, sz: 0.11 });
    for (const s of [-1, 1]) part(H, SPH_LO, '#6a3a3a', { x: s * 0.036, y: -0.035, z: 0.235, sx: 0.013, sy: 0.02, sz: 0.01, outline: false });
    this.jaw = grp(H, 0, -0.1, 0.06);
    part(this.jaw, SPH, muzzle, { z: 0.06, sx: 0.085, sy: 0.035, sz: 0.09 });
    part(this.jaw, new THREE.BoxGeometry(1, 1, 1), '#ffffff', { y: 0.025, z: 0.13, sx: 0.07, sy: 0.02, sz: 0.02, outline: false });
    this.eyes = [eye(H, 0.078, 0.07, 0.085, 0.046, 0.55), eye(H, -0.078, 0.07, 0.085, 0.046, -0.55)];
    for (const s of [-1, 1]) {
      part(H, CONE(0.04, 0.11), coat, { x: s * 0.065, y: 0.17, z: -0.03, rz: -s * 0.35 });
      part(H, CONE(0.022, 0.07), '#ffb0c0', { x: s * 0.066, y: 0.165, z: -0.008, rz: -s * 0.35, outline: false });
      part(H, SPH_LO, '#ffa0b4', { x: s * 0.085, y: -0.04, z: 0.15, sx: 0.03, sy: 0.018, sz: 0.02, outline: false });
    }
    // 鬃毛
    const maneG = grp(H);
    [[0.16, 0.1, 0.05], [0.18, 0.02, 0.055], [0.15, -0.07, 0.05], [0.08, -0.14, 0.05], [-0.02, -0.18, 0.045]].forEach(([y, z, r], i) => part(maneG, SPH, mane, { y, z, sx: r * 0.8, sy: r, sz: r * 1.2, rx: i * 0.3 }));
    part(maneG, SPH, mane, { y: 0.14, z: 0.13, sx: 0.035, sy: 0.05, sz: 0.04, rx: 0.8 });
    for (let i = 0; i < 3; i++) part(T, SPH, mane, { y: 0.52 - i * 0.07, z: -0.07, sx: 0.04, sy: 0.05, sz: 0.05 });
    const hoof = (h) => part(h, CYL(0.045, 0.05, 0.05), '#5a3a3a', { y: -0.015 });
    this.armL = makeArm(T, 1, V(0.19, 0.44, 0.02), 0.25, 0.24, 0.048, 0.042, pj, coat, hoof);
    this.armR = makeArm(T, -1, V(-0.19, 0.44, 0.02), 0.25, 0.24, 0.048, 0.042, pj, coat, hoof);
    this.legL = makeLeg(this.body, 1, V(0.09, 0.02, 0), 0.22, 0.21, 0.065, 0.05, pj, coat, hoof);
    this.legR = makeLeg(this.body, -1, V(-0.09, 0.02, 0), 0.22, 0.21, 0.065, 0.05, pj, coat, hoof);
    const tail = grp(this.body, 0, 0.03, -0.14);
    for (let k = -1; k <= 1; k++) part(tail, CAP(0.02, 0.2), mane, { x: k * 0.02, y: -0.1, z: -0.03, rx: 0.5, rz: k * 0.2 });
    this.tail = tail;
    // 手机（屏幕是一张一直在上滑的短视频画布）
    this.phone = grp(T, 0.1, 0.8, 0.3);
    part(this.phone, new THREE.BoxGeometry(1, 1, 1), '#2a2a3a', { sx: 0.075, sy: 0.14, sz: 0.012 });
    if (feed) {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.128), new THREE.MeshBasicMaterial({ map: feed, toneMapped: false }));
      scr.position.z = -0.0065; scr.rotation.y = Math.PI; this.phone.add(scr);
      this.screen = scr;
    }
    this.phone.rotation.x = -0.5;
    this.emote = new Emote(R, 0);
    this.laugh = 0; this.nextLaugh = 3 + Math.random() * 6;
    this.setState('scroll');
  }
  update(dt, t, ctx) {
    this.stateT += dt;
    const s = this.state, T = this.torso;
    let lookW = this.talkT > 0 ? 0.9 : 0;
    this.talkT -= dt;
    let jaw = 0, squint = 1, shake = 0;
    const phoneP = V(0.1, 0.8, 0.3);
    if (s === 'scroll') {
      this.nextLaugh -= dt;
      if (this.nextLaugh <= 0 && this.laugh <= 0) {
        this.laugh = 1.6; this.nextLaugh = 5 + Math.random() * 8;
        this.emote.show(Math.random() < 0.5 ? 'note' : 'heart', 1.4);
        if (this.audio && ctx.near(this)) this.audio.giggle();
      }
      const lg = this.laugh > 0 ? Math.sin((1 - this.laugh / 1.6) * Math.PI) : 0;
      this.laugh = Math.max(0, this.laugh - dt);
      jaw = lg * (0.4 + Math.abs(Math.sin(t * 18)) * 0.3);
      shake = lg * Math.sin(t * 30) * 0.06;
      // 左蹄托着手机，右蹄往上划
      const swipe = ((t * 0.45 + this.phase) % 1);
      const sw = swipe > 0.8 ? (swipe - 0.8) / 0.2 : 0;
      _w.copy(phoneP).add(V(0.045, -0.04, 0)); reach(this.armL, _w, dt, 12, V(1, -0.6, 0));
      _w.copy(phoneP).add(V(-0.02, -0.06 + sw * 0.09, -0.01)); reach(this.armR, _w, dt, 20, V(-1, -0.6, 0));
      this.phone.position.lerp(phoneP, 1 - Math.exp(-dt * 6));
      this.head.rotation.x = damp(this.head.rotation.x, 0.25, 5, dt);
    } else if (s === 'blind') {
      // 开灯了！啊我的眼睛——两只蹄子捂着眼睛乱蹬
      _w.set(0.07, 0.72, 0.18); reach(this.armL, _w, dt, 16, V(1, -0.3, 0.5));
      _w.set(-0.07, 0.72, 0.18); reach(this.armR, _w, dt, 16, V(-1, -0.3, 0.5));
      this.phone.position.lerp(V(0.16, 0.3, 0.25), 1 - Math.exp(-dt * 5));
      jaw = 0.6; shake = Math.sin(t * 25) * 0.08;
      squint = 0.1;
      if (this.stateT > 2.8) this.setState('squint');
    } else if (s === 'squint') {
      // 眯着眼睛、手机放下来了，勉强抬头看你
      _w.set(0.12, 0.3, 0.2); reach(this.armL, _w, dt, 8);
      _w.set(-0.12, 0.3, 0.2); reach(this.armR, _w, dt, 8);
      this.phone.position.lerp(V(0.16, 0.3, 0.25), 1 - Math.exp(-dt * 5));
      squint = 0.45; lookW = 1;
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
    this.jaw.rotation.x = damp(this.jaw.rotation.x, jaw * 0.5, 20, dt);
    T.rotation.z = shake;
    if (ctx.player) this._lookAt(T, this.head, ctx.player, dt, lookW, 0.9, 0.5);
    this.head.rotation.y = this.headYaw + this.baseYaw * (1 - lookW);
    if (lookW > 0.5) this.head.rotation.x = 0.1 + this.headPitch * 0.6;
    this._blink(dt, squint);
    this.emote.update(dt, this.head.getWorldPosition(_t).add(_w.set(0, 0.36, 0)));
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
  constructor({ name, fur = '#a8683c', face = '#f7d7b5', quiff = '#6a3a22', accessory = 'chain' } = {}) {
    super('monkey', name);
    const R = this.root;
    this.body = grp(R, 0, 0.42, 0);
    const T = this.torso = grp(this.body);
    part(T, SPH, fur, { y: 0.2, sx: 0.16, sy: 0.22, sz: 0.13 });
    part(T, SPH, face, { y: 0.17, z: 0.07, sx: 0.11, sy: 0.15, sz: 0.08, outline: false });
    const H = this.head = grp(T, 0, 0.52, 0.01);
    part(H, SPH, fur, { sx: 0.165, sy: 0.155, sz: 0.15 });
    for (const s of [-1, 1]) part(H, SPH, face, { x: s * 0.045, y: 0.02, z: 0.08, sx: 0.065, sy: 0.075, sz: 0.06, outline: false });
    part(H, SPH, face, { y: -0.055, z: 0.1, sx: 0.09, sy: 0.065, sz: 0.07 });
    for (const s of [-1, 1]) {
      part(H, SPH, fur, { x: s * 0.165, y: 0.01, sx: 0.035, sy: 0.06, sz: 0.06 });
      part(H, SPH_LO, face, { x: s * 0.18, y: 0.01, z: 0.01, sx: 0.015, sy: 0.04, sz: 0.04, outline: false });
      part(H, SPH_LO, '#5a3020', { x: s * 0.015, y: -0.035, z: 0.165, sx: 0.008, sy: 0.006, sz: 0.005, outline: false });
      part(H, SPH_LO, '#ff9ab0', { x: s * 0.085, y: -0.035, z: 0.12, sx: 0.028, sy: 0.016, sz: 0.015, outline: false });
    }
    this.eyes = [eye(H, 0.046, 0.025, 0.128, 0.04, 0.25), eye(H, -0.046, 0.025, 0.128, 0.04, -0.25)];
    this.mouth = grp(H, 0, -0.075, 0.165);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 6, 14, Math.PI), toonMat('#5a2020'));
    smile.rotation.z = Math.PI; this.mouth.add(smile);
    this.kissMouth = part(this.mouth, SPH_LO, '#ff6a8a', { sx: 0.018, sy: 0.018, sz: 0.012, outline: false });
    this.kissMouth.visible = false; this.smile = smile;
    // 精心打理过的发型
    const q = grp(H, 0, 0.13, 0.02);
    [[0, 0.02, 0.08, 0.05, -0.5], [0, 0.04, 0.02, 0.055, -0.2], [0, 0.03, -0.05, 0.045, 0.2]].forEach(([x, y, z, r, rx]) => part(q, SPH, quiff, { x, y, z, sx: r * 1.1, sy: r * 0.8, sz: r * 1.3, rx }));
    part(q, SPH, quiff, { y: 0.05, z: 0.12, sx: 0.035, sy: 0.03, sz: 0.06, rx: -0.9 });
    this.quiff = q;
    if (accessory === 'chain') {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), toonMat('#ffcf3a', { emissive: '#ffb000', emissiveIntensity: 0.25 }));
      chain.position.set(0, 0.4, 0.02); chain.rotation.x = Math.PI / 2 - 0.35; T.add(chain);
      part(T, SPH_LO, '#ffcf3a', { y: 0.33, z: 0.11, sx: 0.025, sy: 0.03, sz: 0.012 });
    } else if (accessory === 'band') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 8, 28), toonMat('#ff7aa0'));
      band.position.set(0, 0.06, 0); band.rotation.x = Math.PI / 2 + 0.2; H.add(band); addOutline(band);
      part(H, SPH_LO, '#ff7aa0', { x: 0.11, y: 0.12, z: 0.05, sx: 0.05, sy: 0.035, sz: 0.02 });
    }
    const hand = (h) => { part(h, SPH, face, { y: -0.02, sx: 0.042, sy: 0.05, sz: 0.035 }); part(h, CAP(0.012, 0.03), face, { x: 0.03, y: -0.01, z: 0.02, rz: -0.8 }); };
    this.armL = makeArm(T, 1, V(0.15, 0.36, 0), 0.2, 0.19, 0.042, 0.036, fur, fur, hand);
    this.armR = makeArm(T, -1, V(-0.15, 0.36, 0), 0.2, 0.19, 0.042, 0.036, fur, fur, hand);
    // 梳子（右手）
    this.comb = grp(this.armR.hand, 0, -0.06, 0.02);
    part(this.comb, new THREE.BoxGeometry(1, 1, 1), '#ff8ab0', { sx: 0.02, sy: 0.1, sz: 0.012 });
    this.comb.visible = false;
    const foot = (f) => part(f, SPH, face, { z: 0.04, y: -0.01, sx: 0.045, sy: 0.025, sz: 0.075 });
    this.legL = makeLeg(this.body, 1, V(0.07, 0.03, 0), 0.19, 0.19, 0.048, 0.042, fur, fur, foot);
    this.legR = makeLeg(this.body, -1, V(-0.07, 0.03, 0), 0.19, 0.19, 0.048, 0.042, fur, fur, foot);
    const tc = new THREE.CatmullRomCurve3([V(0, 0.08, -0.1), V(0, 0.02, -0.28), V(0.05, 0.2, -0.4), V(0.12, 0.38, -0.34), V(0.08, 0.44, -0.24), V(0.02, 0.38, -0.22)]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tc, 40, 0.022, 8), toonMat(fur));
    tail.castShadow = true; this.tail = grp(this.body); this.tail.add(tail); addOutline(tail);
    this.emote = new Emote(R, 1.28);
    this.pi = 0; this.poseT = 0; this.helmet = null; this.homeYaw = 0;
    this.cur = { ...MONKEY_POSES[0], L: MONKEY_POSES[0].L.clone(), R: MONKEY_POSES[0].R.clone() };
    this.setState('pose');
  }
  wearHelmet(h) {
    this.helmet = h;
    this.head.add(h);
    h.position.set(0, 0.05, -0.005); h.rotation.set(0, 0, 0); h.scale.setScalar(1.3);
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
        const P = MONKEY_POSES[this.pi];
        if (P.kiss && this.fx) this._kissT = 0.6;
        if (s === 'proud' || Math.random() < 0.35) this.emote.show(P.kiss ? 'heart' : Math.random() < 0.5 ? 'star' : 'note', 1.2, 0.24);
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
    // 眨眼 / wink / 飞吻
    this.eyes[1].userData.wink = tgt.wink === 1 && s !== 'talk';
    this.eyes[0].userData.wink = false;
    this.kissMouth.visible = tgt.wink === 2; this.smile.visible = !this.kissMouth.visible;
    if (this._kissT > 0) {
      this._kissT -= dt;
      if (this._kissT <= 0 && this.fx) this.fx.emit('heart', this.armR.hand.getWorldPosition(V()), { count: 4, speed: 0.4, spread: 0.3, up: 0.8, gravity: 0.2, drag: 0.8, life: 1.6, size: 0.07, colors: ['#ff6a9a', '#ff9ab8'], spin: 0.5, sway: 0.2 });
    }
    this._blink(dt, 1);
    this.emote.update(dt);
  }
}
