// 第三章贴图：船舱 211 —— 写实电影感（凌晨四点的北大西洋，一艘跑了三十年的老货轮，宿舍成了船头底下的船员舱）
//   墙：铆接的钢板舱壁，下半截刷深绿漆、上半截奶白漆，中间一道红腰线；铆钉往下淌锈、漆皮起泡剥落、墙根一圈盐霜和水渍；
//   地板：刷红丹漆的花纹钢板（凸起的扁豆纹被鞋底磨得露出钢色），缝里是锈；天花板：奶白漆的甲板底面 + 横梁（梁是几何体）；
//   其他：海图、摩尔斯电码表、电报纸带、救生圈、禁止吸烟牌、甲板上刷的白漆字、船钟表盘、夜空（月亮 + 云 + 快天亮的海平线）……
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, SANS, HAND } from './textures.js';
import { mulberry32, clamp, smoothstep, lerp } from './util.js';

const rgb = (hex) => hexToRgb(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dataTex = (c, rep = null) => { const t = toTex(c, { data: true }); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const colTex = (c, rep = null) => { const t = toTex(c); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export const STENCIL = '"DIN Condensed","Arial Narrow","Oswald","Impact",sans-serif';

function roughFrom(h, base = 0.8, span = 0.25, extra = null, wet = 0.2) {
  const W = h.width, H = h.height, s = h.getContext('2d').getImageData(0, 0, W, H).data;
  const e = extra ? extra.getContext('2d').getImageData(0, 0, W, H).data : null;
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    let r = base + (s[i] / 255 - 0.5) * span;
    if (e) r = lerp(r, wet, e[i] / 255);
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

// ================= 舱壁：铆接钢板，下绿上白，中间一道红腰线 =================
// 平铺 2m × 3m（和宿舍墙的世界坐标 UV 对得上）：256 像素 / 米；贴图最上面是 3m（天花板），最下面是地面
export function genHullWall({ seed = 3101, W = 512, H = 768 } = {}) {
  const N = createNoise(seed);
  const T = triple(W, H);
  const PPM = 256;
  const green = rgb('#34463d'), greenD = rgb('#243129'), cream = rgb('#cdc6b0'), creamD = rgb('#a9a28c');
  const band = rgb('#7a2a1e'), rust = rgb('#6a3418'), rustL = rgb('#a0582a'), primer = rgb('#8a3a22'), salt = rgb('#d8d6cc'), grime = rgb('#2a2620');
  const BAND0 = 1.12, BAND1 = 1.19; // 红腰线（离地高度，米）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = x / W, v = y / H;
      const yw = (H - y) / PPM; // 离地高度（米）
      const n = N.fbm(u * 6, v * 9, 4, 6, 9), nf = N.noise(x / 3, y / 3, W / 3, H / 3), nm = N.fbm(u * 24, v * 36, 3, 24, 36);
      // 钢板：每块 1m 宽、1.5m 高，边上一圈铆钉（竖缝两边各一列、横缝上下各一排）
      const px = x % PPM, seamX = Math.min(px, PPM - px);
      const py = (yw * PPM) % (1.5 * PPM), seamY = Math.min(py, 1.5 * PPM - py);
      const seam = seamX < 1.6 || seamY < 1.6;
      let rv = 0;
      if (seamX < 16) { const ry = (yw * PPM) % 18 - 9, d = Math.hypot(seamX - 9, ry); rv = Math.max(rv, smoothstep(4.6, 1.4, d)); }
      if (seamY < 16) { const rx = x % 18 - 9, d = Math.hypot(rx, seamY - 9); rv = Math.max(rv, smoothstep(4.6, 1.4, d)); }
      // 漆
      let c, paintH = 0.5;
      if (yw < BAND0) c = mix3(greenD, green, 0.55 + (n - 0.5) * 0.8);
      else if (yw < BAND1) c = mix3(band, grime, 0.15 + (n - 0.5) * 0.4);
      else c = mix3(creamD, cream, 0.6 + (n - 0.5) * 0.9);
      // 刷了好几遍的漆：刷痕（竖着的细纹）
      c = mix3(c, grime, (N.noise(x / 1.5, y / 40, W / 1.5, H / 40) - 0.5) * 0.12);
      // 漆皮剥落：露出红丹底漆 / 锈
      const chip = smoothstep(0.66, 0.72, nm * 0.7 + n * 0.3) * (0.4 + 0.6 * smoothstep(1.6, 0.2, yw) + 0.4 * smoothstep(2.4, 3.0, yw));
      if (chip > 0) { c = mix3(c, mix3(primer, rust, nf), chip); paintH -= chip * 0.12; }
      // 锈：从铆钉和缝往下淌（越往下越淡）
      const col = Math.floor(x / 6);
      const streakSeed = hash2(col, 3.1);
      const streak = streakSeed > 0.86 ? smoothstep(0.35, 0.9, N.fbm(u * 70, v * 2.5, 3, 70, 3)) * (0.35 + 0.65 * hash2(col, 7.7)) : 0;
      const rustAmt = clamp(streak * 0.75 + rv * 0.35 + (seam ? 0.35 : 0) + chip * 0.4, 0, 1);
      c = mix3(c, mix3(rust, rustL, nf), rustAmt * 0.62);
      // 冷凝水：一道道往下流的湿痕（颜色深一点、很亮）
      const wet = smoothstep(0.7, 0.95, N.fbm(u * 50 + 3, v * 1.6, 3, 50, 2)) * smoothstep(2.9, 1.6, yw);
      c = mix3(c, grime, wet * 0.25);
      // 墙根：一圈盐霜 + 泡过海水的水渍线
      const tide = smoothstep(0.34, 0.26, yw) * (0.5 + 0.5 * N.noise(x / 12, 0, W / 12, 1));
      const saltK = smoothstep(0.22, 0.3, yw) * smoothstep(0.38, 0.3, yw) * smoothstep(0.45, 0.65, N.noise(x / 4, y / 4, W / 4, H / 4));
      c = mix3(c, grime, tide * 0.45);
      c = mix3(c, salt, saltK * 0.55);
      if (seam) c = mix3(c, grime, 0.55);
      const h = seam ? 0.3 : paintH + (n - 0.5) * 0.08 + rv * 0.5 + (nf - 0.5) * 0.03 + saltK * 0.06;
      T.set(i, h, c, clamp(wet * 0.9 + tide * 0.5, 0, 1));
    }
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 5)), roughnessMap: dataTex(roughFrom(T.hC, 0.62, 0.3, T.xC, 0.18)) };
}

// ================= 地板：刷红丹漆的花纹钢板（扁豆纹），鞋底磨过的地方露出钢色 =================
// 1.2m × 1.35m 一张（地板材质 repeat 3 × 6）
export function genDeckFloor({ seed = 3111, W = 512, H = 512 } = {}) {
  const N = createNoise(seed);
  const T = triple(W, H);
  const red = rgb('#5e2418'), redD = rgb('#3e1810'), steel = rgb('#7c7a74'), rust = rgb('#5a2a12'), grime = rgb('#1a1410');
  const S = 32; // 扁豆纹间距（像素）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const u = x / W, v = y / H;
    const n = N.fbm(u * 5, v * 5, 4, 5, 5), nf = N.noise(x / 2.5, y / 2.5, W / 2.5, H / 2.5);
    // 扁豆纹：交错的两个方向
    const cx = Math.floor(x / S), cy = Math.floor(y / S);
    const lx = x - cx * S - S / 2, ly = y - cy * S - S / 2;
    const dir = (cx + cy) % 2 ? 1 : -1;
    const ca = Math.cos(dir * 0.785), sa = Math.sin(dir * 0.785);
    const ax = (lx * ca + ly * sa) / 11, ay = (-lx * sa + ly * ca) / 3.2;
    const bump = smoothstep(1.0, 0.55, Math.hypot(ax, ay));
    // 钢板缝：60cm 一块
    const seam = (x % (W / 2)) < 1.5 || (y % (H / 2)) < 1.5;
    // 走得多的地方（中间一条）漆磨掉
    const wear = smoothstep(0.3, 0.8, N.fbm(u * 2.2 + 5, v * 2.2, 3, 2, 2));
    let c = mix3(redD, red, 0.5 + (n - 0.5) * 0.9);
    c = mix3(c, steel, bump * wear * 0.75);
    const rustK = smoothstep(0.55, 0.8, n + (nf - 0.5) * 0.3) * (1 - bump * 0.5);
    c = mix3(c, rust, rustK * 0.5);
    c = mix3(c, grime, (1 - bump) * 0.15 + (seam ? 0.6 : 0));
    const h = seam ? 0.1 : 0.4 + bump * 0.45 + (nf - 0.5) * 0.04 - rustK * 0.05;
    T.set(i, h, c, bump * wear * 0.55);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 6)), roughnessMap: dataTex(roughFrom(T.hC, 0.72, 0.2, T.xC, 0.32)) };
}

// ================= 地板上盖的一层：盐渍、油污、铁锈水（透明）=================
// 画布坐标 → 世界：x = -1.8 + px / W * 3.6，z = -3.6 + py / H * 8.1（画布顶上是北边）
export function genDeckGrime(W = 512, H = 1152) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(3121), N = createNoise(3121);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 90, y / 90, 4, W / 90, H / 90);
    const edge = Math.min(x, W - x) / W;
    const a = smoothstep(0.55, 0.8, n) * 0.35 + smoothstep(0.12, 0.0, edge) * 0.35;
    d[i] = 40; d[i + 1] = 30; d[i + 2] = 22; d[i + 3] = a * 255;
  });
  // 盐渍：水干了之后一圈圈白印
  for (let k = 0; k < 26; k++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 70;
    ctx.strokeStyle = `rgba(220,216,200,${0.12 + rnd() * 0.18})`; ctx.lineWidth = 1 + rnd() * 2.5;
    ctx.beginPath();
    for (let a = 0; a <= 6.3; a += 0.2) { const rr = r * (1 + (N.noise(a * 2, k, 20, 99) - 0.5) * 0.5); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
    ctx.stroke();
  }
  // 油污
  for (let k = 0; k < 10; k++) {
    const x = rnd() * W, y = rnd() * H, r = 12 + rnd() * 40;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(10,8,6,0.5)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c, { wrap: false });
}

// ================= 天花板：奶白漆的甲板底面（钢板缝 + 锈点 + 冷凝水的水珠印）=================
export function genShipCeiling({ seed = 3131, S = 256 } = {}) {
  const N = createNoise(seed);
  const c = makeCanvas(S, S), h = makeCanvas(S, S);
  const cream = rgb('#bfb8a2'), creamD = rgb('#8f8a78'), rust = rgb('#6a3418'), grime = rgb('#3a342c');
  const hI = h.getContext('2d').createImageData(S, S);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 40, y / 40, 4, S / 40, S / 40), nf = N.noise(x / 2, y / 2, S / 2, S / 2);
    const seam = x % S < 1.5 || y % (S / 2) < 1.5;
    let col = mix3(creamD, cream, 0.5 + (n - 0.5) * 1.1);
    const rustK = smoothstep(0.62, 0.8, n + (nf - 0.5) * 0.3);
    col = mix3(col, rust, rustK * 0.6);
    // 烟熏（船员在舱里抽了几十年的烟）
    col = mix3(col, grime, 0.18 + (N.fbm(x / 90, y / 90, 3, S / 90, S / 90) - 0.5) * 0.3);
    if (seam) col = mix3(col, grime, 0.6);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    const hv = seam ? 0.2 : 0.5 + (nf - 0.5) * 0.06 - rustK * 0.08;
    hI.data[i] = hI.data[i + 1] = hI.data[i + 2] = hv * 255; hI.data[i + 3] = 255;
  });
  h.getContext('2d').putImageData(hI, 0, 0);
  return { map: colTex(c), normalMap: dataTex(normalFromHeight(h, 3)) };
}

// ================= 旧东西泡在海风里：去饱和、压暗、偏一点青，蒙一层盐花和霉点 =================
export function brine(src, { seed = 1, dark = 0.74, salt = 8, mold = 4, wrap = true, repeat = null } = {}) {
  const img = src.image || src, W = img.width, H = img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed * 29 + 7);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    p[i] = lerp(p[i], l, 0.4) * (dark - 0.02); p[i + 1] = lerp(p[i + 1], l, 0.4) * dark; p[i + 2] = lerp(p[i + 2], l, 0.4) * (dark + 0.02);
  }
  ctx.putImageData(d, 0, 0);
  for (let k = 0; k < salt * 30; k++) {
    ctx.fillStyle = `rgba(${220 + rnd() * 20},${218 + rnd() * 20},${205},${0.06 + rnd() * 0.14})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.4, 0, 6.28); ctx.fill();
  }
  for (let k = 0; k < mold * 6; k++) {
    const x = rnd() * W, y = rnd() * H, r = 3 + rnd() * 14;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(30,36,24,0.35)'); gr.addColorStop(1, 'rgba(30,36,24,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = toTex(c, { wrap });
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (src.repeat) t.repeat.copy(src.repeat);
  return t;
}

// ================= 水面的法线（平铺，给地上的积水、舷窗外的海用）=================
export function genWaterNormal({ seed = 3141, S = 256 } = {}) {
  const N = createNoise(seed);
  const h = makeCanvas(S, S);
  pixels(h, (x, y, d, i) => {
    const v = N.fbm(x / 22, y / 22, 4, S / 22, S / 22) * 0.7 + N.fbm(x / 7 + 11, y / 9, 3, S / 7, S / 9) * 0.3;
    d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255;
  });
  return dataTex(normalFromHeight(h, 3.2));
}

// ================= 海图：北大西洋的一角，铅笔画的航线，终点画了个圈"211" =================
export function genChart(W = 1024, H = 768) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(3171), rnd = mulberry32(3171);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 120, y / 120, 4, W / 120, H / 120);
    const land = N.fbm(x / 260 + 3, y / 260, 5, W / 260, H / 260) + (x / W) * 0.25 - 0.1;
    let col;
    if (land > 0.58) col = mix3(rgb('#d9c89a'), rgb('#c4b07e'), n);
    else if (land > 0.53) col = rgb('#b8d0cc');
    else col = mix3(rgb('#d8e0da'), rgb('#c8d4d2'), n);
    // 泛黄、水渍
    col = mix3(col, rgb('#b89a6a'), smoothstep(0.6, 0.85, N.fbm(x / 60 + 9, y / 60, 3, W / 60, H / 60)) * 0.35);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  // 经纬线
  ctx.strokeStyle = 'rgba(60,70,80,0.35)'; ctx.lineWidth = 1;
  for (let x = 64; x < W; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 64; y < H; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // 水深数字
  ctx.fillStyle = 'rgba(40,50,70,0.55)'; ctx.font = '13px Georgia, serif';
  for (let k = 0; k < 120; k++) ctx.fillText(String(20 + Math.floor(rnd() * 3800)), rnd() * W, rnd() * H);
  // 罗经花
  const cx = W * 0.2, cy = H * 0.72, R = 90;
  ctx.strokeStyle = 'rgba(120,40,50,0.7)'; ctx.lineWidth = 1.5;
  for (const r of [R, R * 0.8]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.stroke(); }
  for (let k = 0; k < 32; k++) { const a = (k / 32) * 6.28, r0 = k % 4 ? R * 0.9 : R * 0.7; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
  ctx.fillStyle = 'rgba(120,40,50,0.8)';
  for (let k = 0; k < 4; k++) { const a = (k / 4) * 6.28 - Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75); ctx.lineTo(cx + Math.cos(a + 0.2) * 12, cy + Math.sin(a + 0.2) * 12); ctx.lineTo(cx + Math.cos(a - 0.2) * 12, cy + Math.sin(a - 0.2) * 12); ctx.fill(); }
  ctx.font = 'bold 18px Georgia, serif'; ctx.fillText('N', cx - 6, cy - R - 8);
  // 铅笔航线 + 每四小时一个船位
  ctx.strokeStyle = 'rgba(40,40,44,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.9);
  const pts = [[0.08, 0.9], [0.3, 0.72], [0.48, 0.55], [0.62, 0.42], [0.74, 0.3]];
  for (const [u, v] of pts) ctx.lineTo(u * W, v * H);
  ctx.stroke();
  ctx.font = `15px ${HAND}`; ctx.fillStyle = 'rgba(40,40,44,0.85)';
  pts.forEach(([u, v], k) => { ctx.beginPath(); ctx.arc(u * W, v * H, 5, 0, 6.28); ctx.stroke(); if (k) ctx.fillText(['', '20:00', '00:00', '04:00', '?'][k], u * W + 10, v * H + 5); });
  ctx.strokeStyle = 'rgba(160,30,30,0.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0.74 * W, 0.3 * H, 18, 0, 6.28); ctx.stroke();
  ctx.fillStyle = 'rgba(160,30,30,0.9)'; ctx.font = `bold 22px ${HAND}`; ctx.fillText('211 在这儿', 0.74 * W + 24, 0.3 * H - 14);
  // 灯塔图例
  ctx.fillStyle = 'rgba(160,30,30,0.9)'; ctx.beginPath(); ctx.arc(0.62 * W, 0.18 * H, 6, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(40,50,70,0.9)'; ctx.font = 'italic 16px Georgia, serif'; ctx.fillText('Lt. Fl(?) 12s 18M', 0.62 * W + 12, 0.18 * H + 5);
  ctx.font = `bold 30px Georgia, serif`; ctx.fillStyle = 'rgba(40,50,70,0.55)'; ctx.fillText('NORTH ATLANTIC OCEAN', W * 0.3, H * 0.62);
  return toTex(c, { wrap: false });
}

// ================= 摩尔斯电码表（数字 + 几个字母），钉在电报机上方 =================
export const MORSE = { 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', S: '...', O: '---', A: '.-', N: '-.', T: '-', E: '.' };
function drawMorse(ctx, code, x, y, dot = 5, gap = 7) {
  let cx = x;
  for (const ch of code) {
    if (ch === '.') { ctx.beginPath(); ctx.arc(cx + dot, y, dot, 0, 6.28); ctx.fill(); cx += dot * 2 + gap; }
    else { ctx.fillRect(cx, y - dot * 0.8, dot * 5, dot * 1.6); cx += dot * 5 + gap; }
  }
  return cx;
}
export function genMorseChart(W = 384, H = 544) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(3181);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 60, y / 60, 3, W / 60, H / 60);
    const col = mix3(rgb('#d8ceb4'), rgb('#b8a680'), n * 0.8 + smoothstep(0.2, 0, Math.min(x, y, W - x, H - y) / W) * 0.5);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.fillStyle = '#2a2420'; ctx.textAlign = 'center';
  ctx.font = `bold 30px ${SANS}`; ctx.fillText('摩尔斯电码 · 数字', W / 2, 50);
  ctx.font = `14px ${SANS}`; ctx.fillStyle = '#5a4a3a'; ctx.fillText('MORSE CODE · NUMERALS', W / 2, 74);
  ctx.textAlign = 'left';
  for (let k = 0; k < 10; k++) {
    const d = (k + 1) % 10, y = 118 + k * 40;
    ctx.fillStyle = '#2a2420'; ctx.font = `bold 30px ${STENCIL}`; ctx.fillText(String(d), 46, y + 11);
    ctx.fillStyle = '#1a1614'; drawMorse(ctx, MORSE[d], 110, y, 6, 9);
  }
  ctx.fillStyle = '#6a2a20'; ctx.font = `15px ${HAND}`; ctx.fillText('· 短　— 长　　SOS = ··· ——— ···', 40, H - 18);
  return toTex(c, { wrap: false });
}
// 电报机吐出来的纸带（一行点划，从右往左越来越新）
export function drawTape(c, codes, { n = 99 } = {}) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.fillStyle = '#e6dcc4'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(120,100,70,0.25)'; ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);
  ctx.fillStyle = '#1a1a2a';
  let x = 14, left = n;
  for (const code of codes) {
    for (const ch of code) {
      if (left-- <= 0) return x;
      if (ch === '.') { ctx.beginPath(); ctx.arc(x + 5, H / 2, 5, 0, 6.28); ctx.fill(); x += 20; }
      else { ctx.fillRect(x, H / 2 - 4, 28, 8); x += 38; }
    }
    x += 44;
  }
  return x;
}

// ================= 甲板上刷的白漆字："⚓ N"（被舱底的积水盖着，抽干了才看得见）=================
export function drawDeckStencil(c, digit) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height, N = createNoise(3191 + digit);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#e8e4d8';
  // 锚
  const ax = W * 0.3, ay = H * 0.5, s = H * 0.36;
  ctx.lineWidth = s * 0.14; ctx.strokeStyle = '#e8e4d8'; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(ax, ay - s * 0.72, s * 0.14, 0, 6.28); ctx.stroke();
  ctx.fillRect(ax - s * 0.07, ay - s * 0.58, s * 0.14, s * 1.28);
  ctx.fillRect(ax - s * 0.38, ay - s * 0.36, s * 0.76, s * 0.12);
  ctx.beginPath(); ctx.arc(ax, ay + s * 0.18, s * 0.55, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ax + sx * s * 0.62, ay + s * 0.34); ctx.lineTo(ax + sx * s * 0.42, ay + s * 0.18); ctx.lineTo(ax + sx * s * 0.62, ay + s * 0.08); ctx.fill(); }
  // 数字：模板字（笔画之间留缝）
  ctx.font = `bold ${H * 0.82}px ${STENCIL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(digit), W * 0.72, H * 0.54);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(W * 0.72 - 3, 0, 6, H);
  // 刷漆的边缘不齐 + 被鞋底磨掉的地方
  pixels2(c, (x, y, a) => a * clamp(0.35 + N.fbm(x / 30, y / 30, 4, 99, 99) * 1.1 - (N.noise(x / 3, y / 3, 999, 999) > 0.8 ? 0.4 : 0), 0, 1));
  ctx.globalCompositeOperation = 'source-over';
}
function pixels2(c, fn) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height, img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d[i + 3] = fn(x, y, d[i + 3] / 255) * 255; }
  ctx.putImageData(img, 0, 0);
}

// ================= 救生圈：红白四段 + 船名 =================
export function genLifeRing(W = 512, H = 64) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(3201);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#dcd6c6' : '#b0301e'; ctx.fillRect((k / 4) * W, 0, W / 4, H); }
  // 反光带
  ctx.fillStyle = 'rgba(190,196,200,0.9)';
  for (let k = 0; k < 4; k++) ctx.fillRect((k / 4) * W + W / 8 - 6, 0, 12, H);
  ctx.fillStyle = '#1a1814'; ctx.font = `bold 26px ${STENCIL}`; ctx.textAlign = 'center';
  ctx.fillText('211', W * 0.125 + W * 0.25, H * 0.62);
  ctx.fillText('宿舍号', W * 0.125 + W * 0.75, H * 0.62);
  pixels2(c, () => 1);
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = N.fbm(x / 20, y / 20, 3, W / 20, H / 20); const k = 0.7 + n * 0.35; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}

// ================= 标牌：禁止吸烟 / 救生衣 / 水密门 / 船名 =================
export function genShipSign(kind) {
  const c = makeCanvas(256, 320), ctx = c.getContext('2d'), W = 256, H = 320, N = createNoise(3211 + kind.length);
  const bg = { smoke: '#e8e4d8', vest: '#1e6a3a', door: '#e2b020', stencil: '#34463d', bell: '#e8e4d8' }[kind] || '#e8e4d8';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (kind === 'smoke') {
    ctx.strokeStyle = '#b0201a'; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(W / 2, 120, 84, 0, 6.28); ctx.stroke();
    ctx.fillStyle = '#1a1814'; ctx.fillRect(70, 112, 110, 20); ctx.fillStyle = '#c86a2a'; ctx.fillRect(170, 112, 14, 20);
    ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(182, 106); ctx.bezierCurveTo(190, 90, 176, 80, 186, 64); ctx.stroke();
    ctx.strokeStyle = '#b0201a'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(W / 2 - 60, 60); ctx.lineTo(W / 2 + 60, 180); ctx.stroke();
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 44px ${SANS}`; ctx.fillText('禁止吸烟', W / 2, 262); ctx.font = `bold 24px ${STENCIL}`; ctx.fillText('NO SMOKING', W / 2, 296);
  } else if (kind === 'vest') {
    ctx.fillStyle = '#fff'; ctx.font = `bold 40px ${SANS}`; ctx.fillText('救生衣', W / 2, 250); ctx.font = `bold 22px ${STENCIL}`; ctx.fillText('LIFEJACKETS · 4', W / 2, 286);
    ctx.fillStyle = '#e86a1a'; ctx.beginPath(); ctx.moveTo(W / 2 - 60, 60); ctx.lineTo(W / 2 - 20, 50); ctx.lineTo(W / 2 - 18, 190); ctx.lineTo(W / 2 - 64, 190); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W / 2 + 60, 60); ctx.lineTo(W / 2 + 20, 50); ctx.lineTo(W / 2 + 18, 190); ctx.lineTo(W / 2 + 64, 190); ctx.fill();
  } else if (kind === 'door') {
    for (let k = -2; k < 12; k++) { ctx.fillStyle = '#1a1814'; ctx.beginPath(); ctx.moveTo(k * 40, 0); ctx.lineTo(k * 40 + 20, 0); ctx.lineTo(k * 40 - 40, 60); ctx.lineTo(k * 40 - 60, 60); ctx.fill(); }
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 46px ${SANS}`; ctx.fillText('水密门', W / 2, 150); ctx.font = `bold 20px ${SANS}`; ctx.fillText('航行中保持关闭', W / 2, 190);
    ctx.font = `bold 22px ${STENCIL}`; ctx.fillText('WATERTIGHT DOOR', W / 2, 230); ctx.fillText('KEEP CLOSED AT SEA', W / 2, 260);
  } else if (kind === 'bell') {
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 34px ${SANS}`; ctx.fillText('值班钟点', W / 2, 50);
    ctx.font = `20px ${SANS}`; ctx.textAlign = 'left';
    ['00:30  一响', '01:00  二响', '……', '04:00  八响', '04:30  一响', '', '每半小时敲一次，', '四小时一班，敲到八响换班。'].forEach((l, k) => ctx.fillText(l, 30, 100 + k * 28));
  }
  // 旧、锈、盐
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = N.fbm(x / 40, y / 40, 4, W / 40, H / 40);
    const k = 0.72 + n * 0.3, rustK = smoothstep(0.66, 0.8, n) * 0.6 + smoothstep(12, 0, Math.min(x, y, W - x, H - y)) * 0.5;
    d[i] = lerp(d[i] * k, 110, rustK); d[i + 1] = lerp(d[i + 1] * k, 56, rustK); d[i + 2] = lerp(d[i + 2] * k, 26, rustK);
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { wrap: false });
}

// ================= 木箱侧面的模板字 =================
export function genCrateSide(label = 'FRAGILE', sub = '易碎 · 211', seed = 3221) {
  const W = 256, H = 192, c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(seed);
  pixels(c, (x, y, d, i) => {
    const plank = Math.floor(y / 48), g = N.fbm(x / 60 + plank * 7, y / 3, 3, W / 60, H / 3);
    let col = mix3(rgb('#5a4630'), rgb('#8a7050'), g);
    if (y % 48 < 2) col = rgb('#2a2016');
    col = mix3(col, rgb('#2a261e'), smoothstep(0.62, 0.8, N.fbm(x / 30, y / 30, 3, W / 30, H / 30)) * 0.5);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.fillStyle = 'rgba(20,16,12,0.82)'; ctx.textAlign = 'center';
  ctx.font = `bold 44px ${STENCIL}`; ctx.fillText(label, W / 2, H * 0.48);
  ctx.font = `bold 24px ${SANS}`; ctx.fillText(sub, W / 2, H * 0.78);
  return toTex(c, { wrap: false });
}

// ================= 船钟表盘：白搪瓷、黑罗马字、内圈一圈 24 小时 =================
export function genShipClockFace() {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#1a1814'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.font = 'bold 22px Georgia, serif';
  for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28 - Math.PI / 2; ctx.fillText(R[k], S / 2 + Math.cos(a) * 96, S / 2 + Math.sin(a) * 96); }
  ctx.font = '11px Georgia, serif'; ctx.fillStyle = '#8a2a1e';
  for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28 - Math.PI / 2; ctx.fillText(String(k === 0 ? 24 : k + 12), S / 2 + Math.cos(a) * 70, S / 2 + Math.sin(a) * 70); }
  for (let k = 0; k < 60; k++) { const a = (k / 60) * 6.28; ctx.fillStyle = '#1a1814'; const r0 = k % 5 ? 118 : 112; ctx.fillRect(S / 2 + Math.cos(a) * r0 - 1, S / 2 + Math.sin(a) * r0 - 1, 2, 2); }
  ctx.font = 'italic 12px Georgia, serif'; ctx.fillStyle = '#3a3430'; ctx.fillText('S.S. 211', S / 2, S / 2 + 38);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,40,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return toTex(c, { wrap: false });
}

// ================= 航海日志（室友留的"信"，画在翻开的本子上）=================
export function genLogbookSpread() {
  const W = 512, H = 352, c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(3231);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 50, y / 50, 3, W / 50, H / 50);
    let col = mix3(rgb('#d8cca8'), rgb('#b8a478'), n * 0.7);
    if (Math.abs(x - W / 2) < 3) col = rgb('#6a5a40');
    if (y % 22 === 0) col = mix3(col, rgb('#7a8aa0'), 0.35);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.fillStyle = 'rgba(30,30,50,0.8)'; ctx.font = `18px ${HAND}`;
  ['航海日志 LOG', '04:02 西北风 7 级', '涌浪 6 米，能见度好', '北方有灯塔', '', '上甲板值班：'].forEach((l, k) => ctx.fillText(l, 22, 40 + k * 44));
  ['舱门锁了', '🗼 ⚓ 📻', '三位密码', '自己找', '', '—— 211 全体'].forEach((l, k) => ctx.fillText(l, W / 2 + 22, 40 + k * 44));
  return toTex(c, { wrap: false });
}
