// 第三章贴图：雨林 211 —— 写实电影感（暴雨夜，宿舍像是被塞进了一棵大树的树洞底下）
//   墙：活树的木质内壁（竖向的木纤维、树瘤、裂缝、渗水的暗痕、墙根的苔藓）；天花板：盘根错节的根须；
//   地板：泡过水的旧木地板（缝里长苔、窗边一滩积水反光）；窗外：暴雨里的热带雨林剪影，闪电时一层层亮出来；
//   动物：羽毛 / 短毛 / 绒毛的贴图 + 法线，眼睛是湿润的虹膜；屏幕：暗色的写实游戏画面、短视频
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, SANS } from './textures.js';
import { mulberry32, clamp, smoothstep, lerp } from './util.js';

const rgb = (hex) => hexToRgb(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dataTex = (c, rep = null) => { const t = toTex(c, { data: true }); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const colTex = (c, rep = null) => { const t = toTex(c); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
// 从高度图（灰度 canvas）生成一张粗糙度图：亮（凸）的地方粗、暗（缝里）的地方湿滑
function roughFrom(h, base = 0.8, span = 0.25, wet = null) {
  const W = h.width, H = h.height, s = h.getContext('2d').getImageData(0, 0, W, H).data;
  const w = wet ? wet.getContext('2d').getImageData(0, 0, W, H).data : null;
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    let r = base + (s[i] / 255 - 0.5) * span;
    if (w) r = lerp(r, 0.12, w[i] / 255);
    const v = clamp(r, 0.05, 1) * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  });
  return c;
}

// ================= 墙：活树的木质内壁 =================
// 平铺 2m × 3m（和宿舍墙的世界坐标 UV 对得上）：u 横向、v 竖向；木纤维沿竖直方向，底下潮、有苔
export function genTreeWall({ seed = 3301, W = 512, H = 768 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const hC = makeCanvas(W, H), cC = makeCanvas(W, H), wC = makeCanvas(W, H);
  const knots = Array.from({ length: 5 }, () => ({ x: rnd() * W, y: rnd() * H, r: 18 + rnd() * 34 }));
  const dark = rgb('#2a1d14'), mid = rgb('#5b4331'), light = rgb('#8a6c50'), moss = rgb('#3f4a22'), mossL = rgb('#6b7a33');
  const hImg = hC.getContext('2d').createImageData(W, H), cImg = cC.getContext('2d').createImageData(W, H), wImg = wC.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / H; // 0 = 顶，1 = 底（贴图里 y 往下）
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // 纤维：x 方向高频、y 方向低频的噪声，被树瘤扰动
      let dx = 0;
      for (const k of knots) {
        let ddx = x - k.x; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W;
        let ddy = y - k.y; if (ddy > H / 2) ddy -= H; if (ddy < -H / 2) ddy += H;
        const d = Math.hypot(ddx, ddy * 0.6);
        dx += (ddx / (d + 1)) * Math.exp(-d / (k.r * 1.6)) * k.r * 0.9;
      }
      const fx = (x + dx) / W;
      const warp = N.fbm(u * 3, v * 2, 3, 3, 2) * 0.12;
      const fib = N.fbm((fx + warp) * 64, v * 3, 3, 64, 3);
      const fib2 = N.fbm((fx + warp) * 16, v * 1.5 + 7, 3, 16, 1.5 * 2);
      // 深深的竖向裂缝
      const crack = smoothstep(0.08, 0.0, Math.abs(N.fbm((fx + warp * 2) * 10 + 3, v * 1.2, 2, 10, 2) - 0.5)) * (0.4 + 0.6 * N.noise(u * 6, v * 3, 6, 3));
      let h = 0.35 + fib * 0.35 + fib2 * 0.3 - crack * 0.55;
      // 树瘤：一圈圈的年轮
      let knot = 0;
      for (const k of knots) {
        let ddx = x - k.x; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W;
        let ddy = y - k.y; if (ddy > H / 2) ddy -= H; if (ddy < -H / 2) ddy += H;
        const d = Math.hypot(ddx, ddy * 0.7) / k.r;
        if (d < 1.3) knot = Math.max(knot, (1 - d / 1.3) * (0.5 + 0.5 * Math.sin(d * 18)));
      }
      h = h * (1 - knot * 0.5) + knot * 0.25;
      // 苔藓：墙根厚、往上稀疏；渗水：竖向的暗痕
      const mossN = N.fbm(u * 8 + 11, v * 6, 4, 8, 6);
      const mossAmt = clamp(smoothstep(0.55, 1.0, v) * 1.4 + smoothstep(0.62, 0.8, mossN) * 0.5 - 0.35, 0, 1) * smoothstep(0.45, 0.62, mossN + v * 0.2);
      const seep = smoothstep(0.62, 0.8, N.fbm(u * 9 + 40, v * 0.6, 3, 9, 1)) * (0.5 + 0.5 * v);
      let col = mix3(dark, mid, clamp(h * 1.3 - 0.1, 0, 1));
      col = mix3(col, light, clamp((fib - 0.6) * 2.2, 0, 1) * 0.5);
      col = mix3(col, dark, crack * 0.7 + seep * 0.45);
      const mc = mix3(moss, mossL, N.noise(u * 60, v * 60, 60, 60));
      col = mix3(col, mc, mossAmt * 0.9);
      const i = (y * W + x) * 4;
      const hv = clamp(h + mossAmt * 0.25, 0, 1) * 255;
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = hv; hImg.data[i + 3] = 255;
      cImg.data[i] = col[0]; cImg.data[i + 1] = col[1]; cImg.data[i + 2] = col[2]; cImg.data[i + 3] = 255;
      const wv = clamp(seep * 0.9 + crack * 0.3, 0, 1) * (1 - mossAmt) * 255;
      wImg.data[i] = wImg.data[i + 1] = wImg.data[i + 2] = wv; wImg.data[i + 3] = 255;
    }
  }
  hC.getContext('2d').putImageData(hImg, 0, 0); cC.getContext('2d').putImageData(cImg, 0, 0); wC.getContext('2d').putImageData(wImg, 0, 0);
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 5)), roughnessMap: dataTex(roughFrom(hC, 0.86, 0.2, wC)) };
}

// 树根 / 树皮（沿长度方向平铺：u 沿着根，v 绕一圈）
export function genBark({ seed = 3311, W = 256, H = 256, base = '#4a3526', moss = 0.35 } = {}) {
  const N = createNoise(seed);
  const hC = makeCanvas(W, H), cC = makeCanvas(W, H);
  const b = rgb(base), d = rgb('#1c130d'), l = rgb('#7d6048'), m = rgb('#4a5626');
  const hImg = hC.getContext('2d').createImageData(W, H), cImg = cC.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    // 树皮的纹路沿着根走（u 方向拉长）
    const ridge = N.fbm(u * 3, v * 14, 4, 3, 14);
    const furrow = smoothstep(0.42, 0.5, ridge) * smoothstep(0.58, 0.5, ridge);
    const plate = N.fbm(u * 6 + 3, v * 20, 3, 6, 20);
    const h = clamp(ridge * 0.8 + plate * 0.4 - furrow * 0.6, 0, 1);
    const mz = smoothstep(0.55, 0.8, N.fbm(u * 5 + 9, v * 5, 3, 5, 5)) * moss;
    let c = mix3(d, b, clamp(h * 1.4 - 0.2, 0, 1));
    c = mix3(c, l, clamp(plate - 0.62, 0, 1) * 1.2);
    c = mix3(c, m, mz);
    const i = (y * W + x) * 4;
    hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = h * 255; hImg.data[i + 3] = 255;
    cImg.data[i] = c[0]; cImg.data[i + 1] = c[1]; cImg.data[i + 2] = c[2]; cImg.data[i + 3] = 255;
  }
  hC.getContext('2d').putImageData(hImg, 0, 0); cC.getContext('2d').putImageData(cImg, 0, 0);
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 4)), roughnessMap: dataTex(roughFrom(hC, 0.88, 0.15)) };
}

// ================= 天花板：压实的泥土 + 细根须 =================
export function genRootCeiling({ seed = 3321, S = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  pixels(c, (x, y, d, i) => {
    const u = x / S, v = y / S;
    const n = N.fbm(u * 6, v * 6, 5, 6, 6);
    const col = mix3(rgb('#1f1812'), rgb('#4a3a2a'), clamp(n * 1.5 - 0.25, 0, 1));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  // 细根：弯弯曲曲的深色线条，边缘一道浅色
  ctx.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const w = 0.8 + rnd() * 3.5, n = 12 + rnd() * 30;
    const pts = [[x, y]];
    for (let s = 0; s < n; s++) { a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    for (const [off, col, lw] of [[0.8, 'rgba(140,110,80,0.35)', w], [0, 'rgba(22,15,10,0.85)', w]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        ctx.beginPath(); pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + dx - off, py + dy - off) : ctx.moveTo(px + dx - off, py + dy - off))); ctx.stroke();
      }
    }
  }
  // 苔藓斑
  for (let k = 0; k < 40; k++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(70,84,34,0.55)'); g.addColorStop(1, 'rgba(70,84,34,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = colTex(c); t.repeat.set(2, 4);
  return t;
}

// ================= 地板：泡过水的旧木地板 =================
export function genWetFloor({ seed = 3331, W = 512, H = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const hC = makeCanvas(W, H), cC = makeCanvas(W, H), wC = makeCanvas(W, H);
  const planks = 4, pw = W / planks;
  const offs = Array.from({ length: planks }, () => rnd() * H);
  const tints = Array.from({ length: planks * 3 }, () => 0.8 + rnd() * 0.35);
  const hImg = hC.getContext('2d').createImageData(W, H), cImg = cC.getContext('2d').createImageData(W, H), wImg = wC.getContext('2d').createImageData(W, H);
  const dk = rgb('#1e150e'), md = rgb('#4f3a28'), lt = rgb('#7a5c40'), moss = rgb('#35401d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = Math.floor(x / pw), px = (x % pw) / pw;
    const yy = (y + offs[p]) % H, seg = Math.floor(yy / (H / 3)), py = (yy % (H / 3)) / (H / 3);
    const grain = N.fbm(px * 2 + p * 5.3, (yy / H) * 18, 4, 64, 18);
    const ring = 0.5 + 0.5 * Math.sin((px * 7 + grain * 6 + p) * Math.PI);
    const seamX = smoothstep(0.03, 0.0, Math.min(px, 1 - px));
    const seamY = smoothstep(0.012, 0.0, Math.min(py, 1 - py));
    const seam = Math.max(seamX, seamY);
    const tint = tints[p * 3 + seg];
    let h = 0.55 + (grain - 0.5) * 0.4 + ring * 0.08 - seam * 0.6;
    let col = mix3(dk, md, clamp(grain * 1.2 * tint, 0, 1));
    col = mix3(col, lt, ring * 0.18 * tint);
    // 缝里长苔 / 黑泥
    col = mix3(col, mix3(dk, moss, N.noise(x / 6, y / 6, W / 6, H / 6)), seam * 0.9);
    // 水渍：泡过水的深色斑
    const stain = smoothstep(0.55, 0.75, N.fbm(x / W * 4 + 3, y / H * 4, 4, 4, 4));
    col = mix3(col, dk, stain * 0.45);
    const i = (y * W + x) * 4;
    hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = clamp(h, 0, 1) * 255; hImg.data[i + 3] = 255;
    cImg.data[i] = col[0]; cImg.data[i + 1] = col[1]; cImg.data[i + 2] = col[2]; cImg.data[i + 3] = 255;
    wImg.data[i] = wImg.data[i + 1] = wImg.data[i + 2] = clamp(stain * 0.7 + seam * 0.4, 0, 1) * 255; wImg.data[i + 3] = 255;
  }
  hC.getContext('2d').putImageData(hImg, 0, 0); cC.getContext('2d').putImageData(cImg, 0, 0); wC.getContext('2d').putImageData(wImg, 0, 0);
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 3)), roughnessMap: dataTex(roughFrom(hC, 0.62, 0.3, wC)) };
}
// 地板上的一层：墙根的苔藓、落叶、窗边的积水（整张铺满房间，不平铺）
export function genFloorLitter(W = 512, H = 1024) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(3341), N = createNoise(3341);
  ctx.clearRect(0, 0, W, H);
  // 墙根的苔藓带（左右两边）
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const edge = Math.min(u, 1 - u);
    const n = N.fbm(u * 10, v * 20, 4, 10, 20);
    const a = clamp(smoothstep(0.09, 0.0, edge - n * 0.06) * 0.85 + smoothstep(0.03, 0.0, v - n * 0.05) * 0.8, 0, 1) * smoothstep(0.35, 0.55, n);
    const col = mix3(rgb('#2f3a18'), rgb('#5e6c2a'), N.noise(x / 3, y / 3, W / 3, H / 3));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a * 255;
  });
  // 落叶
  const leafCols = ['#5a4a22', '#6b5528', '#3e4a1e', '#7a5a2a', '#4a3a1a'];
  for (let k = 0; k < 160; k++) {
    const edge = rnd() < 0.7;
    const x = edge ? (rnd() < 0.5 ? rnd() * W * 0.14 : W - rnd() * W * 0.14) : rnd() * W, y = rnd() * H;
    const s = 5 + rnd() * 9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 6.28);
    ctx.fillStyle = leafCols[(rnd() * leafCols.length) | 0]; ctx.globalAlpha = 0.55 + rnd() * 0.4;
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,10,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s * 1.2); ctx.stroke();
    ctx.restore();
  }
  // 泥脚印（进门那一段）
  ctx.globalAlpha = 1;
  for (let k = 0; k < 8; k++) {
    const x = W * (0.22 + (k % 2) * 0.06), y = H * (0.95 - k * 0.03);
    ctx.fillStyle = 'rgba(40,28,16,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, 5, 11, 0.1, 0, 6.28); ctx.fill();
  }
  return toTex(c, { wrap: false });
}

// ================= 窗外：暴雨里的热带雨林（三层，做视差）=================
// 远景：暴风雨的天 + 远处的树冠剪影；flashMask 通道里是闪电时的亮度分布
export function genJungleSky(W = 1024, H = 512) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), N = createNoise(3351), rnd = mulberry32(3351);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const cloud = N.fbm(u * 5, v * 3, 5, 5, 3);
    const k = clamp(0.25 + cloud * 0.6 - v * 0.35, 0, 1);
    const col = mix3(rgb('#07090b'), rgb('#2c3a44'), k);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  // 远处一层层的树冠
  for (const [yb, colr, amp] of [[0.62, '#0c120f', 0.07], [0.72, '#080c0a', 0.09], [0.84, '#040605', 0.06]]) {
    ctx.fillStyle = colr; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const u = x / W;
      const y = H * (yb - amp * (N.fbm(u * 12 + yb * 10, yb, 3, 12, 1) * 1.4) - 0.04 * Math.max(0, Math.sin(u * 23 + yb * 7)) ** 6);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.fill();
    // 冒出来的几棵高树
    for (let k = 0; k < 6; k++) {
      const x = rnd() * W, r = 20 + rnd() * 40, y = H * (yb - amp * 1.4) - r * 0.4;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, 6.28); ctx.fill();
      ctx.fillRect(x - 2, y, 4, H * 0.3);
    }
  }
  return toTex(c, { wrap: false });
}
// 近景：窗户外面几米的地方——大叶子、藤蔓、树干（带透明，前后两层）
export function genJungleNear({ seed = 3361, W = 1024, H = 512, density = 1, tone = '#0b120d' } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);
  const base = rgb(tone);
  const shade = (k) => `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
  // 树干
  for (let k = 0; k < 3 * density; k++) {
    const x = rnd() * W, w = 18 + rnd() * 40;
    ctx.fillStyle = shade(0.7 + rnd() * 0.5);
    ctx.beginPath(); ctx.moveTo(x - w / 2, H); ctx.bezierCurveTo(x - w / 2 + rnd() * 30, H * 0.6, x - w / 3, H * 0.2, x - w / 4 + (rnd() - 0.5) * 40, -10);
    ctx.lineTo(x + w / 4 + (rnd() - 0.5) * 40, -10); ctx.bezierCurveTo(x + w / 3, H * 0.2, x + w / 2 - rnd() * 30, H * 0.6, x + w / 2, H); ctx.fill();
  }
  // 藤蔓
  ctx.lineCap = 'round';
  for (let k = 0; k < 10 * density; k++) {
    let x = rnd() * W, y = -5; ctx.strokeStyle = shade(0.9 + rnd() * 0.4); ctx.lineWidth = 1.5 + rnd() * 3;
    ctx.beginPath(); ctx.moveTo(x, y);
    const len = H * (0.3 + rnd() * 0.7);
    while (y < len) { x += (rnd() - 0.5) * 16; y += 12; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // 大叶子：芭蕉叶、龟背竹、蕨
  const leaf = (x, y, s, a, kind) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = shade(0.8 + rnd() * 0.9);
    if (kind === 0) { // 芭蕉叶：长条，边缘被撕成一条条
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let t = 0; t <= 1.001; t += 0.05) ctx.lineTo(t * s * 2.2, -Math.sin(t * Math.PI) * s * 0.45);
      for (let t = 1; t >= 0; t -= 0.05) ctx.lineTo(t * s * 2.2, Math.sin(t * Math.PI) * s * 0.4 * (0.7 + 0.3 * Math.sin(t * 40)));
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 1.2;
      for (let t = 0.15; t < 0.95; t += 0.09 + rnd() * 0.05) { ctx.beginPath(); ctx.moveTo(t * s * 2.2, 0); ctx.lineTo(t * s * 2.2 + s * 0.15, s * 0.45); ctx.stroke(); }
    } else if (kind === 1) { // 龟背竹：心形，有洞
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.6, -s * 0.9, s * 1.6, -s * 0.5, s * 1.4, 0); ctx.bezierCurveTo(s * 1.6, s * 0.5, s * 0.6, s * 0.9, 0, 0); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(s * (0.4 + k * 0.2), (k % 2 ? 1 : -1) * s * 0.3, s * 0.06, s * 0.14, 0.3, 0, 6.28); ctx.fill(); }
    } else { // 蕨：一根主脉 + 两排小叶
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s, -s * 0.2, s * 2, s * 0.2); ctx.stroke();
      for (let t = 0.1; t < 1; t += 0.07) { const px = t * s * 2, py = -Math.sin(t * 1.5) * s * 0.1 + t * t * s * 0.2, l = s * 0.35 * (1 - t * 0.7); ctx.beginPath(); ctx.ellipse(px, py - l * 0.5, l * 0.18, l * 0.55, 0.4, 0, 6.28); ctx.ellipse(px, py + l * 0.5, l * 0.18, l * 0.55, -0.4, 0, 6.28); ctx.fill(); }
    }
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  };
  for (let k = 0; k < 26 * density; k++) {
    const edge = rnd() < 0.6;
    const x = edge ? (rnd() < 0.5 ? rnd() * W * 0.3 : W - rnd() * W * 0.3) : rnd() * W;
    const y = rnd() < 0.5 ? rnd() * H * 0.35 : H * (0.6 + rnd() * 0.45);
    leaf(x, y, 40 + rnd() * 90, rnd() * 6.28, (rnd() * 3) | 0);
  }
  return toTex(c, { wrap: false });
}
// 雨丝（可以往下平铺滚动的）
export function genRainStreaks({ seed = 3371, W = 256, H = 512, n = 260, len = [30, 90], alpha = [0.15, 0.55] } = {}) {
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = rnd() * W, y = rnd() * H, l = len[0] + rnd() * (len[1] - len[0]);
    const g = ctx.createLinearGradient(x, y, x - l * 0.08, y + l);
    const a = alpha[0] + rnd() * (alpha[1] - alpha[0]);
    g.addColorStop(0, 'rgba(210,225,235,0)'); g.addColorStop(0.7, `rgba(210,225,235,${a})`); g.addColorStop(1, 'rgba(210,225,235,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 0.7 + rnd() * 1.1;
    for (const dy of [-H, 0, H]) { ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x - l * 0.08, y + l + dy); ctx.stroke(); }
  }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 玻璃上的水珠（高度图：着色器用它算折射 / 高光，a 通道是覆盖度）
export function genGlassDrops({ seed = 3381, S = 512 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  const drop = (x, y, r, sy = 1) => {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(160,160,160,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * sy, 0, 0, 6.28); ctx.fill();
  };
  for (let k = 0; k < 900; k++) drop(rnd() * S, rnd() * S, 0.8 + rnd() * 2.2);
  for (let k = 0; k < 160; k++) drop(rnd() * S, rnd() * S, 2.5 + rnd() * 5, 1 + rnd() * 0.4);
  // 往下流的水痕
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rnd() * S, y = rnd() * S * 0.6; const w = 1.5 + rnd() * 2.5;
    ctx.strokeStyle = 'rgba(120,120,120,0.9)'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y);
    const n = 10 + rnd() * 30;
    for (let s = 0; s < n; s++) { x += (rnd() - 0.5) * 3; y += 6; ctx.lineTo(x, y); }
    ctx.stroke(); drop(x, y + 2, w * 1.4, 1.3);
  }
  return toTex(c, { data: true });
}

// ================= 洗手间窗外（大树 + 猴子那一块）的远景、地面 =================
export function genJungleBackdrop() {
  const c = makeCanvas(1024, 512), ctx = c.getContext('2d');
  ctx.drawImage(genJungleSky(1024, 512).image, 0, 0);
  ctx.drawImage(genJungleNear({ seed: 3391, density: 0.7, tone: '#0a100c' }).image, 0, 0);
  return toTex(c, { wrap: false });
}
export function genJungleGround() {
  const c = makeCanvas(512, 512), N = createNoise(3395);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 64, y / 64, 5, 8, 8), w = smoothstep(0.55, 0.7, N.fbm(x / 128 + 5, y / 128, 3, 4, 4));
    let col = mix3(rgb('#0a0d08'), rgb('#1d2612'), n);
    col = mix3(col, rgb('#1a2228'), w * 0.8); // 积水反着天光
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  return toTex(c);
}

// ================= 布料 / 纸：潮湿发霉 =================
export function damp(src, { seed = 1, dark = 0.78, green = 0.1, mold = 10, wrap = true, repeat = null } = {}) {
  const img = src.image || src, W = img.width, H = img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed * 17 + 3);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    // 去一点饱和、压暗、偏一点点绿
    p[i] = lerp(p[i], l, 0.35) * dark; p[i + 1] = lerp(p[i + 1], l, 0.35) * (dark + green * 0.3); p[i + 2] = lerp(p[i + 2], l, 0.35) * (dark - green * 0.4);
  }
  ctx.putImageData(d, 0, 0);
  // 水渍圈 + 霉点
  for (let k = 0; k < mold; k++) {
    const x = rnd() * W, y = rnd() * H, r = (0.05 + rnd() * 0.15) * Math.min(W, H);
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    g.addColorStop(0, 'rgba(40,46,30,0.05)'); g.addColorStop(0.85, 'rgba(50,55,30,0.22)'); g.addColorStop(1, 'rgba(50,55,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  for (let k = 0; k < mold * 6; k++) {
    ctx.fillStyle = `rgba(${25 + rnd() * 20},${35 + rnd() * 20},${18 + rnd() * 10},${0.15 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 2, 0, 6.28); ctx.fill();
  }
  const t = toTex(c, { wrap });
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (src.repeat) t.repeat.copy(src.repeat);
  return t;
}

// 挂钟的表盘：受潮起雾
export function genClockFaceDamp(base) {
  const img = base.image, c = makeCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = 'rgba(40,50,40,0.18)'; ctx.fillRect(0, 0, c.width, c.height);
  const g = ctx.createRadialGradient(c.width * 0.6, c.height * 0.7, 10, c.width * 0.6, c.height * 0.7, c.width * 0.6);
  g.addColorStop(0, 'rgba(220,230,220,0.25)'); g.addColorStop(1, 'rgba(220,230,220,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  return toTex(c, { wrap: false });
}

// 海报：印刷品，受潮起皱、边角卷起、颜色褪了
export function genPosterReal(kind) {
  const W = 256, H = 364, c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(kind.length * 97 + 3);
  const P = {
    chicken: { bg: ['#1a1d22', '#3a2a1c'], title: '鸡不可失', sub: 'CLUCK GAMING · 电竞战队', accent: '#c9a24a' },
    horse: { bg: ['#1f2a2a', '#0d1414'], title: '马上暴富', sub: '刷完这条就睡', accent: '#8fb6a4' },
    monkey: { bg: ['#2a1a18', '#120a08'], title: '猴赛雷', sub: 'THE MOST HANDSOME', accent: '#d08a5a' },
    sleep: { bg: ['#141a24', '#060a10'], title: '早睡早起', sub: '身体好', accent: '#a8b4c8' },
  }[kind];
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 一张"照片"：主体的剪影 + 逆光
  const cx = W / 2, cy = H * 0.42;
  const halo = ctx.createRadialGradient(cx, cy - 20, 5, cx, cy, 120); halo.addColorStop(0, P.accent); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55; ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.fillStyle = '#07080a';
  if (kind === 'chicken') { ctx.beginPath(); ctx.ellipse(cx, cy + 30, 52, 60, 0, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 18, cy - 38, 26, 0, 6.28); ctx.fill(); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx + 8 + k * 11, cy - 64 + (k % 2) * 3, 8, 0, 6.28); ctx.fill(); } ctx.beginPath(); ctx.moveTo(cx + 42, cy - 40); ctx.lineTo(cx + 62, cy - 34); ctx.lineTo(cx + 42, cy - 28); ctx.fill(); ctx.fillRect(cx - 70, cy + 60, 140, 8); }
  else if (kind === 'horse') { ctx.beginPath(); ctx.ellipse(cx - 10, cy + 20, 34, 80, 0.5, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - 4, cy - 70); ctx.lineTo(cx + 8, cy - 96); ctx.lineTo(cx + 14, cy - 66); ctx.fill(); }
  else if (kind === 'monkey') { ctx.beginPath(); ctx.arc(cx, cy - 20, 44, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(cx - 46, cy - 20, 14, 0, 6.28); ctx.arc(cx + 46, cy - 20, 14, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx, cy + 70, 60, 50, 0, 0, 6.28); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(cx + 30, cy - 30, 36, 0, 6.28); ctx.fill(); ctx.fillStyle = P.bg[0]; ctx.beginPath(); ctx.arc(cx + 44, cy - 40, 32, 0, 6.28); ctx.fill(); }
  // 标题
  ctx.fillStyle = '#e8e2d2'; ctx.textAlign = 'center';
  ctx.font = `900 40px ${SANS}`; ctx.fillText(P.title, cx, H * 0.83);
  ctx.fillStyle = P.accent; ctx.font = `600 12px ${SANS}`; ctx.fillText(P.sub, cx, H * 0.9);
  if (kind === 'sleep') { ctx.strokeStyle = '#b8322a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 70, H * 0.815); ctx.lineTo(cx - 6, H * 0.8); ctx.stroke(); }
  // 受潮：褪色、起皱、霉点、水渍从上往下流
  ctx.fillStyle = 'rgba(200,190,160,0.12)'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 14; k++) { const x = rnd() * W; const gr = ctx.createLinearGradient(x, 0, x, H * (0.3 + rnd() * 0.5)); gr.addColorStop(0, 'rgba(60,50,30,0.25)'); gr.addColorStop(1, 'rgba(60,50,30,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 3, 0, 6 + rnd() * 8, H); }
  for (let k = 0; k < 120; k++) { ctx.fillStyle = `rgba(30,36,20,${0.1 + rnd() * 0.3})`; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 2, 0, 6.28); ctx.fill(); }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) { const y = rnd() * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * 30, W * 0.7, y + (rnd() - 0.5) * 30, W, y + (rnd() - 0.5) * 20); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// 地毯：旧的手织地毯，花纹褪色
export function genRugReal() {
  const S = 512, c = makeCanvas(S, S), ctx = c.getContext('2d'), N = createNoise(3401);
  pixels(c, (x, y, d, i) => {
    const u = x / S - 0.5, v = y / S - 0.5, r = Math.hypot(u, v) * 2;
    const ring = Math.floor(r * 7);
    const cols = ['#5a2a22', '#3a2a22', '#6a4a2a', '#2a3230', '#5a2a22', '#4a3a2a', '#2a221c'];
    let col = rgb(cols[Math.min(ring, cols.length - 1)]);
    const ang = Math.atan2(v, u), pat = Math.sin(ang * (6 + ring * 2)) * Math.sin(r * 44);
    col = mix3(col, rgb('#8a7050'), clamp(pat, 0, 1) * 0.25);
    const n = N.fbm(x / 8, y / 8, 3, 64, 64);
    col = mix3(col, [col[0] * 0.6, col[1] * 0.62, col[2] * 0.55], n * 0.8);
    const a = r < 0.97 ? 255 : r < 1 ? (1 - r) / 0.03 * 255 : 0;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a;
  });
  return toTex(c, { wrap: false });
}

// ================= 叶子（带透明） =================
export function genLeaf(kind = 'monstera', { S = 256, color = '#2f4a22', vein = '#5a7a3a', seed = 1 } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createLinearGradient(0, S, 0, 0); g.addColorStop(0, color); g.addColorStop(1, vein);
  ctx.fillStyle = g;
  if (kind === 'monstera') {
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.98);
    ctx.bezierCurveTo(S * 0.02, S * 0.8, S * 0.02, S * 0.12, S / 2, S * 0.06);
    ctx.bezierCurveTo(S * 0.98, S * 0.12, S * 0.98, S * 0.8, S / 2, S * 0.98); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    // 从边缘往里的裂口 + 小洞
    for (let k = 0; k < 7; k++) {
      const y = S * (0.2 + k * 0.1);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(S / 2 + s * S * 0.5, y); ctx.lineTo(S / 2 + s * S * 0.12, y + S * 0.03); ctx.lineTo(S / 2 + s * S * 0.5, y + S * 0.05); ctx.fill(); }
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(S / 2 + s * S * 0.09, y + S * 0.02, S * 0.018, S * 0.035, 0, 0, 6.28); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (kind === 'fern') {
    ctx.strokeStyle = color; ctx.lineWidth = S * 0.015; ctx.beginPath(); ctx.moveTo(S / 2, S); ctx.lineTo(S / 2, 0); ctx.stroke();
    for (let t = 0.05; t < 0.98; t += 0.045) {
      const y = S * (1 - t), l = S * 0.42 * Math.sin(t * Math.PI) ** 0.7;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(S / 2 + s * l / 2, y - l * 0.15, l / 2, S * 0.016, s * -0.3, 0, 6.28); ctx.fill(); }
    }
  } else if (kind === 'banana') {
    ctx.beginPath(); ctx.moveTo(S / 2, S);
    for (let t = 0; t <= 1; t += 0.02) ctx.lineTo(S / 2 - Math.sin(t * Math.PI) * S * 0.28 * (0.85 + 0.15 * Math.sin(t * 50)), S * (1 - t));
    for (let t = 1; t >= 0; t -= 0.02) ctx.lineTo(S / 2 + Math.sin(t * Math.PI) * S * 0.28 * (0.85 + 0.15 * Math.sin(t * 43 + 1)), S * (1 - t));
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 2;
    for (let k = 0; k < 9; k++) { const y = S * (0.15 + rnd() * 0.75), s = rnd() < 0.5 ? -1 : 1; ctx.beginPath(); ctx.moveTo(S / 2 + s * S * 0.3, y - S * 0.04); ctx.lineTo(S / 2 + s * S * 0.04, y); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  } else { // 'ivy' 小叶子
    ctx.beginPath(); ctx.moveTo(S / 2, S * 0.95); ctx.bezierCurveTo(S * 0.05, S * 0.6, S * 0.2, S * 0.1, S / 2, S * 0.05); ctx.bezierCurveTo(S * 0.8, S * 0.1, S * 0.95, S * 0.6, S / 2, S * 0.95); ctx.fill();
  }
  // 叶脉
  ctx.strokeStyle = 'rgba(160,190,120,0.35)'; ctx.lineWidth = S * 0.01;
  ctx.beginPath(); ctx.moveTo(S / 2, S); ctx.lineTo(S / 2, S * 0.08); ctx.stroke();
  if (kind !== 'fern') for (let t = 0.15; t < 0.9; t += 0.09) { ctx.beginPath(); ctx.moveTo(S / 2, S * (1 - t)); ctx.lineTo(S * 0.2, S * (1 - t - 0.08)); ctx.moveTo(S / 2, S * (1 - t)); ctx.lineTo(S * 0.8, S * (1 - t - 0.08)); ctx.stroke(); }
  return toTex(c, { wrap: false });
}

// ================= 动物：羽毛 / 短毛 / 绒毛 =================
// 羽毛：一排排鱼鳞状的羽片（v 方向往下叠），返回 map + normalMap
export function genFeathers({ base = '#e8e0d0', tip = null, seed = 3411, S = 256, rows = 22, cols = 14, streak = 0.25 } = {}) {
  const hC = makeCanvas(S, S), cC = makeCanvas(S, S), hx = hC.getContext('2d'), cx = cC.getContext('2d'), rnd = mulberry32(seed);
  const b = rgb(base), t2 = rgb(tip || base);
  hx.fillStyle = '#505050'; hx.fillRect(0, 0, S, S);
  cx.fillStyle = base; cx.fillRect(0, 0, S, S);
  const fw = S / cols, fh = S / rows;
  // 羽片：从下往上一排排叠（上面一排压着下面一排），每片位置、大小都有点乱
  for (let r = rows; r >= -1; r--) for (let k = -1; k <= cols; k++) {
    const x = (k + (r % 2) * 0.5 + (rnd() - 0.5) * 0.35) * fw, y = (r + (rnd() - 0.5) * 0.3) * fh;
    const w = fw * (0.6 + rnd() * 0.25), h = fh * (1.1 + rnd() * 0.4);
    const col = mix3(b, t2, rnd() * 0.9);
    const sh = 0.93 + rnd() * 0.12;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const X = x + dx, Y = y + dy;
      if (X < -fw * 2 || X > S + fw * 2 || Y < -fh * 3 || Y > S + fh * 3) continue;
      const g = hx.createLinearGradient(0, Y - h * 0.1, 0, Y + h);
      g.addColorStop(0, '#454545'); g.addColorStop(0.7, '#a8a8a8'); g.addColorStop(1, '#6a6a6a');
      hx.fillStyle = g; hx.beginPath(); hx.ellipse(X, Y + h * 0.35, w, h, 0, 0, Math.PI); hx.fill();
      cx.fillStyle = `rgb(${col[0] * sh | 0},${col[1] * sh | 0},${col[2] * sh | 0})`;
      cx.beginPath(); cx.ellipse(X, Y + h * 0.35, w, h, 0, 0, Math.PI); cx.fill();
      // 羽枝：很淡的几道
      cx.strokeStyle = `rgba(0,0,0,${0.03 + streak * 0.06})`; cx.lineWidth = 0.5;
      for (let q = -2; q <= 2; q++) { cx.beginPath(); cx.moveTo(X, Y + h * 0.3); cx.lineTo(X + q * w * 0.3, Y + h * 1.25); cx.stroke(); }
    }
  }
  // 糊一点：羽毛边缘是软的
  const soft = (c, px) => { const t = makeCanvas(S, S), tc = t.getContext('2d'); tc.filter = `blur(${px}px)`; for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) tc.drawImage(c, dx, dy); const x2 = c.getContext('2d'); x2.clearRect(0, 0, S, S); x2.drawImage(t, 0, 0); };
  try { soft(cC, 0.7); soft(hC, 0.9); } catch (e) { /* 不支持 filter 就算了 */ }
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 1.8)) };
}
// 短毛（马）/ 长一点的毛（猴）/ 绒毛（小鸡）：顺着一个方向的细密笔触
export function genFur({ base = '#7a5236', dark = null, light = null, seed = 3421, S = 256, len = 10, n = 5000, width = 1, angle = Math.PI / 2, jitter = 0.35, spots = 0 } = {}) {
  const hC = makeCanvas(S, S), cC = makeCanvas(S, S), hx = hC.getContext('2d'), cx = cC.getContext('2d'), rnd = mulberry32(seed), N = createNoise(seed);
  const b = rgb(base), d = rgb(dark || '#000000'), l = rgb(light || base);
  hx.fillStyle = '#606060'; hx.fillRect(0, 0, S, S);
  pixels(cC, (x, y, dd, i) => { const k = N.fbm(x / 32, y / 32, 3, S / 32, S / 32); const col = mix3(mix3(b, d, 0.35), b, k); dd[i] = col[0]; dd[i + 1] = col[1]; dd[i + 2] = col[2]; dd[i + 3] = 255; });
  cx.lineCap = 'round'; hx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = rnd() * S, y = rnd() * S;
    const a = angle + (N.noise(x / 40, y / 40, S / 40, S / 40) - 0.5) * 1.2 + (rnd() - 0.5) * jitter;
    const L = len * (0.6 + rnd() * 0.8);
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    const t = rnd();
    const col = t < 0.5 ? mix3(b, d, (0.5 - t) * 1.2) : mix3(b, l, (t - 0.5) * 1.4);
    const bright = 90 + t * 150;
    cx.strokeStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0.7)`; cx.lineWidth = width * (0.6 + rnd() * 0.8);
    hx.strokeStyle = `rgba(${bright | 0},${bright | 0},${bright | 0},0.6)`; hx.lineWidth = width;
    // 只有跨过边的那几笔才需要在对边再画一遍（贴图要能无缝平铺）
    const wx = Math.min(x, ex) < 0 ? S : Math.max(x, ex) > S ? -S : 0, wy = Math.min(y, ey) < 0 ? S : Math.max(y, ey) > S ? -S : 0;
    for (const [ox, oy] of wx || wy ? [[0, 0], [wx, 0], [0, wy], [wx, wy]] : [[0, 0]]) {
      cx.beginPath(); cx.moveTo(x + ox, y + oy); cx.lineTo(ex + ox, ey + oy); cx.stroke();
      hx.beginPath(); hx.moveTo(x + ox, y + oy); hx.lineTo(ex + ox, ey + oy); hx.stroke();
    }
  }
  if (spots) {
    for (let k = 0; k < spots; k++) { const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 16; const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${d[0]},${d[1]},${d[2]},0.45)`); g.addColorStop(1, `rgba(${d[0]},${d[1]},${d[2]},0)`); cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2); }
  }
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 2.2)) };
}
// 裸露的皮肤（猴脸、鸡冠）：细细的褶子和毛孔
export function genSkin({ base = '#c49a80', seed = 3431, S = 128, bumps = 1 } = {}) {
  const N = createNoise(seed), hC = makeCanvas(S, S), cC = makeCanvas(S, S), b = rgb(base);
  pixels(hC, (x, y, d, i) => { const n = N.fbm(x / 10, y / 10, 4, S / 10, S / 10) * 0.6 + N.noise(x / 2.5, y / 2.5, S / 2.5, S / 2.5) * 0.4 * bumps; d[i] = d[i + 1] = d[i + 2] = n * 255; d[i + 3] = 255; });
  pixels(cC, (x, y, d, i) => { const n = N.fbm(x / 16 + 3, y / 16, 3, S / 16, S / 16); const k = 0.82 + n * 0.3; d[i] = b[0] * k; d[i + 1] = b[1] * k * 0.98; d[i + 2] = b[2] * k * 0.96; d[i + 3] = 255; });
  return { map: colTex(cC), normalMap: dataTex(normalFromHeight(hC, 2.5 * bumps)) };
}
// 眼睛：虹膜 + 瞳孔，画在球面 UV 上（球面 u=0.25、v=0.5 那一点正对 +z）
export function genEye({ iris = '#7a4a1a', pupil = 0.45, sclera = '#e8dccb', irisR = 0.5, slit = false } = {}) {
  const W = 256, H = 128, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = sclera; ctx.fillRect(0, 0, W, H);
  const cxp = W * 0.25, cyp = H * 0.5;
  // 角度半径 → 像素：u 方向一圈 2π = W，v 方向 π = H
  const rx = (irisR / (2 * Math.PI)) * W, ry = (irisR / Math.PI) * H;
  const ic = rgb(iris);
  const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, rx);
  g.addColorStop(0, `rgb(${ic[0] * 0.6 | 0},${ic[1] * 0.6 | 0},${ic[2] * 0.6 | 0})`); g.addColorStop(0.55, iris); g.addColorStop(0.9, `rgb(${ic[0] * 0.55 | 0},${ic[1] * 0.55 | 0},${ic[2] * 0.55 | 0})`); g.addColorStop(1, '#120c08');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cxp, cyp, rx, ry, 0, 0, 6.28); ctx.fill();
  // 虹膜的放射纹
  ctx.strokeStyle = 'rgba(255,230,180,0.18)'; ctx.lineWidth = 0.7;
  for (let a = 0; a < 6.28; a += 0.18) { ctx.beginPath(); ctx.moveTo(cxp + Math.cos(a) * rx * 0.4, cyp + Math.sin(a) * ry * 0.4); ctx.lineTo(cxp + Math.cos(a) * rx * 0.92, cyp + Math.sin(a) * ry * 0.92); ctx.stroke(); }
  ctx.fillStyle = '#050403'; ctx.beginPath();
  if (slit) ctx.ellipse(cxp, cyp, rx * pupil * 1.3, ry * pupil * 0.45, 0, 0, 6.28);
  else ctx.ellipse(cxp, cyp, rx * pupil, ry * pupil, 0, 0, 6.28);
  ctx.fill();
  return toTex(c, { wrap: false });
}

// ================= 屏幕 =================
// 鸡们打的游戏：暗色调的写实第一人称射击（雨夜的街道、枪口火光、HUD）
export function drawGameScreenReal(c, t, { seed = 0, boss = false, off = false } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  if (off) { ctx.fillStyle = '#050606'; ctx.fillRect(0, 0, W, H); return; }
  const r = mulberry32(seed * 131 + 7);
  const sway = Math.sin(t * 1.3 + seed) * 6, bob = Math.sin(t * 7 + seed) * 1.5;
  // 天空 + 远处的楼
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, boss ? '#2a0e0a' : '#141c24'); sky.addColorStop(1, boss ? '#6a2a14' : '#3a4650');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0c1014';
  for (let k = 0; k < 9; k++) { const x = ((k * 43 + seed * 17 - t * 4 + sway) % (W + 60)) - 30, h = 30 + r() * 50; ctx.fillRect(x, H * 0.55 - h, 32 + r() * 20, h); }
  // 地面透视
  const gr = ctx.createLinearGradient(0, H * 0.55, 0, H); gr.addColorStop(0, '#1a1e20'); gr.addColorStop(1, '#2a2e2c');
  ctx.fillStyle = gr; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  ctx.strokeStyle = 'rgba(200,210,220,0.08)'; ctx.lineWidth = 1;
  for (let k = -6; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + sway, H * 0.55); ctx.lineTo(W / 2 + k * 60 + sway * 2, H); ctx.stroke(); }
  // 敌人（小小的人影）
  const ex = W * (0.55 + 0.25 * Math.sin(t * 0.7 + seed)), ey = H * 0.5;
  ctx.fillStyle = '#060808'; ctx.fillRect(ex - 3, ey - 14, 6, 16); ctx.beginPath(); ctx.arc(ex, ey - 17, 3.5, 0, 6.28); ctx.fill();
  // 枪（右下角）+ 枪口火光
  const fire = Math.sin(t * 22 + seed) > 0.55;
  ctx.fillStyle = '#16181a';
  ctx.beginPath(); ctx.moveTo(W * 0.62, H + 2); ctx.lineTo(W * 0.7 + sway * 0.3, H * 0.72 + bob); ctx.lineTo(W * 0.8 + sway * 0.3, H * 0.7 + bob); ctx.lineTo(W * 0.86, H + 2); ctx.fill();
  if (fire) { const fg = ctx.createRadialGradient(W * 0.72 + sway * 0.3, H * 0.7 + bob, 1, W * 0.72, H * 0.7, 26); fg.addColorStop(0, 'rgba(255,240,200,1)'); fg.addColorStop(0.3, 'rgba(255,170,60,0.8)'); fg.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = fg; ctx.fillRect(W * 0.6, H * 0.55, W * 0.25, H * 0.3); }
  // 雨
  ctx.strokeStyle = 'rgba(180,200,220,0.18)';
  for (let k = 0; k < 40; k++) { const x = (k * 37 + t * 20) % W, y = (k * 53 + t * 300) % H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 8); ctx.stroke(); }
  // 准星
  ctx.strokeStyle = 'rgba(220,240,230,0.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - 7, H / 2); ctx.lineTo(W / 2 - 2, H / 2); ctx.moveTo(W / 2 + 2, H / 2); ctx.lineTo(W / 2 + 7, H / 2); ctx.moveTo(W / 2, H / 2 - 7); ctx.lineTo(W / 2, H / 2 - 2); ctx.moveTo(W / 2, H / 2 + 2); ctx.lineTo(W / 2, H / 2 + 7); ctx.stroke();
  // HUD：血条、弹药、小地图、击杀提示
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(8, H - 22, 90, 12);
  ctx.fillStyle = '#c8d8c0'; ctx.fillRect(10, H - 20, 86 * (0.45 + 0.4 * Math.abs(Math.sin(t * 0.2 + seed))), 8);
  ctx.fillStyle = '#e8e8e0'; ctx.font = `600 13px ${SANS}`; ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(30 - ((t * 3 + seed * 5) % 30))} / 90`, W - 8, H - 10);
  ctx.strokeStyle = 'rgba(220,230,220,0.35)'; ctx.strokeRect(W - 58, 8, 50, 50);
  ctx.fillStyle = '#ff5a3a'; ctx.fillRect(W - 36 + Math.sin(t) * 10, 28 + Math.cos(t * 0.8) * 8, 3, 3);
  ctx.fillStyle = '#e8e8e0'; ctx.fillRect(W - 34, 32, 3, 3);
  ctx.textAlign = 'left'; ctx.font = `500 10px ${SANS}`;
  if (Math.sin(t * 0.5 + seed) > 0.3) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(8, 8, 118, 14); ctx.fillStyle = '#e8d8a8'; ctx.fillText(boss ? '⚠ 决赛圈 · 剩余 2 人' : `咯咯哒 ▸ 击倒了 敌人${(seed * 7 + Math.floor(t / 3)) % 99}`, 12, 19); }
  // 屏幕的一点点反光和暗角
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
// 马们刷的短视频：一条条往上滑（竖屏的实拍风格：大色块的"画面" + 字幕 + 右边一排按钮）
export function drawPhoneFeedReal(c, t, seed = 0) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  const slide = (t * 0.25 + seed * 0.37) % 1;
  const k = slide > 0.88 ? (slide - 0.88) / 0.12 : 0;
  const idx = Math.floor(t * 0.25 + seed * 0.37);
  const off = -k * k * (3 - 2 * k) * H;
  const scenes = [['#3a2a1a', '#d8a060'], ['#12202a', '#6ab0c8'], ['#1a2a12', '#a8c870'], ['#2a1418', '#e07a6a'], ['#20202a', '#c8c8e0']];
  for (let j = 0; j < 2; j++) {
    const s = scenes[(idx + j + seed) % scenes.length], y0 = off + j * H;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + H); g.addColorStop(0, s[1]); g.addColorStop(0.6, s[0]); g.addColorStop(1, '#050505');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(W / 2 + Math.sin(t * 2 + j) * 6, y0 + H * 0.5, W * 0.28, H * 0.2, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(6, y0 + H * 0.82, W * 0.55, 4); ctx.fillRect(6, y0 + H * 0.86, W * 0.4, 4);
    for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(W - 10, y0 + H * (0.55 + q * 0.09), 4, 0, 6.28); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(0, H - 2, W * ((t * 0.25 + seed * 0.37) % 1), 2);
}
