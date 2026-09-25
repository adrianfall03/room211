// 第二章：废弃的 211（黄昏 17:30，天色越来越暗，但不会真的黑透）
//   日记（未来的自己写的）→ ① 拉电闸，老显示器的雪花屏里闪出数字 → ② 找块布擦干净穿衣镜，口红写的数字
//   → ③ 数洗手间窗外枯树上的乌鸦 → 铁链挂锁 3 位密码
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TR from '../core/tex_ruin.js';
import { lerp, easeOut, easeInOut } from '../core/util.js';

const _c = new THREE.Color(), _c2 = new THREE.Color();
const CN = '一二三四五六七八九';

export const CH2 = {
  n: 2, theme: 'ruin',
  title: '第二章 · 废弃的 211', sub: '17:30 · 三十年后的黄昏', tag: '第二章 · 废弃的 211',
  clock: [17, 30], lockName: '挂锁', codeLen: 3, codeIcons: ['①', '②', '③'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['sheet', 'tally'],
  items: {
    towel: { icon: '🧻', name: '旧毛巾', desc: '硬得像纸板一样的旧毛巾，凑合能擦东西' },
  },

  init(g) {
    const S = g.S, R = g.refs;
    S.digits[2] = 2 + Math.floor(g.rnd() * 8); // 乌鸦至少两只
    R.outside.setCrows(S.digits[2]);
    TR.drawLipstick(R.grime.lipCanvas, S.digits[1]);
    R.grime.lipTex.needsUpdate = true;
    TX.drawCalendar(R.calendar.canvas, { year: 2056, month: S.month, day: S.day });
    const cc = R.calendar.canvas.getContext('2d');
    cc.fillStyle = 'rgba(120,90,50,0.35)'; cc.fillRect(0, 0, R.calendar.canvas.width, R.calendar.canvas.height);
    R.calendar.tex.needsUpdate = true;
    drawPhoto(R.photo.canvas, S);
    R.photo.tex.needsUpdate = true;
    R.drip.onDrip = () => { if (g.camera.position.distanceTo(new THREE.Vector3(R.drip.x, 1, R.drip.z)) < 5) g.audio.drip(); };
    g.scene.fog = new THREE.FogExp2('#3a2a24', 0.045);
    g.lightMode = 'game';
    this._flick = 0; this._eventT = 12; this._crtT = 0;
  },

  // ---------- 进门过场：从门口的光里走进来，门在身后"砰"地关上，铁链自己又缠了回去 ----------
  portal: 'vortex',
  lockView: { cam: new THREE.Vector3(-0.9, 1.1, 3.25), look: new THREE.Vector3(-1.62, 0.66, 3.68) },
  relockLine: '……铁链自己缠回去了？！又锁上了！',
  intro(g, { prepare }) {
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    g.after(T, () => g.ui.subtitle('……？我不是刚冲出门了吗？', 2.4, g.S.name));
    g.after(T + 0.8, () => { g._cutPose = { lookYaw: -0.5, lookPitch: 0.2 }; g._cineTo(new THREE.Vector3(-1.1, 1.75, 4.1), new THREE.Vector3(0.6, 1.1, -2.2), 2.2); g.audio.caw(0.8); });
    g.after(T + 2.6, () => g.ui.subtitle('这是……211？怎么破成这个样子了？', 2.6, g.S.name));
    g.after(T + 4.4, () => { g._cutPose = { lookYaw: 0.4, lookPitch: 0.35 }; g._cineTo(new THREE.Vector3(0.2, 1.7, 2.6), new THREE.Vector3(1.22, 2.25, 4.5), 1.6); });
    g.after(T + 5.2, () => { g.ui.subtitle('墙上的钟……停在了 7:59。', 2.4, g.S.name); g.audio.creak(); });
    g.after(T + 7.0, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 8.2, () => g.beginPlay());
  },
  onSlam(g) {
    g.fx.emit('dust', new THREE.Vector3(-1.75, 1.4, 4.0), { count: 20, speed: 0.5, spread: 1.0, up: 0.2, gravity: -0.05, drag: 1.5, life: 2.0, size: 0.18, colors: ['#8a7a60', '#6a5a48'], spin: 0.5, grow: 1.0 });
  },
  // 门锁：'hide' 先藏起来 / 'anim' 铁链"哗啦"一下缠回门把手、挂锁从上面落下来"咔"地扣上 / 'show' 直接锁好
  relock(g, mode) {
    const C = g.refs.chain, pl = C.padlock;
    if (!pl.userData.home) pl.userData.home = pl.position.clone();
    const home = pl.userData.home;
    C.dropped.visible = false;
    if (mode === 'hide') { C.group.visible = false; g.collision.setEnabled('lockCable', false); return; }
    C.group.visible = true; g.collision.setEnabled('lockCable', true);
    pl.position.copy(home); pl.rotation.z = 0;
    if (mode !== 'anim') return;
    g.audio.chainDrop();
    // 铁链闪两下现身（像被看不见的手缠上去一样），挂锁从半空落下、弹一下
    let n = 0;
    const blink = () => { C.group.visible = !C.group.visible || n >= 4; if (++n <= 4) g.after(0.06, blink); };
    blink();
    g.tween(0.45, (k) => { pl.position.y = home.y + 0.4 * (1 - k) * (1 - k) - Math.sin(k * Math.PI) * 0.02; pl.rotation.z = (1 - k) * 0.9; }, { ease: (t) => t, done: () => { g.audio.clunk(); g._shake(0.1); } }).cut = true;
    g.fx.emit('dust', home.clone(), { count: 8, speed: 0.3, spread: 1, up: 0.3, gravity: -0.1, drag: 1.5, life: 1.2, size: 0.05, colors: ['#8a7a60'], grow: 0.5 });
  },
  onPlay(g) {
    g.ui.toast('第二章 · 趁着天还没黑，逃出废弃的 211', '', '🌆');
    g.after(1.2, () => g.ui.subtitle('书桌上那本发黄的本子……好像是日记？', 3.6, g.S.name));
  },
  exitLine: () => '走！离开这个鬼地方！',
  // 出门时颜色一点点回来：老胶片滤镜褪掉，门口是一个紫色的时空漩涡（portal: 'vortex'）
  onDoorOpen(g) { g.gfx.grade.set('normal'); },

  // ---------- 目标 / 提示 ----------
  objectives(g) {
    const S = g.S, f = S.f, n = S.found.filter(Boolean).length;
    if (!f.readDiary) return [{ text: '看看书桌上那本发黄的日记', done: false }];
    return [
      { text: '拉下门边的电闸', done: !!f.power },
      { text: `集齐挂锁密码 ${n}/3`, done: n === 3 },
      { text: f.unlocked ? '出门！' : '打开门上的铁链挂锁', done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found;
    if (!f.readDiary) return '你的书桌上有本发黄的日记，先读一读。';
    if (!F[0]) {
      if (!f.power) return '门边墙上（原来电灯开关的位置）有个旧电闸，拉下来通电。';
      return '老式显示器亮了，凑近看看雪花屏里闪出来的数字。';
    }
    if (!F[1]) {
      if (!f.wiped && !S.inv.includes('towel')) return '穿衣镜太脏了，用手擦不掉。洗手间绳子上挂着几条旧毛巾。';
      return '拿着毛巾去擦洗手间门旁边的穿衣镜。';
    }
    if (!F[2]) return '去洗手间，对着窗户按 E 看看窗外——数数枯树上站了几只乌鸦。';
    return `密码凑齐了！去门口，按①②③的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S;
    if (p > 0.5 && !S.msgSent.half) { S.msgSent.half = true; g.say('天越来越暗了……', 3); }
    if (p > 0.8 && !S.msgSent.dark) { S.msgSent.dark = true; g.say('外面快全黑了！', 2.6); g.audio.caw(0.7); }
  },
  clockHands(g) { return { h: 7, m: 59, s: 58 + (Math.sin(g.time * 7) > 0.6 ? 1 : 0) }; },

  // ---------- 交互 ----------
  handlers(g) {
    const H = {};
    const flav = (label, text, verb = '查看') => ({ label: () => g._fill(label), verb, reach: false, act: () => g.say(g._fill(text), 3.8) });
    const F = {
      pinkBag: ['粉色纸袋', '纸袋早就烂成了渣，一碰就碎。'],
      foldTable: ['折叠桌', '门边的折叠桌，桌腿上拴着铁链，桌面上一层厚灰。'],
      broom: ['扫把', '扫把头的毛掉光了……这屋子扫三天也扫不干净。'],
      blackTable: ['杂物桌', '泡面桶里长出了蘑菇。三十年的泡面，谁敢吃？'],
      bedW1: ['{A}的床', '{A}的床……床垫塌了一个大坑，碎花被褪成了土黄色。'],
      bedW2: ['{B}的床', '{B}的床，蚊帐破成了渔网。'],
      shelf: ['书架', '书架歪了，书都泡过水，一页一页粘在一起。'],
      shoeRack: ['鞋架', '鞋架上的鞋全长了白毛。'],
      storageBox: ['收纳箱', '收纳箱的盖子裂了，里面的衣服成了老鼠窝。'],
      polkaBag: ['收纳袋', '收纳袋被老鼠咬了好几个洞。'],
      box350: ['纸箱', '纸箱受潮塌成了一滩。'],
      bedE1: ['我的床', '我的床。床帘烂得只剩一半……床头刻着一行小字：“别睡了，快跑”。'],
      patternRoll: ['凉席卷', '卷起来的凉席，已经硬成了一根棍子。'],
      bedE2: ['{C}的床', '{C}的床，粉色床帘褪成了灰白色。'],
      farDesks: ['窗边书桌', '窗边的书桌，台灯不见了，只剩一台旧收音机。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子褪成了一块破布。'],
      toteBag: ['红色袋子', '红白袋子被老鼠啃出了一个洞。'],
      redBag: ['红色收纳包', '收纳包拉链锈死了。'],
      paper: ['复习资料', '复习资料黄得发脆……“高等数学（下）”，三十年了还没考过。'],
      mouse: ['鼠标', '鼠标线被老鼠咬断了。'],
      pcTower: ['主机', '主机箱锈穿了一个洞，里面住着一窝蜘蛛。'],
      stoolMe: ['我的凳子', '坐上去嘎吱响，好像随时会散架。'],
      keyboard: ['键盘', '键盘上积了一层灰，只有 W A S D 四个键磨得发亮。'],
      phone: ['手机', '我的手机……屏幕碎成了蜘蛛网，按了没反应。'],
      apple: ['苹果', '一个烂成化石的苹果。……不了不了。'],
      drawer: ['抽屉', '抽屉锈死了，拉不开。'],
      suitcase: ['行李箱', '行李箱的密码锁锈死了，转都转不动。'],
      helmet: ['红白头盔', '我的红白头盔滚在地上……里面爬出来一只蜘蛛。算了算了。'],
      stoolH: ['木凳', '凳子倒在地上，断了一条腿。'],
      ac: ['空调', '空调的导风板掉了一半，里面塞满了鸟窝。'],
      basket: ['脏衣篓', '脏衣篓里的袜子已经变成化石了。'],
      curtain: ['窗帘', '窗帘一碰就往下掉灰，破得跟渔网一样。'],
      window: ['窗户', '窗户被人用木板钉死了，木板缝里漏进来一道道夕阳。'],
      roster: ['值日表', '值日表的字早就褪没了，只看得清一句：“考完再说！”'],
      clock: ['挂钟', '挂钟停在了 7:59……秒针在原地一抽一抽的。'],
      wcMirror: ['镜子', '洗手间的镜子裂成了好几块，照出来好多个你。'],
      shower: ['花洒', '花洒长满了水垢，拧一下只掉下来几块锈渣。'],
      graffiti: ['隔板涂鸦', '隔板上的涂鸦还在：“窗外有猴!!”……现在窗外只剩乌鸦了。'],
      wcBucket: ['水桶和拖把', '水桶里积着半桶黑水，拖把头早就烂没了。'],
      bin: ['垃圾桶', '垃圾桶满到盖不上……三十年了，还是没人倒。'],
      remote: ['空调遥控器', '遥控器的电池漏液了，糊了一手绿锈。'],
      strip: ['插线板', '插线板烧黑了一块。'],
      folder: ['文件夹', '《高数重点——{C}倾情整理》……纸都粘成一坨了。'],
      calendar: ['台历', ''],
      tally: ['墙上的刻痕', '墙上刻满了“正”字……数了一下，正好三十年。下面写着：“第 30 年 · 还在重修”。'],
      poster: ['旧海报', '“峡谷之巅 · 2026 全国总决赛”，海报撕了一个角。那一年……我好像就是为了看这个通宵的。'],
      newspaper: ['旧报纸', '《校园晚报》2056 年 6 月 18 日：“老宿舍楼 211 即将拆除……该宿舍频繁出现‘有人在屋里找了三十年门锁密码’的传闻。”'],
      towelsTaken: ['毛巾', '剩下的毛巾都烂成布条了。'],
      fallenBooks: ['地上的书', '书架前的地上躺着三本书，《高等数学（下）》烂得只剩封皮……三十年了，谁也没把它们捡起来。'],
    };
    for (const [id, [l, t]] of Object.entries(F)) H[id] = flav(l, t);
    H.calendar = { label: '台历', verb: '查看', act: () => {
      const S = g.S;
      g.audio.paper();
      const c = TX.makeCanvas(512, 440);
      c.getContext('2d').drawImage(g.refs.calendar.canvas, 0, 0);
      const node = g.ui.doc({ variant: 'plain', title: '发黄的台历', html: `<div>台历停在了 <b>2056 年 ${S.month} 月 ${S.day} 日</b>……红圈还在，旁边多了一行小字：“第 30 次补考”。</div>` });
      node.querySelector('.content').appendChild(c); c.style.width = '100%';
      g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    } };
    H.diary = { label: '旧日记', verb: '阅读', act: () => this.readDiary(g) };
    H.fuse = { label: '电闸', verb: () => (g.S.f.power ? '查看' : '拉下电闸'), act: () => this.pullFuse(g) };
    H.crt = { label: '老式显示器', verb: () => (g.S.f.power ? '凑近看' : '查看'), act: () => this.lookCRT(g) };
    H.mirror = { label: '穿衣镜', verb: () => (g.S.f.wiped ? '照镜子' : g.S.inv.includes('towel') ? '用毛巾擦' : '擦一擦'), reach: true, act: () => this.wipeMirror(g) };
    H.towels = { label: '毛巾', verb: () => (g.S.f.towel ? '查看' : '拿一条'), act: () => {
      if (g.S.f.towel) { g.say('剩下的毛巾都烂成布条了。'); return; }
      g.give('towel');
      g.say('一条硬得像纸板一样的旧毛巾……凑合能用。', 3);
    } };
    H.sheet = { label: '白布', verb: '掀开', act: () => this.pullSheet(g) };
    H.photo = { label: '旧照片', verb: '看看', act: () => this.showPhoto(g) };
    H.radio = { label: '旧收音机', verb: '拧开', act: () => this.playRadio(g) };
    H.rat = { label: '老鼠', verb: '摸一下？', reach: false, act: () => {
      g.refs.rat.spook(); g.audio.squeak();
      g.S.ach.add('rat');
      g.say(g.S.f.rat ? '“考拉”又溜了。' : '吱——！是日记里说的那只叫“考拉”的老鼠！', 3);
      g.S.f.rat = true;
    } };
    H.door = { label: '铁链挂锁', verb: () => (g.S.f.unlocked ? '出门' : '开锁'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '洗手间门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => { g.toggleWcDoor(); if (g.refs.wcDoor.open) g.audio.creak(); } };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '拧开龙头', act: () => {
      const R = g.refs;
      if (g._washing) return;
      g._washing = true;
      R.sink.streams.forEach((w) => { w.visible = true; w.material.color.set('#8a6a3a'); w.material.emissive.set('#3a2a10'); });
      g.audio.water(2);
      g.after(2, () => { R.sink.streams.forEach((w) => (w.visible = false)); g._washing = false; });
      g.say('哗——流出来的全是黄泥汤……', 2.6);
    } };
    H.toilet = { label: '厕所', verb: '冲水', act: () => { g.audio.flush(); g.say('咕噜咕噜……冲上来一股说不出的味道。还是别冲了。', 3); } };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => this.lookOutside(g) };
    return H;
  },

  readDiary(g) {
    const S = g.S;
    g.audio.paper();
    const node = g.ui.doc({
      variant: 'diary', title: '',
      html: `<div class="date">2056 年 6 月 18 日　阴</div>
        如果你正在看这本日记——恭喜，你也被困住了。<br>
        我是三十年后的你。那天早上我没能冲出宿舍，<br>后来的事……你不会想知道的（重修了三十年）。<br><br>
        门被一条铁链锁住了，挂锁是 <span class="red">3 位数字</span>：<br>
        ① 电来了，<b>雪花屏</b>里会闪出第一个数；<br>
        ② 镜子太脏了，<b>擦干净穿衣镜</b>，第二个数就在上面；<br>
        ③ 洗手间窗外那棵老树上站着几只<b>乌鸦</b>，那就是最后一个数。<br><br>
        一定要在<span class="red">天黑之前</span>出去。天黑以后……这里会黑得什么也看不见。
        <div class="sig">—— 未来的 ${S.name}<br><small>P.S. 墙角那只老鼠叫“考拉”，别怕它。</small></div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.readDiary) {
      S.f.readDiary = true;
      S.ach.add('diary');
      g.clue('diary', '未来的自己的日记：挂锁 3 位数。①通电后的雪花屏　②擦干净穿衣镜　③洗手间窗外树上的乌鸦数量。');
      g.after(0.4, () => g.say('三十年后的我……重修了三十年？！不行，天黑前必须出去！', 3.8));
    }
  },

  pullFuse(g) {
    const S = g.S, R = g.refs;
    if (S.f.power) { g.say('电闸已经合上了，箱子里嗡嗡作响。'); return; }
    S.f.power = true;
    const lev = R.fuse.lever;
    g.tween(0.35, (k) => (lev.rotation.x = lerp(0.9, -0.55, k)), { ease: easeOut });
    g.after(0.3, () => {
      g.audio.clunk(); g.audio.spark(); g._shake(0.12);
      const p = R.fuse.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.1, 0, 0));
      g.fx.emit('spark', p, { count: 36, speed: 1.6, spread: 1.4, up: 0.8, gravity: -6, drag: 1.2, life: 0.8, size: 0.05, colors: ['#ffe8a0', '#ffb040', '#ffffff'], spin: 0 });
      R.fuse.lamp.emissiveIntensity = 2.5;
      this._flick = 1.6;
      g.audio.startLoop('buzz', { osc: 'sawtooth', freq: 50, gain: 0.004 });
    });
    g.after(1.2, () => {
      R.crt.on = true; R.crt.led.emissiveIntensity = 2;
      g.audio.bootChime();
    });
    g.say('滋啦——！灯泡闪了几下，亮了！', 3);
    g.after(2.4, () => g.say('桌上那台老显示器也亮了……全是雪花。', 3));
    g.clue('power', '拉下电闸，屋里<b>通电</b>了：灯泡和老显示器都亮了。');
  },

  lookCRT(g) {
    const S = g.S, R = g.refs;
    if (!S.f.power) { g.say('一台老掉牙的大屁股显示器，插着电却没反应……这屋子没电？', 3.6); g.clue('crt', '书桌上的老显示器<b>没电</b>。'); return; }
    g.audio.noise({ dur: 1.2, gain: 0.08, type: 'highpass', freq: 3000 });
    const c = TX.makeCanvas(512, 384);
    TR.drawCRT(c, { on: true, digit: S.digits[0], t: g.time, reveal: 1 });
    const node = g.ui.doc({ variant: 'plain', title: '雪花屏', html: '<div>盯着雪花看了一会儿……一个数字慢慢浮了出来。</div>' });
    node.querySelector('.content').appendChild(c); c.style.width = '100%'; c.style.borderRadius = '18px';
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    g.after(0.4, () => g.foundDigit(0, '老显示器的雪花屏'));
  },

  wipeMirror(g) {
    const S = g.S, R = g.refs;
    if (S.f.wiped) {
      g.ch.setExpression('grin', 2);
      g.say(['镜子里的人……还是你，没变老。还来得及！', '口红写的“②' + S.digits[1] + '”还在镜子上。', '别照了，天要黑了！'][(g._mirrorN = (g._mirrorN || 0) + 1) % 3], 3);
      return;
    }
    if (!S.inv.includes('towel')) {
      g.say('镜子上糊了厚厚一层灰和油污，用手根本擦不掉……找块布？', 3.4);
      g.clue('mirror', '穿衣镜上糊着一层油泥，得<b>找块布</b>来擦。');
      return;
    }
    if (g._wiping) return;
    g._wiping = true;
    g.take('towel');
    g.audio.wipe();
    R.grime.lip.visible = true;
    const gc = R.grime.canvas, ctx = gc.getContext('2d'), W = gc.width, Hh = gc.height;
    let last = 0;
    g.tween(1.6, (k) => {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (let t = last; t <= k; t += 0.004) {
        const y = Hh * (0.08 + t * 0.84), x = W * (0.5 + Math.sin(t * 38) * 0.42);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 34);
        gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - 34, y - 34, 68, 68);
      }
      ctx.restore();
      last = k;
      R.grime.tex.needsUpdate = true;
    }, { ease: (t) => t, done: () => {
      g._wiping = false;
      R.grime.mesh.material.opacity = 0.35;
      S.f.wiped = true;
      g.say(`镜子上用口红写着：“②  ${S.digits[1]}”……还画了个心？`, 3.6);
      g.after(0.3, () => g.foundDigit(1, '穿衣镜上的口红字'));
    } });
    const p = R.mirrorG.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, -0.1));
    g.fx.emit('dust', p, { count: 22, speed: 0.4, spread: 1, up: 0.3, gravity: -0.1, drag: 1.5, life: 2, size: 0.18, colors: ['#8a7a60'], grow: 1 });
  },

  pullSheet(g) {
    const S = g.S, R = g.refs;
    if (S.f.sheet) return;
    S.f.sheet = true;
    const sh = R.sheet;
    g.audio.poof();
    const p0 = sh.position.clone();
    g.tween(0.9, (k) => { sh.position.set(p0.x - k * 0.9, p0.y + Math.sin(k * Math.PI) * 0.5, p0.z + k * 0.1); sh.rotation.z = k * 0.9; sh.scale.set(1 - k * 0.3, 1 - k * 0.8, 1 - k * 0.2); }, { ease: easeInOut, done: () => { sh.visible = false; } });
    g.fx.emit('dust', new THREE.Vector3(1.5, 1.0, -0.8), { count: 50, speed: 0.9, spread: 1.4, up: 0.5, gravity: -0.05, drag: 1.3, life: 3, size: 0.35, colors: ['#9a8a70', '#7a6a58', '#b8a888'], grow: 1.4 });
    R.photo.group.visible = true;
    R.monitor2.visible = true; R.headset.visible = true;
    g._collectRayTargets();
    g.say('咳咳咳……白布底下是{C}的书桌。桌上还立着一个相框。'.replace('{C}', S.mates[2]), 3.4);
  },
  showPhoto(g) {
    const S = g.S;
    const node = g.ui.doc({ variant: 'plain', title: '211 合照 · 2026', html: `<div>照片背面写着：“211 永远滴神！——${S.mates.join('、')}、${S.name}”<br>那年夏天，四个人都还在。</div>` });
    const img = document.createElement('img');
    img.src = g.refs.photo.canvas.toDataURL('image/png');
    node.querySelector('.content').appendChild(img);
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    S.ach.add('photo');
  },
  playRadio(g) {
    if (g._radioT && g.time - g._radioT < 6.5) { g.say('收音机还在沙沙地唱着……'); return; }
    g._radioT = g.time;
    g.audio.radio(6);
    const p = g.refs.radio.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0));
    for (let k = 0; k < 5; k++) g.after(k * 1.1, () => g.fx.emit('note', p, { count: 2, speed: 0.3, spread: 0.6, up: 0.6, gravity: 0.1, drag: 0.5, life: 2.2, size: 0.09, colors: ['#e8d8a0', '#ffd080'], spin: 1, sway: 0.2 }));
    g.S.ach.add('radio');
    g.say('沙沙……收音机里飘出一段老歌，“……那些年错过的考试……”', 3.6);
  },

  // ③：镜头拉到窗外，一只一只数乌鸦
  lookOutside(g) {
    const S = g.S, O = g.refs.outside;
    if (this._counting) return;
    O.trigger(S.found[2] ? 3 : 1.2 + S.digits[2] * 0.6);
    g.audio.caw();
    if (S.found[2]) { g.say(`枯树上还是那 ${S.digits[2]} 只乌鸦，一动不动地盯着你。`, 3); return; }
    this._counting = true;
    const mid = O.branch.a.clone().lerp(O.branch.b, 0.5);
    g._cineTo(new THREE.Vector3(-0.18, 1.62, 6.12), new THREE.Vector3(mid.x + 0.1, mid.y + 0.05, mid.z), 1.0);
    g.say('老树上站着一排乌鸦……数一数：', 1.4);
    const n = S.digits[2];
    const vis = O.crows.filter((c) => c.root.visible).sort((a, b) => b.root.position.x - a.root.position.x);
    vis.forEach((c, i) => g.after(1.3 + i * 0.6, () => { c.caw = 1; c.flap = 0.6; g.audio.caw(1 + i * 0.05); g.ui.subtitle(`${CN[i]}……`, 0.6, g.S.name); }));
    g.after(1.5 + n * 0.6, () => {
      g.say(`一共 ${n} 只乌鸦！`, 2.6);
      g.foundDigit(2, '窗外枯树上的乌鸦');
      g.clue('crow', `洗手间窗外的枯树上站着 <b>${n}</b> 只乌鸦。`);
    });
    g.after(2.6 + n * 0.6, () => { g._cineTo(null, null, 1.0); this._counting = false; });
  },

  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.lockedRattle();
      g.say('门把手被一条生锈的铁链拴在桌腿上，挂着一把老式密码挂锁……', 3.4);
      g.clue('door', '门被<b>铁链</b>锁住了，挂锁是 <b>3 位数字</b>。');
      g.after(1.4, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '生锈的密码挂锁', variant: 'rusty', labels: ['①', '②', '③'],
      hint: S.found.some(Boolean) ? `已知线索：<b>${known}</b>` : '日记里说：雪花屏、穿衣镜、乌鸦……',
      onTick: () => g.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  },
  // 鉴赏模式：开局就把锁整个拿掉
  removeLock(g) { const C = g.refs.chain; C.group.visible = false; C.dropped.visible = false; },
  unlockVisual(g) {
    const C = g.refs.chain;
    g.collision.setEnabled('lockCable', false);
    C.group.visible = false; C.dropped.visible = true;
  },
  unlock(g) {
    const S = g.S, C = g.refs.chain;
    S.f.unlocked = true;
    const pl = C.padlock, y0 = pl.position.y;
    g.tween(0.5, (k) => { pl.rotation.z = k * 1.2; pl.position.y = y0 - k * 0.5; }, { ease: (t) => t * t, done: () => { this.unlockVisual(g); g.audio.chainDrop(); } });
    g.say('咔——锁开了！铁链哗啦一声掉在地上！', 2.6);
    g.after(1.4, () => g.win());
  },

  update(g, dt) {
    const R = g.refs;
    // CRT 雪花：通电后大约 12 帧/秒刷新
    if (R.crt.on) {
      this._crtT -= dt;
      if (this._crtT <= 0) { this._crtT = 0.08; TR.drawCRT(R.crt.canvas, { on: true, digit: g.S.digits[0], t: g.time }); R.crt.tex.needsUpdate = true; }
    }
    // 偶尔来点"动静"：嘎吱声、远处的乌鸦、灯泡灭一下
    this._eventT -= dt;
    if (this._eventT <= 0) {
      this._eventT = 14 + Math.random() * 16;
      const r = Math.random();
      if (r < 0.35) g.audio.creak();
      else if (r < 0.6) g.audio.caw(0.8 + Math.random() * 0.2);
      else if (g.S.f.power) { this._flick = 0.8; g.audio.noise({ dur: 0.3, gain: 0.08, type: 'highpass', freq: 3000 }); }
      else g.audio.creak();
    }
  },

  // ---------- 灯光：随着时间从黄昏变暗（最暗停在快黑透的样子）----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights;
    const p = g.state !== 'title' ? 0.85 * g.storyP() : 0;
    const kk = 1 - Math.exp(-dt * 3);
    const dusk = Math.pow(1 - p, 0.9);
    L.sun.intensity = lerp(L.sun.intensity, 2.6 * dusk, kk);
    L.sun.color.copy(_c.set('#ffa060').lerp(_c2.set('#b04030'), p));
    L.winLight.intensity = lerp(0.2, 1.8, dusk);
    L.winLight.color.copy(_c.set('#ff9a60').lerp(_c2.set('#3a4a8a'), p));
    L.hemi.intensity = lerp(0.06, 0.34, dusk);
    L.hemi.color.copy(_c.set('#c0a898').lerp(_c2.set('#40486a'), p));
    g.scene.environmentIntensity = lerp(0.03, 0.12, dusk);
    R.shafts.target = 0.075 * Math.pow(dusk, 1.3);
    if (g.scene.fog) { g.scene.fog.color.copy(_c.set('#4a3428').lerp(_c2.set('#0e1018'), p)); g.scene.fog.density = lerp(0.04, 0.07, p); }
    // 灯泡：通电后亮，带随机闪烁
    const B = R.bulb;
    let on = S && S.f.power ? 1 : 0;
    if (on) {
      if (this._flick > 0) { this._flick -= dt; on = Math.random() < 0.5 ? 1 : 0.05; }
      else on = 0.88 + Math.sin(t * 23) * 0.04 + (Math.random() < 0.012 ? -0.6 : 0);
    }
    B.spot.intensity = 7 * on; B.fill.intensity = 0.9 * on; B.mat.emissiveIntensity = 4 * on;
    L.monLight.intensity = R.crt.on ? 0.5 + Math.random() * 0.15 : 0;
    L.wc.intensity = S && S.f.power ? (1.4 + Math.sin(t * 17) * 0.3) * (Math.random() < 0.02 ? 0.1 : 1) : 0.35;
    L.ceilSpots.forEach((s) => (s.intensity = 0));
    L.corridor.intensity = Math.max(0, L.corridor.intensity);
    g._updateDust(dt, 0.4);
  },
};

// 2026 年的合照：四个小人 + 名字
function drawPhoto(c, S) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#a8c8e0'); g.addColorStop(1, '#e8d8b0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c8b898'; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  const names = [...S.mates, S.name];
  const cols = ['#e0853a', '#4a8fe0', '#d9508a', '#39b26a'];
  names.forEach((n, i) => {
    const x = W * (0.16 + i * 0.23), y = H * 0.62;
    ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.roundRect(x - 26, y - 20, 52, 70, 14); ctx.fill();
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 40, 22, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(x, y - 50, 22, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y - 36, 9, 0.2, Math.PI - 0.2); ctx.stroke();
    // 比个耶
    ctx.strokeStyle = '#f0c8a0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 24, y - 10); ctx.lineTo(x + 36, y - 44); ctx.stroke();
    ctx.fillStyle = '#2a1a14'; ctx.font = `bold 15px ${TX.SANS}`; ctx.textAlign = 'center'; ctx.fillText(n.slice(0, 5), x, H * 0.95);
  });
  ctx.fillStyle = '#2a1a14'; ctx.font = `bold 20px ${TX.SANS}`; ctx.textAlign = 'left'; ctx.fillText('211 · 2026.6', 12, 26);
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const l = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
    img.data[i] = l * 1.1 + 20; img.data[i + 1] = l * 0.95 + 10; img.data[i + 2] = l * 0.72;
  }
  ctx.putImageData(img, 0, 0);
}
