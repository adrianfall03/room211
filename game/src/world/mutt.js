// 第七章的狗「杂毛」（《天国：拯救》里亨利那条狗 Mutt）：一条黑背黄腿的土狗，趴在壁炉前的羊皮上打盹
//   程序化建模：胶囊身子 + 胸廓、脖子、脑袋（口鼻、下巴、半立的耳朵）、四条两节的腿、三节会摇的尾巴
//   动作：趴着睡（肚子一起一伏）、站着、小跑（对角线两条腿一起迈）、低头吃东西、把头钻到床底下翻找、叼着东西
//   谁走近了，它会抬头看着谁、尾巴摇得更欢
import * as THREE from 'three';
import { genFur } from '../core/tex_jungle.js';
import { clamp, lerp, damp, dampAngle } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _w = V();

function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(s[0], s[1], s[2]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export class Mutt {
  constructor() {
    const fd = genFur({ base: '#2a221c', dark: '#16110d', light: '#4a3a2c', seed: 7301, len: 9, n: 4200 });
    const ft = genFur({ base: '#8a6842', dark: '#5a4028', light: '#b48e5e', seed: 7302, len: 7, n: 4200 });
    for (const t of [fd.map, fd.normalMap, ft.map, ft.normalMap]) t.repeat.set(2, 2);
    const dark = new THREE.MeshStandardMaterial({ map: fd.map, normalMap: fd.normalMap, roughness: 0.92 });
    const tan = new THREE.MeshStandardMaterial({ map: ft.map, normalMap: ft.normalMap, roughness: 0.9 });
    const nose = new THREE.MeshStandardMaterial({ color: '#0e0c0b', roughness: 0.25 });
    const eye = new THREE.MeshStandardMaterial({ color: '#1a0e06', roughness: 0.06, emissive: new THREE.Color('#2a1206'), emissiveIntensity: 0.3 });
    const tongueM = new THREE.MeshStandardMaterial({ color: '#b8545a', roughness: 0.35 });
    this.mats = [dark, tan, nose, eye, tongueM];
    const root = new THREE.Group(); root.name = 'mutt';
    this.root = root;
    // ---- 身子 ----
    const body = new THREE.Group(); body.position.y = 0.42; root.add(body);
    this.body = body;
    body.add(mesh(new THREE.CapsuleGeometry(0.12, 0.34, 8, 16), dark, { rx: Math.PI / 2, s: [1, 1, 1.05] }));
    body.add(mesh(new THREE.SphereGeometry(0.14, 18, 14), tan, { y: -0.03, z: 0.16, s: [0.95, 1.12, 1] })); // 胸
    body.add(mesh(new THREE.SphereGeometry(0.115, 16, 12), dark, { y: 0.01, z: -0.18, s: [1, 0.95, 1.1] })); // 屁股
    body.add(mesh(new THREE.SphereGeometry(0.1, 14, 10), tan, { y: -0.07, z: -0.02, s: [0.9, 0.6, 1.6] })); // 肚子
    // ---- 脖子 + 脑袋 ----
    const neck = new THREE.Group(); neck.position.set(0, 0.06, 0.22); body.add(neck);
    neck.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 14), dark, { y: 0.09 }));
    neck.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), tan, { y: 0.05, z: 0.04, s: [0.9, 1.1, 0.7] })); // 脖子前面一撮黄毛
    const head = new THREE.Group(); head.position.set(0, 0.2, 0); neck.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.095, 18, 14), dark, { s: [0.92, 0.86, 1.05] }));
    head.add(mesh(new THREE.CylinderGeometry(0.042, 0.056, 0.15, 14), tan, { y: -0.03, z: 0.11, rx: Math.PI / 2 }));
    head.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), tan, { y: -0.012, z: 0.05, s: [1.3, 0.9, 1] })); // 两颊
    head.add(mesh(new THREE.SphereGeometry(0.024, 12, 10), nose, { y: -0.018, z: 0.19, s: [1.1, 0.85, 0.9] }));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), eye, { x: s * 0.042, y: 0.022, z: 0.074 }));
      head.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), tan, { x: s * 0.04, y: 0.05, z: 0.062, s: [1.2, 0.5, 0.8] })); // 黄眉毛（黑背犬的那两个点）
      const ear = new THREE.Group(); ear.position.set(s * 0.058, 0.07, -0.02); ear.rotation.set(-0.2, 0, -s * 0.35); head.add(ear);
      const eg = new THREE.ConeGeometry(0.042, 0.11, 10); eg.translate(0, 0.05, 0); eg.scale(1, 1, 0.35);
      ear.add(mesh(eg, dark));
      // 耳尖往前折下来一点
      const tip = new THREE.Group(); tip.position.y = 0.08; tip.rotation.x = 0.9; ear.add(tip);
      const tg = new THREE.ConeGeometry(0.022, 0.04, 8); tg.translate(0, 0.02, 0); tg.scale(1, 1, 0.35);
      tip.add(mesh(tg, dark));
      (this.ears || (this.ears = [])).push(ear);
    }
    // 下巴（会张嘴：喘气、吃东西、叼东西）
    const jaw = new THREE.Group(); jaw.position.set(0, -0.05, 0.05); head.add(jaw);
    jaw.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.13, 12), tan, { y: -0.01, z: 0.07, rx: Math.PI / 2, s: [1, 1, 0.7] }));
    const tongue = mesh(new THREE.SphereGeometry(0.03, 10, 8), tongueM, { y: 0.004, z: 0.1, s: [0.9, 0.3, 1.5] });
    jaw.add(tongue);
    const mouth = new THREE.Object3D(); mouth.position.set(0, -0.02, 0.13); head.add(mouth);
    // ---- 腿 ----
    const legs = [];
    const leg = (x, z, front) => {
      const hip = new THREE.Group(); hip.position.set(x, front ? -0.04 : -0.01, z); body.add(hip);
      hip.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.2, 12), front ? tan : dark, { y: -0.1 }));
      if (!front) hip.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), dark, { y: -0.03, s: [0.7, 1.2, 1] })); // 大腿
      const knee = new THREE.Group(); knee.position.y = -0.2; hip.add(knee);
      knee.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.19, 10), tan, { y: -0.095 }));
      knee.add(mesh(new THREE.SphereGeometry(0.034, 10, 8), tan, { y: -0.19, z: 0.02, s: [1, 0.6, 1.5] }));
      legs.push({ hip, knee, front, side: Math.sign(x) });
    };
    leg(0.075, 0.17, true); leg(-0.075, 0.17, true); leg(0.075, -0.2, false); leg(-0.075, -0.2, false);
    // ---- 尾巴 ----
    const tail = new THREE.Group(); tail.position.set(0, 0.06, -0.28); body.add(tail);
    const segs = [];
    let parent = tail;
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Group(); if (k) s.position.y = 0.1; parent.add(s);
      s.add(mesh(new THREE.CylinderGeometry(0.018 - k * 0.003, 0.03 - k * 0.006, 0.11, 8), k === 2 ? tan : dark, { y: 0.05 }));
      segs.push(s); parent = s;
    }
    Object.assign(this, { neck, head, jaw, tongue, mouth, legs, tail, segs });
    // 状态
    this.state = 'lie';
    this.w = { walk: 0, lie: 1, rummage: 0, eat: 0 };
    this.phase = 0; this.t = 0;
    this.path = null; this.speed = 0.95; this.onArrive = null;
    this.headYaw = 0; this.headPitch = 0; this.wagAmp = 0.2; this.jawOpen = 0; this.pant = 0;
    this.carry = null;
    this.barkT = 0;
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  setState(s) { this.state = s; }
  // 沿着一串地上的路点小跑过去，到了以后回调
  walk(path, onArrive = null, speed = 0.95) { this.path = path.map((p) => p.clone()); this.onArrive = onArrive; this.speed = speed; this.state = 'walk'; }
  // 叼住一样东西（挂到嘴里）
  hold(obj) {
    this.carry = obj;
    if (obj) { this.mouth.add(obj); obj.position.set(0, 0, 0); obj.rotation.set(0, Math.PI / 2, 0); }
  }
  bark() { this.barkT = 0.35; }

  update(dt, t, { look = null } = {}) {
    this.t += dt;
    const W = this.w, st = this.state;
    // 走路
    let speed = 0;
    if (st === 'walk' && this.path && this.path.length) {
      const p = this.root.position, tgt = this.path[0];
      _v.set(tgt.x - p.x, 0, tgt.z - p.z);
      const d = _v.length();
      if (d < 0.06) {
        this.path.shift();
        if (!this.path.length) { this.path = null; this.state = 'stand'; const f = this.onArrive; this.onArrive = null; if (f) f(); }
      } else {
        const turn = Math.atan2(_v.x, _v.z);
        this.root.rotation.y = dampAngle(this.root.rotation.y, turn, 9, dt);
        const face = Math.cos(this.root.rotation.y - turn);
        speed = this.speed * clamp(face, 0.25, 1) * clamp(d / 0.3, 0.35, 1);
        p.addScaledVector(_v.normalize(), Math.min(d, speed * dt));
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    W.walk = lerp(W.walk, speed > 0.05 ? 1 : 0, k);
    W.lie = lerp(W.lie, st === 'lie' ? 1 : 0, 1 - Math.exp(-dt * 3));
    W.rummage = lerp(W.rummage, st === 'rummage' ? 1 : 0, k);
    W.eat = lerp(W.eat, st === 'eat' ? 1 : 0, k);
    this.phase += dt * speed * 9.5;
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    // 看着人：离得近才抬头看
    let lookYaw = 0, lookPitch = 0, near = 0;
    if (look) {
      this.head.getWorldPosition(_w);
      _v.subVectors(look, _w);
      const dist = _v.length();
      near = clamp(1 - (dist - 1.2) / 2.2, 0, 1);
      const inv = this.root.rotation.y;
      const lx = _v.x * Math.cos(-inv) + _v.z * Math.sin(-inv), lz = -_v.x * Math.sin(-inv) + _v.z * Math.cos(-inv);
      lookYaw = clamp(Math.atan2(lx, lz), -1.0, 1.0) * near;
      lookPitch = clamp(Math.atan2(_v.y, Math.hypot(lx, lz)), -0.5, 0.6) * near;
    }
    const busy = W.rummage + W.eat;
    this.headYaw = damp(this.headYaw, lookYaw * (1 - busy) * (st === 'walk' ? 0.2 : 1), 4, dt);
    this.headPitch = damp(this.headPitch, lookPitch * (1 - busy), 4, dt);
    // ---- 摆姿势 ----
    const breathe = Math.sin(this.t * (W.lie > 0.5 ? 1.4 : 2.6));
    let bodyY = 0.42 + Math.abs(s) * 0.02 * W.walk, bodyRx = 0;
    bodyY = lerp(bodyY, 0.15 + breathe * 0.006, W.lie);
    bodyRx += 0.28 * W.rummage + 0.16 * W.eat;
    bodyY -= 0.08 * W.rummage + 0.05 * W.eat;
    this.body.position.y = bodyY;
    this.body.rotation.x = bodyRx;
    this.body.scale.set(1, 1 + breathe * 0.012, 1);
    // 腿：小跑时对角线两条腿一起迈；趴着时前腿往前伸、后腿收在身子底下
    for (const L of this.legs) {
      const diag = (L.front ? 1 : -1) * L.side;
      const sw = diag > 0 ? s : -s;
      let hx = sw * 0.5 * W.walk, kx = 0;
      if (L.front) kx = Math.max(0, -Math.cos(ph + (diag > 0 ? 0 : Math.PI))) * 0.7 * W.walk;
      else kx = -Math.max(0, Math.cos(ph + (diag > 0 ? 0 : Math.PI))) * 0.5 * W.walk;
      // 趴着
      hx = lerp(hx, L.front ? -1.45 : -1.25, W.lie);
      kx = lerp(kx, L.front ? 0.05 : 2.35, W.lie);
      // 翻找 / 吃东西：前腿弯下去
      if (L.front) { hx -= 0.3 * W.rummage + 0.2 * W.eat; kx += 0.5 * W.rummage + 0.3 * W.eat; }
      else { hx += 0.22 * W.rummage; kx -= 0.35 * W.rummage; }
      L.hip.rotation.set(hx, 0, 0);
      L.knee.rotation.set(kx, 0, 0);
    }
    // 脖子、脑袋
    const rum = Math.sin(this.t * 7) * W.rummage;
    // 脖子往前上方斜着（x 转正 = 往前倒）；脑袋反着转回来，口鼻朝前、微微朝下
    this.neck.rotation.set(lerp(0.55, 1.5, W.lie) + 0.6 * W.rummage + 0.75 * W.eat - this.headPitch * 0.4 + Math.sin(ph * 2) * 0.05 * W.walk, this.headYaw * 0.4 + rum * 0.3, 0);
    this.head.rotation.set(lerp(-0.4, -1.3, W.lie) + 0.25 * W.eat - this.headPitch * 0.6, this.headYaw * 0.6 + rum * 0.25, lerp(0, 0.3, W.lie) * (1 - near) + Math.sin(this.t * 0.7) * 0.05);
    // 嘴：喘气（跑过以后、看见人）、吃东西（一张一合）、叫
    this.pant = damp(this.pant, W.walk > 0.3 || near > 0.5 ? 1 : 0, 1.5, dt);
    this.barkT = Math.max(0, this.barkT - dt);
    let jaw = this.carry ? 0.16 : (Math.sin(this.t * 10) * 0.5 + 0.5) * 0.2 * this.pant * (1 - W.lie);
    if (W.eat > 0.3) jaw = Math.max(0, Math.sin(this.t * 13)) * 0.35;
    if (this.barkT > 0) jaw = 0.5 * Math.sin((this.barkT / 0.35) * Math.PI);
    this.jawOpen = damp(this.jawOpen, jaw, 18, dt);
    this.jaw.rotation.x = this.jawOpen;
    this.tongue.visible = this.jawOpen > 0.06 && !this.carry;
    // 耳朵：跑起来往后贴，看见人往前立
    for (const e of this.ears) e.rotation.x = -0.2 + 0.35 * W.walk - 0.25 * near;
    // 尾巴：人越近摇得越欢；趴着时贴着地慢慢扫
    const want = st === 'lie' ? 0.15 + near * 0.5 : 0.55 + near * 0.5 + (this.carry ? 0.3 : 0);
    this.wagAmp = damp(this.wagAmp, want, 2, dt);
    const wag = Math.sin(this.t * (st === 'lie' ? 4 : 12)) * this.wagAmp;
    this.tail.rotation.set(lerp(-0.7, -1.72, W.lie) + 0.3 * W.rummage, wag * 0.9, 0);
    // 趴着时尾巴顺着地面拖着（不往上翘）
    this.segs[1].rotation.set(lerp(0.25, -0.04, W.lie), wag * 0.3, 0);
    this.segs[2].rotation.set(lerp(0.2, -0.04, W.lie), wag * 0.25, 0);
  }
  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) { if (m.map) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); m.dispose(); }
  }
}
