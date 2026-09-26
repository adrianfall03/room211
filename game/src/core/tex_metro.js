// 第四章贴图：地铁 211 —— 写实电影感（参考《地铁》系列：2077 年，地面上已经没法住人，人都躲进了地铁站）
//   墙：上半截是地铁站的米白色瓷砖（碎了一大片、露出水泥，天花板往下淌着黑色的烟熏），下半截是暗红色的花岗岩墙裙；
//   地板：灰色花岗岩地砖，裂缝里全是土；天花板：水泥（模板的木纹印子、水渍、烟熏），梁和电缆是几何体；
//   其他：站名牌、"爱护滤罐"宣传画、地铁线路图、气密门模板字、弹药箱、车厢上的粉笔"正"字、帐篷帆布、麻袋……
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, SANS, HAND } from './textures.js';
import { mulberry32, clamp, smoothstep, lerp } from './util.js';

const rgb = (hex) => hexToRgb(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dataTex = (c, rep = null) => { const t = toTex(c, { data: true }); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const colTex = (c, rep = null) => { const t = toTex(c); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export const STENCIL = '"DIN Condensed","Arial Narrow","Oswald","Impact",sans-serif';
export const CYR = '"PT Sans Narrow","Arial Narrow","DIN Condensed","Helvetica Neue",sans-serif';

function roughFrom(h, base = 0.8, span = 0.25, extra = null, glossy = 0.2) {
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

// ================= 墙：米白色地铁瓷砖 + 暗红色花岗岩墙裙 =================
// 平铺 2m × 3m：256 像素 / 米；贴图最上面是天花板（3m），最下面是地面。x 通道存"釉面"（亮、滑）
export function genMetroWall({ seed = 4301, W = 512, H = 768 } = {}) {
  const N = createNoise(seed);
  const T = triple(W, H);
  const PPM = 256;
  const tile = rgb('#cfc6b0'), tileD = rgb('#a89c80'), grout = rgb('#5a5448'), conc = rgb('#6e6a62'), concD = rgb('#4a4640');
  const gran = rgb('#5a2e26'), granL = rgb('#7a4a3e'), granD = rgb('#2e1814'), soot = rgb('#16120e'), rust = rgb('#5a3418');
  const WAIN = 1.0; // 墙裙高度
  const TW = 51, TH = 26; // 一块瓷砖（20cm × 10cm）加缝
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = x / W, v = y / H, yw = (H - y) / PPM;
      const n = N.fbm(u * 6, v * 9, 4, 6, 9), nf = N.noise(x / 2.5, y / 2.5, W / 2.5, H / 2.5), nm = N.fbm(u * 18, v * 27, 3, 18, 27);
      // 从天花板往下淌的烟熏 / 水渍：一道道竖的
      const col = Math.floor(x / 5);
      const drip = hash2(col, 1.7) > 0.8 ? smoothstep(0.35, 0.9, N.fbm(u * 60, v * 2.2, 3, 60, 2)) * smoothstep(1.0, 3.0, yw) : 0;
      const topSoot = smoothstep(2.2, 3.0, yw) * (0.5 + 0.5 * n);
      if (yw > WAIN + 0.05) {
        // ---- 瓷砖：顺砌、隔行错开半块 ----
        const ty = (yw - WAIN - 0.05) * PPM;
        const row = Math.floor(ty / TH), off = row % 2 ? TW / 2 : 0;
        const cx = Math.floor((x + off) / TW);
        const bx = (x + off) - cx * TW, by = ty - row * TH;
        const isG = bx < 3 || by < 3;
        const hr = hash2(row * 3.3, ((cx % 10) + 10) % 10);
        // 碎掉 / 掉了的瓷砖：一片片连着的
        const lost = smoothstep(0.6, 0.64, nm * 0.75 + n * 0.25 + (hr - 0.5) * 0.1);
        let c, h, gloss = 0;
        if (lost > 0.5) {
          c = mix3(concD, conc, N.fbm(u * 30, v * 45, 3, 30, 45));
          h = 0.18 + nf * 0.1;
        } else if (isG) {
          c = mix3(grout, soot, 0.3 + n * 0.3);
          h = 0.32;
        } else {
          c = mix3(tileD, tile, 0.6 + (hr - 0.5) * 0.5 + (n - 0.5) * 0.5);
          // 裂纹
          const crack = smoothstep(0.93, 0.97, Math.abs(Math.sin((bx * 0.4 + by * 1.1 + hr * 30)))) * (hr > 0.7 ? 1 : 0);
          c = mix3(c, soot, crack * 0.6);
          h = 0.62 + (nf - 0.5) * 0.04 - crack * 0.2 + smoothstep(0, 4, Math.min(bx - 3, TW - bx, by - 3, TH - by)) * 0.08;
          gloss = 1 - crack;
        }
        c = mix3(c, soot, clamp(drip * 0.7 + topSoot * 0.55 + smoothstep(0.62, 0.9, n) * 0.25, 0, 0.85));
        T.set(i, h, c, gloss * (1 - topSoot * 0.6) * 0.8);
      } else if (yw > WAIN) {
        // 墙裙顶上一道金属压条
        const k = (yw - WAIN) / 0.05;
        const c = mix3(rgb('#3a3630'), rgb('#6a645a'), Math.sin(k * Math.PI) * 0.6 + nf * 0.2);
        T.set(i, 0.6 + Math.sin(k * Math.PI) * 0.3, mix3(c, rust, smoothstep(0.6, 0.8, n) * 0.5), 0.3);
      } else {
        // ---- 花岗岩墙裙：60cm 一块，磨光的面、斑点 ----
        const px = x % Math.round(0.6 * PPM), seam = px < 2 || Math.abs(yw - 0.5) * PPM < 1.2;
        const sp = N.noise(x / 1.3, y / 1.3, W / 1.3, H / 1.3);
        let c = mix3(granD, gran, 0.5 + (n - 0.5) * 0.8);
        c = mix3(c, granL, smoothstep(0.7, 0.9, sp) * 0.7);
        c = mix3(c, rgb('#0e0806'), smoothstep(0.25, 0.1, sp) * 0.6);
        // 墙根：一层灰土
        c = mix3(c, rgb('#3a3630'), smoothstep(0.18, 0.0, yw) * 0.7);
        if (seam) c = mix3(c, soot, 0.7);
        T.set(i, seam ? 0.3 : 0.55 + (sp - 0.5) * 0.03, c, seam ? 0 : 0.85 * (1 - smoothstep(0.2, 0.0, yw)));
      }
    }
  }
  T.put();
  // 墙上的刮痕、粉笔涂鸦（数日子的"正"字、箭头）
  const ctx = T.cC.getContext('2d'), rnd = mulberry32(seed + 3);
  ctx.strokeStyle = 'rgba(210,205,190,0.35)'; ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const x0 = 40 + rnd() * (W - 120), y0 = H - (1.3 + rnd() * 0.5) * PPM;
    for (let j = 0; j < 4; j++) { const xx = x0 + j * 14; ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx + (rnd() - 0.5) * 3, y0 + 30); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x0 - 6, y0 + 6); ctx.lineTo(x0 + 50, y0 + 26); ctx.stroke();
  }
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 5)), roughnessMap: dataTex(roughFrom(T.hC, 0.85, 0.2, T.xC, 0.22)) };
}

// ================= 地板：灰色花岗岩地砖（40cm 见方），裂了、缺了角，缝里全是土 =================
export function genMetroFloor({ seed = 4311, W = 512, H = 512 } = {}) {
  const N = createNoise(seed);
  const T = triple(W, H);
  const S = W / 3; // 1.2m / 3 = 40cm 一块
  const g1 = rgb('#6a6660'), g2 = rgb('#8a847a'), g3 = rgb('#4a4640'), dirt = rgb('#2a2620'), grout = rgb('#1e1c18');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const u = x / W, v = y / H;
    const n = N.fbm(u * 4, v * 4, 4, 4, 4), nf = N.noise(x / 1.4, y / 1.4, W / 1.4, H / 1.4);
    const cx = Math.floor(x / S), cy = Math.floor(y / S), lx = x - cx * S, ly = y - cy * S;
    const seam = lx < 2.5 || ly < 2.5;
    const hr = hash2(cx * 1.7, cy * 2.9);
    let c = mix3(g3, g1, 0.5 + (hr - 0.5) * 0.6 + (n - 0.5) * 0.4);
    c = mix3(c, g2, smoothstep(0.75, 0.95, nf) * 0.6);
    c = mix3(c, rgb('#1a1814'), smoothstep(0.2, 0.05, nf) * 0.5);
    // 裂缝：每块砖上几道
    const cr = hr > 0.55 ? smoothstep(0.985, 0.998, Math.sin(lx * 0.07 + ly * 0.11 + hr * 40) * Math.cos(lx * 0.05 - ly * 0.09 + hr * 11)) : 0;
    // 土：边上、角落多
    const d = smoothstep(0.45, 0.75, N.fbm(u * 3 + 7, v * 3, 4, 3, 3));
    c = mix3(c, dirt, d * 0.7 + cr * 0.8);
    if (seam) c = grout;
    const h = seam ? 0.1 : 0.55 + (nf - 0.5) * 0.03 - cr * 0.3 - d * 0.03;
    T.set(i, h, c, seam ? 0 : (1 - d) * 0.5);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 4)), roughnessMap: dataTex(roughFrom(T.hC, 0.78, 0.2, T.xC, 0.42)) };
}

// ================= 地上盖的一层：碎石子、土、脚印、一滩滩的积水（透明）=================
export function genMetroGrime(W = 512, H = 1152) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(4321), N = createNoise(4321);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 70, y / 70, 4, W / 70, H / 70);
    const edge = Math.min(x, W - x) / W;
    const a = smoothstep(0.5, 0.8, n) * 0.55 + smoothstep(0.15, 0.0, edge) * 0.5;
    d[i] = 44; d[i + 1] = 38; d[i + 2] = 30; d[i + 3] = clamp(a, 0, 0.85) * 255;
  });
  // 碎石子
  for (let k = 0; k < 900; k++) {
    const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 2.2, g = 60 + rnd() * 60;
    ctx.fillStyle = `rgba(${g},${g - 6},${g - 14},${0.5 + rnd() * 0.4})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, 6.28); ctx.fill();
  }
  // 积水：暗、边上一圈泥印
  for (let k = 0; k < 7; k++) {
    const x = rnd() * W, y = rnd() * H, r = 16 + rnd() * 40;
    const gr = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    gr.addColorStop(0, 'rgba(12,12,10,0.55)'); gr.addColorStop(0.8, 'rgba(20,18,14,0.45)'); gr.addColorStop(1, 'rgba(40,34,26,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 6.28); ctx.fill();
  }
  // 靴印
  ctx.fillStyle = 'rgba(20,16,12,0.35)';
  for (let k = 0; k < 40; k++) {
    const x = W * 0.35 + (rnd() - 0.5) * W * 0.4, y = rnd() * H, a = (rnd() - 0.5) * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-5, -12, 10, 16); ctx.fillRect(-4, 6, 8, 7); ctx.restore();
  }
  return toTex(c, { wrap: false });
}

// ================= 天花板：水泥（模板的木纹印子、水渍、烟熏）=================
export function genMetroCeiling({ seed = 4331, S = 256 } = {}) {
  const N = createNoise(seed);
  const c = makeCanvas(S, S), h = makeCanvas(S, S);
  const cc = rgb('#6a665e'), cd = rgb('#3e3a34'), soot = rgb('#141210');
  const hI = h.getContext('2d').createImageData(S, S);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 40, y / 40, 4, S / 40, S / 40), nf = N.noise(x / 2, y / 2, S / 2, S / 2);
    const board = Math.floor(y / 32), grain = N.fbm(x / 60 + board * 7, y / 4, 3, S / 60, S / 4);
    let col = mix3(cd, cc, 0.5 + (n - 0.5) * 1.1 + (grain - 0.5) * 0.25);
    col = mix3(col, soot, 0.25 + smoothstep(0.55, 0.85, N.fbm(x / 70 + 3, y / 70, 3, S / 70, S / 70)) * 0.5);
    const seam = y % 32 < 1;
    if (seam) col = mix3(col, soot, 0.4);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    const hv = 0.5 + (nf - 0.5) * 0.12 + (grain - 0.5) * 0.08 - (seam ? 0.1 : 0);
    hI.data[i] = hI.data[i + 1] = hI.data[i + 2] = hv * 255; hI.data[i + 3] = 255;
  });
  h.getContext('2d').putImageData(hI, 0, 0);
  return { map: colTex(c), normalMap: dataTex(normalFromHeight(h, 3)) };
}

// ================= 旧东西落满了灰：去饱和、压暗、偏一点黄绿，蒙一层灰点 =================
export function dusty(src, { seed = 1, dark = 0.7, dust = 10, wrap = true, repeat = null } = {}) {
  const img = src.image || src, W = img.width, H = img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed * 31 + 3);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    p[i] = lerp(p[i], l, 0.55) * (dark + 0.01); p[i + 1] = lerp(p[i + 1], l, 0.55) * (dark + 0.01); p[i + 2] = lerp(p[i + 2], l, 0.55) * (dark - 0.04);
  }
  ctx.putImageData(d, 0, 0);
  for (let k = 0; k < dust * 30; k++) {
    ctx.fillStyle = `rgba(${150 + rnd() * 40},${140 + rnd() * 40},${120},${0.05 + rnd() * 0.12})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.8, 0, 6.28); ctx.fill();
  }
  const t = toTex(c, { wrap });
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (src.repeat) t.repeat.copy(src.repeat);
  return t;
}

// ================= 铁丝夹心玻璃（窗户）：菱形铁丝网 + 一层油污 =================
export function genWireGlass(W = 512, H = 320) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(4341);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 60, y / 60, 4, W / 60, H / 60);
    const a = 0.12 + smoothstep(0.45, 0.8, n) * 0.35 + smoothstep(40, 0, Math.min(x, W - x, y, H - y)) * 0.4;
    d[i] = 70; d[i + 1] = 66; d[i + 2] = 52; d[i + 3] = a * 255;
  });
  ctx.strokeStyle = 'rgba(46,44,38,0.55)'; ctx.lineWidth = 0.7;
  for (let k = -H; k < W + H; k += 8) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k, H); ctx.lineTo(k + H, 0); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// ================= 弹药箱侧面：刷绿漆的木板 + 模板字 + 一个大编号 =================
export function genAmmoCrate(num, seed = 4351) {
  const W = 256, H = 160, c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(seed + num * 7);
  pixels(c, (x, y, d, i) => {
    const plank = Math.floor(y / 40), g = N.fbm(x / 50 + plank * 9, y / 4, 3, W / 50, H / 4);
    let col = mix3(rgb('#2e3a26'), rgb('#4a5a3a'), g * 0.9);
    // 漆掉了露出木头
    col = mix3(col, rgb('#6a5236'), smoothstep(0.66, 0.78, N.fbm(x / 22, y / 22, 4, W / 22, H / 22)) * 0.8);
    if (y % 40 < 2) col = rgb('#141810');
    col = mix3(col, rgb('#1a1810'), smoothstep(0.6, 0.85, N.fbm(x / 40 + 5, y / 40, 3, W / 40, H / 40)) * 0.35);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  ctx.fillStyle = 'rgba(214,206,176,0.85)'; ctx.textAlign = 'center';
  ctx.font = `bold 20px ${STENCIL}`; ctx.fillText('7.62 × 39', W * 0.3, 32);
  ctx.font = `14px ${CYR}`; ctx.fillText('ПАТРОНЫ · 440 ШТ', W * 0.3, 54);
  ctx.font = `bold 96px ${STENCIL}`; ctx.fillText(String(num), W * 0.76, H * 0.72);
  ctx.fillRect(W * 0.58, H * 0.8, W * 0.36, 4);
  return toTex(c, { wrap: false });
}

// ================= 车厢上的粉笔"正"字（室友数日子的那种写法，一个"正"= 5）=================
export function drawTally(c, n) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height, rnd = mulberry32(4361 + n);
  ctx.clearRect(0, 0, W, H);
  const stroke = (x0, y0, x1, y1) => {
    // 粉笔：一道道断断续续、边上毛毛的
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(236,232,220,${0.35 + rnd() * 0.3})`; ctx.lineWidth = 7 + rnd() * 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0 + (rnd() - 0.5) * 3, y0 + (rnd() - 0.5) * 3);
      ctx.lineTo(x1 + (rnd() - 0.5) * 3, y1 + (rnd() - 0.5) * 3); ctx.stroke();
    }
  };
  // "正"的五笔：横、竖、横、竖、横
  const zheng = (cx, cy, s, strokes) => {
    const L = [
      () => stroke(cx - s * 0.42, cy - s * 0.46, cx + s * 0.42, cy - s * 0.46),
      () => stroke(cx, cy - s * 0.46, cx, cy + s * 0.46),
      () => stroke(cx + 0.02 * s, cy - s * 0.02, cx + s * 0.34, cy - s * 0.02),
      () => stroke(cx - s * 0.3, cy - s * 0.12, cx - s * 0.3, cy + s * 0.46),
      () => stroke(cx - s * 0.5, cy + s * 0.48, cx + s * 0.5, cy + s * 0.48),
    ];
    for (let k = 0; k < strokes; k++) L[k]();
  };
  const full = Math.floor(n / 5), part = n % 5, s = H * 0.62;
  let x = W * 0.2;
  for (let k = 0; k < full; k++) { zheng(x, H * 0.52, s, 5); x += s * 1.35; }
  if (part) zheng(x, H * 0.52, s, part);
  // 旁边一个箭头 + "🚂"
  ctx.fillStyle = 'rgba(236,232,220,0.55)'; ctx.font = `bold ${Math.round(H * 0.11)}px ${HAND}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('睡神看这里 ↓', W * 0.08, H * 0.09);
}

// ================= 标牌、宣传画、线路图 =================
export function genMetroSign(kind) {
  const sizes = { station: [1024, 256], filters: [256, 360], map: [512, 384], hermetic: [256, 96], danger: [256, 256], exit: [256, 96], rules: [256, 360] };
  const [W, H] = sizes[kind] || [256, 256];
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(4371 + kind.length * 13), rnd = mulberry32(4371 + kind.length);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 'station') {
    ctx.fillStyle = '#1a1c1a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c8b27a'; ctx.font = `bold 120px ${CYR}`; ctx.fillText('ОБЩЕЖИТИЕ · 211', W / 2, H * 0.44);
    ctx.font = `bold 48px ${SANS}`; ctx.fillStyle = '#a89868'; ctx.fillText('宿 舍 站', W / 2, H * 0.82);
  } else if (kind === 'filters') {
    ctx.fillStyle = '#b8a888'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a1a14'; ctx.fillRect(0, 0, W, 70);
    ctx.fillStyle = '#e8dcc0'; ctx.font = `bold 30px ${CYR}`; ctx.fillText('БЕРЕГИТЕ', W / 2, 24); ctx.fillText('ФИЛЬТРЫ!', W / 2, 52);
    // 防毒面具的剪影
    ctx.fillStyle = '#1a1814';
    ctx.beginPath(); ctx.ellipse(W / 2, 160, 62, 74, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#b8a888'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W / 2 + s * 26, 140, 20, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#3a3a30'; ctx.beginPath(); ctx.ellipse(W / 2, 236, 30, 26, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 34px ${SANS}`; ctx.fillText('爱护滤罐', W / 2, 296);
    ctx.font = `16px ${SANS}`; ctx.fillText('一只滤罐 = 五分钟的命', W / 2, 330);
  } else if (kind === 'map') {
    ctx.fillStyle = '#d8d0b8'; ctx.fillRect(0, 0, W, H);
    const lines = [['#b82a20', [[40, 80], [180, 120], [300, 200], [470, 260]]], ['#2a6ab8', [[60, 330], [200, 250], [300, 200], [420, 90]]], ['#2a8a3a', [[250, 30], [270, 130], [300, 200], [330, 350]]], ['#c8781a', [[120, 190], [220, 180], [300, 200], [400, 230], [480, 200]]]];
    ctx.lineCap = 'round';
    for (const [col, pts] of lines) { ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); for (const [x, y] of pts) { ctx.fillStyle = '#f0ead8'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 2; ctx.stroke(); } }
    ctx.strokeStyle = '#1a1814'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(300, 200, 16, 0, 6.28); ctx.stroke();
    ctx.fillStyle = '#8a1a14'; ctx.font = `bold 22px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('211 ◉ 你在这里', 322, 186);
    ctx.fillStyle = '#2a2420'; ctx.font = `13px ${CYR}`;
    [['ПОЛИС', 180, 108], ['ВДНХ', 410, 76], ['АРБАТ', 110, 316], ['КРАСНАЯ', 470, 280]].forEach(([t, x, y]) => ctx.fillText(t, x, y));
    ctx.font = `bold 20px ${CYR}`; ctx.fillText('СХЕМА ЛИНИЙ · 2077', 20, 30);
    // 用红笔划掉的站
    ctx.strokeStyle = 'rgba(160,20,20,0.8)'; ctx.lineWidth = 3;
    for (const [x, y] of [[470, 260], [60, 330], [330, 350]]) { ctx.beginPath(); ctx.moveTo(x - 12, y - 12); ctx.lineTo(x + 12, y + 12); ctx.moveTo(x + 12, y - 12); ctx.lineTo(x - 12, y + 12); ctx.stroke(); }
  } else if (kind === 'hermetic') {
    ctx.fillStyle = '#c8a82a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 34px ${CYR}`; ctx.fillText('ГЕРМОДВЕРЬ', W / 2, H * 0.4);
    ctx.font = `bold 22px ${SANS}`; ctx.fillText('气密门 · 211', W / 2, H * 0.78);
  } else if (kind === 'danger') {
    ctx.fillStyle = '#d8b41a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1814'; ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W - 30, 150); ctx.lineTo(30, 150); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b41a'; ctx.font = `bold 90px ${SANS}`; ctx.fillText('!', W / 2, 108);
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 34px ${CYR}`; ctx.fillText('ОПАСНО! ГАЗ', W / 2, 186);
    ctx.font = `bold 30px ${SANS}`; ctx.fillText('毒气 · 戴面具', W / 2, 226);
  } else if (kind === 'exit') {
    ctx.fillStyle = '#1a4a2a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d8e0c8'; ctx.font = `bold 44px ${CYR}`; ctx.fillText('ВЫХОД →', W / 2, H / 2);
  } else if (kind === 'rules') {
    ctx.fillStyle = '#c8bc9c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1814'; ctx.font = `bold 26px ${SANS}`; ctx.fillText('站 规', W / 2, 34);
    ctx.font = `17px ${SANS}`; ctx.textAlign = 'left';
    ['一、上地面必须戴面具', '二、滤罐用完要登记', '三、子弹就是钱，别乱打', '四、隧道里听见声音', '　　不要回头', '五、23 点以后熄灯', '六、211 值班室的', '　　那个人别叫他了', '　　叫不醒'].forEach((l, k) => ctx.fillText(l, 22, 80 + k * 30));
  }
  // 旧：发黄、脏、边上烂
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = N.fbm(x / 50, y / 50, 4, W / 50, H / 50);
    const k = 0.66 + n * 0.32, g = smoothstep(0.62, 0.82, n) * 0.5 + smoothstep(14, 0, Math.min(x, y, W - x, H - y)) * 0.5;
    d[i] = lerp(d[i] * k, 40, g); d[i + 1] = lerp(d[i + 1] * k, 34, g); d[i + 2] = lerp(d[i + 2] * k, 24, g);
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { wrap: false });
}

// ================= 车厢侧面：蓝灰色的铁皮 + 一排窗户 + 门，锈、脏、被人画过 =================
export function genTrainSide(W = 1024, H = 256) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(4381);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const n = N.fbm(u * 12, v * 3, 4, 12, 3), nf = N.noise(x / 2, y / 2, W / 2, H / 2);
    let col = v < 0.62 ? mix3(rgb('#3a4a52'), rgb('#56666c'), n) : mix3(rgb('#26343a'), rgb('#3a484e'), n);
    if (Math.abs(v - 0.62) < 0.012) col = rgb('#8a8070');
    col = mix3(col, rgb('#5a3418'), smoothstep(0.6, 0.85, n + (nf - 0.5) * 0.2) * 0.6);
    col = mix3(col, rgb('#141210'), smoothstep(0.75, 1.0, v) * 0.5);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  // 窗户（黑洞洞的）和门
  for (let k = 0; k < 6; k++) {
    const x = 60 + k * 160;
    if (k % 2 === 0) { ctx.fillStyle = '#0a0c0c'; ctx.fillRect(x, 40, 110, 80); ctx.strokeStyle = '#6a6a60'; ctx.lineWidth = 3; ctx.strokeRect(x, 40, 110, 80); }
    else { ctx.fillStyle = '#2a363a'; ctx.fillRect(x, 20, 120, 220); ctx.fillStyle = '#0a0c0c'; ctx.fillRect(x + 12, 40, 44, 80); ctx.fillRect(x + 64, 40, 44, 80); ctx.strokeStyle = '#1a2024'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 60, 20); ctx.lineTo(x + 60, 240); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(220,210,180,0.7)'; ctx.font = `bold 26px ${STENCIL}`; ctx.fillText('81-717 · № 2112', 40, 200);
  return toTex(c, { wrap: false });
}
