// 第四章贴图：失重太空舱 211 —— 日式动画（赛璐璐）风格
//   白色软包舱壁、蓝灰甲板、橙色扶手、黄黑警示条、打着模板字的标签；
//   窗外：平涂的地球（白天 / 云层 / 夜晚的城市灯光）、月亮、带十字星芒的太阳
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, SANS } from './textures.js';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';

export const SP = {
  white: '#eef2f7', panel: '#dfe5ee', gray: '#b9c3d2', steel: '#8d9bb0', navy: '#243452', ink: '#1a2238',
  orange: '#ff8a3d', teal: '#2ec4c9', cyan: '#7fe0ff', yellow: '#ffd23f', red: '#ff4a5a',
};
const STENCIL = '"DIN Condensed","Arial Narrow","Roboto Condensed","PingFang SC",sans-serif';

const rrect = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
function hazard(ctx, x, y, w, h, step = 24) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = SP.yellow; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = SP.ink;
  for (let k = -h; k < w + h; k += step * 2) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + step, y + h); ctx.lineTo(x + k + step + h, y); ctx.lineTo(x + k + h, y); ctx.fill(); }
  ctx.restore();
}

// 甲板：蓝灰色 60cm 方格板，四角螺丝，防滑纹 + 黄色抓地条
export function genDeck() {
  const S = 1024, col = makeCanvas(S, S), hgt = makeCanvas(S, S), rou = makeCanvas(S, S);
  const c = col.getContext('2d'), hx = hgt.getContext('2d'), rx = rou.getContext('2d');
  c.fillStyle = '#9aa8bd'; c.fillRect(0, 0, S, S);
  hx.fillStyle = '#fff'; hx.fillRect(0, 0, S, S);
  rx.fillStyle = '#8a8a8a'; rx.fillRect(0, 0, S, S);
  const n = 2, p = S / n;
  const rnd = mulberry32(4401);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * p, y = j * p;
    c.fillStyle = (i + j) % 2 ? '#a3b1c5' : '#97a6bb'; rrect(c, x + 8, y + 8, p - 16, p - 16, 18); c.fill();
    // 防滑菱形纹
    c.fillStyle = 'rgba(255,255,255,0.13)';
    for (let yy = y + 30; yy < y + p - 30; yy += 26) for (let xx = x + 30 + ((yy / 26) % 2) * 13; xx < x + p - 30; xx += 26) { c.save(); c.translate(xx, yy); c.rotate(0.785); c.fillRect(-5, -1.5, 10, 3); c.restore(); }
    // 螺丝
    for (const [bx, by] of [[x + 30, y + 30], [x + p - 30, y + 30], [x + 30, y + p - 30], [x + p - 30, y + p - 30]]) {
      c.fillStyle = '#6f7d93'; c.beginPath(); c.arc(bx, by, 9, 0, 6.28); c.fill();
      c.fillStyle = '#c8d2e0'; c.beginPath(); c.arc(bx - 2, by - 2, 4, 0, 6.28); c.fill();
      hx.fillStyle = '#777'; hx.beginPath(); hx.arc(bx, by, 9, 0, 6.28); hx.fill();
    }
    hx.strokeStyle = '#000'; hx.lineWidth = 10; rrect(hx, x + 4, y + 4, p - 8, p - 8, 18); hx.stroke();
    // 高光边
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 22, y + p - 14); c.lineTo(x + 14, y + 22); c.lineTo(x + p - 22, y + 14); c.stroke();
    if (rnd() < 0.5) { c.fillStyle = SP.yellow; c.fillRect(x + p * 0.18, y + p * 0.46, p * 0.64, 22); c.fillStyle = 'rgba(26,34,56,0.35)'; for (let k = 0; k < 12; k++) c.fillRect(x + p * 0.18 + k * p * 0.055, y + p * 0.46, 3, 22); }
  }
  c.strokeStyle = '#5d6b82'; c.lineWidth = 8;
  for (let k = 0; k <= n; k++) { c.beginPath(); c.moveTo(k * p, 0); c.lineTo(k * p, S); c.stroke(); c.beginPath(); c.moveTo(0, k * p); c.lineTo(S, k * p); c.stroke(); }
  c.fillStyle = 'rgba(36,52,82,0.5)'; c.font = `bold 110px ${STENCIL}`; c.textAlign = 'center'; c.fillText('211', p * 0.5, p * 0.32);
  return { map: toTex(col), normalMap: toTex(normalFromHeight(hgt, 2.4), { data: true }), roughnessMap: toTex(rou, { data: true }) };
}
export function genDeckDirt(W = 256, H = 512) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const rnd = mulberry32(4402);
  for (let k = 0; k < 14; k++) { ctx.fillStyle = `rgba(40,50,70,${0.04 + rnd() * 0.05})`; ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 10 + rnd() * 30, 4 + rnd() * 10, rnd() * 3, 0, 6.28); ctx.fill(); }
  return toTex(c);
}

// 舱壁：白色软包（一块块鼓起来的垫子）+ 魔术贴 + 腰线上的蓝色灯带 + 模板字标签
//   贴图宽 2m、高 3m（和墙的世界 UV 对应）
export function genPadWall() {
  const W = 1024, H = 1536, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const Y = (m) => H - (m / 3) * H;
  ctx.fillStyle = '#c8d1de'; ctx.fillRect(0, 0, W, H);
  const cols = 4, pw = W / cols;
  const rows = [[0.12, 0.95], [0.95, 1.75], [1.75, 2.55]];
  const rnd = mulberry32(4411);
  for (const [a, b] of rows) {
    for (let i = 0; i < cols; i++) {
      const x = i * pw + 6, y = Y(b) + 6, w = pw - 12, h = Y(a) - Y(b) - 12;
      const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#eef2f8'); g.addColorStop(1, '#d6dde8');
      ctx.fillStyle = g; rrect(ctx, x, y, w, h, 30); ctx.fill();
      // 软包的缝线
      ctx.strokeStyle = 'rgba(150,165,190,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([8, 7]);
      rrect(ctx, x + 14, y + 14, w - 28, h - 28, 20); ctx.stroke(); ctx.setLineDash([]);
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; rrect(ctx, x + 20, y + 16, w * 0.5, 8, 4); ctx.fill();
      // 魔术贴
      if (rnd() < 0.45) { ctx.fillStyle = '#5a6478'; rrect(ctx, x + w * (0.25 + rnd() * 0.4), y + h * (0.3 + rnd() * 0.4), 44, 30, 5); ctx.fill(); }
    }
  }
  // 顶上的设备带
  ctx.fillStyle = '#9aa7ba'; ctx.fillRect(0, 0, W, Y(2.55));
  ctx.fillStyle = '#7c8aa0'; for (let x = 0; x < W; x += 128) { rrect(ctx, x + 20, Y(2.85), 88, Y(2.62) - Y(2.85), 8); ctx.fill(); }
  ctx.fillStyle = '#5e6c84'; for (let x = 0; x < W; x += 128) for (let k = 0; k < 5; k++) ctx.fillRect(x + 32 + k * 14, Y(2.82), 6, Y(2.66) - Y(2.82));
  // 腰线：蓝色灯带（贴图里只是底色，真正发光的灯带是几何体）
  ctx.fillStyle = SP.navy; ctx.fillRect(0, Y(1.0), W, Y(0.93) - Y(1.0));
  ctx.fillStyle = '#9fe8ff'; ctx.fillRect(0, Y(0.975), W, 5);
  // 踢脚
  ctx.fillStyle = '#56647c'; ctx.fillRect(0, Y(0.12), W, H - Y(0.12));
  hazard(ctx, 0, Y(0.12), W, 16, 20);
  // 模板字
  ctx.fillStyle = 'rgba(36,52,82,0.6)'; ctx.font = `bold 40px ${STENCIL}`; ctx.textAlign = 'left';
  ctx.fillText('MODULE 211 · CREW QTRS', 40, Y(2.44));
  ctx.fillStyle = 'rgba(255,138,61,0.9)'; ctx.fillText('▲ HANDRAIL', W * 0.62, Y(1.27));
  return toTex(c);
}

// 天花板：灰白面板 + 圆形风口；自发光贴图：LED 灯板
export function genCeilingSpace() {
  const W = 512, H = 1024;
  const col = makeCanvas(W, H), em = makeCanvas(W, H);
  const c = col.getContext('2d'), e = em.getContext('2d');
  c.fillStyle = '#dde3ec'; c.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const ph = H / 4;
  for (let j = 0; j < 4; j++) {
    const y = j * ph;
    c.strokeStyle = '#a9b4c4'; c.lineWidth = 6; c.strokeRect(10, y + 10, W - 20, ph - 20);
    // LED 灯板
    c.fillStyle = '#f6fbff'; rrect(c, W * 0.18, y + ph * 0.3, W * 0.64, ph * 0.18, 10); c.fill();
    e.fillStyle = '#cfefff'; rrect(e, W * 0.18, y + ph * 0.3, W * 0.64, ph * 0.18, 10); e.fill();
    // 风口
    const vx = j % 2 ? W * 0.3 : W * 0.7, vy = y + ph * 0.72;
    c.fillStyle = '#8d9bb0'; c.beginPath(); c.arc(vx, vy, 34, 0, 6.28); c.fill();
    c.strokeStyle = '#dde3ec'; c.lineWidth = 3; for (let r = 10; r < 34; r += 8) { c.beginPath(); c.arc(vx, vy, r, 0, 6.28); c.stroke(); }
  }
  return { map: toTex(col), emissiveMap: toTex(em) };
}

// 复合材料面板（代替木头）：平涂 + 细面板线 + 几颗铆钉
export function genPanel({ base = '#e8edf3', line = '#b8c2d0', seed = 1, S = 256, stripe = null } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(seed * 131);
  ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, S - 8, S - 8);
  ctx.beginPath(); ctx.moveTo(S / 2, 4); ctx.lineTo(S / 2, S - 4); ctx.stroke();
  ctx.fillStyle = line;
  for (const [x, y] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(8, 8, S - 16, 5);
  if (stripe) { ctx.fillStyle = stripe; ctx.fillRect(0, S * 0.8, S, S * 0.07); }
  if (rnd() < 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(S * 0.6, S * 0.2, S * 0.3, S * 0.2); }
  return toTex(c);
}

// 气闸舱门：金属门板 + 黄黑警示框 + 大号模板字
export function genHatchDoor() {
  const W = 512, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#c9d1dc'; ctx.fillRect(0, 0, W, H);
  hazard(ctx, 0, 0, W, 40, 26); hazard(ctx, 0, H - 40, W, 40, 26);
  hazard(ctx, 0, 0, 30, H, 26); hazard(ctx, W - 30, 0, 30, H, 26);
  ctx.fillStyle = '#b3bcc9'; rrect(ctx, 60, 90, W - 120, H - 180, 30); ctx.fill();
  ctx.strokeStyle = '#8894a6'; ctx.lineWidth = 6; rrect(ctx, 60, 90, W - 120, H - 180, 30); ctx.stroke();
  ctx.fillStyle = SP.navy; ctx.font = `bold 120px ${STENCIL}`; ctx.textAlign = 'center';
  ctx.fillText('211', W / 2, H * 0.78);
  ctx.fillStyle = SP.orange; ctx.font = `bold 48px ${STENCIL}`; ctx.fillText('AIRLOCK', W / 2, H * 0.86);
  ctx.fillStyle = '#9aa5b6'; for (let k = 0; k < 6; k++) ctx.fillRect(90, 120 + k * 22, W - 180, 6);
  return toTex(c);
}

// 遮光板：银色隔热膜（菱形绗缝）
export function genShutter() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#e9eef5'); g.addColorStop(0.5, '#b8c4d4'); g.addColorStop(1, '#dfe6f0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(120,135,160,0.7)'; ctx.lineWidth = 2;
  for (let k = -S; k < S * 2; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + S, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k, S); ctx.lineTo(k + S, 0); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let k = 0; k < S; k += 32) for (let j = 0; j < S; j += 32) ctx.fillRect(k + 14, j + 4, 4, 10);
  return toTex(c);
}

// 床上的束缚网（橙色织带网格）
export function genCargoNet() {
  const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#ff9a4d'; ctx.lineWidth = 5;
  for (let k = 0; k <= S; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(S, k); ctx.stroke(); }
  ctx.fillStyle = '#ffd23f'; for (let x = 0; x <= S; x += 32) for (let y = 0; y <= S; y += 32) ctx.fillRect(x - 4, y - 4, 8, 8);
  return toTex(c);
}

// 货包（代替纸箱）：白色帆布 + 织带 + 标签
export function genCargoBag({ print = null } = {}) {
  const W = 512, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#eceae2'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = '#6a7690'; ctx.fillRect(W * 0.2, 0, 22, H); ctx.fillRect(W * 0.75, 0, 22, H);
  ctx.fillStyle = '#fff'; rrect(ctx, W * 0.34, H * 0.28, W * 0.32, H * 0.42, 8); ctx.fill();
  ctx.strokeStyle = SP.navy; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = SP.navy; ctx.font = `bold 40px ${STENCIL}`; ctx.textAlign = 'center';
  ctx.fillText(print ? 'H₂O' : 'CTB', W / 2, H * 0.49);
  ctx.font = `bold 22px ${STENCIL}`; ctx.fillStyle = SP.orange; ctx.fillText(print ? `${print} ML ×24` : 'MODULE 211', W / 2, H * 0.62);
  return toTex(c);
}

// 挂钟 → 任务钟：深蓝表盘 + 青色刻度
export function genMissionClock() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = SP.navy; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = SP.cyan; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.45, 0, 6.28); ctx.stroke();
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2, r0 = S * (k % 5 ? 0.4 : 0.36), r1 = S * 0.43;
    ctx.strokeStyle = k % 5 ? 'rgba(127,224,255,0.6)' : '#ffffff'; ctx.lineWidth = k % 5 ? 3 : 8;
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); ctx.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.fillStyle = SP.cyan; ctx.font = `bold 44px ${STENCIL}`; ctx.textAlign = 'center';
  ctx.fillText('MET', S / 2, S * 0.33); ctx.font = `bold 30px ${STENCIL}`; ctx.fillStyle = SP.orange; ctx.fillText('ORBIT 211', S / 2, S * 0.72);
  return toTex(c, { wrap: false });
}

export function genMousepadSpace() {
  const W = 512, H = 384, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#16203a'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(4431);
  for (let k = 0; k < 90; k++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; ctx.fillRect(rnd() * W, rnd() * H, 2, 2); }
  const g = ctx.createRadialGradient(W * 0.3, H * 0.5, 10, W * 0.3, H * 0.5, 130);
  g.addColorStop(0, '#6fd0ff'); g.addColorStop(0.7, '#2a6fd8'); g.addColorStop(1, 'rgba(42,111,216,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.5, 130, 0, 6.28); ctx.fill();
  ctx.fillStyle = SP.orange; ctx.font = `bold 46px ${STENCIL}`; ctx.textAlign = 'center'; ctx.fillText('GG IN ORBIT', W * 0.68, H * 0.56);
  return toTex(c, { wrap: false });
}

// 睡袋：蓝色 + 橙色拉链条
export function genSleepingBag(base = '#3a6fd8') {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; for (let y = 0; y < S; y += 32) ctx.fillRect(0, y, S, 12);
  ctx.fillStyle = SP.orange; ctx.fillRect(S * 0.46, 0, S * 0.08, S);
  ctx.fillStyle = '#ffe2c8'; for (let y = 0; y < S; y += 8) ctx.fillRect(S * 0.49, y, S * 0.02, 4);
  return toTex(c);
}

// 模板字标签（贴在墙上的）
export function genSign(lines, { W = 512, H = 192, bg = '#ffffff', fg = SP.navy, accent = SP.orange, border = true } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = bg; rrect(ctx, 0, 0, W, H, 18); ctx.fill();
  if (border) { ctx.strokeStyle = accent; ctx.lineWidth = 10; rrect(ctx, 5, 5, W - 10, H - 10, 14); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? fg : accent;
    ctx.font = `bold ${i === 0 ? Math.round(H * (n > 1 ? 0.36 : 0.5)) : Math.round(H * 0.2)}px ${STENCIL}`;
    ctx.fillText(l, W / 2, H * (n > 1 ? (i === 0 ? 0.4 : 0.76) : 0.54));
  });
  return toTex(c, { wrap: false });
}

// ---------------- 窗外：地球 ----------------
// 平涂风格的地球：深浅两种海蓝、浅滩一圈亮青色、陆地三阶（草绿 / 深绿 / 沙黄）、极地冰盖
export function genEarthDay(W = 1024, H = 512) {
  const c = makeCanvas(W, H);
  const N = createNoise(4451), N2 = createNoise(4452);
  const land = new Float32Array(W * H);
  const ocean = hexToRgb('#1646b8'), ocean2 = hexToRgb('#2263d6'), shallow = hexToRgb('#4cc6ec');
  const green = hexToRgb('#4cb84e'), deep = hexToRgb('#2f8a45'), sand = hexToRgb('#d9b25e'), ice = hexToRgb('#f4f9ff'), iceS = hexToRgb('#cfe4ff');
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H, lat = (0.5 - v) * Math.PI;
    let n = N.fbm(u * 5, v * 2.5, 5, 5, 256);
    n += 0.08 * Math.cos(lat * 2.2);
    land[y * W + x] = n;
    const dry = N2.fbm(u * 7, v * 4, 3, 7, 256) + Math.max(0, 0.18 - Math.abs(Math.abs(lat) - 0.42)) * 1.2;
    let col;
    if (Math.abs(lat) > 1.2 + N2.noise(u * 20, 0, 20, 256) * 0.12) col = Math.abs(lat) > 1.32 ? ice : (N.noise(u * 30, v * 30, 30, 256) > 0.5 ? ice : iceS);
    else if (n > 0.56) col = dry > 0.68 ? sand : n > 0.63 ? deep : green;
    else if (n > 0.54) col = shallow;
    else col = n > 0.47 ? ocean2 : ocean;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, land, W, H };
}
// 云层（带透明度）：拉长的云带，边缘硬一点（赛璐璐的云）
export function genEarthClouds(W = 1024, H = 512) {
  const c = makeCanvas(W, H);
  const N = createNoise(4461);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H, lat = (0.5 - v) * Math.PI;
    let n = N.fbm(u * 8, v * 8, 5, 8, 256) * 0.7 + N.fbm(u * 3, v * 12, 3, 3, 256) * 0.3;
    n += 0.06 * Math.cos(lat * 6);
    const a = smoothstep(0.54, 0.58, n) * 0.9 + smoothstep(0.62, 0.66, n) * 0.1;
    const shade = n > 0.62 ? 255 : 232;
    d[i] = shade; d[i + 1] = shade; d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
  });
  return toTex(c);
}
// 夜晚的城市灯光：陆地上一簇簇暖黄的光点；draw 后再往上画一个用灯光拼成的数字
export function genEarthNight(day, W = 1024, H = 512) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(4471);
  const land = day.land;
  for (let k = 0; k < 5200; k++) {
    const x = (rnd() * W) | 0, y = (H * 0.15 + rnd() * H * 0.7) | 0;
    const n = land[y * W + x];
    if (n < 0.57 || rnd() > (n - 0.53) * 6) continue;
    const r = rnd() < 0.08 ? 2.2 : 1.1;
    ctx.fillStyle = rnd() < 0.3 ? '#fff2c0' : '#ffc76a';
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.fillRect(x, y, r, r);
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
    ctx.fillStyle = rnd() < 0.4 ? '#ffffff' : '#ffe08a';
    ctx.globalAlpha = 0.7 + rnd() * 0.3;
    const r = rnd() < 0.1 ? 3 : 1.8;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
  night.tex.needsUpdate = true;
}

export function genMoon(W = 256, H = 128) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#e4e6ee'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(4491);
  ctx.fillStyle = '#b9bfcf';
  for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.ellipse(rnd() * W, H * 0.2 + rnd() * H * 0.6, 8 + rnd() * 26, 6 + rnd() * 16, 0, 0, 6.28); ctx.fill(); }
  ctx.strokeStyle = '#a4abbe'; ctx.lineWidth = 2;
  for (let k = 0; k < 30; k++) { ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 5, 0, 6.28); ctx.stroke(); }
  return toTex(c);
}

// 太阳：白色核心 + 光晕 + 动画里常见的十字星芒
export function genSunSprite(S = 256) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const m = S / 2;
  let g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,255,250,1)'); g.addColorStop(0.16, 'rgba(255,240,200,0.55)');
  g.addColorStop(0.4, 'rgba(255,200,140,0.14)'); g.addColorStop(1, 'rgba(255,180,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (const [a, len, w] of [[0, 0.5, 0.012], [Math.PI / 2, 0.5, 0.012], [Math.PI / 4, 0.3, 0.007], [-Math.PI / 4, 0.3, 0.007]]) {
    ctx.save(); ctx.translate(m, m); ctx.rotate(a);
    g = ctx.createLinearGradient(-S * len, 0, S * len, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-S * len, -S * w, S * len * 2, S * w * 2);
    ctx.restore();
  }
  return toTex(c, { wrap: false });
}
// 镜头光斑：六边形
export function genFlareHex(S = 64) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.lineTo(S / 2 + Math.cos(a) * S * 0.45, S / 2 + Math.sin(a) * S * 0.45); }
  ctx.closePath();
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.8, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = g; ctx.fill();
  return toTex(c, { wrap: false });
}
export function genGlowDot(S = 64, inner = 'rgba(255,255,255,1)') {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTex(c, { wrap: false });
}
// 四角星（闪光）
export function genSparkle(S = 64) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), m = S / 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(m, 0); ctx.quadraticCurveTo(m, m, S, m); ctx.quadraticCurveTo(m, m, m, S); ctx.quadraticCurveTo(m, m, 0, m); ctx.quadraticCurveTo(m, m, m, 0);
  ctx.fill();
  return toTex(c, { wrap: false });
}

// ---------------- 显示器：轨道图 / 生命维持 ----------------
export function drawOrbitScreen(c, t, { o2 = 1, alert = false } = {}) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#081428'; ctx.fillRect(0, 0, W, H);
  // 世界地图（粗糙的色块）
  ctx.fillStyle = '#12305a';
  for (const [x, y, w, h] of [[0.08, 0.3, 0.2, 0.25], [0.2, 0.55, 0.1, 0.25], [0.45, 0.25, 0.14, 0.2], [0.48, 0.45, 0.1, 0.28], [0.62, 0.22, 0.25, 0.25], [0.78, 0.6, 0.1, 0.12]]) ctx.fillRect(x * W, y * H * 0.8 + H * 0.1, w * W, h * H * 0.8);
  ctx.strokeStyle = 'rgba(127,224,255,0.25)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 8) { ctx.beginPath(); ctx.moveTo(x, H * 0.1); ctx.lineTo(x, H * 0.9); ctx.stroke(); }
  for (let y = H * 0.1; y <= H * 0.9; y += H * 0.1) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 星下点轨迹
  ctx.strokeStyle = SP.orange; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 0; x <= W; x += 4) { const y = H * 0.5 + Math.sin((x / W) * Math.PI * 2 + t * 0.05) * H * 0.28; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const px = ((t * 0.02) % 1) * W, py = H * 0.5 + Math.sin((px / W) * Math.PI * 2 + t * 0.05) * H * 0.28;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 5 + Math.sin(t * 6) * 1.5, 0, 6.28); ctx.fill();
  ctx.fillStyle = alert ? SP.red : SP.cyan; ctx.font = `bold 16px ${STENCIL}`; ctx.textAlign = 'left';
  ctx.fillText(alert ? '⚠ LIFE SUPPORT FAILURE' : 'ORBIT 211 · 408 KM', 8, 18);
  // 氧气条
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(8, H - 22, W - 16, 12);
  ctx.fillStyle = o2 > 0.3 ? SP.cyan : SP.red; ctx.fillRect(8, H - 22, (W - 16) * clamp(o2, 0, 1), 12);
  ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${STENCIL}`; ctx.fillText(`O₂ ${Math.round(o2 * 100)}%`, 10, H - 26);
}
export function drawRobotFace(c, mode = 'dizzy', t = 0) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#0b1a33'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ctx.fillStyle = mode === 'alert' ? '#ff6a7a' : '#7fe8ff';
  ctx.lineWidth = 9; ctx.lineCap = 'round';
  const ex = [W * 0.34, W * 0.66], ey = H * 0.5;
  if (mode === 'dizzy') {
    for (const x of ex) { ctx.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = a * 2.2; ctx.lineTo(x + Math.cos(a + t * 8) * r, ey + Math.sin(a + t * 8) * r); } ctx.stroke(); }
  } else if (mode === 'happy') {
    for (const x of ex) { ctx.beginPath(); ctx.arc(x, ey + 8, 18, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else if (mode === 'blink') {
    for (const x of ex) { ctx.beginPath(); ctx.moveTo(x - 16, ey); ctx.lineTo(x + 16, ey); ctx.stroke(); }
  } else if (mode === 'talk') {
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x, ey, 12, 17, 0, 0, 6.28); ctx.fill(); }
    ctx.beginPath(); ctx.arc(W / 2, ey + 28, 8 + Math.abs(Math.sin(t * 14)) * 5, 0, Math.PI); ctx.stroke();
  } else {
    for (const x of ex) { ctx.beginPath(); ctx.ellipse(x, ey, 12, 17, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 4, ey - 6, 4, 0, 6.28); ctx.fill(); ctx.fillStyle = ctx.strokeStyle; }
  }
  // 腮红
  ctx.fillStyle = 'rgba(255,120,160,0.45)'; for (const x of [W * 0.2, W * 0.8]) { ctx.beginPath(); ctx.ellipse(x, ey + 22, 12, 6, 0, 0, 6.28); ctx.fill(); }
}
// 睡着的室友的脸（动画风：大大的闭眼弧线 + 张着的嘴 + 腮红）
export function genSleeperFace(skin = '#ffe0c8', { mouth = 'o', seed = 0 } = {}) {
  const W = 256, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = skin; ctx.fillRect(0, 0, W, H);
  // 贴图横向一圈 = 头的一周；正脸在 u=0.25 附近（球体 UV 的 +z 方向）
  const cx = W * 0.25, cy = H * 0.55;
  ctx.strokeStyle = '#3a2438'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * 22, cy - 4, 13, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 12, cy - 30); ctx.lineTo(cx + s * 32, cy - 33 - seed * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,110,140,0.45)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 34, cy + 14, 12, 6, 0, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = '#7a2a3a';
  if (mouth === 'o') { ctx.beginPath(); ctx.ellipse(cx, cy + 28, 7, 9, 0, 0, 6.28); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(cx, cy + 22, 10, 0.1, Math.PI - 0.1); ctx.fill(); }
  // 口水
  ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.ellipse(cx + 8, cy + 40, 3, 6, 0, 0, 6.28); ctx.fill();
  return toTex(c, { wrap: false });
}
