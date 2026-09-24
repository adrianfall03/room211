// 程序化贴图：全部用 Canvas 实时绘制，不依赖任何外部图片素材
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep } from './util.js';

let ANISO = 8;
export const setAniso = (a) => (ANISO = a);

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTex(c, { repeat = null, data = false, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// ---------- 噪声 ----------
export function createNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const p = new Uint16Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint16Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = rnd();
  const lat = (ix, iy) => val[perm[(perm[ix & 255] + (iy & 255)) & 511]];
  function noise(x, y, px = 256, py = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = lat(x0, y0), b = lat(x1, y0), c = lat(x0, y1), d = lat(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, px = 256, py = 256) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f, y * f, px * f, py * f);
      n += amp; amp *= 0.5; f *= 2;
    }
    return s / n;
  }
  return { noise, fbm };
}

export function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => s[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function pixels(c, fn) {
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      fn(x, y, d, i);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- 地砖（米色 60cm 瓷砖）----------
export function genFloor() {
  const S = 1024, tiles = 2, tp = S / tiles, grout = 7;
  const { fbm } = createNoise(11);
  const rnd = mulberry32(7);
  const tint = Array.from({ length: 4 }, () => (rnd() - 0.5) * 9);
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
      const i = (y * S + x) * 4;
      let r, g, b, hh, ro;
      if (edge < grout * 0.5) {
        const gv = 96 + n * 50;
        r = gv; g = gv * 0.92; b = gv * 0.8; hh = 0; ro = 245;
      } else {
        const base = 213 + tint[ty * tiles + tx] + (n - 0.5) * 18;
        r = base; g = base * 0.952; b = base * 0.86;
        const bev = Math.min(1, (edge - grout * 0.5) / 5);
        hh = 70 + 185 * bev;
        ro = 105 + n * 70;
      }
      cd[i] = r; cd[i + 1] = g; cd[i + 2] = b; cd[i + 3] = 255;
      hd[i] = hd[i + 1] = hd[i + 2] = hh; hd[i + 3] = 255;
      rd[i] = rd[i + 1] = rd[i + 2] = ro; rd[i + 3] = 255;
    }
  }
  cctx.putImageData(ci, 0, 0);
  hctx.putImageData(hi, 0, 0);
  rctx.putImageData(ri, 0, 0);
  // 细小斑点
  for (let k = 0; k < 2600; k++) {
    const x = rnd() * S, y = rnd() * S, r = rnd() * 1.6 + 0.3;
    cctx.fillStyle = rnd() < 0.5 ? 'rgba(120,100,80,0.35)' : 'rgba(255,250,240,0.35)';
    cctx.beginPath(); cctx.arc(x, y, r, 0, Math.PI * 2); cctx.fill();
  }
  // 一条细裂纹
  cctx.strokeStyle = 'rgba(70,60,50,0.45)';
  cctx.lineWidth = 1.2;
  cctx.beginPath();
  let px = 80, py = 600;
  cctx.moveTo(px, py);
  for (let k = 0; k < 30; k++) { px += 10 + rnd() * 6; py += (rnd() - 0.4) * 9; cctx.lineTo(px, py); }
  cctx.stroke();
  return {
    map: toTex(col),
    normalMap: toTex(normalFromHeight(hgt, 3.5), { data: true }),
    roughnessMap: toTex(rou, { data: true }),
  };
}

// 地面大尺度污渍叠加层（覆盖整个房间地面）
export function genFloorDirt(W = 512, H = 1024) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(99);
  ctx.clearRect(0, 0, W, H);
  // 墙边更脏
  const edge = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(60,48,35,0.35)');
    g.addColorStop(1, 'rgba(60,48,35,0)');
    return g;
  };
  ctx.fillStyle = edge(0, 0, 40, 0); ctx.fillRect(0, 0, 40, H);
  ctx.fillStyle = edge(W, 0, W - 40, 0); ctx.fillRect(W - 40, 0, 40, H);
  ctx.fillStyle = edge(0, 0, 0, 30); ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = edge(0, H, 0, H - 30); ctx.fillRect(0, H - 30, W, 30);
  for (let k = 0; k < 140; k++) {
    const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.12;
    g.addColorStop(0, `rgba(70,55,40,${a})`);
    g.addColorStop(1, 'rgba(70,55,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // 鞋印状的灰
  for (let k = 0; k < 60; k++) {
    const x = W * 0.35 + rnd() * W * 0.3, y = rnd() * H;
    ctx.fillStyle = `rgba(80,70,60,${0.05 + rnd() * 0.06})`;
    ctx.beginPath(); ctx.ellipse(x, y, 7, 16, rnd() * 0.6 - 0.3, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

// ---------- 墙面（白墙 + 墙根发黑的污渍）----------
export function genWall() {
  const W = 1024, H = 1536; // 2m x 3m
  const { fbm } = createNoise(21);
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const hm = (H - y) / 512;
    const n = fbm((x / W) * 4, (y / H) * 6, 4, 4, 6);
    const n2 = fbm((x / W) * 16, (y / H) * 24, 2, 16, 24);
    let base = 233 + (n - 0.5) * 9 + (n2 - 0.5) * 5;
    let r = base, g = base * 0.992, b = base * 0.958;
    const band = 1 - smoothstep(0.1, 1.05, hm);
    let gAmt = clamp(band * (0.25 + n * 1.1) + (n2 > 0.72 ? (n2 - 0.72) * 2 * band : 0), 0, 1);
    if (hm < 0.08) gAmt = Math.max(gAmt, 0.55 + n * 0.3);
    r = lerp(r, 108, gAmt * 0.62); g = lerp(g, 100, gAmt * 0.62); b = lerp(b, 90, gAmt * 0.62);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(3);
  // 竖向流痕
  for (let k = 0; k < 26; k++) {
    const x = rnd() * W, y0 = H - 500 - rnd() * 250, len = 120 + rnd() * 260;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(90,80,70,0)');
    g.addColorStop(1, `rgba(90,80,70,${0.1 + rnd() * 0.12})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 2 + rnd() * 5, len);
  }
  // 踢脚处的鞋印划痕
  for (let k = 0; k < 40; k++) {
    const x = rnd() * W, y = H - 30 - rnd() * 220;
    ctx.strokeStyle = `rgba(40,35,30,${0.12 + rnd() * 0.2})`;
    ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10 + rnd() * 50, y + (rnd() - 0.5) * 8); ctx.stroke();
  }
  // 脱落的墙皮
  for (let k = 0; k < 5; k++) {
    const x = rnd() * W, y = H - 120 - rnd() * 360, r = 12 + rnd() * 30;
    ctx.fillStyle = 'rgba(245,242,235,0.9)';
    ctx.strokeStyle = 'rgba(80,70,60,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.5) {
      const rr = r * (0.6 + rnd() * 0.5);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // 顶部一点点发黄
  const tg = ctx.createLinearGradient(0, 0, 0, 120);
  tg.addColorStop(0, 'rgba(200,190,160,0.18)');
  tg.addColorStop(1, 'rgba(200,190,160,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 120);
  return toTex(c);
}

export function genCeiling() {
  const S = 256, { fbm } = createNoise(31);
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const v = 236 + (fbm((x / S) * 4, (y / S) * 4, 3, 4, 4) - 0.5) * 12;
    d[i] = v; d[i + 1] = v * 0.99; d[i + 2] = v * 0.96; d[i + 3] = 255;
  });
  return toTex(c);
}

// ---------- 木纹 ----------
export function genWood({ base = '#6e3522', dark = '#43200f', light = '#8c4b2e', seed = 5, W = 512, H = 512, rings = 11, wear = 0.3 } = {}) {
  const { fbm } = createNoise(seed);
  const cb = hexToRgb(base), cd = hexToRgb(dark), cl = hexToRgb(light);
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const warp = fbm((x / W) * 2, (y / H) * 3, 3, 2, 3);
    const t0 = 0.5 + 0.5 * Math.sin(((y / H) * rings + warp * 3.2) * Math.PI * 2);
    const t = Math.pow(t0, 4);
    const streak = fbm((x / W) * 48, (y / H) * 2, 2, 48, 2);
    const k = clamp(t * 0.6 + (streak - 0.45) * 0.9, 0, 1);
    const hl = fbm((x / W) * 3, (y / H) * 3, 2, 3, 3);
    let r = lerp(cb[0], cd[0], k), g = lerp(cb[1], cd[1], k), b = lerp(cb[2], cd[2], k);
    const lk = clamp((hl - 0.55) * wear * 4, 0, 1);
    r = lerp(r, cl[0], lk); g = lerp(g, cl[1], lk); b = lerp(b, cl[2], lk);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed + 1);
  for (let k = 0; k < 40; k++) {
    ctx.strokeStyle = `rgba(255,230,200,${0.04 + rnd() * 0.08})`;
    ctx.lineWidth = 0.6 + rnd();
    const x = rnd() * W, y = rnd() * H;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 30); ctx.stroke();
  }
  return toTex(c);
}

export function genBlackLaminate() {
  const S = 512, { fbm } = createNoise(41);
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / S) * 8, (y / S) * 8, 3, 8, 8);
    const v = 26 + n * 12;
    d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  const rnd = mulberry32(42);
  for (let k = 0; k < 120; k++) {
    ctx.strokeStyle = `rgba(200,200,200,${0.03 + rnd() * 0.08})`;
    ctx.lineWidth = 0.5 + rnd() * 0.8;
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 10 + rnd() * 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  for (let k = 0; k < 60; k++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(180,170,150,0.08)');
    g.addColorStop(1, 'rgba(180,170,150,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c);
}

// ---------- 布料 ----------
export function genDenim({ base = '#28364d', light = '#40557a', S = 256, seed = 51 } = {}) {
  const { fbm } = createNoise(seed);
  const cb = hexToRgb(base), cl = hexToRgb(light);
  const c = makeCanvas(S, S), h = makeCanvas(S, S);
  const hctx = h.getContext('2d');
  const himg = hctx.createImageData(S, S);
  pixels(c, (x, y, d, i) => {
    const tw = ((x + y) & 3) < 2 ? 1 : 0;
    const fade = fbm((x / S) * 3, (y / S) * 3, 3, 3, 3);
    const slub = fbm((x / S) * 64, (y / S) * 4, 2, 64, 4);
    const k = clamp(0.18 * tw + 0.55 * (fade - 0.35) + 0.35 * (slub - 0.4), 0, 1);
    d[i] = lerp(cb[0], cl[0], k); d[i + 1] = lerp(cb[1], cl[1], k); d[i + 2] = lerp(cb[2], cl[2], k); d[i + 3] = 255;
    const hv = (tw * 0.6 + slub * 0.4) * 255;
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv; himg.data[i + 3] = 255;
  });
  hctx.putImageData(himg, 0, 0);
  return { canvas: c, map: toTex(c), normalMap: toTex(normalFromHeight(h, 1.2), { data: true }) };
}

// 牛仔夹克躯干贴图（车缝线、门襟、胸袋、育克）。vAt(h) 把躯干高度映射为贴图 v 坐标
export function genJacket(denimCanvas, vAt) {
  const W = 1024, H = 1024;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = ctx.createPattern(denimCanvas, 'repeat');
  ctx.fillRect(0, 0, W, H);
  const Y = (h) => (1 - vAt(h)) * H;
  const X = (u) => u * W;
  // 中间略微泛白（水洗效果）
  const fg = ctx.createRadialGradient(X(0.5), Y(0.3), 10, X(0.5), Y(0.3), 360);
  fg.addColorStop(0, 'rgba(140,160,190,0.16)');
  fg.addColorStop(1, 'rgba(140,160,190,0)');
  ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
  const stitch = (pts, off = 0) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,150,85,0.95)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = off;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  };
  const seam = (pts) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(12,18,30,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  };
  const dbl = (pts, dx = 0, dy = 6) => {
    seam(pts);
    stitch(pts.map(([x, y]) => [x - dx, y - dy]));
    stitch(pts.map(([x, y]) => [x + dx, y + dy]), 3);
  };
  // 下摆
  const hemTop = Y(0.075);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, hemTop, W, H - hemTop);
  dbl([[0, hemTop], [W, hemTop]]);
  stitch([[0, Y(0.02)], [W, Y(0.02)]]);
  // 门襟
  const px0 = X(0.5) - 16, px1 = X(0.5) + 16;
  ctx.fillStyle = 'rgba(160,180,210,0.1)'; ctx.fillRect(px0, 0, px1 - px0, H);
  seam([[px0, Y(0.52)], [px0, H]]);
  stitch([[px0 + 6, Y(0.52)], [px0 + 6, H]]);
  stitch([[px1 - 6, Y(0.52)], [px1 - 6, H]], 2);
  // 两侧褶线（牛仔夹克前片竖线）
  for (const u of [0.41, 0.59]) {
    dbl([[X(u), Y(0.075)], [X(u), Y(0.3)]], 6, 0);
  }
  // 胸前育克
  const yy = Y(0.395);
  dbl([[X(0.3), yy], [X(0.41), yy + 18], [X(0.48), yy + 8]]);
  dbl([[X(0.52), yy + 8], [X(0.59), yy + 18], [X(0.7), yy]]);
  // 后背育克
  dbl([[X(0.8), Y(0.41)], [X(1.0), Y(0.41)]]);
  dbl([[X(0.0), Y(0.41)], [X(0.2), Y(0.41)]]);
  // 后背竖线
  for (const u of [0.07, 0.93]) dbl([[X(u), Y(0.075)], [X(u), Y(0.41)]], 6, 0);
  // 侧缝
  for (const u of [0.25, 0.75]) seam([[X(u), 0], [X(u), H]]);
  // 胸袋
  for (const u of [0.425, 0.575]) {
    const w = 78, top = Y(0.36), bot = Y(0.27);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(X(u) - w / 2, top, w, bot - top);
    stitch([[X(u) - w / 2 + 4, top], [X(u) - w / 2 + 4, bot - 4], [X(u) + w / 2 - 4, bot - 4], [X(u) + w / 2 - 4, top]]);
  }
  return toTex(c);
}

export function genCloth({ base = '#6f737a', S = 256, seed = 61, vertical = true, contrast = 1, slub = 1 } = {}) {
  const { fbm } = createNoise(seed);
  const cb = hexToRgb(base);
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const line = vertical ? ((x % 3) === 0 ? -6 : 0) : ((y % 3) === 0 ? -6 : 0);
    const sl = fbm((x / S) * (vertical ? 3 : 48), (y / S) * (vertical ? 48 : 3), 2, vertical ? 3 : 48, vertical ? 48 : 3);
    const big = fbm((x / S) * 4, (y / S) * 4, 3, 4, 4);
    const k = line * contrast + (sl - 0.5) * 22 * slub + (big - 0.5) * 16;
    d[i] = clamp(cb[0] + k, 0, 255); d[i + 1] = clamp(cb[1] + k, 0, 255); d[i + 2] = clamp(cb[2] + k, 0, 255); d[i + 3] = 255;
  });
  return toTex(c);
}

export function genNet() {
  const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= S; k += 8) {
    ctx.beginPath(); ctx.moveTo(k + 0.5, 0); ctx.lineTo(k + 0.5, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k + 0.5); ctx.lineTo(S, k + 0.5); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, 0, S, S);
  return toTex(c);
}

export function genBambooMat() {
  const W = 256, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(71);
  for (let y = 0; y < H; y += 8) {
    const g = ctx.createLinearGradient(0, y, 0, y + 8);
    const t = 190 + rnd() * 30;
    g.addColorStop(0, `rgb(${t},${t * 0.82},${t * 0.5})`);
    g.addColorStop(0.5, `rgb(${t + 20},${(t + 20) * 0.84},${(t + 20) * 0.55})`);
    g.addColorStop(1, `rgb(${t - 40},${(t - 40) * 0.8},${(t - 40) * 0.45})`);
    ctx.fillStyle = g; ctx.fillRect(0, y, W, 8);
  }
  ctx.fillStyle = 'rgba(90,60,30,0.6)';
  for (let x = 20; x < W; x += 64) for (let y = 0; y < H; y += 8) ctx.fillRect(x, y + 2, 3, 4);
  return toTex(c);
}

export function genFloral() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(81);
  ctx.fillStyle = '#e6c35a'; ctx.fillRect(0, 0, S, S);
  const flower = (x, y, r, col) => {
    for (let dx = -S; dx <= S; dx += S) for (let dy = -S; dy <= S; dy += S) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(rnd() * 6);
      ctx.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.beginPath(); ctx.ellipse(r * 0.6, 0, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f4e9c8';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };
  for (let k = 0; k < 70; k++) {
    const cols = ['#4a6fa5', '#7b4a2e', '#3f7f7a', '#c26a3a', '#5a5e9a'];
    flower(rnd() * S, rnd() * S, 10 + rnd() * 18, cols[(rnd() * cols.length) | 0]);
  }
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = 'rgba(80,110,70,0.7)';
    ctx.beginPath(); ctx.ellipse(rnd() * S, rnd() * S, 8, 3, rnd() * 6, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c);
}

export function genPolka({ base = '#1c2946', dot = '#e9eef7', S = 128, step = 16, r = 3.2 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = dot;
  for (let y = 0; y <= S; y += step) for (let x = 0; x <= S; x += step) {
    const ox = ((y / step) % 2) * (step / 2);
    ctx.beginPath(); ctx.arc(x + ox, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c);
}

export function genYellowDots() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#e8d63c'; ctx.fillRect(0, 0, S, S);
  for (let y = 16; y < S; y += 42) for (let x = 16; x < S; x += 42) {
    ctx.fillStyle = '#3558c9';
    ctx.beginPath(); ctx.arc(x + 5, y + 5, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a7ae0';
    ctx.beginPath(); ctx.arc(x + 1, y + 1, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, S - 6, S - 6);
  return toTex(c);
}

export function genPatternRoll() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(91);
  ctx.fillStyle = '#121213'; ctx.fillRect(0, 0, S, S);
  const cols = ['#e2b73c', '#4f86c6', '#d86f8a', '#e0e0d0', '#7bc07a', '#e58a3a'];
  for (let k = 0; k < 520; k++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = cols[(rnd() * cols.length) | 0];
    ctx.globalAlpha = 0.8;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 6);
    const t = rnd();
    if (t < 0.4) { ctx.beginPath(); ctx.ellipse(0, 0, 4 + rnd() * 7, 2 + rnd() * 3, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (t < 0.7) { ctx.lineWidth = 2; ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.arc(0, 0, 4 + rnd() * 6, 0, 4); ctx.stroke(); }
    else { ctx.fillRect(-3, -3, 6, 6); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  return toTex(c);
}

// ---------- 纸箱 / 标签 ----------
export function genCardboard({ print = null, seed = 101, W = 512, H = 256 } = {}) {
  const { fbm } = createNoise(seed);
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / W) * 8, (y / H) * 4, 3, 8, 4);
    const f = ((y % 6) < 1 ? -6 : 0);
    const v = 172 + (n - 0.5) * 30 + f;
    d[i] = v; d[i + 1] = v * 0.78; d[i + 2] = v * 0.52; d[i + 3] = 255;
  });
  const ctx = c.getContext('2d');
  if (print === '350') {
    ctx.fillStyle = 'rgba(40,30,20,0.85)';
    ctx.font = 'bold 150px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('350', W / 2, H * 0.62);
    ctx.font = 'bold 36px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('饮用天然水  ml×24', W / 2, H * 0.86);
    ctx.strokeStyle = 'rgba(40,30,20,0.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(30, 60); ctx.lineTo(60, 25); ctx.lineTo(90, 60); ctx.stroke();
  } else if (print === 'snack') {
    ctx.fillStyle = 'rgba(160,40,30,0.8)';
    ctx.font = 'bold 60px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('零食大礼包', W / 2, H * 0.6);
  }
  return toTex(c);
}

export function genLabel(kind) {
  const W = 256, H = 128, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const font = (s, b = 'bold') => `${b} ${s}px "PingFang SC","Microsoft YaHei",Arial,sans-serif`;
  ctx.textAlign = 'center';
  if (kind === 'water') {
    ctx.fillStyle = '#e9f4fb'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2d7fc1'; ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 22, W, 22);
    ctx.fillStyle = '#1b5f98';
    ctx.beginPath(); ctx.moveTo(60, 100); ctx.lineTo(100, 50); ctx.lineTo(130, 85); ctx.lineTo(150, 65); ctx.lineTo(190, 100); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(22); ctx.fillText('天然矿泉水', W / 2, 25);
  } else if (kind === 'cola') {
    ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 90); ctx.bezierCurveTo(80, 50, 160, 120, 256, 70); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = font(34, 'italic bold'); ctx.fillText('可 乐', W / 2, 60);
  } else if (kind === 'juice') {
    ctx.fillStyle = '#f7b500'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f36f21'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(24); ctx.fillText('橙汁', W / 2, H / 2 + 8);
  } else if (kind === 'tea') {
    ctx.fillStyle = '#2f8a3b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3e7b0'; ctx.font = font(30); ctx.fillText('冰红茶', W / 2, 75);
  } else if (kind === 'noodle') {
    ctx.fillStyle = '#b3261e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd34d'; ctx.font = font(34); ctx.fillText('红烧牛肉面', W / 2, 60);
    ctx.fillStyle = '#fff'; ctx.font = font(16, ''); ctx.fillText('经典口味 · 大桶装', W / 2, 95);
  } else if (kind === 'latiao') {
    ctx.fillStyle = '#d42a1e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffe14d'; ctx.font = font(46); ctx.fillText('辣 条', W / 2, 70);
    ctx.fillStyle = '#fff'; ctx.font = font(16, ''); ctx.fillText('麻辣味 · 童年的味道', W / 2, 104);
  } else if (kind === 'chips') {
    ctx.fillStyle = '#e8322b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff5a0'; ctx.font = font(34); ctx.fillText('薯片', W / 2, 70);
  } else if (kind === 'tissue') {
    ctx.fillStyle = '#f5f7fa'; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 10; k++) {
      ctx.fillStyle = k % 2 ? '#8fb7e6' : '#f2a7c3';
      ctx.beginPath(); ctx.arc(20 + k * 25, 40 + (k % 3) * 25, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4a6a9a'; ctx.font = font(20); ctx.fillText('抽纸 · 柔韧三层', W / 2, 118);
  } else if (kind === 'shoebox') {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(150, 40, 90, 60);
    ctx.fillStyle = '#333'; ctx.font = font(16); ctx.fillText('SIZE 42', 195, 76);
  }
  return toTex(c, { wrap: false });
}

// ---------- 纸张 / 笔记 ----------
export const HAND = '"Kaiti SC","STKaiti","KaiTi","PingFang SC","Microsoft YaHei",cursive';
export const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';

export function genPaper(kind = 'math', seed = 1) {
  const W = 256, H = 362, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(seed * 13 + 7);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, W, H);
  if (kind === 'math') {
    ctx.fillStyle = '#333'; ctx.font = `bold 15px ${SANS}`;
    ctx.fillText(['高等数学 期末复习', '第七章 微分方程', '线性代数 重点题型', '概率论 历年真题'][seed % 4], 18, 28);
    const lines = ['∫ f(x)dx = F(x) + C', 'lim (1+1/n)^n = e', "y'' + p(x)y' + q(x)y = 0", 'dy/dx = 2xy', '∂z/∂x = 2x + y', 'Σ 1/n² = π²/6', 'det(A - λE) = 0', 'P(A|B) = P(AB)/P(B)'];
    ctx.font = `12px ${SANS}`;
    for (let y = 52; y < H - 20; y += 20) {
      ctx.fillStyle = `rgba(40,40,40,${0.6 + rnd() * 0.3})`;
      if (rnd() < 0.4) ctx.fillText(lines[(rnd() * lines.length) | 0], 18, y);
      else ctx.fillRect(18, y - 8, 60 + rnd() * 150, 2);
    }
    ctx.fillStyle = 'rgba(255,230,0,0.35)';
    ctx.fillRect(14, 110 + rnd() * 100, 140, 12);
  } else if (kind === 'lined') {
    ctx.strokeStyle = 'rgba(120,160,210,0.6)';
    for (let y = 30; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(40,60,160,0.75)'; ctx.lineWidth = 1.2;
    for (let y = 44; y < H - 30; y += 16) {
      let x = 16;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (x < 200 + rnd() * 30) { x += 3 + rnd() * 5; ctx.lineTo(x, y - rnd() * 7); }
      ctx.stroke();
    }
  }
  // 褶皱阴影
  for (let k = 0; k < 4; k++) {
    const g = ctx.createLinearGradient(rnd() * W, 0, rnd() * W, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  return toTex(c, { wrap: false });
}

export function genNotebookSpread() {
  const W = 512, H = 360, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(111);
  ctx.fillStyle = '#f6f3ea'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,160,210,0.55)';
  for (let y = 30; y < H; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(W / 2 - 2, 0, 4, H);
  ctx.fillStyle = '#1d2f8a'; ctx.font = `20px ${HAND}`;
  const txt = ['高数 第七章', '一阶线性: y\'+P(x)y=Q(x)', '通解 = e^(-∫P)[∫Qe^(∫P)dx + C]', '考点!!! 必考', '二阶常系数齐次', 'r² + pr + q = 0'];
  txt.forEach((t, k) => ctx.fillText(t, 20, 50 + k * 36));
  ctx.strokeStyle = 'rgba(29,47,138,0.8)';
  for (let y = 58; y < H - 20; y += 18) {
    let x = W / 2 + 18;
    ctx.beginPath(); ctx.moveTo(x, y);
    while (x < W - 30 - rnd() * 60) { x += 3 + rnd() * 6; ctx.lineTo(x, y - rnd() * 8); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#d33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(70, 150, 60, 18, -0.05, 0, Math.PI * 2); ctx.stroke();
  return toTex(c, { wrap: false });
}

export function genStickyNote(text = '看手机!!', color = '#f7e36a') {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#1b1b1b';
  ctx.font = `bold 42px ${HAND}`;
  ctx.textAlign = 'center';
  const lines = text.split('\n');
  lines.forEach((l, k) => ctx.fillText(l, S / 2, S / 2 - (lines.length - 1) * 26 + k * 52 + 14));
  return toTex(c, { wrap: false });
}

export function genFoldedNote(seed = 1) {
  const W = 256, H = 180, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f8f6ef'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(W / 2 - 1, 0, 2, H);
  ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = 3;
  const rnd = mulberry32(seed);
  for (let y = 40; y < H - 30; y += 26) {
    ctx.beginPath(); let x = 20; ctx.moveTo(x, y);
    while (x < W / 2 - 20) { x += 5 + rnd() * 6; ctx.lineTo(x, y - rnd() * 9); }
    ctx.stroke();
  }
  ctx.fillStyle = '#d22'; ctx.font = `bold 56px ${HAND}`; ctx.textAlign = 'center';
  ctx.fillText('?', W * 0.75, H * 0.62);
  return toTex(c, { wrap: false });
}

// ---------- 台历（考试日期动态生成）----------
export function drawCalendar(c, { year = 2026, month = 6, day = 18 } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, W, H);
  // 顶部校园照片
  const ph = H * 0.42;
  const sky = ctx.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, '#9fc6ea'); sky.addColorStop(1, '#e8f1f7');
  ctx.fillStyle = sky; ctx.fillRect(W * 0.04, W * 0.04, W * 0.92, ph);
  ctx.fillStyle = '#e9e4da';
  ctx.fillRect(W * 0.52, ph * 0.35, W * 0.22, ph * 0.5);
  ctx.fillStyle = '#9aa7b5';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.fillRect(W * 0.54 + i * W * 0.05, ph * 0.42 + j * ph * 0.14, W * 0.03, ph * 0.08);
  const rnd = mulberry32(5);
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = `hsl(${100 + rnd() * 40},${40 + rnd() * 20}%,${25 + rnd() * 20}%)`;
    ctx.beginPath(); ctx.arc(W * 0.04 + rnd() * W * 0.92, ph * 0.55 + rnd() * ph * 0.45, 10 + rnd() * 26, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#5a8c4a'; ctx.fillRect(W * 0.04, ph * 0.95, W * 0.92, ph * 0.09 + W * 0.04);
  // 标题
  ctx.fillStyle = '#b22'; ctx.textAlign = 'left';
  ctx.font = `bold ${W * 0.075}px ${SANS}`;
  ctx.fillText(`${year}年 ${month}月`, W * 0.06, ph + W * 0.13);
  ctx.fillStyle = '#555'; ctx.font = `${W * 0.035}px ${SANS}`;
  ctx.fillText('宁静致远 · 厚德博学', W * 0.62, ph + W * 0.12);
  // 日期网格
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  const top = ph + W * 0.2, cw = W * 0.92 / 7, chh = (H - top - W * 0.04) / 7;
  ctx.textAlign = 'center';
  ctx.font = `bold ${W * 0.04}px ${SANS}`;
  names.forEach((n, i) => { ctx.fillStyle = i === 0 || i === 6 ? '#c33' : '#333'; ctx.fillText(n, W * 0.04 + cw * (i + 0.5), top); });
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  ctx.font = `${W * 0.045}px ${SANS}`;
  for (let d = 1; d <= days; d++) {
    const idx = first + d - 1, col = idx % 7, row = Math.floor(idx / 7);
    const x = W * 0.04 + cw * (col + 0.5), y = top + chh * (row + 1.1);
    ctx.fillStyle = col === 0 || col === 6 ? '#c33' : '#222';
    ctx.fillText(String(d), x, y);
    if (d === day) {
      ctx.strokeStyle = '#e0141b'; ctx.lineWidth = W * 0.012;
      ctx.beginPath(); ctx.ellipse(x, y - W * 0.016, cw * 0.46, chh * 0.5, -0.1, 0, Math.PI * 2); ctx.stroke();
      ctx.save();
      ctx.fillStyle = '#e0141b'; ctx.font = `bold ${W * 0.045}px ${HAND}`;
      ctx.translate(x, y + chh * 0.55); ctx.rotate(-0.08);
      ctx.fillText('高数期末!!!', 0, 0);
      ctx.restore();
      ctx.font = `${W * 0.045}px ${SANS}`;
    }
  }
}

// ---------- 显示器画面 ----------
export function drawMobaScreen(c) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const rnd = mulberry32(2024);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#3b5a2c'); g.addColorStop(0.5, '#4d5a2f'); g.addColorStop(1, '#5a4a2c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = `rgba(${40 + rnd() * 60},${70 + rnd() * 60},${30 + rnd() * 30},0.35)`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 10 + rnd() * 50, 0, Math.PI * 2); ctx.fill();
  }
  // 河道
  ctx.strokeStyle = 'rgba(70,140,160,0.75)'; ctx.lineWidth = 70;
  ctx.beginPath(); ctx.moveTo(-40, H * 0.1); ctx.bezierCurveTo(W * 0.3, H * 0.4, W * 0.5, H * 0.2, W + 40, H * 0.75); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,220,230,0.25)'; ctx.lineWidth = 8; ctx.stroke();
  // 石板路
  ctx.strokeStyle = 'rgba(150,130,100,0.8)'; ctx.lineWidth = 36;
  ctx.beginPath(); ctx.moveTo(0, H * 0.85); ctx.lineTo(W * 0.55, H * 0.45); ctx.lineTo(W, H * 0.2); ctx.stroke();
  // 树丛
  for (let k = 0; k < 40; k++) {
    const x = rnd() * W, y = rnd() * H * 0.8;
    ctx.fillStyle = 'rgba(20,50,25,0.9)';
    ctx.beginPath(); ctx.arc(x, y, 14 + rnd() * 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(50,90,40,0.8)';
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 8 + rnd() * 8, 0, Math.PI * 2); ctx.fill();
  }
  // 技能特效（紫色大圈）
  const sg = ctx.createRadialGradient(W * 0.72, H * 0.52, 5, W * 0.72, H * 0.52, 95);
  sg.addColorStop(0, 'rgba(255,220,255,0.95)'); sg.addColorStop(0.35, 'rgba(200,60,220,0.8)'); sg.addColorStop(1, 'rgba(120,20,160,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.52, 95, 0, Math.PI * 2); ctx.fill();
  // 小兵/英雄
  for (let k = 0; k < 12; k++) {
    const x = W * 0.45 + rnd() * W * 0.4, y = H * 0.25 + rnd() * H * 0.4;
    const blue = rnd() < 0.5;
    ctx.fillStyle = blue ? '#3a78d8' : '#d84a3a';
    ctx.beginPath(); ctx.arc(x, y, 7 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(x - 14, y - 22, 28, 5);
    ctx.fillStyle = blue ? '#4fd05a' : '#e33'; ctx.fillRect(x - 13, y - 21, 26 * (0.3 + rnd() * 0.7), 3);
  }
  // HUD
  ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(W * 0.28, H * 0.86, W * 0.44, H * 0.14);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = ['#b85', '#58b', '#a5c', '#5a8', '#c84', '#888'][k];
    ctx.fillRect(W * 0.31 + k * W * 0.065, H * 0.885, W * 0.05, H * 0.08);
  }
  ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(W * 0.8, H * 0.7, W * 0.2, H * 0.3);
  ctx.strokeStyle = '#6a7'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.81, H * 0.72, W * 0.18, H * 0.26);
  ctx.strokeStyle = '#998'; ctx.beginPath(); ctx.moveTo(W * 0.81, H * 0.98); ctx.lineTo(W * 0.99, H * 0.72); ctx.stroke();
  ctx.fillStyle = 'rgba(10,14,20,0.8)'; ctx.fillRect(W * 0.78, 0, W * 0.22, H * 0.06);
  ctx.fillStyle = '#e8e2c8'; ctx.font = `bold ${H * 0.04}px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText('12 / 3 / 8    32:45', W * 0.89, H * 0.042);
  // 胜利横幅
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H * 0.3, W, H * 0.3);
  const vg = ctx.createLinearGradient(0, H * 0.34, 0, H * 0.52);
  vg.addColorStop(0, '#fff6c8'); vg.addColorStop(0.5, '#f2c14e'); vg.addColorStop(1, '#a86a12');
  ctx.shadowColor = 'rgba(255,200,80,0.9)'; ctx.shadowBlur = 30;
  ctx.fillStyle = vg; ctx.font = `bold ${H * 0.17}px ${SANS}`;
  ctx.fillText('胜  利', W / 2, H * 0.5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f5e2a8'; ctx.font = `bold ${H * 0.05}px Georgia, serif`;
  ctx.fillText('V I C T O R Y', W / 2, H * 0.575);
}

export function drawLockScreen(c, { name = '我', time = '07:30', hint = '', error = false, typed = 0 } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f2a4a'); g.addColorStop(0.55, '#3a2a6a'); g.addColorStop(1, '#0c1830');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(8);
  for (let k = 0; k < 7; k++) {
    const gg = ctx.createRadialGradient(rnd() * W, rnd() * H, 0, rnd() * W, rnd() * H, 300);
    gg.addColorStop(0, 'rgba(120,160,255,0.18)'); gg.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = `200 ${H * 0.16}px ${SANS}`; ctx.fillText(time, W / 2, H * 0.3);
  ctx.font = `${H * 0.035}px ${SANS}`; ctx.fillText('期末考试日 · 星期四', W / 2, H * 0.37);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(W / 2, H * 0.52, H * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a4a6a'; ctx.font = `bold ${H * 0.06}px ${SANS}`; ctx.fillText(name.slice(0, 1), W / 2, H * 0.54);
  ctx.fillStyle = '#fff'; ctx.font = `${H * 0.04}px ${SANS}`; ctx.fillText(name, W / 2, H * 0.64);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W / 2 - W * 0.13, H * 0.68, W * 0.26, H * 0.06);
  ctx.strokeStyle = error ? '#ff5a5a' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - W * 0.13, H * 0.68, W * 0.26, H * 0.06);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `${H * 0.035}px ${SANS}`;
  ctx.fillText(typed ? '•'.repeat(typed) : '密码', W / 2 - W * 0.12, H * 0.722);
  ctx.textAlign = 'center';
  if (hint) { ctx.fillStyle = error ? '#ffb0b0' : 'rgba(255,255,255,0.75)'; ctx.font = `${H * 0.03}px ${SANS}`; ctx.fillText(hint, W / 2, H * 0.8); }
}

export function drawDesktop(c, { name = '我', openNote = false, noteText = '' } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b3b6f'); g.addColorStop(1, '#4b7fb8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(0, H * 0.7); ctx.bezierCurveTo(W * 0.3, H * 0.5, W * 0.6, H * 0.9, W, H * 0.6); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  const icons = [['📁', '期末资料'], ['📝', '给睡神.txt'], ['🎮', '峡谷'], ['📕', '高数.pdf'], ['🗑️', '回收站']];
  ctx.textAlign = 'center';
  icons.forEach(([ic, label], k) => {
    const x = W * 0.06, y = H * 0.1 + k * H * 0.16;
    ctx.font = `${H * 0.07}px sans-serif`; ctx.fillText(ic, x, y + H * 0.04);
    ctx.fillStyle = '#fff'; ctx.font = `${H * 0.026}px ${SANS}`; ctx.fillText(label, x, y + H * 0.09);
  });
  ctx.fillStyle = 'rgba(20,24,32,0.92)'; ctx.fillRect(0, H * 0.94, W, H * 0.06);
  ctx.fillStyle = '#fff'; ctx.font = `${H * 0.03}px ${SANS}`; ctx.textAlign = 'right';
  ctx.fillText('07:4x', W * 0.98, H * 0.98);
  if (openNote) {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(W * 0.3, H * 0.18, W * 0.45, H * 0.55);
    ctx.fillStyle = '#e6e6e6'; ctx.fillRect(W * 0.3, H * 0.18, W * 0.45, H * 0.06);
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.font = `${H * 0.03}px ${SANS}`;
    ctx.fillText('给睡神.txt - 记事本', W * 0.31, H * 0.225);
    ctx.font = `${H * 0.04}px ${SANS}`;
    noteText.split('\n').forEach((l, k) => ctx.fillText(l, W * 0.32, H * 0.31 + k * H * 0.065));
  }
}

// ---------- 键盘（含紫光标记图层）----------
export function keyboardLayout(W = 1024, H = 340) {
  const keys = [];
  const u = W / 22.6, pad = u * 0.08;
  const row = (y, list, x0 = 0.3) => {
    let x = x0;
    for (const k of list) {
      const [label, w = 1] = Array.isArray(k) ? k : [k, 1];
      if (label) keys.push({ label, x: x * u + pad, y: y * u + pad, w: w * u - pad * 2, h: u - pad * 2 });
      x += w;
    }
  };
  row(0.3, ['Esc', ['', 0.8], 'F1', 'F2', 'F3', 'F4', ['', 0.4], 'F5', 'F6', 'F7', 'F8', ['', 0.4], 'F9', 'F10', 'F11', 'F12']);
  row(1.5, ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['Back', 2]]);
  row(2.5, [['Tab', 1.5], 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', ['\\', 1.5]]);
  row(3.5, [['Caps', 1.75], 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", ['Enter', 2.25]]);
  row(4.5, [['Shift', 2.25], 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', ['Shift', 2.75]]);
  row(5.5, [['Ctrl', 1.25], ['Fn', 1.25], ['Alt', 1.25], ['', 6.25], ['Alt', 1.25], ['Ctrl', 1.25]]);
  row(1.5, ['Ins', 'Home', 'PgUp'], 15.55);
  row(2.5, ['Del', 'End', 'PgDn'], 15.55);
  row(4.5, ['↑'], 16.55);
  row(5.5, ['←', '↓', '→'], 15.55);
  row(1.5, ['Num', '/', '*', '-'], 18.8);
  row(2.5, ['7', '8', '9', ['+', 1]], 18.8);
  row(3.5, ['4', '5', '6', ['', 1]], 18.8);
  row(4.5, ['1', '2', '3', ['↵', 1]], 18.8);
  row(5.5, [['0', 2], '.', ['', 1]], 18.8);
  // 空格
  keys.push({ label: ' ', x: 3.75 * u + pad + 0.3 * u, y: 5.5 * u + pad, w: 6.25 * u - pad * 2, h: u - pad * 2 });
  return { keys, u };
}

export function drawKeyboard(c) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, W, H);
  const { keys, u } = keyboardLayout(W, H);
  for (const k of keys) {
    const g = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
    g.addColorStop(0, '#2c2c30'); g.addColorStop(1, '#1d1d20');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(k.x, k.y, k.w, k.h, 4); ctx.fill();
    ctx.fillStyle = '#c9c9c9';
    const fs = k.label.length > 2 ? u * 0.24 : u * 0.34;
    ctx.font = `${fs}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(k.label, k.x + u * 0.12, k.y + u * 0.38);
  }
  ctx.fillStyle = '#9a9a9a'; ctx.font = `bold ${u * 0.3}px Arial`; ctx.textAlign = 'right';
  ctx.fillText('lenovo', W - u * 0.4, H - u * 0.25);
}

export function drawKeyboardUV(c, word) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const { keys, u } = keyboardLayout(W, H);
  [...word].forEach((ch, idx) => {
    const k = keys.find((kk) => kk.label === ch);
    if (!k) return;
    const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, u * 0.95);
    g.addColorStop(0, 'rgba(230,255,140,1)'); g.addColorStop(0.45, 'rgba(120,255,160,0.75)'); g.addColorStop(1, 'rgba(80,255,200,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - u, cy - u, u * 2, u * 2);
    ctx.strokeStyle = 'rgba(220,255,150,1)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(k.x - 2, k.y - 2, k.w + 4, k.h + 4, 6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,210,1)';
    ctx.font = `bold ${u * 0.5}px Arial`; ctx.textAlign = 'center';
    ctx.fillText(ch, cx - u * 0.1, cy + u * 0.18);
    ctx.fillStyle = 'rgba(255,240,120,1)';
    ctx.font = `bold ${u * 0.4}px Arial`;
    ctx.fillText(String(idx + 1), cx + u * 0.3, cy - u * 0.15);
  });
}

// ---------- 鼠标垫（红色折扇主题插画）----------
export function genMousepad() {
  const W = 512, H = 400, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f2b36b'); g.addColorStop(0.5, '#d9603b'); g.addColorStop(1, '#3a1e2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W * 0.35, H * 0.75);
  for (let k = 0; k < 13; k++) {
    const a0 = Math.PI * 1.05 + k * 0.07, a1 = a0 + 0.07;
    ctx.fillStyle = k % 2 ? '#c61f2c' : '#a3151f';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, H * 0.62, a0, a1); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#2a0d0d'; ctx.lineWidth = 2;
  for (let k = 0; k <= 13; k++) { const a = Math.PI * 1.05 + k * 0.07; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * H * 0.62, Math.sin(a) * H * 0.62); ctx.stroke(); }
  ctx.fillStyle = '#f5ecd9';
  ctx.beginPath(); ctx.arc(-H * 0.18, -H * 0.4, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a3151f';
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-H * 0.18 + Math.cos(k * 2.1) * 14, -H * 0.4 + Math.sin(k * 2.1) * 14, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  const rnd = mulberry32(12);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(255,${190 + rnd() * 40},${200 + rnd() * 40},0.85)`;
    ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H, 5, 3, rnd() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(30,40,60,0.8)';
  ctx.beginPath(); ctx.moveTo(W * 0.62, H); ctx.quadraticCurveTo(W * 0.72, H * 0.35, W * 0.86, H * 0.22); ctx.quadraticCurveTo(W * 0.95, H * 0.45, W * 0.9, H); ctx.fill();
  ctx.fillStyle = '#f0d0b0'; ctx.beginPath(); ctx.arc(W * 0.83, H * 0.2, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.arc(W * 0.83, H * 0.16, 28, Math.PI, 0); ctx.fill();
  return toTex(c, { wrap: false });
}

// ---------- 时钟 / 值日表 ----------
export function genClockFace() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#fbfbf8'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.font = 'bold 26px Arial';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(String(h), S / 2 + Math.cos(a) * 94, S / 2 + Math.sin(a) * 94 + 9);
  }
  for (let m = 0; m < 60; m++) {
    const a = (m / 60) * Math.PI * 2;
    const r0 = m % 5 ? 112 : 106;
    ctx.lineWidth = m % 5 ? 1.5 : 3;
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); ctx.lineTo(S / 2 + Math.cos(a) * 118, S / 2 + Math.sin(a) * 118); ctx.stroke();
  }
  ctx.font = '12px Arial'; ctx.fillText('QUARTZ', S / 2, S / 2 + 40);
  return toTex(c, { wrap: false });
}

export function genDutyRoster(names) {
  const W = 256, H = 340, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#fdfcf7'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c0392b'; ctx.font = `bold 24px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText('211 值日表', W / 2, 36);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  ctx.font = `16px ${SANS}`; ctx.fillStyle = '#222';
  days.forEach((d, k) => {
    const y = 64 + k * 38;
    ctx.strokeRect(16, y - 24, W - 32, 38);
    ctx.textAlign = 'left'; ctx.fillText(d, 26, y);
    ctx.fillText(names[k % names.length], 110, y, W - 136);
    if (k === 3) { ctx.strokeStyle = '#d22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, y - 6); ctx.lineTo(220, y - 6); ctx.stroke(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; }
  });
  return toTex(c, { wrap: false });
}

// ---------- 洗手间：瓷砖 / 铝扣板吊顶 ----------
// n×n 块方砖，贴图可平铺；每块砖颜色略有差别，带一点釉面反光
export function genTiles({ S = 256, n = 2, base = '#ecebe6', grout = '#a3a59f', gap = 3, jitter = 8, seed = 1, speck = 0 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const [br, bg, bb] = hexToRgb(base);
  ctx.fillStyle = grout; ctx.fillRect(0, 0, S, S);
  const ts = S / n;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const t = (rnd() - 0.5) * jitter;
      const x = tx * ts + gap / 2, y = ty * ts + gap / 2, w = ts - gap;
      ctx.fillStyle = `rgb(${br + t | 0},${bg + t | 0},${bb + t | 0})`;
      ctx.fillRect(x, y, w, w);
      const gl = ctx.createLinearGradient(x, y, x + w, y + w);
      gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = gl; ctx.fillRect(x, y, w, w);
    }
  }
  for (let k = 0; k < speck; k++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,85,80,0.28)' : 'rgba(255,255,255,0.3)';
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return toTex(c);
}

export function genStripCeiling() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#e9ebec'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 8; k++) {
    const y = k * (S / 8);
    const g = ctx.createLinearGradient(0, y, 0, y + S / 8);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.85, 'rgba(0,0,0,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, y, S, S / 8);
  }
  return toTex(c);
}

// ---------- 洗手间窗外（南面）：校园绿地远景 + 楼下的草地 ----------
export function genParkView() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(777);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#7fb3e6'); sky.addColorStop(0.7, '#c8e0f2'); sky.addColorStop(1, '#eef3ea');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.3})`;
    const x = rnd() * W, y = 40 + rnd() * H * 0.28;
    for (let q = 0; q < 5; q++) { ctx.beginPath(); ctx.ellipse(x + q * 40 - 80, y + (rnd() - 0.5) * 16, 50 + rnd() * 60, 16 + rnd() * 14, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // 远山
  ctx.fillStyle = '#9fb7b0';
  ctx.beginPath(); ctx.moveTo(0, H * 0.56);
  for (let x = 0; x <= W; x += 64) ctx.lineTo(x, H * 0.5 - Math.sin(x * 0.004) * 50 - rnd() * 20);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // 对面的教学楼（右侧）
  const bx = W * 0.64, by = H * 0.3, bw = W * 0.3, bh = H * 0.34;
  ctx.fillStyle = '#e9e1d0'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#b5543f'; ctx.fillRect(bx - 10, by - 18, bw + 20, 22);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
    ctx.fillStyle = '#5f7f9c'; ctx.fillRect(bx + 24 + k * (bw - 40) / 9, by + 30 + r * (bh - 40) / 4, (bw - 40) / 9 - 18, (bh - 40) / 4 - 26);
  }
  // 远处成排的树
  for (let k = 0; k < 150; k++) {
    const x = rnd() * W, y = H * 0.5 + rnd() * H * 0.14, r = 26 + rnd() * 50;
    ctx.fillStyle = `hsl(${100 + rnd() * 35},${30 + rnd() * 18}%,${24 + rnd() * 16}%)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 草坪
  const lawn = ctx.createLinearGradient(0, H * 0.62, 0, H);
  lawn.addColorStop(0, '#6f9a45'); lawn.addColorStop(1, '#5b8a36');
  ctx.fillStyle = lawn; ctx.fillRect(0, H * 0.64, W, H * 0.36);
  for (let k = 0; k < 3000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,70,20,0.25)' : 'rgba(170,200,110,0.25)'; ctx.fillRect(rnd() * W, H * 0.64 + rnd() * H * 0.36, 2, 3); }
  return toTex(c, { wrap: false });
}

export function genLawn() {
  const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(778);
  ctx.fillStyle = '#62913b'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(35,65,18,0.3)' : 'rgba(160,200,100,0.28)'; ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 2, 3 + rnd() * 4); }
  // 楼下贴着墙的水泥路
  ctx.fillStyle = '#b9b4a8'; ctx.fillRect(0, H - 70, W, 70);
  ctx.strokeStyle = 'rgba(90,85,75,0.5)'; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, H - 70); ctx.lineTo(x, H); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// 厕所隔板上的涂鸦
export function genGraffiti() {
  const W = 512, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,40,120,0.85)'; ctx.font = `bold 58px ${SANS}`;
  ctx.save(); ctx.translate(250, 110); ctx.rotate(-0.08); ctx.fillText('逢考必过', 0, 0); ctx.restore();
  ctx.fillStyle = 'rgba(160,20,20,0.8)'; ctx.font = `40px ${SANS}`;
  ctx.save(); ctx.translate(270, 200); ctx.rotate(0.05); ctx.fillText('高数再挂就退学', 0, 0); ctx.restore();
  // 画了个猴子脸 + 箭头
  ctx.strokeStyle = 'rgba(20,20,20,0.8)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(150, 360, 48, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(100, 350, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(200, 350, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(150, 380, 26, 18, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.beginPath(); ctx.arc(135, 348, 5, 0, Math.PI * 2); ctx.arc(165, 348, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(150, 386, 12, 0.1, Math.PI - 0.1); ctx.stroke();
  ctx.font = `bold 38px ${SANS}`; ctx.fillText('窗外有猴!!', 350, 370);
  ctx.beginPath(); ctx.moveTo(250, 420); ctx.lineTo(440, 420); ctx.lineTo(420, 402); ctx.moveTo(440, 420); ctx.lineTo(420, 438); ctx.stroke();
  ctx.font = `28px ${SANS}`; ctx.fillStyle = 'rgba(40,40,40,0.7)'; ctx.fillText('—— 208 到此一游', 330, 485);
  return toTex(c, { wrap: false });
}

// ---------- 窗外风景 ----------
export function genWindowView() {
  const W = 2048, H = 1024, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(333);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  sky.addColorStop(0, '#8fb9e3'); sky.addColorStop(0.6, '#cfe0ee'); sky.addColorStop(1, '#f6e6c8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.82, H * 0.3, 10, W * 0.82, H * 0.3, 420);
  sun.addColorStop(0, 'rgba(255,245,220,0.95)'); sun.addColorStop(0.2, 'rgba(255,230,180,0.5)'); sun.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(rnd() * W, rnd() * H * 0.3, 80 + rnd() * 160, 16 + rnd() * 20, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 远处楼
  ctx.fillStyle = '#b8c0c8';
  for (let k = 0; k < 8; k++) { const x = k * 280 + rnd() * 80, h = 200 + rnd() * 160; ctx.fillRect(x, H * 0.55 - h, 180 + rnd() * 80, h + 60); }
  // 对面宿舍楼
  const bx = W * 0.05, bw = W * 0.9, by = H * 0.18, bh = H * 0.72;
  ctx.fillStyle = '#e4dccd'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#cfc5b3'; ctx.fillRect(bx, by, bw, 18);
  const cols = 14, rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = bx + 30 + k * (bw - 60) / cols, y = by + 40 + r * (bh - 60) / rows;
      const ww = (bw - 60) / cols - 34, wh = (bh - 60) / rows - 40;
      ctx.fillStyle = '#c9c1b0'; ctx.fillRect(x - 6, y + wh, ww + 12, 10);
      const gg = ctx.createLinearGradient(x, y, x + ww, y + wh);
      gg.addColorStop(0, '#6f8eaa'); gg.addColorStop(1, '#2d4257');
      ctx.fillStyle = gg; ctx.fillRect(x, y, ww, wh);
      if (rnd() < 0.55) { ctx.fillStyle = ['#d8c7a0', '#9bb0c8', '#e3a0a0', '#b8d0a0', '#777'][(rnd() * 5) | 0]; ctx.fillRect(x + (rnd() < 0.5 ? 0 : ww * 0.5), y, ww * 0.5, wh); }
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x + ww * 0.5 - 1, y, 2, wh);
      if (rnd() < 0.4) { ctx.fillStyle = '#f2f2f0'; ctx.fillRect(x + ww + 4, y + wh * 0.5, 22, 16); }
      if (rnd() < 0.35) for (let q = 0; q < 4; q++) { ctx.fillStyle = `hsl(${rnd() * 360},50%,60%)`; ctx.fillRect(x + q * ww / 4, y + wh + 12, ww / 5, 18 + rnd() * 16); }
    }
  }
  // 树
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = `hsl(${95 + rnd() * 40},${35 + rnd() * 20}%,${20 + rnd() * 18}%)`;
    ctx.beginPath(); ctx.arc(rnd() * W, H * 0.8 + rnd() * H * 0.25, 40 + rnd() * 70, 0, Math.PI * 2); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

// 窗户雾气：手指写过的地方哈气后会显形
export function drawWindowFog(c, digit) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const { fbm } = createNoise(444);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / W) * 6, (y / H) * 6, 4, 6, 6);
    const edge = Math.min(x, y, W - x, H - y) / 60;
    d[i] = 235; d[i + 1] = 240; d[i + 2] = 245;
    d[i + 3] = clamp(150 + (n - 0.5) * 160 + (1 - clamp(edge, 0, 1)) * 60, 0, 255);
  });
  const strokes = (color, grow = 0) => {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 笑脸
    ctx.lineWidth = 12 + grow;
    ctx.beginPath(); ctx.arc(W * 0.2, H * 0.42, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W * 0.2, H * 0.44, 30, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.lineWidth = 14 + grow;
    ctx.beginPath(); ctx.moveTo(W * 0.17, H * 0.37); ctx.lineTo(W * 0.17, H * 0.38); ctx.moveTo(W * 0.23, H * 0.37); ctx.lineTo(W * 0.23, H * 0.38); ctx.stroke();
    // ③ →
    ctx.lineWidth = 10 + grow;
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.45, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `bold ${54 + grow}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('3', W * 0.5, H * 0.455);
    ctx.beginPath(); ctx.moveTo(W * 0.58, H * 0.45); ctx.lineTo(W * 0.66, H * 0.45); ctx.lineTo(W * 0.63, H * 0.4); ctx.moveTo(W * 0.66, H * 0.45); ctx.lineTo(W * 0.63, H * 0.5); ctx.stroke();
    // 数字（大）
    ctx.font = `bold ${220 + grow * 2}px "Comic Sans MS", "Chalkboard SE", Arial`;
    ctx.fillText(String(digit), W * 0.79, H * 0.47);
    ctx.lineWidth = 6 + grow;
    ctx.strokeText(String(digit), W * 0.79, H * 0.47);
  };
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  strokes('rgba(0,0,0,1)', 4);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  strokes('rgba(18,28,40,0.62)', 0);
  // 水珠顺着笔画往下流
  const rnd = mulberry32(digit + 7);
  for (let k = 0; k < 22; k++) {
    const x = W * (0.7 + rnd() * 0.18), y = H * (0.66 + rnd() * 0.12), l = 20 + rnd() * 60;
    ctx.fillStyle = 'rgba(18,28,40,0.45)';
    ctx.fillRect(x, y, 3, l);
  }
  ctx.restore();
}

// ---------- 紫光涂鸦（墙上，平时看不见；每局写上随机室友的名字）----------
export function drawUVDoodles(c, name) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const glow = (col) => { ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.strokeStyle = col; ctx.fillStyle = col; };
  glow('rgba(120,255,200,0.95)');
  ctx.font = `bold 78px ${HAND}`; ctx.textAlign = 'center';
  ctx.fillText('211 永远滴神', W * 0.5, H * 0.22);
  glow('rgba(255,120,230,0.95)');
  ctx.font = `bold 50px ${HAND}`;
  ctx.fillText(`${name}到此一游 ✌`, W * 0.28, H * 0.5, W * 0.54);
  glow('rgba(255,240,120,0.95)');
  ctx.fillText('期末必过!!!', W * 0.74, H * 0.52);
  glow('rgba(120,200,255,0.95)');
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(W * 0.15, H * 0.8, 44, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W * 0.15, H * 0.82, 24, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillRect(W * 0.13, H * 0.74, 7, 12); ctx.fillRect(W * 0.165, H * 0.74, 7, 12);
  glow('rgba(255,160,90,0.95)');
  ctx.font = `bold 40px ${HAND}`;
  ctx.fillText('哈口气，窗户会说话 →', W * 0.6, H * 0.84);
}

// ---------- 准考证 ----------
export function drawTicket(c, { name = '我', faceImg = null, month = 6, day = 18 } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#b22'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = '#b22'; ctx.textAlign = 'center';
  ctx.font = `bold ${H * 0.1}px ${SANS}`; ctx.fillText('期末考试准考证', W / 2, H * 0.17);
  const px = W * 0.06, py = H * 0.26, pw = W * 0.28, phh = H * 0.62;
  ctx.fillStyle = '#dde'; ctx.fillRect(px, py, pw, phh);
  if (faceImg) {
    const s = Math.max(pw / faceImg.width, phh / faceImg.height);
    const iw = faceImg.width * s, ih = faceImg.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, phh); ctx.clip();
    ctx.drawImage(faceImg, px + (pw - iw) / 2, py + (phh - ih) / 2, iw, ih);
    ctx.restore();
  } else { // 没有照片：画个证件照剪影
    ctx.fillStyle = '#9aa3b5';
    ctx.beginPath(); ctx.arc(px + pw / 2, py + phh * 0.42, pw * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + pw / 2, py + phh, pw * 0.42, phh * 0.36, 0, Math.PI, 0); ctx.fill();
  }
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, phh);
  ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.font = `${H * 0.065}px ${SANS}`;
  const lx = W * 0.4;
  [`姓名：${name}`, '科目：高等数学（下）', `时间：${month}月${day}日 08:00`, '考场：教学楼 A-304', '座位号：27'].forEach((t, k) => ctx.fillText(t, lx, H * 0.34 + k * H * 0.12));
  ctx.strokeStyle = 'rgba(200,30,30,0.7)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(W * 0.83, H * 0.78, H * 0.12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(200,30,30,0.7)'; ctx.font = `bold ${H * 0.045}px ${SANS}`; ctx.textAlign = 'center';
  ctx.fillText('教务处', W * 0.83, H * 0.795);
}

// ---------- 书脊 ----------
export function genBookSpine(color, seed) {
  const W = 64, H = 256, c = makeCanvas(W, H), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(0, H * 0.12, W, 6); ctx.fillRect(0, H * 0.85, W, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 4; k++) ctx.fillRect(W * 0.3, H * 0.25 + k * 30, W * 0.4, 18 * (0.5 + rnd() * 0.5));
  return toTex(c, { wrap: false });
}

// ---------- 手机屏幕 ----------
export function drawPhoneScreen(c, state = 'off', pct = 0, time = '07:30') {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
  if (state === 'charging') {
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 6;
    ctx.strokeRect(W * 0.3, H * 0.4, W * 0.4, H * 0.14);
    ctx.fillStyle = '#eee'; ctx.fillRect(W * 0.7, H * 0.44, 10, H * 0.06);
    ctx.fillStyle = pct < 0.2 ? '#e33' : '#4cd964';
    ctx.fillRect(W * 0.31, H * 0.41, W * 0.38 * Math.max(0.05, pct), H * 0.12);
    ctx.fillStyle = '#ddd'; ctx.font = `${W * 0.1}px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(pct * 100)}%`, W / 2, H * 0.65);
  } else if (state === 'on') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#243b6b'); g.addColorStop(1, '#6a3b6b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = `200 ${W * 0.26}px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(time, W / 2, H * 0.28);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.roundRect(W * 0.08, H * 0.4, W * 0.84, H * 0.1, 12); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = `${W * 0.06}px ${SANS}`; ctx.textAlign = 'left';
    ctx.fillText('💬 211相亲相爱一家人 (12)', W * 0.12, H * 0.46);
  }
}

// ---------- 军装上衣（参考美军 AGSU 常服：深橄榄绿毛呢、同色腰带 + 铜扣、四个口袋、左胸略章、右胸名牌）----------
// vAt(h) 把躯干高度映射为贴图 v 坐标（和牛仔夹克同一套 UV）
export function genServiceCoat(vAt, { base = '#4a4833', name = 'SMITH', ribbons = true } = {}) {
  const W = 1024, H = 1024;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const { fbm } = createNoise(58);
  const [br, bg, bb] = hexToRgb(base);
  pixels(c, (x, y, d, i) => {
    const n = fbm((x / W) * 40, (y / H) * 40, 2, 40, 40), n2 = fbm((x / W) * 6, (y / H) * 6, 2, 6, 6);
    const k = 0.92 + n * 0.12 + (n2 - 0.5) * 0.06 + (((x + y) & 3) < 2 ? 0.02 : -0.02);
    d[i] = br * k; d[i + 1] = bg * k; d[i + 2] = bb * k; d[i + 3] = 255;
  });
  const Y = (h) => (1 - vAt(h)) * H, X = (u) => u * W;
  const seam = (pts, col = 'rgba(20,20,10,0.55)', w = 3) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  // 门襟
  seam([[X(0.5) - 4, Y(0.43)], [X(0.5) - 4, H]]);
  // 同色腰带 + 铜扣
  const b0 = Y(0.13), b1 = Y(0.095);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, b0, W, b1 - b0);
  seam([[0, b0], [W, b0]]); seam([[0, b1], [W, b1]]);
  ctx.fillStyle = '#c9a23a'; ctx.fillRect(X(0.5) - 18, b0 + 3, 36, b1 - b0 - 6);
  ctx.strokeStyle = '#6a4a10'; ctx.lineWidth = 3; ctx.strokeRect(X(0.5) - 18, b0 + 3, 36, b1 - b0 - 6);
  // 下口袋（带袋盖）
  for (const u of [0.41, 0.59]) {
    const w = 110, top = Y(0.235), bot = Y(0.14);
    seam([[X(u) - w / 2, top], [X(u) - w / 2, bot], [X(u) + w / 2, bot], [X(u) + w / 2, top], [X(u) - w / 2, top]], 'rgba(20,20,10,0.4)', 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(X(u) - w / 2, top, w, 18);
  }
  // 胸口袋
  for (const u of [0.425, 0.575]) {
    const w = 80, top = Y(0.37), bot = Y(0.3);
    seam([[X(u) - w / 2, top], [X(u) - w / 2, bot], [X(u) + w / 2, bot], [X(u) + w / 2, top], [X(u) - w / 2, top]], 'rgba(20,20,10,0.4)', 2);
    seam([[X(u) - 3, top], [X(u) - 3, bot]], 'rgba(20,20,10,0.35)', 2);
  }
  // 左胸略章（佩戴者的左边 = 贴图 u > 0.5）
  if (ribbons) {
    const cols = [['#b3262e', '#ffffff', '#2a3f8f'], ['#f2c14e', '#2a6a3a', '#b3262e'], ['#2a3f8f', '#f2c14e', '#ffffff'], ['#6a2a8a', '#ffffff', '#6a2a8a'], ['#2a6a3a', '#b3262e', '#2a6a3a'], ['#b3262e', '#f2c14e', '#b3262e']];
    let k = 0;
    for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) {
      const x = X(0.548) + q * 22 - (r ? 11 : 0), y = Y(0.405) - r * 12;
      const cc = cols[k++ % cols.length];
      ctx.fillStyle = cc[0]; ctx.fillRect(x, y, 21, 11);
      ctx.fillStyle = cc[1]; ctx.fillRect(x + 7, y, 7, 11);
      ctx.fillStyle = cc[2]; ctx.fillRect(x + 9, y, 3, 11);
    }
  }
  // 右胸名牌
  ctx.fillStyle = '#111'; ctx.fillRect(X(0.4), Y(0.395), 66, 16);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(name, X(0.4) + 33, Y(0.395) + 12);
  // 后背中缝
  seam([[X(0.0) + 2, Y(0.13)], [X(0.0) + 2, 0]], 'rgba(20,20,10,0.3)', 2);
  return toTex(c);
}
