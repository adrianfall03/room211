// 全程序化音效（WebAudio 合成，无外部音频文件）
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.loops = {};
    this._musicTimer = null;
    this.tension = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.22; this.mus.connect(this.master);
    // 噪声缓冲
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = c.createBuffer(1, len, c.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // 简易混响
    this.reverb = c.createConvolver();
    const rl = c.sampleRate * 1.1;
    const ir = c.createBuffer(2, rl, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < rl; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2);
    }
    this.reverb.buffer = ir;
    this.revGain = c.createGain(); this.revGain.gain.value = 0.18;
    this.reverb.connect(this.revGain).connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _out(node, rev = true) {
    node.connect(this.sfx);
    if (rev) node.connect(this.reverb);
  }

  tone({ f = 440, f2 = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, delay = 0, rev = true, dest = null }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = this.t + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    if (dest) g.connect(dest); else this._out(g, rev);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.3, type = 'bandpass', freq = 1000, freq2 = null, Q = 1, attack = 0.005, delay = 0, rev = true, brown = false, curve = null }) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = this.t + delay;
    const s = c.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = Q;
    f.frequency.setValueAtTime(freq, t0);
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    const g = c.createGain();
    if (curve) {
      g.gain.setValueAtTime(0.0001, t0);
      curve.forEach(([tt, v]) => g.gain.linearRampToValueAtTime(v * gain, t0 + tt * dur));
    } else {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    s.connect(f).connect(g);
    this._out(g, rev);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  // ----- 具体音效 -----
  footstep(run = false) {
    const p = 0.85 + Math.random() * 0.3;
    this.noise({ dur: 0.07, gain: run ? 0.22 : 0.14, type: 'bandpass', freq: 1400 * p, Q: 0.9, rev: false });
    this.tone({ f: 95 * p, f2: 60, dur: 0.08, gain: run ? 0.2 : 0.13, type: 'sine', rev: false });
  }
  click() { this.tone({ f: 1800, dur: 0.03, type: 'square', gain: 0.05, rev: false }); }
  hover() { this.tone({ f: 1200, dur: 0.025, type: 'sine', gain: 0.03, rev: false }); }
  tick() { this.noise({ dur: 0.025, gain: 0.25, type: 'highpass', freq: 3500, rev: false }); this.tone({ f: 2400, dur: 0.02, gain: 0.05, type: 'square', rev: false }); }
  pickup() {
    this.tone({ f: 660, f2: 990, dur: 0.12, type: 'triangle', gain: 0.18 });
    this.tone({ f: 990, f2: 1480, dur: 0.18, type: 'sine', gain: 0.14, delay: 0.08 });
  }
  clue() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, dur: 0.35, type: 'triangle', gain: 0.13, delay: i * 0.07 }));
  }
  error() {
    this.tone({ f: 180, dur: 0.12, type: 'square', gain: 0.1 });
    this.tone({ f: 150, dur: 0.16, type: 'square', gain: 0.1, delay: 0.13 });
  }
  unlock() {
    this.noise({ dur: 0.08, gain: 0.5, type: 'lowpass', freq: 900, rev: true });
    this.tone({ f: 220, f2: 110, dur: 0.12, type: 'square', gain: 0.12 });
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, dur: 0.5, type: 'sine', gain: 0.12, delay: 0.12 + i * 0.08 }));
  }
  lockedRattle() {
    for (let i = 0; i < 4; i++) {
      this.noise({ dur: 0.05, gain: 0.35, type: 'bandpass', freq: 2200 + Math.random() * 800, Q: 3, delay: i * 0.07 });
      this.tone({ f: 140, dur: 0.05, type: 'square', gain: 0.06, delay: i * 0.07 });
    }
  }
  paper() {
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.06 + Math.random() * 0.05, gain: 0.12, type: 'highpass', freq: 2500 + Math.random() * 2000, delay: i * 0.045 });
  }
  zipper() {
    for (let i = 0; i < 16; i++) this.noise({ dur: 0.02, gain: 0.18, type: 'bandpass', freq: 3000 + i * 60, Q: 4, delay: i * 0.028 });
  }
  drawer() {
    this.noise({ dur: 0.45, gain: 0.25, type: 'lowpass', freq: 500, freq2: 1400, curve: [[0.1, 1], [0.8, 0.8], [1, 0]] });
    this.tone({ f: 90, dur: 0.1, type: 'sine', gain: 0.2, delay: 0.42 });
  }
  curtain() {
    this.noise({ dur: 1.4, gain: 0.2, type: 'bandpass', freq: 1800, freq2: 3500, Q: 0.6, curve: [[0.1, 1], [0.7, 0.8], [1, 0]] });
    for (let i = 0; i < 9; i++) this.tone({ f: 3200 + Math.random() * 900, dur: 0.05, type: 'sine', gain: 0.04, delay: i * 0.12 });
  }
  acBeep() {
    this.tone({ f: 2300, dur: 0.09, type: 'sine', gain: 0.18 });
    this.tone({ f: 2300, dur: 0.09, type: 'sine', gain: 0.18, delay: 0.16 });
  }
  switchClick() { this.noise({ dur: 0.03, gain: 0.4, type: 'bandpass', freq: 2600, Q: 2, rev: false }); this.tone({ f: 600, dur: 0.03, type: 'square', gain: 0.05, rev: false }); }
  fluoro() {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.05, gain: 0.12, type: 'bandpass', freq: 120 * (2 + i), Q: 5, delay: i * 0.13 + Math.random() * 0.05 });
  }
  breath() { this.noise({ dur: 1.0, gain: 0.3, type: 'lowpass', freq: 900, freq2: 400, curve: [[0.15, 1], [0.6, 0.7], [1, 0]] }); }
  crunch() { for (let i = 0; i < 3; i++) this.noise({ dur: 0.08, gain: 0.35, type: 'bandpass', freq: 1800 + Math.random() * 1500, Q: 1.5, delay: i * 0.09 }); }
  doorSlam() {
    this.noise({ dur: 0.5, gain: 0.8, type: 'lowpass', freq: 400, brown: true });
    this.tone({ f: 70, f2: 40, dur: 0.4, type: 'sine', gain: 0.5 });
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.04, gain: 0.3, type: 'bandpass', freq: 2500, Q: 3, delay: 0.7 + i * 0.09 });
  }
  doorOpen() {
    const c = this.ctx; if (!c) return;
    const t0 = this.t, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t0);
    for (let i = 0; i < 12; i++) o.frequency.linearRampToValueAtTime(160 + Math.random() * 120, t0 + i * 0.1);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.08, t0 + 0.1); g.gain.linearRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(f).connect(g); this._out(g); o.start(t0); o.stop(t0 + 1.3);
    this.noise({ dur: 0.1, gain: 0.35, type: 'bandpass', freq: 1500, Q: 2 });
  }
  notify() {
    this.tone({ f: 1320, dur: 0.12, type: 'sine', gain: 0.16 });
    this.tone({ f: 1760, dur: 0.2, type: 'sine', gain: 0.14, delay: 0.1 });
  }
  vibrate() {
    const c = this.ctx; if (!c) return;
    const t0 = this.t, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = 150;
    g.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i < 2; i++) { g.gain.linearRampToValueAtTime(0.05, t0 + i * 0.35 + 0.02); g.gain.linearRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25); }
    o.connect(g); this._out(g, false); o.start(t0); o.stop(t0 + 0.8);
  }
  bootChime() { [392, 523, 659, 784].forEach((f, i) => this.tone({ f, dur: 0.6, type: 'sine', gain: 0.1, delay: i * 0.12 })); }
  typeKey() { this.noise({ dur: 0.03, gain: 0.15, type: 'bandpass', freq: 3000 + Math.random() * 1500, Q: 2, rev: false }); }
  uvOn() { this.tone({ f: 5200, dur: 0.05, type: 'square', gain: 0.03, rev: false }); this.tone({ f: 120, dur: 0.3, type: 'sawtooth', gain: 0.02, rev: false }); }
  success() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone({ f, dur: 0.5, type: 'triangle', gain: 0.14, delay: i * 0.11 }));
    this.tone({ f: 262, dur: 1.4, type: 'sawtooth', gain: 0.05, delay: 0.3 });
  }
  whoosh() { this.noise({ dur: 0.5, gain: 0.2, type: 'bandpass', freq: 400, freq2: 2400, Q: 0.8, curve: [[0.3, 1], [1, 0]] }); }
  // 洗手间
  glassDoor(open) {
    this.noise({ dur: 0.05, gain: 0.28, type: 'bandpass', freq: 2600, Q: 3 });
    this.tone({ f: open ? 540 : 440, f2: open ? 380 : 300, dur: 0.28, type: 'triangle', gain: 0.03 });
    if (!open) this.noise({ dur: 0.08, gain: 0.3, type: 'lowpass', freq: 700, delay: 0.5 });
  }
  stallDoor(open) {
    this.tone({ f: open ? 300 : 260, f2: open ? 220 : 180, dur: 0.35, type: 'sawtooth', gain: 0.025 });
    if (!open) { this.noise({ dur: 0.1, gain: 0.4, type: 'lowpass', freq: 500, delay: 0.45 }); this.tone({ f: 1800, dur: 0.03, type: 'square', gain: 0.04, delay: 0.55 }); }
  }
  water(dur = 2.4) {
    this.noise({ dur, gain: 0.16, type: 'bandpass', freq: 2300, Q: 0.4, curve: [[0.06, 1], [0.85, 0.9], [1, 0]] });
    this.noise({ dur, gain: 0.08, type: 'lowpass', freq: 600, curve: [[0.1, 1], [0.85, 0.8], [1, 0]] });
  }
  flush() {
    this.noise({ dur: 0.12, gain: 0.35, type: 'bandpass', freq: 900, Q: 2 });
    this.noise({ dur: 2.2, gain: 0.34, type: 'lowpass', freq: 2400, freq2: 450, delay: 0.1, curve: [[0.05, 1], [0.5, 0.85], [1, 0]] });
    for (let i = 0; i < 7; i++) this.tone({ f: 170 + Math.random() * 140, f2: 80, dur: 0.12, type: 'sine', gain: 0.07, delay: 1.1 + i * 0.13 });
  }
  monkey(pitch = 1) {
    // “呜呜——啊啊”：几声往上滑的叫声 + 两声往下落的
    const seq = [[620, 980, 0.1], [700, 1150, 0.1], [760, 1250, 0.11], [1320, 720, 0.2], [1260, 660, 0.22]];
    let d = 0;
    for (const [f, f2, dur] of seq) {
      this.tone({ f: f * pitch, f2: f2 * pitch, dur, type: 'triangle', gain: 0.06, delay: d });
      this.tone({ f: f * pitch * 2.01, f2: f2 * pitch * 2.01, dur, type: 'sine', gain: 0.018, delay: d });
      d += dur + 0.05;
    }
  }
  chirp() {
    const f = 3200 + Math.random() * 1600;
    this.tone({ f, f2: f * 1.3, dur: 0.08, type: 'sine', gain: 0.035, rev: true });
    this.tone({ f: f * 1.1, f2: f * 0.9, dur: 0.09, type: 'sine', gain: 0.03, delay: 0.1, rev: true });
  }

  // ----- 第二、三章 -----
  // 时空穿越：往上滑的呼啸 + 一串闪烁的高音
  warp() {
    this.noise({ dur: 2.2, gain: 0.35, type: 'bandpass', freq: 200, freq2: 5000, Q: 0.7, curve: [[0.2, 0.6], [0.75, 1], [1, 0]] });
    this.tone({ f: 80, f2: 600, dur: 2.0, type: 'sawtooth', gain: 0.05 });
    [1319, 1568, 1976, 2637, 3136].forEach((f, i) => this.tone({ f, dur: 0.6, type: 'sine', gain: 0.05, delay: 0.9 + i * 0.14 }));
  }
  chime() { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ f, dur: 1.2, type: 'sine', gain: 0.08, delay: i * 0.12 })); }
  creak() {
    const c = this.ctx; if (!c) return;
    const t0 = this.t, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90 + Math.random() * 40, t0);
    for (let i = 0; i < 10; i++) o.frequency.linearRampToValueAtTime(70 + Math.random() * 90, t0 + i * 0.09);
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 5;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.15); g.gain.linearRampToValueAtTime(0.0001, t0 + 0.95);
    o.connect(f).connect(g); this._out(g); o.start(t0); o.stop(t0 + 1);
  }
  drip() { this.tone({ f: 1400 + Math.random() * 500, f2: 600, dur: 0.12, type: 'sine', gain: 0.06 }); }
  caw(pitch = 1) {
    for (let i = 0; i < 2; i++) {
      this.noise({ dur: 0.22, gain: 0.16, type: 'bandpass', freq: 1100 * pitch, freq2: 700 * pitch, Q: 3, delay: i * 0.28 });
      this.tone({ f: 560 * pitch, f2: 380 * pitch, dur: 0.22, type: 'sawtooth', gain: 0.04, delay: i * 0.28 });
    }
  }
  squeak() { for (let i = 0; i < 3; i++) this.tone({ f: 3200 + Math.random() * 800, f2: 2600, dur: 0.06, type: 'sine', gain: 0.05, delay: i * 0.09 }); }
  spark() {
    for (let i = 0; i < 8; i++) this.noise({ dur: 0.04, gain: 0.4, type: 'highpass', freq: 3000, delay: i * 0.03 + Math.random() * 0.03 });
    this.tone({ f: 120, dur: 0.5, type: 'sawtooth', gain: 0.06 });
  }
  clunk() { this.noise({ dur: 0.18, gain: 0.5, type: 'lowpass', freq: 600, brown: true }); this.tone({ f: 90, f2: 50, dur: 0.2, type: 'square', gain: 0.1 }); }
  chainDrop() { for (let i = 0; i < 9; i++) this.noise({ dur: 0.05, gain: 0.3, type: 'bandpass', freq: 2600 + Math.random() * 1500, Q: 6, delay: i * 0.06 + Math.random() * 0.03 }); this.noise({ dur: 0.3, gain: 0.3, type: 'lowpass', freq: 500, delay: 0.5 }); }
  wipe() { for (let i = 0; i < 6; i++) this.noise({ dur: 0.18, gain: 0.12, type: 'bandpass', freq: 1800 + (i % 2) * 600, Q: 1.2, delay: i * 0.22 }); }
  // 破收音机：隔着沙沙的杂音放一段老歌
  radio(dur = 6) {
    this.noise({ dur, gain: 0.05, type: 'bandpass', freq: 3000, Q: 0.5, curve: [[0.05, 1], [0.9, 1], [1, 0]] });
    const mel = [392, 440, 494, 587, 494, 440, 392, 330, 294, 330, 392, 440, 392];
    mel.forEach((f, i) => { this.tone({ f, dur: 0.42, type: 'triangle', gain: 0.07, delay: 0.3 + i * 0.42 }); this.tone({ f: f / 2, dur: 0.4, type: 'sine', gain: 0.03, delay: 0.3 + i * 0.42 }); });
  }
  // 动物们
  cluck(pitch = 1) {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      this.tone({ f: 700 * pitch, f2: 420 * pitch, dur: 0.07, type: 'square', gain: 0.03, delay: i * 0.11 });
      this.noise({ dur: 0.05, gain: 0.08, type: 'bandpass', freq: 1500 * pitch, Q: 4, delay: i * 0.11 });
    }
  }
  bawk() { // 咯咯哒！
    [[620, 420, 0.08], [620, 420, 0.08], [880, 1180, 0.28]].forEach(([f, f2, d], i) => this.tone({ f, f2, dur: d, type: 'square', gain: 0.045, delay: [0, 0.13, 0.28][i] }));
  }
  neigh() {
    const c = this.ctx; if (!c) return;
    const t0 = this.t, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t0); o.frequency.linearRampToValueAtTime(1100, t0 + 0.25); o.frequency.linearRampToValueAtTime(420, t0 + 0.9);
    lfo.frequency.value = 22; lg.gain.value = 60; lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.05); g.gain.linearRampToValueAtTime(0.0001, t0 + 0.95);
    o.connect(f).connect(g); this._out(g); o.start(t0); lfo.start(t0); o.stop(t0 + 1); lfo.stop(t0 + 1);
  }
  giggle() { for (let i = 0; i < 4; i++) this.tone({ f: 520 + i * 30, f2: 380, dur: 0.1, type: 'triangle', gain: 0.04, delay: i * 0.13 }); }
  pew() { this.tone({ f: 1800, f2: 300, dur: 0.12, type: 'square', gain: 0.025, rev: false }); }
  poof() { this.noise({ dur: 0.5, gain: 0.3, type: 'bandpass', freq: 800, freq2: 3000, Q: 0.6, curve: [[0.05, 1], [1, 0]] }); }
  sparkle() { [1568, 2093, 2637, 3136].forEach((f, i) => this.tone({ f, dur: 0.3, type: 'sine', gain: 0.04, delay: i * 0.06 })); }
  pa(text = 0) { // 宿管阿姨的广播："叮咚——"
    this.tone({ f: 988, dur: 0.5, type: 'sine', gain: 0.1 });
    this.tone({ f: 784, dur: 0.7, type: 'sine', gain: 0.1, delay: 0.45 });
  }

  // ----- 第四章：冰封 211 -----
  // 暴风雪：两层一直在响的风声；阵风用 gust() 一阵一阵地叠上去
  startWind(gain = 1) {
    this.startLoop('wind', { type: 'bandpass', freq: 520, Q: 0.6, gain: 0.05 * gain, brown: false });
    this.startLoop('windLow', { type: 'lowpass', freq: 170, Q: 0.5, gain: 0.12 * gain, brown: true });
  }
  gust(k = 1) {
    const d = 2.2 + Math.random() * 1.6;
    this.noise({ dur: d, gain: 0.09 * k, type: 'bandpass', freq: 300 + Math.random() * 200, freq2: 800 + Math.random() * 700, Q: 1.6, curve: [[0.35, 1], [0.6, 0.85], [1, 0]] });
    this.noise({ dur: d * 0.8, gain: 0.03 * k, type: 'bandpass', freq: 1400, freq2: 2400, Q: 3, delay: d * 0.2, curve: [[0.4, 1], [1, 0]] });
  }
  // 窗户被风吹得咯吱响
  rattle() { for (let i = 0; i < 5; i++) this.noise({ dur: 0.04, gain: 0.1, type: 'bandpass', freq: 1300 + Math.random() * 700, Q: 4, delay: i * 0.05 + Math.random() * 0.02 }); }
  // 炉火：点着的那一声"呼——"，之后是一直在响的低沉火声（loop）+ 时不时噼啪一下
  ignite() {
    this.noise({ dur: 1.5, gain: 0.35, type: 'lowpass', freq: 300, freq2: 1600, brown: true, curve: [[0.08, 1], [0.5, 0.6], [1, 0]] });
    this.tone({ f: 55, f2: 90, dur: 1.2, type: 'sine', gain: 0.15 });
  }
  startFire() {
    this.startLoop('fire', { type: 'lowpass', freq: 420, Q: 0.4, gain: 0.07, brown: true });
    this.startLoop('fireHi', { type: 'bandpass', freq: 2600, Q: 0.5, gain: 0.01, brown: false });
  }
  crackle(k = 1) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.noise({ dur: 0.02 + Math.random() * 0.03, gain: (0.06 + Math.random() * 0.1) * k, type: 'highpass', freq: 2500 + Math.random() * 3000, delay: Math.random() * 0.25, rev: false });
  }
  // 铲煤 / 往炉子里倒煤：哗啦一下
  shovel() {
    this.noise({ dur: 0.35, gain: 0.3, type: 'bandpass', freq: 900, Q: 0.7, curve: [[0.1, 1], [1, 0]] });
    for (let i = 0; i < 9; i++) this.noise({ dur: 0.04, gain: 0.16, type: 'bandpass', freq: 1100 + Math.random() * 1800, Q: 3, delay: 0.08 + i * 0.04 + Math.random() * 0.03 });
  }
  // 蒸汽管里"当、当"的水锤声
  clank(n = 3) {
    for (let i = 0; i < n; i++) {
      const d = i * 0.22 + Math.random() * 0.08;
      this.tone({ f: 170 + Math.random() * 80, f2: 110, dur: 0.28, type: 'triangle', gain: 0.08, delay: d });
      this.tone({ f: 1100 + Math.random() * 400, dur: 0.2, type: 'sine', gain: 0.022, delay: d });
      this.noise({ dur: 0.05, gain: 0.14, type: 'bandpass', freq: 1800, Q: 2, delay: d });
    }
  }
  // 城市的蒸汽汽笛：三个音叠在一起、微微颤，远远地从窗外传过来
  steamWhistle(sec = 3, k = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = this.t;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(0.035 * k, t0 + 0.5);
    out.gain.setValueAtTime(0.035 * k, t0 + sec - 0.7); out.gain.linearRampToValueAtTime(0.0001, t0 + sec);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    for (const f of [311, 370, 466]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.94, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.6);
      const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 4.6; vg.gain.value = f * 0.004;
      v.connect(vg).connect(o.frequency); o.connect(lp);
      o.start(t0); v.start(t0); o.stop(t0 + sec + 0.1); v.stop(t0 + sec + 0.1);
    }
    lp.connect(out); this._out(out, true);
    this.noise({ dur: sec, gain: 0.04 * k, type: 'highpass', freq: 3000, curve: [[0.1, 1], [0.85, 0.8], [1, 0]] });
  }
  // 冰壳碎掉 / 冰柱掉下来摔碎
  iceBreak() {
    for (let i = 0; i < 7; i++) this.noise({ dur: 0.05 + Math.random() * 0.05, gain: 0.2, type: 'highpass', freq: 2500 + Math.random() * 4000, delay: i * 0.03 + Math.random() * 0.03 });
    this.tone({ f: 3200, f2: 1800, dur: 0.2, type: 'sine', gain: 0.04 });
  }
  // 小铁件掉在地上：叮、叮叮
  tink() { [0, 0.18, 0.3, 0.37].forEach((d, i) => this.tone({ f: 2400 - i * 90, f2: 2050, dur: 0.16, type: 'sine', gain: 0.08 / (i + 1), delay: d })); }
  // 气动传送管："咻——咚"
  tubeWhoosh() {
    this.noise({ dur: 0.9, gain: 0.25, type: 'bandpass', freq: 300, freq2: 2400, Q: 1.2, curve: [[0.6, 1], [1, 0]] });
    this.noise({ dur: 0.2, gain: 0.4, type: 'lowpass', freq: 500, brown: true, delay: 0.85 });
    this.tone({ f: 200, f2: 90, dur: 0.18, type: 'sine', gain: 0.12, delay: 0.85 });
  }
  // 上发条：一格一格往上拧
  ratchet(n = 8) {
    for (let i = 0; i < n; i++) { this.noise({ dur: 0.025, gain: 0.25, type: 'bandpass', freq: 2600, Q: 3, delay: i * 0.11 }); this.tone({ f: 900, dur: 0.02, type: 'square', gain: 0.02, delay: i * 0.11 }); }
  }
  // 自动机醒过来：嗤——放汽，齿轮"嗡——"地转起来，最后"叮"一声
  automatonBoot() {
    this.hiss();
    this.tone({ f: 55, f2: 220, dur: 1.9, type: 'sawtooth', gain: 0.03, attack: 0.3 });
    this.clank(2);
    this.tone({ f: 1318, dur: 1.2, type: 'sine', gain: 0.06, delay: 2.1 });
    this.tone({ f: 1976, dur: 0.8, type: 'sine', gain: 0.03, delay: 2.1 });
  }
  // 自动机说话：一串低低的方波"嘟嘟"声（字幕出来的时候配一下）
  robotVoice(dur = 1.2) {
    const n = Math.max(3, Math.round(dur / 0.13));
    for (let i = 0; i < n; i++) this.tone({ f: 110 + ((i * 37) % 5) * 14, dur: 0.1, type: 'square', gain: 0.018, delay: i * 0.13, rev: false });
  }
  // 打字机：咔哒；换行时"叮"
  typeClack() { this.noise({ dur: 0.03, gain: 0.2, type: 'bandpass', freq: 1800 + Math.random() * 800, Q: 1.5, rev: false }); this.tone({ f: 160, f2: 90, dur: 0.04, type: 'square', gain: 0.025, rev: false }); }
  typeDing() { this.tone({ f: 2093, dur: 0.6, type: 'sine', gain: 0.07 }); }
  // 城市广播：一口铜钟"当——当——"
  bell() { for (const d of [0, 1.1]) { this.tone({ f: 523, dur: 1.6, type: 'triangle', gain: 0.07, delay: d }); this.tone({ f: 523 * 2.76, dur: 0.9, type: 'sine', gain: 0.02, delay: d }); this.tone({ f: 262, dur: 1.8, type: 'sine', gain: 0.05, delay: d }); } }

  // ----- 第五章：太空舱 -----
  hiss() { this.noise({ dur: 1.1, gain: 0.3, type: 'highpass', freq: 2500, curve: [[0.05, 1], [0.6, 0.6], [1, 0]] }); this.tone({ f: 80, f2: 50, dur: 0.4, type: 'sine', gain: 0.12 }); }
  robotBeep(n = 2, base = 900) {
    for (let i = 0; i < n; i++) this.tone({ f: base * (1 + ((i * 7) % 5) * 0.18), dur: 0.07, type: 'square', gain: 0.035, delay: i * 0.09, rev: false });
  }
  snore() {
    this.noise({ dur: 1.2, gain: 0.18, type: 'lowpass', freq: 380, brown: true, curve: [[0.4, 1], [1, 0]] });
    this.tone({ f: 90, f2: 70, dur: 1.0, type: 'sawtooth', gain: 0.025 });
    this.tone({ f: 1400, f2: 2200, dur: 0.35, type: 'sine', gain: 0.03, delay: 1.3 });
  }
  slurp() { this.noise({ dur: 0.45, gain: 0.25, type: 'bandpass', freq: 700, freq2: 1600, Q: 3, curve: [[0.2, 1], [1, 0]] }); this.tone({ f: 300, f2: 700, dur: 0.2, type: 'sine', gain: 0.06, delay: 0.3 }); }
  pop() { this.tone({ f: 500, f2: 1400, dur: 0.08, type: 'sine', gain: 0.18 }); this.noise({ dur: 0.25, gain: 0.2, type: 'highpass', freq: 3000, delay: 0.02 }); }
  vacuum() { this.noise({ dur: 1.2, gain: 0.25, type: 'bandpass', freq: 1800, freq2: 500, Q: 0.7, curve: [[0.1, 1], [1, 0]] }); }
  alarm(sec = 3) {
    for (let t = 0; t < sec; t += 0.5) { this.tone({ f: 880, f2: 660, dur: 0.24, type: 'square', gain: 0.045, delay: t, rev: false }); this.tone({ f: 660, dur: 0.2, type: 'square', gain: 0.03, delay: t + 0.25, rev: false }); }
  }

  // ----- 第五章彩蛋：卡冈图雅 / 书架背后 -----
  // 大喊（隔着书架、隔着时空，闷闷的）："啊——！" 锯齿波 + 两个元音共振峰
  shout(pitch = 1, dur = 0.8, muffled = false) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = this.t;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240 * pitch, t0);
    o.frequency.linearRampToValueAtTime(275 * pitch, t0 + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(170 * pitch, t0 + dur);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = 6 * pitch; vib.connect(vg).connect(o.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime(0.35, t0 + 0.06); out.gain.setValueAtTime(0.3, t0 + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    for (const [f, q, gn] of [[820, 6, 1], [1250, 8, 0.6], [2600, 10, 0.2]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = c.createGain(); g.gain.value = gn;
      o.connect(bp).connect(g).connect(out);
    }
    let last = out;
    if (muffled) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; out.connect(lp); last = lp; }
    this._out(last, true);
    o.start(t0); vib.start(t0); o.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
  }
  rumble(sec = 3, gain = 0.5) { this.noise({ dur: sec, gain, type: 'lowpass', freq: 140, brown: true, curve: [[0.15, 1], [0.7, 0.8], [1, 0]] }); this.tone({ f: 42, f2: 30, dur: sec, type: 'sine', gain: 0.18, attack: 0.3 }); }
  // 雷：近的先"咔啦"一声炸开，再是长长的滚雷；远的只有闷闷的一串低音。dist 0（头顶）…1（很远）
  thunder(dist = 0.5, delay = 0) {
    const near = 1 - clamp01(dist);
    if (near > 0.55) { this.noise({ dur: 0.45, gain: 0.3 * near, type: 'highpass', freq: 1400, delay, curve: [[0.02, 1], [0.2, 0.4], [1, 0]] }); this.noise({ dur: 0.25, gain: 0.35 * near, type: 'lowpass', freq: 900, brown: true, delay }); }
    const d = 3.2 + dist * 2.5;
    this.noise({ dur: d, gain: 0.22 + near * 0.4, type: 'lowpass', freq: 130 + near * 260, brown: true, delay: delay + 0.04, curve: [[0.06, 1], [0.3, 0.6], [0.5, 0.85], [0.75, 0.4], [1, 0]] });
    this.tone({ f: 46, f2: 30, dur: d * 0.8, type: 'sine', gain: 0.08 + near * 0.14, delay: delay + 0.1, attack: 0.25 });
  }
  crack() { for (let i = 0; i < 5; i++) this.noise({ dur: 0.07, gain: 0.3, type: 'highpass', freq: 3000 + Math.random() * 3000, delay: i * 0.035 + Math.random() * 0.02 }); this.tone({ f: 2400, f2: 900, dur: 0.25, type: 'sine', gain: 0.05 }); }
  // 摩尔斯电码：'.' 短 '-' 长 ' ' 停顿
  morse(pattern, f = 740) {
    let t = 0;
    for (const ch of pattern) {
      if (ch === '.') { this.tone({ f, dur: 0.08, type: 'sine', gain: 0.07, delay: t, rev: false }); t += 0.16; }
      else if (ch === '-') { this.tone({ f, dur: 0.24, type: 'sine', gain: 0.07, delay: t, rev: false }); t += 0.32; }
      else t += 0.24;
    }
    return t;
  }
  heartbeat() { this.tone({ f: 60, f2: 40, dur: 0.18, type: 'sine', gain: 0.35 }); this.tone({ f: 55, f2: 38, dur: 0.2, type: 'sine', gain: 0.25, delay: 0.26 }); }
  thud() { this.noise({ dur: 0.25, gain: 0.45, type: 'lowpass', freq: 380, brown: true }); this.tone({ f: 110, f2: 60, dur: 0.18, type: 'sine', gain: 0.15 }); }
  // 管风琴一样的长音（五维空间里）：几个八度叠在一起，慢慢起伏
  organ(sec = 8, root = 110) {
    for (const [m, g] of [[1, 0.05], [1.5, 0.03], [2, 0.035], [3, 0.015], [4, 0.012]]) this.tone({ f: root * m, dur: sec, type: 'sine', gain: g, attack: 1.5 });
  }
  // 断电：一声闷响，电流声一路往下掉
  powerDown() {
    this.clunk();
    this.tone({ f: 240, f2: 38, dur: 1.5, type: 'sawtooth', gain: 0.045 });
    this.noise({ dur: 1.0, gain: 0.22, type: 'lowpass', freq: 2400, freq2: 120, curve: [[0.04, 1], [1, 0]] });
  }
  // 被白光吞没：一束越来越高、越来越亮的声音
  riser(sec = 6) {
    this.noise({ dur: sec, gain: 0.16, type: 'bandpass', freq: 220, freq2: 5200, Q: 1.3, curve: [[0.2, 0.25], [0.85, 1], [1, 0]] });
    this.tone({ f: 196, f2: 784, dur: sec, type: 'sine', gain: 0.035, attack: sec * 0.85 });
  }

  // ----- 结局：征兵报到 -----
  bugle() { // 号角：简单的五声进行
    const n = [[392, 0.3], [523, 0.3], [659, 0.3], [784, 0.7], [659, 0.3], [784, 1.1]];
    let t = 0;
    for (const [f, d] of n) {
      this.tone({ f, dur: d + 0.1, type: 'sawtooth', gain: 0.05, delay: t, attack: 0.03 });
      this.tone({ f: f * 2, dur: d, type: 'sine', gain: 0.02, delay: t, attack: 0.03 });
      t += d;
    }
  }
  drumRoll(sec = 1.6) { for (let t = 0; t < sec; t += 0.045) this.noise({ dur: 0.05, gain: 0.08 + (t / sec) * 0.12, type: 'bandpass', freq: 1800, Q: 0.8, delay: t, rev: false }); this.noise({ dur: 0.4, gain: 0.4, type: 'lowpass', freq: 200, delay: sec, brown: true }); }
  cheer(sec = 3) {
    this.noise({ dur: sec, gain: 0.22, type: 'bandpass', freq: 1500, Q: 0.4, curve: [[0.1, 1], [0.6, 0.8], [1, 0]] });
    for (let i = 0; i < 14; i++) this.noise({ dur: 0.05, gain: 0.25, type: 'bandpass', freq: 2500 + Math.random() * 1500, Q: 2, delay: Math.random() * sec * 0.8, rev: false }); // 掌声
    for (let i = 0; i < 4; i++) this.tone({ f: 1200 + Math.random() * 600, f2: 1800 + Math.random() * 400, dur: 0.35, type: 'sine', gain: 0.02, delay: Math.random() * sec * 0.6 }); // 口哨
  }
  snap() { this.noise({ dur: 0.06, gain: 0.35, type: 'bandpass', freq: 1200, Q: 1.5, rev: false }); this.tone({ f: 140, f2: 80, dur: 0.1, type: 'sine', gain: 0.1 }); }
  fanfare() {
    const seq = [[523, 0, 0.18], [523, 0.2, 0.18], [523, 0.4, 0.18], [659, 0.6, 0.5], [523, 1.15, 0.2], [659, 1.35, 0.2], [784, 1.55, 0.9]];
    for (const [f, d, len] of seq) {
      for (const m of [1, 1.26, 1.5]) this.tone({ f: f * m, dur: len + 0.15, type: 'sawtooth', gain: 0.025, delay: d, attack: 0.02 });
    }
    this.noise({ dur: 0.5, gain: 0.3, type: 'highpass', freq: 5000, delay: 1.55 }); // 镲
  }

  // ----- 循环环境音 -----
  startLoop(name, { type = 'noise', freq = 300, Q = 0.7, gain = 0.05, brown = true, osc = null } = {}) {
    if (!this.ctx || this.loops[name]) return;
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(gain, this.t + 1.2);
    let src;
    if (osc) {
      src = c.createOscillator(); src.type = osc; src.frequency.value = freq;
      src.connect(g);
    } else {
      src = c.createBufferSource(); src.buffer = brown ? this.brownBuf : this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type === 'noise' ? 'lowpass' : type; f.frequency.value = freq; f.Q.value = Q;
      src.connect(f).connect(g);
    }
    g.connect(this.amb);
    src.start();
    this.loops[name] = { src, g };
  }
  stopAllLoops(fade = 0.6) { for (const k of Object.keys(this.loops)) this.stopLoop(k, fade); }
  stopLoop(name, fade = 0.6) {
    const l = this.loops[name];
    if (!l || !this.ctx) return;
    l.g.gain.cancelScheduledValues(this.t);
    l.g.gain.setValueAtTime(l.g.gain.value, this.t);
    l.g.gain.linearRampToValueAtTime(0.0001, this.t + fade);
    l.src.stop(this.t + fade + 0.05);
    delete this.loops[name];
  }

  // ----- 背景音乐（程序生成的低沉氛围 + 紧张度）-----
  startMusic(theme = 'normal') {
    if (!this.ctx || this._musicTimer) return;
    if (theme === 'ruin') return this._musicRuin();
    if (theme === 'jungle') return this._musicJungle();
    if (theme === 'frost') return this._musicFrost();
    if (theme === 'space') return this._musicSpace();
    if (theme === 'finale') return this._musicFinale();
    const chords = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 233.1, 293.7]];
    let i = 0;
    const play = () => {
      const ch = chords[i % chords.length];
      const c = this.ctx, t0 = this.t;
      ch.forEach((f, k) => {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f / 2; o.detune.value = det;
          fl.type = 'lowpass'; fl.frequency.value = 500 + this.tension * 900; fl.Q.value = 0.5;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.05, t0 + 1.5);
          g.gain.linearRampToValueAtTime(0.0001, t0 + 7.8);
          o.connect(fl).connect(g).connect(this.mus);
          o.start(t0 + k * 0.05); o.stop(t0 + 8);
        }
      });
      // 高音琶音
      for (let n = 0; n < 8; n++) {
        const f = ch[n % 3] * (n % 2 ? 2 : 4);
        this.tone({ f, dur: 0.5, type: 'sine', gain: 0.018 + this.tension * 0.02, delay: n * 0.95, dest: this.mus });
      }
      if (this.tension > 0.5) {
        for (let n = 0; n < 16; n++) this.noise({ dur: 0.03, gain: 0.04 * this.tension, type: 'highpass', freq: 7000, delay: n * 0.5, rev: false });
      }
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 7600);
  }
  // 废墟：走调的八音盒，慢、长混响
  _musicRuin() {
    const notes = [659, 587, 523, 494, 440, 494, 523, 392];
    let i = 0;
    const play = () => {
      const c = this.ctx, t0 = this.t;
      for (let k = 0; k < 8; k++) {
        const f = notes[(i + k) % notes.length] * (1 + (Math.random() - 0.5) * 0.012);
        this.tone({ f, dur: 1.6, type: 'sine', gain: 0.03 + this.tension * 0.015, delay: k * 0.9, dest: this.mus });
        this.tone({ f: f * 2.01, dur: 0.8, type: 'sine', gain: 0.008, delay: k * 0.9, dest: this.mus });
      }
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 55 + this.tension * 10;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 2); g.gain.linearRampToValueAtTime(0.0001, t0 + 7.4);
      o.connect(g).connect(this.mus); o.start(t0); o.stop(t0 + 7.5);
      i += 3;
    };
    play();
    this._musicTimer = setInterval(play, 7200);
  }
  // 雨林：暴雨夜的配乐——雨声盖着一层很低的弦乐铺底，偶尔几下木琴一样的拨弦（像雨滴敲在叶子上），越紧张低音越重
  _musicJungle() {
    const prog = [[65.4, 98, 155.6], [58.3, 87.3, 146.8], [61.7, 92.5, 138.6], [55, 82.4, 130.8]];
    const pent = [392, 440, 523.3, 587.3, 659.3, 784];
    let i = 0;
    const play = () => {
      const ch = prog[i % prog.length], c = this.ctx, t0 = this.t, T = 9.2;
      ch.forEach((f) => {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          fl.type = 'lowpass'; fl.Q.value = 0.6;
          fl.frequency.setValueAtTime(200 + this.tension * 400, t0);
          fl.frequency.linearRampToValueAtTime(360 + this.tension * 700, t0 + T * 0.5);
          fl.frequency.linearRampToValueAtTime(190 + this.tension * 300, t0 + T);
          g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.026, t0 + 3); g.gain.linearRampToValueAtTime(0.0001, t0 + T);
          o.connect(fl).connect(g).connect(this.mus); g.connect(this.reverb);
          o.start(t0); o.stop(t0 + T + 0.1);
        }
      });
      // 木琴似的拨弦：稀稀拉拉几下，音高随机但都在五声音阶里
      const n = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const f = pent[Math.floor(Math.random() * pent.length)] * (Math.random() < 0.3 ? 0.5 : 1);
        const d = 0.8 + Math.random() * 7.4;
        this.tone({ f, dur: 1.1, type: 'sine', gain: 0.02, delay: d, dest: this.mus });
        this.tone({ f: f * 3.01, dur: 0.25, type: 'sine', gain: 0.005, delay: d, dest: this.mus });
      }
      if (this.tension > 0.35) for (let k = 0; k < 8; k++) { this.tone({ f: 49, dur: 0.3, type: 'sine', gain: 0.03 * this.tension, delay: k * 1.15, dest: this.mus }); this.tone({ f: 46, dur: 0.25, type: 'sine', gain: 0.02 * this.tension, delay: k * 1.15 + 0.3, dest: this.mus }); }
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 8600);
  }
  // 冰封 211：《冰汽时代》式的配乐——低沉的弦乐铺底（D 小调），隔一会儿一段大提琴旋律，远处铁砧一样的一声金属回响；
  //   紧张起来时，底下多一层定音鼓一样的闷响
  _cello(f, delay, dur, gain = 0.03) {
    const c = this.ctx, t0 = this.t + delay;
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(), v = c.createOscillator(), vg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    v.frequency.value = 5.2; vg.gain.value = f * 0.006; v.connect(vg).connect(o.frequency);
    fl.type = 'lowpass'; fl.frequency.value = 900; fl.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.5, dur * 0.35)); g.gain.linearRampToValueAtTime(gain * 0.8, t0 + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(fl).connect(g).connect(this.mus); g.connect(this.reverb);
    o.start(t0); v.start(t0); o.stop(t0 + dur + 0.1); v.stop(t0 + dur + 0.1);
  }
  _musicFrost() {
    const prog = [[73.4, 110, 174.6], [58.3, 87.3, 146.8], [65.4, 98, 155.6], [55, 82.4, 138.6]];
    const motifs = [
      [[293.7, 1.4], [349.2, 1.4], [329.6, 1.1], [293.7, 2.4]],
      [[220, 1.3], [261.6, 1.3], [233.1, 1.2], [220, 2.6]],
      [[349.2, 1.2], [392, 1.2], [440, 1.6], [392, 1.1], [349.2, 2.2]],
    ];
    let i = 0;
    const play = () => {
      const ch = prog[i % prog.length], c = this.ctx, t0 = this.t, T = 9.6;
      ch.forEach((f) => {
        for (const det of [-7, 6]) {
          const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          fl.type = 'lowpass'; fl.Q.value = 0.6;
          fl.frequency.setValueAtTime(220 + this.tension * 400, t0);
          fl.frequency.linearRampToValueAtTime(420 + this.tension * 800, t0 + T * 0.5);
          fl.frequency.linearRampToValueAtTime(220 + this.tension * 300, t0 + T);
          g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.026, t0 + 3); g.gain.linearRampToValueAtTime(0.0001, t0 + T);
          o.connect(fl).connect(g).connect(this.mus); g.connect(this.reverb);
          o.start(t0); o.stop(t0 + T + 0.1);
        }
      });
      // 大提琴：每隔一段来一句
      if (i % 2 === 0) {
        let d = 0.8;
        for (const [f, len] of motifs[(i / 2) % motifs.length]) { this._cello(f, d, len + 0.3, 0.022 + this.tension * 0.01); d += len; }
      }
      // 很远的一声铁砧
      if (i % 3 === 1) { const d = 2 + Math.random() * 5; this.tone({ f: 1480, dur: 2.2, type: 'sine', gain: 0.007, delay: d, dest: this.mus }); this.tone({ f: 2090, dur: 1.4, type: 'sine', gain: 0.004, delay: d, dest: this.mus }); }
      // 紧张起来：定音鼓
      if (this.tension > 0.3) for (let n = 0; n < 8; n++) this.tone({ f: 58, f2: 44, dur: 0.5, type: 'sine', gain: 0.04 * this.tension, delay: n * 1.2, dest: this.mus });
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 9000);
  }
  // 暴雨：两层噪声——高频的雨点 + 低频的雨声轰鸣
  startRain(gain = 1) {
    this.startLoop('rain', { type: 'bandpass', freq: 2400, Q: 0.35, gain: 0.07 * gain, brown: false });
    this.startLoop('rainLow', { type: 'lowpass', freq: 420, Q: 0.5, gain: 0.1 * gain, brown: true });
  }
  // 太空：空灵的合成器长音 + 慢慢的琶音（动画里宇宙场景的配乐）
  // 第五章：太空舱 —— 电影配乐式的氛围音：低沉的弦乐铺底、舱里空气循环的底噪、偶尔一声很远的金属回响；越紧张滤波开得越大，还有心跳一样的低音
  _musicSpace() {
    const prog = [[73.4, 110, 174.6], [65.4, 98, 155.6], [69.3, 103.8, 164.8], [61.7, 92.5, 146.8]];
    let i = 0;
    const play = () => {
      const ch = prog[i % prog.length], c = this.ctx, t0 = this.t, T = 8.6;
      ch.forEach((f, k) => {
        for (const det of [-7, 5]) {
          const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
          fl.type = 'lowpass'; fl.Q.value = 0.7;
          fl.frequency.setValueAtTime(260 + this.tension * 500, t0);
          fl.frequency.linearRampToValueAtTime(420 + this.tension * 900, t0 + T * 0.55);
          fl.frequency.linearRampToValueAtTime(240 + this.tension * 400, t0 + T);
          g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 2.6); g.gain.linearRampToValueAtTime(0.0001, t0 + T);
          o.connect(fl).connect(g).connect(this.mus); g.connect(this.reverb);
          o.start(t0); o.stop(t0 + T + 0.1);
        }
      });
      // 空气循环机的底噪
      this.noise({ dur: T, gain: 0.02, type: 'lowpass', freq: 170, Q: 0.4, brown: true, curve: [[0.25, 1], [0.75, 1], [1, 0]], rev: false });
      // 很远的一声金属回响（舱体热胀冷缩）
      if (i % 2 === 1) { const d = 1 + Math.random() * 5; this.tone({ f: 1320 + Math.random() * 600, dur: 2.8, type: 'sine', gain: 0.008, delay: d, dest: this.mus }); this.tone({ f: 330, dur: 1.6, type: 'triangle', gain: 0.006, delay: d, dest: this.mus }); }
      // 紧张起来：心跳一样的低音
      if (this.tension > 0.35) for (let n = 0; n < 8; n++) { this.tone({ f: 55, dur: 0.22, type: 'sine', gain: 0.03 * this.tension, delay: n * 1.05, dest: this.mus }); this.tone({ f: 52, dur: 0.18, type: 'sine', gain: 0.02 * this.tension, delay: n * 1.05 + 0.28, dest: this.mus }); }
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 8000);
  }
  // 结局：军乐队进行曲（小军鼓 + 铜管）
  _musicFinale() {
    const mel = [392, 392, 523, 523, 659, 659, 587, 523, 494, 523, 587, 392, 440, 494, 523, 523];
    const bass = [131, 196, 131, 196, 175, 262, 175, 262, 196, 294, 196, 294, 131, 196, 131, 196];
    let i = 0;
    const play = () => {
      for (let k = 0; k < 16; k++) {
        const d = k * 0.25;
        this.tone({ f: mel[k], dur: 0.22, type: 'sawtooth', gain: 0.02, delay: d, attack: 0.01, dest: this.mus });
        this.tone({ f: mel[k] * 1.5, dur: 0.2, type: 'triangle', gain: 0.012, delay: d, dest: this.mus });
        if (k % 2 === 0) this.tone({ f: bass[k], dur: 0.24, type: 'triangle', gain: 0.05, delay: d, dest: this.mus });
        this.noise({ dur: 0.05, gain: k % 4 === 0 ? 0.08 : 0.035, type: 'bandpass', freq: 2200, Q: 0.9, delay: d, rev: false });
        if (k % 4 === 3) this.noise({ dur: 0.05, gain: 0.03, type: 'bandpass', freq: 2200, Q: 0.9, delay: d + 0.125, rev: false });
      }
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 4000);
  }
  stopMusic() {
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = null;
  }
}

export const audio = new Audio();
