// 阴影缓存。
// 以前每帧要把 700 多个投影物体（床、桌子、墙……）重新画进每一盏灯的阴影贴图，而且 GTAO、描边这些
// 后处理自己再渲染一次场景时，three.js 又会把所有阴影重画一遍——一帧最多要画五千多次阴影。
// 现在：
//   · 每帧只在主画面渲染时更新一次阴影（后处理、镜子里的重复渲染直接用这一帧的结果）；
//   · 每盏灯留一张"静态阴影"，只画不动的东西，东西动了 / 出现 / 消失、灯本身变了才重画；
//   · 每帧先把静态深度拷回真正的阴影贴图，再用深度测试把正在动的东西（人物、正在开的门……）叠画上去。
// 深度取最小值，叠出来的结果和整张重画完全一样，画质不变。
import * as THREE from 'three';

const L_STATIC = 30, L_DYN = 31; // 只给阴影用的两个图层，主相机只看图层 0，不受影响
const HOLD = 45; // 动过的东西要连续静止这么多帧才回到静态阴影里（开门、拿东西的过程中不用反复重画静态阴影）

export class ShadowCache {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sm = renderer.shadowMap;
    this.frame = 0;
    this.pending = false;
    this.epoch = 0; // 静态物体集合的版本号，变了就要重画各灯的静态阴影
    this.dynCount = 0;
    this.objs = new Map();
    this.lights = new Map();
    this.camS = new THREE.Camera(); this.camS.layers.set(L_STATIC);
    this.camD = new THREE.Camera(); this.camD.layers.set(L_DYN);
    this.camNone = new THREE.Camera(); this.camNone.layers.disableAll();
    this._orig = this.sm.render.bind(this.sm);
    this.sm.render = (lights, scn, cam) => this._render(lights, scn, cam);
    this._noClear = () => {};
  }
  // 每一帧主画面渲染之前调用：这一帧的第一次主场景渲染会顺便更新阴影
  arm() { this.pending = true; }
  // 材质重编译、阴影开关切换之后：静态阴影全部重画
  invalidate() { this.epoch++; }

  _render(lights, scn, cam) {
    if (!this.sm.enabled) return;
    if (scn !== this.scene) { this._orig(lights, scn, cam); return; }
    if (!this.pending) { // 这一帧已经画过了（GTAO / 描边 / 镜子又渲染了一次场景），只补上还不存在的阴影贴图
      for (const l of lights) {
        if (l.shadow.map !== null) continue;
        l.shadow.needsUpdate = true; this.sm.needsUpdate = true;
        this._orig([l], scn, l.isPointLight || l.userData.staticShadow ? cam : this.camNone); // 缓存管的灯：先建一张空的，下一帧再正式画
      }
      return;
    }
    this.pending = false;
    this.frame++;
    this._scan();
    const r = this.renderer;
    const rt = r.getRenderTarget(), face = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel();
    const other = [];
    for (const l of lights) {
      // 点光源（立方体阴影）和"只烘一次"的灯（洗手间）照旧
      if (l.isPointLight || l.userData.staticShadow) {
        if (l.userData.staticShadow) { l.shadow.autoUpdate = false; if (l.shadow.map === null) l.shadow.needsUpdate = true; }
        other.push(l);
      } else this._light(l, scn);
    }
    if (other.length) { this.sm.needsUpdate = true; this._orig(other, scn, cam); }
    // 已经不在场景里的灯（换章）：释放它们的静态阴影
    for (const [l, st] of this.lights) if (st.seen !== this.frame) { if (st.rt) st.rt.dispose(); this.lights.delete(l); }
    r.setRenderTarget(rt, face, mip);
  }

  // 找出所有投影物体，比较它们和上一帧相比有没有动
  _scan() {
    const f = this.frame;
    let dyn = 0;
    const visit = (o) => {
      if (o.visible === false) return;
      if (o.castShadow && (o.isMesh || o.isLine || o.isPoints)) {
        let rec = this.objs.get(o);
        if (!rec) { rec = { m: new Float64Array(16), k: new Float64Array(6), last: f, seen: 0, inStatic: false }; this.objs.set(o, rec); }
        const e = o.matrixWorld.elements, m = rec.m;
        let ch = rec.seen !== f - 1; // 上一帧不在（刚出现 / 重新显示）
        for (let i = 0; i < 16; i++) if (m[i] !== e[i]) { ch = true; m[i] = e[i]; }
        const g = o.geometry, k = rec.k, mat = o.material;
        const pos = g.attributes.position, im = o.instanceMatrix;
        const k0 = g.id, k1 = pos ? pos.version : 0, k2 = (g.index ? g.index.version : 0) + g.drawRange.start * 1e3 + (g.drawRange.count === Infinity ? 0 : g.drawRange.count) * 1e6;
        const k3 = im ? im.version + (o.count || 0) * 1e6 : 0;
        const k4 = Array.isArray(mat) ? mat.reduce((s, x, i) => s + (x ? x.id * (i + 1) * (x.visible ? 1 : -1) : 0), 0) : mat.id * (mat.visible ? 1 : -1);
        const k5 = Array.isArray(mat) ? 0 : mat.side + (mat.alphaTest > 0 ? 3 : 0) + (mat.map ? mat.map.id * 8 : 0);
        if (k[0] !== k0 || k[1] !== k1 || k[2] !== k2 || k[3] !== k3 || k[4] !== k4 || k[5] !== k5) { ch = true; k[0] = k0; k[1] = k1; k[2] = k2; k[3] = k3; k[4] = k4; k[5] = k5; }
        if (ch) rec.last = f;
        rec.seen = f;
        const isStatic = f - rec.last >= HOLD;
        if (isStatic !== rec.inStatic) {
          rec.inStatic = isStatic;
          this.epoch++;
          if (isStatic) { o.layers.enable(L_STATIC); o.layers.disable(L_DYN); } else { o.layers.enable(L_DYN); o.layers.disable(L_STATIC); }
        } else if (!isStatic && !o.layers.isEnabled(L_DYN)) { o.layers.enable(L_DYN); o.layers.disable(L_STATIC); }
        if (!isStatic) dyn++;
      }
      const c = o.children;
      for (let i = 0; i < c.length; i++) visit(c[i]);
    };
    visit(this.scene);
    // 这一帧不在的：之前在静态阴影里就要重画；太久没出现的记录丢掉
    for (const [o, rec] of this.objs) {
      if (rec.seen === f) continue;
      if (rec.inStatic) { rec.inStatic = false; this.epoch++; }
      if (f - rec.seen > 600) { this.objs.delete(o); o.layers.disable(L_STATIC); o.layers.disable(L_DYN); }
    }
    this.dynCount = dyn;
  }

  _light(l, scn) {
    const s = l.shadow, r = this.renderer;
    s.autoUpdate = false;
    let st = this.lights.get(l);
    if (!st) { st = { rt: null, epoch: -1, sig: new Float64Array(40), seen: 0, hadDyn: true, off: true }; this.lights.set(l, st); }
    st.seen = this.frame;
    // 灯灭着：这盏灯的阴影看不见，先不画——但阴影贴图本身必须存在：
    // 着色器照样会采样它，贴图是 null 的话整批受光物体的 draw call 都会报错、直接画不出来
    if (l.intensity <= 0.01) {
      st.off = true;
      if (s.map === null) { s.needsUpdate = true; this.sm.needsUpdate = true; this._orig([l], scn, this.camNone); }
      return;
    }
    const moved = this._lightChanged(l, st);
    const needStatic = st.rt === null || st.epoch !== this.epoch || moved;
    const fresh = s.map === null || st.off;
    st.off = false;
    if (!needStatic && !fresh && this.dynCount === 0 && !st.hadDyn) return; // 什么都没变
    st.hadDyn = this.dynCount > 0;
    if (needStatic) {
      const real = s.map;
      s.map = st.rt; s.needsUpdate = true; this.sm.needsUpdate = true;
      this._orig([l], scn, this.camS);
      st.rt = s.map; s.map = real; st.epoch = this.epoch;
    }
    // 第一次：先让 three.js 按它的规格建好真正的阴影贴图（不画任何东西）
    if (s.map === null) { s.needsUpdate = true; this.sm.needsUpdate = true; this._orig([l], scn, this.camNone); }
    if (s.map.width !== st.rt.width || s.map.height !== st.rt.height) s.map.setSize(st.rt.width, st.rt.height);
    r.copyTextureToTexture(st.rt.depthTexture, s.map.depthTexture);
    if (this.dynCount > 0) {
      const clear = r.clear;
      r.clear = this._noClear; // 保留刚拷进去的静态深度
      try { s.needsUpdate = true; this.sm.needsUpdate = true; this._orig([l], scn, this.camD); } finally { r.clear = clear; }
    }
  }

  // 灯的位置、朝向、范围、阴影相机参数有没有变
  _lightChanged(l, st) {
    const s = l.shadow, c = s.camera, sig = st.sig;
    let i = 0, ch = false;
    const put = (v) => { if (sig[i] !== v) { sig[i] = v; ch = true; } i++; };
    const e = l.matrixWorld.elements;
    for (let j = 12; j < 15; j++) put(e[j]);
    if (l.target) { l.target.updateMatrixWorld(); const t = l.target.matrixWorld.elements; for (let j = 12; j < 15; j++) put(t[j]); }
    put(l.angle || 0); put(l.distance || 0); put(s.focus || 0);
    put(c.near); put(c.far); put(c.left || 0); put(c.right || 0); put(c.top || 0); put(c.bottom || 0); put(c.zoom || 1);
    put(s.mapSize.x); put(s.mapSize.y);
    return ch;
  }
}
