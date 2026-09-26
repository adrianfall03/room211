// 第三章：船舱 211（凌晨 04:10 · 北大西洋 · 天亮之前）
//   宿舍成了一艘老货轮船头底下的船员舱。室友们上甲板值早班去了（四点到八点那一班），把我锁在舱里。
//   门上是一把"水密门转盘锁"，三个转盘刻着 🗼⚓📻：
//   🗼 桌上滑来滑去的扳手 → 拧开舷窗的铁盖 → 北边海上有座灯塔，每 12 秒闪一组——一组闪几下
//   ⚓ 地上的积水没过脚背，水底下隐约有白漆字 → 天花板货网里卡着舱底泵的摇把 → 洗手间里的钩篙把它勾下来 → 装上泵、压六下 → 水抽干了，甲板上刷着"⚓ N"
//   📻 我的书桌成了电报台：打开电子管收音机 → 天线没接（线头耷拉在墙边）→ 接上以后收到室友发的摩尔斯电码，纸带上一串点划 → 对照墙上的电码表
//   整间屋子一直在晃（横摇 + 纵摇）：马灯来回摆、地上的积水晃到一边又晃回来、人也跟着歪；舷窗打开之后，窗外的海平线也跟着斜
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, easeOutBack, smoothstep } from '../core/util.js';
import { untoonify } from '../world/toonkit.js';
import * as TS from '../core/tex_ship.js';
import { SHIP_MOTION, LIGHTHOUSE } from '../world/ship.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3(), _up = new THREE.Vector3(), _t = new THREE.Vector3();
const CN = '一二三四五六七八九';
const LH_CYCLE = 12, LH_GAP = 0.9; // 灯塔：每 12 秒闪一组，一组里每 0.9 秒闪一下
const DRAIN = [0.1, -0.035]; // 积水：抽水前 / 抽干以后（屋子中心处的水面高度）
const STROKES = 6;

export const CH3 = {
  n: 3, theme: 'ship',
  title: '第三章 · 船舱 211', sub: '04:10 · 北大西洋 · 天亮之前', tag: '第三章 · 船舱 211',
  clock: [4, 10], lockName: '转盘锁', doorName: '水密门', codeLen: 3, codeIcons: ['🗼', '⚓', '📻'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['cargoNet', 'porthole', 'pump', 'stencil', 'vests', 'crates', 'chart', 'voicePipe'],
  items: {
    wrench: { icon: '🔧', name: '活动扳手', desc: '一把沉甸甸的活动扳手，刚才还在海图桌上滑来滑去' },
    hook: { icon: '🪝', name: '钩篙', desc: '两米长的钩篙，头上一个铁钩。够高处的东西正好' },
    lever: { icon: '🔩', name: '泵摇把', desc: '一根铁棍，一头包着红色橡胶——舱底泵的摇把' },
  },
  roll: 0, pitch: 0,

  clockText(g) {
    const mm = 10 + g.storyMinutes();
    return `04:${String(mm).padStart(2, '0')} · 横摇 ${Math.round(Math.abs(this.roll) * 57.3)}°`;
  },

  init(g) {
    const R = g.refs, S = g.S;
    untoonify(g.ch.root);
    g.uvLight.visible = false; // 这一章用不上紫光手电
    g.scene.fog = new THREE.FogExp2('#0c1216', 0.03);
    g.lightMode = 'game';
    S.digits[0] = 2 + Math.floor(g.rnd() * 7); // 灯塔一组闪 2~8 下
    TS.drawDeckStencil(R.stencil.canvas, S.digits[1]);
    R.stencil.tex.needsUpdate = true;
    R.ship.h = DRAIN[0];
    // 舱顶灯一开始就亮着（第一次试玩觉得太暗）：开关还能关掉，只剩马灯
    S.f.lightsOn = true; S.f.bulbSeen = true;
    R.switchRocker.rotation.x = -0.12;
    // 状态
    this.roll = 0; this.pitch = 0; this._kick = 0; this._kickV = 0; this._rollK = 1;
    this._lhT = 3; this._flash = 0; this._look = false; this._whale = 0; this._whaleT = -1;
    this._pumpBusy = false; this._leverIn = false; this._netLever = true;
    this._tx = null; this._txT = 0; this._tape = []; this._printed = 0; this._radioBusy = false;
    this._creakT = 4; this._sloshSign = 0; this._boomT = 14; this._splashD = 0; this._lastPos = null;
    this._leakT = 0; this._washDecay = 0; this._dripT = 1;
    this._baseQ = new THREE.Quaternion(); this._rolledQ = null;
    this._drawTape(g);
    R.lantern.ang.set(0, 0, 0); R.lantern.vel.set(0, 0, 0);
    g.audio.stepKind = 'water';
    g.audio.startSea();
  },

  // ---------- 进门 ----------
  // 人从门口的光里走进来，门在身后关上：一股海水从门缝底下漫进来，转轮自己转回去，一圈压紧把手"咔咔咔"扣死
  portal: 'sea',
  lockView: { cam: V(-0.9, 1.45, 3.2), look: V(-1.76, 1.15, 3.9) },
  relockLine: '……舱门的转轮自己转回去了？！又锁死了！',
  intro(g, { prepare }) {
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    const say = (t, d = 2.6) => g.ui.subtitle(t, d, g.S.name);
    g.after(T - 0.2, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.3, lookPitch: -0.3 }; say('……地板在晃？', 1.8); g.audio.creak(); });
    g.after(T + 1.4, () => {
      g._cineTo(V(-0.4, 1.7, 0.6), V(0.05, 2.35, -1.25), 1.8);
      g._cutPose = { lookYaw: 0.1, lookPitch: 0.25 };
    });
    g.after(T + 2.2, () => say('吊着的马灯在来回摆……这是……船上？！', 3));
    g.after(T + 5.0, () => { this.bigWave(g, 0.7); });
    g.after(T + 5.6, () => { g._cineTo(V(0.2, 1.3, 2.0), V(-0.2, 0.0, -0.6), 1.6); g._cutPose = { lookYaw: 0, lookPitch: -0.45 }; });
    g.after(T + 6.2, () => say('脚底下全是水……哗啦哗啦地跟着船晃过来晃过去。', 3.2));
    g.after(T + 9.4, () => { g._cineTo(V(0.6, 1.5, -0.4), V(1.45, 0.9, 0.2), 1.4); g._cutPose = { lookYaw: 0.6, lookPitch: -0.1 }; });
    g.after(T + 10.0, () => say('我的书桌上……摆着一台老收音机，还有一本摊开的本子。', 3.0));
    g.after(T + 13.2, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 14.4, () => g.beginPlay());
  },
  onSlam(g) {
    const dz = g.refs.door.z;
    g.audio.slosh(1.2);
    g.fx.emit('drop', V(-1.7, 0.08, dz), { count: 16, speed: 1.1, spread: 1.2, up: 0.8, gravity: -6, drag: 0.4, life: 0.8, size: 0.03, colors: ['#9ab4c0', '#c8d8e0'] });
  },
  // 门锁：'hide'（门开着：压紧把手全翻开）/ 'anim'（转轮自己转回去，把手一个个扣死）/ 'show'
  _dogs(g, closed) { for (const [i, d] of g.refs.shipLock.dogs.entries()) d.rotation.z = closed ? 0 : (i % 2 ? -1.35 : 1.35); },
  relock(g, mode) {
    const H = g.refs.shipLock;
    H.lamp.emissive.set('#ff3a1a'); H.lamp.emissiveIntensity = 2.2;
    if (mode === 'hide') { this._dogs(g, false); return; }
    if (mode !== 'anim') { this._dogs(g, true); return; }
    this._dogs(g, false);
    const w0 = H.wheel.rotation.z;
    g.tween(0.9, (k) => (H.wheel.rotation.z = w0 + k * Math.PI * 3), { ease: easeInOut }).cut = true;
    g.audio.ratchet(8);
    H.dogs.forEach((d, i) => {
      const r0 = d.rotation.z;
      g.after(0.45 + i * 0.1, () => { g.audio.clunk(); g.tween(0.12, (k) => (d.rotation.z = r0 * (1 - k)), { ease: (t) => t }).cut = true; });
    });
  },
  onPlay(g) {
    g.ui.toast('第三章 · 天亮之前，逃出船舱 211', '', '⚓');
    g.after(1.4, () => g.ui.subtitle('先看看电报台边上那本摊开的本子……', 3.2, g.S.name));
  },
  exitLine: () => '天快亮了……走！',
  onDoorOpen(g) { g.audio.slosh(1.4); g.audio.foghorn(); },

  // ---------- 目标 / 提示 ----------
  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.readLog && !f.triedDoor) return [{ text: '看看电报台边上那本航海日志', done: false }];
    return [
      { text: '🗼 数一数灯塔一组闪几下', done: F[0] },
      { text: '⚓ 把舱底的积水抽干', done: F[1] },
      { text: '📻 收一封电报', done: F[2] },
      { text: f.unlocked ? '出门！' : `打开水密门的转盘锁（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found, inv = S.inv, R = g.refs;
    if (!f.readLog) return '我的书桌（电报台）上摊着一本航海日志，先看看室友写了什么。';
    if (!F[0]) {
      if (!R.portholes.some((p) => p.open)) {
        if (!inv.includes('wrench')) return '舷窗盖是用蝶形螺母拧死的，得用扳手。窗边的海图桌上有把扳手，跟着船晃来晃去地滑。';
        return '拿着扳手去北墙，把舷窗的铁盖拧开。';
      }
      return '对着打开的舷窗按 E 看窗外——北边有座灯塔，数一数它一组闪几下。';
    }
    if (!F[1]) {
      if (!this._leverIn) {
        if (!inv.includes('lever')) {
          if (!inv.includes('hook')) return '舱底泵（南墙，洗手间门东边）少了摇把——摇把卡在天花板的货网里，太高了。洗手间里靠着一根钩篙。';
          return '拿着钩篙去勾天花板货网里的那根铁棍（泵摇把）。';
        }
        return '把摇把装到南墙的舱底泵上。';
      }
      return '一下一下地压舱底泵，把地上的水抽干，看看水底下的白漆字。';
    }
    if (!F[2]) {
      if (!R.radio.on) return '书桌上那台电子管收音机就是电报机，打开它的电源。';
      if (!R.antenna.connected) return '收音机里只有沙沙声——天线没接。天花板上垂下来一根线，线头耷拉在墙边，接到收音机上。';
      if (!this._tape.length) return '等一会儿，室友会用摩尔斯电码发电报过来，收报机会把它打在纸带上。';
      return '看看收报机吐出来的纸带，对照墙上的摩尔斯电码表。';
    }
    return `密码凑齐了！去门口，按🗼⚓📻的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S, [A, B, C] = S.mates;
    const pipe = (key, who, text, cb) => { if (S.msgSent[key]) return; S.msgSent[key] = true; this.pipeCall(g, who, text); cb && cb(); };
    if (p > 0.16 && !S.msgSent.bell1) { S.msgSent.bell1 = true; g.after(0.2, () => { g.audio.shipBell(1); g.after(1.2, () => g.ui.subtitle('甲板上传来一声钟响……四点半了。', 3, S.name)); }); }
    if (p > 0.3) pipe('p1', A, '睡神——！醒了没——？！浪有点大，你在舱里抓稳了！电报我们等会儿就发！');
    if (p > 0.46 && !S.msgSent.whale) {
      S.msgSent.whale = true; this._whale = 1;
      g.audio.hullBoom(0.6); g._shake(0.12);
      g.after(1.2, () => g.audio.whaleSong());
      g.after(2.2, () => g.ui.subtitle('咚——船底下有什么东西撞了一下……还有一种很低很长的"呜——"声，像是在唱歌？', 4.4, S.name));
    }
    if (p > 0.6 && !S.msgSent.wave) { S.msgSent.wave = true; g.audio.bell(); g.after(1.0, () => { g.ui.subtitle('【驾驶台广播】全体注意，右舷来大浪！抓稳了！', 3.6, '📢 驾驶台'); g.after(2.2, () => this.bigWave(g, 1.6)); }); }
    if (p > 0.72) pipe('p2', C, `${B}说你再不出来，早饭的煎蛋就归他了🍳`);
    if (p > 0.84 && !S.msgSent.dawn) { S.msgSent.dawn = true; g.after(0.5, () => g.ui.subtitle('东边的海平线……好像亮了一点点。', 3, S.name)); }
  },

  // ---------- 交互 ----------
  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label: () => g._fill(label), verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const Fl = {
      foldTable: ['折叠桌', '门边的折叠桌，四条桌腿用绳子绑在了舱壁的扶手上——防止它跟着船满屋子跑。'],
      blackTable: ['杂物桌', '桌上的泡面桶、可乐瓶全用网兜兜住了。这才是在船上过日子的样子。'],
      bedW1: ['{A}的铺位', '{A}的铺位，床边拉着一道帆布挡板——睡着了也不会被晃下床。'],
      bedW2: ['{B}的铺位', '{B}的铺位，枕头底下压着一本《晕船急救手册》，翻到第一页就吐了（有痕迹）。'],
      shelf: ['书架', '书架前面拦着一根横杆，书才没掉一地。《航海学》《船艺》《高等数学（下）》……'],
      shoeRack: ['鞋架', '鞋架上是四双湿透了的胶靴。'],
      storageBox: ['收纳箱', '收纳箱里是四件黄色的防水雨衣。'],
      polkaBag: ['收纳袋', '一袋子晕船药，全拆开过。'],
      box350: ['纸箱', '一箱"船员口粮"：压缩饼干。泡过海水，软了。'],
      bedE1: ['我的铺位', '我的铺位。被子湿了一半……难怪梦见自己在游泳。'],
      patternRoll: ['凉席卷', '卷起来的凉席，绑在铺位的柱子上。'],
      bedE2: ['{C}的铺位', '{C}的铺位，墙上贴着一张照片：他站在船头，摆着泰坦尼克号的姿势。'],
      farDesks: ['海图桌', '窗边的书桌成了海图桌：一张北大西洋的海图，分规、平行尺，还有一只摔不碎的铁皮杯子。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子里装着一双防滑鞋。'],
      toteBag: ['红色袋子', '红色大袋子里是一卷帆布和一盒防水火柴。'],
      redBag: ['红色收纳包', '{C}的冬衣，全是羊毛的——船上冷。'],
      paper: ['复习资料', '复习资料泡在水里，字都晕开了。"高等数学（下）"……船上也逃不掉。'],
      fallenBooks: ['掉在地上的书', '书架前的地上掉着三本书，泡得发胀。船晃成这样，书掉下来也不奇怪……吧？'],
      folder: ['文件夹', '《值班表——{C}整理》：04-08 早班：{A}、{B}、{C}。备注："睡神：叫了，没醒。"'],
      apple: ['苹果', '一个苹果在桌上滚来滚去，被一本书挡住了。'],
      drawer: ['抽屉', '抽屉被一根插销插死了——船上的抽屉都这样，不然一晃就全甩出来。'],
      suitcase: ['行李箱', '行李箱用绳子捆在铺位的柱子上。'],
      basket: ['脏衣篓', '脏衣篓里全是湿衣服……闻起来像海带。'],
      stoolMe: ['凳子', '凳子的腿用螺栓固定在了甲板上。'],
      lifeRing: ['救生圈', '救生圈上刷着"211 宿舍号"。……我们宿舍什么时候成了一条船？'],
      vests: ['救生衣', '四件救生衣挂了三件——室友们穿走了一件？不对，他们三个人……那剩下的一件是给我留的。'],
      crates: ['木箱', '两只木箱，一只写着"易碎"，一只写着"热可可 · 船员伙食"——空的。可可呢？'],
      extinguisher: ['灭火器', '灭火器，检验日期：三十年前。'],
      barometer: ['气压计', '气压计的指针停在"暴风"和"变化"之间……还在往下掉。'],
      clock: ['船钟', '黄铜船钟，走得挺准。外圈是十二小时，里圈是二十四小时。'],
      towels: ['毛巾', '毛巾挂了一夜，还是湿的——船上的东西就没有干过。'],
      wcBucket: ['水桶和拖把', '水桶里装满了海水……拖把在这儿就是个笑话。'],
      shower: ['花洒', '花洒里出来的是海水。'],
      graffiti: ['隔板涂鸦', '隔板上写着"窗外有猴!!"……旁边多了一行："海上哪来的猴？？"'],
    };
    for (const [id, [l, t]] of Object.entries(Fl)) H[id] = flav(l, t);
    H.logbook = { label: '航海日志', verb: '阅读', act: () => this.readLog(g) };
    H.chart = { label: '海图', verb: '看看', reach: false, act: () => { g.say('海图上铅笔画着航线，终点画了个圈："211 在这儿"。北边标着一座灯塔：Fl(?) 12s——每 12 秒闪一组，一组闪几下被水渍糊掉了。', 5); g.clue('chart', '海图：北边有座<b>灯塔</b>，每 12 秒闪一组——一组闪几下糊掉了，得亲眼看。'); } };
    H.switch = { label: '舱室照明', verb: () => (S().f.lightsOn ? '关灯' : '开灯'), act: () => {
      const s = S();
      s.f.lightsOn = !s.f.lightsOn; g.audio.switchClick();
      g.refs.switchRocker.rotation.x = s.f.lightsOn ? -0.12 : 0.12;
      if (s.f.lightsOn) { g.light.flicker = 0.7; if (!s.f.bulbSeen) { s.f.bulbSeen = true; g.say('舱顶灯一闪一闪地亮了——船上的发电机好像也不太行。', 3); } }
    } };
    // ---- 🗼 扳手、舷窗 ----
    H.wrench = { label: '活动扳手', verb: '抓住它', act: () => {
      const W = g.refs.wrench;
      if (W.taken) return;
      W.taken = true; W.group.visible = false;
      g.give('wrench'); g.audio.clankMetal(0.6);
      g.say('一把活动扳手，跟着船在海图桌上滑过来、滑过去……逮住你了！', 3.2);
    } };
    H.porthole = { label: '舷窗', verb: (hv) => '查看', reach: true, act: (hv) => this.onPorthole(g, hv) };
    H.porthole.verb = () => {
      const hv = g.hover, P = hv && hv.obj && g.refs.portholes[hv.obj.userData.idx];
      if (P && P.open) return '看窗外';
      return S().inv.includes('wrench') ? '拧开舷窗盖' : '查看';
    };
    // ---- ⚓ 货网、钩篙、舱底泵、甲板上的字 ----
    H.boatHook = { label: '钩篙', verb: '拿起来', act: () => {
      g.give('hook'); g.refs.boatHook.visible = false; g.audio.pickup();
      g.say('一根两米长的钩篙，靠在淋浴的角落里。够高处的东西正好。', 3);
    } };
    H.cargoNet = { label: '货网', verb: () => (this._netLever ? (S().inv.includes('hook') ? '用钩篙勾下来' : '查看') : '查看'), reach: false, act: () => this.onNet(g) };
    H.pump = { label: '舱底泵', verb: () => (this._leverIn ? (S().f.drained ? '查看' : '压水') : S().inv.includes('lever') ? '装上摇把' : '查看'), act: () => this.onPump(g) };
    H.stencil = { label: '甲板上的字', verb: '看看', reach: false, act: () => {
      if (S().f.drained) { g.say(`甲板上用白漆刷着一个锚，旁边一个大大的 ${S().digits[1]}。`, 3); return; }
      g.say('水底下好像有一大片白色的东西……是字？水太浑了，看不清。', 3.2);
      g.clue('stencil', '地上的积水底下隐约有<b>白漆字</b>——得先把水抽干。');
    } };
    // ---- 📻 电报台 ----
    H.radio = { label: '电子管收音机', verb: () => (g.refs.radio.on ? '关掉' : '打开'), act: () => this.onRadio(g) };
    H.antenna = { label: '天线', verb: () => (g.refs.antenna.connected ? '查看' : '接到收音机上'), act: () => this.onAntenna(g) };
    H.morseKey = { label: '电键', verb: '按一下', act: () => {
      const L = g.refs.radio.lever;
      g.tween(0.12, (k) => (L.rotation.x = Math.sin(k * Math.PI) * 0.12), { ease: (t) => t });
      g.audio.morse('.', 700);
      this._keyN = (this._keyN || 0) + 1;
      if (this._keyN === 5) g.say('……我又不会发报。发个 SOS 算了？··· ——— ···', 3);
    } };
    H.morseChart = { label: '摩尔斯电码表', verb: '看看', reach: false, act: () => this.showChart(g) };
    H.tape = { label: '电报纸带', verb: '读纸带', act: () => this.readTape(g) };
    // ---- 其他 ----
    H.leak = { label: '漏水的法兰', verb: () => (g.refs.leak.on ? (S().inv.includes('wrench') ? '拧紧螺栓' : '查看') : '查看'), reach: false, act: () => this.onLeak(g) };
    H.thermos = { label: '保温壶', verb: () => (S().f.cocoa ? '查看' : '喝一口'), act: () => {
      const s = S();
      if (s.f.cocoa) { g.say('保温壶已经空了。', 2.4); return; }
      s.f.cocoa = true; s.freeHints++;
      g.audio.slurp();
      g.say('保温壶里是热可可！还烫嘴……整个人都暖和过来了。（下一次提示免费）', 3.6);
    } };
    H.bell = { label: '船钟', verb: '敲一下', act: () => {
      const C = g.refs.bell.clapper;
      g.tween(0.5, (k) => (C.rotation.z = Math.sin(k * Math.PI * 3) * 0.6 * (1 - k)), { ease: (t) => t });
      g.audio.shipBell(2);
      this._bellN = (this._bellN || 0) + 1;
      g.say(['当、当——（两响……这会儿该敲几响来着？）', '当、当——（值班钟：每半小时敲一次，四点半是一响……我敲多了。）', '当、当——（甲板上有人喊："别敲了！"）'][(this._bellN - 1) % 3], 3.4);
    } };
    H.voicePipe = { label: '传声筒', verb: '喊一嗓子', act: () => {
      const [A, B, C] = S().mates;
      g.say('（对着铜管子）喂——！有人吗——？！', 2);
      g.audio.shout(1.1, 0.7, true);
      const replies = [[A, '听见了听见了！喊什么喊，你倒是先把门打开啊！'], [B, '别喊了，一嘴海风……电报记得接天线！'], [C, '睡神你终于醒了！我们在甲板上，这边浪好大——']];
      const [who, t] = replies[(this._pipeN = ((this._pipeN || 0) + 1)) % 3];
      g.after(2.2, () => { g.audio.pipeWhistle(); g.ui.subtitle(t, 3.4, `🔊 ${who}（传声筒）`); });
    } };
    H.door = { label: '水密门', verb: () => (S().f.unlocked ? '出门' : '开锁'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '洗手间门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '拧水龙头', act: () => { g.audio.water(1.2); g.say('水龙头里流出来的是……咸的。海水淡化器坏了？', 3); } };
    H.toilet = { label: '厕所', verb: '冲水', act: () => { g.audio.flush(); g.say('冲水——马桶里的水跟着船一起晃……别看了，要晕了。', 3); } };
    H.mirror = { label: '穿衣镜', verb: '照镜子', reach: false, act: () => {
      g.ch.setExpression('grin', 2.2);
      g.say(['镜子上一层盐花……镜子里的我脸色发绿。晕船了。', '别照了，越照越晕。', '头发被海风吹成了鸟窝。'][(this._mirN = (this._mirN || 0) + 1) % 3], 3);
    } };
    H.wcMirror = { label: '镜子', verb: '照镜子', reach: false, act: () => g.say('洗漱台的镜子上全是水汽和盐……照出来的人一晃一晃的。', 2.8) };
    H.wcWindow = { label: '舷窗', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只猴子还在救生艇里冲我摆造型……'); return; }
      O.trigger(4.5); g.audio.monkey(); g.after(0.8, () => g.audio.monkey(1.25));
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>救生艇里的三只猴子</b>', 'clue', '🐒'); }
      g.say('舷窗外面吊着一只救生艇……里面探出三只穿救生衣的猴子，冲我摆了个"三不猴"！', 4);
    } };
    return H;
  },

  // ---------- 航海日志 ----------
  readLog(g) {
    const S = g.S, [A, B, C] = S.mates;
    g.audio.paper();
    const node = g.ui.doc({ variant: 'log', title: '航海日志 · 211 号货轮', html: `<div class="date">04:02 · 西北风 7 级 · 涌浪 6 米 · 能见度良好</div>
      ${A}、${B}、${C} 上甲板值早班（四点到八点）。睡神叫不醒，随他去。<br>
      舱门给他锁上了——<b>水密门转盘锁</b>，3 位：<br>
      🗼 船头北边有座灯塔，数它<b>一组闪几下</b>（舷窗盖拧死了，扳手……刚才还在海图桌上）<br>
      ⚓ 舱底刷着呢——得先把水<b>抽干</b>（泵的摇把晃到天花板的货网里去了，自己想办法）<br>
      📻 我们会用<b>电报</b>发给你（记得接天线）<br>
      附：舱里有点漏水，别慌。这船漏了三十年了。<div class="sig">—— 211 全体船员</div>` });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.readLog) {
      S.f.readLog = true;
      g.clue('log', '航海日志：门上是<b>水密门转盘锁</b>（3 位）——🗼 北边灯塔<b>一组闪几下</b>；⚓ 抽干舱底的水，<b>甲板上刷着</b>；📻 室友会发<b>电报</b>（要接天线）。');
      g.after(0.5, () => g.say('上甲板值班？……又把我一个人丢下了。先把舷窗打开看看外面！', 3.4));
    }
  },

  // ---------- 🗼 舷窗、灯塔 ----------
  onPorthole(g, hv) {
    const S = g.S, R = g.refs;
    const P = hv && hv.obj ? R.portholes[hv.obj.userData.idx] : R.portholes[1];
    if (!P || P.busy) return;
    if (P.open) { this.lookOut(g, P); return; }
    if (!S.inv.includes('wrench')) {
      g.audio.lockedRattle();
      g.say('舷窗盖用两个蝶形螺母拧得死死的……徒手拧不动，得找把扳手。', 3.2);
      g.clue('porthole', '北墙三个<b>舷窗</b>都扣着铁盖，蝶形螺母拧死了——要<b>扳手</b>。');
      return;
    }
    this.openPorthole(g, P, () => { if (!S.f.sawLight) this.lookOut(g, P, true); });
  },
  openPorthole(g, P, done) {
    P.busy = true;
    g.audio.ratchet(8);
    P.dogs.forEach((d, i) => {
      g.tween(0.7, (k) => { d.nut.rotation.z = k * Math.PI * 6; d.nut.position.z = 0.058 + k * 0.01; }, { ease: (t) => t });
      g.after(0.75 + i * 0.1, () => g.tween(0.25, (k) => (d.piv.rotation.z = (i ? 0.35 : -0.35) + (i ? 1 : -1) * k * 1.4), { ease: easeOut }));
    });
    g.after(1.1, () => {
      g.audio.clunk(); g.audio.creak();
      g.tween(0.9, (k) => (P.hinge.rotation.y = -1.95 * k), { ease: easeOutBack, done: () => { P.open = true; P.busy = false; done && done(); } });
    });
    g.say('咔啦咔啦……拧开了！', 1.6);
  },
  // 贴着舷窗往外看：镜头凑到舷窗后面，看灯塔一组闪几下（第一次会数出来）；鲸来过之后，下一次看窗外就能看见它跃出海面
  lookOut(g, P, first = false) {
    const S = g.S;
    if (this._look) return;
    this._look = true;
    const cam = g.camera, fov0 = 62;
    const eye = V(P.px, 1.74, -2.94);
    if (this._whale === 1) { this.whaleShow(g, P, eye); return; }
    // 看的方向：舷窗正前方和灯塔之间（竖屏手机视野窄，直接对着灯塔会把舷窗挤到画面角落里）
    const toLh = LIGHTHOUSE.clone().sub(eye).normalize(), look = eye.clone().add(toLh.lerp(V(0, 0, -1), cam.aspect < 1 ? 0.55 : 0.2).normalize().multiplyScalar(20));
    const zf = g.zoomFov(44);
    g._cineTo(eye, look, 1.2);
    g.tween(1.2, (k) => { cam.fov = lerp(fov0, zf, k); cam.updateProjectionMatrix(); }, { ease: easeInOut });
    const N = S.digits[0];
    if (first || !S.found[0]) {
      g.after(0.9, () => g.ui.subtitle('月光下的海……北边的海上有一座灯塔！', 2.6, S.name));
      this._lhT = -0.9; // 1.8 秒后开始闪下一组
      for (let i = 0; i < N; i++) g.after(1.85 + i * LH_GAP, () => g.ui.subtitle(`${CN[i]}……`, 0.8, S.name));
      g.after(1.9 + N * LH_GAP + 0.7, () => { g.ui.subtitle(`一组闪了 ${N} 下！`, 2.6, S.name); g.foundDigit(0, '北边灯塔一组的闪光'); S.f.sawLight = true; });
      g.after(1.9 + N * LH_GAP + 3.4, () => this._endLook(g));
    } else {
      g.after(0.8, () => g.ui.subtitle(`灯塔还在闪：一组 ${N} 下，停一会儿，再来一组。`, 3, S.name));
      g.after(4.0, () => this._endLook(g));
    }
  },
  _endLook(g) {
    const cam = g.camera;
    const f0 = cam.fov;
    g.tween(0.9, (k) => { cam.fov = lerp(f0, 62, k); cam.updateProjectionMatrix(); }, { ease: easeInOut, done: () => { cam.fov = 62; cam.updateProjectionMatrix(); } });
    g._cineTo(null, null, 1.0);
    g.after(1.0, () => { this._look = false; });
  },
  // 鲸跃出海面：从右前方斜着冲出来，在半空里翻个身，砸回海里；最后尾鳍立起来、滑下去
  whaleShow(g, P, eye) {
    const S = g.S, W = g.refs.whale, cam = g.camera;
    this._whale = 2;
    // 鲸从舷窗正前方偏右冲出来，往左边砸下去（舷窗能看见的只有正前方二十几度，弧线不能太高）
    const base = V(P.px + 2.2, -1.25, -19);
    g._cineTo(eye, V(P.px + 0.2, 2.3, -19), 1.0);
    const zf = g.zoomFov(50);
    g.tween(1.0, (k) => { cam.fov = lerp(62, zf, k); cam.updateProjectionMatrix(); }, { ease: easeInOut });
    W.root.visible = true;
    const T = 6.2;
    g.audio.whaleSong();
    g.tween(T, (k) => {
      // 0 ~ 0.55：冲出来、翻身、砸下去；0.6 ~ 1：尾鳍
      if (k < 0.58) {
        const u = k / 0.58;
        const y = -6 + Math.sin(u * Math.PI) * 10.5;
        W.root.position.set(base.x - u * 4, base.y + y, base.z - u * 2);
        W.root.rotation.set(-Math.PI / 2 + 0.35 + u * 1.9, 0.6, u * 2.4);
        W.fluke.rotation.x = Math.sin(u * 8) * 0.2;
      } else {
        const u = (k - 0.58) / 0.42;
        W.root.position.set(base.x - 3, base.y - 7.5 + Math.sin(u * Math.PI) * 2.8, base.z - 3);
        W.root.rotation.set(-Math.PI / 2 - 0.2 + u * 0.6, 0.4, 0);
        W.fluke.rotation.x = -0.3 + u * 0.6;
      }
    }, { ease: (t) => t, done: () => { W.root.visible = false; } });
    g.after(T * 0.58 * 0.92, () => {
      g.audio.waveCrash(0.6);
      const p = base.clone().add(V(-3.5, 1.2, -1.5));
      g.fx.emit('steam', p, { count: 26, speed: 4, spread: 1.4, up: 1.6, gravity: -4, drag: 0.6, life: 2.4, size: 1.6, colors: ['#c8d4dc', '#e0e8ee'], grow: 1.5 });
    });
    g.after(1.4, () => g.ui.subtitle('……鲸！！一头鲸跳出了海面！', 3, S.name));
    g.after(4.2, () => { S.ach.add('whale'); g.ui.toast('发现彩蛋：<b>跃出海面的座头鲸</b>', 'clue', '🐋'); });
    g.after(T + 0.3, () => g.ui.subtitle('它刚才唱的歌……是在跟船打招呼吗？', 3, S.name));
    g.after(T + 1.4, () => this._endLook(g));
  },

  // ---------- ⚓ 货网、舱底泵 ----------
  onNet(g) {
    const S = g.S, R = g.refs;
    if (!this._netLever) { g.say('货网里只剩一只行李袋和一卷绳子了。', 2.6); return; }
    if (!S.inv.includes('hook')) {
      g.say('天花板的货网里卡着一根铁棍，一头包着红橡胶……是舱底泵的摇把？太高了，跳起来也够不着。', 3.8);
      g.clue('net', '天花板的<b>货网</b>里卡着<b>舱底泵的摇把</b>——太高了，得找根长杆子。');
      return;
    }
    // 用钩篙把摇把勾下来：铁棍从网眼里滑出来，正好接住
    this._netLever = false;
    g.take('hook');
    const L = R.cargoNet.lever, p0 = L.position.clone(), r0 = L.rotation.clone();
    g.audio.whoosh();
    g._cineTo(V(0.8, 1.55, 2.4), V(0.1, 2.3, 0.85), 0.8);
    g.after(0.6, () => { g.audio.clankMetal(0.8); g.say('勾住了——', 1.2); });
    const pc = g.ctrl.pos;
    g.after(0.9, () => g.tween(0.55, (k) => {
      L.position.lerpVectors(p0, V(pc.x, 1.15, pc.z), k * k);
      L.rotation.set(r0.x, r0.y + k * 2, r0.z + k * 1.2);
    }, { ease: (t) => t, done: () => { L.visible = false; g.give('lever'); g.audio.clunk(); g.say('哗啦——接住了！泵的摇把！', 2.4); g._cineTo(null, null, 0.9); } }));
  },
  onPump(g) {
    const S = g.S, R = g.refs, Pm = R.pump;
    if (S.f.drained) { g.say('水抽干了。泵的出水管还在"咕噜"地往外吐最后几口水。', 2.8); return; }
    if (!this._leverIn) {
      if (!S.inv.includes('lever')) {
        g.audio.lockedRattle();
        g.say('手摇舱底泵……摇把不见了，只剩一个空的插口。', 3);
        g.clue('pump', '南墙的<b>手摇舱底泵</b>少了<b>摇把</b>。');
        return;
      }
      g.take('lever');
      this._leverIn = true;
      Pm.lever.visible = true; Pm.piv.rotation.x = 0.35;
      g.audio.clunk();
      g.say('咔——摇把卡进去了。压几下试试！', 2.6);
      return;
    }
    if (this._pumpBusy) return;
    this._pumpBusy = true;
    const h0 = R.ship.h, h1 = lerp(DRAIN[0], DRAIN[1], (Pm.strokes + 1) / STROKES);
    g.tween(0.75, (k) => {
      Pm.piv.rotation.x = 0.35 - Math.sin(k * Math.PI) * 0.8;
      R.ship.h = lerp(h0, h1, k);
    }, { ease: (t) => t, done: () => { this._pumpBusy = false; } });
    g.audio.pumpStroke();
    Pm.strokes++;
    const spout = Pm.group.position.clone().add(V(0.28, 0.72, 0.1));
    g.after(0.35, () => g.fx.emit('drop', spout, { count: 6, speed: 0.4, spread: 0.3, up: 0.2, gravity: -6, drag: 0.3, life: 0.5, size: 0.03, colors: ['#8aa4b0'] }));
    if (Pm.strokes === 1) g.say('咕噜……水位下去了一点！接着压！', 2);
    if (Pm.strokes >= STROKES) {
      S.f.drained = true;
      g.after(0.9, () => this.revealStencil(g));
    }
  },
  revealStencil(g) {
    const S = g.S, st = g.refs.stencil.mesh.position;
    g._cineTo(V(0.1, 1.9, 1.3), V(st.x, 0, st.z), 1.2);
    g.after(1.3, () => g.ui.subtitle(`水抽干了……甲板上用白漆刷着一个锚，旁边一个大大的 ${S.digits[1]}！`, 3.2, S.name));
    g.after(1.9, () => g.foundDigit(1, '舱底甲板上刷的白漆字'));
    g.after(4.3, () => g._cineTo(null, null, 1.0));
  },

  // ---------- 📻 电报 ----------
  onRadio(g) {
    const S = g.S, Rd = g.refs.radio;
    if (Rd.on) {
      Rd.on = false; this._tx = null;
      g.audio.switchClick(); g.audio.radioOff();
      Rd.pwr.rotation.x = 0.4;
      g.say('关掉了。', 1.2);
      return;
    }
    Rd.on = true; Rd.warm = 0;
    Rd.pwr.rotation.x = -0.4;
    g.audio.switchClick(); g.audio.radioOn();
    g.say('啪——电子管一根根亮起来了，得预热一会儿……', 2.6);
    this._txT = 2.6;
    if (!g.refs.antenna.connected) g.after(3.0, () => { if (Rd.on && !g.refs.antenna.connected) { g.say('只有沙沙的杂音……天线好像没接？', 3); g.clue('antenna', '电报机只有杂音——<b>天线</b>没接（天花板上垂下来一根线）。'); } });
  },
  onAntenna(g) {
    const A = g.refs.antenna;
    if (A.connected) { g.say('天线接好了，一直通到甲板上的天线杆。', 2.4); return; }
    A.connected = true;
    const p0 = A.loose.clone();
    g.tween(0.6, (k) => { const p = p0.clone().lerp(A.plug, easeInOut(k)); p.y += Math.sin(k * Math.PI) * 0.15; A.end.position.copy(p); A.rebuild(p, lerp(0.18, 0.35, k)); }, { ease: (t) => t, done: () => g.audio.switchClick() });
    g.say('把天线的线头拧到收音机背后的接线柱上……好了。', 2.6);
    if (g.refs.radio.on) this._txT = Math.min(this._txT, 1.5);
  },
  // 收一封电报：嘀嘀嗒嗒，纸带一格一格往外吐
  _transmit(g) {
    const S = g.S, Rd = g.refs.radio, d = S.digits[2];
    const code = TS.MORSE[d];
    this._radioBusy = true;
    if (this._tape.length >= 4) this._tape.shift();
    this._tape.push(code);
    this._printed = this._tape.slice(0, -1).join('').length;
    let t = 0.4;
    for (const ch of code) {
      g.after(t, () => {
        if (!Rd.on) return;
        g.audio.morse(ch, 760);
        this._printed++; this._drawTape(g);
        Rd.tapeG.scale.x = Math.min(0.19, Rd.tapeG.scale.x + 0.012);
      });
      t += ch === '.' ? 0.3 : 0.55;
    }
    g.after(t + 0.3, () => {
      this._radioBusy = false;
      if (!S.f.gotTape && Rd.on) { S.f.gotTape = true; g.say('嘀嘀嗒嗒……收报机吐出来一截纸带！上面是一串点和划。', 3.2); g.clue('tape', '收报机打出了一截<b>纸带</b>（摩尔斯电码）——对照墙上的<b>电码表</b>。'); }
    });
  },
  _drawTape(g) {
    const Rd = g.refs.radio;
    TS.drawTape(Rd.tapeC, this._tape, { n: this._printed });
    Rd.tapeTex.needsUpdate = true;
  },
  showChart(g) {
    const img = g.refs.morseChart.image.toDataURL();
    const node = g.ui.doc({ variant: 'plain', title: '摩尔斯电码表', html: `<div style="text-align:center"><img src="${img}" style="max-width:100%;max-height:56vh;border-radius:4px"></div>` });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
  },
  readTape(g) {
    const S = g.S;
    if (!this._tape.length) { g.say('纸带还是空白的。', 2); return; }
    g.audio.paper();
    // 只截纸带上打过字的那一段，放大了给人看
    const full = document.createElement('canvas'); full.width = 1024; full.height = 40;
    const w = Math.min(1024, TS.drawTape(full, this._tape, { n: this._printed }) + 10);
    const c = document.createElement('canvas'); c.width = w; c.height = 40;
    c.getContext('2d').drawImage(full, 0, 0);
    const chart = g.refs.morseChart.image.toDataURL();
    const node = g.ui.doc({ variant: 'plain', title: '电报纸带', html: `<div style="background:#1c1a18;padding:12px;border-radius:4px;overflow-x:auto"><img src="${c.toDataURL()}" style="height:${Math.min(64, Math.round(40 * 460 / w))}px;max-width:none;margin:0;box-shadow:none"></div>
      <p style="margin:12px 0 6px;color:#888;font-size:14px">同一串点划重复发了好几遍。墙上的电码表：</p>
      <div style="text-align:center"><img src="${chart}" style="max-width:100%;max-height:40vh;border-radius:4px"></div>` });
    g.openModal(node, {
      closeKeys: ['Escape', 'KeyE'],
      onClose: () => {
        if (S.found[2]) return;
        const code = TS.MORSE[S.digits[2]].replace(/\./g, '·').replace(/-/g, '—');
        g.after(0.4, () => g.say(`${code}……对照电码表：是 ${S.digits[2]}！`, 3.2));
        g.after(1.0, () => g.foundDigit(2, '室友发来的电报'));
      },
    });
  },

  // ---------- 其他 ----------
  onLeak(g) {
    const S = g.S, Lk = g.refs.leak;
    if (!Lk.on) { g.say('法兰拧紧了，一滴都不漏了。', 2.4); return; }
    if (!S.inv.includes('wrench')) { g.say('天花板那根管子的法兰在滋滋地往外喷水……螺栓松了。', 3); return; }
    Lk.on = false;
    g.audio.ratchet(10);
    g.say('用扳手把法兰的螺栓一个个拧紧……不漏了！', 2.8);
    S.ach.add('leak');
  },
  // 甲板上的人对着传声筒喊话：先"嘘——"地一声哨响
  pipeCall(g, who, text) {
    const W = g.refs.voicePipe;
    g.audio.pipeWhistle();
    g.tween(0.6, (k) => (W.whistle.rotation.z = Math.sin(k * Math.PI * 6) * 0.08), { ease: (t) => t });
    g.after(1.0, () => g.ui.subtitle(text, 4.2, `🔊 ${who}（传声筒）`));
  },
  // 一个大浪：船猛地一歪，舷窗被浪拍了一脸，地上的水"哗"地冲到一边
  bigWave(g, k = 1) {
    this._kickV += 0.11 * k;
    g.audio.waveCrash(k);
    g._shake(0.18 * k);
    for (const u of g.refs.portGlass) u.uWash.value = 1;
    g.after(0.3, () => g.audio.slosh(1.2 * k));
    g.after(0.8, () => g.audio.creak());
  },

  // ---------- 门 ----------
  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.lockedRattle();
      g.say('水密门的转轮转不动……门上挂着一把转盘锁，三个转盘刻着🗼⚓📻？', 3.6);
      g.clue('door', '<b>水密门</b>上的转盘锁：三个转盘分别刻着 🗼 ⚓ 📻。');
      g.after(1.6, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '水密门 · 转盘锁', variant: 'ship', labels: ['🗼', '⚓', '📻'],
      hint: S.found.some(Boolean) ? `已知：<b>${known}</b>` : '三个黄铜转盘上刻着灯塔、船锚和收音机……',
      onTick: () => g.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  },
  removeLock(g) { this._dogs(g, false); const H = g.refs.shipLock; H.lamp.emissive.set('#3aff6a'); H.lamp.emissiveIntensity = 0.8; },
  unlock(g) {
    const S = g.S, H = g.refs.shipLock;
    S.f.unlocked = true;
    H.lamp.emissive.set('#3aff6a');
    const w0 = H.wheel.rotation.z;
    g.tween(1.0, (k) => (H.wheel.rotation.z = w0 - k * Math.PI * 3), { ease: easeInOut });
    g.audio.ratchet(8);
    H.dogs.forEach((d, i) => g.after(0.5 + i * 0.1, () => { g.audio.clunk(); g.tween(0.15, (k) => (d.rotation.z = k * (i % 2 ? -1.35 : 1.35)), { ease: easeOut }); }));
    g.say('转轮转开了，压紧把手一个个弹开——门开了！', 2.8);
    g.after(1.8, () => g.win());
  },

  // ---------- 每帧（只在 play 时）----------
  update(g, dt) {
    const R = g.refs, Rd = R.radio;
    // 电报：收音机开着、天线接着、预热好了——每隔一阵发一封
    if (Rd.on && R.antenna.connected && Rd.warm >= 1 && !this._radioBusy) {
      this._txT -= dt;
      if (this._txT <= 0) { this._txT = 14; this._transmit(g); }
    }
  },

  // ---------- 船的晃动、水、灯、窗外（每帧都跑）----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, W = R.water, SH = R.ship;
    const kk = 1 - Math.exp(-dt * 3);
    const p = S && !S.view ? g.storyP() : 0.3;
    // ---- 晃：越往后浪越大；大浪来的时候猛地歪一下 ----
    this._rollK = lerp(this._rollK || 1, 1 + p * 0.45, kk);
    this._kickV = (this._kickV || 0) * Math.exp(-dt * 0.6);
    this._kick = lerp(this._kick || 0, this._kickV * Math.sin(t * 1.4), 1 - Math.exp(-dt * 4));
    const roll = SHIP_MOTION.roll(t, this._rollK) + this._kick, pitch = SHIP_MOTION.pitch(t, this._rollK);
    const dRoll = roll - this.roll;
    this.roll = roll; this.pitch = pitch;
    // ---- 地上的积水：水面永远是平的——屋子歪了，水就淌到低的那边 ----
    W.mesh.position.y = SH.h;
    W.mesh.rotation.set(pitch, 0, roll);
    W.mat.opacity = lerp(0.52, 0.84, clamp(SH.h / DRAIN[0], 0, 1));
    W.normal.offset.set(t * 0.012 + roll * 0.4, t * 0.02);
    const waterY = (x, z) => SH.h + x * Math.tan(roll) - (z - W.zc) * Math.tan(pitch);
    // 漂着的东西：跟着水往低处漂；水抽干了就躺在地上
    for (const f of R.floaters) {
      f.x = clamp(f.x + roll * dt * 1.6, -0.7, 0.7);
      const wy = waterY(f.x, f.z);
      const y = Math.max(0.012, wy + Math.sin(t * 2 + f.ph) * 0.004);
      f.o.position.set(f.x, y + (f.lie ? 0.035 : 0), f.z);
      f.o.rotation.set(wy > 0.02 ? Math.sin(t * 1.3 + f.ph) * 0.08 + pitch : 0, f.ph + t * 0.05 * (wy > 0.02 ? 1 : 0), (f.lie ? Math.PI / 2 : 0) + (wy > 0.02 ? roll : 0));
    }
    // ---- 马灯：跟着重力方向摆（阻尼单摆），灯光也跟着走 ----
    const Ln = R.lantern, w0 = 17; // ω² = g / L
    for (let s = 0, n = Math.max(1, Math.ceil(dt / 0.008)); s < n; s++) {
      const h = dt / n;
      Ln.vel.z += (-w0 * (Ln.ang.z - roll) - 0.7 * Ln.vel.z) * h;
      Ln.vel.x += (-w0 * (Ln.ang.x - pitch) - 0.7 * Ln.vel.x) * h;
      Ln.ang.z += Ln.vel.z * h; Ln.ang.x += Ln.vel.x * h;
    }
    Ln.piv.rotation.set(Ln.ang.x, 0, Ln.ang.z);
    const fl = 0.86 + Math.sin(t * 11) * 0.05 + Math.sin(t * 23 + 1) * 0.04 + (Math.random() - 0.5) * 0.05;
    Ln.light.intensity = 2.4 * fl;
    Ln.flame.scale.set(1, 2.2 * fl, 1);
    Ln.flameM.color.setRGB(2.4 * fl, 1.35 * fl, 0.5 * fl);
    // ---- 海图桌上的扳手：歪到一定程度就滑，撞到桌子两头"当"一声 ----
    const Wr = R.wrench;
    if (!Wr.taken) {
      const a = 9.8 * Math.sin(roll);
      if (Math.abs(Wr.v) < 0.02 && Math.abs(roll) < 0.028) Wr.v = 0;
      else Wr.v += (a - Math.sign(Wr.v || a) * 9.8 * 0.022) * dt;
      Wr.x += Wr.v * dt;
      if (Wr.x > 0.7 || Wr.x < -0.72) {
        if (Math.abs(Wr.v) > 0.2 && g.camera.position.distanceTo(Wr.group.position) < 6) g.audio.clankMetal(Math.min(1, Math.abs(Wr.v)));
        Wr.x = clamp(Wr.x, -0.72, 0.7); Wr.v *= -0.2;
      }
      Wr.group.position.x = Wr.x;
      Wr.group.rotation.y = 0.15 + Wr.x * 0.12;
    }
    // ---- 灯塔：每 12 秒闪一组 N 下 ----
    const N = S ? S.digits[0] : 3;
    this._lhT = ((this._lhT || 0) + dt);
    if (this._lhT > LH_CYCLE) this._lhT -= LH_CYCLE;
    let flash = 0;
    for (let i = 0; i < N; i++) { const u = this._lhT - 1.0 - i * LH_GAP; if (u > 0 && u < 0.4) flash = Math.max(flash, smoothstep(0, 0.05, u) * (1 - smoothstep(0.12, 0.38, u))); }
    this._flash = flash;
    const dawn = smoothstep(0.35, 1.0, p) * 0.85;
    R.sea.update(dt, t, roll, pitch, flash, dawn);
    // ---- 月光：只从打开了铁盖的舷窗透进来（墙和铁盖都投影，地上是一个个圆光斑）；灯塔一闪，那一束猛地一亮 ----
    const nOpen = R.portholes.reduce((a, P) => a + (P.open ? 1 : Math.max(0, -P.hinge.rotation.y / 1.95)), 0);
    L.sun.intensity = nOpen > 0.01 ? 0.75 + flash * 3.2 : 0;
    L.sun.color.setRGB(0.66 + flash * 0.34, 0.74 + flash * 0.2, 0.85 - flash * 0.05);
    L.winLight.intensity = nOpen * (0.25 + flash * 0.6);
    // ---- 舱顶灯（开关）----
    const on = (S && S.f.lightsOn) || g.lightMode === 'end';
    g.light.spot = lerp(g.light.spot, on ? 4.6 : 0, 1 - Math.exp(-dt * 8));
    let spotV = g.light.spot;
    if (g.light.flicker > 0) { g.light.flicker -= dt; spotV *= Math.random() < 0.55 ? 1 : 0.1; }
    else if (on && Math.random() < dt * 0.08) g.light.flicker = 0.12; // 发电机不太稳，偶尔闪一下
    L.ceilSpots.forEach((s) => (s.intensity = spotV));
    R.shipLights.bulbM.emissiveIntensity = (spotV / 4.6) * 2.2;
    L.hemi.intensity = lerp(L.hemi.intensity, 0.25 + (on ? 0.1 : 0) + nOpen * 0.03 + dawn * 0.05, kk);
    g.scene.environmentIntensity = 0.08 + (on ? 0.05 : 0) + nOpen * 0.015;
    L.wc.intensity = 2.2 * (Math.sin(t * 13) > 0.96 ? 0.35 : 1);
    // ---- 电报台 ----
    const Rd = R.radio;
    Rd.warm = Rd.on ? Math.min(1, Rd.warm + dt / 2.4) : Math.max(0, Rd.warm - dt / 1.2);
    Rd.tubeM.emissiveIntensity = Rd.warm * 2.2 * (0.95 + Math.random() * 0.05);
    Rd.dialM.emissiveIntensity = Rd.warm * 1.6;
    Rd.eyeM.emissiveIntensity = Rd.warm * (R.antenna.connected ? 1.4 + (this._radioBusy ? Math.sin(t * 30) * 0.4 : 0) : 0.35);
    Rd.needle.position.x = -0.1 + Math.sin(t * 0.3) * 0.004 * Rd.warm;
    L.monLight.intensity = Rd.warm * 0.55;
    // ---- 舷窗玻璃上的水帘慢慢淌完 ----
    for (const u of R.portGlass) { u.uTime.value = t; u.uWash.value = Math.max(0, u.uWash.value - dt * 0.35); }
    // ---- 漏水的法兰 ----
    if (R.leak.on && Math.random() < dt * 14) g.fx.emit('drop', R.leak.pos, { count: 1, speed: 0.4, spread: 0.6, up: -0.2, gravity: -7, drag: 0.2, life: 0.7, size: 0.02, colors: ['#a8c0cc'] });
    g._updateDust(dt, 0.3);
    const active = g.state === 'play' || g.state === 'cut' || g.state === 'intro' || g.state === 'outro';
    if (!active) return;
    // ---- 人跟着歪：在屋子的坐标里重力歪了，人站直 = 相对屋子往低的那边歪 ----
    const ch = g.ch.root;
    ch.rotation.set(0, g.ctrl.charYaw, 0);
    _q.setFromEuler(_e.set(pitch * 0.6, 0, roll * 0.6, 'XYZ'));
    ch.quaternion.premultiply(_q);
    // ---- 声音：船壳吱呀、水"哗啦"地晃过去、时不时一个浪打在船头 ----
    this._creakT -= dt;
    if (this._creakT <= 0) { this._creakT = 3 + Math.random() * 5; g.audio.creak(); }
    const sgn = Math.sign(dRoll);
    if (sgn && sgn !== this._sloshSign) { this._sloshSign = sgn; if (SH.h > 0.02) g.audio.slosh(0.35 + Math.abs(roll) * 6); }
    this._boomT -= dt;
    if (this._boomT <= 0) { this._boomT = 9 + Math.random() * 12; g.audio.hullBoom(0.4 + Math.random() * 0.3); if (Math.random() < 0.4) for (const u of R.portGlass) u.uWash.value = Math.max(u.uWash.value, 0.6); }
    // ---- 踩水：人在水里走，脚下溅起水花 ----
    const pos = g.ctrl.pos;
    if (this._lastPos) {
      const d = Math.hypot(pos.x - this._lastPos.x, pos.z - this._lastPos.z);
      this._splashD += d;
      if (this._splashD > 0.42) {
        this._splashD = 0;
        const depth = waterY(pos.x, pos.z);
        if (depth > 0.012) g.fx.emit('drop', V(pos.x, depth, pos.z), { count: 4, speed: 0.5, spread: 1.0, up: 0.8, gravity: -6, drag: 0.3, life: 0.5, size: 0.022, colors: ['#9ab4c0', '#c8d8e0'] });
      }
      this._lastPos.copy(pos);
    } else this._lastPos = pos.clone();
    g.audio.stepKind = waterY(pos.x, pos.z) > 0.012 ? 'water' : 'metal';
  },
  // 渲染之前：镜头跟着人一起歪一点（人的脑袋会下意识地找水平，但找不全）
  preRender(g) {
    const cam = g.camera;
    if (this._rolledQ && cam.quaternion.equals(this._rolledQ)) cam.quaternion.copy(this._baseQ);
    if (!(g.state === 'play' || g.state === 'cut' || g.state === 'outro' || g.state === 'intro')) { this._rolledQ = null; return; }
    this._baseQ.copy(cam.quaternion);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _up.set(-Math.sin(this.roll) * 0.45, 1, Math.sin(this.pitch) * 0.45).normalize();
    cam.up.copy(_up);
    cam.lookAt(_t.copy(cam.position).add(_f));
    cam.up.set(0, 1, 0);
    this._rolledQ = (this._rolledQ || new THREE.Quaternion()).copy(cam.quaternion);
  },
};
