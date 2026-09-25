// 第四章：太空舱里的"家具"——布局和宿舍一模一样，只是每一样东西都换成了舱里的设备：
//   四张上下铺 → 四台封闭的休眠舱（上层是冷却机组）；书架 → 资料库（彩蛋要用的那本书就在这里）；
//   我的书桌 / 电脑 → 信息接收站；隔壁书桌 → 生命维持控制台；窗前书桌 → 观测台（望远镜）；
//   鞋架 → 氧气瓶架；收纳箱 → 补给货箱；门边杂物桌 → 太空厨房；门边折叠桌 → 舱外宇航服；
//   洗手间 → 东半边驾驶舱（驾驶座、仪表台、饮水机）+ 西边隔间改成储藏室（货柜 G 里锁着"卡冈图雅"）
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TS from '../core/tex_space.js';
import { mulberry32 } from '../core/util.js';
import { makeBlackHole } from './gargantua.js';
import { std as realStd, glow as realGlowMat, real, panel, compact } from './spacelook.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 材质都从 spacelook 拿：原来的动画配色会被换成用旧了的空间站配色
const std = (color, o = {}) => realStd(color, { roughness: 0.55, ...o });
const glow = realGlowMat;
// 长条的装饰灯带：写实版里只是很暗的一条（真正亮的只有小指示灯）
const stripGlow = () => new THREE.MeshBasicMaterial({ color: '#3c5a4e', toneMapped: false });
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, seg = 20, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const group = (x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; return g; };
// 两点之间的一根管子 / 杆子
function rod(a, b, r, mat, seg = 10) {
  const len = a.distanceTo(b);
  const m = mesh(cyl(r, r, len, seg), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const tube = (pts, r, mat, seg = 40) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8), mat, { cast: false });
// 沿 z 轴躺着的半个胶囊：upper = 上半（舱盖），否则下半（舱体）
function halfCapsule(r, len, upper, seg = 28) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(a)), -len / 2 + r * Math.sin(a))); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(a)), len / 2 + r * Math.sin(a))); }
  const g = new THREE.LatheGeometry(pts, seg, upper ? Math.PI / 2 : -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  return g;
}
function canvasTex(w, h, draw) {
  const c = TX.makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  return { canvas: c, tex: TX.toTex(c, { wrap: false }) };
}
const screenMesh = (w, h, tex, o = {}) => mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.78, 0.78, 0.78) }), { ...o, cast: false });
const sign = (lines, w, h, o = {}, so = {}) => {
  const so2 = { ...so }; if (so2.fg) so2.fg = real(so2.fg); if (so2.accent) so2.accent = real(so2.accent);
  return mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: TS.genSign(lines, { W: 512, H: Math.round((512 * h) / w), ...so2 }), roughness: 0.7 }), { ...o, cast: false });
};

// ---------------- 画在屏幕上的东西（名字每局随机，开局时由第四章来画）----------------
const MONO = '"SF Mono","Menlo","Consolas","PingFang SC",monospace';
// 休眠舱床头的状态屏
export function drawPodScreen(c, { code, name, status, ok = false, warn = false }) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#070a08'; x.fillRect(0, 0, W, H);
  const col = warn ? '#ffb04a' : ok ? '#8cf0a4' : '#b8dccb';
  x.strokeStyle = col; x.globalAlpha = 0.6; x.lineWidth = 2; x.strokeRect(6, 6, W - 12, H - 12); x.globalAlpha = 1;
  x.fillStyle = col; x.textAlign = 'left';
  x.font = `bold 26px ${MONO}`; x.fillText(`CRYO ${code}`, 20, 42);
  x.font = `bold 30px "PingFang SC",sans-serif`; x.fillText(name, 20, 92);
  x.font = `bold 24px "PingFang SC",sans-serif`; x.fillText(status, 20, 140);
  x.globalAlpha = 0.35; for (let i = 0; i < 6; i++) x.fillRect(W - 36, 24 + i * 22, 14, 14); x.globalAlpha = 1;
  TS.crtFinish(x, W, H);
}
// 信息接收站的大屏：标题、实时波形、最近几条消息（第四章每 0.1 秒重画一次）
export function drawComms(c, { t = 0, lines = [], channel = 'CH-01 · 返回舱', alert = false, anomaly = 0 }) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#060908'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(140,240,164,0.08)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  const col = alert ? '#ff6a4a' : '#8cf0a4';
  x.fillStyle = col; x.font = `bold 24px ${MONO}`; x.textAlign = 'left';
  x.fillText('S-BAND RCVR · 信息接收站', 18, 36);
  x.font = `bold 20px "PingFang SC",sans-serif`; x.fillStyle = anomaly > 0 ? '#ffb04a' : '#cfe8d6';
  x.fillText(`▶ ${channel}`, 18, 66);
  // 波形：正常是平缓的正弦，收到异常信号时变成一串一长一短的脉冲
  x.strokeStyle = anomaly > 0 ? '#ffb04a' : col; x.lineWidth = 2; x.beginPath();
  for (let i = 0; i <= 120; i++) {
    const u = i / 120, px = 18 + u * (W - 36);
    let v = Math.sin(u * 22 + t * 5) * 0.35 + Math.sin(u * 57 - t * 9) * 0.15;
    if (anomaly > 0) { const k = Math.floor(u * 16 + t * 2) % 16; v = [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0][k] ? 0.8 : -0.1; v += Math.sin(u * 90 + t * 20) * 0.05; }
    const py = 112 - v * 30;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
  x.font = `20px "PingFang SC",sans-serif`;
  lines.slice(-6).forEach((l, i) => { x.fillStyle = l.color || '#cfe8d6'; x.fillText(l.text, 18, 176 + i * 30); });
  if (Math.sin(t * 6) > 0) { x.fillStyle = col; x.fillRect(W - 40, 20, 16, 16); }
  TS.crtFinish(x, W, H, 0.14);
}
// 仪表台的导航屏：一条弯弯的返航轨道
function drawNav(c, t) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#060908'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(140,240,164,0.2)'; x.lineWidth = 1;
  for (let r = 30; r < 160; r += 30) { x.beginPath(); x.arc(W * 0.3, H * 0.55, r, 0, 6.28); x.stroke(); }
  x.strokeStyle = '#8cf0a4'; x.lineWidth = 2; x.beginPath(); x.arc(W * 0.3, H * 0.55, 26, 0, 6.28); x.stroke();
  x.strokeStyle = '#ffb04a'; x.setLineDash([8, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(W * 0.92, H * 0.2); x.quadraticCurveTo(W * 0.62, H * 0.1, W * 0.36, H * 0.46); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#8cf0a4'; x.font = `bold 18px ${MONO}`; x.fillText('RETURN TRAJ.', 14, 26);
  x.font = `bold 16px "PingFang SC",sans-serif`; x.fillText('自动驾驶 · 返回地球', 14, H - 16);
  x.fillStyle = '#ffb04a'; x.beginPath(); x.arc(W * 0.92, H * 0.2, 5, 0, 6.28); x.fill();
  TS.crtFinish(x, W, H);
}

// ---------------- 休眠舱 ----------------
// side：-1 = 西边（靠墙在 -x，过道在 +x），1 = 东边
function makePod({ side, open = false, frost, seed = 0 }) {
  const g = new THREE.Group();
  const aisle = -side; // 过道方向（本地 x）
  const white = std('#eef2f7', { roughness: 0.35 }), navy = std('#243452', { roughness: 0.5 }), steel = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 });
  const cyanG = stripGlow();
  // 底座
  g.add(mesh(box(0.86, 0.42, 1.98), panel('#dfe5ee', { seed: 1 }), { y: 0.21 }));
  g.add(mesh(box(0.9, 0.06, 2.0), navy, { y: 0.03 }));
  g.add(mesh(box(0.012, 0.025, 1.7), cyanG, { x: aisle * 0.432, y: 0.33, cast: false }));
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.01, 0.05, 0.22), navy, { x: aisle * 0.432, y: 0.17, z: -0.6 + i * 0.4, cast: false }));
  // 舱体（下半个胶囊）+ 里面的软垫和枕头
  const tub = mesh(halfCapsule(0.37, 1.2, false), std('#f4f7fb', { roughness: 0.3, side: THREE.DoubleSide }), { y: 0.62, s: [1, 0.75, 1] });
  tub.userData.noOutline = true;
  g.add(tub);
  g.add(mesh(new THREE.CapsuleGeometry(0.29, 1.1, 6, 16), std('#3a5f9a', { roughness: 0.8 }), { y: 0.47, rx: Math.PI / 2, s: [1, 1, 0.35] }));
  g.add(mesh(box(0.34, 0.07, 0.2), std('#dfe8f5', { roughness: 0.9 }), { y: 0.56, z: -0.72 }));
  // 舱沿：两根长梁 + 两头的半圆
  const rim = std('#ff9a3d', { roughness: 0.35 });
  for (const s of [-1, 1]) g.add(mesh(box(0.045, 0.05, 1.2), rim, { x: s * 0.37, y: 0.62 }));
  for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.37, 0.022, 6, 20, Math.PI), rim, { y: 0.62, z: s * 0.6, rx: s * Math.PI / 2 }));
  // 舱盖（上半个胶囊，半透明，结着霜）：合页在靠墙那一边
  const hinge = group(side * 0.37, 0.62, 0);
  g.add(hinge);
  const canopy = mesh(halfCapsule(0.38, 1.2, true), new THREE.MeshStandardMaterial({ color: '#c9d2d0', map: frost, transparent: true, opacity: open ? 0.4 : 0.62, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }), { x: -side * 0.37, s: [1, 0.8, 1], cast: false });
  canopy.renderOrder = 3;
  hinge.add(canopy);
  if (open) hinge.rotation.z = -side * 1.25;
  // 冷却管从上层机组接下来
  const pipeM = std('#bfe8ff', { roughness: 0.3 });
  g.add(tube([V(side * 0.3, 1.42, 0.82), V(side * 0.34, 1.1, 0.86), V(side * 0.36, 0.75, 0.86)], 0.022, pipeM));
  g.add(tube([V(side * 0.3, 1.42, -0.82), V(side * 0.34, 1.1, -0.86), V(side * 0.36, 0.75, -0.86)], 0.022, pipeM));
  // 四根立柱（对应上下铺的床柱）+ 上层平台
  for (const [px, pz] of [[-0.44, -0.97], [0.44, -0.97], [-0.44, 0.97], [0.44, 0.97]]) g.add(mesh(box(0.05, 2.78, 0.05), steel, { x: px, y: 1.39, z: pz }));
  g.add(mesh(box(0.92, 0.07, 1.98), panel('#b9c3d2', { seed: 2 }), { y: 1.45 }));
  g.add(mesh(box(0.012, 0.02, 1.8), cyanG, { x: aisle * 0.462, y: 1.45, cast: false }));
  // 上层：两个横躺的冷却液罐 + 压缩机 + 一排会闪的指示灯
  const tankM = std('#8e918b', { roughness: 0.42, metalness: 0.6 }), band = std('#2ec4c9', { roughness: 0.4 });
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CapsuleGeometry(0.15, 1.2, 6, 18), tankM, { x: s * 0.2, y: 1.66, rx: Math.PI / 2 }));
    for (const z of [-0.45, 0, 0.45]) g.add(mesh(new THREE.TorusGeometry(0.152, 0.012, 6, 24), band, { x: s * 0.2, y: 1.66, z, cast: false }));
  }
  const comp = group(0, 2.1, 0.55);
  comp.add(mesh(box(0.62, 0.36, 0.6), panel('#b9c3d2', { seed: 3 })));
  comp.add(mesh(new THREE.CircleGeometry(0.13, 24), navy, { x: aisle * 0.311, ry: aisle * Math.PI / 2, cast: false }));
  const fan = group(aisle * 0.313, 0, 0);
  for (let i = 0; i < 3; i++) fan.add(mesh(box(0.004, 0.22, 0.04), steel, { rx: (i * Math.PI) / 3, cast: false }));
  comp.add(fan);
  g.add(comp);
  const leds = [];
  for (let i = 0; i < 5; i++) { const l = mesh(box(0.012, 0.022, 0.03), glow(['#8fffc0', '#7fe8ff', '#ffd23f', '#8fffc0', '#ff8a9a'][i]), { x: aisle * 0.462, y: 1.62, z: -0.7 + i * 0.07, cast: false }); g.add(l); leds.push(l); }
  // 冷气管道一路接到天花板
  g.add(tube([V(0, 2.28, -0.3), V(0, 2.6, -0.35), V(-side * 0.1, 2.95, -0.4)], 0.035, pipeM));
  // 床头的状态屏（朝过道斜着）
  const scr = canvasTex(256, 160, () => {});
  const arm = group(aisle * 0.47, 1.02, -0.72);
  arm.add(mesh(box(0.03, 0.03, 0.03), steel));
  const scrPanel = group(aisle * 0.02, 0, 0);
  scrPanel.rotation.y = aisle * Math.PI / 2 - aisle * 0.35;
  scrPanel.add(mesh(box(0.3, 0.2, 0.02), navy, { z: -0.012 }));
  scrPanel.add(screenMesh(0.27, 0.17, scr.tex, { z: 0.0 }));
  arm.add(scrPanel);
  g.add(arm);
  return { group: g, canopy, hinge, screen: scr, leds, fan, mist: V(0, 0.9, 0) };
}

// 霜花：舱盖边上一圈白霜 + 零散的冰晶
function genFrost(seed = 1) {
  return canvasTex(512, 512, (x, W, H) => {
    const r = mulberry32(seed);
    x.clearRect(0, 0, W, H);
    // 边上一圈结得厚的霜，往中间越来越薄，一片片不规则
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(225,232,230,0.85)'); g.addColorStop(0.18, 'rgba(215,224,222,0.3)'); g.addColorStop(0.5, 'rgba(210,220,218,0.08)'); g.addColorStop(0.82, 'rgba(215,224,222,0.3)'); g.addColorStop(1, 'rgba(225,232,230,0.85)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const edge = r() < 0.7, cx = edge ? (r() < 0.5 ? r() * W * 0.22 : W - r() * W * 0.22) : r() * W, cy = r() * H, rad = 4 + r() * 22;
      const gg = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gg.addColorStop(0, `rgba(235,240,238,${0.15 + r() * 0.3})`); gg.addColorStop(1, 'rgba(235,240,238,0)');
      x.fillStyle = gg; x.beginPath(); x.arc(cx, cy, rad, 0, 6.28); x.fill();
    }
    // 细小的冰晶
    x.strokeStyle = 'rgba(240,244,242,0.35)'; x.lineWidth = 0.8;
    for (let i = 0; i < 160; i++) {
      const cx = r() * W, cy = r() * H, s = 2 + r() * 6;
      for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3 + r(); x.beginPath(); x.moveTo(cx - Math.cos(a) * s, cy - Math.sin(a) * s); x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); x.stroke(); }
    }
    // 水汽凝结的细流痕
    x.strokeStyle = 'rgba(200,210,208,0.25)'; x.lineWidth = 1.2;
    for (let i = 0; i < 30; i++) { const sx = r() * W, sy = r() * H * 0.6; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 6, sy + 30 + r() * 80); x.stroke(); }
  }).tex;
}

// ---------------- 资料库（原来的书架）----------------
// 书脊朝过道（+x），每一层都拿橙色松紧带勒着。第五层（从下往上，和眼睛一样高）中间那本就是《高等数学（下）》
const BOOK_TITLES = ['高等数学（下）', '时间简史', '从零开始的太空生活', '三体', '相对论入门', '宇航员手册', '高等数学（上）', '星际导航'];
function spineTex(title, bg, fg = '#e2dccb') {
  return canvasTex(64, 256, (x, W, H) => {
    x.fillStyle = real(bg); x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(210,190,130,0.45)'; x.fillRect(0, 14, W, 4); x.fillRect(0, H - 22, W, 4);
    x.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1);
    x.fillStyle = fg; x.font = `bold 26px "PingFang SC",sans-serif`; x.textAlign = 'center';
    const chars = [...title].slice(0, 8);
    chars.forEach((ch, i) => x.fillText(ch, W / 2, 50 + i * 26));
  }).tex;
}
function makeArchive() {
  const g = new THREE.Group();
  const frame = std('#b9c3d2', { roughness: 0.35, metalness: 0.4 }), navy = std('#1f2c4a', { roughness: 0.6 });
  const X0 = -1.8, X1 = -1.44, Z0 = -1.3, Z1 = -0.85, zc = (Z0 + Z1) / 2;
  const shelfY = [0.02, 0.43, 0.84, 1.25, 1.62, 2.0];
  // 两侧板 + 层板 + 背板（背板在彩蛋时要"透"过去，分成几块）
  for (const z of [Z0 + 0.01, Z1 - 0.01]) g.add(mesh(box(0.36, 2.04, 0.02), frame, { x: (X0 + X1) / 2, y: 1.02, z }));
  for (const y of shelfY) g.add(mesh(box(0.36, 0.025, 0.45), frame, { x: (X0 + X1) / 2, y }));
  const back = mesh(box(0.012, 2.0, 0.43), navy, { x: X0 + 0.012, y: 1.0, z: zc });
  g.add(back);
  // 顶上的标牌
  g.add(sign(['ARCHIVE', '资料库 · 请用松紧带固定书籍'], 0.46, 0.13, { x: -1.785, y: 2.2, z: zc, ry: Math.PI / 2 }));
  const r = mulberry32(77);
  const cols = ['#3a6fd8', '#ff4a5a', '#2ec4c9', '#ffd23f', '#ff8a3d', '#7fd48a', '#8a5aff', '#f4f6fa', '#243452'];
  const books = [];
  let target = null;
  const strapM = std('#ff9a3d', { roughness: 0.5 });
  const straps = [];
  shelfY.slice(0, 5).forEach((y0, si) => {
    let z = Z0 + 0.025;
    let k = 0;
    while (z < Z1 - 0.06) {
      const t = 0.028 + r() * 0.022, h = 0.2 + r() * 0.07, d = 0.2 + r() * 0.05;
      const isTarget = si === 4 && k === 4;
      const tt = isTarget ? 0.042 : t, hh = isTarget ? 0.25 : h, dd = isTarget ? 0.24 : d;
      if (z + tt > Z1 - 0.02) break;
      const c = isTarget ? '#1d3f8a' : cols[Math.floor(r() * cols.length)];
      const titled = isTarget || r() < 0.3;
      const bg = new THREE.Group();
      // 书：本地 +x 是书脊
      const body = mesh(box(dd, hh, tt), std(c, { roughness: 0.6 }), { y: hh / 2 });
      bg.add(body);
      bg.add(mesh(box(dd - 0.012, hh - 0.012, tt - 0.006), std('#fbf8f0', { roughness: 0.9 }), { x: -0.004, y: hh / 2, s: [1, 1, 1.01] }));
      if (titled) {
        const title = isTarget ? BOOK_TITLES[0] : BOOK_TITLES[1 + Math.floor(r() * (BOOK_TITLES.length - 1))];
        const sp = mesh(new THREE.PlaneGeometry(tt * 0.92, hh * 0.92), new THREE.MeshStandardMaterial({ map: spineTex(title, c), roughness: 0.6 }), { x: dd / 2 + 0.001, y: hh / 2, ry: Math.PI / 2, cast: false });
        bg.add(sp);
      }
      const x = X1 - 0.02 - dd / 2 - r() * 0.015;
      bg.position.set(x, y0 + 0.013, z + tt / 2);
      bg.rotation.x = isTarget ? 0 : (r() - 0.5) * 0.06;
      g.add(bg);
      const b = { group: bg, shelf: si, idx: k, t: tt, h: hh, d: dd, home: bg.position.clone(), color: c };
      books.push(b);
      if (isTarget) target = b;
      z += tt + 0.004;
      k++;
    }
    // 松紧带（空中飘不走）
    const strap = mesh(box(0.008, 0.018, 0.43), strapM, { x: X1 - 0.01, y: y0 + 0.05, z: zc, cast: false });
    g.add(strap); straps.push(strap);
  });
  // 索引卡盒（顶层）：里面插着一叠卡片——其中一张会自己飘出来
  const cardBox = group(-1.6, 2.013, -0.96);
  cardBox.add(mesh(box(0.2, 0.08, 0.14), std('#2ec4c9', { roughness: 0.5 }), { y: 0.04 }));
  for (let i = 0; i < 5; i++) cardBox.add(mesh(box(0.16, 0.07, 0.004), std('#fff6d8', { roughness: 0.9 }), { y: 0.085, z: -0.05 + i * 0.022, cast: false }));
  cardBox.add(sign(['INDEX', '索引'], 0.14, 0.05, { x: 0.101, y: 0.04, ry: Math.PI / 2 }));
  g.add(cardBox);
  // 自己飘出来的那张索引卡（一开始插在卡盒里）
  const cardC = canvasTex(256, 176, (x, W, H) => {
    x.fillStyle = '#e6dfc8'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#b8a070'; x.lineWidth = 4; x.strokeRect(3, 3, W - 6, H - 6);
    x.fillStyle = '#c0392b'; x.fillRect(0, 34, W, 3);
    x.fillStyle = '#243452'; x.font = `bold 22px ${MONO}`; x.fillText('INDEX · 001', 16, 26);
    x.font = `bold 24px "PingFang SC",sans-serif`; x.fillText('引力异常 → 接收站', 16, 80);
    x.font = `bold 22px "PingFang SC",sans-serif`; x.fillStyle = '#c0392b'; x.fillText('频道 211', 16, 120);
    x.fillStyle = '#888'; x.font = `18px "PingFang SC",sans-serif`; x.fillText('（笔迹……是我的？）', 16, 158);
  });
  const card = new THREE.Group();
  card.add(mesh(box(0.13, 0.09, 0.003), std('#fff6d8', { roughness: 0.9 })));
  card.add(mesh(new THREE.PlaneGeometry(0.126, 0.086), new THREE.MeshStandardMaterial({ map: cardC.tex, roughness: 0.9 }), { z: 0.0021, cast: false }));
  card.add(mesh(new THREE.PlaneGeometry(0.126, 0.086), new THREE.MeshStandardMaterial({ map: cardC.tex, roughness: 0.9 }), { z: -0.0021, ry: Math.PI, cast: false }));
  card.position.set(-1.6, 2.09, -0.96); card.rotation.set(0, Math.PI / 2, 0);
  card.visible = false;
  g.add(card);
  // 彩蛋的"窗口"：那本书被抽出来之后，背板上这块地方就能看到另一个时空（第四章再把画面接上）
  // 整个第五层（两块层板之间）：书被抽走以后，这一格的背板后面就是另一个时空
  const cell = { x: X0 + 0.03, y0: shelfY[4] + 0.013, y1: shelfY[5] - 0.013, z0: Z0 + 0.02, z1: Z1 - 0.02 }; // 背板前面一点点，别和背板打架
  return { group: g, books, target, card, cardBox, cell, back, straps, level: 4 };
}

// ---------------- 信息接收站（原来我的书桌 + 电脑）----------------
function makeStation() {
  const g = new THREE.Group();
  const navy = std('#243452', { roughness: 0.5 }), panelM = panel('#dfe5ee', { seed: 4 }), steel = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 });
  // 机柜 + 斜面操作台
  g.add(mesh(box(0.5, 0.72, 0.98), panelM, { x: 1.54, y: 0.36, z: 0.25 }));
  g.add(mesh(box(0.52, 0.04, 1.0), navy, { x: 1.54, y: 0.74, z: 0.25 }));
  const deck = group(1.42, 0.8, 0.25); deck.rotation.z = 0.28;
  deck.add(mesh(box(0.32, 0.04, 0.96), std('#2e3f62', { roughness: 0.4 })));
  const knobM = std('#ff9a3d', { roughness: 0.4 });
  for (let i = 0; i < 6; i++) deck.add(mesh(cyl(0.018, 0.02, 0.025, 12), knobM, { x: -0.06, y: 0.03, z: -0.38 + i * 0.07 }));
  for (let i = 0; i < 4; i++) deck.add(mesh(box(0.1, 0.012, 0.02), std('#6a5a3a', { roughness: 0.4, emissive: new THREE.Color('#ffb04a'), emissiveIntensity: 0.35 }), { x: 0.05, y: 0.025, z: 0.12 + i * 0.07, cast: false }));
  for (let i = 0; i < 8; i++) deck.add(mesh(box(0.025, 0.012, 0.025), glow(['#8fffc0', '#ffd23f', '#ff8a9a', '#7fe8ff'][i % 4]), { x: 0.1, y: 0.024, z: -0.36 + i * 0.05, cast: false }));
  g.add(deck);
  // 大屏（朝西，对着过道）
  const scr = canvasTex(512, 360, () => {});
  const frame = group(1.74, 1.3, 0.25); frame.rotation.y = -Math.PI / 2;
  frame.add(mesh(box(0.98, 0.64, 0.05), navy, { z: -0.03 }));
  frame.add(screenMesh(0.92, 0.6, scr.tex, { z: 0.0 }));
  frame.add(sign(['COMMS', '信息接收站'], 0.36, 0.1, { y: 0.4, z: -0.004 }));
  g.add(frame);
  // 桅杆 + 小锅盖天线（慢慢地转）
  g.add(mesh(cyl(0.015, 0.015, 0.5, 8), steel, { x: 1.7, y: 1.85, z: 0.66 }));
  const dish = group(1.7, 2.12, 0.66);
  const dishInner = group();
  dishInner.add(mesh(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, 0.75), std('#f4f7fb', { roughness: 0.3, side: THREE.DoubleSide }), { rx: -Math.PI / 2 - 0.5, cast: false }));
  dishInner.add(rod(V(0, 0, 0), V(0, 0.08, -0.14), 0.006, steel, 6));
  dishInner.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), glow('#ff4a5a'), { y: 0.08, z: -0.14, cast: false }));
  dish.add(dishInner);
  g.add(dish);
  // 耳麦挂在屏幕边上
  const hs = group(1.72, 1.1, -0.28);
  hs.add(mesh(new THREE.TorusGeometry(0.08, 0.01, 6, 18, Math.PI), navy, { ry: Math.PI / 2 }));
  for (const s of [-1, 1]) hs.add(mesh(cyl(0.035, 0.035, 0.025, 14), std('#ff9a3d'), { z: s * 0.08, rx: Math.PI / 2 }));
  g.add(hs);
  // 脚下的固定环（失重时把脚卡进去）
  for (const z of [0.05, 0.45]) g.add(mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), std('#ff9a3d'), { x: 1.2, y: 0.02, z, ry: Math.PI / 2, cast: false }));
  return { group: g, screen: scr, dish: dishInner };
}

// ---------------- 生命维持控制台（原来 {C} 的书桌）----------------
function makeLifeSupport() {
  const g = new THREE.Group();
  const navy = std('#243452', { roughness: 0.5 });
  g.add(mesh(box(0.5, 0.78, 0.98), panel('#dfe5ee', { seed: 5 }), { x: 1.54, y: 0.39, z: -0.8 }));
  g.add(mesh(box(0.012, 0.03, 0.9), stripGlow(), { x: 1.285, y: 0.6, z: -0.8, cast: false }));
  const scr = canvasTex(320, 180, () => {});
  const frame = group(1.74, 1.18, -0.8); frame.rotation.y = -Math.PI / 2;
  frame.add(mesh(box(0.5, 0.31, 0.05), navy, { z: -0.03 }));
  frame.add(screenMesh(0.46, 0.27, scr.tex, { z: 0.0 }));
  g.add(frame);
  // 氧气 / 氮气罐 + 压力表
  const tankM = std('#f4f7fb', { roughness: 0.3 });
  [['O₂', '#2ec4c9', -0.36], ['N₂', '#ffd23f', -1.24]].forEach(([lab, c, z]) => {
    const t = group(1.64, 1.35, z);
    t.add(mesh(new THREE.CapsuleGeometry(0.1, 0.55, 6, 16), tankM));
    t.add(mesh(new THREE.TorusGeometry(0.102, 0.014, 6, 20), std(c), { rx: Math.PI / 2, y: 0.18, cast: false }));
    t.add(sign([lab], 0.12, 0.12, { x: -0.101, y: -0.05, ry: -Math.PI / 2 }, { fg: c }));
    g.add(t);
  });
  g.add(tube([V(1.64, 0.92, -0.36), V(1.62, 0.84, -0.5), V(1.6, 0.8, -0.62)], 0.018, std('#ff9a3d')));
  const alarm = mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff5a6a', emissive: new THREE.Color('#ff2a3a'), emissiveIntensity: 0.6 }), { x: 1.76, y: 1.72, z: -0.65, rz: Math.PI / 2, cast: false });
  g.add(alarm);
  return { group: g, screen: scr };
}

// ---------------- 观测台（原来窗前的两张书桌）----------------
function makeObservatory() {
  const g = new THREE.Group();
  const navy = std('#243452', { roughness: 0.5 }), steel = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 });
  g.add(mesh(box(1.7, 0.72, 0.52), panel('#dfe5ee', { seed: 6 }), { y: 0.36, z: -3.18 }));
  g.add(mesh(box(1.72, 0.05, 0.56), navy, { y: 0.745, z: -3.18 }));
  g.add(mesh(box(1.5, 0.012, 0.012), stripGlow(), { y: 0.5, z: -2.915, cast: false }));
  // 星图屏（斜放在台面上）
  const scr = canvasTex(320, 180, () => {});
  const sf = group(0.45, 0.86, -3.2); sf.rotation.x = -0.6;
  sf.add(mesh(box(0.6, 0.36, 0.04), navy, { z: -0.025 }));
  sf.add(screenMesh(0.56, 0.32, scr.tex));
  g.add(sf);
  // 望远镜：三脚支架 + 镜筒对着舷窗往上翘
  const tel = group(-0.45, 0.77, -3.15);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; tel.add(rod(V(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), V(0, 0.28, 0), 0.008, steel, 6)); }
  const tube0 = group(0, 0.3, 0); tube0.rotation.set(0.55, 0.15, 0);
  tube0.add(mesh(cyl(0.065, 0.075, 0.6, 20), std('#f4f7fb', { roughness: 0.3 }), { rx: Math.PI / 2 }));
  tube0.add(mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 20), std('#ff9a3d'), { z: -0.26, cast: false }));
  tube0.add(mesh(cyl(0.02, 0.02, 0.1, 10), navy, { z: 0.34, rx: Math.PI / 2 }));
  tube0.add(mesh(new THREE.CircleGeometry(0.06, 20), std('#0c1a33', { roughness: 0.05, metalness: 0.6 }), { z: -0.301, ry: Math.PI, cast: false }));
  tel.add(tube0);
  g.add(tel);
  return { group: g, screen: scr, telescope: tel };
}

// ---------------- 氧气瓶架（原来的鞋架）----------------
function makeO2Rack() {
  const g = group(1.63, 0, 4.16);
  const frame = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 });
  for (const [x, z] of [[-0.15, -0.3], [0.15, -0.3], [-0.15, 0.3], [0.15, 0.3]]) g.add(mesh(box(0.03, 1.36, 0.03), frame, { x, y: 0.68, z }));
  for (const y of [0.05, 0.65, 1.34]) g.add(mesh(box(0.34, 0.03, 0.64), frame, { y }));
  const body = std('#2ec4c9', { roughness: 0.35 }), capM = std('#f4f7fb', { roughness: 0.3 });
  for (let tier = 0; tier < 2; tier++) for (let i = 0; i < 3; i++) {
    const b = group(0, 0.07 + tier * 0.6, -0.19 + i * 0.19);
    b.add(mesh(cyl(0.075, 0.075, 0.45, 18), body, { y: 0.24 }));
    b.add(mesh(new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, { y: 0.465 }));
    b.add(mesh(cyl(0.025, 0.03, 0.06, 10), capM, { y: 0.55 }));
    b.add(mesh(cyl(0.077, 0.077, 0.03, 18), capM, { y: 0.34, cast: false }));
    g.add(b);
  }
  g.add(mesh(box(0.012, 0.03, 0.6), std('#ff9a3d'), { x: -0.17, y: 0.4, cast: false }));
  g.add(mesh(box(0.012, 0.03, 0.6), std('#ff9a3d'), { x: -0.17, y: 1.0, cast: false }));
  return g;
}

// ---------------- 补给货箱（原来的收纳箱 + 波点收纳袋）----------------
function makeCrates() {
  const g = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ map: TS.genCargoBag({ seed: 4491 }), roughness: 0.95 }), plain = std('#cfc8b4', { roughness: 0.95 });
  const crate = (w, h, d, x, y, z, ry = 0) => { const m = mesh(new THREE.BoxGeometry(w, h, d), [plain, face, plain, plain, plain, face], { x, y: y + h / 2, z, ry }); g.add(m); return m; };
  crate(0.5, 0.4, 0.4, 1.18, 0, 4.26);
  crate(0.42, 0.3, 0.36, 1.2, 0.4, 4.27, 0.1);
  crate(0.46, 0.34, 0.3, 1.2, 0, 3.8, -0.05);
  const net = std('#ff9a3d', { roughness: 0.6 });
  for (const y of [0.25, 0.55]) g.add(mesh(box(0.54, 0.014, 0.012), net, { x: 1.18, y, z: 4.05, cast: false }));
  return g;
}

// ---------------- 太空厨房（原来门边的杂物桌）----------------
function makeGalley() {
  const g = new THREE.Group();
  const navy = std('#243452', { roughness: 0.5 });
  g.add(mesh(box(0.55, 0.8, 1.45), panel('#dfe5ee', { seed: 7 }), { x: -1.53, y: 0.4, z: 2.02 }));
  g.add(mesh(box(0.012, 0.02, 1.3), stripGlow(), { x: -1.253, y: 0.72, z: 2.02, cast: false }));
  // 加热器（发光的小窗）+ 饮水嘴
  const oven = group(-1.62, 1.18, 2.4);
  oven.add(mesh(box(0.36, 0.3, 0.46), panel('#b9c3d2', { seed: 8 })));
  oven.add(mesh(new THREE.PlaneGeometry(0.3, 0.16), glow('#ffb45a', { transparent: true, opacity: 0.85 }), { x: 0.181, ry: Math.PI / 2, cast: false }));
  g.add(oven);
  const tap = group(-1.66, 1.12, 1.62);
  tap.add(mesh(box(0.26, 0.36, 0.3), navy));
  tap.add(mesh(cyl(0.015, 0.015, 0.08, 8), std('#d8dde6', { metalness: 0.7, roughness: 0.3 }), { x: 0.16, y: -0.12, rz: Math.PI / 2 }));
  tap.add(sign(['H₂O'], 0.12, 0.08, { x: 0.131, y: 0.08, ry: Math.PI / 2 }, { fg: '#2ec4c9' }));
  g.add(tap);
  // 墙上用魔术贴粘着一排食物包
  const cols = ['#ff4a5a', '#ffd23f', '#2ec4c9', '#7fd48a', '#ff8a3d', '#8a5aff'];
  for (let i = 0; i < 12; i++) g.add(mesh(new THREE.BoxGeometry(0.02, 0.14, 0.1), std(cols[i % cols.length], { roughness: 0.6 }), { x: -1.785, y: 1.55 + Math.floor(i / 6) * 0.18, z: 1.5 + (i % 6) * 0.13, cast: false }));
  g.add(sign(['GALLEY', '太空厨房'], 0.4, 0.11, { x: -1.787, y: 1.98, z: 2.02, ry: Math.PI / 2 }));
  return g;
}

// ---------------- 舱外宇航服（原来门边的折叠桌）----------------
function makeEVASuit() {
  const g = group(-1.56, 0, 3.0, Math.PI / 2);
  const suit = std('#f4f6fa', { roughness: 0.7 }), orange = std('#ff8a3d', { roughness: 0.5 }), navy = std('#243452', { roughness: 0.5 }), steel = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 });
  // 挂架
  g.add(mesh(box(0.06, 1.95, 0.06), steel, { y: 0.97, z: -0.2 }));
  g.add(mesh(box(0.5, 0.05, 0.05), steel, { y: 1.62, z: -0.18 }));
  // 身体
  g.add(mesh(new THREE.CapsuleGeometry(0.19, 0.32, 8, 16), suit, { y: 1.28, s: [1, 1, 0.8] }));
  g.add(mesh(box(0.34, 0.46, 0.18), suit, { y: 1.3, z: -0.16 }));
  g.add(mesh(box(0.16, 0.12, 0.03), navy, { y: 1.32, z: 0.15 }));
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.025, 0.025, 0.01), glow(['#ff4a5a', '#8fffc0', '#ffd23f'][i]), { x: -0.05 + i * 0.05, y: 1.34, z: 0.167, cast: false }));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), orange, { y: 1.08, rx: Math.PI / 2 }));
  // 腿、靴子
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CapsuleGeometry(0.085, 0.42, 6, 12), suit, { x: s * 0.1, y: 0.62 }));
    g.add(mesh(new THREE.TorusGeometry(0.088, 0.018, 6, 16), orange, { x: s * 0.1, y: 0.62, rx: Math.PI / 2, cast: false }));
    g.add(mesh(box(0.12, 0.1, 0.2), navy, { x: s * 0.1, y: 0.28, z: 0.03 }));
    // 手臂垂着
    g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.36, 6, 12), suit, { x: s * 0.26, y: 1.18, rz: s * 0.12 }));
    g.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), orange, { x: s * 0.3, y: 0.92 }));
  }
  // 头盔：白色外壳 + 金色面罩
  const helm = group(0, 1.66, 0.02);
  helm.add(mesh(new THREE.SphereGeometry(0.17, 24, 18), suit));
  const visor = mesh(new THREE.SphereGeometry(0.172, 24, 16, Math.PI / 2 - 0.9, 1.8, 0.75, 1.1), std('#e8b030', { roughness: 0.12, metalness: 0.9 }), { ry: 0, cast: false });
  helm.add(visor);
  g.add(helm);
  g.add(mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 24), orange, { y: 1.52, rx: Math.PI / 2 }));
  g.add(sign(['EVA', '舱外宇航服'], 0.36, 0.1, { y: 2.0, z: -0.22 }));
  return g;
}

// ---------------- 驾驶舱（洗手间东半边）----------------
function makeCockpit(WR) {
  const g = new THREE.Group();
  const panelM = panel('#8c7033', { seed: 9 }), navy = std('#243452', { roughness: 0.5 }), dark = std('#1a2238', { roughness: 0.5 }), orange = std('#ff8a3d', { roughness: 0.5 });
  // 仪表台：沿后墙，从隔间墙一直到东墙，舷窗下面
  const dz = WR.z1 - 0.2;
  g.add(mesh(box(2.3, 0.78, 0.36), panelM, { x: 0.6, y: 0.39, z: dz }));
  const top = group(0.6, 0.83, dz - 0.05); top.rotation.x = -0.45;
  top.add(mesh(box(2.3, 0.05, 0.42), navy));
  const nav = canvasTex(320, 200, (x) => {}); drawNav(nav.canvas, 0); nav.tex.needsUpdate = true;
  top.add(screenMesh(0.46, 0.29, nav.tex, { y: 0.03, rx: -Math.PI / 2, x: 0.05 }));
  const sys = canvasTex(320, 180, () => {});
  top.add(screenMesh(0.4, 0.23, sys.tex, { y: 0.03, rx: -Math.PI / 2, x: 0.65 }));
  // 一排拨动开关、按钮、推力杆
  for (let i = 0; i < 12; i++) top.add(mesh(box(0.02, 0.03, 0.015), std(i % 3 ? '#f4f7fb' : '#ffd23f'), { x: -0.95 + i * 0.05, y: 0.04, z: 0.1, rx: 0.4, cast: false }));
  const btnCols = ['#ff4a5a', '#8fffc0', '#7fe8ff', '#ffd23f'];
  for (let i = 0; i < 10; i++) top.add(mesh(cyl(0.014, 0.014, 0.012, 10), glow(btnCols[i % 4]), { x: -0.95 + (i % 5) * 0.06, y: 0.03, z: -0.1 + Math.floor(i / 5) * 0.06, cast: false }));
  for (let i = 0; i < 2; i++) { const lv = group(0.98 + i * 0.07, 0.03, -0.02); lv.add(mesh(box(0.012, 0.14, 0.012), std('#d8dde6', { metalness: 0.7, roughness: 0.3 }), { y: 0.07, rx: -0.3 })); lv.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), orange, { y: 0.14, z: -0.04 })); top.add(lv); }
  g.add(top);
  // 驾驶座（面朝舷窗）
  const seat = group(0.3, 0, 5.35);
  seat.add(mesh(cyl(0.06, 0.12, 0.34, 16), std('#8d9bb0', { metalness: 0.5, roughness: 0.35 }), { y: 0.17 }));
  seat.add(mesh(box(0.5, 0.1, 0.5), dark, { y: 0.4 }));
  const back = group(0, 0.45, -0.24); back.rotation.x = -0.18;
  back.add(mesh(box(0.5, 0.72, 0.1), dark, { y: 0.36 }));
  back.add(mesh(box(0.28, 0.16, 0.1), dark, { y: 0.82 }));
  for (const s of [-1, 1]) back.add(mesh(box(0.04, 0.6, 0.012), orange, { x: s * 0.12, y: 0.4, z: 0.056, cast: false }));
  seat.add(back);
  for (const s of [-1, 1]) {
    seat.add(mesh(box(0.06, 0.06, 0.4), navy, { x: s * 0.28, y: 0.62 }));
    seat.add(mesh(box(0.04, 0.18, 0.04), navy, { x: s * 0.28, y: 0.52, z: -0.12 }));
  }
  // 右手边的操纵杆
  seat.add(mesh(cyl(0.012, 0.012, 0.16, 8), std('#d8dde6', { metalness: 0.7, roughness: 0.3 }), { x: 0.28, y: 0.73, z: 0.12 }));
  seat.add(mesh(new THREE.CapsuleGeometry(0.02, 0.05, 4, 10), std('#1a2238'), { x: 0.28, y: 0.83, z: 0.12 }));
  seat.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), glow('#ff4a5a'), { x: 0.28, y: 0.87, z: 0.13, cast: false }));
  g.add(seat);
  // 东墙上的开关面板
  const swTex = TS.genFaceplate(7, { W: 512, H: 340, base: '#3a3e3b' });
  g.add(mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.55, metalness: 0.2 }), { x: WR.x1 - 0.012, y: 1.9, z: 5.5, ry: -Math.PI / 2, cast: false }));
  // 饮水机（原来水桶的位置）：漏水了——大水球就是从这儿漏出来的
  const disp = group(1.6, 0, 5.16);
  disp.add(mesh(box(0.34, 1.05, 0.34), panel('#b9c3d2', { seed: 10 }), { y: 0.52 }));
  disp.add(mesh(cyl(0.12, 0.12, 0.4, 18), new THREE.MeshStandardMaterial({ color: '#9fb4b8', transparent: true, opacity: 0.38, roughness: 0.08 }), { y: 1.28 }));
  disp.add(mesh(cyl(0.13, 0.13, 0.04, 18), navy, { y: 1.08 }));
  disp.add(mesh(cyl(0.012, 0.012, 0.08, 8), std('#d8dde6', { metalness: 0.7 }), { x: -0.2, y: 0.8, rz: Math.PI / 2 }));
  disp.add(sign(['H₂O', '饮用水 · 漏水中！'], 0.3, 0.12, { x: -0.171, y: 0.55, ry: -Math.PI / 2 }, { fg: '#2e8ad8', accent: '#ff4a5a' }));
  g.add(disp);
  g.add(sign(['COCKPIT', '驾驶舱'], 0.44, 0.12, { x: 1.0, y: 2.35, z: WR.z1 - 0.012, ry: Math.PI }));
  return { group: g, seat, dispenser: disp, dash: top, sysScreen: sys };
}

// ---------------- 储藏室（原来的厕所隔间）+ 货柜 G ----------------
function makeStorage(WR, CUB) {
  const g = new THREE.Group();
  const frame = std('#8d9bb0', { roughness: 0.35, metalness: 0.5 }), navy = std('#243452', { roughness: 0.5 });
  // 靠西墙的货架
  const rx0 = WR.x0 + 0.02, rx1 = WR.x0 + 0.4, rz0 = 4.78, rz1 = 5.7;
  for (const [x, z] of [[rx0 + 0.02, rz0], [rx1 - 0.02, rz0], [rx0 + 0.02, rz1], [rx1 - 0.02, rz1]]) g.add(mesh(box(0.03, 2.3, 0.03), frame, { x, y: 1.15, z }));
  const r = mulberry32(91);
  const cols = ['#eef2f7', '#ff8a3d', '#2ec4c9', '#ffd23f', '#dfe5ee'];
  for (const y of [0.05, 0.6, 1.15, 1.7, 2.25]) {
    g.add(mesh(box(0.38, 0.03, 0.94), frame, { x: (rx0 + rx1) / 2, y, z: (rz0 + rz1) / 2 }));
    if (y > 2) continue;
    let z = rz0 + 0.05;
    while (z < rz1 - 0.15) { const w = 0.16 + r() * 0.16, h = 0.2 + r() * 0.25; g.add(mesh(box(0.3, h, w), std(cols[Math.floor(r() * cols.length)], { roughness: 0.5 }), { x: (rx0 + rx1) / 2, y: y + 0.015 + h / 2, z: z + w / 2 })); z += w + 0.03; }
  }
  g.add(mesh(new THREE.PlaneGeometry(0.4, 0.45), new THREE.MeshStandardMaterial({ map: TS.genCargoNet(), transparent: true, roughness: 0.8, side: THREE.DoubleSide }), { x: (rx0 + rx1) / 2 + 0.2, y: 1.4, z: (rz0 + rz1) / 2, ry: Math.PI / 2, cast: false }));
  // 隔间门上的牌子
  g.add(sign(['STORAGE', '储藏室'], 0.36, 0.1, { x: CUB.x + 0.025, y: 2.2, z: (CUB.dz0 + CUB.dz1) / 2, ry: Math.PI / 2 }));
  // 货柜 G：贴着南墙，对开门
  const L = group(-1.05, 0, WR.z1 - 0.22);
  const w = 0.78, h = 1.9, d = 0.42;
  const shell = panel('#dfe5ee', { seed: 11 });
  L.add(mesh(box(w, 0.06, d), shell, { y: 0.03 }));
  L.add(mesh(box(w, 0.06, d), shell, { y: h - 0.03 }));
  for (const s of [-1, 1]) L.add(mesh(box(0.04, h, d), shell, { x: s * (w / 2 - 0.02), y: h / 2 }));
  L.add(mesh(box(w, h, 0.03), navy, { y: h / 2, z: d / 2 - 0.015 }));
  // 里面：约束装置的底座
  L.add(mesh(cyl(0.16, 0.2, 0.52, 24), std('#b9c3d2', { roughness: 0.35, metalness: 0.4 }), { y: 0.3 }));
  const hz = TX.makeCanvas(128, 32), hzc = hz.getContext('2d');
  hzc.fillStyle = TS.SP.yellow; hzc.fillRect(0, 0, 128, 32); hzc.fillStyle = TS.SP.ink;
  for (let x = -32; x < 160; x += 32) { hzc.beginPath(); hzc.moveTo(x, 32); hzc.lineTo(x + 16, 32); hzc.lineTo(x + 32, 0); hzc.lineTo(x + 16, 0); hzc.fill(); }
  const hzT = TX.toTex(hz); hzT.repeat.set(3, 1);
  L.add(mesh(cyl(0.205, 0.205, 0.06, 24, true), new THREE.MeshStandardMaterial({ map: hzT, roughness: 0.6, side: THREE.DoubleSide }), { y: 0.5, cast: false }));
  // 约束球：玻璃球 + 三个会转的万向环
  const core = group(0, 0.95, 0.02);
  const glass = mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshStandardMaterial({ color: '#a9b6b6', transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.2, depthWrite: false }), { cast: false });
  glass.renderOrder = 7; glass.userData.noOutline = true;
  core.add(glass);
  const rings = [];
  const ringM = [std('#ff8a3d', { roughness: 0.35 }), std('#d8dde6', { roughness: 0.3, metalness: 0.6 }), std('#2ec4c9', { roughness: 0.35 })];
  for (let i = 0; i < 3; i++) { const rg = mesh(new THREE.TorusGeometry(0.25 + i * 0.035, 0.012, 8, 48), ringM[i]); rg.rotation.set(i * 0.9, i * 0.6, 0); core.add(rg); rings.push(rg); }
  L.add(core);
  L.add(rod(V(0, 0.55, 0), V(0, 0.72, 0), 0.02, frame, 8));
  // 控制杆（就是它被不小心碰到了）
  const lever = group(0.26, 0.62, 0.12);
  lever.add(mesh(box(0.08, 0.1, 0.06), navy));
  const stick = group(0, 0.04, 0); stick.rotation.x = -0.5;
  stick.add(mesh(cyl(0.01, 0.01, 0.16, 8), std('#d8dde6', { metalness: 0.7, roughness: 0.3 }), { y: 0.08 }));
  stick.add(mesh(new THREE.SphereGeometry(0.025, 12, 8), std('#ff4a5a', { roughness: 0.3 }), { y: 0.16 }));
  lever.add(stick);
  L.add(lever);
  L.add(sign(['GARGANTUA', '微型奇点约束装置 · 严禁触碰'], 0.56, 0.15, { y: 2.06, z: d / 2 - 0.02, ry: Math.PI }, { accent: '#ff4a5a' }));
  // 对开门（门轴在两侧，往外开）
  const doors = [];
  for (const s of [-1, 1]) {
    const pv = group(s * (w / 2), 0, -d / 2); L.add(pv);
    const leaf = mesh(box(w / 2 - 0.005, h - 0.02, 0.03), std('#eef2f7', { roughness: 0.4 }), { x: -s * (w / 4), y: h / 2, z: -0.015 });
    pv.add(leaf);
    pv.add(mesh(box(0.02, 0.2, 0.03), std('#ff8a3d'), { x: -s * (w / 2 - 0.06), y: 1.0, z: -0.04 }));
    if (s < 0) pv.add(sign(['G'], 0.16, 0.16, { x: -s * (w / 4), y: 1.45, z: -0.031, ry: Math.PI }, { fg: '#ff4a5a' }));
    else pv.add(sign(['⚠', '勿动'], 0.16, 0.16, { x: -s * (w / 4), y: 1.45, z: -0.031, ry: Math.PI }, { fg: '#ff4a5a' }));
    doors.push({ pivot: pv, s });
  }
  // 货柜门朝北（面向储藏室门口）
  g.add(L);
  return { group: g, locker: L, doors, core, rings, glass, lever: stick, bhPos: V(-1.05, 0.95, WR.z1 - 0.2), rack: { x0: rx0, x1: rx1, z0: rz0, z1: rz1 } };
}

// ================= 入口：把宿舍的家具整片换成舱内设备 =================
export function buildSpaceGear(ctx, P) {
  const { refs, mark, block, LAYOUT } = ctx;
  const { WR, CUB } = LAYOUT;
  // 1) 收起宿舍的床、书架、书桌、窗前书桌、地上的杂物、洗手间的洁具
  const S = refs.sections, keep = new Set([refs.helmet, refs.bin, refs.suitcase, refs.interact.box350, refs.basket, refs.acNote, refs.batteries]);
  for (const k of ['sw', 'west', 'eastS', 'desks', 'eastN', 'far', 'floor']) for (const o of S[k] || []) if (!keep.has(o)) o.visible = false;
  for (const k of ['sink', 'toilet', 'wcMisc']) for (const o of refs.wcSections[k] || []) o.visible = false;
  // 2) 休眠舱：西边是 {A}、{B}，东边是我（舱盖开着）和 {C}
  const frost = genFrost(3);
  const pods = [
    { id: 'bedW1', who: 0, x: -1.325, z: 0.21, side: -1, code: 'W-01' },
    { id: 'bedW2', who: 1, x: -1.325, z: -2.34, side: -1, code: 'W-02' },
    { id: 'bedE2', who: 2, x: 1.325, z: -2.34, side: 1, code: 'E-02' },
    { id: 'bedE1', who: -1, x: 1.325, z: 1.81, side: 1, code: 'E-01', open: true },
  ].map((d, i) => {
    const p = makePod({ side: d.side, open: d.open, frost, seed: i });
    compact(p.group, [p.fan, p.hinge, ...p.leds]); // 静态的部分合批（风扇会转、指示灯会闪、舱盖是半透明的）
    p.group.position.set(d.x, 0, d.z);
    P(p.group); mark(d.id, p.group);
    p.group.updateMatrixWorld(true);
    return { ...d, ...p, mistW: p.group.localToWorld(V(0, 0.95, 0)) };
  });
  // 3) 资料库
  const archive = makeArchive();
  // 书架：会被推动 / 抽走的那一层书、索引卡、背板、松紧带都不合并
  compact(archive.group, [archive.target.group, archive.card, archive.back, ...archive.straps, ...archive.books.filter((b) => b.shelf === archive.level).map((b) => b.group)]);
  P(archive.group); mark('shelf', archive.group); mark('gBook', archive.target.group); mark('indexCard', archive.card);
  // 4) 信息接收站、生命维持、观测台、氧气瓶架、补给货箱、厨房、宇航服
  const station = makeStation(); compact(station.group, [station.dish]); P(station.group); mark('station', station.group);
  const life = makeLifeSupport(); compact(life.group); P(life.group); mark('monitor2', life.group);
  const obs = makeObservatory(); compact(obs.telescope); compact(obs.group, [obs.telescope]); P(obs.group); mark('farDesks', obs.group); mark('telescope', obs.telescope);
  const o2 = makeO2Rack(); compact(o2); P(o2); mark('shoeRack', o2);
  const crates = makeCrates(); compact(crates); P(crates); mark('storageBox', crates);
  const galley = makeGalley(); compact(galley); P(galley); mark('blackTable', galley);
  const suit = makeEVASuit(); compact(suit); P(suit); mark('foldTable', suit);
  // 5) 洗手间 → 驾驶舱 + 储藏室
  const cockpit = makeCockpit(WR);
  for (const part of [cockpit.dash, cockpit.seat, cockpit.dispenser]) compact(part);
  compact(cockpit.group, [cockpit.dash, cockpit.seat, cockpit.dispenser]);
  P(cockpit.group);
  mark('dashboard', cockpit.dash); mark('pilotSeat', cockpit.seat); mark('dispenser', cockpit.dispenser);
  const storage = makeStorage(WR, CUB);
  compact(storage.locker, [...storage.doors.map((d) => d.pivot), storage.core, storage.lever.parent]);
  compact(storage.group, [storage.locker]);
  P(storage.group); mark('storageRack', storage.group); mark('lockerG', storage.locker); mark('gargantua', storage.core); mark('gargantua', storage.lever.parent);
  block(-0.58, 0.55, WR.z1 - 0.4, WR.z1, '', 0.9);
  block(0.04, 0.56, 5.08, 5.62, 'seat');
  block(WR.x0, storage.rack.x1 + 0.02, storage.rack.z0 - 0.02, storage.rack.z1 + 0.02, '', 2.3);
  block(-1.46, -0.64, WR.z1 - 0.44, WR.z1, 'lockerG', 1.9);
  // 6) 货柜 G 里的黑洞（平时只有黄豆大）
  const bh = makeBlackHole();
  bh.group.position.copy(storage.bhPos);
  bh.radius = 0.032;
  P(bh.group);
  return { pods, archive, station, life, obs, cockpit, storage, blackHole: bh };
}
