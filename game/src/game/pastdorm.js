// 第四章隐藏结局：书架背后的"另一个时空"——考试前一天晚上 02:47 的 211 宿舍（第一章的写实画风）。
//   整间宿舍另外搭在一个单独的场景里，绕着书架背板转了 180°：两个书架背靠背，太空舱这边抽掉一本书，
//   从空隙里看过去，就是宿舍书架上书与书之间的缝——电脑前两个人在打排位（其中一个是你自己），
//   另外两个室友站在后面指指点点。画面每帧用同一个镜头渲染到一张贴图上，贴在资料库那一格的背板上。
import * as THREE from 'three';
import { createCharacter } from '../player/character.js';
import * as TX from '../core/textures.js';
import { FALLEN_BOOKS } from '../world/dorm.js';
import { clamp, lerp, dampAngle, easeInOut } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V();
// K.book(w, t, d) 是躺平的一本书（w 宽、t 厚、d 长）；立在书架上：w → 高（y）、t → 沿着书架（z）、d → 进深（x，书脊朝屋里）
const STAND = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0)));

// 过去的宿舍：本地坐标就是宿舍自己的坐标；绕 (x=-1.8, z=-1.075) 转半圈，书架背板正好贴着太空舱资料库的背板
export const PAST_POS = V(-3.6, 0, -2.15);

function dress(ch, { top, sleeve, pants, hair }) {
  const M = ch.mats;
  const plain = (m, c) => { if (!m || !c) return; m.map = null; m.normalMap = null; m.color.set(c); m.needsUpdate = true; };
  plain(M.jacketMat, top); plain(M.sleeveMat, sleeve || top); plain(M.jeansMat, pants);
  if (hair) M.hairMat.color.set(hair);
}

export class PastDorm {
  constructor(g) {
    this.g = g;
    const { scene, refs } = g.buildPast();
    this.scene = scene; this.refs = refs;
    const R = refs, K = R.K;
    const root = R.root;
    root.position.copy(PAST_POS); root.rotation.y = Math.PI;
    // 书架背后要"透"：西墙、原来的书架、门外走廊都拿掉；门上没锁（那天晚上还没人锁门）
    R.westWall.visible = false;
    R.shelf.visible = false;
    R.corridor.visible = false;
    R.lock.group.visible = false; R.lock.dropped.visible = false;
    R.outside.group.visible = false;
    for (const b of R.fallenBooks) b.visible = false;
    // 夜里：大灯关着，窗帘拉着，只有两台显示器和窗边书桌上的台灯亮着
    R.curtain.layout(1);
    R.view.material.color.set('#0c1224');
    const L = R.lights;
    L.hemi.intensity = 0.09; L.hemi.color.set('#8aa0d8'); L.hemi.groundColor.set('#2a2030');
    L.winLight.intensity = 0.12; L.winLight.color.set('#5a6aa0');
    L.sun.intensity = 0;
    for (const s of L.ceilSpots) s.intensity = 0;
    for (const m of L.tubeMats) m.emissiveIntensity = 0;
    L.monLight.intensity = 2.2; L.monLight.color.set('#bcd4ff'); L.monLight.distance = 3.6;
    const mon2Light = new THREE.PointLight('#c8d8ff', 1.8, 3.4, 1.6); mon2Light.position.set(1.32, 1.1, -0.8); root.add(mon2Light);
    const lamp = new THREE.PointLight('#ffc98a', 1.1, 4.5, 1.5); lamp.position.set(-0.7, 1.25, -3.0); root.add(lamp);
    const fill = new THREE.PointLight('#ffd9b0', 0.5, 4, 1.4); fill.position.set(-1.1, 2.0, -1.05); root.add(fill);
    if (L.wc) L.wc.intensity = 0;
    if (L.corridor) L.corridor.intensity = 0;
    scene.traverse((o) => { if (o.isLight) o.castShadow = false; });
    scene.environment = g.scene.environment;
    scene.environmentIntensity = 0.04;
    // 两台显示器都开着：打排位
    const c2 = TX.makeCanvas(1024, 576); TX.drawMobaScreen(c2);
    const t2 = TX.toTex(c2, { wrap: false });
    const sm = R.monitor2.userData.screenMat;
    if (sm) { sm.map = t2; sm.color && sm.color.set('#ffffff'); sm.needsUpdate = true; }
    // 挂钟：02:47
    const cl = R.clock.userData;
    cl.hour.rotation.z = -((2 + 47 / 60) / 12) * Math.PI * 2; cl.minute.rotation.z = -(47 / 60) * Math.PI * 2; cl.second.rotation.z = -0.3;
    // 宿舍书架（换一个没有背板的，和太空舱的资料库一样高），第五层正对着太空舱那边的空隙，那里有三本会被推下去的书
    this._buildShelf(K);
    // 四个人
    this._buildPeople(R, K);
    root.updateMatrixWorld(true);
    // 渲染目标
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 });
    this.t = 0;
    this.react = 0;
  }

  _buildShelf(K) {
    const R = this.refs, root = R.root;
    const wood = K.std('#d4bc93', 0.7), X0 = -1.8, X1 = -1.45, Z0 = -1.3, Z1 = -0.85, zc = (Z0 + Z1) / 2;
    const levels = [0.02, 0.43, 0.84, 1.25, 1.62, 2.0];
    const g = new THREE.Group(); root.add(g);
    for (const z of [Z0 + 0.01, Z1 - 0.01]) g.add(K.mesh(K.box(0.35, 2.04, 0.02), wood, { x: (X0 + X1) / 2, y: 1.02, z }));
    for (const y of levels) g.add(K.mesh(K.box(0.35, 0.022, 0.45), wood, { x: (X0 + X1) / 2, y }));
    const cols = ['#284f8f', '#8a2020', '#e3d5b8', '#2a6a40', '#333333', '#b0772a', '#6a4a8a', '#c0c0b8'];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.pushables = [];
    levels.slice(0, 5).forEach((y0, li) => {
      let z = Z0 + 0.03;
      while (z < Z1 - 0.05) {
        const t = 0.03 + rnd() * 0.02, h = 0.2 + rnd() * 0.06, d = 0.19 + rnd() * 0.04;
        // 第五层中间：三本厚厚的教材（从背后看是书口），书与书之间留着几道缝——要被推下去的就是它们
        if (li === 4 && z > -1.17 && z < -0.88) {
          FALLEN_BOOKS.forEach(([fx, fy, fz, rx, ry, rz, c, th], i) => {
            const b = K.book(0.2, th, 0.24, c);
            // 竖起来立在书架上：书脊朝屋里（本地 +x）
            const home = { p: V(X1 - 0.13, y0 + 0.011 + 0.1, -1.12 + i * 0.09), q: STAND.clone() };
            b.position.copy(home.p); b.quaternion.copy(home.q);
            root.add(b);
            this.pushables.push({ mesh: b, home, rest: { p: V(fx, fy, fz), r: new THREE.Euler(rx, ry, rz) }, pushed: false });
          });
          z = -0.87;
          continue;
        }
        const b = K.book(h, t, d, cols[Math.floor(rnd() * cols.length)]);
        b.position.set(X1 - 0.02 - d / 2, y0 + 0.011 + h / 2, z + t / 2);
        b.quaternion.copy(STAND);
        g.add(b);
        z += t + 0.003;
      }
    });
    this.shelf = g;
  }

  _buildPeople(R, K) {
    const root = R.root, S = this.g.S;
    const mk = (opts, look) => { const ch = createCharacter(opts); dress(ch, look); root.add(ch.root); return ch; };
    // 你自己（通宵打排位，就是第一章早上趴在桌上睡着的那身衣服）
    const me = createCharacter(); root.add(me.root);
    me.root.position.set(R.sit.x, 0, R.sit.z); me.root.rotation.y = R.sit.yaw;
    // C：坐在自己的书桌前，戴着耳机
    const C = mk({ skin: [200, 150, 118], skinColor: '#c8906e', hairColor: '#2a1c14' }, { top: '#5a6270', pants: '#2a2c33', hair: '#2a1c14' });
    C.root.position.set(1.0, 0, -0.85); C.root.rotation.y = Math.PI / 2;
    const hs = R.headset; hs.parent && hs.parent.remove(hs); hs.position.set(0, 0.03, 0); hs.rotation.set(0, Math.PI / 2, 0); hs.scale.setScalar(1.05); C.helmetSlot.add(hs);
    // A：白 T 恤 + 白色棒球帽，站在两台电脑后面
    const A = mk({ skin: [222, 172, 138], skinColor: '#dca88a', hairColor: '#1a1410' }, { top: '#e8e6e0', pants: '#3a4a6a', hair: '#1a1410' });
    A.root.position.set(0.3, 0, -0.55); A.root.rotation.y = Math.PI / 2 + 0.25;
    const cap = K.whiteCap(); cap.scale.setScalar(0.95); cap.position.set(0, -0.005, 0.0); A.helmetSlot.add(cap);
    // B：红色卫衣，站在我身后探头看
    const B = mk({ skin: [205, 158, 120], skinColor: '#cc9a78', hairColor: '#3a2a1a' }, { top: '#b8352a', pants: '#1e2026', hair: '#3a2a1a' });
    B.root.position.set(0.42, 0, 0.15); B.root.rotation.y = Math.PI / 2 - 0.3;
    for (const ch of [me, C, A, B]) ch.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    me.setExpression('focus'); C.setExpression('focus'); A.setExpression('grin'); B.setExpression('grin');
    this.people = { me, C, A, B };
    this.names = { me: S.name, A: S.mates[0], B: S.mates[1], C: S.mates[2] };
    // 键盘 / 鼠标 / 屏幕的位置（世界坐标，用来算手和视线）
    R.root.updateMatrixWorld(true);
    const D2 = R.desks.D2;
    this.pts = {
      kb1: R.keyboard.getWorldPosition(V()).add(V(0, 0.02, 0)),
      ms1: R.mouse.getWorldPosition(V()).add(V(0, 0.02, 0)),
      kb2: D2.localToWorld(V(-0.05, 0.79, 0.1)),
      ms2: D2.localToWorld(V(0.3, 0.79, 0.12)),
      scr1: R.monitor.group.localToWorld(V(0, 0.3, 0)),
      scr2: R.monitor2.localToWorld(V(0, 0.3, 0)),
      shelf: root.localToWorld(V(-1.45, 1.75, -1.07)),
    };
    // 各人的状态：A 可能会走到书架前面去
    this.st = { A: { mode: 'watch', t: 0, pos: A.root.position.clone(), yaw: A.root.rotation.y }, react: 0, meTurn: 0, cheerT: 0 };
  }

  // 世界坐标 → 某人躯干坐标系
  _local(ch, p) { ch.root.updateMatrixWorld(true); return ch.J.torso.worldToLocal(_a.copy(p)).clone(); }
  // 朝某个世界坐标点转头：返回相对身体朝向的 yaw / pitch
  _look(ch, p) {
    ch.root.getWorldPosition(_b); _b.y += 1.55;
    const d = _a.copy(p).sub(_b);
    const worldYaw = Math.atan2(d.x, d.z);
    ch.root.getWorldQuaternion(_q);
    const bodyYaw = new THREE.Euler().setFromQuaternion(_q, 'YXZ').y;
    return { lookYaw: clamp(((worldYaw - bodyYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.1, 1.1), lookPitch: clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.8, -0.6, 0.5) };
  }

  // 推一本书：从背后推下书架，掉在书架前的地上（正好是第一章里它们躺着的样子）
  push(i) {
    const b = this.pushables[i];
    if (!b || b.pushed) return false;
    b.pushed = true;
    const g = this.g;
    const p0 = b.home.p.clone(), q0 = b.home.q.clone(), q1 = new THREE.Quaternion().setFromEuler(b.rest.r);
    const edge = p0.clone().add(V(0.22, 0.02, 0));
    g.tween(0.35, (k) => { b.mesh.position.lerpVectors(p0, edge, k); }, { ease: (t) => t * t, done: () => {
      const p1 = edge.clone(), p2 = b.rest.p;
      g.tween(0.55, (k) => {
        b.mesh.position.set(lerp(p1.x, p2.x, k), lerp(p1.y, p2.y, k * k) + Math.sin(k * Math.PI) * 0.12, lerp(p1.z, p2.z, k));
        b.mesh.quaternion.slerpQuaternions(q0, q1, k);
      }, { ease: (t) => t, done: () => { g.audio.thud(); this.react = 1.6; } });
    } });
    return true;
  }

  // A 走到书架前：捡起书，凑近书缝往里看（和太空舱里的你隔着书架对视）
  approach() { this.st.A.mode = 'walk'; this.st.A.t = 0; }

  update(dt) {
    this.t += dt;
    const t = this.t, P = this.people, pts = this.pts, st = this.st;
    if (this.react > 0) this.react -= dt;
    const startled = this.react > 0;
    // 打字：手在键盘和鼠标之间抖（加一点噪声，看着像在疯狂按键）
    const jit = (s) => V(Math.sin(t * 23 + s) * 0.012, Math.abs(Math.sin(t * 31 + s)) * 0.012, Math.sin(t * 17 + s * 2) * 0.01);
    const typer = (ch, kb, ms, s, turn = 0) => {
      const lk = startled ? this._look(ch, pts.shelf) : this._look(ch, kb === pts.kb1 ? pts.scr1 : pts.scr2);
      ch.update(dt, {
        sit: 1, ...lk,
        ikL: { p: this._local(ch, _b.copy(kb).add(V(0, 0, -0.08)).add(jit(s))), w: startled ? 0.4 : 1 },
        ikR: { p: this._local(ch, _b.copy(ms).add(jit(s + 3))), w: startled ? 0.4 : 1 },
      });
      ch.root.rotation.y = lerp(ch.root.rotation.y, Math.PI / 2 - turn, 1 - Math.exp(-dt * 4));
    };
    typer(P.me, pts.kb1, pts.ms1, 0, startled ? 0.9 : 0);
    typer(P.C, pts.kb2, pts.ms2, 1.7, 0);
    // 站着的两个：指着屏幕比划，偶尔激动得举手
    const pointer = (ch, target, s) => {
      const lk = startled ? this._look(ch, pts.shelf) : this._look(ch, target);
      const ph = Math.sin(t * 0.9 + s);
      const pointing = ph > -0.2 && !startled;
      const sh = ch.J.shR.getWorldPosition(V());
      const dir = _a.copy(target).sub(sh).normalize();
      const hand = sh.clone().addScaledVector(dir, 0.56).add(V(0, Math.sin(t * 7 + s) * 0.03, 0));
      ch.update(dt, { ...lk, cheer: st.cheerT > 0 && s > 1 ? 1 : 0, ikR: { p: this._local(ch, hand), w: pointing ? 1 : 0, fing: 0.2 } });
    };
    if (st.cheerT > 0) st.cheerT -= dt;
    else if (Math.random() < dt * 0.08) st.cheerT = 1.2;
    const A = st.A;
    if (A.mode === 'watch') pointer(P.A, pts.scr2, 0.3);
    else this._updateA(dt);
    pointer(P.B, pts.scr1, 2.1);
  }
  _updateA(dt) {
    const A = this.st.A, ch = this.people.A, R = this.refs;
    A.t += dt;
    // 本地坐标：走到书架前 (-1.12, -1.07)，面朝书架（本地 -x）
    const goal = V(-1.1, 0, -1.07);
    if (A.mode === 'walk') {
      const d = goal.clone().sub(ch.root.position); d.y = 0;
      const dist = d.length();
      if (dist < 0.04) { A.mode = 'pick'; A.t = 0; }
      else {
        ch.root.position.addScaledVector(d.normalize(), Math.min(dist, 0.9 * dt));
        ch.root.rotation.y = dampAngle(ch.root.rotation.y, Math.atan2(d.x, d.z), 8, dt);
      }
      ch.update(dt, { speed: dist < 0.04 ? 0 : 0.9 });
      return;
    }
    ch.root.rotation.y = dampAngle(ch.root.rotation.y, -Math.PI / 2, 6, dt);
    if (A.mode === 'pick') {
      // 蹲下捡起《高数》，站起来，凑到书缝跟前
      const crouch = A.t < 1.0 ? 1 : 0;
      ch.update(dt, { crouch, reach: A.t > 0.4 && A.t < 1.0 ? 1 : 0, reachPitch: -0.9, lookPitch: -0.5 });
      if (A.t > 0.8 && !A.hasBook) { A.hasBook = true; const b = this.pushables[0].mesh; b.visible = false; }
      if (A.t > 1.6) { A.mode = 'peer'; A.t = 0; ch.setExpression('focus'); }
      return;
    }
    if (A.mode === 'peer') {
      // 探头：往书架那边凑
      const k = easeInOut(clamp(A.t / 1.2, 0, 1));
      ch.root.position.x = lerp(goal.x, goal.x - 0.12, k);
      ch.root.position.y = 0.1 * k; // 踮起脚往缝里看
      ch.update(dt, { lookPitch: 0.12, ikR: { p: this._local(ch, R.root.localToWorld(V(-1.3, 1.1, -1.12))), w: 0.8 } });
      return;
    }
    if (A.mode === 'leave') {
      const home = V(0.3, 0, -0.55);
      const d = home.clone().sub(ch.root.position); d.y = 0;
      const dist = d.length();
      ch.root.position.y = Math.max(0, ch.root.position.y - dt * 0.3);
      if (dist > 0.04) { ch.root.position.addScaledVector(d.normalize(), Math.min(dist, 1.0 * dt)); ch.root.rotation.y = dampAngle(ch.root.rotation.y, Math.atan2(d.x, d.z), 8, dt); }
      else { A.mode = 'watch'; ch.setExpression('grin'); }
      ch.update(dt, { speed: dist > 0.04 ? 1.0 : 0 });
    }
  }
  // A 把书放回地上，回去接着看
  leave() {
    const A = this.st.A;
    A.mode = 'leave';
    const b = this.pushables[0];
    b.mesh.visible = true; b.mesh.position.copy(b.rest.p); b.mesh.rotation.copy(b.rest.r);
  }

  // 用同一个镜头画一帧"过去"（不受太空舱那边的裁剪面影响）
  render(renderer, camera, scale = 1) {
    const size = renderer.getDrawingBufferSize(_b2);
    const w = Math.max(4, Math.floor(size.x * scale)), h = Math.max(4, Math.floor(size.y * scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const planes = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(prev);
    renderer.clippingPlanes = planes;
  }

  dispose() {
    this.rt.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) m && m.dispose();
    });
  }
}
const _q = new THREE.Quaternion(), _b2 = new THREE.Vector2();
