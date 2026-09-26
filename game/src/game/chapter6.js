// 第六章（原第四章）：冰封 211（21:30 · 零下七十度，暴风雪就要来了）
//   参考《冰汽时代》：宿舍在一座末日寒潮里的蒸汽城市里——陨石坑一样的大坑中间立着一座巨大的熔炉，全城靠它取暖。
//   室友们下矿上夜班去了，门上锁着一把黄铜"蒸汽压力锁"，三个表盘刻着 🏭🔥⚙️：
//   🏭 窗户冻满了冰花 → 擦开 → 用窗边的黄铜望远镜看熔炉：塔身上那根信号灯柱亮着几盏灯
//   🔥 暖炉是凉的 → 门口雪堆里拔出冰镐 → 撬开冻住的煤箱 → 添煤点火 → 墙上的压力表慢慢爬上去，停在那一位上
//   ⚙️ 我的书桌前坐着宿舍的蒸汽自动机「老铁」，冻成了铁疙瘩 → 屋里暖和起来之后，天花板上那根大冰柱化了，掉下一把发条钥匙
//      → 等老铁也化开了，给它上发条 → 它醒过来，在打字机上敲出最后一位
//   暖炉点着之后，炉子周围出现一圈"热区"，越烧越大：霜一圈圈化开，冰柱滴水，镜子、压力表、老铁身上的霜也跟着化
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, easeOutBack } from '../core/util.js';
import { untoonify } from '../world/toonkit.js';
import * as TX from '../core/textures.js';
import * as TF from '../core/tex_frost.js';
import { MAST_WORLD } from '../world/frost.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _q = V();
const HEAT_MAX = 4.6, HEAT_T = 45; // 热区最大半径（米）、烧到最大要几秒
const BOT_D = Math.hypot(0.95 + 1.47, 0.25 - 2.02); // 老铁离暖炉多远
const KEY_D = Math.hypot(-0.55 + 1.47, 1.45 - 2.02);
const MIRROR_D = Math.hypot(-0.67 + 1.47, 4.5 - 2.02);
const GAUGE_D = Math.hypot(-1.64 + 1.47, 2.62 - 2.02);
const CLOCK_D = Math.hypot(1.22 + 1.47, 4.5 - 2.02);

export const CH6 = {
  n: 6, theme: 'frost',
  title: '第六章 · 冰封 211', sub: '21:30 · 零下 70°C · 暴风雪将至', tag: '第六章 · 冰封 211',
  clock: [21, 30], lockName: '蒸汽压力锁', doorName: '防寒铁门', codeLen: 3, codeIcons: ['🏭', '🔥', '⚙️'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['stove', 'automaton', 'laundry', 'pipe', 'snowdrift', 'keyIce', 'coalCrate'],
  items: {
    icePick: { icon: '⛏️', name: '冰镐', desc: '一把冰镐，镐尖上还挂着冰碴。撬冰用的' },
    coal: { icon: '🪨', name: '煤块', desc: '一大把煤块，黑乎乎的，沉甸甸的。该添进炉子里' },
    windKey: { icon: '🗝️', name: '发条钥匙', desc: '一把黄铜发条钥匙，上面刻着"No.211"' },
  },

  // 屋里多冷：没生火时慢慢往下掉；暖炉烧起来之后一路升到十几度
  temp(g) {
    const base = -31 - 6 * g.storyP();
    const k = this._litT >= 0 ? easeOut(clamp(this._litT / HEAT_T, 0, 1)) : 0;
    return Math.round(lerp(base, 14, k));
  },
  clockText(g) {
    const mm = 30 + g.storyMinutes();
    const t = this.temp(g);
    return `21:${String(mm).padStart(2, '0')} · ${t > 0 ? '+' : ''}${t}°C`;
  },
  // 挂钟冻住了，停在室友出门的 21:02；屋里暖和到挂钟那儿，它才重新走起来
  clockHands(g) {
    if (!this._clockThawed) return { h: 21, m: 2, s: 14 };
    const gm = 29.99 * g.storyP();
    return { h: 21, m: 30 + gm, s: (gm % 1) * 60 };
  },

  init(g) {
    const R = g.refs, S = g.S;
    untoonify(g.ch.root);
    g.uvLight.visible = false; // 这一章用不上紫光手电
    g.scene.fog = new THREE.FogExp2('#0d1219', 0.03);
    g.lightMode = 'game';
    // 熔炉信号灯柱：亮着几盏就是 🏭 那一位
    R.frostCity.setLamps(S.digits[0]);
    // 状态
    this._litT = -1; this._od = 0; this._odT = 0; this._storm = 0;
    this._gustT = 3; this._crackT = 0.5; this._clankT = 8; this._breathT = 1.5; this._leakT = 1; this._doorSnowT = 0.5;
    this._keyState = 0; this._clockThawed = false; this._iceHeat = -1; this._wipes = 0; this._scope = false;
    R.frost.overdrive = 0;
    R.frost.heat.uHeatR.value = 0;
    // 气动传送管：室友们塞进来的信
    const [A, B, C] = S.mates;
    this._tube = [{ who: `${A}、${B}、${C}`, time: '21:02', lines: [
      '睡神：', '我们仨下矿上夜班去了（城里的煤又不够烧了）。', '你睡得跟冻猪肉似的，怎么叫都叫不醒。',
      '门给你锁上了——<b>蒸汽压力锁</b>，3 位：', '🏭 熔炉顶上的信号灯会告诉你（窗户冻住了？擦擦）',
      '🔥 炉子烧旺了，墙上的压力表自己会指给你看', '⚙️ 老铁记得最后一位——可惜它冻成了铁疙瘩',
      '附：冰镐插在门口的雪堆里，煤箱冻上了自己撬。'] }];
    this._tubeUnread = true;
    R.tube.lamp.material.emissiveIntensity = 2.2;
    R.automaton.setState('frozen');
    R.automaton.onPuff = (p, k) => g.fx.emit('steam', p, { count: k > 0.5 ? 3 : 1, speed: 0.25, spread: 0.4, up: 1.2, gravity: 0.15, drag: 1.2, life: 2.4, size: 0.14, colors: ['#e8eef4', '#cfd8e0'], grow: 2.4 });
    R.automaton.onKey = () => g.audio.typeClack();
    this._paper = ['211 号住所', '住户：4 人', '自动机：老铁', '……'];
    this._drawPaper(g);
    this._dressUp(g);
    // 暴风雪一直在刮
    g.audio.startWind();
  },

  // 主角换上毛线帽和围巾（换章时 game.js 会摘掉 refs.wear 里的东西）
  _dressUp(g) {
    const ch = g.ch, wear = [];
    const knitT = TX.genCloth({ base: '#7a2a22', seed: 97, contrast: 1.5, slub: 0.6 }); knitT.repeat.set(6, 2);
    const knit = new THREE.MeshStandardMaterial({ map: knitT, roughness: 0.96 });
    const knit2 = new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.95 });
    const m = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(...s); o.castShadow = true; o.receiveShadow = true; return o; };
    // 毛线帽：帽身 + 翻边 + 顶上一个毛球
    const hat = new THREE.Group();
    hat.add(m(new THREE.SphereGeometry(0.106, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), knit, 0, -0.01, -0.004, -0.12, 0, 0, [0.96, 1.12, 1.1]));
    hat.add(m(new THREE.TorusGeometry(0.1, 0.013, 8, 32), knit2, 0, -0.022, -0.004, Math.PI / 2 - 0.12, 0, 0, [0.97, 1.12, 1]));
    hat.add(m(new THREE.SphereGeometry(0.028, 12, 10), knit2, 0, 0.112, -0.02));
    ch.helmetSlot.add(hat); wear.push(hat);
    // 围巾：绕脖子一圈 + 胸前垂下来两截
    const scarf = new THREE.Group();
    scarf.add(m(new THREE.TorusGeometry(0.072, 0.03, 10, 28), knit, 0, 0.035, 0.005, Math.PI / 2, 0, 0, [1.05, 1, 1]));
    ch.J.neck.add(scarf); wear.push(scarf);
    const tails = new THREE.Group();
    tails.add(m(new THREE.BoxGeometry(0.075, 0.26, 0.022), knit, 0.045, 0.42, 0.12, -0.18, 0, 0.08));
    tails.add(m(new THREE.BoxGeometry(0.07, 0.2, 0.022), knit, 0.085, 0.45, 0.108, -0.16, 0.2, 0.18));
    ch.J.torso.add(tails); wear.push(tails);
    g.refs.wear = wear;
  },

  // ---------- 进门 ----------
  // 人从门口的光里走进来，门在身后关上：一阵风雪卷进来，铁链上"咔咔"结满冰碴，压力锁的表盘自己转回去锁上
  portal: 'forge',
  lockView: { cam: V(-0.95, 1.15, 4.25), look: V(-1.62, 0.78, 3.66) },
  relockLine: '……铁链上一下子结满了冰？！又锁上了！',
  intro(g, { prepare }) {
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    const say = (t, d = 2.6) => g.ui.subtitle(t, d, g.S.name);
    g.after(T - 0.3, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.4, lookPitch: 0.05 }; say('嘶——好冷好冷好冷！！', 1.8); this._breath(g, 1.4); });
    g.after(T + 1.0, () => {
      g._cineTo(V(-0.35, 1.72, -0.7), V(0.25, 1.62, -3.6), 2.0);
      g._cutPose = { lookYaw: 0.2, lookPitch: 0.1 };
      g.audio.bell();
    });
    g.after(T + 1.8, () => g.ui.subtitle('【城市广播】全体市民请注意：气温已降至零下七十度，暴风雪将在一小时后抵达。请各住所保持暖炉燃烧——熔炉不灭，城市不亡。', 5.2, '📢 城市广播'));
    g.after(T + 7.2, () => { g._cineTo(V(0.05, 1.55, -0.55), V(0.95, 1.05, 0.25), 1.6); g.audio.clank(2); });
    g.after(T + 7.6, () => say('……那是什么？一台蒸汽机器人？坐在我的位子上，冻成了一块铁疙瘩。', 3.2));
    g.after(T + 11.0, () => { g._cineTo(V(-0.35, 1.3, 1.25), V(-1.47, 0.55, 2.05), 1.5); g.audio.gust(1.2); });
    g.after(T + 11.4, () => say('炉子也是凉的……再不生火，我也要冻成冰棍了。', 3.0));
    g.after(T + 14.4, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 15.6, () => g.beginPlay());
  },
  onSlam(g) {
    g.audio.gust(1.4);
    g.fx.emit('dust', V(-1.6, 0.8, g.refs.door.z), { count: 30, speed: 1.1, spread: 1.2, up: 0.3, gravity: -0.3, drag: 1.4, life: 2.2, size: 0.018, colors: ['#eef4fc', '#d8e2ee'], sway: 0.4 });
    g.fx.emit('steam', V(-1.62, 0.7, g.refs.door.z), { count: 3, speed: 0.7, spread: 1, up: 0.15, gravity: 0, drag: 1.6, life: 1.6, size: 0.2, colors: ['#d8e0ea'], grow: 1.4 });
  },
  // 门锁：'hide' / 'anim'（铁链一节一节缠回去，冰碴一下子结满，压力锁弹出来）/ 'show'
  relock(g, mode) {
    const H = g.refs.frostLock, l = H.lock;
    H.dropped.visible = false;
    l.scale.setScalar(1);
    H.links.count = H.N;
    H.lamp.emissive.set('#ff3a1a');
    H.crust.visible = true; H.crust.scale.setScalar(1);
    if (mode === 'hide') { H.group.visible = false; g.collision.setEnabled('lockCable', false); return; }
    H.group.visible = true; g.collision.setEnabled('lockCable', true);
    if (mode !== 'anim') return;
    l.scale.setScalar(0.001);
    H.crust.visible = false;
    H.links.count = 1;
    g.tween(0.5, (k) => { H.links.count = Math.max(1, Math.round(k * H.N)); }, { ease: (t) => t }).cut = true;
    g.after(0.35, () => g.audio.chainDrop());
    g.after(0.5, () => {
      g.audio.clunk(); g.audio.hiss();
      g.tween(0.3, (k) => l.scale.setScalar(Math.max(0.001, easeOutBack(k))), { ease: (t) => t }).cut = true;
      g.fx.emit('steam', l.getWorldPosition(V()).add(V(0.08, 0.05, 0)), { count: 4, speed: 0.35, spread: 0.8, up: 0.8, gravity: 0.1, drag: 1.3, life: 1.3, size: 0.07, colors: ['#e8eef4', '#cfd8e0'], grow: 1.8 });
    });
    g.after(0.8, () => {
      H.crust.visible = true; H.crust.scale.setScalar(0.001);
      g.audio.iceBreak();
      g.tween(0.4, (k) => H.crust.scale.setScalar(Math.max(0.001, k)), { ease: (t) => t }).cut = true;
    });
  },
  onPlay(g) {
    g.ui.toast('第六章 · 在暴风雪来临之前，逃出冰封 211', '', '❄️');
    g.after(1.4, () => g.ui.subtitle('南墙上那根黄铜管子里好像塞着什么东西？还亮着一盏小红灯。', 3.4, g.S.name));
  },
  exitLine: () => '老铁，帮我看好炉子！',
  onDoorOpen(g) {
    const bot = g.refs.automaton;
    if (bot.state !== 'frozen') { bot.setState('cheer'); g.audio.steamWhistle(2.2, 0.6); }
    g.audio.gust(1.3);
  },
  onEnd(g) { const bot = g.refs.automaton; if (bot.state !== 'frozen') bot.setState('cheer'); },

  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.readTube && !f.triedDoor) return [{ text: '看看南墙上那根铜管子', done: false }];
    return [
      { text: '🏭 数一数熔炉的信号灯', done: F[0] },
      { text: '🔥 让暖炉烧起来', done: F[1] },
      { text: '⚙️ 唤醒自动机「老铁」', done: F[2] },
      { text: f.unlocked ? '出门！' : `打开蒸汽压力锁（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found, inv = S.inv;
    if (!f.readTube) return '南墙上那个黄铜盒子是气动传送管，里面有室友塞过来的信。';
    if (!f.triedDoor) return '去门口看看那把结满冰碴的蒸汽压力锁。';
    if (!F[1]) {
      if (!f.lit) {
        if (!inv.includes('icePick') && !f.crateOpen) return '门口那堆雪里插着一把冰镐，拔出来。';
        if (!f.crateOpen) return '暖炉旁边的煤箱冻住了——用冰镐把盖子上的冰撬开。';
        if (!inv.includes('coal')) return '从煤箱里抓一把煤。';
        return '把煤添进暖炉，点火。';
      }
      return '暖炉烧起来了——看看炉子边上那根竖管上的压力表。';
    }
    if (!F[0]) {
      if (!f.wiped) return '窗户上结满了冰花，走到窗边多擦几下。';
      return '窗边书桌上架着一台黄铜望远镜，用它看看熔炉塔身上那根信号灯柱，数一数亮着几盏。';
    }
    if (!F[2]) {
      if (!f.keyFell) return '老铁背后有个发条孔……发条钥匙冻在天花板那根横管下面的大冰柱里了。屋里暖和起来，冰柱自己会化。';
      if (!inv.includes('windKey') && !f.keyIn) return '冰柱化了，发条钥匙掉在了地上，捡起来。';
      if (!this._botThawed(g)) return '老铁身上的冰还没化开——等暖炉把屋子再烘热一点。';
      return '把发条钥匙插进老铁背后的发条孔，给它上发条。';
    }
    return `密码凑齐了！去门口，按🏭🔥⚙️的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S;
    const pa = (key, text, cb) => { if (S.msgSent[key]) return; S.msgSent[key] = true; g.audio.bell(); g.after(1.4, () => { g.ui.subtitle(text, 4.6, '📢 城市广播'); cb && cb(); }); };
    const [A, , C] = S.mates;
    if (p > 0.22) pa('cold', '【城市广播】气温持续下降，已达零下七十三度。请节约煤炭，一户一炉。');
    if (p > 0.38 && !S.msgSent.capA) { S.msgSent.capA = true; this._capsule(g, { who: A, time: g.clockText.slice(0, 5), lines: ['矿上冷到怀疑人生！！', '你醒了没？炉子记得烧！', '（老铁冻住之前说了句"晚安"，好心酸）'] }); }
    if (p > 0.52) pa('od', '【城市广播】熔炉进入超载模式！全城供暖加大！所有工人远离熔炉核心！', () => this.overdrive(g));
    if (p > 0.68 && !S.msgSent.capC) { S.msgSent.capC = true; this._capsule(g, { who: C, time: g.clockText.slice(0, 5), lines: ['暴风雪要来了！！', '出不来就在屋里烤火，别冻成冰雕 🥶', '我们在矿上等你。'] }); }
    if (p > 0.84) pa('storm', '【城市广播】暴风雪已抵达城郊！重复，暴风雪已抵达！关好门窗，守住暖炉！', () => { this._storm = 1; g.audio.gust(1.6); g._shake(0.12); });
  },
  // 熔炉超载：窗外的熔炉一下子亮起来，汽笛长鸣，整座城都在震
  overdrive(g) {
    this._od = 1; this._odT = 14;
    g.audio.steamWhistle(4.5, 1);
    g.after(0.4, () => g.audio.rumble(3.5, 0.3));
    g._shake(0.1);
    g.after(2.2, () => g.audio.rattle());
  },

  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label, verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const Fl = {
      foldTable: ['折叠桌', '门边的折叠桌，铁桌腿冻在了地板上。桌上的矿泉水冻成了一根冰棍。'],
      bedW1: ['{A}的床', '{A}的床上铺着一张狼皮褥子，被子冻得硬邦邦的，能立起来。'],
      bedW2: ['{B}的床', '{B}的床，蚊帐冻成了一张冰网，一碰就"咔啦"响。'],
      shelf: ['书架', '书冻成了一整块，抽不出来。书脊上写着《蒸汽机原理》《煤炭的一百种烧法》《法典（注释版）》。'],
      shoeRack: ['鞋架', '鞋架上一排毡靴，每一双里都塞着报纸——保暖用的。'],
      storageBox: ['收纳箱', '收纳箱里是四条厚棉裤。标签上写着"议会配给 · 211"。'],
      polkaBag: ['收纳袋', '一袋子毛线手套，全是单只的。'],
      box350: ['纸箱', '一箱"应急口粮"……打开一看，是锯末饼干。'],
      bedE1: ['我的床', '我的床上盖着一张驯鹿皮……难怪我没冻死。'],
      patternRoll: ['凉席卷', '凉席在这种地方有什么用？……冻得跟一根木棍一样。'],
      bedE2: ['{C}的床', '{C}的床，上铺挂着一盏熄了的马灯，枕头边放着一本《如何在冰原上活下去》。'],
      farDesks: ['窗边书桌', '窗边的书桌：一盏马灯、一台黄铜望远镜，还有一本冻住的账本："本周煤炭：-3 箱"。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子，里面装着两双毡靴。'],
      toteBag: ['红色袋子', '红色的大袋子，里面是一捆劈好的木柴——可惜受潮了，点不着。'],
      redBag: ['红色收纳包', '{C}的冬衣都在里面……他居然穿着短袖去的矿上？'],
      paper: ['复习资料', '复习资料冻在了地板上，揭不起来。上面写满了"热力学第二定律"。'],
      fallenBooks: ['掉在地上的书', '书架前的地上掉着三本书，冻在了地板上。今天晚上，好像也有书自己从书架上掉了下来。'],
      folder: ['文件夹', '《矿工排班表——{C}整理》：夜班：{A}、{B}、{C}。备注："睡神不叫他了，叫不醒。"'],
      calendar: ['台历', '台历上写着：寒潮第 211 天。今天那一格画了一片雪花。'],
      notebook: ['笔记本', '笔记本上画着一台熔炉，旁边写着："熔炉：热功率 = 煤 × 效率 × 希望"。'],
      apple: ['苹果', '一个苹果冻成了冰疙瘩，敲在桌上"当当"响。'],
      drawer: ['抽屉', '抽屉冻住了，拉不开。'],
      suitcase: ['行李箱', '行李箱上结了一层霜，拉链冻住了。'],
      basket: ['脏衣篓', '脏衣篓里的袜子冻成了一只只"冰袜"。……好在闻不到味道了。'],
      bin: ['垃圾桶', '垃圾桶里全是烧完的煤渣。'],
      roster: ['值日表', '值日表：周一 {A} 添煤　周二 {B} 添煤　周三 {C} 添煤　周四 我……周五 老铁（自动机）。'],
      graffiti: ['隔板涂鸦', '隔板上写着"窗外有猴!!"……旁边多了一行歪歪扭扭的："雪猴！"'],
      wcBucket: ['水桶和拖把', '水桶里的水冻成了一整块，拖把直直地插在冰里。'],
      shower: ['花洒', '花洒下面挂着一根冻住的水柱……现在洗澡等于自杀。'],
      towels: ['毛巾', '四条毛巾冻成了四块板子，敲起来"当当"响。'],
      stoolMe: ['凳子', '老铁坐着的凳子，被它压得吱吱响。'],
      poster_survive: ['宣传画', '宣传画：「城市必须存续」——红底上画着一座熔炉，底下一圈人手拉着手。'],
      poster_law: ['法典告示', '法典告示：第 211 条——宿舍必须按时熄灯；打排位不得超过凌晨三点。……这条是谁提的？'],
      poster_coal: ['宣传画', '宣传画：「节约煤炭」——一块煤 = 一个温暖的夜。'],
      poster_automaton: ['招工广告', '招工广告：「自动机——不吃、不睡、不怕冷（冻住了除外）」。'],
      laundry: ['晾衣绳', '晾着的衣服冻成了一块块铁板。一件衬衫硬得能当盾牌用。'],
      snowdrift: ['雪堆', '门缝底下吹进来一大堆雪……室友们出门的脚印一路踩到了门口。'],
      lantern: ['马灯', '一盏马灯，火苗被门缝里钻进来的风吹得一晃一晃。屋里就这点亮了。'],
    };
    for (const [id, [l, t]] of Object.entries(Fl)) H[id] = flav(l, t);
    H.pipe = { label: '蒸汽管', verb: '摸一下', act: () => g.say(S().f.lit ? '嘶——烫！管子里的蒸汽"当当"地响，热气一路往墙里走。' : '管子冰凉，外面结了一层白霜……里面一点热气都没有。', 3) };
    H.clock = { label: '挂钟', verb: '看时间', reach: false, act: () => g.say(this._clockThawed ? `挂钟又走起来了：${g.clockText.slice(0, 5)}。` : '挂钟冻住了，指针停在 21:02——室友们出门的那一刻。', 3.2) };
    H.curtain = { label: '厚窗帘', verb: '拉一拉', act: () => g.say('厚厚的棉窗帘冻得硬邦邦的，拉不动……还好它本来就拉开着。', 3) };
    // ---- 气动传送管 ----
    H.tube = { label: '气动传送管', verb: () => (this._tubeUnread ? '取出铜胶囊' : '看看信'), act: () => this.openTube(g) };
    // ---- 🏭 窗户 + 望远镜 ----
    H.window = { label: '窗户', verb: () => (S().f.wiped ? '看窗外' : '擦掉冰花'), reach: true, act: (hv) => this.wipeWindow(g, hv && hv.point) };
    H.spyglass = { label: '黄铜望远镜', verb: '看熔炉', reach: false, act: () => this.lookScope(g) };
    // ---- 🔥 暖炉 ----
    H.icePick = { label: '冰镐', verb: '拔出来', act: () => {
      g.give('icePick'); g.refs.icePick.visible = false; g.audio.iceBreak();
      g.fx.emit('dust', g.refs.icePick.position.clone().add(V(0, 0.2, 0)), { count: 10, speed: 0.5, spread: 0.8, up: 0.6, gravity: -1, drag: 1, life: 1, size: 0.03, colors: ['#eef4fc'] });
      g.say('一把冰镐，斜插在门口的雪堆里——室友们留下的。', 3);
    } };
    H.coalCrate = { label: '煤箱', verb: () => (S().f.crateOpen ? (S().f.lit ? '查看' : '抓一把煤') : S().inv.includes('icePick') ? '用冰镐撬开' : '打开'), act: () => this.onCrate(g) };
    H.stove = { label: '铸铁暖炉', verb: () => (S().f.lit ? '烤烤火' : S().inv.includes('coal') ? '添煤、点火' : '查看'), act: () => this.onStove(g) };
    H.soup = { label: '一锅汤', verb: () => (S().f.lit ? '喝一口' : '查看'), act: () => this.onSoup(g) };
    H.gauge = { label: '压力表', verb: '查看', reach: false, act: () => g.say(S().f.lit ? (S().found[1] ? `压力表的指针稳稳地停在 ${S().digits[1]} 上。` : '指针正在往上爬……') : '压力表上结着霜，指针趴在最左边的"❄"上——一点压力都没有。', 3.2) };
    H.valve = { label: '阀门', verb: '拧一拧', act: () => {
      if (!S().f.lit) { g.say('阀门冻得死死的，拧不动。', 2.6); return; }
      g.audio.hiss();
      g.fx.emit('steam', g.refs.valve.position.clone().add(V(0.06, 0.04, 0)), { count: 12, speed: 0.6, spread: 0.6, up: 0.8, gravity: 0.3, drag: 1.4, life: 1.6, size: 0.12, colors: ['#f0f4f8', '#dce4ec'], grow: 2.2 });
      g.say('拧开一点——嗤！一股热蒸汽喷了出来，脸一下子暖和了。', 3);
    } };
    // ---- ⚙️ 老铁 ----
    H.keyIce = { label: '大冰柱', verb: '查看', reach: false, act: () => {
      g.say(S().inv.includes('icePick') ? '一根粗大的冰柱，里面冻着一把铜钥匙……挂得太高了，冰镐够不着。等屋里暖和起来，它自己会化吧？' : '天花板那根横管底下挂着一根粗冰柱……里面冻着一把铜钥匙！', 3.8);
      g.clue('keyIce', '天花板横管下的<b>大冰柱</b>里冻着一把<b>铜钥匙</b>——屋里暖和起来才会化。');
    } };
    H.windKey = { label: '发条钥匙', verb: '捡起来', act: () => {
      g.give('windKey'); g.refs.keyIce.key.visible = false; g.audio.tink();
      g.say('一把黄铜发条钥匙，上面刻着"No.211"……和老铁胸口的铭牌一样。', 3.2);
    } };
    H.automaton = { label: '自动机「老铁」', verb: () => (g.refs.automaton.state !== 'frozen' ? '聊天' : S().inv.includes('windKey') ? '插上发条钥匙' : '查看'), reach: false, act: () => this.onBot(g) };
    H.typewriter = { label: '打字机', verb: '看看纸上', reach: false, act: () => {
      const node = g.ui.doc({ variant: 'plain', title: '打字机上的纸', html: `<div style="font-family:'Courier New',monospace;line-height:1.9">${this._paper.map((l) => l.replace(/</g, '&lt;')).join('<br>')}</div>` });
      g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    } };
    // ---- 开关、门、洗手间 ----
    H.switch = { label: '电灯开关', verb: () => (S().f.lightsOn ? '关灯' : '开灯'), act: () => {
      const s = S();
      s.f.lightsOn = !s.f.lightsOn; g.audio.switchClick();
      g.refs.switchRocker.rotation.x = s.f.lightsOn ? -0.12 : 0.12;
      if (s.f.lightsOn) { g.light.flicker = 0.9; if (!s.f.bulbSeen) { s.f.bulbSeen = true; g.say('灯泡里的钨丝一闪一闪的……是熔炉那边送过来的电。', 3); } }
    } };
    H.door = { label: '蒸汽压力锁', verb: () => (S().f.unlocked ? '出门' : '开锁'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '洗手间门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '拧水龙头', act: () => g.say('水龙头底下挂着一根冻住的水柱……一滴水都拧不出来。', 3) };
    H.toilet = { label: '厕所', verb: '冲水', act: () => { g.audio.iceBreak(); g.say('一拉绳——"咔啦"。水箱冻成了一整块冰，冲不了。', 3); } };
    H.mirror = { label: '穿衣镜', verb: '照镜子', reach: false, act: () => {
      if (g.refs.mirrorFrost.material.opacity > 0.3) { g.say('镜子上结满了冰花，照不出人。', 2.6); return; }
      g.ch.setExpression('grin', 2.2);
      g.say(['镜子上的霜化了——镜子里的我戴着毛线帽，冻得鼻头通红。', '围巾是谁给我系上的？……管他呢，暖和就行。', '别照了，再照眉毛都要结冰了！'][(this._mirN = (this._mirN || 0) + 1) % 3], 3.2);
    } };
    H.wcMirror = { label: '镜子', verb: '照镜子', reach: false, act: () => g.say('洗手间的镜子上冻着厚厚一层霜，照不出人。', 2.6) };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只雪猴还挤在一起，冲我摆造型……'); return; }
      O.trigger(4.5); g.audio.monkey(); g.after(0.8, () => g.audio.monkey(1.25));
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>挤成一团取暖的三只雪猴</b>', 'clue', '🐒'); }
      g.say('窗外的枯树上，三只雪猴挤成一团取暖，头顶上各顶着一小撮雪……被吵醒了，摆了个"三不猴"。', 4);
    } };
    return H;
  },

  // ---------- 气动传送管 ----------
  openTube(g) {
    const S = g.S;
    g.audio.paper();
    if (this._tubeUnread) { this._tubeUnread = false; g.refs.tube.lamp.material.emissiveIntensity = 0; g.refs.tube.capsule.visible = false; }
    const msgs = this._tube.slice().reverse();
    const html = msgs.map((m) => `<div style="margin-bottom:14px"><div style="opacity:.6;font-size:13px">📨 ${m.time} · ${m.who}</div>${m.lines.join('<br>')}</div>`).join('<hr style="border:none;border-top:1px dashed rgba(0,0,0,.2);margin:10px 0">');
    const node = g.ui.doc({ title: '气动传送管里的信', html });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.readTube) {
      S.f.readTube = true;
      g.clue('tube', '室友的信：门上是<b>蒸汽压力锁</b>（3 位）——🏭 熔炉顶上的信号灯；🔥 暖炉烧旺后看<b>压力表</b>；⚙️ <b>老铁</b>记得（它冻住了）。冰镐在门口雪堆里，煤箱冻上了。');
      g.after(0.5, () => g.say('下矿上夜班？……又把我一个人丢下了。先把炉子生起来！', 3.4));
    }
  },
  // 又有一封信从管子里"咻——咚"地掉下来
  _capsule(g, msg) {
    const T = g.refs.tube;
    this._tube.push(msg);
    this._tubeUnread = true;
    T.flyCap.visible = true; T.flyCap.position.set(0, 1.6, 0);
    g.audio.tubeWhoosh();
    g.tween(0.85, (k) => T.flyCap.position.set(-0.03 * k, lerp(1.6, -0.09, k * k), 0.09 * k), { ease: (t) => t, done: () => { T.flyCap.visible = false; T.capsule.visible = true; T.lamp.material.emissiveIntensity = 2.2; } });
    g.after(1.0, () => g.ui.toast(`气动传送管里掉下来一个铜胶囊：<b>${msg.who}</b> 的信`, '', '📨'));
  },

  // ---------- 🏭 擦窗户、望远镜 ----------
  wipeWindow(g, point) {
    const S = g.S, W = g.refs.windowFrost;
    if (S.f.wiped) { this.lookOut(g); return; }
    g.audio.wipe();
    // 在冰花上"擦"出一道：沿着袖子来回抹几下
    const c = W.canvas, ctx = c.getContext('2d');
    const u = point ? clamp((point.x + 1.31) / 2.62, 0.08, 0.92) : 0.5, v = point ? clamp(1 - (point.y - 1.0) / 1.5, 0.12, 0.88) : 0.55;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    const r = c.width * 0.07;
    for (let k = 0; k < 7; k++) {
      const x = (u + (k - 3) * 0.035 + (Math.random() - 0.5) * 0.02) * c.width, y = (v + Math.sin(k * 1.7) * 0.03) * c.height;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    W.tex.needsUpdate = true;
    this._wipes++;
    g.fx.emit('dust', point ? point.clone().add(V(0, 0, 0.05)) : V(0, 1.7, -3.5), { count: 8, speed: 0.25, spread: 0.8, up: 0.2, gravity: -0.8, drag: 1.2, life: 1.2, size: 0.02, colors: ['#f0f6ff'] });
    if (this._wipes === 1) g.say('冰花太厚了，得多擦几下……袖子都湿了。', 2.6);
    if (this._wipes >= 3) {
      S.f.wiped = true;
      // 擦开之后，中间一大片慢慢清透（冰花只剩四周一圈）
      const snap = TX.makeCanvas(c.width, c.height);
      snap.getContext('2d').drawImage(c, 0, 0);
      g.tween(1.6, (k) => (W.glowK = 1 - k));
      g.tween(1.6, (k) => {
        ctx.save();
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(snap, 0, 0);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.translate(c.width * 0.5, c.height * 0.52); ctx.scale(1, (0.36 * c.height) / (0.42 * c.width));
        const R0 = 0.42 * c.width;
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R0);
        gr.addColorStop(0, `rgba(0,0,0,${0.94 * k})`); gr.addColorStop(0.7, `rgba(0,0,0,${0.85 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(-R0, -R0, R0 * 2, R0 * 2);
        ctx.restore();
        W.tex.needsUpdate = true;
      }, { ease: (t) => t });
      g.after(0.6, () => this.lookOut(g, true));
    }
  },
  lookOut(g, first = false) {
    const S = g.S;
    if (this._scope) return;
    this._scope = true;
    g._cineTo(V(0.52, 1.7, -2.8), MAST_WORLD.clone().add(V(0, 1.2, 0)), 1.4);
    if (first) {
      g.after(0.8, () => g.ui.subtitle('窗外是……一座城？！大坑中间立着一座巨大的熔炉，一圈圈木屋全都亮着灯，探照灯在雪里扫来扫去。', 4.4, S.name));
      g.after(5.2, () => g.ui.subtitle('熔炉的塔身上有一根信号灯柱，亮着几盏红灯……太远了，数不清。', 3.2, S.name));
      g.clue('window', '窗外：熔炉塔身上有一根<b>信号灯柱</b>，亮着几盏红灯……太远了，得找个望远镜。');
    } else g.after(0.6, () => g.ui.subtitle('熔炉还在暴风雪里烧着……信号灯柱太远了，得用望远镜才看得清。', 3, S.name));
    g.after(first ? 8.6 : 3.8, () => { g._cineTo(null, null, 1.1); this._scope = false; });
  },
  lookScope(g) {
    const S = g.S;
    if (this._scope) return;
    if (!S.f.wiped) { g.say('望远镜对着窗户——可玻璃上全是冰花，什么都看不见。先把窗户擦干净。', 3.4); return; }
    this._scope = true;
    let el = document.getElementById('spyglass');
    if (!el) { el = document.createElement('div'); el.id = 'spyglass'; document.body.appendChild(el); }
    const cam = g.camera, fov0 = 62;
    const FM = g.refs.windowFrost.mat;
    g._cineTo(V(0.46, 1.46, -3.12), MAST_WORLD.clone(), 1.1);
    g.tween(0.8, (k) => (FM.opacity = 1 - k));
    g.after(0.7, () => { el.classList.add('on'); g.tween(0.9, (k) => { cam.fov = lerp(fov0, 15, k); cam.updateProjectionMatrix(); }, { ease: easeInOut }); });
    g.after(1.9, () => g.ui.subtitle(`熔炉的信号灯柱……从下往上数：亮着 ${S.digits[0]} 盏红灯！`, 3.2, S.name));
    g.after(2.6, () => { if (!S.found[0]) g.foundDigit(0, '望远镜里熔炉的信号灯'); S.f.scoped = true; });
    g.after(4.8, () => {
      el.classList.remove('on');
      g.tween(0.7, (k) => { cam.fov = lerp(15, fov0, k); cam.updateProjectionMatrix(); }, { ease: easeInOut, done: () => { cam.fov = fov0; cam.updateProjectionMatrix(); } });
      g._cineTo(null, null, 1.0);
      g.tween(0.8, (k) => (FM.opacity = k));
    });
    g.after(5.9, () => { this._scope = false; });
  },

  // ---------- 🔥 煤箱、暖炉、汤 ----------
  onCrate(g) {
    const S = g.S, C = g.refs.coalCrate;
    if (!S.f.crateOpen) {
      if (!S.inv.includes('icePick')) {
        g.audio.lockedRattle();
        g.say('煤箱的盖子被一层厚厚的冰壳冻死了……得找个家伙撬开。', 3.2);
        g.clue('crate', '暖炉旁边的<b>煤箱</b>冻住了，要找个东西把冰撬开。');
        return;
      }
      S.f.crateOpen = true;
      g.take('icePick');
      g.audio.iceBreak(); g._shake(0.08);
      g.fx.emit('dust', C.group.position.clone().add(V(0, 0.4, 0)), { count: 18, speed: 0.7, spread: 1, up: 0.9, gravity: -2.5, drag: 0.8, life: 1.2, size: 0.03, colors: ['#e8f0fa', '#cfe0f0'] });
      C.ice.visible = false;
      g.tween(0.6, (k) => (C.lid.rotation.x = -1.9 * k), { ease: easeOutBack, delay: 0.2 });
      g.say('嘿——咔嚓！冰壳碎了，盖子撬开了。满满一箱煤！', 3);
      return;
    }
    if (S.f.lit) { g.say('煤还有大半箱，够烧一整晚的。', 2.6); return; }
    if (S.inv.includes('coal')) { g.say('手里已经有一把煤了，快添进炉子里！', 2.6); return; }
    g.give('coal'); g.audio.shovel();
    g.say('抓了一大把煤块。手套上全是黑的。', 2.6);
  },
  onStove(g) {
    const S = g.S;
    if (S.f.lit) {
      g.say(['炉火呼呼地响，手指头终于有知觉了。', '把手伸过去烤一烤——啊，活过来了。', '炉肚子烧得微微发红……可别把袜子放上去烤（法典第 212 条）。'][(this._warmN = (this._warmN || 0) + 1) % 3], 3);
      g.ch.setExpression('grin', 2);
      return;
    }
    if (!S.inv.includes('coal')) {
      g.say('炉子冰凉，里面只剩一点煤灰……得先弄点煤来。', 3);
      g.clue('stove', '<b>暖炉</b>是凉的，需要<b>煤</b>。');
      return;
    }
    this.lightStove(g);
  },
  lightStove(g) {
    const S = g.S, R = g.refs, St = R.stove;
    g.take('coal');
    S.f.lit = true;
    S.ach.add('forge');
    g.audio.shovel();
    // 打开炉门、倒煤、关上
    g.tween(0.35, (k) => (St.door.rotation.y = -1.6 * k), { ease: easeOut });
    g.after(0.4, () => { St.coalIn.visible = true; g.audio.clunk(); });
    g.after(0.8, () => { g.audio.ignite(); this._litT = 0; g.fx.emit('spark', St.group.position.clone().add(V(0.35, 0.45, 0)), { count: 16, speed: 1, spread: 0.8, up: 1, gravity: -1, drag: 1.5, life: 1.2, size: 0.03, colors: ['#ffd080', '#ff8a30'] }); });
    g.after(1.1, () => g.tween(0.4, (k) => (St.door.rotation.y = -1.6 * (1 - k)), { ease: easeInOut }));
    g.after(1.3, () => { g.audio.startFire(); g.say('添煤……嚓——着了！', 2.2); });
    // 蒸汽管"当当"地响起来，压力表的指针慢慢往上爬：镜头凑过去看
    g.after(2.4, () => { g.audio.clank(4); g._cineTo(V(-0.95, 1.62, 2.45), R.gauge.group.position.clone(), 1.0); });
    const G = R.gauge;
    g.after(2.8, () => g.tween(3.0, (k) => { G.value = lerp(-1, S.digits[1], k); G.needle.rotation.z = G.angleOf(G.value) + Math.sin(k * 30) * 0.05 * (1 - k); }, { ease: easeOut }));
    g.after(4.6, () => g.ui.subtitle(`压力表的指针爬上去了……停在了 ${S.digits[1]}！`, 3, S.name));
    g.after(5.2, () => g.foundDigit(1, '暖炉烧起来后的压力表'));
    g.after(6.4, () => g._cineTo(null, null, 1.0));
  },
  onSoup(g) {
    const S = g.S;
    if (!S.f.lit) { g.say('一锅汤冻成了冰坨子。旁边的法典告示上写着：第 19 条——汤里可加锯末，管饱。', 3.6); return; }
    if (S.f.soup) { g.say('汤已经被我喝光了，锅底还剩一点锯末。', 2.6); return; }
    S.f.soup = true; S.freeHints++; S.ach.add('soup');
    g.audio.slurp();
    g.fx.emit('steam', g.refs.stove.group.position.clone().add(V(0, 1.0, 0)), { count: 6, speed: 0.2, spread: 0.4, up: 0.8, gravity: 0.2, drag: 1, life: 2, size: 0.12, colors: ['#f0f4f8'], grow: 2.2 });
    g.say('热乎乎的锯末汤……一股木头味，但是真暖和！（下一次提示免费）', 3.4);
  },

  // ---------- ⚙️ 老铁 ----------
  _botThawed(g) { return g.refs.frost.heat.uHeatR.value > BOT_D + 0.25; },
  onBot(g) {
    const S = g.S, bot = g.refs.automaton;
    if (bot.state !== 'frozen') {
      if (bot.state === 'boot' || this._botBusy) return;
      bot.talk(2.8); bot.after = 'idle'; g.audio.robotVoice(1.2);
      const lines = S.found[2]
        ? ['本机提醒：熄灯时间已过。', '法典第 211 条：打排位不得超过凌晨三点。……本机记得你昨晚打到了四点。', '我不冷。我是铁做的。……但我的发条冻住过。', '你的室友们去矿上了，他们让我看着你。——任务失败。', '暴风雪来了，记得往炉子里添煤。本机不负责添煤。']
        : ['咔……哒……系统……预热中……'];
      g.ui.subtitle(lines[(this._botN = (this._botN || 0) + 1) % lines.length], 3.2, '⚙️ 老铁（自动机）');
      return;
    }
    if (!S.inv.includes('windKey')) {
      g.say('老铁冻得硬邦邦的，胸口的炉门里一点火星都没有。它背后……有个发条孔？', 3.6);
      g.clue('bot', '自动机<b>老铁</b>冻住了。它背后有个<b>发条孔</b>——需要一把发条钥匙。');
      return;
    }
    if (!this._botThawed(g)) { g.say('发条孔里全是冰，钥匙插不进去……等暖炉把屋子再烘热一点。', 3.4); return; }
    // 上发条 → 抖着醒过来 → 在打字机上敲出最后一位
    g.take('windKey');
    S.f.keyIn = true;
    this._botBusy = true;
    bot.insertKey();
    g.audio.ratchet(10);
    g.say('咔、咔、咔……发条上满了。', 2.2);
    g._cineTo(V(0.2, 1.62, -0.55), V(1.05, 1.15, 0.28), 1.0);
    g.after(1.3, () => { bot.setState('boot'); g.audio.automatonBoot(); g._shake(0.05); S.ach.add('laotie'); });
    g.after(2.4, () => g.ui.subtitle('咔……哒……嗤——', 1.6, '⚙️ 老铁（自动机）'));
    g.after(3.8, () => {
      bot.setState('type');
      const d = S.digits[2];
      const lines = ['211 号住所', '住户：4 人', '自动机：老铁', '', '致 睡神：', `压力锁 ⚙ = ${d}`];
      this._paper = lines.slice(0, 3);
      const step = () => { this._paper = lines.slice(0, Math.min(lines.length, this._paper.length + 1)); this._drawPaper(g, true); if (this._paper.length < lines.length) g.after(0.45, step); else g.audio.typeDing(); };
      g.after(0.3, step);
      g._cineTo(V(0.95, 1.55, -0.3), V(1.43, 0.95, 0.26), 1.0);
    });
    g.after(7.2, () => {
      bot.talk(3.6); bot.after = 'idle'; g.audio.robotVoice(2.4);
      g.ui.subtitle(`早、早上好，室友。你的室友们让我转告你——压力锁第 ⚙️ 位：${S.digits[2]}。`, 4, '⚙️ 老铁（自动机）');
      g._cineTo(V(0.25, 1.55, -0.45), V(0.95, 1.3, 0.25), 0.8);
    });
    g.after(7.8, () => g.foundDigit(2, '醒过来的老铁'));
    g.after(10.8, () => { g._cineTo(null, null, 1.0); this._botBusy = false; });
  },
  _drawPaper(g, cursor = false) {
    const T = g.refs.typewriter;
    TF.drawTypewriterPaper(T.canvas, this._paper, { cursor });
    T.tex.needsUpdate = true;
  },

  // ---------- 门 ----------
  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.lockedRattle();
      g.say('门被一条结满冰碴的铁链拴住了，挂着一把黄铜压力锁……三个表盘上刻着🏭🔥⚙️？', 3.8);
      g.clue('door', '门上的<b>蒸汽压力锁</b>：三个表盘分别刻着 🏭 🔥 ⚙️。');
      g.after(1.6, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '蒸汽压力锁', variant: 'steam', labels: ['🏭', '🔥', '⚙️'],
      hint: S.found.some(Boolean) ? `已知：<b>${known}</b>` : '三个黄铜表盘上刻着熔炉、火苗和齿轮……',
      onTick: () => g.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  },
  // 鉴赏模式：开局就把锁整个拿掉
  removeLock(g) { const H = g.refs.frostLock; H.group.visible = false; H.dropped.visible = false; },
  unlockVisual(g) {
    const H = g.refs.frostLock;
    g.collision.setEnabled('lockCable', false);
    H.group.visible = false; H.dropped.visible = true;
  },
  unlock(g) {
    const S = g.S, H = g.refs.frostLock;
    S.f.unlocked = true;
    H.lamp.emissive.set('#3aff6a');
    const l = H.lock, y0 = l.position.y;
    g.audio.hiss();
    g.fx.emit('steam', l.getWorldPosition(V()).add(V(0.1, 0.05, 0)), { count: 16, speed: 0.6, spread: 0.8, up: 0.9, gravity: 0.2, drag: 1.3, life: 1.8, size: 0.14, colors: ['#f0f4f8', '#dce4ec'], grow: 2.2 });
    g.after(0.3, () => { g.audio.iceBreak(); g.fx.emit('dust', l.getWorldPosition(V()), { count: 14, speed: 0.6, spread: 1, up: 0.5, gravity: -2.5, drag: 0.8, life: 1, size: 0.025, colors: ['#e8f0fa'] }); });
    g.tween(0.5, (k) => { l.rotation.z = k * 1.5; l.position.y = y0 - k * 0.55; }, { ease: (t) => t * t, delay: 0.3, done: () => { this.unlockVisual(g); g.audio.chainDrop(); } });
    g.say('嗤——压力锁放了气，"咔哒"一声开了！', 2.6);
    g.after(1.6, () => g.win());
  },

  // ---------- 每帧（只在 play 时）----------
  update(g, dt) {
    const S = g.S, R = g.refs;
    // 冰柱化了：发条钥匙掉下来
    const heatR = R.frost.heat.uHeatR.value;
    if (this._keyState === 0 && heatR > KEY_D + 0.55) {
      this._keyState = 1;
      const K = R.keyIce;
      g.tween(2.6, (k) => { K.ice.scale.set(0.06 * (1 - k * 0.7), 0.5 * (1 - k * 0.8), 0.06 * (1 - k * 0.7)); }, { ease: (t) => t });
      for (let i = 0; i < 6; i++) g.after(i * 0.4, () => g.fx.emit('drop', K.group.position.clone().add(V(0, -0.3, 0)), { count: 1, speed: 0.05, spread: 0.1, up: 0, gravity: -6, drag: 0, life: 0.8, size: 0.025, colors: ['#d8ecff'] }));
      g.after(2.6, () => {
        this._keyState = 2;
        S.f.keyFell = true;
        const key = K.key;
        g.refs.root.attach(key);
        key.traverse((c) => { c.userData.iid = 'windKey'; });
        const p0 = key.position.clone(), p1 = V(p0.x, 0.02, p0.z);
        g.tween(0.55, (k) => { key.position.lerpVectors(p0, p1, k); key.rotation.z = 0.2 + k * 1.2; }, { ease: (t) => t * t, done: () => { key.rotation.set(Math.PI / 2, 0, 0.8); g.audio.tink(); } });
        K.ice.visible = false;
        g.audio.iceBreak();
        g.after(0.7, () => g.say('叮——冰柱化了，有什么东西掉在了地上！', 2.6));
      });
    }
  },

  // ---------- 灯光、热区、冰柱、风雪（每帧都跑）----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, FL = R.frostLights, F = R.frost;
    const kk = 1 - Math.exp(-dt * 3);
    // 暖炉：点着之后几秒火才旺起来；热区一圈圈往外扩
    if (this._litT >= 0 && g.state !== 'end') this._litT += dt;
    const lit = this._litT >= 0;
    const fire = lit ? clamp(this._litT / 2.5, 0, 1) : 0;
    const heatK = lit ? easeOut(clamp(this._litT / HEAT_T, 0, 1)) : 0;
    const heatR = HEAT_MAX * heatK;
    F.heat.uHeatR.value = heatR;
    // 熔炉超载：14 秒后慢慢退回去
    if (this._odT > 0) { this._odT -= dt; if (this._odT <= 0) this._od = 0; }
    F.overdrive = lerp(F.overdrive || 0, this._od, 1 - Math.exp(-dt * 0.8));
    const od = F.overdrive;
    const fl = 0.85 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23 + 1) * 0.05 + (Math.random() - 0.5) * 0.06;
    FL.stoveSpot.intensity = fire * 5.5 * fl;
    FL.stoveGlow.intensity = fire * 2.4 * fl;
    const St = R.stove;
    St.fireM.color.setRGB(0.08 + fire * 3.4 * fl, 0.03 + fire * 1.5 * fl, 0.01 + fire * 0.35);
    St.bellyM.emissiveIntensity = heatK * 0.28 * fl;
    // 屋里的灯
    const on = (S && S.f.lightsOn) || g.lightMode === 'end';
    g.light.spot = lerp(g.light.spot, on ? 6 : 0, 1 - Math.exp(-dt * 8));
    let spotV = g.light.spot;
    if (g.light.flicker > 0) { g.light.flicker -= dt; spotV *= Math.random() < 0.55 ? 1 : 0.1; }
    L.ceilSpots.forEach((s) => (s.intensity = spotV));
    FL.bulbM.emissiveIntensity = (spotV / 6) * 2.4;
    L.hemi.intensity = lerp(L.hemi.intensity, 0.28 + heatK * 0.08 + (on ? 0.12 : 0) + od * 0.05, kk);
    L.sun.intensity = (0.7 + od * 1.6) * (0.94 + Math.sin(t * 2.7) * 0.04);
    L.winLight.intensity = 1.4 + od * 0.5;
    g.scene.environmentIntensity = 0.07 + heatK * 0.05 + (on ? 0.04 : 0);
    // 马灯
    FL.lantern.intensity = 1.6 * fl;
    FL.flame.scale.set(1, 2.2 * fl, 1);
    FL.flameM.color.setRGB(2.4 * fl, 1.35 * fl, 0.5 * fl);
    L.wc.intensity = 2.4 * (Math.sin(t * 17) > 0.97 ? 0.3 : 1);
    // 老铁
    const bot = R.automaton;
    L.monLight.intensity = bot.eye * 0.9 + bot.fire * 0.4;
    bot.update(dt, t, { kb: R.typewriter.kbLocal, look: g.camera.position });
    // 热区里的东西：冰柱变短、镜子 / 压力表上的霜化掉、汤化开、挂钟重新走
    if (Math.abs(heatR - this._iceHeat) > 0.02) {
      this._iceHeat = heatR;
      const I = R.icicles;
      for (const ic of I.list) ic.k = clamp((ic.d - heatR + 0.9) / 1.0, 0.12, 1);
      I.layout();
      R.mirrorFrost.material.opacity = 0.94 * clamp((MIRROR_D - heatR + 0.4) / 0.8, 0, 1);
      R.mirrorFrost.visible = R.mirrorFrost.material.opacity > 0.01;
      R.gauge.frost.material.opacity = 0.85 * clamp((GAUGE_D - heatR + 0.4) / 0.6, 0, 1);
      St.soupIce.visible = heatR < 0.5;
      if (!this._clockThawed && heatR > CLOCK_D) this._clockThawed = true;
      if (heatR > 1.9 && R.frostLock.crust.visible && R.frostLock.group.visible) R.frostLock.crust.scale.setScalar(clamp(1 - (heatR - 1.9) / 0.6, 0.001, 1));
    }
    // 热区边上的冰柱在滴水
    if (lit && heatR > 0.3 && heatR < HEAT_MAX - 0.05 && Math.random() < dt * 6) {
      const I = R.icicles.list, ic = I[(Math.random() * I.length) | 0];
      if (Math.abs(ic.d - heatR) < 0.8) g.fx.emit('drop', V(ic.x, ic.y - ic.len * ic.k, ic.z), { count: 1, speed: 0.02, spread: 0.1, up: 0, gravity: -6, drag: 0, life: 0.9, size: 0.02, colors: ['#d8ecff'] });
    }
    // 窗外：暴风雪越来越大
    const storm = this._storm || 0;
    for (const s of R.snow.slice(0, 2)) { s.U.density.value = lerp(s.U.density.value, 0.7 + storm * 0.3, kk); }
    R.snow[1].U.wind.value = 3.2 * (1 + storm * 0.9 + Math.sin(t * 0.3) * 0.25);
    R.snow[0].U.wind.value = 1.8 * (1 + storm * 0.9 + Math.sin(t * 0.37) * 0.3);
    g._updateDust(dt, 0.45);
    const active = g.state === 'play' || g.state === 'cut' || g.state === 'intro';
    if (!active) return;
    // 呼出来的白气：屋里零度以下才有
    this._breathT -= dt;
    if (this._breathT <= 0) { this._breathT = 3 + Math.random() * 1.2; if (!S || this.temp(g) < 2) this._breath(g, 1); }
    // 阵风：呼——窗户咯吱响，门缝里钻进来一股雪
    this._gustT -= dt;
    if (this._gustT <= 0) {
      this._gustT = (storm ? 4 : 7) + Math.random() * (storm ? 5 : 9);
      g.audio.gust(0.8 + storm * 0.6);
      if (Math.random() < 0.6) g.after(0.8, () => g.audio.rattle());
      g.fx.emit('dust', V(-1.72, 0.08, R.door.z + (Math.random() - 0.5) * 0.5), { count: 8, speed: 0.6, spread: 0.6, up: 0.2, gravity: -0.3, drag: 1.2, life: 1.8, size: 0.016, colors: ['#eef4fc'], sway: 0.3 });
      g.fx.emit('steam', V(-1.65, 0.12, R.door.z), { count: 2, speed: 0.5, spread: 0.6, up: 0.1, gravity: 0, drag: 1.5, life: 1.8, size: 0.16, colors: ['#e0e8f2'], grow: 1.5 });
    }
    // 炉火噼啪、管子当当、东墙管子的接头漏着一点蒸汽
    if (lit) {
      this._crackT -= dt;
      if (this._crackT <= 0) { this._crackT = 0.3 + Math.random() * 1.1; if (g.camera.position.distanceTo(St.pos) < 6) g.audio.crackle(fire); }
      this._clankT -= dt;
      if (this._clankT <= 0) { this._clankT = 12 + Math.random() * 14; g.audio.clank(2); }
      this._leakT -= dt;
      if (this._leakT <= 0) { this._leakT = 0.3; g.fx.emit('steam', V(1.66, 2.62, -0.62), { count: 1, speed: 0.15, spread: 0.5, up: 0.6, gravity: 0.1, drag: 1, life: 1.6, size: 0.1, colors: ['#eef2f6'], grow: 2.8 }); }
      if (Math.random() < dt * 2) g.fx.emit('spark', St.group.position.clone().add(V(0, 2.62, -0.1)), { count: 1, speed: 0.1, spread: 0.2, up: 0.3, gravity: 0.1, drag: 1, life: 0.6, size: 0.01, colors: ['#ff9040'] });
    }
  },
  // 嘴边呼出一团白气（第一人称时往前一点，自己也看得见）
  _breath(g, k = 1) {
    const head = g.ch.J.head.getWorldPosition(_p);
    const yaw = g.ctrl.charYaw;
    _q.set(Math.sin(yaw), 0, Math.cos(yaw));
    const fwd = g.ctrl.mode === 'first' ? 0.32 : 0.14;
    head.addScaledVector(_q, fwd).add(V(0, -0.05, 0));
    g.fx.emit('steam', head, { count: Math.round(3 * k), speed: 0.14, spread: 0.3, up: 0.15, gravity: 0.06, drag: 1.6, life: 1.6, size: 0.08, colors: ['#f4f8fc', '#e4ecf4'], grow: 3 });
  },
};
