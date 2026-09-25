// 第四章：太空舱 211（近地轨道 408 km，失重）
//   舱里只剩你和一个失控的机器人：室友们的休眠舱都空了——他们早就坐返回舱回地球了，只在舱里给你留了言。
//   气闸舱门上是一个三位数的授权码面板：
//   🤖 失控的机器人小圆在天花板附近打转 → 按住空格飘上去抓住它，它重启后告诉你第一位
//   💧 驾驶舱（原来的洗手间）里飘着一颗大水球，里面泡着一张纸条 → 一口一口把水球喝掉
//   🌍 室友说第三位"写在地球上" → 打开遮光板，等太空舱绕到地球背面（地球"关灯"），城市灯光拼出了数字
//   另外还有一条隐藏任务线（索引卡 → 信息接收站的频道 211 → 储藏室的货柜 G → 卡冈图雅），见 secret.js
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, smoothstep } from '../core/util.js';
import { untoonify } from '../world/toonkit.js';
import * as TS from '../core/tex_space.js';
import { drawPodScreen, drawComms } from '../world/spacegear.js';
import { Secret } from './secret.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _q = V(), _h = V(), _d = V(), _c = new THREE.Color();
const ORBIT = 100; // 绕地球一圈（秒），真实的是 90 分钟

// 轨道相位 → 太阳绕舱转的角度：满地球和日食附近走得慢，中间的月牙阶段走得快
const thetaOf = (p) => Math.PI * 2 * p - 0.4 * Math.sin(Math.PI * 4 * p);

export const CH4 = {
  n: 4, theme: 'space',
  title: '第四章 · 太空舱 211', sub: '近地轨道 408 km · 失重', tag: '第四章 · 太空舱 211',
  clock: [3, 0], lockName: '气闸舱门', doorName: '气闸舱门', codeLen: 3, codeIcons: ['🤖', '💧', '🌍'],
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['waterBall', 'signZeroG', 'station', 'dashboard', 'lockerG', 'monitor2', 'telescope', 'pilotSeat', 'dispenser', 'storageRack'],
  items: {},

  // 氧气随故事钟慢慢往下掉，最低停在 20%，不会耗尽
  o2: (g) => Math.ceil(100 - 80 * g.storyP()),
  clockText(g) { return `O₂ ${this.o2(g)}%`; },
  // 任务钟：从 03:00:00 开始走
  clockHands(g) {
    const e = g.S ? g.S.elapsed : 0;
    return { h: 3 + e / 3600, m: (e / 60) % 60, s: e % 60 };
  },

  init(g) {
    const R = g.refs, S = g.S;
    // 写实电影感：人物用原来的写实材质（从第三章过来的话把卡通材质换回去）
    untoonify(g.ch.root);
    g.ctrl.float = 1; g.ctrl.floatTarget = 0.35;
    // 这一章用不上紫光手电：它那盏灯藏起来（每个像素都要算一遍灯光，能省则省）；换章时 game.js 会放回来
    g.uvLight.visible = false;
    // 通往驾驶舱的舱门一开始就开着：从乘员舱望过去，门后那节舱段是被琥珀色的灯照亮的
    const D = R.wcDoor;
    if (!D.open) { D.open = true; g.collision.setEnabled('wcShut', false); g.collision.setEnabled('wcOpen', true); D.camBox.makeEmpty(); D.pivot.rotation.y = (D.base || 0) + D.openAngle; R.lights.wc.shadow.needsUpdate = true; }
    // 一层很淡的青灰色空气感：远处的东西稍微沉下去，灯光有了"体积"
    g.scene.fog = new THREE.FogExp2('#141c1b', 0.038);
    g.lightMode = 'game';
    R.spaceSky.drawDigit(S.digits[2]);
    // 水球里的纸条
    const W = R.waterBall, c = W.noteCanvas, x = c.getContext('2d');
    x.fillStyle = '#fff6c8'; x.fillRect(0, 0, 128, 96); x.strokeStyle = '#e8c860'; x.lineWidth = 3; x.strokeRect(3, 3, 122, 90);
    x.fillStyle = '#2a6fd8'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.fillText('💧 =', 40, 58);
    x.fillStyle = '#e8202a'; x.font = 'bold 56px sans-serif'; x.fillText(String(S.digits[1]), 88, 70);
    W.noteTex.needsUpdate = true;
    this._phase = 0.08; this._lapse = null; this._alarm = 0; this._speed = 0; this._look = 0; this._pa = 0;
    this._drawKeypad(g, 'locked');
    const rb = R.robot; rb.state = 'tumble'; rb.mode = 'dizzy';
    // 休眠舱床头的状态屏：室友们的都空了，只有我的是"已苏醒"
    const [A, B, C] = S.mates;
    for (const p of R.gear.pods) {
      const me = p.who < 0;
      drawPodScreen(p.screen.canvas, { code: p.code, name: me ? S.name : S.mates[p.who], status: me ? '已苏醒 · 超时 2:58' : '空 · 06:52 已离舱', ok: me, warn: !me });
      p.screen.tex.needsUpdate = true;
    }
    // 信息接收站：返回舱发回来的消息
    this._comms = [
      { text: `[06:52] ${A}：上返回舱了！他还没醒？`, color: '#ffcf8a' },
      { text: `[06:53] ${B}：叫了八百遍，睡得跟死猪一样`, color: '#cfe8d6' },
      { text: `[06:55] ${C}：授权码拆成三份了 🤖💧🌍`, color: '#e8d6bc' },
      { text: '[07:10] 返回舱：已脱离轨道，三小时后溅落', color: '#8cf0a4' },
    ];
    this._commsT = 0; this._mistT = 0;
    this.secret = new Secret(g, this);
  },

  _drawKeypad(g, mode) {
    const K = g.refs.hatch.keypad, c = K.canvas, x = c.getContext('2d'), S = g.S;
    x.fillStyle = '#1c1f1e'; x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#070a08'; x.fillRect(6, 6, 116, 40);
    const col = mode === 'open' ? '#8cf0a4' : mode === 'error' ? '#ff5a3c' : '#ffb04a';
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 3; x.strokeRect(6, 6, 116, 40);
    x.fillStyle = col; x.font = 'bold 22px sans-serif'; x.textAlign = 'center';
    x.fillText(mode === 'open' ? 'OPEN' : S.digits.map((d, i) => (S.found[i] ? '•' : '_')).join(' '), 64, 34);
    x.font = 'bold 12px sans-serif'; x.fillText(mode === 'open' ? 'AIRLOCK READY' : 'AIRLOCK LOCKED', 64, 62);
    for (let i = 0; i < 12; i++) {
      const bx = 14 + (i % 3) * 36, by = 72 + Math.floor(i / 3) * 21;
      x.fillStyle = '#3a3e3b'; x.fillRect(bx, by, 30, 17); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(bx, by, 30, 3);
      x.fillStyle = '#d6d2c4'; x.font = 'bold 12px sans-serif'; x.fillText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '✕', '0', '✓'][i], bx + 15, by + 13);
    }
    K.tex.needsUpdate = true;
  },

  portal: 'space',
  lockView: { cam: V(-1.15, 1.72, 2.95), look: V(-1.78, 1.6, 3.4) },
  relockLine: '……气闸舱门又锁上了？！',
  intro(g, { prepare }) {
    const R = g.refs, [A, B, C] = g.S.mates;
    if (prepare) { g.ctrl.float = 1; g.ctrl.floatTarget = 0.35; g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    g.after(T - 0.4, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.3, lookPitch: -0.2 }; g.ui.subtitle('……嗯？脚底下怎么空空的？', 1.8, g.S.name); });
    g.after(T + 1.1, () => {
      this.speedLines(g, 1.2);
      g._shake(0.12);
      g.ui.subtitle('我……我飘起来了？！', 2.0, g.S.name);
      g._cineTo(V(-0.35, 2.05, 3.5), V(-0.98, 1.95, 3.85), 0.6);
    });
    g.after(T + 3.1, () => {
      const rp = R.robot.root.position;
      g._cutPose = { lookYaw: 0.9, lookPitch: 0.35 };
      g._cineTo(rp.clone().add(V(0.5, -0.12, 0.75)), rp.clone(), 1.6);
      R.robot.emote.show('!', 1.4); g.audio.robotBeep(3);
    });
    g.after(T + 3.9, () => g.ui.subtitle('警……警告……陀螺仪……失、失、失控……', 2.4, '？？？（机器人）'));
    g.after(T + 6.4, () => {
      g._cutPose = { lookYaw: -0.2, lookPitch: 0.25 };
      g._cineTo(V(-0.2, 1.75, 1.6), V(-1.3, 0.7, 0.1), 1.6);
      g.audio.robotBeep(1, 400);
    });
    g.after(T + 7.1, () => g.ui.subtitle(`休眠舱……上面写着${A}、${B}、${C}的名字。里面……都是空的？`, 3.0, g.S.name));
    g.after(T + 10.1, () => {
      g._cineTo(V(-0.4, 1.9, 2.6), V(-1.2, 1.5, 3.8), 1.4);
      g.audio.pa();
      g.ui.subtitle(`【211 舱广播】早上好，${g.S.name}。你是本舱最后一位苏醒的乘员。其他乘员已于 06:52 乘返回舱离开。生命维持系统故障，请尽快经气闸舱撤离。`, 4.6, '📢 舱内广播');
    });
    g.after(T + 14.9, () => { g.ch.setExpression('shock'); g.ui.subtitle('……又把我一个人丢下了？！这帮家伙！', 2.4, g.S.name); });
    g.after(T + 17.4, () => { g._cutPose = null; g.ch.setExpression('neutral'); g.ui.subtitle('气闸舱门……又是密码锁。这回是太空版的密室逃脱？', 2.6, g.S.name); g._cineTo(null, null, 1.2); });
    g.after(T + 18.8, () => g.beginPlay());
  },
  onSlam(g) { g.audio.hiss(); },
  // 气闸舱门：'hide' 面板是绿的（门开着）/ 'anim' 转轮自己拧紧、面板变红、警示灯闪一下 / 'show' 直接锁好
  relock(g, mode) {
    const H = g.refs.hatch;
    if (!H.wheel.userData.home) H.wheel.userData.home = H.wheel.rotation.z;
    const w0 = H.wheel.userData.home;
    if (mode === 'hide') { this._drawKeypad(g, 'open'); H.wheel.rotation.z = w0 + Math.PI * 2; return; }
    if (mode !== 'anim') { H.wheel.rotation.z = w0; this._drawKeypad(g, 'locked'); return; }
    g.audio.hiss(); g.audio.clunk();
    g.tween(0.8, (k) => (H.wheel.rotation.z = w0 + Math.PI * 2 * (1 - k)), { ease: easeInOut }).cut = true;
    g.after(0.5, () => { this._drawKeypad(g, 'error'); g.audio.robotBeep(2, 500); this._alarm = 1.2; });
    g.after(1.0, () => this._drawKeypad(g, 'locked'));
  },
  onPlay(g) {
    g.ui.toast('第四章 · 趁着氧气还够，打开气闸舱门', '', '🧑‍🚀');
    this.floatTip(g);
    g.after(3.2, () => g.ui.subtitle('我的休眠舱……舱盖还开着，里面好像贴着什么东西？', 3.6, g.S.name));
  },
  // 鉴赏模式也要知道怎么在失重里飘
  onViewPlay(g) { this.floatTip(g); },
  floatTip(g) { g.after(1.6, () => g.ui.toast(g.input.isTouch ? '失重操作：右下角按住 <b>▲上浮</b> / <b>▼下沉</b> · 松手还会往前飘' : '失重操作：按住 <kbd>空格</kbd> 上浮 · 按住 <kbd>C</kbd> 下沉 · 松手还会往前飘', '', '🪐')); },
  exitLine: () => '小圆，替我跟他们说声再见！',
  onDoorOpen(g) {
    const rb = g.refs.robot;
    rb.mode = 'happy'; rb.emote.show('heart', 2.4);
    g.refs.floaters.impulse(0.5, V(-0.5, 0.1, 0.3));
    this.speedLines(g, 1.6);
    g.audio.hiss(); g.audio.sparkle();
    g.fx.emit('dust', V(-1.5, 1.2, g.refs.door.z), { count: 40, speed: 0.8, spread: 1, up: 0.4, gravity: 0, drag: 1.2, life: 2.2, size: 0.1, colors: ['#e8e4dc', '#cfd6d2'], sway: 0.2 });
  },
  onEnd() {},

  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length;
    if (!f.readNote && !f.triedDoor) return [{ text: '看看自己那台开着的休眠舱', done: false }];
    return [
      { text: '🤖 让失控的机器人冷静下来', done: F[0] },
      { text: '💧 找到泡在水里的那一位', done: F[1] },
      { text: '🌍 找到"写在地球上"的那一位', done: F[2] },
      { text: f.unlocked ? '出舱！' : `打开气闸舱门（${n}/3）`, done: false },
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found;
    const sh = this.secret && this.secret.hint();
    if (sh) return sh;
    if (!f.readNote) return '东边那台舱盖开着的休眠舱是你的——里面贴着室友留的纸条。';
    if (!f.triedDoor) return '去门口看看那扇气闸舱门，门框边上有个密码面板。';
    if (!F[0]) return '天花板附近有个转个不停的机器人……按住空格飘上去，抓住它！';
    if (!F[1]) return f.talkedB ? '驾驶舱（原来的洗手间）里飘着一颗大水球，里面泡着一张纸条……一口一口把它喝掉。' : `去看看${S.mates[1]}的休眠舱（西边靠窗那台）里的留言，或者问问小圆。`;
    if (!F[2]) {
      if (!f.curtainOpen) return '窗户的遮光板还关着——先打开它看看外面。';
      return '等太空舱绕到地球背面、地球"关灯"的时候，看看城市的灯光。（对着窗户"看风景"可以快进）';
    }
    return `授权码凑齐了！去门口的密码面板，按🤖💧🌍的顺序输入：${S.digits.join('')}`;
  },
  story(g, p) {
    const S = g.S;
    const pa = (key, text, cb) => { if (S.msgSent[key]) return; S.msgSent[key] = true; g.audio.pa(); g.after(1.0, () => { g.ui.subtitle(text, 3.8, '📢 舱内广播'); cb && cb(); }); };
    if (p > 0.3) pa('o2', `氧气剩余 ${this.o2(g)}%。请乘员保持冷静，减少剧烈运动。`);
    if (p > 0.5) pa('debris', '警告！太空碎片接近——正在执行规避机动！请抓紧扶手！', () => this.debris(g));
    if (p > 0.8) pa('last', '氧气偏低！请尽快撤离！重复，请尽快撤离！', () => { S.f.alarm = true; });
  },

  // 太空碎片擦过：警报、摇晃、东西满屋乱飞、集中线
  debris(g) {
    this._alarm = 4.5;
    g.audio.alarm(4);
    g._shake(0.5);
    this.speedLines(g, 1.4);
    g.refs.floaters.impulse(1.1);
    g.refs.robot.emote.show('!', 1.5);
    g.after(1.2, () => g.ui.subtitle('哇啊啊啊——！！', 1.6, g.S.name));
  },
  // 找到一位授权码：画面角落淡入一行电影字幕式的读数（不再弹漫画分镜）
  eyecatch(g, icon, digit) {
    const el = document.createElement('div');
    el.className = 'readout';
    const n = { '🤖': 1, '💧': 2, '🌍': 3 }[icon] || '';
    el.innerHTML = `<div class="ro-k">AIRLOCK AUTH · DIGIT ${n}/3</div><div class="ro-v"><span class="ro-ic">${icon}</span><b>${digit}</b></div><div class="ro-bar"></div>`;
    document.body.appendChild(el);
    g.audio.robotBeep(2, 1400);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3400);
  },
  // 原来的漫画"集中线"：写实版改成镜头被撞了一下——一震 + 一下色散
  speedLines(g, dur = 1) {
    const G = g.gfx.grade;
    G.cur.aberration = Math.max(G.cur.aberration, 0.004 + 0.004 * Math.min(1, dur));
    if (g._shake) g._shake(0.04 * Math.min(1.5, dur));
  },

  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label, verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.6) });
    const F = {
      shelf: ['资料库', '资料库：每一本书都拿松紧带勒着，不然全飘走了。顶上还有一盒索引卡。'],
      monitor2: ['生命维持控制台', '屏幕一片红：LIFE SUPPORT FAILURE。氧气条在一点点往下掉。'],
      farDesks: ['观测台', '窗前的观测台：一台望远镜、一张星图，还有一行小字："别在值班时偷看月亮"。'],
      shoeRack: ['氧气瓶架', '一排备用氧气瓶，用绑带勒得死死的。瓶身上写着"211 专用"。'],
      storageBox: ['补给货箱', '补给货箱："太空泡面 ×48，太空辣条 ×12，高数习题集 ×4"……为什么太空里也要做高数？'],
      blackTable: ['太空厨房', '太空厨房：加热器、饮水嘴，墙上用魔术贴粘着一排食物包。泡面桶……又飘走了一个。'],
      foldTable: ['舱外宇航服', '舱外宇航服，尺码 XL。头盔的金色面罩上映着我的脸。……我可不会穿这玩意儿出舱。'],
      pilotSeat: ['驾驶座', '（系好安全带）……操纵杆是锁着的，屏幕上写着"自动驾驶中"。'],
      dashboard: ['仪表台', '导航屏上是一条弯弯的返航轨道——室友们的返回舱早就沿着它回地球了。'],
      dispenser: ['饮水机', '饮水机漏水了，漏出来的水在失重下团成了一颗大水球……'],
      storageRack: ['储物架', '储物架上塞满了补给箱。最里面贴墙立着一个贴满警示条的货柜，门上写着一个大大的"G"。'],
      telescope: ['望远镜', ''],
      pinkBag: ['货物袋', '一袋真空包装的零食，标签上写着"太空辣条"。'],
      suitcase: ['个人储物箱', '我的储物箱被绑带固定在休眠舱边上。'],
      box350: ['饮用水', '一整包 350ml 的饮用水袋，每袋都带吸管。'],
      basket: ['脏衣篓', '脏衣篓的盖子扣得死死的——在太空里，脏衣服会飘出来追着你跑。'],
      bin: ['垃圾桶', '垃圾桶是抽气式的，盖子一开就"呼"地一声。'],
      ac: ['空气循环机', '空气循环机呼呼地吹——氧气就靠它了……现在它在报警。'],
      roster: ['值日表', ''],
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
      paper: ['复习资料', '高数复习资料在半空中翻页……写满了"失重状态下的积分"。'],
      apple: ['苹果', '一个在空中慢慢自转的苹果。牛顿看了会沉默。'],
      ticket: ['准考证', '准考证……考场在地球上。'],
      uvLight: ['紫光手电', '紫光手电在储物箱里飘着。这次用不上它了。'],
      suitNote: ['便利贴', '储物箱上的便利贴："返回地球之后再打开"。'],
    };
    for (const [id, [l, t]] of Object.entries(F)) H[id] = flav(l, t);
    H.roster = flav('值日表', '值日表：周一 {A}　周二 {B}　周三 {C}　周四 我……周五 小圆（机器人）。');
    H.clock = { label: '任务钟', verb: '看时间', reach: false, act: () => g.say(`${g.clockText}……氧气一点点在往下掉，得抓紧！`) };
    H.noodles = { label: '太空泡面', verb: '吸一口面条', act: () => {
      g.audio.slurp();
      g.say(S().f.noodle ? '面条已经泡发了……在太空里泡面会变成一个大面球。' : '吸溜——面条在空中飘成了一个圈，吃进去一半，另一半飘走了。', 3);
      S().f.noodle = true;
    } };
    H.candies = { label: '一团巧克力豆', verb: '张嘴去接', act: () => {
      const s = S();
      g.audio.crunch();
      if (s.f.candy) { g.say('巧克力豆被你吃得差不多了，剩下几颗还在转圈。', 2.6); return; }
      s.f.candy = true; s.freeHints++;
      g.fx.emit('dust', g.refs.candies.group.getWorldPosition(V()), { count: 6, speed: 0.25, spread: 0.6, up: 0.2, gravity: 0, drag: 1, life: 1.4, size: 0.025, colors: ['#e0b024', '#a8201c', '#1d4e92'] });
      g.say('啊呜——张嘴接住一颗巧克力豆！甜！（下一次提示免费）', 3);
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
    // ---- 休眠舱：室友们的都空了，只留下一段留言；我的那台舱盖开着 ----
    H.bedW1 = { label: () => `休眠舱 W-01 · ${g.S.mates[0]}`, verb: '查看留言', reach: false, act: () => this.podLog(g, 0) };
    H.bedW2 = { label: () => `休眠舱 W-02 · ${g.S.mates[1]}`, verb: '查看留言', reach: false, act: () => this.podLog(g, 1) };
    H.bedE2 = { label: () => `休眠舱 E-02 · ${g.S.mates[2]}`, verb: '查看留言', reach: false, act: () => this.podLog(g, 2) };
    H.bedE1 = { label: '我的休眠舱', verb: () => (S().f.readNote ? '查看' : '看看里面'), reach: false, act: () => this.myPod(g) };
    H.telescope = { label: '望远镜', verb: '看一眼', reach: false, act: () => g.say(S().f.curtainOpen ? '望远镜里，地球的海面反着光，云一团一团地往后退……' : '镜头对着舷窗——可遮光板还关着，只看得到一片灰。', 3.4) };
    H.station = { label: '信息接收站', verb: '查看消息', act: () => this.openStation(g) };
    // ---- 隐藏任务线（索引卡 / 货柜 G / 卡冈图雅 / 那本书）----
    Object.assign(H, this.secret.handlers());
    // ---- 开关、门、洗手间 ----
    H.switch = { label: '舱内照明', verb: () => (S().f.lightsOn ? '切回夜间模式' : '打开照明'), act: () => this.toggleLights(g) };
    H.door = { label: '气闸舱门', verb: () => (S().f.unlocked ? '出舱' : '输入授权码'), act: () => this.onDoor(g) };
    H.wcDoor = { label: '驾驶舱门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '储藏室舱门', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
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
        g.say(g.input.isTouch ? '够不着……得飘高一点！（按住右下角的 <b>▲上浮</b>）' : '够不着……得飘高一点！（按住 <b>空格</b> 往上飘）', 3);
        g.ui.toast(g.input.isTouch ? '按住 <b>▲上浮</b> 往上飘 · 按住 <b>▼下沉</b> 往下沉' : '按住 <kbd>空格</kbd> 上浮 · 按住 <kbd>C</kbd> 下沉', '', '🪐');
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
    if (!S.found[1]) { line = `💧那一位？${B}走之前把一张纸条泡进水球里了，就飘在驾驶舱！`; S.f.talkedB = true; }
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
      g.fx.emit('spark', rb.root.getWorldPosition(V()), { count: 6, speed: 0.5, spread: 1, up: 0.2, gravity: 0, drag: 2, life: 0.4, size: 0.02, colors: ['#ffe0a0', '#ffffff'] });
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
      g.clue('robot', `小圆：💧那一位在${B}泡的<b>水球</b>里（驾驶舱）；🌍那一位被${A}"写在了<b>地球</b>上"。`);
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

  // 室友的休眠舱：舱是空的，床头屏幕上留着一段语音留言（转成了文字）
  podLog(g, i) {
    const S = g.S, [A, B, C] = S.mates, name = S.mates[i];
    const code = ['W-01', 'W-02', 'E-02'][i];
    const msg = [
      `🌍那一位我用<b>城市的灯光</b>写在地球上了——太空舱每一百秒绕地球一圈，等地球"关灯"了再看！`,
      `💧那一位我泡进<b>水球</b>里了，就飘在驾驶舱（原来的洗手间）里。在太空里喝水全靠嘬 😎`,
      `对不起……小圆的陀螺仪被我碰坏了，现在它在天花板那儿乱转。🤖那一位它记着呢，<b>飘上去抓住它</b>就行。`,
    ][i];
    g.audio.robotBeep(1, 900);
    const node = g.ui.doc({ title: `休眠舱 ${code} · ${name}`, variant: 'plain', html: `<div style="line-height:1.8">状态：<b style="color:#ff6a7a">空</b>　·　乘员已于 06:52 乘返回舱离舱<br><br>留言（语音转文字）：<br>"${msg}"<div class="sig" style="text-align:right;color:#888">—— ${name}</div></div>` });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (i === 1) S.f.talkedB = true;
    if (!S.f[`pod${i}`]) {
      S.f[`pod${i}`] = true;
      g.clue(`pod${i}`, [`${A}的休眠舱留言：🌍那一位"用城市的灯光写在地球上"，要等地球"关灯"才看得见。`, `${B}的休眠舱留言：驾驶舱的<b>水球</b>里泡着纸条。`, `${C}的休眠舱留言：天花板附近乱转的机器人<b>小圆</b>记着🤖那一位。`][i]);
      if ([0, 1, 2].every((k) => S.f[`pod${k}`])) g.after(0.6, () => g.say('三台休眠舱全是空的……整节舱里，真的只剩我一个人了。', 3.4));
    }
  },
  // 我的休眠舱：舱盖开着，里面还冒着冷气；舱壁上贴着室友留的纸条（就像第一章显示器上那张便利贴）
  myPod(g) {
    const S = g.S;
    if (S.f.readNote) { g.say('我的休眠舱……还冒着冷气。我就是从这里醒过来的吗？', 3); return; }
    S.f.readNote = true;
    g.audio.paper();
    const node = g.ui.doc({
      variant: 'sticky',
      html: `睡神：<br>叫了你八百遍都不醒 😤 我们先坐返回舱回地球了。<br>气闸舱门的<span class="red">授权码</span>拆成了三份：<span class="red">🤖 💧 🌍</span><br>去我们的休眠舱看留言吧～<br>氧气够你用的，别慌！（大概）<div class="sig">—— 211 全体室友<br>${S.mates.join('、')}</div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    g.clue('note', '室友们坐返回舱先走了：气闸授权码 3 位（🤖 💧 🌍），线索在他们各自的<b>休眠舱留言</b>里。');
    g.after(0.4, () => g.say('又是这一套……好，一个一个来！', 2.6));
  },
  // 信息接收站：返回舱发回来的消息（像第一章的宿舍群）；隐藏任务线解锁之后多一个"频道 211"
  openStation(g) {
    const S = g.S, [A, B, C] = S.mates;
    if (this.secret.stationChannel()) return;
    g.audio.robotBeep(2, 1200);
    const node = g.ui.phone({
      title: '返回舱通讯 · CH-01', time: '07:3x', battery: 88, members: 4, footer: '信号延迟 1.3 秒……发出去的消息没有回音 📡',
      messages: [
        { time: '06:52', who: A, text: '我们上返回舱了！他还没醒？' },
        { who: B, text: '叫了八百遍，睡得跟死猪一样 🐷' },
        { who: C, text: '算了算了，给他留点"惊喜" 😏' },
        { time: '06:55', who: C, text: '气闸授权码拆成三份了：🤖💧🌍' },
        { who: A, text: '留言都在我们的休眠舱里，自己去看～' },
        { time: '07:10', who: '返回舱', text: '已脱离轨道，预计三小时后溅落。' },
        { who: B, text: '别忘了喝水！驾驶舱那台饮水机漏水了哈哈哈' },
      ],
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.station) { S.f.station = true; g.clue('station', '信息接收站：室友们坐<b>返回舱</b>先走了，授权码拆成 🤖💧🌍 三份，留言在他们的休眠舱里。'); }
  },

  toggleLights(g) {
    const S = g.S;
    S.f.lightsOn = !S.f.lightsOn;
    g.audio.switchClick(); g.audio.fluoro();
    if (S.f.lightsOn) g.after(0.4, () => g.ui.subtitle('照明模式已开启。……舱里亮堂堂的，更显得空荡荡了。', 2.6, '📢 舱内广播'));
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
  // 鉴赏模式：气闸舱门没有授权码，面板一开始就是绿的
  removeLock(g) { this._drawKeypad(g, 'open'); },
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
    g.fx.emit('dust', V(-1.62, 1.4, g.refs.door.z), { count: 30, speed: 0.6, spread: 1, up: 0.2, gravity: 0, drag: 1.2, life: 2, size: 0.08, colors: ['#e8e4dc', '#cfd6d2'], sway: 0.2 });
    g.say('嗤——气闸舱门的转轮自己转了起来！', 2.4);
    g.refs.robot.emote.show('star', 1.5);
    g.after(1.6, () => g.win());
  },

  update(g, dt) {
    const S = g.S;
    this.secret.update(dt);
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
    L.sun.intensity = sunVis * 3.4;
    const earthGlow = this._open * (0.1 + earthLit * 0.9); // 打开遮光板：地球反射的蓝光（叠在环境光上，不另外加灯）
    R.shafts.target = sunVis * this._open * clamp(-sky.sunDir.z * 2.2, 0, 1) * 0.035;
    R.shafts.uniforms.intensity.value = lerp(R.shafts.uniforms.intensity.value, R.shafts.target, kk);
    // 舱内照明：夜间模式（很暗：两盏暖色工作灯 + 屏幕光 + 驾驶舱的琥珀色）/ 照明模式（天花板的灯箱全开，偏冷的日光色）
    const on = (S && S.f.lightsOn) || g.lightMode === 'end';
    const spot = on ? 7 : 0;
    g.light.spot = lerp(g.light.spot, spot, 1 - Math.exp(-dt * 6));
    L.ceilSpots.forEach((s) => (s.intensity = g.light.spot));
    L.tubeMats.forEach((m) => (m.emissiveIntensity = on ? 1.8 : 0.04));
    R.ceilMat.emissiveIntensity = lerp(R.ceilMat.emissiveIntensity, on ? 0.5 : 0.05, kk);
    let hemi = (on ? 0.55 : 0.2) + earthGlow * 0.25;
    // 报警：红灯转起来
    const alarm = this._alarm > 0 || (S && S.f.alarm);
    if (this._alarm > 0) this._alarm -= dt;
    const B = R.hatch.beacon;
    B.light.intensity = lerp(B.light.intensity, alarm ? 7 : 0, 1 - Math.exp(-dt * 8));
    if (B.light.intensity > 0.05) {
      const a = t * 5;
      B.light.target.position.set(-1.68 + Math.cos(a) * 3, 1.2, 3.36 + Math.sin(a) * 3);
    }
    B.mat.emissiveIntensity = alarm ? 1.4 + Math.sin(t * 10) * 1.2 : 0.25;
    SL.stripMat.color.set(alarm ? '#ff3a22' : on ? '#b8dccb' : '#5e7c70').multiplyScalar(alarm ? 0.55 + 0.45 * Math.sin(t * 10) : 1);
    if (alarm) hemi *= 0.8;
    L.hemi.intensity = lerp(L.hemi.intensity, hemi, kk);
    L.hemi.color.lerp(_c.set(alarm ? '#7a4a44' : earthGlow > 0.3 ? '#5f7f98' : '#56706b'), kk);
    // 两盏暖色工作灯：夜间模式的主光（其中一盏接触不良，偶尔闪一下）
    const flick = Math.sin(t * 23) > 0.985 ? 0.35 : 1;
    SL.cabinGlow.intensity = (on ? 0.5 : 1.8) * flick;
    // 厨房那盏灯借的是走廊灯：出舱时门口的光门在用它，别抢
    const GL = SL.galleyLamp, home = GL.userData.home;
    if (!(R.doorLight && R.doorLight.power > 0.002)) {
      GL.position.copy(home.pos); GL.color.set(home.color); GL.distance = home.distance; GL.decay = home.decay;
      GL.intensity = on ? 0.35 : 1.2;
    } else { GL.distance = 9; GL.decay = 1.6; }
    // 镜头补光：只留一点点，别让人物背光时死黑
    const cam = g.camera;
    cam.getWorldDirection(_q);
    SL.camFill.position.copy(cam.position).add(_p.set(0, 0.8, 0)).addScaledVector(_q, -0.5);
    SL.camFill.target.position.copy(cam.position).addScaledVector(_q, 3);
    SL.camFill.intensity = on ? 0.06 : 0.12;
    g.scene.environmentIntensity = on ? 0.32 : 0.14;
    L.wc.intensity = on ? 10 : 8.5;
    g._updateDust(dt, 0.6);
    // 信息接收站的大屏（10 帧/秒）
    this._commsT -= dt;
    if (this._commsT <= 0 && R.gear && this.secret) {
      this._commsT = 0.1;
      const st = R.gear.station.screen;
      drawComms(st.canvas, { t, lines: this.secret.commsLines(this._comms), channel: this.secret.commsChannel(), anomaly: this.secret.anomaly(), alert: !!(S && S.f.alarm) });
      st.tex.needsUpdate = true;
    }
    // 我的休眠舱还在往外冒冷气
    this._mistT -= dt;
    if (this._mistT <= 0 && R.gear && this.secret && this.secret.stage < 5) {
      this._mistT = 0.3;
      const p = R.gear.pods.find((q) => q.who < 0);
      g.fx.emit('dust', p.mistW, { count: 2, speed: 0.12, spread: 1, up: 0.25, gravity: 0.02, drag: 0.6, life: 3, size: 0.1, colors: ['#e8f7ff', '#bfe8ff'], grow: 1.6 });
    }
    if (this.secret) this.secret.world(dt, t);
    // 机器人
    this._robot(g, dt, t);
  },
  _robot(g, dt, t) {
    const rb = g.refs.robot, r = rb.root;
    rb.faceT = (rb.faceT || 0) - dt;
    if (rb.talkT > 0) rb.talkT -= dt;
    let mode = rb.mode;
    if (rb.flashT > 0) rb.flashT -= dt;
    if (rb.flashT > 0) mode = rb.flashMode;
    else if (rb.state === 'follow' && rb.talkT > 0) mode = 'talk';
    else if (rb.state === 'follow' && (t % 3.2) < 0.12) mode = 'blink';
    else if (rb.state === 'follow' && mode === 'talk') mode = 'normal';
    if (rb.faceT <= 0 || mode !== rb._drawn) {
      rb.faceT = 0.08; rb._drawn = mode;
      TS.drawRobotFace(rb.faceCanvas, mode, t);
      rb.faceTex.needsUpdate = true;
    }
    // 两侧导风口里的小风扇：失控时狂转
    for (const [i, e] of rb.ears.entries()) e.rotation.y += dt * (rb.state === 'tumble' ? 45 : 16) * (i ? -1 : 1);
    rb.tipMat.color.set(Math.sin(t * (rb.state === 'tumble' ? 12 : 3)) > 0 ? (rb.state === 'tumble' ? '#ff3a26' : '#62ff8e') : '#2a0c08');
    rb.ring.rotation.z += dt * (rb.state === 'tumble' ? 6 : 1.2);
    rb.jet.scale.set(1, 0.5 + Math.random() * 0.3, 1);
    if (rb.state === 'tumble') {
      // 在天花板附近乱转、乱撞，隔一会儿冒火花
      r.position.set(rb.home.x + Math.sin(t * 0.9) * 0.35, rb.home.y + Math.sin(t * 1.7) * 0.08, rb.home.z + Math.sin(t * 0.63) * 0.4);
      rb.body.rotation.x += dt * rb.spin.x; rb.body.rotation.y += dt * rb.spin.y; rb.body.rotation.z += dt * rb.spin.z;
      rb.sparkT = (rb.sparkT || 1) - dt;
      if (rb.sparkT <= 0) {
        rb.sparkT = 0.7 + Math.random() * 1.2;
        g.fx.emit('spark', r.position.clone(), { count: 8, speed: 1.2, spread: 1, up: 0.5, gravity: 0, drag: 2, life: 0.5, size: 0.025, colors: ['#ffe0a0', '#ffffff', '#ffb04a'] });
        if (g.state === 'play' && r.position.distanceTo(g.camera.position) < 5) g.audio.robotBeep(1, 600 + Math.random() * 900);
      }
    } else {
      // 救下来之后：飘在主角右手边、肩膀高度，转过来看着镜头；别挡在镜头前面，也别钻进天花板
      const C = g.ctrl;
      const yaw = C.charYaw;
      _p.set(C.pos.x - Math.cos(yaw) * 0.6 + Math.sin(yaw) * 0.3, clamp(C.pos.y + 1.5 + Math.sin(t * 1.6) * 0.05, 0.4, 2.7), C.pos.z + Math.sin(yaw) * 0.6 + Math.cos(yaw) * 0.3);
      // 储藏室太窄：它在门外等着（不然会和人、门挤成一团，把门和货柜都挡住）
      const inStorage = C.pos.x < -0.58 && C.pos.z > 4.7;
      if (inStorage && rb.state === 'follow') _p.set(-0.22, clamp(C.pos.y + 1.55, 1.2, 2.3) + Math.sin(t * 1.6) * 0.04, 4.98);
      const cp = g.camera.position;
      if (_p.distanceTo(cp) < 0.7) { _q.subVectors(_p, cp).setY(0); if (_q.lengthSq() < 1e-4) _q.set(1, 0, 0); _p.addScaledVector(_q.normalize(), 0.7 - _p.distanceTo(cp)); }
      // 挡在镜头和人之间：往旁边让开
      if (rb.state === 'follow') {
        _h.set(C.pos.x, C.pos.y + 1.35, C.pos.z);
        _d.subVectors(_h, cp); const L2 = _d.lengthSq();
        const u = L2 > 1e-6 ? clamp(_q.subVectors(_p, cp).dot(_d) / L2, 0, 1) : 0;
        _q.copy(cp).addScaledVector(_d, u);
        const off = _p.distanceTo(_q);
        if (u > 0.05 && u < 0.98 && off < 0.42) {
          _q.subVectors(_p, _q); if (_q.lengthSq() < 1e-4) _q.set(Math.cos(yaw), 0.4, -Math.sin(yaw));
          _p.addScaledVector(_q.normalize(), 0.42 - off);
        }
      }
      r.userData.soft = rb.state === 'follow';
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
