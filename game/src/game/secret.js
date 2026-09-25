// 第四章隐藏任务线："书架背后的幽灵"（致敬《星际穿越》）
//   ① 玩一会儿之后，资料库里自己飘出来一张索引卡：INDEX 001「引力异常 → 信息接收站 · 频道 211」（笔迹和我一模一样）
//   ② 信息接收站切到频道 211：一段来源不明的摩尔斯电码，时间戳是考试前一天夜里 02:47，解码出 INDEX 002：储藏室 · 货柜 G 的授权码
//   ③ 打开货柜 G：里面约束着一颗微型黑洞"卡冈图雅"。凑近去看——失重里刹不住，胳膊肘撞上了控制杆……
//   ④ 约束失效，时空开始破碎：整间舱从南往北一截一截被"切掉"（全局裁剪面），黑洞越长越大、把人往回拽，
//      能待的地方越来越少；45 秒内飘回资料库，抽出那本发光的《高等数学（下）》。没赶上 / 被吸进去：时间倒流回货柜前，再来
//   ⑤ 书缝后面，是考试前一天夜里的 211：电脑前两个人在打排位，其中一个就是你自己，另外两个室友站在后面指指点点。
//      你拼命地喊（他们听不见），只能从书架背后把书推下去……第二天早上，那三本书就躺在书架前的地上。
//   → 彩蛋结局
import * as THREE from 'three';
import { clamp, lerp, smoothstep, easeInOut, easeOut } from '../core/util.js';
import { PastDorm, PAST_POS } from './pastdorm.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V();
const T_COLLAPSE = 45; // 时空坍缩倒计时（秒）
const FRONT0 = 6.45, FRONT1 = -0.7; // 切面从储藏室的南墙一路推到资料库跟前
const MORSE = { G: '--.', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
// 书架背板上的"窗口"：按屏幕坐标去取另一个时空那一帧（同一个镜头画的），边缘一圈暖光、轻微的引力透镜扭曲
const PORTAL_FRAG = /* glsl */ `
  uniform sampler2D tPast; uniform vec2 res; uniform float power, time;
  varying vec2 vUv;
  void main() {
    vec2 uv = gl_FragCoord.xy / res;
    float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    uv += vec2(sin(uv.y * 90.0 + time * 3.0), cos(uv.x * 80.0 - time * 2.0)) * 0.0012 * (1.0 - smoothstep(0.0, 0.25, e));
    vec3 col = texture2D(tPast, uv).rgb * power;
    col += vec3(1.0, 0.82, 0.55) * (1.0 - smoothstep(0.0, 0.05, e)) * 0.5 * power;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// 时空的"切面"：一整面碎玻璃一样的裂纹，裂缝里透着光
const RIFT_FRAG = /* glsl */ `
  uniform float time, power; varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv * vec2(7.0, 6.0);
    vec2 ip = floor(p), fp = fract(p);
    float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + vec2(h(ip + o), h(ip + o + 17.0)) * (0.8 + 0.2 * sin(time * 0.7 + h(ip + o) * 6.28)) - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = ip + o; } else if (d < d2) d2 = d;
    }
    float edge = 1.0 - smoothstep(0.0, 0.07, sqrt(d2) - sqrt(d1));
    float flick = 0.55 + 0.45 * sin(time * 9.0 + h(id) * 6.28);
    vec3 col = mix(vec3(0.45, 0.85, 1.0), vec3(1.0, 0.72, 0.4), h(id + 3.0));
    float border = 1.0 - smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float a = (edge * flick + border * 0.8) * power;
    gl_FragColor = vec4(col * a * 2.0, a);
  }`;

const noRay = (m) => { m.userData.noRay = true; m.userData.noOutline = true; m.userData.keepMat = true; m.raycast = () => {}; m.castShadow = false; m.receiveShadow = false; return m; };

export class Secret {
  constructor(g, CH) {
    this.g = g; this.CH = CH;
    // 0 什么都没发生 / 1 索引卡飘出来了 / 2 读过索引卡 / 2.5 正在解码 / 3 频道 211 解码 / 4 货柜 G 开了 / 4.5 过场 / 5 时空坍缩 / 5.5 倒流 / 6 书架背后 / 7 结局
    this.stage = 0;
    this.code = [1 + Math.floor(g.rnd() * 9), Math.floor(g.rnd() * 10), Math.floor(g.rnd() * 10)].join('');
    this.tries = 0;
    this.lockerOpen = false;
    // 全局裁剪面：从这一章一开始就挂上（离得远远的，什么也不切），这样着色器一开始就按"有裁剪面"编译好，坍缩时不会卡
    this.plane = new THREE.Plane(V(0, 0, -1), 1000);
    g.gfx.renderer.clippingPlanes = [this.plane];
    const R = g.refs, G = R.gear;
    this.A = G.archive; this.St = G.storage; this.BH = G.blackHole;
    this.bhHome = this.BH.group.position.clone();
    this.card = null; this.jolt = 0; this.glow = 0;
    // 那本书的材质单独拿出来，好让它发光
    this.bookMats = [];
    this.A.target.group.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material && o.material.emissive) { o.material = o.material.clone(); this.bookMats.push(o.material); } });
    // 抽书的时候好瞄准：书外面套一个看不见的大一点的碰撞盒
    const tg = this.A.target;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, tg.h / 2, 0); hit.userData.iid = 'gBook';
    tg.group.add(hit);
    g.rayTargets && g.rayTargets.push(hit);
    // 时空的切面
    this.riftU = { time: { value: 0 }, power: { value: 0 } };
    this.rift = noRay(new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.1), new THREE.ShaderMaterial({ uniforms: this.riftU, vertexShader: VERT, fragmentShader: RIFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })));
    this.rift.position.set(0, 1.5, FRONT0); this.rift.visible = false; this.rift.renderOrder = 9;
    R.root.add(this.rift);
    this.past = null; this.portal = null;
    this.BH.timeScale = 1; this.BH.agitate = 1;
  }

  // ================== 交互 ==================
  handlers() {
    return {
      indexCard: { label: '索引卡', verb: '拿起来看', act: () => this.readCard() },
      lockerG: { label: '货柜 G', verb: () => (this.lockerOpen ? '查看' : '打开'), act: () => this.onLocker() },
      gargantua: { label: '卡冈图雅 · 微型黑洞', verb: () => (this.stage === 4 ? '凑近看看' : '查看'), reach: false, act: () => this.touch() },
      gBook: { label: '《高等数学（下）》', verb: () => (this.stage === 5 ? '抽出来！' : '查看'), act: () => this.onBook() },
      shelf: { label: '资料库', verb: () => (this.stage === 5 ? '找那本发光的书' : '查看'), reach: false, act: () => this.onShelf() },
    };
  }
  hint() {
    if (this.stage === 5) return '往北（舷窗那头）飞！资料库在西墙两台休眠舱中间，第五层（和眼睛一样高）那本发光的《高等数学（下）》——抽出来！按住 Shift 飞得更快。';
    if (this.stage === 4) return '……货柜 G 里的装置，最好别碰。（碰了会怎样呢？）';
    return null;
  }
  objectives() {
    return [
      { text: '📚 飞回资料库，抽出那本发光的书！', done: false },
      { text: `🕳️ 时空坍缩：还剩 ${this.remain()} 秒`, done: false },
    ];
  }
  remain() { return this.C ? Math.max(0, Math.ceil(T_COLLAPSE - this.C.t)) : T_COLLAPSE; }
  get collapsing() { return this.stage === 5; }

  onShelf() {
    const g = this.g;
    if (this.stage === 5) { g.say('那本发光的……第五层！和眼睛一样高！', 2.4); return; }
    g.say(this.stage >= 1 ? '资料库……顶上那盒索引卡里，刚才自己飘出来一张。书也时不时地在抖。' : '资料库：每一本书都拿松紧带勒着，不然全飘走了。顶上还有一盒索引卡。', 3.6);
  }
  onBook() {
    const g = this.g;
    if (this.stage === 5) { this.tesseract(); return; }
    if (this.stage >= 6) return;
    g.say(this.stage >= 1 ? '《高等数学（下）》……它在自己轻轻地发抖？' : '《高等数学（下）》……到了太空也躲不掉。', 3);
  }

  // ① 索引卡自己飘出来
  cardFalls() {
    const g = this.g, c = this.A.card;
    this.stage = 1;
    c.visible = true;
    this.card = { t: 0, p0: c.position.clone(), p1: V(-1.2, 1.95, -0.95) };
    g.audio.chime(); g.audio.rumble(1.4, 0.2);
    this.jolt = 1.4;
    const near = g.camera.position.distanceTo(V(-1.5, 1.7, -1.07)) < 3.8;
    if (near) g.after(0.8, () => g.say('……？资料库里有张卡片自己飘出来了？', 3));
    else g.ui.toast('资料库那边好像有什么东西飘了出来……', '', '📚');
    if (g.refs.robot.state === 'follow') g.after(3.6, () => { g.refs.robot.talkT = 3; g.ui.subtitle('检测到微弱的引力扰动……来源：资料库？奇怪，那边什么都没有啊。', 3.4, '小圆（机器人）'); });
  }
  readCard() {
    const g = this.g;
    this.A.card.visible = false;
    this.card = null;
    if (this.stage < 2) this.stage = 2;
    g.audio.paper();
    const node = g.ui.doc({
      title: '索引卡', variant: 'plain',
      html: `<div style="font:bold 15px monospace;color:#888">INDEX · 001</div><div style="font-size:20px;line-height:1.8;margin:6px 0">引力异常 → 信息接收站 · <b style="color:#c0392b">频道 211</b></div><div style="color:#888">卡片背面，一行歪歪扭扭的小字：<br>"如果你看到了这张卡——去听听那个频道。"</div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    g.clue('idx1', '🕳️ 隐藏线索 · 索引卡 001：引力异常 → <b>信息接收站 · 频道 211</b>');
    g.after(0.5, () => g.say('这笔迹……怎么跟我的一模一样？', 3));
  }

  // ② 信息接收站 · 频道 211（返回 true 表示接管了接收站的界面）
  stationChannel() {
    if (this.stage < 2) return false;
    const g = this.g, S = g.S;
    g.audio.robotBeep(2, 1200);
    const pat = ['G', ...this.code].map((c) => MORSE[c]).join(' ');
    const pulses = pat.replace(/\./g, '▪').replace(/-/g, '▬');
    const night = `2026-${String(S.month).padStart(2, '0')}-${String(S.day - 1).padStart(2, '0')}`;
    const decoded = `解码结果：<b>INDEX · 002</b> → 储藏室 · 货柜 G · 授权码 <b style="font-size:24px;color:#c0392b;letter-spacing:4px">${this.code}</b>`;
    const node = g.ui.doc({
      title: '信息接收站 · 频道 211', variant: 'plain',
      html: `<div style="line-height:1.8">信号来源：<b>不明</b>（方位：本舱内部……资料库？）<br>时间戳：<b style="color:#c0392b">${night} · 02:47</b>（？？）<div style="font:bold 22px monospace;letter-spacing:4px;margin:10px 0;color:#2a6fd8">${pulses}</div><div class="dec">${this.stage >= 3 ? decoded : '自动解码中……'}</div></div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (this.stage === 2) {
      this.stage = 2.5;
      const dur = g.audio.morse(pat.replace(/ /g, '  '));
      setTimeout(() => { const d = node.querySelector('.dec'); if (d) d.innerHTML = decoded; this.decoded(night); }, Math.max(1600, dur * 1000 + 300));
      // 趁着弹窗开着，在后台把"那天晚上的 211"搭好（第一次搭会卡一下）
      setTimeout(() => { if (this.alive) this.ensurePast(); }, 150);
    }
    return true;
  }
  // 这一章还在不在（解码 / 预搭场景都是定时器触发的，玩家可能已经离开了太空舱）
  get alive() { return this.g.CH === this.CH && this.CH.secret === this && this.g.refs.gear; }
  decoded(night) {
    const g = this.g;
    if (this.stage >= 3 || !this.alive) return;
    this.stage = 3;
    g.clue('idx2', `🕳️ 隐藏线索 · INDEX 002（频道 211 解码）：储藏室 · <b>货柜 G</b> · 授权码 <b>${this.code}</b>`);
    g.after(0.3, () => g.say(`${night.slice(5).replace('-', ' 月 ')} 日 02:47……那不是考试前一天晚上吗？`, 3.6));
  }
  // 信息接收站大屏上显示的东西
  commsChannel() { return this.stage >= 2 && this.stage < 6 ? 'CH-211 · 来源不明 ⚠' : 'CH-01 · 返回舱'; }
  anomaly() { return this.stage >= 2 && this.stage < 6 ? 1 : 0; }
  commsLines(base) {
    if (this.stage < 2) return base;
    const extra = [{ text: '[??:??] CH-211：检测到来源不明的脉冲信号', color: '#ffd23f' }];
    if (this.stage >= 3) extra.push({ text: `[02:47] 解码：INDEX 002 → 货柜 G · ${this.code}`, color: '#ffd23f' });
    return [...base, ...extra];
  }

  // ③ 货柜 G
  onLocker() {
    const g = this.g;
    if (this.lockerOpen) { g.say(this.stage >= 5 ? '……' : '货柜里那颗小黑洞还在转。最好离它远一点……吧？', 3); return; }
    if (!this._lockerSeen) { this._lockerSeen = true; g.say('货柜 G……贴满了"严禁触碰"。门上有个 3 位的密码面板。', 3); }
    const box = g.ui.lock({
      n: 3, title: '货柜 G · 授权码', variant: 'holo', labels: ['G', 'G', 'G'],
      hint: this.stage >= 3 ? `频道 211 解码：<b>${this.code}</b>` : '面板上刻着一行小字："去问问那天晚上的自己"',
      onTick: () => g.audio.robotBeep(1, 1600),
      onSubmit: (c) => {
        if (c === this.code) { g.audio.unlock(); g.ui.closeModal(); this.openLocker(); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  }
  openLocker() {
    const g = this.g, St = this.St;
    this.lockerOpen = true;
    if (this.stage < 4) this.stage = 4;
    g.audio.hiss(); g.audio.clunk();
    for (const d of St.doors) { const r0 = d.pivot.rotation.y; g.tween(1.2, (k) => (d.pivot.rotation.y = r0 - d.s * 1.9 * k), { ease: easeOut }); }
    this.BH.agitate = 2;
    g.after(1.0, () => { g.audio.sparkle(); g.say('……里面是……一个黑洞？！', 2.8); });
    g.after(1.6, () => { if (g.refs.robot.state === 'follow') { g.refs.robot.talkT = 3.4; g.refs.robot.emote.show('!', 1.6); g.ui.subtitle('那是"卡冈图雅"！实验用的微型奇点！千、千万别碰那个控制杆！', 3.4, '小圆（机器人）'); } });
    g.after(3.4, () => {
      g.audio.paper();
      const node = g.ui.doc({ title: '贴在约束球底座上的索引卡', variant: 'plain', html: `<div style="font:bold 15px monospace;color:#888">INDEX · 003</div><div style="font-size:20px;line-height:1.8;margin:6px 0">"它会带你回到那天晚上。"</div><div style="color:#888;text-align:right">—— ？</div>` });
      g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
      g.clue('idx3', '🕳️ 隐藏线索 · INDEX 003（货柜 G 里）：卡冈图雅"会带你回到那天晚上"。');
    });
  }

  // ④ 凑近去看——失重里刹不住，胳膊肘撞上了控制杆
  touch() {
    const g = this.g, St = this.St;
    if (this.stage !== 4) { g.say(this.stage >= 5 ? '……' : '那颗小黑洞还在约束球里转。', 2.4); return; }
    this.stage = 4.5;
    this.cutStart();
    // 人飘到装置左前方（镜头在右边，别被自己挡住），身子放低一点，手和装置差不多高
    g.ctrl.pos.y = 0.08;
    g.auto = { path: [V(-1.3, 0, 5.48)], speed: 0.7, i: 0 };
    g._afterReach = () => { const y0 = g.ctrl.charYaw; g.tween(0.5, (k) => { g.ctrl.charYaw = y0 + (0.4 - y0) * k; g.ch.root.rotation.y = g.ctrl.charYaw; }); };
    g._cineTo(V(-0.74, 1.9, 4.95), V(-1.12, 1.12, 6.0), 1.0); // 储藏室的隔墙在 x=-0.6，镜头得在墙里面
    g.after(0.4, () => g.say('……好小的黑洞。吸积盘还在转，跟电影里的一模一样……', 2.8));
    g.after(2.6, () => { g.ch.setExpression('focus'); g._cutPose = { lookPitch: -0.45 }; g.say('再凑近一点看看……', 1.6); });
    g.after(3.6, () => { g.auto = { path: [V(-1.18, 0, 5.7)], speed: 0.35, i: 0 }; g._afterReach = null; g.say('欸、欸——刹不住——', 1.4); });
    g.after(4.5, () => {
      g.tween(0.25, (k) => (St.lever.rotation.x = lerp(-0.5, 0.75, k)), { ease: easeOut });
      g.audio.clunk(); g.audio.crack(); g._shake(0.3);
      g.ch.setExpression('shock'); g._cutPose = { lookPitch: -0.3, lookYaw: 0.4 };
      g.ui.subtitle('咔哒。', 1.0, '');
    });
    g.after(5.3, () => g.say('……我、我是不是碰到了什么？', 2));
    g.after(6.2, () => {
      g.audio.alarm(3); g.audio.rumble(3, 0.6);
      this.BH.agitate = 7;
      this.CH._alarm = 3;
      this.CH.speedLines(g, 1.4);
      g._shake(0.5);
      g.tween(0.6, (k) => (St.glass.material.opacity = 0.16 + k * 0.6), { done: () => { St.glass.visible = false; g.audio.crack(); } });
      g.fx.emit('spark', this.bhHome.clone(), { count: 40, speed: 1.6, spread: 1.4, up: 0.5, gravity: 0, drag: 1.4, life: 1.2, size: 0.05, colors: ['#bfe8ff', '#ffffff', '#ffc860'] });
      g.audio.pa();
      g.after(0.9, () => g.ui.subtitle('【警报】卡冈图雅约束失效！时空结构正在破裂——！', 2.6, '📢 舱内广播'));
    });
    g.after(9.0, () => {
      if (g.refs.robot.state === 'follow') { g.refs.robot.talkT = 3; g.ui.subtitle('快跑！！去资料库！那里的引力读数是稳定的！', 3, '小圆（机器人）'); }
      else g.say('跑、跑！往资料库那边跑——那边在发光！', 3);
    });
    g.after(9.6, () => { this.cutEnd(); this.startCollapse(); });
  }

  startCollapse() {
    const g = this.g, R = g.refs;
    this.stage = 5;
    this.C = { t: 0, front: FRONT0, alarmT: 0, crackT: 0.5, sparkT: 0 };
    // 倒流用的存档
    this.snap = {
      floaters: R.floaters.list.map((f) => ({ f, anchor: f.anchor.clone(), pos: f.obj.position.clone(), vis: f.obj.visible })),
      bounds: { ...R.bounds },
    };
    // 不受裁剪面影响的东西（水球、镜子、光柱……）：过了切面就藏起来
    const skip = new Set();
    for (const o of [R.spaceSky.group, this.BH.group, this.rift, this.portal].filter(Boolean)) o.traverse((c) => skip.add(c));
    this.free = [];
    R.root.traverse((o) => { if (o.isMesh && o.visible && !skip.has(o) && o.material && (o.material.isShaderMaterial && !o.material.clipping || o.isReflector)) this.free.push(o); });
    this.rift.visible = true;
    g.audio.stopMusic();
    g.audio.startLoop('collapse', { freq: 120, gain: 0.16 });
    g.gfx.grade.target.aberration = 0.0045;
    g.S.ach.add('gargantua');
    g.ui.toast(`⚠ 时空坍缩！${T_COLLAPSE} 秒内飞回资料库，抽出那本发光的书！`, 'clue', '🕳️');
    g._refreshHUD(true);
  }
  updateCollapse(dt) {
    const g = this.g, C = this.C, R = g.refs;
    C.t += dt;
    const k = clamp(C.t / T_COLLAPSE, 0, 1);
    C.front = FRONT0 - (FRONT0 - FRONT1) * (0.3 * k + 0.7 * k * k);
    this.plane.constant = C.front; g._clipZ = C.front;
    this.rift.position.z = C.front - 0.004;
    this.riftU.power.value = Math.min(1, C.t * 1.5);
    R.bounds.maxZ = Math.min(this.snap.bounds.maxZ, C.front + 0.3);
    // 黑洞越长越大，往舱中间挪
    this.BH.radius = lerp(0.032, 0.46, smoothstep(0, 0.4, k)) + 0.12 * k;
    this.BH.group.position.set(lerp(this.bhHome.x, -0.3, k), lerp(this.bhHome.y, 1.5, k), lerp(this.bhHome.z, 5.2, k));
    // 引力：把人往黑洞那边拽
    const pos = g.ctrl.pos, bp = this.BH.group.position;
    const dx = bp.x - pos.x, dz = bp.z - pos.z, dist = Math.max(0.3, Math.hypot(dx, dz));
    const pull = Math.min(1.0, 0.18 + 0.6 * k + 0.35 / dist);
    pos.x += (dx / dist) * pull * dt; pos.z += (dz / dist) * pull * dt;
    g.collision.resolve(pos, g.ctrl.radius);
    const b = R.bounds;
    pos.x = clamp(pos.x, b.minX + 0.22, b.maxX - 0.22); pos.z = clamp(pos.z, b.minZ + 0.22, b.maxZ - 0.22);
    // 飘着的东西被拽向黑洞，过了切面就没了
    for (const s of this.snap.floaters) s.f.anchor.lerp(bp, dt * (0.05 + 0.25 * k));
    for (const o of this.free) if (o.visible && o.getWorldPosition(_a).z > C.front) o.visible = false;
    // 镜头抖、警报、裂开的声音
    const sh = 0.01 + 0.03 * k;
    g.camera.position.x += (Math.random() - 0.5) * sh; g.camera.position.y += (Math.random() - 0.5) * sh;
    C.alarmT -= dt; if (C.alarmT <= 0) { C.alarmT = 2.4; g.audio.alarm(1); }
    C.crackT -= dt; if (C.crackT <= 0) { C.crackT = 0.5 + Math.random() * 1.3; g.audio.crack(); if (Math.random() < 0.5) g.audio.rumble(1.2, 0.3); }
    this.CH._alarm = 0.5;
    if (!C.said1 && C.t > 10) { C.said1 = true; g.say('后面的舱……一截一截地消失了！能待的地方越来越少了！', 2.8); }
    if (!C.said2 && T_COLLAPSE - C.t < 12) { C.said2 = true; g.audio.pa(); g.ui.subtitle('【警报】时空结构即将完全坍缩！', 2.4, '📢 舱内广播'); }
    if (pos.z > C.front - 0.3) this.fail('caught');
    else if (C.t >= T_COLLAPSE) this.fail('time');
  }
  // 没赶上：画面被吸进黑洞 → 闪白 → 时间倒流回货柜前（可以再来一次）
  fail(reason) {
    if (this.stage !== 5) return;
    const g = this.g, G = g.gfx.grade;
    this.stage = 5.5;
    this.tries++;
    this.cutStart();
    g.audio.stopLoop('collapse', 0.3); g.audio.rumble(2.4, 0.7); g.audio.whoosh();
    g.ch.setExpression('shock');
    g.ui.subtitle(reason === 'caught' ? '啊啊啊啊——！！（被黑洞吸了进去）' : '……来、来不及了——！', 1.8, g.S.name);
    g.tween(1.1, (k) => { if (g.gfx.useComposer) G.warp = k * 0.9; }, { ease: (t) => t * t });
    g.after(0.7, () => g.ui.fade(1, { dur: 0.6, white: true }));
    g.after(1.6, () => {
      G.warp = 0;
      this.rewind();
      g.ui.fade(0, { dur: 1.2, white: true });
      g.after(1.4, () => g.ui.subtitle('……？时间……倒流回去了？我又站在货柜 G 前面……', 3.4, g.S.name));
      g.after(4.4, () => {
        this.cutEnd();
        g.ui.toast('🔁 黑洞一炸开就往资料库冲（按住 <kbd>Shift</kbd> 飞得更快），抽出第五层那本发光的书！再碰一下装置可以重来。', 'clue', '🕳️');
      });
    });
  }
  rewind() {
    const g = this.g, R = g.refs, St = this.St;
    this.plane.constant = 1000; g._clipZ = Infinity;
    this.rift.visible = false; this.riftU.power.value = 0;
    for (const s of this.snap.floaters) { s.f.anchor.copy(s.anchor); s.f.obj.position.copy(s.pos); s.f.vel.set(0, 0, 0); s.f.obj.visible = s.vis; }
    for (const o of this.free) o.visible = true;
    Object.assign(R.bounds, this.snap.bounds);
    this.BH.radius = 0.032; this.BH.group.position.copy(this.bhHome); this.BH.agitate = 2;
    St.lever.rotation.x = -0.5; St.glass.visible = true; St.glass.material.opacity = 0.16;
    g.gfx.grade.set('space');
    this.CH._alarm = 0;
    g.ctrl.teleport(-1.05, 5.25, 0);
    g.ch.root.position.set(-1.05, g.ctrl.pos.y, 5.25); g.ch.root.rotation.y = 0;
    g.ch.setExpression('focus');
    g._cutPose = null; g.auto = null;
    g._cineSet(V(-0.74, 1.9, 4.95), V(-1.12, 1.12, 6.0));
    this.stage = 4;
    g.audio.startMusic(this.CH.theme);
  }

  // ⑤ 抽出那本书：时间停住了，书缝后面是那天晚上的 211
  ensurePast() {
    if (this.past) return this.past;
    const g = this.g;
    this.past = new PastDorm(g);
    const c = this.A.cell;
    const U = { tPast: { value: this.past.rt.texture }, res: { value: new THREE.Vector2(1, 1) }, power: { value: 0 }, time: { value: 0 } };
    this.portalU = U;
    const q = noRay(new THREE.Mesh(new THREE.PlaneGeometry(c.z1 - c.z0, c.y1 - c.y0), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: PORTAL_FRAG })));
    q.position.set(c.x, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2); q.rotation.y = Math.PI / 2;
    q.visible = false;
    g.refs.root.add(q);
    this.portal = q;
    // 着色器先在后台编译好（编译时不能带着太空舱的裁剪面，不然真正画的时候还得重编一遍）
    const r = g.gfx.renderer;
    try {
      const pl = r.clippingPlanes; r.clippingPlanes = [];
      if (r.compileAsync) r.compileAsync(this.past.scene, g.camera).catch(() => {});
      r.clippingPlanes = pl;
    } catch (e) { /* 忽略 */ }
    return this.past;
  }

  cutStart() {
    const g = this.g;
    g.state = 'cut';
    g._setHover(null);
    g.ui.closeModal(true);
    g.input.exitLock();
    g.ui.showHUD(false); g.ui.showTouch(false); g.ui.letterbox(true);
    g.auto = null; g._afterReach = null; g._cutPose = null;
    g.ch.setFirstPerson(false); // 第一人称时头是藏起来的，过场里要露出来
    if (!g.cine) g._cineSet(g.camera.position.clone(), g.camLook.clone().copy(g.camera.getWorldDirection(_b)).multiplyScalar(3).add(g.camera.position));
  }
  cutEnd() {
    const g = this.g;
    g.state = 'play';
    g.auto = null; g._cutPose = null;
    g.ctrl.charYaw = g.ch.root.rotation.y;
    g.ctrl.yaw = g.ctrl.charYaw + Math.PI;
    g.ui.letterbox(false); g.ui.showHUD(true);
    if (g.input.isTouch) g.ui.showTouch(true);
    g._cineTo(null, null, 0.8);
    g._refreshHUD(true);
    g.input.requestLock();
  }

  // ================== 每帧 ==================
  // 只在自由活动时（CH.update）
  update(dt) {
    const g = this.g, S = g.S;
    if (this.stage === 0) {
      const near = g.camera.position.distanceTo(V(-1.5, 1.7, -1.07)) < 3.6;
      const ready = S.elapsed > 40 && (S.found.some(Boolean) || S.view || S.f.readNote);
      if ((ready && near) || S.elapsed > 150) this.cardFalls();
    }
    if (this.stage === 5) this.updateCollapse(dt);
  }
  // 每一帧（过场、结算时也要跑）
  world(dt, t) {
    const g = this.g, A = this.A;
    // 索引卡慢慢飘出来，然后在资料库前面打转
    const c = this.card;
    if (c) {
      c.t += dt;
      const k = easeOut(clamp(c.t / 3, 0, 1));
      A.card.position.lerpVectors(c.p0, c.p1, k);
      A.card.position.y += Math.sin(c.t * 1.2) * 0.03 * k;
      A.card.rotation.set(Math.sin(c.t * 0.7) * 0.4, Math.PI / 2 + c.t * 0.5, Math.sin(c.t * 0.9) * 0.3);
    }
    // 书自己在抖（像有人在书架背后推）
    if (this.stage >= 1 && this.stage < 5 && this.jolt <= 0 && Math.random() < dt * 0.1) this.jolt = 0.6;
    if (this.jolt > 0 && this.stage < 6) {
      this.jolt -= dt;
      for (const b of A.books) {
        if (b.shelf !== A.level) continue;
        const amp = this.jolt > 0 ? 0.004 : 0;
        b.group.position.set(b.home.x + (Math.random() - 0.5) * amp, b.home.y, b.home.z + (Math.random() - 0.5) * amp);
      }
    }
    // 那本书：线索出现后隐隐发光，时空坍缩时亮得刺眼
    const want = this.stage === 5 ? 1 : this.stage >= 1 && this.stage < 5 ? 0.12 : 0;
    this.glow = lerp(this.glow, want, 1 - Math.exp(-dt * 3));
    for (const m of this.bookMats) { m.emissive.set('#ffc860'); m.emissiveIntensity = this.glow * (0.9 + 0.6 * Math.sin(t * 6)); }
    this.BH.timeScale = this.stage >= 6 ? 0.08 : 1;
    this.riftU.time.value += dt * (this.stage >= 6 ? 0.1 : 1);
    if (this.stage === 5) {
      const C = this.C;
      C.sparkT -= dt;
      if (C.sparkT <= 0) {
        C.sparkT = 0.05;
        const p = V((Math.random() - 0.5) * 3.4, Math.random() * 2.9 + 0.05, C.front - 0.06);
        g.fx.emit('spark', p, { count: 2, speed: 0.6, spread: 1, up: 0.2, gravity: 0, drag: 1.2, life: 0.9, size: 0.05, colors: ['#bfe8ff', '#ffffff', '#ffc860'] });
      }
      if (Math.random() < dt * 3) g.fx.emit('dust', A.target.group.getWorldPosition(_a).add(V(0.12, 0.13, 0)), { count: 1, speed: 0.15, spread: 1, up: 0.15, gravity: 0, drag: 1, life: 1.2, size: 0.03, colors: ['#ffd9a0', '#fff4e0'] });
    }
    // 书架背后的那天晚上
    if (this.past && this.stage >= 6) {
      this.past.update(dt);
      const r = g.gfx.renderer;
      const U = this.portalU;
      r.getDrawingBufferSize(U.res.value);
      U.time.value = t;
      this.needPast = this.portal.visible && U.power.value > 0.01;
      // 那边的键盘声（闷闷的）
      if (this.view === 'gap' && Math.random() < dt * 9) g.audio.typeKey();
    }
    if (this.floatMe) g.ch.root.position.y = this.floatMe + Math.sin(t * 1.1) * 0.02;
    if (this.inter) this.updateInter(dt);
  }

  // 主画面渲染之前：先用同一个镜头把"那天晚上"画到贴图上（每一帧只画一次，快进逻辑时不画）
  beforeRender() {
    if (this.needPast && this.past) this.past.render(this.g.gfx.renderer, this.g.camera);
  }

  // ================== ⑤ 书架背后 ==================
  // 镜头：'gap' 从书缝往里看那天晚上的宿舍 / 'shout' 从书架背后隔着书缝看太空舱里的自己 / 'wide' 舱里的远景
  shot(kind, dur = 1.2) {
    const g = this.g, A = this.A, R = g.refs, tz = A.target.home.z;
    this.view = kind;
    const behind = kind === 'shout';
    R.westWall.visible = !behind; A.back.visible = !behind;
    // 书缝那一格是 y 1.64–1.99：镜头放在缝的正前方、稍微偏上偏北一点，视线穿过两个书架的缝，正好落在电脑桌那一片
    // （书抽走以后那一格空出来了，镜头可以直接探进缝里）
    if (kind === 'gap') { g._cineTo(V(-1.64, 1.84, -1.0), V(-4.3, 1.35, -1.89), dur); g.gfx.grade.set('normal'); }
    else if (kind === 'gapLow') { g._cineTo(V(-1.64, 1.8, -1.02), V(-2.45, 1.72, -1.12), dur); g.gfx.grade.set('normal'); }
    else if (kind === 'shout') { g._cineSet(V(-1.97, 1.8, tz + 0.02), V(-1.12, 1.76, tz)); g.gfx.grade.set('space'); }
    else if (kind === 'wide') { g._cineTo(V(0.25, 2.1, -0.2), V(-1.45, 1.72, tz), dur); g.gfx.grade.set('space'); }
  }
  tesseract() {
    const g = this.g, A = this.A, R = g.refs, S = g.S;
    if (this.stage !== 5) return;
    this.stage = 6;
    this.ensurePast();
    g.audio.stopLoop('collapse', 1.5); g.audio.stopMusic();
    this.cutStart();
    this.CH._alarm = 0;
    g.gfx.grade.set('space');
    R.floaters.timeScale = 0.06; // 时间几乎停住了
    const tz = A.target.home.z;
    // 人飘在资料库跟前，脸正对着那一格
    this.floatMe = 0.16;
    g.ctrl.pos.set(-0.98, 0.16, tz); g.ctrl.charYaw = -Math.PI / 2;
    g.ch.root.position.set(-0.98, 0.16, tz); g.ch.root.rotation.set(0, -Math.PI / 2, 0);
    g.ch.setFirstPerson(false);
    g._cutPose = { reach: 1, reachPitch: 0.35 };
    g._cineSet(V(0.15, 2.05, -0.3), V(-1.5, 1.72, tz));
    g.audio.heartbeat();
    g.audio.organ(16, 98);
    // 抽书：书被抽出来、飘走；两边的书往外歪，留出一道缝
    const b = A.target.group, p0 = b.position.clone();
    g.audio.paper();
    if (A.straps[A.level]) A.straps[A.level].visible = false; // 那一层的松紧带崩开了
    g.tween(1.0, (k) => { b.position.set(p0.x + k * 0.38, p0.y + k * 0.06, p0.z + k * 0.04); b.rotation.set(k * 0.3, k * 0.5, k * 0.2); }, { ease: easeOut, done: () => { const p1 = b.position.clone(); g.tween(4, (k) => { b.position.set(p1.x + k * 0.5, p1.y + k * 0.3, p1.z + k * 0.2); b.rotation.x += 0.01; }); } });
    // 两边各两本也跟着飘出来，再外面的往两边歪——留出一道够宽的缝
    for (const nb of A.books) {
      if (nb.shelf !== A.level || nb === A.target) continue;
      const d = nb.idx - A.target.idx, sd = Math.sign(d);
      if (Math.abs(d) > 3) continue;
      const p1 = nb.group.position.clone();
      if (Math.abs(d) <= 2) g.tween(3.0, (k) => { nb.group.position.set(p1.x + k * 0.5, p1.y + k * 0.12 * sd, p1.z + sd * k * 0.25); nb.group.rotation.set(sd * k * 0.8, k * 0.6, k * 0.3); }, { ease: easeOut, delay: 0.2 + Math.abs(d) * 0.15 + (d > 0 ? 0.1 : 0) });
      else g.tween(0.8, (k) => { nb.group.position.z = p1.z + sd * 0.03 * k; nb.group.rotation.x = sd * 0.2 * k; }, { ease: easeOut, delay: 0.5 });
    }
    this.portal.visible = true;
    g.tween(2.0, (k) => (this.portalU.power.value = k), { delay: 0.6 });
    const who = (k) => `${S.mates['ABC'.indexOf(k)]}（那天晚上）`;
    const me = S.name;
    const seq = [
      [1.2, () => { g._cutPose = null; g.ui.subtitle('……时间……停住了？', 2.2, me); }],
      [2.2, () => { this.shot('gap', 2.2); }],
      [4.6, () => g.ui.subtitle('……这是……211？', 2.2, me)],
      [6.6, () => g.ui.subtitle(`挂钟……02:47。考试前一天晚上……`, 2.6, me)],
      [9.0, () => g.ui.subtitle('书缝那边……屏幕的光……有人在打游戏？', 2.4, me)],
      [11.0, () => g.ui.subtitle('上啊！打团啊！开大开大！', 1.8, who('A'))],
      [12.6, () => g.ui.subtitle('别送了别送了——！', 1.6, who('C'))],
      [14.0, () => g.ui.subtitle('这波操作我给满分！再来一把！', 1.8, who('B'))],
      [16.0, () => { g.ui.subtitle('……不行。明天八点考高数！', 2.2, me); }],
      [17.6, () => this.startInter()],
    ];
    for (const [tt, fn] of seq) g.after(tt, fn);
  }
  // 可以操作的一段：大喊（他们听不见）、从背后把书推下去（书会掉）
  startInter() {
    const g = this.g;
    this.inter = { t: 0, shouts: 0, pushes: 0, busy: 0, done: false };
    const el = document.createElement('div');
    el.id = 'tess';
    el.innerHTML = '<div class="tess-hint">他们听不见你……但书会掉下去</div><button data-a="shout">📣 大喊 <kbd>空格</kbd></button><button data-a="push">📚 推书 <kbd>E</kbd></button>';
    el.querySelector('[data-a=shout]').addEventListener('click', () => this.shout());
    el.querySelector('[data-a=push]').addEventListener('click', () => this.push());
    document.body.appendChild(el);
    this.interEl = el;
  }
  updateInter(dt) {
    const I = this.inter, g = this.g, inp = g.input;
    if (I.done) return;
    I.t += dt;
    if (I.busy > 0) I.busy -= dt;
    if (inp.hit('Space')) this.shout();
    if (inp.hit('KeyE') || inp.hit('Enter')) this.push();
    // 一直不操作：自己喊、自己推
    if (I.busy <= 0 && I.t > 6 + I.shouts * 4 + I.pushes * 4) { if (I.shouts <= I.pushes) this.shout(); else this.push(); }
    if (I.pushes >= 3 && I.busy <= 0) this.endInter();
  }
  shout() {
    const I = this.inter, g = this.g, S = g.S;
    if (!I || I.done || I.busy > 0) return;
    I.busy = 1.8;
    const lines = ['别打了——！！', '去睡觉！！明天八点考高数！！', '听得见吗？！是我啊！！', `${S.name}！！关电脑！！`, '求你了……快去睡觉啊！！'];
    const line = lines[I.shouts % lines.length];
    I.shouts++;
    this.shot('shout');
    g.ch.setExpression('shock');
    g._cutPose = { reach: 1, reachPitch: 0.4 };
    g.audio.shout(1 + Math.random() * 0.12, 0.9);
    g._shake(0.12);
    g.ui.subtitle(line, 1.8, S.name);
    g.after(1.6, () => { if (this.inter && !this.inter.done && this.view === 'shout') { g._cutPose = null; this.shot('gap', 0.5); } });
  }
  push() {
    const I = this.inter, g = this.g, S = g.S;
    if (!I || I.done || I.busy > 0 || I.pushes >= 3) return;
    I.busy = 3.2;
    const i = I.pushes++;
    if (this.view !== 'gap') this.shot('gap', 0.4);
    g._cutPose = { reach: 1, reachPitch: 0.1 };
    g.after(0.5, () => { g._cutPose = null; });
    this.past.push(i);
    g.audio.paper();
    const who = (k) => `${S.mates['ABC'.indexOf(k)]}（那天晚上）`;
    if (i === 0) I.busy = 4.6;
    const R = [
      [[1.0, '……电脑前面那个人……是我？！', S.name], [2.3, '……？书怎么自己掉了？', `${S.name}（那天晚上）`], [3.5, '宿舍闹鬼了吧哈哈哈哈！', who('A')]],
      [[1.1, '又掉一本？！', who('C')], [2.4, '别管了！高地要掉了！', who('B')]],
      [[1.1, '……算了，明天再捡。再来一把！', `${S.name}（那天晚上）`], [2.6, '……看见了吗？！是我啊！！', S.name]],
    ][i];
    for (const [tt, text, w] of R) g.after(tt, () => g.ui.subtitle(text, 2, w));
  }
  endInter() {
    const g = this.g, S = g.S, I = this.inter;
    I.done = true;
    if (this.interEl) { this.interEl.remove(); this.interEl = null; }
    const who = (k) => `${S.mates['ABC'.indexOf(k)]}（那天晚上）`;
    const me = S.name;
    this.shot('gap', 0.6);
    const seq = [
      [0.4, () => { g.ui.subtitle('……等等，我去看看。', 1.8, who('A')); this.past.approach(); }],
      [2.6, () => this.shot('gapLow', 1.6)],
      [4.6, () => { g.audio.heartbeat(); g.ui.subtitle('……看这边……是我……！', 2.2, me); }],
      [6.6, () => { g.audio.heartbeat(); g.ui.subtitle('……书架后面，好像有人？', 2.4, who('A')); }],
      [9.0, () => g.ui.subtitle('你眼花了吧！快回来，最后一波！', 2.2, `${me}（那天晚上）`)],
      [11.0, () => { g.ui.subtitle('……哦。', 1.4, who('A')); this.past.leave(); }],
      [12.4, () => { this.shot('shout'); g.ch.setExpression('focus'); g.ui.subtitle('不……别走……', 2.2, me); }],
      [14.6, () => { this.shot('wide', 2.4); g.ui.subtitle('原来……那天晚上掉下来的书……是我推的。', 3.2, me); }],
      [18.0, () => { this.shot('gap', 1.8); g.ui.subtitle('我就是那个……"幽灵"。', 2.8, me); }],
      [21.0, () => { g.audio.rumble(3, 0.5); g.audio.organ(6, 147); g._shake(0.2); g.ui.fade(1, { dur: 1.8, white: true, card: '彩蛋结局 · 书架背后的幽灵<small>那天晚上，211 的书架上掉下来三本书</small>' }); }],
      [24.2, () => this.ending()],
    ];
    for (const [tt, fn] of seq) g.after(tt, fn);
  }
  // 结局：白屏退去，镜头还停在书缝前——那天晚上的 211 还在继续
  ending() {
    const g = this.g, S = g.S;
    this.stage = 7;
    this.floatMe = 0;
    g.ch.root.visible = false; // 镜头贴在书缝上，别让自己的后脑勺挡住
    this.shot('gap', 0.01);
    S.ach.add('stay');
    S.done.push({ n: 4, elapsed: S.elapsed, par: this.CH.par, hints: S.hints });
    g.showEnd({ secret: true });
    g.ui.fade(0, { dur: 2.2, white: true, card: '' });
  }
  // 结算时：镜头在书缝前轻轻地呼吸
  endView(dt) {
    const g = this.g, tz = this.A.target.home.z, t = g.time;
    g.camera.position.set(-1.64 + Math.sin(t * 0.3) * 0.008, 1.84 + Math.sin(t * 0.23) * 0.008, -1.0 + Math.sin(t * 0.17) * 0.008);
    g.camera.lookAt(-4.3, 1.35, -1.89);
  }
}
