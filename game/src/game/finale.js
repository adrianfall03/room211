// 结局过场：梦醒了——新兵报到
//   眼前一片黑，教官一嗓子"新兵！醒醒！" → 眼皮眨两下睁开：自己坐在征兵站门前的候场区里打瞌睡，
//   四个 211 原来全是一场梦 → 起立，教官喊"向前走" → 红毯尽头立正 → 少校敬礼、双手递上军帽 →
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
    this.w = { oSalute: 0, oHold: 0, pHold: 0, pSalute: 0, pAttention: 0, sSalute: 0, pSit: 0, nod: 0 };
    this.tw = { ...this.w };
    this.cap = { stage: 0, k: 0, from: V(), fromQ: new THREE.Quaternion() };
    this.walk = null;
    this.done = false;
    R.updaters.push((dt) => this.updateNPC(dt));
  }

  // 世界坐标 → 某个角色躯干坐标系
  _local(ch, p) { ch.root.updateMatrixWorld(true); return ch.J.torso.worldToLocal(p.clone()); }

  // 眼皮：两片黑幕，open 0 = 闭着，1 = 完全睁开
  _lids() {
    if (this.lidsEl) return this.lidsEl;
    const el = document.createElement('div');
    el.id = 'lids';
    el.innerHTML = '<div class="lid t"></div><div class="lid b"></div><div class="lid-blur"></div>';
    document.body.appendChild(el);
    this.lidsEl = el;
    return el;
  }
  lids(open, dur = 0.6) {
    const el = this._lids();
    for (const [c, s] of [['t', -1], ['b', 1]]) { const l = el.querySelector(`.lid.${c}`); l.style.transition = `transform ${dur}s ease-in-out`; l.style.transform = `translateY(${s * open * 102}%)`; }
    const bl = el.querySelector('.lid-blur'); bl.style.transition = `opacity ${dur * 1.6}s`; bl.style.opacity = String(open >= 1 ? 0 : 1 - open * 0.5);
    if (open >= 1) setTimeout(() => { if (this.lidsEl) { this.lidsEl.remove(); this.lidsEl = null; } }, dur * 1600 + 200);
  }

  start() {
    const g = this.g, R = this.R, ch = g.ch, S = g.S, SG = R.sarge;
    // 主角：坐在候场区的折叠椅上打瞌睡（面朝红毯）
    g.ctrl.float = 0; g.ctrl.pos.copy(R.seat); g.ctrl.charYaw = Math.PI;
    ch.root.position.copy(R.seat); ch.root.rotation.set(0, Math.PI, 0);
    ch.setFirstPerson(true); // 先是主角的眼睛看出去（睁眼），镜头拉远以后再显示头
    ch.setExpression('sleep');
    this.w.pSit = this.tw.pSit = 1; this.w.nod = this.tw.nod = 1;
    // 教官已经站到跟前，弯着腰冲他喊
    this.sPost = SG.root.position.clone(); this.sPostYaw = SG.root.rotation.y;
    SG.root.position.set(0.18, 0, 5.72); SG.root.rotation.y = 0;
    this.sLean = 1;
    // 闭着眼：两片黑幕挡着（外面的白光正在退去）
    this._lids(); this.lids(0, 0.01);
    g._cineSet(V(0.02, 1.22, 6.22), V(0.16, 1.66, 5.62));
    g.audio.cheer(2);
    this.R.excite = 0.3;
    const me = S.name, sg = '教官 · SGT. JOHNSON';
    const seq = [
      [0.8, () => { g.audio.snap(); g.ui.subtitle('新兵！醒醒！', 1.6, sg); }],
      [1.8, () => this.lids(0.3, 0.25)],
      [2.2, () => this.lids(0, 0.2)],
      [2.7, () => { g.audio.snap(); g.ui.subtitle('说你呢！报到的日子还能睡着？！', 2.0, sg); }],
      [3.4, () => this.lids(0.55, 0.35)],
      [3.9, () => this.lids(0.2, 0.25)],
      [4.4, () => { this.lids(1, 1.2); ch.setExpression('shock'); this.tw.nod = 0; }],
      [5.2, () => g.ui.subtitle('……这……这是哪儿？', 2.0, me)],
      [6.4, () => {
        // 镜头拉远：征兵站门前的广场，自己正坐在一排折叠椅中间
        ch.setFirstPerson(false);
        g._cineSet(V(2.6, 1.5, 9.2), V(0, 1.0, 6.2));
        g._cineTo(V(1.8, 2.6, 10.2), V(0, 2.2, -2.5), 4.5);
        g.audio.startMusic('finale');
      }],
      [6.9, () => g.ui.subtitle('我不是……在太空舱里吗？', 2.2, me)],
      [9.2, () => { ch.setExpression('focus'); g.ui.subtitle('四个 211……原来……全都是一场梦？', 2.8, me); }],
      [12.2, () => {
        g._cineTo(V(1.3, 1.65, 7.6), V(0.1, 1.4, 5.9), 1.0);
        g.audio.snap(); g._shake(0.05);
        g.ui.subtitle(`发什么呆！新兵 ${me}——起立！`, 2.2, sg);
      }],
      [13.4, () => { this.tw.pSit = 0; ch.setExpression('neutral'); this.sWalk = { to: this.sPost, speed: 1.6 }; this.sLean = 0; }],
      [14.8, () => { g._cineTo(V(1.1, 1.85, 8.4), V(0, 4.4, -6.0), 1.8); ch.setExpression('focus'); }],
      [15.3, () => g.ui.subtitle('横幅上写着：WELCOME, NEW RECRUITS! · 欢迎新兵报到', 2.8, '')],
      [18.0, () => {
        g._cineTo(V(2.6, 1.7, 1.2), V(1.4, 1.75, -0.3), 1.2);
        g.audio.snap();
        g.ui.subtitle(`新兵 ${me}！——向前，走！`, 2.4, sg);
      }],
      [19.6, () => {
        this.walk = { to: V(0, 0, 1.18), speed: 1.15 };
        ch.setExpression('neutral');
        g._cineTo(V(2.4, 1.55, 4.2), V(0, 1.2, 3.2), 1.5);
      }],
      [21.8, () => g._cineTo(V(2.0, 1.55, 2.2), V(0, 1.25, 0.9), 2.4)],
      [24.2, () => {
        this.tw.pAttention = 1;
        g.audio.snap(); g._shake(0.05);
        g.ui.subtitle('立——正！', 1.6, '教官 · SGT. JOHNSON');
      }],
      [25.4, () => {
        g._cineSet(V(0.42, 1.18, 1.05), V(-0.02, 1.72, -0.1));
        g._cineTo(V(0.36, 1.22, 0.95), V(-0.02, 1.74, -0.1), 6);
        g.ui.subtitle(`欢迎报到，新兵 ${S.name}。`, 2.4, '少校 · MAJ. SMITH');
        R.officer.setExpression('neutral');
      }],
      [27.4, () => { this.tw.oSalute = 1; g.audio.snap(); g.audio.bugle(); }],
      [30.2, () => {
        this.tw.oSalute = 0;
        g._cineTo(V(2.1, 1.5, 0.75), V(0, 1.38, 0.55), 1.2);
      }],
      [30.7, () => { this.cap.stage = 1; this.cap.k = 0; this.tw.oHold = 1; }],
      [31.4, () => g.ui.subtitle('这是你的军帽。', 2, '少校 · MAJ. SMITH')],
      [32.0, () => { this.cap.stage = 2; this.cap.k = 0; }],
      [33.2, () => { this.tw.pHold = 1; this.tw.pAttention = 0; g.ui.subtitle('从今天起，你就是一名士兵了。', 2.6, '少校 · MAJ. SMITH'); }],
      [34.2, () => { this.cap.stage = 3; this.cap.k = 0; this.tw.oHold = 0; ch.setExpression('grin'); }],
      [35.0, () => g._cineTo(V(0.62, 1.72, 0.42), V(0, 1.7, 1.18), 1.3)],
      [36.2, () => { this.cap.stage = 4; this.cap.k = 0; }],
      [37.4, () => {
        this.cap.stage = 5; this.tw.pHold = 0; this.tw.pAttention = 1;
        g.audio.sparkle();
        g.fx.emit('star', ch.J.head.getWorldPosition(V()).add(V(0, 0.2, 0)), { count: 14, speed: 0.6, spread: 0.8, up: 0.5, gravity: -0.3, drag: 1.2, life: 1.4, size: 0.05, colors: ['#ffe08a', '#ffffff'], spin: 2 });
        S.ach.add('enlist');
      }],
      [38.2, () => {
        this.tw.pSalute = 1; this.tw.oSalute = 1; this.tw.sSalute = 1;
        g.audio.snap(); g.audio.drumRoll(1.2);
        g._cineTo(V(2.6, 1.6, 2.4), V(0, 1.5, 0.55), 1.4);
      }],
      [39.4, () => {
        g.audio.fanfare(); g.audio.cheer(4);
        this.R.excite = 1;
        this.confetti(8);
        this.flashes(14);
        this.card();
      }],
      [41.8, () => { this.tw.pSalute = 0; this.tw.oSalute = 0; this.tw.sSalute = 0; this.orbit = 0; }],
      [45.3, () => this.finish()],
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
    if (this.lidsEl) { this.lidsEl.remove(); this.lidsEl = null; }
    g.ch.setFirstPerson(false);
    if (this.w.pSit > 0.5 || this.tw.pSit) { this.tw.pSit = 0; this.w.pSit = 0; this.w.nod = this.tw.nod = 0; }
    if (this.sPost) { this.sWalk = null; this.sLean = 0; this.R.sarge.root.position.copy(this.sPost); this.R.sarge.root.rotation.y = this.sPostYaw; }
    if (g._skipBtn) { g._skipBtn.remove(); g._skipBtn = null; }
    // 跳过的话：直接把帽子戴好
    if (this.cap.stage < 5) { this.cap.stage = 5; this.g.S.ach.add('enlist'); this.walk = null; g.ctrl.pos.set(0, 0, 1.18); }
    this.tw.pHold = 0; this.tw.oHold = 0; this.tw.pSalute = 0; this.tw.oSalute = 0;
    this.R.excite = 0.8;
    if (g.S.done.some((d) => d.n === 1)) g.S.ach.add('loop');
    g.showEnd();
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
    // 坐着打瞌睡：头一点一点的；醒来站起来
    const nod = w.nod * (0.45 + 0.15 * Math.sin(this.t * 1.3));
    const prm = { speed, attention: w.pAttention * (speed > 0.05 ? 0 : 1), sit: w.pSit, lookPitch: lerp(0.05, -0.6, nod / 0.6) };
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
    // 教官：先在候场区弯腰冲主角喊，喊醒了再走回自己的位置
    let sSpeed = 0;
    if (this.sWalk) {
      const d = _a.copy(this.sWalk.to).sub(SG.root.position); d.y = 0;
      const dist = d.length();
      if (dist < 0.04) { this.sWalk = null; SG.root.rotation.y = dampAngle(SG.root.rotation.y, this.sPostYaw, 6, dt); }
      else { sSpeed = this.sWalk.speed; SG.root.position.addScaledVector(d.normalize(), Math.min(dist, sSpeed * dt)); SG.root.rotation.y = dampAngle(SG.root.rotation.y, Math.atan2(d.x, d.z), 8, dt); }
    } else if (this.sPost && !this.sLean && SG.root.position.distanceTo(this.sPost) < 0.05) SG.root.rotation.y = dampAngle(SG.root.rotation.y, this.sPostYaw, 4, dt);
    const lean = this.sLean || 0;
    const sPrm = sSpeed > 0 ? { speed: sSpeed } : { attention: 1 - lean, lookYaw: 0.25 * (1 - lean), lookPitch: lerp(0.02, -0.45, lean), crouch: lean * 0.35 };
    if (w.sSalute > 0.01) sPrm.ikR = { p: SALUTE_R, pole: SALUTE_POLE, w: w.sSalute, wr: [0.1, 0, 0.2] };
    SG.update(dt, sPrm);
  }
}
