// 结局（征兵站门前）的写实贴图：红砖、混凝土地砖、草地、红毯、树叶贴片、远处的林带、室内百叶窗……
//   每种表面都配一张法线贴图（从高度图算）和粗糙度贴图，和第四章一个标准
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels } from './textures.js';
import { mulberry32, clamp, lerp } from './util.js';

const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
// 高度图 → 法线贴图 / 粗糙度贴图（线性数据，不做 sRGB）
const dataTex = (c, repeat) => toTex(c, { data: true, repeat });
function gray(W, H, fn) {
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => { const v = clamp(fn(x, y), 0, 1) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; });
  return c;
}

// ---------- 红砖墙：顺砖错缝，砖与砖颜色有深有浅，灰缝凹进去 ----------
export function genBrick({ seed = 7101, W = 512, H = 512 } = {}) {
  const rnd = mulberry32(seed), N = createNoise(seed);
  const rows = 16, cols = 4, bh = H / rows, bw = W / cols, m = 3;
  const col = makeCanvas(W, H), ctx = col.getContext('2d');
  ctx.fillStyle = '#9d968b'; ctx.fillRect(0, 0, W, H); // 灰缝
  const bricks = [];
  for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
    const x = k * bw + (r % 2) * bw / 2, y = r * bh;
    const dark = rnd() < 0.12, t = (dark ? 0.62 : 0.82) + rnd() * 0.26;
    const hue = rnd();
    bricks.push({ x, y, t, hue });
    ctx.fillStyle = rgb(148 * t + hue * 12, (60 + hue * 16) * t, (44 + hue * 8) * t);
    ctx.fillRect(x + m, y + m, bw - m * 2, bh - m * 2);
  }
  // 砖面上的斑点、烧结的深色边
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = N.fbm(x / 9, y / 9, 3, W / 9, H / 9) - 0.5, sp = N.noise(x * 0.9, y * 0.9) > 0.86 ? -18 : 0;
    d[i] = clamp(d[i] * (1 + n * 0.35) + sp, 0, 255); d[i + 1] = clamp(d[i + 1] * (1 + n * 0.3) + sp, 0, 255); d[i + 2] = clamp(d[i + 2] * (1 + n * 0.3) + sp, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  const inBrick = (x, y) => { const r = Math.floor(y / bh), off = (r % 2) * bw / 2, bx = ((x - off) % bw + bw) % bw, by = y % bh; return bx > m && bx < bw - m && by > m && by < bh - m ? Math.min(bx - m, bw - m - bx, by - m, bh - m - by) : -1; };
  const hgt = gray(W, H, (x, y) => { const e = inBrick(x, y); return e < 0 ? 0.15 : 0.55 + Math.min(1, e / 2.5) * 0.35 + (N.noise(x * 0.6, y * 0.6) - 0.5) * 0.12; });
  const rough = gray(W, H, (x, y) => (inBrick(x, y) < 0 ? 0.98 : 0.82 + (N.noise(x * 0.3, y * 0.3) - 0.5) * 0.12));
  return { map: toTex(col), normalMap: dataTex(normalFromHeight(hgt, 4)), roughnessMap: dataTex(rough) };
}

// ---------- 广场地砖：60cm 的混凝土方砖，骨料斑点、水渍、几块颜色不一样的补丁 ----------
export function genPavers({ seed = 7111, S = 512 } = {}) {
  const rnd = mulberry32(seed), N = createNoise(seed);
  const n = 4, cs = S / n, gap = 3;
  const tone = [];
  for (let i = 0; i < n * n; i++) tone.push(0.9 + rnd() * 0.14);
  const col = makeCanvas(S, S);
  pixels(col, (x, y, d, i) => {
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs), lx = x % cs, ly = y % cs;
    const joint = lx < gap || ly < gap;
    const t = tone[cy * n + cx];
    const f = N.fbm(x / 40, y / 40, 4, S / 40, S / 40), g = N.noise(x * 0.8, y * 0.8);
    let v = joint ? 118 : (178 + (f - 0.5) * 40) * t;
    if (!joint && g > 0.8) v -= 22; else if (!joint && g < 0.12) v += 14;
    const stain = N.fbm(x / 90 + 7, y / 90 + 3, 3, S / 90, S / 90);
    if (stain > 0.62) v *= 1 - (stain - 0.62) * 0.9;
    d[i] = v * 1.0; d[i + 1] = v * 0.985; d[i + 2] = v * 0.95; d[i + 3] = 255;
  });
  const hgt = gray(S, S, (x, y) => { const lx = x % cs, ly = y % cs; if (lx < gap || ly < gap) return 0.1; const e = Math.min(lx - gap, ly - gap, cs - lx, cs - ly); return 0.5 + Math.min(1, e / 3) * 0.3 + (N.noise(x * 0.9, y * 0.9) - 0.5) * 0.1; });
  const rough = gray(S, S, (x, y) => 0.86 + (N.noise(x * 0.2, y * 0.2) - 0.5) * 0.12);
  return { map: toTex(col), normalMap: dataTex(normalFromHeight(hgt, 3)), roughnessMap: dataTex(rough) };
}

// ---------- 草坪：修剪过的草，深浅斑驳，有几块晒黄了 ----------
export function genGrass({ seed = 7121, S = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const col = makeCanvas(S, S);
  pixels(col, (x, y, d, i) => {
    const f = N.fbm(x / 70, y / 70, 4, S / 70, S / 70), b = N.noise(x * 1.3, y * 1.3), dry = N.fbm(x / 140 + 5, y / 140, 3, S / 140, S / 140);
    const k = 0.75 + (f - 0.5) * 0.5 + (b - 0.5) * 0.35;
    const yl = clamp((dry - 0.55) * 2.2, 0, 1);
    d[i] = (58 + yl * 60) * k; d[i + 1] = (92 + yl * 26) * k; d[i + 2] = (36 + yl * 10) * k; d[i + 3] = 255;
  });
  // 一根根草叶的细线
  const ctx = col.getContext('2d');
  for (let k = 0; k < 9000; k++) {
    const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 5, a = -Math.PI / 2 + (rnd() - 0.5) * 0.8;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(120,160,70,0.35)' : 'rgba(30,55,20,0.35)';
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const hgt = gray(S, S, (x, y) => 0.5 + (N.noise(x * 1.1, y * 1.1) - 0.5) * 0.8);
  return { map: toTex(col), normalMap: dataTex(normalFromHeight(hgt, 2)) };
}

// ---------- 红毯：绒面，两边金色滚边 ----------
export function genCarpet({ seed = 7131 } = {}) {
  const W = 256, H = 1024, N = createNoise(seed);
  const col = makeCanvas(W, H);
  pixels(col, (x, y, d, i) => {
    const border = x < 14 || x > W - 15, gold = (x > 16 && x < 24) || (x > W - 25 && x < W - 17);
    const n = (N.noise(x * 0.9, y * 0.9) - 0.5) * 0.25 + (N.fbm(x / 30, y / 60, 3, W / 30, H / 60) - 0.5) * 0.25;
    if (gold) { d[i] = 214 * (1 + n); d[i + 1] = 168 * (1 + n); d[i + 2] = 68 * (1 + n); }
    else { const k = (border ? 0.72 : 1) * (1 + n); d[i] = 150 * k; d[i + 1] = 18 * k; d[i + 2] = 26 * k; }
    d[i + 3] = 255;
  });
  const hgt = gray(W, H, (x, y) => 0.5 + (N.noise(x * 1.6, y * 1.6) - 0.5) * 0.9);
  return { map: toTex(col), normalMap: dataTex(normalFromHeight(hgt, 1.5)) };
}

// ---------- 浅色石材 / 混凝土（台阶、柱子、窗台、檐口）----------
export function genStone({ seed = 7141, S = 256, base = [222, 216, 202] } = {}) {
  const N = createNoise(seed);
  const col = makeCanvas(S, S);
  pixels(col, (x, y, d, i) => {
    const f = N.fbm(x / 24, y / 24, 4, S / 24, S / 24), s = N.noise(x * 1.2, y * 1.2) > 0.9 ? -16 : 0;
    const k = 0.92 + (f - 0.5) * 0.22;
    d[i] = base[0] * k + s; d[i + 1] = base[1] * k + s; d[i + 2] = base[2] * k + s; d[i + 3] = 255;
  });
  const hgt = gray(S, S, (x, y) => 0.5 + (N.noise(x * 0.8, y * 0.8) - 0.5) * 0.5);
  return { map: toTex(col), normalMap: dataTex(normalFromHeight(hgt, 1.2)) };
}

// ---------- 一簇树叶（贴片用，带透明）：几十片椭圆叶子，向阳的亮、背阴的暗 ----------
export function genLeafCluster({ seed = 7151, S = 256, hue = 0 } = {}) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  // 细枝
  ctx.strokeStyle = 'rgba(70,52,36,0.9)'; ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(S / 2, S * 0.95); ctx.quadraticCurveTo(S / 2 + (rnd() - 0.5) * S * 0.4, S * 0.55, S * (0.15 + rnd() * 0.7), S * (0.1 + rnd() * 0.4)); ctx.stroke(); }
  const leaves = 90;
  for (let k = 0; k < leaves; k++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * S * 0.44;
    const x = S / 2 + Math.cos(a) * r, y = S * 0.48 + Math.sin(a) * r * 0.9;
    const len = 16 + rnd() * 14, wid = len * (0.42 + rnd() * 0.15), ang = rnd() * Math.PI * 2;
    const lit = 0.55 + rnd() * 0.5 + (1 - y / S) * 0.25;
    const gcol = [lerp(48, 78, rnd()) + hue * 30, lerp(86, 128, rnd()) + hue * 10, lerp(30, 52, rnd())].map((v) => clamp(v * lit, 0, 255));
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = rgb(...gcol);
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -wid, len / 2, 0); ctx.quadraticCurveTo(0, wid, -len / 2, 0); ctx.fill();
    ctx.strokeStyle = `rgba(20,40,15,0.35)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();
  }
  const t = toTex(c, { wrap: false });
  return t;
}

// ---------- 远处的林带（一圈贴在远处的剪影，带透明，雾会把它染淡）----------
//   三层：最远的一层又矮又淡，近的一层高、颜色深；每一团树冠左上亮、右下暗，缝里露出一点树干
export function genTreeline({ seed = 7161, W = 2048, H = 512 } = {}) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const layers = [[[128, 146, 132], 0.5, 90], [[92, 116, 90], 0.36, 110], [[62, 86, 58], 0.22, 130]];
  layers.forEach(([base, top0, count], li) => {
    for (let k = 0; k < count; k++) {
      const x = rnd() * W, r = 26 + rnd() * 46 + li * 8, top = H * (top0 + rnd() * 0.22);
      // 树干
      ctx.fillStyle = rgb(base[0] * 0.55, base[1] * 0.5, base[2] * 0.45);
      ctx.fillRect(x - 3, top + r, 6, H - top - r);
      // 树冠：几团叠在一起
      for (let j = 0; j < 5; j++) {
        const cx = x + (rnd() - 0.5) * r * 1.2, cy = top + r * (0.7 + rnd() * 0.8), rr = r * (0.45 + rnd() * 0.45);
        const g = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
        const k2 = 0.85 + rnd() * 0.3;
        g.addColorStop(0, rgb(base[0] * k2 * 1.25, base[1] * k2 * 1.22, base[2] * k2 * 1.15));
        g.addColorStop(0.7, rgb(base[0] * k2, base[1] * k2, base[2] * k2));
        g.addColorStop(1, rgb(base[0] * k2 * 0.75, base[1] * k2 * 0.78, base[2] * k2 * 0.75));
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let a = 0; a <= 24; a++) { const t = (a / 24) * Math.PI * 2, w = rr * (0.86 + rnd() * 0.22); ctx.lineTo(cx + Math.cos(t) * w, cy + Math.sin(t) * w); }
        ctx.fill();
      }
    }
    // 这一层的底部连成一片
    ctx.fillStyle = rgb(base[0] * 0.8, base[1] * 0.82, base[2] * 0.8);
    ctx.fillRect(0, H * (0.82 + li * 0.04), W, H);
  });
  const t = toTex(c, { wrap: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- 窗户里面：半开的百叶窗 + 暗暗的室内 ----------
export function genBlinds({ seed = 7171, W = 256, H = 256 } = {}) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3f44'); g.addColorStop(1, '#23272b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const down = H * (0.35 + rnd() * 0.45);
  for (let y = 0; y < down; y += 7) { ctx.fillStyle = `rgba(215,212,204,${0.75 + rnd() * 0.15})`; ctx.fillRect(4, y, W - 8, 4); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(4, y + 4, W - 8, 1); }
  // 室内一盏灯、一块公告板的影子
  ctx.fillStyle = 'rgba(255,240,210,0.25)'; ctx.fillRect(W * 0.2, down + 20, W * 0.25, 8);
  ctx.fillStyle = 'rgba(120,130,140,0.35)'; ctx.fillRect(W * 0.55, down + 30, W * 0.3, H * 0.25);
  return toTex(c, { wrap: false });
}

// ---------- 招牌 / 横幅上的字（全英文）----------
export function genSignText(lines, { W = 1024, H = 256, bg = '#f4f1ea', fg = '#1a1a1a', font = '"Helvetica Neue","Arial Black",Arial,sans-serif', border = null, grain = true } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = H * 0.04; ctx.strokeRect(H * 0.04, H * 0.04, W - H * 0.08, H - H * 0.08); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [text, size, color, y, weight = 'bold', spacing = 0] of lines) {
    ctx.fillStyle = color || fg; ctx.font = `${weight} ${size}px ${font}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, W / 2, H * y);
  }
  if (grain && bg) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, rnd = mulberry32(W + H);
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  return toTex(c, { wrap: false });
}
