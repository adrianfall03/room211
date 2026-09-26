// 视觉特效：体积光（丁达尔光柱）、粒子（羽毛、火花、爱心、音符、纸屑）、头顶表情气泡
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { star, heart } from '../core/tex_toon.js';

// ---------- 光柱：从窗口（或木板缝）斜射进来的一束束光 ----------
const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vW;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHAFT_FRAG = /* glsl */ `
  uniform vec3 color; uniform float intensity; uniform float time; uniform float seed;
  varying vec2 vUv; varying vec3 vW;
  float h(float x) { return fract(sin(x * 91.7 + seed) * 4375.5); }
  void main() {
    // 开了 MSAA 时，光柱边缘的像素会把 uv 外推到 [0,1] 之外；along > 1 时 pow(负数, 1.4) 是 NaN，
    // 这个 NaN 会被 Bloom 模糊扩散到整个屏幕，画面一下子全黑。先夹到 [0,1]
    float along = clamp(vUv.x, 0.0, 1.0), across = clamp(vUv.y, 0.0, 1.0);
    float edge = smoothstep(0.0, 0.18, across) * smoothstep(1.0, 0.82, across);
    float fall = pow(1.0 - along, 1.4) * smoothstep(0.0, 0.06, along);
    float flick = 0.75 + 0.25 * sin(time * 0.7 + seed * 3.0 + across * 5.0) * sin(time * 0.37 + along * 4.0);
    float streak = 0.7 + 0.3 * sin(across * 23.0 + seed * 7.0);
    float a = intensity * edge * fall * flick * streak;
    gl_FragColor = vec4(color * a, a);
  }`;
export class LightShafts {
  // rects：[{ cx, cy, w, h }]，都在 z = planeZ 的竖直平面上；dir 光的方向（单位向量）
  constructor({ rects, planeZ, dir, length = 4, color = '#ffe2b0', intensity = 0.05, slices = 5 }) {
    this.group = new THREE.Group();
    this.group.name = 'shafts';
    this.uniforms = { color: { value: new THREE.Color(color) }, intensity: { value: 0 }, time: { value: 0 } };
    this.target = intensity;
    const D = dir.clone().normalize();
    const mats = [];
    let seed = 0;
    for (const r of rects) {
      // 竖着的切片（沿 x 排开）+ 横着的切片（沿 y 排开），从哪个角度看都有点体积感
      for (let i = 0; i < slices; i++) {
        const x = r.cx - r.w / 2 + (r.w * (i + 0.5)) / slices;
        this._quad(new THREE.Vector3(x, r.cy - r.h / 2, planeZ), new THREE.Vector3(0, r.h, 0), D, length, mats, seed++);
      }
      for (let i = 0; i < Math.max(2, Math.round(slices * 0.6)); i++) {
        const n = Math.max(2, Math.round(slices * 0.6));
        const y = r.cy - r.h / 2 + (r.h * (i + 0.5)) / n;
        this._quad(new THREE.Vector3(r.cx - r.w / 2, y, planeZ), new THREE.Vector3(r.w, 0, 0), D, length, mats, seed++);
      }
    }
    this.mats = mats;
  }
  _quad(p0, span, D, L, mats, seed) {
    const g = new THREE.BufferGeometry();
    const a = p0, b = p0.clone().add(span), c = b.clone().addScaledVector(D, L), d = a.clone().addScaledVector(D, L);
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, seed: { value: seed * 1.37 } },
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.noRay = true; mesh.raycast = () => {};
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 5;
    this.group.add(mesh);
  }
  update(dt, t, on = 1) {
    const U = this.uniforms;
    U.intensity.value += (this.target * on - U.intensity.value) * (1 - Math.exp(-dt * 2.5));
    U.time.value = t;
    this.group.visible = U.intensity.value > 0.002;
  }
}

// ---------- 粒子贴图 ----------
function spriteTex(draw, S = 128) {
  const c = TX.makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  draw(ctx, S);
  return TX.toTex(c, { wrap: false });
}
const TEX = {};
function tex(kind) {
  if (TEX[kind]) return TEX[kind];
  const t = {
    feather: () => spriteTex((ctx, S) => {
      ctx.translate(S / 2, S / 2); ctx.rotate(-0.5);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, S * 0.16, S * 0.42, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = S * 0.025; ctx.beginPath(); ctx.moveTo(0, S * 0.46); ctx.lineTo(0, -S * 0.36); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,190,170,0.6)'; ctx.lineWidth = 2;
      for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(0, k * S * 0.07); ctx.lineTo(S * 0.14, k * S * 0.07 - S * 0.06); ctx.moveTo(0, k * S * 0.07); ctx.lineTo(-S * 0.14, k * S * 0.07 - S * 0.06); ctx.stroke(); }
    }),
    spark: () => spriteTex((ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,160,0.9)'); g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }, 64),
    heart: () => spriteTex((ctx, S) => { ctx.fillStyle = '#ffffff'; heart(ctx, S / 2, S / 2, S * 0.3); ctx.fill(); }),
    star: () => spriteTex((ctx, S) => { ctx.fillStyle = '#ffffff'; star(ctx, S / 2, S / 2, S * 0.45, 0, 5, 0.45); ctx.fill(); }),
    note: () => spriteTex((ctx, S) => {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(S * 0.38, S * 0.72, S * 0.16, S * 0.12, -0.4, 0, 6.28); ctx.fill();
      ctx.fillRect(S * 0.5, S * 0.18, S * 0.06, S * 0.56);
      ctx.beginPath(); ctx.moveTo(S * 0.56, S * 0.18); ctx.quadraticCurveTo(S * 0.8, S * 0.3, S * 0.74, S * 0.48); ctx.quadraticCurveTo(S * 0.72, S * 0.34, S * 0.56, S * 0.32); ctx.fill();
    }),
    dust: () => spriteTex((ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    }, 64),
    confetti: () => spriteTex((ctx, S) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(S * 0.3, S * 0.15, S * 0.4, S * 0.7); }, 32),
    // 蒸汽 / 呼出来的白气：很淡的一团，边上散开，带几缕不规则的絮
    steam: () => spriteTex((ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.45, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, r = S * (0.12 + (k % 3) * 0.06), x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.8;
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, S * 0.18);
        g2.addColorStop(0, 'rgba(255,255,255,0.1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, S, S);
      }
    }, 64),
    drop: () => spriteTex((ctx, S) => {
      ctx.fillStyle = 'rgba(200,230,255,0.9)'; ctx.beginPath(); ctx.moveTo(S / 2, S * 0.1); ctx.quadraticCurveTo(S * 0.8, S * 0.6, S / 2, S * 0.85); ctx.quadraticCurveTo(S * 0.2, S * 0.6, S / 2, S * 0.1); ctx.fill();
    }, 64),
  }[kind]();
  TEX[kind] = t;
  return t;
}

// 不受全局裁剪面影响的材质（第五章彩蛋：飞船被一刀一刀"切掉"时，火花、碎片要能飞进外面的虚空里）
export function noClip(m) {
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', ''); };
  m.customProgramCacheKey = () => 'noclip';
  return m;
}

// ---------- 粒子：每种贴图一个 InstancedMesh，面向镜头、会转、会落 ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
class Pool {
  constructor(kind, cap, additive) {
    this.cap = cap;
    this.items = [];
    const m = noClip(new THREE.MeshBasicMaterial({ map: tex(kind), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive }));
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noRay = true; this.mesh.raycast = () => {};
    this.mesh.castShadow = false;
  }
}
export class FX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.pools = {};
    const def = { feather: [160, false], spark: [120, true], heart: [60, false], star: [80, false], note: [40, false], confetti: [200, false], drop: [40, false], dust: [60, false], steam: [140, false] };
    for (const [k, [cap, add]] of Object.entries(def)) { const p = new Pool(k, cap, add); this.pools[k] = p; this.group.add(p.mesh); }
  }
  // 发射一团粒子
  emit(kind, pos, { count = 10, speed = 1, spread = 1, up = 1, gravity = -2, drag = 0.6, life = 1.5, size = 0.08, colors = ['#ffffff'], spin = 3, sway = 0, grow = 0 } = {}) {
    const P = this.pools[kind];
    for (let i = 0; i < count; i++) {
      if (P.items.length >= P.cap) P.items.shift();
      const a = Math.random() * Math.PI * 2, e = Math.random() * spread;
      const v = new THREE.Vector3(Math.cos(a) * e, up * (0.4 + Math.random() * 0.8), Math.sin(a) * e).multiplyScalar(speed);
      P.items.push({
        p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08)),
        v, g: gravity, drag, life: life * (0.7 + Math.random() * 0.6), t: 0, size: size * (0.7 + Math.random() * 0.6),
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * spin * 2, sway: sway * (0.5 + Math.random()), ph: Math.random() * 6.28,
        color: new THREE.Color(colors[(Math.random() * colors.length) | 0]), grow,
      });
    }
  }
  update(dt, camera) {
    for (const P of Object.values(this.pools)) {
      const it = P.items;
      let n = 0;
      for (let i = 0; i < it.length; i++) {
        const q = it[i];
        q.t += dt;
        if (q.t >= q.life) continue;
        q.v.y += q.g * dt;
        q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.sway) { q.p.x += Math.sin(q.t * 3 + q.ph) * q.sway * dt; q.p.z += Math.cos(q.t * 2.3 + q.ph) * q.sway * dt; }
        if (q.p.y < 0.01 && q.v.y < 0) { q.p.y = 0.01; q.v.set(0, 0, 0); q.g = 0; q.spin *= 0.2; }
        q.rot += q.spin * dt;
        it[n++] = q;
      }
      it.length = n;
      for (let i = 0; i < n; i++) {
        const q = it[i];
        const k = q.t / q.life;
        const sc = q.size * (1 + q.grow * k) * Math.min(1, (1 - k) * 4) * Math.min(1, q.t * 12);
        _qz.setFromAxisAngle(_z, q.rot);
        _q.copy(camera.quaternion).multiply(_qz);
        _m4.compose(q.p, _q, _s.set(sc, sc, sc));
        P.mesh.setMatrixAt(i, _m4);
        P.mesh.setColorAt(i, q.color);
      }
      P.mesh.count = n;
      P.mesh.visible = n > 0;
      if (n) { P.mesh.instanceMatrix.needsUpdate = true; if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true; }
    }
  }
  clear() { for (const P of Object.values(this.pools)) { P.items.length = 0; P.mesh.count = 0; } }
}

// ---------- 头顶的表情气泡（! ? ♥ ♪ 💢 …）----------
const EMO = {};
function emoTex(kind) {
  if (EMO[kind]) return EMO[kind];
  const c = TX.makeCanvas(128, 128), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  // 白色圆底 + 深色描边的气泡
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#4a3350'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 58, 44, 0, 6.28); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(50, 96); ctx.lineTo(64, 120); ctx.lineTo(72, 97); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const col = { '!': '#ff4a5a', '?': '#4a7aff', heart: '#ff5a8a', note: '#8a5aff', anger: '#ff3a3a', dots: '#4a3350', star: '#ffb020', zzz: '#6a7aff', sweat: '#3aa0ff' }[kind];
  ctx.fillStyle = col; ctx.strokeStyle = col;
  if (kind === '!' || kind === '?') { ctx.font = 'bold 70px Arial'; ctx.fillText(kind === '!' ? '!!' : '?', 64, 62); }
  else if (kind === 'heart') { heart(ctx, 64, 60, 24); ctx.fill(); }
  else if (kind === 'star') { star(ctx, 64, 58, 30); ctx.fill(); }
  else if (kind === 'dots') { for (const x of [42, 64, 86]) { ctx.beginPath(); ctx.arc(x, 60, 7, 0, 6.28); ctx.fill(); } }
  else if (kind === 'zzz') { ctx.font = 'bold 44px Arial'; ctx.fillText('Zz', 64, 60); }
  else if (kind === 'note') { ctx.font = 'bold 64px Arial'; ctx.fillText('♪', 64, 62); }
  else if (kind === 'sweat') { ctx.beginPath(); ctx.moveTo(64, 26); ctx.quadraticCurveTo(92, 66, 64, 86); ctx.quadraticCurveTo(36, 66, 64, 26); ctx.fill(); }
  else if (kind === 'anger') {
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(64 + sx * 8, 58 + sy * 22); ctx.quadraticCurveTo(64 + sx * 8, 58 + sy * 8, 64 + sx * 22, 58 + sy * 8); ctx.stroke(); }
  }
  EMO[kind] = TX.toTex(c, { wrap: false });
  return EMO[kind];
}
export class Emote {
  constructor(parent, y = 0.5) {
    this.sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true }));
    this.sp.position.set(0, y, 0);
    this.sp.scale.setScalar(0.001);
    this.sp.visible = false;
    this.sp.renderOrder = 7;
    this.sp.userData.noRay = true; this.sp.raycast = () => {};
    parent.add(this.sp);
    this.t = 0; this.dur = 0; this.base = y;
  }
  show(kind, dur = 1.6, size = 0.26) {
    this.sp.material.map = emoTex(kind);
    this.sp.material.needsUpdate = true;
    this.t = 0; this.dur = dur; this.size = size;
    this.sp.visible = true;
  }
  // anchorWorld：跟着某个世界坐标点走（躺着的动物，父节点是歪的）
  update(dt, anchorWorld = null) {
    if (!this.sp.visible) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) { this.sp.visible = false; return; }
    const pop = k < 0.15 ? Math.sin((k / 0.15) * Math.PI * 0.5) * 1.15 : k > 0.85 ? (1 - k) / 0.15 : 1 + Math.sin(this.t * 8) * 0.04;
    const ps = this.sp.parent ? this.sp.parent.getWorldScale(_s).x : 1;
    this.sp.scale.setScalar((this.size / ps) * Math.max(0.001, pop));
    if (anchorWorld) {
      this.sp.position.copy(anchorWorld);
      this.sp.position.y += Math.sin(this.t * 3) * 0.02;
      this.sp.parent.worldToLocal(this.sp.position);
    } else this.sp.position.y = this.base + Math.sin(this.t * 3) * 0.02;
  }
}
