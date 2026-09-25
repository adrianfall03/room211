// 第三章：动物园 211（晚上 22:30，宿管阿姨时不时广播催熄灯）
//   门上一把爱心锁，三个转轮分别画着 🐔🐴🐵：
//   🐔 两只鸡沉迷打游戏 → 关掉桌下的插线板，鸡毛满天飞，气急败坏地报出数字
//   🐴 三匹马躺床上刷手机 → 打开大灯，“啊我的眼睛！”
//   🐵 照镜子的猴子想要个时尚单品 → 把凳子上的红白头盔送给它
import * as THREE from 'three';
import * as TT from '../core/tex_toon.js';
import { lerp, easeOutBack } from '../core/util.js';
import { toonifyScene } from '../world/toonkit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _c = new THREE.Color();

export const CH3 = {
  n: 3, theme: 'toon',
  title: '第三章 · 动物园 211', sub: '22:30 · 熄灯之前', tag: '第三章 · 动物园 211',
  clock: [22, 30], lockName: '爱心锁', codeLen: 3, codeIcons: ['🐔', '🐴', '🐵'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['horseA', 'horseB', 'horseC'],
  items: {
    helmet: { icon: '🪖', name: '红白头盔', desc: '一顶很潮的头盔（大概）。好像有只猴子会喜欢' },
  },

  init(g) {
    const R = g.refs, A = R.animals;
    for (const a of R.animalList) { a.fx = g.fx; a.audio = g.audio; }
    // 两只鸡的键盘 / 鼠标在它们自己坐标系里的位置
    const setHands = (ch, kbW, msW) => { ch.root.updateWorldMatrix(true, false); ch.kbLocal = ch.root.worldToLocal(kbW.clone()); ch.mouseLocal = ch.root.worldToLocal(msW.clone()); };
    R.desks.D1.updateWorldMatrix(true, true);
    setHands(A.chickA, R.keyboard.getWorldPosition(V()).add(V(0, 0.03, 0)), R.mouse.getWorldPosition(V()).add(V(0, 0.03, 0)));
    setHands(A.chickB, R.desks.D2.localToWorld(V(-0.05, 0.79, 0.1)), R.desks.D2.localToWorld(V(0.3, 0.79, 0.12)));
    // 插线板本来就开着（电脑在用）
    const st = R.strip.userData; st.switchMat.emissiveIntensity = 2.5; st.switch.rotation.x = -0.25;
    // 主角也变成卡通画风
    if (!g.ch.root.userData.toon) { toonifyScene(g.ch.root, { minR: 0.015, maxR: 1 }); g.ch.root.userData.toon = true; }
    g.scene.fog = null;
    g.lightMode = 'game';
    this._paT = 0;
  },

  // 进门：人从门口的光里走进来，门在身后关上，彩色的锁链一节一节自己缠回门把手上，爱心锁"啵"地扣上
  portal: 'light',
  lockView: { cam: V(-0.9, 1.1, 3.25), look: V(-1.6, 0.68, 3.68) },
  relockLine: '……锁链自己缠回去了？！又锁上了！',
  intro(g, { prepare }) {
    const A = g.refs.animals;
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    g.after(T - 0.2, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.6 }; g.ui.subtitle('……又来？', 1.6, g.S.name); });
    g.after(T + 0.8, () => {
      g._cineTo(V(-0.2, 1.7, 1.9), V(1.2, 0.95, -0.3), 2.2);
      A.chickA.talk(2.4); A.chickB.talk(2.4); A.chickA.emote.show('?', 1.6); A.chickB.emote.show('?', 1.6);
      g.audio.cluck(1.1);
    });
    g.after(T + 1.8, () => g.ui.subtitle('咯？新来的？别挡着屏幕！', 2.4, '咯咯（鸡）'));
    g.after(T + 3.4, () => { g._cineTo(V(0.3, 1.4, 1.6), V(-1.3, 0.75, -0.6), 1.8); A.horseA.talk(2); A.horseA.emote.show('note', 1.5); g.audio.giggle(); });
    g.after(T + 4.0, () => g.ui.subtitle('哈哈哈哈这条视频笑死我了……', 2.2, '马大哈（马）'));
    g.after(T + 5.6, () => { g._cineTo(V(-0.2, 1.5, 2.6), V(-0.7, 1.2, 4.4), 1.6); A.monkeyA.emote.show('star', 1.6); });
    g.after(T + 6.2, () => g.ui.subtitle('镜子镜子，谁是 211 最靓的猴？', 2.2, '猴赛雷（猴）'));
    g.after(T + 8.0, () => { g._cutPose = { lookYaw: -0.3, lookPitch: 0.1 }; g.ui.subtitle('我的室友们……变成了鸡、马和猴子？！', 2.8, g.S.name); g._cineTo(V(-0.3, 1.6, 2.4), V(-1.1, 1.2, 3.85), 1.2); });
    g.after(T + 10.6, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 11.8, () => g.beginPlay());
  },
  onSlam(g) { g.audio.sparkle(); },
  // 门锁：'hide' / 'anim'（锁链一节一节缠回去，爱心锁弹出来）/ 'show'
  relock(g, mode) {
    const H = g.refs.heartLock, l = H.lock;
    const links = H.group.children.filter((c) => c !== l);
    H.dropped.visible = false;
    l.scale.setScalar(1);
    if (mode === 'hide') { H.group.visible = false; g.collision.setEnabled('lockCable', false); return; }
    H.group.visible = true; g.collision.setEnabled('lockCable', true);
    for (const c of links) c.visible = true;
    if (mode !== 'anim') return;
    l.scale.setScalar(0.001);
    g.tween(0.5, (k) => { links.forEach((c, i) => (c.visible = i < k * links.length + 0.5)); }, { ease: (t) => t }).cut = true;
    g.after(0.35, () => g.audio.chainDrop());
    g.after(0.5, () => {
      g.audio.sparkle(); g.audio.clunk();
      g.tween(0.35, (k) => l.scale.setScalar(Math.max(0.001, easeOutBack(k))), { ease: (t) => t }).cut = true;
      g.fx.emit('heart', l.getWorldPosition(V()).add(V(0.15, 0.1, 0)), { count: 8, speed: 0.5, spread: 0.8, up: 0.9, gravity: 0.1, drag: 0.8, life: 1.4, size: 0.06, colors: ['#ff6a9a', '#ffb0c8', '#ffd36e'] });
    });
  },
  onPlay(g) {
    g.ui.toast('第三章 · 趁着还没熄灯，逃出动物园 211', '', '🌙');
    g.after(1.4, () => g.ui.subtitle('门上挂着一把爱心锁……先去门口看看。', 3.6, g.S.name));
  },
  exitLine: () => '谢谢大家！我先走一步啦！',
  onDoorOpen(g) {
    for (const a of g.refs.animalList) { a.setState('cheer'); a.emote.show('heart', 2.5); }
    g.audio.sparkle();
  },
  onEnd(g) { for (const a of g.refs.animalList) a.setState('cheer'); },

  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.triedDoor) return [{ text: '看看门上挂着的爱心锁', done: false }];
    return [
      { text: '让打游戏的🐔停下来', done: F[0] },
      { text: '让刷手机的🐴抬起头', done: F[1] },
      { text: '让照镜子的🐵满意', done: F[2] },
      { text: f.unlocked ? '出门！' : `打开爱心锁（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found;
    if (!f.triedDoor) return '去门口看看那把爱心锁，三个转轮上画着鸡、马、猴。';
    if (!F[0]) return f.talkedChick ? '两只鸡的电脑插在书桌底下的插线板上……关掉它试试？' : '先去跟书桌前打游戏的两只鸡聊聊。';
    if (!F[1]) return f.talkedHorse ? '屋里黑黢黢的，只有手机屏幕亮着……门边墙上有电灯开关。' : '床上躺着三匹刷手机的马，去跟它们说说话。';
    if (!F[2]) {
      if (!f.talkedMonkey) return '穿衣镜前有只猴子在摆造型，跟它聊聊。';
      if (!S.inv.includes('helmet') && !f.gaveHelmet) return '猴子想要个酷炫的头盔——门边凳子上就有一顶红白头盔。';
      return '把红白头盔送给穿衣镜前的猴子。';
    }
    return `密码凑齐了！去门口，按🐔🐴🐵的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S;
    const pa = (key, text) => { if (S.msgSent[key]) return; S.msgSent[key] = true; g.audio.pa(); g.after(1.1, () => g.ui.subtitle(text, 3.6, '📢 宿管阿姨')); };
    if (p > 0.5) pa('half', '同学们注意——快熄灯了！打游戏的、刷手机的，都给我收一收！');
    if (p > 0.8) pa('late', '照镜子的那位同学，别照啦！马上熄灯了！');
  },

  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label, verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const F = {
      pinkBag: ['粉色纸袋', '纸袋里塞满了玉米粒……鸡们的储备粮？'],
      foldTable: ['折叠桌', '门边的小桌子，被刷成了薄荷绿。'],
      broom: ['扫把', '扫把上画了一张笑脸。'],
      blackTable: ['杂物桌', '一桌子零食：玉米片、胡萝卜干、香蕉……'],
      bedW1: ['马大哈的床', '马大哈四仰八叉地躺着刷手机，被子踢到了一边。'],
      fallenBooks: ['掉在地上的书', '书架前的地上掉着三本书……今天晚上也有书自己掉下来？'],
      bedW2: ['马赛克的床', '马赛克缩在蚊帐里侧着身子刷视频，笑得直抖。'],
      shelf: ['书架', '书架上全是漫画：《鸡械师》《马到成功》《猴王出世》……'],
      shoeRack: ['鞋架', '鞋架上摆着四双蹄子用的鞋、两双鸡爪套，还有一双猴子的豆豆鞋。'],
      storageBox: ['收纳箱', '收纳箱上贴着“猴赛雷的衣帽间，别碰”。'],
      polkaBag: ['收纳袋', '一袋子各式各样的墨镜。'],
      box350: ['纸箱', '纸箱上画了个笑脸。'],
      bedE1: ['我的床', '我的床……被气球占领了。'],
      patternRoll: ['凉席卷', '粉白格子的凉席卷，靠在床边。'],
      bedE2: ['马上睡的床', '马上睡趴在上铺刷手机，两条后腿在空中晃来晃去。'],
      farDesks: ['窗边书桌', '窗边的书桌上有一盏蘑菇小夜灯和几盆仙人掌。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子。'],
      toteBag: ['红色袋子', '红色的大袋子，里面是……香蕉，满满一袋。'],
      redBag: ['红色收纳包', '收纳包上贴着一张便签：“马上睡的零食，偷吃者踢！”'],
      paper: ['复习资料', '复习资料上全是鸡爪印。'],
      mouse: ['鼠标', '咯咯的鼠标，按键已经被啄得发亮。'],
      pcTower: ['主机', '主机上的彩灯一闪一闪，风扇转得呼呼响。'],
      stoolMe: ['凳子', '咯咯坐在上面，脚丫子够不着地。'],
      keyboard: ['键盘', '键盘上沾着玉米粒。'],
      phone: ['手机', '我的手机……锁屏壁纸变成了一只小鸡。'],
      calendar: ['台历', '台历上画满了小动物。今天那一栏写着：“熄灯前记得刷牙”。'],
      notebook: ['笔记本', '笔记本上画着一只戴头盔的猴子，旁边写着：“梦想造型”。'],
      apple: ['苹果', '一个亮晶晶的卡通苹果。'],
      drawer: ['抽屉', '抽屉里是一叠猴赛雷的自拍照。'],
      suitcase: ['行李箱', '行李箱上贴满了贴纸。'],
      stoolH: ['木凳', '门边的木凳，上面放着一顶红白头盔。'],
      ac: ['空调', '空调吹出来的风是甜的。'],
      basket: ['脏衣篓', '脏衣篓里全是马的袜子——四只一套。'],
      curtain: ['窗帘', '窗帘拉开着，外面的月亮在打瞌睡。'],
      window: ['窗户', '窗外的月亮在打瞌睡，对面楼的窗户里都是小动物的影子。'],
      roster: ['值日表', '值日表：周一 咯咯　周二 马大哈　周三 猴赛雷　周四 （我？）……'],
      clock: ['挂钟', ''],
      wcMirror: ['镜子', '镜子被美猴占着，它正一边刷牙一边对镜子抛媚眼。'],
      shower: ['花洒', '花洒是个向日葵形状的。'],
      graffiti: ['隔板涂鸦', '隔板上写着“窗外有猴!!”……旁边多了一行：“我们就是猴！”'],
      towels: ['毛巾', '四条毛巾，分别绣着 🐔🐴🐵 和一个问号。'],
      wcBucket: ['水桶和拖把', '水桶里泡着一只橡皮鸭。'],
      bin: ['垃圾桶', '垃圾桶里全是香蕉皮和玉米棒子。'],
      remote: ['空调遥控器', '遥控器上的按钮是糖果做的？'],
      folder: ['文件夹', '《通宵攻略——咯咯倾情整理》'],
      headset: ['耳机', '一副多出来的电竞耳机，耳罩上画着小鸡。'],
      monitor2: ['显示器', '哒哒在用这台电脑打游戏。'],
      monitor: ['我的电脑', '咯咯在用我的电脑打游戏……还开着我的号！'],
      poster_chicken: ['海报', '海报：“鸡不可失”——咯咯哒电竞战队。'],
      poster_horse: ['海报', '海报：“马上暴富”——刷完这条就睡（骗你的）。'],
      poster_monkey: ['海报', '海报：“猴赛雷”——全宿舍最靓的仔。'],
      poster_sleep: ['海报', '海报：“早睡早起”……“早睡”两个字被划掉了。'],
      plant: ['龟背竹', '一大盆龟背竹，叶子上挂着一只小鸡的袜子。'],
      bedE1b: ['', ''],
    };
    for (const [id, [l, t]] of Object.entries(F)) H[id] = flav(l, t);
    H.clock = { label: '挂钟', verb: '看时间', reach: false, act: () => g.say(`${g.clockText}……23:00 熄灯，还有 ${30 - g.storyMinutes()} 分钟！`) };
    H.popcorn = { label: '爆米花', verb: '吃一口', act: () => {
      if (S().f.popcorn) { g.say('爆米花已经被鸡们吃光了。'); return; }
      S().f.popcorn = true; S().freeHints++;
      g.audio.crunch();
      g.say('咔嚓咔嚓——甜的！（下一次提示免费）', 3);
      g.refs.animals.chickA.emote.show('anger', 1.2);
    } };
    // ---- 🐔 ----
    const talkChick = (a) => () => {
      const s = S();
      a.talk(2.8);
      g.audio.cluck(a === g.refs.animals.chickB ? 1.15 : 1);
      if (s.found[0]) {
        if (s.f.powerCut) g.ui.subtitle('咯咯咯！还不快把电插回去！！', 2.6, `${a.name}（鸡）`);
        else g.ui.subtitle('咯咯哒！这把稳了！', 2.4, `${a.name}（鸡）`);
        return;
      }
      s.f.talkedChick = true;
      const lines = ['别吵别吵！决赛圈！', '咯？门锁？打完这把再说！', 'BOSS 战！别挡着我屏幕！', '这把赢了我就告诉你……才怪！'];
      g.ui.subtitle(lines[(g._chickN = (g._chickN || 0) + 1) % lines.length], 2.6, `${a.name}（鸡）`);
      g.clue('chick', '两只鸡沉迷打游戏，根本不理人……它们的电脑插在书桌底下的<b>插线板</b>上。');
    };
    H.chickA = { label: '咯咯（鸡）', verb: '聊天', reach: false, act: talkChick(g.refs.animals.chickA) };
    H.chickB = { label: '哒哒（鸡）', verb: '聊天', reach: false, act: talkChick(g.refs.animals.chickB) };
    H.chick = { label: '小黄（小鸡）', verb: '摸摸头', act: () => {
      const a = g.refs.animals.chick;
      a.pet(); g.audio.chirp(); g.audio.chirp();
      g.fx.emit('heart', a.root.getWorldPosition(V()).add(V(0, 0.3, 0)), { count: 5, speed: 0.4, spread: 0.4, up: 0.8, gravity: 0.2, drag: 0.8, life: 1.4, size: 0.06, colors: ['#ff6a9a', '#ffb0c8'] });
      S().ach.add('chick');
      g.ui.subtitle(['叽！叽叽！（开心）', '叽叽叽～（蹭蹭你的手）', '叽！（小黄说：鸡哥们打游戏太吵了）'][(g._petN = (g._petN || 0) + 1) % 3], 2.4, '小黄');
    } };
    H.strip = { label: '插线板', verb: () => (S().f.powerCut ? '重新打开' : '关掉开关'), act: () => this.togglePower(g) };
    // ---- 🐴 ----
    const talkHorse = (a) => () => {
      const s = S();
      a.talk(2.6);
      if (s.found[1]) {
        g.ui.subtitle(s.f.lightsOn ? '眼睛……眼睛要瞎了……快关灯……' : '嘿嘿，这条视频也好好笑。', 2.6, `${a.name}（马）`);
        return;
      }
      s.f.talkedHorse = true;
      g.audio.neigh();
      const lines = ['嗯……（头都没抬）', '别吵，这条视频马上看完了。', '哈哈哈哈哈哈这只猴子好好笑……你说啥？', '再刷五分钟就睡……（已经说了三个小时）'];
      g.ui.subtitle(lines[(g._horseN = (g._horseN || 0) + 1) % lines.length], 2.6, `${a.name}（马）`);
      g.clue('horse', '三匹马躺在床上刷手机，屋里黑黢黢的，只有手机屏幕亮着……');
    };
    for (const id of ['horseA', 'horseB', 'horseC']) { const a = g.refs.animals[id]; H[id] = { label: `${a.name}（马）`, verb: '聊天', reach: false, act: talkHorse(a) }; }
    H.switch = { label: '电灯开关', verb: () => (S().f.lightsOn ? '关灯' : '开灯'), act: () => this.toggleLight(g) };
    // ---- 🐵 ----
    const A = g.refs.animals;
    H.monkeyA = { label: '猴赛雷（猴）', verb: () => (S().inv.includes('helmet') ? '送它红白头盔' : '聊天'), reach: false, act: () => this.talkMonkey(g) };
    H.monkeyB = { label: '美猴（猴）', verb: '聊天', reach: false, act: () => {
      A.monkeyB.setState('talk');
      g.audio.monkey(1.2);
      const lines = ['别看我，我在刷牙。', '门口那只（猴赛雷）最爱时尚单品了。', '门边凳子上那顶红白头盔……猴赛雷肖想很久了。'];
      g.ui.subtitle(lines[(g._mbN = (g._mbN || 0) + 1) % lines.length], 2.8, '美猴（猴）');
      if (g._mbN % 3 === 0) g.clue('helmetHint', '美猴说：猴赛雷肖想门边凳子上那顶<b>红白头盔</b>很久了。');
    } };
    H.helmet = { label: '红白头盔', verb: '拿上', act: () => {
      g.give('helmet'); g.refs.helmet.visible = false;
      g.say('红白头盔……好像有只猴子会喜欢？', 2.8);
    } };
    H.mirror = { label: '穿衣镜', verb: '查看', reach: false, act: () => g.say('穿衣镜被猴赛雷霸占了，镜子边上一圈小灯泡亮晶晶的。', 3) };
    // ---- 门、洗手间 ----
    H.door = { label: '爱心锁', verb: () => (S().f.unlocked ? '出门' : '开锁'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '洗手间门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '洗把脸', act: () => {
      g.washFace();
      g.fx.emit('dust', g.refs.sink.group.getWorldPosition(V()).add(V(0.3, 0.95, -0.2)), { count: 14, speed: 0.4, spread: 0.6, up: 0.6, gravity: 0.15, drag: 0.8, life: 2.2, size: 0.08, colors: ['#bfe8ff', '#ffc2e0', '#fff3a8'], sway: 0.2 });
    } };
    H.toilet = { label: '厕所', verb: '冲水', act: () => {
      g.flushToilet();
      g.fx.emit('dust', V(-1.2, 0.3, 5.7), { count: 24, speed: 0.6, spread: 0.6, up: 1.2, gravity: 0.1, drag: 0.8, life: 2.4, size: 0.09, colors: ['#bfe8ff', '#ffc2e0', '#fff3a8', '#c9ffb8'], sway: 0.3 });
    } };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只猴子揉着眼睛，还在摆造型……'); return; }
      O.trigger(4.5); g.audio.monkey(); g.after(0.8, () => g.audio.monkey(1.25));
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>树上打呼噜的三只猴子</b>', 'clue', '🐒'); }
      g.say('窗外树上挂满了彩灯，三只猴子被吵醒了，揉着眼睛摆了个“三不猴”……', 3.8);
    } };
    return H;
  },

  togglePower(g) {
    const S = g.S, R = g.refs, A = R.animals, st = R.strip.userData;
    S.f.powerCut = !S.f.powerCut;
    g.audio.switchClick();
    st.switchMat.emissiveIntensity = S.f.powerCut ? 0 : 2.5;
    st.switch.rotation.x = S.f.powerCut ? 0.25 : -0.25;
    for (const s of R.gameScreens) s.off = S.f.powerCut;
    if (S.f.powerCut) {
      for (const a of [A.chickA, A.chickB]) {
        a.setState('rage'); a.emote.show('anger', 2.4);
        const p = a.root.getWorldPosition(V()).add(V(0, 0.9, 0));
        g.fx.emit('feather', p, { count: 40, speed: 1.3, spread: 1.3, up: 1.1, gravity: -0.35, drag: 1.6, life: 4.5, size: 0.07, colors: ['#ffffff', '#fff6e0', '#ffe8b0'], spin: 4, sway: 0.5 });
        for (let k = 1; k <= 3; k++) g.after(k * 0.5, () => g.fx.emit('feather', a.root.getWorldPosition(V()).add(V(0, 0.9, 0)), { count: 14, speed: 1, spread: 1.2, up: 1, gravity: -0.35, drag: 1.6, life: 4, size: 0.065, colors: ['#ffffff', '#fff6e0'], spin: 4, sway: 0.5 }));
      }
      g.audio.bawk(); g.after(0.25, () => g.audio.bawk()); g.after(0.5, () => g.audio.cluck(1.3));
      g._shake(0.15);
      S.ach.add('feather');
      g.say('啪——两台电脑同时黑屏了。', 2);
      if (!S.found[0]) {
        g.after(2.8, () => {
          g.ui.subtitle(`咯咯咯咯！！谁拔的电！！……好好好，爱心锁🐔那一位是 ${S.digits[0]}！赶紧把电插回去！！`, 4.2, '咯咯（鸡）');
          A.chickA.talk(3.5); A.chickB.emote.show('anger', 1.5);
        });
        g.after(3.2, () => g.foundDigit(0, '被拔了电的咯咯'));
      }
    } else {
      for (const a of [A.chickA, A.chickB]) { a.setState('game'); a.emote.show('heart', 1.4); }
      g.audio.bootChime();
      g.say('插线板又亮了，两只鸡欢呼着重新开了一局。', 3);
    }
  },
  toggleLight(g) {
    const S = g.S, A = g.refs.animals;
    g.toggleLights();
    const horses = [A.horseA, A.horseB, A.horseC];
    if (S.f.lightsOn) {
      for (const h of horses) { h.setState('blind'); h.emote.show('!', 1.6); }
      g.audio.neigh(); g.after(0.3, () => g.audio.neigh());
      if (!S.found[1]) {
        g.after(2.6, () => {
          g.ui.subtitle(`啊啊啊我的眼睛！！……好好好，🐴那一位是 ${S.digits[1]}！快关灯！！`, 4.2, '马大哈（马）');
          A.horseA.talk(3.5);
        });
        g.after(3.0, () => g.foundDigit(1, '被灯晃瞎眼的马大哈'));
      }
    } else {
      for (const h of horses) { h.setState('scroll'); h.emote.show('heart', 1.2); }
    }
  },
  talkMonkey(g) {
    const S = g.S, A = g.refs.animals, m = A.monkeyA;
    if (S.inv.includes('helmet') && !S.f.gaveHelmet) {
      S.f.gaveHelmet = true;
      g.take('helmet');
      const h = g.refs.helmet;
      h.visible = true;
      m.wearHelmet(h);
      m.setState('talk');
      g.audio.sparkle(); g.audio.monkey(1.3);
      g.fx.emit('star', m.head.getWorldPosition(V()).add(V(0, 0.25, 0)), { count: 18, speed: 0.9, spread: 1, up: 0.8, gravity: -0.5, drag: 1, life: 1.6, size: 0.07, colors: ['#ffd36e', '#ffffff', '#ff8fb1'], spin: 3 });
      g.ui.subtitle(`哇！！！这个造型绝了！！看在头盔的份上——🐵那一位是 ${S.digits[2]}！`, 4, `${m.name}（猴）`);
      S.ach.add('fashion');
      g.after(0.6, () => g.foundDigit(2, '戴上头盔的猴赛雷'));
      g.after(3.3, () => m.setState('proud'));
      return;
    }
    m.setState('talk');
    g.audio.monkey(1.15);
    if (S.found[2]) { g.ui.subtitle('这头盔……我能戴一辈子。', 2.4, `${m.name}（猴）`); return; }
    S.f.talkedMonkey = true;
    const lines = ['别挡着我，我在欣赏全宇宙最帅的猴。', '门锁？你看我这个造型，是不是还差点什么？', '要是有个酷炫的头盔就好了……红白配色的那种。'];
    g.ui.subtitle(lines[(g._maN = (g._maN || 0) + 1) % lines.length], 3, `${m.name}（猴）`);
    if (g._maN >= 2) g.clue('monkey', '照镜子的猴赛雷想要一个<b>酷炫的头盔</b>，红白配色的那种。');
  },

  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.lockedRattle();
      g.say('门被一串糖果色的链子拴住了，挂着一把爱心锁……三个转轮上画着🐔🐴🐵？', 3.8);
      g.clue('door', '门上的<b>爱心锁</b>：三个转轮上分别画着 🐔 🐴 🐵——得去问问它们。');
      g.after(1.6, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '爱心锁', variant: 'candy', labels: ['🐔', '🐴', '🐵'],
      hint: S.found.some(Boolean) ? `已知：<b>${known}</b>` : '三个转轮上画着鸡、马、猴……',
      onTick: () => g.audio.tick(),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  },
  // 鉴赏模式：开局就把锁整个拿掉
  removeLock(g) { const H = g.refs.heartLock; H.group.visible = false; H.dropped.visible = false; },
  unlockVisual(g) {
    const H = g.refs.heartLock;
    g.collision.setEnabled('lockCable', false);
    H.group.visible = false; H.dropped.visible = true;
  },
  unlock(g) {
    const S = g.S, H = g.refs.heartLock;
    S.f.unlocked = true;
    const l = H.lock, y0 = l.position.y;
    g.tween(0.5, (k) => { l.rotation.z = k * 1.5; l.position.y = y0 - k * 0.55; }, { ease: (t) => t * t, done: () => { this.unlockVisual(g); g.audio.sparkle(); } });
    g.fx.emit('heart', l.getWorldPosition(V()).add(V(0.1, 0.1, 0)), { count: 10, speed: 0.6, spread: 0.8, up: 1, gravity: 0.1, drag: 0.8, life: 1.8, size: 0.07, colors: ['#ff6a9a', '#ffb0c8', '#ffd36e'] });
    g.say('咔哒——爱心锁开了！', 2.4);
    for (const a of g.refs.animalList) a.emote.show('star', 1.5);
    g.after(1.4, () => g.win());
  },

  update(g, dt) {},

  // ---------- 灯光 + 动物 ----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, TL = R.toonLights;
    const kk = 1 - Math.exp(-dt * 4);
    const lightsOn = (S && S.f.lightsOn) || g.lightMode === 'end';
    const power = !(S && S.f.powerCut);
    let spot = lightsOn ? 11 : 0, tube = lightsOn ? 2.4 : 0;
    g.light.spot = lerp(g.light.spot, spot, 1 - Math.exp(-dt * 8));
    let spotV = g.light.spot, tubeV = tube;
    if (g.light.flicker > 0) { g.light.flicker -= dt; const on = Math.random() < 0.55 ? 1 : 0.1; spotV *= on; tubeV *= on; }
    L.ceilSpots.forEach((s) => (s.intensity = spotV));
    L.tubeMats.forEach((m) => (m.emissiveIntensity = tubeV));
    L.hemi.intensity = lerp(L.hemi.intensity, lightsOn ? 0.75 : 0.62, kk);
    L.sun.intensity = 0.85;
    L.winLight.intensity = 1.3;
    g.scene.environmentIntensity = 0.25;
    R.ceilMat.emissiveIntensity = lerp(R.ceilMat.emissiveIntensity, lightsOn ? 0.15 : 0.85, kk);
    const hue = (t * 0.08) % 1;
    L.monLight.color.setHSL(hue, 0.8, 0.6); L.monLight.intensity = power ? 0.75 + Math.sin(t * 9) * 0.12 : 0;
    TL.glow2.color.setHSL((hue + 0.5) % 1, 0.8, 0.6); TL.glow2.intensity = power ? 0.7 + Math.sin(t * 7) * 0.12 : 0;
    TL.vanity.intensity = 0.9 + Math.sin(t * 3) * 0.08;
    TL.fairyL.intensity = 1.1 + Math.sin(t * 1.7) * 0.15;
    const A = R.animals;
    TL.phoneA.intensity = A.horseA.state === 'scroll' ? 0.9 : 0;
    TL.phoneB.intensity = A.horseB.state === 'scroll' ? 0.9 : 0;
    L.wc.intensity = 1.8;
    L.monLight.position.set(1.32, 1.1, 0.28);
    for (const b of TL.bulbs) b.material.color.setHSL(0.11, 0.9, 0.72 + Math.sin(t * 4) * 0.04);
    g._updateDust(dt, 0.7);
    // 动物
    const cam = g.camera.position;
    const head = g.ch.J.head.getWorldPosition(_p);
    const ctx = { player: head, near: (a) => a.root.getWorldPosition(V()).distanceTo(cam) < 5 };
    for (const a of R.animalList) {
      if (a.kind === 'chicken') { ctx.kbLocal = a.kbLocal; ctx.mouseLocal = a.mouseLocal; }
      a.update(dt, t, ctx);
    }
  },
};
