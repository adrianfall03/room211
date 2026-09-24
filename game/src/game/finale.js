// 结局过场：新兵报到
//   从 211 的门里走出来 → 教官喊"向前走" → 红毯尽头立正 → 少校敬礼、双手递上军帽 →
//   你接过军帽戴上、回敬一个军礼 → 礼炮彩带、观众欢呼 → 结算
import * as THREE from 'three';
import { clamp, lerp, damp, easeInOut, easeOut, dampAngle } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 敬礼：右手指尖碰到右眉（帽檐）外侧，大臂接近水平（躯干坐标系）
const SALUTE_R = V(-0.13, 0.7, 0.14);
const SALUTE_POLE = V(-1, 0.15, 0.3).normalize();
const _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class FinaleDirector {
  constructor(g) {
    this.g = g;
    const R = g.refs;
    this.R = R;
    this.t = 0;
    // 各种姿势的权重（平滑过渡）
    this.w = { oSalute: 0, oHold: 0, pHold: 0, pSalute: 0, pAttention: 0, sSalute: 0 };
    this.tw = { ...this.w };
    this.cap = { stage: 0, k: 0, from: V(), fromQ: new THREE.Quaternion() };
    this.walk = null;
    this.done = false;
    R.updaters.push((dt) => this.updateNPC(dt));
  }

  // 世界坐标 → 某个角色躯干坐标系
  _local(ch, p) { ch.root.updateMatrixWorld(true); return ch.J.torso.worldToLocal(p.clone()); }

  start() {
    const g = this.g, R = this.R, ch = g.ch, S = g.S;
    // 主角：站在门里，面朝红毯
    g.ctrl.float = 0; g.ctrl.pos.set(0, 0, 6.75); g.ctrl.charYaw = Math.PI;
    ch.root.position.set(0, 0, 6.75); ch.root.rotation.set(0, Math.PI, 0);
    ch.setFirstPerson(false);
    ch.setExpression('shock');
    // 开场：主角从发着白光的 211 门里迈出来
    this.walk = { to: V(0, 0, 6.05), speed: 0.7 };
    g._cineSet(V(1.1, 1.45, 3.9), V(0, 1.35, 6.4));
    g._cineTo(V(0.8, 1.55, 4.3), V(0, 1.45, 6.3), 3.6);
    g.audio.startMusic('finale');
    g.audio.cheer(3);
    this.R.excite = 0.6;
    const [A] = S.mates;
    const seq = [
      [1.3, () => g.ui.subtitle('这……这是哪儿？我不是在太空舱里吗？', 2.6, S.name)],
      [3.9, () => { g._cineTo(V(1.3, 1.85, 6.1), V(0, 4.4, -6.0), 1.8); ch.setExpression('focus'); }],
      [4.4, () => g.ui.subtitle('横幅上写着：WELCOME, NEW RECRUITS! · 欢迎新兵报到', 2.8, '')],
      [7.2, () => {
        g._cineTo(V(2.6, 1.7, 1.2), V(1.4, 1.75, -0.3), 1.2);
        g.audio.snap();
        g.ui.subtitle(`新兵 ${S.name}！——向前，走！`, 2.4, '教官 · SGT. JOHNSON');
      }],
      [8.8, () => {
        this.walk = { to: V(0, 0, 1.18), speed: 1.15 };
        ch.setExpression('neutral');
        g._cineTo(V(2.4, 1.55, 4.2), V(0, 1.2, 3.2), 1.5);
      }],
      [11.0, () => g._cineTo(V(2.0, 1.55, 2.2), V(0, 1.25, 0.9), 2.4)],
      [13.4, () => {
        this.tw.pAttention = 1;
        g.audio.snap(); g._shake(0.05);
        g.ui.subtitle('立——正！', 1.6, '教官 · SGT. JOHNSON');
      }],
      [14.6, () => {
        g._cineSet(V(0.42, 1.18, 1.05), V(-0.02, 1.72, -0.1));
        g._cineTo(V(0.36, 1.22, 0.95), V(-0.02, 1.74, -0.1), 6);
        g.ui.subtitle(`欢迎报到，新兵 ${S.name}。`, 2.4, '少校 · MAJ. SMITH');
        R.officer.setExpression('neutral');
      }],
      [16.6, () => { this.tw.oSalute = 1; g.audio.snap(); g.audio.bugle(); }],
      [19.4, () => {
        this.tw.oSalute = 0;
        g._cineTo(V(2.1, 1.5, 0.75), V(0, 1.38, 0.55), 1.2);
      }],
      [19.9, () => { this.cap.stage = 1; this.cap.k = 0; this.tw.oHold = 1; }],
      [20.6, () => g.ui.subtitle('这是你的军帽。', 2, '少校 · MAJ. SMITH')],
      [21.2, () => { this.cap.stage = 2; this.cap.k = 0; }],
      [22.4, () => { this.tw.pHold = 1; this.tw.pAttention = 0; g.ui.subtitle('从今天起，你就是一名士兵了。', 2.6, '少校 · MAJ. SMITH'); }],
      [23.4, () => { this.cap.stage = 3; this.cap.k = 0; this.tw.oHold = 0; ch.setExpression('grin'); }],
      [24.2, () => g._cineTo(V(0.62, 1.72, 0.42), V(0, 1.7, 1.18), 1.3)],
      [25.4, () => { this.cap.stage = 4; this.cap.k = 0; }],
      [26.6, () => {
        this.cap.stage = 5; this.tw.pHold = 0; this.tw.pAttention = 1;
        g.audio.sparkle();
        g.fx.emit('star', ch.J.head.getWorldPosition(V()).add(V(0, 0.2, 0)), { count: 14, speed: 0.6, spread: 0.8, up: 0.5, gravity: -0.3, drag: 1.2, life: 1.4, size: 0.05, colors: ['#ffe08a', '#ffffff'], spin: 2 });
        S.ach.add('enlist');
      }],
      [27.4, () => {
        this.tw.pSalute = 1; this.tw.oSalute = 1; this.tw.sSalute = 1;
        g.audio.snap(); g.audio.drumRoll(1.2);
        g._cineTo(V(2.6, 1.6, 2.4), V(0, 1.5, 0.55), 1.4);
      }],
      [28.6, () => {
        g.audio.fanfare(); g.audio.cheer(4);
        this.R.excite = 1;
        this.confetti(8);
        this.flashes(14);
        this.card();
      }],
      [31.0, () => { this.tw.pSalute = 0; this.tw.oSalute = 0; this.tw.sSalute = 0; this.orbit = 0; }],
      [34.5, () => this.finish()],
    ];
    for (const [t, fn] of seq) g.after(t, () => { if (g.state === 'finale') fn(); });
    g._showSkip(() => this.finish());
  }

  confetti(n = 6) {
    const g = this.g;
    for (let i = 0; i < n; i++) g.after(i * 0.35, () => {
      const p = V((Math.random() - 0.5) * 6, 4.5 + Math.random() * 1.5, -1 + Math.random() * 4);
      g.fx.emit('confetti', p, { count: 40, speed: 1.6, spread: 1.4, up: 0.6, gravity: -0.9, drag: 1.1, life: 5, size: 0.07, colors: ['#b22234', '#ffffff', '#3c3b6e', '#e8b830'], spin: 8, sway: 0.6 });
    });
  }
  // 看台上的家人们举着手机拍照：一闪一闪的闪光灯
  flashes(n = 10) {
    const g = this.g;
    for (let i = 0; i < n; i++) g.after(Math.random() * 2.6, () => {
      const s = Math.random() < 0.5 ? -1 : 1;
      const p = V(s * (4.8 + Math.random() * 2), 1.7 + Math.random() * 1.1, -0.4 + Math.random() * 5.5);
      g.fx.emit('star', p, { count: 1, speed: 0, spread: 0, up: 0, gravity: 0, drag: 0, life: 0.18, size: 0.45, colors: ['#ffffff'], spin: 0 });
      g.audio.tick();
    });
  }
  card() {
    const S = this.g.S;
    const el = document.createElement('div');
    el.id = 'enlist-card';
    el.innerHTML = `<div class="ec-k">四个 211，全部逃脱！</div><div class="ec-t">新兵报到</div><div class="ec-s">ENLISTED · ${S.name}</div>`;
    document.body.appendChild(el);
    this.cardEl = el;
  }
  finish() {
    const g = this.g;
    if (this.done) return;
    this.done = true;
    if (this.cardEl) { this.cardEl.classList.add('out'); const el = this.cardEl; setTimeout(() => el.remove(), 900); }
    if (g._skipBtn) { g._skipBtn.remove(); g._skipBtn = null; }
    // 跳过的话：直接把帽子戴好
    if (this.cap.stage < 5) { this.cap.stage = 5; this.g.S.ach.add('enlist'); this.walk = null; g.ctrl.pos.set(0, 0, 1.18); }
    this.tw.pHold = 0; this.tw.oHold = 0; this.tw.pSalute = 0; this.tw.oSalute = 0;
    this.R.excite = 0.8;
    if (g.S.done.some((d) => d.n === 1)) g.S.ach.add('loop');
    g.showEnd(true);
  }

  // 主角（state === 'finale' 时每帧调用）
  update(dt) {
    const g = this.g, ch = g.ch, C = g.ctrl;
    this.t += dt;
    for (const k of Object.keys(this.w)) this.w[k] = damp(this.w[k], this.tw[k], k.endsWith('Salute') ? 7 : 4, dt);
    let speed = 0;
    if (this.walk) {
      const d = _a.copy(this.walk.to).sub(C.pos); d.y = 0;
      const dist = d.length();
      if (dist < 0.03) this.walk = null;
      else { speed = this.walk.speed; C.pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt)); }
    }
    ch.root.position.copy(C.pos);
    ch.root.rotation.y = C.charYaw;
    this.updateCap(dt);
    ch.update(dt, this.playerPrm(speed));
    g._updateCine(dt);
  }

  playerPrm(speed = 0) {
    const g = this.g, ch = g.ch, w = this.w;
    const prm = { speed, attention: w.pAttention * (speed > 0.05 ? 0 : 1), lookPitch: 0.05 };
    if (w.pHold > 0.01) {
      const cp = this.R.giftCap.position;
      const right = _b.set(1, 0, 0); // 主角面朝 -z，右手边是 +x
      prm.ikR = { p: this._local(ch, _c.copy(cp).addScaledVector(right, 0.13).add(_a.set(0, -0.02, 0))), w: w.pHold };
      prm.ikL = { p: this._local(ch, _c.copy(cp).addScaledVector(right, -0.13).add(_a.set(0, -0.02, 0))), w: w.pHold };
    } else if (w.pSalute > 0.01) {
      prm.ikR = { p: SALUTE_R, pole: SALUTE_POLE, w: w.pSalute, wr: [0.1, 0, 0.2] };
    }
    return prm;
  }

  // 军帽的位置：少校左手 → 胸前 → 递出去 → 主角手里 → 举到头顶 → 戴上
  updateCap(dt) {
    const R = this.R, cap = R.giftCap, O = R.officer, ch = this.g.ch, c = this.cap;
    if (c.stage === 5) {
      if (cap.parent !== ch.helmetSlot) {
        ch.helmetSlot.add(cap);
        cap.position.set(0, -0.004, 0.004); cap.rotation.set(0, 0, 0); cap.scale.setScalar(0.94);
      }
      return;
    }
    O.root.updateMatrixWorld(true);
    let target, tq = _q;
    if (c.stage === 0) {
      O.J.wrL.getWorldPosition(_a);
      target = _a.add(_b.set(0.06, -0.12, 0.05));
      tq.setFromEuler(new THREE.Euler(0, 0, 1.3));
    } else if (c.stage === 1) {
      target = O.J.torso.localToWorld(_a.set(0, 0.33, 0.36));
      tq.setFromEuler(new THREE.Euler(0.15, 0, 0));
    } else if (c.stage === 2) {
      target = _a.set(0, 1.34, 0.62);
      tq.setFromEuler(new THREE.Euler(0.1, 0, 0));
    } else if (c.stage === 3) {
      ch.root.updateMatrixWorld(true);
      target = ch.J.torso.localToWorld(_a.set(0, 0.34, 0.36));
      tq.setFromEuler(new THREE.Euler(-0.1, Math.PI, 0));
    } else {
      ch.root.updateMatrixWorld(true);
      ch.helmetSlot.getWorldPosition(_a);
      target = _a.add(_b.set(0, 0.2 * (1 - clamp(c.k * 1.6 - 0.4, 0, 1)), 0));
      ch.helmetSlot.getWorldQuaternion(tq);
    }
    if (c.k === 0) { c.from.copy(cap.position); c.fromQ.copy(cap.quaternion); }
    c.k = Math.min(1, c.k + dt / (c.stage === 0 ? 0.001 : c.stage === 4 ? 1.1 : 0.75));
    const e = easeInOut(c.k);
    cap.position.lerpVectors(c.from, target, e);
    cap.quaternion.slerpQuaternions(c.fromQ, tq, e);
    if (c.stage === 0) { cap.position.copy(target); cap.quaternion.copy(tq); }
    cap.scale.setScalar(1.05);
  }

  // 少校、教官（所有状态下都更新，结算画面背景里也在动）
  updateNPC(dt) {
    const R = this.R, O = R.officer, SG = R.sarge, w = this.w;
    if (this.g.state !== 'finale') for (const k of Object.keys(this.w)) this.w[k] = damp(this.w[k], this.tw[k], 5, dt);
    const oPrm = { attention: 1, lookPitch: 0.02 };
    if (w.oHold > 0.01) {
      const cp = R.giftCap.position;
      const right = _b.set(-1, 0, 0); // 少校面朝 +z，右手边是 -x
      oPrm.ikR = { p: this._local(O, _c.copy(cp).addScaledVector(right, 0.14).add(_a.set(0, -0.02, 0))), w: w.oHold };
      oPrm.ikL = { p: this._local(O, _c.copy(cp).addScaledVector(right, -0.14).add(_a.set(0, -0.02, 0))), w: w.oHold };
    } else if (w.oSalute > 0.01) oPrm.ikR = { p: SALUTE_R, pole: SALUTE_POLE, w: w.oSalute, wr: [0.1, 0, 0.2] };
    else if (this.cap.stage === 0) {
      // 左手拿着帽子，手臂微微往前
      oPrm.ikL = { p: V(0.2, 0.08, 0.12), w: 0.8 };
    }
    O.update(dt, oPrm);
    const sPrm = { attention: 1, lookYaw: 0.25, lookPitch: 0.02 };
    if (w.sSalute > 0.01) sPrm.ikR = { p: SALUTE_R, pole: SALUTE_POLE, w: w.sSalute, wr: [0.1, 0, 0.2] };
    SG.update(dt, sPrm);
  }
}
