// 第七章：地堡 211（公元 1403 年 · 波希米亚 · 凌晨 04:10，天亮就要攻城）
//   参考《天国：拯救》：宿舍成了拉泰城堡底下的一间地堡。库曼人天亮就要攻城，室友们被叫上城墙守夜去了。
//   任务：熬一瓶救世主酒，存个档——在《天国：拯救》里，只有喝了救世主酒才能存档；
//   这间地堡也一样：没存档就推门出去，只会"读档"，从澡堂的门里走回来。
//   配方上缺三个数（🌿⏳🔥），室友们一人藏了一个：
//   🌿 研钵里捣几片荨麻：{A}刻在他那把锈剑上 → 去澡堂打一桶水倒进磨刀石的水槽 → 把剑磨亮，剑身上刻着罗马数字
//   ⏳ 沙漏翻几次：{B}的骰子里有一颗灌了铅，永远停在同一面 → 翻靴子找到开锁器 → 撬开{B}的箱子（撬锁小游戏）→ 掷几次骰子
//   🔥 风箱拉几下：{C}的符木被狗「杂毛」叼到床底下了 → 拿一根香肠喂它 → 它钻到床底下叼出符木 → 数刻痕
//   凑齐以后在炼金台上熬：捣荨麻、翻沙漏、拉风箱，一样一样真的做一遍——熬成了喝一口，屏幕上一行"已存档"
import { CHAPTER_NAMES, chapterLabel } from './chapternames.js';
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, easeOutBack } from '../core/util.js';
import { untoonify } from '../world/toonkit.js';
import * as TX from '../core/textures.js';
import * as TC from '../core/tex_castle.js';
import { DOG_HOME, GRIND, BOARD, HEARTH } from '../world/castle.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _q = V();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _ax = V();
// 骰子：哪一面朝上（BoxGeometry 的六个面：+x -x +y -y +z -z → 点数 2 5 1 6 3 4）
const FACE_N = { 1: V(0, 1, 0), 6: V(0, -1, 0), 2: V(1, 0, 0), 5: V(-1, 0, 0), 3: V(0, 0, 1), 4: V(0, 0, -1) };
const faceUp = (v, yaw) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromUnitVectors(FACE_N[v], V(0, 1, 0)));
// 狗去{C}的床底下翻符木的路（过道正中间走）
const FETCH_PATH = [V(-0.55, 0, 1.55), V(0.15, 0, 0.6), V(0.35, 0, -1.2), V(0.62, 0, -2.05)];
const DROP_AT = V(-0.42, 0, 1.6); // 叼回来放在哪

export const CH7 = {
  n: 7, theme: 'castle',
  title: CHAPTER_NAMES[7], sub: '公元 1403 年 · 波希米亚 · 天亮就要攻城', tag: chapterLabel(7),
  clock: [4, 10], lockName: '救世主酒', doorName: '橡木门', doorVerb: '推门', codeLen: 3, codeIcons: ['🌿', '⏳', '🔥'],
  taskName: '熬一瓶救世主酒，存个档',
  tau: 5 * 60, par: 5 * 60, // 故事钟的快慢、⚡ 速通线（见 game.js）
  big: ['hearth', 'chest', 'grindstone', 'tub', 'foodTable', 'shelf', 'banner', 'shield', 'spears', 'farDesks', 'herbs', 'boots'],
  items: {
    sword: { icon: '🗡️', name: '锈剑', desc: '{A}的剑，锈得看不出刃口了。剑身上好像刻着字，被锈盖住了' },
    bucket: { icon: '🪣', name: '空木桶', desc: '澡堂里的木桶。去浴桶里舀一桶水' },
    water: { icon: '🪣', name: '一桶水', desc: '满满一桶热水，沉甸甸的。倒进磨刀石的水槽里' },
    picks: { icon: '🗝️', name: '开锁器 ×3', desc: '一卷皮子里裹着的三根开锁器，{B}的' },
    dice: { icon: '🎲', name: '骰子', desc: '{B}的六颗骰子，颜色都不一样。拿去骰子盘上掷' },
    sausage: { icon: '🌭', name: '香肠', desc: '一根熏香肠。杂毛的最爱' },
  },

  clockText(g) {
    const mm = 10 + g.storyMinutes();
    return `04:${String(mm).padStart(2, '0')} · ${g.S.f.taskDone ? '破晓' : '围城之夜'}`;
  },

  init(g) {
    const R = g.refs, S = g.S, C = R.castle;
    untoonify(g.ch.root);
    g.uvLight.visible = false; // 这一章没有手电
    g.scene.fog = new THREE.FogExp2('#0c0a08', 0.034);
    g.lightMode = 'game';
    const r = (n) => Math.floor(g.rnd() * n);
    S.digits[0] = 3 + r(6); // 荨麻 III ~ VIII 片
    S.digits[1] = 1 + r(6); // 骰子 1 ~ 6
    S.digits[2] = 2 + r(7); // 符木 2 ~ 8 道
    // 符木上的刻痕、锈剑
    TC.drawTally(C.tally.canvas, S.digits[2]); C.tally.tex.needsUpdate = true;
    TC.drawBlade(C.sword.canvas, { rust: 1 }); C.sword.tex.needsUpdate = true;
    this.items.sword.name = '锈剑';
    this.items.picks.name = '开锁器 ×3';
    // 灌了铅的那颗骰子
    this._loaded = r(6);
    this._rolls = []; this._rolling = false;
    this._sweet = (g.rnd() - 0.5) * 2.2; // 撬锁的"那个位置"
    this._picks = 3; this._broke = 0;
    // 状态
    this._shut = 0; this._dawn = 0; this._dawnT = 0; this._fire = 1;
    this._grinding = false; this._brewing = false; this._look = false; this._dog = 'home'; this._drunk = 0;
    this._crackT = 0.5; this._steamT = 0; this._dropT = 9; this._barkT = 6;
    this._rolledQ = null; this._baseQ = new THREE.Quaternion();
    C.sky = { dawn: 0, fire: 1 };
    const [A, B, Cc] = S.mates;
    this._letters = [{ who: `${A}、${B}、${Cc}`, time: '03:40', html: this._letterHtml(g) }];
    this._unread = 0;
    C.note.visible = false;
    // 狗趴回窝里
    const M = R.mutt;
    M.root.position.copy(DOG_HOME); M.root.rotation.y = 0; M.setState('lie'); M.hold(null);
    // 背景声：炉火、拱顶里的风、远处偶尔一声狗叫
    g.audio.stepKind = 'stone';
    g.audio.startFire();
    g.audio.startLoop('vaultAir', { type: 'lowpass', freq: 160, Q: 0.5, gain: 0.06, brown: true });
    this._dressUp(g);
  },
  // 主角披上一件羊毛斗篷（换章时 game.js 会摘掉 refs.wear 里的东西）
  _dressUp(g) {
    const ch = g.ch, wear = [];
    const woolT = TC.genWool({ base: '#4a3a2a', plaid: false, seed: 7159 }); woolT.repeat.set(3, 2);
    const wool = new THREE.MeshStandardMaterial({ map: woolT, roughness: 0.96, side: THREE.DoubleSide });
    const cg = new THREE.CylinderGeometry(0.2, 0.33, 0.9, 28, 6, true, Math.PI * 0.36, Math.PI * 1.28);
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i)); const k = 1 + Math.sin(a * 9) * 0.035 * (0.45 - y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    cg.computeVertexNormals();
    const cloak = new THREE.Mesh(cg, wool); cloak.position.set(0, 0.07, -0.02); cloak.castShadow = true; cloak.receiveShadow = true;
    ch.J.torso.add(cloak); wear.push(cloak);
    // 披在肩上堆着的兜帽 + 胸前一枚铜扣
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 20, Math.PI * 1.2), wool); hood.position.set(0, 0.5, -0.03); hood.rotation.set(Math.PI / 2 - 0.2, 0, Math.PI * 0.9); hood.castShadow = true;
    ch.J.torso.add(hood); wear.push(hood);
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: '#a8843a', roughness: 0.35, metalness: 0.85 })); clasp.position.set(0, 0.47, 0.13);
    ch.J.torso.add(clasp); wear.push(clasp);
    g.refs.wear = wear;
  },
  leave(g) {
    for (const id of ['kcdsave']) { const el = document.getElementById(id); if (el) el.remove(); }
    g.audio.stopLoop('vaultAir'); g.audio.stopLoop('grind');
  },
  removeLock() {},

  // ---------- 进门 ----------
  portal: 'dawn',
  intro(g, { prepare }) {
    if (prepare) { g.enterRoom({ prepare: true }); return; }
    const T = g.enterRoom({ prepare: false });
    const say = (t, d = 2.6) => g.ui.subtitle(t, d, g.S.name);
    g.after(T - 0.2, () => { g.ch.setExpression('shock'); g._cutPose = { lookYaw: 0.3, lookPitch: 0.25 }; say('……好暗。一股烟熏味，还有……马粪味？', 2.4); });
    g.after(T + 1.2, () => { g._cineTo(V(-0.2, 1.55, 3.25), V(-1.3, 1.6, 1.3), 2.2); g._cutPose = { lookYaw: 0.5, lookPitch: 0.3 }; });
    g.after(T + 2.0, () => say('石头拱顶、壁炉、稻草铺……这是城堡的地堡？', 3.0));
    g.after(T + 5.2, () => { g._cineTo(V(-0.25, 1.05, 3.0), V(-0.95, 0.35, 2.1), 1.4); g.audio.dogWhine(); g.refs.mutt.wagAmp = 1; });
    g.after(T + 6.0, () => say('……一条狗。它冲我摇尾巴。', 2.4));
    g.after(T + 8.4, () => { g._cineTo(V(0.55, 1.45, 0.95), V(1.34, 0.8, 0.02), 1.6); g._cutPose = { lookYaw: -0.6, lookPitch: -0.1 }; });
    g.after(T + 9.0, () => say('桌上插着一把匕首，底下压着一封信。', 2.8));
    g.after(T + 12.0, () => { g._cutPose = null; g.ch.setExpression('neutral'); g._cineTo(null, null, 1.2); });
    g.after(T + 13.2, () => g.beginPlay());
  },
  onSlam(g) {
    g.audio.thud();
    for (let i = 0; i < 3; i++) g.fx.emit('dust', V(-1.2 + Math.random() * 1.6, 2.8, 3.2 + Math.random() * 0.8), { count: 10, speed: 0.2, spread: 0.5, up: 0, gravity: -0.8, drag: 1.2, life: 2.4, size: 0.1, colors: ['#5a5046', '#3a342c'], grow: 1.2 });
    this._flare = 0.6; // 火把被门带起来的风吹得一晃
  },
  onPlay(g) {
    g.ui.toast('第七章 · 天亮之前，熬一瓶救世主酒，把这一刻存下来', '', '⚔️');
    g.after(1.3, () => g.ui.subtitle('先看看匕首底下压着的那封信。', 3.2, g.S.name));
  },
  exitLine: (g) => (g.S.f.taskDone ? '存好档了——走！' : '……先出去看看。'),
  onDoorOpen(g) { g.audio.chirp(); g.after(0.3, () => g.audio.chirp()); },

  // ---------- 目标 / 提示 ----------
  objectives(g) {
    const S = g.S, f = S.f, F = S.found, n = F.filter(Boolean).length, [A, B, C] = S.mates;
    if (!f.readLetter && !S.loops) return [{ text: '看看炼金台上匕首压着的那封信', done: false }];
    if (!f.readLetter) return [{ text: '出门又绕回来了……炼金台上压着一封信', done: false }];
    return [
      { text: '任务：熬一瓶救世主酒，存个档', done: !!f.taskDone },
      { text: `🌿 磨亮${A}的锈剑，看剑身上刻的字`, done: F[0] },
      { text: `⏳ 撬开${B}的箱子，掷一掷他的骰子`, done: F[1] },
      { text: `🔥 让杂毛把${C}的符木叼出来`, done: F[2] },
      { text: `在炼金台上熬救世主酒（${n}/3）`, done: !!f.taskDone },
      ...(f.taskDone ? [{ text: '存好档了——推门出去！', done: false }] : []),
    ];
  },
  hint(g) {
    const S = g.S, f = S.f, F = S.found, inv = S.inv, [A, B, C] = S.mates;
    if (!f.readLetter) return '我的书桌成了炼金台，上面插着一把匕首——底下压着室友们的信。';
    if (!F[0]) {
      if (!inv.includes('sword') && !f.sharpened) return `${A}的锈剑靠在他床边（西边中间那张床），拿上。`;
      if (!f.troughFull) {
        if (inv.includes('water')) return '把水倒进东南角那台磨刀石底下的水槽里。';
        if (inv.includes('bucket')) return '去澡堂的大浴桶里舀一桶水。';
        return '磨刀石的水槽是干的。澡堂里有只木桶，拿它去浴桶里打一桶水。';
      }
      return '水槽满了——在磨刀石上把剑磨亮，看看剑身上刻着什么。';
    }
    if (!F[1]) {
      if (!f.chestOpen) {
        if (!inv.includes('picks')) return `开锁器在${B}的靴子里：东南角墙根那一排皮靴，翻一翻。`;
        return `用开锁器撬开${B}的箱子（西北边那张床旁边）：左右挪开锁器，找到那个位置，再按住转动。`;
      }
      if (!f.diceOnBoard && inv.includes('dice')) return '拿着骰子去第二张书桌上的骰子盘，掷几次。';
      return '多掷几次骰子：有一颗每次都停在同一面——那颗灌了铅。';
    }
    if (!F[2]) {
      if (f.tallyDropped) return '杂毛把符木叼回来了，捡起来数一数上面的刻痕。';
      if (this._dog !== 'home') return '杂毛正钻在床底下翻东西，等它一会儿。';
      if (!inv.includes('sausage')) return '门边搁板桌上有一串香肠，拿一根。';
      return `把香肠喂给壁炉前趴着的杂毛，它会把${C}的符木叼出来。`;
    }
    if (!f.taskDone) return `三个数都有了：${S.digits.join('')}。去炼金台熬救世主酒——捣荨麻、翻沙漏、拉风箱。`;
    return '存好档了。推开橡木门，出去吧！';
  },
  readyLine: (g) => `三个数凑齐了：${g.S.digits.join('')}！去炼金台熬救世主酒！`,
  loopLines(g, n) {
    const S = g.S;
    if (n === 1) return [['……出门走了没几步——怎么又从澡堂里走出来了？！', 3], [S.f.readLetter ? '就像……没存档就死了，直接读档回到了这里。信上说得对：得先熬救世主酒。' : '炼金台上那封信……先看看。', 3.4]];
    if (n === 2) return [['又读档了……上一次存档是什么时候来着？', 2.8]];
    return [[`第 ${n} 次读档。先把救世主酒熬出来。`, 2.6]];
  },
  story(g, p) {
    const S = g.S, [A, B, C] = S.mates;
    const once = (k) => (S.msgSent[k] ? false : (S.msgSent[k] = true));
    if (p > 0.12 && once('bell')) { g.audio.churchBell(5); g.after(1.2, () => g.ui.subtitle('……远处萨扎瓦修道院的晨祷钟响了。', 3.4, S.name)); }
    if (p > 0.28 && once('noteA')) this._note(g, { who: A, time: g.clockText.slice(0, 5), lines: ['城墙上冷死了！', '库曼人的营火把整片山都点亮了，数都数不过来。', '你醒了没？醒了就把救世主酒熬上——天一亮，谁也说不准。'] });
    if (p > 0.45 && once('horn')) {
      g.audio.warHorn(); g._shake(0.12);
      for (let i = 0; i < 5; i++) g.after(0.4 + i * 0.25, () => g.fx.emit('dust', V(-1.4 + Math.random() * 2.8, 2.85, -3 + Math.random() * 7), { count: 8, speed: 0.15, spread: 0.4, up: 0, gravity: -0.9, drag: 1.2, life: 2.6, size: 0.1, colors: ['#5a5046', '#3a342c'], grow: 1.2 }));
      g.after(2.2, () => g.ui.subtitle('呜——呜——……是库曼人的号角。拱顶上簌簌地往下掉灰。', 3.6, S.name));
    }
    if (p > 0.62 && once('volley')) {
      g.refs.vista.volley(10); g.audio.shouts(3.5);
      g.after(2.4, () => { g.audio.thud(); g._shake(0.08); });
      g.after(1.0, () => g.ui.subtitle(this._shut > 0.5 ? '火箭！一排火光从远山上飞过来，扎在城墙上……' : '外面有人在喊"放箭"……城墙上"咚咚"地响。', 3.6, S.name));
    }
    if (p > 0.7 && once('noteC')) g.after(3, () => this._note(g, { who: C, time: g.clockText.slice(0, 5), lines: ['他们放火箭了！地堡里最安全，别出来！', `${B}说他那颗骰子是在库特纳霍拉赢来的，宝贝得很。`, '杂毛饿了就喂它一根香肠。'] }));
    if (p > 0.86 && once('dawn')) { this._dawnT = Math.max(this._dawnT, 0.18); g.after(1, () => g.ui.subtitle('东边的天……开始发白了。', 3, S.name)); }
  },
  // 门缝底下塞进来一张纸条
  _note(g, msg) {
    const N = g.refs.castle.note;
    this._letters.push({ who: msg.who, time: msg.time, html: msg.lines.join('<br>') });
    this._unread++;
    N.visible = true;
    N.position.set(-1.62, 0.004, g.refs.door.z - 0.1);
    g.tween(0.6, (k) => N.position.set(lerp(-1.95, -1.52, k), 0.004, g.refs.door.z - 0.1), { ease: easeOut });
    g.audio.paper();
    g.ui.toast(`门缝底下塞进来一张纸条：<b>${msg.who}</b>`, '', '📜');
  },
  _letterHtml(g) {
    const [A, B, C] = g.S.mates;
    return `<div class="date">公元 1403 年 · 凌晨 · 拉泰城堡地堡</div>
      睡神：<br>
      库曼人天亮就要攻城。队长把我们仨叫上城墙守夜去了——你睡得跟喝醉了的戈德温神父一样，怎么踹都踹不醒。<br>
      听好：这间地堡的门，<span class="red">推开也走不出去，只会绕回来</span>。整座城堡里只有一样东西能把"这一刻"存下来——<b>救世主酒</b>。喝一口，就算<b>存档</b>。<br>
      配方在炼金台上，缺的三个数，我们仨一人藏了一个（谁让你昨晚打呼噜）：<br>
      🌿 <b>研钵里捣几片荨麻</b> —— ${A}：刻在我那把锈剑上了。剑靠在我床边，找块磨刀石磨一磨（先打水！）。<br>
      ⏳ <b>沙漏翻几次</b> —— ${B}：跟我那副骰子赌一把。有一颗灌了铅，永远停在同一面。骰子锁在我箱子里，开锁器在我靴子里。<br>
      🔥 <b>风箱拉几下</b> —— ${C}：数我那根符木上的刻痕。符木被杂毛叼到我床底下去了——给它一根香肠，它什么都肯叼给你。<br>
      熬好了记得喝一口。愿耶稣基督受赞美。
      <div class="sig">—— ${A}、${B}、${C}（在城墙上冻着）</div>`;
  },

  handlers(g) {
    const H = {};
    const S = () => g.S;
    const flav = (label, text) => ({ label: () => g._fill(label), verb: '查看', reach: false, act: () => g.say(g._fill(text), 3.8) });
    const Fl = {
      bedW1: ['{A}的床', '{A}的铺：稻草垫子、一条格子羊毛毯。枕头底下压着一本翻烂了的《骑士守则》，还有半块啃剩的面包。'],
      bedW2: ['{B}的床', '{B}的铺上铺着一张羊皮。床头刻着一行小字："{B} 欠汉斯大人 30 格罗申"。'],
      bedE1: ['我的床', '我的铺。稻草扎得后背痒痒的……难怪我睡得跟死猪一样。'],
      bedE2: ['{C}的床', '{C}的铺，红羊毛帘子拉了一半。床底下黑乎乎的，好像塞了不少东西。'],
      shelf: ['书架', '一排羊皮面的抄本：《圣经》《草药志》《骑士守则》《炼金术士手记（残本）》。书脊上全是蜡烛油。'],
      fallenBooks: ['掉在地上的书', '书架前的地上掉着三本羊皮抄本……今天晚上，好像也有书自己从书架上掉了下来。'],
      farDesks: ['窗边的桌子', '窗边两张桌子：一盏角灯、一顶锅盔，还有一张画得歪歪扭扭的地图。'],
      map: ['地图', '手绘的地图：萨扎瓦河从拉泰城边上绕过去；东北角的斯卡利茨被人用红笔打了个叉；一串红箭头从东边压过来，旁边写着"库曼人"。'],
      kettleHat: ['锅盔', '一顶宽檐铁盔。戴上它，脑袋像扣在一口锅里……{C}说这叫"防砸"。'],
      banner: ['旗', '红底上一头戴王冠的双尾白狮——波希米亚王国的旗。{A}说，等打退了库曼人，要扛着它进拉泰城。'],
      shield: ['大盾', '一面一人多高的大盾，也画着那头双尾白狮，边上还扎着几支断箭。'],
      spears: ['长矛', '墙上架着两根长矛，矛尖磨得锃亮——看来那台磨刀石平时没闲着。'],
      herbs: ['草药', '墙上挂着一束束晒干的草药：荨麻、鼠尾草、颠茄……那串黑果子可别乱吃。'],
      drawer: ['抽屉', '抽屉里只有几根蜡烛头、一块火石，和一张画着猪的涂鸦。'],
      stoolMe: ['凳子', '一张木凳，坐上去吱呀吱呀响。'],
      foodTable: ['搁板桌', '门边的搁板桌上摆着夜宵：黑面包、半轮奶酪、一串香肠、一罐啤酒。'],
      bread: ['面包和奶酪', '一大块黑面包、半轮奶酪……硬得能当砖头用。'],
      sconce: ['火把', '墙上插着一支火把，松脂烧得噼啪响，把拱顶熏得乌黑。'],
      towels: ['亚麻布', '几块亚麻布搭在绳子上——澡堂的毛巾。'],
      graffiti: ['隔板上的刻字', '木板上用刀尖刻着"窗外有猴!!"……刻痕很旧了。'],
      hearth: ['壁炉', '石头砌的壁炉，柴火烧得正旺。杂毛就趴在炉子前面烤火。'],
    };
    for (const [id, [l, t]] of Object.entries(Fl)) H[id] = flav(l, t);
    // ---- 信、配方、炼金台 ----
    H.letter = { label: '匕首压着的信', verb: () => (this._unread ? '看看纸条' : '阅读'), act: () => this.openLetters(g) };
    H.note = { label: '门缝底下的纸条', verb: '捡起来看', act: () => { g.refs.castle.note.visible = false; this.openLetters(g); } };
    H.recipe = { label: '配方', verb: '阅读', act: () => this.openRecipe(g) };
    H.bench = {
      label: '炼金台',
      verb: () => (S().f.taskDone ? '查看' : S().f.readLetter ? '熬救世主酒' : '查看'),
      act: () => {
        const s = S();
        if (this._brewing) return;
        if (s.f.taskDone) { g.say('接收瓶里还剩小半瓶救世主酒，金灿灿的……省着点喝。', 3); return; }
        if (!s.f.readLetter) { g.say('一张炼金台：炭炉上架着一口铜锅，旁边是蒸馏器、研钵、沙漏、风箱……桌上还插着一把匕首。', 3.8); return; }
        this.brewUI(g);
      },
    };
    // ---- 🌿 剑、水、磨刀石 ----
    H.sword = { label: () => g._fill(S().f.sharpened ? '{A}的剑' : '{A}的锈剑'), verb: () => (S().f.sharpened ? '看看剑身' : '拿上'), act: () => {
      const s = S();
      if (s.f.sharpened) { this.showBlade(g); return; }
      g.give('sword'); g.refs.castle.sword.group.visible = false; g.audio.clunk();
      g.say(g._fill('{A}的剑……锈得看不出刃口了。剑身上好像刻着字，全被锈盖住了。'), 3.4);
    } };
    H.bucket = { label: '木桶', verb: () => (S().f.troughFull ? '查看' : '拿上'), act: () => {
      const s = S();
      if (s.f.troughFull) { g.say('空木桶。水都倒进磨刀石的水槽里了。', 2.6); return; }
      g.give('bucket'); g.refs.castle.bucket.visible = false; g.audio.clunk();
      g.say('一只木桶。去浴桶里舀一桶水。', 2.6);
    } };
    H.tub = { label: '大木浴桶', verb: () => (S().inv.includes('bucket') ? '舀一桶水' : '查看'), act: () => {
      const s = S();
      if (s.inv.includes('bucket')) {
        g.take('bucket'); g.give('water', true); g.audio.splash();
        g.ui.toast('获得：<b>一桶水</b>', 'item', '🪣');
        g.say('舀了满满一桶热水……澡堂的洗澡水，将就着用吧。', 3);
        return;
      }
      g.fx.emit('steam', g.refs.castle.tub.at.clone(), { count: 4, speed: 0.15, spread: 0.5, up: 0.6, gravity: 0.15, drag: 1, life: 2.4, size: 0.2, colors: ['#e8e4dc'], grow: 2.2 });
      g.say(['一大桶热水，还冒着气……在这年头，洗个澡能让人高看你一眼。可库曼人天亮就攻城，现在泡澡？', '水面上漂着几片草药叶子。挺香。', '还是算了……别让室友回来看见我在泡澡。'][(this._tubN = (this._tubN || 0) + 1) % 3], 3.6);
    } };
    H.grindstone = { label: '磨刀石', verb: () => { const s = S(); if (s.f.sharpened) return '转一转'; if (!s.f.troughFull) return s.inv.includes('water') ? '往水槽里倒水' : '查看'; return s.inv.includes('sword') ? '磨剑' : '查看'; }, act: () => this.onGrind(g) };
    // ---- ⏳ 靴子、箱子、骰子 ----
    H.boots = { label: '皮靴', verb: () => (S().inv.includes('picks') ? '查看' : '翻一翻'), act: () => {
      const s = S(), B = s.mates[1];
      if (s.inv.includes('picks')) { g.say('一排皮靴，一股脚臭味。开锁器已经在我身上了。', 2.8); return; }
      if (s.f.chestOpen) { g.say('一排皮靴，一股脚臭味。', 2.4); return; }
      this._picks = 3; this.items.picks.name = '开锁器 ×3';
      g.give('picks'); g.audio.paper();
      g.say(s.f.gotPicks ? `靴筒里还有一卷备用的……${B}撬锁的本事看来也不怎么样。` : `捏着鼻子翻了翻${B}的靴子——靴筒里塞着一卷皮子，里面裹着三根开锁器！`, 3.6);
      s.f.gotPicks = true;
    } };
    H.chest = { label: () => g._fill('{B}的箱子'), verb: () => (S().f.chestOpen ? '查看' : S().inv.includes('picks') ? '撬锁' : '打开'), act: () => {
      const s = S(), B = s.mates[1];
      if (s.f.chestOpen) { g.say(s.inv.includes('dice') || s.f.diceOnBoard ? '箱子里还剩几枚布拉格格罗申。不是我的，不拿。' : '箱子里是骰子和几枚格罗申。', 2.8); return; }
      if (!s.inv.includes('picks')) {
        g.audio.lockedRattle();
        g.say(`${B}的箱子上了锁，锁眼周围全是划痕。信上说开锁器在他的靴子里。`, 3.4);
        g.clue('chest', `${B}的<b>箱子</b>上了锁。开锁器在他的<b>靴子</b>里（东南角墙根那一排）。`);
        return;
      }
      this.lockpick(g);
    } };
    H.diceBoard = { label: '骰子盘', verb: () => (S().f.diceOnBoard || S().inv.includes('dice') ? '掷骰子' : '查看'), act: () => this.rollDice(g) };
    // ---- 🔥 香肠、狗、符木 ----
    H.sausage = { label: '香肠', verb: () => (S().inv.includes('sausage') || S().f.fed ? '查看' : '拿一根'), act: () => {
      const s = S();
      if (s.inv.includes('sausage')) { g.say('手里已经有一根了。', 2); return; }
      if (s.f.fed) { g.say('还剩三根香肠……杂毛在那边眼巴巴地盯着。', 2.8); return; }
      g.give('sausage'); const ss = g.refs.castle.sausages; ss[ss.length - 1].visible = false;
      g.say('拿了一根熏香肠。壁炉那边的狗鼻子抽了两下。', 3);
    } };
    H.mutt = { label: '狗「杂毛」', verb: () => (this._dog !== 'home' ? '等它' : S().inv.includes('sausage') ? '喂香肠' : '摸摸头'), reach: false, act: () => this.onDog(g) };
    H.tally = { label: '符木', verb: '捡起来看', act: () => this.readTally(g) };
    // ---- 吃的喝的（免费提示）----
    H.beer = { label: '啤酒', verb: () => (S().f.beer ? '查看' : '喝一口'), act: () => {
      const s = S();
      if (s.f.beer) { g.say('罐子里还剩一点……不能再喝了，天旋地转的。', 2.8); return; }
      s.f.beer = true; s.freeHints++; s.ach.add('godwin');
      g.audio.gulp(); this._drunk = 1;
      g.say('咕咚咕咚……好酒！就是……拱顶怎么转起来了？（下一次提示免费）', 3.6);
    } };
    H.pot = { label: '一锅菜粥', verb: () => (S().f.porridge ? '查看' : '喝一碗'), act: () => {
      const s = S();
      if (s.f.porridge) { g.say('锅底还剩一点，糊了。', 2.4); return; }
      s.f.porridge = true; s.freeHints++;
      g.audio.slurp();
      g.fx.emit('steam', V(HEARTH.x - 0.05, 0.8, HEARTH.z), { count: 5, speed: 0.2, spread: 0.4, up: 0.8, gravity: 0.2, drag: 1, life: 2, size: 0.12, colors: ['#f0ece4'], grow: 2.2 });
      g.say('一碗热乎乎的菜粥——卷心菜、豆子，还有几块说不清是什么的肉。（下一次提示免费）', 3.8);
    } };
    H.shrine = { label: '圣母像', verb: '祷告', act: () => {
      g.ch.setExpression('focus', 2);
      g.say('愿耶稣基督受赞美。', 2.2);
      g.after(2.4, () => g.ui.subtitle('……永远受赞美，阿门。（心里踏实了一点）', 2.8, g.S.name));
    } };
    // ---- 窗、镜子、门、澡堂 ----
    H.window = { label: '窗板', verb: () => (S().f.shutters ? '看窗外' : '推开窗板'), act: () => this.onWindow(g) };
    H.mirror = { label: '铜镜', verb: '照镜子', reach: false, act: () => {
      g.ch.setExpression('grin', 2.2);
      g.say(['铜镜里的我：披着斗篷，脸被火光照得通红……活像个守城的民兵。', '镜子是磨亮的铜，照出来的人黄澄澄的，还有点歪。', '别照了，天快亮了！'][(this._mirN = (this._mirN || 0) + 1) % 3], 3.2);
    } };
    H.wcDoor = { label: '澡堂的门', verb: () => (g.refs.wcDoor.open ? '关上' : '推开'), act: () => g.toggleWcDoor() };
    H.cubDoor = { label: '茅厕的门', verb: () => (g.refs.cubDoor.open ? '关上' : '打开'), act: () => g.toggleCubDoor() };
    H.toilet = { label: '茅厕', verb: '往下看', act: () => { g.audio.drip(); g.say('一块木板上开个洞，底下黑咕隆咚、直通护城河……一股凉风往上吹。', 3.4); } };
    H.wcWindow = { label: '窗户', verb: '看窗外', reach: false, act: () => {
      const O = g.refs.outside;
      if (O.busy) { g.say('三只猴子还在冲我做鬼脸……'); return; }
      O.trigger(4.5); g.audio.monkey(); g.after(0.8, () => g.audio.monkey(1.25));
      if (!S().f.sawMonkeys) { S().f.sawMonkeys = true; S().ach.add('monkey'); g.ui.toast('发现彩蛋：<b>锁在颈手枷上示众的三只猴子</b>', 'clue', '🐒'); }
      g.say('窗外是城堡的院子：三只猴子被锁在颈手枷上示众……被我一看，全都醒了，冲我吐舌头。', 4);
    } };
    return H;
  },

  // ---------- 信 / 纸条、配方 ----------
  openLetters(g) {
    const S = g.S;
    g.audio.paper();
    this._unread = 0;
    const msgs = this._letters.slice().reverse();
    const html = msgs.map((m) => `<div style="margin-bottom:12px"><div style="opacity:.6;font-size:13px">📜 ${m.time} · ${m.who}</div>${m.html}</div>`).join('<hr style="border:none;border-top:1px dashed rgba(60,30,10,.3);margin:10px 0">');
    const node = g.ui.doc({ title: '室友们的信', html, variant: 'parchment' });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (!S.f.readLetter) {
      S.f.readLetter = true;
      const [A, B, C] = S.mates;
      g.clue('letter', `室友的信：出门只会绕回原地——喝一口<b>救世主酒</b>才算"存档"。配方在炼金台上，缺三个数：🌿 荨麻几片（${A}刻在他的<b>锈剑</b>上，拿去<b>磨刀石</b>磨，先打水）；⏳ 沙漏翻几次（${B}的<b>骰子</b>里灌了铅的那颗，骰子锁在他<b>箱子</b>里，开锁器在他<b>靴子</b>里）；🔥 风箱拉几下（${C}的<b>符木</b>，被狗<b>杂毛</b>叼走了，喂它香肠）。`);
      g.after(0.5, () => g.say(S.loops ? '难怪出了门又回到这儿……跟没存档一样。得熬一瓶救世主酒！' : '救世主酒……喝一口就能存档？这帮家伙又在搞什么名堂。先把三个数找齐！', 3.6));
    }
  },
  openRecipe(g) {
    const S = g.S;
    g.audio.paper();
    const d = (i) => (S.found[i] ? `<b>${S.digits[i]}</b>` : '<span class="blank">＿</span>');
    const node = g.ui.doc({ title: '救世主酒', variant: 'parchment', html: `<div class="date">摘自《炼金术士手记》· Saviour Schnapps</div>
      一、往锅里倒一瓶葡萄酒，烧开。<br>
      二、研钵里捣碎 🌿 ${d(0)} 片荨麻，下锅。<br>
      三、煮，⏳ 沙漏翻 ${d(1)} 次。<br>
      四、加一株颠茄，🔥 风箱拉 ${d(2)} 下，把火吹旺。<br>
      五、蒸馏，装瓶。<br><br>
      <span class="red">喝一口，存一次档。</span>
      <div class="sig" style="font-size:14px">（三个数被人用炭笔涂掉了，页边上写着：${S.mates.join('、')}，一人一个）</div>` });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    g.clue('recipe', '炼金台上方的<b>配方</b>：🌿 荨麻几片 · ⏳ 沙漏几次 · 🔥 风箱几下，三个数凑齐了去炼金台熬。');
  },

  // ---------- 🌿 磨刀石 ----------
  onGrind(g) {
    const S = g.S, Gd = g.refs.castle.grind, [A] = S.mates;
    if (this._grinding) return;
    if (S.f.sharpened) {
      g.audio.grind(0.8);
      g.tween(1.2, (k) => (Gd.wheel.rotation.z -= 0.2 * (1 - k)), { ease: (t) => t });
      g.say('砂轮呼呼地转。剑已经磨好了。', 2.4);
      return;
    }
    if (!S.f.troughFull) {
      if (S.inv.includes('water')) {
        g.take('water'); S.f.troughFull = true;
        g.audio.pour();
        g.after(0.6, () => { Gd.water.visible = true; });
        // 空木桶放在磨刀石旁边
        const b = g.refs.castle.bucket;
        g.refs.root.add(b); b.position.set(GRIND.x - 0.55, 0, GRIND.z + 0.35); b.rotation.set(0, 0.4, 0); b.visible = true;
        g.say(S.inv.includes('sword') ? '哗——水槽满了。现在可以磨剑了。' : `哗——水槽满了。再去把${A}的剑拿过来。`, 3);
        return;
      }
      if (S.inv.includes('sword')) {
        g.say('水槽是干的——干磨会把刃口磨崩，还会磨出一身火星子。先打点水来。', 3.6);
        g.clue('grind', '<b>磨刀石</b>的水槽是干的，要先打水（澡堂里有木桶和浴桶）。');
        return;
      }
      g.say('一台磨刀石：砂轮底下是个水槽，干得冒灰。', 2.8);
      g.clue('grind', '<b>磨刀石</b>在东南角，水槽是干的。');
      return;
    }
    if (!S.inv.includes('sword')) { g.say(`磨刀石准备好了……${A}的剑还靠在他床边。`, 3); return; }
    this.sharpen(g);
  },
  sharpen(g) {
    const S = g.S, C = g.refs.castle, Gd = C.grind, [A] = S.mates;
    this._grinding = true;
    g.take('sword');
    Gd.grindSword.visible = true;
    g._cineTo(V(GRIND.x - 0.85, 1.28, GRIND.z - 0.62), V(GRIND.x - 0.12, 0.82, GRIND.z + 0.05), 0.9);
    g.say('我可是铁匠的儿子——磨剑这种事，闭着眼都会。', 3);
    const dur = 4.2;
    g.audio.grind(dur);
    const sw = Gd.grindSword.children[0];
    const z0 = sw.position.z;
    let last = -1;
    g.tween(dur, (k) => {
      Gd.wheel.rotation.z -= 0.35 * Math.min(1, k * 4) * Math.min(1, (1 - k) * 6);
      sw.position.z = z0 + Math.sin(k * Math.PI * 7) * 0.12;
      // 锈一层层磨掉（隔一会儿重画一次剑身贴图）
      const step = Math.floor(k * 6);
      if (step !== last) { last = step; TC.drawBlade(C.sword.canvas, { rust: Math.max(0.1, 1 - k * 1.1), numeral: TC.ROMAN[S.digits[0]] }); C.sword.tex.needsUpdate = true; }
      if (Math.random() < 0.7) {
        const p = V(GRIND.x - 0.2, 0.9, GRIND.z + (sw.position.z + 0.2));
        g.fx.emit('spark', p, { count: 2, speed: 1.4, spread: 0.6, up: 0.5, gravity: -3, drag: 0.8, life: 0.5, size: 0.02, colors: ['#ffd080', '#ff9a40', '#fff0c0'] });
      }
      if (Math.random() < 0.15) g.fx.emit('drop', V(GRIND.x - 0.25, 0.75, GRIND.z), { count: 1, speed: 0.5, spread: 0.5, up: 0.4, gravity: -5, drag: 0.4, life: 0.6, size: 0.015, colors: ['#bcd0d8'] });
    }, { ease: (t) => t });
    g.after(dur + 0.2, () => {
      Gd.grindSword.visible = false;
      S.f.sharpened = true; S.ach.add('whetstone');
      this.items.sword.name = '磨亮的剑';
      // 剑放回{A}的床边
      C.sword.group.visible = true;
      C.sword.mat.roughness = 0.3; C.sword.mat.metalness = 0.85;
      g._cineTo(null, null, 0.8);
      g.audio.shing();
      g.say('锈磨掉了——剑身上刻着一行字！', 2.4);
    });
    g.after(dur + 1.2, () => { this.showBlade(g, true); this._grinding = false; });
  },
  showBlade(g, first = false) {
    const S = g.S, [A] = S.mates, num = TC.ROMAN[S.digits[0]];
    const c = TX.makeCanvas(900, 200);
    TC.drawBladeDoc(c, num);
    const node = g.ui.doc({ variant: 'parchment', title: `${A}的剑`, html: `<div style="margin-bottom:8px">剑身上刻着一行字：<b>✠ URTICA ✠ ${num}</b></div>` });
    node.querySelector('.content').appendChild(c);
    c.style.width = '100%'; c.style.borderRadius = '4px';
    const tail = document.createElement('div');
    tail.style.cssText = 'margin-top:8px;font-size:15px;opacity:.8';
    tail.innerHTML = `URTICA 是拉丁文的"荨麻"，后面是一个罗马数字。<br>（${A}在剑柄旁边还刻了个小字：睡神看这里）`;
    node.querySelector('.content').appendChild(tail);
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (first) g.after(0.6, () => g.foundDigit(0, `${A}的剑上刻着"URTICA ${num}"（荨麻 ${num} 片）`));
  },

  // ---------- ⏳ 撬锁小游戏 ----------
  //   仿《天国：拯救》的撬锁：锁芯只有在开锁器拨到"那个位置"的时候才转得到底；位置不对还硬拧，开锁器会断
  //   鼠标（手指）左右移动 / ← → 拨开锁器，按住空格（W / ↑ / 「转」）转动锁芯
  lockpick(g) {
    const S = g.S, B = S.mates[1];
    const node = document.createElement('div');
    node.className = 'lockpick';
    node.innerHTML = `<h3>撬锁 · ${B}的箱子</h3>
      <div class="lp-hint">左右拨动开锁器，找到那个位置；按住 <kbd>空格</kbd>（或「转」）转动锁芯。转不动还硬拧，开锁器会断。</div>
      <canvas width="360" height="300"></canvas>
      <div class="lp-row"><span class="lp-picks"></span><div class="lp-btns"><button data-d="-1">◀</button><button data-a="turn">转</button><button data-d="1">▶</button></div></div>
      <div class="m-foot">鼠标 / 手指左右移动 · ← → 拨动 · 按住空格 / W 转动 · Esc 放弃</div>`;
    const cv = node.querySelector('canvas'), ctx = cv.getContext('2d');
    const picksEl = node.querySelector('.lp-picks'), hintEl = node.querySelector('.lp-hint');
    const st = { ang: 0, rot: 0, strain: 0, turning: false, mv: 0, auto: false, done: false, t: 0 };
    const RANGE = 1.45;
    const paintPicks = () => { picksEl.textContent = `开锁器 ×${this._picks}`; this.items.picks.name = `开锁器 ×${this._picks}`; g._invDirty = true; };
    paintPicks();
    const setAngFromX = (clientX) => { const r = cv.getBoundingClientRect(); st.ang = clamp(((clientX - r.left) / r.width - 0.5) * 2 * RANGE * 1.15, -RANGE, RANGE); };
    const onMove = (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') setAngFromX(e.clientX); };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerdown', (e) => { setAngFromX(e.clientX); });
    const keys = new Set();
    const kd = (e) => {
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space', 'KeyW', 'ArrowUp'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
    };
    const ku = (e) => keys.delete(e.code);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    let holdTurn = false, holdDir = 0;
    node.querySelectorAll('.lp-btns button').forEach((b) => {
      const on = (e) => { e.preventDefault(); if (b.dataset.a === 'turn') holdTurn = true; else holdDir = Number(b.dataset.d); };
      const off = () => { if (b.dataset.a === 'turn') holdTurn = false; else holdDir = 0; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
    let raf = 0, last = performance.now(), tickT = 0;
    const finish = (ok) => {
      if (st.done) return;
      st.done = true;
      if (ok) {
        g.audio.lockOpen();
        g.after(0.35, () => { g.ui.closeModal(); this.openChest(g); });
      } else {
        g.after(0.5, () => { g.ui.closeModal(); g.take('picks'); g.say('开锁器全断了……靴子里说不定还有备用的。', 3); });
      }
    };
    const step = (now) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      st.t += dt;
      if (st.done) { draw(); return; }
      // 拨动
      let dir = holdDir + (keys.has('ArrowLeft') || keys.has('KeyA') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0);
      let turning = holdTurn || keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp');
      if (st.auto) { const d = this._sweet - st.ang; dir = Math.abs(d) > 0.02 ? Math.sign(d) : 0; turning = Math.abs(d) < 0.05; }
      if (dir && st.rot < 0.05) st.ang = clamp(st.ang + dir * dt * 1.3, -RANGE, RANGE);
      const dist = Math.abs(st.ang - this._sweet);
      const max = dist < 0.13 ? 1 : clamp(1 - (dist - 0.13) / 0.75, 0, 0.9);
      if (turning) {
        st.rot = Math.min(max, st.rot + dt * 1.2);
        if (st.rot >= max - 0.002 && max < 1) {
          st.strain += dt * 1.25;
          tickT -= dt; if (tickT <= 0) { tickT = 0.12; g.audio.lockTick(0.5 + st.strain); }
          if (st.strain >= 1) {
            this._picks--; this._broke++;
            g.audio.pickBreak();
            st.rot = 0; st.strain = 0;
            node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake');
            paintPicks();
            hintEl.innerHTML = this._picks > 0 ? `啪——断了一根！还剩 ${this._picks} 根。${max > 0.55 ? '<b>差一点……</b>' : '位置不对。'}` : '最后一根也断了……';
            if (this._picks <= 0) finish(false);
          }
        } else if (tickT <= 0) { tickT = 0.18; g.audio.lockTick(0.2); } else tickT -= dt;
      } else {
        st.rot = Math.max(0, st.rot - dt * 2.4);
        st.strain = Math.max(0, st.strain - dt * 2);
      }
      if (st.rot >= 0.999) finish(true);
      draw();
    };
    const draw = () => {
      const W = cv.width, H = cv.height, cx = W / 2, cy = H * 0.56, R0 = 118;
      ctx.clearRect(0, 0, W, H);
      // 锁板：黄铜圆盘 + 铆钉
      const gr = ctx.createRadialGradient(cx - 30, cy - 40, 10, cx, cy, R0 + 20);
      gr.addColorStop(0, '#d8b068'); gr.addColorStop(0.6, '#8a6a30'); gr.addColorStop(1, '#3a2a14');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R0 + 14, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,8,0.8)'; ctx.lineWidth = 3; ctx.stroke();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28; ctx.fillStyle = '#4a3418'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R0 + 2), cy + Math.sin(a) * (R0 + 2), 4, 0, 6.28); ctx.fill(); }
      // 撬了三回以后：锁板边上隐约看得出一道磨亮的印子（那个位置）
      if (this._broke >= 3) { ctx.strokeStyle = 'rgba(255,230,160,0.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R0 + 8, -Math.PI / 2 + this._sweet - 0.12, -Math.PI / 2 + this._sweet + 0.12); ctx.stroke(); }
      // 锁芯：跟着转
      const rot = st.rot * Math.PI / 2 + (st.strain > 0 ? (Math.random() - 0.5) * 0.05 * st.strain : 0);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.fillStyle = '#2a2014'; ctx.beginPath(); ctx.arc(0, 0, 58, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#6a5028'; ctx.beginPath(); ctx.arc(0, 0, 52, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#0a0806'; ctx.beginPath(); ctx.arc(0, -12, 11, 0, 6.28); ctx.fill(); ctx.fillRect(-5, -12, 10, 36);
      // 扳手：从锁眼下沿伸出来
      ctx.fillStyle = '#6a6a66'; ctx.fillRect(-3, 20, 6, 70); ctx.fillRect(-3, 86, 34, 6);
      ctx.restore();
      // 开锁器：从锁眼往外伸出去，角度跟着拨
      const shake = st.strain > 0 ? (Math.random() - 0.5) * 0.06 * st.strain : 0;
      const a = st.ang + shake;
      const tipX = cx + Math.sin(a) * 6, tipY = cy - 12 - Math.cos(a) * 6;
      const endX = cx + Math.sin(a) * 175, endY = cy - 12 - Math.cos(a) * 175;
      ctx.strokeStyle = st.strain > 0.5 ? '#e0a080' : '#c8ccd0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(endX, endY); ctx.stroke();
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * 130, cy - 12 - Math.cos(a) * 130); ctx.lineTo(endX, endY); ctx.stroke();
      // 读数：绷得越紧越红
      ctx.fillStyle = `rgba(255,${200 - st.strain * 160},${120 - st.strain * 100},${0.25 + st.strain * 0.6})`;
      ctx.fillRect(cx - 60, H - 14, 120 * st.rot, 6);
    };
    node._cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); this._lp = null; };
    this._lp = { node, auto: () => { st.auto = true; } };
    raf = requestAnimationFrame(step);
    g.openModal(node, { closeKeys: ['Escape'] });
  },
  openChest(g) {
    const S = g.S, C = g.refs.castle.chest, B = S.mates[1];
    S.f.chestOpen = true;
    g.take('picks');
    if (this._broke === 0) S.ach.add('lockpick');
    g.audio.creak();
    g.tween(0.9, (k) => (C.lid.rotation.z = 1.85 * k), { ease: easeOutBack });
    g.after(0.6, () => { g.give('dice'); g.say(`咔哒——开了！箱子里是${B}的一副骰子，还有一小袋布拉格格罗申。`, 3.4); });
  },
  rollDice(g) {
    const S = g.S, D = g.refs.castle.dice, B = S.mates[1];
    if (this._rolling) return;
    if (!S.f.diceOnBoard) {
      if (!S.inv.includes('dice')) { g.say(`一块骰子盘，边上刻着分数格……可骰子在${B}的箱子里。`, 3); return; }
      g.take('dice'); S.f.diceOnBoard = true;
    }
    this._rolling = true;
    const n = this._rolls.length;
    const vals = D.map((d, i) => {
      if (i === this._loaded) return S.digits[1];
      let v, guard = 0;
      do { v = 1 + Math.floor(Math.random() * 6); } while (n >= 1 && this._rolls.every((r) => r[i] === v) && guard++ < 20);
      return v;
    });
    this._rolls.push(vals);
    g._cineTo(V(BOARD.x - 0.62, 1.3, BOARD.z + 0.02), V(BOARD.x, BOARD.y, BOARD.z), 0.7);
    g.audio.diceShake();
    const slots = [];
    D.forEach((d, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6, r = 0.05 + Math.random() * 0.08;
      slots.push(V(BOARD.x + Math.cos(a) * r, BOARD.y + 0.015, BOARD.z + Math.sin(a) * r));
    });
    g.after(0.55, () => {
      g.audio.diceClatter();
      D.forEach((d, i) => {
        const m = d.mesh;
        const from = V(BOARD.x - 0.3, BOARD.y + 0.2, BOARD.z + (i - 2.5) * 0.03), to = slots[i];
        const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
        const q1 = faceUp(vals[i], Math.random() * 6.28);
        const axis = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), spins = 2 + Math.random() * 2;
        m.visible = true;
        g.tween(1.0, (k) => {
          m.position.lerpVectors(from, to, easeOut(k));
          m.position.y += Math.abs(Math.sin(k * Math.PI * 2.6)) * 0.07 * (1 - k) * (1 - k) + (1 - k) * 0.05 * (1 - k);
          _qa.copy(q0).slerp(q1, easeOut(k));
          _qs.setFromAxisAngle(axis, (1 - k) * (1 - k) * spins * Math.PI * 2);
          m.quaternion.copy(_qs).multiply(_qa);
        }, { ease: (t) => t, delay: i * 0.05 });
      });
    });
    g.after(1.9, () => {
      const txt = D.map((d, i) => `${d.style.name} ${vals[i]}`).join(' · ');
      const L = D[this._loaded].style.name, v = S.digits[1];
      const k = this._rolls.length;
      let line;
      if (S.found[1]) line = `（${L}那颗又是 ${v}。）`;
      else if (k === 1) line = '嗯……一把烂点数。再来！';
      else if (k === 2) line = `……${L}那颗，两次都是 ${v}？`;
      else line = `${k} 次了——${L}那颗每次都是 ${v}！灌了铅的就是它。`;
      g.ui.subtitle(`${txt}　${line}`, 4.2, S.name);
      if (!S.found[1] && k >= 3) g.after(1.2, () => g.foundDigit(1, `${B}那颗灌了铅的${L}骰子，每次都停在 ${v}`));
      if (k === 2) g.clue('dice', `${B}的骰子：<b>${L}</b>那颗两次都是 ${v}……再掷一次确认。`);
    });
    g.after(2.6, () => { g._cineTo(null, null, 0.8); this._rolling = false; });
  },

  // ---------- 🔥 狗、符木 ----------
  onDog(g) {
    const S = g.S, M = g.refs.mutt, C = S.mates[2];
    if (this._dog !== 'home') return;
    if (!S.inv.includes('sausage')) {
      M.wagAmp = 1.2; g.audio.dogWhine();
      if (!S.f.petted) { S.f.petted = true; S.ach.add('mutt'); }
      g.say(S.f.fed ? '杂毛把肚皮翻过来让我挠……好狗。' : ['它抬起头闻了闻我的手——没有吃的，又把脑袋搁回爪子上。尾巴倒是摇了两下。', '毛热乎乎的，一股烟熏味。', '它哼唧了一声，眼睛一直往门边那张桌子上瞟……'][(this._petN = (this._petN || 0) + 1) % 3], 3.4);
      return;
    }
    // 喂香肠：站起来、吃掉、摇尾巴，然后一溜烟钻到{C}的床底下，叼出一根符木
    g.take('sausage'); S.f.fed = true;
    this._dog = 'eat';
    if (!S.f.petted) { S.f.petted = true; S.ach.add('mutt'); }
    M.setState('stand'); M.bark(); g.audio.dogBark();
    g.say('杂毛"腾"地站起来——香肠一口就没了。', 2.6);
    g.after(0.5, () => { M.setState('eat'); g.audio.chomp(); });
    g.after(1.9, () => {
      M.setState('stand'); M.bark(); g.audio.dogBark(1.1);
      this._dog = 'fetch';
      g.after(0.4, () => M.walk(FETCH_PATH, () => {
        M.root.rotation.y = Math.PI / 2;
        M.setState('rummage'); g.audio.dogRummage(2.2);
        g.ui.subtitle(`……它钻到${C}的床底下去了，屁股撅着，尾巴摇得跟风车一样。`, 3.2, S.name);
        for (let i = 0; i < 4; i++) g.after(i * 0.5, () => g.fx.emit('dust', V(0.95, 0.1, -2.05), { count: 5, speed: 0.4, spread: 0.8, up: 0.3, gravity: -0.5, drag: 1.2, life: 1.4, size: 0.06, colors: ['#5a4a38', '#8a7a58'], grow: 1 }));
        g.after(2.4, () => {
          const T = g.refs.castle.tally.mesh;
          T.visible = true; M.hold(T);
          M.setState('stand');
          M.walk([...FETCH_PATH.slice(0, 3).reverse(), DROP_AT], () => {
            // 放下：符木落在地上
            g.refs.root.attach(T);
            T.position.set(DROP_AT.x + 0.18, 0.013, DROP_AT.z + 0.05); T.rotation.set(0, 0.6, 0);
            M.hold(null); M.bark(); g.audio.dogBark(1.2); g.audio.tink();
            S.f.tallyDropped = true;
            g.say('它叼回来一根木棍，"啪"地放在地上，冲我直摇尾巴。', 3);
            g.after(1.2, () => M.walk([DOG_HOME.clone().add(V(0.05, 0, -0.2)), DOG_HOME], () => { M.root.rotation.y = 0; M.setState('lie'); this._dog = 'home'; }, 0.6));
          }, 1.1);
        });
      }, 1.2));
    });
  },
  readTally(g) {
    const S = g.S, C = S.mates[2], T = g.refs.castle.tally;
    g.audio.paper();
    const c = TX.makeCanvas(800, 110);
    TC.drawTally(c, S.digits[2]);
    const node = g.ui.doc({ variant: 'parchment', title: `${C}的符木`, html: '<div style="margin-bottom:8px">一根木棍，上面刻着一道道刻痕——这年头的人用它记数。一头刻着个"✠"，是' + C + '的记号。</div>' });
    node.querySelector('.content').appendChild(c);
    c.style.width = '100%'; c.style.borderRadius = '4px';
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    T.mesh.visible = false;
    if (!S.found[2]) g.after(0.6, () => g.foundDigit(2, `${C}的符木上的刻痕`));
  },

  // ---------- 窗 ----------
  onWindow(g) {
    const S = g.S, Sh = g.refs.castle.shutters;
    if (this._look) return;
    if (!S.f.shutters) {
      S.f.shutters = true;
      g.audio.creak();
      g.tween(0.4, (k) => { Sh.bar.position.y = 1.55 + k * 0.25; Sh.bar.rotation.z = k * 0.6; }, { done: () => { Sh.bar.visible = false; } });
      Sh.list.forEach(({ hinge, s }) => g.tween(1.1, (k) => (hinge.rotation.y = s * 1.95 * k), { ease: easeOutBack, delay: 0.35 }));
      g.after(0.6, () => { g.audio.gust(0.5); });
      g.after(0.9, () => this.lookOut(g, true));
      return;
    }
    this.lookOut(g, false);
  },
  lookOut(g, first) {
    const S = g.S, [A] = S.mates;
    if (this._look) return;
    this._look = true;
    g._cineTo(V(0.04, 1.74, -3.05), V(0.5, -1.4, -16), 1.3);
    if (first) {
      g.after(1.0, () => g.ui.subtitle('……月光下的一整条河谷。山脚下是拉泰城，教堂的尖塔……', 3.4, S.name));
      g.after(4.6, () => { g._cineTo(V(0.1, 1.74, -3.05), V(-3, 0.2, -16), 1.6); g.ui.subtitle('远处的山上，一堆一堆全是营火——是库曼人。西北边的天都烧红了……那是斯卡利茨。', 4, S.name); });
      g.after(9.0, () => { g._cineTo(V(-0.12, 1.72, -3.05), V(4, -1.2, -13), 1.4); g.ui.subtitle(`右边城墙上几个人举着火把走来走去……是${A}他们！`, 3.2, S.name); });
      g.clue('window', '窗外：库曼人的营火铺满了远山，天一亮就要攻城。城墙上举着火把巡逻的，是室友们。');
    } else g.after(0.8, () => g.ui.subtitle(S.f.taskDone ? '天边泛白了。城墙上的火把一支支熄了。' : '营火还在烧……城墙上的火把来回走着。', 3, S.name));
    g.after(first ? 12.8 : 4.2, () => { g._cineTo(null, null, 1.1); this._look = false; });
  },

  // ---------- 炼金台：熬救世主酒 ----------
  brewUI(g) {
    const S = g.S;
    const known = S.digits.map((d, i) => (S.found[i] ? d : '?')).join(' ');
    const box = g.ui.lock({
      n: 3, title: '炼金台 · 救世主酒', variant: 'alchemy', labels: ['🌿', '⏳', '🔥'], button: '熬 制',
      hint: `🌿 荨麻捣几片 · ⏳ 沙漏翻几次 · 🔥 风箱拉几下${S.found.some(Boolean) ? `<br>已知：<b>${known}</b>` : ''}`,
      onTick: () => g.audio.tick(),
      onSubmit: (code) => { g.ui.closeModal(); this.brew(g, code); return true; },
    });
    g.openModal(box);
  },
  brew(g, code) {
    const S = g.S, B = g.refs.castle.bench;
    if (this._brewing) return;
    this._brewing = true;
    const [a, b, c] = [...code].map(Number);
    const ok = code === S.digits.join('');
    // 太长的时候整体快一点
    const sp = 1 / clamp((a * 0.32 + b * 0.62 + c * 0.42) / 7, 1, 1.6);
    g._cineTo(V(0.72, 1.36, 0.2), V(1.48, 0.84, 0.22), 1.0);
    let t = 0.9;
    const at = (d, fn) => { g.after(t, fn); t += d; };
    // 一、倒酒、点火
    at(1.0, () => { g.audio.pour(); B.brewM.color.set('#5a1018'); B.brewM.emissive.set('#000000'); this._flare = 1; g.ui.subtitle('倒一瓶葡萄酒……点火。', 2, S.name); });
    // 二、捣荨麻：一片一片放进研钵，捣几下
    at(0.2, () => g.ui.subtitle(`研钵里放 ${a} 片荨麻……捣！`, 2.4, S.name));
    for (let i = 0; i < a; i++) {
      at(0.32 * sp, () => {
        if (B.leaves[i]) B.leaves[i].visible = true;
        g.tween(0.16 * sp, (k) => { B.pestle.position.y = 0.035 + (1 - Math.sin(k * Math.PI)) * 0.0 + Math.sin(k * Math.PI) * 0.03; B.pestle.rotation.x = 0.35 - Math.sin(k * Math.PI) * 0.2; });
        g.audio.pestle();
      });
    }
    at(0.5, () => { B.leaves.forEach((l) => (l.visible = false)); B.paste.visible = true; });
    at(0.6, () => { B.paste.visible = false; g.audio.splash(0.4); B.brewM.color.set('#3a3a14'); g.fx.emit('steam', B.cauldron.getWorldPosition(_p).add(V(0, 0.1, 0)), { count: 4, speed: 0.2, spread: 0.3, up: 0.6, gravity: 0.2, drag: 1, life: 1.8, size: 0.08, colors: ['#e8e4d8'], grow: 2 }); });
    // 三、翻沙漏
    at(0.2, () => g.ui.subtitle(`煮……沙漏翻 ${b} 次。`, 2.4, S.name));
    for (let i = 0; i < b; i++) {
      at(0.62 * sp, () => {
        const r0 = B.hgInner.rotation.z;
        g.tween(0.3 * sp, (k) => (B.hgInner.rotation.z = r0 + Math.PI * k), { ease: easeInOut });
        g.audio.hourglass();
        g.ui.subtitle(`沙漏翻了 ${i + 1} 次……`, 0.9, S.name);
        g.fx.emit('steam', B.cauldron.getWorldPosition(_p).add(V(0, 0.1, 0)), { count: 2, speed: 0.15, spread: 0.3, up: 0.6, gravity: 0.2, drag: 1, life: 1.6, size: 0.07, colors: ['#e8e4d8'], grow: 2 });
      });
    }
    // 四、拉风箱
    at(0.3, () => g.ui.subtitle(`加一株颠茄……风箱拉 ${c} 下！`, 2.4, S.name));
    for (let i = 0; i < c; i++) {
      at(0.42 * sp, () => {
        g.tween(0.36 * sp, (k) => { const q = Math.sin(k * Math.PI); B.bTop.position.y = -0.03 * q; B.bag.scale.y = 1 - q * 0.6; });
        g.audio.bellows();
        this._flare = 1.6;
        g.fx.emit('spark', B.brazier.getWorldPosition(_p).add(V(0, 0.14, 0)), { count: 6, speed: 0.6, spread: 0.6, up: 1, gravity: -0.6, drag: 1.2, life: 0.8, size: 0.018, colors: ['#ffd080', '#ff8a30'] });
      });
    }
    // 五、成了 / 糊了
    if (ok) {
      at(1.2, () => {
        g.audio.bubble(3);
        g.tween(1.2, (k) => { B.brewM.color.lerpColors(new THREE.Color('#3a3a14'), new THREE.Color('#8a6a14'), k); B.brewM.emissive.setRGB(0.5 * k, 0.32 * k, 0.05 * k); B.retortLiquid.material.color.lerpColors(new THREE.Color('#5a1a14'), new THREE.Color('#c89a28'), k); });
        g.ui.subtitle('锅里的酒变成了金黄色……蒸馏！', 2.4, S.name);
        g._cineTo(V(0.95, 1.2, 0.72), V(1.5, 0.83, 0.55), 1.2);
      });
      at(2.8, () => {
        B.drip.visible = true;
        g.tween(2.6, (k) => { B.schnapps.scale.y = Math.max(0.001, k); B.schnappsM.emissiveIntensity = 0.6 * k; B.flaskGlow.material.opacity = 0.6 * k; B.drip.position.y = 0.14 - ((g.time * 3) % 1) * 0.08; }, { ease: (x) => x, done: () => { B.drip.visible = false; } });
        g.audio.drips(2.6);
      });
      at(1.2, () => { g.audio.chime(); g.ch.setExpression('grin', 2.5); g.ui.subtitle('成了——救世主酒！', 2.4, S.name); });
      at(1.8, () => { g.audio.gulp(); g.ui.subtitle('……咕咚。辣！从嗓子一路烧到肚子里。', 2.6, S.name); this._drunk = Math.max(this._drunk, 0.5); });
      at(0.6, () => { this.saved(g); });
      at(2.2, () => { g._cineTo(null, null, 1.1); });
      at(0.4, () => { this._brewing = false; });
    } else {
      at(1.0, () => {
        g.audio.fizzle();
        B.brewM.color.set('#0e0c08');
        for (let i = 0; i < 6; i++) g.after(i * 0.25, () => g.fx.emit('steam', B.cauldron.getWorldPosition(_p).add(V(0, 0.1, 0)), { count: 4, speed: 0.3, spread: 0.4, up: 0.9, gravity: 0.3, drag: 1, life: 2.2, size: 0.14, colors: ['#2a2622', '#3a3430'], grow: 2.5 }));
        g.ch.setExpression('shock', 2);
        g.ui.subtitle('……糊了。一股烧焦的荨麻味。配方哪里不对——再核对一下那三个数。', 3.6, S.name);
      });
      at(2.8, () => g.audio.cough());
      at(1.0, () => { B.brewM.color.set('#4a0e14'); B.brewM.emissive.set('#000000'); g._cineTo(null, null, 1.0); this._brewing = false; });
    }
  },
  // 存档：屏幕右下角一行"已存档"（《天国：拯救》喝救世主酒存档的那一下）
  saved(g) {
    const S = g.S;
    S.ach.add('saviour');
    let el = document.getElementById('kcdsave');
    if (!el) { el = document.createElement('div'); el.id = 'kcdsave'; document.body.appendChild(el); }
    el.innerHTML = '<div class="ks-ic">✠</div><div><b>已存档</b><small>救世主酒 · 1403 年 · 地堡 211</small></div>';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    g.audio.saveChime();
    setTimeout(() => { if (el) el.classList.remove('on'); }, 4200);
    this._dawnT = Math.max(this._dawnT, 0.42);
    this._fireT = 0.5;
    g.completeTask('存好档了。这一回，推开门就不会再读档了。', 1.2);
    g.after(4.5, () => g.audio.churchBell(3));
  },

  // ---------- 每帧 ----------
  update(g, dt) {
    if (this._drunk > 0) this._drunk = Math.max(0, this._drunk - dt / 9);
  },
  // 喝多了：镜头歪来歪去（每帧在控制器算好镜头之后、渲染之前歪一下；暂停时不会越歪越多）
  preRender(g) {
    const cam = g.camera;
    if (this._rolledQ && cam.quaternion.equals(this._rolledQ)) cam.quaternion.copy(this._baseQ);
    if (this._drunk <= 0.001 || g.state !== 'play') { this._rolledQ = null; return; }
    this._baseQ.copy(cam.quaternion);
    const k = this._drunk, t = g.time;
    cam.rotateZ(Math.sin(t * 1.3) * 0.07 * k);
    cam.rotateX(Math.sin(t * 0.9 + 1) * 0.02 * k);
    this._rolledQ = (this._rolledQ || new THREE.Quaternion()).copy(cam.quaternion);
  },
  world(g, dt, t) {
    const S = g.S, R = g.refs, L = R.lights, CL = R.castleLights, C = R.castle;
    const kk = 1 - Math.exp(-dt * 3);
    // 天色：天快亮（剧情 / 存档以后）
    this._dawn = lerp(this._dawn, this._dawnT, 1 - Math.exp(-dt * 0.4));
    this._fire = lerp(this._fire, this._fireT ?? 1, 1 - Math.exp(-dt * 0.3));
    C.sky.dawn = this._dawn; C.sky.fire = this._fire;
    // 窗板开了：月光照进来
    this._shut = lerp(this._shut, S && S.f.shutters ? 1 : 0, 1 - Math.exp(-dt * 2));
    const sh = this._shut;
    C.shutters.leak.material.opacity = 0.22 * (1 - sh);
    // 炉火 / 火把 / 蜡烛：一跳一跳
    this._flare = Math.max(0, (this._flare || 0) - dt * 1.2);
    const fl = 0.85 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23 + 1) * 0.05 + (Math.random() - 0.5) * 0.06;
    CL.hearthSpot.intensity = 4.4 * fl * (1 + (this._flare || 0) * 0.3);
    CL.fireGlow.material.opacity = 0.28 * fl;
    CL.emberM.emissiveIntensity = 2 + Math.sin(t * 3) * 0.4;
    for (const f of CL.fireF) f.update(dt, t, 1 + Math.sin(t * 5) * 0.05);
    const tf = 0.85 + Math.sin(t * 13 + 2) * 0.07 + Math.sin(t * 29) * 0.04 + (Math.random() - 0.5) * 0.05;
    CL.torchLight.intensity = 2.3 * tf * (1 + (this._flare || 0) * 0.5);
    const cf = 0.94 + Math.sin(t * 7) * 0.03 + Math.sin(t * 17 + 1) * 0.02;
    L.ceilSpots.forEach((s, i) => (s.intensity = (i ? 2.4 : 2.6) * cf));
    L.hemi.intensity = lerp(L.hemi.intensity, 0.2 + sh * 0.05 + this._dawn * 0.12, kk);
    L.sun.intensity = sh * (0.95 + this._dawn * 0.6);
    L.sun.color.setRGB(lerp(0.6, 1.0, this._dawn), lerp(0.69, 0.78, this._dawn), lerp(0.85, 0.62, this._dawn));
    L.winLight.intensity = 0.05 + sh * (0.7 + this._dawn * 0.8);
    g.scene.environmentIntensity = 0.05 + sh * 0.02;
    // 炼金台：炭炉的火（熬的时候拉风箱，火一下子旺起来）
    const B = C.bench, flare = this._brewing ? 0.6 + (this._flare || 0) * 0.5 : 0;
    B.coalM.emissiveIntensity = 0.35 + flare * 2.2 + Math.sin(t * 4) * 0.05;
    B.bFlame.update(dt, t, flare > 0.05 ? 0.6 + flare * 0.5 : 0.001);
    L.monLight.intensity = (0.7 + flare * 1.6) * cf;
    // 狗
    const M = R.mutt;
    g.ch.J.head.getWorldPosition(_p);
    M.update(dt, t, { look: this._dog === 'home' || this._dog === 'eat' ? _p : null });
    const active = g.state === 'play' || g.state === 'cut' || g.state === 'intro';
    if (!active) return;
    // 炉火噼啪、澡堂冒热气、狗偶尔哼唧
    this._crackT -= dt;
    if (this._crackT <= 0) { this._crackT = 0.3 + Math.random() * 1.1; if (g.camera.position.distanceTo(_q.set(HEARTH.x, 0.5, HEARTH.z)) < 5) g.audio.crackle(0.9); }
    if (g.camera.position.z > 4.4) {
      this._steamT -= dt;
      if (this._steamT <= 0) { this._steamT = 0.35; g.fx.emit('steam', C.tub.at.clone().add(V((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.4)), { count: 1, speed: 0.08, spread: 0.3, up: 0.5, gravity: 0.12, drag: 1, life: 2.6, size: 0.22, colors: ['#e8e4dc'], grow: 2.6 }); }
    }
    this._barkT -= dt;
    if (this._barkT <= 0) { this._barkT = 14 + Math.random() * 14; if (this._dog === 'home' && Math.random() < 0.5) g.audio.dogWhine(0.5); }
    // 拱顶上时不时掉一点灰
    this._dropT -= dt;
    if (this._dropT <= 0) { this._dropT = 6 + Math.random() * 9; g.fx.emit('dust', V((Math.random() - 0.5) * 2.4, 2.9, -3 + Math.random() * 7), { count: 4, speed: 0.1, spread: 0.3, up: 0, gravity: -0.7, drag: 1.2, life: 2.6, size: 0.06, colors: ['#5a5046'], grow: 1 }); }
    g._updateDust(dt, 0.4);
  },
};
