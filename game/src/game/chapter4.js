// 第四章：太空舱 211（近地轨道 408 km，失重）
//   气闸舱门上是一个三位数的授权码面板：
//   🤖 失控的机器人小圆在天花板附近打转 → 按住空格飘上去抓住它，它重启后告诉你第一位
//   💧 洗手间里飘着一颗大水球，里面泡着一张纸条 → 一口一口把水球喝掉
//   🌍 室友说第三位"写在地球上" → 打开遮光板，等太空舱绕到地球背面（地球"关灯"），城市灯光拼出了数字
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, smoothstep } from '../core/util.js';
import { ensureToonStyle } from '../world/toonkit.js';
import * as TS from '../core/tex_space.js';
import { addPortal } from './chapter2.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _q = V(), _c = new THREE.Color();
const ORBIT = 100; // 绕地球一圈（秒），真实的是 90 分钟

const SPACE_PORTAL = /* glsl */ `
  uniform float time; varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5; c.x *= 0.5;
    float r = length(c) * 2.0, a = atan(c.y, c.x);
    float rays = pow(abs(sin(a * 10.0 - time * 2.0)), 8.0) * 0.5;
    vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), smoothstep(0.8, 0.0, r));
    float alpha = smoothstep(1.05, 0.25, r) + rays * smoothstep(1.2, 0.35, r);
    gl_FragColor = vec4(col * alpha * 2.0, alpha);
  }`;

// 轨道相位 → 太阳绕舱转的角度：满地球和日食附近走得慢，中间的月牙阶段走得快
const thetaOf = (p) => Math.PI * 2 * p - 0.4 * Math.sin(Math.PI * 4 * p);

export const CH4 = {
  n: 4, theme: 'space',
  title: '第四章 · 太空舱 211', sub: '近地轨道 408 km · 失重', tag: '第四章 · 太空舱 211',
  clock: [3, 0], label: '氧气剩余', lockName: '气闸舱门', codeLen: 3, codeIcons: ['🤖', '💧', '🌍'],
  limit: { easy: 15 * 60, normal: 10 * 60, hard: 6 * 60 },
  big: ['sleeperA', 'sleeperB', 'sleeperC', 'waterBall', 'signZeroG'],
  failTitle: '氧气耗尽……',
  failCard: 'O₂ 0%<small>警报声越来越远……你在失重中慢慢闭上了眼睛</small>',
  failText: '氧气耗尽。你和三个室友一起裹着睡袋在太空舱里飘了一整夜……恭喜解锁结局：『太空睡神』。',
  items: {},

  clockText(g) {
    const S = g.S;
    return `O₂ ${Math.max(0, Math.ceil(100 * (1 - S.elapsed / S.limit)))}%`;
  },
  // 任务钟：从 03:00:00 开始走
  clockHands(g) {
    const e = g.S ? g.S.elapsed : 0;
    return { h: 3 + e / 3600, m: (e / 60) % 60, s: e % 60 };
  },

  init(g) {
    const R = g.refs, S = g.S;
    ensureToonStyle(g.ch.root, 'anime');
    // 动画里的黑头发带一点蓝紫色的光泽，不然背光时是一整块黑
    g.ch.root.traverse((o) => { if (o.isMesh && o.userData.origMat === g.ch.mats.hairMat && o.material.isMeshToonMaterial) o.material.color.set('#2b2636'); });
    g.ctrl.float = 1; g.ctrl.floatTarget = 0.35;
    g.scene.fog = null;
    g.lightMode = 'game';
    R.spaceSky.drawDigit(S.digits[2]);
    // 水球里的纸条
    const W = R.waterBall, c = W.noteCanvas, x = c.getContext('2d');
    x.fillStyle = '#fff6c8'; x.fillRect(0, 0, 128, 96); x.strokeStyle = '#e8c860'; x.lineWidth = 3; x.strokeRect(3, 3, 122, 90);
    x.fillStyle = '#2a6fd8'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.fillText('💧 =', 40, 58);
    x.fillStyle = '#e8202a'; x.font = 'bold 56px sans-serif'; x.fillText(String(S.digits[1]), 88, 70);
    W.noteTex.needsUpdate = true;
    this._phase = 0.08; this._lapse = null; this._alarm = 0; this._speed = 0; this._fail = false; this._look = 0; this._pa = 0;
    this._drawKeypad(g, 'locked');
    const rb = R.robot; rb.state = 'tumble'; rb.mode = 'dizzy';
  },

  _drawKeypad(g, mode) {
    const K = g.refs.hatch.keypad, c = K.canvas, x = c.getContext('2d'), S = g.S;
    x.fillStyle = '#0b1a33'; x.fillRect(0, 0, 128, 160);
    const col = mode === 'open' ? '#7fffb0' : mode === 'error' ? '#ff6a7a' : '#7fe8ff';
    x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(6, 6, 116, 40);
    x.fillStyle = col; x.font = 'bold 22px sans-serif'; x.textAlign = 'center';
    x.fillText(mode === 'open' ? 'OPEN' : S.digits.map((d, i) => (S.found[i] ? '•' : '_')).join(' '), 64, 34);
    x.font = 'bold 12px sans-serif'; x.fillText(mode === 'open' ? 'AIRLOCK READY' : 'AIRLOCK LOCKED', 64, 62);
    for (let i = 0; i < 12; i++) {
      const bx = 14 + (i % 3) * 36, by = 72 + Math.floor(i / 3) * 21;
      x.fillStyle = 'rgba(127,232,255,0.18)'; x.fillRect(bx, by, 30, 17);
      x.fillStyle = col; x.font = 'bold 12px sans-serif'; x.fillText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '✕', '0', '✓'][i], bx + 15, by + 13);
    }
    K.tex.needsUpdate = true;
  },

  intro(g, { prepare }) {
    const R = g.refs, D = R.door, [A, B, C] = g.S.mates;
    if (prepare) {
      g.ctrl.float = 1; g.ctrl.floatTarget = 0.35;
      g.ctrl.teleport(-1.62, 4.0, Math.PI / 2);
      g.ctrl.yaw = Math.PI / 2 + Math.PI; g.ctrl.pitch = -0.05;
      g.ch.root.position.set(-1.62, 0.35, 4.0); g.ch.root.rotation.y = Math.PI / 2;
      g.ch.setExpression('focus');
      D.pivot.rotation.y = D.base + D.openAngle;
      g._cineSet(V(-0.3, 1.95, 2.5), V(-1.3, 1.55, 3.95));
      return;
    }
    g.auto = { path: [V(-1.0, 0, 3.85)], speed: 0.8, i: 0 };
    g._afterReach = null;
    g.after(0.9, () => { g.tween(0.45, (k) => (D.pivot.rotation.y = D.base + D.openAngle * (1 - k))); g.audio.hiss(); });
    g.after(1.5, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.3, lookPitch: -0.2 }; g.ui.subtitle('……嗯？脚底下怎么空空的？', 1.8, g.S.name); });
    g.after(3.0, () => {
      this.speedLines(g, 1.2);
      g._shake(0.12);
      g.ui.subtitle('我……我飘起来了？！', 2.0, g.S.name);
      g._cineTo(V(-0.35, 2.05, 3.5), V(-0.98, 1.95, 3.85), 0.6);
    });
    g.after(5.0, () => {
      const rp = R.robot.root.position;
      g._cutPose = { lookYaw: 0.9, lookPitch: 0.35 };
      g._cineTo(rp.clone().add(V(0.5, -0.12, 0.75)), rp.clone(), 1.6);
      R.robot.emote.show('!', 1.4); g.audio.robotBeep(3);
    });
    g.after(5.8, () => g.ui.subtitle('警……警告……陀螺仪……失、失、失控……', 2.4, '？？？（机器人）'));
    g.after(8.3, () => {
      g._cutPose = { lookYaw: -0.2, lookPitch: 0.25 };
      g._cineTo(V(-0.25, 2.25, 1.55), V(-1.28, 2.0, 0.1), 1.6);
      for (const s of R.sleepers) s.emote.show('zzz', 2.4, 0.24);
      g.audio.snore();
    });
    g.after(9.0, () => g.ui.subtitle(`${A}、${B}、${C}……你们怎么都裹着睡袋飘在床上？！`, 2.8, g.S.name));
    g.after(11.8, () => {
      g._cineTo(V(-0.4, 1.9, 2.6), V(-1.2, 1.5, 3.8), 1.4);
      g.audio.pa();
      g.ui.subtitle(`【211 舱广播】早上好。生命维持系统故障，舱内氧气将在 ${Math.round(g.S.limit / 60)} 分钟后耗尽。请乘员立即经气闸舱撤离。`, 4.2, '📢 舱内广播');
    });
    g.after(16.2, () => { g._cutPose = null; g.ch.setExpression('neutral'); g.ui.subtitle('气闸舱门……又是密码锁。这回是太空版的密室逃脱？', 2.6, g.S.name); g._cineTo(null, null, 1.2); });
    g.after(17.6, () => g.beginPlay());
  },
  onPlay(g) {
    g.ui.toast('第四章 · 在<b>氧气耗尽</b>之前打开气闸舱门', '', '🧑‍🚀');
    g.after(1.6, () => g.ui.toast('失重操作：按住 <kbd>空格</kbd> 上浮 · 按住 <kbd>C</kbd> 下沉 · 松手还会往前飘', '', '🪐'));
    g.after(3.2, () => g.ui.subtitle('先去门口看看那个密码面板……窗户的遮光板也还关着。', 3.6, g.S.name));
  },
  exitLine: () => '小圆，替我跟他们说声再见！',
  onDoorOpen(g) {
    addPortal(g, SPACE_PORTAL);
    g.refs.lights.corridor.color.set('#cfe8ff');
    const rb = g.refs.robot;
    rb.mode = 'happy'; rb.emote.show('heart', 2.4);
    for (const s of g.refs.sleepers) s.emote.show('zzz', 2, 0.24);
    g.refs.floaters.impulse(0.5, V(-0.5, 0.1, 0.3));
    this.speedLines(g, 1.6);
    g.audio.hiss(); g.audio.sparkle();
    g.fx.emit('dust', V(-1.5, 1.2, g.refs.door.z), { count: 40, speed: 0.8, spread: 1, up: 0.4, gravity: 0, drag: 1.2, life: 2.2, size: 0.12, colors: ['#ffffff', '#dff4ff'], sway: 0.2 });
  },
  onEnd() {},
  onFail(g) {
    g.audio.alarm(3);
    this._fail = true;
    g.S.f.alarm = true;
  },

  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.triedDoor) return [{ text: '去看看门口的气闸舱门', done: false }];
    return [
      { text: '🤖 让失控的机器人冷静下来', done: F[0] },
      { text: '💧 找到泡在水里的那一位', done: F[1] },
      { text: '🌍 找到"写在地球上"的那一位', done: F[2] },
      { text: f.unlocked ? '出舱！' : `打开气闸舱门（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found;
    if (!f.triedDoor) return '去门口看看那扇气闸舱门，门框边上有个密码面板。';
    if (!F[0]) return '天花板附近有个转个不停的机器人……按住空格飘上去，抓住它！';
    if (!F[1]) return f.talkedB ? '洗手间里飘着一颗大水球，里面泡着一张纸条……一口一口把它喝掉。' : '去听听上铺的室友们在说什么梦话，或者问问小圆。';
    if (!F[2]) {
      if (!f.curtainOpen) return '窗户的遮光板还关着——先打开它看看外面。';
      return '等太空舱绕到地球背面、地球"关灯"的时候，看看城市的灯光。（对着窗户"看风景"可以快进）';
    }
    return `授权码凑齐了！去门口的密码面板，按🤖💧🌍的顺序输入：${S.digits.join('')}`;
  },
  timed(g, remain, frac) {
    const S = g.S;
    const pa = (key, text, cb) => { if (S.msgSent[key]) return; S.msgSent[key] = true; g.audio.pa(); g.after(1.0, () => { g.ui.subtitle(text, 3.8, '📢 舱内广播'); cb && cb(); }); };
    if (frac < 0.72) pa('o2', `氧气剩余 ${Math.round(frac * 100)}%。请乘员保持冷静，减少剧烈运动。`);
    if (frac < 0.5) pa('debris', '警告！太空碎片接近——正在执行规避机动！请抓紧扶手！', () => this.debris(g));
    if (remain < 120) pa('last', '氧气即将耗尽！请立即撤离！重复，请立即撤离！', () => { S.f.alarm = true; });
  },

  // 太空碎片擦过：警报、摇晃、东西满屋乱飞、集中线
  debris(g) {
    this._alarm = 4.5;
    g.audio.alarm(4);
    g._shake(0.5);
    this.speedLines(g, 1.4);
    g.refs.floaters.impulse(1.1);
    g.refs.robot.emote.show('!', 1.5);
    for (const s of g.refs.sleepers) s.emote.show('!', 1.2, 0.24);
    g.after(1.2, () => g.ui.subtitle('哇啊啊啊——！！', 1.6, g.S.name));
  },
  // 动画里的"眼缘"：找到一位密码时，屏幕上"啪"地弹出一格漫画分镜
  eyecatch(g, icon, digit, text = 'GET!') {
    const el = document.createElement('div');
    el.className = 'eyecatch';
    el.innerHTML = `<div class="ec-burst"></div><div class="ec-ic">${icon}</div><div class="ec-d">${digit}</div><div class="ec-get">${text}</div>`;
    document.body.appendChild(el);
    g.audio.sparkle();
    setTimeout(() => el.classList.add('out'), 1500);
    setTimeout(() => el.remove(), 2100);
  },
  speedLines(g, dur = 1) {
    const G = g.gfx.grade;
    g.tween(dur, (k) => { G.speed = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.9 + (k < 0.7 ? 0.1 : 0); }, { ease: (t) => t, done: () => (G.speed = 0) });
  },

  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label, verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const F = {
      pinkBag: ['货物袋', '一袋真空包装的零食，标签上写着"太空辣条"。'],
      foldTable: ['折叠桌', '门边的小桌子被魔术贴牢牢粘在地板上。'],
      broom: ['吸尘器', '扫把变成了一根吸尘管——太空里扫地得靠吸。'],
      blackTable: ['杂物桌', '桌上的东西都用魔术贴粘着，只有一桶泡面没粘住，飘走了。'],
      bedW1: ['{A}的床', '{A}的床。上铺那个蓝色睡袋里就是他，睡得正香。'],
      bedW2: ['{B}的床', '{B}的床，床上的束缚网里塞满了袜子。'],
      shelf: ['书架', '书架上每本书都拿松紧带勒着，不然全飘走了。'],
      shoeRack: ['鞋架', '鞋架上是一排魔术贴拖鞋——在这儿根本用不上。'],
      storageBox: ['收纳箱', '收纳箱上贴着："易飘物品，打开前请抓紧"。'],
      polkaBag: ['收纳袋', '装着换季衣服的收纳袋……太空里没有季节。'],
      box350: ['饮用水', '一整包 350ml 的饮用水袋，每袋都带吸管。'],
      bedE1: ['我的床', '我的床。枕头飘到了半空中，被子也飘成了一个球。'],
      patternRoll: ['睡垫卷', '卷起来的睡垫，绑在床柱上。'],
      bedE2: ['{C}的床', '{C}的床。青绿色睡袋里的{C}正在说梦话。'],
      farDesks: ['窗边书桌', '窗边的书桌上摆着一台望远镜——镜头盖已经不知道飘哪去了。'],
      yellowBag: ['黄色袋子', '黄底蓝点的袋子，里面是……一袋子漂浮的弹珠？'],
      toteBag: ['红色袋子', '红白相间的大袋子，上学期搬宿舍用的——居然也带上太空了。'],
      redBag: ['红色收纳包', '收纳包上贴着便签："{C}的太空服，别动"。'],
      paper: ['复习资料', '高数复习资料在半空中翻页……写满了"失重状态下的积分"。'],
      mouse: ['鼠标', '鼠标用魔术贴粘在桌上，线在空中飘成了一个圈。'],
      pcTower: ['主机', '主机的风扇呼呼转——在太空里散热全靠它。'],
      stoolMe: ['凳子', '凳子被螺丝固定在地板上。反正也坐不下去。'],
      keyboard: ['键盘', '键盘的缝里飘出来一粒薯片渣。'],
      phone: ['手机', '手机没信号：距离最近的基站 408 公里。'],
      calendar: ['台历', '台历上今天那一栏写着："09:00 返回舱分离——别睡过头！"'],
      notebook: ['笔记本', '笔记本上画着一个圆滚滚的机器人，旁边写着："小圆，别乱转"。'],
      apple: ['苹果', '一个在空中慢慢自转的苹果。牛顿看了会沉默。'],
      drawer: ['抽屉', '抽屉一拉开，一群回形针像小鱼一样游了出来。'],
      suitcase: ['行李箱', '行李箱被绑带固定在床边。'],
      stoolH: ['木凳', '门边的凳子被固定在地板上。'],
      ac: ['空气循环机', '空气循环机呼呼地吹——氧气就靠它了……现在它在报警。'],
      basket: ['脏衣篓', '脏衣篓的盖子扣得死死的——在太空里，脏衣服会飘出来追着你跑。'],
      roster: ['值日表', ''],
      towels: ['毛巾', '四条毛巾拿夹子夹在绳子上，飘成了四面小旗。'],
      wcBucket: ['水桶', '水桶是封口的——在太空里敞口放水，水会自己爬出来。'],
      shower: ['淋浴', '太空淋浴：一个封闭的袋子 + 一根吸管。你决定今天不洗了。'],
      graffiti: ['隔板涂鸦', '隔板上写着"窗外有猴!!"……后面加了一句"——包括太空里。"'],
      bin: ['垃圾桶', '垃圾桶是抽气式的，盖子一开就"呼"地一声。'],
      remote: ['遥控器', '空调遥控器在空中转圈。'],
      folder: ['文件夹', '《失重环境下的高数复习——{C}整理》'],
      headset: ['耳机', '{B}的电竞耳机，线缠在了扶手上。'],
      monitor2: ['生命维持面板', '屏幕一片红：LIFE SUPPORT FAILURE。氧气条在一点点往下掉。'],
      monitor: ['轨道图', '屏幕上是太空舱的轨道：一条弯弯的线绕着地球转。我们现在在……太平洋上空？'],
      extinguisher: ['灭火器', '太空专用灭火器。千万别在这里按——后坐力会把你喷到对面墙上。'],
      firstAid: ['急救包', '急救包上写着：晕太空请吃一片。'],
      signZeroG: ['警示牌', '⚠ ZERO-G 失重区域 · 请抓紧扶手。'],
      cola: ['可乐罐', '一罐飘着的可乐。打开的话，气泡会在罐子里变成一整坨泡沫……还是算了。'],
      sock: ['袜子', '一只飘在空中的袜子。味道也在空中飘。'],
      book: ['书', '一本摊开的书在半空中慢慢翻页：《从零开始的太空生活》。'],
      duck: ['小黄鸭', '一只小黄鸭——在太空里，它终于不用浮在水面上了。'],
      gamepad: ['手柄', '{A}的手柄。上面还沾着薯片渣。'],
      pillow: ['枕头', '我的枕头飘到了这儿……难怪我脖子疼。'],
      headphones: ['头戴耳机', '一副耳机在空中慢慢翻跟头。'],
      helmet: ['红白头盔', '红白头盔在舱里飘着……可惜它不是宇航员头盔。'],
      sticky: ['便利贴', '便利贴上写着：“别忘了给小圆充电”。'],
      acNote: ['便签', '出风口夹着一张便签："滤网该换了——小圆"。'],
      drawerNote: ['纸条', '纸条上写着："太空里别乱扔东西，会飘回来砸你。"'],
      latiao: ['太空辣条', '一包真空包装的辣条……拆开的话辣油会飘得满屋都是。'],
      strip: ['插线板', '插线板上贴着："舱内电源，严禁拔插"。'],
      suitNote: ['便利贴', '行李箱上的便利贴："返回地球之后再打开"。'],
      ticket: ['准考证', '准考证……考场在地球上。'],
      uvLight: ['紫光手电', '紫光手电在抽屉里飘着。这次用不上它了。'],
    };
    for (const [id, [l, t]] of Object.entries(F)) H[id] = flav(l, t);
    H.roster = flav('值日表', '值日表：周一 {A}　周二 {B}　周三 {C}　周四 我……周五 小圆（机器人）。');
    H.clock = { label: '任务钟', verb: '看时间', reach: false, act: () => g.say(`${g.clockText}……氧气只够 ${Math.ceil((S().limit - S().elapsed) / 60)} 分钟了！`) };
    H.noodles = { label: '太空泡面', verb: '吸一口面条', act: () => {
      g.audio.slurp();
      g.say(S().f.noodle ? '面条已经泡发了……在太空里泡面会变成一个大面球。' : '吸溜——面条在空中飘成了一个圈，吃进去一半，另一半飘走了。', 3);
      S().f.noodle = true;
    } };
    H.candies = { label: '一团糖豆', verb: '张嘴去接', act: () => {
      const s = S();
      g.audio.crunch();
      if (s.f.candy) { g.say('糖豆被你吃得差不多了，剩下几颗还在转圈。', 2.6); return; }
      s.f.candy = true; s.freeHints++;
      g.fx.emit('star', g.refs.candies.group.getWorldPosition(V()), { count: 8, speed: 0.4, spread: 0.6, up: 0.4, gravity: 0, drag: 1, life: 1.2, size: 0.06, colors: ['#ffd23f', '#ff4a5a', '#2ec4c9'], spin: 3 });
      g.say('啊呜——张嘴接住一颗糖豆！甜！（下一次提示免费）', 3);
    } };
    // ---- 🤖 机器人 ----
    H.robot = {
      label: () => (g.refs.robot.state === 'tumble' ? '失控的机器人' : '小圆（机器人）'),
      verb: () => (g.refs.robot.state === 'tumble' ? '抓住它' : '聊天'), reach: true,
      act: () => this.onRobot(g),
    };
    // ---- 💧 水球 ----
    H.waterBall = { label: '大水球', verb: () => (g.refs.waterBall.freed ? '看看纸条' : '喝一口'), act: () => this.drink(g) };
    // ---- 🌍 窗户 ----
    H.curtain = { label: '遮光板', verb: () => (S().f.curtainOpen ? '关上' : '打开'), act: () => this.toggleShutter(g) };
    H.window = { label: '舷窗', verb: () => (S().f.curtainOpen ? '看风景' : '查看'), reach: false, act: () => this.lookEarth(g) };
    // ---- 室友 ----
    const talk = (i) => () => this.sleepTalk(g, i);
    H.sleeperA = { label: () => `${g.S.mates[0]}（睡袋）`, verb: '叫醒他', reach: false, act: talk(0) };
    H.sleeperB = { label: () => `${g.S.mates[1]}（睡袋）`, verb: '叫醒他', reach: false, act: talk(1) };
    H.sleeperC = { label: () => `${g.S.mates[2]}（睡袋）`, verb: '叫醒他', reach: false, act: talk(2) };
    // ---- 开关、门、洗手间 ----
    H.switch = { label: '舱内照明', verb: () => (S().f.lightsOn ? '切回夜间模式' : '打开照明'), act: () => this.toggleLights(g) };
    H.door = { label: '气闸舱门', verb: () => (S().f.unlocked ? '出舱' : '输入授权码'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '洗手间门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '厕所隔间', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.sink = { label: '洗漱台', verb: '打开水龙头', act: () => {
      g.audio.water(1.2);
      const p = g.refs.sink.group.localToWorld(V(1.165, 0.95, 6.0));
      g.fx.emit('drop', p, { count: 16, speed: 0.25, spread: 0.8, up: 0.5, gravity: 0, drag: 0.4, life: 4, size: 0.05, colors: ['#bfe8ff', '#9fe0ff', '#ffffff'], sway: 0.05 });
      g.say('水龙头里冒出来的水没有往下流——变成一颗颗小水珠飘了起来。', 3.4);
    } };
    H.toilet = { label: '太空马桶', verb: '研究一下', act: () => {
      g.audio.vacuum();
      g.say('太空马桶：使用前请系好大腿固定带，对准吸气口……还是算了，憋着吧。', 3.6);
    } };
    H.mirror = { label: '穿衣镜', verb: '照镜子', reach: false, act: () => g.say('镜子里的我头发全都竖了起来——失重版的超级赛亚人。', 3) };
    H.wcMirror = H.mirror;
    H.wcWindow = { label: '小窗', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只穿着宇航服的猴子还在窗外挥手……'); return; }
      O.trigger(6); g.audio.monkey(); g.after(0.9, () => g.audio.monkey(1.25)); g.after(1.8, () => g.audio.monkey(1.1));
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>太空行走的三只猴子</b>', 'clue', '🐒'); }
      g.say('窗外……三只穿着宇航服的猴子拴着安全绳飘了过去，还冲我挥手？！', 3.8);
    } };
    return H;
  },

  // ---------- 🤖 ----------
  onRobot(g) {
    const S = g.S, rb = g.refs.robot;
    if (rb.state === 'tumble') {
      if (g.ctrl.pos.y < 0.72) {
        g.say('够不着……得飘高一点！（按住 <b>空格</b> 往上飘）', 3);
        g.ui.toast('按住 <kbd>空格</kbd> 上浮 · 按住 <kbd>C</kbd> 下沉', '', '🪐');
        return;
      }
      this.catchRobot(g);
      return;
    }
    if (rb.state !== 'follow') return;
    rb.talkT = 2.4;
    g.audio.robotBeep(2);
    const [A, B, C] = S.mates;
    let line;
    if (!S.found[1]) { line = `💧那一位？${B}昨天把一张纸条泡进水球里了，就在洗手间！`; S.f.talkedB = true; }
    else if (!S.found[2]) line = S.f.curtainOpen ? `🌍那一位……${A}说他"写在地球上了"。等我们飞到地球背面，城市的灯光就亮了！` : '先把舷窗的遮光板打开吧！外面的风景超——美的！';
    else if (!S.f.unlocked) line = `授权码是 ${S.digits.join('')}！快去门口的面板输入！`;
    else line = '气闸舱已就绪！一路顺风！';
    g.ui.subtitle(line, 3.4, '小圆（机器人）');
  },
  catchRobot(g) {
    const S = g.S, rb = g.refs.robot, [A, B, C] = S.mates;
    rb.state = 'rescue'; rb.rescueT = 0;
    g.audio.clunk(); g.audio.robotBeep(4);
    this.speedLines(g, 1.0);
    g._shake(0.15);
    g.ch.setExpression('focus', 2);
    g.say('抓住你了！', 1.4);
    g.after(1.4, () => { rb.mode = 'blink'; g.audio.bootChime(); g.ui.subtitle('……系统重启中……陀螺仪校准完毕！', 2.2, '？？？（机器人）'); });
    g.after(3.6, () => {
      rb.mode = 'happy'; rb.emote.show('heart', 2); g.audio.sparkle();
      g.fx.emit('star', rb.root.getWorldPosition(V()).add(V(0, 0.2, 0)), { count: 16, speed: 0.8, spread: 1, up: 0.6, gravity: 0, drag: 1.4, life: 1.6, size: 0.07, colors: ['#7fe8ff', '#ffffff', '#ffd23f'], spin: 3 });
      g.ui.subtitle(`谢谢你，${S.name}！我是 211 舱的生活助理「小圆」！`, 3, '小圆（机器人）');
      S.ach.add('robot');
    });
    g.after(6.8, () => {
      rb.mode = 'talk'; rb.talkT = 3.6;
      g.ui.subtitle(`作为报答——气闸授权码🤖那一位是 ${S.digits[0]}！`, 3.6, '小圆（机器人）');
      g.after(0.4, () => { g.foundDigit(0, '重启之后的机器人小圆'); this.eyecatch(g, '🤖', S.digits[0]); });
    });
    g.after(10.6, () => {
      rb.state = 'follow'; rb.talkT = 3.6;
      g.ui.subtitle(`另外两位……💧在${B}泡的水球里，🌍……${A}说他"写在地球上了"？`, 3.8, '小圆（机器人）');
      g.clue('robot', `小圆：💧那一位在${B}泡的<b>水球</b>里（洗手间）；🌍那一位被${A}"写在了<b>地球</b>上"。`);
    });
  },

  // ---------- 💧 ----------
  drink(g) {
    const S = g.S, W = g.refs.waterBall;
    if (W.freed) { this.showNote(g); return; }
    W.sips = (W.sips || 0) + 1;
    g.audio.slurp();
    g.ch.setExpression('grin', 1.5);
    const p = W.group.getWorldPosition(V());
    g.fx.emit('drop', p, { count: 8, speed: 0.3, spread: 1, up: 0.3, gravity: 0, drag: 0.6, life: 2.5, size: 0.04, colors: ['#bfe8ff', '#ffffff'] });
    const s0 = W.size;
    if (W.sips < 3) {
      const s1 = W.sips === 1 ? 0.74 : 0.5;
      g.tween(0.6, (k) => (W.size = lerp(s0, s1, k)), { ease: easeOut });
      g.say(W.sips === 1 ? '咕嘟——（在太空里喝水全靠嘬）……水球里泡着一张纸条！' : '咕嘟咕嘟……好撑……再来一口就能拿到纸条了！', 3);
      return;
    }
    // 最后一口：水球"啵"地破开，纸条飘了出来
    g.tween(0.25, (k) => (W.size = lerp(s0, 0.001, k)), { ease: (t) => t * t, done: () => { W.ball.visible = false; } });
    g.audio.pop(); g.audio.sparkle();
    this.speedLines(g, 0.8);
    g.fx.emit('drop', p, { count: 36, speed: 0.9, spread: 1.2, up: 0.6, gravity: 0, drag: 0.9, life: 3, size: 0.05, colors: ['#bfe8ff', '#9fe0ff', '#ffffff'] });
    W.freed = true;
    S.ach.add('water');
    g.say('噗——！水球破了，纸条飘了出来！', 2.4);
    g.after(1.0, () => this.showNote(g));
  },
  showNote(g) {
    const S = g.S, [A, B] = S.mates;
    const node = g.ui.doc({ title: '防水便签', html: `<div style="font-size:18px;line-height:1.8">气闸授权码<br><b style="font-size:26px">💧 = ${S.digits[1]}</b><br><span style="color:#888">——${B}（泡在水球里，谁也找不到 😎）</span></div>`, variant: 'note' });
    g.openModal(node);
    if (!S.found[1]) g.after(0.3, () => { g.foundDigit(1, `${B}泡在水球里的纸条`); this.eyecatch(g, '💧', S.digits[1]); });
  },

  // ---------- 🌍 ----------
  toggleShutter(g) {
    const S = g.S, C = g.refs.curtain;
    const open = !S.f.curtainOpen;
    S.f.curtainOpen = open;
    g.audio.curtain(); g.audio.hiss();
    const f0 = C.f, f1 = open ? 0.17 : 1;
    g.tween(1.8, (k) => { C.f = lerp(f0, f1, k); C.layout(C.f); }, { ease: easeInOut });
    if (open && !S.f.sawEarth) {
      S.f.sawEarth = true;
      g.after(1.4, () => { this.speedLines(g, 1.2); g.audio.sparkle(); g.say('哇……是地球！！我们真的在太空里！', 3.4); });
      g.after(5.0, () => g.ui.subtitle('哇！外面的风景超——美的！地球每一百秒就会"关一次灯"哦！', 3.4, g.refs.robot.state === 'follow' ? '小圆（机器人）' : g.S.name));
      g.clue('earth', '舷窗外是地球。太空舱每隔一会儿就会绕到地球背面，地球的这一面就"关灯"了。');
    }
  },
  lookEarth(g, auto = false) {
    const S = g.S;
    if (!S.f.curtainOpen) { g.say('遮光板挡着呢。'); return; }
    if (this._lapse) return;
    if (S.found[2]) { g.say(`地球还在那儿慢慢转着。城市灯光拼的 ${S.digits[2]} 已经看不清了。`, 3); return; }
    const sky = g.refs.spaceSky;
    // 镜头贴到舷窗前（两排上铺之间的过道里），对着地球
    const eye = V(0.1, 1.72, -2.9);
    const look = eye.clone().addScaledVector(sky.earthDir, 3);
    g._cineTo(eye, look, 1.2);
    g.audio.whoosh();
    // 快进到地球背面（日食）：太阳躲到地球后面，整个地球变成夜景
    const p0 = this._phase;
    let target = Math.floor(p0) + 0.5;
    if (target < p0 - 0.06) target += 1;
    this._lapse = { p0, p1: target, t: 0, dur: auto ? 0.01 : 3.6 };
    if (!auto) {
      g.ui.subtitle('（轨道快进 ×600）', 3.2, '');
      g.after(0.3, () => this.speedLines(g, 3.2));
    }
    g.after(auto ? 0.4 : 4.0, () => {
      g.audio.sparkle(); g._shake(0.08);
      g.say(`地球"关灯"了……城市的灯光拼出了一个数字：${S.digits[2]}？！`, 3.6);
      g.foundDigit(2, '地球夜景里的城市灯光');
      this.eyecatch(g, '🌍', S.digits[2]);
      S.ach.add('earth');
    });
    g.after(auto ? 3.6 : 7.8, () => g.ui.subtitle(`嘿嘿……🌍那一位……我用城市的灯光写的……zzz`, 3, `${S.mates[0]}（梦话）`));
    g.after(auto ? 4.2 : 8.6, () => { g._cineTo(null, null, 1.2); this._lapse = null; });
  },

  sleepTalk(g, i) {
    const S = g.S, s = g.refs.sleepers[i], name = S.mates[i];
    s.emote.show(['zzz', 'dots', 'note'][(g._stN = (g._stN || 0) + 1) % 3], 1.8, 0.24);
    g.audio.snore();
    const L = [
      ['嘿嘿……🌍那一位……我用城市的灯光……写在地球上了……zzz', '五杀……再来一把……zzz', '地球……关灯的时候……才看得见……zzz'],
      ['别喝我的水球……里面有纸条的……zzz', '洗手间……水球……嘬一口……zzz', '哪个傻子把袜子挂天花板上了……zzz'],
      ['小圆……别转了……转得我头晕……zzz', '气闸舱……三位数……🤖💧🌍……zzz', '天花板……飘上去……抓住它……zzz'],
    ][i];
    const line = L[(s.talkN = (s.talkN || 0) + 1) % L.length];
    g.ui.subtitle(line, 3.2, `${name}（梦话）`);
    if (i === 1) S.f.talkedB = true;
    if (i === 0) g.clue('sleepA', `${name}的梦话：🌍那一位"用城市的灯光写在地球上"，要等地球"关灯"才看得见。`);
    if (i === 1) g.clue('sleepB', `${name}的梦话：洗手间的<b>水球</b>里有纸条。`);
    if (i === 2) g.clue('sleepC', `${name}的梦话：天花板附近那个转个不停的机器人叫<b>小圆</b>。`);
  },

  toggleLights(g) {
    const S = g.S;
    S.f.lightsOn = !S.f.lightsOn;
    g.audio.switchClick(); g.audio.fluoro();
    if (S.f.lightsOn) {
      for (const s of g.refs.sleepers) s.emote.show('anger', 1.4, 0.24);
      g.after(0.6, () => g.ui.subtitle('关灯……！！（梦话）', 1.6, S.mates[(Math.random() * 3) | 0]));
    }
  },

  onDoor(g) {
    const S = g.S;
    if (S.f.unlocked) { g.win(); return; }
    if (!S.f.triedDoor) {
      S.f.triedDoor = true;
      g.audio.robotBeep(2);
      g.say('气闸舱门锁着。门边的面板上写着："请输入 3 位授权码 🤖💧🌍"。', 3.8);
      g.clue('door', '<b>气闸舱门</b>：3 位授权码，分别对应 🤖 💧 🌍。');
      g.after(1.8, () => this.openLock(g));
      return;
    }
    this.openLock(g);
  },
  openLock(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '气闸舱门 · 授权码', variant: 'holo', labels: ['🤖', '💧', '🌍'],
      hint: S.found.some(Boolean) ? `已知：<b>${known}</b>` : '三个数位旁边分别画着 🤖 💧 🌍……',
      onTick: () => g.audio.robotBeep(1, 1800),
      onSubmit: (code) => {
        if (code === S.digits.join('')) { g.audio.unlock(); g.ui.closeModal(); this.unlock(g); return true; }
        g.audio.error(); this._drawKeypad(g, 'error'); g.after(0.8, () => this._drawKeypad(g, 'locked'));
        return false;
      },
    });
    g.openModal(box);
  },
  unlockVisual(g) {
    g.collision.setEnabled('lockCable', false);
    this._drawKeypad(g, 'open');
  },
  unlock(g) {
    const S = g.S, H = g.refs.hatch;
    S.f.unlocked = true;
    this.unlockVisual(g);
    const w0 = H.wheel.rotation.z;
    g.tween(1.2, (k) => (H.wheel.rotation.z = w0 + k * Math.PI * 3), { ease: easeInOut });
    g.audio.hiss(); g.audio.clunk();
    this.speedLines(g, 1.0);
    g.fx.emit('dust', V(-1.62, 1.4, g.refs.door.z), { count: 30, speed: 0.6, spread: 1, up: 0.2, gravity: 0, drag: 1.2, life: 2, size: 0.1, colors: ['#ffffff', '#dff4ff'], sway: 0.2 });
    g.say('嗤——气闸舱门的转轮自己转了起来！', 2.4);
    g.refs.robot.emote.show('star', 1.5);
    g.after(1.6, () => g.win());
  },

  update(g, dt) {
    const S = g.S;
    if (g.ctrl.floatTarget > 1.08 && !S.ach.has('spacewalk')) { S.ach.add('spacewalk'); g.ui.toast('飘到了天花板！', '', '🧑‍🚀'); }
    // 窗外正好是日食（地球全黑）的时候盯着地球看，也能自己发现
    if (!S.found[2] && S.f.curtainOpen && !this._lapse && g.state === 'play' && !g.cine) {
      const sky = g.refs.spaceSky;
      g.camera.getWorldDirection(_p);
      const dark = 1 - sky.sunVisible();
      const aim = _p.angleTo(sky.earthDir) < 0.2 && g.camera.position.z < 0.5;
      this._look = dark > 0.8 && aim ? this._look + dt : 0;
      if (this._look > 1.2) this.lookEarth(g, true);
    }
  },

  // ---------- 灯光、轨道、机器人 ----------
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, SL = R.spaceLights, sky = R.spaceSky;
    const kk = 1 - Math.exp(-dt * 3);
    // 轨道
    if (this._lapse) {
      const lp = this._lapse;
      lp.t += dt;
      const k = clamp(lp.t / lp.dur, 0, 1);
      this._phase = lerp(lp.p0, lp.p1, easeInOut(k));
    } else this._phase += dt / ORBIT;
    const th = thetaOf(this._phase % 1);
    const drawH = g.gfx.bufferSize ? g.gfx.bufferSize.y : 800;
    const nb = this._lapse ? 1.8 : 1.15;
    sky.update(dt, t, { theta: th, drawH, nightBoost: nb });
    const open = S && S.f.curtainOpen ? 1 : 0;
    this._open = lerp(this._open || 0, (g.refs.curtain.f < 0.6 ? 1 : 0), kk);
    const sunVis = sky.sunVisible();
    const earthLit = 0.5 + 0.5 * -sky.sunDir.dot(sky.earthDir);
    // 阳光：只有在没被地球挡住的时候
    L.sun.position.copy(L.sun.target.position).addScaledVector(sky.sunDir, 12);
    L.sun.intensity = sunVis * 2.6;
    SL.earthLight.intensity = this._open * (0.4 + earthLit * 2.2);
    R.shafts.target = sunVis * this._open * clamp(-sky.sunDir.z * 2.2, 0, 1) * 0.035;
    R.shafts.uniforms.intensity.value = lerp(R.shafts.uniforms.intensity.value, R.shafts.target, kk);
    // 舱内照明：夜间模式（蓝色灯带 + 天花板灯板很暗）/ 照明模式
    const on = (S && S.f.lightsOn) || g.lightMode === 'end';
    const spot = on ? 9 : 0;
    g.light.spot = lerp(g.light.spot, spot, 1 - Math.exp(-dt * 6));
    L.ceilSpots.forEach((s) => (s.intensity = g.light.spot));
    L.tubeMats.forEach((m) => (m.emissiveIntensity = on ? 2.4 : 0.3));
    R.ceilMat.emissiveIntensity = lerp(R.ceilMat.emissiveIntensity, on ? 1.2 : 0.35, kk);
    let hemi = on ? 1.0 : 0.85;
    // 报警：红灯转起来
    const alarm = this._alarm > 0 || (S && S.f.alarm) || this._fail;
    if (this._alarm > 0) this._alarm -= dt;
    const B = R.hatch.beacon;
    B.light.intensity = lerp(B.light.intensity, alarm ? 7 : 0, 1 - Math.exp(-dt * 8));
    if (B.light.intensity > 0.05) {
      const a = t * 5;
      B.light.target.position.set(-1.68 + Math.cos(a) * 3, 1.2, 3.36 + Math.sin(a) * 3);
    }
    B.mat.emissiveIntensity = alarm ? 1.4 + Math.sin(t * 10) * 1.2 : 0.25;
    SL.stripMat.color.set(alarm ? '#ff6a7a' : '#8fe8ff').multiplyScalar(alarm ? 0.7 + 0.3 * Math.sin(t * 10) : 0.85 + 0.15 * Math.sin(t * 1.3));
    if (alarm) hemi *= 0.85;
    if (this._fail) { hemi = 0.35; L.ceilSpots.forEach((s) => (s.intensity = 0)); }
    L.hemi.intensity = lerp(L.hemi.intensity, hemi, kk);
    L.hemi.color.lerp(_c.set(alarm ? '#ffb0b8' : '#bfe0ff'), kk);
    SL.cabinGlow.intensity = on ? 0.4 : 1.1;
    // 镜头补光：从镜头斜上方打过去
    const cam = g.camera;
    cam.getWorldDirection(_q);
    SL.camFill.position.copy(cam.position).add(_p.set(0, 0.8, 0)).addScaledVector(_q, -0.5);
    SL.camFill.target.position.copy(cam.position).addScaledVector(_q, 3);
    SL.camFill.intensity = this._fail ? 0.2 : on ? 0.45 : 0.75;
    g.scene.environmentIntensity = 0.3;
    L.monLight.intensity = 0.9 + Math.sin(t * 9) * 0.05;
    L.monLight.color.set(alarm ? '#ff8a9a' : '#7fe0ff');
    L.wc.intensity = on ? 1.8 : 0.9;
    g._updateDust(dt, 0.6);
    // 机器人
    this._robot(g, dt, t);
  },
  _robot(g, dt, t) {
    const rb = g.refs.robot, r = rb.root;
    rb.faceT = (rb.faceT || 0) - dt;
    if (rb.talkT > 0) rb.talkT -= dt;
    let mode = rb.mode;
    if (rb.state === 'follow' && rb.talkT > 0) mode = 'talk';
    else if (rb.state === 'follow' && (t % 3.2) < 0.12) mode = 'blink';
    else if (rb.state === 'follow' && mode === 'talk') mode = 'normal';
    if (rb.faceT <= 0 || mode !== rb._drawn) {
      rb.faceT = 0.08; rb._drawn = mode;
      TS.drawRobotFace(rb.faceCanvas, mode, t);
      rb.faceTex.needsUpdate = true;
    }
    for (const [i, e] of rb.ears.entries()) e.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(t * (rb.state === 'tumble' ? 22 : 7)) * 0.4);
    rb.tipMat.color.set(Math.sin(t * (rb.state === 'tumble' ? 12 : 3)) > 0 ? (rb.state === 'tumble' ? '#ff4a5a' : '#7fffb0') : '#3a1a20');
    rb.ring.rotation.z += dt * (rb.state === 'tumble' ? 6 : 1.2);
    rb.jet.scale.set(1, 0.5 + Math.random() * 0.3, 1);
    if (rb.state === 'tumble') {
      // 在天花板附近乱转、乱撞，隔一会儿冒火花
      r.position.set(rb.home.x + Math.sin(t * 0.9) * 0.35, rb.home.y + Math.sin(t * 1.7) * 0.08, rb.home.z + Math.sin(t * 0.63) * 0.4);
      rb.body.rotation.x += dt * rb.spin.x; rb.body.rotation.y += dt * rb.spin.y; rb.body.rotation.z += dt * rb.spin.z;
      rb.sparkT = (rb.sparkT || 1) - dt;
      if (rb.sparkT <= 0) {
        rb.sparkT = 0.7 + Math.random() * 1.2;
        g.fx.emit('spark', r.position.clone(), { count: 8, speed: 1.2, spread: 1, up: 0.5, gravity: 0, drag: 2, life: 0.5, size: 0.03, colors: ['#ffe08a', '#ffffff', '#7fe8ff'] });
        if (g.state === 'play' && r.position.distanceTo(g.camera.position) < 5) g.audio.robotBeep(1, 600 + Math.random() * 900);
      }
    } else {
      // 救下来之后：飘在主角右手边、肩膀高度，转过来看着镜头；别挡在镜头前面，也别钻进天花板
      const C = g.ctrl;
      const yaw = C.charYaw;
      _p.set(C.pos.x - Math.cos(yaw) * 0.6 + Math.sin(yaw) * 0.3, clamp(C.pos.y + 1.5 + Math.sin(t * 1.6) * 0.05, 0.4, 2.7), C.pos.z + Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.3);
      const cp = g.camera.position;
      if (_p.distanceTo(cp) < 0.7) { _q.subVectors(_p, cp).setY(0); if (_q.lengthSq() < 1e-4) _q.set(1, 0, 0); _p.addScaledVector(_q.normalize(), 0.7 - _p.distanceTo(cp)); }
      if (rb.state === 'rescue') {
        rb.rescueT += dt;
        const k = clamp(rb.rescueT / 1.2, 0, 1);
        rb.body.rotation.x *= 1 - k * 0.2; rb.body.rotation.z *= 1 - k * 0.2;
        rb.body.rotation.y *= 1 - k * 0.1;
        // 被抓住：往主角手边拉过来
        _p.set(C.pos.x + Math.sin(yaw) * 0.45, C.pos.y + 1.45, C.pos.z + Math.cos(yaw) * 0.45);
      } else {
        rb.body.rotation.x = lerp(rb.body.rotation.x, 0, 1 - Math.exp(-dt * 4)); rb.body.rotation.z = lerp(rb.body.rotation.z, 0, 1 - Math.exp(-dt * 4));
        rb.body.rotation.y = lerp(rb.body.rotation.y, 0, 1 - Math.exp(-dt * 4));
      }
      r.position.lerp(_p, 1 - Math.exp(-dt * (rb.state === 'rescue' ? 5 : 2.2)));
      _q.copy(g.camera.position); _q.y = r.position.y + (_q.y - r.position.y) * 0.4;
      r.lookAt(_q);
    }
    rb.emote.update(dt);
  },
};
