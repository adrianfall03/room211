// 第四章：宿舍的蒸汽自动机「老铁」——坐在我的书桌前、冻成了一块铁疙瘩。
//   锅炉一样的黄铜胸膛（胸口一扇炉门格栅，醒着时里面透出火光）、铸铁关节、铜管、背上两根小烟囱、后背一个发条孔；
//   脑袋是一只带单个大圆"眼睛"（黄铜镜筒 + 琥珀色的灯）的头盔，底下一排通风格栅当嘴。
//   状态：frozen 冻住（低着头一动不动）/ boot 上发条之后抖着醒过来 / type 在打字机上打字 / talk 转过头来说话 / idle / cheer 举起双手鸣汽笛
import * as THREE from 'three';
import { clamp, lerp, easeOut } from '../core/util.js';
import * as TF from '../core/tex_frost.js';
import * as TX from '../core/textures.js';
import { compact } from './spacelook.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _t = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP_L = 0.27, LO_L = 0.28;

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// 两骨骼 IK：肩 → 手（躯干坐标系），pole 决定肘往哪边弯
function solve(arm, target) {
  const S = arm.sh.position;
  const d = _a.subVectors(target, S);
  const len = clamp(d.length(), Math.abs(UP_L - LO_L) + 0.01, UP_L + LO_L - 0.003);
  d.normalize();
  const x = (UP_L * UP_L - LO_L * LO_L + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, UP_L * UP_L - x * x));
  const p = _b.copy(arm.pole).addScaledVector(d, -arm.pole.dot(d)).normalize();
  const E = _c.copy(S).addScaledVector(d, x).addScaledVector(p, h);
  const u = _d.subVectors(E, S).normalize();
  arm.up.quaternion.setFromUnitVectors(DOWN, u);
  const f = _e.copy(S).addScaledVector(d, len).sub(E).normalize().applyQuaternion(_q.copy(arm.up.quaternion).invert());
  arm.el.quaternion.setFromUnitVectors(DOWN, f);
}

export class Automaton {
  constructor({ name = '老铁' } = {}) {
    this.name = name;
    this.state = 'frozen';
    this.t = 0; this.stT = 0; this.talkT = 0; this.bootK = 0; this.eye = 0; this.fire = 0; this.keyTurn = 0;
    this.look = V(); this.hasLook = false;
    this.onPuff = null; this.onKey = null;
    const brass = TF.genBrassPlate({ seed: 4301 });
    const brassM = new THREE.MeshStandardMaterial({ map: brass.map, normalMap: brass.normalMap, roughnessMap: brass.roughnessMap, roughness: 1, metalness: 0.85, color: new THREE.Color('#d8b070'), envMapIntensity: 1.2 });
    const ironM = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.55, metalness: 0.8 });
    const darkM = new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.7, metalness: 0.5 });
    const copperM = new THREE.MeshStandardMaterial({ color: '#a8603a', roughness: 0.38, metalness: 0.9 });
    const rivetM = new THREE.MeshStandardMaterial({ color: '#8a7650', roughness: 0.35, metalness: 0.9 });
    this.eyeM = new THREE.MeshStandardMaterial({ color: '#2a1a08', emissive: new THREE.Color('#ffae3a'), emissiveIntensity: 0, roughness: 0.15, metalness: 0.1 });
    this.grilleM = new THREE.MeshStandardMaterial({ color: '#1a0a04', emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 0, roughness: 0.6 });
    this.mats = { brassM, ironM, darkM, copperM, rivetM };
    const root = new THREE.Group(); root.name = 'automaton';
    this.root = root;

    // ---- 骨盆（坐在凳子上）----
    const hips = grp(root, 0, 0.56, -0.02);
    hips.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 20), ironM, { s: [1, 1, 0.8] }));
    for (const s of [-1, 1]) hips.add(mesh(new THREE.SphereGeometry(0.065, 14, 10), darkM, { x: s * 0.12, y: -0.02 }));
    // 腿：大腿往前伸（坐姿），小腿往下，脚是一只大铁靴
    this.legs = [-1, 1].map((s) => {
      const hip = grp(hips, s * 0.12, -0.02, 0.02);
      const thigh = grp(hip);
      thigh.add(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.4, 14), brassM, { z: 0.2, rx: Math.PI / 2 }));
      thigh.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), copperM, { x: s * 0.06, y: 0.03, z: 0.2, rx: Math.PI / 2 })); // 液压杆
      const knee = grp(thigh, 0, 0, 0.42);
      knee.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), darkM));
      knee.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.44, 14), brassM, { y: -0.23 }));
      knee.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.38, 8), ironM, { z: -0.055, y: -0.22 }));
      const boot = mesh(new THREE.BoxGeometry(0.13, 0.08, 0.24), ironM, { y: -0.47, z: 0.05 });
      knee.add(boot);
      knee.add(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.13, 14, 1, false, 0, Math.PI), ironM, { y: -0.47, z: 0.17, rz: Math.PI / 2, s: [1, 1, 0.6] }));
      return { hip, thigh, knee };
    });

    // ---- 躯干：锅炉 ----
    const torso = grp(hips, 0, 0.06, 0);
    this.torso = torso;
    const prof = [[0.0, 0.14], [0.03, 0.17], [0.1, 0.2], [0.22, 0.215], [0.34, 0.21], [0.42, 0.195], [0.47, 0.16], [0.5, 0.1], [0.51, 0.0]].map(([y, r]) => new THREE.Vector2(r, y));
    const boiler = mesh(new THREE.LatheGeometry(prof, 28), brassM, { s: [1, 1, 0.88] });
    torso.add(boiler);
    // 铆钉带
    for (const y of [0.05, 0.22, 0.4]) {
      torso.add(mesh(new THREE.TorusGeometry(y === 0.22 ? 0.216 : y === 0.05 ? 0.18 : 0.2, 0.012, 6, 32), ironM, { y, rx: Math.PI / 2, s: [1, 0.88, 1] }));
      const r = y === 0.22 ? 0.225 : y === 0.05 ? 0.19 : 0.21;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; torso.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), rivetM, { x: Math.cos(a) * r, y, z: Math.sin(a) * r * 0.88, cast: false })); }
    }
    // 胸口的炉门：一圈铸铁框 + 格栅（醒着时透出火光）
    const door = grp(torso, 0, 0.2, 0.185);
    door.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 24), ironM, { rx: Math.PI / 2 }));
    door.add(mesh(new THREE.CircleGeometry(0.07, 24), this.grilleM, { z: 0.0155, cast: false }));
    for (let k = -3; k <= 3; k++) door.add(mesh(new THREE.BoxGeometry(0.13 * Math.sqrt(1 - (k / 4) ** 2), 0.008, 0.012), darkM, { y: k * 0.018, z: 0.02, cast: false }));
    door.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), copperM, { x: 0.075, z: 0.03, cast: false }));
    // 胸口右上：小压力表
    const gC = TX.makeCanvas(128, 128);
    const gauge = TF.drawGaugeFace(gC, { label: 'BAR', red: 7.5 });
    this.gaugeAngle = gauge.angleOf;
    const gp = grp(torso, 0.1, 0.36, 0.155);
    gp.rotation.set(-0.25, 0.45, 0);
    gp.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 20), copperM, { rx: Math.PI / 2 }));
    gp.add(mesh(new THREE.CircleGeometry(0.036, 20), new THREE.MeshStandardMaterial({ map: TX.toTex(gC, { wrap: false }), roughness: 0.5 }), { z: 0.0105, cast: false }));
    this.needle = grp(gp, 0, 0, 0.013);
    this.needle.add(mesh(new THREE.BoxGeometry(0.003, 0.03, 0.002), new THREE.MeshStandardMaterial({ color: '#8a1a10' }), { y: 0.012, cast: false }));
    this.needle.rotation.z = this.gaugeAngle(-1);
    // 铭牌
    const nC = TX.makeCanvas(256, 64), nx = nC.getContext('2d');
    nx.fillStyle = '#c8a860'; nx.fillRect(0, 0, 256, 64); nx.strokeStyle = '#4a3418'; nx.lineWidth = 4; nx.strokeRect(4, 4, 248, 56);
    nx.fillStyle = '#2a1a0a'; nx.font = `900 30px ${TX.SANS}`; nx.textAlign = 'center'; nx.fillText(`${name} · No.211`, 128, 42);
    torso.add(mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshStandardMaterial({ map: TX.toTex(nC, { wrap: false }), roughness: 0.4, metalness: 0.6 }), { x: -0.02, y: 0.075, z: 0.176, rx: -0.12, cast: false }));
    // 后背：两根小烟囱 + 发条孔
    this.stacks = [];
    for (const s of [-1, 1]) {
      const st = grp(torso, s * 0.09, 0.42, -0.14);
      st.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 12), ironM, { y: 0.1 }));
      st.add(mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.035, 12), ironM, { y: 0.24 }));
      this.stacks.push(st);
    }
    const keyHole = grp(torso, 0, 0.24, -0.19);
    keyHole.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 18), copperM, { rx: Math.PI / 2 }));
    keyHole.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 10), darkM, { rx: Math.PI / 2, cast: false }));
    this.keySlot = keyHole;
    // 背上接到肩膀的铜管
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(s * 0.06, 0.3, -0.18), V(s * 0.16, 0.44, -0.16), V(s * 0.24, 0.48, -0.04)]);
      torso.add(mesh(new THREE.TubeGeometry(c, 16, 0.012, 6), copperM, { cast: false }));
    }

    // ---- 肩 + 手臂 ----
    const arm = (s) => {
      const sh = grp(torso, s * 0.25, 0.44, 0.0);
      sh.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), ironM));
      sh.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16), brassM, { rz: Math.PI / 2, x: s * 0.03 }));
      const up = grp(sh);
      up.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, UP_L, 14), brassM, { y: -UP_L / 2 }));
      up.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, UP_L * 0.8, 8), copperM, { x: s * 0.05, y: -UP_L / 2 }));
      const el = grp(up, 0, -UP_L, 0);
      el.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 16), darkM, { rz: Math.PI / 2 })); // 齿轮一样的肘
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; el.add(mesh(new THREE.BoxGeometry(0.075, 0.014, 0.014), darkM, { y: Math.cos(a) * 0.05, z: Math.sin(a) * 0.05, rx: a, cast: false })); }
      el.add(mesh(new THREE.CylinderGeometry(0.035, 0.042, LO_L, 14), brassM, { y: -LO_L / 2 }));
      const hand = grp(el, 0, -LO_L, 0);
      hand.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), ironM, { s: [1, 0.8, 1.1] }));
      const fingers = [];
      for (const [fx, fz] of [[-0.02, 0.025], [0.02, 0.025], [0, -0.03]]) {
        const f = grp(hand, fx, -0.02, fz);
        f.add(mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.06, 6), darkM, { y: -0.03, cast: false }));
        f.rotation.x = fz > 0 ? 0.3 : -0.3;
        fingers.push(f);
      }
      return { sh, up, el, hand, fingers, pole: V(s * 0.9, -0.4, -0.6).normalize(), side: s };
    };
    this.armR = arm(1); this.armL = arm(-1);

    // ---- 头 ----
    const neck = grp(torso, 0, 0.5, 0.0);
    neck.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 12), darkM, { y: 0.02 }));
    for (let k = 0; k < 3; k++) neck.add(mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16), ironM, { y: 0.01 + k * 0.018, rx: Math.PI / 2, cast: false })); // 波纹管
    const head = grp(neck, 0, 0.07, 0.01);
    this.head = head; this.neck = neck;
    head.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.13, 22), brassM, { y: 0.065 }));
    head.add(mesh(new THREE.SphereGeometry(0.11, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), brassM, { y: 0.13 }));
    head.add(mesh(new THREE.TorusGeometry(0.114, 0.01, 6, 28), ironM, { y: 0.13, rx: Math.PI / 2 }));
    // 单眼：黄铜镜筒 + 琥珀色的灯
    const eye = grp(head, 0, 0.1, 0.1);
    eye.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.06, 20), copperM, { rx: Math.PI / 2 }));
    eye.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 24), ironM, { z: 0.03 }));
    eye.add(mesh(new THREE.SphereGeometry(0.043, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.eyeM, { z: 0.02, rx: Math.PI / 2, cast: false }));
    this.iris = mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 18), new THREE.MeshStandardMaterial({ color: '#1a1008', roughness: 0.3 }), { z: 0.062, cast: false });
    eye.add(this.iris);
    // 嘴：一排通风格栅（说话时一开一合）
    const jaw = grp(head, 0, 0.035, 0.095);
    for (let k = 0; k < 4; k++) jaw.add(mesh(new THREE.BoxGeometry(0.1, 0.008, 0.02), darkM, { y: -k * 0.013, cast: false }));
    this.jaw = jaw;
    // 两边的铆钉"耳朵"、头顶一根小汽笛
    for (const s of [-1, 1]) head.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), ironM, { x: s * 0.12, y: 0.08, rz: Math.PI / 2 }));
    const whistle = grp(head, 0.05, 0.22, -0.02);
    whistle.add(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 10), copperM, { y: 0.03 }));
    whistle.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), copperM, { y: 0.07 }));
    this.whistle = whistle;

    // 发条钥匙（插进去之后才出现）
    const key = grp(this.keySlot, 0, 0, -0.03);
    key.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 8), copperM, { rx: Math.PI / 2, z: -0.03 }));
    const bow = grp(key, 0, 0, -0.08);
    for (const s of [-1, 1]) bow.add(mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 18), brassM, { x: s * 0.038 }));
    key.visible = false;
    this.key = key;

    // 合批：会动的关节各自一组，每组里不会单独动的零件合成几个网格（一台机器人几百个零件 → 几十次绘制）
    this.gp = gp;
    compact(torso, [this.armR.sh, this.armL.sh, neck, keyHole, gp]);
    for (const A of [this.armR, this.armL]) { compact(A.sh, [A.up]); compact(A.up, [A.el]); compact(A.el, [A.hand]); compact(A.hand); }
    compact(head, [this.iris, jaw, whistle]);
    compact(neck, [head]);
    for (const L of this.legs) { compact(L.thigh, [L.knee]); compact(L.knee); }
    compact(hips, [torso, ...this.legs.map((L) => L.hip)]);
    this._pose(0);
  }

  setState(s) { if (this.state !== s) { this.state = s; this.stT = 0; } }
  talk(sec = 2.5) { this.talkT = sec; if (this.state === 'type' || this.state === 'idle') this.setState('talk'); }
  insertKey() { this.key.visible = true; this.keyTurn = 0; }

  // 基本坐姿（冻住时整个人往前塌一点）
  _pose(slump) {
    for (const L of this.legs) { L.thigh.rotation.set(-0.05, 0, 0); L.knee.rotation.set(0.1, 0, 0); }
    this.torso.rotation.set(0.12 + slump * 0.18, 0, 0);
    this.neck.rotation.set(slump * 0.45, 0, 0);
  }

  // ctx：{ kb: 打字机键盘中心（本地坐标）, look: 世界坐标（看向谁）}
  update(dt, t, ctx = {}) {
    this.t += dt; this.stT += dt;
    if (this.talkT > 0) { this.talkT -= dt; if (this.talkT <= 0 && this.state === 'talk') this.setState(this.after || 'type'); }
    const S = this.state;
    const awake = S !== 'frozen';
    // 眼睛、炉门：醒着亮，开机时一闪一闪
    let eyeT = awake ? 1 : 0, fireT = awake ? 1 : 0;
    if (S === 'boot') { const k = this.stT; eyeT = k < 1.2 ? (Math.sin(k * 40) > 0.2 ? k / 1.2 : 0.05) : 1; fireT = clamp(k / 2, 0, 1); }
    this.eye = lerp(this.eye, eyeT, 1 - Math.exp(-dt * 8));
    this.fire = lerp(this.fire, fireT, 1 - Math.exp(-dt * 3));
    const talking = this.talkT > 0;
    this.eyeM.emissiveIntensity = this.eye * (2.2 + (talking ? Math.sin(t * 14) * 0.8 : Math.sin(t * 2) * 0.2));
    this.grilleM.emissiveIntensity = this.fire * (1.6 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15);
    this.needle.rotation.z = this.gaugeAngle(lerp(-1, 5.5 + Math.sin(t * 1.3) * 0.4, this.fire));
    // 发条钥匙：插着就慢慢转
    if (this.key.visible) { this.keyTurn += dt * (S === 'boot' ? 7 : awake ? 1.2 : 0); this.key.rotation.z = this.keyTurn; }
    // 冒汽
    if (awake && this.onPuff) {
      this._puffT = (this._puffT || 0) - dt;
      if (this._puffT <= 0) { this._puffT = S === 'boot' ? 0.12 : S === 'cheer' ? 0.2 : 1.1 + Math.random() * 1.4; for (const st of this.stacks) this.onPuff(st.localToWorld(_t.set(0, 0.28, 0)), S === 'boot' || S === 'cheer' ? 1 : 0.4); }
    }
    // ---- 姿势 ----
    const sit = (slump) => this._pose(slump);
    const kb = ctx.kb || V(0, 0.83, 0.44);
    const torsoInv = () => { this.torso.updateWorldMatrix(true, false); return _m.copy(this.torso.matrixWorld).invert(); };
    const toTorso = (p) => { this.root.updateWorldMatrix(true, false); return _t.copy(p).applyMatrix4(this.root.matrixWorld).applyMatrix4(torsoInv()); };
    let headYaw = 0, headPitch = 0, jawOpen = 0;
    if (S === 'frozen') {
      sit(1);
      solve(this.armR, toTorso(V(0.14, 0.8, 0.36)).clone());
      solve(this.armL, toTorso(V(-0.14, 0.8, 0.34)).clone());
      headPitch = 0; this.jaw.position.y = 0.035;
      this.head.rotation.set(0, 0, 0);
      return;
    }
    if (S === 'boot') {
      const k = clamp(this.stT / 2.6, 0, 1);
      sit(1 - easeOut(k));
      const sh = (1 - k) * 0.03;
      this.torso.position.set((Math.random() - 0.5) * sh, 0.06 + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
      headPitch = -0.2 * Math.sin(k * Math.PI);
      headYaw = Math.sin(this.stT * 5) * 0.4 * k * (1 - k) * 3;
      solve(this.armR, toTorso(V(0.14, 0.8 + k * 0.05, 0.36)).clone());
      solve(this.armL, toTorso(V(-0.14, 0.8 + k * 0.05, 0.34)).clone());
    } else {
      sit(0);
      this.torso.position.set(0, 0.06 + Math.sin(t * 1.6) * 0.004, 0);
      this.torso.rotation.x = 0.08 + Math.sin(t * 1.6) * 0.01;
      if (S === 'type') {
        // 两只手轮流敲键，隔几秒一记回车（右手去拍打字机的拉杆）
        const beat = Math.floor(t * 7), side = beat % 2;
        const hit = Math.max(0, Math.sin(t * 7 * Math.PI));
        const ret = (t % 5.5) > 5.0;
        const r = V(kb.x + 0.07 + ((beat * 37) % 5) * 0.012 - 0.024, kb.y + 0.05 - (side === 0 ? hit * 0.05 : 0), kb.z - 0.02 + ((beat * 13) % 3) * 0.02);
        const l = V(kb.x - 0.07 - ((beat * 23) % 5) * 0.012 + 0.024, kb.y + 0.05 - (side === 1 ? hit * 0.05 : 0), kb.z - 0.02 + ((beat * 7) % 3) * 0.02);
        if (ret) r.set(kb.x + 0.2, kb.y + 0.14, kb.z + 0.08);
        solve(this.armR, toTorso(r).clone());
        solve(this.armL, toTorso(l).clone());
        headPitch = 0.28 + Math.sin(t * 3) * 0.03; headYaw = Math.sin(t * 0.7) * 0.12;
        if (this.onKey && (beat !== this._lastBeat)) { this._lastBeat = beat; if (!ret) this.onKey(); }
      } else if (S === 'cheer') {
        const w = Math.sin(t * 6);
        solve(this.armR, toTorso(V(0.3, 1.55 + w * 0.05, 0.1)).clone());
        solve(this.armL, toTorso(V(-0.3, 1.55 - w * 0.05, 0.1)).clone());
        headPitch = -0.3;
      } else {
        // talk / idle：手搭在桌沿，头转过来看人
        solve(this.armR, toTorso(V(0.16, 0.8, 0.34)).clone());
        solve(this.armL, toTorso(V(-0.16, 0.8, 0.32)).clone());
        headPitch = Math.sin(t * 0.9) * 0.05;
      }
      if ((S === 'talk' || S === 'idle' || S === 'cheer') && ctx.look) {
        this.head.updateWorldMatrix(true, false);
        const loc = _a.copy(ctx.look).applyMatrix4(_m.copy(this.neck.matrixWorld).invert());
        headYaw = clamp(Math.atan2(loc.x, loc.z), -1.3, 1.3);
        headPitch = clamp(-Math.atan2(loc.y - 0.1, Math.hypot(loc.x, loc.z)), -0.5, 0.4);
      }
      if (talking) jawOpen = Math.max(0, Math.sin(t * 16)) * 0.012;
    }
    this.head.rotation.y = lerp(this.head.rotation.y, headYaw, 1 - Math.exp(-dt * 6));
    this.head.rotation.x = lerp(this.head.rotation.x, headPitch, 1 - Math.exp(-dt * 6));
    this.jaw.position.y = 0.035 - jawOpen;
    this.iris.scale.setScalar(1 + (talking ? Math.sin(t * 9) * 0.15 : 0));
    this.whistle.scale.y = S === 'cheer' ? 1 + Math.abs(Math.sin(t * 20)) * 0.1 : 1;
  }
}
