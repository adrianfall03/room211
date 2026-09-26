// 第五章贴图：太空舱 211 —— 写实电影感（参考《太空孤航者》那种用旧了的空间站）
//   舱壁：刷着青绿色漆的铝面板，面板缝、螺丝、快拆扣、魔术贴、模板字标签、手摸出来的脏印；
//   天花板：米黄色面板 + 灯板；甲板：深灰绿的防滑板；货包：米白色 Nomex 帆布；
//   窗外：写实的地球（晨昏线、海面反光、大气层边缘、钠灯色的城市灯光）、月亮、太阳；
//   屏幕：荧光绿 / 琥珀色的单色显示器
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb } from './textures.js';
import { mulberry32, clamp, smoothstep } from './util.js';

// 调色板：旧的键名保留（别的文件还在用），值全部换成写实的颜色
export const SP = {
  white: '#d9d5c9', panel: '#c9c3b2', gray: '#8b8f8c', steel: '#7c8286', navy: '#1f2a2c', ink: '#161a19',
  orange: '#b8612f', teal: '#3f6b66', cyan: '#8fb3ab', yellow: '#c29b2e', red: '#9e3129',
  wall: '#3d6863', beige: '#c8bea5', ochre: '#b08a30', amber: '#ffb04a', phosphor: '#8cf0a4', dim: '#0a0e0c',
};
const STENCIL = '"DIN Condensed","Arial Narrow","Roboto Condensed","PingFang SC",sans-serif';
const MONO = '"SF Mono","Menlo","Consolas","PingFang SC",monospace';

const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
function hazard(ctx, x, y, w, h, step = 24) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = SP.yellow; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1b1c1a';
  for (let k = -h; k < w + h; k += step * 2) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + step, y + h); ctx.lineTo(x + k + step + h, y); ctx.lineTo(x + k + h, y); ctx.fill(); }
  ctx.restore();
}

// ---------- 通用的"做旧"工具 ----------
// 一张可以平铺的灰度噪声（用来给整张贴图叠一层斑驳）
const _noiseCache = new Map();
function noiseTile(seed = 1, S = 256, scale = 8, oct = 4) {
  const key = `${seed},${S},${scale},${oct}`;
  if (_noiseCache.has(key)) return _noiseCache.get(key);
  const c = makeCanvas(S, S), N = createNoise(seed);
  pixels(c, (x, y, d, i) => { const v = Math.round(N.fbm((x / S) * scale, (y / S) * scale, oct, scale, scale) * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
  _noiseCache.set(key, c);
  return c;
}
function overlay(ctx, W, H, tile, alpha, op = 'overlay', scale = 1) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op;
  const p = ctx.createPattern(tile, 'repeat');
  if (scale !== 1 && p.setTransform) p.setTransform(new DOMMatrix().scale(scale));
  ctx.fillStyle = p; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
// 脏印：一团团半透明的深色斑
function smudges(ctx, rnd, n, x0, y0, w, h, { color = '20,24,22', a = 0.08, r0 = 10, r1 = 60 } = {}) {
  for (let k = 0; k < n; k++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, r = r0 + rnd() * (r1 - r0);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${a * (0.5 + rnd())})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.8), rnd() * 3, 0, 6.28); ctx.fill();
  }
}
// 划痕：细细的亮线（漆被刮掉露出金属）
function scratches(ctx, rnd, n, x0, y0, w, h, { color = '210,214,206', a = 0.35, len = 40 } = {}) {
  ctx.save(); ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, ang = rnd() * Math.PI, l = len * (0.3 + rnd());
    ctx.strokeStyle = `rgba(${color},${a * (0.3 + rnd() * 0.7)})`; ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(ang) * l * 0.5 + (rnd() - 0.5) * 6, y + Math.sin(ang) * l * 0.5, x + Math.cos(ang) * l, y + Math.sin(ang) * l); ctx.stroke();
  }
  ctx.restore();
}
// 十字槽螺丝（颜色图 + 高度图各画一份）
function screw(c, h, x, y, r = 7) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#b9bcb6'); g.addColorStop(1, '#5c615e');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill();
  c.strokeStyle = 'rgba(20,22,20,0.8)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(x - r * 0.6, y); c.lineTo(x + r * 0.6, y); c.moveTo(x, y - r * 0.6); c.lineTo(x, y + r * 0.6); c.stroke();
  if (h) { h.fillStyle = '#d0d0d0'; h.beginPath(); h.arc(x, y, r, 0, 6.28); h.fill(); h.fillStyle = '#909090'; h.fillRect(x - r * 0.6, y - 1, r * 1.2, 2); h.fillRect(x - 1, y - r * 0.6, 2, r * 1.2); }
}
// 模板字 / 小标签
function stencil(ctx, text, x, y, size, color = 'rgba(230,228,215,0.75)', align = 'left', font = STENCIL) {
  ctx.fillStyle = color; ctx.font = `bold ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y);
}
function placard(ctx, rnd, x, y, w, h, lines, { bg = '#dcd8cb', fg = '#1b1d1b' } = {}) {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => { ctx.font = `bold ${i ? Math.round(h * 0.16) : Math.round(h * 0.26)}px ${STENCIL}`; ctx.fillText(l, x + 8, y + 7 + (i ? h * 0.36 + (i - 1) * h * 0.2 : 0)); });
  smudges(ctx, rnd, 3, x, y, w, h, { a: 0.12, r0: 4, r1: w * 0.4 });
}
// 魔术贴：深灰毛面
function velcro(ctx, rh, x, y, w, h) {
  ctx.fillStyle = '#3a3d3a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let k = 0; k < (w * h) / 6; k++) ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 1);
  if (rh) { rh.fillStyle = '#f0f0f0'; rh.fillRect(x, y, w, h); }
}

// ---------------- 甲板：深灰绿色的防滑板，边角磨掉了漆 ----------------
export function genDeck() {
  const S = 1024, col = makeCanvas(S, S), hgt = makeCanvas(S, S), rou = makeCanvas(S, S);
  const c = col.getContext('2d'), hx = hgt.getContext('2d'), rx = rou.getContext('2d');
  c.fillStyle = '#3a4340'; c.fillRect(0, 0, S, S);
  hx.fillStyle = '#fff'; hx.fillRect(0, 0, S, S);
  rx.fillStyle = '#b4b4b4'; rx.fillRect(0, 0, S, S);
  const n = 2, p = S / n, rnd = mulberry32(4401);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * p, y = j * p;
    c.fillStyle = ['#3c4642', '#374140', '#3e4744', '#39423f'][(i + j * 2) % 4]; c.fillRect(x + 6, y + 6, p - 12, p - 12);
    // 防滑纹：一排排小凸点
    c.fillStyle = 'rgba(0,0,0,0.18)'; hx.fillStyle = '#e6e6e6';
    for (let yy = y + 36; yy < y + p - 36; yy += 18) for (let xx = x + 36 + ((yy / 18) % 2) * 9; xx < x + p - 36; xx += 18) { c.fillRect(xx, yy, 5, 5); hx.fillRect(xx, yy, 5, 5); }
    // 边上一圈磨亮的金属
    c.strokeStyle = 'rgba(160,166,160,0.35)'; c.lineWidth = 3; c.strokeRect(x + 12, y + 12, p - 24, p - 24);
    for (const [bx, by] of [[x + 28, y + 28], [x + p - 28, y + 28], [x + 28, y + p - 28], [x + p - 28, y + p - 28]]) screw(c, hx, bx, by, 8);
    hx.strokeStyle = '#000'; hx.lineWidth = 12; hx.strokeRect(x + 2, y + 2, p - 4, p - 4);
    // 旧的黄色警示漆（大半被踩掉了）
    if (rnd() < 0.5) { c.save(); c.globalAlpha = 0.55; hazard(c, x + p * 0.1, y + p * 0.86, p * 0.8, 20, 18); c.restore(); }
  }
  c.strokeStyle = '#1c2220'; c.lineWidth = 10;
  for (let k = 0; k <= n; k++) { c.beginPath(); c.moveTo(k * p, 0); c.lineTo(k * p, S); c.stroke(); c.beginPath(); c.moveTo(0, k * p); c.lineTo(S, k * p); c.stroke(); }
  stencil(c, 'D-211', p * 0.12, p * 0.3, 60, 'rgba(200,196,178,0.28)');
  overlay(c, S, S, noiseTile(4403, 256, 6), 0.35, 'overlay', 2);
  smudges(c, rnd, 50, 0, 0, S, S, { a: 0.12, r0: 20, r1: 120 });
  scratches(c, rnd, 160, 0, 0, S, S, { a: 0.25, len: 60 });
  overlay(rx, S, S, noiseTile(4404, 256, 10), 0.4, 'overlay', 2);
  return { map: toTex(col), normalMap: toTex(normalFromHeight(hgt, 2.2), { data: true }), roughnessMap: toTex(rou, { data: true }) };
}
export function genDeckDirt(W = 256, H = 512) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  smudges(ctx, mulberry32(4402), 26, 0, 0, W, H, { color: '12,14,12', a: 0.1, r0: 8, r1: 40 });
  return toTex(c);
}

// ---------------- 舱壁：青绿色漆的铝面板 ----------------
//   贴图宽 2m、高 3m（和墙的世界 UV 对应），返回颜色 / 法线 / 粗糙度三张
// 两套漆：'teal' 乘员舱的青绿色 / 'ochre' 驾驶舱的黄褐色（参考电影里那节被暖光照着的黄色舱段）
const WALL_PAINT = {
  teal: { base: '#3d6863', shades: ['#3d6863', '#416d67', '#3a625d', '#44706a', '#38605b', '#3f6a64'], label: 'NODE 211  ·  CREW QTRS  ·  STBD', scratch: '170,190,182' },
  ochre: { base: '#9a7a36', shades: ['#9a7a36', '#a0803a', '#94742f', '#a4843e', '#8f712e', '#9c7c38'], label: 'FGB 211  ·  FLIGHT DECK', scratch: '220,205,160' },
};
export function genStationWall({ paint = 'teal', seed = 4411 } = {}) {
  const P = WALL_PAINT[paint] || WALL_PAINT.teal;
  const W = 1024, H = 1536, PX = 512; // 每米 512 像素
  const Y = (m) => H - m * PX;
  const col = makeCanvas(W, H), hgt = makeCanvas(W, H), rou = makeCanvas(W, H);
  const c = col.getContext('2d'), hx = hgt.getContext('2d'), rx = rou.getContext('2d');
  const rnd = mulberry32(seed);
  c.fillStyle = P.base; c.fillRect(0, 0, W, H);
  hx.fillStyle = '#fff'; hx.fillRect(0, 0, W, H);
  rx.fillStyle = '#8c8c8c'; rx.fillRect(0, 0, W, H);
  const shades = P.shades;
  const rows = [[0.14, 1.02], [1.02, 1.88], [1.88, 2.62]];
  let si = 0;
  for (const [a, b] of rows) for (let i = 0; i < 2; i++) {
    const x = i * W / 2 + 5, y = Y(b) + 5, w = W / 2 - 10, h = Y(a) - Y(b) - 10;
    c.fillStyle = shades[si++ % shades.length]; c.fillRect(x, y, w, h);
    // 面板边：上 / 左一道亮边、下 / 右一道暗边（压出来的折边）
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y, w, 4); c.fillRect(x, y, 4, h);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + h - 4, w, 4); c.fillRect(x + w - 4, y, 4, h);
    hx.fillStyle = '#000'; hx.fillRect(x - 5, y - 5, w + 10, 5); hx.fillRect(x - 5, y + h, w + 10, 5); hx.fillRect(x - 5, y, 5, h); hx.fillRect(x + w, y, 5, h);
    for (const [sx, sy] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16], [x + w / 2, y + 16], [x + w / 2, y + h - 16]]) screw(c, hx, sx, sy, 6);
    const roll = rnd();
    if (roll < 0.35) {
      // 检修口：一扇小门 + 两个快拆扣
      const dw = w * (0.35 + rnd() * 0.2), dh = h * (0.3 + rnd() * 0.2), dx = x + w * (0.1 + rnd() * 0.4), dy = y + h * (0.15 + rnd() * 0.4);
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 3; c.strokeRect(dx, dy, dw, dh);
      hx.strokeStyle = '#303030'; hx.lineWidth = 3; hx.strokeRect(dx, dy, dw, dh);
      for (const fy of [dy + dh * 0.25, dy + dh * 0.75]) { c.fillStyle = '#1e2321'; c.beginPath(); c.arc(dx + dw - 14, fy, 8, 0, 6.28); c.fill(); c.fillStyle = '#6b716d'; c.fillRect(dx + dw - 20, fy - 1.5, 12, 3); }
      placard(c, rnd, dx + 10, dy + 10, Math.min(150, dw - 30), 46, [['LAB1O3', 'AFT-02', 'OVHD-4', 'STBD-1'][Math.floor(rnd() * 4)], 'DO NOT STOW']);
    } else if (roll < 0.6) {
      // 魔术贴 + 一张贴着的纸（检查单）
      for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) velcro(c, rx, x + 30 + rnd() * (w - 90), y + 30 + rnd() * (h - 80), 26 + rnd() * 30, 18 + rnd() * 18);
      if (rnd() < 0.6) { const px = x + w * (0.4 + rnd() * 0.3), py = y + h * (0.2 + rnd() * 0.3); c.save(); c.translate(px, py); c.rotate((rnd() - 0.5) * 0.08); c.fillStyle = '#e7e3d6'; c.fillRect(0, 0, 110, 140); c.fillStyle = 'rgba(30,30,30,0.55)'; for (let l = 0; l < 11; l++) c.fillRect(10, 14 + l * 11, 60 + rnd() * 30, 3); c.restore(); }
    } else if (roll < 0.75) {
      // 一组插口
      const px = x + w * (0.25 + rnd() * 0.4), py = y + h * (0.3 + rnd() * 0.4);
      c.fillStyle = '#262b29'; rrect(c, px, py, 150, 64, 6); c.fill();
      for (let k = 0; k < 4; k++) { c.fillStyle = '#9da29c'; c.beginPath(); c.arc(px + 22 + k * 36, py + 32, 11, 0, 6.28); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(px + 22 + k * 36, py + 32, 6, 0, 6.28); c.fill(); }
      stencil(c, 'J1   J2   J3   J4', px + 10, py - 6, 14, 'rgba(225,225,210,0.7)', 'left', MONO);
    }
  }
  // 踢脚：深色金属，全是鞋印和刮痕
  c.fillStyle = '#29302e'; c.fillRect(0, Y(0.14), W, H - Y(0.14));
  scratches(c, rnd, 60, 0, Y(0.14), W, H - Y(0.14), { a: 0.3, len: 30 });
  // 顶上的设备带：米色，一排排通风缝
  c.fillStyle = '#b3aa92'; c.fillRect(0, 0, W, Y(2.62));
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, Y(2.62) - 6, W, 6);
  for (let x = 40; x < W - 180; x += 256) { c.fillStyle = '#8f8772'; rrect(c, x, Y(2.92), 180, Y(2.7) - Y(2.92), 6); c.fill(); c.fillStyle = '#2b2a25'; for (let k = 0; k < 9; k++) c.fillRect(x + 14 + k * 18, Y(2.89), 8, Y(2.73) - Y(2.89)); }
  stencil(c, P.label, 36, Y(2.5), 30, 'rgba(225,222,205,0.55)');
  stencil(c, '▲ HANDRAIL', W * 0.64, Y(2.4), 24, 'rgba(220,190,110,0.6)');
  // 整面墙：漆面斑驳、手摸出来的脏印（腰到头的高度最多）、刮痕
  overlay(c, W, H, noiseTile(4412, 256, 5), 0.3, 'overlay', 2);
  overlay(c, W, H, noiseTile(4413, 256, 16, 3), 0.12, 'multiply', 1);
  smudges(c, rnd, 70, 0, Y(1.9), W, Y(0.8) - Y(1.9), { a: 0.1, r0: 10, r1: 70 });
  smudges(c, rnd, 30, 0, 0, W, H, { a: 0.08, r0: 30, r1: 160 });
  scratches(c, rnd, 140, 0, Y(2.6), W, Y(0.15) - Y(2.6), { color: P.scratch, a: 0.28, len: 50 });
  // 粗糙度：脏的地方更糙，边角磨亮
  overlay(rx, W, H, noiseTile(4414, 256, 8), 0.5, 'overlay', 2);
  return { map: toTex(col), normalMap: toTex(normalFromHeight(hgt, 1.6), { data: true }), roughnessMap: toTex(rou, { data: true }) };
}

// ---------------- 天花板：米黄色面板 + 灯板（自发光贴图）----------------
export function genCeilingSpace() {
  const W = 1024, H = 2048;
  const col = makeCanvas(W, H), em = makeCanvas(W / 4, H / 4);
  const c = col.getContext('2d'), e = em.getContext('2d');
  const rnd = mulberry32(4421);
  c.fillStyle = '#bdb49c'; c.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W / 4, H / 4);
  const nx = 4, ny = 9, pw = W / nx, ph = H / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = i * pw + 4, y = j * ph + 4, w = pw - 8, h = ph - 8;
    c.fillStyle = ['#c3baa2', '#bfb69d', '#c6bda5', '#b9b098'][(i * 3 + j) % 4]; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, y + h - 3, w, 3);
    screw(c, null, x + 12, y + 12, 5); screw(c, null, x + w - 12, y + h - 12, 5);
    const r = rnd();
    if (r < 0.18) { c.fillStyle = '#2d302d'; for (let k = 0; k < 10; k++) c.fillRect(x + 20, y + 20 + k * (h - 40) / 10, w - 40, (h - 40) / 22); }
    else if (r < 0.3) { c.fillStyle = '#34372f'; rrect(c, x + w * 0.2, y + h * 0.25, w * 0.6, h * 0.5, 6); c.fill(); for (let k = 0; k < 6; k++) { c.fillStyle = '#b5b1a4'; c.fillRect(x + w * 0.25 + k * w * 0.08, y + h * 0.4, 8, 18); } }
    else if (r < 0.45) placard(c, rnd, x + 16, y + h - 64, 140, 44, [['OVHD', 'ZENITH', 'DECK'][Math.floor(rnd() * 3)] + '-' + (10 + Math.floor(rnd() * 80)), 'NO STOWAGE']);
  }
  // 灯板：沿中线两排（和吊着的灯箱对齐，只是贴图里的底色）
  for (let j = 0; j < ny; j += 2) {
    const y = j * ph + ph * 0.3;
    c.fillStyle = '#e8e6dc'; c.fillRect(W * 0.38, y, W * 0.24, ph * 0.4);
    e.fillStyle = '#d8e0d8'; e.fillRect((W * 0.38) / 4, y / 4, (W * 0.24) / 4, (ph * 0.4) / 4);
  }
  overlay(c, W, H, noiseTile(4422, 256, 6), 0.25, 'overlay', 2);
  smudges(c, rnd, 40, 0, 0, W, H, { a: 0.08, r0: 20, r1: 120 });
  return { map: toTex(col), emissiveMap: toTex(em) };
}

// 刷漆的金属面板（代替木头的地方）
export function genPanel({ base = SP.panel, line = null, seed = 1, S = 256, stripe = null } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(seed * 131);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line || 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(3, 3, S - 6, S - 6);
  for (const [x, y] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14]]) screw(ctx, null, x, y, 4);
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(0, S * 0.8, S, S * 0.07); }
  overlay(ctx, S, S, noiseTile(seed * 7 + 1, 128, 4), 0.3, 'overlay');
  smudges(ctx, rnd, 6, 0, 0, S, S, { a: 0.12, r0: 10, r1: 60 });
  scratches(ctx, rnd, 14, 0, 0, S, S, { a: 0.25, len: 30 });
  return toTex(c);
}

// 气闸舱门：旧金属门板 + 一圈发黑的警示条 + 模板字
export function genHatchDoor() {
  const W = 512, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(4441);
  ctx.fillStyle = '#6f7571'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.8;
  hazard(ctx, 0, 0, W, 34, 22); hazard(ctx, 0, H - 34, W, 34, 22); hazard(ctx, 0, 0, 26, H, 22); hazard(ctx, W - 26, 0, 26, H, 22);
  ctx.restore();
  ctx.fillStyle = '#626864'; rrect(ctx, 56, 80, W - 112, H - 160, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 5; rrect(ctx, 56, 80, W - 112, H - 160, 22); ctx.stroke();
  for (const [x, y] of [[80, 104], [W - 80, 104], [80, H - 104], [W - 80, H - 104]]) screw(ctx, null, x, y, 9);
  stencil(ctx, '211', W / 2, H * 0.78, 120, 'rgba(225,222,205,0.6)', 'center');
  stencil(ctx, 'AIRLOCK · EQUALIZE BEFORE OPENING', W / 2, H * 0.85, 22, 'rgba(210,90,60,0.8)', 'center');
  placard(ctx, rnd, W * 0.2, H * 0.15, W * 0.6, 70, ['HATCH 1', 'PRESS. CHECK REQUIRED']);
  overlay(ctx, W, H, noiseTile(4442, 256, 6), 0.35, 'overlay');
  smudges(ctx, rnd, 30, 0, 0, W, H, { a: 0.14, r0: 20, r1: 90 });
  scratches(ctx, rnd, 90, 0, 0, W, H, { a: 0.35, len: 50 });
  return toTex(c);
}

// 遮光板 → 多层隔热毯（MLI）：银色 / 淡金色的铝箔，皱巴巴的，一格格绗缝
export function genShutter() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const N = createNoise(4451);
  pixels(c, (x, y, d, i) => {
    const u = x / S, v = y / S;
    const cr = N.fbm(u * 18, v * 18, 4, 18, 18), cr2 = N.fbm(u * 60, v * 60, 2, 60, 60);
    const k = 0.72 + (cr - 0.5) * 0.45 + (cr2 - 0.5) * 0.22;
    d[i] = clamp(k * 215 + 22, 0, 255); d[i + 1] = clamp(k * 210 + 20, 0, 255); d[i + 2] = clamp(k * 196 + 18, 0, 255); d[i + 3] = 255;
  });
  ctx.strokeStyle = 'rgba(40,36,28,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  for (let k = 0; k <= S; k += 128) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(S, k); ctx.stroke(); }
  ctx.setLineDash([]);
  return toTex(c);
}

// 束缚网：黑色织带 + 金属扣
export function genCargoNet() {
  const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#26282a'; ctx.lineWidth = 5;
  for (let k = 0; k <= S; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(S, k); ctx.stroke(); }
  ctx.fillStyle = '#8e928f'; for (let x = 0; x <= S; x += 32) for (let y = 0; y <= S; y += 32) ctx.fillRect(x - 3, y - 3, 6, 6);
  return toTex(c);
}

// 货包（CTB）：米白色 Nomex 帆布 + 包边 + 魔术贴标签
export function genCargoBag({ print = null, seed = 4461 } = {}) {
  const W = 512, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#d3ccb8'; ctx.fillRect(0, 0, W, H);
  // 帆布纹理
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; for (let x = 0; x < W; x += 3) ctx.fillRect(x, 0, 1, H);
  // 包边
  ctx.fillStyle = '#a79f89'; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10); ctx.fillRect(0, 0, 10, H); ctx.fillRect(W - 10, 0, 10, H);
  // 提手织带
  ctx.fillStyle = '#56544c'; ctx.fillRect(W * 0.18, 0, 20, H); ctx.fillRect(W * 0.78, 0, 20, H);
  // 标签窗
  ctx.fillStyle = '#e8e4d8'; ctx.fillRect(W * 0.32, H * 0.22, W * 0.36, H * 0.5);
  ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = 3; ctx.strokeRect(W * 0.32, H * 0.22, W * 0.36, H * 0.5);
  ctx.fillStyle = '#1b1c1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold 38px ${STENCIL}`; ctx.fillText(print ? 'POTABLE H₂O' : 'CTB 1.0', W / 2, H * 0.43);
  ctx.font = `bold 20px ${STENCIL}`; ctx.fillText(print ? `${print} ML POUCH ×24` : 'NODE 211 · CREW PROV.', W / 2, H * 0.56);
  for (let k = 0; k < 26; k++) ctx.fillRect(W * 0.36 + k * 5.2, H * 0.6, k % 3 ? 2 : 3.5, 18); // 条码
  overlay(ctx, W, H, noiseTile(seed + 1, 128, 6), 0.3, 'overlay');
  smudges(ctx, rnd, 10, 0, 0, W, H, { color: '60,52,40', a: 0.12, r0: 10, r1: 60 });
  return toTex(c);
}

// 挂钟 → 任务钟：黑色表盘、白色刻度
export function genMissionClock() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#141615'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2, r0 = S * (k % 5 ? 0.41 : 0.36), r1 = S * 0.44;
    ctx.strokeStyle = k % 5 ? 'rgba(220,220,210,0.55)' : '#e8e6dc'; ctx.lineWidth = k % 5 ? 3 : 9;
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); ctx.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.fillStyle = '#d8d4c6'; ctx.font = `bold 40px ${STENCIL}`; ctx.textAlign = 'center';
  ctx.fillText('GMT', S / 2, S * 0.34); ctx.font = `bold 24px ${STENCIL}`; ctx.fillStyle = '#b8612f'; ctx.fillText('MISSION ELAPSED', S / 2, S * 0.71);
  return toTex(c, { wrap: false });
}

export function genMousepadSpace() {
  const W = 512, H = 384, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#1c1f1e'; ctx.fillRect(0, 0, W, H);
  overlay(ctx, W, H, noiseTile(4431, 128, 8), 0.25, 'overlay');
  stencil(ctx, 'NODE 211', W / 2, H * 0.55, 46, 'rgba(200,196,178,0.35)', 'center');
  return toTex(c, { wrap: false });
}

// 标牌：米白色塑料牌、黑字，第二行是深红色；有点脏
export function genSign(lines, { W = 512, H = 192, bg = '#dcd8cb', fg = '#1b1d1b', accent = '#8e2f25', border = true } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(lines.join('').length * 97 + W);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (border) { ctx.strokeStyle = 'rgba(20,20,18,0.8)'; ctx.lineWidth = Math.max(4, H * 0.035); ctx.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? fg : accent;
    ctx.font = `bold ${i === 0 ? Math.round(H * (n > 1 ? 0.36 : 0.5)) : Math.round(H * 0.2)}px ${STENCIL}`;
    ctx.fillText(l, W / 2, H * (n > 1 ? (i === 0 ? 0.4 : 0.76) : 0.54));
  });
  for (const [x, y] of [[H * 0.14, H * 0.5], [W - H * 0.14, H * 0.5]]) { ctx.fillStyle = '#7d817c'; ctx.beginPath(); ctx.arc(x, y, H * 0.05, 0, 6.28); ctx.fill(); }
  overlay(ctx, W, H, noiseTile(4436, 128, 5), 0.3, 'overlay');
  smudges(ctx, rnd, 6, 0, 0, W, H, { color: '50,44,34', a: 0.14, r0: 10, r1: H * 0.8 });
  return toTex(c, { wrap: false });
}

// 设备面板：拨动开关、旋钮、指示灯、小标签（墙上那些灰盒子的正面）
export function genFaceplate(seed = 1, { W = 512, H = 256, base = '#3a3e3b' } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(seed * 977 + 5);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(6, 6, W - 12, 4);
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) screw(ctx, null, x, y, 5);
  const cols = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < cols; k++) {
    const x = 34 + k * ((W - 68) / cols), kind = rnd();
    stencil(ctx, ['PWR', 'FAN', 'HTR', 'CO2', 'VLV', 'BUS A', 'BUS B', 'SMK', 'LTG'][Math.floor(rnd() * 9)], x, 44, 16, 'rgba(225,222,205,0.8)', 'left', MONO);
    if (kind < 0.4) {
      // 拨动开关 + 护罩
      ctx.fillStyle = '#1a1c1b'; ctx.fillRect(x + 4, 70, 26, 40);
      ctx.fillStyle = '#b4b6b0'; ctx.fillRect(x + 14, rnd() < 0.5 ? 60 : 90, 6, 26);
      ctx.strokeStyle = 'rgba(200,200,190,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x, 64, 34, 52);
    } else if (kind < 0.75) {
      // 旋钮
      ctx.fillStyle = '#151716'; ctx.beginPath(); ctx.arc(x + 20, 92, 20, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#8b8e89'; ctx.lineWidth = 3; const a = rnd() * 6.28; ctx.beginPath(); ctx.moveTo(x + 20, 92); ctx.lineTo(x + 20 + Math.cos(a) * 16, 92 + Math.sin(a) * 16); ctx.stroke();
      ctx.fillStyle = 'rgba(220,220,210,0.5)'; for (let t = 0; t < 7; t++) { const b = 2.4 + t * 0.7; ctx.fillRect(x + 20 + Math.cos(b) * 26, 92 + Math.sin(b) * 26, 2, 2); }
    } else {
      // 断路器一排
      for (let r = 0; r < 3; r++) { ctx.fillStyle = '#121413'; ctx.fillRect(x + 4, 62 + r * 22, 22, 16); ctx.fillStyle = '#d8d6cc'; ctx.fillRect(x + 11, 64 + r * 22, 8, 10); }
    }
    // 指示灯（颜色画在贴图上，真正发光的是几何体上的小灯）
    ctx.fillStyle = ['#2b3a2c', '#3a2e1c', '#3a1f1c'][Math.floor(rnd() * 3)]; ctx.beginPath(); ctx.arc(x + 17, 140, 6, 0, 6.28); ctx.fill();
  }
  placard(ctx, rnd, W * 0.08, H - 86, W * 0.5, 56, [['ECLSS', 'EPS 2', 'TCS LOOP', 'COMM 3', 'HAB CTRL'][Math.floor(rnd() * 5)] + ' ' + (10 + Math.floor(rnd() * 80)), 'CAUTION: HOT SURFACE']);
  overlay(ctx, W, H, noiseTile(seed + 11, 128, 5), 0.3, 'overlay');
  smudges(ctx, rnd, 8, 0, 0, W, H, { a: 0.15, r0: 10, r1: 70 });
  scratches(ctx, rnd, 20, 0, 0, W, H, { a: 0.3, len: 30 });
  return toTex(c, { wrap: false });
}
// 笔记本电脑屏幕：黑底上的绿 / 白字（空间站里到处都是这种 ThinkPad）
export function drawLaptop(c, t = 0, { title = 'OPS LAN · NODE 211', lines = null } = {}) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#0b0e0d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d2b24'; ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = '#cfe8d6'; ctx.font = `bold 13px ${MONO}`; ctx.textAlign = 'left'; ctx.fillText(title, 8, 15);
  const L = lines || ['> ppO2 ......... 17.9 kPa', '> ppCO2 ........ 0.61 kPa', '> CABIN T ...... 22.4 C', '> FAN 2 ........ NOMINAL', '> ORBIT ........ 408.2 KM', '> LOS IN ....... 04:12', '> CREW ......... 1 / 4'];
  L.forEach((l, i) => { ctx.fillStyle = i === (Math.floor(t * 0.7) % L.length) ? '#ffcf7a' : '#8cf0a4'; ctx.fillText(l, 10, 44 + i * 18); });
  if (Math.sin(t * 5) > 0) { ctx.fillStyle = '#8cf0a4'; ctx.fillRect(10, 44 + L.length * 18 - 10, 8, 12); }
  crtFinish(ctx, W, H, 0.1);
}

// ---------------- 窗外：写实的地球 ----------------
// 颜色是连续的：深海 → 浅海，森林 / 草原 / 荒漠 / 山地 / 冰盖；land 数组给城市灯光用（>0.56 是陆地）
export function genEarthDay(W = 1024, H = 512) {
  const c = makeCanvas(W, H);
  const N = createNoise(4451), N2 = createNoise(4452), N3 = createNoise(4453);
  const land = new Float32Array(W * H);
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const deepO = hexToRgb('#06183a'), midO = hexToRgb('#0c2e62'), shelf = hexToRgb('#1d5a86');
  const forest = hexToRgb('#23391d'), grass = hexToRgb('#4f5a2e'), desert = hexToRgb('#a88a5a'), rock = hexToRgb('#6a5a48'), ice = hexToRgb('#e8ecef');
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H, lat = (0.5 - v) * Math.PI;
    let n = N.fbm(u * 5, v * 2.5, 5, 5, 256);
    n += 0.08 * Math.cos(lat * 2.2);
    land[y * W + x] = n;
    const dry = N2.fbm(u * 7, v * 4, 3, 7, 256) + Math.max(0, 0.18 - Math.abs(Math.abs(lat) - 0.42)) * 1.2;
    const detail = N3.fbm(u * 40, v * 20, 3, 40, 256);
    let col;
    const iceLine = 1.2 + N2.noise(u * 20, 0, 20, 256) * 0.12;
    if (Math.abs(lat) > iceLine) col = mix3(ice, [200, 210, 218], detail * 0.4);
    else if (n > 0.56) {
      const high = smoothstep(0.62, 0.7, n);
      let base = mix3(forest, grass, smoothstep(0.4, 0.7, detail));
      base = mix3(base, desert, smoothstep(0.66, 0.86, dry) * 0.85);
      base = mix3(base, rock, high * 0.55);
      col = mix3(base, [base[0] * 1.15, base[1] * 1.1, base[2] * 1.05], detail - 0.5);
    } else {
      const t = smoothstep(0.44, 0.56, n);
      col = mix3(mix3(deepO, midO, smoothstep(0.3, 0.47, n)), shelf, t * t * 0.8);
    }
    d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255); d[i + 3] = 255;
  });
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, land, W, H };
}
// 云层：柔软的云团和气旋，边缘是渐变的
export function genEarthClouds(W = 1024, H = 512) {
  const c = makeCanvas(W, H);
  const N = createNoise(4461), N2 = createNoise(4462);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H, lat = (0.5 - v) * Math.PI;
    // 纬度方向拉长的云带 + 小尺度的碎云
    const warp = N2.fbm(u * 4, v * 4, 3, 4, 256) * 0.6;
    let n = N.fbm(u * 7 + warp, v * 9, 5, 7, 256) * 0.65 + N.fbm(u * 2.5, v * 10 + warp, 3, 3, 256) * 0.35;
    n += 0.07 * Math.cos(lat * 6);
    const a = smoothstep(0.44, 0.64, n);
    const shade = 225 + smoothstep(0.6, 0.8, n) * 30;
    d[i] = shade; d[i + 1] = shade; d[i + 2] = Math.min(255, shade + 6); d[i + 3] = Math.round(a * 235);
  });
  return toTex(c);
}
// 夜晚的城市灯光：钠灯的橙黄色，沿海岸成片、内陆零星
export function genEarthNight(day, W = 1024, H = 512) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(4471);
  const land = day.land;
  // 城市：先撒一些"城市中心"，再在周围撒一圈圈的小亮点（像真的夜景照片那样成片、带着公路连起来的细线）
  const cities = [];
  for (let k = 0; k < 900; k++) {
    const x = (rnd() * W) | 0, y = (H * 0.15 + rnd() * H * 0.7) | 0;
    const n = land[y * W + x];
    if (n < 0.565 || rnd() > (n < 0.6 ? 1 : 0.4)) continue;
    cities.push([x, y, 1 + rnd() * rnd() * 5]);
  }
  for (const [cx, cy, size] of cities) {
    const pts = Math.round(size * 14);
    for (let k = 0; k < pts; k++) {
      const a = rnd() * 6.28, r = rnd() * rnd() * size * 3.5;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
      ctx.fillStyle = rnd() < 0.25 ? '#ffe6b8' : '#ffa048';
      ctx.globalAlpha = 0.3 + rnd() * 0.6;
      const s = r < size * 0.6 ? 1.5 : 1;
      ctx.fillRect(x, y, s, s);
    }
  }
  ctx.strokeStyle = '#ff9a40'; ctx.lineWidth = 0.6;
  for (let k = 0; k < cities.length; k++) {
    const a = cities[k], b = cities[(k * 7 + 3) % cities.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 60) continue;
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const base = ctx.getImageData(0, 0, W, H);
  const tex = toTex(c); tex.wrapT = THREE.ClampToEdgeWrapping;
  return { canvas: c, tex, base };
}
// 用城市灯光"拼"出一个数字（u0,v0 为数字中心的贴图坐标，w,h 为占的贴图比例）
export function drawEarthDigit(night, digit, { u0 = 0.5, v0 = 0.42, w = 0.1, h = 0.26 } = {}) {
  const { canvas: c } = night, ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.putImageData(night.base, 0, 0);
  const gw = 96, gh = 128, g = makeCanvas(gw, gh), gx = g.getContext('2d');
  gx.fillStyle = '#000'; gx.fillRect(0, 0, gw, gh);
  gx.fillStyle = '#fff'; gx.font = `bold 130px ${STENCIL}`; gx.textAlign = 'center'; gx.textBaseline = 'middle';
  gx.fillText(String(digit), gw / 2, gh / 2 + 6);
  const px = gx.getImageData(0, 0, gw, gh).data;
  const rnd = mulberry32(4481 + digit);
  const x0 = (u0 - w / 2) * W, y0 = (v0 - h / 2) * H, sx = (w * W) / gw, sy = (h * H) / gh;
  // 字的笔画里撒满亮点，笔画中间更密更亮
  for (let k = 0; k < 2600; k++) {
    const gxp = (rnd() * gw) | 0, gyp = (rnd() * gh) | 0;
    if (px[(gyp * gw + gxp) * 4] < 128) continue;
    const x = x0 + gxp * sx + (rnd() - 0.5) * sx, y = y0 + gyp * sy + (rnd() - 0.5) * sy;
    ctx.fillStyle = rnd() < 0.35 ? '#fff0c8' : '#ffb04a';
    ctx.globalAlpha = 0.7 + rnd() * 0.3;
    const r = rnd() < 0.1 ? 3 : 1.8;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
  night.tex.needsUpdate = true;
}

// 月亮：灰色的月海 + 细碎的环形山
export function genMoon(W = 512, H = 256) {
  const c = makeCanvas(W, H);
  const N = createNoise(4491), N2 = createNoise(4492);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const mare = smoothstep(0.52, 0.62, N.fbm(u * 3, v * 2, 4, 3, 256));
    const n = N2.fbm(u * 30, v * 15, 4, 30, 256);
    const k = 170 - mare * 70 + (n - 0.5) * 60;
    d[i] = k; d[i + 1] = k * 0.98; d[i + 2] = k * 0.95; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d'), rnd = mulberry32(4493);
  for (let k = 0; k < 60; k++) {
    const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 8;
    ctx.strokeStyle = 'rgba(40,40,40,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0.6, 3.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,235,0.2)'; ctx.beginPath(); ctx.arc(x, y, r, 3.6, 6.9); ctx.stroke();
  }
  return toTex(c);
}

// 太阳：白得发烫的核心 + 柔和的光晕 + 一道很淡的横向镜头光（电影镜头的变形宽银幕光斑）
export function genSunSprite(S = 256) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const m = S / 2;
  let g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.06, 'rgba(255,255,252,1)'); g.addColorStop(0.12, 'rgba(255,246,225,0.5)');
  g.addColorStop(0.35, 'rgba(255,225,190,0.1)'); g.addColorStop(1, 'rgba(255,210,170,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(0.5, 'rgba(200,225,255,0.35)'); g.addColorStop(1, 'rgba(160,200,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, m - S * 0.006, S, S * 0.012);
  return toTex(c, { wrap: false });
}
export function genGlowDot(S = 64, inner = 'rgba(255,255,255,1)') {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTex(c, { wrap: false });
}
// ---------------- 显示器：单色荧光屏（轨道图 / 生命维持）----------------
// 屏幕上的扫描线 + 暗角，所有单色屏共用
export function crtFinish(ctx, W, H, a = 0.18) {
  ctx.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
export function drawOrbitScreen(c, t, { o2 = 1, alert = false } = {}) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  const G = SP.phosphor, A = SP.amber, R = '#ff5a3c';
  ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, W, H);
  // 世界地图（粗糙的色块）
  ctx.fillStyle = 'rgba(140,240,164,0.14)';
  for (const [x, y, w, h] of [[0.08, 0.3, 0.2, 0.25], [0.2, 0.55, 0.1, 0.25], [0.45, 0.25, 0.14, 0.2], [0.48, 0.45, 0.1, 0.28], [0.62, 0.22, 0.25, 0.25], [0.78, 0.6, 0.1, 0.12]]) ctx.fillRect(x * W, y * H * 0.8 + H * 0.1, w * W, h * H * 0.8);
  ctx.strokeStyle = 'rgba(140,240,164,0.16)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 8) { ctx.beginPath(); ctx.moveTo(x, H * 0.1); ctx.lineTo(x, H * 0.9); ctx.stroke(); }
  for (let y = H * 0.1; y <= H * 0.9; y += H * 0.1) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 星下点轨迹
  ctx.strokeStyle = A; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let x = 0; x <= W; x += 4) { const y = H * 0.5 + Math.sin((x / W) * Math.PI * 2 + t * 0.05) * H * 0.28; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const px = ((t * 0.02) % 1) * W, py = H * 0.5 + Math.sin((px / W) * Math.PI * 2 + t * 0.05) * H * 0.28;
  ctx.fillStyle = '#fff4d8'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 6.28); ctx.fill();
  const blink = Math.sin(t * 5) > 0;
  ctx.fillStyle = alert ? (blink ? R : 'rgba(255,90,60,0.35)') : G; ctx.font = `bold 15px ${MONO}`; ctx.textAlign = 'left';
  ctx.fillText(alert ? '** LIFE SUPPORT FAILURE **' : 'ORBIT 211  ALT 408.2 KM', 8, 18);
  ctx.fillStyle = 'rgba(140,240,164,0.6)'; ctx.font = `11px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText(`MET 03:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`, W - 8, 18);
  // 氧气条
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(140,240,164,0.5)'; ctx.strokeRect(8.5, H - 21.5, W - 17, 11);
  ctx.fillStyle = o2 > 0.3 ? A : R; ctx.fillRect(10, H - 20, (W - 20) * clamp(o2, 0, 1), 8);
  ctx.fillStyle = G; ctx.font = `bold 11px ${MONO}`; ctx.fillText(`ppO2 ${Math.round(o2 * 100)}%`, 10, H - 26);
  crtFinish(ctx, W, H);
}
// 机器人的脸：深色液晶屏上的白色线条表情（像国际空间站上那个会说话的小球）
export function drawRobotFace(c, mode = 'dizzy', t = 0) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#0a0d0f'; ctx.fillRect(0, 0, W, H);
  const col = mode === 'alert' ? '#ff9a7a' : '#d6ecff';
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  const ex = [W * 0.36, W * 0.64], ey = H * 0.46;
  if (mode === 'dizzy') {
    for (const x of ex) { ctx.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = a * 1.7; ctx.lineTo(x + Math.cos(a + t * 8) * r, ey + Math.sin(a + t * 8) * r); } ctx.stroke(); }
  } else if (mode === 'happy') {
    for (const x of ex) { ctx.beginPath(); ctx.arc(x, ey + 8, 14, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(W / 2, ey + 22, 16, 0.2, Math.PI - 0.2); ctx.stroke();
  } else if (mode === 'blink') {
    for (const x of ex) { ctx.beginPath(); ctx.moveTo(x - 12, ey); ctx.lineTo(x + 12, ey); ctx.stroke(); }
  } else if (mode === 'talk') {
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x, ey, 8, 12, 0, 0, 6.28); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(W / 2, ey + 30, 12, 3 + Math.abs(Math.sin(t * 14)) * 7, 0, 0, 6.28); ctx.stroke();
  } else if (mode === 'alert') {
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x, ey, 10, 14, 0, 0, 6.28); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(W / 2 - 14, ey + 30); ctx.lineTo(W / 2 + 14, ey + 30); ctx.stroke();
  } else {
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x, ey, 8, 12, 0, 0, 6.28); ctx.fill(); }
    ctx.beginPath(); ctx.arc(W / 2, ey + 18, 14, 0.35, Math.PI - 0.35); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  crtFinish(ctx, W, H, 0.22);
}
