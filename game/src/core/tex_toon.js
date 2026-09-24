// 卡通章贴图：马卡龙色、干净的平涂 + 描边，夜里的星空和月亮，动物室友们的海报、游戏画面、短视频
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, HAND, SANS } from './textures.js';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';

export const PASTEL = {
  cream: '#fff4e2', mint: '#bfeed6', peach: '#ffd2b5', pink: '#ffb8cc', lav: '#d9ccff', sky: '#b9e2ff',
  butter: '#ffe99a', coral: '#ff907c', honey: '#f0b879', choco: '#8a5a44', ink: '#4a3350',
};
const ROUND = '"Comic Sans MS","Chalkboard SE","PingFang SC","Microsoft YaHei",sans-serif';

// 卡通明暗：3 阶色带
export function toonGradient(steps = [0.42, 0.72, 1.0]) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const star = (ctx, x, y, r, rot = 0, pts = 5, inner = 0.45) => {
  ctx.beginPath();
  for (let k = 0; k < pts * 2; k++) {
    const a = rot + (k * Math.PI) / pts - Math.PI / 2, rr = k % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
};
const heart = (ctx, x, y, s) => {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
};
export { star, heart };

// ---------- 地板：蜂蜜色木地板，缝是深色描边 ----------
export function genFloorToon() {
  const S = 1024, planks = 6, pw = S / planks;
  const rnd = mulberry32(601);
  const col = makeCanvas(S, S), hgt = makeCanvas(S, S), rou = makeCanvas(S, S);
  const cx = col.getContext('2d'), hx = hgt.getContext('2d'), rx = rou.getContext('2d');
  hx.fillStyle = '#fff'; hx.fillRect(0, 0, S, S);
  rx.fillStyle = '#9a9a9a'; rx.fillRect(0, 0, S, S);
  const tones = ['#f2c08a', '#eeb57c', '#f5c996', '#ecb983', '#f0bd84'];
  for (let p = 0; p < planks; p++) {
    let y = -rnd() * S * 0.5;
    while (y < S) {
      const len = S * (0.35 + rnd() * 0.4);
      const x0 = p * pw;
      cx.fillStyle = tones[(rnd() * tones.length) | 0];
      cx.fillRect(x0, y, pw, len);
      // 卡通木纹：两三条弧线
      cx.strokeStyle = 'rgba(190,120,70,0.35)'; cx.lineWidth = 3;
      for (let k = 0; k < 2; k++) {
        const gx = x0 + pw * (0.25 + rnd() * 0.5);
        cx.beginPath(); cx.moveTo(gx, y + 10); cx.bezierCurveTo(gx + 12, y + len * 0.3, gx - 12, y + len * 0.6, gx + 4, y + len - 10); cx.stroke();
      }
      // 高光边
      cx.fillStyle = 'rgba(255,245,225,0.35)'; cx.fillRect(x0 + 5, y + 4, 6, len - 8);
      // 缝
      cx.fillStyle = '#9a5e3a'; cx.fillRect(x0, y, pw, 4); cx.fillRect(x0, y, 4, len);
      hx.fillStyle = '#000'; hx.fillRect(x0, y, pw, 4); hx.fillRect(x0, y, 4, len);
      y += len;
    }
  }
  return { map: toTex(col), normalMap: toTex(normalFromHeight(hgt, 2), { data: true }), roughnessMap: toTex(rou, { data: true }) };
}

export function genFloorDirtToon(W = 512, H = 1024) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const edge = (x0, y0, x1, y1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(140,80,90,0.22)'); g.addColorStop(1, 'rgba(140,80,90,0)'); return g; };
  ctx.fillStyle = edge(0, 0, 40, 0); ctx.fillRect(0, 0, 40, H);
  ctx.fillStyle = edge(W, 0, W - 40, 0); ctx.fillRect(W - 40, 0, 40, H);
  // 散落的彩色纸屑
  const rnd = mulberry32(602);
  const cols = ['#ff8fb1', '#ffd36e', '#8fe3ff', '#b6ff8f', '#d9b3ff'];
  for (let k = 0; k < 90; k++) {
    ctx.save(); ctx.translate(rnd() * W, rnd() * H); ctx.rotate(rnd() * 6);
    ctx.fillStyle = cols[(rnd() * cols.length) | 0];
    if (rnd() < 0.5) ctx.fillRect(-4, -2, 8, 4); else { star(ctx, 0, 0, 5); ctx.fill(); }
    ctx.restore();
  }
  return toTex(c, { wrap: false });
}

// ---------- 墙：上半截薄荷绿 + 小星星，下半截桃色护墙板 ----------
export function genWallToon() {
  const W = 1024, H = 1536, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const Y = (m) => H - (m / 3) * H; // 离地 m 米
  ctx.fillStyle = '#c9f0dc'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(611);
  // 小图案（错位排列）
  for (let r = 0, y = 40; y < Y(1.0); y += 110, r++) {
    for (let x = (r % 2) * 80 + 40; x < W; x += 160) {
      ctx.fillStyle = r % 2 ? 'rgba(255,255,255,0.75)' : 'rgba(255,214,120,0.8)';
      if ((r + x) % 3 === 0) { heart(ctx, x, y, 11); ctx.fill(); } else { star(ctx, x, y, 12, rnd()); ctx.fill(); }
    }
  }
  // 顶部彩带
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(0, 0, W, 38);
  ctx.fillStyle = '#ffb8cc';
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 38); ctx.lineTo(x + 32, 70); ctx.lineTo(x + 64, 38); ctx.fill(); }
  // 下半截护墙板
  ctx.fillStyle = '#ffd6bd'; ctx.fillRect(0, Y(1.0), W, H - Y(1.0));
  ctx.fillStyle = 'rgba(214,140,110,0.4)';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, Y(1.0), 4, H - Y(1.0));
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 8; x < W; x += 64) ctx.fillRect(x, Y(1.0), 6, H - Y(1.0));
  // 腰线 + 踢脚线
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, Y(1.04), W, Y(0.98) - Y(1.04));
  ctx.fillStyle = '#c98a78'; ctx.fillRect(0, Y(0.98), W, 5);
  ctx.fillStyle = '#b77b6a'; ctx.fillRect(0, Y(0.1), W, H - Y(0.1));
  ctx.fillStyle = '#d99a88'; ctx.fillRect(0, Y(0.1), W, 6);
  return toTex(c);
}

export function genCeilingToon() {
  const W = 512, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6ff'; ctx.fillRect(0, 0, W, H);
  return toTex(c);
}
// 天花板上的夜光星星（自发光贴图：只有星星是亮的）
export function genCeilingStars() {
  const W = 512, H = 1024;
  const col = makeCanvas(W, H), em = makeCanvas(W, H);
  const cc = col.getContext('2d'), ec = em.getContext('2d');
  cc.fillStyle = '#efe6ff'; cc.fillRect(0, 0, W, H);
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  const rnd = mulberry32(621);
  for (let k = 0; k < 46; k++) {
    const x = 30 + rnd() * (W - 60), y = 30 + rnd() * (H - 60), r = 9 + rnd() * 16, rot = rnd();
    for (const [ctx, f] of [[cc, '#f4ffc8'], [ec, '#d8ff9a']]) { ctx.fillStyle = f; star(ctx, x, y, r, rot); ctx.fill(); }
  }
  // 一个大月亮贴纸
  for (const [ctx, f] of [[cc, '#fff6c0'], [ec, '#fff0a0']]) {
    ctx.fillStyle = f; ctx.beginPath(); ctx.arc(W * 0.3, H * 0.55, 60, 0, 6.28); ctx.fill();
    ctx.fillStyle = ctx === cc ? '#efe6ff' : '#000'; ctx.beginPath(); ctx.arc(W * 0.3 + 30, H * 0.55 - 18, 52, 0, 6.28); ctx.fill();
  }
  return { map: toTex(col), emissiveMap: toTex(em) };
}

// ---------- 木头：平涂 + 几道弧线木纹 ----------
export function genWoodToon({ base = '#e9a86a', line = '#c47a44', seed = 1 } = {}) {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(630 + seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    const y = rnd() * S;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 30, S * 0.7, y + (rnd() - 0.5) * 30, S, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTex(c);
}

// 平涂的纯色 + 细纹布
export function genFlat(color, { S = 64, pattern = null, fg = '#ffffff', step = 16, r = 3 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
  if (pattern === 'dots') {
    ctx.fillStyle = fg;
    for (let y = 0; y <= S; y += step) for (let x = 0; x <= S; x += step) { const ox = ((y / step) % 2) * (step / 2); ctx.beginPath(); ctx.arc(x + ox, y, r, 0, 6.28); ctx.fill(); }
  } else if (pattern === 'stripes') {
    ctx.fillStyle = fg;
    for (let x = 0; x < S; x += step) ctx.fillRect(x, 0, step / 2, S);
  } else if (pattern === 'check') {
    ctx.fillStyle = fg;
    for (let y = 0; y < S; y += step) for (let x = (y / step) % 2 ? step : 0; x < S; x += step * 2) ctx.fillRect(x, y, step, step);
  } else if (pattern === 'hearts') {
    ctx.fillStyle = fg;
    for (let y = step / 2; y < S; y += step) for (let x = step / 2 + ((y / step) % 2 ? step / 2 : 0); x < S; x += step) { heart(ctx, x, y, r); ctx.fill(); }
  } else if (pattern === 'stars') {
    ctx.fillStyle = fg;
    for (let y = step / 2; y < S; y += step) for (let x = step / 2 + ((y / step) % 2 ? step / 2 : 0); x < S; x += step) { star(ctx, x, y, r); ctx.fill(); }
  }
  return toTex(c);
}

// ---------- 窗帘：天蓝色，印着月亮和星星 ----------
export function genCurtainToon() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#8fc8f5'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = 0; x < S; x += 16) ctx.fillRect(x, 0, 6, S);
  const rnd = mulberry32(641);
  for (let k = 0; k < 10; k++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = '#fff3a8';
    if (k % 3 === 0) { ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill(); ctx.fillStyle = '#8fc8f5'; ctx.beginPath(); ctx.arc(x + 6, y - 4, 10, 0, 6.28); ctx.fill(); }
    else { star(ctx, x, y, 8, rnd()); ctx.fill(); }
  }
  return toTex(c);
}

export function genNetToon() {
  const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,240,250,0.85)'; ctx.lineWidth = 1.2;
  for (let k = 0; k <= S; k += 8) {
    ctx.beginPath(); ctx.moveTo(k + 0.5, 0); ctx.lineTo(k + 0.5, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k + 0.5); ctx.lineTo(S, k + 0.5); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,200,230,0.12)'; ctx.fillRect(0, 0, S, S);
  return toTex(c);
}

// 被子上的大花：卡通五瓣花 + 叶子
export function genFloralToon() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(651);
  ctx.fillStyle = '#ffe79a'; ctx.fillRect(0, 0, S, S);
  const cols = ['#ff9fb8', '#9fd4ff', '#ffb36e', '#c5a8ff'];
  for (let k = 0; k < 26; k++) {
    const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 16;
    for (let dx = -S; dx <= S; dx += S) for (let dy = -S; dy <= S; dy += S) {
      ctx.save(); ctx.translate(x + dx, y + dy);
      ctx.fillStyle = '#7fcf8a'; ctx.beginPath(); ctx.ellipse(r * 1.1, r * 0.4, r * 0.5, r * 0.22, 0.6, 0, 6.28); ctx.fill();
      ctx.fillStyle = cols[k % cols.length];
      for (let p = 0; p < 5; p++) { ctx.rotate((Math.PI * 2) / 5); ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.42, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }
  return toTex(c);
}

export function genCardboardToon({ print = null } = {}) {
  const W = 512, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c894'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(200,140,90,0.35)'; ctx.fillRect(0, H * 0.45, W, 18);
  ctx.strokeStyle = '#8a5a44'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  // 纸箱上画的笑脸
  ctx.beginPath(); ctx.arc(W / 2, H * 0.55, 42, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = '#8a5a44'; ctx.beginPath(); ctx.arc(W / 2 - 34, H * 0.4, 8, 0, 6.28); ctx.arc(W / 2 + 34, H * 0.4, 8, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ff9fb8'; ctx.beginPath(); ctx.arc(W / 2 - 60, H * 0.56, 14, 0, 6.28); ctx.arc(W / 2 + 60, H * 0.56, 14, 0, 6.28); ctx.fill();
  if (print === '350') { ctx.fillStyle = '#8a5a44'; ctx.font = `bold 40px ${ROUND}`; ctx.textAlign = 'center'; ctx.fillText('350ml × 24', W / 2, H * 0.92); }
  return toTex(c);
}

// ---------- 窗外夜景：深蓝夜空、大月亮、星星、对面楼亮着暖黄的灯 ----------
function nightSky(ctx, W, H, rnd, horizon = 0.7) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * horizon);
  sky.addColorStop(0, '#141a4a'); sky.addColorStop(0.6, '#2c3a86'); sky.addColorStop(1, '#6a5fb0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 260; k++) {
    const x = rnd() * W, y = rnd() * H * horizon * 0.9, r = rnd() < 0.9 ? 1 + rnd() * 1.5 : 3;
    ctx.fillStyle = `rgba(255,${240 + rnd() * 15},${200 + rnd() * 55},${0.5 + rnd() * 0.5})`;
    if (r > 2) { star(ctx, x, y, 7, rnd(), 4, 0.3); ctx.fill(); } else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); }
  }
  // 卡通云
  for (let k = 0; k < 6; k++) {
    const x = rnd() * W, y = H * (0.15 + rnd() * 0.35);
    ctx.fillStyle = 'rgba(150,140,220,0.35)';
    for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(x + q * 36, y - (q % 2) * 16, 34, 0, 6.28); ctx.fill(); }
  }
}
function moon(ctx, x, y, r, face = true) {
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3);
  glow.addColorStop(0, 'rgba(255,245,190,0.5)'); glow.addColorStop(1, 'rgba(255,245,190,0)');
  ctx.fillStyle = glow; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  ctx.fillStyle = '#fff4b8'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(230,210,140,0.6)';
  for (const [dx, dy, rr] of [[-0.35, -0.3, 0.16], [0.4, 0.3, 0.12], [0.1, 0.5, 0.09]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 6.28); ctx.fill(); }
  if (face) {
    // 睡着的月亮
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.02, r * 0.14, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.02, r * 0.14, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + r * 0.28, r * 0.12, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,160,0.55)'; ctx.beginPath(); ctx.arc(x - r * 0.52, y + r * 0.2, r * 0.12, 0, 6.28); ctx.arc(x + r * 0.52, y + r * 0.2, r * 0.12, 0, 6.28); ctx.fill();
  }
}
export function genWindowViewNight() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(661);
  nightSky(ctx, W, H, rnd, 0.75);
  // 窗户里能看到的是贴图中间偏上那一块：月亮放在那儿
  moon(ctx, W * 0.6, H * 0.33, 62);
  // 对面宿舍楼：马卡龙色，一格格暖黄的窗，窗里是各种小动物的剪影（楼放低一点，露出夜空）
  const bx = W * 0.05, bw = W * 0.9, by = H * 0.5, bh = H * 0.5;
  ctx.fillStyle = '#e8a8a0'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#c98a88'; ctx.fillRect(bx, by, bw, 22);
  ctx.fillStyle = 'rgba(40,30,80,0.35)'; ctx.fillRect(bx, by, bw, bh);
  const cols = 14, rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = bx + 30 + k * (bw - 60) / cols, y = by + 40 + r * (bh - 60) / rows;
      const ww = (bw - 60) / cols - 34, wh = (bh - 60) / rows - 40;
      const lit = rnd() < 0.72;
      ctx.fillStyle = lit ? ['#ffd97a', '#ffc27a', '#ffe7a8', '#ffb8d0', '#b8e8ff'][(rnd() * 5) | 0] : '#2a2a5a';
      ctx.beginPath(); ctx.roundRect(x, y, ww, wh, 8); ctx.fill();
      if (lit && rnd() < 0.55) {
        // 剪影：小鸡 / 马头 / 猴子
        ctx.fillStyle = 'rgba(90,50,60,0.55)';
        const sx = x + ww * (0.3 + rnd() * 0.4), sy = y + wh;
        const kind = (rnd() * 3) | 0;
        ctx.beginPath();
        if (kind === 0) { ctx.ellipse(sx, sy - 18, 16, 20, 0, Math.PI, 0); ctx.arc(sx, sy - 40, 10, 0, 6.28); }
        else if (kind === 1) { ctx.ellipse(sx, sy - 16, 18, 18, 0, Math.PI, 0); ctx.ellipse(sx + 6, sy - 42, 9, 16, 0.4, 0, 6.28); }
        else { ctx.ellipse(sx, sy - 16, 16, 18, 0, Math.PI, 0); ctx.arc(sx, sy - 40, 11, 0, 6.28); ctx.arc(sx - 12, sy - 42, 5, 0, 6.28); ctx.arc(sx + 12, sy - 42, 5, 0, 6.28); }
        ctx.fill();
      }
      ctx.fillStyle = '#f7e0d8'; ctx.fillRect(x - 6, y + wh, ww + 12, 8);
    }
  }
  // 楼顶一串彩旗
  ctx.strokeStyle = '#3a2a4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.quadraticCurveTo(W / 2, by + 60, bx + bw, by + 6); ctx.stroke();
  for (let k = 0; k < 30; k++) {
    const t = k / 30, x = bx + bw * t, y = by + 6 + Math.sin(t * Math.PI) * 27;
    ctx.fillStyle = ['#ff8fb1', '#ffd36e', '#8fe3ff', '#b6ff8f'][k % 4];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20, y); ctx.lineTo(x + 10, y + 22); ctx.fill();
  }
  // 楼下的树（深蓝绿，一团团）
  for (let k = 0; k < 70; k++) {
    ctx.fillStyle = `hsl(${160 + rnd() * 30},${35 + rnd() * 15}%,${16 + rnd() * 12}%)`;
    ctx.beginPath(); ctx.arc(rnd() * W, H * 0.82 + rnd() * H * 0.25, 40 + rnd() * 60, 0, 6.28); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

export function genParkViewNight() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(671);
  nightSky(ctx, W, H, rnd, 0.62);
  moon(ctx, W * 0.3, H * 0.2, 80);
  ctx.fillStyle = '#2a3070';
  ctx.beginPath(); ctx.moveTo(0, H * 0.56);
  for (let x = 0; x <= W; x += 64) ctx.lineTo(x, H * 0.5 - Math.sin(x * 0.004) * 50 - rnd() * 10);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // 教学楼（亮着零星几盏灯）
  const bx = W * 0.64, by = H * 0.3, bw = W * 0.3, bh = H * 0.34;
  ctx.fillStyle = '#6a5a9a'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#e8a8a0'; ctx.fillRect(bx - 10, by - 18, bw + 20, 22);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
    ctx.fillStyle = rnd() < 0.3 ? '#ffd97a' : '#3a3a6a';
    ctx.beginPath(); ctx.roundRect(bx + 24 + k * (bw - 40) / 9, by + 30 + r * (bh - 40) / 4, (bw - 40) / 9 - 18, (bh - 40) / 4 - 26, 6); ctx.fill();
  }
  for (let k = 0; k < 150; k++) {
    ctx.fillStyle = `hsl(${160 + rnd() * 35},${30 + rnd() * 18}%,${14 + rnd() * 12}%)`;
    ctx.beginPath(); ctx.arc(rnd() * W, H * 0.5 + rnd() * H * 0.14, 26 + rnd() * 50, 0, 6.28); ctx.fill();
  }
  // 萤火虫
  for (let k = 0; k < 60; k++) { ctx.fillStyle = 'rgba(220,255,140,0.8)'; ctx.beginPath(); ctx.arc(rnd() * W, H * 0.55 + rnd() * H * 0.4, 2 + rnd() * 2, 0, 6.28); ctx.fill(); }
  const lawn = ctx.createLinearGradient(0, H * 0.62, 0, H);
  lawn.addColorStop(0, '#1f5a5a'); lawn.addColorStop(1, '#174a4a');
  ctx.fillStyle = lawn; ctx.fillRect(0, H * 0.64, W, H * 0.36);
  return toTex(c, { wrap: false });
}
export function genLawnNight() {
  const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(672);
  ctx.fillStyle = '#1d5652'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 5000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(10,40,40,0.35)' : 'rgba(80,160,140,0.25)'; ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 2, 3 + rnd() * 4); }
  // 一朵朵小花
  for (let k = 0; k < 120; k++) { ctx.fillStyle = ['#ffb8cc', '#fff3a8', '#c9b8ff'][k % 3]; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * (H - 80), 3, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = '#8a86a8'; ctx.fillRect(0, H - 70, W, 70);
  ctx.strokeStyle = 'rgba(60,55,90,0.6)'; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, H - 70); ctx.lineTo(x, H); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// ---------- 小猫脸挂钟 ----------
export function genClockFaceToon() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff6e6'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#ffd2b5'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.46, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.4, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#6a4a5a'; ctx.font = `bold 58px ${ROUND}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    if (h % 3 === 0) ctx.fillText(String(h), S / 2 + Math.cos(a) * S * 0.33, S / 2 + Math.sin(a) * S * 0.33);
    else { ctx.fillStyle = '#ff9fb8'; ctx.beginPath(); ctx.arc(S / 2 + Math.cos(a) * S * 0.34, S / 2 + Math.sin(a) * S * 0.34, 9, 0, 6.28); ctx.fill(); ctx.fillStyle = '#6a4a5a'; }
  }
  ctx.fillStyle = 'rgba(255,150,170,0.5)'; ctx.beginPath(); ctx.arc(S * 0.3, S * 0.62, 26, 0, 6.28); ctx.arc(S * 0.7, S * 0.62, 26, 0, 6.28); ctx.fill();
  return toTex(c, { wrap: false });
}

export function genMousepadToon() {
  const W = 512, H = 384, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd0e0'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; for (let k = 0; k < 20; k++) { heart(ctx, (k * 97) % W, (k * 61) % H, 14); ctx.fill(); }
  ctx.fillStyle = '#ff7aa0'; ctx.font = `bold 44px ${ROUND}`; ctx.textAlign = 'center'; ctx.fillText('GG!', W / 2, H * 0.58);
  return toTex(c, { wrap: false });
}

// ---------- 海报（谐音梗）----------
export function genPosterToon(kind) {
  const W = 360, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const bg = { chicken: ['#ffd36e', '#ff8f6e'], horse: ['#9fd4ff', '#b89fff'], monkey: ['#ffb8cc', '#ff8fb1'], sleep: ['#2c3a86', '#6a5fb0'] }[kind];
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.arc(W / 2, H * 0.4, 40 + k * 22, -0.2 + k * 0.5, k * 0.5 + 0.1); ctx.lineTo(W / 2, H * 0.4); ctx.fill(); }
  ctx.lineWidth = 8; ctx.strokeStyle = '#4a3350'; ctx.lineJoin = 'round';
  const cx = W / 2, cy = H * 0.4;
  if (kind === 'chicken') {
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(cx, cy + 20, 90, 100, 0, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(cx - 20, cy - 80, 20, 0, 6.28); ctx.arc(cx + 5, cy - 88, 22, 0, 6.28); ctx.arc(cx + 28, cy - 78, 18, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy); ctx.lineTo(cx, cy + 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3350'; ctx.beginPath(); ctx.arc(cx - 30, cy - 22, 9, 0, 6.28); ctx.arc(cx + 30, cy - 22, 9, 0, 6.28); ctx.fill();
    // 手柄
    ctx.fillStyle = '#6a6aff'; ctx.beginPath(); ctx.roundRect(cx - 60, cy + 60, 120, 44, 20); ctx.fill(); ctx.stroke();
  } else if (kind === 'horse') {
    ctx.fillStyle = '#c98a5a'; ctx.beginPath(); ctx.ellipse(cx, cy, 70, 120, 0.15, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.ellipse(cx + 16, cy + 70, 56, 44, 0.15, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a3a5a'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(cx - 60 + k * 8, cy - 90 + k * 34, 22, 30, 0.5, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#4a3350'; ctx.beginPath(); ctx.arc(cx - 20, cy - 30, 10, 0, 6.28); ctx.arc(cx + 30, cy - 24, 10, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.font = `bold 60px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('¥', cx + 110, cy - 90); ctx.fillText('¥', cx - 120, cy + 40);
  } else if (kind === 'monkey') {
    ctx.fillStyle = '#9a6a4a'; ctx.beginPath(); ctx.arc(cx, cy, 95, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - 100, cy, 30, 0, 6.28); ctx.arc(cx + 100, cy, 30, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5d8b8'; ctx.beginPath(); ctx.ellipse(cx, cy + 20, 70, 60, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(cx - 70, cy - 20, 60, 30, 10); ctx.roundRect(cx + 10, cy - 20, 60, 30, 10); ctx.fill(); ctx.fillRect(cx - 12, cy - 12, 24, 6);
    ctx.strokeStyle = '#4a3350'; ctx.beginPath(); ctx.arc(cx, cy + 36, 26, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { star(ctx, 40 + (k * 57) % (W - 80), 40 + (k * 83) % 150, 12); ctx.fill(); }
  } else {
    moon(ctx, cx, cy - 20, 90);
  }
  const title = { chicken: '鸡不可失', horse: '马上暴富', monkey: '猴赛雷', sleep: '早睡早起' }[kind];
  const sub = { chicken: '咯咯哒电竞战队 · 冲冲冲', horse: '刷完这条就睡（骗你的）', monkey: '全宿舍最靓的仔', sleep: '（已被划掉）' }[kind];
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4a3350'; ctx.lineWidth = 10;
  ctx.font = `bold 72px ${SANS}`; ctx.textAlign = 'center';
  ctx.strokeText(title, cx, H * 0.84); ctx.fillText(title, cx, H * 0.84);
  ctx.font = `bold 22px ${SANS}`; ctx.fillStyle = '#4a3350'; ctx.fillText(sub, cx, H * 0.93);
  if (kind === 'sleep') { ctx.strokeStyle = '#ff4a6a'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(40, H * 0.78); ctx.lineTo(W - 40, H * 0.88); ctx.stroke(); }
  ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; ctx.strokeRect(6, 6, W - 12, H - 12);
  return toTex(c, { wrap: false });
}

// 圆地毯
export function genRugToon() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const cols = ['#ffb8cc', '#fff3c4', '#bfeed6', '#d9ccff', '#ffd2b5', '#ffffff'];
  for (let k = 0; k < 6; k++) { ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.49 - k * 38, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = '#ff9fb8'; heart(ctx, S / 2, S / 2, 40); ctx.fill();
  // 流苏
  ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4;
  for (let a = 0; a < 6.28; a += 0.08) { ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * S * 0.47, S / 2 + Math.sin(a) * S * 0.47); ctx.lineTo(S / 2 + Math.cos(a) * S * 0.5, S / 2 + Math.sin(a) * S * 0.5); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// ---------- 鸡们在打的游戏：横版闯关（每帧重画一小块画布）----------
export function drawGameScreen(c, t, { seed = 0, boss = false, paused = false, off = false } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  if (off) { ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, W, H); return; }
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, boss ? '#5a2a7a' : '#7ad0ff'); sky.addColorStop(1, boss ? '#ff6a8a' : '#d8f4ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sc = (t * 60) % W;
  // 远山 + 云
  ctx.fillStyle = boss ? '#3a1a5a' : '#8fd6a0';
  for (let k = -1; k < 5; k++) { const x = k * 90 - (sc * 0.3) % 90; ctx.beginPath(); ctx.arc(x, H * 0.78, 60, Math.PI, 0); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 4; k++) { const x = ((k * 97 - t * 20) % (W + 60) + W + 60) % (W + 60) - 30; ctx.beginPath(); ctx.arc(x, 20 + k * 9, 10, 0, 6.28); ctx.arc(x + 12, 18 + k * 9, 12, 0, 6.28); ctx.arc(x + 24, 20 + k * 9, 9, 0, 6.28); ctx.fill(); }
  // 地面砖块
  for (let x = -((t * 60) % 16); x < W; x += 16) { ctx.fillStyle = (Math.floor((x + t * 60) / 16) % 2) ? '#c8763a' : '#d98a4a'; ctx.fillRect(x, H * 0.82, 16, H * 0.18); }
  ctx.fillStyle = '#6ac05a'; ctx.fillRect(0, H * 0.8, W, 5);
  // 主角：一只小鸡在跳
  const jy = Math.abs(Math.sin(t * 4)) * 26;
  const px = W * 0.3, py = H * 0.8 - 14 - jy;
  ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ff4a4a'; ctx.beginPath(); ctx.arc(px, py - 11, 4, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ffa020'; ctx.beginPath(); ctx.moveTo(px + 9, py - 2); ctx.lineTo(px + 17, py); ctx.lineTo(px + 9, py + 3); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(px + 3, py - 5, 3, 3);
  // 子弹 + 敌人
  for (let k = 0; k < 4; k++) {
    const bx = px + 20 + ((t * 180 + k * 40) % (W * 0.7));
    ctx.fillStyle = '#ffe14d'; ctx.fillRect(bx, py - 1, 7, 3);
  }
  const ex = W - ((t * 50 + seed * 40) % (W * 0.6)) - 10;
  ctx.fillStyle = boss ? '#a02aff' : '#6a4aff';
  const er = boss ? 26 : 12;
  ctx.beginPath(); ctx.arc(ex, H * 0.8 - er, er, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - er * 0.35, H * 0.8 - er * 1.2, er * 0.25, 0, 6.28); ctx.fill();
  // 爆炸星星
  if (Math.sin(t * 5 + seed) > 0.8) { ctx.fillStyle = '#ffec5a'; star(ctx, ex - 10, H * 0.8 - er, 16, t * 3, 8, 0.45); ctx.fill(); }
  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 16);
  ctx.fillStyle = '#ff5a7a'; ctx.fillRect(4, 4, 60 * (0.5 + 0.5 * Math.sin(t * 0.3 + seed)), 8);
  ctx.fillStyle = '#fff'; ctx.font = `bold 11px ${SANS}`; ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${String(Math.floor(t * 137 + seed * 1000) % 100000).padStart(5, '0')}`, W - 4, 12);
  if (boss) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 16px ${SANS}`; ctx.fillText('BOSS 战！', W / 2, 34); }
  if (paused) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 22px ${SANS}`; ctx.fillText('暂停中……', W / 2, H / 2); }
}

// ---------- 马们刷的短视频：一条条往上滑 ----------
export function drawPhoneFeed(c, t, seed = 0) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const cols = [['#ff9fb8', '#ffd36e'], ['#8fe3ff', '#b89fff'], ['#b6ff8f', '#6ad0c0'], ['#ffb36e', '#ff6a8a']];
  const slot = Math.floor(t / 2.2 + seed), f = (t / 2.2 + seed) % 1;
  const off = f > 0.85 ? (f - 0.85) / 0.15 : 0; // 上滑动画
  for (let k = 0; k < 2; k++) {
    const idx = slot + k, y = (k - off) * H;
    const cc = cols[((idx % 4) + 4) % 4];
    const g = ctx.createLinearGradient(0, y, 0, y + H); g.addColorStop(0, cc[0]); g.addColorStop(1, cc[1]);
    ctx.fillStyle = g; ctx.fillRect(0, y, W, H);
    // 视频里的东西：一个在跳舞的圆圈小人
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const bob = Math.sin(t * 8 + idx) * 10;
    ctx.beginPath(); ctx.arc(W / 2, y + H * 0.42 + bob, W * 0.18, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#4a3350'; ctx.beginPath(); ctx.arc(W / 2 - 12, y + H * 0.4 + bob, 5, 0, 6.28); ctx.arc(W / 2 + 12, y + H * 0.4 + bob, 5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${W * 0.11}px ${SANS}`; ctx.textAlign = 'left';
    ctx.fillText(['@猴哥日常', '@鸡你太美', '@马上就睡', '@宿管阿姨'][((idx % 4) + 4) % 4], 10, y + H * 0.86);
    ctx.textAlign = 'center'; ctx.font = `${W * 0.12}px ${SANS}`;
    ctx.fillText('❤', W - 22, y + H * 0.55); ctx.font = `${W * 0.07}px ${SANS}`; ctx.fillText(`${(idx * 37 % 90) + 9}.${idx % 10}w`, W - 22, y + H * 0.61);
  }
}
