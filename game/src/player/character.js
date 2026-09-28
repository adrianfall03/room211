// 主角：根据照片"捏"出来的程序化 3D 人物 + 程序化骨骼动画
// 特征：瘦高、短碎发（两侧推短渐变）、浓眉、笑起来眼睛眯成月牙+露齿大笑、深色牛仔夹克、黑色牛仔裤、灰白运动鞋
// 可以换的另一个主角（jigo，见 heroes.js）也是这里捏的：outfit 'shorts' 光膀子 + 扎染大裤衩 + 光脚，pose 'crotch' 两只手从裤腰前面插进裤裆里
// 第三个主角 neptune：outfit 'sport' 黑色长袖运动衫 + 灰运动裤、湿漉漉的刺猬头（HAIR.spiky），左手攥着一罐饮料，signature 'pour' 一"笑"就举过头顶往自己头上浇、哇地哭出来
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../core/textures.js';
import { mulberry32, lerp, clamp, smoothstep, gauss } from '../core/util.js';

// ---------------- 头部造型 ----------------
const HX = 0.073, HY = 0.109, HZ = 0.094;
// 脸型：jaw 下半张脸往里收多少（越大下巴越尖、脸越瘦长）、chin 下巴往前翘、drop 下巴往下拉长、
//   cheek 颧骨往外鼓、long 整个下半张脸拉长（嘴以下）、full 腮帮子肉嘟嘟往外鼓（胖一点的脸）。默认是 bingo 的脸
export const FACE = { jaw: 0.3, chin: 0.14, drop: 0.007, cheek: 0.006, long: 0, full: 0 };
function headShape(d, out, F = FACE) {
  const up = d.y;
  let x = d.x * HX, y = d.y * HY, z = d.z * HZ;
  const low = smoothstep(-0.05, -0.95, up);
  x *= 1 - F.jaw * low;
  y *= 1 + F.long * low;
  if (d.z > 0) z *= 1 - 0.1 * low + F.chin * gauss(up, -0.82, 0.16);
  else z *= 1 - 0.42 * low;
  y -= F.drop * gauss(up, -0.92, 0.22) * Math.max(0, d.z + 0.2);
  x += Math.sign(d.x) * F.cheek * gauss(up, -0.08, 0.2) * gauss(Math.abs(d.x), 0.68, 0.22) * Math.max(0, d.z + 0.3);
  if (F.full) x += Math.sign(d.x) * F.full * gauss(up, -0.45, 0.28) * gauss(Math.abs(d.x), 0.75, 0.35) * Math.max(0, d.z + 0.4);
  z += 0.006 * gauss(up, 0.26, 0.09) * Math.max(0, d.z) * gauss(d.x, 0, 0.45);
  z -= 0.0045 * gauss(up, 0.08, 0.08) * gauss(Math.abs(d.x), 0.36, 0.13) * Math.max(0, d.z);
  z -= 0.008 * gauss(up, 0.28, 0.33) * Math.max(0, -d.z);
  x *= 1 - 0.05 * gauss(up, 0.4, 0.2);
  z *= 1 - 0.035 * gauss(up, 0.55, 0.2) * Math.max(0, d.z);
  return out.set(x, y, z);
}

function buildHeadGeometry(F = FACE) {
  const g = new THREE.SphereGeometry(1, 72, 56);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const d = new THREE.Vector3(), o = new THREE.Vector3();
  let yTop = -1, yBot = 1;
  const origU = [];
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    headShape(d, o, F);
    p.setXYZ(i, o.x, o.y, o.z);
    yTop = Math.max(yTop, o.y); yBot = Math.min(yBot, o.y);
    origU.push(uv.getX(i));
  }
  for (let i = 0; i < p.count; i++) uv.setXY(i, origU[i], (p.getY(i) - yBot) / (yTop - yBot));
  g.computeVertexNormals();
  return { geo: g, yTop, yBot };
}

// 发型参数：cap 发际线（正前的极角 / 两侧再往下 / 后脑再往下）、thick 头顶厚度、edge 发际线处的厚度（背头那种一刀切）、
//   front 前额那一撮的隆起、ripple 发片起伏；n / len / rad 发束的数量、长度、粗细，lift 翘起（基础 / 前额额外）、
//   sweep 梳的方向（头部坐标：x 往左、y 往上、z 往前）、side 两侧往外撇、jit 乱度，buzz 两侧推短处发茬的浓淡，
//   ride 发束跟着前额那一撮一起抬高多少，burn 鬓角往下留多长（默认 1），
//   heap / heapAt 头发往一边堆起来的厚度和方位角（分头：一边高高堆起，另一边压下去），
//   hat 戴帽子（头盔、毛线帽、军帽）时帽子放大多少——头发蓬的人帽子要大一号，不然头发从帽顶戳出来
export const HAIR = {
  // 主角：短碎发，两侧推短
  crop: { cap: [1.0, 0.2, 0.26], thick: 0.02, edge: 0, front: 0.006, ripple: 0.003, n: 340, len: [0.011, 0.012], rad: [0.009, 0.008], lift: [0.16, 0.34], sweep: [0, 0.25, 1], side: 0.25, jit: [0.35, 0.2], buzz: 1, seed: 17 },
  // 侧分往一边梳过去，前额那一撮高高隆起，两侧推短
  quiff: { cap: [0.98, 0.18, 0.26], thick: 0.022, edge: 0.001, front: 0.022, ripple: 0.001, n: 170, len: [0.016, 0.01], rad: [0.012, 0.006], lift: [0.1, 0.16], sweep: [-0.8, 0.45, 0.4], side: 0.05, jit: [0.08, 0.06], buzz: 0.85, ride: 0.7, seed: 23 },
  // 干净的短发：顶上有点量，往一侧带
  neat: { cap: [0.98, 0.16, 0.26], thick: 0.019, edge: 0, front: 0.011, ripple: 0.0015, n: 300, len: [0.013, 0.01], rad: [0.01, 0.007], lift: [0.26, 0.26], sweep: [-0.45, 0.4, 0.7], side: 0.15, jit: [0.2, 0.15], buzz: 0.9, ride: 0.7, seed: 29 },
  // 两侧和后脑剃得很短，只留头顶一片往后梳
  undercut: { cap: [0.98, -0.04, 0.14], thick: 0.02, edge: 0.006, front: 0.012, ripple: 0.0015, n: 220, len: [0.022, 0.014], rad: [0.011, 0.007], lift: [0.08, 0.14], sweep: [0.3, 0.3, -1], side: 0.1, jit: [0.15, 0.1], buzz: 0.6, ride: 0.7, seed: 31 },
  // 蓬松的厚刘海，盖住额头和耳朵上沿
  mop: { cap: [1.2, 0.14, 0.3], thick: 0.03, edge: 0.004, front: 0.004, ripple: 0.004, n: 460, len: [0.018, 0.016], rad: [0.011, 0.009], lift: [0.08, 0.1], sweep: [0, -0.8, 0.45], side: 0.35, jit: [0.5, 0.3], buzz: 1, ride: 0.7, seed: 37 },
  // jigo（涂鸦）：头顶一大蓬，刘海斜着扫向一边、盖住半个额头，两侧推短
  //   涂鸦上头发往右边（他自己的右手边）高高堆起一大蓬，再朝另一边扫过去
  fringe: { cap: [1.1, 0.18, 0.26], thick: 0.03, edge: 0.002, front: 0.016, ripple: 0.002, n: 280, len: [0.017, 0.01], rad: [0.013, 0.007], lift: [0.02, 0.05], sweep: [0.85, -0.2, 0.6], side: 0.12, jit: [0.1, 0.06], buzz: 0.85, burn: 0.3, ride: 0.8, heap: 0.016, heapAt: -0.75, hat: 1.1, seed: 41 },
  // neptune（照片上刚把一罐水浇在头上）：短短的刺猬头，湿了以后一撮一撮往上支棱，乱七八糟；两侧推短
  spiky: { cap: [1.0, 0.2, 0.26], thick: 0.016, edge: 0, front: 0.005, ripple: 0.003, n: 480, len: [0.014, 0.013], rad: [0.0072, 0.005], lift: [0.5, 0.3], sweep: [0, 1, 0.35], side: 0.35, jit: [0.75, 0.55], buzz: 0.9, ride: 0.5, hat: 1.05, seed: 43 },
  wetCrop: { cap: [0.94, 0.31, 0.3], thick: 0.006, edge: 0, front: 0.002, ripple: 0.0015, n: 850, len: [0.006, 0.017], rad: [0.0013, 0.0018], lift: [0.66, 0.16], sweep: [0.15, 1, -0.15], side: 0.18, jit: [0.65, 0.42], buzz: 0.8, burn: 0.35, ride: 0.25, hat: 1, seed: 43 },
};

// 头发发型分界：返回某方位角（0=正前）处，头发盖到的最低极角
function capTheta(aphi, cap = HAIR.crop.cap) {
  return cap[0] + cap[1] * smoothstep(0.2, 1.3, aphi) + cap[2] * smoothstep(1.8, 3.0, aphi);
}

function buildHairGeometry(H = HAIR.crop, F = FACE) {
  const g = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.62);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  const d = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const phi = Math.atan2(d.x, d.z), aphi = Math.abs(phi);
    let th = Math.acos(clamp(d.y, -1, 1));
    const tb = capTheta(aphi, H.cap);
    th = Math.min(th, tb);
    const sinT = Math.sin(th);
    d.set(Math.sin(phi) * sinT, Math.cos(th), Math.cos(phi) * sinT);
    headShape(d, o, F);
    n.copy(o).normalize();
    const k = th / tb;
    let thick = 0.004 + H.edge + H.thick * Math.pow(1 - k, 0.55);
    thick += H.front * gauss(aphi, 0, 0.5) * smoothstep(0.55, 0.95, k);
    if (H.heap) thick += H.heap * gauss(phi, H.heapAt, 0.7) * Math.sin(Math.PI * Math.min(1, k * 1.15));
    thick += H.ripple * Math.sin(phi * 9 + th * 14);
    o.addScaledVector(n, thick);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  g.computeVertexNormals();
  // 发束
  const rnd = mulberry32(H.seed);
  const tufts = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();
  for (let i = 0; i < H.n; i++) {
    const phi = (rnd() * 2 - 1) * Math.PI;
    const aphi = Math.abs(phi);
    const tb = capTheta(aphi, H.cap);
    const th = Math.pow(rnd(), 0.7) * (tb - 0.06);
    const sinT = Math.sin(th);
    d.set(Math.sin(phi) * sinT, Math.cos(th), Math.cos(phi) * sinT);
    headShape(d, o, F);
    n.copy(o).normalize();
    const kk = th / tb;
    const front = gauss(aphi, 0, 0.9);
    o.addScaledVector(n, 0.004 + H.edge * 0.8 + (H.thick * 0.7) * Math.pow(1 - kk, 0.6) + H.front * (H.ride || 0) * gauss(aphi, 0, 0.5) * smoothstep(0.55, 0.95, kk)
      + (H.heap ? H.heap * 0.8 * gauss(phi, H.heapAt, 0.7) * Math.sin(Math.PI * Math.min(1, kk * 1.15)) : 0));
    // 发束大多贴着头皮顺着梳的方向长，只有前额和头顶略微翘起
    const tv = new THREE.Vector3(Math.sin(phi) * H.side + H.sweep[0], H.sweep[1], H.sweep[2]);
    tv.addScaledVector(n, -tv.dot(n));
    if (tv.lengthSq() < 1e-4) tv.set(0, 0, 1).addScaledVector(n, -n.z);
    const tang = tv.normalize();
    const lift = H.lift[0] + H.lift[1] * front * (1 - kk) * (1 - kk);
    const dir = new THREE.Vector3().copy(n).multiplyScalar(lift).addScaledVector(tang, 1 - lift);
    dir.x += (rnd() - 0.5) * H.jit[0]; dir.y += (rnd() - 0.5) * H.jit[1];
    dir.normalize();
    const h = H.len[0] + rnd() * H.len[1] * (0.7 + front * 0.5), r = H.rad[0] + rnd() * H.rad[1];
    const cone = new THREE.ConeGeometry(r, h, 7, 1);
    cone.translate(0, h / 2 - 0.007, 0);
    q.setFromUnitVectors(up, dir);
    m4.compose(o, q, new THREE.Vector3(1, 1, 0.32 + rnd() * 0.22));
    cone.applyMatrix4(m4);
    tufts.push(cone);
  }
  const tuftGeo = mergeGeometries(tufts);
  return { cap: g, tufts: tuftGeo };
}

// 眼镜：圆角矩形镜框（rim 边宽，top 上边框的宽度——粗黑框那种上沿特别厚），两条镜腿搭到耳朵上
function roundRect(sh, x, y, w, h, r, hole = false) {
  const P = hole ? new THREE.Path() : sh;
  P.moveTo(x + r, y); P.lineTo(x + w - r, y); P.quadraticCurveTo(x + w, y, x + w, y + r);
  P.lineTo(x + w, y + h - r); P.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  P.lineTo(x + r, y + h); P.quadraticCurveTo(x, y + h, x, y + h - r);
  P.lineTo(x, y + r); P.quadraticCurveTo(x, y, x + r, y);
  if (hole) sh.holes.push(P);
}
function buildGlasses({ color = '#161412', rim = 0.003, top = rim, w = 0.045, h = 0.029, metal = 0 }) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.35 : 0.3, metalness: metal });
  const lens = new THREE.MeshStandardMaterial({ color: '#dfe8ee', roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false });
  const sh = new THREE.Shape();
  roundRect(sh, -w / 2 - rim, -h / 2 - rim, w + rim * 2, h + rim + top, 0.008);
  roundRect(sh, -w / 2, -h / 2, w, h, 0.0065, true);
  const fGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.0035, bevelEnabled: false, curveSegments: 6 });
  const lGeo = new THREE.PlaneGeometry(w, h);
  const mk = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  for (const s of [-1, 1]) {
    const cx = s * 0.0355;
    mk(fGeo, frame, cx, 0.011, 0.096, s * 0.14);
    mk(lGeo, lens, cx, 0.011, 0.0975, s * 0.14).renderOrder = 2;
    // 镜腿：从铰链一直搭到耳朵上
    const a = new THREE.Vector3(s * 0.066, 0.016, 0.089), b = new THREE.Vector3(s * 0.081, 0.011, -0.014);
    const len = a.distanceTo(b);
    const t = mk(new THREE.BoxGeometry(0.0028, Math.max(0.0028, rim * 0.9), len), frame, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    t.lookAt(g.localToWorld(b.clone()));
    mk(new THREE.BoxGeometry(0.006, Math.max(0.004, top), 0.006), frame, s * 0.063, 0.017, 0.092);
  }
  // 鼻梁
  mk(new THREE.BoxGeometry(0.013, 0.0026, 0.0028), frame, 0, 0.019, 0.1);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ---------------- 面部贴图 ----------------
function faceMeta(yTop, yBot, F = FACE, precise = false) {
  const W = 1024, H = 512;
  const rxAt = (y) => HX * (1 - F.jaw * smoothstep(-0.05, -0.95, y / HY));
  // Invert the actual sculpted surface at this latitude. A constant equatorial
  // radius pinches features toward the chin and places the mouth off the face.
  const surface = new THREE.Vector3(), direction = new THREE.Vector3();
  const X = (s, y) => {
    if (precise) {
      let lo = 0, hi = Math.PI / 2;
      for (let i = 0; i < 20; i++) {
        const phi = (lo + hi) / 2;
        let top = 0, bottom = Math.PI;
        for (let j = 0; j < 20; j++) {
          const theta = (top + bottom) / 2;
          direction.set(Math.sin(phi) * Math.sin(theta), Math.cos(theta), Math.cos(phi) * Math.sin(theta));
          headShape(direction, surface, F);
          if (surface.y > y) top = theta; else bottom = theta;
        }
        if (surface.x < Math.abs(s)) lo = phi; else hi = phi;
      }
      return W / 2 + Math.sign(s) * ((lo + hi) / 2) / (Math.PI * 2) * W;
    }
    const rx = rxAt(y);
    const zf = HZ * Math.sqrt(Math.max(0.04, 1 - (s / rx) ** 2));
    return W / 2 + (Math.atan2(s, zf) / (Math.PI * 2)) * W;
  };
  const Y = (y) => ((yTop - y) / (yTop - yBot)) * H;
  return { W, H, X, Y, yTop, yBot };
}

function buzzLine(aphi, burn = 1) {
  let line = lerp(0.062, 0.05, smoothstep(0.3, 0.8, aphi));
  line = lerp(line, -0.014, gauss(aphi, 1.13, 0.07) * burn);
  line = lerp(line, 0.03, smoothstep(1.22, 1.35, aphi));
  line = lerp(line, -0.05, smoothstep(1.95, 2.7, aphi));
  return line;
}

function paintSkinBase(meta, O) {
  const { W, H, yTop, yBot } = meta;
  const c = TX.makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const { fbm, noise } = TX.createNoise(77);
  for (let py = 0; py < H; py++) {
    const y = yTop - (py / H) * (yTop - yBot);
    for (let px = 0; px < W; px++) {
      const phi = (px / W - 0.5) * Math.PI * 2, aphi = Math.abs(phi);
      const n = fbm((px / W) * 16, (py / H) * 8, 3, 16, 8);
      let r = O.skin[0] + (n - 0.5) * 14, g = O.skin[1] + (n - 0.5) * 12, b = O.skin[2] + (n - 0.5) * 10;
      // 面部边缘略暗，增加立体感
      const edgeDark = smoothstep(0.55, 1.35, aphi) * 10;
      r -= edgeDark; g -= edgeDark; b -= edgeDark * 0.6;
      // 下颌/脖子略暗
      const jaw = smoothstep(-0.08, -0.125, y);
      r -= jaw * 16; g -= jaw * 16; b -= jaw * 10;
      const line = buzzLine(aphi, O.hairStyle.burn ?? 1);
      const k = smoothstep(line - 0.004, line + 0.014, y) * O.hairStyle.buzz;
      if (k > 0) {
        const st = noise(px * 0.9, py * 0.9, 921, 460);
        const hr = O.hair[0] + st * 30, hg = O.hair[1] + st * 26, hb = O.hair[2] + st * 26;
        const blue = (1 - k) * k * 4;
        r = lerp(r, hr, k); g = lerp(g, hg, k); b = lerp(b, hb, k);
        r -= blue * 30; g -= blue * 24; b -= blue * 8;
      }
      const i = (py * W + px) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 腮红 / 阴影
  const { X, Y } = meta;
  const blob = (s, y, rx, ry, col) => {
    const cx = X(s, y), cy = Y(y);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  blob(-0.043, -0.024, 36, 24, 'rgba(214,120,110,0.22)');
  blob(0.043, -0.024, 36, 24, 'rgba(214,120,110,0.22)');
  blob(0, -0.034, 20, 14, 'rgba(200,110,100,0.18)');
  blob(-0.03, 0.0, 30, 12, 'rgba(120,70,60,0.12)');
  blob(0.03, 0.0, 30, 12, 'rgba(120,70,60,0.12)');
  blob(0, -0.1, 60, 18, 'rgba(90,60,50,0.12)');
  return c;
}

function paintFeatures(base, meta, { eyes = 'open', mouth = 'grin', brows = 'normal', tears = false }, O = { brow: '#1a1411' }) {
  const { W, H, X, Y } = meta;
  const c = TX.makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0);
  // 半写实风格：五官整体放大一点，远处也能看清表情
  const FS = O.featureScale ?? 1.18, FC = 0.004;
  const P = (s, y) => [X(s * FS, (y - FC) * FS + FC), Y((y - FC) * FS + FC)];
  const path = (pts, close = false) => {
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(...P(...pt)) : ctx.moveTo(...P(...pt))));
    if (close) ctx.closePath();
  };
  const curve = (a, cp, b) => { ctx.moveTo(...P(...a)); ctx.quadraticCurveTo(...P(...cp), ...P(...b)); };

  // ---- 眉毛（浓、略平）----
  const browLift = brows === 'raised' ? 0.008 : brows === 'relaxed' ? -0.002 : brows === 'worried' ? 0.002 : 0;
  // 眉头（靠鼻梁那一端）往上挑：着急、难过的时候
  const browTilt = brows === 'worried' ? 0.009 : 0;
  const BT = (x, y) => [x * (O.browWidth ?? 1),
    0.029 + (y - 0.029) * (O.browThickness ?? 1) + (O.browY ?? 0)
    + browTilt * (1 - clamp((Math.abs(x) - 0.011) / 0.04, 0, 1))];
  for (const s of [-1, 1]) {
    const y0 = 0.029 + browLift;
    ctx.fillStyle = O.brow;
    ctx.beginPath();
    ctx.moveTo(...P(...BT(s * 0.011, y0 - 0.002)));
    ctx.quadraticCurveTo(...P(...BT(s * 0.03, y0 + 0.008)), ...P(...BT(s * 0.05, y0 + 0.0015)));
    ctx.quadraticCurveTo(...P(...BT(s * 0.031, y0 + 0.0015)), ...P(...BT(s * 0.012, y0 - 0.0095)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,20,17,0.6)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 14; k++) {
      const t = k / 13, ss = s * (0.012 + t * 0.036), yy = y0 - 0.004 + Math.sin(t * Math.PI) * 0.006;
      ctx.beginPath(); ctx.moveTo(...P(...BT(ss, yy - 0.003))); ctx.lineTo(...P(...BT(ss + s * 0.004, yy + 0.003))); ctx.stroke();
    }
  }

  // ---- 眼睛 ----
  for (const s of [-1, 1]) {
    const ex = s * 0.031, ey = 0.009;
    const hw = 0.0135;
    if (eyes === 'open' || eyes === 'wide' || eyes === 'squint') {
      const hh = eyes === 'wide' ? 0.0068 : eyes === 'squint' ? 0.0026 : 0.0046;
      ctx.fillStyle = '#f1ebe4';
      ctx.beginPath();
      curve([ex - hw, ey], [ex, ey + hh * 2.1], [ex + hw, ey + 0.001]);
      ctx.quadraticCurveTo(...P(ex, ey - hh * 1.6), ...P(ex - hw, ey));
      ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#3a2418';
      const [ix, iy] = P(ex + s * 0.0005, ey + 0.0006);
      ctx.beginPath(); ctx.arc(ix, iy, eyes === 'wide' ? 10.5 : 10.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d0806'; ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ix - 3, iy - 3.5, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(ix - 30, iy - 18, 60, 7);
      ctx.restore();
      ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
      ctx.beginPath(); curve([ex - hw - 0.0005, ey - 0.0005], [ex, ey + hh * 2.2], [ex + hw + s * 0.0015, ey + 0.0012]); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,25,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); curve([ex - hw * 0.8, ey - 0.0008], [ex, ey - hh * 1.5], [ex + hw * 0.9, ey]); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,55,45,0.35)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); curve([ex - hw * 0.7, ey + hh * 2.2 + 0.002], [ex, ey + hh * 2.9 + 0.002], [ex + hw * 0.8, ey + hh * 2.1 + 0.002]); ctx.stroke();
    } else if (eyes === 'smile') {
      // 笑成月牙
      ctx.fillStyle = '#1c120d';
      ctx.beginPath();
      curve([ex - hw, ey - 0.001], [ex, ey + 0.0085], [ex + hw, ey - 0.0005]);
      ctx.quadraticCurveTo(...P(ex, ey + 0.0035), ...P(ex - hw, ey - 0.001));
      ctx.fill();
      ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 3.8; ctx.lineCap = 'round';
      ctx.beginPath(); curve([ex - hw - 0.001, ey - 0.0015], [ex, ey + 0.0092], [ex + hw + s * 0.002, ey - 0.0005]); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,90,75,0.45)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); curve([ex - hw * 0.8, ey - 0.0045], [ex, ey - 0.0022], [ex + hw * 0.9, ey - 0.004]); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,85,70,0.35)'; ctx.lineWidth = 1.3;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); curve([ex + s * (hw + 0.002), ey - 0.001 - k * 0.0032], [ex + s * (hw + 0.006), ey - 0.0015 - k * 0.004], [ex + s * (hw + 0.01), ey - 0.004 - k * 0.005]); ctx.stroke(); }
    } else if (eyes === 'squeeze') {
      // 哭的时候眼睛使劲闭着：眼皮挤成一道往外耷拉的粗线，上面压出一道褶，下面鼓起两道眼袋，眼角挤出鱼尾纹
      const ix = ex - s * hw, ox = ex + s * hw;
      ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
      ctx.beginPath(); curve([ix, ey + 0.0015], [ex, ey + 0.0048], [ox + s * 0.001, ey - 0.0038]); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,70,56,0.5)'; ctx.lineWidth = 1.7;
      ctx.beginPath(); curve([ex - s * hw * 0.6, ey + 0.0068], [ex, ey + 0.0092], [ox, ey + 0.0015]); ctx.stroke();
      for (const [dy, a] of [[0.0045, 0.42], [0.0085, 0.28]]) { ctx.strokeStyle = `rgba(120,70,56,${a})`; ctx.beginPath(); curve([ex - s * hw * 0.55, ey - dy + 0.001], [ex, ey - dy - 0.003], [ex + s * hw * 0.95, ey - dy - 0.0015]); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(120,70,56,0.4)'; ctx.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(...P(ox + s * 0.0015, ey - 0.0035 + k * 0.0032)); ctx.lineTo(...P(ox + s * 0.0075, ey - 0.005 + k * 0.0048)); ctx.stroke(); }
    } else if (eyes === 'closed') {
      ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); curve([ex - hw, ey + 0.0005], [ex, ey - 0.004], [ex + hw, ey + 0.0008]); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) { const t = (k + 0.5) / 5; const ss = ex - hw + t * hw * 2; ctx.beginPath(); ctx.moveTo(...P(ss, ey - 0.0028)); ctx.lineTo(...P(ss + s * 0.001, ey - 0.0048)); ctx.stroke(); }
    }
  }

  if (eyes === 'squeeze') {
    // 眉心、鼻梁皱成一团
    ctx.strokeStyle = 'rgba(120,70,56,0.4)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.004, 0.026], [s * 0.0065, 0.021], [s * 0.004, 0.016]); ctx.stroke(); }
    for (const y of [0.012, 0.0085]) { ctx.beginPath(); curve([-0.007, y], [0, y + 0.0015], [0.007, y]); ctx.stroke(); }
  }
  if (tears) {
    // 眼泪：从眼角挤出来，顺着脸颊一路淌到下巴——亮晶晶的两道
    for (const s of [-1, 1]) {
      const pts = [[s * 0.041, 0.004], [s * 0.046, -0.012], [s * 0.043, -0.03], [s * 0.047, -0.05], [s * 0.042, -0.072]];
      for (const [w, col] of [[6, 'rgba(170,200,222,0.4)'], [2, 'rgba(255,255,255,0.75)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(...P(...pts[0]));
        for (let k = 1; k < pts.length - 1; k++) { const m = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2]; ctx.quadraticCurveTo(...P(...pts[k]), ...P(...m)); }
        ctx.lineTo(...P(...pts[pts.length - 1])); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(205,228,242,0.75)';
      ctx.beginPath(); ctx.ellipse(...P(s * 0.042, -0.076), 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(...P(s * 0.0412, -0.074), 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- 鼻子（鼻孔与阴影，立体部分用网格）----
  ctx.fillStyle = 'rgba(95,50,40,0.75)';
  for (const s of [-1, 1]) { const [nx, ny] = P(s * 0.0075, -0.0355); ctx.beginPath(); ctx.ellipse(nx, ny, 5.5, 3.2, s * 0.35, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = 'rgba(120,70,55,0.35)'; ctx.lineWidth = 2;
  for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.013, -0.028], [s * 0.016, -0.036], [s * 0.009, -0.039]); ctx.stroke(); }

  // ---- 嘴 ----
  const my = -0.056;
  const lip = '#b86f66';
  if (mouth === 'grin') {
    // 法令纹（笑）
    ctx.strokeStyle = 'rgba(130,75,62,0.45)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.017, -0.031], [s * 0.031, -0.044], [s * 0.032, -0.062]); ctx.stroke(); }
    const mw = 0.027;
    ctx.fillStyle = '#4a1612';
    ctx.beginPath();
    curve([-mw, my + 0.004], [0, my + 0.0065], [mw, my + 0.004]);
    ctx.quadraticCurveTo(...P(0, my - 0.02), ...P(-mw, my + 0.004));
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f5f1e9';
    ctx.beginPath();
    curve([-mw, my + 0.006], [0, my + 0.009], [mw, my + 0.006]);
    ctx.lineTo(...P(mw * 0.9, my - 0.001));
    ctx.quadraticCurveTo(...P(0, my - 0.004), ...P(-mw * 0.9, my - 0.001));
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,140,0.7)'; ctx.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) { const s = k * 0.0065; ctx.beginPath(); ctx.moveTo(...P(s, my + 0.007)); ctx.lineTo(...P(s * 1.02, my - 0.003)); ctx.stroke(); }
    ctx.fillStyle = '#b5504a';
    ctx.beginPath(); ctx.ellipse(...P(0, my - 0.014), 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lip; ctx.lineWidth = 3;
    ctx.beginPath(); curve([-mw - 0.001, my + 0.0045], [0, my + 0.008], [mw + 0.001, my + 0.0045]); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); curve([-mw * 0.85, my - 0.009], [0, my - 0.0215], [mw * 0.85, my - 0.009]); ctx.stroke();
    ctx.fillStyle = 'rgba(120,60,50,0.4)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(...P(s * (mw + 0.0035), my + 0.002), 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (mouth === 'smile') {
    ctx.strokeStyle = 'rgba(130,75,62,0.3)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.017, -0.032], [s * 0.028, -0.045], [s * 0.028, -0.06]); ctx.stroke(); }
    ctx.strokeStyle = '#6a2a24'; ctx.lineWidth = 3.4;
    ctx.beginPath(); curve([-0.022, my + 0.002], [0, my - 0.006], [0.022, my + 0.002]); ctx.stroke();
    ctx.strokeStyle = lip; ctx.lineWidth = 5;
    ctx.beginPath(); curve([-0.016, my - 0.005], [0, my - 0.011], [0.016, my - 0.005]); ctx.stroke();
  } else if (mouth === 'neutral') {
    ctx.strokeStyle = '#7a3a32'; ctx.lineWidth = 3;
    ctx.beginPath(); curve([-0.019, my], [0, my - 0.001], [0.019, my]); ctx.stroke();
    ctx.strokeStyle = lip; ctx.lineWidth = 4.5;
    ctx.beginPath(); curve([-0.014, my - 0.005], [0, my - 0.009], [0.014, my - 0.005]); ctx.stroke();
  } else if (mouth === 'yell') {
    // 张大嘴喊：上排牙、舌头，嘴角往下拉
    ctx.strokeStyle = 'rgba(130,75,62,0.45)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.016, -0.031], [s * 0.03, -0.046], [s * 0.029, -0.068]); ctx.stroke(); }
    const mw = 0.022;
    ctx.fillStyle = '#3a0f0c';
    ctx.beginPath();
    curve([-mw, my + 0.002], [0, my + 0.009], [mw, my + 0.002]);
    ctx.quadraticCurveTo(...P(mw * 0.9, my - 0.022), ...P(0, my - 0.026));
    ctx.quadraticCurveTo(...P(-mw * 0.9, my - 0.022), ...P(-mw, my + 0.002));
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f2ede4';
    ctx.beginPath(); curve([-mw, my + 0.004], [0, my + 0.009], [mw, my + 0.004]); ctx.lineTo(...P(mw * 0.85, my - 0.002)); ctx.quadraticCurveTo(...P(0, my + 0.001), ...P(-mw * 0.85, my - 0.002)); ctx.fill();
    ctx.fillStyle = '#b04a44';
    ctx.beginPath(); ctx.ellipse(...P(0, my - 0.021), 30, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lip; ctx.lineWidth = 3.4;
    ctx.beginPath(); curve([-mw - 0.001, my + 0.002], [0, my + 0.0095], [mw + 0.001, my + 0.002]); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(...P(-mw, my + 0.001)); ctx.quadraticCurveTo(...P(-mw * 0.9, my - 0.023), ...P(0, my - 0.027)); ctx.quadraticCurveTo(...P(mw * 0.9, my - 0.023), ...P(mw, my + 0.001)); ctx.stroke();
  } else if (mouth === 'laugh') {
    // 仰着头哈哈大笑（jigo）：嘴张成一个大 D 字，上排牙、舌头，嘴角往上咧，笑纹很深
    ctx.strokeStyle = 'rgba(130,75,62,0.5)'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.017, -0.03], [s * 0.034, -0.044], [s * 0.035, -0.066]); ctx.stroke(); }
    const mw = 0.029;
    ctx.fillStyle = '#34100d';
    ctx.beginPath();
    curve([-mw, my + 0.006], [0, my + 0.008], [mw, my + 0.006]);
    ctx.quadraticCurveTo(...P(mw * 0.95, my - 0.03), ...P(0, my - 0.033));
    ctx.quadraticCurveTo(...P(-mw * 0.95, my - 0.03), ...P(-mw, my + 0.006));
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f5f1e9';
    ctx.beginPath(); curve([-mw, my + 0.008], [0, my + 0.011], [mw, my + 0.008]); ctx.lineTo(...P(mw * 0.88, my - 0.0015)); ctx.quadraticCurveTo(...P(0, my - 0.0035), ...P(-mw * 0.88, my - 0.0015)); ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,140,0.7)'; ctx.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) { const s = k * 0.0068; ctx.beginPath(); ctx.moveTo(...P(s, my + 0.009)); ctx.lineTo(...P(s * 1.02, my - 0.002)); ctx.stroke(); }
    ctx.fillStyle = '#c0544e';
    ctx.beginPath(); ctx.ellipse(...P(0, my - 0.027), 34, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lip; ctx.lineWidth = 3;
    ctx.beginPath(); curve([-mw - 0.001, my + 0.0065], [0, my + 0.0095], [mw + 0.001, my + 0.0065]); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(...P(-mw, my + 0.005)); ctx.quadraticCurveTo(...P(-mw * 0.95, my - 0.031), ...P(0, my - 0.034)); ctx.quadraticCurveTo(...P(mw * 0.95, my - 0.031), ...P(mw, my + 0.005)); ctx.stroke();
    ctx.fillStyle = 'rgba(120,60,50,0.45)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(...P(s * (mw + 0.003), my + 0.006), 3.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (mouth === 'wince') {
    // Photo reference: broad uneven opening, raised centre of the upper lip,
    // downturned corners and a visible lower lip; leave room for the chin.
    const outline = () => {
      ctx.beginPath(); ctx.moveTo(...P(-0.033, -0.06));
      ctx.bezierCurveTo(...P(-0.026, -0.047), ...P(-0.012, -0.043), ...P(0.002, -0.048));
      ctx.bezierCurveTo(...P(0.018, -0.05), ...P(0.027, -0.047), ...P(0.032, -0.061));
      ctx.bezierCurveTo(...P(0.029, -0.076), ...P(0.014, -0.077), ...P(0, -0.073));
      ctx.bezierCurveTo(...P(-0.014, -0.072), ...P(-0.029, -0.083), ...P(-0.033, -0.06));
      ctx.closePath();
    };
    ctx.fillStyle = '#321d1b'; outline(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#e8e2d6';
    ctx.beginPath(); curve([-0.031, -0.048], [0, -0.037], [0.033, -0.05]);
    ctx.lineTo(...P(0.026, -0.058)); ctx.quadraticCurveTo(...P(0, -0.052), ...P(-0.03, -0.057)); ctx.fill();
    ctx.strokeStyle = 'rgba(116,105,96,0.32)'; ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(...P(i * 0.007, -0.047)); ctx.lineTo(...P(i * 0.007, -0.056)); ctx.stroke(); }
    ctx.strokeStyle = '#dad0c2'; ctx.lineWidth = 3;
    ctx.beginPath(); curve([-0.023, -0.072], [0, -0.065], [0.024, -0.072]); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#9c736a'; ctx.lineWidth = 2.8; outline(); ctx.stroke();
    ctx.strokeStyle = 'rgba(103,77,66,0.35)'; ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath(); curve([side * 0.014, -0.031], [side * 0.026, -0.041], [side * 0.035, -0.067]); ctx.stroke();
    }
    ctx.beginPath(); curve([-0.018, -0.086], [0, -0.081], [0.019, -0.085]); ctx.stroke();
  } else if (mouth === 'cry') {
    // 哇地一声哭出来（neptune）：嘴张成一个下宽上窄的大口子，嘴角往下耷拉，露出上排牙和舌头，下巴皱成一团
    ctx.strokeStyle = 'rgba(130,75,62,0.5)'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * 0.016, -0.029], [s * 0.033, -0.046], [s * 0.034, -0.072]); ctx.stroke(); }
    const mw = 0.032, top = my + 0.006, cy = my - 0.012, bot = my - 0.04;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(...P(-mw, cy));
      ctx.quadraticCurveTo(...P(-mw * 0.55, top + 0.004), ...P(0, top));
      ctx.quadraticCurveTo(...P(mw * 0.55, top + 0.004), ...P(mw, cy));
      ctx.quadraticCurveTo(...P(mw * 0.8, bot), ...P(0, bot));
      ctx.quadraticCurveTo(...P(-mw * 0.8, bot), ...P(-mw, cy));
    };
    ctx.fillStyle = '#2e0c0a';
    outline(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f2ede4';
    ctx.beginPath(); ctx.moveTo(...P(-mw, cy + 0.006)); ctx.quadraticCurveTo(...P(0, top + 0.008), ...P(mw, cy + 0.006));
    ctx.lineTo(...P(mw * 0.8, cy - 0.001)); ctx.quadraticCurveTo(...P(0, top - 0.009), ...P(-mw * 0.8, cy - 0.001)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,140,0.7)'; ctx.lineWidth = 1.2;
    for (let k = -3; k <= 3; k++) { const x = k * 0.0062; ctx.beginPath(); ctx.moveTo(...P(x, top + 0.002)); ctx.lineTo(...P(x * 1.02, top - 0.007 + Math.abs(k) * 0.0012)); ctx.stroke(); }
    ctx.fillStyle = '#b04a44';
    ctx.beginPath(); ctx.ellipse(...P(0, bot + 0.008), 38, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lip; ctx.lineWidth = 3.6; outline(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,58,0.4)'; ctx.lineWidth = 1.7;
    for (const s of [-1, 1]) { ctx.beginPath(); curve([s * (mw + 0.001), cy], [s * (mw + 0.005), cy - 0.008], [s * (mw + 0.003), cy - 0.017]); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(120,70,58,0.32)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); curve([-0.013, bot - 0.009], [0, bot - 0.013], [0.013, bot - 0.009]); ctx.stroke();
    for (const [x, y] of [[-0.006, bot - 0.017], [0.005, bot - 0.018], [0, bot - 0.022]]) { ctx.beginPath(); ctx.arc(...P(x, y), 2.2, 0, Math.PI * 2); ctx.stroke(); }
  } else if (mouth === 'O') {
    ctx.fillStyle = '#3a110e';
    ctx.beginPath(); ctx.ellipse(...P(0, my - 0.004), 15, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = lip; ctx.lineWidth = 4; ctx.stroke();
  }
  return c;
}

// ---------------- 手臂两骨骼 IK（敬礼、递东西、戴帽子）----------------
const IK_L1 = 0.285, IK_L2 = 0.31;
const IK_DOWN = new THREE.Vector3(0, -1, 0), IK_POLE_R = new THREE.Vector3(-1, -0.2, -0.4).normalize(), IK_POLE_L = new THREE.Vector3(1, -0.2, -0.4).normalize();
const _ia = new THREE.Vector3(), _ib = new THREE.Vector3(), _ic = new THREE.Vector3(), _id = new THREE.Vector3(), _ie = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _iq2 = new THREE.Quaternion(), _iq3 = new THREE.Quaternion(), _ieu = new THREE.Euler(), _pk = new THREE.Vector3();
// 两只手插进裤裆（照片上那个姿势）：手肘往外、稍微往前撑，小臂斜着搭过肚子前面，手腕从裤腰正前方插进去。
// 这组数是在躯干坐标系里数值搜出来的：小臂整段在身体（连小肚子）外面、手腕卡在裤腰上、手心和指尖都在裤子里
const TUCK_POLE_R = new THREE.Vector3(-0.981, -0.163, 0.109).normalize(), TUCK_POLE_L = new THREE.Vector3(0.981, -0.163, 0.109).normalize();
const _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _wd = new THREE.Vector3();
// 举罐子往头上浇水（neptune）：左胳膊肘往外、往后撑开，手举到头顶斜上方
const POUR_POLE = new THREE.Vector3(1, 0.3, -0.6).normalize(), _Y = new THREE.Vector3(0, 1, 0);
const _ht = new THREE.Vector3(), _hc = new THREE.Vector3(), _cp = new THREE.Vector3(), _cm = new THREE.Vector3(), _cd = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion();
// 子物体里的一个点 → 躯干坐标（动画刚改完关节，世界矩阵还没更新，自己一级一级乘上去）
const toTorso = (v, obj, torso) => { for (let o = obj; o && o !== torso; o = o.parent) { o.updateMatrix(); v.applyMatrix4(o.matrix); } return v; };
function solveArmIK(sh, el, target, pole, w) {
  const S = sh.position;
  const d = _ia.subVectors(target, S);
  const len = clamp(d.length(), 0.05, IK_L1 + IK_L2 - 0.002);
  d.normalize();
  const x = (IK_L1 * IK_L1 - IK_L2 * IK_L2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, IK_L1 * IK_L1 - x * x));
  const p = _ib.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const E = _ic.copy(S).addScaledVector(d, x).addScaledVector(p, h);
  const u = _id.subVectors(E, S).normalize();
  _iq.setFromUnitVectors(IK_DOWN, u);
  const f = _ie.copy(S).addScaledVector(d, len).sub(E).normalize().applyQuaternion(_iq2.copy(_iq).invert());
  _iq3.setFromUnitVectors(IK_DOWN, f);
  sh.quaternion.slerp(_iq, w);
  el.quaternion.slerp(_iq3, w);
}

// ---------------- 构建角色 ----------------
// opts：skin / hair（RGB）、skinColor / hairColor / brow、outfit：'denim' 主角的牛仔夹克 / 'agsu' 美军常服 / 'tee' 短袖 T 恤 / 'bare' 光膀子 /
//   'shorts' 光膀子 + 蓝白扎染大裤衩 + 光脚（jigo）/ 'sport' 黑色长袖运动衫（neptune，胸前印 print）、
//   tee T 恤颜色、print 胸前印的字（'tuss' / 'coco'）、hairStyle 发型（见 HAIR）、glasses 眼镜（见 buildGlasses）、
//   headScale 头型 [宽, 高, 深]、necklace 项链、earring 耳钉、mustache 小胡子、name 名牌、abs 腹肌、
//   pose：'crotch' 站着 / 走路时两只手从裤腰前面插进裤裆里、expr 改几种表情的画法（{ grin: {...} }）、
//   bubble 咧嘴大笑时头顶冒出来的那句话（'Hee-Haw!'）、face 脸型（见 FACE）、
//   build 身材（见下面的 B；关节的位置、胳膊腿的长短不变，只改粗细和宽窄，所有动画、IK、挂在身上的东西都照样能用）、
//   pants 运动裤的颜色（不给就是黑色牛仔裤）、watch 左手腕上一块黑色电子表、hairGloss 头发的粗糙度（湿头发亮一点）、
//   preciseFace 按头部曲面映射五官；featureScale、browWidth、browThickness、browY 微调五官；
//   can 左手攥着一罐饮料；signature 'pour'：咧嘴笑（grin）的时候把那罐水举过头顶浇下去（neptune 那张照片）
export function createCharacter(opts = {}) {
  const O = { skin: [212, 160, 126], skinColor: '#d09a7a', hair: [34, 30, 30], hairColor: '#16110f', brow: '#1a1411', outfit: 'denim', mustache: false, name: 'SMITH', ...opts };
  O.hairStyle = HAIR[O.hairStyle] || HAIR.crop;
  // 身材：shoulder 肩宽、chest 胸腔、waist 腰、hip 胯、arm 胳膊粗细、leg 腿粗细、neck 脖子加长多少（米）、neckR 脖子粗细、
  //   belly 小肚子往前挺出来多少（米）。1 / 0 就是 bingo 的身材
  const B = { shoulder: 1, chest: 1, waist: 1, hip: 1, arm: 1, leg: 1, neck: 0, neckR: 1, belly: 0, ...O.build };
  const F = { ...FACE, ...O.face };
  const agsu = O.outfit === 'agsu', tee = O.outfit === 'tee', shorts = O.outfit === 'shorts', bare = O.outfit === 'bare' || shorts, casual = tee || bare;
  const sport = O.outfit === 'sport'; // 长袖运动衫：袖子到手腕（像夹克那样），身上是针织布（像 T 恤那样）
  const root = new THREE.Group();
  root.name = opts.name ? `npc:${opts.name}` : 'player';

  // 材质（牛仔布只有牛仔夹克 / 牛仔裤用得上）
  const denim = agsu || casual || sport ? null : TX.genDenim({ base: '#1d2840', light: '#33445f', S: 256, seed: 55 });
  const blackDenim = agsu || shorts || O.pants ? null : TX.genDenim({ base: '#1b1c20', light: '#2c2e35', S: 256, seed: 56 });
  const skinMat = new THREE.MeshStandardMaterial({ color: O.skinColor, roughness: 0.55 });
  let sleeveMat, jeansMat;
  if (agsu) {
    // 美军 AGSU 常服：深橄榄绿上衣（“粉绿配”里的绿）+ 偏粉的卡其色长裤
    const wool = TX.genCloth({ base: '#4a4833', seed: 57, vertical: false, contrast: 0.35, slub: 0.4 }); wool.repeat.set(3, 3);
    const pinks = TX.genCloth({ base: '#b39f8a', seed: 59, vertical: true, contrast: 0.3, slub: 0.4 }); pinks.repeat.set(2, 3);
    sleeveMat = new THREE.MeshStandardMaterial({ map: wool, roughness: 0.9 });
    jeansMat = new THREE.MeshStandardMaterial({ map: pinks, roughness: 0.85 });
  } else {
    if (tee) {
      // 短袖：袖口是开口的圆筒，从下往上能看见里面
      const cot = TX.genCloth({ base: O.tee || '#e8e6e0', seed: 63, vertical: false, contrast: 0.25, slub: 0.35 }); cot.repeat.set(2, 2);
      sleeveMat = new THREE.MeshStandardMaterial({ map: cot, roughness: 0.92, side: THREE.DoubleSide });
    } else if (bare) sleeveMat = skinMat;
    else if (sport) {
      const knit = TX.genCloth({ base: O.tee || '#1b1b1f', seed: 67, vertical: false, contrast: 0.3, slub: 0.3 }); knit.repeat.set(2, 3);
      sleeveMat = new THREE.MeshStandardMaterial({ map: knit, roughness: 0.88 });
    } else {
      sleeveMat = new THREE.MeshStandardMaterial({ map: denim.map, normalMap: denim.normalMap, roughness: 0.82 });
      sleeveMat.map.repeat.set(2, 2); sleeveMat.normalMap.repeat.set(2, 2);
    }
    if (shorts) {
      // 大裤衩：两面都画（裤管是开口的圆筒，从下面能看见里面）
      const dye = TX.genTieDye(); dye.repeat.set(2, 1.4);
      jeansMat = new THREE.MeshStandardMaterial({ map: dye, roughness: 0.9, side: THREE.DoubleSide });
    } else if (O.pants) {
      // 运动裤（neptune）：灰色针织布
      const knit = TX.genCloth({ base: O.pants, seed: 69, vertical: true, contrast: 0.3, slub: 0.35 }); knit.repeat.set(2, 3);
      jeansMat = new THREE.MeshStandardMaterial({ map: knit, roughness: 0.92 });
    } else {
      jeansMat = new THREE.MeshStandardMaterial({ map: blackDenim.map, normalMap: blackDenim.normalMap, roughness: 0.85 });
      jeansMat.map.repeat.set(2, 3); jeansMat.normalMap.repeat.set(2, 3);
    }
  }
  const hairMat = new THREE.MeshStandardMaterial({ color: O.hairColor, roughness: O.hairGloss ?? 0.58 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: agsu ? '#3a2214' : '#5a5e66', roughness: agsu ? 0.28 : 0.75 });
  const soleMat = new THREE.MeshStandardMaterial({ color: agsu ? '#1a120c' : '#efefea', roughness: 0.7 });
  const btnMat = new THREE.MeshStandardMaterial({ color: agsu ? '#c9a23a' : '#b07a3e', roughness: 0.3, metalness: 0.9 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: agsu ? '#c8b089' : '#1c1c20', roughness: 0.9 });
  const mats = { skinMat, sleeveMat, jeansMat, hairMat, shoeMat, soleMat };

  const J = {};
  const grp = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z);
    parent.add(g); J[name] = g; return g;
  };
  const addMesh = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };

  const HIPS_Y = 0.92;
  const hips = grp('hips', root, 0, HIPS_Y, 0);
  // 胯部（牛仔裤）：上宽下收，接大腿
  // 大裤衩比牛仔裤松、前后更厚，上沿要收在裤腰底下（不然从背后看会从裤腰上面露出来一截）
  const pelvisPts = [[0.0, -0.1], [0.07, -0.098], [0.11, -0.085], [0.135, -0.06], [0.145, -0.02], [0.148, 0.02], [0.146, shorts ? 0.034 : 0.07]].map(([r, y]) => new THREE.Vector2(r, y));
  // 大裤衩松松垮垮，比牛仔裤宽一圈
  addMesh(new THREE.LatheGeometry(pelvisPts, 24), jeansMat, hips, 0, 0, 0, 0, 0, 0, (shorts ? 1.05 : 1) * B.hip, 1, (shorts ? 0.68 : 0.62) * B.hip);

  // 躯干（牛仔夹克）
  const torso = grp('torso', hips, 0, 0.0, 0);
  // 身材：腰 → 胸 → 肩，一段一段地缩放躯干的半径
  const bodyK = (h) => (h < 0.44 ? lerp(B.waist, B.chest, smoothstep(0.08, 0.38, h)) : lerp(B.chest, B.shoulder, smoothstep(0.44, 0.52, h)));
  const prof = [[0.0, 0.16], [0.04, 0.161], [0.08, 0.158], [0.12, 0.155], [0.16, 0.156], [0.2, 0.161], [0.24, 0.168], [0.28, 0.175], [0.32, 0.181], [0.36, 0.186], [0.4, 0.189], [0.44, 0.19], [0.47, 0.186], [0.5, 0.172], [0.52, 0.15], [0.535, 0.115], [0.548, 0.078], [0.558, 0.05]]
    .map(([h, r]) => [h, r * bodyK(h)]);
  const pts = prof.map(([h, r]) => new THREE.Vector2(r, h));
  const vAt = (h) => {
    for (let i = 0; i < prof.length - 1; i++) {
      if (h >= prof[i][0] && h <= prof[i + 1][0]) {
        const t = (h - prof[i][0]) / (prof[i + 1][0] - prof[i][0]);
        return (i + t) / (prof.length - 1);
      }
    }
    return 1;
  };
  const rAt = (h) => {
    for (let i = 0; i < prof.length - 1; i++) if (h >= prof[i][0] && h <= prof[i + 1][0]) { const t = (h - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return lerp(prof[i][1], prof[i + 1][1], t); }
    return 0.05;
  };
  const DZ = 0.6;
  let jacketMat;
  if (tee || sport) jacketMat = new THREE.MeshStandardMaterial({ map: TX.genTee(vAt, rAt, DZ, { base: O.tee || (sport ? '#1b1b1f' : '#e8e6e0'), print: O.print }), roughness: 0.92 });
  else if (bare) jacketMat = new THREE.MeshStandardMaterial({ map: TX.genBareTorso(vAt, rAt, DZ, { skin: O.skinColor, abs: O.abs }), roughness: 0.55 });
  else if (agsu) jacketMat = new THREE.MeshStandardMaterial({ map: TX.genServiceCoat(vAt, { name: O.name }), roughness: 0.9 });
  else jacketMat = new THREE.MeshStandardMaterial({ map: TX.genJacket(denim.canvas, vAt), normalMap: denim.normalMap, roughness: 0.82 });
  mats.jacketMat = jacketMat;
  const torsoGeo = new THREE.LatheGeometry(pts, 40, Math.PI, Math.PI * 2);
  if (B.belly) {
    // 小肚子：只把前面那一片往前推，肚脐那一带最鼓
    const tp = torsoGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), h = tp.getY(i), z = tp.getZ(i);
      if (z <= 0) continue;
      const c = z / Math.max(1e-4, Math.hypot(x, z));
      tp.setZ(i, z + B.belly * gauss(h, 0.15, 0.08) * smoothstep(0.02, 0.09, h) * c * c / DZ); // 裤腰以下不鼓，免得肚皮从裤腰底下顶出来
    }
    torsoGeo.computeVertexNormals();
  }
  addMesh(torsoGeo, jacketMat, torso, 0, 0, 0, 0, 0, 0, 1, 1, DZ);
  if (casual) {
    if (tee) {
      // T 恤：下摆收一道边，圆领一圈罗纹
      addMesh(new THREE.TorusGeometry(0.161 * B.waist, 0.007, 6, 40), sleeveMat, torso, 0, 0.008, 0, Math.PI / 2, 0, 0, 1, DZ, 1);
      addMesh(new THREE.TorusGeometry(0.058, 0.007, 6, 28), sleeveMat, torso, 0, 0.552, 0.006, Math.PI / 2 - 0.12, 0, 0, 1, 0.9, 1);
    } else if (shorts) {
      // 大裤衩的松紧裤腰（手插在里面，撑得鼓鼓的）+ 前面垂下来两根白抽绳
      addMesh(new THREE.TorusGeometry(0.161 * B.waist, 0.023, 8, 40), jeansMat, torso, 0, 0.021, 0, Math.PI / 2, 0, 0, 1, DZ + 0.05, 1); // 往下盖住躯干的下沿
      const cord = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.8 });
      const fz = 0.161 * B.waist * (DZ + 0.05) + 0.012;
      addMesh(new THREE.SphereGeometry(0.009, 10, 8), cord, torso, 0, 0.024, fz);
      for (const s2 of [-1, 1]) {
        const cp = [new THREE.Vector3(0, 0.024, fz), new THREE.Vector3(s2 * 0.01, -0.01, fz + 0.004), new THREE.Vector3(s2 * 0.014, -0.05 - (s2 > 0 ? 0.012 : 0), fz + 0.002)];
        addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 12, 0.0032, 5), cord, torso);
      }
      if (O.pose === 'crotch') {
        // 两只手插在裤裆里：裤腰前面被手腕撑出来一截，裤裆前面被两只手撑出两个鼓包（手抽出来就瘪下去，见 update）
        for (const s2 of [-1, 1]) {
          const side = s2 > 0 ? 'L' : 'R', bumps = [];
          bumps.push(addMesh(new THREE.SphereGeometry(1, 14, 10), jeansMat, torso, s2 * 0.058 * B.waist, 0.03, 0.106 * B.waist, 0, s2 * 0.3, 0, 0.034, 0.024, 0.02));
          bumps.push(addMesh(new THREE.SphereGeometry(1, 14, 10), jeansMat, hips, s2 * 0.038 * B.hip, -0.04, 0.083 * B.hip, -0.45, 0, s2 * 0.3, 0.03, 0.058, 0.02));
          for (const b of bumps) b.userData.base = b.scale.clone();
          J[`tuck${side}`] = bumps;
        }
      }
    } else {
      // 光膀子：只剩裤腰
      addMesh(new THREE.TorusGeometry(0.162 * B.waist, 0.022, 8, 40), jeansMat, torso, 0, 0.02, 0, Math.PI / 2, 0, 0, 1, DZ, 1);
    }
    if (O.necklace) {
      // 长长的一串珠子项链：从脖子两侧沿着胸口垂下来
      const cp = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 12 - 1, at = Math.abs(t);
        const h = 0.345 + 0.21 * Math.pow(at, 1.6), x = t * lerp(0.03, 0.058, at);
        const r = rAt(h);
        cp.push(new THREE.Vector3(x, h, DZ * Math.sqrt(Math.max(0, r * r - x * x)) + 0.004));
      }
      const chain = new THREE.MeshStandardMaterial({ color: '#5a5650', roughness: 0.35, metalness: 0.7 });
      addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 80, 0.0017, 5), chain, torso);
    }
  } else if (sport) {
    // 运动衫：下摆收一道边，圆领一圈罗纹
    addMesh(new THREE.TorusGeometry(0.161 * B.waist, 0.008, 6, 40), sleeveMat, torso, 0, 0.008, 0, Math.PI / 2, 0, 0, 1, DZ, 1);
    addMesh(new THREE.TorusGeometry(0.057, 0.008, 6, 28), sleeveMat, torso, 0, 0.552, 0.006, Math.PI / 2 - 0.12, 0, 0, 1, 0.9, 1);
  } else {
  // 下摆松紧带
  addMesh(new THREE.TorusGeometry(0.162 * B.waist, 0.012, 6, 40), sleeveMat, torso, 0, 0.012, 0, Math.PI / 2, 0, 0, 1, DZ, 1);
  // 扣子（门襟 + 胸袋）
  for (const h of [0.1, 0.19, 0.28, 0.36, 0.44]) addMesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12), btnMat, torso, 0, h, rAt(h) * DZ + 0.002, Math.PI / 2);
  for (const s of [-1, 1]) {
    const a = s * 0.47, h = 0.365, r = rAt(h);
    const fx = Math.sin(a) * r, fz = Math.cos(a) * r * DZ;
    addMesh(new RoundedBoxGeometry(0.072, 0.026, 0.01, 2, 0.004), sleeveMat, torso, fx, h, fz + 0.004, 0.08, a * 0.62, 0);
    addMesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.005, 10), btnMat, torso, fx, h - 0.004, fz + 0.011, Math.PI / 2, 0, 0);
  }
  // 领子
  addMesh(new THREE.TorusGeometry(0.066, 0.017, 8, 28, Math.PI * 1.35), sleeveMat, torso, 0, 0.548, -0.004, Math.PI / 2, 0, Math.PI * 0.825, 1, 0.82, 1);
  for (const s of [-1, 1]) addMesh(new RoundedBoxGeometry(0.055, 0.075, 0.012, 2, 0.005), sleeveMat, torso, s * 0.04, 0.5, 0.083, -0.35, s * 0.55, s * 0.5);
  }
  if (!bare) addMesh(new THREE.CylinderGeometry(0.058, 0.06, 0.03, 16), tee || sport ? sleeveMat : shirtMat, torso, 0, 0.545, 0.004);
  if (agsu) {
    // 常服领口露出的卡其衬衫 + 棕色领带、肩章（少校的金色橡树叶）、领口的“U.S.”铜徽
    const vs = new THREE.Shape(); vs.moveTo(-0.045, 0); vs.lineTo(0.045, 0); vs.lineTo(0, -0.12); vs.closePath();
    addMesh(new THREE.ShapeGeometry(vs), shirtMat, torso, 0, 0.545, rAt(0.5) * DZ + 0.006, -0.2);
    const tieMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.6 });
    addMesh(new THREE.BoxGeometry(0.022, 0.11, 0.006), tieMat, torso, 0, 0.49, rAt(0.49) * DZ + 0.012, -0.25);
    addMesh(new THREE.BoxGeometry(0.026, 0.02, 0.012), tieMat, torso, 0, 0.535, rAt(0.53) * DZ + 0.004, -0.2);
    const gold = new THREE.MeshStandardMaterial({ color: '#d8b04a', roughness: 0.3, metalness: 0.9 });
    for (const s of [-1, 1]) {
      addMesh(new RoundedBoxGeometry(0.05, 0.012, 0.11, 2, 0.004), sleeveMat, torso, s * 0.14, 0.535, -0.01, 0, 0, s * -0.25);
      addMesh(new THREE.SphereGeometry(1, 10, 8), gold, torso, s * 0.15, 0.545, 0.02, 0, 0, 0, 0.016, 0.006, 0.022);
      addMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.003, 12), gold, torso, s * 0.055, 0.49, rAt(0.49) * DZ + 0.004, Math.PI / 2 - 0.3, s * 0.4, 0);
    }
  }

  // 脖子 + 头
  const neck = grp('neck', torso, 0, 0.545, 0.005);
  addMesh(new THREE.CylinderGeometry(0.047 * B.neckR, 0.053 * B.neckR, 0.13 + B.neck, 16), skinMat, neck, 0, 0.05 + B.neck / 2, 0);
  const head = grp('head', neck, 0, 0.125 + B.neck, 0.012);
  const hs = O.headScale || [1, 1, 1];
  head.scale.set(1.12 * hs[0], 1.12 * hs[1], 1.12 * hs[2]);
  const { geo: headGeo, yTop, yBot } = buildHeadGeometry(F);
  const meta = faceMeta(yTop, yBot, F, O.preciseFace);
  const skinBase = paintSkinBase(meta, O);
  const faceCache = new Map();
  const faceTex = (key, spec) => {
    if (!faceCache.has(key)) {
      const t = TX.toTex(paintFeatures(skinBase, meta, spec, O), { wrap: false });
      t.anisotropy = 4;
      faceCache.set(key, t);
    }
    return faceCache.get(key);
  };
  const EXPR = {
    neutral: { eyes: 'open', mouth: 'smile', brows: 'normal' },
    grin: { eyes: 'smile', mouth: 'grin', brows: 'normal' },
    shock: { eyes: 'wide', mouth: 'O', brows: 'raised' },
    sleep: { eyes: 'closed', mouth: 'neutral', brows: 'relaxed' },
    focus: { eyes: 'open', mouth: 'neutral', brows: 'normal' },
    // 下面几种只有第五章彩蛋的过场用得上：不预先生成，用到之前调 prepare() 在后台画好
    shout: { eyes: 'squint', mouth: 'yell', brows: 'worried' },
    warm: { eyes: 'smile', mouth: 'smile', brows: 'relaxed' },
    sad: { eyes: 'open', mouth: 'neutral', brows: 'worried' },
  };
  if (O.expr) for (const k of Object.keys(O.expr)) EXPR[k] = { ...EXPR[k], ...O.expr[k] };
  const LAZY = new Set(['shout', 'warm', 'sad']);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex('neutral', EXPR.neutral), roughness: 0.55 });
  const headMesh = addMesh(headGeo, faceMat, head);
  // 鼻子
  const noseGeo = new THREE.SphereGeometry(1, 16, 12);
  addMesh(noseGeo, skinMat, head, 0, -0.02, 0.083, -0.3, 0, 0, 0.0078, 0.022, 0.011);
  addMesh(noseGeo, skinMat, head, 0, -0.035, 0.0855, 0, 0, 0, 0.0085, 0.0072, 0.008);
  for (const s of [-1, 1]) addMesh(noseGeo, skinMat, head, s * 0.0088, -0.0375, 0.0805, 0, 0, 0, 0.0056, 0.005, 0.0056);
  // 耳朵
  for (const s of [-1, 1]) {
    addMesh(new THREE.SphereGeometry(1, 14, 10), skinMat, head, s * 0.071, -0.006, -0.01, 0, s * 0.35, s * -0.08, 0.009, 0.029, 0.017);
    addMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: '#b98068', roughness: 0.7 }), head, s * 0.0775, -0.004, -0.008, 0, s * 0.35, 0, 0.003, 0.018, 0.009);
  }
  // 头发
  const hair = buildHairGeometry(O.hairStyle, F);
  addMesh(hair.cap, hairMat, head);
  addMesh(hair.tufts, hairMat, head);
  if (O.glasses) head.add(buildGlasses(O.glasses));
  if (O.earring) addMesh(new THREE.SphereGeometry(0.0034, 10, 8), new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.2, metalness: 0.6 }), head, 0.0765, -0.031, -0.004);
  if (O.mustache) {
    const mm = new THREE.MeshStandardMaterial({ color: O.hairColor, roughness: 0.7 });
    for (const s2 of [-1, 1]) addMesh(new THREE.SphereGeometry(1, 12, 8), mm, head, s2 * 0.013, -0.046, 0.083, 0, s2 * 0.25, s2 * -0.18, 0.017, 0.0065, 0.009);
  }

  // 手臂
  const buildArm = (side) => {
    const s = side === 'L' ? 1 : -1;
    const sh = grp(`sh${side}`, torso, s * 0.18 * B.shoulder, 0.43, -0.005);
    const A = B.arm, wa = lerp(1, A, 0.7);
    let el;
    if (casual) {
      // 短袖 / 光膀子：胳膊露在外面，袖子只到上臂一半
      addMesh(new THREE.SphereGeometry(tee ? 0.052 : 0.048 * A, 16, 12), sleeveMat, sh, -s * 0.006, 0.0, 0, 0, 0, 0, 1, 0.9, 0.9);
      addMesh(new THREE.CapsuleGeometry(0.041 * A, 0.21, 6, 14), skinMat, sh, 0, -0.14, 0);
      if (tee) addMesh(new THREE.CylinderGeometry(0.053, 0.058, 0.13, 16, 1, true), sleeveMat, sh, 0, -0.07, 0);
      el = grp(`el${side}`, sh, 0, -0.285, 0);
      addMesh(new THREE.CapsuleGeometry(0.036 * A, 0.19, 6, 14), skinMat, el, 0, -0.115, 0);
    } else {
      addMesh(new THREE.SphereGeometry(0.05 * A, 16, 12), sleeveMat, sh, -s * 0.006, 0.0, 0, 0, 0, 0, 1, 0.9, 0.9);
      addMesh(new THREE.CapsuleGeometry(0.047 * A, 0.21, 6, 14), sleeveMat, sh, 0, -0.14, 0);
      el = grp(`el${side}`, sh, 0, -0.285, 0);
      addMesh(new THREE.CapsuleGeometry(0.043 * A, 0.19, 6, 14), sleeveMat, el, 0, -0.115, 0);
      addMesh(new THREE.CylinderGeometry(0.046 * A, 0.045 * A, 0.045, 14), sleeveMat, el, 0, -0.225, 0);
      if (!sport) addMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), btnMat, el, s * 0.035 * A, -0.225, 0.036 * A, Math.PI / 2, 0, 0);
    }
    const wr = grp(`wr${side}`, el, 0, -0.255, 0);
    J[`wrist${side}`] = addMesh(new THREE.CylinderGeometry(0.03 * wa, 0.033 * wa, 0.04, 12), skinMat, wr, 0, 0.01, 0, 0, 0, 0, 1, 1, 0.8);
    // 手掌朝向大腿（自然下垂）；胳膊细的人手也小一号
    const hand = new THREE.Group(); hand.rotation.y = -s * Math.PI / 2; hand.scale.setScalar(lerp(1, A, 0.4)); wr.add(hand); J[`hand${side}`] = hand;
    addMesh(new RoundedBoxGeometry(0.066, 0.08, 0.028, 2, 0.012), skinMat, hand, 0, -0.045, 0.002);
    const fingers = new THREE.Group(); fingers.position.set(0, -0.083, 0.002); hand.add(fingers); J[`fing${side}`] = fingers;
    for (let k = 0; k < 4; k++) addMesh(new THREE.CapsuleGeometry(0.0076, 0.042 + (k === 1 || k === 2 ? 0.006 : 0), 3, 8), skinMat, fingers, (k - 1.5) * 0.016, -0.024, 0);
    addMesh(new THREE.CapsuleGeometry(0.0086, 0.038, 3, 8), skinMat, hand, s * 0.034, -0.048, 0.014, 0.4, 0, s * 0.55);
    return { sh, el, wr };
  };
  buildArm('L'); buildArm('R');

  // 腿
  const buildLeg = (side) => {
    const s = side === 'L' ? 1 : -1;
    if (shorts) return buildBareLeg(side, s);
    const L = B.leg;
    const hp = grp(`hip${side}`, hips, s * 0.078 * B.hip, -0.03, 0);
    addMesh(new THREE.SphereGeometry(0.078 * L, 16, 12), jeansMat, hp, s * 0.004, 0.0, 0, 0, 0, 0, 1, 1, 0.95);
    addMesh(new THREE.CylinderGeometry(0.078 * L, 0.058 * L, 0.4, 16), jeansMat, hp, 0, -0.2, 0);
    const kn = grp(`kn${side}`, hp, 0, -0.41, 0);
    addMesh(new THREE.SphereGeometry(0.059 * L, 14, 10), jeansMat, kn, 0, 0.0, 0.004);
    addMesh(new THREE.CylinderGeometry(0.056 * L, 0.05 * L, 0.36, 16), jeansMat, kn, 0, -0.18, 0);
    addMesh(new THREE.CylinderGeometry(0.058, 0.062, 0.05, 16), jeansMat, kn, 0, -0.35, 0);
    const an = grp(`an${side}`, kn, 0, -0.41, 0);
    const sole = addMesh(new RoundedBoxGeometry(0.094, 0.028, 0.255, 2, 0.012), soleMat, an, 0, -0.054, 0.045);
    addMesh(new RoundedBoxGeometry(0.088, 0.072, 0.14, 3, 0.03), shoeMat, an, 0, -0.01, -0.005);
    const toe = new THREE.SphereGeometry(0.047, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    addMesh(toe, shoeMat, an, 0, -0.04, 0.09, 0, 0, 0, 0.92, 0.75, 1.5);
    addMesh(new THREE.BoxGeometry(0.089, 0.012, 0.09), soleMat, an, 0, -0.026, 0.02);
    addMesh(new THREE.BoxGeometry(0.03, 0.004, 0.08), new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.8 }), an, 0, 0.028, 0.03, 0.25, 0, 0);
    return sole;
  };
  // 大裤衩 + 光腿光脚：宽宽的裤管罩到膝盖上面，下面露出小腿，脚是光着的
  const calfGeo = new THREE.LatheGeometry([[0.046, 0.012], [0.05, -0.03], [0.054, -0.1], [0.052, -0.16], [0.045, -0.24], [0.036, -0.32], [0.031, -0.38], [0.032, -0.415]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const buildBareLeg = (side, s) => {
    // 裤管是宽松的：人瘦了裤管也只窄一点点，腿在里面晃荡
    const L = B.leg, P = lerp(1, B.hip, 0.5), la = lerp(1, L, 0.5);
    const hp = grp(`hip${side}`, hips, s * 0.078 * B.hip, -0.03, 0);
    addMesh(new THREE.SphereGeometry(0.086 * P, 16, 12), jeansMat, hp, s * 0.008, 0.0, 0, 0, 0, 0, 1, 1, 0.95);
    addMesh(new THREE.CylinderGeometry(0.086 * P, 0.094 * P, 0.33, 18, 1, true), jeansMat, hp, s * 0.008, -0.165, 0.004);
    addMesh(new THREE.TorusGeometry(0.093 * P, 0.0055, 5, 22), jeansMat, hp, s * 0.008, -0.33, 0.004, Math.PI / 2);
    addMesh(new THREE.CylinderGeometry(0.07 * L, 0.054 * L, 0.4, 14), skinMat, hp, 0, -0.2, 0);
    const kn = grp(`kn${side}`, hp, 0, -0.41, 0);
    addMesh(new THREE.SphereGeometry(0.052 * L, 14, 10), skinMat, kn, 0, 0.0, 0.004, 0, 0, 0, 1, 1.05, 1);
    addMesh(calfGeo, skinMat, kn, 0, 0, -0.004, 0, 0, 0, L, 1, L);
    const an = grp(`an${side}`, kn, 0, -0.41, 0);
    // 脚踝 + 两侧的踝骨
    addMesh(new THREE.SphereGeometry(0.033 * la, 12, 10), skinMat, an, 0, -0.012, -0.006);
    for (const k of [-1, 1]) addMesh(new THREE.SphereGeometry(0.012, 8, 6), skinMat, an, k * 0.028 * la, -0.014 + (k === s ? 0 : 0.005), -0.008);
    // 脚后跟、脚背（前面往下斜）、前脚掌、五个脚趾（大脚趾在里侧）
    addMesh(new THREE.SphereGeometry(0.034, 12, 10), skinMat, an, 0, -0.038, -0.032, 0, 0, 0, 1, 0.92, 1.1);
    addMesh(new RoundedBoxGeometry(0.074, 0.046, 0.15, 3, 0.02), skinMat, an, -s * 0.004, -0.046, 0.035, 0.14, -s * 0.06, 0);
    addMesh(new RoundedBoxGeometry(0.088, 0.03, 0.064, 3, 0.013), skinMat, an, -s * 0.007, -0.056, 0.105, 0, -s * 0.08, 0);
    const toes = [[-0.03, 0.0125, 0.157], [-0.01, 0.01, 0.152], [0.007, 0.0092, 0.146], [0.022, 0.0085, 0.139], [0.035, 0.0078, 0.13]];
    for (const [x, r, z] of toes) addMesh(new THREE.SphereGeometry(1, 10, 8), skinMat, an, s * x - s * 0.004, -0.06, z, 0, 0, 0, r, r * 0.85, r * 1.35);
  };
  buildLeg('L'); buildLeg('R');

  // 手里的紫光手电（默认隐藏）
  const torch = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 12), new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.35, metalness: 0.5 }));
  tb.rotation.x = Math.PI / 2; torch.add(tb);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 12), new THREE.MeshStandardMaterial({ color: '#9a6bff', emissive: '#8a4dff', emissiveIntensity: 3 }));
  tl.rotation.x = Math.PI / 2; tl.position.z = 0.066; torch.add(tl);
  torch.position.set(0, -0.07, 0.03);
  torch.rotation.x = -Math.PI / 2;
  torch.visible = false;
  J.wrR.add(torch);
  const torchTip = new THREE.Object3D(); torchTip.position.set(0, 0, 0.08); torch.add(torchTip);

  // 头盔挂点（戴头盔彩蛋）
  const helmetSlot = new THREE.Group(); helmetSlot.position.set(0, 0.045, -0.005); helmetSlot.scale.setScalar(O.hairStyle.hat || 1); J.head.add(helmetSlot);

  // neptune：左手腕上一块黑色电子表；左手攥着一罐饮料（照片上他正把它举过头顶往自己头上浇），浇的时候有一股水流、头上往下滴水
  if (O.watch) {
    const band = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.12, metalness: 0.3 });
    addMesh(new THREE.TorusGeometry(0.031, 0.0055, 6, 22), band, J.wrL, 0, -0.004, 0, Math.PI / 2, 0, 0, 1.05, 0.84, 1);
    addMesh(new RoundedBoxGeometry(0.011, 0.034, 0.03, 2, 0.004), band, J.wrL, 0.033, -0.004, 0);
    addMesh(new THREE.BoxGeometry(0.002, 0.024, 0.021), glass, J.wrL, 0.039, -0.004, 0);
  }
  let can = null, stream = null;
  const drips = [];
  if (O.can) {
    // 罐子贴着手心（手心朝 +z），罐身顺着手指的方向
    can = new THREE.Group(); can.position.set(0, -0.058, 0.048); J.handL.add(can); J.can = can;
    const alu = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.28, metalness: 0.9 });
    addMesh(new THREE.CylinderGeometry(0.033, 0.033, 0.098, 28, 1, true), new THREE.MeshStandardMaterial({ map: TX.toTex(paintCan(), { wrap: false }), roughness: 0.3, metalness: 0.55 }), can, 0, -0.001, 0);
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    addMesh(lathe([[0.033, 0.048], [0.028, 0.057], [0.027, 0.061], [0.0001, 0.061]]), alu, can);
    addMesh(lathe([[0.0001, -0.061], [0.026, -0.061], [0.031, -0.057], [0.033, -0.05]]), alu, can);
    addMesh(new THREE.BoxGeometry(0.012, 0.0015, 0.022), alu, can, 0, 0.0625, -0.004);
    addMesh(new THREE.CircleGeometry(0.0065, 14), new THREE.MeshBasicMaterial({ color: '#141414' }), can, 0, 0.0615, 0.012, -Math.PI / 2);
    const wet = new THREE.MeshStandardMaterial({ color: '#dcedf6', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, emissive: '#6a8898', emissiveIntensity: 0.12 });
    const sg = new THREE.CylinderGeometry(0.0045, 0.008, 1, 8, 1, true); sg.translate(0, 0.5, 0);
    stream = addMesh(sg, wet, J.torso); stream.visible = false;
    const dg = new THREE.SphereGeometry(0.0055, 8, 6);
    for (let i = 0; i < 9; i++) { const d = addMesh(dg, wet, J.torso); d.visible = false; drips.push(d); }
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (stream) for (const o of [stream, ...drips]) { o.castShadow = false; o.receiveShadow = false; o.raycast = () => {}; }

  // 咧嘴大笑时头顶冒出来的一句话（jigo 那张涂鸦：嘴边拉出一根线，旁边歪歪扭扭写着 Hee-Haw）
  let bubble = null;
  if (O.bubble) {
    bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.toTex(paintBubble(O.bubble), { wrap: false }), transparent: true, depthWrite: false }));
    bubble.center.set(0.16, 0.02);
    bubble.position.set(0.07, 0.3 + B.neck, 0.02);
    bubble.scale.setScalar(0.001);
    bubble.visible = false;
    bubble.renderOrder = 7;
    bubble.castShadow = false; bubble.raycast = () => {};
    J.neck.add(bubble);
  }

  // 人物本身的零件：换人物时，挂在关节上的其它东西（头盔、帽子、围巾……）要搬到新人物身上
  const own = new Set();
  root.traverse((o) => own.add(o));

  // ---------------- 动画状态 ----------------
  const st = {
    phase: 0, t: 0, blinkT: 2, blinking: 0, expr: 'neutral', exprHold: 0, laughAt: -99, bubbleT: 0, pourT: -1,
    w: { crouch: 0, sit: 0, sleep: 0, reach: 0, cheer: 0, stretch: 0, hold: 0, look: 1, walk: 0, run: 0 },
  };
  const joints = ['hips', 'torso', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR', 'fingL', 'fingR'];
  const pose = {};
  for (const j of joints) pose[j] = new THREE.Vector3();

  function setExpression(name, hold = 0) {
    if (!EXPR[name]) return;
    const was = st.expr;
    st.expr = name;
    st.exprHold = hold;
    // 卡通章会把材质整体换掉，所以每次都改头上当前那一份材质
    const fm = headMesh.material;
    fm.map = faceTex(name, EXPR[name]);
    fm.needsUpdate = true;
    // 笑出声来：冒一句 Hee-Haw!（隔几秒才会再冒；api.onLaugh 返回 false 的场合不笑出声，比如结局的仪式上）
    // neptune 不笑：一"笑"就把手里那罐水举过头顶浇下去，哇地哭出来（浇完要缓一会儿才会再浇）
    const pour = O.signature === 'pour';
    if ((bubble || pour) && name === 'grin' && was !== 'grin' && st.t - st.laughAt > (pour ? 7 : 5) && (!api.onLaugh || api.onLaugh() !== false)) {
      st.laughAt = st.t;
      if (bubble) { st.bubbleT = 1.8; bubble.visible = true; }
      if (pour) { st.pourT = 0; st.exprHold = Math.max(st.exprHold, 3.6); }
    }
  }
  function blinkTex(on) {
    const e = EXPR[st.expr];
    if (e.eyes === 'closed' || e.eyes === 'smile' || e.eyes === 'squint' || e.eyes === 'squeeze') return;
    headMesh.material.map = on ? faceTex(`${st.expr}_blink`, { ...e, eyes: 'closed' }) : faceTex(st.expr, e);
  }
  // 预生成常用表情，避免运行时卡顿
  const prepare = (names = [...LAZY]) => { for (const k of names) { if (!EXPR[k]) continue; faceTex(k, EXPR[k]); if (EXPR[k].eyes === 'open' || EXPR[k].eyes === 'wide') faceTex(`${k}_blink`, { ...EXPR[k], eyes: 'closed' }); } };
  prepare(Object.keys(EXPR).filter((k) => !LAZY.has(k)));

  const tgt = (j, x, y, z, w = 1) => {
    const p = pose[j];
    p.x = lerp(p.x, x, w); p.y = lerp(p.y, y, w); p.z = lerp(p.z, z, w);
  };
  const addp = (j, x, y = 0, z = 0) => { const p = pose[j]; p.x += x; p.y += y; p.z += z; };

  // params: { speed, crouch, sit, sleep, reach, cheer, stretch, hold, holdPitch, lookYaw, lookPitch }
  function update(dt, prm = {}) {
    st.t += dt;
    const W = st.w;
    const k = 1 - Math.exp(-dt * 10);
    const speed = prm.speed || 0;
    W.walk = lerp(W.walk, clamp(speed / 1.5, 0, 1), k);
    W.run = lerp(W.run, clamp((speed - 1.8) / 1.2, 0, 1), k);
    for (const key of ['crouch', 'sit', 'sleep', 'reach', 'cheer', 'stretch', 'hold', 'float', 'attention']) W[key] = lerp(W[key] || 0, prm[key] || 0, 1 - Math.exp(-dt * (key === 'sleep' ? 3 : key === 'float' ? 2 : 8)));
    let events = null;
    const stride = lerp(1.35, 1.9, W.run) * (1 - W.crouch * 0.35);
    const prevPhase = st.phase;
    if (speed > 0.05) st.phase += dt * (speed / stride) * Math.PI * 2;
    else st.phase += dt * 0; // 保持
    const stepA = Math.floor((prevPhase - Math.PI / 2) / Math.PI), stepB = Math.floor((st.phase - Math.PI / 2) / Math.PI);
    if (stepB !== stepA && speed > 0.2) events = 'step';

    for (const j of joints) pose[j].set(0, 0, 0);
    let hipsY = HIPS_Y, hipsZoff = 0;
    const t = st.t;
    // --- 站立基础 ---
    tgt('shL', 0.03, 0, 0.1); tgt('shR', 0.03, 0, -0.1);
    tgt('elL', -0.14, 0, 0); tgt('elR', -0.14, 0, 0);
    tgt('fingL', can ? 1.0 : 0.35, 0, 0); tgt('fingR', 0.35, 0, 0); // 手里攥着罐子（neptune）：左手手指弯过去握住它
    addp('torso', 0.012 * Math.sin(t * 1.7));
    addp('neck', -0.01 * Math.sin(t * 1.7));
    addp('shL', 0.02 * Math.sin(t * 1.7 + 0.5)); addp('shR', 0.02 * Math.sin(t * 1.7 + 0.5));
    // --- 走/跑 ---
    const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
    const wk = W.walk * (1 - W.float);
    if (wk > 0.001) {
      const amp = lerp(0.42, 0.72, W.run) * wk * (1 - W.crouch * 0.4);
      addp('hipL', -amp * s); addp('hipR', amp * s);
      const k0 = lerp(0.08, 0.25, W.run) * wk, k1 = lerp(0.65, 1.3, W.run) * wk;
      addp('knL', k0 + k1 * Math.pow(Math.max(0, c), 1.5));
      addp('knR', k0 + k1 * Math.pow(Math.max(0, -c), 1.5));
      addp('anL', -0.15 * wk * Math.max(0, c) + 0.1 * wk * s);
      addp('anR', -0.15 * wk * Math.max(0, -c) - 0.1 * wk * s);
      const arm = lerp(0.38, 0.7, W.run) * wk;
      addp('shL', arm * s); addp('shR', -arm * s);
      addp('elL', -lerp(0.15, 0.95, W.run) * wk - 0.15 * wk * Math.max(0, -s));
      addp('elR', -lerp(0.15, 0.95, W.run) * wk - 0.15 * wk * Math.max(0, s));
      addp('torso', lerp(0.05, 0.2, W.run) * wk, 0.09 * s * wk);
      addp('hips', 0, -0.07 * s * wk);
      addp('neck', -lerp(0.03, 0.12, W.run) * wk);
      hipsY -= lerp(0.022, 0.05, W.run) * wk * Math.abs(s);
      hipsY += lerp(0.0, 0.03, W.run) * wk * Math.abs(c);
    }
    // --- 失重漂浮：手臂自然浮起、膝盖微屈，移动时像游泳一样划水 ---
    if (W.float > 0.001) {
      const w = W.float, sw = clamp(speed / 1.2, 0, 1);
      const a = Math.sin(t * 0.9), b = Math.sin(t * 0.7 + 1);
      const stroke = Math.sin(t * 4.2) * sw;
      tgt('hipL', -0.45 + a * 0.08 + stroke * 0.35, 0, 0.12, w); tgt('hipR', -0.3 - a * 0.08 - stroke * 0.35, 0, -0.1, w);
      tgt('knL', 0.75 + b * 0.1 + Math.max(0, stroke) * 0.4, 0, 0, w); tgt('knR', 0.6 - b * 0.1 + Math.max(0, -stroke) * 0.4, 0, 0, w);
      tgt('anL', 0.35, 0, 0, w); tgt('anR', 0.35, 0, 0, w);
      // 手臂：放松地浮在身前，手肘弯着（宇航员在舱里睡觉 / 漂浮的样子）
      tgt('shL', -0.95 + b * 0.1 - stroke * 0.9, 0.12, 0.34 + a * 0.08 + sw * 0.45, w); tgt('shR', -0.95 - b * 0.1 + stroke * 0.9, -0.12, -0.34 - a * 0.08 - sw * 0.45, w);
      tgt('elL', -1.05 + sw * 0.35 + a * 0.08, 0, 0, w); tgt('elR', -1.05 + sw * 0.35 - a * 0.08, 0, 0, w);
      tgt('fingL', 0.4, 0, 0, w); tgt('fingR', 0.4, 0, 0, w);
      tgt('torso', -0.06 + sw * 0.35 + a * 0.03, 0, b * 0.04, w);
      tgt('neck', -0.08 - sw * 0.2, 0, 0, w);
      hipsY = lerp(hipsY, HIPS_Y + 0.02, w);
    }
    // --- 立正 ---
    if (W.attention > 0.001) {
      const w = W.attention;
      tgt('shL', 0, 0, 0.03, w); tgt('shR', 0, 0, -0.03, w);
      tgt('elL', -0.05, 0, 0, w); tgt('elR', -0.05, 0, 0, w);
      tgt('fingL', 0.1, 0, 0, w); tgt('fingR', 0.1, 0, 0, w);
      tgt('hipL', 0, 0, 0, w); tgt('hipR', 0, 0, 0, w); tgt('knL', 0, 0, 0, w); tgt('knR', 0, 0, 0, w);
      tgt('torso', -0.02, 0, 0, w);
    }
    // --- 下蹲 ---
    if (W.crouch > 0.001) {
      const w = W.crouch;
      hipsY = lerp(hipsY, 0.6 - 0.02 * Math.abs(s) * wk, w);
      addp('hipL', -0.915 * w); addp('hipR', -0.915 * w);
      addp('knL', 1.83 * w); addp('knR', 1.83 * w);
      addp('anL', -0.915 * w); addp('anR', -0.915 * w);
      addp('torso', 0.38 * w); addp('neck', -0.22 * w); addp('head', -0.1 * w);
      addp('shL', -0.3 * w); addp('shR', -0.3 * w); addp('elL', -0.5 * w); addp('elR', -0.5 * w);
    }
    // --- 坐 ---
    if (W.sit > 0.001) {
      const w = W.sit;
      hipsY = lerp(hipsY, 0.565, w);
      tgt('hipL', -1.45, 0, 0.1, w); tgt('hipR', -1.45, 0, -0.1, w);
      tgt('knL', 1.5, 0, 0, w); tgt('knR', 1.5, 0, 0, w);
      tgt('anL', -0.05, 0, 0, w); tgt('anR', -0.05, 0, 0, w);
      tgt('torso', 0.05 + 0.02 * Math.sin(t * 1.5), 0, 0, w);
      tgt('shL', -0.55, 0, 0.12, w); tgt('shR', -0.55, 0, -0.12, w);
      tgt('elL', -0.9, 0, 0, w); tgt('elR', -0.9, 0, 0, w);
    }
    // --- 趴桌睡 ---
    if (W.sleep > 0.001) {
      const w = W.sleep;
      const br = Math.sin(t * 1.1) * 0.02;
      tgt('torso', 0.98 + br, 0.05, 0, w);
      tgt('neck', 0.25, 0, 0, w);
      tgt('head', 0.35, 0.55, 0.3, w);
      tgt('shL', -1.25, 0.25, -0.1, w); tgt('shR', -1.3, -0.25, 0.1, w);
      tgt('elL', -1.85, 0.6, 0, w); tgt('elR', -1.85, -0.6, 0, w);
      tgt('wrL', 0, 0, 0, w); tgt('wrR', 0, 0, 0, w);
      tgt('fingL', 0.6, 0, 0, w); tgt('fingR', 0.6, 0, 0, w);
    }
    // --- 伸懒腰 ---
    if (W.stretch > 0.001) {
      const w = W.stretch;
      tgt('shL', -2.95, 0, 0.25, w); tgt('shR', -2.95, 0, -0.25, w);
      tgt('elL', -0.25, 0, 0, w); tgt('elR', -0.25, 0, 0, w);
      tgt('torso', -0.12, 0, 0, w); tgt('neck', -0.2, 0, 0, w); tgt('head', -0.25, 0, 0, w);
    }
    // --- 欢呼 ---
    if (W.cheer > 0.001) {
      const w = W.cheer;
      const pump = Math.sin(t * 9) * 0.25;
      tgt('shL', -0.3, 0, 2.55 + pump, w); tgt('shR', -0.3, 0, -2.55 - pump, w);
      tgt('elL', -0.5, 0, 0, w); tgt('elR', -0.5, 0, 0, w);
      tgt('fingL', 1.4, 0, 0, w); tgt('fingR', 1.4, 0, 0, w);
      tgt('head', -0.2, 0, 0, w);
      hipsY += Math.max(0, Math.sin(t * 9)) * 0.06 * w;
    }
    // --- 拿手电 ---
    if (W.hold > 0.001) {
      const w = W.hold;
      const pch = clamp(prm.holdPitch || 0, -1.1, 1.1);
      tgt('shR', -1.45 - pch, 0.15, -0.12, w);
      tgt('elR', -0.18, 0, 0, w);
      tgt('wrR', 0, 0, 0, w);
      tgt('fingR', 1.2, 0, 0, w);
    }
    // --- 伸手拿东西 ---
    if (W.reach > 0.001) {
      const w = W.reach;
      const rp = prm.reachPitch || 0;
      tgt('shR', -1.25 - rp, 0.1, -0.08, w);
      tgt('elR', -0.35, 0, 0, w);
      tgt('fingR', 0.2, 0, 0, w);
      addp('torso', 0.1 * w * (1 + rp), -0.12 * w);
    }
    // --- 转头看 ---
    const lyaw = clamp(prm.lookYaw || 0, -1.1, 1.1) * (1 - W.sleep);
    const lpit = clamp(prm.lookPitch || 0, -0.7, 0.6) * (1 - W.sleep);
    addp('neck', lpit * 0.4, lyaw * 0.35);
    addp('head', lpit * 0.6, lyaw * 0.65);
    if (W.sit < 0.5 && wk < 0.2) addp('head', 0.02 * Math.sin(t * 0.7), 0.05 * Math.sin(t * 0.37));

    // 边浇边哭：肩膀一抽一抽的
    if (can && st.pourT > 0.5) {
      const sob = (1 - smoothstep(2.8, 3.4, st.pourT)) * (0.6 + 0.4 * Math.sin(t * 2.3));
      addp('torso', 0.018 * Math.sin(t * 15) * sob, 0, 0.01 * Math.sin(t * 7.5) * sob);
      addp('head', -0.06 * sob + 0.03 * Math.sin(t * 15 + 1) * sob, 0, (O.pourHeadTilt || 0) * sob);
    }
    // 应用
    J.hips.position.y = hipsY;
    J.hips.position.z = hipsZoff;
    for (const j of joints) {
      const p = pose[j], obj = J[j];
      if (!obj) continue;
      if (j === 'fingL' || j === 'fingR') obj.rotation.set(-p.x, p.y, p.z);
      else obj.rotation.set(p.x, p.y, p.z);
    }
    // 两只手插进裤裆（jigo，照片上那个姿势）：站着、走路时一直插着，跑起来、蹲下、坐下、伸手拿东西 / 拿手电、失重、欢呼、立正时才抽出来
    if (O.pose === 'crotch') {
      const base = (1 - W.run) * (1 - W.crouch) * (1 - W.sit) * (1 - W.sleep) * (1 - W.float) * (1 - W.cheer) * (1 - W.stretch) * (1 - W.attention);
      _pq.setFromEuler(J.torso.rotation).invert(); // 胯部坐标 → 躯干坐标
      for (const side of ['L', 'R']) {
        const w = base * (side === 'R' ? (1 - W.reach) * (1 - W.hold) : 1);
        const k = smoothstep(0.35, 0.9, w);
        for (const b of J[`tuck${side}`] || []) { b.scale.copy(b.userData.base).multiplyScalar(Math.max(0.001, k)); b.visible = k > 0.01; }
        // 手（连手腕那一小截）整只插在裤子里：外面只看得见小臂钻进裤腰、裤子上撑起来的鼓包；手快抽出来了才露出来
        J[`hand${side}`].visible = J[`wrist${side}`].visible = w < 0.75;
        if (w < 0.001) continue;
        const sd = side === 'L' ? 1 : -1;
        // IK 目标是"手腕不折时"手心的位置（胯部坐标）：解出来手腕正好卡在裤腰正前方
        _pk.set(sd * 0.01, -0.015 + 0.003 * Math.sin(t * 1.7), 0.109 * B.waist).applyQuaternion(_pq);
        solveArmIK(J[`sh${side}`], J[`el${side}`], _pk, side === 'R' ? TUCK_POLE_R : TUCK_POLE_L, w);
        // 手腕一折：手掌往下、往中间、往里插进裤裆（不折的话手顺着小臂从裤腰上面伸出去）
        _wd.set(-sd * 0.2, -1, -0.45).normalize().applyQuaternion(_pq);
        _wq.copy(J[`sh${side}`].quaternion).multiply(J[`el${side}`].quaternion).invert().multiply(_iq.setFromUnitVectors(IK_DOWN, _wd));
        J[`wr${side}`].quaternion.slerp(_wq, w);
        J[`fing${side}`].rotation.x = lerp(J[`fing${side}`].rotation.x, -0.25, w);
      }
    }
    // 手臂 IK：prm.ikR / prm.ikL = { p: 躯干坐标系里的手心位置, pole, w }
    for (const [side, key] of [['R', 'ikR'], ['L', 'ikL']]) {
      const ik = prm[key];
      if (ik && ik.w > 0.001) {
        solveArmIK(J[`sh${side}`], J[`el${side}`], ik.p, ik.pole || (side === 'R' ? IK_POLE_R : IK_POLE_L), ik.w);
        // 手腕：敬礼时手掌摆平
        if (ik.wr) J[`wr${side}`].quaternion.slerp(_iq.setFromEuler(_ieu.set(ik.wr[0], ik.wr[1], ik.wr[2])), ik.w);
        if (ik.fing !== undefined) J[`fing${side}`].rotation.x = lerp(J[`fing${side}`].rotation.x, ik.fing, ik.w);
      }
    }
    // 把罐子里的水举过头顶浇下去（neptune）：举手 → 罐口慢慢对准头顶 → 一股水浇下来、顺着头发往下滴 → 放下手
    //   坐着、趴着、蹲着、跑着、失重、欢呼、立正的时候不浇（只哭）
    if (can) {
      if (st.pourT >= 0) { st.pourT += dt; if (st.pourT > 3.6) st.pourT = -1; }
      const pt = st.pourT;
      const allow = (1 - W.sit) * (1 - W.sleep) * (1 - W.float) * (1 - W.run) * (1 - W.crouch) * (1 - W.cheer) * (1 - W.stretch) * (1 - W.attention);
      const w = pt < 0 ? 0 : smoothstep(0, 0.55, pt) * (1 - smoothstep(2.9, 3.5, pt)) * allow;
      let flow = 0;
      if (w > 0.001) {
        _pk.set(0.12 * B.shoulder, 0.93 + B.neck, 0.08);
        solveArmIK(J.shL, J.elL, _pk, POUR_POLE, w);
        toTorso(_ht.set(0, 0.1, 0.012), J.head, J.torso); // 头顶（躯干坐标）
        toTorso(_cp.copy(can.position), can.parent, J.torso); // 罐子
        _cd.subVectors(_ht, _cp).normalize();
        _cq.identity();
        for (let o = can.parent; o !== J.torso; o = o.parent) _cq.premultiply(o.quaternion);
        _cq.invert().multiply(_cq2.setFromUnitVectors(_Y, _cd));
        can.quaternion.identity().slerp(_cq, smoothstep(0.45, 0.85, pt) * w);
        flow = smoothstep(0.75, 0.9, pt) * (1 - smoothstep(2.5, 2.75, pt)) * smoothstep(0.85, 0.98, w);
        if (flow > 0.01) {
          toTorso(_cm.set(0, 0.062, 0.012), can, J.torso); // 罐口
          _cd.subVectors(_ht, _cm);
          const L = _cd.length(), wob = 1 + Math.sin(st.t * 43) * 0.15;
          stream.position.copy(_cm);
          stream.quaternion.setFromUnitVectors(_Y, _cd.normalize());
          stream.scale.set(flow * wob, L + 0.015, flow * wob);
        }
      } else can.quaternion.identity();
      stream.visible = flow > 0.01;
      // 水顺着头发往下滴：一圈水珠从头的四周往下掉，前面几颗顺着脸淌下去
      const dripOn = pt > 0.95 && pt < 3.4 && allow > 0.5;
      if (dripOn) toTorso(_hc.set(0, 0.01, 0.006), J.head, J.torso);
      drips.forEach((d, i) => {
        const cyc = 0.36 + (i % 3) * 0.05, ph = ((st.t + i * 0.137) % cyc) / cyc;
        d.visible = dripOn && ph > 0.04;
        if (!d.visible) return;
        const a = i * 2.39 + 0.4;
        d.position.set(_hc.x + Math.sin(a) * 0.092, _hc.y - 0.015 - ph * ph * 0.3, _hc.z + Math.cos(a) * 0.116);
        d.scale.set(0.8, 1 + ph * 1.6, 0.8);
      });
    }
    // 眨眼
    st.blinkT -= dt;
    if (st.blinkT <= 0) {
      if (!st.blinking) { st.blinking = 0.12; blinkTex(true); }
      st.blinkT = 2.5 + Math.random() * 3;
    }
    if (st.blinking) {
      st.blinking -= dt;
      if (st.blinking <= 0) { st.blinking = 0; blinkTex(false); }
    }
    if (st.exprHold > 0) {
      st.exprHold -= dt;
      if (st.exprHold <= 0) setExpression('neutral');
    }
    // Hee-Haw! 的气泡：弹出来、晃一晃、缩回去
    if (bubble && bubble.visible) {
      st.bubbleT -= dt;
      const k = 1 - st.bubbleT / 1.8;
      if (st.bubbleT <= 0) { bubble.visible = false; bubble.scale.setScalar(0.001); }
      else {
        const pop = k < 0.12 ? Math.sin((k / 0.12) * Math.PI * 0.5) * 1.12 : k > 0.85 ? (1 - k) / 0.15 : 1 + Math.sin(st.t * 9) * 0.03;
        const sc = Math.max(0.001, pop);
        bubble.scale.set(0.5 * sc, 0.25 * sc, 1);
        bubble.material.rotation = Math.sin(st.t * 5) * 0.04;
      }
    }
    return events;
  }

  const setFirstPerson = (fp) => { J.neck.visible = !fp; };

  // 后来挂到关节上的东西（不是人物自己的零件）：[关节, 物体]
  const attachments = () => {
    const out = [];
    for (const [name, j] of Object.entries(J)) if (j.isObject3D) for (const c of j.children) if (!own.has(c)) out.push([name, c]);
    for (const c of helmetSlot.children) if (!own.has(c)) out.push(['helmetSlot', c]);
    return out;
  };
  // 换人物以后，旧的那个人把几何体、材质、贴图都释放掉（挂在身上的东西先搬走）
  const dispose = () => {
    const mats = new Set();
    root.traverse((o) => {
      if (!own.has(o)) return;
      if (o.geometry && !o.isSprite) o.geometry.dispose(); // 精灵的几何体是 three.js 所有精灵共用的那一份
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    const texs = new Set(faceCache.values());
    for (const m of mats) { for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v); m.dispose(); }
    for (const t of texs) t.dispose();
  };

  const api = {
    root, J, mats, update, setExpression, setFirstPerson, torch, torchTip, helmetSlot, headMesh, prepare, attachments, dispose,
    get expression() { return st.expr; },
    faceTexture: () => headMesh.material.map,
    // 返回 false：这一下别笑出声（见 setExpression）
    onLaugh: null,
  };
  return api;
}

// 把一个人身上后来挂上去的东西（头盔、毛线帽、围巾、军帽……）搬到另一个人身上，
// 两个人的骨架是同一套（关节名字、位置都一样），挂在哪个关节、局部位置不变
export function moveAttachments(from, to) {
  for (const [name, obj] of from.attachments()) (name === 'helmetSlot' ? to.helmetSlot : to.J[name]).add(obj);
}

// neptune 手里那罐饮料的罐身：深海蓝，中间一道白浪，上下两道细银线（不是哪个真牌子）
function paintCan() {
  const W = 256, H = 128, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d5aa3'); g.addColorStop(0.55, '#123d74'); g.addColorStop(1, '#0c2b55');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#eef3f6';
  ctx.beginPath(); ctx.moveTo(0, 70);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, 66 + Math.sin((x / W) * Math.PI * 6) * 9);
  for (let x = W; x >= 0; x -= 4) ctx.lineTo(x, 80 + Math.sin((x / W) * Math.PI * 6 + 0.6) * 7);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9ccd0'; ctx.fillRect(0, 12, W, 3); ctx.fillRect(0, H - 15, W, 3);
  return c;
}

// 漫画式对话气泡：白底黑框、歪歪扭扭的手写字，左下角一根小尾巴指向嘴
function paintBubble(text) {
  const W = 512, H = 256, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = '#fbfaf6'; ctx.strokeStyle = '#1a1714'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.ellipse(280, 110, 214, 88, -0.12, 0, Math.PI * 2);
  ctx.moveTo(150, 176); ctx.lineTo(70, 244); ctx.lineTo(196, 188);
  ctx.fill(); ctx.stroke();
  // 尾巴和气泡接缝处补一块白，盖掉里面那段描边
  ctx.beginPath(); ctx.moveTo(146, 170); ctx.lineTo(96, 222); ctx.lineTo(204, 180); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(282, 116); ctx.rotate(-0.16);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'italic 900 84px "Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
  ctx.fillStyle = '#1a1714'; ctx.fillText(text, 0, 0);
  // 字底下一道手画的下划线，末尾带个小箭头（涂鸦上就是这么画的）
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1714';
  ctx.beginPath(); ctx.moveTo(-150, 50); ctx.quadraticCurveTo(-20, 60, 140, 44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-128, 36); ctx.lineTo(-152, 50); ctx.lineTo(-130, 64); ctx.stroke();
  ctx.restore();
  return c;
}
