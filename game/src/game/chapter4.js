// 第四章：地铁 211（2077 · 地下 60 米 · 末班车早就停了）
//   地面上已经住不了人了，宿舍成了地铁站台边上的一间值班室。室友们戴着防毒面具上地面"捡破烂"去了，把我锁在屋里。
//   门上是一扇气密门，门上的数字密码盘 3 位，刻着 ☢️🚂👻：
//   ☢️ 屋里有五只刷着编号的弹药箱，其中一只里面藏着"热"东西 → 桌上的盖革计数器：离它越近，咔哒声越密 → 那只箱子上的编号
//   🚂 站台的灯坏了，窗外一片漆黑 → 窗边书桌上的手摇发电机，摇满 → 站台的钠灯亮起来：远处那节老车厢上，室友用粉笔画了"正"字（一个"正" = 5）
//   👻 洗手间成了毒气间，里面浮着一团噼啪放电的"异常" → 门边挂着防毒面具（滤罐是空的）→ 新滤罐在某只弹药箱里 → 戴上面具走进去，
//      靠近那团光：灯全灭了，墙上走过去一串人影——数一数有几个
//   手电筒一开始就在身上（F）；故事钟：空气滤网的效率在慢慢往下掉（永远掉不到零）
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, easeOutBack, smoothstep } from '../core/util.js';
import { untoonify } from '../world/toonkit.js';
import * as TM from '../core/tex_metro.js';
import { CRATES, ANOMALY } from '../world/metro.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _d = V();
const CN = '一二三四五六七八九';
const CRANKS = 8; // 手摇发电机摇几圈才亮

export const CH4 = {
  n: 4, theme: 'metro',
  title: '第四章 · 地铁 211', sub: '2077 · 地下 60 米 · 末班车早就停了', tag: '第四章 · 地铁 211',
  clock: [23, 11], lockName: '气密门密码', doorName: '气密门', codeLen: 3, codeIcons: ['☢️', '🚂', '👻'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['crate0', 'crate1', 'crate2', 'crate3', 'crate4', 'sandbags', 'dynamo', 'guitar', 'anomaly', 'metroMap'],
  torchPower: 3.4, // 手电筒比紫光手电亮得多
  items: {
    uv: { icon: '🔦', name: '手电筒', desc: '一支老式手电筒，灯泡发黄。按 F（手机上点「手电」）开关' },
    geiger: { icon: '☢️', name: '盖革计数器', desc: '离"热"东西越近，咔哒声越密。点一下开关' },
    mask: { icon: '😷', name: '防毒面具', desc: '一只旧防毒面具。点一下戴上 / 摘下（得先装上新滤罐）' },
    filter: { icon: '🥫', name: '滤毒罐', desc: '一只新的滤毒罐，封条还没撕。拧到防毒面具上' },
  },

  // 故事钟：空气滤网的效率一点点往下掉；戴着面具的时候显示滤罐还剩多久
  clockText(g) {
    if (this._masked) {
      const s = Math.max(61, Math.round(this._filterT));
      return `滤罐 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    const mm = 11 + g.storyMinutes();
    return `23:${String(mm).padStart(2, '0')} · 空气滤网 ${Math.round(88 - 70 * g.storyP())}%`;
  },

  init(g) {
    const R = g.refs, S = g.S;
    untoonify(g.ch.root);
    // 手电筒：借用紫光手电那盏聚光（换成暖白色、照得更远）
    const U = g.uvLight;
    U.visible = true; U.color.set('#ffeccc'); U.distance = 9; U.angle = 0.5; U.penumbra = 0.55; U.decay = 1.3;
    g.scene.fog = new THREE.FogExp2('#080806', 0.05);
    g.lightMode = 'game';
    S.digits[1] = 1 + Math.floor(g.rnd() * 9); // "正"字至少一笔
    S.digits[2] = 2 + Math.floor(g.rnd() * 6); // 影子 2~7 个
    // 弹药箱：五个互不相同的编号，"热"的那只刷着第一位；其余几只里装着滤罐、罐头、子弹……
    const hot = Math.floor(g.rnd() * 5);
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== S.digits[0]);
    const stuff = ['filter', 'food', 'bullets', 'empty'].sort(() => g.rnd() - 0.5);
    R.crates.forEach((c, i) => {
      c.num = i === hot ? S.digits[0] : pool.splice(Math.floor(g.rnd() * pool.length), 1)[0];
      c.kind = i === hot ? 'hot' : stuff.pop();
      if (c.sideM.map) c.sideM.map.dispose();
      c.sideM.map = TM.genAmmoCrate(c.num); c.sideM.needsUpdate = true;
      this._fillCrate(c);
    });
    this._hot = R.crates[hot];
    TM.drawTally(R.platform.tally.canvas, S.digits[1]);
    R.platform.tally.tex.needsUpdate = true;
    // 状态
    this._geigerOn = false; this._masked = false; this._filterT = 5 * 60; this._breathT = 0; this._coughT = 0;
    this._charge = 0; this._cranking = false; this._K = 0; this._lit = false; this._look = false;
    this._vision = null; this._blackout = 0; this._ring = 0; this._ringT = 0; this._calls = []; this._callNew = null;
    this._ghostT = -1; this._alarmT = 0; this._arcT = 0; this._ratSeen = false; this._dropT = 6;
    g.give('uv', true);
    // 两只灯泡一开始就亮着（一闪一闪的）：第一次试玩几乎全黑，开关还能关掉
    S.f.lightsOn = true; S.f.bulbSeen = true;
    R.switchRocker.rotation.x = -0.12;
    g.audio.stepKind = 'grit';
    g.audio.startTunnel();
    this._makeHud(g);
  },
  // 离开这一章：盖革计数器的读数、防毒面具的遮罩收掉，手电筒换回紫光手电
  leave(g) {
    for (const id of ['geiger', 'gasmask']) { const el = document.getElementById(id); if (el) el.remove(); }
    const U = g.uvLight;
    U.color.set('#7b45ff'); U.distance = 5; U.angle = 0.42; U.penumbra = 0.6; U.decay = 1.2;
    this._masked = false;
  },
  _makeHud(g) {
    for (const id of ['geiger', 'gasmask']) { const el = document.getElementById(id); if (el) el.remove(); }
    const gm = document.createElement('div'); gm.id = 'geiger'; gm.innerHTML = '<span class="gk">☢ DP-5</span><b>0.00</b><span class="gu">μSv/h</span><i><s></s></i>';
    document.body.appendChild(gm);
    const mk = document.createElement('div'); mk.id = 'gasmask'; mk.innerHTML = '<div class="fog"></div>';
    document.body.appendChild(mk);
  },
  _fillCrate(c) {
    const I = c.inside;
    while (I.children.length) I.remove(I.children[0]);
    const m = (geo, mat, o = {}) => { const x = new THREE.Mesh(geo, mat); x.position.set(o.x || 0, o.y || 0, o.z || 0); if (o.rx) x.rotation.x = o.rx; if (o.rz) x.rotation.z = o.rz; return x; };
    if (c.kind === 'hot') {
      // 一只铅盒，盖子缝里透出一点绿光
      I.add(m(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: '#4a4a4c', roughness: 0.5, metalness: 0.7 }), { y: -0.04 }));
      I.add(m(new THREE.BoxGeometry(0.1, 0.004, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 0.8), toneMapped: false }), { y: 0.002 }));
    } else if (c.kind === 'filter') {
      I.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: 0.5, metalness: 0.4 }), { rz: Math.PI / 2, y: -0.06 }));
    } else if (c.kind === 'food') {
      for (let k = 0; k < 3; k++) I.add(m(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 14), new THREE.MeshStandardMaterial({ color: '#8a7a50', roughness: 0.4, metalness: 0.6 }), { x: -0.1 + k * 0.1, y: -0.07 }));
    } else if (c.kind === 'bullets') {
      const bm = new THREE.MeshStandardMaterial({ color: '#b08a3a', roughness: 0.3, metalness: 0.9 });
      for (let k = 0; k < 14; k++) I.add(m(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), bm, { x: -0.12 + (k % 7) * 0.04, y: -0.08, z: -0.03 + Math.floor(k / 7) * 0.05, rz: Math.PI / 2 }));
    } else {
      for (let k = 0; k < 6; k++) I.add(m(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), new THREE.MeshStandardMaterial({ color: '#6a5a3a', roughness: 0.4, metalness: 0.8 }), { x: -0.15 + k * 0.06, y: -0.1, z: (k % 2) * 0.04, rz: 1.2 }));
    }
    I.traverse((o) => { o.userData.noRay = true; if (o.isMesh) o.raycast = () => {}; });
  },

  // ---------- 进门 ----------
  // 人从门口的光里走进来，门在身后"哐"地关上：杠杆门把自己砸了下来，密码盘"嘀嘀"两声，红字"ЗАКРЫТО"
  portal: 'tunnel',
  lockView: { cam: V(-0.9, 1.5, 3.2), look: V(-1.76, 1.25, 3.85) },
  relockLine: '……门把自己砸下来了？！又锁上了！',
  intro(g, { prepare }) {
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    const say = (t, d = 2.6) => g.ui.subtitle(t, d, g.S.name);
    g.after(T - 0.2, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.3, lookPitch: 0.1 }; say('……好黑。', 1.6); });
    g.after(T + 1.2, () => { g._cineTo(V(0.1, 1.62, -2.1), V(-0.2, 1.2, -12), 2.0); g._cutPose = { lookYaw: 0, lookPitch: 0 }; });
    g.after(T + 2.2, () => say('窗外……是地铁站台？油桶里烧着火，远处的隧道口亮着一盏红灯。', 3.4));
    g.after(T + 5.6, () => { g.audio.rumble(3, 0.5); g._shake(0.12); this._dust(g, 3); g.light.flicker = 0.6; });
    g.after(T + 6.4, () => say('……头顶上在掉灰。这是地下？', 2.6));
    g.after(T + 9.0, () => { g._cineTo(V(0.4, 1.5, -0.5), V(1.55, 0.9, 0.46), 1.4); g.audio.phoneRing(2); });
    g.after(T + 9.6, () => say('……电话？桌上那台老电话在响！', 2.6));
    g.after(T + 12.2, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 13.2, () => g.beginPlay());
  },
  onSlam(g) {
    g.fx.emit('dust', V(-1.6, 1.8, g.refs.door.z), { count: 26, speed: 0.6, spread: 1.2, up: 0.1, gravity: -0.4, drag: 1.4, life: 2.4, size: 0.12, colors: ['#6a6254', '#4a4438'], grow: 1.2 });
  },
  relock(g, mode) {
    const H = g.refs.metroLock;
    if (mode === 'hide') { H.lever.rotation.z = 1.2; H.drawLcd('ОТКРЫТО', '#3aff6a'); return; }
    if (mode !== 'anim') { H.lever.rotation.z = 0; H.drawLcd('ЗАКРЫТО'); return; }
    H.lever.rotation.z = 1.2;
    g.tween(0.25, (k) => (H.lever.rotation.z = 1.2 * (1 - k)), { ease: (t) => t * t, done: () => { g.audio.clunk(); g._shake(0.1); } }).cut = true;
    g.after(0.4, () => { g.audio.robotBeep(2, 1400); H.drawLcd('ЗАКРЫТО'); });
  },
  onPlay(g) {
    g.ui.toast('第四章 · 在滤网失效之前，逃出地铁 211', '', '🚇');
    this._ring = 1; this._ringT = 0.5;
    g.after(1.2, () => g.ui.subtitle(`电话还在响……先接电话。（手电筒在身上，${g.input.isTouch ? '点右下角的「手电」' : '按 F'}打开）`, 3.6, g.S.name));
  },
  exitLine: () => '走！趁着列车还没开过来……',
  onDoorOpen(g) { g.audio.ghostTrain(4); },
  onTorch(g, on) {
    g.audio.switchClick();
    if (on && !g.S.f.torchTried) { g.S.f.torchTried = true; g.say('手电筒的灯泡发黄……光柱里全是飘着的灰。', 2.6); }
  },

  // ---------- 目标 / 提示 ----------
  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.answered && !f.triedDoor) return [{ text: '接一下书桌上的野战电话', done: false }];
    return [
      { text: '☢️ 找出"热"的那只弹药箱', done: F[0] },
      { text: '🚂 让站台的灯亮起来', done: F[1] },
      { text: '👻 戴上防毒面具，去洗手间看看"那个东西"', done: F[2] },
      { text: f.unlocked ? '出门！' : `打开气密门的密码盘（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found, inv = S.inv;
    if (!f.answered) return '书桌上那台野战电话在响，接一下。';
    if (!F[0]) {
      if (!inv.includes('geiger')) return '盖革计数器就在你的书桌上，拿起来。';
      if (!this._geigerOn) return '点一下物品栏里的盖革计数器，打开它。';
      return '拿着盖革计数器在屋里走一走，咔哒声最密的那只弹药箱就是"热"的——打开它。';
    }
    if (!F[1]) return '窗边书桌上有台手摇发电机，一直摇，把站台的灯摇亮，然后看看远处那节车厢。';
    if (!F[2]) {
      if (!inv.includes('mask') && !this._masked && !f.maskReady) return '门边墙上挂着一只防毒面具，拿上。';
      if (!f.maskReady) return inv.includes('filter') ? '把滤毒罐拧到防毒面具上（点一下物品栏里的滤罐）。' : '面具的滤罐是空的——新滤罐在某只弹药箱里，挨个打开看看。';
      if (!this._masked) return '点一下物品栏里的防毒面具，戴上。';
      if (!g.refs.wcDoor.open) return '推开洗手间的玻璃门，走进去。';
      return '走近洗手间里那团噼啪放电的光。';
    }
    return `密码凑齐了！去门口，按☢️🚂👻的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S, [A, B, C] = S.mates;
    const call = (key, who, text) => { if (S.msgSent[key]) return; S.msgSent[key] = true; this._calls.push({ who, text }); this._callNew = { who, text }; this._ring = 1; this._ringT = 0.2; };
    if (p > 0.18 && !S.msgSent.rats) { S.msgSent.rats = true; this.ratRush(g); }
    if (p > 0.32) call('c1', C, '地面上起风了，辐射有点高，我们往回走了。滤罐省着点用！');
    if (p > 0.45 && !S.msgSent.ghost) { S.msgSent.ghost = true; this.ghostTrain(g); }
    if (p > 0.66 && !S.msgSent.alarm) { S.msgSent.alarm = true; this._alarmT = 6; g.audio.alarm(3); g.after(1.2, () => g.ui.subtitle('【站台广播】注意：通风系统故障，空气滤网效率下降，请各值班室戴好面具。', 4.4, '📢 站台广播')); }
    if (p > 0.84) call('c2', A, `我们到隔壁站了！${B}换了两只滤罐……你出来了没？`);
  },

  // ---------- 交互 ----------
  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label: () => g._fill(label), verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const Fl = {
      foldTable: ['折叠桌', '门边的折叠桌上摆着一排空弹壳，擦得锃亮——在这儿，子弹就是钱。'],
      blackTable: ['杂物桌', '杂物桌上点着一排蜡烛，旁边一只烧水壶、半包压缩饼干。'],
      bedW1: ['{A}的铺', '{A}的铺上扔着一把吉他，被子是一件旧军大衣。'],
      bedW2: ['{B}的铺', '{B}的铺，墙上用粉笔画着一个太阳，旁边写着"总有一天"。'],
      shelf: ['书架', '书架上塞满了从图书馆"捡"回来的书。《地铁线路图（1985 年版）》被翻烂了。'],
      shoeRack: ['鞋架', '鞋架上四双军靴，鞋底全是隧道里的烂泥。'],
      storageBox: ['收纳箱', '收纳箱里整整齐齐码着滤罐——全是用过的空罐子。'],
      polkaBag: ['收纳袋', '收纳袋里是一堆电池，大部分都没电了。'],
      bedE1: ['我的铺', '我的铺。枕头底下压着一张地面上的旧照片：蓝天、树、操场。'],
      patternRoll: ['凉席卷', '卷起来的凉席……在地下六十米，用来挡老鼠。'],
      bedE2: ['{C}的铺', '{C}的铺，床头挂着一只防毒面具和一串护身符。'],
      farDesks: ['窗边书桌', '窗边书桌上摆着一台手摇发电机，电线一直拉到窗框上。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子，装着一包蘑菇——地铁里唯一长得出来的东西。'],
      toteBag: ['红色袋子', '红色袋子里是几件从地面上捡回来的衣服，一股烧焦的味道。'],
      redBag: ['红色收纳包', '{C}的冬衣……地下六十米，一年四季都一样冷。'],
      paper: ['复习资料', '复习资料被当成了引火纸，只剩几张。"高等数学（下）"——在这儿是最好的引火纸。'],
      fallenBooks: ['掉在地上的书', '书架前的地上掉着三本书。刚才列车开过去的时候震下来的？'],
      folder: ['文件夹', '《值班表——{C}整理》："地面搜集：{A}、{B}、{C}。值班室：睡神（叫不醒，别叫了）"'],
      apple: ['苹果', '一个苹果……在地下，这玩意儿比子弹还值钱。'],
      drawer: ['抽屉', '抽屉里是一叠配给券，印着"滤罐 × 1"。'],
      suitcase: ['行李箱', '行李箱被当成了桌子，上面刻满了"正"字——是谁在数日子？'],
      bin: ['垃圾桶', '垃圾桶里全是空罐头。'],
      stoolMe: ['凳子', '一只弹药箱改成的凳子。'],
      notebook: ['笔记本', '笔记本上画着一张隧道图，标着"这段有老鼠""这段别回头"。'],
      clock: ['挂钟', '挂钟还在走。在地下，除了它，没人知道现在是白天还是晚上。'],
      sandbags: ['沙袋', '一摞沙袋堵在墙角——是防什么的？'],
      metroMap: ['地铁线路图', '一张 2077 年的线路图，好几个站被红笔打了叉。211 站用圈圈了出来："你在这里"。'],
      rules: ['站规', '站规第六条："211 值班室的那个人别叫他了，叫不醒。"……说的是我吧。'],
      towels: ['毛巾', '毛巾上长了一层绿毛。'],
      wcBucket: ['水桶和拖把', '水桶里的水泛着绿光……别碰。'],
      shower: ['花洒', '花洒里嘶嘶地往外冒绿烟。'],
      graffiti: ['隔板涂鸦', '隔板上写着"窗外有猴!!"……旁边多了一行："隧道里也有！！戴面具的！！"'],
    };
    for (const [id, [l, t]] of Object.entries(Fl)) H[id] = flav(l, t);
    H.phone211 = { label: '野战电话', verb: () => (this._ring ? '接电话' : '听听录音'), act: () => this.onPhone(g) };
    H.switch = { label: '电灯开关', verb: () => (S().f.lightsOn ? '关灯' : '开灯'), act: () => {
      const s = S();
      s.f.lightsOn = !s.f.lightsOn; g.audio.switchClick();
      g.refs.switchRocker.rotation.x = s.f.lightsOn ? -0.12 : 0.12;
      if (s.f.lightsOn) { g.light.flicker = 1.2; if (!s.f.bulbSeen) { s.f.bulbSeen = true; g.say('两只灯泡一闪一闪的，电压不稳……聊胜于无。', 3); } }
    } };
    // ---- ☢️ 盖革计数器、弹药箱 ----
    H.geiger = { label: '盖革计数器', verb: '拿起来', act: () => {
      g.give('geiger'); g.refs.geigerObj.visible = false;
      this.setGeiger(g, true);
      g.say('一台老式盖革计数器……一打开就"咔、咔"地响。离"热"的东西越近，响得越密。', 3.6);
    } };
    CRATES.forEach((_, i) => {
      H[`crate${i}`] = { label: () => `弹药箱 ${g.refs.crates[i].num}`, verb: () => (g.refs.crates[i].open ? '看看里面' : '打开'), act: () => this.onCrate(g, i) };
    });
    // ---- 🚂 手摇发电机、窗户 ----
    H.dynamo = { label: '手摇发电机', verb: () => (this._lit ? '查看' : '摇一摇'), act: () => this.onDynamo(g) };
    H.window = { label: '窗户', verb: '看站台', reach: false, act: () => this.lookOut(g) };
    // ---- 👻 防毒面具、毒气间、"异常" ----
    H.gasmask = { label: '防毒面具', verb: '取下来', act: () => {
      g.give('mask'); g.refs.gasmaskObj.visible = false;
      g.say('一只旧防毒面具……滤罐拧下来一看，是空的。', 3);
      g.clue('mask', '门边的<b>防毒面具</b>：滤罐是空的，要找一只<b>新滤罐</b>。');
      if (S().inv.includes('filter')) g.after(1.2, () => this.attachFilter(g));
    } };
    H.anomaly = { label: () => (g.refs.anomaly.alive ? '那团光' : '墙角'), verb: () => (g.refs.anomaly.alive ? '靠近' : '查看'), reach: false, act: () => {
      if (!g.refs.anomaly.alive) { g.say('那团光不见了。墙上什么都没有……只剩一股烧焦的味道。', 3); return; }
      if (!this._masked) { g.say('那团光浮在半空里噼啪作响……先得能在毒气里待得住。', 3); return; }
      this.vision(g);
    } };
    H.guitar = { label: '吉他', verb: '弹一段', act: () => {
      if (this._gtr) return;
      this._gtr = true;
      const d = g.audio.guitar();
      g.say('（拨了几下……在地下，吉他的声音会顺着隧道传出去很远。）', Math.min(4, d));
      S().ach.add('guitar');
      g.after(d, () => { this._gtr = false; });
    } };
    H.kettle = { label: '烧水壶', verb: () => (S().f.tea ? '查看' : '喝口热茶'), act: () => {
      const s = S();
      if (s.f.tea) { g.say('壶里的茶已经被我喝光了。', 2.4); return; }
      s.f.tea = true; s.freeHints++;
      g.audio.slurp();
      g.say('壶里是热的蘑菇茶……一股土味，但喝下去整个人暖和了。（下一次提示免费）', 3.6);
    } };
    H.shrine = flav('蜡烛', '蜡烛前面摆着一张照片：四个人站在阳光底下——是我们 211。照片背面写着："等天晴了，一起上去看太阳。"');
    H.door = { label: '气密门', verb: () => (S().f.unlocked ? '出门' : '输密码'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '毒气间的门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => {
      if (!g.refs.wcDoor.open && !this._masked && !S().f.gasWarned) { S().f.gasWarned = true; g.say('门上贴着"毒气"……里面全是绿雾。不戴面具进去就是找死。', 3.4); g.clue('gas', '洗手间成了<b>毒气间</b>，得戴上<b>防毒面具</b>才能进去。'); }
      g.toggleWcDoor();
      if (g.refs.wcDoor.open) g.audio.gasHiss();
    } };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '拧水龙头', act: () => g.say('水龙头里流出来的水是绿色的。关上，赶紧关上。', 3) };
    H.toilet = { label: '厕所', verb: '冲水', act: () => { g.audio.flush(); g.say('冲水——下水道里传来一声很长的……回音？', 3); } };
    H.mirror = { label: '穿衣镜', verb: '照镜子', reach: false, act: () => {
      g.ch.setExpression('grin', 2.2);
      g.say(this._masked ? ['镜子里是一个戴着防毒面具的人……是我吧？', '面具的镜片上全是哈气。'][(this._mirN = (this._mirN || 0) + 1) % 2] : ['镜子裂了一道缝，镜子里的我灰头土脸。', '在地下待久了，脸色白得跟纸一样。'][(this._mirN = (this._mirN || 0) + 1) % 2], 3);
    } };
    H.wcMirror = { label: '镜子', verb: '照镜子', reach: false, act: () => g.say('镜子上蒙着一层绿色的雾……照出来的人影一晃一晃的。', 2.8) };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只猴子压着轨道车还在窗外……'); return; }
      O.trigger(6); g.audio.monkey(); g.after(0.9, () => g.audio.monkey(1.25)); g.audio.ghostTrain(2);
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>隧道里压轨道车的三只猴子</b>', 'clue', '🐒'); }
      g.say('窗外是一条检修隧道……三只戴着防毒面具的猴子压着轨道车过来了，冲我摆了个"三不猴"！', 4.2);
    } };
    return H;
  },
  useItem(g, id) {
    if (id === 'geiger') { this.setGeiger(g, !this._geigerOn); return true; }
    if (id === 'filter') { if (g.S.inv.includes('mask')) this.attachFilter(g); else g.say('一只新滤罐……得有面具才能用。门边好像挂着一只面具。', 3); return true; }
    if (id === 'mask') { this.toggleMask(g); return true; }
    return false;
  },

  // ---------- 电话 ----------
  onPhone(g) {
    const S = g.S, [A, B, C] = S.mates;
    const H = g.refs.fieldPhone.handset;
    this._ring = 0;
    g.audio.clunk();
    g.tween(0.3, (k) => (H.position.y = 0.16 + Math.sin(k * Math.PI) * 0.06), { ease: (t) => t });
    const first = !S.f.answered;
    const lines = first ? [
      [A, '喂？睡神？终于醒了！我们仨戴着面具上地面捡破烂去了。'],
      [B, '门给你锁了——气密门的密码 3 位：'],
      [B, '☢️ 我们在一只弹药箱里藏了点"热"东西。<b>哪只箱子"热"，箱子上的编号就是第一位</b>。盖革计数器在你桌上。'],
      [C, '🚂 站台的灯坏了。窗外那节老车厢上我们用粉笔画了<b>"正"字</b>——窗边的<b>手摇发电机</b>摇一摇就看得见。'],
      [A, '👻 最后一位……洗手间里有毒气，还有"那个东西"。<b>戴好防毒面具</b>（滤罐在某只弹药箱里）去看看，它会告诉你的。'],
      [C, '别乱跑。隧道里有老鼠，很大的那种。'],
    ] : this._callNew ? [[this._callNew.who, this._callNew.text]] : [[null, '（听筒里只有沙沙声……对面已经挂了。）']];
    this._callNew = null;
    const html = lines.map(([who, t]) => `<div style="margin-bottom:10px">${who ? `<b style="color:#7a4a1a">${who}：</b>` : ''}${t}</div>`).join('');
    const node = g.ui.doc({ variant: 'plain', title: '📞 野战电话 · 211 值班室', html: `<div style="line-height:1.8">${html}</div>` });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (first) {
      S.f.answered = true;
      g.clue('phone', '室友的电话：<b>气密门</b>密码 3 位——☢️ "热"的那只<b>弹药箱</b>上的编号（盖革计数器）；🚂 站台上那节车厢上的<b>"正"字</b>（先摇<b>发电机</b>）；👻 戴上<b>防毒面具</b>去<b>洗手间</b>看"那个东西"。');
      g.after(0.6, () => g.say('上地面捡破烂？……又把我一个人丢在这儿。先找那只"热"的箱子！', 3.4));
    }
  },

  // ---------- ☢️ 盖革计数器、弹药箱 ----------
  setGeiger(g, on) {
    this._geigerOn = on;
    const el = document.getElementById('geiger');
    if (el) el.classList.toggle('on', on);
    g.audio.switchClick();
    if (on && !g.S.f.geigerTried) { g.S.f.geigerTried = true; g.clue('geiger', '<b>盖革计数器</b>：离"热"的弹药箱越近，咔哒声越密（右边有读数）。'); }
  },
  onCrate(g, i) {
    const S = g.S, c = g.refs.crates[i];
    if (!c.open) {
      c.open = true;
      g.audio.clunk(); g.audio.creak();
      g.tween(0.6, (k) => (c.lid.rotation.x = -1.95 * k), { ease: easeOutBack });
      g.fx.emit('dust', c.group.position.clone().add(V(0, 0.3, 0)), { count: 8, speed: 0.3, spread: 0.8, up: 0.4, gravity: -0.3, drag: 1.4, life: 1.6, size: 0.08, colors: ['#6a6254'], grow: 1 });
    }
    const say = (t, d = 3.2) => g.after(0.4, () => g.say(t, d));
    if (c.kind === 'hot') {
      if (!this._geigerOn) { say(`弹药箱 ${c.num}：里面一只沉甸甸的铅盒，盖子缝里透出一点绿光……这是什么？（要是有台盖革计数器就好了）`, 4); return; }
      if (S.found[0]) { say(`弹药箱 ${c.num}，那只"热"的。赶紧关上……算了，离远点。`); return; }
      g.after(0.4, () => { g.say(`盖革计数器疯了一样地响——就是它！弹药箱上刷着：${c.num}！`, 3.4); g._shake(0.05); });
      g.after(1.0, () => g.foundDigit(0, `"热"的那只弹药箱（编号 ${c.num}）`));
      return;
    }
    if (c.kind === 'filter') {
      if (c.took) { say(`弹药箱 ${c.num}：空了。`); return; }
      c.took = true; c.inside.visible = false;
      g.give('filter');
      say(`弹药箱 ${c.num}：一只新的滤毒罐！封条还没撕。`);
      if (S.inv.includes('mask')) g.after(1.6, () => this.attachFilter(g));
      return;
    }
    if (c.kind === 'food') {
      if (c.took) { say(`弹药箱 ${c.num}：罐头已经被我吃了。`); return; }
      c.took = true; c.inside.visible = false;
      S.freeHints++; g.audio.crunch();
      say(`弹药箱 ${c.num}：三个炖肉罐头！先吃一个……（下一次提示免费）`);
      return;
    }
    if (c.kind === 'bullets') {
      if (!c.took) { c.took = true; S.ach.add('bullet'); g.audio.pickup(); }
      say(`弹药箱 ${c.num}：一排军用子弹，闪着黄铜的光——在这儿，这就是钱。（揣了几颗）`);
      return;
    }
    say(`弹药箱 ${c.num}：只有几个空弹壳。`);
  },

  // ---------- 🚂 发电机、站台 ----------
  onDynamo(g) {
    const S = g.S, D = g.refs.dynamo;
    if (this._lit) { g.say('发电机"嗡嗡"地转着，站台的钠灯亮着。', 2.4); return; }
    if (this._cranking) return;
    this._cranking = true;
    this._charge = Math.min(1, this._charge + 1 / CRANKS);
    const a0 = D.crank.rotation.x;
    g.tween(0.45, (k) => (D.crank.rotation.x = a0 - k * Math.PI * 2), { ease: (t) => t, done: () => { this._cranking = false; } });
    g.audio.crank(this._charge);
    D.drawVolt(this._charge);
    if (this._charge < 1) {
      if (!S.f.cranked) { S.f.cranked = true; g.say('嘿——摇把好沉。电压表的指针动了一下……接着摇！', 2.8); }
      return;
    }
    this._lit = true;
    g.after(0.6, () => this.lightsOn(g));
  },
  lightsOn(g) {
    const S = g.S;
    g.audio.floodOn();
    this._flood = 0; // 灯一盏盏闪着亮起来
    g.say('指针到头了！窗外"咔哒"一声——', 2);
    g.after(1.4, () => this.lookOut(g, true));
  },
  lookOut(g, first = false) {
    const S = g.S, R = g.refs;
    if (this._look) return;
    if (!this._lit) {
      g.say('站台上黑漆漆的，只有油桶里的火……远处的轨道上好像停着一节车厢？看不清。', 3.4);
      g.clue('platform', '窗外的站台一片漆黑，远处轨道上停着一节<b>车厢</b>——得先让站台的灯亮起来（<b>手摇发电机</b>）。');
      return;
    }
    this._look = true;
    const cam = g.camera, tp = R.platform.tally.mesh.getWorldPosition(V());
    g._cineTo(V(tp.x * 0.5, 1.62, -3.05), tp, 1.2);
    const zf = g.zoomFov(34);
    g.tween(1.2, (k) => { cam.fov = lerp(62, zf, k); cam.updateProjectionMatrix(); }, { ease: easeInOut });
    const n = S.digits[1];
    if (first || !S.found[1]) {
      g.after(1.0, () => g.ui.subtitle('站台的灯亮了……那节老车厢的车身上，有人用粉笔画了"正"字！', 3.2, S.name));
      const full = Math.floor(n / 5), part = n % 5;
      const parts = [...Array(full).fill('一个"正"'), ...(part ? [`${part} 笔`] : [])];
      g.after(4.3, () => g.ui.subtitle(`${parts.join('，加上')}……一共 ${n} 笔！`, 3, S.name));
      g.after(4.8, () => g.foundDigit(1, '车厢上的粉笔"正"字'));
      g.after(7.6, () => this._endLook(g));
    } else {
      g.after(1.0, () => g.ui.subtitle(`车厢上的粉笔"正"字：一共 ${n} 笔。`, 2.6, S.name));
      g.after(3.4, () => this._endLook(g));
    }
  },
  _endLook(g) {
    const cam = g.camera;
    const f0 = cam.fov;
    g.tween(0.9, (k) => { cam.fov = lerp(f0, 62, k); cam.updateProjectionMatrix(); }, { ease: easeInOut, done: () => { cam.fov = 62; cam.updateProjectionMatrix(); } });
    g._cineTo(null, null, 1.0);
    g.after(1.0, () => { this._look = false; });
  },

  // ---------- 👻 防毒面具、影子 ----------
  attachFilter(g) {
    const S = g.S;
    if (S.f.maskReady || !S.inv.includes('filter') || !S.inv.includes('mask')) return;
    g.take('filter'); S.f.maskReady = true;
    g.audio.ratchet(6);
    g.say('把新滤罐拧到面具上……咔、咔、咔。好了！（点一下物品栏里的面具戴上）', 3.4);
  },
  toggleMask(g) {
    const S = g.S;
    if (!S.f.maskReady) { g.say(S.inv.includes('filter') ? '先把滤罐拧上去。' : '面具的滤罐是空的，戴上也白搭。得找一只新滤罐。', 2.8); return; }
    this._masked = !this._masked;
    document.getElementById('gasmask')?.classList.toggle('on', this._masked);
    g.audio.maskBreath();
    this._breathT = 3.4;
    if (this._masked) {
      if (!S.f.maskWorn) { S.f.maskWorn = true; S.ach.add('mask'); g.say('戴上了……呼——吸——自己的喘气声大得吓人。', 3); }
    } else g.say('摘下来了。……还是不戴舒服。', 2);
    g._refreshHUD(true);
  },
  // 走近那团光：灯全灭了，那团光越来越亮，洗手间的后墙上一个个人影走过去
  vision(g) {
    const S = g.S, A = g.refs.anomaly, n = S.digits[2];
    if (this._vision || !A.alive) return;
    this._vision = { t: 0 };
    g.audio.gasHiss(); g.audio.whispers(4.2 + n * 1.0);
    g._cineTo(V(-0.25, 1.52, 4.92), V(0.7, 1.05, 6.28), 1.0);
    g.say('……那团光在往我脑子里钻——', 2);
    this._blackout = 1;
    const walk = 3.4, gap = 1.05, t0 = 1.6;
    A.shadows.forEach((m, i) => {
      if (i >= n) return;
      g.after(t0 + i * gap, () => {
        m.visible = true; g.audio.footstep(false);
        g.tween(walk, (k) => {
          m.position.x = lerp(-0.75, 1.95, k);
          m.position.y = 0.87 + Math.abs(Math.sin(k * Math.PI * 5)) * 0.025;
          m.material.opacity = 0.85 * Math.min(1, k * 5, (1 - k) * 5);
        }, { ease: (t) => t, done: () => { m.visible = false; } });
      });
    });
    const tEnd = t0 + (n - 1) * gap + walk + 0.4;
    g.after(tEnd, () => {
      g.say(`……墙上一共走过去 ${n} 个影子。`, 3);
      g.foundDigit(2, '毒气间墙上走过去的影子');
      A.alive = false;
      g.audio.pop();
      g.tween(0.4, (k) => A.group.scale.setScalar(Math.max(0.001, 1 - k)), { ease: (t) => t * t, done: () => { A.group.visible = false; } });
      this._blackout = 0;
      this._vision = null;
    });
    g.after(tEnd + 2.4, () => g._cineTo(null, null, 1.0));
  },

  // ---------- 故事里的事件 ----------
  // 一群老鼠顺着墙根窜过去
  ratRush(g) {
    for (const r of g.refs.rats) { r.wait = 0; r.speed = 2.4; r.rush = 3; }
    g.audio.squeak(); g.after(0.5, () => g.audio.squeak()); g.after(1.1, () => g.audio.squeak());
    g.after(0.8, () => g.ui.subtitle('吱吱吱——墙根底下窜过去一群老鼠！', 2.6, g.S.name));
  },
  // 幽灵列车：一列亮着灯的车从窗外的轨道上呼啸而过——这条线早就停运了
  ghostTrain(g) {
    g.audio.ghostTrain(7);
    g.light.flicker = 3;
    g.after(0.6, () => { g._shake(0.08); this._dust(g, 2); });
    g.after(2.2, () => { this._ghostT = 0; g._shake(0.18); });
    g.after(5.8, () => g.ui.subtitle('……刚才开过去的是什么？这条线不是早就停运了吗？？', 3.4, g.S.name));
  },
  _dust(g, n = 2) {
    for (let k = 0; k < n; k++) {
      const p = V((Math.random() - 0.5) * 2.4, 2.95, -2.5 + Math.random() * 6);
      g.fx.emit('dust', p, { count: 10, speed: 0.08, spread: 0.5, up: -0.2, gravity: -0.9, drag: 0.8, life: 2.6, size: 0.018, colors: ['#5a5246', '#48423a'], grow: 0.4, sway: 0.15 });
    }
  },

  // ---------- 门 ----------
  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.lockedRattle(); g.audio.robotBeep(2, 1400);
      g.say('气密门的杠杆门把纹丝不动……密码盘上三个格子：☢️🚂👻？', 3.4);
      g.clue('door', '<b>气密门</b>的密码盘：三位，分别刻着 ☢️ 🚂 👻。');
      g.after(1.6, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: 'ГЕРМОДВЕРЬ · 气密门', variant: 'metro', labels: ['☢️', '🚂', '👻'],
      hint: S.found.some(Boolean) ? `已知：<b>${known}</b>` : '密码盘上三个格子：辐射、列车、影子……',
      onTick: () => g.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); g.refs.metroLock.drawLcd('ОШИБКА'); g.after(1.2, () => g.refs.metroLock.drawLcd('ЗАКРЫТО')); return false;
      },
    });
    g.openModal(box);
  },
  removeLock(g) { const H = g.refs.metroLock; H.lever.rotation.z = 1.2; H.drawLcd('ОТКРЫТО', '#3aff6a'); },
  unlock(g) {
    const S = g.S, H = g.refs.metroLock;
    S.f.unlocked = true;
    H.drawLcd('ОТКРЫТО', '#3aff6a');
    g.audio.robotBeep(3, 1800);
    g.after(0.4, () => { g.audio.hiss(); g.tween(0.5, (k) => (H.lever.rotation.z = 1.2 * k), { ease: easeOut, done: () => g.audio.clunk() }); });
    g.say('嘀——"ОТКРЫТО"！气密门"嗤"地泄了一口气。', 2.8);
    g.after(1.8, () => g.win());
  },

  // ---------- 每帧（只在 play 时）----------
  update(g, dt) {
    const S = g.S, R = g.refs, pos = g.ctrl.pos;
    // 电话铃
    if (this._ring) {
      this._ringT -= dt;
      if (this._ringT <= 0) { this._ringT = 3.6; g.audio.phoneRing(1); }
    }
    // 盖革计数器：离"热"的那只箱子越近，咔哒声越密
    if (this._geigerOn) {
      const hp = this._hot.group.position;
      const d = Math.hypot(pos.x - hp.x, pos.z - hp.z, 1.0 - 0.2);
      const k = this._hot.open ? 1.6 : 1;
      const rate = (0.6 + 58 / (d * d * 6 + 0.45)) * k;
      if (Math.random() < rate * dt) g.audio.geiger();
      if (Math.random() < rate * dt * 0.5) g.audio.geiger();
      this._dose = lerp(this._dose || 0, (0.11 + 38 / (d * d * 6 + 0.45)) * k, 1 - Math.exp(-dt * 4));
      this._doseT = (this._doseT || 0) - dt;
      if (this._doseT <= 0) {
        this._doseT = 0.12;
        const el = document.getElementById('geiger');
        if (el) { el.querySelector('b').textContent = (this._dose * (0.95 + Math.random() * 0.1)).toFixed(2); el.querySelector('s').style.width = `${clamp(Math.log10(1 + this._dose) / 2, 0, 1) * 100}%`; el.classList.toggle('hot', this._dose > 12); }
      }
    }
    // 毒气间：不戴面具进不去（咳嗽、退出来）
    const inGas = pos.z > LAYOUT_SZ + 0.14;
    // 鉴赏模式没有谜题：走进毒气间时顺手把门边的面具戴上（不然这就又成了一把"锁"）
    if (inGas && !this._masked && S.view) {
      if (!S.inv.includes('mask')) { g.give('mask', true); R.gasmaskObj.visible = false; }
      S.f.maskReady = true;
      this.toggleMask(g);
      g.say('（顺手戴上了门边那只防毒面具）', 2.4);
    }
    if (inGas && !this._masked) {
      this._coughT -= dt;
      if (this._coughT <= 0) {
        this._coughT = 2.5;
        g.audio.cough();
        g.say('咳咳咳——毒气！！没戴面具进不去！', 2.4);
        g.clue('gas', '洗手间成了<b>毒气间</b>，得戴上<b>防毒面具</b>才能进去。');
      }
      pos.z = Math.min(pos.z, LAYOUT_SZ - 0.28);
      g.ctrl.vel.z = Math.min(0, g.ctrl.vel.z);
    }
    // 走近那团光
    const A = R.anomaly;
    if (A.alive && this._masked && !this._vision && Math.hypot(pos.x - ANOMALY.x, pos.z - ANOMALY.z) < 1.0) this.vision(g);
    // 戴着面具：喘气声、滤罐的时间
    if (this._masked) {
      this._breathT -= dt;
      if (this._breathT <= 0) { this._breathT = 3.4; g.audio.maskBreath(); }
      this._filterT = Math.max(61, this._filterT - dt * (inGas ? 1.6 : 0.6));
    }
  },

  // ---------- 灯、站台、毒气、老鼠（每帧都跑）----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, ML = R.metroLights, PL = R.platform;
    const kk = 1 - Math.exp(-dt * 3);
    const bo = this._blackout || 0;
    this._bo = lerp(this._bo || 0, bo, 1 - Math.exp(-dt * (bo ? 6 : 1.5)));
    const dark = 1 - this._bo;
    // ---- 站台的灯：发电机摇满之后一盏盏闪着亮起来 ----
    if (this._lit) { this._flood = (this._flood || 0) + dt; }
    const target = this._lit ? (this._flood < 1.6 ? (Math.random() < 0.5 ? 1 : 0.1) : 1) : 0;
    this._K = lerp(this._K || 0, target, 1 - Math.exp(-dt * 10));
    const K = this._K * dark;
    PL.update(dt, t, K);
    // 幽灵列车
    if (this._ghostT >= 0) {
      this._ghostT += dt;
      const k = this._ghostT / 3.0;
      PL.ghost.visible = k < 1;
      PL.ghost.position.x = lerp(-70, 70, k);
      if (k >= 1) this._ghostT = -1;
    }
    const gpass = PL.ghost.visible ? clamp(1 - Math.abs(PL.ghost.position.x) / 28, 0, 1) : 0;
    L.sun.intensity = K * 1.5 * (0.95 + Math.sin(t * 50) * 0.03) + gpass * 2.2;
    L.sun.color.setRGB(1, 0.64 + gpass * 0.3, 0.3 + gpass * 0.55);
    L.winLight.intensity = 0.06 + K * 0.7 + gpass * 1.2;
    // ---- 屋里的灯：开关控制，电压不稳 ----
    const on = (S && S.f.lightsOn) || g.lightMode === 'end';
    g.light.spot = lerp(g.light.spot, on ? 3.6 : 0, 1 - Math.exp(-dt * 8));
    let spotV = g.light.spot * dark;
    if (g.light.flicker > 0) { g.light.flicker -= dt; spotV *= Math.random() < 0.5 ? 1 : 0.08; }
    else if (on && Math.random() < dt * 0.12) g.light.flicker = 0.18;
    L.ceilSpots.forEach((s) => (s.intensity = spotV));
    ML.bulbM.emissiveIntensity = (spotV / 3.6) * 2.4;
    // 红色应急灯（报警的时候一闪一闪）
    if (this._alarmT > 0) this._alarmT -= dt;
    const red = this._alarmT > 0 ? (Math.sin(t * 12) > 0 ? 2.2 : 0.1) : 1.25 + Math.sin(t * 1.3) * 0.06;
    ML.redLight.intensity = red * dark;
    ML.redM.emissiveIntensity = 2.2 * red * (0.3 + dark * 0.7);
    // 蜡烛、煤油灯
    const fl = 0.85 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23 + 1) * 0.05 + (Math.random() - 0.5) * 0.06;
    R.shrine.light.intensity = 1.6 * fl * dark;
    R.shrine.candles.forEach((c, i) => c.scale.set(1, (2.2 + Math.sin(t * 13 + i * 1.7) * 0.3) * dark + 0.01, 1));
    L.monLight.intensity = 1.5 * fl * dark;
    ML.klFlame.scale.set(1, 2.2 * fl * dark + 0.01, 1);
    L.hemi.intensity = lerp(L.hemi.intensity, (0.24 + K * 0.08 + (on ? 0.08 : 0)) * (0.3 + dark * 0.7), kk);
    g.scene.environmentIntensity = (0.07 + K * 0.03 + (on ? 0.04 : 0)) * (0.4 + dark * 0.6);
    // ---- 毒气间：绿雾慢慢飘，灯发绿、一闪一闪；"异常"噼啪放电 ----
    const A = R.anomaly;
    A.fogs.forEach((s, i) => { const b = s.userData.base; s.position.set(b.x + Math.sin(t * 0.2 + s.userData.ph) * 0.3, b.y + Math.sin(t * 0.13 + i) * 0.1, b.z + Math.cos(t * 0.17 + s.userData.ph) * 0.2); s.material.rotation = t * 0.05 * (i % 2 ? 1 : -1); });
    const vis = this._vision;
    if (vis) vis.t += dt;
    const flare = vis ? smoothstep(0, 1.2, vis.t) : 0;
    L.wc.color.setRGB(lerp(0.6, 0.62, flare), lerp(0.72, 0.8, flare), lerp(0.4, 1.0, flare));
    // 靠近那团光的时候：屋里的灯全灭，只剩它一闪一闪的冷光（别亮到发白——影子要看得清）
    L.wc.intensity = (1.6 * (Math.sin(t * 17) > 0.93 ? 0.3 : 1)) * (1 - flare * 0.5) + flare * (0.9 + Math.random() * 0.5);
    if (A.alive) {
      A.glow.material.opacity = 0.6 + Math.sin(t * 7) * 0.12 + flare * 0.4;
      A.glow.scale.setScalar(0.9 + flare * 1.6 + Math.random() * 0.1);
      A.glow2.scale.setScalar(0.3 + Math.random() * 0.1 + flare * 0.4);
      A.group.position.y = ANOMALY.y + Math.sin(t * 1.3) * 0.04;
      this._arcT -= dt;
      if (this._arcT <= 0) {
        this._arcT = 0.05 + Math.random() * 0.06;
        const pa = A.arcs.geometry.attributes.position, arr = pa.array;
        let o = 0;
        for (let a = 0; a < 6; a++) {
          const dir = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          const len = (0.12 + Math.random() * 0.25) * (1 + flare);
          let px = 0, py = 0, pz = 0;
          for (let s = 0; s < 7; s++) {
            const f = (s + 1) / 7 * len;
            const nx = dir.x * f + (Math.random() - 0.5) * 0.05, ny = dir.y * f + (Math.random() - 0.5) * 0.05, nz = dir.z * f + (Math.random() - 0.5) * 0.05;
            arr[o++] = px; arr[o++] = py; arr[o++] = pz; arr[o++] = nx; arr[o++] = ny; arr[o++] = nz;
            px = nx; py = ny; pz = nz;
          }
        }
        pa.needsUpdate = true;
        if (Math.random() < 0.25 && g.camera.position.distanceTo(ANOMALY) < 4) g.audio.spark();
      }
    }
    // ---- 老鼠：沿着墙根跑一段、停一停；人走近了、手电照过来就窜 ----
    const pos = g.ctrl.pos;
    for (const r of R.rats) {
      if (r.rush > 0) r.rush -= dt;
      const near = Math.hypot(pos.x - r.o.position.x, pos.z - r.o.position.z) < 1.3 || (S && S.uvOn && this._torchOn(g, r.o.position));
      if (near && !r.scared) { r.scared = 1.5; r.wait = 0; if (Math.random() < 0.6) g.audio.squeak(); if (!this._ratSeen && S && !S.view) { this._ratSeen = true; S.ach.add('rat'); } }
      if (r.scared > 0) r.scared -= dt;
      if (r.wait > 0 && !(r.scared > 0) && !(r.rush > 0)) { r.wait -= dt; r.o.children[0].rotation.x = Math.sin(t * 20) * 0.03; continue; }
      const tgt = r.path[r.i], p = r.o.position;
      _d.set(tgt.x - p.x, 0, tgt.z - p.z);
      const dd = _d.length(), sp = r.speed * ((r.scared > 0 || r.rush > 0) ? 2.2 : 1);
      if (dd < 0.05) {
        if (r.i + r.dir >= r.path.length || r.i + r.dir < 0) r.dir *= -1;
        r.i += r.dir;
        if (!(r.scared > 0) && !(r.rush > 0)) r.wait = 0.5 + Math.random() * 3;
      } else {
        p.addScaledVector(_d.normalize(), Math.min(dd, sp * dt));
        r.o.rotation.y = Math.atan2(_d.x, _d.z);
        r.o.children[0].position.y = Math.abs(Math.sin(t * 30)) * 0.01;
      }
    }
    // 头顶上时不时掉一点灰
    this._dropT -= dt;
    if (this._dropT <= 0) { this._dropT = 5 + Math.random() * 8; if (g.state === 'play') this._dust(g, 1); }
    g._updateDust(dt, 0.35 + (S && S.uvOn ? 0.3 : 0));
  },
  _torchOn(g, p) {
    const U = g.uvLight;
    if (U.intensity < 0.3) return false;
    _p.copy(p).sub(U.position);
    const d = _p.length();
    if (d > 4) return false;
    _d.copy(U.target.position).sub(U.position).normalize();
    return _p.normalize().dot(_d) > Math.cos(0.35);
  },
};

const LAYOUT_SZ = 4.5; // 南墙的室内墙面（洗手间从这儿往南）
