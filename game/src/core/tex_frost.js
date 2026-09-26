// 第四章贴图：冰封 211 —— 写实电影感（参考《冰汽时代》：末日寒潮里的蒸汽工业城市）
//   墙：下半截是铆钉铁板护墙、上半截是熏黑的红砖（冻出一层白霜的活儿交给着色器，见 world/frost.js）；
//   地板：旧木地板；天花板：木板 + 铁梁；窗户：一层厚厚的冰花，擦开之后才看得见外面；
//   窗外：暴风雪夜里的环形城市——陨石坑一样的大坑，中间立着一座巨大的蒸汽熔炉（Generator），一圈圈的木屋、蒸汽管、探照灯；
//   其他：宣传画（"城市必须存续"）、法典告示、压力表表盘、气动传送管里的纸条、打字机上的纸……
import * as THREE from 'three';
import { makeCanvas, toTex, createNoise, normalFromHeight, pixels, hexToRgb, SANS, HAND } from './textures.js';
import { mulberry32, clamp, smoothstep, lerp } from './util.js';

const rgb = (hex) => hexToRgb(hex);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dataTex = (c, rep = null) => { const t = toTex(c, { data: true }); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const colTex = (c, rep = null) => { const t = toTex(c); if (rep) t.repeat.set(rep[0], rep[1]); return t; };
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export const STENCIL = '"DIN Condensed","Arial Narrow","Oswald","Impact",sans-serif';

// 灰度高度 → 粗糙度
function roughFrom(h, base = 0.8, span = 0.25, extra = null) {
  const W = h.width, H = h.height, s = h.getContext('2d').getImageData(0, 0, W, H).data;
  const e = extra ? extra.getContext('2d').getImageData(0, 0, W, H).data : null;
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    let r = base + (s[i] / 255 - 0.5) * span;
    if (e) r = lerp(r, 0.35, e[i] / 255);
    const v = clamp(r, 0.05, 1) * 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  });
  return c;
}
// 三张 ImageData 一起写
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

// ================= 墙：铆钉铁板护墙 + 熏黑的红砖 =================
// 平铺 2m × 3m（和宿舍墙的世界坐标 UV 对得上）：256 像素 / 米；贴图最上面是 3m（天花板），最下面是地面
export function genFrostWall({ seed = 4101, W = 512, H = 768 } = {}) {
  const N = createNoise(seed);
  const T = triple(W, H);
  const PPM = 256;
  const railTop = H - 1.12 * PPM, railBot = H - 1.05 * PPM; // 护墙板上沿的木扶手
  const brickA = rgb('#6e3326'), brickB = rgb('#4a2419'), brickC = rgb('#7a4a36'), soot = rgb('#1e1814'), mortar = rgb('#8a8278');
  const iron = rgb('#3a3e42'), ironD = rgb('#23272b'), rust = rgb('#6a3a20'), rustL = rgb('#94552c');
  const rail = rgb('#3a2618'), railL = rgb('#5a3a22');
  const BW = 61, BH = 22; // 一块砖 + 灰缝（23cm × 7.5cm + 1cm 缝）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = x / W, v = y / H;
      const n = N.fbm(u * 8, v * 12, 4, 8, 12), nf = N.noise(x / 3, y / 3, W / 3, H / 3);
      if (y < railTop) {
        // ---- 红砖（顺砌，隔行错开半块）----
        const row = Math.floor(y / BH), off = row % 2 ? BW / 2 : 0;
        const col = Math.floor((x + off) / BW);
        const bx = (x + off) - col * BW, by = y - row * BH;
        const edge = Math.min(bx - 3, BW - bx, by - 3, BH - by);
        const isM = bx < 3 || by < 3;
        const hr = hash2(row * 7.1, ((col % Math.round(W / BW)) + Math.round(W / BW)) % Math.round(W / BW));
        let c, h;
        if (isM) {
          c = mix3(mortar, soot, 0.35 + n * 0.3);
          h = 0.18 + nf * 0.08;
        } else {
          c = hr < 0.33 ? brickA : hr < 0.66 ? brickB : brickC;
          c = mix3(c, soot, clamp(0.15 + (n - 0.5) * 0.7, 0, 0.7));
          // 砖面上的坑洼、碰掉的角
          const pit = smoothstep(0.62, 0.7, N.noise(x / 5 + hr * 40, y / 5, W / 5, H / 5));
          c = mix3(c, soot, pit * 0.4);
          h = 0.62 + (nf - 0.5) * 0.18 - pit * 0.25 + smoothstep(0, 3, edge) * 0.2;
        }
        // 越往上越黑（炉子的烟熏了几十年）
        const smoke = smoothstep(0.25, 0.0, v) * 0.55;
        c = mix3(c, soot, smoke);
        T.set(i, h, c, 0);
      } else if (y < railBot) {
        // ---- 木扶手 ----
        const g = N.fbm(u * 60, v * 4, 3, 60, 4);
        const k = (y - railTop) / (railBot - railTop);
        const c = mix3(rail, railL, g * 0.6 + Math.sin(k * Math.PI) * 0.25);
        T.set(i, 0.55 + Math.sin(k * Math.PI) * 0.35, c, 0);
      } else {
        // ---- 铆钉铁板：每块 50cm 宽，竖缝两边各一列铆钉，半腰一道横缝 ----
        const yw = (H - y) / PPM; // 离地高度（米）
        const px = x % 128, seamX = Math.min(px, 128 - px);
        const midY = Math.abs(yw - 0.52) * PPM;
        const seam = seamX < 2 || midY < 1.5;
        let rv = 0;
        for (const sx of [7, 121]) {
          const ry = ((yw * PPM) % 20) - 10;
          const d = Math.hypot(px - sx, ry);
          rv = Math.max(rv, smoothstep(4.2, 1.5, d));
        }
        for (const ry0 of [0.52 * PPM - 7, 0.52 * PPM + 7]) {
          const rx = (x % 20) - 10, d = Math.hypot(rx, yw * PPM - ry0);
          rv = Math.max(rv, smoothstep(4.2, 1.5, d));
        }
        let c = mix3(ironD, iron, 0.5 + (n - 0.5) * 0.9 + (nf - 0.5) * 0.15);
        // 锈：从铆钉和缝往下淌
        const streak = smoothstep(0.55, 0.85, N.fbm(u * 40, v * 3, 3, 40, 3)) * (0.4 + 0.6 * smoothstep(0.7, 1.0, v));
        const rustAmt = clamp(streak * 0.8 + rv * 0.4 + smoothstep(0.6, 0.8, n) * 0.5, 0, 1);
        c = mix3(c, mix3(rust, rustL, nf), rustAmt * 0.7);
        if (seam) c = mix3(c, soot, 0.7);
        // 墙根：踢脚的刮痕、煤灰
        c = mix3(c, soot, smoothstep(0.12, 0.0, yw) * 0.6);
        const h = seam ? 0.1 : 0.5 + (n - 0.5) * 0.12 + rv * 0.45 + (nf - 0.5) * 0.05;
        T.set(i, h, c, rustAmt * 0.3 + (seam ? 0.2 : 0));
      }
    }
  }
  T.put();
  // 砖墙上的几道裂缝
  const ctx = T.cC.getContext('2d'), rnd = mulberry32(seed + 7);
  ctx.strokeStyle = 'rgba(14,10,8,0.6)'; ctx.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    let x = rnd() * W, y = rnd() * railTop * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (rnd() - 0.5) * 14; y += 6 + rnd() * 8; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 5)), roughnessMap: dataTex(roughFrom(T.hC, 0.82, 0.25, T.xC)) };
}

// ================= 地板：旧木板（沿房间长边铺），缝里塞着煤灰 =================
// 1.2m × 1.2m 一张（地板材质 repeat 3 × 6）：8 条 15cm 宽的木板
export function genPlankFloor({ seed = 4111, W = 512, H = 512 } = {}) {
  const N = createNoise(seed), rnd = mulberry32(seed);
  const T = triple(W, H);
  const PW = W / 8;
  const joints = Array.from({ length: 8 }, () => [rnd() * H, rnd() * H * 0.5 + H * 0.5]);
  const tones = Array.from({ length: 8 }, () => rnd());
  const dark = rgb('#241a12'), mid = rgb('#4a3626'), light = rgb('#6e5238'), grime = rgb('#141110');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const p = Math.floor(x / PW), lx = x - p * PW;
    const gapX = Math.min(lx, PW - lx);
    let seg = 0, gapY = 99;
    for (const j of joints[p]) { const d = Math.abs(((y - j + H * 1.5) % H) - H / 2); gapY = Math.min(gapY, H / 2 - d); if (y > j) seg++; }
    const gy = Math.abs(gapY);
    const tone = hash2(p * 3.7 + seg, tones[p] * 10);
    const grain = N.fbm(lx / 6 + p * 13 + seg * 5, y / 90, 3, 64, 8);
    const ring = Math.sin(grain * 30 + lx * 0.15) * 0.5 + 0.5;
    let c = mix3(dark, mid, 0.35 + tone * 0.5 + (grain - 0.5) * 0.6);
    c = mix3(c, light, smoothstep(0.7, 1, ring) * 0.25 * tone);
    // 被踩了几十年：中间亮、边上脏
    const wear = N.fbm(x / 90, y / 90, 3, W / 90, H / 90);
    c = mix3(c, grime, clamp(0.45 - wear * 0.7, 0, 0.5));
    const isGap = gapX < 1.5 || gy < 1.2;
    if (isGap) c = grime;
    // 钉子
    let nail = 0;
    for (const j of joints[p]) for (const s of [-1, 1]) { const d = Math.hypot(lx - PW / 2 + s * 18, ((y - j + H * 1.5) % H) - H / 2 + 7); nail = Math.max(nail, smoothstep(3, 1.2, d)); }
    if (nail > 0) c = mix3(c, rgb('#5a5650'), nail);
    const h = isGap ? 0.05 : 0.55 + (grain - 0.5) * 0.15 + smoothstep(0, 4, Math.min(gapX, gy)) * 0.2 - (1 - wear) * 0.05 + nail * 0.1;
    T.set(i, h, c, isGap ? 0 : wear * 0.4);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 4)), roughnessMap: dataTex(roughFrom(T.hC, 0.78, 0.2)) };
}

// ================= 地上的雪、煤灰、脚印（覆盖整个房间地板的一张透明贴图）=================
// 画布坐标 → 世界：x = -1.8 + px / W * 3.6，z = -3.6 + py / H * 8.1（画布顶上是北边的窗）
export function genFloorSnow(W = 512, H = 1152) {
  const c = makeCanvas(W, H), N = createNoise(4121), rnd = mulberry32(4122);
  const wx = (px) => -1.8 + (px / W) * 3.6, wz = (py) => -3.6 + (py / H) * 8.1;
  pixels(c, (x, y, d, i) => {
    const X = wx(x), Z = wz(y);
    const n = N.fbm(x / 40, y / 40, 4, W / 40, H / 40), n2 = N.noise(x / 6, y / 6, W / 6, H / 6);
    let a = 0;
    // 墙根一圈积雪（缝里灌进来的）
    const wallD = Math.min(X + 1.8, 1.8 - X, Z + 3.6);
    a = Math.max(a, smoothstep(0.12 + n * 0.12, 0.0, wallD) * 0.85);
    // 窗下：一大片（窗缝漏风）
    a = Math.max(a, smoothstep(0.55 + n * 0.3, 0.0, Z + 3.6) * smoothstep(1.7, 1.0, Math.abs(X)) * 0.95);
    // 门缝底下吹进来的扇形雪
    const dz = Z - 4.01, dx = X + 1.8;
    const fan = smoothstep(0.9 + n * 0.4, 0.0, Math.hypot(dx * 0.9, dz * 1.4)) * smoothstep(-0.05, 0.1, dx);
    a = Math.max(a, fan * 0.95);
    // 零星的雪粒
    a = Math.max(a, smoothstep(0.82, 0.9, n2) * 0.35 * smoothstep(1.6, 0.4, Math.min(Z + 3.6, Math.abs(dz) + dx)));
    a *= 0.75 + n * 0.5;
    let col = mix3(rgb('#c9d4e2'), rgb('#eef3fa'), n2);
    // 暖炉周围：煤灰
    const sd = Math.hypot(X + 1.45, Z - 2.0);
    const coal = smoothstep(0.8 + n * 0.3, 0.2, sd) * 0.7;
    if (coal > a * 0.8) { col = mix3(rgb('#0e0c0b'), rgb('#2a2622'), n2); a = Math.max(a * 0.3, coal * (0.4 + n * 0.5)); }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = clamp(a, 0, 1) * 255;
  });
  // 室友们出门时留下的一串靴印：从床边一路走到门口
  const ctx = c.getContext('2d');
  const toPx = (X, Z) => [((X + 1.8) / 3.6) * W, ((Z + 3.6) / 8.1) * H];
  const path = [[-0.3, -2.2], [-0.2, -1.0], [-0.35, 0.3], [-0.5, 1.5], [-0.8, 2.6], [-1.35, 3.6], [-1.75, 3.95]];
  for (let who = 0; who < 3; who++) {
    const jit = (who - 1) * 0.12;
    let side = 1;
    for (let k = 0; k < path.length - 1; k++) {
      const [x0, z0] = path[k], [x1, z1] = path[k + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.floor(len / 0.34);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (let s = 0; s < steps; s++) {
        const t = s / steps, X = lerp(x0, x1, t) + Math.cos(ang) * 0.09 * side + jit, Z = lerp(z0, z1, t) - Math.sin(ang) * 0.09 * side;
        const [px, py] = toPx(X, Z);
        ctx.save(); ctx.translate(px, py); ctx.rotate(-ang);
        ctx.fillStyle = `rgba(${150 + rnd() * 20},${160 + rnd() * 20},${176 + rnd() * 20},${0.25 + rnd() * 0.12})`;
        ctx.beginPath(); ctx.ellipse(0, -3, 3.4, 5.5, 0, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 5, 3, 3.2, 0, 0, 6.28); ctx.fill();
        ctx.restore();
        side = -side;
      }
    }
  }
  return toTex(c, { wrap: false });
}

// ================= 天花板：木板 + 霜 =================
export function genFrostCeiling({ seed = 4131, S = 256 } = {}) {
  const N = createNoise(seed);
  const T = triple(S, S);
  const PW = S / 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const p = Math.floor(y / PW), ly = y - p * PW, gap = Math.min(ly, PW - ly) < 1.2;
    const g = N.fbm(x / 70 + p * 7, ly / 5, 3, S / 70, 8);
    let c = mix3(rgb('#1c1612'), rgb('#3a2c20'), 0.3 + g * 0.6 + hash2(p, 3) * 0.2);
    if (gap) c = rgb('#0c0a08');
    T.set(i, gap ? 0.1 : 0.5 + g * 0.3, c, 0);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 3)) };
}

// ================= 旧东西受冻：去饱和、偏冷、压暗，蒙一层细细的霜点 =================
export function chill(src, { seed = 1, dark = 0.72, cold = 0.12, rime = 10, wrap = true, repeat = null } = {}) {
  const img = src.image || src, W = img.width, H = img.height;
  const c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(seed * 23 + 5);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    p[i] = lerp(p[i], l, 0.45) * (dark - cold * 0.3); p[i + 1] = lerp(p[i + 1], l, 0.45) * dark; p[i + 2] = lerp(p[i + 2], l, 0.45) * (dark + cold * 0.4);
  }
  ctx.putImageData(d, 0, 0);
  for (let k = 0; k < rime * 30; k++) {
    ctx.fillStyle = `rgba(${210 + rnd() * 30},${220 + rnd() * 30},${240},${0.08 + rnd() * 0.2})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.6, 0, 6.28); ctx.fill();
  }
  const t = toTex(c, { wrap });
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  else if (src.repeat) t.repeat.copy(src.repeat);
  return t;
}

// ================= 窗户上的冰花（带透明）=================
// 冰花从窗框四周往中间长：一根根羽毛一样的枝晶。返回 canvas（窗户"擦一擦"要在上面挖洞）
export function drawIceFerns(c, { seed = 4141 } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d'), rnd = mulberry32(seed), N = createNoise(seed);
  ctx.clearRect(0, 0, W, H);
  // 底子：一层磨砂的白霜，四边厚、中间薄一点（但整块都看不透）
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const e = Math.min(u, 1 - u, v * 1.3, (1 - v) * 1.1);
    const n = N.fbm(u * 6, v * 4, 4, 6, 4), n2 = N.noise(x / 2.5, y / 2.5, W / 2.5, H / 2.5);
    const a = clamp(0.9 + smoothstep(0.25, 0.0, e) * 0.1 + (n - 0.5) * 0.14 + (n2 - 0.5) * 0.06, 0, 1);
    const w = 200 + n * 40 + n2 * 15;
    d[i] = w * 0.92; d[i + 1] = w * 0.96; d[i + 2] = Math.min(255, w * 1.04); d[i + 3] = a * 255;
  });
  // 枝晶：从边上往里长，主干上两边斜着长出细枝
  const branch = (x, y, ang, len, w, depth) => {
    const steps = Math.max(3, Math.floor(len / 5));
    let px = x, py = y, a = ang;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(px, py);
    const pts = [];
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 0.18;
      px += Math.cos(a) * 5; py += Math.sin(a) * 5;
      ctx.lineTo(px, py); pts.push([px, py, a]);
    }
    ctx.stroke();
    if (depth <= 0) return;
    for (let k = 1; k < pts.length; k += 2) {
      const [bx, by, ba] = pts[k], fall = 1 - k / pts.length;
      for (const s of [-1, 1]) if (rnd() < 0.85) branch(bx, by, ba + s * (0.9 + rnd() * 0.3), len * (0.18 + rnd() * 0.22) * fall + 3, Math.max(0.5, w * 0.6), depth - 1);
    }
  };
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    const side = Math.floor(rnd() * 4);
    let x, y, a;
    if (side === 0) { x = rnd() * W; y = H; a = -Math.PI / 2; }
    else if (side === 1) { x = rnd() * W; y = 0; a = Math.PI / 2; }
    else if (side === 2) { x = 0; y = rnd() * H; a = 0; }
    else { x = W; y = rnd() * H; a = Math.PI; }
    a += (rnd() - 0.5) * 1.2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.35})`;
    branch(x, y, a, 60 + rnd() * 140, 1.8 + rnd() * 1.2, 2);
  }
  // 星星点点的冰晶
  for (let k = 0; k < 1400; k++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`; ctx.fillRect(rnd() * W, rnd() * H, 1, 1); }
  return c;
}

// 穿衣镜上结的霜（中间薄四周厚，暖炉烧起来之后慢慢化掉）
export function genMirrorFrost() {
  const c = makeCanvas(128, 512);
  drawIceFerns(c, { seed: 4151 });
  return toTex(c, { wrap: false });
}

// ================= 窗外：暴风雪夜的天空（远处一圈陨石坑的坑壁剪影）=================
export function genStormSky(W = 1024, H = 512) {
  const c = makeCanvas(W, H), N = createNoise(4161);
  pixels(c, (x, y, d, i) => {
    const u = x / W, v = y / H;
    const n = N.fbm(u * 5, v * 3, 5, 5, 3), n2 = N.fbm(u * 14 + 3, v * 7, 3, 14, 7);
    // 天：上面几乎是黑的蓝灰，往地平线亮一点
    let col = mix3(rgb('#0a0f16'), rgb('#3a4656'), smoothstep(0.0, 0.85, v));
    // 云：一层层压下来的暴风雪云
    col = mix3(col, rgb('#56647a'), smoothstep(0.45, 0.8, n) * 0.35 * smoothstep(0.1, 0.7, v));
    col = mix3(col, rgb('#1a2230'), smoothstep(0.55, 0.3, n2) * 0.3);
    // 熔炉的光把正中间那一片云底照成橘色
    const g = Math.exp(-(((u - 0.52) * 3.2) ** 2) - (((v - 0.78) * 2.6) ** 2));
    col = mix3(col, rgb('#c8702a'), g * (0.45 + n * 0.3));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  return toTex(c, { wrap: false });
}
// 远处的坑壁：一圈落满雪的悬崖剪影，上面零星几点灯火（带透明）
export function genCraterRim(W = 1024, H = 256, { seed = 4171, lights = 40 } = {}) {
  const c = makeCanvas(W, H), N = createNoise(seed), rnd = mulberry32(seed);
  const top = new Float32Array(W);
  for (let x = 0; x < W; x++) top[x] = H * (0.25 + N.fbm(x / 180, 0.5, 5, W / 180, 2) * 0.45);
  pixels(c, (x, y, d, i) => {
    const t = top[x];
    if (y < t) { d[i + 3] = 0; return; }
    const k = (y - t) / (H - t + 1);
    const n = N.fbm(x / 20, y / 20, 3, W / 20, H / 20);
    const snow = smoothstep(0.45, 0.65, n + (1 - k) * 0.3);
    const col = mix3(rgb('#10151c'), rgb('#56647a'), snow * (0.6 - k * 0.4));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255 * smoothstep(0, 3, y - t);
  });
  const ctx = c.getContext('2d');
  for (let k = 0; k < lights; k++) {
    const x = rnd() * W, y = top[Math.floor(x)] + 6 + rnd() * (H - top[Math.floor(x)]) * 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 5);
    g.addColorStop(0, 'rgba(255,190,110,0.9)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 5, y - 5, 10, 10);
  }
  return toTex(c, { wrap: false });
}

// 雪花（一层层往下飘、被风斜着吹）：可平铺，带透明
export function genSnowFlakes({ seed = 4181, S = 512, n = 520, r = [0.6, 2.6] } = {}) {
  const c = makeCanvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed);
  ctx.clearRect(0, 0, S, S);
  for (let k = 0; k < n; k++) {
    const x = rnd() * S, y = rnd() * S, rr = lerp(r[0], r[1], rnd() ** 2.2), a = 0.35 + rnd() * 0.6;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr * 1.6);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(240,246,255,${a * 0.6})`); g.addColorStop(1, 'rgba(240,246,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x + ox - rr * 2, y + oy - rr * 2, rr * 4, rr * 4);
    }
  }
  return toTex(c);
}

// 城里一座座小木屋的屋面（给实例化的房子用）：木板墙 + 一扇亮着暖光的小窗 → 顶点色之外再乘这张
export function genHutFace() {
  const W = 128, H = 128, c = makeCanvas(W, H), N = createNoise(4191);
  pixels(c, (x, y, d, i) => {
    const plank = (Math.floor(y / 12) % 2) * 0.08;
    const n = N.fbm(x / 30, y / 6, 3, W / 30, H / 6);
    const v = 60 + n * 40 - plank * 100;
    d[i] = v * 0.95; d[i + 1] = v * 0.85; d[i + 2] = v * 0.75; d[i + 3] = 255;
  });
  return toTex(c);
}

// 烟 / 蒸汽团（一团柔和的、带一点噪声的白）
export function genPuff(S = 128, seed = 4195) {
  const c = makeCanvas(S, S), N = createNoise(seed);
  pixels(c, (x, y, d, i) => {
    const u = x / S - 0.5, v = y / S - 0.5, r = Math.hypot(u, v) * 2;
    const n = N.fbm(x / 20, y / 20, 4, S / 20, S / 20);
    const a = clamp((1 - r) * 1.4 - 0.25 + (n - 0.5) * 0.8, 0, 1);
    d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * a * 255;
  });
  return toTex(c, { wrap: false });
}

// 一束光（探照灯的光柱）：竖着的渐变
export function genBeam() {
  const W = 64, H = 256, c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const u = Math.abs(x / W - 0.5) * 2, v = y / H;
    const a = Math.pow(1 - u, 2.2) * Math.pow(1 - v, 1.3) * smoothstep(0, 0.05, v);
    d[i] = 255; d[i + 1] = 244; d[i + 2] = 220; d[i + 3] = a * 255;
  });
  return toTex(c, { wrap: false });
}

// 柔和的光晕点（熔炉的光、灯）
export function genGlow(S = 128, inner = [255, 200, 120]) {
  const c = makeCanvas(S, S);
  pixels(c, (x, y, d, i) => {
    const r = Math.hypot(x / S - 0.5, y / S - 0.5) * 2;
    const a = Math.pow(clamp(1 - r, 0, 1), 2.2);
    d[i] = inner[0]; d[i + 1] = inner[1]; d[i + 2] = inner[2]; d[i + 3] = a * 255;
  });
  return toTex(c, { wrap: false });
}

// ================= 墙上的宣传画 / 告示（印刷品，冻得发脆、边角结霜）=================
export function genFrostPoster(kind) {
  const W = 256, H = 364, c = makeCanvas(W, H), ctx = c.getContext('2d'), rnd = mulberry32(kind.length * 131 + 7);
  const cx = W / 2;
  const paper = (a, b) => { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  if (kind === 'survive') {
    // 城市必须存续：红黑两色的宣传画，中间一座熔炉，底下一圈人
    paper('#c8b89a', '#a89878');
    ctx.fillStyle = '#8a1e14'; ctx.fillRect(0, 0, W, H * 0.62);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 18; k++) { ctx.save(); ctx.translate(cx, H * 0.5); ctx.rotate((k / 18) * Math.PI * 2); ctx.fillRect(-4, 0, 8, H); ctx.restore(); }
    ctx.fillStyle = '#16100c';
    ctx.fillRect(cx - 26, H * 0.2, 52, H * 0.34); ctx.fillRect(cx - 40, H * 0.5, 80, 12); ctx.fillRect(cx - 10, H * 0.08, 20, H * 0.14);
    for (const s of [-1, 1]) ctx.fillRect(cx + s * 36 - 5, H * 0.28, 10, H * 0.24);
    ctx.fillStyle = '#f0a040'; ctx.beginPath(); ctx.arc(cx, H * 0.38, 14, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#16100c';
    for (let k = 0; k < 9; k++) { const x = 20 + k * 27; ctx.beginPath(); ctx.arc(x, H * 0.58, 9, 0, 6.28); ctx.fill(); ctx.fillRect(x - 10, H * 0.58, 20, 22); }
    ctx.fillStyle = '#16100c'; ctx.textAlign = 'center';
    ctx.font = `900 34px ${SANS}`; ctx.fillText('城市必须存续', cx, H * 0.76);
    ctx.font = `700 13px ${STENCIL}`; ctx.fillText('THE CITY MUST SURVIVE', cx, H * 0.84);
    ctx.fillStyle = '#8a1e14'; ctx.font = `600 12px ${SANS}`; ctx.fillText('— 熔炉不灭，希望不灭 —', cx, H * 0.91);
  } else if (kind === 'law') {
    // 法典告示：密密麻麻的条文，盖着红章
    paper('#d8ccb0', '#b8aa8a');
    ctx.fillStyle = '#1c1612'; ctx.textAlign = 'center';
    ctx.font = `900 30px ${SANS}`; ctx.fillText('法　典', cx, 44);
    ctx.font = `600 11px ${STENCIL}`; ctx.fillText('BOOK OF LAWS · 第 211 号住所', cx, 62);
    ctx.fillRect(22, 72, W - 44, 2);
    ctx.textAlign = 'left'; ctx.font = `600 13px ${SANS}`;
    const lines = ['第 1 条　熔炉不得熄灭。', '第 7 条　每户每夜配给煤炭一箱。', '第 19 条　汤里可加锯末，管饱。', '第 42 条　自动机归全体住户所有，', '　　　　　不得拆卖零件。', '第 211 条　宿舍必须按时熄灯；', '　　　　　打排位不得超过凌晨三点。', '第 212 条　禁止在暖炉上烤袜子。'];
    lines.forEach((t, k) => ctx.fillText(t, 26, 98 + k * 26));
    ctx.strokeStyle = 'rgba(160,30,20,0.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W - 64, H - 64, 34, 0, 6.28); ctx.stroke();
    ctx.fillStyle = 'rgba(160,30,20,0.85)'; ctx.font = `900 16px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('议会', W - 64, H - 58);
  } else if (kind === 'coal') {
    // 节约煤炭：一铲煤 + 大字
    paper('#2a3038', '#14181c');
    ctx.fillStyle = '#e8a040';
    ctx.beginPath(); ctx.moveTo(cx - 70, H * 0.5); ctx.lineTo(cx + 40, H * 0.2); ctx.lineTo(cx + 60, H * 0.28); ctx.lineTo(cx - 50, H * 0.58); ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.arc(cx + 20 + (rnd() - 0.5) * 50, H * 0.22 + (rnd() - 0.5) * 30, 8 + rnd() * 8, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center';
    ctx.font = `900 36px ${SANS}`; ctx.fillText('节约煤炭', cx, H * 0.74);
    ctx.fillStyle = '#e8a040'; ctx.font = `700 14px ${SANS}`; ctx.fillText('一块煤 = 一个温暖的夜', cx, H * 0.83);
    ctx.font = `600 11px ${STENCIL}`; ctx.fillText('COAL IS LIFE', cx, H * 0.9);
  } else if (kind === 'automaton') {
    // 自动机的招工广告
    paper('#c8b890', '#a89870');
    ctx.fillStyle = '#1c1612'; ctx.textAlign = 'center';
    ctx.font = `900 26px ${SANS}`; ctx.fillText('自动机', cx, 40);
    ctx.font = `600 11px ${STENCIL}`; ctx.fillText('AUTOMATON · STEAM-POWERED LABOR', cx, 58);
    ctx.strokeStyle = '#1c1612'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, 120, 22, 0, 6.28); ctx.stroke();
    ctx.strokeRect(cx - 36, 146, 72, 92);
    ctx.beginPath(); ctx.moveTo(cx - 36, 160); ctx.lineTo(cx - 70, 220); ctx.moveTo(cx + 36, 160); ctx.lineTo(cx + 70, 220); ctx.moveTo(cx - 20, 238); ctx.lineTo(cx - 24, 300); ctx.moveTo(cx + 20, 238); ctx.lineTo(cx + 24, 300); ctx.stroke();
    ctx.fillStyle = '#c86a20'; ctx.beginPath(); ctx.arc(cx, 120, 9, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1c1612'; ctx.font = `700 13px ${SANS}`;
    ctx.fillText('不吃、不睡、不怕冷', cx, 322); ctx.fillText('（冻住了除外）', cx, 342);
  }
  // 冻得发脆：边角结霜、一道道折痕、钉子
  const N = createNoise(kind.length * 17 + 3), d = ctx.getImageData(0, 0, W, H), p = d.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - x, y, H - y) / 40;
    const f = clamp((1 - e) * 0.9 + (N.fbm(x / 16, y / 16, 3, W / 16, H / 16) - 0.55) * 1.4, 0, 1) * 0.75;
    const i = (y * W + x) * 4;
    p[i] = lerp(p[i], 226, f); p[i + 1] = lerp(p[i + 1], 234, f); p[i + 2] = lerp(p[i + 2], 244, f);
  }
  ctx.putImageData(d, 0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const y = rnd() * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + (rnd() - 0.5) * 20); ctx.stroke(); }
  ctx.fillStyle = '#3a3632';
  for (const [x, y] of [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.28); ctx.fill(); }
  return toTex(c, { wrap: false });
}

// ================= 压力表的表盘：0–9，指针落在"❄"那一格就是没压力 =================
// 刻度从 -135° 走到 +135°：❄ 在最左边，然后 0、1……9
export function drawGaugeFace(c, { label = 'PSI ×10', red = 8.5 } = {}) {
  const S = c.width, ctx = c.getContext('2d'), cx = S / 2, cy = S / 2, R = S * 0.46;
  const g = ctx.createRadialGradient(cx, cy - S * 0.1, S * 0.05, cx, cy, R);
  g.addColorStop(0, '#f2ead6'); g.addColorStop(1, '#c8bc9c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fill();
  ctx.strokeStyle = '#2a2016'; ctx.lineWidth = S * 0.012; ctx.stroke();
  const ang = (v) => (-135 + ((v + 1) / 10.5) * 270) * (Math.PI / 180) - Math.PI / 2;
  // 红区
  ctx.strokeStyle = 'rgba(170,30,20,0.85)'; ctx.lineWidth = S * 0.05;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, ang(red), ang(9.5)); ctx.stroke();
  // 蓝色的"冻住"区
  ctx.strokeStyle = 'rgba(60,110,170,0.8)';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, ang(-1.5), ang(-0.5)); ctx.stroke();
  ctx.fillStyle = '#1c150e'; ctx.strokeStyle = '#1c150e';
  for (let v = -1; v <= 9.5; v += 0.5) {
    const a = ang(v), major = Number.isInteger(v);
    const r0 = R * (major ? 0.68 : 0.74), r1 = R * 0.86;
    ctx.lineWidth = major ? S * 0.014 : S * 0.007;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    if (major) {
      ctx.font = `700 ${S * 0.1}px ${STENCIL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(v < 0 ? '❄' : String(v), cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52);
    }
  }
  ctx.font = `600 ${S * 0.055}px ${STENCIL}`; ctx.fillText(label, cx, cy + R * 0.42);
  ctx.font = `700 ${S * 0.06}px ${SANS}`; ctx.fillText('211', cx, cy - R * 0.32);
  return { angleOf: (v) => -((-135 + ((v + 1) / 10.5) * 270) * (Math.PI / 180)) };
}

// ================= 纸条 / 打字机上的纸 =================
export function drawTubeNote(c, lines, { sig = '' } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#e6dcc2'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(120,100,60,0.12)'; for (let y = 22; y < H; y += 22) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = '#2a2018'; ctx.font = `600 20px ${HAND}`; ctx.textAlign = 'left';
  lines.forEach((t, k) => ctx.fillText(t, 14, 30 + k * 26));
  if (sig) { ctx.textAlign = 'right'; ctx.fillText(sig, W - 14, H - 14); }
}
export function drawTypewriterPaper(c, lines, { cursor = false } = {}) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.fillStyle = '#ece4d0'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.2, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a1612'; ctx.font = `700 ${Math.round(H / 11)}px "Courier New", Courier, monospace`; ctx.textAlign = 'left';
  lines.forEach((t, k) => ctx.fillText(t, W * 0.08, H * 0.2 + k * (H / 8)));
  if (cursor) ctx.fillRect(W * 0.08 + ctx.measureText(lines[lines.length - 1] || '').width + 2, H * 0.2 + (lines.length - 1) * (H / 8) - H / 14, H / 20, H / 13);
}

// 自动机外壳：黄铜 / 铸铁的钣金，铆钉、焊缝、磨亮的边
export function genBrassPlate({ seed = 4201, S = 256, base = '#8a6a3a' } = {}) {
  const N = createNoise(seed);
  const T = triple(S, S);
  const b = rgb(base), d = mix3(b, [20, 16, 12], 0.6), l = mix3(b, [255, 230, 170], 0.35);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = N.fbm(x / 30, y / 30, 4, S / 30, S / 30), n2 = N.noise(x / 3, y / 3, S / 3, S / 3);
    const px = x % 64, py = y % 64;
    const rv = Math.max(smoothstep(4, 1.6, Math.hypot(px - 6, py - 6)), smoothstep(4, 1.6, Math.hypot(px - 58, py - 6)), smoothstep(4, 1.6, Math.hypot(px - 6, py - 58)), smoothstep(4, 1.6, Math.hypot(px - 58, py - 58)));
    const seam = Math.min(px, 64 - px, py, 64 - py) < 1.2;
    let c = mix3(d, b, 0.4 + n * 0.8);
    c = mix3(c, l, smoothstep(0.7, 0.95, n2) * 0.25 + rv * 0.5);
    c = mix3(c, [24, 20, 16], smoothstep(0.62, 0.8, N.fbm(x / 12 + 9, y / 50, 3, S / 12, S / 50)) * 0.5);
    if (seam) c = mix3(c, [16, 12, 10], 0.7);
    T.set(i, seam ? 0.1 : 0.5 + (n - 0.5) * 0.1 + rv * 0.45, c, 0);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 4)), roughnessMap: dataTex(roughFrom(T.hC, 0.45, 0.3)) };
}

// 熔炉塔身的铁皮（给窗外那座大熔炉用，一大片横竖的钢板、铆钉带、锈）
export function genGeneratorSkin({ seed = 4211, W = 512, H = 512 } = {}) {
  const N = createNoise(seed);
  const c = makeCanvas(W, H);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 60, y / 60, 4, W / 60, H / 60), n2 = N.noise(x / 4, y / 4, W / 4, H / 4);
    const band = (y % 64) < 5 ? 1 : 0, rib = (x % 128) < 6 ? 1 : 0;
    let col = mix3(rgb('#1a1a1c'), rgb('#3a3634'), 0.3 + n * 0.7);
    col = mix3(col, rgb('#5a3420'), smoothstep(0.6, 0.85, N.fbm(x / 30, y / 120, 3, W / 30, H / 120)) * 0.5);
    if (band || rib) col = mix3(col, rgb('#0c0c0c'), 0.6);
    col = mix3(col, [col[0] * 1.2, col[1] * 1.2, col[2] * 1.2], n2 * 0.2);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  return toTex(c);
}

// 洗手间窗外（往南看）：大雪里的一片荒原 + 远处坑壁上的城市灯火 + 一根冒着蒸汽的烟囱
export function genSnowBackdrop() {
  const W = 1024, H = 512, c = makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.drawImage(genStormSky(W, H).image, 0, 0);
  ctx.drawImage(genCraterRim(W, 256, { seed: 4221, lights: 60 }).image, 0, H - 256);
  return toTex(c, { wrap: false });
}
export function genSnowGround() {
  const c = makeCanvas(512, 512), N = createNoise(4231);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 60, y / 60, 5, 512 / 60, 512 / 60), n2 = N.noise(x / 3, y / 3, 512 / 3, 512 / 3);
    const col = mix3(rgb('#3a4454'), rgb('#7a8698'), n * 0.8 + n2 * 0.15);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  return toTex(c);
}

// 积雪的表面（给雪堆、窗台上的雪用）：细细的颗粒 + 一点起伏
export function genSnowSurface({ seed = 4241, S = 256 } = {}) {
  const N = createNoise(seed);
  const T = triple(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const n = N.fbm(x / 40, y / 40, 4, S / 40, S / 40), n2 = N.noise(x / 1.5, y / 1.5, S / 1.5, S / 1.5);
    const v = 222 + n * 26 + (n2 - 0.5) * 20;
    T.set(i, n * 0.8 + n2 * 0.2, [v * 0.93, v * 0.96, Math.min(255, v * 1.03)], 0);
  }
  T.put();
  return { map: colTex(T.cC), normalMap: dataTex(normalFromHeight(T.hC, 2.2)), roughnessMap: dataTex(roughFrom(T.hC, 0.75, 0.3)) };
}

// 毛皮褥子（驯鹿 / 狼皮）
export function genPelt({ seed = 4251, base = '#8a7a66' } = {}) {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), rnd = mulberry32(seed), N = createNoise(seed);
  pixels(c, (x, y, d, i) => {
    const n = N.fbm(x / 30, y / 30, 4, S / 30, S / 30);
    const b = rgb(base), col = mix3(mix3(b, [30, 24, 18], 0.5), mix3(b, [240, 230, 210], 0.3), n);
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  });
  for (let k = 0; k < 6000; k++) {
    const x = rnd() * S, y = rnd() * S, a = Math.PI / 2 + (rnd() - 0.5) * 0.8 + Math.sin(x / 30) * 0.3, len = 5 + rnd() * 9;
    const l = rnd();
    ctx.strokeStyle = l < 0.5 ? `rgba(20,16,12,${0.25 + rnd() * 0.25})` : `rgba(230,220,200,${0.18 + rnd() * 0.2})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  return toTex(c);
}
