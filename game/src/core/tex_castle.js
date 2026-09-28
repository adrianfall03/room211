// 第七章贴图：地堡 211 —— 公元 1403 年的波希米亚（参考《天国：拯救》）
//   墙：粗凿的石块 + 石灰砂浆，墙根返潮发绿、墙顶被火把熏黑，零零星星还剩几块刷过的白灰；
//   地：大小不一的石板，走得最多的地方磨得发亮，缝里全是土和碎稻草；拱顶：一层层小石块，整个被烟熏透了；
//   其他：稻草、羊毛毯、亚麻布、羊皮纸、波希米亚双尾白狮旗、圣母像、手绘地图、剑身上的铭文、符木上的刻痕、骰子……
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, HAND } from './textures.js';
import { mulberry32, clamp, smoothstep, lerp } from './util.js';

const rgb = (hex) => hexToRgb(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dataTex = (c, rep = null) => { const t = toTex(c, { data: true }); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const colTex = (c, rep = null) => { const t = toTex(c); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
// 衬线字：中文用宋体 / 楷体，拉丁文用 Palatino 一类的书写体
export const SERIF = '"Songti SC","STSong","SimSun","Noto Serif SC","Source Han Serif SC",Georgia,serif';
export const LATIN = '"Palatino Linotype","Book Antiqua",Palatino,"Iowan Old Style",Georgia,serif';

function roughFrom(h, base = 0.85, span = 0.2, extra = null, glossy = 0.3) {
  const W = h.width, H = h.height, s = h.getContext('2d').getImageData(0, 0, W, H).data;
  const e = extra ? extra.getContext('2d').getImageData(0, 0, W, H).data : null;
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    let r = base + (s[i] / 255 - 0.5) * span;
    if (e) r = lerp(r, glossy, e[i] / 255);
    const v = clamp(r, 0.04, 1) * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  });
  return c;
}
function triple(W, H) {
  const hC = makeCanvas(W, H), cC = makeCanvas(W, H), xC = makeCanvas(W, H);
  const hI = hC.getContext('2d').createImageData(W, H), cI = cC.getContext('2d').createImageData(W, H), xI = xC.getContext('2d').createImageData(W, H);
  return {
    hC, cC, xC,
    set(i, h, col, x = 0) {
      hI.data[i] = hI.data[i + 1] = hI.data[i + 2] = clamp(h, 0, 1) * 255; hI.data[i + 3] = 255;
      cI.data[i] = col[0]; cI.data[i + 1] = col[1]; cI.data[i + 2] = col[2]; cI.data[i + 3] = 255;
      xI.data[i] = xI.data[i + 1] = xI.data[i + 2] = clamp(x, 0, 1) * 255; xI.data[i + 3] = 255;
    },
    put() { hC.getContext('2d').putImageData(hI, 0, 0); cC.getContext('2d').putImageData(cI, 0, 0); xC.getContext('2d').putImageData(xI, 0, 0); },
  };
}

// ---------- 砌石：一层层的石块，每层的石头长短不一，左右首尾相接（贴图横向无缝）----------
// 返回 { rowOf(yPx) → 行号, rows: [{ y0, y1, cut: [...分界], off }] }；每一行的分界都在 [0, W) 里，最后一块跨过右边界接回左边
function masonry(rnd, W, total, [hMin, hMax], [wMin, wMax], first = null) {
  const hs = [];
  let sum = 0;
  if (first) { hs.push(first); sum += first; }
  while (sum < total) { const h = hMin + rnd() * (hMax - hMin); hs.push(h); sum += h; }
  const k = total / sum; // 缩放到正好铺满
  const rows = [];
  let y = 0;
  for (const h of hs) {
    const y0 = Math.round(y), y1 = Math.round(y + h * k);
    const cut = [];
    let x = rnd() * W;
    const start = x;
    cut.push(x);
    for (;;) {
      const w = wMin + rnd() * (wMax - wMin);
      if (x + w > start + W - wMin * 0.6) break;
      x += w; cut.push(x);
    }
    rows.push({ y0, y1, cut: cut.map((c) => c % W).sort((a, b) => a - b) });
    y += h * k;
  }
  const rowOf = new Int16Array(total);
  rows.forEach((r, i) => { for (let yy = r.y0; yy < Math.min(total, r.y1); yy++) rowOf[yy] = i; });
  return { rows, rowOf };
}
// x 落在这一行的哪块石头上：返回 [石头编号, 离左缝的距离, 离右缝的距离]
function stoneAt(row, x, W) {
  const c = row.cut, n = c.length;
  let j = n - 1;
  for (let k = 0; k < n; k++) if (c[k] > x) { j = k - 1; break; }
  const a = j < 0 ? c[n - 1] - W : c[j];
  const b = j + 1 < n ? c[j + 1] : c[0] + W;
  return [(j + n) % n, x - a, b - x];
}
const cornerD = (dx, dy, rc) => (dx < rc && dy < rc ? rc - Math.hypot(rc - dx, rc - dy) : Math.min(dx, dy));

// ================= 墙：粗凿石块 + 石灰砂浆 =================
// 平铺 2m × 3m：256 像素 / 米；贴图最下面是地面、最上面是拱脚（3m）
export function genCastleWall({ seed = 7101, W = 512, H = 768 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const T = triple(W, H);
  const M = masonry(rnd, W, H, [56, 90], [80, 190], 104); // 第一层是 40cm 的大石头做墙基
  const pal = ['#8a8272', '#9a8e78', '#7c7568', '#a09482', '#6f6a60', '#8f806a', '#958a7a'].map(rgb);
  const mortar = rgb('#a39c8c'), mortarD = rgb('#6a6458'), soot = rgb('#17130f'), damp = rgb('#34372a'), lime = rgb('#d6cfbe');
  for (let y = 0; y < H; y++) {
    const yp = H - 1 - y, yw = yp / 256;
    const row = M.rows[M.rowOf[yp]];
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = x / W, v = y / H;
      const n = N.fbm(u * 5, v * 7.5, 4, 5, 7.5), nf = N.noise(x / 2.2, y / 2.2, W / 2.2, H / 2.2), nm = N.fbm(u * 16, v * 24, 3, 16, 24);
      const [si, dl, dr] = stoneAt(row, x, W);
      const dy0 = yp - row.y0, dy1 = row.y1 - yp;
      const dx = Math.min(dl, dr), dyy = Math.min(dy0, dy1);
      const ed = cornerD(dx, dyy, 14) + (nm - 0.5) * 9;
      const hr = hash2(M.rowOf[yp] * 3.7 + 1, si * 1.3 + 0.5);
      const mw = 3.5 + (n - 0.5) * 3;
      let c, h, gl = 0;
      if (ed < mw) {
        // 砂浆：凹进去，颜色发灰发白，被灰土糊得深浅不一
        c = mix3(mortarD, mortar, 0.35 + n * 0.6 + (nf - 0.5) * 0.2);
        h = 0.18 + nf * 0.06;
      } else {
        const base = pal[Math.floor(hr * pal.length) % pal.length];
        c = mix3(base, mix3(base, [40, 36, 30], 0.5), clamp((n - 0.5) * 1.2 + (nm - 0.5) * 0.6, 0, 1));
        c = mix3(c, [205, 196, 176], smoothstep(0.78, 0.95, nf) * 0.25); // 凿子凿出来的亮点
        // 石头边上被磨圆、积了一圈灰
        const bev = smoothstep(mw, mw + 16, ed);
        c = mix3(c, [58, 52, 44], (1 - bev) * 0.35);
        const bulge = 0.08 * Math.sin(clamp(dl / (dl + dr), 0, 1) * Math.PI) * Math.sin(clamp(dy0 / (dy0 + dy1), 0, 1) * Math.PI);
        h = 0.45 + bev * 0.2 + bulge + (nf - 0.5) * 0.08 + (nm - 0.5) * 0.1;
      }
      // 刷过白灰的地方（剩下几片，边缘剥落）
      const wash = smoothstep(0.6, 0.66, N.fbm(u * 2 + 11, v * 3, 4, 2, 3)) * smoothstep(0.5, 0.9, yw) * (1 - smoothstep(2.1, 2.5, yw));
      if (wash > 0.01) { c = mix3(c, mix3(lime, [150, 144, 128], nm * 0.5), wash * 0.85); h = lerp(h, 0.5 + nf * 0.03, wash * 0.7); gl = wash * 0.3; }
      // 墙根返潮：发暗、发绿，湿得反光
      const wet = (1 - smoothstep(0.08, 0.5 + n * 0.25, yw));
      c = mix3(c, damp, wet * 0.6);
      gl = Math.max(gl, wet * 0.45);
      // 墙顶被火把熏黑：一道道往上淌的烟
      const col5 = Math.floor(x / 6);
      const streak = hash2(col5, 3.1) > 0.7 ? smoothstep(0.4, 0.85, N.fbm(u * 50, v * 2, 3, 50, 2)) * smoothstep(1.4, 2.6, yw) : 0;
      const top = smoothstep(1.9, 3.0, yw) * (0.55 + n * 0.4);
      c = mix3(c, soot, clamp(top * 0.7 + streak * 0.4, 0, 0.88));
      T.set(i, h, c, gl);
    }
  }
  T.put();
  // 墙上刻的"正"字、一个十字架、铁环留下的锈印
  const ctx = T.cC.getContext('2d'), r2 = mulberry32(seed + 5);
  ctx.strokeStyle = 'rgba(210,200,180,0.28)'; ctx.lineWidth = 1.6;
  for (let k = 0; k < 2; k++) {
    const x0 = 60 + r2() * (W - 160), y0 = H - (1.2 + r2() * 0.3) * 256;
    for (let j = 0; j < 4; j++) { const xx = x0 + j * 9; ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx + (r2() - 0.5) * 2, y0 + 22); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0 - 5, y0 + 4); ctx.lineTo(x0 + 34, y0 + 18); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(W * 0.72, H - 1.55 * 256); ctx.lineTo(W * 0.72, H - 1.35 * 256); ctx.moveTo(W * 0.72 - 12, H - 1.49 * 256); ctx.lineTo(W * 0.72 + 12, H - 1.49 * 256); ctx.stroke();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 6)), roughnessMap: dataTex(roughFrom(T.hC, 0.92, 0.14, T.xC, 0.45)) };
}

// ================= 地：大小不一的石板（1.2m 一张贴图），缝里是土，走得多的地方磨得发亮 =================
export function genFlagstone({ seed = 7111, S = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const T = triple(S, S);
  const M = masonry(rnd, S, S, [120, 200], [150, 300]);
  const pal = ['#6e685c', '#7a7264', '#625d54', '#827868', '#5a564e', '#746a58'].map(rgb);
  const earth = rgb('#2a2218'), earthL = rgb('#4a3e2c');
  for (let y = 0; y < S; y++) {
    const row = M.rows[M.rowOf[y]];
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S, v = y / S;
      const n = N.fbm(u * 4, v * 4, 4, 4, 4), nf = N.noise(x / 1.6, y / 1.6, S / 1.6, S / 1.6), nm = N.fbm(u * 14, v * 14, 3, 14, 14);
      const [si, dl, dr] = stoneAt(row, x, S);
      const dy0 = y - row.y0, dy1 = row.y1 - y;
      const ed = cornerD(Math.min(dl, dr), Math.min(dy0, dy1), 22) + (nm - 0.5) * 12;
      const hr = hash2(M.rowOf[y] * 5.1 + 2, si * 2.3 + 1.1), hr2 = hash2(si * 1.9, M.rowOf[y] * 0.7 + 4);
      const mw = 4 + (n - 0.5) * 4;
      let c, h, gl = 0;
      if (ed < mw) { c = mix3(earth, earthL, n * 0.8 + (nf - 0.5) * 0.3); h = 0.12 + nf * 0.05; }
      else {
        c = mix3(pal[Math.floor(hr * pal.length) % pal.length], [34, 30, 26], clamp((n - 0.45) * 1.0, 0, 0.6));
        c = mix3(c, [150, 140, 122], smoothstep(0.8, 0.95, nf) * 0.2);
        // 每块石板微微倾斜（法线贴图上一块一块不一样）
        const tilt = ((dl / (dl + dr)) - 0.5) * (hr2 - 0.5) * 0.18 + ((dy0 / (dy0 + dy1)) - 0.5) * (hr - 0.5) * 0.18;
        // 裂纹
        const cr = hr > 0.6 ? smoothstep(0.986, 0.998, Math.abs(Math.sin(dl * 0.05 + dy0 * 0.09 + hr * 40) * Math.cos(dl * 0.03 - dy0 * 0.06 + hr2 * 17))) : 0;
        const bev = smoothstep(mw, mw + 18, ed);
        c = mix3(c, earth, (1 - bev) * 0.45 + cr * 0.7);
        h = 0.5 + bev * 0.12 + tilt + (nf - 0.5) * 0.05 - cr * 0.25;
        gl = bev * (0.25 + smoothstep(0.4, 0.7, N.fbm(u * 2 + 5, v * 2, 3, 2, 2)) * 0.45) * (1 - cr); // 被鞋底磨亮的地方
      }
      T.set(i, h, c, gl);
    }
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 5)), roughnessMap: dataTex(roughFrom(T.hC, 0.9, 0.16, T.xC, 0.5)) };
}

// ================= 地上盖的一层：碎稻草、土、脚印、狗爪印（透明，整间屋子一张）=================
export function genStrawLitter(W = 512, H = 1152) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(7121), N = createNoise(7121);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 80, y / 80, 4, W / 80, H / 80);
    const edge = Math.min(x, W - x) / W;
    const a = smoothstep(0.52, 0.8, n) * 0.45 + smoothstep(0.14, 0.0, edge) * 0.4;
    d[i] = 40; d[i + 1] = 32; d[i + 2] = 22; d[i + 3] = clamp(a, 0, 0.8) * 255;
  });
  // 散落的稻草：墙根、床边多，过道中间少
  for (let k = 0; k < 2600; k++) {
    let x = rnd() * W;
    if (rnd() < 0.6) x = rnd() < 0.5 ? rnd() * W * 0.28 : W - rnd() * W * 0.28;
    const y = rnd() * H, len = 6 + rnd() * 22, a = rnd() * Math.PI;
    const g = rnd();
    ctx.strokeStyle = `rgba(${170 + g * 50},${130 + g * 50},${60 + g * 30},${0.35 + rnd() * 0.45})`;
    ctx.lineWidth = 0.8 + rnd() * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  // 靴印：从门口一路往里
  ctx.fillStyle = 'rgba(22,16,10,0.3)';
  for (let k = 0; k < 36; k++) {
    const x = W * 0.3 + (rnd() - 0.5) * W * 0.35, y = H * 0.55 + rnd() * H * 0.45, a = (rnd() - 0.5) * 0.7;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -4, 5, 9, 0, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 10, 4, 5, 0, 0, 6.28); ctx.fill(); ctx.restore();
  }
  // 狗爪印
  ctx.fillStyle = 'rgba(22,16,10,0.28)';
  for (let k = 0; k < 30; k++) {
    const x = W * 0.35 + (rnd() - 0.5) * W * 0.5, y = H * 0.2 + rnd() * H * 0.55;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill();
    for (let t = 0; t < 4; t++) { ctx.beginPath(); ctx.arc(x - 4.5 + t * 3, y - 5 - (t === 1 || t === 2 ? 1.2 : 0), 1.3, 0, 6.28); ctx.fill(); }
  }
  return toTex(c, { wrap: false });
}

// ================= 拱顶：一层层的小石块，整个被烟熏透了（2m × 2m 一张），渗出来几道白色的盐霜 =================
export function genVault({ seed = 7131, S = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const T = triple(S, S);
  const M = masonry(rnd, S, S, [44, 64], [70, 130]);
  const pal = ['#5e584e', '#6a6254', '#524d45', '#665c4c', '#4a463e'].map(rgb);
  const mortar = rgb('#6a645a'), soot = rgb('#14110e'), salt = rgb('#b8b2a2');
  for (let y = 0; y < S; y++) {
    const row = M.rows[M.rowOf[y]];
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S, v = y / S;
      const n = N.fbm(u * 4, v * 4, 4, 4, 4), nf = N.noise(x / 2, y / 2, S / 2, S / 2), nm = N.fbm(u * 18, v * 18, 3, 18, 18);
      const [si, dl, dr] = stoneAt(row, x, S);
      const dy0 = y - row.y0, dy1 = row.y1 - y;
      const ed = cornerD(Math.min(dl, dr), Math.min(dy0, dy1), 9) + (nm - 0.5) * 6;
      const hr = hash2(M.rowOf[y] * 2.9 + 3, si * 1.7);
      let c, h;
      if (ed < 3) { c = mix3(soot, mortar, 0.4 + n * 0.4); h = 0.2 + nf * 0.05; }
      else {
        c = pal[Math.floor(hr * pal.length) % pal.length];
        const bev = smoothstep(3, 12, ed);
        c = mix3(c, soot, (1 - bev) * 0.4);
        h = 0.45 + bev * 0.18 + (nf - 0.5) * 0.08 + (hr - 0.5) * 0.06;
      }
      c = mix3(c, soot, clamp(0.35 + (n - 0.5) * 0.9, 0.1, 0.8));
      // 盐霜：一道道白
      const s1 = smoothstep(0.72, 0.8, N.fbm(u * 3 + 9, v * 10, 4, 3, 10)) * (0.5 + nf * 0.5);
      c = mix3(c, salt, s1 * 0.45);
      T.set(i, h, c, 0);
    }
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 5)) };
}

// ================= 稻草（床垫、狗窝、稻草堆）=================
export function genStraw({ seed = 7141, S = 256 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.fillStyle = '#6a5228'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 2200; k++) {
    const x = rnd() * S, y = rnd() * S, len = 10 + rnd() * 34, a = (rnd() - 0.5) * 1.2 + (rnd() < 0.3 ? Math.PI / 2 : 0);
    const g = rnd();
    ctx.strokeStyle = g < 0.12 ? `rgba(60,44,20,0.7)` : `rgba(${160 + g * 70},${118 + g * 70},${50 + g * 40},${0.6 + rnd() * 0.4})`;
    ctx.lineWidth = 0.8 + rnd() * 1.6;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); ctx.stroke();
    }
  }
  return toTex(c);
}

// ================= 羊毛毯（格子 / 素色）、亚麻布 =================
export function genWool({ base = '#6a4a32', stripe = '#3a2a1c', stripe2 = null, seed = 7151, S = 256, plaid = true, step = 64 } = {}) {
  const N = createNoise(seed), cb = rgb(base), cs = rgb(stripe), c2 = stripe2 ? rgb(stripe2) : null;
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const fuzz = N.noise(x / 1.3, y / 1.3, S / 1.3, S / 1.3), big = N.fbm(x / S * 4, y / S * 4, 3, 4, 4);
    let col = cb;
    if (plaid) {
      const bx = (x % step) / step, by = (y % step) / step;
      const sx = bx < 0.18 ? 1 : 0, sy = by < 0.18 ? 1 : 0;
      col = mix3(col, cs, (sx + sy) * 0.42);
      if (c2 && (Math.abs(bx - 0.6) < 0.03 || Math.abs(by - 0.6) < 0.03)) col = mix3(col, c2, 0.6);
    }
    const tw = ((x + y) % 4 < 2 ? 1 : -1) * 5; // 斜纹
    const k = (fuzz - 0.5) * 34 + (big - 0.5) * 24 + tw;
    d[i] = clamp(col[0] + k, 0, 255); d[i + 1] = clamp(col[1] + k, 0, 255); d[i + 2] = clamp(col[2] + k * 0.9, 0, 255); d[i + 3] = 255;
  });
  return toTex(c);
}

// ================= 羊皮纸（信、配方、画像背面……）：只是纸面和看不清的字迹 =================
export function genParchment({ seed = 7161, W = 256, H = 340, lines = 12, ink = 'rgba(52,32,18,0.7)', title = null } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(seed), rnd = mulberry32(seed);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 60, y / 60, 4, W / 60, H / 60), e = Math.min(x, W - x, y, H - y);
    let col = mix3(rgb('#d8c49a'), rgb('#b8986a'), clamp((n - 0.35) * 1.4, 0, 1));
    col = mix3(col, rgb('#7a5a34'), smoothstep(20, 0, e + (n - 0.5) * 20) * 0.7);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = e + (n - 0.5) * 8 < 1.5 ? 0 : 255;
  });
  if (title) { ctx.fillStyle = 'rgba(120,30,20,0.85)'; ctx.font = `bold ${Math.round(W * 0.09)}px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText(title, W / 2, H * 0.13); }
  ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  const y0 = title ? H * 0.22 : H * 0.1;
  for (let l = 0; l < lines; l++) {
    const y = y0 + l * ((H * 0.84 - y0) / lines);
    let x = W * 0.1;
    const end = W * (0.82 + rnd() * 0.08) - (l === lines - 1 ? W * 0.3 : 0);
    while (x < end) {
      const w = 5 + rnd() * 16;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let t = 0; t < w; t += 2.5) ctx.lineTo(x + t, y + Math.sin(t * 1.3 + rnd() * 3) * 2.2 - (rnd() < 0.15 ? 4 : 0));
      ctx.stroke();
      x += w + 3 + rnd() * 4;
    }
  }
  return toTex(c, { wrap: false });
}

// ================= 手绘地图：波希米亚的一角（萨扎瓦河、拉泰、塔尔姆堡、斯卡利茨、萨扎瓦修道院）=================
export function genMap(W = 512, H = 384) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(7171), rnd = mulberry32(7171);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 70, y / 70, 4, W / 70, H / 70), e = Math.min(x, W - x, y, H - y);
    let col = mix3(rgb('#dcc89c'), rgb('#b89a6a'), clamp((n - 0.3) * 1.3, 0, 1));
    col = mix3(col, rgb('#6a4a2a'), smoothstep(26, 0, e + (n - 0.5) * 24) * 0.75);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  const ink = 'rgba(60,38,20,0.85)';
  // 河：从右上蜿蜒到左下
  ctx.strokeStyle = 'rgba(60,80,110,0.75)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W * 0.96, H * 0.18);
  ctx.bezierCurveTo(W * 0.7, H * 0.3, W * 0.62, H * 0.12, W * 0.48, H * 0.42);
  ctx.bezierCurveTo(W * 0.36, H * 0.66, W * 0.18, H * 0.56, W * 0.04, H * 0.86); ctx.stroke();
  // 树林：一片片小树
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  for (let k = 0; k < 90; k++) {
    const x = rnd() * W, y = rnd() * H;
    if (Math.hypot(x - W * 0.5, y - H * 0.42) < 60 || y < 30 || y > H - 30 || x < 30 || x > W - 30) continue;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 7); ctx.moveTo(x - 5, y + 4); ctx.lineTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.stroke();
  }
  const castle = (x, y, s = 1) => {
    ctx.fillStyle = ink;
    ctx.fillRect(x - 10 * s, y - 8 * s, 20 * s, 12 * s);
    for (let k = -1; k <= 1; k++) ctx.fillRect(x + k * 7 * s - 3 * s, y - 14 * s, 6 * s, 6 * s);
    ctx.fillRect(x - 3 * s, y - 22 * s, 6 * s, 14 * s);
  };
  const label = (t, x, y, col = ink, sz = 17) => { ctx.fillStyle = col; ctx.font = `bold ${sz}px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText(t, x, y); };
  castle(W * 0.5, H * 0.46); label('拉泰', W * 0.5, H * 0.46 + 24);
  castle(W * 0.78, H * 0.62, 0.8); label('塔尔姆堡', W * 0.78, H * 0.62 + 22, ink, 15);
  castle(W * 0.2, H * 0.3, 0.7); label('萨扎瓦修道院', W * 0.2, H * 0.3 + 20, ink, 14);
  // 斯卡利茨：被烧了，画个叉 + 火
  label('斯卡利茨', W * 0.84, H * 0.2, 'rgba(130,30,20,0.9)', 15);
  ctx.strokeStyle = 'rgba(130,30,20,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W * 0.84 - 12, H * 0.2 - 36); ctx.lineTo(W * 0.84 + 12, H * 0.2 - 14); ctx.moveTo(W * 0.84 + 12, H * 0.2 - 36); ctx.lineTo(W * 0.84 - 12, H * 0.2 - 14); ctx.stroke();
  // 库曼人：一串红箭头从东北压过来
  ctx.strokeStyle = 'rgba(150,30,20,0.8)'; ctx.fillStyle = 'rgba(150,30,20,0.8)'; ctx.lineWidth = 3;
  const arrow = (x0, y0, x1, y1) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 20, (y0 + y1) / 2 - 10, x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.4) * 14, y1 - Math.sin(a - 0.4) * 14); ctx.lineTo(x1 - Math.cos(a + 0.4) * 14, y1 - Math.sin(a + 0.4) * 14); ctx.fill();
  };
  arrow(W * 0.92, H * 0.3, W * 0.6, H * 0.44); arrow(W * 0.94, H * 0.48, W * 0.62, H * 0.52);
  label('库曼人', W * 0.86, H * 0.4, 'rgba(150,30,20,0.9)', 14);
  // 罗盘
  ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
  const cx = W * 0.12, cy = H * 0.82;
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 30); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.stroke();
  label('北', cx, cy - 34, ink, 13);
  return toTex(c, { wrap: false });
}

// ================= 波希米亚王国的旗：红底上一头双尾白狮（燕尾旗）=================
function lionPath(ctx, s) {
  // 一头人立起来的狮子（朝左），在 [0,1]×[0,1] 的格子里画，s = 缩放
  const P = (x, y) => [x * s, y * s];
  ctx.beginPath();
  ctx.moveTo(...P(0.52, 0.12));
  ctx.bezierCurveTo(...P(0.42, 0.06), ...P(0.3, 0.1), ...P(0.3, 0.2)); // 后脑勺 → 脸
  ctx.lineTo(...P(0.22, 0.22)); ctx.lineTo(...P(0.27, 0.26)); ctx.lineTo(...P(0.2, 0.3)); // 张着的嘴
  ctx.lineTo(...P(0.3, 0.31)); ctx.bezierCurveTo(...P(0.3, 0.36), ...P(0.34, 0.37), ...P(0.36, 0.38)); // 下巴
  ctx.lineTo(...P(0.2, 0.38)); ctx.lineTo(...P(0.14, 0.33)); ctx.lineTo(...P(0.12, 0.38)); ctx.lineTo(...P(0.2, 0.43)); // 前爪（上）
  ctx.lineTo(...P(0.34, 0.45)); ctx.lineTo(...P(0.22, 0.5)); ctx.lineTo(...P(0.14, 0.48)); ctx.lineTo(...P(0.13, 0.53)); ctx.lineTo(...P(0.24, 0.56)); // 前爪（下）
  ctx.lineTo(...P(0.38, 0.54));
  ctx.bezierCurveTo(...P(0.36, 0.64), ...P(0.4, 0.72), ...P(0.34, 0.8)); // 肚子 → 前腿
  ctx.lineTo(...P(0.24, 0.84)); ctx.lineTo(...P(0.22, 0.9)); ctx.lineTo(...P(0.34, 0.89)); ctx.lineTo(...P(0.46, 0.8)); // 后爪（前）
  ctx.lineTo(...P(0.5, 0.86)); ctx.lineTo(...P(0.46, 0.94)); ctx.lineTo(...P(0.58, 0.93)); ctx.lineTo(...P(0.62, 0.82)); // 后爪（后）
  ctx.bezierCurveTo(...P(0.66, 0.72), ...P(0.62, 0.6), ...P(0.64, 0.5)); // 后背
  ctx.bezierCurveTo(...P(0.66, 0.4), ...P(0.62, 0.3), ...P(0.6, 0.22)); // 鬃毛
  ctx.bezierCurveTo(...P(0.62, 0.17), ...P(0.58, 0.13), ...P(0.52, 0.12));
  ctx.closePath();
  ctx.fill();
  // 双尾：从屁股甩上去、在顶上分成两股
  ctx.lineWidth = 0.035 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...P(0.63, 0.72)); ctx.bezierCurveTo(...P(0.82, 0.7), ...P(0.72, 0.5), ...P(0.8, 0.4)); ctx.bezierCurveTo(...P(0.86, 0.32), ...P(0.78, 0.26), ...P(0.84, 0.18)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...P(0.8, 0.4)); ctx.bezierCurveTo(...P(0.94, 0.36), ...P(0.86, 0.26), ...P(0.94, 0.2)); ctx.stroke();
  // 王冠
  ctx.beginPath(); ctx.moveTo(...P(0.38, 0.1)); ctx.lineTo(...P(0.4, 0.02)); ctx.lineTo(...P(0.44, 0.07)); ctx.lineTo(...P(0.48, 0.0)); ctx.lineTo(...P(0.51, 0.07)); ctx.lineTo(...P(0.55, 0.02)); ctx.lineTo(...P(0.55, 0.11)); ctx.closePath(); ctx.fill();
}
export function genBanner(W = 256, H = 400) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(7181);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 40, y / 40, 4, W / 40, H / 40), wv = (x % 3 === 0 ? -8 : 0) + (y % 3 === 0 ? -6 : 0);
    let col = mix3(rgb('#8a1c16'), rgb('#5a100c'), clamp((n - 0.35) * 1.3, 0, 1));
    col = mix3(col, [20, 10, 8], smoothstep(0.6, 1, y / H) * 0.3);
    // 燕尾：底下剪开一个三角
    const cut = y > H * 0.82 && Math.abs(x - W / 2) < (y - H * 0.82) * (W / 2) / (H * 0.18);
    d[i] = clamp(col[0] + wv, 0, 255); d[i + 1] = clamp(col[1] + wv, 0, 255); d[i + 2] = clamp(col[2] + wv, 0, 255); d[i + 3] = cut ? 0 : 255;
  });
  ctx.save(); ctx.translate(W * 0.1, H * 0.14);
  ctx.fillStyle = '#e8e2d4'; ctx.strokeStyle = '#e8e2d4';
  lionPath(ctx, W * 0.8);
  ctx.restore();
  // 狮子的爪子、王冠描一点金
  ctx.strokeStyle = 'rgba(200,160,60,0.9)'; ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, W - 20, H * 0.8 - 10);
  return toTex(c, { wrap: false });
}
// 盾牌上的：同一头狮子，画在一张方图上
export function genShieldFace(S = 256) {
  const c = makeCanvas(S, S * 1.6), ctx = c.getContext('2d'), N = createNoise(7191);
  const W = S, H = S * 1.6;
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 30, y / 30, 4, W / 30, H / 30);
    let col = mix3(rgb('#9a2a1e'), rgb('#6a1a12'), clamp((n - 0.3) * 1.2, 0, 1));
    col = mix3(col, rgb('#b89a6a'), smoothstep(0.72, 0.85, N.fbm(x / 18, y / 18, 3, W / 18, H / 18)) * 0.6); // 漆掉了露出木头
    const e = Math.min(x, W - x, y, H - y);
    if (e < 12) col = mix3(rgb('#3a3a36'), rgb('#6a6a64'), n);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.save(); ctx.translate(W * 0.12, H * 0.2); ctx.fillStyle = '#e4dccc'; ctx.strokeStyle = '#e4dccc'; lionPath(ctx, W * 0.76); ctx.restore();
  return toTex(c, { wrap: false });
}

// ================= 圣母像（金底、蓝袍、光环）=================
export function genIcon(W = 160, H = 220) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(7201);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 20, y / 20, 4, W / 20, H / 20);
    const col = mix3(rgb('#c89a3a'), rgb('#8a6420'), clamp((n - 0.3) * 1.2, 0, 1));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  // 光环
  ctx.strokeStyle = '#f0d27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H * 0.3, 30, 0, 6.28); ctx.stroke();
  // 蓝袍（斗篷）+ 脸
  ctx.fillStyle = '#1e2e5a';
  ctx.beginPath(); ctx.moveTo(W / 2, H * 0.18); ctx.bezierCurveTo(W * 0.2, H * 0.22, W * 0.18, H * 0.6, W * 0.16, H * 0.94); ctx.lineTo(W * 0.84, H * 0.94); ctx.bezierCurveTo(W * 0.82, H * 0.6, W * 0.8, H * 0.22, W / 2, H * 0.18); ctx.fill();
  ctx.fillStyle = '#8a2a20'; ctx.beginPath(); ctx.moveTo(W * 0.38, H * 0.45); ctx.lineTo(W * 0.62, H * 0.45); ctx.lineTo(W * 0.66, H * 0.94); ctx.lineTo(W * 0.34, H * 0.94); ctx.fill();
  ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.3, 15, 19, 0, 0, 6.28); ctx.fill();
  // 怀里的孩子
  ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.arc(W * 0.42, H * 0.54, 11, 0, 6.28); ctx.fill();
  ctx.strokeStyle = '#f0d27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W * 0.42, H * 0.54, 16, 0, 6.28); ctx.stroke();
  // 岁月：裂纹、烟熏
  const r = mulberry32(7202);
  ctx.strokeStyle = 'rgba(40,24,10,0.35)'; ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) { const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// ================= 剑身：锈的 / 磨亮之后（刻着一行铭文和一个罗马数字）=================
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export function drawBlade(c, { rust = 1, numeral = '' } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d'), N = createNoise(7211);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H, n = N.fbm(u * 12, v * 3, 4, 12, 3), nf = N.noise(x / 1.5, y / 1.5, W / 1.5, H / 1.5);
    // 剑身：中间一道血槽，两边刃口亮
    const cen = Math.abs(v - 0.5) * 2;
    let col = mix3(rgb('#b8bcc0'), rgb('#e4e8ea'), smoothstep(0.7, 0.95, cen) + (nf - 0.5) * 0.2);
    if (cen < 0.18) col = mix3(col, rgb('#7a7e84'), 0.55);
    // 锈：一大片一大片，边上一圈更深
    const r = clamp(smoothstep(0.3, 0.55, n + (1 - rust) * 0.8 * -1 + (rust - 1) * 0.5), 0, 1) * rust;
    const rc = mix3(rgb('#7a3a18'), rgb('#a8581e'), nf);
    col = mix3(col, rc, clamp(r * 1.1, 0, 1));
    col = mix3(col, rgb('#3a1a0a'), smoothstep(0.52, 0.56, n) * rust * 0.5);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  if (rust < 0.5) {
    ctx.fillStyle = `rgba(40,30,20,${0.85 - rust})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(H * 0.34)}px ${LATIN}`;
    ctx.fillText('✠ URTICA ✠', W * 0.34, H * 0.5);
    ctx.font = `bold ${Math.round(H * 0.5)}px ${LATIN}`;
    ctx.fillText(numeral, W * 0.72, H * 0.52);
  }
}
// 线索本 / 弹窗里的大图：整把剑平放着，剑身上的刻字
export function drawBladeDoc(c, numeral) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2018'; ctx.fillRect(0, 0, W, H);
  const b = makeCanvas(512, 64); drawBlade(b, { rust: 0.15, numeral });
  ctx.save();
  ctx.beginPath(); ctx.moveTo(W * 0.2, H * 0.36); ctx.lineTo(W * 0.9, H * 0.4); ctx.lineTo(W * 0.97, H * 0.5); ctx.lineTo(W * 0.9, H * 0.6); ctx.lineTo(W * 0.2, H * 0.64); ctx.closePath(); ctx.clip();
  ctx.drawImage(b, W * 0.2, H * 0.36, W * 0.78, H * 0.28);
  ctx.restore();
  // 护手、握把、剑首
  ctx.fillStyle = '#4a3a2a'; ctx.fillRect(W * 0.18, H * 0.12, W * 0.025, H * 0.76);
  ctx.fillStyle = '#3a2416'; ctx.fillRect(W * 0.06, H * 0.42, W * 0.12, H * 0.16);
  ctx.fillStyle = '#5a4a36'; ctx.beginPath(); ctx.arc(W * 0.045, H * 0.5, H * 0.1, 0, 6.28); ctx.fill();
}

// ================= 符木：一根木棍，上面刻着 n 道刻痕（中世纪记数用的）=================
export function drawTally(c, n) {
  const W = c.width, H = c.height, ctx = c.getContext('2d'), N = createNoise(7221);
  pixels(c, (x, y, d, i) => {
    const g = N.fbm(x / W * 3, y / H * 18, 3, 3, 18);
    const col = mix3(rgb('#8a6a42'), rgb('#b8905a'), g);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  const x0 = W * 0.14, x1 = W * 0.9, step = (x1 - x0) / 10;
  for (let k = 0; k < n; k++) {
    const x = x0 + (k + 0.5) * step + (k >= 5 ? step * 0.3 : 0);
    const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
    g.addColorStop(0, 'rgba(40,24,10,0.95)'); g.addColorStop(0.5, 'rgba(90,60,30,0.6)'); g.addColorStop(1, 'rgba(210,180,130,0.8)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x + 1.5, H * 0.72); ctx.lineTo(x - 1.5, H * 0.72); ctx.fill();
  }
  // 一头刻着室友的记号
  ctx.fillStyle = 'rgba(40,24,10,0.8)'; ctx.font = `bold ${Math.round(H * 0.55)}px ${LATIN}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✠', W * 0.06, H * 0.52);
}

// ================= 骰子的六个面（BoxGeometry 的面顺序：+x -x +y -y +z -z → 点数 2 5 1 6 3 4）=================
export const DIE_FACES = [2, 5, 1, 6, 3, 4];
const PIPS = { 1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]], 4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], 5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]], 6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]] };
export function genDieFaces({ bg = '#e8dcc0', pip = '#2a1a10', seed = 1, grain = false } = {}) {
  const N = createNoise(7231 + seed);
  return DIE_FACES.map((v, f) => {
    const S = 64, c = makeCanvas(S, S), ctx = c.getContext('2d'), b = rgb(bg);
    pixels(c, (x, y, d, i) => {
      const n = grain ? N.fbm(x / 64 * 2 + f, y / 64 * 12, 3, 2, 12) : N.fbm(x / 20 + f * 3, y / 20, 3, 64 / 20, 64 / 20);
      const k = (n - 0.5) * (grain ? 60 : 30);
      d[i] = clamp(b[0] + k, 0, 255); d[i + 1] = clamp(b[1] + k, 0, 255); d[i + 2] = clamp(b[2] + k, 0, 255); d[i + 3] = 255;
    });
    ctx.fillStyle = pip;
    for (const [px, py] of PIPS[v]) { ctx.beginPath(); ctx.arc(px * S, py * S, S * 0.085, 0, 6.28); ctx.fill(); }
    const t = toTex(c, { wrap: false });
    return t;
  });
}

// ================= 骰子盘：圆木盘，里面一圈画着的分数格 =================
export function genDiceBoard(S = 256) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), N = createNoise(7241);
  pixels(c, (x, y, d, i) => {
    const g = N.fbm(x / S * 2, y / S * 14, 3, 2, 14);
    const col = mix3(rgb('#4a2e1a'), rgb('#6a4428'), g);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.strokeStyle = 'rgba(210,180,120,0.55)'; ctx.lineWidth = 3;
  for (const r of [0.47, 0.38]) { ctx.beginPath(); ctx.arc(S / 2, S / 2, S * r, 0, 6.28); ctx.stroke(); }
  ctx.fillStyle = 'rgba(210,180,120,0.5)'; ctx.font = `bold ${S * 0.05}px ${LATIN}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const marks = ['I', 'V', 'X', 'L', 'C', 'D', 'M', '✠'];
  marks.forEach((m, k) => { const a = (k / marks.length) * Math.PI * 2; ctx.save(); ctx.translate(S / 2 + Math.cos(a) * S * 0.425, S / 2 + Math.sin(a) * S * 0.425); ctx.rotate(a + Math.PI / 2); ctx.fillText(m, 0, 0); ctx.restore(); });
  return toTex(c, { wrap: false });
}

// ================= 磨刀石：砂岩圆盘，一圈圈的纹 =================
export function genWhetstone(S = 256) {
  const c = makeCanvas(S, S), N = createNoise(7251);
  pixels(c, (x, y, d, i) => {
    const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2), a = Math.atan2(y - S / 2, x - S / 2);
    const n = N.fbm(x / 30, y / 30, 4, S / 30, S / 30), ring = N.noise(r * 40, a * 3, 40, 20);
    let col = mix3(rgb('#8a7e66'), rgb('#b0a282'), n * 0.8 + ring * 0.3);
    col = mix3(col, rgb('#4a4234'), smoothstep(0.9, 1.0, r) * 0.5);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  return toTex(c);
}

// ================= 窗外：一层层的山（剪影 + 树梢），可选零星几点灯火；带透明 =================
export function genHills({ seed = 7261, W = 1024, H = 256, top = 0.3, amp = 0.35, trees = 1, color = '#1a2030', rim = null } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(seed), rnd = mulberry32(seed);
  const col = rgb(color);
  const ridge = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    let h = top + (N.fbm(u * 3, 0.5, 4, 3, 1) - 0.5) * amp * 2 + Math.sin(u * 6.28 * 1.5 + seed) * amp * 0.25;
    // 树梢：一个个小尖
    if (trees) h -= Math.pow(Math.abs(Math.sin(x * 0.35 + N.noise(x / 9, 1, W / 9, 4) * 6)), 3) * 0.035 * trees + N.noise(x / 3, 2, W / 3, 4) * 0.02 * trees;
    ridge[x] = h * H;
  }
  pixels(c, (x, y, d, i) => {
    const r = ridge[x];
    if (y < r) { d[i + 3] = 0; return; }
    const k = clamp((y - r) / (H * 0.5), 0, 1);
    const n = N.noise(x / 6, y / 6, W / 6, H / 6);
    let cc = mix3(col, mix3(col, [0, 0, 0], 0.4), k * 0.6 + (n - 0.5) * 0.15);
    if (rim && y - r < 3) cc = mix3(cc, rgb(rim), 0.5 * (1 - (y - r) / 3));
    d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = 255;
  });
  return toTex(c, { wrap: false });
}

// ================= 小窗（窗外的房子）：一张暖光的方格 =================
export function genWindowLit(S = 32) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,200,120,1)'); g.addColorStop(0.6, 'rgba(255,150,60,0.9)'); g.addColorStop(1, 'rgba(120,50,10,0.2)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(20,10,5,0.9)'; ctx.fillRect(S / 2 - 1, 0, 2, S); ctx.fillRect(0, S / 2 - 1, S, 2);
  return toTex(c, { wrap: false });
}

// ================= 城墙上巡逻的人影（剪影）：扛着长矛 / 举着火把 =================
export function genSentry(seed = 1) {
  const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'), rnd = mulberry32(7271 + seed);
  g.fillStyle = '#000';
  const cx = W / 2;
  g.beginPath(); g.ellipse(cx, 40, 14, 17, 0, 0, 6.28); g.fill(); // 头（戴着锅盔）
  g.beginPath(); g.ellipse(cx, 28, 22, 7, 0, 0, 6.28); g.fill(); // 帽檐
  g.beginPath(); g.moveTo(cx - 26, 62); g.quadraticCurveTo(cx, 52, cx + 26, 62); g.lineTo(cx + 24, 160); g.lineTo(cx - 24, 160); g.closePath(); g.fill(); // 棉甲
  g.lineCap = 'round'; g.strokeStyle = '#000'; g.lineWidth = 15;
  g.beginPath(); g.moveTo(cx - 8, 156); g.lineTo(cx - 12, 250); g.stroke();
  g.beginPath(); g.moveTo(cx + 8, 156); g.lineTo(cx + 12, 250); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(cx + 26, 250); g.lineTo(cx + 36, 4); g.stroke(); // 长矛
  g.beginPath(); g.moveTo(cx + 36, 0); g.lineTo(cx + 31, 18); g.lineTo(cx + 41, 18); g.fill();
  if (rnd() < 2) { g.lineWidth = 10; g.beginPath(); g.moveTo(cx - 22, 70); g.lineTo(cx - 34, 128); g.stroke(); }
  return toTex(c, { wrap: false });
}
