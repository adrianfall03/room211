// 结局场景：美军征兵站门前的新兵报到仪式——写实电影感（和第四章一个标准）
//   · 物理天空（Preetham 大气散射 + 云层），天光拿来做环境反射：玻璃窗、金属、红毯上都有天空的影子
//   · 带法线 / 粗糙度贴图的红砖楼、混凝土方砖广场、草坪；窗户有石材窗台和过梁，玻璃后面是半开的百叶窗
//   · 树是一根根树枝 + 几千片会随风轻轻晃的叶片贴片；远处一圈林带被晨雾染淡
//   · 看台是铝合金的；观众是实例化的人（衣服、帽子、墨镜、小旗子），挥手、鼓掌、跳起来欢呼
//   · 红毯两边是金色立柱和天鹅绒拦绳，尽头两名仪仗兵立正；场景里所有的字都是英文
//   主角在红毯另一头的新兵候场区里坐着睡着了——四个 211 全是一场梦，被教官一嗓子喊醒。
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../core/textures.js';
import * as TF from '../core/tex_finale.js';
import { genBark } from '../core/tex_jungle.js';
import { mulberry32, clamp, lerp } from '../core/util.js';
import { createCharacter } from '../player/character.js';
import { makeServiceCap, makeCampaignHat } from './uniform.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SERIF = '"Georgia","Times New Roman",serif';
const SANS = '"Helvetica Neue","Arial Black",Arial,sans-serif';
// 上午九点多的太阳：从东南方斜照过来（主角、少校的脸都迎着光）
const SUN_DIR = V(0.52, 0.5, 0.69).normalize();
// 物理天空的亮度是按"曝光 0.5"调的，这里整体压一压，不然天是一片死白、泛光糊满全屏
function makeSky(gain) {
  const sky = new Sky();
  const m = sky.material;
  m.uniforms.skyGain = { value: gain };
  m.fragmentShader = 'uniform float skyGain;\n' + m.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 );');
  return sky;
}

function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }); }
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = recv;
  return m;
}
// 按世界坐标铺 UV（砖、石材、地砖不管多大都是真实尺寸，不会拉伸）：几何体先挪到世界坐标里再算
function worldUV(geo, tile = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = -p.getZ(i); }
    else if (ax >= az) { u = -p.getZ(i) * Math.sign(n.getX(i)); v = p.getY(i); }
    else { u = p.getX(i) * Math.sign(n.getZ(i)); v = p.getY(i); }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geo;
}
const wbox = (w, h, d, x, y, z, mat, tile = 1, o = {}) => mesh(worldUV(new THREE.BoxGeometry(w, h, d).translate(x, y, z), tile), mat, o);

// 不会动的网格按"材质 + 投不投影"合并：几百个窗框、台阶、看台零件、气球……最后只剩几十次绘制
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const groups = new Map(), remove = [];
  const visit = (o) => {
    if (keep.has(o)) return;
    const m = o.material;
    if (o.isMesh && !o.isInstancedMesh && o.visible && m && !Array.isArray(m) && !m.transparent && !o.isSky) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      const key = m.uuid + (o.castShadow ? '|c' : '|n') + (o.receiveShadow ? 'r' : '');
      if (!groups.has(key)) groups.set(key, { m, cast: o.castShadow, recv: o.receiveShadow, list: [] });
      groups.get(key).list.push(g);
      remove.push(o);
    }
    for (const c of o.children.slice()) visit(c);
  };
  visit(root);
  for (const o of remove) o.parent.remove(o);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const { m, cast, recv, list } of groups.values()) {
    const g = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    g.applyMatrix4(inv);
    const mm = new THREE.Mesh(g, m); mm.castShadow = cast; mm.receiveShadow = recv; mm.name = 'finaleStatic';
    root.add(mm);
  }
}

// ---------------- 旗子 ----------------
export function drawUSFlag(W = 760, H = 400) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  const sh = H / 13;
  for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? '#f4f1ea' : '#a51d2d'; ctx.fillRect(0, i * sh, W, sh + 1); }
  const cw = W * 0.4, chh = sh * 7;
  ctx.fillStyle = '#2b2d5c'; ctx.fillRect(0, 0, cw, chh);
  ctx.fillStyle = '#f4f1ea';
  const star = (x, y, r) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
  for (let row = 0; row < 9; row++) {
    const n = row % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) star((cw / 12) * (row % 2 ? 2 + k * 2 : 1 + k * 2), (chh / 10) * (row + 1), sh * 0.3);
  }
  // 布料的经纬纹
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; for (let x = 0; x < W; x += 2) ctx.fillRect(x, 0, 1, H);
  return TX.toTex(c, { wrap: false });
}
function drawArmyFlag(W = 760, H = 400) {
  const c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f2ea'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c9a03a'; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14); ctx.fillRect(W - 16, 0, 16, H);
  ctx.fillStyle = '#1f3570'; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, H * 0.23, 0, 6.28); ctx.fill();
  ctx.strokeStyle = '#c9a03a'; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = '#f4f2ea';
  ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? H * 0.055 : H * 0.13; ctx.lineTo(W / 2 + Math.cos(a) * rr, H * 0.42 + Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a51d2d';
  ctx.beginPath(); ctx.moveTo(W * 0.2, H * 0.7); ctx.quadraticCurveTo(W / 2, H * 0.8, W * 0.8, H * 0.7); ctx.lineTo(W * 0.8, H * 0.82); ctx.quadraticCurveTo(W / 2, H * 0.92, W * 0.2, H * 0.82); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4f2ea'; ctx.font = `bold ${H * 0.07}px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('UNITED STATES ARMY', W / 2, H * 0.805);
  ctx.fillStyle = '#1f3570'; ctx.font = `bold ${H * 0.06}px ${SERIF}`; ctx.fillText('1775', W / 2, H * 0.96);
  ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  return TX.toTex(c, { wrap: false });
}
function genBanner() {
  const W = 1400, H = 300, c = TX.makeCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f5ef'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#a51d2d'; ctx.fillRect(0, 0, W, 30); ctx.fillRect(0, H - 30, W, 30);
  ctx.fillStyle = '#2b2d5c'; ctx.fillRect(0, 30, W, 9); ctx.fillRect(0, H - 39, W, 9);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2b2d5c'; ctx.font = `bold 100px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText('WELCOME, NEW RECRUITS!', W / 2, H * 0.44);
  ctx.fillStyle = '#a51d2d'; ctx.font = `bold 46px ${SANS}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.fillText('★  RECRUIT CLASS 211  ★', W / 2, H * 0.73);
  // 金属扣眼
  for (const x of [26, W - 26]) for (const y of [52, H - 52]) { ctx.fillStyle = '#9a9a96'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.28); ctx.fill(); ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.28); ctx.fill(); }
  // 塑料布的一点褶皱反光
  const g = ctx.createLinearGradient(0, 0, W, 0);
  for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, `rgba(0,0,0,${k % 2 ? 0.05 : 0})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return TX.toTex(c, { wrap: false });
}
function genBunting() {
  const S = 256, c = TX.makeCanvas(S, S / 2), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S / 2);
  const cols = ['#2b2d5c', '#f4f1ea', '#a51d2d', '#f4f1ea', '#a51d2d'];
  for (let i = cols.length - 1; i >= 0; i--) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(S / 2, 0, (S / 2) * ((i + 1) / cols.length), 0, Math.PI); ctx.fill(); }
  ctx.fillStyle = '#f4f1ea'; for (let k = 0; k < 5; k++) { const a = 0.4 + k * 0.58; ctx.beginPath(); ctx.arc(S / 2 + Math.cos(a) * S * 0.08, Math.sin(a) * S * 0.08, 5, 0, 6.28); ctx.fill(); }
  // 褶子
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2 + Math.cos(a) * S / 2, Math.sin(a) * S / 2); ctx.stroke(); }
  return TX.toTex(c, { wrap: false });
}

// 会飘的旗子：顶点着色器里加一个波浪
function waveFlag(tex, w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 12);
  geo.translate(w / 2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
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

// ---------------- 树：树干 + 一层层分叉的树枝（合成一个网格）+ 叶片贴片（全场合成一个实例化网格）----------------
function limbGeo(a, b, r0, r1, seg = 7) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  // 树皮纹路要顺着树枝走：UV 的两个方向对调
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * len * 1.2, u * (r0 + r1) * 4); }
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
function growTree(rnd, base, height, spread, wood, cards) {
  const trunkTop = base.clone().add(V((rnd() - 0.5) * 0.3, height * 0.42, (rnd() - 0.5) * 0.3));
  const r0 = 0.12 + height * 0.022;
  wood.push(limbGeo(base.clone().setY(-0.1), trunkTop, r0 * 1.25, r0 * 0.8, 9));
  const grow = (a, dir, len, r, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    wood.push(limbGeo(a, b, r, r * 0.62, depth > 1 ? 7 : 5));
    if (depth <= 0) {
      // 枝头：几片叶片贴片
      const n = 3 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) cards.push({ p: b.clone().add(V((rnd() - 0.5) * 0.7, (rnd() - 0.2) * 0.6, (rnd() - 0.5) * 0.7)), s: 0.9 + rnd() * 0.7, r: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], c: rnd() });
      return;
    }
    const kids = depth === 3 ? 4 + ((rnd() * 2) | 0) : 2 + ((rnd() * 2) | 0);
    for (let k = 0; k < kids; k++) {
      const out = V(Math.cos((k / kids) * 6.28 + rnd()), 0, Math.sin((k / kids) * 6.28 + rnd()));
      const nd = dir.clone().multiplyScalar(0.55).add(out.multiplyScalar(spread * (0.5 + rnd() * 0.5))).add(V(0, 0.25 + rnd() * 0.35, 0)).normalize();
      grow(b, nd, len * (0.62 + rnd() * 0.18), r * 0.62, depth - 1);
    }
    // 中间也挂几片，树冠别是空心的
    if (depth <= 2) for (let k = 0; k < 2; k++) cards.push({ p: a.clone().lerp(b, 0.5 + rnd() * 0.5).add(V((rnd() - 0.5) * 0.6, rnd() * 0.3, (rnd() - 0.5) * 0.6)), s: 0.8 + rnd() * 0.6, r: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], c: rnd() });
  };
  grow(trunkTop, V(0, 1, 0), height * 0.26, r0 * 0.8, 3);
}

// ---------------- 看台上的家人们（实例化：几十个人只要十几次绘制）----------------
// 每个人：腿、鞋、上身、脖子、头、头发 / 帽子、墨镜、两条胳膊（上臂 + 小臂 + 手）、手里的小旗子
function buildCrowd(root, spots, flagTex) {
  const n = spots.length, rnd = mulberry32(7010);
  const G = {};
  G.leg = new THREE.CapsuleGeometry(0.066, 0.64, 4, 10); G.leg.translate(0, 0.44, 0);
  G.shoe = new RoundedBoxGeometry(0.1, 0.07, 0.25, 2, 0.02); G.shoe.translate(0, 0.035, 0.03);
  const prof = [[0.001, 0.8], [0.16, 0.82], [0.158, 0.95], [0.148, 1.08], [0.17, 1.26], [0.19, 1.37], [0.15, 1.44], [0.06, 1.47], [0.001, 1.48]].map(([r, y]) => new THREE.Vector2(r, y));
  G.torso = new THREE.LatheGeometry(prof, 18); G.torso.scale(1, 1, 0.64);
  G.neck = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10); G.neck.translate(0, 1.52, 0);
  G.head = new THREE.SphereGeometry(0.1, 18, 14); G.head.scale(0.92, 1.12, 1.0); G.head.translate(0, 1.66, 0.005);
  G.hair = new THREE.SphereGeometry(0.106, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56); G.hair.scale(0.94, 1.1, 1.03); G.hair.translate(0, 1.672, -0.008);
  const capC = new THREE.SphereGeometry(0.108, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); capC.scale(0.95, 0.85, 1.02); capC.translate(0, 1.7, 0);
  const capB = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16, 1, false, -1, 2); capB.scale(0.9, 1, 1.3); capB.translate(0, 1.7, 0.07);
  G.cap = mergeGeometries([capC, capB]);
  G.shades = new RoundedBoxGeometry(0.15, 0.035, 0.03, 1, 0.01); G.shades.translate(0, 1.675, 0.098);
  G.upper = new THREE.CapsuleGeometry(0.05, 0.22, 4, 10); G.upper.translate(0, -0.14, 0);
  G.fore = new THREE.CapsuleGeometry(0.043, 0.2, 4, 10); G.fore.translate(0, -0.13, 0);
  G.hand = new THREE.SphereGeometry(0.045, 10, 8); G.hand.scale(0.8, 1.15, 0.6); G.hand.translate(0, -0.05, 0);
  G.flag = new THREE.PlaneGeometry(0.24, 0.14); G.flag.translate(0.12, 0.24, 0);
  G.stick = new THREE.CylinderGeometry(0.006, 0.006, 0.42, 5); G.stick.translate(0, 0.12, 0);
  const cloth = std('#ffffff', { roughness: 0.88 }), skin = std('#ffffff', { roughness: 0.55 }), hairM = std('#ffffff', { roughness: 0.65 }), shoeM = std('#ffffff', { roughness: 0.5 });
  const mk = (g, mat, cnt) => { const m = new THREE.InstancedMesh(g, mat, cnt); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; root.add(m); return m; };
  const M = {
    leg: mk(G.leg, cloth, n * 2), shoe: mk(G.shoe, shoeM, n * 2), torso: mk(G.torso, cloth, n), neck: mk(G.neck, skin, n), head: mk(G.head, skin, n),
    hair: mk(G.hair, hairM, n), cap: mk(G.cap, std('#ffffff', { roughness: 0.7 }), n), shades: mk(G.shades, std('#101214', { roughness: 0.15, metalness: 0.4 }), n),
    upper: mk(G.upper, cloth, n * 2), fore: mk(G.fore, skin, n * 2), hand: mk(G.hand, skin, n * 2),
    flag: mk(G.flag, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.85 }), n), stick: mk(G.stick, std('#2a2420'), n),
  };
  const shirts = ['#2f4f86', '#9e2a2e', '#e9e6de', '#3f6b48', '#c9a24a', '#5a4a78', '#26282c', '#b8643a', '#8aa9cc', '#6b6f73', '#d8cdb4'];
  const pants = ['#2a3650', '#1c1c20', '#a8946e', '#44505e', '#343434', '#5a4e3e'];
  const skins = ['#f0c8a4', '#dcaa7e', '#c08250', '#8d5a34', '#f7d6b4', '#b47a56', '#6e4428'];
  const hairs = ['#1a1410', '#3e2a1c', '#7a5230', '#caa062', '#262626', '#a8a8a2'];
  const capCols = ['#1f2a44', '#9e2a2e', '#e9e6de', '#3f4a2e'];
  const c = new THREE.Color();
  const people = spots.map((p, i) => {
    const P = { p, s: 0.9 + rnd() * 0.18, ph: rnd() * 6.28, sp: 3 + rnd() * 3, yaw: p.yaw || 0, wave: p.recruit ? false : rnd() < 0.6, flag: !p.recruit && rnd() < 0.5, cap: rnd() < 0.3, shades: rnd() < 0.2, clap: rnd() < 0.5, lean: (rnd() - 0.5) * 0.08, recruit: !!p.recruit };
    M.torso.setColorAt(i, c.set(shirts[(rnd() * shirts.length) | 0]));
    for (const k of [0, 1]) M.upper.setColorAt(i * 2 + k, c);
    c.set(pants[(rnd() * pants.length) | 0]); for (const k of [0, 1]) M.leg.setColorAt(i * 2 + k, c);
    c.set(rnd() < 0.5 ? '#f2f0ea' : '#26221e'); for (const k of [0, 1]) M.shoe.setColorAt(i * 2 + k, c);
    c.set(skins[(rnd() * skins.length) | 0]);
    M.head.setColorAt(i, c); M.neck.setColorAt(i, c); for (const k of [0, 1]) { M.fore.setColorAt(i * 2 + k, c); M.hand.setColorAt(i * 2 + k, c); }
    M.hair.setColorAt(i, c.set(hairs[(rnd() * hairs.length) | 0]));
    M.cap.setColorAt(i, c.set(capCols[(rnd() * capCols.length) | 0]));
    return P;
  });
  for (const m of Object.values(M)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V(), pos = V(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const arm = (P, side, base, sh, el, i2, t) => {
    // side：+1 左、-1 右（面朝 +z 时右手在 -x）
    tmp.makeTranslation(side * 0.195, 1.37, 0);
    const m = base.clone().multiply(tmp).multiply(new THREE.Matrix4().makeRotationFromEuler(e.set(sh[0], sh[1], sh[2], 'XYZ')));
    M.upper.setMatrixAt(i2, m);
    const f = m.clone().multiply(tmp.makeTranslation(0, -0.29, 0)).multiply(new THREE.Matrix4().makeRotationFromEuler(e.set(el, 0, 0)));
    M.fore.setMatrixAt(i2, f);
    const h = f.clone().multiply(tmp.makeTranslation(0, -0.27, 0));
    M.hand.setMatrixAt(i2, h);
    return h;
  };
  const update = (t, excite = 0) => {
    people.forEach((P, i) => {
      const hop = P.recruit ? 0 : Math.max(0, Math.sin(t * P.sp * 0.55 + P.ph)) * 0.07 * excite;
      q.setFromEuler(e.set(P.lean + (P.recruit ? 0 : Math.sin(t * 0.8 + P.ph) * 0.03), P.yaw + Math.sin(t * 0.3 + P.ph) * 0.08, 0, 'YXZ'));
      base.compose(pos.set(P.p.x, P.p.y + hop, P.p.z), q, sc.setScalar(P.s));
      M.torso.setMatrixAt(i, base); M.neck.setMatrixAt(i, base); M.head.setMatrixAt(i, base);
      M.hair.setMatrixAt(i, P.cap ? ZERO : base); M.cap.setMatrixAt(i, P.cap ? base : ZERO); M.shades.setMatrixAt(i, P.shades ? base : ZERO);
      for (const k of [0, 1]) {
        const s = k ? 1 : -1;
        m4.copy(base).multiply(tmp.makeTranslation(s * 0.088, 0, 0)); M.leg.setMatrixAt(i * 2 + k, m4); M.shoe.setMatrixAt(i * 2 + k, m4);
      }
      // 右手：挥小旗子 / 挥手；左手：鼓掌或者自然垂着；特别激动的时候两只手都举起来
      const w = Math.sin(t * P.sp + P.ph);
      const cheer = excite > 0.6 && Math.sin(t * 0.7 + P.ph * 3) > 0.3 && !P.recruit;
      let rS, rE, lS, lE;
      if (cheer) { rS = [0, 0, -2.6 - w * 0.2]; rE = -0.3; lS = [0, 0, 2.6 + w * 0.2]; lE = -0.3; }
      else if (P.wave) { rS = [-0.3, 0, -2.3 - w * 0.35]; rE = -0.6 + w * 0.3; }
      else if (P.clap && excite > 0.25) { const cl = Math.abs(Math.sin(t * 7 + P.ph)); rS = [-1.0, 0, -0.35 * cl]; rE = -1.2; lS = [-1.0, 0, 0.35 * cl]; lE = -1.2; }
      else { rS = [0.05, 0, -0.08]; rE = -0.15; }
      if (!lS) { lS = [0.05, 0, 0.08]; lE = -0.15; }
      const hr = arm(P, -1, base, rS, rE, i * 2, t);
      arm(P, 1, base, lS, lE, i * 2 + 1, t);
      if (P.flag && P.wave && !cheer) { M.flag.setMatrixAt(i, hr.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(e.set(0, Math.sin(t * 6 + P.ph) * 0.5, Math.PI)))); M.stick.setMatrixAt(i, hr.clone().multiply(tmp.makeRotationZ(Math.PI))); }
      else { M.flag.setMatrixAt(i, ZERO); M.stick.setMatrixAt(i, ZERO); }
    });
    for (const m of Object.values(M)) m.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { update, meshes: Object.values(M) };
}

// ================= 搭场景 =================
export function buildFinale(scene, renderer = null) {
  const root = new THREE.Group(); root.name = 'finale';
  scene.add(root);
  const refs = { root, theme: 'finale', interact: {}, occluders: [], camBoxes: [], lights: {}, mirrors: [], updaters: [] };
  const add = (o) => { root.add(o); return o; };
  const rnd = mulberry32(7020);

  // ===== 天空：物理大气 + 云；天光做环境反射 =====
  const sky = makeSky(0.42);
  sky.scale.setScalar(110);
  const SU = sky.material.uniforms;
  Object.assign(SU.turbidity, { value: 4.2 }); SU.rayleigh.value = 1.15; SU.mieCoefficient.value = 0.004; SU.mieDirectionalG.value = 0.86;
  SU.cloudCoverage.value = 0.34; SU.cloudDensity.value = 0.5; SU.cloudElevation.value = 0.55;
  SU.sunPosition.value.copy(SUN_DIR);
  sky.frustumCulled = false; sky.renderOrder = -20;
  add(sky);
  refs.sky = sky;
  if (renderer) {
    // 环境贴图：同一片天（不画太阳圆盘，不然金属上会有一个刺眼的白点）
    const envScene = new THREE.Scene(), sky2 = makeSky(0.42);
    sky2.scale.setScalar(100);
    for (const k of Object.keys(SU)) if (sky2.material.uniforms[k] && k !== 'skyGain') { const v = SU[k].value; sky2.material.uniforms[k].value = v && v.clone ? v.clone() : v; }
    sky2.material.uniforms.showSunDisc.value = 0;
    envScene.add(sky2);
    // 地面的反光：一块暖灰色的地
    envScene.add(new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2).translate(0, -1, 0), new THREE.MeshBasicMaterial({ color: '#7d7a6e' })));
    const planes = renderer.clippingPlanes; renderer.clippingPlanes = [];
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0.02, 0.1, 200);
    pm.dispose(); sky2.geometry.dispose(); sky2.material.dispose();
    renderer.clippingPlanes = planes;
    scene.environment = rt.texture;
    refs.envRT = rt;
  }
  scene.environmentIntensity = 0.32;
  scene.background = null;
  scene.fog = new THREE.FogExp2('#cad8e4', 0.0105);

  // ===== 地面：混凝土方砖广场、路缘石、草坪 =====
  const PV = TF.genPavers();
  const paverM = new THREE.MeshStandardMaterial({ map: PV.map, normalMap: PV.normalMap, roughnessMap: PV.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.6 });
  const plaza = mesh(worldUV(new THREE.PlaneGeometry(26, 20).rotateX(-Math.PI / 2).translate(0, 0, 1.4), 2.4), paverM, { cast: false });
  add(plaza);
  const ST = TF.genStone({ base: [196, 190, 178] }), stoneM = new THREE.MeshStandardMaterial({ map: ST.map, normalMap: ST.normalMap, roughness: 0.82, envMapIntensity: 0.5 });
  const ST2 = TF.genStone({ seed: 7142, base: [184, 180, 170] }), curbM = new THREE.MeshStandardMaterial({ map: ST2.map, normalMap: ST2.normalMap, roughness: 0.9 });
  for (const [w, d, x, z] of [[26.3, 0.3, 0, -8.6], [26.3, 0.3, 0, 11.4], [0.3, 20, -13, 1.4], [0.3, 20, 13, 1.4]]) add(wbox(w, 0.14, d, x, 0.07, z, curbM, 1, { cast: false }));
  const GR = TF.genGrass();
  const grassM = new THREE.MeshStandardMaterial({ map: GR.map, normalMap: GR.normalMap, roughness: 0.95, envMapIntensity: 0.35 });
  add(mesh(worldUV(new THREE.PlaneGeometry(130, 130).rotateX(-Math.PI / 2).translate(0, -0.02, 0), 3.2), grassM, { cast: false }));
  // 远处一圈林带（雾会把它染淡）
  const tl = TF.genTreeline(); tl.repeat.set(7, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(44, 44, 13, 64, 1, true), new THREE.MeshStandardMaterial({ map: tl, alphaTest: 0.35, side: THREE.BackSide, roughness: 1, color: '#b4bcb0', envMapIntensity: 0.3 }));
  ring.position.y = 6.2; ring.castShadow = false; ring.receiveShadow = false;
  add(ring);

  // ===== 红毯：绒面 + 金边，有一点厚度 =====
  const CP = TF.genCarpet();
  CP.map.repeat.set(1, 4); CP.normalMap.repeat.set(1, 4);
  const carpetM = new THREE.MeshStandardMaterial({ map: CP.map, normalMap: CP.normalMap, roughness: 0.96, envMapIntensity: 0.25 });
  add(mesh(new RoundedBoxGeometry(1.5, 0.014, 9, 1, 0.005), carpetM, { y: 0.007, z: 2.6, cast: false }));
  // 两边的金色立柱 + 天鹅绒拦绳
  const brass = std('#c9a24a', { metalness: 1, roughness: 0.22 }), velvet = std('#6a0d14', { roughness: 0.95 });
  const postG = mergeGeometries([new THREE.CylinderGeometry(0.16, 0.18, 0.04, 20).translate(0, 0.02, 0), new THREE.CylinderGeometry(0.025, 0.03, 0.9, 12).translate(0, 0.47, 0), new THREE.SphereGeometry(0.05, 14, 10).translate(0, 0.95, 0)]);
  for (const s of [-1, 1]) {
    const zs = [0.95, 2.15, 3.35, 4.55, 5.75];
    zs.forEach((z) => add(mesh(postG, brass, { x: s * 0.98, z })));
    for (let i = 0; i < zs.length - 1; i++) {
      const a = V(s * 0.98, 0.86, zs[i] + 0.04), b = V(s * 0.98, 0.86, zs[i + 1] - 0.04);
      const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(V(0, -0.16, 0)), b);
      add(mesh(new THREE.TubeGeometry(curve, 16, 0.017, 8), velvet));
    }
  }

  // ===== 征兵站：红砖楼（带法线的砖、石材勒脚 / 檐口、凹进去的窗、玻璃门廊）=====
  const BR = TF.genBrick();
  const brickM = new THREE.MeshStandardMaterial({ map: BR.map, normalMap: BR.normalMap, roughnessMap: BR.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.4 });
  const FZ = -6.0; // 楼的正立面
  add(wbox(20, 8, 10, 0, 4, FZ - 5, brickM, 1.6));
  add(wbox(20.3, 0.55, 0.22, 0, 0.275, FZ + 0.09, stoneM, 1.2)); // 勒脚
  add(wbox(20.5, 0.42, 0.55, 0, 8.05, FZ - 0.1, stoneM, 1.2)); // 檐口
  add(wbox(20.3, 0.3, 0.3, 0, 8.4, FZ - 0.2, stoneM, 1.2)); // 女儿墙压顶
  add(wbox(20.2, 0.22, 0.26, 0, 3.55, FZ + 0.1, stoneM, 1.2)); // 腰线
  // 窗户：石材窗台 + 过梁、深色铝框、玻璃（室内是半开的百叶窗；玻璃映着天空）
  const frameM = std('#2e3236', { metalness: 0.75, roughness: 0.38 });
  const blindTexs = [1, 2, 3].map((s) => TF.genBlinds({ seed: 7171 + s }));
  const glassMs = blindTexs.map((t) => new THREE.MeshStandardMaterial({ map: t, color: '#b8c4cc', metalness: 0.0, roughness: 0.04, envMapIntensity: 1.6 }));
  const revealM = std('#6a625a', { roughness: 0.9 });
  const windowAt = (x, y, w = 1.35, h = 1.75) => {
    add(wbox(w + 0.12, 0.07, 0.24, x, y - h / 2 - 0.04, FZ + 0.08, stoneM, 1.2)); // 窗台
    add(wbox(w + 0.3, 0.16, 0.08, x, y + h / 2 + 0.08, FZ + 0.035, stoneM, 1.2)); // 过梁
    for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.1, h, 0.12), revealM, { x: x + s * (w / 2 + 0.01), y, z: FZ + 0.0 })); // 窗洞侧边
    add(mesh(new THREE.PlaneGeometry(w, h), glassMs[(Math.abs(x * 7 + y * 3) | 0) % 3], { x, y, z: FZ - 0.05, cast: false }));
    // 铝框：外框 + 中间一根竖梃 + 一根横档
    for (const [fw, fh, fx, fy] of [[w, 0.06, 0, h / 2 - 0.03], [w, 0.06, 0, -h / 2 + 0.03], [0.06, h, -w / 2 + 0.03, 0], [0.06, h, w / 2 - 0.03, 0], [0.045, h, 0, 0], [w, 0.045, 0, h * 0.18]]) add(mesh(new THREE.BoxGeometry(fw, fh, 0.05), frameM, { x: x + fx, y: y + fy, z: FZ - 0.03, cast: false }));
  };
  // 立面：一楼门廊两边各两扇窗；二楼两边各两扇，正中间挂横幅，门廊上面是招牌
  for (const x of [-8, -5.2, 5.2, 8]) { windowAt(x, 1.85); windowAt(x, 5.5); }
  // 大门：石材门套 + 玻璃双开门（铝框、推杆）
  add(wbox(3.5, 3.2, 0.14, 0, 1.6, FZ + 0.05, stoneM, 1.2));
  const doorGlass = new THREE.MeshStandardMaterial({ map: TF.genBlinds({ seed: 7190 }), color: '#9aa7ae', roughness: 0.03, envMapIntensity: 1.8 });
  add(mesh(new THREE.PlaneGeometry(2.8, 2.7), doorGlass, { y: 1.35, z: FZ + 0.13, cast: false }));
  const alu = std('#b8bcbf', { metalness: 0.85, roughness: 0.3 });
  for (const [fw, fh, fx, fy] of [[2.9, 0.08, 0, 2.7], [0.08, 2.7, -1.43, 1.35], [0.08, 2.7, 1.43, 1.35], [0.06, 2.7, 0, 1.35], [0.06, 2.7, -0.7, 1.35], [0.06, 2.7, 0.7, 1.35], [2.9, 0.06, 0, 2.2]]) add(mesh(new THREE.BoxGeometry(fw, fh, 0.06), alu, { x: fx, y: fy, z: FZ + 0.16 }));
  for (const s of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 10), alu, { x: s * 0.35, y: 1.05, z: FZ + 0.22, rz: Math.PI / 2 }));
  // 门廊：两根方柱 + 平顶雨棚（下面一排嵌灯）+ 三级台阶
  for (const x of [-1.95, 1.95]) {
    add(wbox(0.42, 3.1, 0.42, x, 1.55 + 0.36, FZ + 1.75, stoneM, 1.2));
    add(wbox(0.52, 0.12, 0.52, x, 3.0 + 0.36, FZ + 1.75, stoneM, 1.2));
  }
  add(wbox(4.6, 0.26, 2.3, 0, 3.52, FZ + 1.05, stoneM, 1.2));
  const downM = new THREE.MeshBasicMaterial({ color: '#fff4dc' });
  for (const x of [-1.2, 0, 1.2]) add(mesh(new THREE.CircleGeometry(0.07, 16), downM, { x, y: 3.385, z: FZ + 1.35, rx: Math.PI / 2, cast: false }));
  for (let i = 0; i < 3; i++) add(wbox(4.2 - i * 0.3, 0.12, 2.3 - i * 0.35, 0, 0.06 + i * 0.12, FZ + 1.15 - i * 0.17, stoneM, 1.2));
  // 雨棚正面的字 + 墙上的大招牌（黑底金字）+ 金色五角星
  const fascia = TF.genSignText([['RECRUITING STATION 211', 92, '#2b2d5c', 0.55, 'bold', 12]], { W: 1400, H: 160, bg: '#ebe7dc' });
  add(mesh(new THREE.PlaneGeometry(4.5, 0.24), new THREE.MeshStandardMaterial({ map: fascia, color: '#cfcbc2', roughness: 0.7 }), { y: 3.52, z: FZ + 2.205, cast: false }));
  const signT = TF.genSignText([['U.S. ARMY', 150, '#d6b25e', 0.42, 'bold', 14], ['RECRUITING STATION', 54, '#ece8de', 0.8, 'bold', 10]], { W: 1024, H: 300, bg: '#16181b' });
  add(wbox(4.5, 1.34, 0.1, 0, 4.35, FZ + 0.05, frameM, 1));
  add(mesh(new THREE.PlaneGeometry(4.36, 1.2), new THREE.MeshStandardMaterial({ map: signT, roughness: 0.45, metalness: 0.2 }), { y: 4.35, z: FZ + 0.105, cast: false }));
  for (const s of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), frameM, { x: s * 1.9, y: 5.2, z: FZ + 0.06 })); // 招牌的吊杆
  const starShape = new THREE.Shape();
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.16 : 0.4; k ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starG = new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  add(mesh(starG, std('#c9a24a', { metalness: 1, roughness: 0.28 }), { y: 7.25, z: FZ + 0.02, s: 0.9 }));
  // 横幅：挂在二楼正中间，微微鼓起来
  const banner = mesh(new THREE.PlaneGeometry(7.2, 1.55, 24, 4), new THREE.MeshStandardMaterial({ map: genBanner(), color: '#c9c6bf', side: THREE.DoubleSide, roughness: 0.8 }), { y: 5.95, z: FZ + 0.16 });
  const bp = banner.geometry.attributes.position; for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin((bp.getX(i) / 7.2 + 0.5) * Math.PI) * 0.1 + Math.sin(bp.getX(i) * 4) * 0.012);
  banner.geometry.computeVertexNormals();
  refs.banner = banner;
  add(banner);
  // 窗下的红白蓝扇形彩旗
  const buntTex = genBunting(), buntM = new THREE.MeshStandardMaterial({ map: buntTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
  for (const x of [-8, -5.2, 5.2, 8]) add(mesh(new THREE.PlaneGeometry(1.4, 0.7), buntM, { x, y: 0.72, z: FZ + 0.1, cast: false }));
  // 楼顶：空调外机、女儿墙；墙角的落水管；门口两盏壁灯
  const unitM = std('#b4b6b0', { metalness: 0.4, roughness: 0.5 }), grillM = std('#3a3c3a', { metalness: 0.6, roughness: 0.4 });
  for (const [x, z] of [[-6, -9], [-3.5, -10], [4.5, -9.5], [7, -12]]) {
    add(wbox(1.4, 0.9, 1.1, x, 8.45, z, unitM, 1));
    add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), grillM, { x, y: 8.92, z }));
  }
  for (const x of [-9.85, 9.85]) add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 10), std('#6e6a62', { metalness: 0.6, roughness: 0.4 }), { x, y: 4, z: FZ + 0.12 }));
  for (const x of [-1.72, 1.72]) {
    add(mesh(new RoundedBoxGeometry(0.16, 0.3, 0.14, 2, 0.02), frameM, { x, y: 2.35, z: FZ + 0.2 }));
    add(mesh(new THREE.BoxGeometry(0.1, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: '#fff0cc' }), { x, y: 2.35, z: FZ + 0.275, cast: false }));
  }

  // ===== 旗杆：观众看过去，星条旗在左、陆军旗在右 =====
  const flags = [];
  const poleM = std('#d8dbe0', { metalness: 0.9, roughness: 0.22 }), goldM = std('#c9a24a', { metalness: 1, roughness: 0.2 });
  const pole = (x, tex) => {
    add(mesh(new THREE.CylinderGeometry(0.045, 0.075, 8, 16), poleM, { x, y: 4, z: -3.2 }));
    add(mesh(new THREE.SphereGeometry(0.11, 18, 12), goldM, { x, y: 8.08, z: -3.2 }));
    add(wbox(0.9, 0.3, 0.9, x, 0.15, -3.2, stoneM, 1.2));
    add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.02), goldM, { x, y: 0.18, z: -2.74, rx: -0.3 }));
    const f = waveFlag(tex, 2.4, 1.3);
    f.mesh.position.set(x + 0.06, 7.05, -3.2);
    f.mesh.rotation.y = x < 0 ? -0.35 : Math.PI + 0.35;
    add(f.mesh); flags.push(f);
  };
  pole(-3.4, drawUSFlag());
  pole(3.4, drawArmyFlag());

  // ===== 报到桌：星条桌裙、牌子、文件夹、笔、水、一摞装新军帽的盒子 =====
  const table = new THREE.Group(); table.position.set(-2.5, 0, 0.2); table.rotation.y = 0.5; add(table);
  table.add(mesh(new RoundedBoxGeometry(1.8, 0.05, 0.75, 2, 0.01), std('#f2f0ea', { roughness: 0.85 }), { y: 0.76 }));
  const skirtC = TX.makeCanvas(512, 128), sx = skirtC.getContext('2d');
  sx.fillStyle = '#2b2d5c'; sx.fillRect(0, 0, 512, 128); sx.fillStyle = '#f4f1ea';
  for (let k = 0; k < 16; k++) { const x = 16 + k * 32, y = 32 + (k % 2) * 40; sx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, r = j % 2 ? 4 : 10; sx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } sx.fill(); }
  for (let x = 0; x < 512; x += 16) { sx.fillStyle = 'rgba(0,0,0,0.12)'; sx.fillRect(x, 0, 3, 128); }
  table.add(mesh(new THREE.BoxGeometry(1.82, 0.72, 0.77), std('#ffffff', { map: TX.toTex(skirtC, { wrap: false }), roughness: 0.9 }), { y: 0.38 }));
  const repTex = TF.genSignText([['CHECK-IN', 78, '#2b2d5c', 0.4, 'bold', 6], ['NEW RECRUITS', 46, '#a51d2d', 0.76, 'bold', 6]], { W: 512, H: 200, bg: '#f7f5ef', border: '#2b2d5c' });
  table.add(mesh(new THREE.BoxGeometry(0.62, 0.26, 0.02), std('#ffffff', { map: repTex, roughness: 0.6 }), { y: 0.93, z: 0.25, rx: -0.15 }));
  table.add(mesh(new THREE.BoxGeometry(0.24, 0.012, 0.32), std('#8a6a40'), { x: 0.5, y: 0.79, z: 0 }));
  table.add(mesh(new THREE.BoxGeometry(0.21, 0.004, 0.28), std('#fbfaf5'), { x: 0.5, y: 0.8, z: 0 }));
  table.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6), std('#1a2a5a'), { x: 0.62, y: 0.8, z: 0.02, rz: Math.PI / 2, ry: 0.3 }));
  for (let i = 0; i < 3; i++) table.add(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.22, 14), new THREE.MeshStandardMaterial({ color: '#cfe6f6', roughness: 0.08, transparent: true, opacity: 0.55, envMapIntensity: 1.5 }), { x: -0.6 + i * 0.09, y: 0.9, z: -0.15 }));
  for (let i = 0; i < 3; i++) table.add(mesh(new RoundedBoxGeometry(0.34, 0.14, 0.3, 2, 0.01), std(i % 2 ? '#3a3a2c' : '#4a4833', { roughness: 0.8 }), { x: -0.15, y: 0.85 + i * 0.145, z: -0.05, ry: i * 0.1 }));
  // 桌子前面立着的 A 字告示牌
  const aT = TF.genSignText([['ENLISTMENT', 60, '#2b2d5c', 0.22, 'bold', 4], ['CEREMONY', 60, '#2b2d5c', 0.36, 'bold', 4], ['TODAY', 76, '#a51d2d', 0.56, 'bold', 6], ['10:00 AM', 64, '#1a1a1a', 0.76, 'bold', 4]], { W: 400, H: 560, bg: '#f7f5ef', border: '#2b2d5c' });
  const aboard = new THREE.Group(); aboard.position.set(-3.9, 0, 1.4); aboard.rotation.y = 0.7; add(aboard);
  for (const s of [-1, 1]) {
    aboard.add(mesh(new THREE.BoxGeometry(0.62, 0.9, 0.03), std('#2e3236', { roughness: 0.5 }), { y: 0.5, z: s * 0.1, rx: s * 0.16 }));
    aboard.add(mesh(new THREE.PlaneGeometry(0.54, 0.76), std('#ffffff', { map: aT, roughness: 0.6 }), { y: 0.5, z: s * 0.118, rx: s * 0.16, ry: s > 0 ? 0 : Math.PI, cast: false }));
  }

  // ===== 看台（铝合金）+ 家人们 =====
  const aluM = std('#c3c7cc', { metalness: 0.85, roughness: 0.32 }), aluD = std('#8a8f96', { metalness: 0.8, roughness: 0.4 });
  const spots = [];
  for (const s of [-1, 1]) {
    const bx = s * 5.2;
    for (let r = 0; r < 3; r++) {
      const x = bx + s * r * 0.9, y = 0.35 + r * 0.45;
      for (let k = 0; k < 2; k++) add(mesh(new RoundedBoxGeometry(0.3, 0.05, 6.6, 1, 0.012), aluM, { x: x - s * 0.15 + s * k * 0.33, y, z: 2.2 }));
      add(mesh(new THREE.BoxGeometry(0.04, 0.3, 6.6), aluD, { x: x - s * 0.45, y: y - 0.18, z: 2.2 }));
      for (let k = 0; k < 7; k++) if (rnd() < 0.85) spots.push({ x: x + (rnd() - 0.5) * 0.3, y: y + 0.025, z: -0.6 + k * 0.92 + (rnd() - 0.5) * 0.2, yaw: s < 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25 });
    }
    // 支架 + 后面的栏杆
    for (let k = 0; k <= 5; k++) {
      const z = -1.0 + k * 1.3;
      add(mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), aluD, { x: bx + s * 2 * 0.9 + s * 0.1, y: 0.65, z }));
      add(mesh(new THREE.BoxGeometry(2.3, 0.05, 0.05), aluD, { x: bx + s * 0.9, y: 0.25, z, rz: s * 0.42 }));
      add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), aluM, { x: bx + s * 2 * 0.9 + s * 0.28, y: 1.75, z }));
    }
    add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 6.6, 8), aluM, { x: bx + s * 2 * 0.9 + s * 0.28, y: 2.25, z: 2.2, rx: Math.PI / 2 }));
  }
  // 报到桌旁边排队的几个新兵（便装）
  for (let i = 0; i < 4; i++) spots.push({ x: -3.6 - i * 0.55, y: 0, z: 0.9 + i * 0.35, yaw: 0.55 + Math.PI, recruit: true });
  const crowd = buildCrowd(root, spots, drawUSFlag(190, 100));

  // ===== 气球拱门（入口）=====
  const bcol = [std('#a51d2d', { roughness: 0.22, envMapIntensity: 1.2 }), std('#f4f1ea', { roughness: 0.22, envMapIntensity: 1.2 }), std('#2b3f8a', { roughness: 0.22, envMapIntensity: 1.2 })];
  const bG = new THREE.SphereGeometry(0.2, 18, 14);
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI;
    for (const off of [-0.12, 0.12]) add(mesh(bG, bcol[(i + (off > 0 ? 1 : 0)) % 3], { x: Math.cos(a) * 2.35 + off * Math.sin(a), y: 0.3 + Math.sin(a) * 3.1 + off * Math.cos(a) * 0.5, z: -4.5 + off, s: [1, 1.15, 1] }));
  }

  // ===== 路灯、花坛、系船桩 =====
  const lampM = std('#1f2622', { metalness: 0.6, roughness: 0.45 }), lampGlass = new THREE.MeshStandardMaterial({ color: '#f2eee0', roughness: 0.2, transparent: true, opacity: 0.85 });
  for (const [x, z] of [[-4.3, -1.8], [4.3, -1.8], [-8.6, 3], [8.6, 3], [-4.3, 7.8], [4.3, 7.8]]) {
    add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 12), lampM, { x, y: 0.25, z }));
    add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.9, 12), lampM, { x, y: 2.2, z }));
    add(mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.45, 8), lampGlass, { x, y: 4.35, z, cast: false }));
    add(mesh(new THREE.ConeGeometry(0.27, 0.22, 8), lampM, { x, y: 4.69, z }));
  }
  for (const x of [-12, -9, 9, 12]) for (const z of [9.6, -7.9]) add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12), std('#3a3c3e', { metalness: 0.5, roughness: 0.5 }), { x, y: 0.4, z }));

  // ===== 树 + 灌木：树枝合成一个网格，叶片全场一个实例化网格（会随风晃）=====
  const barkT = genBark({ seed: 7301, base: '#5a4a3c', moss: 0.08 });
  const barkM = new THREE.MeshStandardMaterial({ map: barkT.map, normalMap: barkT.normalMap, roughnessMap: barkT.roughnessMap, roughness: 1 });
  const wood = [], cards = [];
  const trees = [[-11, -4, 7.5], [-12.6, 1.8, 8.5], [-10.8, 7.2, 7], [11.2, -4.6, 8], [12.6, 0.6, 7.2], [10.9, 6.6, 8.2], [-6.5, 12.5, 7.8], [-0.5, 14.2, 8.8], [5.8, 12.8, 7.4], [-15, -10, 9], [15.5, -9.5, 8.6], [-17, 6, 9.4], [17, 5, 9.2],
    // 远一点、稀一点的一圈（填满广场外面那片草地）
    [-22, 14, 10], [-12, 21, 9.5], [3, 24, 10.5], [15, 20, 9.8], [24, 11, 10.2], [-25, -2, 10.8], [26, -4, 9.6], [-20, -16, 10], [21, -17, 10.4], [9, 30, 11], [-8, 31, 10.6]];
  for (const [x, z, h] of trees) growTree(rnd, V(x, 0, z), h, 0.95, wood, cards);
  // 花坛里的灌木：矮一点、密一点
  const planter = (x, z, w) => {
    add(wbox(w, 0.55, 0.9, x, 0.275, z, stoneM, 1.2));
    add(mesh(new THREE.PlaneGeometry(w - 0.12, 0.78).rotateX(-Math.PI / 2), std('#3a2c20', { roughness: 1 }), { x, y: 0.53, z, cast: false }));
    for (let k = 0; k < w * 14; k++) cards.push({ p: V(x + (rnd() - 0.5) * (w - 0.3), 0.72 + rnd() * 0.35, z + (rnd() - 0.5) * 0.6), s: 0.42 + rnd() * 0.25, r: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], c: rnd() * 0.6 });
  };
  planter(-4.3, FZ + 0.9, 2.2); planter(4.3, FZ + 0.9, 2.2);
  planter(-8.6, 9.8, 2.6); planter(8.6, 9.8, 2.6);
  add(mesh(mergeGeometries(wood), barkM));
  const leafTexs = [TF.genLeafCluster({ seed: 7151 }), TF.genLeafCluster({ seed: 7152, hue: 0.5 })];
  const leafU = { time: { value: 0 } };
  const leafMat = (tex) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, envMapIntensity: 0.4 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.time = leafU.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5;
          transformed.x += sin(time * 1.6 + ph) * 0.05;
          transformed.z += cos(time * 1.3 + ph * 1.3) * 0.04;
        #endif`);
    };
    m.customProgramCacheKey = () => 'leafSway';
    return m;
  };
  const leafG = new THREE.PlaneGeometry(1, 1);
  const leafMeshes = leafTexs.map((tex, li) => {
    const list = cards.filter((_, i) => i % 2 === li);
    const im = new THREE.InstancedMesh(leafG, leafMat(tex), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((cd, i) => {
      m4.compose(cd.p, q.setFromEuler(new THREE.Euler(cd.r[0], cd.r[1], cd.r[2])), V(cd.s, cd.s, cd.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setRGB(0.82 + cd.c * 0.3, 0.86 + cd.c * 0.22, 0.78 + cd.c * 0.2));
    });
    im.castShadow = true; im.receiveShadow = true;
    // 叶子投下的影子也是一片一片的
    im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 });
    add(im);
    return im;
  });
  refs.leaves = leafMeshes;

  // ===== 新兵候场区：红毯另一头一排折叠椅——主角就坐在正中间那把上打瞌睡 =====
  const chairs = new THREE.Group(); add(chairs);
  const metal = std('#2e3238', { roughness: 0.35, metalness: 0.75 }), seatM = std('#1f2c46', { roughness: 0.55 });
  const chair = (x) => {
    const c = new THREE.Group(); c.position.set(x, 0, 6.5); chairs.add(c);
    c.add(mesh(new RoundedBoxGeometry(0.44, 0.035, 0.42, 2, 0.012), seatM, { y: 0.46 }));
    c.add(mesh(new RoundedBoxGeometry(0.44, 0.3, 0.025, 2, 0.01), seatM, { y: 0.8, z: 0.2, rx: 0.08 }));
    for (const sx of [-0.2, 0.2]) {
      c.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.95, 8), metal, { x: sx, y: 0.47, z: 0.18, rx: 0.1 }));
      c.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), metal, { x: sx, y: 0.23, z: -0.17, rx: -0.2 }));
    }
    return c;
  };
  for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) chair(x);
  const folderM = std('#c9a86a', { roughness: 0.8 });
  for (const x of [-2.4, -1.2, 2.4]) chairs.add(mesh(new THREE.BoxGeometry(0.24, 0.02, 0.32), folderM, { x, y: 0.49, z: 6.48, ry: (x * 7) % 0.6 }));
  const waitT = TF.genSignText([['WAITING AREA', 70, '#f4f1e6', 0.3, 'bold', 6], ['NEW RECRUITS', 64, '#a51d2d', 0.72, 'bold', 6]], { W: 512, H: 180, bg: '#2b2d5c' });
  const waitSign = new THREE.Group(); waitSign.position.set(-3.4, 0, 6.2); waitSign.rotation.y = 0.5; add(waitSign);
  waitSign.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), metal, { y: 0.02 }));
  waitSign.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 10), metal, { y: 0.75 }));
  waitSign.add(mesh(new THREE.PlaneGeometry(0.9, 0.32), new THREE.MeshStandardMaterial({ map: waitT, roughness: 0.6, side: THREE.DoubleSide }), { y: 1.56, cast: false }));
  refs.chairs = chairs;
  refs.seat = V(0, 0, 6.4); // 主角坐的位置（面朝 -z，红毯那头）

  // ===== 灯光：上午的太阳 + 天光 =====
  const hemi = new THREE.HemisphereLight('#c3d8ee', '#6e6450', 0.5); add(hemi);
  const sun = new THREE.DirectionalLight('#fff0da', 2.75);
  sun.position.copy(SUN_DIR).multiplyScalar(18).add(V(0, 0, 1)); sun.target.position.set(0, 0, 1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 45 });
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2.5;
  add(sun); add(sun.target);
  refs.lights = { hemi, sun };

  // ===== 人物：少校（军官）、教官、两名仪仗兵 =====
  const officer = createCharacter({ outfit: 'agsu', name: 'SMITH', skin: [226, 178, 146], skinColor: '#e2b292', hair: [120, 96, 70], hairColor: '#6a5038', brow: '#5a4030', mustache: true });
  officer.root.position.set(0, 0, 0); officer.root.rotation.y = 0;
  const offCap = makeServiceCap({ officer: true });
  officer.helmetSlot.add(offCap);
  add(officer.root);
  const sarge = createCharacter({ outfit: 'agsu', name: 'JOHNSON', skin: [140, 96, 70], skinColor: '#8c6046', hair: [20, 16, 14], hairColor: '#141010', brow: '#141010' });
  sarge.root.position.set(1.55, 0, -0.35); sarge.root.rotation.y = -0.35;
  sarge.helmetSlot.add(makeCampaignHat());
  add(sarge.root);
  const guards = [
    [{ name: 'DAVIS', skin: [196, 150, 118], skinColor: '#c49676', hair: [30, 24, 20], hairColor: '#1e1814' }, -1.3],
    [{ name: 'GARCIA', skin: [176, 128, 96], skinColor: '#b08060', hair: [24, 20, 18], hairColor: '#181412' }, 1.3],
  ].map(([o, x]) => {
    const ch = createCharacter({ outfit: 'agsu', ...o });
    ch.root.position.set(x, 0, 1.75); ch.root.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    ch.helmetSlot.add(makeServiceCap({ officer: false }));
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // 站在中景，不投影（每人七十多个零件，省一半阴影绘制）
    add(ch.root);
    return ch;
  });
  // 要送给主角的那顶大檐帽（士兵款）
  const giftCap = makeServiceCap({ officer: false });
  add(giftCap);
  refs.officer = officer; refs.sarge = sarge; refs.guards = guards; refs.giftCap = giftCap; refs.officerCap = offCap;
  refs.flags = flags; refs.crowd = crowd;
  refs.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

  // 合批：人物、会飘的旗子、军帽、实例化的东西、天空以外，全部按材质合并
  mergeStatic(root, new Set([officer.root, sarge.root, giftCap, sky, ...guards.map((gd) => gd.root), ...flags.map((f) => f.mesh)]));

  // 每帧：旗子、云、树叶、观众
  refs.excite = 0;
  refs.updaters.push((dt, t) => {
    for (const f of flags) f.U.time.value = t;
    SU.time.value = t;
    leafU.time.value = t;
    crowd.update(t, refs.excite);
  });
  root.updateMatrixWorld(true);
  return refs;
}
