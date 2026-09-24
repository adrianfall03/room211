// 道具工具箱：材质 + 各种程序化建模的宿舍物件
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/util.js';
import * as TX from '../core/textures.js';

export class Kit {
  constructor(T) {
    this.T = T;
    this.gcache = new Map();
    this.mcache = new Map();
    this.rnd = mulberry32(20260924);
    this.M = this._materials();
  }

  // ---------- 通用 ----------
  std(color, rough = 0.7, metal = 0, extra = {}) {
    const key = `${color}|${rough}|${metal}|${JSON.stringify(Object.keys(extra))}`;
    if (!Object.keys(extra).length && this.mcache.has(key)) return this.mcache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    if (!Object.keys(extra).length) this.mcache.set(key, m);
    return m;
  }
  geo(key, fn) {
    if (!this.gcache.has(key)) this.gcache.set(key, fn());
    return this.gcache.get(key);
  }
  box(w, h, d) { return this.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); }
  rbox(w, h, d, r = 0.01, s = 2) { return this.geo(`rb${w},${h},${d},${r},${s}`, () => new RoundedBoxGeometry(w, h, d, s, r)); }
  cyl(rt, rb, h, seg = 16, open = false) { return this.geo(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); }
  sph(r, ws = 16, hs = 12) { return this.geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)); }

  mesh(geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(o.x || 0, o.y || 0, o.z || 0);
    m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.s !== undefined) {
      if (typeof o.s === 'number') m.scale.setScalar(o.s);
      else m.scale.set(o.s[0], o.s[1], o.s[2]);
    }
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.recv !== false;
    if (o.name) m.name = o.name;
    return m;
  }
  group(o = {}) {
    const g = new THREE.Group();
    g.position.set(o.x || 0, o.y || 0, o.z || 0);
    g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.name) g.name = o.name;
    return g;
  }

  _materials() {
    const T = this.T;
    const M = {};
    const setRep = (tex, x, y) => { tex.repeat.set(x, y); return tex; };
    M.floor = new THREE.MeshStandardMaterial({
      map: setRep(T.floor.map, 3, 6), normalMap: setRep(T.floor.normalMap, 3, 6), roughnessMap: setRep(T.floor.roughnessMap, 3, 6),
      roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.6,
    });
    M.floorDirt = new THREE.MeshStandardMaterial({ map: T.floorDirt, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    M.wall = new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.93, envMapIntensity: 0.4 });
    M.ceiling = new THREE.MeshStandardMaterial({ map: T.ceiling, roughness: 0.95 });
    M.woodDark = new THREE.MeshStandardMaterial({ map: T.woodDark, roughness: 0.42, envMapIntensity: 0.7 });
    M.woodLight = new THREE.MeshStandardMaterial({ map: T.woodLight, roughness: 0.62 });
    M.woodOrange = new THREE.MeshStandardMaterial({ map: T.woodOrange, roughness: 0.45 });
    M.doorWood = new THREE.MeshStandardMaterial({ map: T.doorWood, roughness: 0.5 });
    M.blackTop = new THREE.MeshStandardMaterial({ map: T.blackLaminate, roughness: 0.38, metalness: 0.05 });
    M.blackMetal = this.std('#1b1b1d', 0.45, 0.6);
    M.frame = this.std('#cfc8b8', 0.48, 0.35);
    M.chrome = this.std('#d8dadd', 0.22, 1.0);
    M.alu = this.std('#b9bcc0', 0.35, 0.85);
    M.plasticWhite = this.std('#eeeeea', 0.35, 0);
    M.plasticBlack = this.std('#18181a', 0.35, 0);
    M.rubber = this.std('#101010', 0.9, 0);
    M.curtain = new THREE.MeshStandardMaterial({ map: T.curtain, roughness: 0.96, side: THREE.DoubleSide, emissive: new THREE.Color('#dfe6f2'), emissiveIntensity: 0.06 });
    M.net = new THREE.MeshStandardMaterial({ map: T.net, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    M.bamboo = new THREE.MeshStandardMaterial({ map: T.bamboo, roughness: 0.6 });
    M.floral = new THREE.MeshStandardMaterial({ map: T.floral, roughness: 0.95 });
    M.polka = new THREE.MeshStandardMaterial({ map: T.polka, roughness: 0.6 });
    M.yellowDots = new THREE.MeshStandardMaterial({ map: T.yellowDots, roughness: 0.7 });
    M.patternRoll = new THREE.MeshStandardMaterial({ map: T.patternRoll, roughness: 0.85 });
    M.cardboard = new THREE.MeshStandardMaterial({ map: T.cardboard, roughness: 0.95 });
    M.cardboard350 = new THREE.MeshStandardMaterial({ map: T.cardboard350, roughness: 0.95 });
    M.grayCloth = new THREE.MeshStandardMaterial({ map: T.grayCloth, roughness: 0.97, side: THREE.DoubleSide });
    M.pinkCloth = new THREE.MeshStandardMaterial({ map: T.pinkCloth, roughness: 0.97, side: THREE.DoubleSide });
    M.blackCloth = new THREE.MeshStandardMaterial({ map: T.blackCloth, roughness: 0.98 });
    M.blueCloth = new THREE.MeshStandardMaterial({ map: T.blueCloth, roughness: 0.95 });
    M.whiteCloth = new THREE.MeshStandardMaterial({ map: T.whiteCloth, roughness: 0.97 });
    M.sheet = new THREE.MeshStandardMaterial({ map: T.whiteCloth, roughness: 0.97 });
    M.glass = new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1, depthWrite: false });
    M.clearPlastic = new THREE.MeshStandardMaterial({ color: '#dfe9f0', transparent: true, opacity: 0.32, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide });
    M.bottlePlastic = new THREE.MeshStandardMaterial({ color: '#d7ecf6', transparent: true, opacity: 0.42, roughness: 0.08, depthWrite: false });
    M.paperWhite = this.std('#f1efe8', 0.9);
    M.skinApple = new THREE.MeshStandardMaterial({ color: '#b3161b', roughness: 0.3, emissive: '#200000', emissiveIntensity: 0.2 });
    return M;
  }

  // ---------- 墙体世界坐标 UV ----------
  worldUV(mesh, scaleU = 0.5, scaleV = 1 / 3) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (ny > nx && ny > nz) uv.setXY(i, x * scaleU, z * scaleU);
      else if (nx > nz) uv.setXY(i, z * scaleU, y * scaleV);
      else uv.setXY(i, x * scaleU, y * scaleV);
    }
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    g.applyMatrix4(inv);
    mesh.geometry = g;
    return mesh;
  }

  // ---------- 小物件 ----------
  bottle({ h = 0.24, r = 0.032, cap = '#2a7fd4', label = 'water', mat = null, tint = null } = {}) {
    const g = this.group();
    const key = `bottle${h},${r}`;
    const geo = this.geo(key, () => {
      const pts = [];
      pts.push(new THREE.Vector2(0, 0));
      pts.push(new THREE.Vector2(r * 0.85, 0));
      pts.push(new THREE.Vector2(r, 0.012));
      pts.push(new THREE.Vector2(r, h * 0.58));
      pts.push(new THREE.Vector2(r * 0.96, h * 0.66));
      pts.push(new THREE.Vector2(r * 0.7, h * 0.78));
      pts.push(new THREE.Vector2(r * 0.42, h * 0.88));
      pts.push(new THREE.Vector2(r * 0.38, h * 0.95));
      return new THREE.LatheGeometry(pts, 18);
    });
    let m = mat || this.M.bottlePlastic;
    if (tint) m = new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.75, roughness: 0.1, depthWrite: true });
    g.add(this.mesh(geo, m, { cast: true }));
    if (label) {
      const lm = this._labelMat(label);
      g.add(this.mesh(this.geo(`lbl${r},${h}`, () => new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.28, 18, 1, true)), lm, { y: h * 0.36 }));
    }
    g.add(this.mesh(this.cyl(r * 0.42, r * 0.42, 0.018, 12), this.std(cap, 0.5), { y: h * 0.96 }));
    return g;
  }
  _labelMat(kind) {
    const k = `label:${kind}`;
    if (!this.mcache.has(k)) this.mcache.set(k, new THREE.MeshStandardMaterial({ map: TX.genLabel(kind), roughness: 0.5 }));
    return this.mcache.get(k);
  }
  cup(color = '#f3f0e8') {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.038, 0.028, 0.09, 18, true), this.std(color, 0.8, 0, { side: THREE.DoubleSide }), { y: 0.045 }));
    g.add(this.mesh(this.cyl(0.028, 0.028, 0.002, 18), this.std(color, 0.8), { y: 0.002 }));
    return g;
  }
  noodleBowl() {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.066, 0.05, 0.1, 20), this._labelMat('noodle'), { y: 0.05 }));
    g.add(this.mesh(this.cyl(0.066, 0.066, 0.004, 20), this.std('#c9c9c9', 0.3, 0.8), { y: 0.102, rx: 0.5, z: -0.03 }));
    return g;
  }
  can(label = 'cola') {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.033, 0.033, 0.12, 18), this._labelMat(label), { y: 0.06 }));
    g.add(this.mesh(this.cyl(0.03, 0.033, 0.006, 18), this.M.chrome, { y: 0.122 }));
    return g;
  }
  snackBag(kind = 'chips', w = 0.16, h = 0.22) {
    const geo = this.geo(`snack${w},${h}`, () => {
      const b = new THREE.BoxGeometry(w, h, 0.05, 8, 8, 2);
      const p = b.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
        const f = (1 - Math.pow(Math.abs(x), 4)) * (1 - Math.pow(Math.abs(y), 6));
        p.setZ(i, p.getZ(i) * Math.max(0.05, f));
      }
      b.computeVertexNormals();
      return b;
    });
    return this.mesh(geo, this._labelMat(kind));
  }
  book(w = 0.17, t = 0.025, d = 0.24, color = '#345') {
    const cover = this.std(color, 0.65);
    const pages = this.std('#efe9da', 0.9);
    const mats = [pages, cover, cover, cover, pages, pages];
    const geo = this.box(w, t, d);
    return this.mesh(geo, mats);
  }
  paper(tex, w = 0.21, h = 0.297, seed = 1) {
    const geo = this.geo(`paper${w},${h},${seed}`, () => {
      const g = new THREE.PlaneGeometry(w, h, 6, 8);
      const r = mulberry32(seed);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, (r() - 0.5) * 0.006 + Math.pow(p.getY(i) / h, 2) * 0.01 * (seed % 3));
      g.computeVertexNormals();
      return g;
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
    return this.mesh(geo, m, { rx: -Math.PI / 2, cast: false });
  }
  clothPile({ mat = null, sx = 0.3, sy = 0.12, sz = 0.25, seed = 1 } = {}) {
    const geo = this.geo(`cloth${sx},${sy},${sz},${seed}`, () => {
      const g = new THREE.IcosahedronGeometry(1, 4);
      const r = mulberry32(seed);
      const ph = Array.from({ length: 9 }, () => r() * 6.28);
      const p = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        let n = Math.sin(v.x * 3 + ph[0]) * Math.sin(v.y * 3 + ph[1]) * Math.sin(v.z * 3 + ph[2]) * 0.22;
        n += Math.sin(v.x * 7 + ph[3]) * Math.sin(v.z * 6 + ph[4]) * 0.08;
        n += Math.sin(v.y * 11 + ph[5] + v.x * 4) * 0.04;
        v.multiplyScalar(1 + n);
        v.x *= sx; v.z *= sz; v.y *= sy;
        if (v.y < 0) v.y *= 0.15;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    });
    return this.mesh(geo, mat || this.M.blackCloth, { y: sy * 0.1 });
  }

  // 运动鞋：模板几何合并，节省 draw call
  sneaker({ upper = '#2a2a2e', sole = '#f2f2f0', accent = null } = {}) {
    const key = 'sneakerGeo';
    const geos = this.geo(key, () => {
      const soleG = new RoundedBoxGeometry(0.1, 0.03, 0.28, 2, 0.012);
      soleG.translate(0, 0.015, 0);
      const heel = new RoundedBoxGeometry(0.09, 0.075, 0.13, 3, 0.03);
      heel.translate(0, 0.06, -0.06);
      const toe = new THREE.SphereGeometry(0.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      toe.scale(0.92, 0.9, 1.6);
      toe.translate(0, 0.028, 0.045);
      const upperG = mergeGeometries([heel.toNonIndexed(), toe.toNonIndexed()]);
      const hole = new THREE.CircleGeometry(0.036, 14);
      hole.scale(1, 1.4, 1);
      hole.rotateX(-Math.PI / 2 + 0.25);
      hole.translate(0, 0.1, -0.075);
      return { soleG, upperG, hole };
    });
    const g = this.group();
    g.add(this.mesh(geos.soleG, this.std(sole, 0.7)));
    g.add(this.mesh(geos.upperG, this.std(upper, 0.75)));
    g.add(this.mesh(geos.hole, this.std('#0c0c0c', 1), { cast: false }));
    if (accent) g.add(this.mesh(this.box(0.101, 0.012, 0.12), this.std(accent, 0.6), { y: 0.05, z: -0.02 }));
    return g;
  }
  shoePair(opts = {}, spread = 0.12, rot = 0) {
    const g = this.group({ ry: rot });
    const a = this.sneaker(opts); a.position.x = -spread / 2; a.rotation.y = 0.08;
    const b = this.sneaker(opts); b.position.x = spread / 2; b.rotation.y = -0.05; b.position.z = 0.02;
    g.add(a, b);
    return g;
  }
  flipFlop(color = '#e8742a') {
    const geos = this.geo('flipflop', () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.13);
      s.bezierCurveTo(0.05, -0.13, 0.05, -0.02, 0.045, 0.04);
      s.bezierCurveTo(0.05, 0.13, -0.05, 0.14, -0.048, 0.05);
      s.bezierCurveTo(-0.05, -0.02, -0.05, -0.13, 0, -0.13);
      const sole = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
      sole.rotateX(-Math.PI / 2);
      sole.translate(0, 0.004, 0);
      const c1 = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.042, 0.02, -0.01), new THREE.Vector3(-0.02, 0.05, 0.04), new THREE.Vector3(0, 0.022, 0.08)]);
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.042, 0.02, -0.01), new THREE.Vector3(0.02, 0.05, 0.04), new THREE.Vector3(0, 0.022, 0.08)]);
      const strap = mergeGeometries([new THREE.TubeGeometry(c1, 10, 0.006, 6), new THREE.TubeGeometry(c2, 10, 0.006, 6)]);
      return { sole, strap };
    });
    const g = this.group();
    g.add(this.mesh(geos.sole, this.std(color, 0.7)));
    g.add(this.mesh(geos.strap, this.std('#1a1a1a', 0.6)));
    return g;
  }
  flipFlopPair(color, rot = 0) {
    const g = this.group({ ry: rot });
    const a = this.flipFlop(color); a.position.x = -0.06; a.rotation.y = 0.15;
    const b = this.flipFlop(color); b.position.set(0.07, 0, 0.05); b.rotation.y = -0.3;
    g.add(a, b);
    return g;
  }

  shoppingBag({ color = '#c98fa7', w = 0.36, h = 0.4, d = 0.18 } = {}) {
    const g = this.group();
    const outer = this.std(color, 0.85, 0, { side: THREE.DoubleSide });
    const inv = new THREE.MeshBasicMaterial({ visible: false });
    const body = this.mesh(new THREE.BoxGeometry(w, h, d), [outer, outer, inv, outer, outer, outer], { y: h / 2 });
    g.add(body);
    const inner = this.mesh(new THREE.PlaneGeometry(w * 0.98, d * 0.98), this.std('#e9dcc3', 0.9), { y: h * 0.25, rx: -Math.PI / 2, cast: false });
    g.add(inner);
    for (const zz of [-d / 2 + 0.01, d / 2 - 0.01]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-w * 0.2, h, zz), new THREE.Vector3(-w * 0.12, h + 0.12, zz), new THREE.Vector3(w * 0.12, h + 0.12, zz), new THREE.Vector3(w * 0.2, h, zz)]);
      g.add(this.mesh(new THREE.TubeGeometry(curve, 16, 0.005, 6), this.std('#141414', 0.7)));
    }
    return g;
  }
  softBox({ w = 0.5, h = 0.3, d = 0.35, mat, sag = 0.03, seed = 3 } = {}) {
    const geo = this.geo(`soft${w},${h},${d},${seed}`, () => {
      const b = new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * 0.22);
      const p = b.attributes.position;
      const r = mulberry32(seed);
      const ph = [r() * 6, r() * 6, r() * 6];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const top = Math.max(0, y / (h / 2));
        p.setY(i, y - top * sag * (1 - Math.abs(x / (w / 2))) + Math.sin(x * 20 + ph[0]) * 0.004);
        p.setX(i, x * (1 + Math.sin(y * 9 + ph[1]) * 0.03));
        p.setZ(i, z * (1 + Math.sin(x * 11 + ph[2]) * 0.03));
      }
      b.computeVertexNormals();
      b.translate(0, h / 2, 0);
      return b;
    });
    return this.mesh(geo, mat);
  }
  basket({ color = '#2d6fd8', r = 0.2, h = 0.36 } = {}) {
    const g = this.group();
    const tex = this.geo('basketHoles', () => {
      const c = TX.makeCanvas(128, 128), ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#000';
      for (let y = 10; y < 128; y += 22) for (let x = 6; x < 128; x += 16) ctx.fillRect(x, y, 9, 14);
      return TX.toTex(c, { data: true, repeat: [6, 2] });
    });
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, alphaMap: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    g.add(this.mesh(new THREE.CylinderGeometry(r, r * 0.82, h, 28, 1, true), m, { y: h / 2 }));
    g.add(this.mesh(this.cyl(r * 0.82, r * 0.82, 0.01, 28), this.std(color, 0.5), { y: 0.005 }));
    g.add(this.mesh(new THREE.TorusGeometry(r, 0.012, 6, 28), this.std(color, 0.45), { y: h, rx: Math.PI / 2 }));
    return g;
  }
  storageBox({ w = 0.55, h = 0.32, d = 0.4, lid = '#2f6fd6' } = {}) {
    const g = this.group();
    const inv = new THREE.MeshBasicMaterial({ visible: false });
    const cp = this.M.clearPlastic;
    g.add(this.mesh(new THREE.BoxGeometry(w, h, d), [cp, cp, inv, cp, cp, cp], { y: h / 2, cast: false }));
    g.add(this.mesh(this.rbox(w + 0.02, 0.035, d + 0.02, 0.01), this.std(lid, 0.4), { y: h + 0.015 }));
    g.add(this.mesh(this.box(w - 0.04, 0.02, d - 0.04), this.std('#3a3f48', 0.8), { y: 0.02 }));
    return g;
  }
  helmet() {
    const g = this.group();
    const white = this.std('#f4f4f2', 0.22, 0.05, { envMapIntensity: 1.2 });
    const shell = this.mesh(new THREE.SphereGeometry(0.14, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.58), white);
    shell.scale.set(0.95, 1, 1.12);
    g.add(shell);
    const stripe = this.mesh(new THREE.SphereGeometry(0.1415, 32, 20, Math.PI * 0.5 - 0.22, 0.44, 0, Math.PI * 0.58), this.std('#d0202a', 0.3), { cast: false });
    stripe.scale.copy(shell.scale);
    g.add(stripe);
    const stripe2 = stripe.clone(); stripe2.rotation.y = Math.PI; g.add(stripe2);
    const rim = this.mesh(new THREE.TorusGeometry(0.128, 0.012, 8, 32), this.std('#161616', 0.8), { y: -0.035, rx: Math.PI / 2 });
    rim.scale.set(0.95, 1.12, 1);
    g.add(rim);
    const visor = this.mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.05, 24, 1, true, -0.7, 1.4), this.std('#2a2a30', 0.1, 0.3, { transparent: true, opacity: 0.8, side: THREE.DoubleSide }), { y: 0.0, z: 0.0 });
    visor.scale.set(0.95, 1, 1.12);
    g.add(visor);
    return g;
  }
  remote() {
    const g = this.group();
    g.add(this.mesh(this.rbox(0.05, 0.018, 0.16, 0.008), this.M.plasticWhite, { y: 0.009 }));
    g.add(this.mesh(this.box(0.036, 0.002, 0.035), this.std('#5f6f68', 0.3), { y: 0.019, z: -0.045 }));
    for (let i = 0; i < 9; i++) g.add(this.mesh(this.cyl(0.0045, 0.0045, 0.004, 8), this.std(i === 0 ? '#e33' : '#bbb', 0.5), { x: ((i % 3) - 1) * 0.013, y: 0.019, z: 0.0 + Math.floor(i / 3) * 0.018, cast: false }));
    return g;
  }
  phone() {
    const g = this.group();
    g.add(this.mesh(this.rbox(0.071, 0.008, 0.143, 0.006), this.std('#e9e9ec', 0.25, 0.3), { y: 0.004 }));
    const c = TX.makeCanvas(256, 512);
    TX.drawPhoneScreen(c, 'off');
    const tex = TX.toTex(c, { wrap: false });
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
    const s = this.mesh(new THREE.PlaneGeometry(0.062, 0.11), screenMat, { y: 0.0085, rx: -Math.PI / 2, cast: false });
    g.add(s);
    g.userData.screen = { canvas: c, tex, mat: screenMat };
    g.add(this.mesh(this.cyl(0.0055, 0.0055, 0.001, 12), this.std('#ccc', 0.4), { y: 0.0085, z: 0.064, cast: false }));
    return g;
  }
  keyboard(tex, uvTex = null, uvMat = null) {
    const g = this.group();
    g.add(this.mesh(this.rbox(0.45, 0.02, 0.15, 0.006), this.std('#121214', 0.5), { y: 0.01 }));
    g.add(this.mesh(new THREE.PlaneGeometry(0.44, 0.146), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), { y: 0.0205, rx: -Math.PI / 2, cast: false }));
    if (uvMat) g.add(this.mesh(new THREE.PlaneGeometry(0.44, 0.146), uvMat, { y: 0.022, rx: -Math.PI / 2, cast: false, recv: false }));
    return g;
  }
  mouse() {
    const g = this.group();
    const body = this.mesh(this.sph(0.03, 18, 12), this.std('#141416', 0.35), { y: 0.012, s: [1.15, 0.6, 2.0] });
    g.add(body);
    g.add(this.mesh(this.cyl(0.004, 0.004, 0.01, 10), this.std('#555', 0.4), { y: 0.03, z: 0.025, rz: Math.PI / 2 }));
    g.add(this.mesh(this.box(0.002, 0.004, 0.02), this.std('#3aa0ff', 0.4, 0, { emissive: '#3aa0ff', emissiveIntensity: 1.5 }), { x: 0.03, y: 0.015, z: -0.01, cast: false }));
    return g;
  }
  mousepad(tex) {
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const side = this.std('#111', 0.9);
    return this.mesh(this.box(0.4, 0.003, 0.3), [side, side, top, side, side, side], { y: 0.0015, cast: false });
  }
  monitor(screenTex, { w = 0.53, h = 0.3, bright = 1 } = {}) {
    const g = this.group();
    const bezel = this.mesh(this.rbox(w + 0.03, h + 0.035, 0.03, 0.008), this.std('#111113', 0.4));
    bezel.position.y = 0.12 + (h + 0.035) / 2;
    g.add(bezel);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(bright, bright, bright) });
    const screen = this.mesh(new THREE.PlaneGeometry(w, h), screenMat, { y: bezel.position.y + 0.005, z: 0.0155, cast: false, recv: false });
    g.add(screen);
    g.add(this.mesh(this.box(0.05, 0.14, 0.03), this.std('#161618', 0.4), { y: 0.07, z: -0.03 }));
    g.add(this.mesh(this.rbox(0.24, 0.015, 0.17, 0.006), this.std('#161618', 0.4), { y: 0.0075, z: -0.02 }));
    g.add(this.mesh(this.box(0.006, 0.004, 0.002), this.std('#4ad', 0.3, 0, { emissive: '#4af', emissiveIntensity: 2 }), { x: w / 2 - 0.02, y: 0.13, z: 0.016, cast: false }));
    g.userData.screen = screen;
    g.userData.screenMat = screenMat;
    g.userData.screenCenterY = bezel.position.y;
    return g;
  }
  pcTower() {
    const g = this.group();
    g.add(this.mesh(this.rbox(0.2, 0.43, 0.42, 0.01), this.std('#141416', 0.4, 0.3), { y: 0.215 }));
    g.add(this.mesh(this.box(0.004, 0.36, 0.006), this.std('#2af', 0.2, 0, { emissive: '#28f', emissiveIntensity: 3 }), { x: 0.07, y: 0.22, z: 0.211, cast: false }));
    g.add(this.mesh(this.cyl(0.008, 0.008, 0.004, 12), this.std('#ccc', 0.3, 0.8), { x: -0.05, y: 0.39, z: 0.211, rx: Math.PI / 2, cast: false }));
    return g;
  }
  headset() {
    const g = this.group();
    const band = this.mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24, Math.PI), this.std('#1a1a1c', 0.5), { y: 0.03 });
    g.add(band);
    for (const s of [-1, 1]) g.add(this.mesh(this.cyl(0.045, 0.045, 0.035, 20), this.std('#202024', 0.6), { x: s * 0.09, y: 0.03, rz: Math.PI / 2 }));
    g.rotation.x = -Math.PI / 2 + 0.2;
    return g;
  }
  earphones(seed = 3) {
    const g = this.group();
    const r = mulberry32(seed);
    const pts = [];
    let x = 0, z = 0;
    for (let i = 0; i < 9; i++) { pts.push(new THREE.Vector3(x, 0.003, z)); x += (r() - 0.5) * 0.08; z += 0.03 + r() * 0.02; }
    g.add(this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0018, 5), this.M.plasticWhite));
    g.add(this.mesh(this.sph(0.009, 10, 8), this.M.plasticWhite, { x: pts[0].x, y: 0.008, z: pts[0].z }));
    g.add(this.mesh(this.sph(0.009, 10, 8), this.M.plasticWhite, { x: pts[0].x + 0.02, y: 0.008, z: pts[0].z - 0.01 }));
    return g;
  }
  apple() {
    const g = this.group();
    const geo = this.geo('apple', () => {
      const s = new THREE.SphereGeometry(0.043, 24, 18);
      const p = s.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / 0.043;
        const k = 1 - 0.35 * Math.pow(Math.abs(y), 6);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
        if (y > 0.85 || y < -0.9) p.setY(i, p.getY(i) * 0.86);
      }
      s.computeVertexNormals();
      return s;
    });
    g.add(this.mesh(geo, this.M.skinApple, { y: 0.04 }));
    g.add(this.mesh(this.cyl(0.002, 0.003, 0.02, 6), this.std('#4a2f18', 0.8), { y: 0.085, rz: 0.2 }));
    g.add(this.mesh(new THREE.PlaneGeometry(0.02, 0.012), this.std('#3d8a2a', 0.6, 0, { side: THREE.DoubleSide }), { x: 0.01, y: 0.088, rx: -0.6, rz: 0.4 }));
    return g;
  }
  deskCalendar(tex) {
    const g = this.group();
    const w = 0.2, h = 0.17, ang = 0.32;
    const front = this.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), { cast: true });
    front.position.set(0, (h / 2) * Math.cos(ang), (h / 2) * Math.sin(ang));
    front.rotation.x = -ang;
    g.add(front);
    const back = this.mesh(new THREE.PlaneGeometry(w, h), this.std('#a88a64', 0.9, 0, { side: THREE.DoubleSide }));
    back.position.set(0, (h / 2) * Math.cos(ang), -(h / 2) * Math.sin(ang));
    back.rotation.x = ang;
    g.add(back);
    g.add(this.mesh(this.cyl(0.004, 0.004, w, 8), this.M.chrome, { y: h * Math.cos(ang), rz: Math.PI / 2 }));
    g.userData.front = front;
    return g;
  }
  notebookOpen(tex) {
    const g = this.group();
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const geo = this.geo('nbSpread', () => {
      const pg = new THREE.PlaneGeometry(0.34, 0.24, 16, 1);
      const p = pg.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.pow(Math.abs(x) / 0.17, 0.5) * 0.012); }
      pg.computeVertexNormals();
      return pg;
    });
    g.add(this.mesh(geo, m, { y: 0.006, rx: -Math.PI / 2, cast: false }));
    g.add(this.mesh(this.box(0.35, 0.005, 0.25), this.std('#233a6a', 0.7), { y: 0.0025 }));
    const pen = this.group({ x: 0.1, y: 0.018, z: 0.02, ry: 0.7 });
    pen.add(this.mesh(this.cyl(0.005, 0.005, 0.14, 8), this.std('#111', 0.4), { rz: Math.PI / 2 }));
    pen.add(this.mesh(this.cyl(0.0055, 0.0055, 0.03, 8), this.std('#2a4db0', 0.4), { x: 0.055, rz: Math.PI / 2 }));
    g.add(pen);
    return g;
  }
  studentId() {
    const g = this.group();
    const c = TX.makeCanvas(256, 360), ctx = c.getContext('2d');
    ctx.fillStyle = '#1d2d5a'; ctx.fillRect(0, 0, 256, 360);
    ctx.strokeStyle = '#c9a54a'; ctx.lineWidth = 4; ctx.strokeRect(14, 14, 228, 332);
    ctx.fillStyle = '#d9b75a'; ctx.textAlign = 'center';
    ctx.font = 'bold 44px "PingFang SC","Microsoft YaHei",sans-serif'; ctx.fillText('学 生 证', 128, 250);
    ctx.beginPath(); ctx.arc(128, 130, 50, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.stroke();
    ctx.font = 'bold 30px serif'; ctx.fillText('校徽', 128, 142);
    const top = new THREE.MeshStandardMaterial({ map: TX.toTex(c, { wrap: false }), roughness: 0.6 });
    const side = this.std('#1d2d5a', 0.6);
    g.add(this.mesh(this.box(0.075, 0.008, 0.105), [side, side, top, side, side, side], { y: 0.004 }));
    return g;
  }
  sticky(tex, w = 0.075) {
    return this.mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }), { cast: false });
  }
  powerStrip() {
    const g = this.group();
    g.add(this.mesh(this.rbox(0.32, 0.04, 0.055, 0.008), this.M.plasticWhite, { y: 0.02 }));
    for (let i = 0; i < 4; i++) g.add(this.mesh(this.box(0.03, 0.002, 0.02), this.std('#333', 0.6), { x: -0.08 + i * 0.055, y: 0.041, cast: false }));
    const swMat = new THREE.MeshStandardMaterial({ color: '#7a1b1b', roughness: 0.4, emissive: '#ff2a1a', emissiveIntensity: 0 });
    const sw = this.mesh(this.rbox(0.03, 0.012, 0.028, 0.003), swMat, { x: -0.13, y: 0.045, rx: 0.25 });
    g.add(sw);
    g.userData.switch = sw;
    g.userData.switchMat = swMat;
    return g;
  }
  tissueBox() {
    const g = this.group();
    const lbl = this._labelMat('tissue');
    g.add(this.mesh(this.box(0.22, 0.09, 0.12), [lbl, lbl, this.std('#f5f7fa', 0.8), lbl, lbl, lbl], { y: 0.045 }));
    g.add(this.mesh(new THREE.PlaneGeometry(0.08, 0.06), this.std('#fff', 0.9, 0, { side: THREE.DoubleSide }), { y: 0.11, rz: 0.3, cast: false }));
    return g;
  }
  broom() {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.012, 0.012, 1.1, 10), this.std('#3fae5a', 0.4), { y: 0.62 }));
    g.add(this.mesh(this.cyl(0.016, 0.014, 0.05, 10), this.std('#2ec4b6', 0.4), { y: 1.18 }));
    g.add(this.mesh(this.rbox(0.28, 0.1, 0.05, 0.01), this.std('#2b2b2b', 0.9), { y: 0.05 }));
    return g;
  }
  trashCan() {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.13, 0.11, 0.3, 20, true), this.std('#1d1d1f', 0.5, 0, { side: THREE.DoubleSide }), { y: 0.15 }));
    g.add(this.mesh(this.cyl(0.11, 0.11, 0.01, 20), this.std('#1d1d1f', 0.5), { y: 0.005 }));
    for (let i = 0; i < 5; i++) g.add(this.mesh(this.sph(0.04, 8, 6), this.M.paperWhite, { x: (this.rnd() - 0.5) * 0.12, y: 0.24 + this.rnd() * 0.06, z: (this.rnd() - 0.5) * 0.12, s: [1, 0.8, 1.1] }));
    return g;
  }
  hanger(color = '#39a0e8') {
    const pts = [new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(-0.2, 0, 0)];
    const path = new THREE.CurvePath();
    for (let i = 0; i < 3; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const g = this.group();
    g.add(this.mesh(new THREE.TubeGeometry(path, 30, 0.006, 6), this.std(color, 0.4)));
    g.add(this.mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI * 1.4), this.std(color, 0.4), { y: 0.12 }));
    return g;
  }
  cardboardBox(w, h, d, mat = null) {
    const m = mat || this.M.cardboard;
    const plain = this.M.cardboard;
    return this.mesh(this.box(w, h, d), [plain, plain, plain, plain, m, m], { y: h / 2 });
  }
  whiteCap() {
    const g = this.group();
    const m = this.std('#f0ede4', 0.9);
    g.add(this.mesh(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, { s: [1, 0.75, 1.05] }));
    g.add(this.mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20, 1, false, -0.9, 1.8), m, { z: 0.06, s: [0.95, 1, 1.2] }));
    return g;
  }
  plasticBag(color = '#e9eef2', s = 0.2, seed = 5) {
    const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.65, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
    return this.clothPile({ mat, sx: s, sy: s * 0.6, sz: s * 0.9, seed });
  }

  // ---------- 家具 ----------
  stool() {
    const g = this.group();
    const w = this.M.woodDark;
    g.add(this.mesh(this.rbox(0.32, 0.03, 0.3, 0.006), w, { y: 0.44 }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(this.mesh(this.box(0.034, 0.44, 0.034), w, { x: sx * 0.13, y: 0.215, z: sz * 0.12, rz: -sx * 0.04, rx: sz * 0.04 }));
    }
    for (const s of [-1, 1]) {
      g.add(this.mesh(this.box(0.26, 0.022, 0.02), w, { y: 0.14, z: s * 0.125 }));
      g.add(this.mesh(this.box(0.02, 0.022, 0.24), w, { x: s * 0.135, y: 0.2 }));
    }
    return g;
  }
  oldDesk({ w = 1.0, d = 0.55, h = 0.76, drawer = true, mat = null } = {}) {
    const g = this.group();
    const m = mat || this.M.woodDark;
    g.add(this.mesh(this.rbox(w, 0.032, d, 0.006), m, { y: h - 0.016 }));
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of legs) g.add(this.mesh(this.box(0.045, h - 0.03, 0.045), m, { x: sx * (w / 2 - 0.035), y: (h - 0.03) / 2, z: sz * (d / 2 - 0.035) }));
    g.add(this.mesh(this.box(w - 0.08, 0.1, 0.018), m, { y: h - 0.08, z: -d / 2 + 0.03 }));
    g.add(this.mesh(this.box(0.018, 0.1, d - 0.08), m, { x: -w / 2 + 0.035, y: h - 0.08 }));
    g.add(this.mesh(this.box(0.018, 0.1, d - 0.08), m, { x: w / 2 - 0.035, y: h - 0.08 }));
    g.add(this.mesh(this.box(w - 0.08, 0.03, 0.025), m, { y: 0.12, z: -d / 2 + 0.035 }));
    for (const s of [-1, 1]) g.add(this.mesh(this.box(0.025, 0.03, d - 0.08), m, { x: s * (w / 2 - 0.035), y: 0.12 }));
    let drawerG = null;
    if (drawer) {
      drawerG = this.group({ x: w * 0.22, y: h - 0.09, z: 0 });
      const dw = w * 0.42, dd = d - 0.1;
      drawerG.add(this.mesh(this.box(dw, 0.1, 0.02), m, { z: d / 2 - 0.02 }));
      drawerG.add(this.mesh(this.box(dw - 0.02, 0.012, dd), this.std('#5a3a28', 0.8), { y: -0.044 }));
      drawerG.add(this.mesh(this.box(0.012, 0.08, dd), this.std('#5a3a28', 0.8), { x: -dw / 2 + 0.01, y: -0.005 }));
      drawerG.add(this.mesh(this.box(0.012, 0.08, dd), this.std('#5a3a28', 0.8), { x: dw / 2 - 0.01, y: -0.005 }));
      drawerG.add(this.mesh(this.box(dw - 0.02, 0.08, 0.012), this.std('#5a3a28', 0.8), { y: -0.005, z: -dd / 2 }));
      drawerG.add(this.mesh(this.cyl(0.012, 0.012, 0.012, 12), this.M.chrome, { z: d / 2 - 0.004, rx: Math.PI / 2 }));
      drawerG.add(this.mesh(this.box(0.005, 0.012, 0.004), this.std('#111'), { y: 0, z: d / 2 + 0.002, cast: false }));
      g.add(drawerG);
      g.add(this.mesh(this.box(w - dw - 0.12, 0.1, 0.018), m, { x: -w * 0.2, y: h - 0.09, z: d / 2 - 0.02 }));
    }
    g.userData.drawer = drawerG;
    return g;
  }
  blackTable({ w = 1.2, d = 0.6, h = 0.75 } = {}) {
    const g = this.group();
    g.add(this.mesh(this.box(w, 0.025, d), this.M.blackTop, { y: h - 0.0125 }));
    g.add(this.mesh(this.box(w + 0.006, 0.028, 0.006), this.M.alu, { y: h - 0.0125, z: d / 2 }));
    g.add(this.mesh(this.box(w + 0.006, 0.028, 0.006), this.M.alu, { y: h - 0.0125, z: -d / 2 }));
    g.add(this.mesh(this.box(0.006, 0.028, d), this.M.alu, { x: w / 2, y: h - 0.0125 }));
    g.add(this.mesh(this.box(0.006, 0.028, d), this.M.alu, { x: -w / 2, y: h - 0.0125 }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(this.mesh(this.cyl(0.013, 0.013, h - 0.025, 10), this.M.blackMetal, { x: sx * (w / 2 - 0.05), y: (h - 0.025) / 2, z: sz * (d / 2 - 0.05), rz: sx * 0.03 }));
    }
    for (const s of [-1, 1]) g.add(this.mesh(this.cyl(0.009, 0.009, d - 0.1, 8), this.M.blackMetal, { x: s * (w / 2 - 0.05), y: 0.2, rx: Math.PI / 2 }));
    g.add(this.mesh(this.cyl(0.009, 0.009, w - 0.1, 8), this.M.blackMetal, { y: 0.2, rz: Math.PI / 2 }));
    return g;
  }

  // 铁架上下铺（x 宽 0.95，z 长 2.0）
  bunkBed({ aisle = 1, ladderEnd = 1, lower = 'floral', upperNet = true, lowerCurtain = null, lowerNet = false, seed = 1 } = {}) {
    const g = this.group();
    const F = this.M.frame;
    const W = 0.95, L = 2.02, H = 1.86;
    const pw = 0.042;
    const r = mulberry32(seed);
    const px = W / 2 - pw / 2, pz = L / 2 - pw / 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(this.mesh(this.box(pw, H, pw), F, { x: sx * px, y: H / 2, z: sz * pz }));
    const rail = (y, len, alongZ, x = 0, z = 0, t = 0.03, hh = 0.05) => {
      g.add(this.mesh(alongZ ? this.box(t, hh, len) : this.box(len, hh, t), F, { x, y, z }));
    };
    for (const yb of [0.34, 1.4]) {
      rail(yb, L, true, -px, 0); rail(yb, L, true, px, 0);
      rail(yb, W, false, 0, -pz); rail(yb, W, false, 0, pz);
      g.add(this.mesh(this.box(W - 0.06, 0.018, L - 0.06), this.M.woodLight, { y: yb + 0.02 }));
    }
    // 床头/床尾横杆
    for (const sz of [-1, 1]) for (const yy of [0.62, 0.9, 1.65, 1.82]) rail(yy, W, false, 0, sz * pz, 0.022, 0.022);
    // 上铺护栏（靠墙一侧满，靠过道一侧留梯口）
    rail(1.72, L, true, -aisle * px, 0, 0.022, 0.022);
    rail(1.82, L, true, -aisle * px, 0, 0.022, 0.022);
    rail(1.72, L * 0.62, true, aisle * px, -ladderEnd * L * 0.19, 0.022, 0.022);
    rail(1.82, L * 0.62, true, aisle * px, -ladderEnd * L * 0.19, 0.022, 0.022);
    // 梯子
    const lz = ladderEnd * (L / 2 - 0.2);
    for (const dz of [-0.17, 0.17]) g.add(this.mesh(this.box(0.03, 1.8, 0.03), F, { x: aisle * (W / 2 + 0.02), y: 0.9, z: lz + dz }));
    for (let i = 1; i <= 5; i++) g.add(this.mesh(this.cyl(0.012, 0.012, 0.34, 8), F, { x: aisle * (W / 2 + 0.02), y: i * 0.32, z: lz, rx: Math.PI / 2 }));
    // 床垫 + 床品
    const mat = (y, top) => {
      const mattress = this.mesh(this.rbox(W - 0.08, 0.08, L - 0.08, 0.025), this.std('#e8e4da', 0.95), { y: y + 0.07 });
      g.add(mattress);
      if (top === 'floral') {
        g.add(this.mesh(new THREE.PlaneGeometry(W - 0.1, L - 0.12), this.M.bamboo, { y: y + 0.112, rx: -Math.PI / 2, cast: false }));
        const quilt = this.softBox({ w: W - 0.12, h: 0.12, d: 1.1, mat: this.M.floral, sag: 0.05, seed: seed + 3 });
        quilt.position.set(0.02, y + 0.11, -L * 0.12);
        quilt.rotation.y = 0.05;
        g.add(quilt);
      } else if (top === 'gray') {
        g.add(this.mesh(new THREE.PlaneGeometry(W - 0.1, L - 0.12), this.std('#9aa2ad', 0.95), { y: y + 0.112, rx: -Math.PI / 2, cast: false }));
        const quilt = this.softBox({ w: W - 0.14, h: 0.16, d: 0.9, mat: this.M.grayCloth, sag: 0.06, seed: seed + 5 });
        quilt.position.set(0, y + 0.11, 0.2);
        g.add(quilt);
      } else if (top === 'blue') {
        g.add(this.mesh(new THREE.PlaneGeometry(W - 0.1, L - 0.12), this.M.bamboo, { y: y + 0.112, rx: -Math.PI / 2, cast: false }));
        const quilt = this.softBox({ w: W - 0.12, h: 0.14, d: 1.0, mat: this.M.blueCloth, sag: 0.05, seed: seed + 7 });
        quilt.position.set(0, y + 0.11, 0.15);
        g.add(quilt);
      } else if (top === 'white') {
        g.add(this.mesh(new THREE.PlaneGeometry(W - 0.1, L - 0.12), this.M.whiteCloth, { y: y + 0.112, rx: -Math.PI / 2, cast: false }));
        const quilt = this.softBox({ w: W - 0.14, h: 0.15, d: 0.8, mat: this.M.whiteCloth, sag: 0.06, seed: seed + 9 });
        quilt.position.set(0, y + 0.11, -0.3);
        g.add(quilt);
      }
      const pillow = this.softBox({ w: 0.5, h: 0.1, d: 0.3, mat: this.std(['#f0e6d2', '#c7d8ec', '#f3c9d4'][seed % 3], 0.95), sag: 0.02, seed: seed + 11 });
      pillow.position.set(0, y + 0.11, -ladderEnd * (L / 2 - 0.25));
      g.add(pillow);
    };
    mat(0.34, lower);
    mat(1.4, ['gray', 'white', 'blue'][seed % 3]);
    // 蚊帐
    const netBox = (y0, y1) => {
      const hh = y1 - y0;
      const geo = new THREE.BoxGeometry(W - 0.02, hh, L - 0.02, 6, 4, 10);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const yy = p.getY(i) / (hh / 2);
        const sag = (1 - yy * yy) * 0.03;
        p.setX(i, p.getX(i) * (1 - sag * 0.6) + (r() - 0.5) * 0.008);
        p.setZ(i, p.getZ(i) * (1 - sag * 0.2));
      }
      geo.computeVertexNormals();
      const n = this.mesh(geo, this.M.net, { y: y0 + hh / 2, cast: false, recv: false });
      n.renderOrder = 2;
      n.userData.noRay = true;
      g.add(n);
    };
    if (upperNet) {
      netBox(1.5, 2.72);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(this.mesh(this.box(0.018, 0.9, 0.018), F, { x: sx * px, y: H + 0.45, z: sz * pz }));
      for (const sz of [-1, 1]) g.add(this.mesh(this.box(W, 0.018, 0.018), F, { y: 2.73, z: sz * pz }));
      for (const sx of [-1, 1]) g.add(this.mesh(this.box(0.018, 0.018, L), F, { x: sx * px, y: 2.73 }));
    }
    if (lowerNet) netBox(0.42, 1.38);
    if (lowerCurtain) {
      const cm = lowerCurtain === 'pink' ? this.M.pinkCloth : this.M.grayCloth;
      const geo = new THREE.PlaneGeometry(L * 0.62, 1.0, 40, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 38) * 0.025);
      geo.computeVertexNormals();
      const cur = this.mesh(geo, cm, { x: aisle * (W / 2 + 0.005), y: 0.88, z: ladderEnd * 0.32, ry: Math.PI / 2 });
      g.add(cur);
      const bunch = this.softBox({ w: 0.12, h: 1.0, d: 0.14, mat: cm, sag: 0, seed: seed + 13 });
      bunch.position.set(aisle * (W / 2 + 0.01), 0.38, -ladderEnd * 0.9);
      g.add(bunch);
    }
    g.userData.size = { W, L, H };
    return g;
  }

  shelfUnit({ w = 0.9, h = 1.6, d = 0.35, shelves = 4, seed = 2 } = {}) {
    const g = this.group();
    const m = this.std('#e6dcc4', 0.7);
    for (const s of [-1, 1]) g.add(this.mesh(this.box(0.02, h, d), m, { x: s * (w / 2 - 0.01), y: h / 2 }));
    g.add(this.mesh(this.box(w, h, 0.01), m, { y: h / 2, z: -d / 2 + 0.005 }));
    const r = mulberry32(seed);
    const cols = ['#2d4a7a', '#8a2a2a', '#2f6a3a', '#d0a23a', '#5a3a7a', '#e8e0d0', '#333', '#b85a2a'];
    for (let i = 0; i <= shelves; i++) {
      const y = 0.02 + (i * (h - 0.04)) / shelves;
      g.add(this.mesh(this.box(w - 0.04, 0.02, d - 0.01), m, { y }));
      if (i === shelves) break;
      let x = -w / 2 + 0.04;
      while (x < w / 2 - 0.08) {
        const kind = r();
        if (kind < 0.65) {
          const bw = 0.025 + r() * 0.03, bh = 0.18 + r() * 0.1;
          const b = this.mesh(this.box(bw, bh, 0.16 + r() * 0.06), this.std(cols[(r() * cols.length) | 0], 0.7), { x: x + bw / 2, y: y + 0.01 + bh / 2, z: 0.02, rz: r() < 0.1 ? 0.2 : 0 });
          g.add(b); x += bw + 0.004;
        } else if (kind < 0.8) {
          const b = this.cardboardBox(0.14, 0.1, 0.2); b.position.set(x + 0.07, y + 0.01, 0); g.add(b); x += 0.16;
        } else if (kind < 0.9) {
          const bt = this.bottle({ h: 0.2, r: 0.028, label: ['water', 'tea', 'juice'][(r() * 3) | 0] }); bt.position.set(x + 0.03, y + 0.01, 0.05); g.add(bt); x += 0.07;
        } else { x += 0.1; }
      }
    }
    return g;
  }

  shoeRack({ tiers = 7, w = 0.62, d = 0.3, h = 1.3 } = {}) {
    const g = this.group();
    const m = this.M.woodLight;
    for (const s of [-1, 1]) {
      g.add(this.mesh(this.box(0.03, h, 0.03), m, { x: s * (w / 2), y: h / 2, z: d / 2 - 0.015 }));
      g.add(this.mesh(this.box(0.03, h, 0.03), m, { x: s * (w / 2), y: h / 2, z: -d / 2 + 0.015 }));
    }
    const shelfYs = [];
    for (let i = 0; i < tiers; i++) {
      const y = 0.08 + i * ((h - 0.12) / (tiers - 1));
      shelfYs.push(y);
      for (const dz of [-0.07, 0.07]) g.add(this.mesh(this.box(w, 0.018, 0.1), m, { y, z: dz, rx: -0.12 }));
    }
    g.userData.shelfYs = shelfYs;
    return g;
  }

  acUnit() {
    const g = this.group();
    const body = this.mesh(this.rbox(0.84, 0.28, 0.21, 0.045, 3), this.std('#f3f3f0', 0.32));
    g.add(body);
    g.add(this.mesh(this.box(0.8, 0.01, 0.005), this.std('#d6d6d2', 0.4), { y: 0.02, z: 0.106, cast: false }));
    g.add(this.mesh(this.box(0.7, 0.012, 0.12), this.std('#8a8a86', 0.6), { y: 0.14, z: 0.02, cast: false }));
    const flap = this.group({ y: -0.11, z: 0.09 });
    flap.add(this.mesh(this.rbox(0.72, 0.012, 0.07, 0.004), this.std('#ecece8', 0.35), { z: -0.03 }));
    g.add(flap);
    const dc = TX.makeCanvas(128, 64);
    const dtex = TX.toTex(dc, { wrap: false });
    const dmat = new THREE.MeshBasicMaterial({ map: dtex, transparent: true });
    const disp = this.mesh(new THREE.PlaneGeometry(0.07, 0.035), dmat, { x: 0.27, y: -0.02, z: 0.108, cast: false });
    g.add(disp);
    const drawDisp = (on) => {
      const ctx = dc.getContext('2d');
      ctx.clearRect(0, 0, 128, 64);
      ctx.fillStyle = on ? 'rgba(10,20,15,0.9)' : 'rgba(40,40,40,0.25)';
      ctx.fillRect(0, 0, 128, 64);
      if (on) { ctx.fillStyle = '#4dff9a'; ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center'; ctx.fillText('26°', 64, 48); }
      dtex.needsUpdate = true;
    };
    drawDisp(false);
    g.userData = { flap, drawDisp };
    const lbl = TX.makeCanvas(128, 32), lctx = lbl.getContext('2d');
    lctx.fillStyle = '#9a9a9a'; lctx.font = 'bold 22px Arial'; lctx.textAlign = 'center'; lctx.fillText('COOL AIR', 64, 23);
    g.add(this.mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ map: TX.toTex(lbl, { wrap: false }), transparent: true }), { x: -0.3, y: 0.06, z: 0.106, cast: false }));
    return g;
  }

  wallClock() {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.16, 0.16, 0.04, 32), this.std('#1b1b1b', 0.4), { rx: Math.PI / 2 }));
    g.add(this.mesh(new THREE.CircleGeometry(0.145, 32), new THREE.MeshStandardMaterial({ map: this.T.clockFace, roughness: 0.6 }), { z: 0.021, cast: false }));
    const hand = (len, w, color, z) => {
      const p = this.group({ z });
      p.add(this.mesh(this.box(w, len, 0.003), this.std(color, 0.5), { y: len / 2 - 0.015, cast: false }));
      g.add(p);
      return p;
    };
    const hour = hand(0.08, 0.009, '#111', 0.024);
    const minute = hand(0.12, 0.006, '#111', 0.027);
    const second = hand(0.13, 0.002, '#d22', 0.03);
    g.add(this.mesh(new THREE.CircleGeometry(0.145, 32), this.M.glass, { z: 0.033, cast: false }));
    g.userData = { hour, minute, second };
    return g;
  }

  fluorescent() {
    const g = this.group();
    g.add(this.mesh(this.box(1.24, 0.05, 0.14), this.std('#eeeeea', 0.4, 0.2)));
    const tubeMat = new THREE.MeshStandardMaterial({ color: '#f2f5f8', emissive: '#f3f7ff', emissiveIntensity: 0.0, roughness: 0.3 });
    g.add(this.mesh(this.cyl(0.014, 0.014, 1.18, 12), tubeMat, { y: -0.04, rz: Math.PI / 2, cast: false }));
    g.userData.tubeMat = tubeMat;
    return g;
  }

  suitcase() {
    const g = this.group();
    const navy = this.std('#1d2b4f', 0.4, 0.15);
    const W = 0.42, L = 0.66;
    const base = this.mesh(this.rbox(W, 0.14, L, 0.03, 3), navy, { y: 0.07 });
    g.add(base);
    for (let i = -2; i <= 2; i++) g.add(this.mesh(this.box(0.012, 0.13, L - 0.06), this.std('#243560', 0.4, 0.15), { x: i * 0.07, y: 0.075, z: 0 }));
    const lidPivot = this.group({ x: W / 2, y: 0.14 });
    const lid = this.mesh(this.rbox(W, 0.12, L, 0.03, 3), navy, { x: -W / 2, y: 0.06 });
    lidPivot.add(lid);
    for (let i = -2; i <= 2; i++) lidPivot.add(this.mesh(this.box(0.012, 0.004, L - 0.08), this.std('#2a3d6c', 0.4, 0.15), { x: -W / 2 + i * 0.07, y: 0.121 }));
    lidPivot.add(this.mesh(this.rbox(0.14, 0.02, 0.03, 0.008), this.M.plasticBlack, { x: -W / 2, y: 0.125, z: 0 }));
    g.add(lidPivot);
    g.add(this.mesh(this.box(0.004, 0.006, L - 0.04), this.std('#0c0c0c', 0.6), { x: -W / 2 - 0.001, y: 0.14, cast: false }));
    // 三位密码锁
    const lock = this.group({ x: -W / 2 - 0.012, y: 0.14, z: 0.1 });
    lock.add(this.mesh(this.box(0.018, 0.04, 0.09), this.std('#8a8f96', 0.3, 0.9)));
    for (let i = 0; i < 3; i++) lock.add(this.mesh(this.cyl(0.009, 0.009, 0.014, 10), this.std('#222', 0.4), { x: -0.009, z: -0.025 + i * 0.025, rz: Math.PI / 2 }));
    g.add(lock);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(this.mesh(this.cyl(0.02, 0.02, 0.02, 12), this.M.rubber, { x: sx * (W / 2 - 0.04), y: 0.02, z: sz * (L / 2 + 0.005), rz: Math.PI / 2 }));
    // 箱内：衣服
    g.add(this.mesh(this.box(W - 0.06, 0.03, L - 0.06), this.std('#3a3a44', 0.95), { y: 0.125, cast: false }));
    g.add(this.mesh(this.rbox(0.28, 0.04, 0.3, 0.015), this.std('#b8c4d8', 0.95), { x: -0.02, y: 0.15, z: 0.14, cast: false }));
    g.userData = { lidPivot, W, L };
    return g;
  }

  uvFlashlight() {
    const g = this.group();
    g.add(this.mesh(this.cyl(0.013, 0.013, 0.12, 12), this.std('#1a1a22', 0.35, 0.5), { rz: Math.PI / 2 }));
    g.add(this.mesh(this.cyl(0.018, 0.014, 0.035, 12), this.std('#2a2a33', 0.3, 0.6), { x: 0.07, rz: Math.PI / 2 }));
    g.add(this.mesh(this.cyl(0.015, 0.015, 0.002, 12), this.std('#8a4dff', 0.2, 0, { emissive: '#7a3cff', emissiveIntensity: 0.6 }), { x: 0.088, rz: Math.PI / 2, cast: false }));
    return g;
  }
}
