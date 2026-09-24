// 全程序化音效（WebAudio 合成，无外部音频文件）
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
  bell() {
    [0, 0.5, 1.0, 1.5].forEach((d) => {
      this.tone({ f: 880, dur: 0.45, type: 'triangle', gain: 0.18, delay: d });
      this.tone({ f: 1760, dur: 0.3, type: 'sine', gain: 0.06, delay: d });
    });
  }
  success() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone({ f, dur: 0.5, type: 'triangle', gain: 0.14, delay: i * 0.11 }));
    this.tone({ f: 262, dur: 1.4, type: 'sawtooth', gain: 0.05, delay: 0.3 });
  }
  fail() {
    [392, 370, 349, 262].forEach((f, i) => this.tone({ f, dur: 0.7, type: 'sawtooth', gain: 0.08, delay: i * 0.35 }));
  }
  heartbeat() {
    this.tone({ f: 60, f2: 40, dur: 0.15, type: 'sine', gain: 0.35, rev: false });
    this.tone({ f: 55, f2: 38, dur: 0.15, type: 'sine', gain: 0.25, delay: 0.22, rev: false });
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
  bulbPop() { this.noise({ dur: 0.08, gain: 0.6, type: 'highpass', freq: 2000 }); this.noise({ dur: 0.6, gain: 0.15, type: 'highpass', freq: 5000, delay: 0.06 }); }
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
    if (theme === 'toon') return this._musicToon();
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
  // 卡通：蹦蹦跳跳的尤克里里 + 低音
  _musicToon() {
    const prog = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
    const mel = [0, 2, 1, 2, 0, 1, 2, 1];
    let i = 0;
    const play = () => {
      const ch = prog[i % prog.length];
      for (let k = 0; k < 8; k++) {
        const f = ch[mel[k]] * 2;
        this.tone({ f, dur: 0.22, type: 'triangle', gain: 0.03, delay: k * 0.25, dest: this.mus });
        if (k % 2 === 0) this.tone({ f: ch[0] / 2, dur: 0.3, type: 'sine', gain: 0.05, delay: k * 0.25, dest: this.mus });
      }
      if (this.tension > 0.5) for (let k = 0; k < 8; k++) this.noise({ dur: 0.02, gain: 0.03 * this.tension, type: 'highpass', freq: 7000, delay: k * 0.25, rev: false });
      i++;
    };
    play();
    this._musicTimer = setInterval(play, 2000);
  }
  stopMusic() {
    if (this._musicTimer) clearInterval(this._musicTimer);
    this._musicTimer = null;
  }
}

export const audio = new Audio();
