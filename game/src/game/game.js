// 游戏主逻辑：状态机 / 谜题 / 交互 / 过场 / 计时
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { clamp, lerp, damp, easeInOut, easeOut, easeIn, easeOutBack, formatMMSS, mulberry32, wrapAngle, dampAngle, nextFrame } from '../core/util.js';
import { FX } from '../world/fx.js';
import { CHAPTERS } from './chapters.js';
import { FinaleDirector } from './finale.js';
import { untoonify } from '../world/toonkit.js';

// 不限时：故事里的钟从开局时间往后走，越走越慢，永远差一点才到点（8:00 开考 / 18:00 天黑 / 23:00 熄灯）
// 走到一半所需的时间 ≈ TAU × 0.7；第二、三章用 CH.tau
const TAU1 = 10 * 60;
// ⚡ 闪电侠的速通线：第一章 10 分钟，第二、三章用 CH.par
const PAR1 = 10 * 60;

// 室友名字池：每局随机抽 3 个
const MATE_NAMES = [
  '五条悟', '虎杖悠仁', '夏油杰', '路飞', '索隆', '山治', '乔巴', '漩涡鸣人', '宇智波佐助', '卡卡西', '炭治郎', '我妻善逸', '樱木花道', '流川枫',
  '江户川柯南', '工藤新一', '蜡笔小新', '野比大雄', '胖虎', '哆啦A梦', '坂田银时', '夜神月', '埼玉老师', '贝吉塔', '黑崎一护', '犬夜叉', '空条承太郎', '利威尔兵长', '皮卡丘',
  '孙悟空', '猪八戒', '沙和尚', '唐僧', '哪吒', '敖丙', '杨戬', '武松', '鲁智深', '喜羊羊', '懒羊羊', '灰太狼', '熊大', '熊二', '光头强', '黑猫警长', '葫芦娃', '猪猪侠', '萧炎', '唐三', '韩立',
  '海绵宝宝', '派大星', '章鱼哥', '蜘蛛侠', '钢铁侠', '蝙蝠侠', '哈利·波特', '伏地魔', '汤姆猫', '杰瑞', '马里奥',
  '亚索', '提莫', '盖伦', '鲁班七号', '李白', '韩信', '程咬金', '诸葛亮', '关羽', '张飞', '赵云', '吕布',
];
// 三个室友戏份固定、名字随机（S.mates = [A, B, C]，下面的文案里用 {A}{B}{C} 占位）：
//   A：W1 的床（黄色碎花被），把准考证锁进行李箱，第③位写在窗户上
//   B：W2 的床（蓝被子），第②位在电脑里，第④位锁在抽屉里（钥匙在他袜子里）
//   C：E2 的床（粉色床帘）和旁边的书桌，用车锁锁门，第①位塞在空调里（电池在头盔里）

const ITEMS = {
  studentId: { icon: '🪪', name: '学生证', desc: '考试必带。照片上的你还没有黑眼圈。' },
  ticket: { icon: '🎫', name: '准考证', desc: '高等数学（下）· 08:00 · A-304' },
  phone: { icon: '📱', name: '手机', desc: '按 P 或点击查看宿舍群消息' },
  uv: { icon: '🔦', name: '紫光手电', desc: '按 F 开关。能照出肉眼看不见的荧光痕迹' },
  remote: { icon: '📟', name: '遥控器', desc: '空调遥控器' },
  batteries: { icon: '🔋', name: '5号电池', desc: '两节5号电池' },
  key: { icon: '🗝️', name: '小钥匙', desc: '从{B}袜子里掉出来的小钥匙……' },
  latiao: { icon: '🌶️', name: '辣条', desc: '点击吃掉' },
};

const FLAVOR = {
  pinkBag: ['粉色纸袋', '一个粉色购物袋，里面塞满了零食包装袋……谁买的？'],
  foldTable: ['折叠桌', '门边的黑色小桌：矿泉水、粉色纸袋，还有一盒香皂。'],
  broom: ['扫把', '要不先扫个地？……不了不了，没时间了！'],
  blackTable: ['杂物桌', '泡面桶、可乐瓶、黄色脸盆……这张桌子就是男生宿舍的缩影。'],
  bedW1: ['{A}的床', '{A}的下铺，凉席上盖着黄色碎花被子，枕头有股泡面味。'],
  bedW2: ['{B}的床', '{B}的床，蓝色被子，蚊帐里挂满了……袜子？'],
  shelf: ['书架', '书架上塞满了书和杂物，大部分书的塑封都还没拆。'],
  shoeRack: ['鞋架', '七层鞋架塞得满满当当，没有一双鞋是干净的。'],
  storageBox: ['收纳箱', '透明收纳箱，上面扔着白色棒球帽和一件黑T恤。'],
  polkaBag: ['波点收纳袋', '装满换季衣服的收纳袋，拉链都快撑爆了。'],
  box350: ['纸箱', '一箱 350ml 矿泉水……早就被喝光了，只剩空箱子。'],
  bedE1: ['我的床', '我的床。被子都没叠，灰色床帘半拉着。行李箱就在床边。'],
  patternRoll: ['花纹卷', '卷起来的凉席，套着花里胡哨的布套，挂在床柱上。'],
  bedE2: ['{C}的床', '{C}的床，粉色床帘据说是他女朋友挑的。'],
  farDesks: ['窗边书桌', '窗边两张桌子，堆满了书、瓶子、台灯和泡面。'],
  yellowBag: ['黄色袋子', '黄底蓝点的环保袋，里面装着一双拖鞋。'],
  toteBag: ['红色袋子', '红白相间的大袋子，上学期搬宿舍用的。'],
  redBag: ['红色收纳包', '鼓鼓的红色收纳包，{C}的冬衣都在里面。'],
  paper: ['复习资料', '散落一地的高数复习资料……考前抱佛脚的证据。'],
  mouse: ['鼠标', '陪我上了一百颗星的鼠标。今天，它也救不了我。'],
  pcTower: ['主机', '主机嗡嗡作响，昨晚它跟我一样没睡。'],
  stoolMe: ['我的凳子', '在这坐了一整夜，屁股都麻了。'],
  monitor2: ['{C}的显示器', '关着的。屏幕边贴着“禁止碰我电脑”。'],
  headset: ['耳机', '{B}的耳机。昨晚它也没能挡住我的五杀嚎叫。'],
  folder: ['文件夹', '《高数重点——{C}倾情整理》。字太丑了，看不懂。'],
  towels: ['毛巾', '四条毛巾挂在一根绳上……哪条是我的来着？'],
  wcBucket: ['水桶和拖把', '红水桶里插着拖把。上次拖地好像还是开学那天。'],
  shower: ['花洒', '早上八点考高数，现在洗澡？想都别想。'],
  graffiti: ['隔板涂鸦', '“逢考必过”“高数再挂就退学”……还画了只猴子，旁边写着“窗外有猴!!”'],
  bin: ['垃圾桶', '灰色翻盖垃圾桶，已经满到盖不上了。今天轮到谁倒？'],
};

const ACH = [
  ['fast', '⚡ 闪电侠', '每一章都在速通线内逃脱（第一章 10 分钟，之后每章 5 分钟）'],
  ['nohint', '🧠 学霸', '不用任何提示'],
  ['helmet', '🪖 头盔侠', '戴上了红白头盔'],
  ['foodie', '🍎 吃货', '吃掉苹果和辣条'],
  ['light', '💡 光明使者', '打开宿舍灯'],
  ['sun', '🌅 早安', '拉开窗帘'],
  ['quit', '🎮 戒网瘾', '在电脑上忍住没打游戏'],
  ['monkey', '🐒 花果山', '在洗手间窗外发现三只猴子'],
  ['flush', '🚽 人有三急', '考试前还冲了个厕所'],
  ['diary', '📔 考古学家', '读完了三十年后自己写的日记'],
  ['rat', '🐀 鼠鼠我呀', '惊动了废墟里的老鼠'],
  ['radio', '📻 老歌', '让破收音机唱了首歌'],
  ['photo', '📷 旧照片', '掀开白布，找到 211 的合照'],
  ['feather', '🪶 鸡飞狗跳', '让两只鸡的游戏掉线'],
  ['fashion', '🪖 时尚猴王', '把头盔送给爱照镜子的猴子'],
  ['chick', '🐣 撸鸡', '摸了摸小黄的脑袋'],
  ['robot', '🤖 机器人救星', '救下失控的机器人小圆'],
  ['water', '💧 太空饮水机', '一口一口喝光了一整颗水球'],
  ['earth', '🌍 地球夜景', '看到城市灯光拼出的数字'],
  ['spacewalk', '🧑‍🚀 天花板漫步', '在失重的太空舱里飘到天花板'],
  ['enlist', '🎖️ 新兵报到', '接过少校递来的军帽，回敬一个军礼'],
  ['loop', '🔁 轮回终结者', '从第一章开始，逃出全部四个 211'],
];

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // gfx, scene, camera, refs, ch, ctrl, input, ui, audio, faceImg, settings, saveSettings
    this.state = 'title';
    this.time = 0;
    this.tweens = [];
    this.timers = [];
    this.paused = false;
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.hover = null;
    this.aim = new THREE.Vector3();
    this.cine = null;
    this.camLook = new THREE.Vector3();
    this.auto = null;
    this.reachT = 0;
    this.suppressPause = false;
    this.light = { hemi: 0.32, win: 2.2, sun: 0, spot: 0, tube: 0, flicker: 0 };
    this.chapter = 1;
    this.CH = null;
    this.fx = new FX(this.scene);
    this.handlers = this._handlers();
    this._collectRayTargets();
    this._buildUV();
    this._buildDust();
    this.input.onLockChange = (locked) => this._onLockChange(locked);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'play' && !this.ui.modalOpen && !this.paused && !this.input.locked) this.openPause();
      if (e.code === 'Escape' && this._admiring) this.showResults();
    });
    this.gfx.canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.ui.modalOpen && !this.paused && !this.input.locked) this.input.requestLock();
    });
    this._bindAdmireControls();
  }

  // ================== 基础设施 ==================
  tween(dur, fn, { ease = easeInOut, done = null, delay = 0 } = {}) {
    const tw = { t: -delay, dur, fn, ease, done };
    this.tweens.push(tw);
    return tw;
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  _tick(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.fn(tw.ease(k), k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done && tw.done(); }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
  }
  _collectRayTargets() {
    const list = [];
    this.scene.traverse((o) => { if (o.isMesh && (o.userData.iid || this.refs.occluders.includes(o))) list.push(o); });
    this.rayTargets = list;
  }
  _visible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
  _rootOf(o) {
    const id = o.userData.iid;
    while (o.parent && o.parent.userData && o.parent.userData.iid === id) o = o.parent;
    return o;
  }

  openModal(node, opts = {}) {
    this.suppressPause = true;
    this.input.exitLock();
    this.ui.setPrompt(null);
    this.ui.openModal(node, {
      ...opts,
      onClose: () => {
        opts.onClose && opts.onClose();
        if (this.state === 'play' && !this.paused) this.input.requestLock();
        setTimeout(() => (this.suppressPause = false), 200);
      },
    });
  }
  _onLockChange(locked) {
    if (locked) { this.ui.setClickToPlay(false); return; }
    if (this.suppressPause || this.ui.modalOpen) return;
    if (this.state === 'play' && !this.paused) this.openPause();
  }

  // ================== 新的一局 ==================
  // view：鉴赏模式——没有任务、没有门锁，走到门口就去下一关
  newRun({ name, chapter = 1, view = false }) {
    const rnd = mulberry32((Date.now() ^ 0x5f3759df) >>> 0);
    this.rnd = rnd;
    const r = (n) => Math.floor(rnd() * n);
    const dates = [[6, 18], [6, 25], [6, 12], [6, 19], [6, 23], [6, 16], [1, 12], [1, 15], [1, 18], [1, 20]];
    const [month, day] = dates[r(dates.length)];
    const words = ['GANK', 'PUSH', 'FARM', 'WARD', 'TANK', 'KITE', 'DIVE', 'JUNG'];
    const digits = [1 + r(9), r(10), r(10), r(10)];
    const pool = MATE_NAMES.filter((m) => m !== name);
    const mates = [0, 1, 2].map(() => pool.splice(r(pool.length), 1)[0]);
    this.S = {
      name: name || '我', mates, elapsed: 0, hints: 0, freeHints: 0,
      digits, found: [false, false, false, false], month, day, suitCode: `${month}${day}`, pcPass: words[r(words.length)],
      f: {}, inv: [], clues: new Map(), ach: new Set(), phoneCharge: 0, msgSent: {}, newItem: null, helmetOn: false,
      lastSec: -1, chapter, done: [], view: !!view,
    };
    this.handlers = this._handlers();
    this.ui.setViewMode(this.S.view);
    const R = this.refs;
    TX.drawCalendar(R.calendar.canvas, { month, day });
    R.calendar.tex.needsUpdate = true;
    TX.drawTicket(R.ticket.canvas, { name: this.S.name, faceImg: this.faceImg, month, day });
    R.ticket.tex.needsUpdate = true;
    TX.drawKeyboardUV(R.kbUV.canvas, this.S.pcPass);
    R.kbUV.tex.needsUpdate = true;
    TX.drawWindowFog(R.fog.canvas, digits[2]);
    R.fog.tex.needsUpdate = true;
    const [A, B, C] = mates;
    const roster = R.interact.roster;
    roster.material.map = TX.genDutyRoster([A, B, C, this.S.name, A, B, '全员大扫除']);
    roster.material.needsUpdate = true;
    TX.drawUVDoodles(R.doodle.canvas, C);
    R.doodle.tex.needsUpdate = true;
    this.msgs = this._initialMessages();
  }

  _initialMessages() {
    const [A, B, C] = this.S.mates;
    return [
      { time: '06:52', who: A, text: '起床了起床了！今天考高数！！' },
      { who: B, text: '@睡神 醒醒' },
      { who: C, text: '叫不醒，打了一晚上排位，呼噜打得跟拖拉机一样 🚜' },
      { time: '07:03', who: A, text: '那就给他留点“惊喜” 😏' },
      { who: C, text: '门我用他自己的车锁锁上了 🔒 4位密码拆成4份藏宿舍里了' },
      { who: C, text: '第①位我塞空调里了。遥控器电池？藏他宝贝头盔里了 🪖' },
      { time: '07:08', who: B, text: '第②位在他电脑里。开机密码？用紫光手电照照他天天敲的东西 😎' },
      { who: A, text: '准考证和紫光手电我都塞他行李箱里了，箱子密码是“他最怕的那一天” 📅' },
      { time: '07:12', who: A, text: '第③位我写在窗户玻璃上了，对着玻璃哈口气就能看见 🌫️' },
      { who: B, text: '第④位锁他抽屉里了，抽屉钥匙……在我昨天穿的袜子里 🧦 自己去脏衣篓翻' },
      { who: C, text: `${B}你是魔鬼吧 🤮` },
      { time: '07:20', who: A, text: '8点开考，他要是出不来就等着重修吧 🙏' },
      { who: C, text: '兄弟们撤了，考场见！' },
    ];
  }

  // ================== 标题画面 ==================
  enterTitle() {
    this.state = 'title';
    this.ctrl.sitting = false;
    this.ctrl.overrides = null;
    this.ctrl.teleport(0.05, -0.55, 0);
    this.ch.root.position.set(0.05, 0, -0.55);
    this.ch.root.rotation.y = 0.15;
    this.ch.setExpression('grin');
    this.titleT = 0;
    this.lightMode = 'title';
    this._titleExprT = 3;
  }
  _updateTitle(dt) {
    this.titleT += dt;
    const t = this.titleT;
    const cam = this.camera;
    const w = this.gfx.width, hh = this.gfx.height;
    if (w > 900) cam.setViewOffset(w, hh, -w * 0.17, 0, w, hh);
    else cam.setViewOffset(w, hh, 0, hh * 0.2, w, hh);
    cam.position.set(0.35 + Math.sin(t * 0.21) * 0.35, 1.42 + Math.sin(t * 0.17) * 0.06, 1.55 + Math.sin(t * 0.13) * 0.25);
    this.camLook.set(0.05, 1.22, -0.55);
    cam.lookAt(this.camLook);
    const toCam = Math.atan2(cam.position.x - 0.05, cam.position.z + 0.55);
    const lookYaw = wrapAngle(toCam - this.ch.root.rotation.y);
    this._titleExprT -= dt;
    if (this._titleExprT <= 0) {
      const next = this.ch.expression === 'grin' ? 'neutral' : 'grin';
      this.ch.setExpression(next);
      this._titleExprT = next === 'grin' ? 4 : 3;
    }
    const wave = Math.max(0, Math.sin(t * 0.5 - 1)) > 0.97 ? 1 : 0;
    this.ch.update(dt, { lookYaw: lookYaw * 0.8, lookPitch: 0.05, cheer: wave * 0 });
  }

  // ================== 开场过场 ==================
  startIntro(opts) {
    this.newRun(opts);
    if (opts.chapter > 1) {
      // 直接从第二 / 三章开始：跳过第一章，从标题画面直接穿越过去
      this.ui.hideTitle();
      this.camera.clearViewOffset();
      this.goChapter(opts.chapter, { fromTitle: true });
      return;
    }
    if (this.S.view) this._removeDoorLock();
    this.state = 'intro';
    this.ui.hideTitle();
    this.camera.clearViewOffset();
    this.ui.letterbox(true);
    this.lightMode = 'game';
    this.light.spot = 0; this.light.tube = 0;
    const R = this.refs;
    this.ctrl.sitting = true;
    this.ctrl.teleport(R.sit.x, R.sit.z, R.sit.yaw);
    this.ctrl.pitch = -0.1;
    this.ctrl.overrides = { sit: 1, sleep: 1 };
    this.ch.setExpression('sleep');
    this.ch.root.position.set(R.sit.x, 0, R.sit.z);
    this.ch.root.rotation.y = R.sit.yaw;
    this.audio.startLoop('room', { freq: 160, gain: 0.05 });
    this._cineSet(new THREE.Vector3(1.62, 1.28, 0.92), new THREE.Vector3(1.18, 0.98, 0.3));
    this._cineTo(new THREE.Vector3(1.5, 1.18, 0.85), new THREE.Vector3(1.15, 0.98, 0.28), 5.2);
    this.ui.fade(1, { dur: 0.01, card: `期末考试当天<small>早上 07:28 · 211 宿舍</small>` });
    const skipBtn = document.createElement('button');
    skipBtn.id = 'skip'; skipBtn.textContent = '跳过 ▶▶';
    document.body.appendChild(skipBtn);
    this._skipBtn = skipBtn;
    skipBtn.addEventListener('click', () => this._skipIntro());
    this._introTimers = true;
    const seq = [
      [2.2, () => this.ui.fade(0, { dur: 1.6, card: `期末考试当天<small>早上 07:28 · 211 宿舍</small>` })],
      [3.9, () => { this.audio.doorSlam(); this._shake(0.35); }],
      [4.5, () => { this.ctrl.overrides = { sit: 1, sleep: 0 }; this.ch.setExpression('shock'); this.ui.subtitle('！！！', 1.2); }],
      [5.3, () => { this.ctrl.overrides = { sit: 1, lookYaw: -1.0, lookPitch: 0.05 }; this.ui.subtitle('……什么声音？门？', 2.2, this.S.name); this._cineTo(new THREE.Vector3(-0.35, 1.55, 1.35), new THREE.Vector3(0.95, 1.05, 0.25), 2.6); }],
      [7.2, () => { this.ctrl.overrides = { sit: 1, lookYaw: 0.05, lookPitch: 0.15 }; this.ch.setExpression('focus'); this.ui.subtitle('几点了……7:30？！', 2, this.S.name); }],
      [8.9, () => { this.ch.setExpression('shock'); this.ui.subtitle('8点考高数！！完了完了完了！', 2.4, this.S.name); this._shake(0.15); }],
      [10.2, () => this._standUp()],
      [11.4, () => this.beginPlay()],
    ];
    for (const [t, fn] of seq) this.after(t, () => { if (this.state === 'intro') fn(); });
  }
  _showSkip(fn) {
    if (this._skipBtn) this._skipBtn.remove();
    const b = document.createElement('button');
    b.id = 'skip'; b.textContent = '跳过 ▶▶';
    b.addEventListener('click', fn);
    document.body.appendChild(b);
    this._skipBtn = b;
  }
  // 跳过第二、三章的进门过场
  _skipCut() {
    if (this.state !== 'cut') return;
    this.timers = [];
    const D = this.refs.door;
    D.pivot.rotation.y = D.base;
    this.auto = null; this._afterReach = null; this._cutPose = null;
    this.ctrl.teleport(-1.05, 3.9, Math.PI / 2);
    this.ctrl.yaw = Math.PI / 2 + Math.PI;
    this.ch.setExpression('neutral');
    this._cineTo(null, null, 0.6);
    this.ui.subtitle('', 0.01);
    this.beginPlay();
  }
  _skipIntro() {
    if (this.state !== 'intro') return;
    this.timers = [];
    this.ui.fade(0, { dur: 0.3 });
    this._standUp(true);
    this.beginPlay();
  }
  _standUp(instant = false) {
    const R = this.refs;
    this.ctrl.overrides = null;
    this.ctrl.sitting = false;
    this.ch.setExpression('neutral');
    const from = new THREE.Vector3(R.sit.x, 0, R.sit.z), to = new THREE.Vector3(0.52, 0, 0.3);
    const yaw0 = R.sit.yaw, yaw1 = Math.PI;
    if (instant) { this.ctrl.teleport(to.x, to.z); this.ctrl.charYaw = yaw1; }
    else {
      this.tween(0.9, (k) => {
        this.ctrl.pos.lerpVectors(from, to, k);
        this.ctrl.charYaw = lerp(yaw0, yaw0 + wrapAngle(yaw1 - yaw0), k);
      });
    }
    this.ctrl.yaw = 0; this.ctrl.pitch = -0.12;
    this._cineTo(null, null, 1.2);
  }

  beginPlay() {
    if (this.state === 'play') return;
    if (this._skipBtn) { this._skipBtn.remove(); this._skipBtn = null; }
    this.state = 'play';
    this.cine = null;
    this.ctrl.overrides = null;
    this.ctrl.sitting = false;
    this.ui.letterbox(false);
    this.ui.showHUD(true);
    if (this.input.isTouch) this.ui.showTouch(true);
    this.auto = null;
    this._refreshHUD(true);
    this.audio.startMusic(this.CH ? this.CH.theme : 'normal');
    if (this.S.view) {
      this.ui.toast(`鉴赏模式：随便逛，走到${this._doorName()}口按 <kbd>E</kbd>（或随时按 <kbd>N</kbd>）${this.chapter < 4 ? '去下一关' : '看结局'}`, '', '🎬');
      if (this.CH && this.CH.onViewPlay) this.CH.onViewPlay(this);
    } else if (this.CH) { if (this.CH.onPlay) this.CH.onPlay(this); }
    else {
      this.ui.toast('WASD 移动 · 鼠标转视角 · E 互动 · H 提示', '', '🎮');
      this.after(1.2, () => this.ui.subtitle('冷静……先看看显示器上那张便利贴。', 4, this.S.name));
    }
    this.input.requestLock();
  }

  // ================== 每帧 ==================
  update(dt) {
    this.time += dt;
    const S = this.S;
    if (!this.paused) this._tick(dt);
    switch (this.state) {
      case 'title': this._updateTitle(dt); break;
      case 'intro': this.ctrl.update(dt, { allowMove: false }); this._saveGameCam(); this._updateCine(dt); break;
      case 'play': this._updatePlay(dt); break;
      case 'outro': this._updateOutro(dt); break;
      case 'cut': this._updateOutro(dt); break;
      case 'transition': this._updateOutro(dt); break;
      case 'end': this._updateOutro(dt); break;
      case 'finale': this._finale.update(dt); break;
    }
    this._updateWorld(dt);
    this.fx.update(dt, this.camera);
    this.input.endFrame();
  }

  _updatePlay(dt) {
    const S = this.S, inp = this.input;
    const modal = this.ui.modalOpen;
    const canAct = !modal && !this.paused;
    if (canAct) {
      if (inp.hit('KeyE') || inp.mouseClicked) this._interact();
      if (inp.hit('KeyF')) this.toggleUV();
      if (inp.hit('KeyV')) { this.ctrl.toggleMode(); this.ui.toast(this.ctrl.mode === 'first' ? '第一人称视角' : '第三人称视角', '', '🎥'); }
      if (inp.hit('KeyH')) this.hint();
      if (inp.hit('KeyJ') && !S.view) this.openJournal();
      if (inp.hit('KeyP') && S.inv.includes('phone')) this.openPhone();
      if (inp.hit('KeyN') && S.view) this.viewSkip();
      if (inp.hit('Escape') && this.input.isTouch) this.openPause();
      for (let i = 1; i <= 8; i++) if (inp.hit(`Digit${i}`) && S.inv[i - 1]) this.useItem(S.inv[i - 1]);
    }
    if (!this.paused) S.elapsed += dt;
    if (this.reachT > 0) this.reachT = Math.max(0, this.reachT - dt);
    const reachW = this.reachT > 0 ? Math.sin((1 - this.reachT / 0.7) * Math.PI) : 0;
    this.ctrl.update(dt, { allowMove: canAct, extra: { hold: S.uvOn ? 1 : 0, reach: reachW, reachPitch: this._reachPitch || 0 } });
    this._saveGameCam();
    if (this.cine) this._updateCine(dt);
    this._updateHover();
    this.ui.setClickToPlay(!inp.locked && !modal && !this.paused && !inp.isTouch && !this.cine);
    this._refreshHUD();
    this._storyEvents();
    if (this.CH && this.CH.update && !this.paused) this.CH.update(this, dt);
    // 手机充电
    if (!this.CH && S.f.stripOn && S.phoneCharge < 1 && !this.paused) {
      S.phoneCharge = Math.min(1, S.phoneCharge + dt / 9);
      this._phoneScreenT = (this._phoneScreenT || 0) - dt;
      if (this._phoneScreenT <= 0 || S.phoneCharge >= 1) {
        this._phoneScreenT = 0.4;
        if (S.phoneCharge >= 1) this._phoneBoot();
        else this._drawPhone('charging', S.phoneCharge);
      }
    }
  }

  _refreshHUD(force = false) {
    const S = this.S;
    const sec = Math.floor(S.elapsed);
    if (sec !== S.lastSec || force) {
      S.lastSec = sec;
      const clockText = this._clockText();
      this.ui.setClock(clockText, S.view ? '🎬 鉴赏模式' : `用时 ${formatMMSS(S.elapsed)}`);
      this.clockText = clockText;
    }
    if (!S.view) {
      this.ui.setCodes(S.digits, S.found, this.CH ? this.CH.codeIcons : null);
      this.ui.setObjectives(this._objectives());
    }
    if (force || this._invDirty) {
      this._invDirty = false;
      const IT = this._items();
      const items = S.inv.map((id) => ({ id, ...IT[id], desc: this._fill(IT[id].desc) }));
      this.ui.setInventory(items, { onClick: (it) => this.useItem(it.id), activeId: S.uvOn ? 'uv' : null, newId: S.newItem });
      S.newItem = null;
    }
  }

  // 故事进度 0 → 1（永远到不了 1）：驱动挂钟、天色和室友的催促。鉴赏模式里时间停在开局那一刻
  storyP() {
    const S = this.S;
    if (!S || S.view) return 0;
    return 1 - Math.exp(-S.elapsed / (this.CH ? this.CH.tau : TAU1));
  }
  // 故事里过去了几分钟：0–29，永远差一点才到点
  storyMinutes() { return Math.floor(29.99 * this.storyP()); }
  // 各章的"现在几点"：开局时间往后走，最多走到 x:59（第二章的挂钟停了，但 HUD 上的时间照走）
  _clockText() {
    if (this.CH && this.CH.clockText) return this.CH.clockText(this);
    const [h0, m0] = this.CH ? this.CH.clock : [7, 30];
    const mm = m0 + this.storyMinutes(), hh = h0 + Math.floor(mm / 60);
    return `${String(hh % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  }
  _items() { return this.CH && this.CH.items ? { ...ITEMS, ...this.CH.items } : ITEMS; }

  _objectives() {
    if (this.CH) return this.CH.objectives(this);
    const S = this.S, f = S.f;
    const n = S.found.filter(Boolean).length;
    if (!f.readSticky) return [{ text: '看看显示器上的便利贴', done: false }];
    const list = [
      { text: '带上学生证', done: !!f.studentId },
      { text: '找回准考证（在行李箱里）', done: !!f.ticket },
      { text: `集齐门锁密码 ${n}/4`, done: n === 4 },
    ];
    if (!f.phoneOn) list.push({ text: '（可选）给手机充电，看看宿舍群', done: false });
    list.push({ text: f.doorUnlocked ? '出门！冲向考场！' : '打开门上的车锁，逃出宿舍', done: false });
    return list;
  }

  // 故事钟走到某些时刻：室友催促、天色变化、宿管广播——只是气氛，不会失败
  _storyEvents() {
    const S = this.S, p = this.storyP();
    // 音乐随解谜进度越来越紧张
    this.audio.tension = S.view ? 0 : (0.6 * S.found.filter(Boolean).length) / S.found.length;
    if (S.view) return;
    if (this.CH) { if (this.CH.story) this.CH.story(this, p); return; }
    const push = (key, msg) => {
      if (S.msgSent[key]) return;
      S.msgSent[key] = true;
      this.msgs.push(msg);
      if (S.inv.includes('phone')) {
        this.audio.vibrate();
        this.ui.toast(`<b>${msg.who}</b>：${msg.text}`, '', '💬');
        if (this._phoneNode) this._phoneNode._add(msg);
      }
    };
    const [A, B, C] = S.mates;
    if (p > 0.4) push('half', { time: this.clockText, who: A, text: `人呢？？都${this.clockText}了，快开考了！` });
    if (p > 0.65) push('quarter', { time: this.clockText, who: B, text: '监考老师已经进教室了！！！快点！' });
    if (p > 0.85) push('last', { time: this.clockText, who: C, text: '完了完了，老师开始发卷子了……兄弟挺住！' });
  }

  // ================== 交互 ==================
  _updateHover() {
    if (this.ui.modalOpen || this.paused || this.cine || this.auto) { this._setHover(null); return; }
    const chest = _v1.set(this.ctrl.pos.x, 1.1 + this.ctrl.pos.y, this.ctrl.pos.z);
    this.raycaster.setFromCamera(this.center, this.camera);
    const camD = this.camera.position.distanceTo(chest);
    this.raycaster.far = camD + 6;
    this.raycaster.near = 0.05;
    const hits = this.raycaster.intersectObjects(this.rayTargets, false);
    let found = null;
    this.aim.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 5);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.noRay || !this._visible(o)) continue;
      // 第三人称：镜头和人之间的东西（比如身后开着的门）不算互动目标
      if (this.ctrl.mode === 'third' && h.distance < Math.max(camD * 0.6, camD - 0.3)) continue;
      this.aim.copy(h.point);
      const iid = o.userData.iid;
      if (!iid) break;
      if (h.point.distanceTo(chest) > 2.05) break;
      const hd = this.handlers[iid];
      if (!hd) break;
      found = { iid, obj: this._rootOf(o), point: h.point.clone() };
      break;
    }
    this._setHover(found);
  }
  _setHover(hv) {
    const prev = this.hover ? this.hover.iid : null;
    this.hover = hv;
    if (!hv) { this.ui.setPrompt(null); this.gfx.setOutline(null); return; }
    const hd = this.handlers[hv.iid];
    const verb = typeof hd.verb === 'function' ? hd.verb() : hd.verb || '查看';
    const label = typeof hd.label === 'function' ? hd.label() : hd.label;
    this.ui.setPrompt(verb, label);
    if (prev !== hv.iid) {
      const big = ['door', 'wcDoor', 'cubDoor', 'wcWindow', 'window', 'curtain', 'bedW1', 'bedW2', 'bedE1', 'bedE2', 'shelf', 'farDesks', 'blackTable', 'foldTable', ...((this.CH && this.CH.big) || [])].includes(hv.iid);
      this.gfx.setOutline(big ? null : hv.obj);
    }
  }
  _interact() {
    if (!this.hover) return;
    const hd = this.handlers[this.hover.iid];
    if (!hd) return;
    const p = this.hover.point;
    const dy = p.y - 1.35;
    this._reachPitch = clamp(dy * 0.9, -0.9, 0.9);
    if (hd.reach !== false) this.reachT = 0.7;
    hd.act(this.hover);
    this._invDirty = true;
    this._refreshHUD();
  }
  say(text, dur = 3.2) { this.ui.subtitle(text, dur, this.S.name); }
  // 文案里的 {A}{B}{C} 换成本局室友的名字
  _fill(s) { return s.replace(/\{([ABC])\}/g, (_, k) => this.S.mates['ABC'.indexOf(k)]); }
  give(id, silent = false) {
    const S = this.S;
    if (S.inv.includes(id)) return;
    S.inv.push(id);
    S.f[id] = true;
    S.newItem = id;
    this._invDirty = true;
    const it = this._items()[id];
    if (!silent) { this.audio.pickup(); this.ui.toast(`获得：<b>${it.name}</b>`, 'item', it.icon); }
  }
  take(id) {
    const S = this.S;
    S.inv = S.inv.filter((x) => x !== id);
    this._invDirty = true;
  }
  hideObj(o) { if (o) o.visible = false; }
  // 鉴赏模式没有线索本、没有门锁：谜题道具照样能玩，只是不再弹线索和密码
  clue(key, html) {
    if (this.S.view) return;
    if (!this.S.clues.has(key)) this.ui.toast('线索已记录到线索本 <kbd>J</kbd>', 'clue', '📒');
    this.S.clues.set(key, html);
  }
  foundDigit(i, src) {
    const S = this.S;
    if (S.found[i]) return;
    S.found[i] = true;
    if (S.view) return;
    this.audio.clue();
    const marks = this.CH && this.CH.codeIcons ? this.CH.codeIcons : ['①', '②', '③', '④'];
    const lockName = this.CH ? this.CH.lockName : '门锁';
    this.ui.toast(`${lockName}密码第${marks[i]}位：<b style="font-size:20px">${S.digits[i]}</b>`, 'clue', '🔑');
    S.clues.set(`d${i}`, `${lockName}第<b>${marks[i]}</b>位 = <b>${S.digits[i]}</b>（${src}）`);
    const n = S.found.filter(Boolean).length;
    if (n === S.digits.length) this.after(1.5, () => this.say(`密码凑齐了：${S.digits.join('')}！快去门口！`, 4));
  }
  useItem(id) {
    const S = this.S;
    if (this.CH && this.CH.useItem && this.CH.useItem(this, id)) return;
    if (id === 'phone') return this.openPhone();
    if (id === 'uv') return this.toggleUV();
    if (id === 'latiao') {
      this.take('latiao'); this.audio.crunch();
      S.f.ateLatiao = true; S.freeHints++;
      this.say('辣！辣！辣！……精神百倍！（下一次提示免费）');
      if (S.f.ateApple) S.ach.add('foodie');
      return;
    }
    const it = this._items()[id];
    if (it) this.ui.toast(`${it.name}：${this._fill(it.desc)}`, '', it.icon);
  }

  // ---------- 各物件的交互 ----------
  _handlers() {
    const H = this._handlersBase();
    // 鉴赏模式：门上没有锁，直接出门去下一关
    if (this.S && this.S.view) H.door = { label: this._doorName(), verb: () => (this.chapter < 4 ? '去下一关' : '出门（结局）'), act: () => this.win() };
    return H;
  }
  _doorName() { return (this.CH && this.CH.doorName) || '宿舍门'; }
  // 鉴赏模式：开局就把门锁整个拿掉（连掉在地上的锁也不留）
  _removeDoorLock() {
    this.collision.setEnabled('lockCable', false);
    if (this.CH) this.CH.removeLock(this);
    else { const L = this.refs.lock; L.group.visible = false; L.dropped.visible = false; }
    this.S.f.doorUnlocked = true; this.S.f.unlocked = true;
  }
  // 鉴赏模式按 N：不走出门了，直接穿越
  viewSkip() {
    if (this.state !== 'play') return;
    this.state = 'outro';
    this.ui.closeModal(true);
    this._chapterDone();
  }
  _handlersBase() {
    if (this.CH) return this.CH.handlers(this);
    const H = {};
    const flavor = (id) => ({ label: () => this._fill(FLAVOR[id][0]), verb: '查看', reach: false, act: () => this.say(this._fill(FLAVOR[id][1]), 3.6) });
    for (const id of Object.keys(FLAVOR)) H[id] = flavor(id);

    H.sticky = { label: '便利贴', verb: '阅读', act: () => this.readSticky() };
    H.monitor = { label: '电脑', verb: '使用', act: () => this.openPC() };
    H.keyboard = {
      label: '键盘', verb: () => (this.S.uvOn ? '仔细看' : '查看'),
      act: () => {
        if (this.S.uvOn) this.showKeyboardUV();
        else this.say(this.S.f.pcSeen ? '键盘上沾满了薯片渣……好像有些痕迹，但肉眼看不清。' : '我的键盘。昨晚被我敲得冒烟。', 3.5);
      },
    };
    H.phone = {
      label: '手机', verb: () => (this.S.phoneCharge >= 1 ? '拿起手机' : '查看'),
      act: () => {
        const S = this.S;
        if (S.phoneCharge >= 1) { this.give('phone'); this.hideObj(this.refs.phone); this.openPhone(); return; }
        if (S.f.stripOn) { this.say(`充电中…… ${Math.round(S.phoneCharge * 100)}%，再等一下！`); return; }
        this.say('手机没电关机了……充电线明明插着，插线板怎么没亮？', 3.8);
        S.f.phoneDead = true;
      },
    };
    H.strip = {
      label: '插线板', verb: () => (this.S.f.stripOn ? '查看' : '打开开关'),
      act: () => {
        const S = this.S;
        if (S.f.stripOn) { this.say('插线板亮着红灯，正在给手机充电。'); return; }
        S.f.stripOn = true;
        this.audio.switchClick();
        const st = this.refs.strip.userData;
        st.switchMat.emissiveIntensity = 2.5; st.switch.rotation.x = -0.25;
        this._drawPhone('charging', 0.01);
        this.say('原来是插线板没开！手机开始充电了。', 3);
      },
    };
    H.calendar = { label: '台历', verb: '查看', act: () => this.showCalendar() };
    H.notebook = { label: '笔记本', verb: '阅读', act: () => this.showNotebook() };
    H.studentId = {
      label: '学生证', verb: '拿起',
      act: () => { this.give('studentId'); this.hideObj(this.refs.studentId); this.say('学生证，带上。考试必须查证件！'); },
    };
    H.apple = {
      label: '苹果', verb: '吃掉',
      act: () => {
        const S = this.S;
        this.hideObj(this.refs.apple); this.audio.crunch();
        S.f.ateApple = true; S.freeHints++;
        this.say('咔嚓——嗯！又脆又甜，脑子清醒多了。（下一次提示免费）', 3.8);
        if (S.f.ateLatiao) S.ach.add('foodie');
      },
    };
    H.drawer = {
      label: '抽屉', verb: () => (this.S.f.drawerOpen ? '查看' : this.S.inv.includes('key') ? '用小钥匙打开' : '打开'),
      act: () => this.onDrawer(),
    };
    H.drawerNote = { label: '纸条', verb: '阅读', act: () => this.readNote(3) };
    H.latiao = { label: '辣条', verb: '拿走', act: () => { this.give('latiao'); this.hideObj(this.refs.latiao); this.say(`一包辣条？${this.S.mates[1]}还挺有良心。`); } };
    H.remote = {
      label: '空调遥控器', verb: '拿起',
      act: () => {
        this.give('remote'); this.hideObj(this.refs.remote);
        if (this.S.f.batteries) { this.take('batteries'); this.S.f.remoteLoaded = true; this.say('装上电池，遥控器能用了！'); }
        else this.say('遥控器后盖开着……电池被人抠走了！', 3.2);
      },
    };
    H.helmet = {
      label: '红白头盔', verb: () => (this.S.f.helmetSearched ? '戴上' : '翻找'),
      act: () => {
        const S = this.S;
        if (!S.f.helmetSearched) {
          S.f.helmetSearched = true;
          this.audio.paper();
          if (S.inv.includes('remote')) { S.f.batteries = true; S.f.remoteLoaded = true; this.audio.pickup(); this.ui.toast('获得：<b>5号电池</b> → 已装进遥控器', 'item', '🔋'); this.say('头盔里塞着两节5号电池！装进遥控器——能用了！', 3.6); }
          else { this.give('batteries'); this.say(`头盔里塞着两节5号电池！${S.mates[2]}你可真会藏。`, 3.4); }
          return;
        }
        this.wearHelmet(true);
      },
    };
    H.stoolH = {
      label: '木凳', verb: () => (this.S.helmetOn ? '把头盔放回去' : '查看'), reach: false,
      act: () => { if (this.S.helmetOn) this.wearHelmet(false); else this.say('一张老木凳，头盔原本放在这。'); },
    };
    H.ac = { label: '空调', verb: () => (this.S.f.acOn ? '查看' : this.S.f.remoteLoaded ? '用遥控器打开' : '查看'), act: () => this.onAC() };
    H.acNote = { label: '纸条', verb: '捡起来看', act: () => this.readNote(0) };
    H.suitcase = { label: '行李箱', verb: () => (this.S.f.suitcaseOpen ? '查看' : '输入密码'), act: () => this.onSuitcase() };
    H.suitNote = { label: '便利贴', verb: '阅读', act: () => this.readSuitNote() };
    H.ticket = {
      label: '准考证', verb: '拿起',
      act: () => {
        this.give('ticket'); this.hideObj(this.refs.ticket.mesh);
        this.showTicket();
      },
    };
    H.uvLight = {
      label: '紫光手电', verb: '拿起',
      act: () => {
        this.give('uv'); this.hideObj(this.refs.uvItem);
        this.say('一支紫光手电……按 F 打开试试？', 3);
        this.ui.toast('按 <kbd>F</kbd> 开关紫光手电', '', '🔦');
      },
    };
    H.basket = { label: '脏衣篓', verb: () => (this.S.f.key ? '查看' : '翻找'), act: () => this.onBasket() };
    H.curtain = { label: '窗帘', verb: () => (this.S.f.curtainOpen ? '拉上' : '拉开'), act: () => this.toggleCurtain() };
    H.window = { label: '窗户', verb: '对着玻璃哈气', act: () => this.breathOnWindow() };
    H.door = { label: '宿舍门', verb: () => (this.S.f.doorUnlocked ? '出门' : '开锁'), act: () => this.onDoor() };
    H.wcDoor = { label: '洗手间门', verb: () => (this.refs.wcDoor.open ? '关上' : '推开'), act: () => this.toggleWcDoor() };
    H.cubDoor = { label: '厕所隔间', verb: () => (this.refs.cubDoor.open ? '关上' : '打开'), act: () => this.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '洗把脸', act: () => this.washFace() };
    H.toilet = { label: '厕所', verb: '冲水', act: () => this.flushToilet() };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => this.lookOutside() };
    const MIRROR_LINES = ['镜子里的人顶着鸡窝头、挂着两个黑眼圈……帅还是帅的。', '通宵一晚的脸……考完试一定早睡（大概）。', '别照了！再照就要迟到了！'];
    H.mirror = {
      label: '穿衣镜', verb: '照镜子', reach: false,
      act: () => {
        this._mirrorN = (this._mirrorN || 0) + 1;
        this.ch.setExpression('grin', 2.2);
        this.say(MIRROR_LINES[(this._mirrorN - 1) % MIRROR_LINES.length], 3.2);
      },
    };
    H.wcMirror = { ...H.mirror, label: '镜子' };
    H.roster = { label: '值日表', verb: '查看', act: () => this.showRoster() };
    H.switch = { label: '电灯开关', verb: () => (this.S.f.lightsOn ? '关灯' : '开灯'), act: () => this.toggleLights() };
    H.clock = { label: '挂钟', verb: '看时间', reach: false, act: () => this.say(`现在 ${this.clockText}，离 8 点开考还有 ${30 - this.storyMinutes()} 分钟！`) };
    H.monitor2 = flavor('monitor2');
    return H;
  }

  // ---------- 具体谜题 ----------
  readSticky() {
    const S = this.S;
    this.audio.paper();
    const node = this.ui.doc({
      variant: 'sticky',
      html: `睡神：<br>叫了你八百遍都不醒 😤 我们先去考场了。<br>昨晚你五杀喊得全楼都听见了，<br>所以——门我们用<span class="red">你自己的车锁</span>锁上了 🔒<br><span class="red">4位密码</span>拆成4份藏在宿舍里，自己找吧～<br>准考证也塞你<span class="red">行李箱</span>里了。<br>8点前出不来，就等着重修吧！<br>（实在不行，看看手机群里）<div class="sig">—— 211 全体室友<br>${S.mates.join('、')}</div>`,
    });
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.readSticky) {
      S.f.readSticky = true;
      this.clue('sticky', '室友的便利贴：门锁是<b>4位密码</b>，拆成4份藏在宿舍里；<b>准考证在行李箱</b>里。');
      this.after(0.4, () => this.say('这帮家伙……！先找准考证，再凑齐密码！', 3.5));
    }
  }

  openPC() {
    const S = this.S;
    if (!S.f.pcSeen) {
      S.f.pcSeen = true;
      this._drawMonitor('lock');
      this.audio.bootChime();
    }
    this.clue('pc', `电脑锁屏了。密码提示：<b>紫光之下，键盘会说话</b>`);
    const node = this.ui.pc({
      name: S.name, time: this.clockText, unlocked: !!S.f.pcUnlocked,
      hint: '密码提示：紫光之下，键盘会说话',
      noteText: `睡神：\n\n想打游戏？门都没有（字面意思）😂\n\n门锁密码第②位是：<span class="big">${S.digits[1]}</span>\n\n—— ${S.mates[1]}`,
      onTyping: () => this.audio.typeKey(),
      onUnlock: (pw) => {
        if (pw === S.pcPass) {
          S.f.pcUnlocked = true;
          this.audio.bootChime();
          this._drawMonitor('desktop');
          this.after(0.6, () => this.foundDigit(1, '电脑桌面上的 txt'));
          return true;
        }
        this.audio.error();
        return false;
      },
      onOpenGame: () => { if (!S.f.quit) { S.f.quit = true; S.ach.add('quit'); } },
    });
    this.openModal(node);
  }

  showKeyboardUV() {
    const S = this.S;
    const c = TX.makeCanvas(1024, 340);
    TX.drawKeyboard(c);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(40,0,80,0.55)'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(this.refs.kbUV.canvas, 0, 0);
    ctx.drawImage(this.refs.kbUV.canvas, 0, 0);
    const node = this.ui.doc({ variant: 'plain', title: '紫光下的键盘', html: `<div style="margin-bottom:8px">四个键帽上有荧光标记，还标着顺序……</div>` });
    node.querySelector('.content').appendChild(c);
    c.style.width = '100%';
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    this.clue('kb', `紫光照键盘：荧光标记按顺序是 <b>${[...S.pcPass].join(' → ')}</b>（电脑开机密码？）`);
  }

  _drawMonitor(kind) {
    const R = this.refs, S = this.S;
    if (kind === 'lock') TX.drawLockScreen(R.monitor.canvas, { name: S.name, time: this.clockText || '07:30', hint: '提示：紫光之下，键盘会说话' });
    else if (kind === 'desktop') TX.drawDesktop(R.monitor.canvas, { name: S.name, openNote: true, noteText: `睡神：\n门锁密码第②位是：${S.digits[1]}\n—— ${S.mates[1]}` });
    else TX.drawMobaScreen(R.monitor.canvas);
    R.monitor.tex.needsUpdate = true;
    this._monColor = kind === 'moba' ? '#ffe6b0' : '#9fb8ff';
  }

  _drawPhone(state, pct = 0) {
    const scr = this.refs.phone.userData.screen;
    TX.drawPhoneScreen(scr.canvas, state, pct, this.clockText || '07:30');
    scr.tex.needsUpdate = true;
  }
  _phoneBoot() {
    const S = this.S;
    if (S.f.phoneOn) return;
    S.f.phoneOn = true;
    this._drawPhone('on');
    this.audio.bootChime();
    this.after(0.8, () => { this.audio.notify(); this.audio.vibrate(); });
    this.say('手机开机了！宿舍群里有一大堆消息……', 3.4);
  }
  openPhone() {
    const S = this.S;
    S.f.phoneRead = true;
    const node = this.ui.phone({ messages: this.msgs, time: this.clockText, battery: Math.round(12 + S.phoneCharge * 8) });
    this._phoneNode = node;
    this.openModal(node, { onClose: () => (this._phoneNode = null) });
    this.clue('chat', `宿舍群：①空调+头盔里的电池　②电脑（紫光照键盘）　③窗户哈气　④抽屉（钥匙在${S.mates[1]}袜子里）　准考证在行李箱（密码：他最怕的那一天）`);
  }

  showCalendar() {
    const S = this.S;
    this.audio.paper();
    const c = TX.makeCanvas(512, 440);
    TX.drawCalendar(c, { month: S.month, day: S.day });
    const node = this.ui.doc({ variant: 'plain', title: '桌上的台历', html: `<div>${S.month}月${S.day}日被红笔狠狠地圈了起来——<b>高数期末</b>。<br>这大概是我最怕的一天了。</div>` });
    node.querySelector('.content').appendChild(c);
    c.style.width = '100%';
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    S.f.sawCalendar = true;
    this.clue('cal', `台历：<b>${S.month}月${S.day}日</b> 被红笔圈出——“高数期末!!!”`);
  }
  showNotebook() {
    this.audio.paper();
    const node = this.ui.doc({ title: '我的笔记本', html: '高数 第七章 · 微分方程<br>一阶线性：y′+P(x)y = Q(x)<br>通解 = e<sup>-∫P</sup>[∫Qe<sup>∫P</sup>dx + C]<br><span class="red">考点!!! 必考!!!</span><br><br>☑ 考试必带：<b>准考证 + 学生证</b><br>☐ 早睡（划掉）' });
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
  }
  showTicket() {
    const S = this.S;
    const node = this.ui.doc({ variant: 'plain', title: '找到准考证了！', html: '<div>还好还好……照片是去年拍的，那时候还没有黑眼圈。</div>' });
    const img = document.createElement('img');
    img.src = this.refs.ticket.canvas.toDataURL('image/jpeg', 0.9);
    node.querySelector('.content').appendChild(img);
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    this.clue('ticket', '<b>准考证</b>已拿到：高等数学（下）08:00 · A-304');
  }
  showRoster() {
    const S = this.S;
    this.audio.paper();
    const [A, B, C] = S.mates;
    const node = this.ui.doc({ variant: 'plain', title: '211 值日表', html: `周一 ${A} · 周二 ${B} · 周三 ${C} · <s>周四 ${S.name}</s> · 周五 ${A} · 周六 ${B} · 周日 全员大扫除<br><br>周四那一栏被人用红笔划掉了，旁边写着：<span class="red">“考完再说！”</span>` });
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
  }
  readNote(i) {
    const S = this.S;
    const R = this.refs;
    this.audio.paper();
    const [A, B, C] = S.mates;
    const who = [C, B, A, B][i];
    const marks = ['①', '②', '③', '④'];
    const extra = i === 0 ? '空调吹了一整晚了吧？电费你交 😏' : '辣条给你补补脑，考试加油！';
    const node = this.ui.doc({ html: `门锁密码第 ${marks[i]} 位：<span class="big">${S.digits[i]}</span><br>${extra}<div class="sig">—— ${who}</div>` });
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (i === 0) this.hideObj(R.acNote);
    if (i === 3) this.hideObj(R.drawerNote);
    this.after(0.2, () => this.foundDigit(i, i === 0 ? '空调里掉出的纸条' : '抽屉里的纸条'));
  }
  readSuitNote() {
    const S = this.S;
    this.audio.paper();
    const node = this.ui.doc({ variant: 'sticky', html: `密码：<b>你最怕的那一天</b> 😏<br><span style="font-size:16px">（3位数）</span><div class="sig">—— ${S.mates[0]}</div>` });
    this.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    this.clue('suit', '行李箱是<b>3位密码</b>，提示：“你最怕的那一天”');
  }

  onSuitcase() {
    const S = this.S;
    if (S.f.suitcaseOpen) { this.say('箱子里都是换洗衣服。'); return; }
    if (!S.f.suitSeen) { S.f.suitSeen = true; this.clue('suit', '行李箱是<b>3位密码</b>，提示：“你最怕的那一天”'); }
    const box = this.ui.lock({
      n: 3, title: '行李箱密码锁', hint: '箱子上的便利贴写着：<b>“你最怕的那一天”</b>',
      onTick: () => this.audio.tick(),
      onSubmit: (code) => {
        if (code === S.suitCode) { this.audio.unlock(); this.ui.closeModal(); this.openSuitcase(); return true; }
        this.audio.error(); return false;
      },
    });
    this.openModal(box);
  }
  openSuitcase() {
    const S = this.S;
    S.f.suitcaseOpen = true;
    this.audio.zipper();
    const lid = this.refs.suitcase.userData.lidPivot;
    this.tween(1.1, (k) => (lid.rotation.z = -1.95 * k), { ease: easeOutBack, delay: 0.35 });
    this.after(1.4, () => this.say('开了！准考证在这……旁边还有一支紫光手电？', 3.6));
  }

  onDrawer() {
    const S = this.S;
    if (S.f.drawerOpen) { this.say(S.found[3] ? '抽屉里只剩几支笔了。' : '抽屉里有张纸条！'); return; }
    if (!S.inv.includes('key')) {
      this.audio.lockedRattle();
      this.say('抽屉锁着……钥匙呢？', 2.6);
      this.clue('drawer', '我的书桌<b>抽屉是锁着的</b>，需要一把小钥匙。');
      return;
    }
    this.take('key');
    S.f.drawerOpen = true;
    this.audio.unlock();
    this.audio.drawer();
    const d = this.refs.drawer;
    const z0 = d.position.z;
    this.tween(0.7, (k) => (d.position.z = z0 + 0.3 * k), { ease: easeOut });
    this.after(0.8, () => this.say('打开了！里面有张纸条……还有一包辣条？', 3.2));
  }

  onBasket() {
    const S = this.S;
    if (S.f.key) { this.say('……不想再翻第二次了。'); return; }
    const B = S.mates[1];
    this.audio.paper();
    this.say(`……好臭！你捏着鼻子翻了翻${B}的脏衣服……`, 2.2);
    this.after(1.6, () => {
      const sock = this.refs.basket.children.find((c) => c.geometry && c.geometry.type === 'CapsuleGeometry');
      if (sock) sock.visible = false;
      this.give('key');
      this.say(`袜子里掉出来一把小钥匙！${B}你是真的狠……`, 3.2);
      this.clue('key', `在${B}的袜子里找到<b>小钥匙</b>——应该能开我的抽屉。`);
    });
  }

  onAC() {
    const S = this.S;
    if (S.f.acOn) { this.say('空调呼呼地吹着冷风。'); return; }
    if (S.f.remoteLoaded) { this.turnOnAC(); return; }
    if (S.inv.includes('remote')) { this.say('遥控器没电池，按了没反应……电池去哪了？', 3.2); this.clue('ac', '空调遥控器<b>没有电池</b>。'); return; }
    this.say('空调关着……遥控器放哪了？', 2.6);
  }
  turnOnAC() {
    const S = this.S, R = this.refs;
    S.f.acOn = true;
    this.audio.acBeep();
    R.ac.userData.drawDisp(true);
    const flap = R.ac.userData.flap;
    this.tween(1.2, (k) => (flap.rotation.x = 1.0 * k), { delay: 0.3 });
    this.after(0.8, () => this.audio.startLoop('ac', { freq: 420, gain: 0.05 }));
    this.after(1.2, () => this.dropACNote());
    this.say('滴滴——空调开了。', 2);
  }
  dropACNote() {
    const note = this.refs.acNote;
    const ac = this.refs.ac.position; // 空调在西墙宿舍门上方，出风口朝东
    const start = new THREE.Vector3(ac.x + 0.14, 2.36, ac.z), end = new THREE.Vector3(-1.05, 0.006, 3.35);
    note.visible = true;
    note.position.copy(start);
    this.audio.paper();
    this.tween(2.8, (k, raw) => {
      const e = easeIn(raw) * 0.6 + raw * 0.4;
      note.position.lerpVectors(start, end, e);
      note.position.x += Math.sin(raw * 9) * 0.16 * (1 - raw);
      note.position.z += Math.cos(raw * 7) * 0.1 * (1 - raw);
      note.rotation.set(-Math.PI / 2 + Math.sin(raw * 11) * 0.9 * (1 - raw), 0, raw * 4 + Math.sin(raw * 6) * 0.5);
    }, { ease: (t) => t, done: () => { note.rotation.set(-Math.PI / 2, 0, 0.6); this.say('空调里飘出来一张纸条！', 2.5); } });
  }

  toggleCurtain() {
    const S = this.S, C = this.refs.curtain;
    const open = !S.f.curtainOpen;
    S.f.curtainOpen = open;
    this.audio.curtain();
    const f0 = C.f, f1 = open ? 0.17 : 1;
    this.tween(1.6, (k) => { C.f = lerp(f0, f1, k); C.layout(C.f); }, { ease: easeInOut });
    if (open && !S.f.sawSun) {
      S.f.sawSun = true;
      S.ach.add('sun');
      this.after(1.2, () => this.say('阳光刺眼……玻璃上起了一层雾。', 3));
      this.clue('window', '窗户玻璃上一层<b>雾气</b>……好像有字的痕迹？');
    }
  }
  breathOnWindow() {
    const S = this.S, fog = this.refs.fog;
    if (!S.f.curtainOpen) { this.say('窗帘挡着呢。'); return; }
    this.audio.breath();
    this.say('哈——', 1.2);
    const o0 = fog.mat.opacity;
    this.tween(0.9, (k) => (fog.mat.opacity = lerp(o0, 0.93, k)), { ease: easeOut });
    this._fogHold = 6;
    if (!S.found[2]) this.after(1.6, () => { this.foundDigit(2, '窗户上哈气显出的字'); this.say(`玻璃上显出了字：③ → ${S.digits[2]}！`, 3.4); });
  }

  wearHelmet(on) {
    const S = this.S, helmet = this.refs.helmet;
    S.helmetOn = on;
    helmet.traverse((o) => { o.userData.noRay = on; });
    if (on) {
      this.ch.helmetSlot.add(helmet);
      helmet.position.set(0, 0.0, 0.0);
      helmet.rotation.set(0, 0, 0);
      helmet.scale.setScalar(0.9);
      S.ach.add('helmet');
      this.say('戴上头盔……安全第一！（这有什么用？）', 3);
      this.ch.setExpression('grin', 2.5);
    } else {
      const hm = this.refs.helmetHome;
      this.scene.add(helmet);
      helmet.position.set(hm.x, hm.y, hm.z);
      helmet.rotation.set(0, hm.ry, 0);
      helmet.scale.setScalar(1);
      this.say('把头盔放回凳子上。');
    }
  }

  toggleLights() {
    const S = this.S;
    S.f.lightsOn = !S.f.lightsOn;
    this.audio.switchClick();
    this.refs.switchRocker.rotation.x = S.f.lightsOn ? -0.12 : 0.12;
    if (S.f.lightsOn) {
      S.ach.add('light');
      this.light.flicker = 0.9;
      this.audio.fluoro();
      this.audio.startLoop('hum', { osc: 'sawtooth', freq: 100, gain: 0.0035 });
    } else this.audio.stopLoop('hum');
  }

  // ---------- 洗手间 ----------
  // 开关门：碰撞和相机碰撞盒跟着切换；洗手间灯的阴影是静态的，门动的时候刷新一下
  _swingDoor(D, { shutId, openId, sound, dur = 0.7 }) {
    if (D.anim) return;
    const open = !D.open;
    D.open = open; D.anim = true;
    sound(open);
    if (open) { this.collision.setEnabled(shutId, false); this.collision.setEnabled(openId, true); D.camBox.makeEmpty(); }
    const base = D.base || 0, a0 = D.pivot.rotation.y, a1 = base + (open ? D.openAngle : 0);
    const wc = this.refs.lights.wc;
    this.tween(dur, (k) => { D.pivot.rotation.y = lerp(a0, a1, k); wc.shadow.needsUpdate = true; }, {
      done: () => {
        D.anim = false;
        if (!open) { this.collision.setEnabled(shutId, true); this.collision.setEnabled(openId, false); D.camBox.copy(D.closedBox); }
        wc.shadow.needsUpdate = true;
      },
    });
  }
  toggleWcDoor() {
    const D = this.refs.wcDoor;
    this._swingDoor(D, { shutId: 'wcShut', openId: 'wcOpen', sound: (o) => this.audio.glassDoor(o) });
    if (D.open && !this.S.f.wcSeen && !this.CH) { this.S.f.wcSeen = true; this.after(0.5, () => this.say('洗手间的灯一直亮着……谁昨晚没关？', 2.8)); }
  }
  toggleCubDoor() {
    this._swingDoor(this.refs.cubDoor, { shutId: 'cubShut', openId: 'cubOpen', sound: (o) => this.audio.stallDoor(o), dur: 0.6 });
  }
  washFace() {
    const S = this.S, R = this.refs;
    if (this._washing) return;
    this._washing = true;
    R.sink.streams.forEach((w) => (w.visible = true));
    this.audio.water(2.4);
    this.after(2.4, () => { R.sink.streams.forEach((w) => (w.visible = false)); this._washing = false; });
    if (!S.f.washedFace) { S.f.washedFace = true; S.freeHints++; this.say('哗——冷水扑在脸上，一下子清醒了！（下一次提示免费）', 3.6); }
    else this.say('再洗下去就真迟到了！', 2.4);
  }
  flushToilet() {
    const S = this.S;
    if (this._flushing) return;
    this._flushing = true;
    this.after(2.4, () => (this._flushing = false));
    this.audio.flush();
    this.say(S.f.flushed ? '哗——冲得真干净。' : '哗啦啦——人有三急，可以理解。', 2.8);
    S.f.flushed = true;
    S.ach.add('flush');
  }
  lookOutside() {
    const S = this.S, O = this.refs.outside;
    if (O.busy) { this.say('三只猴子还在对着你摆造型……', 2.4); return; }
    O.trigger(4.5);
    this.audio.monkey();
    this.after(0.8, () => this.audio.monkey(1.25));
    if (!S.f.sawMonkeys) {
      S.f.sawMonkeys = true;
      S.ach.add('monkey');
      this.ui.toast('发现彩蛋：<b>窗外的三只猴子</b>', 'clue', '🐒');
      this.say('窗外树上有三只猴子在荡秋千……等等，它们在学“不看、不听、不说”？！', 4.2);
    } else this.say('猴子们又开始表演了……', 2.4);
  }

  toggleUV() {
    const S = this.S;
    if (!S.inv.includes('uv')) { if (this.state === 'play') this.ui.toast('还没有手电', 'bad', '🔦'); return; }
    S.uvOn = !S.uvOn;
    this.audio.uvOn();
    this.ch.torch.visible = S.uvOn;
    this._invDirty = true;
    if (S.uvOn && !S.f.uvTried) { S.f.uvTried = true; this.say('紫光……照照看哪里有荧光？', 2.6); }
  }

  onDoor() {
    const S = this.S;
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      this.audio.lockedRattle();
      this.say('门把手被我的车锁拴在了门边的铁桌腿上？！这帮家伙……', 3.4);
      this.clue('door', '门把手被<b>4位数字自行车锁</b>拴在门边折叠桌的桌腿上。');
      this.after(1.3, () => this.openDoorLock());
      return;
    }
    if (!S.f.doorUnlocked) { this.openDoorLock(); return; }
    this.tryExit();
  }
  openDoorLock() {
    const S = this.S;
    const n = S.found.filter(Boolean).length;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = this.ui.lock({
      n: 4, title: '自行车密码锁（4位）', hint: n ? `已知线索：<b>${known}</b>` : '密码被室友拆成了4份，藏在宿舍里',
      onTick: () => this.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { this.audio.unlock(); this.ui.closeModal(); this.unlockDoor(); return true; }
        this.audio.error(); return false;
      },
    });
    this.openModal(box);
  }
  unlockDoor() {
    const S = this.S, L = this.refs.lock;
    S.f.doorUnlocked = true;
    this.collision.setEnabled('lockCable', false);
    const body = L.body;
    const y0 = body.position.y;
    this.tween(0.5, (k) => { body.rotation.z = k * 0.8; body.position.y = y0 - k * 0.05; }, {
      done: () => { L.group.visible = false; L.dropped.visible = true; this.audio.noise({ dur: 0.25, gain: 0.3, type: 'lowpass', freq: 800 }); },
    });
    this.say('咔哒——锁开了！！', 2.2);
    this.after(1.4, () => this.tryExit());
  }
  tryExit() {
    const S = this.S;
    const miss = [];
    if (!S.inv.includes('ticket')) miss.push('准考证');
    if (!S.inv.includes('studentId')) miss.push('学生证');
    if (miss.length) { this.say(`等等！${miss.join('和')}还没拿！没有它进不了考场！`, 3.4); return; }
    this.win();
  }

  // ---------- 提示 / 线索本 / 暂停 ----------
  hintText() {
    const S = this.S, f = S.f, F = S.found, inv = S.inv;
    if (!f.readSticky) return '显示器上贴着一张便利贴，先看看吧。';
    if (!f.triedDoor) return '去门口看看，门到底怎么了。';
    if (!f.studentId) return '桌上那个蓝色小本子是你的学生证，考试要带。';
    if (!f.suitcaseOpen) return f.sawCalendar ? `行李箱密码是“你最怕的那一天”——台历上被圈出的日期：${S.month}月${S.day}日，写成3位数。` : '行李箱在你床边，密码是“你最怕的那一天”。看看桌上的台历，哪天被红笔圈了？';
    if (!f.ticket) return '行李箱里的准考证，记得拿上！';
    if (!f.uv) return '行李箱里还有一支紫光手电，拿上它。';
    if (!F[0]) {
      if (!f.remote) return '空调遥控器在门边那张黑色杂物桌上。';
      if (!f.remoteLoaded) return '遥控器电池被抠走了……门边凳子上的红白头盔里好像塞了东西？';
      if (!f.acOn) return '空调在门上方的墙上，对着它用遥控器。';
      return '空调里飘出了一张纸条，落在门边地上，捡起来看看。';
    }
    if (!F[1]) {
      if (!f.pcSeen) return '去你的电脑前看看。';
      if (!S.uvOn) return '电脑密码提示“紫光之下，键盘会说话”——按 F 打开紫光手电，照照键盘。';
      return `紫光照亮的键帽顺序就是开机密码（${S.pcPass.length}个字母），去电脑上输入。`;
    }
    if (!F[2]) {
      if (!f.curtainOpen) return '窗帘拉得严严实实，拉开看看窗户。';
      return '窗玻璃起雾了，走近窗户，对着玻璃哈口气。';
    }
    if (!F[3]) {
      if (!f.key) return `抽屉钥匙在${S.mates[1]}的袜子里——找找那个蓝色的脏衣篓（窗边右侧）。`;
      return '用小钥匙打开你书桌的抽屉。';
    }
    if (!f.doorUnlocked) return `密码凑齐了！去门口按①②③④的顺序输入：${S.digits.join('')}`;
    return '快出门！冲向考场！';
  }
  // 提示不扣时间，但会计入结算评分（吃东西、洗脸换来的免费提示不算）
  hint() {
    const S = this.S;
    if (S.view) { this.ui.toast('💡 鉴赏模式没有谜题：走到门口按 E，或者直接按 N 去下一关', 'clue'); return; }
    const text = this.CH ? this.CH.hint(this) : this.hintText();
    let cost;
    if (S.freeHints > 0) { S.freeHints--; cost = '（免费）'; }
    else { S.hints++; cost = `（第 ${S.hints} 次提示）`; }
    this.audio.notify();
    this.ui.toast(`💡 ${text} <span style="opacity:.6">${cost}</span>`, 'clue');
  }
  openJournal() {
    const S = this.S;
    const marks = this.CH && this.CH.codeIcons ? this.CH.codeIcons : ['①', '②', '③', '④'];
    const code = S.digits.map((d, i) => `<b style="display:inline-grid;place-items:center;width:34px;height:42px;margin:0 3px;border-radius:8px;background:${S.found[i] ? '#ffc857' : 'rgba(255,255,255,.08)'};color:${S.found[i] ? '#111' : '#777'};font-size:22px">${S.found[i] ? d : marks[i]}</b>`).join('');
    const items = [...S.clues.values()].map((t) => `<li>${t}</li>`).join('') || '<li class="dim">还没有线索……到处看看吧。</li>';
    const node = this.ui.panel(`<h2>📒 线索本</h2><div style="text-align:center;margin-bottom:16px">${code}</div><ul class="clue-list">${items}</ul><div class="m-foot">按 J / Esc 关闭</div>`);
    this.openModal(node, { closeKeys: ['Escape', 'KeyJ'] });
  }
  openPause() {
    if (this.paused || this.state !== 'play') return;
    this.paused = true;
    const st = this.settings;
    const node = this.ui.panel(`<h2>暂停</h2><div class="col">
      <button class="btn primary" data-a="resume">继续游戏</button>
      <div class="row"><span>鼠标灵敏度</span><input type="range" min="0.3" max="2.5" step="0.05" value="${st.sens}" data-s="sens"></div>
      <div class="row"><span>音量</span><input type="range" min="0" max="1" step="0.05" value="${st.vol}" data-s="vol"></div>
      <div class="row"><span>画质</span><select data-s="q"><option value="low">流畅</option><option value="medium">均衡</option><option value="high">精美</option></select></div>
      <div class="row"><span>视角</span><select data-s="cam"><option value="third">第三人称</option><option value="first">第一人称</option></select></div>
      <div class="row"><span>反转 Y 轴</span><input type="checkbox" data-s="inv" ${st.invertY ? 'checked' : ''}></div>
      <div class="ctrls"><kbd>WASD</kbd><span>移动（Shift 跑，C 蹲）</span><kbd>E / 左键</kbd><span>互动</span><kbd>F</kbd><span>紫光手电</span><kbd>V</kbd><span>第一/第三人称</span><kbd>H</kbd><span>提示（计入评分）</span><kbd>J</kbd><span>线索本</span><kbd>P</kbd><span>手机</span><kbd>1-8</kbd><span>使用物品</span></div>
      <button class="btn" data-a="restart">重新开始</button>
    </div>`);
    node.querySelector('[data-s=q]').value = st.quality;
    node.querySelector('[data-s=cam]').value = this.ctrl.mode;
    node.querySelector('[data-a=resume]').addEventListener('click', () => this.ui.closeModal());
    node.querySelector('[data-a=restart]').addEventListener('click', () => location.reload());
    node.querySelector('[data-s=sens]').addEventListener('input', (e) => { st.sens = Number(e.target.value); this.ctrl.sensitivity = st.sens; this.saveSettings(); });
    node.querySelector('[data-s=vol]').addEventListener('input', (e) => { st.vol = Number(e.target.value); this.audio.setVolume(st.vol); this.saveSettings(); });
    node.querySelector('[data-s=q]').addEventListener('change', (e) => { st.quality = e.target.value; this.gfx.setQuality(st.quality); this.saveSettings(); });
    node.querySelector('[data-s=cam]').addEventListener('change', (e) => this.ctrl.setMode(e.target.value));
    node.querySelector('[data-s=inv]').addEventListener('change', (e) => { st.invertY = e.target.checked; this.ctrl.invertY = st.invertY; this.saveSettings(); });
    this.suppressPause = true;
    this.input.exitLock();
    this.ui.openModal(node, {
      onClose: () => {
        this.paused = false;
        this.input.requestLock();
        setTimeout(() => (this.suppressPause = false), 200);
      },
    });
  }

  // ================== 结局 ==================
  win() {
    if (this.state !== 'play') return;
    const S = this.S;
    this.state = 'outro';
    this.ui.closeModal(true);
    this.input.exitLock();
    this.ui.showHUD(false);
    this.ui.showTouch(false);
    this.ui.letterbox(true);
    this._setHover(null);
    if (S.uvOn) this.toggleUV();
    this.audio.stopMusic();
    this.audio.stopLoop('ac');
    this.ch.setExpression('grin');
    this.ctrl.setMode('third');
    const p0 = this.ctrl.pos.clone();
    const D = this.refs.door, E = this.refs.exit;
    this._cineSet(new THREE.Vector3(0.35, 1.6, 2.1), new THREE.Vector3(-1.8, 1.1, D.z));
    const door = D.pivot;
    // 宿舍门在西墙最里头，往屋里开（贴向南墙）；先走到门的斜前方等门打开
    this.auto = { path: [new THREE.Vector3(-0.3, 0, clamp(p0.z, 1.3, 3.2)), new THREE.Vector3(-0.85, 0, 3.25)], speed: 1.7, i: 0 };
    this.after(0.3, () => this.say(this.CH ? this.CH.exitLine(this) : S.view ? '冲！！！' : '准考证 ✓　学生证 ✓　冲！！！', 2.4));
    const openDoorAt = () => {
      this.audio.doorOpen();
      this.refs.lights.corridor.intensity = 0;
      if (this.CH && this.CH.onDoorOpen) this.CH.onDoorOpen(this);
      this.tween(1.3, (k) => { door.rotation.y = D.base + D.openAngle * k; this.refs.lights.corridor.intensity = 6 * k; }, { ease: easeOut });
      this.after(1.0, () => {
        // 出门左手边是 212 的门，安全出口在右手边（北）
        this.auto = { path: [new THREE.Vector3(-1.3, 0, E.doorZ - 0.05), new THREE.Vector3(-2.5, 0, E.doorZ), new THREE.Vector3(E.x, 0, E.doorZ - 0.6), new THREE.Vector3(E.x, 0, -1.5)], speed: 3.2, i: 0 };
        this._cineTo(new THREE.Vector3(-0.95, 1.62, E.doorZ + 0.32), new THREE.Vector3(-4.0, 1.1, E.doorZ - 1.5), 0.9);
        this.audio.whoosh();
      });
      this.after(2.1, () => this._chapterDone());
    };
    this._afterReach = openDoorAt;
  }

  // ================== 章节 ==================
  _chapterDone() {
    const S = this.S;
    S.done.push({ n: this.chapter, elapsed: S.elapsed, par: this.CH ? this.CH.par : PAR1, hints: S.hints });
    if (this.chapter < 4) this.goChapter(this.chapter + 1);
    else this.finale();
  }
  _tweenP(dur, fn, opts = {}) { return new Promise((r) => this.tween(dur, fn, { ease: (t) => t, ...opts, done: r })); }
  _wait(sec) { return new Promise((r) => this.after(sec, r)); }

  // 穿越到下一个 211：画面旋涡 + 闪白 → 拆掉重建宿舍 → 旋涡收回 → 进门过场
  async goChapter(n, { fromTitle = false } = {}) {
    const CH = CHAPTERS[n];
    this.state = 'transition';
    this._setHover(null);
    this.ui.closeModal(true);
    this.input.exitLock();
    this.ui.showHUD(false); this.ui.showTouch(false); this.ui.letterbox(true);
    if (this.S.uvOn) this.toggleUV();
    this.audio.stopMusic();
    this.audio.stopAllLoops();
    this.audio.warp();
    const G = this.gfx.grade;
    const card = `${CH.title}<small>${CH.sub}</small>`;
    if (this.gfx.useComposer) {
      await this._tweenP(fromTitle ? 1.0 : 1.6, (k) => { G.warp = k * k; G.flash = clamp((k - 0.6) / 0.4, 0, 1); });
      await this.ui.fade(1, { dur: 0.25, white: true, card });
    } else await this.ui.fade(1, { dur: 1.4, white: true, card });
    G.flash = 0;
    await nextFrame(); await nextFrame();
    const t0 = performance.now();
    this._switchWorld(CH.theme);
    this.chapter = n; this.CH = CH;
    this._initChapter();
    CH.intro(this, { prepare: true });
    try {
      if (this.gfx.renderer.compileAsync) await Promise.race([this.gfx.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 3500))]);
    } catch (e) { /* 忽略 */ }
    const spent = (performance.now() - t0) / 1000;
    await new Promise((r) => setTimeout(r, Math.max(300, (2.2 - spent) * 1000)));
    this.state = 'cut';
    this.ui.fade(0, { dur: 1.4, white: true, card });
    CH.intro(this, { prepare: false });
    this._showSkip(() => this._skipCut());
    if (this.gfx.useComposer) { G.warp = 1; await this._tweenP(1.5, (k) => { G.warp = (1 - k) * (1 - k); }); }
    G.warp = 0;
  }
  _switchWorld(theme) {
    const old = this.refs;
    if (old.helmet && old.helmet.parent && old.helmet.parent !== old.root) old.helmet.parent.remove(old.helmet);
    this.scene.remove(old.root);
    disposeTree(old.root);
    if (old.helmet) disposeTree(old.helmet);
    this.refs = this.buildWorld(theme);
    this.ctrl.camBoxes = this.refs.camBoxes;
    this.ctrl.bounds = this.refs.bounds;
    this.gfx.shadowLights = null;
    this.gfx.setOutline(null);
    this.gfx.setTheme(theme);
    this.ui.setTheme(theme);
    this._collectRayTargets();
    this.fx.clear();
    this._buildDust(theme);
    this.light = { hemi: 0.32, win: 2.2, sun: 0, spot: 0, tube: 0, flicker: 0 };
    this._monColor = null;
    this._fogHold = 0;
    this._mirrorN = 0;
    // 上一间屋子出门时的自动走路 / 镜头 / 姿势都不要带过来；失重只在太空舱里
    this.auto = null; this._afterReach = null; this.cine = null; this._cutPose = null;
    this.ctrl.float = 0; this.ctrl.pos.y = 0;
  }
  _initChapter() {
    const S = this.S, CH = this.CH;
    Object.assign(S, { elapsed: 0, hints: 0, freeHints: 0, f: {}, inv: [], clues: new Map(), newItem: null, helmetOn: false, uvOn: false, phoneCharge: 0, msgSent: {}, lastSec: -1 });
    S.digits = Array.from({ length: CH.codeLen }, (_, i) => (i === 0 ? 1 + Math.floor(this.rnd() * 9) : Math.floor(this.rnd() * 10)));
    S.found = S.digits.map(() => false);
    this.ch.torch.visible = false;
    CH.init(this);
    this.handlers = this._handlers();
    this._invDirty = true;
    if (S.view) this._removeDoorLock();
    else {
      this.settings.unlocked = Math.max(this.settings.unlocked || 1, CH.n);
      this.settings.chapter = CH.n;
      this.saveSettings();
    }
    this.ui.setChapterTag(CH.tag, CH.lockName);
  }
  // 最后一章出门：白光 → 门外是美军征兵站的新兵报到仪式 → 结算
  async finale() {
    this.state = 'transition';
    this._setHover(null);
    this.ui.closeModal(true);
    this.input.exitLock();
    this.ui.showHUD(false); this.ui.showTouch(false); this.ui.letterbox(true);
    this.audio.stopAllLoops();
    this.audio.stopMusic();
    this.audio.chime();
    const card = '门外是……<small>U.S. ARMY RECRUITING STATION · 新兵报到日</small>';
    await this.ui.fade(1, { dur: 1.4, white: true, card });
    await nextFrame(); await nextFrame();
    const t0 = performance.now();
    this._switchWorld('finale');
    // 结局是写实画风：主角变回原来的样子
    untoonify(this.ch.root);
    this.ch.torch.visible = false;
    this.ch.setExpression('shock');
    this._finale = new FinaleDirector(this);
    try {
      if (this.gfx.renderer.compileAsync) await Promise.race([this.gfx.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 3500))]);
    } catch (e) { /* 忽略 */ }
    const spent = (performance.now() - t0) / 1000;
    await new Promise((r) => setTimeout(r, Math.max(300, (2.0 - spent) * 1000)));
    this.state = 'finale';
    this._finale.start();
    this.ui.fade(0, { dur: 1.6, white: true, card });
  }
  // 结算：不限时，评分只看用了几次提示
  showEnd() {
    const S = this.S;
    this.state = 'end';
    this.ui.fade(0, { dur: 0.8 });
    this.ui.letterbox(false);
    this.ui.showHUD(false);
    this.audio.success();
    this.audio.stopAllLoops();
    const reload = (mode) => { this.settings.chapter = 1; this.settings.mode = mode; this.saveSettings(); location.reload(); };
    const fin = this.refs.theme === 'finale';
    const admireBtn = fin ? '<button class="btn" data-a="admire">🎖️ 留下来欣赏</button>' : '';
    let node;
    if (S.view) {
      node = this.ui.panel(`<h2>🎬 鉴赏结束</h2><p>四个 211 都逛完啦！<br>游戏模式里每个房间都有一把锁和一串谜题。</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-a="play">开始游戏模式</button><button class="btn" data-a="again">再逛一遍</button>${admireBtn}</div>`, 'end');
      node.querySelector('[data-a=play]').addEventListener('click', () => reload('game'));
      node.querySelector('[data-a=again]').addEventListener('click', () => reload('view'));
    } else {
      const chName = ['', '211 宿舍', '废弃的 211', '动物园 211', '太空舱 211'];
      const runs = S.done;
      const hints = runs.reduce((a, r) => a + r.hints, 0);
      if (runs.every((r) => r.elapsed <= r.par)) S.ach.add('fast');
      if (hints === 0) S.ach.add('nohint');
      let rank, text;
      if (hints <= 1) { rank = 'S'; text = '少校亲自向你敬礼、为你授帽。四个 211 一个比一个离谱，你却全都逃了出来——教官说，你是他见过最冷静的新兵。'; }
      else if (hints <= 4) { rank = 'A'; text = '你戴上军帽，回敬了一个标准的军礼，看台上的欢呼声响成一片。教官小声嘀咕：“这小子是从哪扇门里冒出来的？”'; }
      else if (hints <= 8) { rank = 'B'; text = '军帽有点大，戴歪了。少校笑着帮你扶正：“欢迎入伍，新兵。”'; }
      else { rank = 'C'; text = '你差点在报到现场站着睡着……教官一嗓子“立——正！”把你彻底吵醒了。'; }
      const achHtml = ACH.map(([k, n, d]) => `<span class="${S.ach.has(k) ? '' : 'off'}" title="${d}">${n}</span>`).join('');
      const totalT = runs.reduce((a, r) => a + r.elapsed, 0);
      const chRows = runs.map((r) => `<div><b>${formatMMSS(r.elapsed)}</b><span>第${'一二三四'[r.n - 1]}章 · ${chName[r.n]}</span></div>`).join('');
      node = this.ui.panel(`
        <h2>四个 211，全部逃脱！</h2>
        <div style="color:var(--muted)">${S.name} 戴上军帽，向少校回敬了一个军礼 🎖️</div>
        <div class="rank">${rank}</div>
        <p>${text}</p>
        <div class="stats">${chRows}</div>
        <div class="stats totals"><div><b>${formatMMSS(totalT)}</b><span>总用时</span></div><div><b>${hints}</b><span>提示次数</span></div></div>
        <div class="ach">${achHtml}</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-a="again">再来一局</button>${admireBtn}</div>`, 'end');
      node.querySelector('[data-a=again]').addEventListener('click', () => reload('game'));
    }
    const adm = node.querySelector('[data-a=admire]');
    if (adm) adm.addEventListener('click', () => this.admire());
    this._endNode = node;
    this._orbit = { yaw: 0, pitch: 0.12, dist: 3.6, idle: 99 };
    this._celebT = 6;
    this.ui.openModal(node, { closable: false });
    // 结算背景：主角在房间里欢呼
    this.auto = null;
    this.cine = null;
    if (!fin) {
      this.refs.door.pivot.rotation.y = this.refs.door.base + this.refs.door.openAngle;
      this.ctrl.float = 0;
      this.ctrl.teleport(0.1, 1.2, 0);
      this.ch.root.position.set(0.1, 0, 1.2);
      this.ch.root.rotation.y = 0;
    }
    this.ch.setFirstPerson(false);
    this._endPose = { cheer: 1 };
    this.ch.setExpression('grin');
    this.lightMode = 'end';
    if (this.CH && this.CH.onEnd) this.CH.onEnd(this);
  }

  // ---------- 结局广场：可以一直留下来欣赏 ----------
  // 收起结算面板，留在广场上慢慢看；随时点按钮（或按 Esc）回到结算
  admire() {
    if (this.state !== 'end' || this._admiring) return;
    this._admiring = true;
    this.ui.closeModal(true);
    this._orbit.idle = 0;
    this._admireBar = this.ui.admireBar({ touch: this.input.isTouch, onResults: () => this.showResults() });
  }
  showResults() {
    if (!this._admiring) return;
    this._admiring = false;
    if (this._admireBar) { this._admireBar.remove(); this._admireBar = null; }
    this.ui.openModal(this._endNode, { closable: false });
  }
  // 欣赏时：拖动转视角，滚轮 / 双指缩放
  _bindAdmireControls() {
    const cv = this.gfx.canvas, pts = new Map();
    let pinch = 0;
    const O = () => this._orbit;
    cv.addEventListener('pointerdown', (e) => {
      if (!this._admiring) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cv.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !this._admiring) return;
      const o = O();
      if (pts.size === 1) {
        o.yaw -= (e.clientX - p.x) * 0.006;
        o.pitch = clamp(o.pitch + (e.clientY - p.y) * 0.004, -0.1, 1.2);
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) o.dist = clamp(o.dist * (pinch / d), 1.6, 14);
        pinch = d;
      }
      o.idle = 0;
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      if (!this._admiring) return;
      e.preventDefault();
      const o = O();
      o.dist = clamp(o.dist * Math.exp(e.deltaY * 0.001), 1.6, 14);
      o.idle = 0;
    }, { passive: false });
  }
  _updateFinaleView(dt) {
    const o = this._orbit, cam = this.camera;
    if (this._admiring) {
      const k = (c) => this.input.keys.has(c);
      const rot = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
      const zoom = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
      if (rot || zoom) { o.yaw += rot * dt * 1.2; o.dist = clamp(o.dist * (1 + zoom * dt * 1.2), 1.6, 14); o.idle = 0; }
    }
    // 没人动镜头时，自己绕着仪式慢慢转
    o.idle += dt;
    if (o.idle > 4) o.yaw += dt * 0.12;
    const cp = Math.cos(o.pitch);
    cam.position.set(Math.sin(o.yaw) * o.dist * cp, 1.3 + Math.sin(o.pitch) * o.dist, 0.6 + Math.cos(o.yaw) * o.dist * cp);
    cam.position.y = Math.max(0.3, cam.position.y);
    // 别让镜头钻进看台、楼和旗杆里：从看的中心往镜头打一条射线，被挡住就拉近（少校、教官不算）
    const R = this.refs, tgt = _v1.set(0, 1.3, 0.6), dir = _v2.copy(cam.position).sub(tgt), len = dir.length();
    dir.normalize();
    const rc = this._camRay || (this._camRay = new THREE.Raycaster());
    rc.set(tgt, dir); rc.near = 0; rc.far = len; rc.camera = cam;
    const skip = [R.officer.root, R.sarge.root, R.giftCap];
    const hit = rc.intersectObject(R.root, true).find((h) => {
      if (h.object.isSprite || h.object.isPoints) return false;
      for (let p = h.object; p; p = p.parent) if (!p.visible || skip.includes(p)) return false;
      return true;
    });
    if (hit) cam.position.copy(tgt).addScaledVector(dir, Math.max(0.5, hit.distance - 0.3));
    cam.lookAt(tgt);
    // 庆祝不停：隔一会儿就撒一次彩带、看台上闪一片闪光灯、欢呼一阵
    this._celebT -= dt;
    if (this._celebT <= 0 && this._finale) {
      this._celebT = 9 + Math.random() * 6;
      this._finale.confetti(5);
      this._finale.flashes(8);
      this.audio.cheer(2.5);
    }
  }

  _updateOutro(dt) {
    if (this.state === 'end') {
      const t = this.time;
      if (this.refs.theme === 'finale') this._updateFinaleView(dt);
      else {
        this.camera.position.set(0.1 + Math.sin(t * 0.25) * 0.5, 1.35, 2.9);
        this.camera.lookAt(0.1, 1.15, 1.2);
      }
      this.ch.update(dt, { ...(this._endPose || {}), lookPitch: 0.1 });
      return;
    }
    if (this.auto) {
      const a = this.auto;
      const tgt = a.path[a.i];
      const pos = this.ctrl.pos;
      const d = _v2.set(tgt.x - pos.x, 0, tgt.z - pos.z);
      const dist = d.length();
      let speed = a.speed;
      if (dist < 0.05) {
        a.i++;
        if (a.i >= a.path.length) {
          this.auto = null;
          speed = 0;
          if (this._afterReach) { const f = this._afterReach; this._afterReach = null; f(); }
        }
      } else {
        const step = Math.min(dist, a.speed * dt);
        pos.addScaledVector(d.normalize(), step);
        this.ctrl.charYaw = dampAngle(this.ctrl.charYaw, Math.atan2(d.x, d.z), 10, dt);
      }
      this.ch.root.position.set(pos.x, pos.y + this.ctrl.float * Math.sin(this.time * 1.1) * 0.03, pos.z);
      this.ch.root.rotation.y = this.ctrl.charYaw;
      this.ch.update(dt, { speed: this.auto ? speed : 0, float: this.ctrl.float });
    } else {
      this.ch.update(dt, { speed: 0, float: this.ctrl.float, ...(this._cutPose || {}) });
    }
    if (this.cine && !this.cine.to) { this.ctrl._updateCamera(dt, 0); this._saveGameCam(); }
    this._updateCine(dt);
  }

  // ================== 相机过场 ==================
  _cineSet(pos, look) {
    this.cine = { from: { pos: pos.clone(), look: look.clone() }, to: { pos: pos.clone(), look: look.clone() }, t: 1, dur: 1 };
    this.camera.position.copy(pos);
    this.camLook.copy(look);
    this.camera.lookAt(look);
  }
  _cineTo(pos, look, dur) {
    // pos/look 为 null 表示回到游戏相机
    this.cine = { from: { pos: this.camera.position.clone(), look: this.camLook.clone() }, to: pos ? { pos: pos.clone(), look: look.clone() } : null, t: 0, dur };
  }
  _updateCine(dt) {
    const c = this.cine;
    if (!c) return;
    c.t = Math.min(c.dur, c.t + dt);
    const k = easeInOut(c.t / c.dur);
    let tp, tl;
    if (c.to) { tp = c.to.pos; tl = c.to.look; }
    else {
      // 目标：当前游戏相机（控制器已计算到 camera 上，先保存）
      tp = this._gameCamPos || this.camera.position; tl = this._gameCamLook || this.camLook;
    }
    this.camera.position.lerpVectors(c.from.pos, tp, k);
    this.camLook.lerpVectors(c.from.look, tl, k);
    this.camera.lookAt(this.camLook);
    if (this._shakeT > 0) {
      this._shakeT -= dt;
      const a = this._shakeA * Math.max(0, this._shakeT) * 2;
      this.camera.position.x += (Math.random() - 0.5) * a * 0.1;
      this.camera.position.y += (Math.random() - 0.5) * a * 0.1;
    }
    if (!c.to && c.t >= c.dur) this.cine = null;
  }
  _shake(a) { this._shakeT = 0.5; this._shakeA = a; }
  _saveGameCam() {
    if (!this._gameCamPos) { this._gameCamPos = new THREE.Vector3(); this._gameCamLook = new THREE.Vector3(); }
    this._gameCamPos.copy(this.camera.position);
    this.camera.getWorldDirection(_v3);
    this._gameCamLook.copy(this.camera.position).addScaledVector(_v3, 3);
  }

  // ================== 世界动态 ==================
  _buildUV() {
    this.uvLight = new THREE.SpotLight('#7b45ff', 0, 5, 0.42, 0.6, 1.2);
    this.uvLight.castShadow = false;
    this.scene.add(this.uvLight, this.uvLight.target);
  }
  // 空气里飘的东西：第一章是窗边阳光里的灰尘，废墟里满屋都是灰，卡通章是金色的小亮点
  _buildDust(theme = 'normal') {
    if (this.dust) { this.scene.remove(this.dust); this.dust.geometry.dispose(); }
    const cfg = {
      normal: { n: 420, x: [-1.3, 1.3], y: [0.3, 2.7], z: [-3.4, -0.6], color: '#fff2d8', size: 0.014 },
      ruin: { n: 900, x: [-1.7, 1.7], y: [0.1, 2.9], z: [-3.5, 4.3], color: '#e8c89a', size: 0.012 },
      toon: { n: 160, x: [-1.6, 1.6], y: [0.3, 2.6], z: [-3.3, 4.2], color: '#fff0a8', size: 0.03 },
      space: { n: 260, x: [-1.7, 1.7], y: [0.2, 2.8], z: [-3.4, 4.3], color: '#cfefff', size: 0.02 },
      finale: { n: 160, x: [-5, 5], y: [0.3, 4], z: [-3, 7], color: '#fff6d8', size: 0.025 },
    }[theme] || { n: 1, x: [0, 0], y: [0, 0], z: [0, 0], color: '#ffffff', size: 0.01 };
    this._dustCfg = cfg;
    const n = cfg.n;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const rnd = mulberry32(8);
    this._dustBase = [];
    for (let i = 0; i < n; i++) {
      const x = cfg.x[0] + rnd() * (cfg.x[1] - cfg.x[0]), y = cfg.y[0] + rnd() * (cfg.y[1] - cfg.y[0]), z = cfg.z[0] + rnd() * (cfg.z[1] - cfg.z[0]);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this._dustBase.push([x, y, z, rnd() * 6.28, 0.3 + rnd() * 0.7]);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!this.dustMat) {
      const c = TX.makeCanvas(32, 32), ctx = c.getContext('2d');
      const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
      this.dustMat = new THREE.PointsMaterial({ size: 0.014, map: TX.toTex(c, { wrap: false }), color: '#fff2d8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    }
    this.dustMat.color.set(cfg.color);
    this.dustMat.size = cfg.size;
    this.dustMat.opacity = 0;
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }
  _updateDust(dt, target) {
    const t = this.time;
    this.dustMat.opacity = lerp(this.dustMat.opacity, target, 1 - Math.exp(-dt * 3));
    if (this.dustMat.opacity > 0.02) {
      const p = this.dust.geometry.attributes.position;
      const amp = this._dustCfg === undefined || this._dustCfg.n === 420 ? 1 : 0.8;
      for (let i = 0; i < this._dustBase.length; i++) {
        const b = this._dustBase[i];
        p.setXYZ(i, b[0] + Math.sin(t * 0.13 * b[4] + b[3]) * 0.25 * amp, b[1] + Math.sin(t * 0.09 * b[4] + b[3] * 2) * 0.18 * amp, b[2] + Math.cos(t * 0.11 * b[4] + b[3]) * 0.25 * amp);
      }
      p.needsUpdate = true;
    }
  }

  _updateWorld(dt) {
    const S = this.S, R = this.refs;
    const t = this.time;
    if (R.theme === 'finale') { for (const u of R.updaters) u(dt, t, this); this._updateDust(dt, 0.35); return; }
    if (this.CH) this.CH.world(this, dt, t);
    else this._updateWorld1(dt);
    for (const u of R.updaters) u(dt, t, this);
    // 洗手间窗外：镜头在屋子南半边或洗手间里才画、才动
    const O = R.outside;
    O.group.visible = this.camera.position.z > 1.5;
    if (O.group.visible) O.update(dt, t, this.camera);
    // 挂钟
    let ck = this.CH && this.CH.clockHands ? this.CH.clockHands(this) : null;
    if (!ck) {
      const [h0, m0] = this.CH ? this.CH.clock : [7, 30];
      const gm = S ? 29.99 * this.storyP() : 29;
      ck = { h: h0, m: m0 + gm, s: (gm % 1) * 60 };
    }
    const cl = R.clock.userData;
    cl.minute.rotation.z = -(ck.m / 60) * Math.PI * 2;
    cl.hour.rotation.z = -((ck.h + ck.m / 60) / 12) * Math.PI * 2;
    cl.second.rotation.z = -(ck.s / 60) * Math.PI * 2;
    // 紫光手电
    const uvOn = S && S.uvOn && this.state === 'play';
    const U = R.uvUniforms;
    U.on.value = lerp(U.on.value, uvOn ? 1 : 0, 1 - Math.exp(-dt * 10));
    this.uvLight.intensity = lerp(this.uvLight.intensity, uvOn ? 1.6 : 0, 1 - Math.exp(-dt * 10));
    if (U.on.value > 0.01) {
      const origin = _v1;
      if (this.ctrl.mode === 'first') {
        origin.copy(this.camera.position);
        this.camera.getWorldDirection(_v3);
        origin.addScaledVector(_v3, 0.15);
        origin.y -= 0.12;
      } else {
        this.ch.torchTip.getWorldPosition(origin);
      }
      const dir = _v2.copy(this.aim).sub(origin);
      if (dir.lengthSq() < 0.01) this.camera.getWorldDirection(dir);
      dir.normalize();
      this.uvLight.position.copy(origin);
      this.uvLight.target.position.copy(origin).addScaledVector(dir, 3);
      U.lightPos.value.copy(origin);
      U.lightDir.value.copy(dir);
    }
  }

  // 第一章的灯光：开关灯、拉窗帘
  _updateWorld1(dt) {
    const S = this.S, R = this.refs, L = R.lights;
    const t = this.time;
    // --- 灯光目标值 ---
    let hemi = 0.22, win = 1.8, sun = 0, spot = 0, tube = 0, curtEm = 0.09, env = 0.16;
    const lightsOn = this.lightMode === 'title' || this.lightMode === 'end' || (S && S.f.lightsOn);
    const curtainOpen = S && S.f.curtainOpen;
    if (lightsOn) { spot = this.lightMode === 'title' ? 11 : 14; tube = 2.2; hemi += 0.1; env += 0.05; }
    if (curtainOpen) { win = 4.2; sun = 1.9; hemi += lightsOn ? 0.06 : 0.14; curtEm = 0.02; env += 0.06; }
    if (lightsOn && curtainOpen) { spot *= 0.75; win *= 0.85; }
    const kk = 1 - Math.exp(-dt * 3);
    this.light.hemi = lerp(this.light.hemi, hemi, kk);
    this.light.win = lerp(this.light.win, win, kk);
    this.light.sun = lerp(this.light.sun, sun, kk);
    this.light.env = lerp(this.light.env ?? env, env, kk);
    let spotV = lerp(this.light.spot, spot, 1 - Math.exp(-dt * 8));
    let tubeV = lerp(this.light.tube, tube, 1 - Math.exp(-dt * 8));
    this.light.spot = spotV; this.light.tube = tubeV;
    if (this.light.flicker > 0) {
      this.light.flicker -= dt;
      const on = Math.random() < 0.55 ? 1 : 0.1;
      spotV *= on; tubeV *= on;
    }
    L.hemi.intensity = this.light.hemi;
    L.winLight.intensity = this.light.win;
    L.sun.intensity = this.light.sun;
    L.ceilSpots.forEach((s) => (s.intensity = spotV));
    L.tubeMats.forEach((m) => (m.emissiveIntensity = tubeV));
    R.K.M.curtain.emissiveIntensity = lerp(R.K.M.curtain.emissiveIntensity, curtEm, kk);
    this.scene.environmentIntensity = this.light.env;
    const mc = this._monColor || '#ffe6b0';
    L.monLight.color.lerp(_c.set(mc), kk);
    L.monLight.intensity = 1.1 + Math.sin(t * 13) * 0.04;
    // 灰尘
    this._updateDust(dt, curtainOpen ? 0.55 : 0.08);
    // 鸟叫
    if (curtainOpen && this.state === 'play') {
      this._birdT = (this._birdT ?? 3) - dt;
      if (this._birdT <= 0) { this._birdT = 3 + Math.random() * 5; this.audio.chirp(); if (Math.random() < 0.6) setTimeout(() => this.audio.chirp(), 180); }
    }
    // 窗户雾气回落
    if (this._fogHold > 0) {
      this._fogHold -= dt;
      if (this._fogHold <= 0) { const f = R.fog.mat; const o0 = f.opacity; this.tween(3, (k) => (f.opacity = lerp(o0, 0.12, k))); }
    }
    // 拉开窗帘后的光柱
    if (R.shafts) R.shafts.update(dt, t, curtainOpen ? 1 : 0);
  }
}

// 换章时把旧宿舍的显存全部释放
function disposeTree(root) {
  const mats = new Set(), geos = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) if (m) mats.add(m);
    if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    if (o.isReflector && o.dispose) o.dispose();
  });
  for (const m of mats) {
    for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) texs.add(u.value);
    m.dispose();
  }
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
}

const _c = new THREE.Color();
