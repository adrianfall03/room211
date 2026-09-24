// 废墟章贴图：几十年没人住的 211——剥落的墙皮露出红砖、霉斑、水渍、碎地砖、破窗帘……
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, HAND, SANS } from './textures.js';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';

// ---------- 通用：把任意贴图"做旧"：去饱和、发黄、发暗、霉点水渍，可选破洞 ----------
let GRIME = null;
function grimePattern() {
  if (GRIME) return GRIME;
  const S = 256, c = makeCanvas(S, S);
  const { fbm } = createNoise(777);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / S) * 5, (y / S) * 5, 4, 5, 5);
    const v = clamp(150 + n * 150, 0, 255);
    d[i] = v; d[i + 1] = v * 0.96; d[i + 2] = v * 0.88; d[i + 3] = 255;
  });
  GRIME = c;
  return c;
}
let FILTER_OK = null;
function filterOK() {
  if (FILTER_OK === null) { const ctx = makeCanvas(2, 2).getContext('2d'); ctx.filter = 'sepia(1)'; FILTER_OK = ctx.filter === 'sepia(1)'; }
  return FILTER_OK;
}
export function aged(src, { seed = 1, sepia = 0.6, dark = 0.72, stains = 10, holes = 0, fade = 0.2, wrap = true, repeat = null } = {}) {
  const img = src.image || src;
  const W = img.width, H = img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  if (filterOK()) {
    ctx.filter = `sepia(${sepia}) saturate(${1 - fade * 1.5}) brightness(${dark + 0.12})`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
  } else {
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H), d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], l = r * 0.3 + g * 0.59 + b * 0.11;
      d[i] = lerp(r, l * 1.08 + 12, sepia) * (dark + 0.12); d[i + 1] = lerp(g, l * 0.95 + 6, sepia) * (dark + 0.12); d[i + 2] = lerp(b, l * 0.72, sepia) * (dark + 0.12);
    }
    ctx.putImageData(data, 0, 0);
  }
  // 一层斑驳的污垢（相乘）
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = ctx.createPattern(grimePattern(), 'repeat');
  ctx.translate((seed * 97) % 256, (seed * 53) % 256);
  ctx.fillRect(-256, -256, W + 512, H + 512);
  ctx.restore();
  const rnd = mulberry32(seed * 31 + 5);
  // 水渍：一圈圈发黄的边
  for (let k = 0; k < stains; k++) {
    const x = rnd() * W, y = rnd() * H, r = (0.05 + rnd() * 0.18) * Math.min(W, H);
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    g.addColorStop(0, 'rgba(90,70,40,0.05)'); g.addColorStop(0.85, 'rgba(90,65,30,0.28)'); g.addColorStop(1, 'rgba(90,65,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // 霉点
  for (let k = 0; k < stains * 8; k++) {
    ctx.fillStyle = `rgba(${30 + rnd() * 20},${35 + rnd() * 20},${20 + rnd() * 10},${0.15 + rnd() * 0.35})`;
    const x = rnd() * W, y = rnd() * H;
    for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10, 0.6 + rnd() * 2.4, 0, Math.PI * 2); ctx.fill(); }
  }
  // 破洞（透明）
  if (holes) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < holes; k++) {
      const x = rnd() * W, y = rnd() * H, r = (0.02 + rnd() * 0.07) * Math.min(W, H);
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.35) { const rr = r * (0.5 + rnd() * 0.7); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  const t = toTex(c, { wrap });
  if (src.repeat) t.repeat.copy(src.repeat);
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// ---------- 地面：碎裂的米色地砖，个别砖块整块没了，露出水泥 ----------
export function genFloorRuin() {
  const S = 1024, tiles = 2, tp = S / tiles, grout = 9;
  const { fbm } = createNoise(311);
  const rnd = mulberry32(317);
  const missing = [false, true, false, false];
  const col = makeCanvas(S, S), hgt = makeCanvas(S, S), rou = makeCanvas(S, S);
  const cctx = col.getContext('2d'), hctx = hgt.getContext('2d'), rctx = rou.getContext('2d');
  const ci = cctx.createImageData(S, S), hi = hctx.createImageData(S, S), ri = rctx.createImageData(S, S);
  const cd = ci.data, hd = hi.data, rd = ri.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tx = (x / tp) | 0, ty = (y / tp) | 0;
      const lx = x - tx * tp, ly = y - ty * tp;
      const edge = Math.min(lx, ly, tp - 1 - lx, tp - 1 - ly);
      const n = fbm((x / S) * 6, (y / S) * 6, 4, 6, 6);
      const n2 = fbm((x / S) * 24, (y / S) * 24, 2, 24, 24);
      const i = (y * S + x) * 4;
      let r, g, b, hh, ro;
      if (missing[ty * tiles + tx] && edge > 6) {
        // 露出来的水泥：灰、坑坑洼洼
        const v = 88 + n * 50 + (n2 - 0.5) * 40;
        r = v * 0.98; g = v * 0.95; b = v * 0.88; hh = 20 + n2 * 60; ro = 250;
      } else if (edge < grout * 0.5) {
        const gv = 38 + n * 40;
        r = gv; g = gv * 0.9; b = gv * 0.75; hh = 0; ro = 250;
      } else {
        const base = 170 + (n - 0.5) * 40 + (n2 - 0.5) * 18;
        r = base; g = base * 0.9; b = base * 0.72;
        const bev = Math.min(1, (edge - grout * 0.5) / 5);
        hh = 70 + 185 * bev;
        ro = 170 + n * 70;
        // 砖面上黑黄的污垢
        const dirt = smoothstep(0.5, 0.75, n) * 0.5;
        r *= 1 - dirt; g *= 1 - dirt * 1.05; b *= 1 - dirt * 1.15;
      }
      cd[i] = r; cd[i + 1] = g; cd[i + 2] = b; cd[i + 3] = 255;
      hd[i] = hd[i + 1] = hd[i + 2] = hh; hd[i + 3] = 255;
      rd[i] = rd[i + 1] = rd[i + 2] = ro; rd[i + 3] = 255;
    }
  }
  cctx.putImageData(ci, 0, 0);
  hctx.putImageData(hi, 0, 0);
  rctx.putImageData(ri, 0, 0);
  // 裂缝：从一点往外放射的蛛网状裂纹（颜色 + 高度都刻进去）
  const crack = (x0, y0, n, len) => {
    for (let k = 0; k < n; k++) {
      let px = x0, py = y0, a = rnd() * Math.PI * 2;
      const pts = [[px, py]];
      for (let s = 0; s < len; s++) { a += (rnd() - 0.5) * 0.9; px += Math.cos(a) * (6 + rnd() * 8); py += Math.sin(a) * (6 + rnd() * 8); pts.push([px, py]); }
      for (const [ctx, colr, w] of [[cctx, 'rgba(30,24,18,0.85)', 2], [hctx, 'rgba(0,0,0,1)', 3]]) {
        ctx.strokeStyle = colr; ctx.lineWidth = w; ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
  };
  crack(200, 300, 6, 14); crack(760, 820, 5, 12); crack(300, 780, 4, 10); crack(820, 180, 3, 16);
  // 碎砖边缘的崩角
  for (let k = 0; k < 40; k++) {
    const tx = (rnd() * tiles) | 0, ty = (rnd() * tiles) | 0;
    const x = tx * tp + (rnd() < 0.5 ? 6 : tp - 6) + (rnd() - 0.5) * 8, y = ty * tp + rnd() * tp;
    const r = 4 + rnd() * 10;
    cctx.fillStyle = 'rgba(80,76,70,0.9)'; cctx.beginPath(); cctx.arc(x, y, r, 0, Math.PI * 2); cctx.fill();
    hctx.fillStyle = 'rgba(20,20,20,1)'; hctx.beginPath(); hctx.arc(x, y, r, 0, Math.PI * 2); hctx.fill();
  }
  for (let k = 0; k < 3000; k++) {
    cctx.fillStyle = rnd() < 0.6 ? 'rgba(50,40,30,0.4)' : 'rgba(200,190,170,0.25)';
    cctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  return {
    map: toTex(col),
    normalMap: toTex(normalFromHeight(hgt, 4.5), { data: true }),
    roughnessMap: toTex(rou, { data: true }),
  };
}

// 地面大尺度的脏：墙根的积灰、落叶、水渍、踩出来的脚印
export function genFloorDirtRuin(W = 512, H = 1024) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(399);
  const edge = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(55,45,32,0.75)'); g.addColorStop(1, 'rgba(55,45,32,0)');
    return g;
  };
  ctx.fillStyle = edge(0, 0, 80, 0); ctx.fillRect(0, 0, 80, H);
  ctx.fillStyle = edge(W, 0, W - 80, 0); ctx.fillRect(W - 80, 0, 80, H);
  ctx.fillStyle = edge(0, 0, 0, 70); ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = edge(0, H, 0, H - 70); ctx.fillRect(0, H - 70, W, 70);
  // 一层均匀的灰
  ctx.fillStyle = 'rgba(95,82,62,0.22)'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 220; k++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + rnd() * 0.2;
    g.addColorStop(0, `rgba(60,48,32,${a})`); g.addColorStop(1, 'rgba(60,48,32,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // 水渍的边（深色一圈）
  for (let k = 0; k < 6; k++) {
    const x = W * 0.2 + rnd() * W * 0.6, y = rnd() * H, r = 40 + rnd() * 70;
    ctx.strokeStyle = 'rgba(50,38,25,0.35)'; ctx.lineWidth = 3 + rnd() * 4;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2); ctx.stroke();
  }
  // 落叶
  for (let k = 0; k < 120; k++) {
    const nearWall = rnd() < 0.6;
    const x = nearWall ? (rnd() < 0.5 ? rnd() * 90 : W - rnd() * 90) : rnd() * W, y = rnd() * H;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 6.28);
    ctx.fillStyle = ['#6b4a22', '#8a5a26', '#5a3e1c', '#9a7430'][(rnd() * 4) | 0];
    ctx.beginPath(); ctx.ellipse(0, 0, 7 + rnd() * 6, 3 + rnd() * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,25,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.restore();
  }
  // 灰里踩出来的一串脚印（从门口到书桌）
  for (let k = 0; k < 26; k++) {
    const t = k / 26, x = W * (0.2 + t * 0.55) + (k % 2 ? 14 : -14), y = H * (0.92 - t * 0.5);
    ctx.fillStyle = 'rgba(150,135,110,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y, 9, 20, -0.4, 0, Math.PI * 2); ctx.fill();
  }
  // 碎渣
  for (let k = 0; k < 600; k++) {
    ctx.fillStyle = `rgba(${40 + rnd() * 60},${35 + rnd() * 50},${25 + rnd() * 40},${0.4 + rnd() * 0.5})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  return toTex(c, { wrap: false });
}

// ---------- 墙面：泛黄起皮的白墙、剥落处露出红砖、霉斑、水流痕、裂缝 ----------
export function genWallRuin() {
  const W = 1024, H = 1536;
  const { fbm } = createNoise(421);
  const { fbm: fbm2 } = createNoise(422);
  const c = makeCanvas(W, H);
  const brick = (x, y) => {
    const bh = 42, bw = 120, row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
    const bx = (x + off) % bw, by = y % bh;
    const mortar = bx < 7 || by < 6;
    const id = Math.floor((x + off) / bw) * 31 + row * 17;
    const v = ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1;
    return mortar ? [150, 140, 125] : [128 + v * 40, 58 + v * 18, 42 + v * 12];
  };
  pixels(c, (x, y, d, i) => {
    const hm = (H - y) / 512;
    const n = fbm((x / W) * 4, (y / H) * 6, 4, 4, 6);
    const n2 = fbm((x / W) * 16, (y / H) * 24, 2, 16, 24);
    const peel = fbm2((x / W) * 3, (y / H) * 4.5, 4, 3, 5);
    let base = 196 + (n - 0.5) * 30 + (n2 - 0.5) * 14;
    let r = base, g = base * 0.95, b = base * 0.8;
    // 墙根黑
    const band = 1 - smoothstep(0.1, 1.4, hm);
    const gAmt = clamp(band * (0.4 + n * 1.1), 0, 1);
    r = lerp(r, 70, gAmt * 0.75); g = lerp(g, 64, gAmt * 0.75); b = lerp(b, 52, gAmt * 0.75);
    // 霉斑（黑绿）
    const mold = smoothstep(0.62, 0.8, fbm2((x / W) * 7 + 3, (y / H) * 10, 3, 7, 10)) * (0.4 + band);
    r = lerp(r, 42, mold * 0.8); g = lerp(g, 50, mold * 0.8); b = lerp(b, 36, mold * 0.8);
    // 剥落：露出砖
    if (peel > 0.67) {
      const [br, bg, bb] = brick(x, y);
      const k = smoothstep(0.67, 0.7, peel);
      r = lerp(r, br * (0.8 + n2 * 0.4), k); g = lerp(g, bg * (0.8 + n2 * 0.4), k); b = lerp(b, bb * (0.8 + n2 * 0.4), k);
    } else if (peel > 0.63) {
      // 剥落边缘：翘起的漆皮，一圈阴影
      const k = smoothstep(0.63, 0.67, peel);
      r *= 1 - k * 0.35; g *= 1 - k * 0.38; b *= 1 - k * 0.4;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(423);
  // 水流痕：从天花板往下
  for (let k = 0; k < 40; k++) {
    const x = rnd() * W, y0 = rnd() * 200, len = 300 + rnd() * 900;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(95,75,45,${0.18 + rnd() * 0.2})`); g.addColorStop(1, 'rgba(95,75,45,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, 3 + rnd() * 12, len);
  }
  // 裂缝
  ctx.strokeStyle = 'rgba(35,28,20,0.8)';
  for (let k = 0; k < 7; k++) {
    let x = rnd() * W, y = rnd() * H;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 30; s++) { x += (rnd() - 0.5) * 30; y += 8 + rnd() * 18; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // 顶上一圈黄褐色水渍
  const tg = ctx.createLinearGradient(0, 0, 0, 260);
  tg.addColorStop(0, 'rgba(120,90,50,0.45)'); tg.addColorStop(1, 'rgba(120,90,50,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 260);
  return toTex(c);
}

export function genCeilingRuin() {
  const S = 512, { fbm } = createNoise(431);
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / S) * 4, (y / S) * 4, 4, 4, 4);
    let v = 190 + (n - 0.5) * 50;
    let r = v, g = v * 0.95, b = v * 0.82;
    const stain = fbm((x / S) * 2 + 7, (y / S) * 2, 3, 2, 2);
    const ring = smoothstep(0.55, 0.6, stain) - smoothstep(0.6, 0.66, stain) * 0.6;
    r -= ring * 70; g -= ring * 80; b -= ring * 95;
    const mold = smoothstep(0.66, 0.8, fbm((x / S) * 9, (y / S) * 9, 2, 9, 9));
    r = lerp(r, 50, mold * 0.7); g = lerp(g, 56, mold * 0.7); b = lerp(b, 40, mold * 0.7);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  return toTex(c);
}

// ---------- 破窗帘：褪色、撕裂、下摆被扯成一条条（透明破洞）----------
export function genCurtainRuin() {
  const W = 512, H = 512;
  const { fbm } = createNoise(441);
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const line = (x % 3) === 0 ? -8 : 0;
    const n = fbm((x / W) * 4, (y / H) * 4, 3, 4, 4);
    const sl = fbm((x / W) * 3, (y / H) * 48, 2, 3, 48);
    let v = 118 + line + (n - 0.5) * 50 + (sl - 0.5) * 24;
    // 越往下越脏
    v *= 1 - (y / H) * 0.25;
    d[i] = v * 1.02; d[i + 1] = v * 0.96; d[i + 2] = v * 0.84;
    // 破洞 + 下摆撕成条（贴图下方 = 窗帘下摆）
    const hole = fbm((x / W) * 7 + 11, (y / H) * 5, 3, 7, 5);
    const shred = (y / H) > 0.78 && (Math.sin(x * 0.11 + n * 6) > 0.35 - ((y / H) - 0.78) * 3.5);
    const a = hole > 0.7 || shred ? 0 : 255;
    d[i + 3] = a;
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(442);
  for (let k = 0; k < 14; k++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 60;
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70,55,35,0.4)'); g.addColorStop(1, 'rgba(70,55,35,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  return toTex(c);
}

// 破蚊帐：发黄、到处是洞
export function genNetRuin() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(451);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(225,210,170,0.7)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= S; k += 8) {
    ctx.beginPath(); ctx.moveTo(k + 0.5, 0); ctx.lineTo(k + 0.5 + (rnd() - 0.5) * 3, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k + 0.5); ctx.lineTo(S, k + 0.5 + (rnd() - 0.5) * 3); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,180,140,0.1)'; ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 9; k++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 30;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.4) { const rr = r * (0.5 + rnd() * 0.7); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return toTex(c);
}

// ---------- 蜘蛛网（透明底）----------
export function genCobweb(seed = 1) {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(460 + seed);
  ctx.clearRect(0, 0, S, S);
  // 网挂在左上角（贴图 (0,0)），放射线 + 一圈圈下垂的螺旋
  const spokes = 9, R = S * 0.98;
  const angs = [];
  for (let k = 0; k < spokes; k++) angs.push((k / (spokes - 1)) * (Math.PI / 2) + (rnd() - 0.5) * 0.08);
  ctx.strokeStyle = 'rgba(235,235,230,0.75)'; ctx.lineWidth = 1.6;
  for (const a of angs) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
  ctx.lineWidth = 1.1;
  for (let r = 18; r < R; r *= 1.16 + rnd() * 0.05) {
    ctx.strokeStyle = `rgba(230,230,225,${0.35 + rnd() * 0.35})`;
    ctx.beginPath();
    for (let k = 0; k < spokes - 1; k++) {
      const a0 = angs[k], a1 = angs[k + 1];
      const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const sag = r * 0.08;
      if (k === 0) ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx + sag * 0.3, my + sag, x1, y1);
    }
    ctx.stroke();
  }
  // 挂着的灰团
  for (let k = 0; k < 18; k++) {
    const a = rnd() * Math.PI / 2, r = rnd() * R * 0.8;
    ctx.fillStyle = `rgba(200,195,185,${0.2 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1 + rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

// ---------- 窗外：黄昏，对面是同样废弃的宿舍楼 ----------
export function genWindowViewRuin() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(471);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.8);
  sky.addColorStop(0, '#3d3a52'); sky.addColorStop(0.45, '#a8604a'); sky.addColorStop(0.8, '#e8a55a'); sky.addColorStop(1, '#f0c27a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.56, H * 0.44, 10, W * 0.56, H * 0.44, 480);
  sun.addColorStop(0, 'rgba(255,220,150,0.95)'); sun.addColorStop(0.15, 'rgba(255,170,90,0.55)'); sun.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 16; k++) {
    ctx.fillStyle = `rgba(${90 + rnd() * 40},${60 + rnd() * 30},${70 + rnd() * 30},0.45)`;
    ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H * 0.4, 120 + rnd() * 220, 10 + rnd() * 18, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 远处的楼只剩剪影，有的塌了一半
  for (let k = 0; k < 9; k++) {
    const x = k * 240 + rnd() * 80, h = 180 + rnd() * 200, w = 150 + rnd() * 90;
    ctx.fillStyle = '#4a3a3e';
    ctx.beginPath(); ctx.moveTo(x, H * 0.62); ctx.lineTo(x, H * 0.62 - h);
    ctx.lineTo(x + w * 0.4, H * 0.62 - h + (rnd() < 0.4 ? 40 + rnd() * 60 : 0)); ctx.lineTo(x + w * 0.7, H * 0.62 - h * (0.7 + rnd() * 0.3)); ctx.lineTo(x + w, H * 0.62 - h * 0.9); ctx.lineTo(x + w, H * 0.62); ctx.fill();
  }
  // 塔吊
  ctx.strokeStyle = '#3a2e30'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(W * 0.86, H * 0.62); ctx.lineTo(W * 0.86, H * 0.12); ctx.lineTo(W * 0.62, H * 0.14); ctx.moveTo(W * 0.86, H * 0.12); ctx.lineTo(W * 0.95, H * 0.13); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.68, H * 0.14); ctx.lineTo(W * 0.68, H * 0.3); ctx.stroke();
  // 夕阳本体（窗户里正好能看到）
  ctx.fillStyle = 'rgba(255,214,150,0.95)'; ctx.beginPath(); ctx.arc(W * 0.56, H * 0.44, 46, 0, 6.28); ctx.fill();
  // 对面宿舍楼：灰黑、窗户碎了、爬满藤（楼放低一点，露出晚霞）
  const bx = W * 0.05, bw = W * 0.9, by = H * 0.52, bh = H * 0.48;
  ctx.fillStyle = '#8a7a6a'; ctx.fillRect(bx, by, bw, bh);
  const { fbm } = createNoise(472);
  const img = ctx.getImageData(bx, by, bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = (y * bw + x) * 4, n = fbm(x / 200, y / 120, 3, 64, 64);
    const k = 0.6 + n * 0.5;
    img.data[i] *= k; img.data[i + 1] *= k * 0.97; img.data[i + 2] *= k * 0.92;
  }
  ctx.putImageData(img, bx, by);
  const cols = 14, rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = bx + 30 + k * (bw - 60) / cols, y = by + 40 + r * (bh - 60) / rows;
      const ww = (bw - 60) / cols - 34, wh = (bh - 60) / rows - 40;
      ctx.fillStyle = '#1a1614'; ctx.fillRect(x, y, ww, wh);
      // 残存的碎玻璃反着晚霞
      if (rnd() < 0.45) {
        ctx.fillStyle = `rgba(240,160,90,${0.25 + rnd() * 0.3})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ww * rnd(), y); ctx.lineTo(x, y + wh * rnd()); ctx.fill();
      }
      if (rnd() < 0.25) { ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x - 4, y + wh * 0.3, ww + 8, 10); ctx.fillRect(x - 4, y + wh * 0.6, ww + 8, 10); }
    }
  }
  // 藤蔓
  for (let k = 0; k < 7; k++) {
    let x = bx + rnd() * bw, y = by;
    for (let s = 0; s < 120; s++) {
      x += (rnd() - 0.5) * 10; y += 4 + rnd() * 4;
      ctx.fillStyle = `hsl(${60 + rnd() * 40},${25 + rnd() * 15}%,${18 + rnd() * 12}%)`;
      ctx.beginPath(); ctx.arc(x, y, 6 + rnd() * 10, 0, Math.PI * 2); ctx.fill();
      if (y > by + bh) break;
    }
  }
  // 楼下枯树
  for (let k = 0; k < 50; k++) {
    ctx.fillStyle = `hsl(${25 + rnd() * 20},${20 + rnd() * 15}%,${12 + rnd() * 10}%)`;
    ctx.beginPath(); ctx.arc(rnd() * W, H * 0.86 + rnd() * H * 0.2, 30 + rnd() * 50, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

export function genParkViewRuin() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(481);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.64);
  sky.addColorStop(0, '#4a4058'); sky.addColorStop(0.55, '#b8704e'); sky.addColorStop(1, '#e9b27a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = `rgba(80,55,65,${0.3 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.ellipse(rnd() * W, 40 + rnd() * H * 0.3, 140 + rnd() * 200, 12 + rnd() * 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 远处一群飞鸟
  ctx.strokeStyle = 'rgba(30,20,25,0.8)'; ctx.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    const x = W * 0.3 + rnd() * W * 0.3, y = H * 0.15 + rnd() * H * 0.15, s = 8 + rnd() * 8;
    ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.4); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.4); ctx.stroke();
  }
  ctx.fillStyle = '#5e4a4a';
  ctx.beginPath(); ctx.moveTo(0, H * 0.56);
  for (let x = 0; x <= W; x += 64) ctx.lineTo(x, H * 0.5 - Math.sin(x * 0.004) * 50 - rnd() * 20);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // 废弃的教学楼
  const bx = W * 0.64, by = H * 0.3, bw = W * 0.3, bh = H * 0.34;
  ctx.fillStyle = '#7a6a60'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#4a3a34'; ctx.fillRect(bx - 10, by - 18, bw * 0.6, 22);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
    ctx.fillStyle = rnd() < 0.3 ? '#3a2e2a' : '#1c1816';
    ctx.fillRect(bx + 24 + k * (bw - 40) / 9, by + 30 + r * (bh - 40) / 4, (bw - 40) / 9 - 18, (bh - 40) / 4 - 26);
  }
  for (let k = 0; k < 120; k++) {
    const x = rnd() * W, y = H * 0.52 + rnd() * H * 0.12;
    ctx.strokeStyle = `hsl(${20 + rnd() * 20},20%,${14 + rnd() * 10}%)`; ctx.lineWidth = 2 + rnd() * 3;
    ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x + (rnd() - 0.5) * 20, y - 20 - rnd() * 40); ctx.stroke();
  }
  const lawn = ctx.createLinearGradient(0, H * 0.62, 0, H);
  lawn.addColorStop(0, '#7a6a3e'); lawn.addColorStop(1, '#5e4e2e');
  ctx.fillStyle = lawn; ctx.fillRect(0, H * 0.64, W, H * 0.36);
  for (let k = 0; k < 3000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(50,40,20,0.3)' : 'rgba(170,150,90,0.25)'; ctx.fillRect(rnd() * W, H * 0.64 + rnd() * H * 0.36, 2, 4); }
  return toTex(c, { wrap: false });
}

export function genLawnRuin() {
  const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(482);
  ctx.fillStyle = '#6e5e36'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(45,35,15,0.35)' : 'rgba(170,150,90,0.3)'; ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 2, 3 + rnd() * 6); }
  ctx.fillStyle = '#8a8276'; ctx.fillRect(0, H - 70, W, 70);
  ctx.strokeStyle = 'rgba(40,35,30,0.6)'; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, H - 70); ctx.lineTo(x + (rnd() - 0.5) * 20, H); ctx.stroke(); }
  // 水泥路缝里长出来的杂草
  for (let k = 0; k < 400; k++) { ctx.fillStyle = 'rgba(90,85,40,0.6)'; ctx.fillRect(rnd() * W, H - 70 + rnd() * 70, 2, 5); }
  return toTex(c, { wrap: false });
}

// ---------- 裂了的挂钟面（永远停在 7:59）----------
export function genClockFaceRuin(base) {
  const t = aged(base, { seed: 5, sepia: 0.8, dark: 0.85, stains: 4, wrap: false });
  const c = t.image, ctx = c.getContext('2d');
  const S = c.width;
  ctx.strokeStyle = 'rgba(30,25,20,0.9)'; ctx.lineWidth = 2;
  const rnd = mulberry32(491);
  for (let k = 0; k < 6; k++) {
    let x = S * 0.62, y = S * 0.34, a = rnd() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) { a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * S * 0.05; y += Math.sin(a) * S * 0.05; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  t.needsUpdate = true;
  return t;
}

// ---------- 钉窗户的旧木板 ----------
export function genPlank(seed = 1) {
  const W = 512, H = 64, c = makeCanvas(W, H);
  const { fbm } = createNoise(500 + seed);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / W) * 40, (y / H) * 2, 3, 40, 2);
    const n2 = fbm((x / W) * 4, (y / H) * 4, 2, 4, 4);
    const v = 92 + (n - 0.5) * 60 + (n2 - 0.5) * 40;
    d[i] = v * 1.0; d[i + 1] = v * 0.82; d[i + 2] = v * 0.62; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(30,20,12,0.8)';
  for (const x of [18, W - 22]) { ctx.beginPath(); ctx.arc(x, H * 0.35, 4, 0, 6.28); ctx.arc(x, H * 0.7, 4, 0, 6.28); ctx.fill(); }
  return toTex(c, { wrap: false });
}

// ---------- 墙上刻的"正"字：数了三十年 ----------
export function genTally() {
  const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(511);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(40,30,25,0.8)'; ctx.lineCap = 'round';
  ctx.font = `bold 40px ${HAND}`; ctx.textAlign = 'left';
  let x = 30, y = 60;
  for (let k = 0; k < 64; k++) {
    ctx.fillStyle = `rgba(45,32,25,${0.55 + rnd() * 0.35})`;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.15); ctx.fillText('正', 0, 0); ctx.restore();
    x += 44 + rnd() * 6;
    if (x > W - 60) { x = 30 + rnd() * 10; y += 58; }
  }
  ctx.fillStyle = 'rgba(120,20,15,0.8)'; ctx.font = `bold 46px ${HAND}`;
  ctx.fillText('第 30 年 · 还在重修', W * 0.45, y + 80);
  return toTex(c, { wrap: false });
}

// ---------- 镜子上的脏污（擦掉之后露出口红写的字）----------
export function drawGrime(c, seed = 1) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const { fbm } = createNoise(520 + seed);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / W) * 3, (y / H) * 8, 4, 3, 8);
    const s = fbm((x / W) * 20, (y / H) * 3, 2, 20, 3);
    const v = 70 + n * 60 + (s - 0.5) * 20;
    d[i] = v * 1.05; d[i + 1] = v * 0.95; d[i + 2] = v * 0.78;
    d[i + 3] = clamp(200 + n * 60, 0, 250);
  });
  const rnd = mulberry32(530 + seed);
  for (let k = 0; k < 30; k++) {
    const x = rnd() * W, y0 = rnd() * H * 0.5, len = 60 + rnd() * 200;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(60,45,25,0.5)'); g.addColorStop(1, 'rgba(60,45,25,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, 2 + rnd() * 6, len);
  }
}
// 口红字（透明底）
export function drawLipstick(c, digit) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.fillStyle = 'rgba(190,24,40,0.92)'; ctx.strokeStyle = 'rgba(190,24,40,0.92)';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${W * 0.36}px ${HAND}`;
  ctx.fillText('②', W / 2, H * 0.3);
  ctx.font = `bold ${W * 0.8}px "Comic Sans MS", "Chalkboard SE", Arial`;
  ctx.fillText(String(digit), W / 2, H * 0.52);
  ctx.lineWidth = W * 0.035;
  // 一颗歪歪扭扭的心
  const cx = W / 2, cy = H * 0.8, s = W * 0.16;
  ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.6, cy - s * 1.3, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
  ctx.stroke();
  ctx.restore();
}

// ---------- 老式显示器（CRT）：雪花屏里偶尔闪出一个数字 ----------
export function drawCRT(c, { on = false, digit = 0, t = 0, reveal = 0 } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  if (!on) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#2a2e2c'); g.addColorStop(1, '#0c0e0d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.ellipse(W * 0.3, H * 0.25, W * 0.25, H * 0.12, -0.3, 0, 6.28); ctx.fill();
    return;
  }
  const img = ctx.createImageData(W, H), d = img.data;
  let s = (Math.floor(t * 30) * 9301 + 49297) % 233280;
  const roll = (t * 40) % H;
  for (let y = 0; y < H; y++) {
    const band = Math.abs(y - roll) < 12 ? 40 : 0;
    for (let x = 0; x < W; x++) {
      s = (s * 9301 + 49297) % 233280;
      const v = (s / 233280) * 200 + band;
      const i = (y * W + x) * 4;
      d[i] = v * 0.85; d[i + 1] = v; d[i + 2] = v * 0.9; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 数字：每隔一会儿在雪花里浮现
  const vis = reveal || Math.max(0, Math.sin(t * 1.3)) ** 6;
  if (vis > 0.02) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, vis * 1.2);
    ctx.fillStyle = '#e8fff0'; ctx.shadowColor = '#9fffc0'; ctx.shadowBlur = 16;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${H * 0.2}px ${SANS}`;
    ctx.fillText('①', W * 0.5, H * 0.24);
    ctx.font = `bold ${H * 0.5}px "Courier New", monospace`;
    ctx.fillText(String(digit), W * 0.5 + Math.sin(t * 17) * 3, H * 0.6);
    ctx.restore();
  }
  // 扫描线
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// ---------- 旧报纸 / 旧海报 ----------
export function genNewspaper() {
  const W = 512, H = 360, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(541);
  ctx.fillStyle = '#cbb892'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2a2016'; ctx.font = `bold 34px ${SANS}`; ctx.textAlign = 'left';
  ctx.fillText('校园晚报', 20, 44);
  ctx.font = `14px ${SANS}`; ctx.fillText('2056年6月18日　星期日', 330, 40);
  ctx.fillRect(20, 54, W - 40, 3);
  ctx.font = `bold 26px ${SANS}`; ctx.fillText('老宿舍楼 211 即将拆除', 20, 92);
  ctx.font = `15px ${SANS}`;
  ctx.fillText('据悉，该宿舍自 2026 年期末起便频繁出现', 20, 122);
  ctx.fillText('“有人在屋里找了三十年的门锁密码”的传闻……', 20, 142);
  for (let y = 170; y < H - 20; y += 16) { ctx.fillStyle = `rgba(40,30,20,${0.35 + rnd() * 0.3})`; ctx.fillRect(20 + (y % 3) * 4, y, 200 + rnd() * 250, 5); }
  ctx.fillStyle = '#6a5a44'; ctx.fillRect(320, 160, 170, 120);
  return aged(toTex(c, { wrap: false }), { seed: 9, sepia: 0.5, dark: 0.9, stains: 6, wrap: false });
}
export function genOldPoster() {
  const W = 360, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a4a7a'); g.addColorStop(1, '#c84a3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f4d35a'; ctx.beginPath(); ctx.arc(W / 2, H * 0.4, 110, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(W / 2, H * 0.36, 44, 0, 6.28); ctx.fill();
  ctx.fillRect(W / 2 - 60, H * 0.44, 120, 90);
  ctx.fillStyle = '#fff'; ctx.font = `bold 52px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText('峡谷之巅', W / 2, H * 0.82);
  ctx.font = `20px ${SANS}`; ctx.fillText('全国总决赛 · 2026', W / 2, H * 0.9);
  const t = aged(toTex(c, { wrap: false }), { seed: 12, sepia: 0.65, dark: 0.8, stains: 8, holes: 2, wrap: false });
  // 撕掉一个角
  const ctx2 = t.image.getContext('2d');
  ctx2.save(); ctx2.globalCompositeOperation = 'destination-out';
  ctx2.beginPath(); ctx2.moveTo(W, H); ctx2.lineTo(W - 120, H); ctx2.lineTo(W - 60, H - 40); ctx2.lineTo(W, H - 150); ctx2.fill();
  ctx2.restore();
  t.needsUpdate = true;
  return t;
}

// 画卷一样的旧日记本内页（给 3D 模型用）
export function genDiaryCover() {
  const W = 256, H = 360, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#5a2e22'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 4; ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.fillStyle = '#d8b25a'; ctx.font = `bold 40px ${HAND}`; ctx.textAlign = 'center';
  ctx.fillText('日 记', W / 2, H * 0.4);
  ctx.font = `20px ${HAND}`; ctx.fillText('请勿偷看', W / 2, H * 0.52);
  return aged(toTex(c, { wrap: false }), { seed: 14, sepia: 0.3, dark: 0.85, stains: 5, wrap: false });
}
