// 动画教程：主角自己把每一关的通关步骤走一遍——走到哪、对着什么按 E、密码怎么来、在密码盘上拨几
//   用的是真的游戏：真的走路（碰撞、镜头都照常）、真的触发每个物件的交互、真的弹出纸条和密码盘，
//   只是手柄交给了程序：控制器的 bot 速度代替 WASD，镜头自己转过去对准物件，"按 E"直接调互动。
//   左上角是这一章的步骤清单，右下角是暂停 / 倍速 / 下一章 / 退出；
//   要等的地方（冰柱化、电报还没来……）自动快进。演示不存档、不解锁章节，退出就是刷新回标题。
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/util.js';
import { MORSE } from '../core/tex_ship.js';
import { LAST_CHAPTER } from './chapters.js';
import { chapterLabel, chapterNum } from './chapternames.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _b = new THREE.Box3(), _mb = new THREE.Box3(), _p = V();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOORS = ['wcDoor', 'cubDoor']; // 路被门挡住的时候先去开的门（洗手间 → 隔间）

// ---------------- 寻路：俯视网格 + Dijkstra ----------------
// 碰撞盒是轴对齐矩形，人是半径 0.22 的圆：网格格子中心离所有开着的碰撞盒都超过 r 才算能走
class NavGrid {
  constructor(collision, bounds, r = 0.24, cell = 0.05) {
    this.cell = cell; this.x0 = bounds.minX; this.z0 = bounds.minZ;
    const nx = (this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell));
    const nz = (this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    const free = (this.free = new Uint8Array(nx * nz));
    const boxes = collision.boxes.filter((b) => b.enabled);
    const r2 = r * r;
    for (let iz = 0; iz < nz; iz++) {
      const z = this.z0 + (iz + 0.5) * cell;
      if (z < bounds.minZ + r || z > bounds.maxZ - r) continue;
      for (let ix = 0; ix < nx; ix++) {
        const x = this.x0 + (ix + 0.5) * cell;
        if (x < bounds.minX + r || x > bounds.maxX - r) continue;
        let ok = 1;
        for (const b of boxes) {
          const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
          if (dx * dx + dz * dz < r2) { ok = 0; break; }
        }
        free[iz * nx + ix] = ok;
      }
    }
  }
  x(i) { return this.x0 + ((i % this.nx) + 0.5) * this.cell; }
  z(i) { return this.z0 + (Math.floor(i / this.nx) + 0.5) * this.cell; }
  at(x, z) {
    const ix = clamp(Math.floor((x - this.x0) / this.cell), 0, this.nx - 1), iz = clamp(Math.floor((z - this.z0) / this.cell), 0, this.nz - 1);
    return iz * this.nx + ix;
  }
  // 离 (x, z) 最近的能站的格子（人被推到家具边上时，脚下那一格可能算"不能走"）
  nearest(x, z, maxR = 14) {
    const c = this.at(x, z);
    if (this.free[c]) return c;
    const cx = c % this.nx, cz = Math.floor(c / this.nx);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= maxR && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = cx + dx, iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const i = iz * this.nx + ix;
        if (this.free[i] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = i; }
      }
    }
    return best;
  }
  // 从 start 出发，第一个满足 goal(x, z) 的格子就是终点（离得最近的站位）；走不到返回 null
  search(sx, sz, goal) {
    const s = this.nearest(sx, sz);
    if (s < 0) return null;
    const N = this.nx * this.nz, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = [];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    dist[s] = 0; push(0, s);
    const nx = this.nx, D = Math.SQRT2;
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, D], [1, -1, D], [-1, 1, D], [-1, -1, D]];
    let end = -1;
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      if (goal(this.x(i), this.z(i))) { end = i; break; }
      const ix = i % nx, iz = Math.floor(i / nx);
      for (const [ax, az, w] of nb) {
        const jx = ix + ax, jz = iz + az;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= this.nz) continue;
        const j = jz * nx + jx;
        if (!this.free[j]) continue;
        if (ax && az && (!this.free[iz * nx + jx] || !this.free[jz * nx + ix])) continue; // 不斜着切墙角
        const nd = d + w;
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); }
      }
    }
    if (end < 0) return null;
    const cells = [];
    for (let i = end; i >= 0; i = prev[i]) cells.push(i);
    cells.reverse();
    return this.smooth(cells.map((i) => V(this.x(i), 0, this.z(i))));
  }
  los(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(L / (this.cell * 0.5));
    for (let k = 1; k < n; k++) { const t = k / n; if (!this.free[this.at(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)]) return false; }
    return true;
  }
  // 拉直：能直接看见的拐点都跳过去
  smooth(pts) {
    if (pts.length <= 2) return pts.slice(1);
    const out = [];
    let a = pts[0], k = 1;
    while (k < pts.length) {
      let j = k;
      while (j + 1 < pts.length && this.los(a, pts[j + 1])) j++;
      out.push(pts[j]); a = pts[j]; k = j + 1;
    }
    return out;
  }
}
const rectDist = (x, z, r) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

// ---------------- 每一章的步骤 ----------------
// t：这一步做什么（左上角的清单）；d：补一句为什么 / 密码是怎么来的；run：真的去做
const SCRIPTS = {
  1: (g) => {
    const S = g.S, [, B] = S.mates;
    return [
      { t: '看显示器上的便利贴', d: '准考证、学生证、文具袋被室友一人藏了一样，三样都带上才出得了门', run: async (T) => { await T.press('sticky'); await T.read(4); } },
      { t: '看桌上的台历', d: `红笔圈出的 ${S.month} 月 ${S.day} 日，就是"你最怕的那一天"`, run: async (T) => { await T.press('calendar'); await T.read(3); } },
      { t: '打开床边的行李箱', d: `三位密码：台历上的日期 → ${S.suitCode}`, run: async (T) => { await T.press('suitcase'); await T.code(S.suitCode); await T.wait(1.8); } },
      { t: '拿上准考证', run: async (T) => { await T.press('ticket', { go: false }); await T.read(2.6); } },
      { t: '拿上紫光手电', d: '准考证旁边就是', run: async (T) => { await T.press('uvLight', { go: false }); await T.wait(1.2); } },
      { t: '打开手电，照一照键盘', d: `${g.input.isTouch ? '点「手电」' : '按 F '}开手电——紫光下，四个键帽上的荧光标记就是开机密码 ${S.pcPass}`, run: async (T) => { await T.go('keyboard'); await T.torch(); await T.press('keyboard', { go: false }); await T.read(3.4); await T.torch(); } },
      { t: '用密码登录电脑', d: `输入 ${S.pcPass}，桌面上${B}的 txt 说抽屉钥匙在他的袜子里`, run: async (T) => { await T.press('monitor', { go: false }); await T.type(S.pcPass); await T.wait(1.4); await T.read(3.4); } },
      { t: '翻窗边的脏衣篓', d: `${B}的袜子里掉出一把小钥匙`, run: async (T) => { await T.press('basket'); await T.until(() => S.inv.includes('key'), 5); await T.wait(1.6); } },
      { t: '用小钥匙打开书桌抽屉', run: async (T) => { await T.press('drawer'); await T.wait(1.6); } },
      { t: '拿走文具袋', run: async (T) => { await T.press('pencilCase', { go: false }); await T.wait(1.4); } },
      { t: '拿杂物桌上的空调遥控器', d: '遥控器的电池被抠走了', run: async (T) => { await T.press('remote'); await T.wait(1.4); } },
      { t: '翻一翻门边凳子上的红白头盔', d: '头盔里塞着两节 5 号电池，直接装进遥控器', run: async (T) => { await T.press('helmet'); await T.wait(2); } },
      { t: '用遥控器打开空调', d: '冷风一吹，学生证从出风口飘了下来', run: async (T) => { await T.press('ac', { at: [-0.75, 3.55] }); await T.wait(4.2); } },
      { t: '捡起地上的学生证', d: '三样都齐了：任务完成', run: async (T) => { await T.press('studentId'); await T.until(() => S.f.taskDone, 3); await T.wait(4.4); } },
      { t: '出门', d: '任务完成了，门外那片光才会把你送去下一间 211', run: (T) => T.exit() },
    ];
  },
  2: (g) => {
    const S = g.S, CH = g.CH, [a, b, c] = S.digits;
    return [
      { t: '读书桌上那本发黄的日记', d: '三十年后的自己：让停在 7:59 的钟走起来——用旧收音机收听整点报时', run: async (T) => { await T.press('diary'); await T.read(5.5); } },
      { t: '拉下门边墙上的电闸', d: '通电以后灯泡、老显示器、收音机都有电了', run: async (T) => { await T.press('fuse'); await T.wait(3); } },
      { t: '凑近看老显示器的雪花屏', d: `雪花里闪出频率的第 ① 位：${a}`, run: async (T) => { await T.press('crt'); await T.read(3); } },
      { t: '去洗手间拿一条旧毛巾', run: async (T) => { await T.press('towels'); await T.wait(1.4); } },
      { t: '用毛巾擦干净穿衣镜', d: `镜子上用口红写着第 ② 位：${b}`, run: async (T) => { await T.press('mirror'); await T.until(() => S.f.wiped, 4); await T.wait(2.6); } },
      { t: '看洗手间窗外，数枯树上的乌鸦', d: `一共 ${c} 只，就是小数点后面那一位 ③`, run: async (T) => { await T.press('wcWindow'); await T.until(() => S.found[2] && !CH._counting && !g.cine, 20); } },
      { t: `把旧收音机调到 ${a}${b}.${c} MHz`, d: '嘀、嘀、嘀——嗒：北京时间八点整，挂钟走起来了', run: async (T) => { await T.press('radio'); await T.code(`${a}${b}${c}`); await T.until(() => !CH._tuning && !g.cine, 16); await T.wait(2.2); } },
      { t: '出门', run: (T) => T.exit() },
    ];
  },
  3: (g) => {
    const S = g.S, CH = g.CH, [a, b, c] = S.digits;
    const morse = (MORSE[c] || '').replace(/\./g, '·').replace(/-/g, '—');
    return [
      { t: '读电报台边上的航海日志', d: '船在原地打转：凑齐新航向（⚓🗼📻 三位），对着传声筒报给驾驶台', run: async (T) => { await T.press('logbook'); await T.read(5.5); } },
      { t: '去洗手间拿钩篙', d: '靠在淋浴的角落里', run: async (T) => { await T.press('boatHook'); await T.wait(1.2); } },
      { t: '用钩篙勾下货网里的泵摇把', d: '摇把卡在天花板的货网里', run: async (T) => { await T.press('cargoNet', { reach: 0.2 }); await T.until(() => S.inv.includes('lever') && !g.cine, 6); } },
      { t: '把摇把装到南墙的舱底泵上', run: async (T) => { await T.press('pump'); await T.wait(1); } },
      { t: '压六下舱底泵，把积水抽干', d: `水底下的甲板上刷着 ⚓ ${a}`, run: async (T) => {
        for (let i = 0; i < 6 && !S.f.drained; i++) { await T.press('pump', { go: false, hold: 0.15, after: 0.1 }); await T.until(() => !CH._pumpBusy, 2); }
        await T.until(() => S.found[0] && !g.cine, 9);
      } },
      { t: '逮住海图桌上滑来滑去的扳手', run: async (T) => { await T.press('wrench', { hold: 0.2 }); await T.wait(1); } },
      { t: '用扳手拧开舷窗的铁盖，数灯塔的闪光', d: `北边的灯塔每 12 秒闪一组：一组 ${b} 下 → 🗼 ${b}`, run: async (T) => {
        await T.press('porthole', { pick: (ms) => ms.filter((m) => g._rootOf(m).userData.idx === 1) });
        await T.until(() => S.found[1] && !CH._look, 26);
      } },
      { t: '打开电报台的电子管收音机', run: async (T) => { await T.press('radio'); await T.wait(1.2); } },
      { t: '把垂下来的天线接到收音机上', run: async (T) => { await T.press('antenna'); await T.wait(1.2); } },
      { t: '等室友发来电报', d: '收报机会把摩尔斯电码一格一格打在纸带上', run: async (T) => { await T.until(() => CH._tape.length && !CH._radioBusy, 40, { ff: true }); } },
      { t: '读纸带，对照墙上的摩尔斯电码表', d: `${morse} → 📻 ${c}`, run: async (T) => { await T.press('tape', { go: false }); await T.read(3.4); await T.until(() => S.found[2], 3); await T.wait(1.4); } },
      { t: `对着门边的传声筒报新航向 ${a}${b}${c}°`, d: '右满舵——灯塔转到了船头正前方，船不再打转', run: async (T) => { await T.press('voicePipe'); await T.code(`${a}${b}${c}`); await T.wait(11, { ff: 2 }); } },
      { t: '推开水密门出去', run: (T) => T.exit() },
    ];
  },
  4: (g) => {
    const S = g.S, CH = g.CH, R = g.refs, [a, b, c] = S.digits;
    const hot = R.crates.indexOf(CH._hot), filter = R.crates.findIndex((x) => x.kind === 'filter');
    // 拿着计数器先路过一只"冷"的箱子（离热箱子最远的那只），再走到热的那只跟前
    const far = R.crates.map((x, i) => [i, x.group.position.distanceTo(CH._hot.group.position)]).filter(([i]) => i !== hot).sort((p, q) => q[1] - p[1])[0][0];
    return [
      { t: '接书桌上响个不停的野战电话', d: '211 站在环线上：拨调度分机（☢️🚂👻 三位），让幽灵列车停一下', run: async (T) => { await T.press('phone211'); await T.read(7); } },
      { t: '拿起桌上的盖革计数器', d: '拿起来就开着，右边是读数', run: async (T) => { await T.press('geiger', { go: false }); await T.wait(1.4); } },
      { t: '拿着计数器找"热"的那只弹药箱', d: `咔哒声越密离得越近——最"热"的那只刷着 ☢️ ${a}`, run: async (T) => {
        await T.go(`crate${far}`); await T.wait(1.4);
        await T.press(`crate${hot}`); await T.until(() => S.found[0], 4); await T.wait(1.8);
      } },
      { t: '打开装着新滤毒罐的弹药箱', d: `弹药箱 ${R.crates[filter].num}`, run: async (T) => { await T.press(`crate${filter}`); await T.wait(1.6); } },
      { t: '取下门边墙上的防毒面具', d: '新滤罐会自己拧到面具上', run: async (T) => { await T.press('gasmask'); await T.until(() => S.f.maskReady, 4); await T.wait(1.4); } },
      { t: '一直摇窗边的手摇发电机', d: `站台的灯亮了：老车厢上的粉笔"正"字一共 ${b} 笔 → 🚂 ${b}`, run: async (T) => {
        for (let i = 0; i < 8 && !CH._lit; i++) { await T.press('dynamo', { go: i === 0, hold: i ? 0.05 : 0.4, after: 0.05, quiet: i > 0 }); await T.until(() => !CH._cranking, 2); }
        await T.until(() => S.found[1] && !CH._look, 16);
      } },
      { t: '戴上防毒面具', d: g.input.isTouch ? '点一下物品栏里的面具' : '点物品栏里的面具（或按它的数字键）', run: async (T) => { await T.item('mask'); await T.wait(1.6); } },
      { t: '推开毒气间的门，靠近那团光', d: `灯全灭了，墙上走过去 ${c} 个影子 → 👻 ${c}`, run: async (T) => { await T.press('anomaly', { reach: 0.6 }); await T.until(() => S.found[2] && !CH._vision, 22); await T.until(() => !g.cine, 5); } },
      { t: `拿起野战电话，拨调度分机 ${a}${b}${c}`, d: '那趟从来不停站的车，这一次停在了 211 的窗外', run: async (T) => {
        if (CH._ring) { await T.press('phone211'); await T.read(3); }
        await T.press('phone211'); await T.code(`${a}${b}${c}`); await T.until(() => !CH._calling, 40, { ff: 2 }); await T.wait(1);
      } },
      { t: '推开气密门，上车', run: (T) => T.exit() },
    ];
  },
  5: (g) => {
    const S = g.S;
    return [
      { t: '跟书桌前打游戏的两只鸡聊聊', d: '宿管阿姨说了：有人没睡，谁也别想出门——鸡、马、猴都得睡着', run: async (T) => { await T.press('chickA'); await T.wait(2.8); } },
      { t: '关掉书桌底下的插线板', d: '两台电脑一黑，两只鸡骂够了，趴在键盘上睡着了（🐔）', run: async (T) => { await T.press('strip'); await T.until(() => S.found[0], 9); await T.wait(1.6); } },
      { t: '跟床上刷手机的马聊聊', d: '屋里黑黢黢的，它们最怕突然开灯', run: async (T) => { await T.press('horseA'); await T.wait(2.8); } },
      { t: '打开门边的大灯，晃它们一下', d: '"啊我的眼睛！"——手机放下了', run: async (T) => { await T.press('switch'); await T.until(() => S.f.horsesDown, 5); await T.wait(1.8); } },
      { t: '再把灯关掉', d: '三匹马翻个身就打起了呼噜（🐴）', run: async (T) => { await T.press('switch', { go: false }); await T.until(() => S.found[1], 4); await T.wait(1.6); } },
      { t: '拿上门边凳子上的红白头盔', run: async (T) => { await T.press('helmet'); await T.wait(1.2); } },
      { t: '把头盔送给照镜子的猴赛雷', d: '造型满分，站着就睡着了（🐵）——全宿舍都睡了', run: async (T) => { await T.press('monkeyA'); await T.until(() => S.found[2], 10); await T.wait(7, { ff: 2 }); } },
      { t: '轻手轻脚地出门', run: (T) => T.exit() },
    ];
  },
  6: (g) => {
    const S = g.S, CH = g.CH, [a, b, c] = S.digits;
    return [
      { t: '取出气动传送管里的铜胶囊', d: '室友的信：往传送管里寄领路申请（🏭🔥⚙️ 三位口令），熔炉会给你亮一条路', run: async (T) => { await T.press('tube'); await T.read(5.5); } },
      { t: '拔出门口雪堆里的冰镐', run: async (T) => { await T.press('icePick'); await T.wait(1.2); } },
      { t: '用冰镐撬开冻住的煤箱', run: async (T) => { await T.press('coalCrate'); await T.wait(1.4); } },
      { t: '抓一把煤', run: async (T) => { await T.press('coalCrate', { go: false }); await T.wait(1.2); } },
      { t: '把煤添进暖炉，点火', d: `蒸汽管"当当"地响，压力表的指针停在 🔥 ${b}`, run: async (T) => { await T.press('stove'); await T.until(() => S.found[1] && !g.cine, 10); } },
      { t: '擦掉窗户上的冰花', d: '多擦几下，窗外是一座熔炉城', run: async (T) => {
        for (let i = 0; i < 3 && !S.f.wiped; i++) { await T.press('window', { go: i === 0, hold: i ? 0.2 : 0.45 }); await T.wait(0.8); }
        await T.until(() => !CH._scope && !g.cine, 14);
      } },
      { t: '用窗边的黄铜望远镜看熔炉', d: `塔身上的信号灯柱亮着 ${a} 盏红灯 → 🏭 ${a}`, run: async (T) => { await T.press('spyglass'); await T.until(() => S.found[0] && !CH._scope && !g.cine, 9); } },
      { t: '等屋里暖和起来，冰柱化掉', d: '冰柱里冻着的发条钥匙会掉在地上', run: async (T) => { await T.until(() => S.f.keyFell, 70, { ff: true }); await T.wait(1); } },
      { t: '捡起发条钥匙', run: async (T) => { await T.press('windKey'); await T.wait(1.2); } },
      { t: '等老铁身上的冰化开', run: async (T) => { await T.until(() => CH._botThawed(g), 70, { ff: true }); } },
      { t: '给自动机「老铁」上发条', d: `它醒过来，在打字机上敲出 ⚙️ ${c}`, run: async (T) => { await T.press('automaton'); await T.until(() => S.found[2] && !CH._botBusy && !g.cine, 14); } },
      { t: `往传送管里寄领路申请：${a}${b}${c}`, d: '探照灯转过来，一对一对的路灯一直亮到楼下', run: async (T) => {
        if (CH._tubeUnread) { await T.press('tube'); await T.read(3); }
        await T.press('tube'); await T.code(`${a}${b}${c}`); await T.until(() => !CH._sending && !g.cine, 12); await T.wait(1.6);
      } },
      { t: '推开防寒铁门', run: (T) => T.exit() },
    ];
  },
  7: (g) => {
    const S = g.S, CH = g.CH, R = g.refs, [a, b, c] = S.digits;
    return [
      { t: '看看我的休眠舱里贴的纸条', d: '驾驶舱给主引擎点一次火（授权码 🤖💧🌍 三位），才落得回地球', run: async (T) => { await T.press('bedE1'); await T.read(5); } },
      { t: g.input.isTouch ? '按住「▲上浮」飘上去，抓住乱转的机器人' : '按住空格飘上去，抓住乱转的机器人', d: `小圆重启以后告诉你 🤖 ${a}`, run: async (T) => {
        await T.go('robot', { reach: 0.3 });
        await T.float(1.15); await T.until(() => g.ctrl.pos.y > 0.8, 5);
        await T.press('robot', { go: false });
        await T.until(() => S.found[0], 10); await T.until(() => R.robot.state === 'follow', 8);
        await T.float(0.3);
      } },
      { t: '喝掉驾驶舱里的大水球', d: `嘬三口水球就破了，里面的纸条写着 💧 ${b}`, run: async (T) => {
        for (let i = 0; i < 3 && !R.waterBall.freed; i++) { await T.press('waterBall', { go: i === 0, hold: i ? 0.2 : 0.45 }); await T.wait(0.9); }
        await T.read(3.2); await T.until(() => S.found[1], 3); await T.wait(1);
      } },
      { t: '打开舷窗的遮光板', run: async (T) => { await T.press('curtain'); await T.wait(2.6); } },
      { t: '对着舷窗看风景，等地球"关灯"', d: `太空舱绕到地球背面，城市的灯光拼出 🌍 ${c}`, run: async (T) => { await T.press('window'); await T.until(() => S.found[2] && !CH._lapse && !g.cine, 14); } },
      { t: `在驾驶舱的仪表台输入 ${a}${b}${c}，变轨点火`, d: '返回轨道建立了', run: async (T) => { await T.press('dashboard'); await T.code(`${a}${b}${c}`); await T.until(() => !CH._burning, 14); await T.wait(4.8, { ff: 2 }); } },
      { t: '从气闸出舱', run: (T) => T.exit() },
    ];
  },
};

// ---------------- 播放器 ----------------
export class Tutorial {
  constructor(g, { chapter = 1, all = false } = {}) {
    this.g = g;
    this.first = chapter;
    this.all = all;
    this.gen = 0;
    this.waits = [];
    this.move = null;
    this.look = null;
    this.hover = null;
    this.rate = 1; // 播放倍速（1× / 2×）
    this.ff = 0;
    this.stepI = -1;
    this.steps = [];
    this._stateT = 0; this._state = '';
    this._build();
  }

  // ---------- 界面 ----------
  _build() {
    document.body.classList.add('tut', 'tut-auto');
    const el = document.createElement('div');
    el.id = 'tut';
    el.innerHTML = `
      <div id="tut-card"><div class="h">动画教程<b class="n"></b></div><div class="ch"></div><ol></ol></div>
      <div id="tut-key"></div>
      <div id="tut-bar">
        <span class="ff">⏩ 快进</span>
        <button data-a="pause" title="空格">暂停</button>
        <button data-a="speed" title="+ / -">1×</button>
        <button data-a="next" title="N">下一章</button>
        <button data-a="exit" title="Esc">退出</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.card = el.querySelector('#tut-card');
    this.list = el.querySelector('ol');
    this.keyEl = el.querySelector('#tut-key');
    this.bar = el.querySelector('#tut-bar');
    this.bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.g.audio.click(); this[b.dataset.a](); }));
    // 真键盘：只认教程自己的快捷键，别的键一律拦下（不然会拨乱密码盘、关掉纸条）
    this._keys = (e) => {
      if (!e.isTrusted) return;
      const c = e.code;
      if (c === 'Space') this.pause();
      else if (c === 'Escape') this.exit();
      else if (c === 'KeyN') this.next();
      else if (c === 'Equal' || c === 'NumpadAdd' || c === 'Minus' || c === 'NumpadSubtract') this.speedTo(c === 'Minus' || c === 'NumpadSubtract' ? 1 : 2);
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', this._keys, true);
  }
  _renderSteps() {
    const n = this.g.chapter;
    this.card.querySelector('.ch').textContent = chapterLabel(n);
    this.list.innerHTML = this.steps.map((s) => `<li><span>${esc(s.t)}</span>${s.d ? `<small>${esc(s.d)}</small>` : ''}</li>`).join('');
    this.stepI = -1;
  }
  _setStep(i) {
    this.stepI = i;
    [...this.list.children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'cur' : ''; });
    this.card.querySelector('.n').textContent = i < this.steps.length ? `${i + 1} / ${this.steps.length}` : '';
    const li = this.list.children[i];
    if (li) this.list.scrollTo({ top: Math.max(0, li.offsetTop - this.list.clientHeight * 0.3), behavior: 'smooth' });
  }
  // 按键回显：右下角亮一下"按了哪个键、干了什么"
  cast(key, what = '') {
    const k = this.keyEl;
    k.innerHTML = `<kbd>${esc(key)}</kbd>${what ? `<span>${esc(what)}</span>` : ''}`;
    k.classList.remove('on'); void k.offsetWidth; k.classList.add('on');
    clearTimeout(this._castT);
    this._castT = setTimeout(() => k.classList.remove('on'), 1500);
  }

  // ---------- 控制 ----------
  pause() {
    const g = this.g;
    if (this._ended) return;
    g.paused = !g.paused;
    g.gfx.dirty = true;
    this.bar.querySelector('[data-a=pause]').textContent = g.paused ? '继续' : '暂停';
    this.el.classList.toggle('paused', g.paused);
  }
  speed() { this.speedTo(this.rate === 1 ? 2 : 1); }
  speedTo(s) {
    this.rate = s;
    this.bar.querySelector('[data-a=speed]').textContent = `${s}×`;
  }
  // 下一章：这一章剩下的步骤不演了，直接穿越过去（最后一章就结束）
  next() {
    const g = this.g;
    if (this._ended) return;
    if (g.state !== 'play' && g.state !== 'outro') return;
    if (g.paused) this.pause();
    this.abort();
    if (g.chapter >= LAST_CHAPTER) { g.state = 'outro'; this.showEnd(g.chapter); return; }
    g.state = 'outro';
    g.ui.closeModal(true);
    g.goChapter(g.chapter + 1);
  }
  exit() { location.reload(); }
  // 当前步骤全部作废：正在走的路、正在等的条件、对准的物件都丢掉
  abort() {
    this.gen++;
    this.waits = [];
    this.move = null; this.look = null; this.hover = null;
    this.g.ctrl.bot = null;
    this.ff = 0;
  }

  // ---------- 章节 ----------
  // beginPlay 时调用：这一章可以开始演了
  onPlay() {
    const g = this.g;
    g.ctrl.setMode('third');
    this.abort();
    const gen = this.gen;
    const make = SCRIPTS[g.chapter];
    this.steps = make ? make(g) : [];
    this._renderSteps();
    this._run(gen);
  }
  async _run(gen, from = 0) {
    await this.wait(from ? 0.3 : 1.6);
    for (let i = from; i < this.steps.length; i++) {
      if (gen !== this.gen) return;
      this._setStep(i);
      const s = this.steps[i];
      // 每一步最多演 80 秒：万一卡住了（不该发生），这一步作废、接着演下一步，别让整个演示停住
      const r = await Promise.race([s.run(this).then(() => 'ok', (e) => { console.error('[教程]', s.t, e); return 'err'; }), this.wait(80).then(() => 'timeout')]);
      if (gen !== this.gen) return;
      if (r !== 'ok') {
        console.warn('[教程] 这一步没演完：', s.t, r);
        this.abort(); // 还挂着的走路 / 等待一起丢掉，免得过一会儿又冒出来捣乱
        this._run(this.gen, i + 1);
        return;
      }
      await this.wait(0.45);
    }
  }
  // 出门之后（白屏底下）：连播就去下一章；只看一章就停在这里
  chapterDone(n) {
    this.abort();
    this._setStep(this.steps.length);
    if (this.all && n < LAST_CHAPTER) return false;
    this.showEnd(n);
    return true;
  }
  showEnd(n) {
    this._ended = true;
    document.body.classList.remove('tut-auto');
    const last = n >= LAST_CHAPTER;
    const end = document.createElement('div');
    end.id = 'tut-end';
    end.className = 'panel';
    end.innerHTML = `<h2>${last ? (this.all || this.first === 1 ? '七个 211，全部演示完了' : '演示完了') : `${chapterNum(n)}演示完了`}</h2>
      <p>${last ? '最后那扇门后面的结局，留给你自己去推开。' : `下一间是${chapterLabel(n + 1)}。`}</p>
      <div class="row">${last ? '' : `<button class="btn primary" data-a="more">接着看${chapterNum(n + 1)}</button>`}<button class="btn${last ? ' primary' : ''}" data-a="title">返回标题</button></div>`;
    this.el.appendChild(end);
    this.bar.classList.add('hidden');
    end.querySelector('[data-a=title]').addEventListener('click', () => this.exit());
    const more = end.querySelector('[data-a=more]');
    if (more) more.addEventListener('click', () => {
      this.g.audio.click();
      end.remove();
      this._ended = false;
      this.bar.classList.remove('hidden');
      document.body.classList.add('tut-auto');
      this.g.goChapter(n + 1, { throughDoor: this.g.state === 'outro' && this.g.ui.el.fade.style.opacity === '1' });
    });
  }

  // ---------- 每帧 ----------
  update(dt) {
    const g = this.g, C = g.ctrl;
    // 进门过场都跳过（教程只演通关步骤）
    if (g.state !== this._state) { this._state = g.state; this._stateT = 0; }
    this._stateT += dt;
    if (g.state === 'intro' && this._stateT > 0.8) g._skipIntro();
    if (g.state === 'cut' && this._stateT > 1.0) g._skipCut();
    // 等待中的条件 / 计时
    let ff = 0;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      w.t += dt;
      if (w.ff) ff = Math.max(ff, w.ff === true ? 4 : w.ff);
      const ok = w.fn ? w.fn() : false;
      if (ok || w.t >= w.dur) { this.waits.splice(i, 1); w.res(!!ok || !w.fn); }
    }
    this.ff = ff;
    g.timeScale = Math.max(this.rate, ff);
    this.bar.classList.toggle('ffing', ff > this.rate);
    if (g.state !== 'play') { C.bot = null; return; }
    // 走路：跟着路点走，快到终点时减速；镜头慢慢转到人背后
    const m = this.move, pos = C.pos;
    if (m) {
      let wp = m.pts[m.i], dx = wp.x - pos.x, dz = wp.z - pos.z, d = Math.hypot(dx, dz);
      while (m.i < m.pts.length - 1 && d < 0.2) { m.i++; wp = m.pts[m.i]; dx = wp.x - pos.x; dz = wp.z - pos.z; d = Math.hypot(dx, dz); }
      const last = m.i === m.pts.length - 1, fl = C.float > 0.5;
      const sp = m.speed * (last ? clamp(d / (fl ? 0.9 : 0.45), fl ? 0.1 : 0.2, 1) : 1);
      m.t += dt;
      if (last && d < (fl ? 0.12 : 0.06)) { C.bot = { vx: 0, vz: 0 }; this.move = null; m.res(true); }
      else C.bot = { vx: (dx / Math.max(d, 1e-4)) * sp, vz: (dz / Math.max(d, 1e-4)) * sp };
      // 卡住了：一秒半没走近，从当前位置重新规划；再不行直接挪到站位上
      if (d < m.best - 0.04) { m.best = d; m.stuck = 0; } else m.stuck += dt;
      if (this.move && m.stuck > 1.5) {
        m.stuck = 0; m.best = Infinity; m.tries = (m.tries || 0) + 1;
        const end = m.pts[m.pts.length - 1];
        const p2 = m.tries < 3 ? this._nav(0.2).search(pos.x, pos.z, (x, z) => Math.hypot(x - end.x, z - end.z) < 0.08) : null;
        if (p2 && p2.length) { m.pts = p2; m.i = 0; }
        else { C.teleport(end.x, end.z); C.bot = { vx: 0, vz: 0 }; this.move = null; m.res(true); }
      }
      const v = Math.hypot(C.vel.x, C.vel.z);
      if (v > 0.25) C.yaw = dampAngle(C.yaw, Math.atan2(C.vel.x, C.vel.z) + Math.PI, 2.6, dt);
      C.pitch = damp(C.pitch, -0.2, 2, dt);
    } else C.bot = { vx: 0, vz: 0 }; // 没在走路也占着：触屏摇杆推不动人
    // 对准：人转过去面朝物件，镜头从肩膀后面看过去，屏幕中间正对着它
    if (this.look) {
      const P = this._point(this.look);
      C.charYaw = dampAngle(C.charYaw, Math.atan2(P.x - pos.x, P.z - pos.z), 7, dt);
      let yaw = C.yaw, pitch = C.pitch;
      const h = Math.min(2.7, 1.52 + pos.y);
      for (let k = 0; k < 2; k++) {
        const tx = pos.x + Math.cos(yaw) * 0.24, tz = pos.z - Math.sin(yaw) * 0.24;
        const ax = P.x - tx, ay = P.y - h, az = P.z - tz, L = Math.hypot(ax, ay, az) || 1;
        yaw = Math.atan2(-ax, -az); pitch = Math.asin(clamp(ay / L, -1, 1));
      }
      C.yaw = dampAngle(C.yaw, yaw, 5, dt);
      C.pitch = damp(C.pitch, clamp(pitch, -0.95, 0.8), 5, dt);
      if (this.hover) this.hover.point.copy(P);
    }
  }

  // ---------- 步骤里用的动作 ----------
  wait(sec, { ff = 0 } = {}) { return new Promise((res) => this.waits.push({ fn: null, dur: sec, t: 0, res, ff })); }
  // 等某个条件成立（最多 timeout 秒）；ff：等的时候快进
  until(fn, timeout = 30, { ff = 0 } = {}) { return new Promise((res) => this.waits.push({ fn, dur: timeout, t: 0, res, ff })); }
  _nav(r) { const g = this.g; return new NavGrid(g.collision, g.refs.bounds, r); }
  // 物件：场景里所有带这个 iid、看得见的网格（pick 用来在同名的几个里挑一个，比如三个舷窗）
  target(id, pick = null) {
    const g = this.g;
    let ms = g.rayTargets.filter((o) => o.userData.iid === id && g._visible(o));
    if (pick) ms = pick(ms);
    if (!ms.length) {
      const o = g.refs.interact[id];
      if (!o || !g._visible(o)) return null;
      const list = [];
      o.traverse((c) => { if (c.isMesh) list.push(c); });
      ms = list;
    }
    if (!ms.length) return null;
    return { id, meshes: ms, obj: g._rootOf(ms[0]) };
  }
  _box(t) {
    _b.makeEmpty();
    for (const m of t.meshes) {
      if (!m.geometry) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.updateWorldMatrix(true, false); // 会动的东西（刚被吹下来的学生证、滑来滑去的扳手）：世界矩阵要是新的
      _mb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); _b.union(_mb);
    }
    return _b;
  }
  _point(t) { return this._box(t).getCenter(t._p || (t._p = V())); }
  // 走到物件跟前（站位自动找：离它最近、走得到的地方）；路被门挡住就先去开门
  async go(id, o = {}, depth = 0) {
    const g = this.g, tgt = typeof id === 'string' ? this.target(id, o.pick) : id;
    if (!tgt) throw new Error(`找不到 ${id}`);
    const pos = g.ctrl.pos;
    let path = null;
    // 先按宽松的间距找路；有的章节家具摆得紧（人刚好挤得过去），再用贴着人身宽度的网格找一次
    for (const nav of [this._nav(0.24), this._nav(0.2)]) {
      if (o.at) path = nav.search(pos.x, pos.z, (x, z) => Math.hypot(x - o.at[0], z - o.at[1]) < 0.08);
      else {
        const b = this._box(tgt), rect = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
        for (const r of [o.reach ?? 0.45, 0.7, 1.0, 1.5]) { path = nav.search(pos.x, pos.z, (x, z) => rectDist(x, z, rect) <= r); if (path) break; }
      }
      if (path) break;
    }
    if (!path && depth < 2) {
      for (const d of DOORS) {
        const D = g.refs[d];
        if (!D || D.open || D.anim || tgt.id === d) continue;
        await this.press(d, {}, depth + 1);
        await this.until(() => !D.anim, 2);
        return this.go(tgt, o, depth + 1);
      }
    }
    if (!path) throw new Error(`走不到 ${tgt.id}`);
    if (!path.length) return;
    const gen = this.gen;
    await new Promise((res) => { this.move = { pts: path, i: 0, speed: o.speed || (g.ctrl.float > 0.5 ? 1.0 : 1.55), res, t: 0, best: Infinity, stuck: 0 }; });
    if (gen !== this.gen) await new Promise(() => {});
  }
  // 走过去、转身对准、按 E
  async press(id, o = {}, depth = 0) {
    const g = this.g;
    const tgt = this.target(id, o.pick);
    if (!tgt) throw new Error(`找不到 ${id}`);
    if (o.go !== false) await this.go(tgt, o, depth);
    const gen = this.gen;
    this.look = tgt;
    const P = this._point(tgt).clone();
    this.hover = { iid: id, obj: tgt.obj, point: P };
    await this.wait(o.hold ?? 0.55);
    if (gen !== this.gen) return new Promise(() => {});
    const hd = g.handlers[id];
    if (!hd) throw new Error(`${id} 没有交互`);
    g.hover = this.hover;
    const verb = typeof hd.verb === 'function' ? hd.verb(this.hover) : hd.verb || '查看';
    const label = typeof hd.label === 'function' ? hd.label() : hd.label;
    if (!o.quiet) this.cast(g.input.isTouch ? '互动' : 'E', `${verb} · ${label}`);
    this._pulsePrompt();
    g._interact();
    this.look = null; this.hover = null;
    await this.wait(o.after ?? 0.3);
  }
  _pulsePrompt() {
    const k = document.querySelector('#prompt kbd');
    if (!k) return;
    k.classList.remove('press'); void k.offsetWidth; k.classList.add('press');
  }
  // 纸条 / 信 / 电话：看一会儿，按 E 关掉
  async read(sec = 3) {
    const g = this.g;
    await this.until(() => g.ui.modalOpen, 2.5);
    await this.wait(sec);
    if (g.ui.modalOpen) { this.cast(g.input.isTouch ? '✕' : 'E', '关闭'); g.ui.closeModal(); }
    await this.wait(0.3);
  }
  // 密码盘：一格一格拨数字，最后按确认
  async code(str) {
    const g = this.g;
    await this.until(() => document.querySelector('#modal .lockbox'), 3);
    await this.wait(0.7);
    for (const ch of String(str)) {
      if (!document.querySelector('#modal .lockbox')) return;
      this.cast(ch, '拨号');
      key(`Digit${ch}`);
      await this.wait(0.42);
    }
    await this.wait(0.35);
    this.cast('Enter', document.querySelector('#modal .lockbox [data-a=ok]')?.textContent.replace(/\s/g, '') || '确认');
    key('Enter');
    await this.wait(0.4);
  }
  // 电脑开机密码：一个字母一个字母地敲进输入框
  async type(str) {
    await this.until(() => document.querySelector('#modal .pc input'), 3);
    await this.wait(0.8);
    const inp = document.querySelector('#modal .pc input');
    if (!inp) return;
    for (const ch of str) {
      inp.value += ch.toLowerCase();
      inp.dispatchEvent(new Event('input'));
      this.cast(ch, '输入密码');
      await this.wait(0.3);
    }
    await this.wait(0.3);
    this.cast('Enter', '登录');
    inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
  }
  // 用物品栏里的东西（面具、滤罐……）
  async item(id) {
    const g = this.g, i = g.S.inv.indexOf(id);
    if (i < 0) throw new Error(`身上没有 ${id}`);
    const it = g._items()[id];
    this.cast(g.input.isTouch ? it.icon : String(i + 1), `使用 · ${it.name}`);
    const slot = document.querySelectorAll('#hud-inventory .slot')[i];
    if (slot) { slot.classList.remove('press'); void slot.offsetWidth; slot.classList.add('press'); }
    g.useItem(id);
    await this.wait(0.3);
  }
  async torch() {
    const g = this.g;
    this.cast(g.input.isTouch ? '手电' : 'F', g.S.uvOn ? '关掉手电' : '打开手电');
    g.toggleUV();
    await this.wait(0.6);
  }
  // 失重：按住空格往上飘 / 按住 C 往下沉
  async float(h) {
    const g = this.g, up = h > g.ctrl.floatTarget;
    this.cast(g.input.isTouch ? (up ? '▲上浮' : '▼下沉') : up ? '空格' : 'C', up ? '按住上浮' : '按住下沉');
    g.ctrl.floatTarget = h;
    await this.wait(0.4);
  }
  // 最后一步：出门（任务要是没完成——不该发生——就补上，免得演示被困在循环里）
  async exit() {
    const g = this.g, S = g.S;
    if (!S.f.taskDone) await this.until(() => S.f.taskDone, 12);
    if (!S.f.taskDone) { console.warn('[教程] 任务没完成就到了出门这一步'); g.completeTask('', 0); }
    // 站到门的斜前方再按：出门的自动走位（game.win）就是从这儿走过去开门的
    await this.press('door', { at: [-0.3, 3.2], hold: 0.8 });
  }
}

// 模拟一次按键（密码盘只认 window 上的 keydown）
function key(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^Digit/, ''), bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.replace(/^Digit/, ''), bubbles: true }));
}
