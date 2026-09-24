// 主角：根据照片"捏"出来的程序化 3D 人物 + 程序化骨骼动画
// 特征：瘦高、短碎发（两侧推短渐变）、浓眉、笑起来眼睛眯成月牙+露齿大笑、深色牛仔夹克、黑色牛仔裤、灰白运动鞋
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../core/textures.js';
import { mulberry32, lerp, clamp, smoothstep, gauss } from '../core/util.js';

// ---------------- 头部造型 ----------------
const HX = 0.073, HY = 0.109, HZ = 0.094;
function headShape(d, out) {
  const up = d.y;
  let x = d.x * HX, y = d.y * HY, z = d.z * HZ;
  const low = smoothstep(-0.05, -0.95, up);
  x *= 1 - 0.3 * low;
  if (d.z > 0) z *= 1 - 0.1 * low + 0.14 * gauss(up, -0.82, 0.16);
  else z *= 1 - 0.42 * low;
  y -= 0.007 * gauss(up, -0.92, 0.22) * Math.max(0, d.z + 0.2);
  x += Math.sign(d.x) * 0.006 * gauss(up, -0.08, 0.2) * gauss(Math.abs(d.x), 0.68, 0.22) * Math.max(0, d.z + 0.3);
  z += 0.006 * gauss(up, 0.26, 0.09) * Math.max(0, d.z) * gauss(d.x, 0, 0.45);
  z -= 0.0045 * gauss(up, 0.08, 0.08) * gauss(Math.abs(d.x), 0.36, 0.13) * Math.max(0, d.z);
  z -= 0.008 * gauss(up, 0.28, 0.33) * Math.max(0, -d.z);
  x *= 1 - 0.05 * gauss(up, 0.4, 0.2);
  z *= 1 - 0.035 * gauss(up, 0.55, 0.2) * Math.max(0, d.z);
  return out.set(x, y, z);
}

function buildHeadGeometry() {
  const g = new THREE.SphereGeometry(1, 72, 56);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const d = new THREE.Vector3(), o = new THREE.Vector3();
  let yTop = -1, yBot = 1;
  const origU = [];
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    headShape(d, o);
    p.setXYZ(i, o.x, o.y, o.z);
    yTop = Math.max(yTop, o.y); yBot = Math.min(yBot, o.y);
    origU.push(uv.getX(i));
  }
  for (let i = 0; i < p.count; i++) uv.setXY(i, origU[i], (p.getY(i) - yBot) / (yTop - yBot));
  g.computeVertexNormals();
  return { geo: g, yTop, yBot };
}

// 头发发型分界：返回某方位角（0=正前）处，长发盖到的最低极角
function capTheta(aphi) {
  return 1.0 + 0.2 * smoothstep(0.2, 1.3, aphi) + 0.26 * smoothstep(1.8, 3.0, aphi);
}

function buildHairGeometry() {
  const g = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.62);
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  const d = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const phi = Math.atan2(d.x, d.z), aphi = Math.abs(phi);
    let th = Math.acos(clamp(d.y, -1, 1));
    const tb = capTheta(aphi);
    th = Math.min(th, tb);
    const sinT = Math.sin(th);
    d.set(Math.sin(phi) * sinT, Math.cos(th), Math.cos(phi) * sinT);
    headShape(d, o);
    n.copy(o).normalize();
    const k = th / tb;
    let thick = 0.004 + 0.02 * Math.pow(1 - k, 0.55);
    thick += 0.006 * gauss(aphi, 0, 0.5) * smoothstep(0.55, 0.95, k);
    thick += 0.003 * Math.sin(phi * 9 + th * 14);
    o.addScaledVector(n, thick);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  g.computeVertexNormals();
  // 碎发发束（向前上方翘）
  const rnd = mulberry32(17);
  const tufts = [];
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();
  for (let i = 0; i < 340; i++) {
    const phi = (rnd() * 2 - 1) * Math.PI;
    const aphi = Math.abs(phi);
    const tb = capTheta(aphi);
    const th = Math.pow(rnd(), 0.7) * (tb - 0.06);
    const sinT = Math.sin(th);
    d.set(Math.sin(phi) * sinT, Math.cos(th), Math.cos(phi) * sinT);
    headShape(d, o);
    n.copy(o).normalize();
    const kk = th / tb;
    o.addScaledVector(n, 0.004 + 0.014 * Math.pow(1 - kk, 0.6));
    const front = gauss(aphi, 0, 0.9);
    // 发束大多贴着头皮向前/向上生长（短碎发），只有前额和头顶略微翘起
    const tv = new THREE.Vector3(Math.sin(phi) * 0.25, 0.25, 1.0);
    const tang = tv.addScaledVector(n, -tv.dot(n)).normalize();
    const lift = 0.16 + 0.34 * front * (1 - kk) * (1 - kk);
    const dir = new THREE.Vector3().copy(n).multiplyScalar(lift).addScaledVector(tang, 1 - lift);
    dir.x += (rnd() - 0.5) * 0.35; dir.y += (rnd() - 0.5) * 0.2;
    dir.normalize();
    const h = 0.011 + rnd() * 0.012 * (0.7 + front * 0.5), r = 0.009 + rnd() * 0.008;
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

// ---------------- 面部贴图 ----------------
function faceMeta(yTop, yBot) {
  const W = 1024, H = 512;
  const rxAt = (y) => HX * (1 - 0.3 * smoothstep(-0.05, -0.95, y / HY));
  const X = (s, y) => {
    const rx = rxAt(y);
    const zf = HZ * Math.sqrt(Math.max(0.04, 1 - (s / rx) ** 2));
    return W / 2 + (Math.atan2(s, zf) / (Math.PI * 2)) * W;
  };
  const Y = (y) => ((yTop - y) / (yTop - yBot)) * H;
  return { W, H, X, Y, yTop, yBot };
}

function buzzLine(aphi) {
  let line = lerp(0.062, 0.05, smoothstep(0.3, 0.8, aphi));
  line = lerp(line, -0.014, gauss(aphi, 1.13, 0.07));
  line = lerp(line, 0.03, smoothstep(1.22, 1.35, aphi));
  line = lerp(line, -0.05, smoothstep(1.95, 2.7, aphi));
  return line;
}

function paintSkinBase(meta) {
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
      let r = 212 + (n - 0.5) * 14, g = 160 + (n - 0.5) * 12, b = 126 + (n - 0.5) * 10;
      // 面部边缘略暗，增加立体感
      const edgeDark = smoothstep(0.55, 1.35, aphi) * 10;
      r -= edgeDark; g -= edgeDark; b -= edgeDark * 0.6;
      // 下颌/脖子略暗
      const jaw = smoothstep(-0.08, -0.125, y);
      r -= jaw * 16; g -= jaw * 16; b -= jaw * 10;
      const line = buzzLine(aphi);
      const k = smoothstep(line - 0.004, line + 0.014, y);
      if (k > 0) {
        const st = noise(px * 0.9, py * 0.9, 921, 460);
        const hr = 34 + st * 30, hg = 30 + st * 26, hb = 30 + st * 26;
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

function paintFeatures(base, meta, { eyes = 'open', mouth = 'grin', brows = 'normal' }) {
  const { W, H, X, Y } = meta;
  const c = TX.makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0);
  // 半写实风格：五官整体放大一点，远处也能看清表情
  const FS = 1.18, FC = 0.004;
  const P = (s, y) => [X(s * FS, (y - FC) * FS + FC), Y((y - FC) * FS + FC)];
  const path = (pts, close = false) => {
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(...P(...pt)) : ctx.moveTo(...P(...pt))));
    if (close) ctx.closePath();
  };
  const curve = (a, cp, b) => { ctx.moveTo(...P(...a)); ctx.quadraticCurveTo(...P(...cp), ...P(...b)); };

  // ---- 眉毛（浓、略平）----
  const browLift = brows === 'raised' ? 0.008 : brows === 'relaxed' ? -0.002 : 0;
  for (const s of [-1, 1]) {
    const y0 = 0.029 + browLift;
    ctx.fillStyle = '#1a1411';
    ctx.beginPath();
    ctx.moveTo(...P(s * 0.011, y0 - 0.002));
    ctx.quadraticCurveTo(...P(s * 0.03, y0 + 0.008), ...P(s * 0.05, y0 + 0.0015));
    ctx.quadraticCurveTo(...P(s * 0.031, y0 + 0.0015), ...P(s * 0.012, y0 - 0.0095));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,20,17,0.6)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 14; k++) {
      const t = k / 13, ss = s * (0.012 + t * 0.036), yy = y0 - 0.004 + Math.sin(t * Math.PI) * 0.006;
      ctx.beginPath(); ctx.moveTo(...P(ss, yy - 0.003)); ctx.lineTo(...P(ss + s * 0.004, yy + 0.003)); ctx.stroke();
    }
  }

  // ---- 眼睛 ----
  for (const s of [-1, 1]) {
    const ex = s * 0.031, ey = 0.009;
    const hw = 0.0135;
    if (eyes === 'open' || eyes === 'wide') {
      const hh = eyes === 'wide' ? 0.0068 : 0.0046;
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
    } else if (eyes === 'closed') {
      ctx.strokeStyle = '#140d0a'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); curve([ex - hw, ey + 0.0005], [ex, ey - 0.004], [ex + hw, ey + 0.0008]); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) { const t = (k + 0.5) / 5; const ss = ex - hw + t * hw * 2; ctx.beginPath(); ctx.moveTo(...P(ss, ey - 0.0028)); ctx.lineTo(...P(ss + s * 0.001, ey - 0.0048)); ctx.stroke(); }
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
  } else if (mouth === 'O') {
    ctx.fillStyle = '#3a110e';
    ctx.beginPath(); ctx.ellipse(...P(0, my - 0.004), 15, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = lip; ctx.lineWidth = 4; ctx.stroke();
  }
  return c;
}

// ---------------- 构建角色 ----------------
export function createCharacter() {
  const root = new THREE.Group();
  root.name = 'player';

  // 材质
  const denim = TX.genDenim({ base: '#1d2840', light: '#33445f', S: 256, seed: 55 });
  const blackDenim = TX.genDenim({ base: '#1b1c20', light: '#2c2e35', S: 256, seed: 56 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#d09a7a', roughness: 0.55 });
  const sleeveMat = new THREE.MeshStandardMaterial({ map: denim.map, normalMap: denim.normalMap, roughness: 0.82 });
  sleeveMat.map.repeat.set(2, 2); sleeveMat.normalMap.repeat.set(2, 2);
  const jeansMat = new THREE.MeshStandardMaterial({ map: blackDenim.map, normalMap: blackDenim.normalMap, roughness: 0.85 });
  jeansMat.map.repeat.set(2, 3); jeansMat.normalMap.repeat.set(2, 3);
  const hairMat = new THREE.MeshStandardMaterial({ color: '#16110f', roughness: 0.58 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#5a5e66', roughness: 0.75 });
  const soleMat = new THREE.MeshStandardMaterial({ color: '#efefea', roughness: 0.7 });
  const btnMat = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.35, metalness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: '#1c1c20', roughness: 0.9 });
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
  const pelvisPts = [[0.0, -0.1], [0.07, -0.098], [0.11, -0.085], [0.135, -0.06], [0.145, -0.02], [0.148, 0.02], [0.146, 0.07]].map(([r, y]) => new THREE.Vector2(r, y));
  addMesh(new THREE.LatheGeometry(pelvisPts, 24), jeansMat, hips, 0, 0, 0, 0, 0, 0, 1, 1, 0.62);

  // 躯干（牛仔夹克）
  const torso = grp('torso', hips, 0, 0.0, 0);
  const prof = [[0.0, 0.16], [0.04, 0.161], [0.08, 0.158], [0.12, 0.155], [0.16, 0.156], [0.2, 0.161], [0.24, 0.168], [0.28, 0.175], [0.32, 0.181], [0.36, 0.186], [0.4, 0.189], [0.44, 0.19], [0.47, 0.186], [0.5, 0.172], [0.52, 0.15], [0.535, 0.115], [0.548, 0.078], [0.558, 0.05]];
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
  const jacketTex = TX.genJacket(denim.canvas, vAt);
  const jacketMat = new THREE.MeshStandardMaterial({ map: jacketTex, normalMap: denim.normalMap, roughness: 0.82 });
  mats.jacketMat = jacketMat;
  const DZ = 0.6;
  addMesh(new THREE.LatheGeometry(pts, 40, Math.PI, Math.PI * 2), jacketMat, torso, 0, 0, 0, 0, 0, 0, 1, 1, DZ);
  // 下摆松紧带
  addMesh(new THREE.TorusGeometry(0.162, 0.012, 6, 40), sleeveMat, torso, 0, 0.012, 0, Math.PI / 2, 0, 0, 1, DZ, 1);
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
  addMesh(new THREE.CylinderGeometry(0.058, 0.06, 0.03, 16), shirtMat, torso, 0, 0.545, 0.004);

  // 脖子 + 头
  const neck = grp('neck', torso, 0, 0.545, 0.005);
  addMesh(new THREE.CylinderGeometry(0.047, 0.053, 0.13, 16), skinMat, neck, 0, 0.05, 0);
  const head = grp('head', neck, 0, 0.125, 0.012);
  head.scale.setScalar(1.12);
  const { geo: headGeo, yTop, yBot } = buildHeadGeometry();
  const meta = faceMeta(yTop, yBot);
  const skinBase = paintSkinBase(meta);
  const faceCache = new Map();
  const faceTex = (key, spec) => {
    if (!faceCache.has(key)) {
      const t = TX.toTex(paintFeatures(skinBase, meta, spec), { wrap: false });
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
  };
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
  const hair = buildHairGeometry();
  addMesh(hair.cap, hairMat, head);
  addMesh(hair.tufts, hairMat, head);

  // 手臂
  const buildArm = (side) => {
    const s = side === 'L' ? 1 : -1;
    const sh = grp(`sh${side}`, torso, s * 0.18, 0.43, -0.005);
    addMesh(new THREE.SphereGeometry(0.05, 16, 12), sleeveMat, sh, -s * 0.006, 0.0, 0, 0, 0, 0, 1, 0.9, 0.9);
    addMesh(new THREE.CapsuleGeometry(0.047, 0.21, 6, 14), sleeveMat, sh, 0, -0.14, 0);
    const el = grp(`el${side}`, sh, 0, -0.285, 0);
    addMesh(new THREE.CapsuleGeometry(0.043, 0.19, 6, 14), sleeveMat, el, 0, -0.115, 0);
    addMesh(new THREE.CylinderGeometry(0.046, 0.045, 0.045, 14), sleeveMat, el, 0, -0.225, 0);
    addMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 10), btnMat, el, s * 0.035, -0.225, 0.036, Math.PI / 2, 0, 0);
    const wr = grp(`wr${side}`, el, 0, -0.255, 0);
    addMesh(new THREE.CylinderGeometry(0.03, 0.033, 0.04, 12), skinMat, wr, 0, 0.01, 0, 0, 0, 0, 1, 1, 0.8);
    // 手掌朝向大腿（自然下垂）
    const hand = new THREE.Group(); hand.rotation.y = -s * Math.PI / 2; wr.add(hand);
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
    const hp = grp(`hip${side}`, hips, s * 0.078, -0.03, 0);
    addMesh(new THREE.SphereGeometry(0.078, 16, 12), jeansMat, hp, s * 0.004, 0.0, 0, 0, 0, 0, 1, 1, 0.95);
    addMesh(new THREE.CylinderGeometry(0.078, 0.058, 0.4, 16), jeansMat, hp, 0, -0.2, 0);
    const kn = grp(`kn${side}`, hp, 0, -0.41, 0);
    addMesh(new THREE.SphereGeometry(0.059, 14, 10), jeansMat, kn, 0, 0.0, 0.004);
    addMesh(new THREE.CylinderGeometry(0.056, 0.05, 0.36, 16), jeansMat, kn, 0, -0.18, 0);
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
  const helmetSlot = new THREE.Group(); helmetSlot.position.set(0, 0.045, -0.005); J.head.add(helmetSlot);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------------- 动画状态 ----------------
  const st = {
    phase: 0, t: 0, blinkT: 2, blinking: 0, expr: 'neutral', exprHold: 0,
    w: { crouch: 0, sit: 0, sleep: 0, reach: 0, cheer: 0, stretch: 0, hold: 0, look: 1, walk: 0, run: 0 },
  };
  const joints = ['hips', 'torso', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR', 'fingL', 'fingR'];
  const pose = {};
  for (const j of joints) pose[j] = new THREE.Vector3();

  function setExpression(name, hold = 0) {
    if (!EXPR[name]) return;
    st.expr = name;
    st.exprHold = hold;
    faceMat.map = faceTex(name, EXPR[name]);
    faceMat.needsUpdate = true;
  }
  function blinkTex(on) {
    const e = EXPR[st.expr];
    if (e.eyes === 'closed' || e.eyes === 'smile') return;
    faceMat.map = on ? faceTex(`${st.expr}_blink`, { ...e, eyes: 'closed' }) : faceTex(st.expr, e);
  }
  // 预生成常用表情，避免运行时卡顿
  for (const k of Object.keys(EXPR)) { faceTex(k, EXPR[k]); if (EXPR[k].eyes === 'open' || EXPR[k].eyes === 'wide') faceTex(`${k}_blink`, { ...EXPR[k], eyes: 'closed' }); }

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
    for (const key of ['crouch', 'sit', 'sleep', 'reach', 'cheer', 'stretch', 'hold']) W[key] = lerp(W[key], prm[key] || 0, 1 - Math.exp(-dt * (key === 'sleep' ? 3 : 8)));
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
    tgt('fingL', 0.35, 0, 0); tgt('fingR', 0.35, 0, 0);
    addp('torso', 0.012 * Math.sin(t * 1.7));
    addp('neck', -0.01 * Math.sin(t * 1.7));
    addp('shL', 0.02 * Math.sin(t * 1.7 + 0.5)); addp('shR', 0.02 * Math.sin(t * 1.7 + 0.5));
    // --- 走/跑 ---
    const ph = st.phase, s = Math.sin(ph), c = Math.cos(ph);
    const wk = W.walk;
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

    // 应用
    J.hips.position.y = hipsY;
    J.hips.position.z = hipsZoff;
    for (const j of joints) {
      const p = pose[j], obj = J[j];
      if (!obj) continue;
      if (j === 'fingL' || j === 'fingR') obj.rotation.set(-p.x, p.y, p.z);
      else obj.rotation.set(p.x, p.y, p.z);
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
    return events;
  }

  const setFirstPerson = (fp) => { J.neck.visible = !fp; };

  return {
    root, J, mats, update, setExpression, setFirstPerson, torch, torchTip, helmetSlot, headMesh,
    get expression() { return st.expr; },
    faceTexture: () => faceMat.map,
  };
}
