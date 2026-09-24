// 结局场景：美军征兵站门前的新兵报到仪式（写实画风，阳光明媚的上午）
//   红毯尽头站着一位穿 AGSU 常服（"粉绿配"）、戴大檐帽的少校，旁边是戴"护林熊"宽檐帽的教官；
//   身后是红砖征兵站、"WELCOME, NEW RECRUITS" 横幅、星条旗和陆军旗；两边看台上的家人们挥着小旗子。
//   主角从一扇孤零零立在广场上的 211 宿舍门里走出来。
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { mulberry32, clamp, lerp } from '../core/util.js';
import { createCharacter } from '../player/character.js';
import { makeServiceCap, makeCampaignHat } from './uniform.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SERIF = '"Georgia","Times New Roman",serif';
const BOLD = '"Arial Black","Helvetica Neue",Arial,"PingFang SC",sans-serif';

function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }); }
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}

// ---------------- 贴图 ----------------
export function drawUSFlag(W = 760, H = 400) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  const sh = H / 13;
  for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#b22234'; ctx.fillRect(0, i * sh, W, sh + 1); }
  const cw = W * 0.4, chh = sh * 7;
  ctx.fillStyle = '#3c3b6e'; ctx.fillRect(0, 0, cw, chh);
  ctx.fillStyle = '#ffffff';
  const star = (x, y, r) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
  // 50 颗星：9 行，6 / 5 交替
  for (let row = 0; row < 9; row++) {
    const n = row % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) star((cw / 12) * (row % 2 ? 2 + k * 2 : 1 + k * 2), (chh / 10) * (row + 1), sh * 0.3);
  }
  return TX.toTex(c, { wrap: false });
}
function drawArmyFlag(W = 760, H = 400) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f5ee'; ctx.fillRect(0, 0, W, H);
  // 黄色流苏边
  ctx.fillStyle = '#e8b830'; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14); ctx.fillRect(W - 16, 0, 16, H);
  // 中间的蓝色徽记（简化：圆 + 星 + 月桂）
  ctx.fillStyle = '#1f3a8a'; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, H * 0.23, 0, 6.28); ctx.fill();
  ctx.strokeStyle = '#e8b830'; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? H * 0.055 : H * 0.13; ctx.lineTo(W / 2 + Math.cos(a) * rr, H * 0.42 + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
  // 红色飘带：UNITED STATES ARMY
  ctx.fillStyle = '#b22234';
  ctx.beginPath(); ctx.moveTo(W * 0.2, H * 0.7); ctx.quadraticCurveTo(W / 2, H * 0.8, W * 0.8, H * 0.7); ctx.lineTo(W * 0.8, H * 0.82); ctx.quadraticCurveTo(W / 2, H * 0.92, W * 0.2, H * 0.82); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${H * 0.07}px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('UNITED STATES ARMY', W / 2, H * 0.805);
  ctx.fillStyle = '#1f3a8a'; ctx.font = `bold ${H * 0.06}px ${SERIF}`; ctx.fillText('1775', W / 2, H * 0.96);
  return TX.toTex(c, { wrap: false });
}
function genBrick(S = 512) {
  const c = TX.makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#d8cfc2'; ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(7001);
  const bh = S / 16, bw = S / 4;
  for (let r = 0; r < 16; r++) for (let k = -1; k < 5; k++) {
    const x = k * bw + (r % 2) * bw / 2, y = r * bh;
    const t = 0.85 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(64 * t)},${Math.round(48 * t)})`;
    ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
  }
  return TX.toTex(c);
}
function genPlaza(S = 512) {
  const c = TX.makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#b9b6ad'; ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(7002);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const t = 0.94 + rnd() * 0.1;
    ctx.fillStyle = `rgb(${Math.round(196 * t)},${Math.round(192 * t)},${Math.round(183 * t)})`;
    ctx.fillRect(i * S / 4 + 3, j * S / 4 + 3, S / 4 - 6, S / 4 - 6);
  }
  for (let k = 0; k < 1500; k++) { ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; ctx.fillRect(rnd() * S, rnd() * S, 2, 2); }
  return TX.toTex(c);
}
function genCarpet() {
  const W = 128, H = 512, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#a3141c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d9a93a'; ctx.fillRect(6, 0, 5, H); ctx.fillRect(W - 11, 0, 5, H);
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  return TX.toTex(c);
}
function genSign(lines, { W = 1024, H = 200, bg = '#ffffff', fg = '#1a1a1a', accent = '#b22234', font = BOLD } = {}) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach(([text, size, color, y]) => { ctx.fillStyle = color || fg; ctx.font = `bold ${size}px ${font}`; ctx.fillText(text, W / 2, H * y); });
  return TX.toTex(c, { wrap: false });
}
function genBanner() {
  const W = 1400, H = 300, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b22234'; ctx.fillRect(0, 0, W, 34); ctx.fillRect(0, H - 34, W, 34);
  ctx.fillStyle = '#3c3b6e'; ctx.fillRect(0, 34, W, 10); ctx.fillRect(0, H - 44, W, 10);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3c3b6e'; ctx.font = `bold 96px ${BOLD}`; ctx.fillText('WELCOME, NEW RECRUITS!', W / 2, H * 0.42);
  ctx.fillStyle = '#b22234'; ctx.font = `bold 56px "PingFang SC","Microsoft YaHei",sans-serif`; ctx.fillText('★ 欢迎新兵报到 · 211 期 ★', W / 2, H * 0.72);
  return TX.toTex(c, { wrap: false });
}
function genBunting() {
  const S = 256, c = TX.makeCanvas(S, S / 2), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S / 2);
  const cols = ['#3c3b6e', '#ffffff', '#b22234', '#ffffff', '#b22234'];
  for (let i = cols.length - 1; i >= 0; i--) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(S / 2, 0, (S / 2) * ((i + 1) / cols.length), 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) { const a = 0.4 + k * 0.58; ctx.beginPath(); ctx.arc(S / 2 + Math.cos(a) * S * 0.08, Math.sin(a) * S * 0.08, 5, 0, 6.28); ctx.fill(); }
  return TX.toTex(c, { wrap: false });
}
function genSky() {
  const c = TX.makeCanvas(16, 256), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3f86d8'); g.addColorStop(0.45, '#8ec3f0'); g.addColorStop(0.62, '#d6ebfa'); g.addColorStop(1, '#eef6fb');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
  return TX.toTex(c, { wrap: false });
}
function genCloud() {
  const c = TX.makeCanvas(256, 128), ctx = c.getContext('2d');
  const rnd = mulberry32(7003);
  for (let k = 0; k < 14; k++) {
    const x = 50 + rnd() * 156, y = 60 + (rnd() - 0.5) * 30, r = 22 + rnd() * 28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  return TX.toTex(c, { wrap: false });
}

// 会飘的旗子：顶点着色器里加一个波浪
function waveFlag(tex, w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 12);
  geo.translate(w / 2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
  const U = { time: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float k = position.x / ${w.toFixed(2)};
        transformed.z += sin(position.x * 3.2 - time * 4.2) * 0.12 * k + sin(position.x * 5.1 - time * 6.3 + position.y * 2.0) * 0.04 * k;
        transformed.y -= k * k * 0.06;`)
      .replace('#include <beginnormal_vertex>', `
        float kk = position.x / ${w.toFixed(2)};
        float dz = cos(position.x * 3.2 - time * 4.2) * 3.2 * 0.12 * kk + cos(position.x * 5.1 - time * 6.3 + position.y * 2.0) * 5.1 * 0.04 * kk;
        vec3 objectNormal = normalize(vec3(-dz, 0.0, 1.0));`);
  };
  mat.customProgramCacheKey = () => 'waveFlag';
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return { mesh: m, U };
}

// ---------------- 看台上的家人们（实例化，几十个人只要几次绘制）----------------
function buildCrowd(root, spots) {
  const n = spots.length;
  const rnd = mulberry32(7010);
  const bodyG = new THREE.CapsuleGeometry(0.16, 0.34, 4, 10); bodyG.scale(1, 1, 0.75); bodyG.translate(0, 1.04, 0);
  const legG = new THREE.CapsuleGeometry(0.068, 0.6, 3, 8); legG.translate(0, 0.38, 0);
  const headG = new THREE.SphereGeometry(0.105, 14, 10);
  const hairG = new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const armG = new THREE.CapsuleGeometry(0.045, 0.34, 3, 6); armG.translate(0, 0.2, 0);
  const flagG = new THREE.PlaneGeometry(0.22, 0.13); flagG.translate(0.11, 0, 0);
  const mk = (g, mat, cnt = n) => { const m = new THREE.InstancedMesh(g, mat, cnt); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  const body = mk(bodyG, std('#ffffff', { roughness: 0.85 }));
  const legs = mk(legG, std('#ffffff', { roughness: 0.85 }), n * 2);
  const head = mk(headG, std('#ffffff', { roughness: 0.6 }));
  const hair = mk(hairG, std('#ffffff', { roughness: 0.7 }));
  const arm = mk(armG, std('#ffffff', { roughness: 0.85 }), n * 2);
  const flagMat = new THREE.MeshStandardMaterial({ map: drawUSFlag(190, 100), side: THREE.DoubleSide, roughness: 0.8 });
  const flag = mk(flagG, flagMat);
  const shirts = ['#2f5fa8', '#b22234', '#f2f2f2', '#3a7a4a', '#e8b830', '#6a4a8a', '#222428', '#d86a3a', '#8ab4e8'];
  const pants = ['#2a3a5a', '#1c1c20', '#b9a27a', '#4a5a6a', '#3a3a3a'];
  const skins = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#ffdbac', '#b97a56'];
  const hairs = ['#1a1410', '#4a3020', '#8a5a30', '#d8b060', '#2a2a2a', '#b8b8b0'];
  const people = spots.map((p, i) => {
    const s = 0.9 + rnd() * 0.18;
    const c = new THREE.Color();
    body.setColorAt(i, c.set(shirts[(rnd() * shirts.length) | 0]));
    arm.setColorAt(i * 2, c); arm.setColorAt(i * 2 + 1, c);
    c.set(pants[(rnd() * pants.length) | 0]); legs.setColorAt(i * 2, c); legs.setColorAt(i * 2 + 1, c);
    head.setColorAt(i, c.set(skins[(rnd() * skins.length) | 0]));
    hair.setColorAt(i, c.set(hairs[(rnd() * hairs.length) | 0]));
    flag.setColorAt(i, c.set('#ffffff'));
    return { p, s, ph: rnd() * 6.28, sp: 4 + rnd() * 4, yaw: p.yaw || 0, wave: rnd() < 0.75 };
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), e = new THREE.Euler(), sc = V(), pos = V(), off = V(), fp = V();
  const update = (t, excite = 0) => {
    people.forEach((P, i) => {
      const jump = Math.max(0, Math.sin(t * P.sp * 0.5 + P.ph)) * 0.06 * excite;
      const y0 = P.p.y + jump;
      q.setFromEuler(e.set(0, P.yaw, 0)); sc.setScalar(P.s);
      m4.compose(pos.set(P.p.x, y0, P.p.z), q, sc); body.setMatrixAt(i, m4);
      for (const k of [0, 1]) { off.set((k ? 0.075 : -0.075) * P.s, 0, 0).applyQuaternion(q); m4.compose(pos.set(P.p.x + off.x, y0, P.p.z + off.z), q, sc); legs.setMatrixAt(i * 2 + k, m4); }
      m4.compose(pos.set(P.p.x, y0 + 1.5 * P.s, P.p.z), q, sc); head.setMatrixAt(i, m4); hair.setMatrixAt(i, m4);
      // 右手举着小旗子挥，左手垂着
      const sw = P.wave ? Math.sin(t * P.sp + P.ph) * (0.5 + excite * 0.4) : 0;
      off.set(-0.2 * P.s, 1.3 * P.s, 0).applyQuaternion(q);
      qa.setFromEuler(e.set(0, P.yaw, P.wave ? 2.6 + sw * 0.4 - 0.2 : Math.PI + 0.12, 'YXZ'));
      m4.compose(pos.set(P.p.x + off.x, y0 + off.y, P.p.z + off.z), qa, sc); arm.setMatrixAt(i * 2, m4);
      fp.copy(pos).add(off.set(0, 0.42 * P.s, 0).applyQuaternion(qa));
      const qf = qa.clone().multiply(new THREE.Quaternion().setFromEuler(e.set(0, Math.sin(t * 6 + P.ph) * 0.4, -Math.PI / 2)));
      m4.compose(fp, qf, P.wave ? sc : off.set(0, 0, 0)); flag.setMatrixAt(i, m4);
      off.set(0.2 * P.s, 1.3 * P.s, 0).applyQuaternion(q);
      qa.setFromEuler(e.set(0, P.yaw, Math.PI - 0.12 - excite * Math.max(0, Math.sin(t * P.sp * 0.7 + P.ph)) * 2.2, 'YXZ'));
      m4.compose(pos.set(P.p.x + off.x, y0 + off.y, P.p.z + off.z), qa, sc); arm.setMatrixAt(i * 2 + 1, m4);
    });
    for (const m of [body, legs, head, hair, arm, flag]) m.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { update, meshes: [body, legs, head, hair, arm, flag] };
}

// ================= 搭场景 =================
export function buildFinale(scene) {
  const root = new THREE.Group(); root.name = 'finale';
  scene.add(root);
  const refs = { root, theme: 'finale', interact: {}, occluders: [], camBoxes: [], lights: {}, mirrors: [], updaters: [] };
  const add = (o) => { root.add(o); return o; };
  const rnd = mulberry32(7020);

  // 天空 + 云
  const sky = mesh(new THREE.SphereGeometry(38, 32, 16), new THREE.MeshBasicMaterial({ map: genSky(), side: THREE.BackSide, fog: false, depthWrite: false }), { cast: false, recv: false });
  sky.renderOrder = -10;
  add(sky);
  const cloudTex = genCloud();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const a = -Math.PI * 0.9 + rnd() * Math.PI * 0.8;
    sp.position.set(Math.cos(a) * 30, 10 + rnd() * 8, Math.sin(a) * 30);
    sp.scale.set(11 + rnd() * 8, 5 + rnd() * 2.5, 1);
    add(sp); clouds.push({ sp, a, r: 30, sp0: 0.004 + rnd() * 0.004 });
  }
  // 地面：广场 + 草地
  const plazaTex = genPlaza(); plazaTex.repeat.set(14, 14);
  add(mesh(new THREE.PlaneGeometry(28, 28), std('#ffffff', { map: plazaTex, roughness: 0.85 }), { rx: -Math.PI / 2, cast: false }));
  add(mesh(new THREE.PlaneGeometry(70, 70), std('#6f9a4a', { roughness: 1 }), { rx: -Math.PI / 2, y: -0.01, cast: false }));
  // 红毯：从 211 的门一直铺到长官脚下
  const carpetTex = genCarpet(); carpetTex.repeat.set(1, 4);
  add(mesh(new THREE.PlaneGeometry(1.5, 9), std('#ffffff', { map: carpetTex, roughness: 0.95 }), { rx: -Math.PI / 2, y: 0.008, z: 2.6, cast: false }));

  // 征兵站：红砖楼 + 玻璃门 + 招牌 + 横幅 + 彩旗
  const brick = genBrick(); brick.repeat.set(6, 3);
  const bld = new THREE.Group(); bld.position.set(0, 0, -6.5); add(bld);
  bld.add(mesh(new THREE.BoxGeometry(18, 7, 1), std('#ffffff', { map: brick, roughness: 0.9 }), { y: 3.5 }));
  bld.add(mesh(new THREE.BoxGeometry(18.4, 0.4, 1.3), std('#e9e4d8'), { y: 7.1 }));
  bld.add(mesh(new THREE.BoxGeometry(18.2, 0.25, 1.15), std('#e9e4d8'), { y: 3.35 }));
  const glass = std('#3a4a5a', { roughness: 0.08, metalness: 0.6 });
  const frame = std('#e9e4d8', { roughness: 0.5 });
  for (const x of [-7, -4.6, 4.6, 7]) for (const y of [1.7, 5.2]) {
    bld.add(mesh(new THREE.BoxGeometry(1.5, 1.7, 0.1), frame, { x, y, z: 0.5 }));
    bld.add(mesh(new THREE.BoxGeometry(1.3, 1.5, 0.1), glass, { x, y, z: 0.53 }));
  }
  for (const x of [-2.2, 2.2]) for (const y of [5.2]) { bld.add(mesh(new THREE.BoxGeometry(1.5, 1.7, 0.1), frame, { x, y, z: 0.5 })); bld.add(mesh(new THREE.BoxGeometry(1.3, 1.5, 0.1), glass, { x, y, z: 0.53 })); }
  // 大门 + 门廊
  bld.add(mesh(new THREE.BoxGeometry(3.2, 2.9, 0.1), frame, { y: 1.45, z: 0.5 }));
  bld.add(mesh(new THREE.BoxGeometry(2.9, 2.7, 0.12), glass, { y: 1.35, z: 0.52 }));
  bld.add(mesh(new THREE.BoxGeometry(0.06, 2.7, 0.14), frame, { y: 1.35, z: 0.54 }));
  bld.add(mesh(new THREE.BoxGeometry(4.2, 0.18, 1.6), std('#f4f1ea'), { y: 3.05, z: 1.1 }));
  for (const x of [-1.9, 1.9]) bld.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.0, 12), std('#f4f1ea'), { x, y: 1.5, z: 1.75 }));
  bld.add(mesh(new THREE.BoxGeometry(5, 0.15, 2.4), std('#cfcac0'), { y: 0.075, z: 1.2, cast: false }));
  // 招牌
  const signTex = genSign([['U.S. ARMY', 110, '#1a1a1a', 0.38], ['RECRUITING STATION · 征兵站', 56, '#b22234', 0.78]], { W: 1024, H: 240, bg: '#f4f1ea' });
  bld.add(mesh(new THREE.PlaneGeometry(4.2, 0.98), std('#ffffff', { map: signTex, roughness: 0.6 }), { y: 3.9, z: 0.515, cast: false }));
  // 金色五角星
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.16 : 0.4; k ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starG = new THREE.ExtrudeGeometry(starShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  bld.add(mesh(starG, std('#e8b830', { metalness: 0.8, roughness: 0.3 }), { y: 6.0, z: 0.52 }));
  // 横幅
  const banner = mesh(new THREE.PlaneGeometry(7.2, 1.55, 20, 4), new THREE.MeshStandardMaterial({ map: genBanner(), side: THREE.DoubleSide, roughness: 0.8 }), { y: 4.9, z: 0.62 });
  const bp = banner.geometry.attributes.position; for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin((bp.getX(i) / 7.2 + 0.5) * Math.PI) * 0.12);
  banner.geometry.computeVertexNormals();
  bld.add(banner);
  refs.banner = banner;
  // 窗下的红白蓝扇形彩旗
  const buntTex = genBunting();
  for (const x of [-7, -4.6, 4.6, 7, -2.2, 2.2]) bld.add(mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: buntTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), { x, y: x === -2.2 || x === 2.2 ? 4.12 : 2.35, z: 0.57, cast: false }));
  // 楼后面的树
  const trunk = std('#6a4a30'), leaf = std('#4f8a3a', { roughness: 0.9 }), leaf2 = std('#6aa048', { roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const x = -13 + i * 2 + rnd(), z = -9 - rnd() * 4, h = 3 + rnd() * 2.5;
    add(mesh(new THREE.CylinderGeometry(0.14, 0.2, h, 8), trunk, { x, y: h / 2, z }));
    add(mesh(new THREE.SphereGeometry(1.4 + rnd() * 0.6, 12, 10), rnd() < 0.5 ? leaf : leaf2, { x, y: h + 0.6, z }));
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = s * (10 + i * 1.8 + rnd()), z = -3 + i * 3.2;
    add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 8), trunk, { x, y: 1.5, z }));
    add(mesh(new THREE.SphereGeometry(1.5, 12, 10), leaf, { x, y: 3.6, z }));
  }

  // 旗杆：观众看过去，星条旗在左、陆军旗在右
  const flags = [];
  const pole = (x, tex) => {
    add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 7.5, 12), std('#e8eaee', { metalness: 0.8, roughness: 0.25 }), { x, y: 3.75, z: -3.2 }));
    add(mesh(new THREE.SphereGeometry(0.12, 14, 10), std('#e8b830', { metalness: 0.9, roughness: 0.2 }), { x, y: 7.6, z: -3.2 }));
    add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), std('#cfcac0'), { x, y: 0.125, z: -3.2 }));
    const f = waveFlag(tex, 2.4, 1.3);
    f.mesh.position.set(x + 0.06, 6.6, -3.2);
    f.mesh.rotation.y = x < 0 ? -0.35 : Math.PI + 0.35;
    add(f.mesh); flags.push(f);
  };
  pole(-3.4, drawUSFlag());
  pole(3.4, drawArmyFlag());
  // 讲台后面的小旗架
  // 报到桌
  const table = new THREE.Group(); table.position.set(-2.5, 0, 0.2); table.rotation.y = 0.5; add(table);
  table.add(mesh(new THREE.BoxGeometry(1.8, 0.05, 0.75), std('#f7f5ee'), { y: 0.76 }));
  const skirtC = TX.makeCanvas(512, 128), sx = skirtC.getContext('2d');
  sx.fillStyle = '#3c3b6e'; sx.fillRect(0, 0, 512, 128); sx.fillStyle = '#fff';
  for (let k = 0; k < 16; k++) { const x = 16 + k * 32, y = 32 + (k % 2) * 40; sx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, r = j % 2 ? 4 : 10; sx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } sx.fill(); }
  table.add(mesh(new THREE.BoxGeometry(1.82, 0.72, 0.77), std('#ffffff', { map: TX.toTex(skirtC, { wrap: false }) }), { y: 0.38 }));
  const repTex = genSign([['REPORTING', 76, '#3c3b6e', 0.38], ['新兵报到处', 60, '#b22234', 0.76]], { W: 512, H: 200, bg: '#ffffff' });
  table.add(mesh(new THREE.BoxGeometry(0.62, 0.26, 0.02), std('#ffffff', { map: repTex }), { y: 0.93, z: 0.25, rx: -0.15 }));
  table.add(mesh(new THREE.BoxGeometry(0.24, 0.01, 0.32), std('#8a6a40'), { x: 0.5, y: 0.79, z: 0 }));
  table.add(mesh(new THREE.BoxGeometry(0.21, 0.005, 0.28), std('#ffffff'), { x: 0.5, y: 0.8, z: 0 }));
  for (let i = 0; i < 3; i++) table.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), std('#bfe0ff', { transparent: true, opacity: 0.7 }), { x: -0.6 + i * 0.09, y: 0.9, z: -0.15 }));
  // 一摞装着新军帽的盒子
  for (let i = 0; i < 3; i++) table.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.3), std(i % 2 ? '#3a3a2c' : '#4a4833'), { x: -0.15, y: 0.85 + i * 0.145, z: -0.05, ry: i * 0.1 }));

  // 看台 + 家人们
  const bleacherM = std('#c8ccd4', { metalness: 0.5, roughness: 0.4 });
  const spots = [];
  for (const s of [-1, 1]) {
    const bx = s * 5.2;
    for (let r = 0; r < 3; r++) {
      add(mesh(new THREE.BoxGeometry(2.4, 0.08, 6.5), bleacherM, { x: bx + s * r * 0.9, y: 0.35 + r * 0.45, z: 2.2 }));
      add(mesh(new THREE.BoxGeometry(0.06, 0.35 + r * 0.45, 6.5), bleacherM, { x: bx + s * r * 0.9 - s * 1.1, y: (0.35 + r * 0.45) / 2, z: 2.2 }));
      for (let k = 0; k < 7; k++) if (rnd() < 0.85) spots.push({ x: bx + s * r * 0.9 + (rnd() - 0.5) * 0.4, y: 0.39 + r * 0.45, z: -0.6 + k * 0.92 + (rnd() - 0.5) * 0.2, yaw: s < 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25 });
    }
  }
  // 桌子旁边排队的几个新兵（便装）
  for (let i = 0; i < 4; i++) spots.push({ x: -3.6 - i * 0.55, y: 0, z: 0.9 + i * 0.35, yaw: 0.55 + Math.PI });
  const crowd = buildCrowd(root, spots);
  // 气球拱门（入口）
  const bcol = [std('#b22234', { roughness: 0.3 }), std('#ffffff', { roughness: 0.3 }), std('#2f4a9a', { roughness: 0.3 })];
  const bG = new THREE.SphereGeometry(0.2, 14, 10);
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI;
    const m = mesh(bG, bcol[i % 3], { x: Math.cos(a) * 2.35, y: 0.3 + Math.sin(a) * 3.1, z: -4.5, s: [1, 1.15, 1] });
    add(m);
  }

  // 那扇 211 的门：孤零零立在广场上，门里透着白光
  const door = new THREE.Group(); door.position.set(0, 0, 6.6); add(door);
  const wood = std('#5a2e1c', { roughness: 0.55 });
  door.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.2), wood, { x: -0.52, y: 1.1 }));
  door.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.2), wood, { x: 0.52, y: 1.1 }));
  door.add(mesh(new THREE.BoxGeometry(1.16, 0.12, 0.2), wood, { y: 2.16 }));
  const leafPivot = new THREE.Group(); leafPivot.position.set(0.46, 0, 0.1); door.add(leafPivot);
  const leafM = mesh(new THREE.BoxGeometry(0.9, 2.05, 0.045), std('#6a3622', { roughness: 0.5 }), { x: -0.45, y: 1.03 });
  leafPivot.add(leafM);
  const numC = TX.makeCanvas(128, 64), nc = numC.getContext('2d');
  nc.fillStyle = '#f4f1e6'; nc.fillRect(0, 0, 128, 64); nc.fillStyle = '#b3261e'; nc.font = 'bold 44px Arial'; nc.textAlign = 'center'; nc.fillText('211', 64, 48);
  leafM.add(mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: TX.toTex(numC, { wrap: false }) }), { y: 0.7, z: -0.024, ry: Math.PI, cast: false }));
  leafPivot.rotation.y = -1.9;
  const glowC = TX.makeCanvas(64, 128), gx = glowC.getContext('2d');
  const gg = gx.createRadialGradient(32, 64, 4, 32, 64, 64); gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(210,235,255,0.75)');
  gx.fillStyle = gg; gx.fillRect(0, 0, 64, 128);
  const portal = mesh(new THREE.PlaneGeometry(0.92, 2.1), new THREE.MeshBasicMaterial({ map: TX.toTex(glowC, { wrap: false }), transparent: true, toneMapped: false }), { y: 1.05, z: -0.02, ry: Math.PI, cast: false });
  door.add(portal);
  refs.door211 = { group: door, leaf: leafPivot, portal };

  // 灯光：上午的太阳 + 天光
  const hemi = new THREE.HemisphereLight('#d6e8ff', '#8a7a5a', 0.9); add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e2', 2.8);
  sun.position.set(7, 11, 9); sun.target.position.set(0, 0, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  add(sun); add(sun.target);
  refs.lights = { hemi, sun };
  scene.fog = new THREE.Fog('#dcebf7', 20, 40);
  scene.background = new THREE.Color('#bcdcf4');

  // 人物：少校（军官）+ 教官
  const officer = createCharacter({ outfit: 'agsu', name: 'SMITH', skin: [226, 178, 146], skinColor: '#e2b292', hair: [120, 96, 70], hairColor: '#6a5038', brow: '#5a4030', mustache: true });
  officer.root.position.set(0, 0, 0); officer.root.rotation.y = 0;
  const offCap = makeServiceCap({ officer: true });
  officer.helmetSlot.add(offCap);
  add(officer.root);
  const sarge = createCharacter({ outfit: 'agsu', name: 'JOHNSON', skin: [140, 96, 70], skinColor: '#8c6046', hair: [20, 16, 14], hairColor: '#141010', brow: '#141010' });
  sarge.root.position.set(1.55, 0, -0.35); sarge.root.rotation.y = -0.35;
  sarge.helmetSlot.add(makeCampaignHat());
  add(sarge.root);
  // 要送给主角的那顶大檐帽（士兵款）
  const giftCap = makeServiceCap({ officer: false });
  add(giftCap);
  refs.officer = officer; refs.sarge = sarge; refs.giftCap = giftCap; refs.officerCap = offCap;
  refs.flags = flags; refs.crowd = crowd;
  refs.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

  // 每帧：旗子、云、观众
  refs.excite = 0;
  refs.updaters.push((dt, t) => {
    for (const f of flags) f.U.time.value = t;
    for (const c of clouds) { c.a += dt * c.sp0; c.sp.position.x = Math.cos(c.a) * c.r; c.sp.position.z = Math.sin(c.a) * c.r; }
    crowd.update(t, refs.excite);
    refs.door211.portal.material.opacity = 0.85 + Math.sin(t * 3) * 0.1;
  });
  root.updateMatrixWorld(true);
  return refs;
}
