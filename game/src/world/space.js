// 第四章：太空舱 211 —— 还是那间宿舍的布局，被搬进了近地轨道上的一节旧空间站舱段。
//   写实电影感（参考《太空孤航者》）：刷着青绿色漆的铝面板、米黄色的天花板、满墙的线缆 / 货包 / 设备盒，
//   夜间模式下舱里很暗，只有几盏暖色的工作灯、单色荧光屏和南墙舱门后面那节被琥珀色灯光照亮的驾驶舱；
//   窗外（跟着镜头走的天空盒）：写实的地球（柔和的晨昏线、海面反光、大气层边缘、钠灯色的城市灯光）、月亮、太阳；
//   屋里：宿舍的家具全换成了舱内设备（见 spacegear.js），所有没固定住的东西都飘在半空；
//   舱里除了你，只有一个失控的球形助理机器人"小圆"在天花板附近打转
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from '../core/textures.js';
import * as TS from '../core/tex_space.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { LightShafts } from './fx.js';
import { buildSpaceGear } from './spacegear.js';
import { std, glow as glowMat, MAT, weather, Batch, compact } from './spacelook.js';

export function buildSpaceTextures(B) {
  const T = {};
  T.floor = TS.genDeck(); T.floorDirt = TS.genDeckDirt();
  const w = TS.genStationWall(); T.wall = w.map; T.wallN = w.normalMap; T.wallR = w.roughnessMap;
  const cs = TS.genCeilingSpace(); T.ceiling = cs.map; T.ceilingEm = cs.emissiveMap;
  T.woodDark = TS.genPanel({ base: '#4c524e', seed: 1 });
  T.woodLight = TS.genPanel({ base: '#b9b3a2', seed: 2 });
  T.woodOrange = TS.genPanel({ base: '#8a6a44', seed: 3 });
  T.doorWood = TS.genHatchDoor();
  T.blackLaminate = TS.genPanel({ base: '#262a28', seed: 4 });
  T.curtain = TS.genShutter(); T.curtain.repeat.set(2, 2);
  T.net = TS.genCargoNet(); T.net.repeat.set(5, 5);
  const cloth = (base, seed, r) => { const t = TX.genCloth({ base, seed, contrast: 0.8 }); t.repeat.set(r[0], r[1]); return t; };
  T.grayCloth = cloth('#6c716e', 71, [3, 3]);
  T.pinkCloth = cloth('#7d6656', 72, [3, 3]);
  T.blackCloth = cloth('#232527', 73, [2, 2]);
  T.blueCloth = cloth('#2f4460', 74, [2, 2]);
  T.whiteCloth = cloth('#c9c4b6', 75, [2, 2]);
  T.bamboo = cloth('#6b6f5e', 76, [2, 4]);
  T.floral = cloth('#7a7458', 77, [2, 2]);
  T.polka = cloth('#2a3336', 78, [3, 2]);
  T.yellowDots = cloth('#8f7c48', 79, [1, 1]);
  T.patternRoll = cloth('#4a5856', 80, [1, 2]);
  T.cardboard = TS.genCargoBag(); T.cardboard350 = TS.genCargoBag({ print: '350' });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  const wv = TX.makeCanvas(4, 4); wv.getContext('2d').fillStyle = '#000'; wv.getContext('2d').fillRect(0, 0, 4, 4);
  T.windowView = TX.toTex(wv);
  T.clockFace = TS.genMissionClock();
  T.mousepad = TS.genMousepadSpace();
  return T;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? std(mat) : mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg);
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, r);

// ================= 窗外的宇宙（跟着镜头走，永远在无穷远处）=================
// 顶点着色器把模型放在"当前渲染相机"周围：镜子里的虚拟相机看到的也是对的
const SKY_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vUv = uv;
    vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vDir = rel;
    gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + rel, 1.0);
  }`;
// 地球：柔和的晨昏线、海面上的太阳反光、边缘一圈蓝色的大气、夜里钠灯色的城市灯光
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap, nightMap, cloudMap; uniform vec3 sunDir; uniform float cloudRot, nightBoost, time;
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vec3 n = normalize(vN), v = -normalize(vDir);
    float d = dot(n, sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    float ocean = smoothstep(0.015, 0.08, day.b - max(day.r, day.g));
    float lamb = max(d, 0.0);
    float lit = smoothstep(-0.1, 0.18, d);
    vec3 col = day * (0.95 * lamb + 0.03) * lit;
    // 晨昏线附近的暖色（大气把蓝光散射掉了）
    float tw = smoothstep(-0.14, 0.0, d) * (1.0 - smoothstep(0.0, 0.22, d));
    col += vec3(0.85, 0.32, 0.1) * tw * 0.06;
    // 海面反光
    vec3 h = normalize(sunDir + v);
    col += vec3(1.0, 0.94, 0.82) * pow(max(dot(n, h), 0.0), 80.0) * ocean * step(0.0, d) * 1.4;
    // 夜里的城市灯光
    vec3 lights = texture2D(nightMap, vUv).rgb;
    col += lights * (1.0 - smoothstep(-0.16, 0.04, d)) * nightBoost * 1.5;
    // 云
    vec4 cl = texture2D(cloudMap, vec2(vUv.x + cloudRot, vUv.y));
    vec3 cc = cl.rgb * (0.92 * lamb + 0.012) + vec3(0.9, 0.38, 0.16) * tw * 0.12;
    col = mix(col, cc, cl.a * 0.94);
    // 大气：越靠边越蓝，只在白天那一侧
    float fr = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    float al = smoothstep(-0.3, 0.35, d);
    col = mix(col, vec3(0.3, 0.55, 1.0) * al * 0.9, fr * 0.7 * al);
    col += vec3(0.16, 0.34, 0.8) * fr * al * 0.25 + vec3(0.02, 0.05, 0.12) * lamb * 0.3;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// 大气层外缘：地球边上薄薄一圈亮蓝色的光
const HALO_FRAG = /* glsl */ `
  uniform vec3 sunDir; uniform float boost;
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vec3 n = normalize(vN), v = normalize(vDir);
    float k = smoothstep(0.0, 0.3, dot(n, v));
    float side = 0.08 + 1.1 * smoothstep(-0.3, 0.6, dot(n, sunDir));
    float back = pow(max(0.0, dot(v, sunDir)), 12.0) * 2.0;
    vec3 col = mix(vec3(0.08, 0.22, 0.7), vec3(0.55, 0.78, 1.0), k) * k * k * (side * 0.7 + back) * boost;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const MOON_FRAG = /* glsl */ `
  uniform sampler2D map; uniform vec3 sunDir;
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vec3 n = normalize(vN);
    float d = dot(n, sunDir);
    vec3 c = texture2D(map, vUv).rgb * (0.006 + 1.1 * max(d, 0.0) * smoothstep(-0.05, 0.15, d));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const SPRITE_VERT = /* glsl */ `
  uniform vec3 center; uniform float size, rot;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 c = viewMatrix * vec4(cameraPosition + center, 1.0);
    float cs = cos(rot), sn = sin(rot);
    vec2 p = mat2(cs, -sn, sn, cs) * position.xy * size;
    c.xy += p;
    gl_Position = projectionMatrix * c;
  }`;
const SPRITE_FRAG = /* glsl */ `
  uniform sampler2D map; uniform vec3 color; uniform float opacity;
  varying vec2 vUv;
  void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(color * t.rgb * t.a * opacity, 1.0); }`;
// 星星：真空里不闪烁；从亮着灯的舱里往外看，只看得到比较亮的那些
const STAR_VERT = /* glsl */ `
  attribute float aSize; attribute vec3 aCol;
  uniform float scale;
  varying vec3 vCol;
  void main() {
    vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + rel, 1.0);
    gl_PointSize = aSize * scale;
    vCol = aCol;
  }`;
const STAR_FRAG = /* glsl */ `
  uniform sampler2D map; varying vec3 vCol;
  void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vCol * t.rgb * t.a, 1.0); }`;

function skyMat(frag, uniforms, { blending = THREE.NormalBlending, side = THREE.FrontSide } = {}) {
  // 不设 transparent：留在不透明队列里，才能按 renderOrder 排在整间屋子之前画（加法混合照样生效）
  return new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, blending, side, transparent: false, fog: false });
}
function skyObj(o, order) { o.renderOrder = order; o.frustumCulled = false; o.userData.noRay = true; o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; }

export function buildSpaceSky() {
  const group = new THREE.Group(); group.name = 'spaceSky';
  const sunDir = V(0, 0.3, 1).normalize();
  const U = { time: { value: 0 } };
  // 星星
  const rnd = mulberry32(4501);
  const N = 1400, pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3);
  const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.78], [0.9, 0.95, 1]];
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 28, u * 28, Math.sin(a) * r * 28], i * 3);
    const big = rnd();
    size[i] = big > 0.99 ? 3.2 + rnd() * 1.5 : big > 0.93 ? 2.2 + rnd() : 1.2 + rnd() * 0.8;
    const tc = tints[(rnd() * tints.length) | 0], b = 0.25 + rnd() * rnd() * 0.75;
    col.set([tc[0] * b, tc[1] * b, tc[2] * b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const starU = { scale: { value: 1 }, map: { value: TS.genGlowDot(32) } };
  group.add(skyObj(new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, depthTest: false, depthWrite: false, transparent: false, blending: THREE.AdditiveBlending })), -110));

  // 太阳（在地球之前画：被地球挡住就看不见了）
  const quad = new THREE.PlaneGeometry(1, 1);
  const mkSprite = (tex, color, sizeV, order, opacity = 1) => {
    const u = { map: { value: tex }, color: { value: new THREE.Color(color) }, opacity: { value: opacity }, center: { value: V() }, size: { value: sizeV }, rot: { value: 0 } };
    group.add(skyObj(new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, depthTest: false, depthWrite: false, transparent: false, blending: THREE.AdditiveBlending })), order));
    return u;
  };
  const sunU = mkSprite(TS.genSunSprite(), '#fffaf0', 10, -106);
  const sunCore = mkSprite(TS.genGlowDot(64), '#ffffff', 1.6, -105);

  // 地球：视线斜下方，半径约 11°
  const earthDirN = V(0.12, -0.085, -1).normalize();
  const ED = 30, ER = 6.1;
  const day = TS.genEarthDay();
  const clouds = TS.genEarthClouds();
  const night = TS.genEarthNight(day);
  const earthU = { dayMap: { value: day.tex }, nightMap: { value: night.tex }, cloudMap: { value: clouds }, sunDir: { value: sunDir }, cloudRot: { value: 0 }, nightBoost: { value: 1 }, time: U.time };
  const halo = skyObj(new THREE.Mesh(new THREE.SphereGeometry(ER * 1.028, 64, 40), skyMat(HALO_FRAG, { sunDir: { value: sunDir }, boost: { value: 1 } }, { blending: THREE.AdditiveBlending, side: THREE.BackSide })), -104);
  halo.position.copy(earthDirN).multiplyScalar(ED);
  group.add(halo);
  const earth = skyObj(new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), skyMat(EARTH_FRAG, earthU)), -103);
  earth.position.copy(earthDirN).multiplyScalar(ED);
  earth.rotation.set(0.25, -0.35, 0.18);
  group.add(earth);
  earth.updateMatrixWorld(true);
  // 正对着舱窗的那一点在贴图上的位置（城市灯光拼的数字就画在那）
  const face = earthDirN.clone().negate().applyQuaternion(earth.quaternion.clone().invert());
  const faceU = ((Math.atan2(face.z, -face.x) / (Math.PI * 2)) + 1) % 1, faceV = Math.acos(clamp(face.y, -1, 1)) / Math.PI;

  // 月亮：左上方远处
  const moon = skyObj(new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 20), skyMat(MOON_FRAG, { map: { value: TS.genMoon() }, sunDir: { value: sunDir } })), -107);
  moon.position.copy(V(-0.62, 0.3, -1).normalize().multiplyScalar(29));
  group.add(moon);
  // 远处缓缓飞过的另一个航天器（太阳能板反光时亮一下）
  const satU = mkSprite(TS.genGlowDot(32), '#dfe8ff', 0.28, -102, 0.9);

  const earthAng = Math.asin(ER / ED);
  // 以地球方向为基准的坐标系：θ=0 太阳在身后（满地球），θ=π 太阳正好躲到地球背后（日食）
  const up2 = V(0, 1, 0).addScaledVector(earthDirN, -earthDirN.y).normalize();
  const side = V().crossVectors(earthDirN, up2).normalize();
  const _t = V();
  return {
    group, sunDir, earth, earthDir: earthDirN, earthAng, night,
    // 用城市灯光在地球正对舱窗的那一面拼出一个数字
    drawDigit(d) { TS.drawEarthDigit(night, d, { u0: faceU, v0: faceV, w: 0.085, h: 0.2 }); },
    // 太阳在不在地球后面（0 = 完全被挡住）
    sunVisible() { return smoothstep(earthAng * 0.97, earthAng * 1.05, sunDir.angleTo(earthDirN)); },
    update(dt, t, { theta = 0, drawH = 800, nightBoost = 1 } = {}) {
      U.time.value = t;
      starU.scale.value = drawH / 900;
      // 轨道一圈：太阳绕着舱转；θ=0 在身后（满地球），θ=π 躲到地球背后（日食光环 + 全是夜景）
      sunDir.copy(earthDirN).multiplyScalar(-Math.cos(theta)).addScaledVector(side, 0.9 * Math.sin(theta)).addScaledVector(up2, 0.3 * Math.max(0, Math.cos(theta))).normalize();
      sunU.center.value.copy(sunDir).multiplyScalar(28);
      sunCore.center.value.copy(sunU.center.value);
      const vis = this.sunVisible();
      sunU.opacity.value = vis; sunCore.opacity.value = vis;
      halo.material.uniforms.boost.value = 1 + (1 - vis) * 0.8;
      earthU.cloudRot.value = t * 0.0012;
      earthU.nightBoost.value = nightBoost;
      // 远处的航天器：沿一条斜线慢慢飞，太阳能板偶尔反一下光
      const k = (t * 0.012) % 1;
      _t.set(-1 + k * 2, 0.25 + k * 0.2, -1).normalize().multiplyScalar(26);
      satU.center.value.copy(_t); satU.opacity.value = 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.9)) ** 16;
    },
  };
}

// ================= 洗手间窗外：穿着宇航服的三只猴子（彩蛋）=================
export function buildSpaceOutside() {
  const group = new THREE.Group(); group.name = 'spaceOutside';
  const monkeys = [];
  const suit = std('#d4d2ca', { roughness: 0.85 }), fur = std('#6a4a36', { roughness: 0.95 }), face = std('#c9a585', { roughness: 0.8 }), dark = std('#1a1410');
  const visor = new THREE.MeshStandardMaterial({ color: '#c8a45a', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.9, depthWrite: false });
  const orange = std('#a45a2c');
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    body.add(mesh(new THREE.CapsuleGeometry(0.16, 0.26, 6, 14), suit, { y: 0 }));
    body.add(mesh(box(0.26, 0.3, 0.12), suit, { y: 0.04, z: -0.16 }));
    body.add(mesh(box(0.1, 0.06, 0.03), orange, { y: 0.1, z: 0.15 }));
    const head = new THREE.Group(); head.position.y = 0.36; body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.12, 18, 14), fur));
    head.add(mesh(new THREE.SphereGeometry(0.085, 16, 12), face, { y: -0.015, z: 0.06, s: [1, 0.9, 0.6] }));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), face, { x: s * 0.12, y: 0.01, s: [0.6, 1, 1] }));
      head.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), dark, { x: s * 0.035, y: 0.01, z: 0.11 }));
    }
    head.add(mesh(new THREE.SphereGeometry(0.2, 20, 16), visor, { cast: false }));
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.19, 0.12, 0); body.add(sh);
      sh.add(mesh(new THREE.CapsuleGeometry(0.055, 0.2, 5, 10), suit, { y: -0.13 }));
      sh.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), orange, { y: -0.27 }));
      arms.push(sh);
    }
    for (const s of [-1, 1]) body.add(mesh(new THREE.CapsuleGeometry(0.065, 0.22, 5, 10), suit, { x: s * 0.08, y: -0.36 }));
    root.visible = false;
    group.add(root);
    monkeys.push({ root, body, head, arms, ph: i * 1.7 });
  }
  // 安全绳
  const tether = mesh(new THREE.BufferGeometry(), std('#b08a30'), { cast: false });
  group.add(tether);
  const state = { t: 0, dur: 0 };
  const _a = V(), pts = [V(), V(), V(), V()];
  return {
    group,
    trigger(dur = 5) { state.t = 0; state.dur = dur; },
    get busy() { return state.t < state.dur; },
    update(dt, t) {
      state.t += dt;
      const on = state.t < state.dur;
      const k = on ? state.t / state.dur : 1;
      monkeys.forEach((m, i) => {
        m.root.visible = on;
        if (!on) return;
        // 从窗外左边飘进来、在窗前转个圈挥挥手、再往右飘走
        const x = lerp(-2.4, 2.4, smoothstep(0, 1, k)) + (i - 1) * 0.55;
        m.root.position.set(x, 1.72 + Math.sin(t * 1.3 + m.ph) * 0.12 + (i - 1) * 0.1, 7.0 + i * 0.35);
        m.body.rotation.set(Math.sin(t * 0.7 + m.ph) * 0.3, Math.PI + Math.sin(t * 0.5 + m.ph) * 0.4, Math.sin(t * 0.9 + m.ph) * 0.4 + k * 2.2);
        m.arms[0].rotation.z = -2.4 + Math.sin(t * 9 + m.ph) * 0.5;
        m.arms[1].rotation.z = 0.5 + Math.sin(t * 2 + m.ph) * 0.2;
        pts[i].copy(m.root.position).y += 0.1;
      });
      tether.visible = on;
      if (on && (state.gT = (state.gT || 0) - dt) <= 0) {
        state.gT = 0.1;
        pts[3].copy(pts[2]).add(_a.set(1.2, -0.3, 0.2));
        tether.geometry.dispose();
        tether.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone())), 30, 0.008, 5);
      }
    },
  };
}

// ================= 失控的球形助理机器人"小圆" =================
//   参照国际空间站上那种会说话的球形助理：白色磨砂塑料外壳、正面一块液晶脸、两侧的导风口里是小风扇
function makeRobot() {
  const root = new THREE.Group(); root.name = 'robot';
  const body = new THREE.Group(); root.add(body);
  const shell = std('#d6d7d1', { roughness: 0.62 }), seam = std('#9a9c97', { roughness: 0.5 }), dark = MAT.plastic('#1c1f1e', 0.45), grille = MAT.metal('#5a5f5c', 0.5, 0.6);
  body.add(mesh(new THREE.SphereGeometry(0.15, 36, 26), shell));
  const ring = mesh(new THREE.TorusGeometry(0.1505, 0.0035, 6, 56), seam, { cast: false });
  ring.rotation.x = Math.PI / 2; body.add(ring);
  // 脸：一块略微弯曲的液晶屏，外面一圈黑色边框
  const fc = TX.makeCanvas(256, 128);
  TS.drawRobotFace(fc, 'dizzy', 0);
  const faceTex = TX.toTex(fc, { wrap: false });
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false, color: new THREE.Color(0.8, 0.8, 0.8) });
  body.add(mesh(new THREE.SphereGeometry(0.1515, 28, 16, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.5 - 0.58, 1.16), dark, { cast: false }));
  const faceM = mesh(new THREE.SphereGeometry(0.153, 28, 16, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.5 - 0.5, 1.0), faceMat, { cast: false });
  faceM.userData.keepMat = true;
  body.add(faceM);
  // 两侧的导风口 + 小风扇（ears：第四章让它们转起来）
  const ears = [];
  for (const s of [-1, 1]) {
    const duct = new THREE.Group(); duct.position.set(s * 0.138, 0, 0); duct.rotation.z = Math.PI / 2; body.add(duct);
    duct.add(mesh(cyl(0.052, 0.056, 0.03, 24), dark, { cast: false }));
    duct.add(mesh(new THREE.TorusGeometry(0.052, 0.006, 6, 24), grille, { rx: Math.PI / 2, y: s * -0.016, cast: false }));
    const fan = new THREE.Group(); fan.position.y = s * -0.012; duct.add(fan);
    for (let i = 0; i < 5; i++) fan.add(mesh(box(0.012, 0.002, 0.046), grille, { ry: (i / 5) * Math.PI * 2, x: Math.cos((i / 5) * Math.PI * 2) * 0.022, z: -Math.sin((i / 5) * Math.PI * 2) * 0.022, cast: false }));
    fan.add(mesh(cyl(0.012, 0.012, 0.006, 12), dark, { cast: false }));
    ears.push(fan);
  }
  // 顶上的状态指示灯
  const tipMat = new THREE.MeshBasicMaterial({ color: '#ff3a26', toneMapped: false });
  body.add(mesh(cyl(0.012, 0.012, 0.004, 12), dark, { y: 0.1495, cast: false }));
  const tip = mesh(new THREE.SphereGeometry(0.006, 8, 6), tipMat, { y: 0.152, cast: false }); body.add(tip);
  // 背面：一小块标签
  const lab = TX.makeCanvas(128, 48), lx = lab.getContext('2d');
  lx.fillStyle = '#e2dfd6'; lx.fillRect(0, 0, 128, 48); lx.fillStyle = '#1b1c1a'; lx.font = 'bold 22px "DIN Condensed","Arial Narrow",sans-serif'; lx.textAlign = 'center'; lx.fillText('CREW ASSIST 211', 64, 31);
  body.add(mesh(new THREE.PlaneGeometry(0.07, 0.026), new THREE.MeshStandardMaterial({ map: TX.toTex(lab, { wrap: false }), roughness: 0.7 }), { y: 0.05, z: -0.146, ry: Math.PI, rx: 0.3, cast: false }));
  // 原来的"推进器光"：写实版没有，留一个看不见的占位（第四章会去缩放它）
  const jet = new THREE.Object3D(); body.add(jet);
  // 原来的漫画气泡：写实版不再在头顶冒符号，改成在脸上换表情（第四章的 _robot 读 flashMode）
  const robot = { root, body, faceCanvas: fc, faceTex, faceMat, ears, ring, tipMat, jet, mode: 'dizzy', flashT: 0, flashMode: null };
  robot.emote = {
    show(kind, dur = 1.6) { robot.flashMode = kind === '!' || kind === '?' ? 'alert' : 'happy'; robot.flashT = dur; },
    update() {},
  };
  return robot;
}

// ================= 失重下的水：写实一点的水球（菲涅尔反射 + 柔和的高光 + 一点点折射的亮斑）=================
const BUBBLE_VERT = /* glsl */ `
  uniform float time, wob; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 p = position;
    float w = sin(position.y * 16.0 + time * 3.1) * 0.5 + sin(position.x * 13.0 - time * 2.3) * 0.35 + sin(position.z * 11.0 + time * 1.7) * 0.3;
    p += normal * w * wob;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const BUBBLE_FRAG = /* glsl */ `
  uniform vec3 color; uniform float opacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = abs(dot(n, v));
    float fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    // 假的环境反射：上亮下暗（舱顶的灯板 / 地板）
    vec3 env = mix(vec3(0.03, 0.045, 0.045), vec3(0.62, 0.66, 0.62), smoothstep(-0.3, 0.9, n.y));
    float s1 = pow(max(dot(n, normalize(vec3(-0.35, 0.7, 0.62))), 0.0), 160.0);
    float s2 = pow(max(dot(n, normalize(vec3(0.5, -0.1, 0.86))), 0.0), 50.0) * 0.25;
    vec3 col = color * 0.18 * (1.0 - fr) + env * fr + vec3(1.0, 0.98, 0.94) * (s1 * 2.0 + s2);
    // 背面折射聚起来的一点亮光
    col += color * 0.35 * smoothstep(0.75, 1.0, ndv) * smoothstep(-0.2, -0.8, n.y);
    float a = clamp((0.07 + fr * 0.8) * opacity + (s1 + s2) * opacity, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
export function waterMaterial({ color = '#9fb4b8', wob = 0.02, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, wob: { value: wob }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false,
  });
}

// 两点之间一根管子 / 线缆（给合批用：直接返回放在世界坐标里的网格）
const tubeMesh = (pts, r, mat, seg = 60, radial = 6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, radial), mat);
// 悬链线：两个挂点之间垂下来的一根线
function sagPts(a, b, sag, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; out.push(p); }
  return out;
}

// ================= 装饰整个太空舱 =================
export function decorateSpace(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, camBox, LAYOUT } = ctx;
  const { SZ, DOOR, WR, WC } = LAYOUT;
  const rnd = mulberry32(4040);
  const props = new THREE.Group(); props.name = 'spaceProps';
  const P = (o) => { props.add(o); return o; };
  const batch = new Batch(); // 不会动的杂物，最后按材质合成几个网格

  // ===== 收拾：地上的复习资料、紫光涂鸦、窗户雾气、原来的窗景都不要了 =====
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh) o.visible = false; });
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.sticky.visible = false;
  refs.studentId.visible = false;
  refs.view.visible = false;
  refs.lock.group.visible = false;
  if (refs.interact.roster) refs.interact.roster.visible = false;
  for (const f of refs.fixtures || []) f.visible = false; // 宿舍的日光灯管换成舱里的灯箱
  // 宿舍的铝合金窗框、窗台拆掉（舷窗框自己有），只留玻璃
  for (const c of refs.win.children) if (c.isMesh && !(c.material && c.material.transparent)) c.visible = false;
  // 舷窗玻璃：外面是真空，只淡淡地映一点舱里的东西（不然整片星空会蒙上一层灰）
  Object.assign(M.glass, { color: new THREE.Color('#8a9794'), opacity: 0.05, envMapIntensity: 0.12, roughness: 0.03 });
  // 遮光板（多层隔热毯）一开始是关着的
  refs.curtain.layout(1); refs.curtain.f = 1;
  Object.assign(M.curtain, { color: new THREE.Color('#e6e0d0'), roughness: 0.45, metalness: 0.35, emissiveIntensity: 0.0 });
  M.curtain.needsUpdate = true;
  // 天花板、地板、墙都要挡阳光（太阳会从各个方向照进来）
  for (const o of refs.occluders) o.castShadow = true;

  // ===== 墙 / 地 / 天花板：带法线和粗糙度的写实面板 =====
  Object.assign(M.wall, { normalMap: T.wallN, roughnessMap: T.wallR, roughness: 1, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.55 });
  M.wall.needsUpdate = true;
  M.floor.normalScale.set(0.9, 0.9);
  const ceilMat = M.ceiling;
  Object.assign(ceilMat, { roughness: 0.8, emissiveMap: T.ceilingEm, emissive: new THREE.Color('#e4ecde'), emissiveIntensity: 0.08 });
  ceilMat.userData.clean = true; ceilMat.needsUpdate = true;
  refs.ceilMat = ceilMat;

  // ===== 天空盒 =====
  const sky = buildSpaceSky();
  root.add(sky.group);
  refs.spaceSky = sky;

  // ===== 舷窗：厚重的圆角窗框、橡胶密封圈、一圈螺栓 =====
  const rr = (s, x, y, w, h, r) => { s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); };
  const ringGeo = (ow, oh, or, iw, ih, ir, depth, bevel = 0.012) => {
    const sh = new THREE.Shape(); rr(sh, -ow / 2, -oh / 2, ow, oh, or);
    const hole = new THREE.Path(); rr(hole, -iw / 2, -ih / 2, iw, ih, ir); sh.holes.push(hole);
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 12 });
  };
  const frameM = MAT.metal('#8d8f86', 0.45, 0.55), rubber = MAT.rubber('#141615'), boltM = MAT.metal('#9ea19a', 0.35, 0.85);
  {
    P(mesh(ringGeo(2.96, 1.84, 0.3, 2.6, 1.54, 0.22, 0.09), frameM, { y: 1.75, z: -3.6 }));
    P(mesh(ringGeo(2.66, 1.6, 0.24, 2.6, 1.54, 0.22, 0.1, 0), rubber, { y: 1.75, z: -3.62 }));
    const boltG = cyl(0.016, 0.016, 0.02, 10);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      batch.add(boltG, boltM, new THREE.Matrix4().compose(V(clamp(Math.cos(a) * 1.42, -1.4, 1.4), 1.75 + clamp(Math.sin(a) * 0.86, -0.85, 0.85), -3.495), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)));
    }
    const sign = mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshStandardMaterial({ map: TS.genSign(['WINDOW 1 · SHUTTER', 'KEEP CLOSED DURING EVA'], { W: 512, H: 132 }), roughness: 0.7 }), { x: 0.95, y: 2.8, z: -3.595, cast: false });
    P(sign); mark('signZeroG', sign);
  }

  // ===== 洗手间的窗：铁栏杆和推拉窗拆掉，换成一个圆舷窗 =====
  {
    const WW = LAYOUT.WW, wcWin = refs.wcWin;
    for (const c of wcWin.children) if (!(c.material && c.material.visible === false)) c.visible = false;
    const cx = (WW.x0 + WW.x1) / 2, cy = (WW.y0 + WW.y1) / 2, r = 0.36;
    const plate = new THREE.Shape();
    plate.moveTo(WW.x0 - cx, WW.y0 - cy); plate.lineTo(WW.x1 - cx, WW.y0 - cy); plate.lineTo(WW.x1 - cx, WW.y1 - cy); plate.lineTo(WW.x0 - cx, WW.y1 - cy); plate.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, r, 0, Math.PI * 2, true); plate.holes.push(hole);
    wcWin.add(mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.12, bevelEnabled: false, curveSegments: 32 }), MAT.paint('#8a6f36', 0.6), { x: cx, y: cy, z: WR.z1 + 0.01 }));
    wcWin.add(mesh(new THREE.TorusGeometry(r, 0.045, 12, 48), frameM, { x: cx, y: cy, z: WR.z1 + 0.0 }));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; wcWin.add(mesh(cyl(0.014, 0.014, 0.02, 8), boltM, { x: cx + Math.cos(a) * (r + 0.075), y: cy + Math.sin(a) * (r + 0.075), z: WR.z1 - 0.01, rx: Math.PI / 2, cast: false })); }
    wcWin.add(mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ color: '#a9b6b6', transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false }), { x: cx, y: cy, z: WR.z1 + 0.06, ry: Math.PI, cast: false }));
  }
  // 跟着镜头的补光：写实版里只留一点点，免得背光时人物死黑
  const camFill = new THREE.DirectionalLight('#c8d4cc', 0.12); camFill.castShadow = false;
  P(camFill); P(camFill.target);

  // ===== 扶手：黄褐色的漆，被手磨得发亮 =====
  const railM = MAT.metal('#a8842e', 0.42, 0.35), standM = MAT.metal('#6f736e', 0.4, 0.7);
  const rail = (a, b) => {
    const len = a.distanceTo(b);
    const m = mesh(cyl(0.017, 0.017, len, 10), railM);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    P(m);
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / (n - 1));
      const s = mesh(cyl(0.012, 0.016, 0.07, 8), standM, { cast: false });
      s.position.copy(p); if (Math.abs(p.x) > 1.7) { s.position.x += Math.sign(p.x) * 0.035; s.rotation.z = Math.PI / 2; } else { s.position.z += Math.sign(p.z) * 0.035; s.rotation.x = Math.PI / 2; }
      s.updateMatrixWorld(); batch.add(s.geometry, standM, s.matrixWorld);
    }
  };
  rail(V(1.72, 2.5, -3.2), V(1.72, 2.5, 4.2));
  rail(V(-1.72, 2.5, -3.2), V(-1.72, 2.5, 3.45));
  rail(V(-1.2, 2.72, -3.53), V(1.2, 2.72, -3.53));
  rail(V(-1.72, 0.9, 3.5), V(-1.72, 1.7, 3.5));
  rail(V(1.4, 1.0, 4.43), V(1.4, 1.9, 4.43));

  // ===== 灯：天花板中线两盏灯箱（开灯模式才亮）、墙上几盏小 LED 灯、踢脚上一排琥珀色的小灯 =====
  const glaMat = new THREE.MeshStandardMaterial({ color: '#dfe3d8', emissive: new THREE.Color('#e9f0e4'), emissiveIntensity: 0.3, roughness: 0.4 });
  glaMat.userData.clean = true; glaMat.userData.keepEmissive = true;
  const glaBody = MAT.paint('#a9a493', 0.55);
  for (const z of [2.3, -1.6]) {
    P(mesh(rbox(1.0, 0.07, 0.32, 0.015), glaBody, { y: 2.955, z, cast: false }));
    P(mesh(new THREE.PlaneGeometry(0.9, 0.24), glaMat, { y: 2.918, z, rx: Math.PI / 2, cast: false }));
  }
  refs.lights.tubeMats = [glaMat];
  const stripMat = new THREE.MeshBasicMaterial({ color: '#b8dccb', toneMapped: false }); // 每帧改颜色，不能用共享的缓存材质
  for (const [x, z] of [[-1.782, -2.7], [-1.782, 0.95], [1.782, -2.7], [1.782, 2.2], [1.782, 3.3]]) {
    P(mesh(box(0.03, 0.05, 0.52), glaBody, { x, y: 2.66, z, cast: false }));
    P(mesh(box(0.008, 0.02, 0.46), stripMat, { x: x - Math.sign(x) * 0.017, y: 2.645, z, cast: false }));
  }
  const dotPos = [];
  for (let z = -3.3; z < 4.3; z += 0.6) { dotPos.push(V(1.775, 0.09, z)); if (z < 3.5 || z > 4.45) dotPos.push(V(-1.775, 0.09, z)); }
  const floorDots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.012, 0.03), glowMat('#ffb04a'), dotPos.length);
  const m4 = new THREE.Matrix4();
  dotPos.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); floorDots.setMatrixAt(i, m4); });
  P(floorDots);

  // ===== 线缆：沿天花板两边的线束（一捆 6 根，隔一段一根扎带），几根垂下来的线 =====
  const cableMs = ['#2a2d2b', '#1a1b1a', '#cfcbbf', '#56595a', '#3e4a52', '#7a2a24'].map((c) => MAT.plastic(c, 0.55));
  const tieM = MAT.plastic('#e8e4d8', 0.5), strapTieM = MAT.plastic('#2a2b29', 0.8);
  for (const x of [-1.64, 1.64]) {
    cableMs.forEach((cm, ci) => {
      const pts = [];
      const ox = (ci % 3) * 0.022, oy = Math.floor(ci / 3) * 0.022;
      for (let z = -3.45; z <= 4.35; z += 0.35) pts.push(V(x - Math.sign(x) * ox, 2.86 - oy - Math.abs(Math.sin(z * 2.3 + ci)) * 0.02, z));
      batch.addObject(tubeMesh(pts, 0.009 + (ci % 2) * 0.003, cm, 120, 5));
    });
    for (let z = -3.2; z <= 4.3; z += 0.45) batch.addObject(mesh(cyl(0.045, 0.045, 0.012, 10), tieM, { x: x - Math.sign(x) * 0.022, y: 2.846, z, rx: Math.PI / 2 }));
  }
  for (const [a, b, sag, ci] of [[V(0.95, 2.95, -0.7), V(1.45, 2.93, 0.1), 0.34, 0], [V(-1.05, 2.95, 2.75), V(-1.5, 2.92, 3.3), 0.3, 3], [V(0.55, 2.96, 3.35), V(1.25, 2.93, 3.05), 0.26, 4], [V(-0.9, 2.95, -2.9), V(-1.45, 2.92, -2.3), 0.22, 2]]) {
    batch.addObject(tubeMesh(sagPts(a, b, sag), 0.008, cableMs[ci], 40, 5));
  }

  // ===== 通风软管：天花板两边各一条银色波纹软管（空间站里最有辨识度的东西之一），隔一段一根吊带 =====
  {
    const c = TX.makeCanvas(64, 16), x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, '#5c5e59'); gr.addColorStop(0.3, '#c9c9c1'); gr.addColorStop(0.5, '#efefe7'); gr.addColorStop(0.75, '#8c8e88'); gr.addColorStop(1, '#55574f');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 16);
    const tex = TX.toTex(c); tex.repeat.set(260, 1);
    const bump = TX.toTex(c, { data: true }); bump.repeat.set(260, 1);
    const ductM = new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 1.2, color: '#c8c6bc', roughness: 0.38, metalness: 0.75 });
    ductM.userData.clean = true;
    for (const [sx, z0, z1] of [[1.0, -3.45, 4.35], [-1.02, -3.45, 3.3]]) {
      const pts = [];
      for (let z = z0; z <= z1 + 1e-6; z += 0.5) pts.push(V(sx + Math.sin(z * 1.3) * 0.035, 2.86 + Math.sin(z * 2.1 + sx) * 0.018, z));
      batch.addObject(tubeMesh(pts, 0.062, ductM, 180, 12));
      for (let z = z0 + 0.5; z < z1; z += 1.1) batch.addObject(mesh(new THREE.TorusGeometry(0.068, 0.006, 5, 18), strapTieM, { x: sx + Math.sin(z * 1.3) * 0.035, y: 2.86, z }));
      // 两头接进墙上的小风口盒
      for (const zz of [z0 - 0.06, z1 + 0.06]) batch.addObject(mesh(box(0.2, 0.2, 0.1), MAT.paint('#8d897c', 0.5), { x: sx, y: 2.86, z: zz }));
    }
  }

  // ===== 货包（CTB）：一个个米白色帆布包，用黑色绑带勒在天花板边上、墙角 =====
  const bagTexs = [T.cardboard, TS.genCargoBag({ seed: 4471 }), TS.genCargoBag({ seed: 4481 })];
  const bagMs = bagTexs.map((t) => MAT.fabric('#ffffff', t));
  const strapM = MAT.fabric('#2a2b29');
  const bag = (w, h, d, x, y, z, ry = 0, rz = 0, k = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, ry, rz);
    g.add(mesh(rbox(w, h, d, Math.min(0.035, h * 0.3)), bagMs[k % bagMs.length]));
    for (const s of [-0.3, 0.3]) g.add(mesh(box(w + 0.012, h + 0.012, 0.03), strapM, { z: s * d }));
    batch.addObject(g);
  };
  for (const [x, z, ry, k] of [[-1.5, -3.25, 0.05, 0], [-1.52, -1.25, -0.08, 1], [-1.5, 1.35, 0.1, 2], [-1.48, 2.55, -0.04, 0], [1.5, -3.25, -0.06, 1], [1.52, -1.2, 0.07, 2], [1.5, 0.95, -0.1, 0], [1.46, 2.95, 0.05, 1], [1.5, 3.55, -0.08, 2]]) {
    bag(0.42, 0.24, 0.32, x, 2.84, z, ry, 0, k);
  }
  bag(0.46, 0.3, 0.36, 0.95, 0.15, 3.2, 0.3, 0, 1);
  bag(0.36, 0.22, 0.3, 0.9, 0.41, 3.18, -0.2, 0.05, 2);
  bag(0.4, 0.26, 0.32, -0.95, 2.82, -3.3, 0, 0, 2);
  bag(0.4, 0.26, 0.32, 0.95, 2.82, -3.3, 0.05, 0, 0);

  // ===== 设备盒：墙的上半截一排灰盒子，正面是开关 / 旋钮 / 断路器，边上几颗指示灯 =====
  const atlas = TX.makeCanvas(1024, 512), ax = atlas.getContext('2d');
  [1, 2, 3, 4].forEach((s, i) => ax.drawImage(TS.genFaceplate(s, { base: ['#3a3e3b', '#8d897c', '#343837', '#9a968a'][i] }).image, (i % 2) * 512, Math.floor(i / 2) * 256));
  const plateTex = TX.toTex(atlas, { wrap: false });
  const plateM = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.2 });
  const caseM = MAT.paint('#5d625e', 0.5);
  const ledMs = { g: glowMat('#62ff8e'), a: glowMat('#ffb04a'), r: glowMat('#ff3a26') };
  const unit = (x, y, z, w, h, k, face) => {
    // face = +1 / -1：面板朝 +x / -x（东西墙）；朝 +z（北墙）用 2
    const g = new THREE.Group(); g.position.set(x, y, z);
    const d = 0.14;
    if (face === 2) g.rotation.y = 0; else g.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(mesh(box(w, h, d), caseM));
    const pg = new THREE.PlaneGeometry(w * 0.96, h * 0.92);
    const uv = pg.attributes.uv, u0 = (k % 2) * 0.5, v0 = Math.floor(k / 2) === 0 ? 0.5 : 0;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    g.add(mesh(pg, plateM, { z: d / 2 + 0.001, cast: false }));
    for (let i = 0; i < 3; i++) g.add(mesh(box(0.012, 0.012, 0.006), ledMs['gar'[(k + i) % 3]], { x: -w * 0.4 + i * 0.03, y: -h * 0.36, z: d / 2 + 0.004, cast: false }));
    batch.addObject(g);
  };
  unit(-1.72, 2.4, -2.95, 0.5, 0.28, 0, 1);
  unit(-1.72, 2.4, -0.25, 0.44, 0.26, 1, 1);
  unit(-1.72, 2.36, 1.95, 0.5, 0.28, 2, 1);
  unit(1.72, 2.4, -2.9, 0.48, 0.26, 3, -1);
  unit(1.72, 2.38, -0.85, 0.44, 0.26, 0, -1);
  unit(1.72, 2.3, 3.2, 0.5, 0.3, 2, -1);
  unit(-0.6, 2.72, -3.53, 0.42, 0.22, 1, 2);
  unit(1.72, 0.5, 3.2, 0.5, 0.36, 3, -1);

  // ===== 笔记本电脑（空间站里到处都是）：一台架在东墙的支架上，一台摊开在厨房台面上 =====
  const laptops = [];
  const laptop = (x, y, z, ry, title, arm = false) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const blk = MAT.plastic('#1a1b1b', 0.6);
    g.add(mesh(box(0.34, 0.022, 0.24), blk));
    g.add(mesh(new THREE.PlaneGeometry(0.3, 0.12), MAT.plastic('#0f1010', 0.8), { y: 0.0115, z: 0.02, rx: -Math.PI / 2, cast: false }));
    const lid = new THREE.Group(); lid.position.set(0, 0.011, -0.12); lid.rotation.x = -1.85; g.add(lid);
    lid.add(mesh(box(0.34, 0.24, 0.012), blk, { y: 0.12, z: -0.006 }));
    const c = TX.makeCanvas(320, 200), tex = TX.toTex(c, { wrap: false });
    TS.drawLaptop(c, 0, { title });
    const scr = mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(0.75, 0.75, 0.75) }), { y: 0.12, z: 0.001, cast: false });
    lid.add(scr);
    if (arm) { g.add(mesh(cyl(0.012, 0.012, 0.32, 8), standM, { x: 0.12, y: -0.16, z: 0.02 })); g.add(mesh(box(0.05, 0.05, 0.05), standM, { x: 0.12, y: -0.32, z: 0.02 })); }
    P(g);
    laptops.push({ canvas: c, tex, title, ph: laptops.length * 1.7 });
  };
  laptop(1.5, 1.32, 3.22, -Math.PI / 2, 'OPS LAN · NODE 211', true);
  laptop(-1.42, 0.815, 1.72, Math.PI / 2 + 0.25, 'GALLEY · FOOD INV.');

  // ===== 标牌 =====
  const sign = (lines, x, y, z, ry, w = 0.6, h = 0.2, o = {}) => {
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: TS.genSign(lines, { W: 512, H: Math.round((512 * h) / w), ...o }), roughness: 0.7 }), { x, y, z, ry, cast: false });
    P(m); return m;
  };
  sign(['NODE 211', 'CREW QUARTERS'], 0, 2.8, SZ - 0.012, Math.PI, 0.9, 0.22);
  sign(['AIRLOCK', 'HATCH 1 · EQUALIZE FIRST'], -1.785, 2.3, 3.2, Math.PI / 2, 0.5, 0.16);
  sign(['O₂', 'PORTABLE BREATHING APP.'], 1.785, 1.95, 1.2, -Math.PI / 2, 0.36, 0.14);
  // 灭火器 + 急救包
  const ext = new THREE.Group(); ext.position.set(1.62, 0.9, SZ - 0.1);
  ext.add(mesh(cyl(0.06, 0.06, 0.4, 20), MAT.paint('#8c2a22', 0.45)));
  ext.add(mesh(cyl(0.02, 0.03, 0.08, 10), MAT.plastic('#1b1c1b'), { y: 0.24 }));
  ext.add(mesh(box(0.13, 0.03, 0.02), MAT.metal('#8a8d88', 0.4, 0.8), { y: 0.3 }));
  for (const y of [-0.12, 0.1]) ext.add(mesh(new THREE.TorusGeometry(0.063, 0.008, 6, 20), strapM, { y, rx: Math.PI / 2, cast: false }));
  P(ext); mark('extinguisher', ext);
  const aid = mesh(rbox(0.3, 0.22, 0.1, 0.02), MAT.fabric('#c7c1b1'), { x: -1.2, y: 1.55, z: SZ - 0.06 });
  aid.add(mesh(box(0.1, 0.03, 0.005), std('#8e2a24'), { z: 0.052, cast: false }));
  aid.add(mesh(box(0.03, 0.1, 0.005), std('#8e2a24'), { z: 0.052, cast: false }));
  P(aid); mark('firstAid', aid);

  // ===== 气闸舱门：门上一圈圆形观察窗 + 转轮；门边的密码面板 + 红色旋转警示灯 =====
  const D = refs.door;
  const DW = DOOR.z1 - DOOR.z0 - 0.02;
  const hatch = new THREE.Group(); hatch.position.set(-DW / 2, 0, -0.03); D.pivot.add(hatch);
  const chrome = MAT.metal('#9da098', 0.32, 0.85);
  hatch.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 10, 32), chrome, { y: 1.62 }));
  hatch.add(mesh(new THREE.CircleGeometry(0.13, 28), new THREE.MeshStandardMaterial({ color: '#0a0d0c', roughness: 0.08, metalness: 0.3 }), { y: 1.62, z: -0.005, ry: Math.PI, cast: false }));
  const wheel = new THREE.Group(); wheel.position.set(0, 1.02, -0.05); hatch.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.16, 0.017, 10, 36), MAT.metal('#a8842e', 0.45, 0.35)));
  for (let i = 0; i < 4; i++) wheel.add(mesh(cyl(0.01, 0.01, 0.3, 8), chrome, { rz: (i * Math.PI) / 4 }));
  wheel.add(mesh(cyl(0.04, 0.04, 0.04, 16), chrome, { rx: Math.PI / 2 }));
  mark('door', hatch);
  // 门框一圈黄黑警示条（旧的，脏的）
  const hzC = TX.makeCanvas(256, 32), hz = hzC.getContext('2d');
  hz.fillStyle = TS.SP.yellow; hz.fillRect(0, 0, 256, 32); hz.fillStyle = '#1b1c1a';
  for (let x = -32; x < 288; x += 32) { hz.beginPath(); hz.moveTo(x, 32); hz.lineTo(x + 16, 32); hz.lineTo(x + 32, 0); hz.lineTo(x + 16, 0); hz.fill(); }
  hz.fillStyle = 'rgba(30,26,20,0.35)'; for (let k = 0; k < 40; k++) hz.fillRect(Math.random() * 256, Math.random() * 32, 6 + Math.random() * 20, 2 + Math.random() * 6);
  const hzTex = TX.toTex(hzC); hzTex.repeat.set(4, 1);
  const hzM = new THREE.MeshStandardMaterial({ map: hzTex, roughness: 0.75 });
  const dcz = (DOOR.z0 + DOOR.z1) / 2;
  P(mesh(new THREE.PlaneGeometry(DOOR.z1 - DOOR.z0 + 0.36, 0.08), hzM, { x: -1.787, y: 2.17, z: dcz, ry: Math.PI / 2, cast: false }));
  for (const z of [DOOR.z0 - 0.14, DOOR.z1 + 0.14]) P(mesh(new THREE.PlaneGeometry(2.2, 0.08), hzM, { x: -1.787, y: 1.08, z, ry: Math.PI / 2, rz: Math.PI / 2, cast: false }));
  // 密码面板（门框北边、开关上方）
  const kpC = TX.makeCanvas(128, 160);
  const kpTex = TX.toTex(kpC, { wrap: false });
  const keypad = new THREE.Group(); keypad.position.set(-1.782, 1.66, 3.36); keypad.rotation.y = Math.PI / 2;
  keypad.add(mesh(rbox(0.17, 0.22, 0.035, 0.008), MAT.plastic('#2a2d2b', 0.5)));
  keypad.add(mesh(new THREE.PlaneGeometry(0.14, 0.175), new THREE.MeshBasicMaterial({ map: kpTex, toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) }), { z: 0.018, cast: false }));
  P(keypad); mark('door', keypad);
  // 警示灯（报警时转起来，红光扫过整个舱）
  const beacon = new THREE.Group(); beacon.position.set(-1.74, 2.35, 3.36);
  beacon.add(mesh(cyl(0.05, 0.05, 0.03, 16), MAT.plastic('#1f2220'), { rz: Math.PI / 2 }));
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#b0352c', emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0.15, transparent: true, opacity: 0.85, roughness: 0.2 });
  beaconMat.userData.keepEmissive = true;
  beacon.add(mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat, { x: 0.015, rz: -Math.PI / 2, cast: false }));
  P(beacon);
  const beaconLight = new THREE.SpotLight('#ff2a18', 0, 9, 0.5, 0.5, 1.2);
  beaconLight.position.set(-1.68, 2.35, 3.36); beaconLight.castShadow = false;
  P(beaconLight); P(beaconLight.target);
  refs.hatch = { wheel, keypad: { canvas: kpC, tex: kpTex }, beacon: { mat: beaconMat, light: beaconLight } };

  // ===== 南墙正中的舱门 → 驾驶舱：一圈厚重的舱门框，门后那节舱段刷着黄褐色的漆、被琥珀色的灯照着 =====
  {
    const wcw = WC.x1 - WC.x0;
    const hatchRing = MAT.metal('#9a9c94', 0.45, 0.55), lip = MAT.paint('#b0842c', 0.5);
    const ringG = ringGeo(wcw + 0.46, WC.h + 0.3, 0.2, wcw + 0.02, WC.h + 0.02, 0.1, 0.07);
    // 舱这一面（朝 +z 挤出，贴着南墙）/ 驾驶舱那一面（转 180°，贴着墙的另一面）
    for (const [z, ry, pz] of [[SZ - 0.075, 0, SZ - 0.045], [SZ + 0.16 + 0.075, Math.PI, SZ + 0.16 + 0.045]]) {
      P(mesh(ringG, hatchRing, { y: WC.h / 2, z, ry }));
      P(mesh(ringGeo(wcw + 0.1, WC.h + 0.08, 0.12, wcw, WC.h, 0.1, 0.075, 0), lip, { y: WC.h / 2, z: z + (ry ? 0.004 : -0.004), ry, cast: false }));
      // 门上方的亮子：用一块盖板封掉
      P(mesh(box(wcw + 0.1, WC.top - WC.h + 0.04, 0.03), hatchRing, { y: (WC.h + WC.top) / 2 + 0.01, z: pz }));
    }
    const boltG = cyl(0.012, 0.012, 0.02, 8);
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) batch.add(boltG, boltM, new THREE.Matrix4().compose(V(s * (wcw / 2 + 0.18), 0.12 + i * 0.15, SZ - 0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)));
    // 门扇：白色门框 → 旧金属，下半截磨砂玻璃 → 金属板，上半截留一扇观察窗
    const [clearG, frostG] = refs.wcDoor.glass;
    Object.assign(frostG, { transparent: false, opacity: 1, depthWrite: true, color: new THREE.Color('#6a6e68'), roughness: 0.5, metalness: 0.55, emissiveIntensity: 0, side: THREE.FrontSide });
    frostG.needsUpdate = true;
    Object.assign(clearG, { color: new THREE.Color('#b8c2bc'), opacity: 0.1 });
    refs.wcDoor.group.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === 'f1efe9') o.material = hatchRing; });
    // 驾驶舱的墙 / 地 / 天花板
    const W2 = TS.genStationWall({ paint: 'ochre', seed: 4417 });
    const cockWall = new THREE.MeshStandardMaterial({ map: W2.map, normalMap: W2.normalMap, roughnessMap: W2.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.9, 0.9), emissive: new THREE.Color('#ffa850'), emissiveMap: W2.map, emissiveIntensity: 0.1 });
    cockWall.userData.keepEmissive = true;
    const deckTile = (t) => { const c = t.clone(); c.repeat.set(0.5, 0.5); c.needsUpdate = true; return c; };
    const cockDeck = new THREE.MeshStandardMaterial({ map: deckTile(T.floor.map), normalMap: deckTile(T.floor.normalMap), roughnessMap: deckTile(T.floor.roughnessMap), roughness: 1 });
    const cockCeil = MAT.paint('#b3a88c', 0.75);
    const cockPanel = MAT.paint('#8c7033', 0.55);
    const WM = refs.wcMats;
    refs.wcRoom.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === WM.wTile || o.material === WM.wPaint) { if (o.geometry.type === 'PlaneGeometry') K.worldUV(o, 0.5, 1 / 3); o.material = cockWall; }
      else if (o.material === WM.wFloor) o.material = cockDeck;
      else if (o.material === WM.wCeil) o.material = cockCeil;
      else if (o.material && o.material.color && o.material.color.getHexString() === 'c3ced6') o.material = cockPanel; // 厕所隔间的隔墙 / 门 → 储藏室的隔板
    });
    // 驾驶舱里一盏暖色的灯：从舱门看过去，整节舱段都是琥珀色的
    const cockLight = new THREE.PointLight('#ff9a3c', 3.6, 4.4, 1.5); cockLight.position.set(0.35, 2.2, 5.4); P(cockLight);
    refs.cockLight = cockLight;
  }

  // ===== 宿舍的家具 → 舱内设备（休眠舱、资料库、信息接收站、驾驶舱、储藏室……）=====
  const gear = buildSpaceGear(ctx, P);
  refs.gear = gear;
  // 屏幕：生命维持（报警）、观测台的轨道图、驾驶舱的系统屏；信息接收站的大屏由第四章自己画
  const screens = [[gear.life.screen, 'life'], [gear.obs.screen, 'orbit'], [gear.cockpit.sysScreen, 'orbit']].map(([sc, mode]) => ({ canvas: sc.canvas, tex: sc.tex, mode }));
  for (const sc of screens) TS.drawOrbitScreen(sc.canvas, 0, {});
  refs.spaceScreens = screens;

  // ===== 飘在半空的东西 =====
  const floaters = [];
  const addF = (obj, x, y, z, { spin = 0.4, amp = 0.05, push = 1, id = null } = {}) => {
    if (obj.isGroup) compact(obj); // 整个一起飘，里面的零件可以合成一个网格
    obj.position.set(x, y, z);
    obj.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    P(obj);
    if (id) mark(id, obj);
    floaters.push({ obj, anchor: V(x, y, z), vel: V(), ang: V((rnd() - 0.5) * spin, (rnd() - 0.5) * spin, (rnd() - 0.5) * spin), ph: rnd() * 6.28, amp, push });
    return obj;
  };
  const group = (...ms) => { const g = new THREE.Group(); ms.forEach((m) => g.add(m)); return g; };
  // 泡面桶 + 飘出来的面条
  {
    const cupTex = TX.makeCanvas(256, 96), cx = cupTex.getContext('2d');
    cx.fillStyle = '#e9e4d8'; cx.fillRect(0, 0, 256, 96); cx.fillStyle = '#9c2320'; cx.fillRect(0, 12, 256, 34);
    cx.fillStyle = '#f1ece0'; cx.font = 'bold 26px "PingFang SC",sans-serif'; cx.fillText('红烧牛肉面', 50, 38);
    cx.fillStyle = '#6a5a3a'; cx.font = '14px sans-serif'; cx.fillText('NET WT 105g · SPACE FOOD PKG', 30, 72);
    const cup = mesh(cyl(0.075, 0.055, 0.12, 24), [new THREE.MeshStandardMaterial({ map: TX.toTex(cupTex), roughness: 0.55 }), MAT.paint('#e0dbcf', 0.6), MAT.paint('#d8d3c7', 0.6)]);
    const g = group(cup);
    const noodleM = std('#d9bf7a', { roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const pts = []; const a0 = rnd() * 6.28;
      for (let k = 0; k < 8; k++) pts.push(V(Math.cos(a0 + k * 0.8) * 0.03 * (1 + k * 0.15), 0.04 + k * 0.035, Math.sin(a0 + k * 0.8) * 0.03 * (1 + k * 0.15)));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0035, 4), noodleM, { cast: false }));
    }
    g.add(mesh(box(0.006, 0.16, 0.012), MAT.metal('#b8bab4', 0.3, 0.9), { x: 0.03, y: 0.12, rz: 0.3 }));
    addF(g, 0.25, 1.45, -1.3, { spin: 0.3, id: 'noodles' });
  }
  // 可乐罐
  const canTex = (() => {
    const c = TX.makeCanvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#9c1d1a'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#e9e4d8'; x.lineWidth = 8; x.beginPath(); x.moveTo(0, 90); x.bezierCurveTo(80, 60, 160, 110, 256, 75); x.stroke();
    x.fillStyle = '#efe9dc'; x.font = 'italic bold 40px Georgia,serif'; x.fillText('Cola', 70, 62);
    return TX.toTex(c);
  })();
  const canM = new THREE.MeshStandardMaterial({ map: canTex, roughness: 0.3, metalness: 0.55 }), canTop = MAT.metal('#b9bbb6', 0.25, 0.95);
  for (const [x, y, z] of [[-0.45, 1.9, 0.95], [0.95, 2.3, 2.95], [-0.8, 1.15, -2.75], [0.55, 2.55, -0.4]]) {
    const can = group(mesh(cyl(0.033, 0.033, 0.12, 20), [canM, canTop, canTop]));
    addF(can, x, y, z, { spin: 1.2, id: 'cola' });
  }
  // 袜子
  for (const [x, y, z, c] of [[1.0, 1.75, -2.95, '#c9c4b6'], [-0.3, 2.45, 3.1, '#3a3c3b'], [0.15, 0.7, 2.6, '#344256']]) {
    const sm = MAT.fabric(c);
    const sock = group(mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), sm), mesh(new THREE.CapsuleGeometry(0.035, 0.06, 4, 10), sm, { y: -0.1, z: 0.05, rx: Math.PI / 2 }), mesh(cyl(0.037, 0.037, 0.03, 12), MAT.fabric('#6a6d6a'), { y: 0.1 }));
    addF(sock, x, y, z, { spin: 1.0, id: 'sock' });
  }
  // 摊开的书
  const bookCols = ['#2e4a70', '#7a2a24', '#3d5a52', '#8a7032'];
  for (const [x, y, z] of [[0.55, 1.2, 2.25], [-0.95, 2.1, -1.0], [0.15, 2.6, -2.45], [-0.3, 0.75, -0.2]]) {
    const c = bookCols[floaters.length % 4];
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const half = new THREE.Group(); half.rotation.y = s * 0.45; b.add(half);
      half.add(mesh(box(0.15, 0.2, 0.008), MAT.paint(c, 0.7), { x: s * 0.075 }));
      half.add(mesh(box(0.14, 0.19, 0.012), MAT.paint('#ddd8c9', 0.95), { x: s * 0.072, z: 0.002 }));
    }
    addF(b, x, y, z, { spin: 0.5, id: 'book' });
  }
  // 笔
  for (let i = 0; i < 5; i++) {
    const pen = mesh(cyl(0.005, 0.005, 0.14, 8), MAT.plastic(['#1c2a44', '#1a1b1a', '#7a2a24', '#c9c4b6', '#3a3c3b'][i], 0.4));
    addF(pen, 1.0 + (rnd() - 0.5) * 0.5, 1.2 + rnd() * 0.5, 0.2 + (rnd() - 0.5) * 1.2, { spin: 2.0 });
  }
  // 复习资料在空中飘
  for (let i = 0; i < 6; i++) {
    const p = mesh(new THREE.PlaneGeometry(0.21, 0.29, 2, 2), new THREE.MeshStandardMaterial({ map: T.paperMath[i % 4], side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color('#e4dfd2') }), { cast: true });
    const pp = p.geometry.attributes.position; for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.sin(pp.getX(k) * 12) * 0.012);
    p.geometry.computeVertexNormals();
    addF(p, -0.6 + rnd() * 1.4, 1.1 + rnd() * 1.5, -2.8 + rnd() * 6.2, { spin: 0.5, id: 'paper' });
  }
  // 小黄鸭（橡胶的）
  {
    const y = std('#c9a228', { roughness: 0.45 });
    const duck = group(mesh(new THREE.SphereGeometry(0.07, 18, 14), y, { s: [1, 0.8, 1.2] }), mesh(new THREE.SphereGeometry(0.045, 16, 12), y, { y: 0.07, z: 0.05 }), mesh(new THREE.ConeGeometry(0.018, 0.04, 8), std('#b05a24', { roughness: 0.5 }), { y: 0.065, z: 0.1, rx: Math.PI / 2 }));
    for (const s of [-1, 1]) duck.add(mesh(new THREE.SphereGeometry(0.008, 6, 5), MAT.plastic('#111'), { x: s * 0.022, y: 0.085, z: 0.085, cast: false }));
    addF(duck, -0.2, 1.75, 0.25, { spin: 0.6, id: 'duck' });
  }
  // 手柄
  {
    const pm = MAT.plastic('#1d1f1f', 0.55);
    const pad = group(mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 10), pm, { rz: Math.PI / 2 }));
    for (const s of [-1, 1]) pad.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), pm, { x: s * 0.07, y: -0.025 }));
    pad.add(mesh(new THREE.SphereGeometry(0.009, 6, 5), MAT.plastic('#6a2a24'), { x: 0.05, y: 0.02, z: 0.02, cast: false }));
    pad.add(mesh(new THREE.SphereGeometry(0.009, 6, 5), MAT.plastic('#2f4a3c'), { x: 0.065, y: 0.03, z: 0.012, cast: false }));
    addF(pad, 0.65, 1.6, -0.3, { spin: 0.8, id: 'gamepad' });
  }
  // 枕头 + 耳机
  addF(mesh(rbox(0.45, 0.12, 0.3, 0.05), MAT.fabric('#bdb8aa')), -1.1, 1.55, 2.05, { spin: 0.2, id: 'pillow' });
  {
    const hs = group(mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), MAT.plastic('#1d1f1f')));
    for (const s of [-1, 1]) hs.add(mesh(cyl(0.04, 0.04, 0.03, 16), MAT.plastic('#2a2c2c', 0.7), { x: s * 0.09, rz: Math.PI / 2 }));
    addF(hs, 1.05, 2.05, 0.05, { spin: 0.6, id: 'headphones' });
  }
  // 苹果
  addF(group(mesh(new THREE.SphereGeometry(0.05, 20, 16), std('#8e2320', { roughness: 0.35 })), mesh(cyl(0.004, 0.004, 0.03, 5), std('#4a3420'), { y: 0.055 })), 0.3, 1.1, 1.05, { spin: 0.7, id: 'apple' });
  // 巧克力豆：一小团在空中打转（宇航员最爱拿来玩的那种）
  const candies = new THREE.Group();
  const cc = ['#a8201c', '#d8601a', '#e0b024', '#2c7a44', '#1d4e92', '#4a2a1a'];
  const candyMs = cc.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
  const candyItems = [];
  for (let i = 0; i < 16; i++) {
    const c = mesh(new THREE.SphereGeometry(0.02, 12, 8), candyMs[i % cc.length], { s: [1, 0.6, 1], cast: false });
    candies.add(c); candyItems.push({ m: c, ph: rnd() * 6.28, r: 0.05 + rnd() * 0.12, sp: 0.3 + rnd() * 0.6, y: (rnd() - 0.5) * 0.12 });
  }
  candies.position.set(-0.1, 1.85, 1.55); P(candies); mark('candies', candies);
  // 小水珠
  const drops = [];
  const dropMat = waterMaterial({ color: '#a8bcc0', wob: 0.003 });
  for (let i = 0; i < 12; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.014 + rnd() * 0.016, 14, 10), dropMat);
    d.renderOrder = 6; d.userData.noRay = true; d.raycast = () => {};
    const a = V(-1.2 + rnd() * 2.6, 0.9 + rnd() * 1.6, -3 + rnd() * 8.6);
    d.position.copy(a); P(d); drops.push({ m: d, a, ph: rnd() * 6.28 });
  }
  // 红白头盔也飘起来了
  const helmet = refs.helmet;
  if (helmet) {
    helmet.parent && helmet.parent.remove(helmet);
    addF(helmet, -0.75, 1.3, 2.3, { spin: 0.5 });
  }

  // ===== 机器人小圆（天花板附近打转）=====
  const robot = makeRobot();
  robot.home = V(-0.2, 2.5, 1.5);
  robot.root.position.copy(robot.home);
  P(robot.root); mark('robot', robot.root);
  robot.spin = V(2.3, 3.1, 1.7);
  // ===== 驾驶舱里的大水球（里面泡着一张纸条）=====
  const wb = new THREE.Group(); wb.position.set(0.55, 1.5, 5.45);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 36), waterMaterial({ color: '#a9bfc2', wob: 0.012 }));
  ball.renderOrder = 6; wb.add(ball);
  const noteC = TX.makeCanvas(128, 96), nx = noteC.getContext('2d');
  nx.fillStyle = '#e8e0c4'; nx.fillRect(0, 0, 128, 96); nx.strokeStyle = '#bfb28a'; nx.strokeRect(3, 3, 122, 90);
  const noteTex = TX.toTex(noteC, { wrap: false });
  const note = mesh(new THREE.PlaneGeometry(0.1, 0.075), new THREE.MeshStandardMaterial({ map: noteTex, side: THREE.DoubleSide, roughness: 0.8 }), { cast: false });
  wb.add(note);
  P(wb); mark('waterBall', wb);
  refs.waterBall = { group: wb, ball, note, noteCanvas: noteC, noteTex, size: 1, pop: 0 };

  // ===== 灯光：夜间模式很暗——一点冷青色的环境光、两盏暖色工作灯、屏幕光、驾驶舱的琥珀色；阳光从窗外硬硬地打进来 =====
  const L = refs.lights;
  L.hemi.color.set('#56706b'); L.hemi.groundColor.set('#231f1c'); L.hemi.intensity = 0.3;
  L.sun.color.set('#fff6ea'); L.sun.intensity = 0; L.sun.shadow.camera.far = 40;
  L.winLight.intensity = 0; L.winLight.visible = false; // 太空舱里没有窗外的天光（面积光很贵，干脆关掉）
  // 点光源很贵（每个像素都要算一遍）：显示器的补光不要了，屏幕本身是自发光的
  L.monLight.visible = false;
  for (const s of L.ceilSpots) { s.color.set('#e6ede0'); s.angle = 1.2; }
  L.wc.color.set('#ffab55'); L.wc.intensity = 9; L.wc.distance = 6.5;
  // "cabinGlow"：东墙上方一盏夹着的暖色工作灯（夜间模式的主光）
  const cabinGlow = new THREE.PointLight('#ffb068', 1.3, 4.8, 1.8); cabinGlow.position.set(1.45, 2.3, 0.35); P(cabinGlow);
  const lamp = new THREE.Group(); lamp.position.set(1.62, 2.42, 0.35); lamp.rotation.z = 0.7;
  lamp.add(mesh(new THREE.ConeGeometry(0.07, 0.1, 18, 1, true), MAT.metal('#3a3d3b', 0.5, 0.6)));
  const lampBulb = mesh(new THREE.SphereGeometry(0.03, 12, 8), glowMat('#ffcf8a'), { y: -0.03, cast: false }); lamp.add(lampBulb);
  lamp.add(mesh(cyl(0.008, 0.008, 0.3, 8), standM, { y: 0.18, x: 0.05, rz: -0.4 }));
  P(lamp);
  // 西墙厨房上方也有一盏：借用宿舍走廊那盏灯（出舱时它会被门口的光门借走，照亮门口）
  const galleyLamp = L.corridor;
  galleyLamp.userData.home = { pos: V(-1.35, 2.0, 2.05), color: '#ffa860', distance: 3.6, decay: 1.8 };
  const lamp2 = lamp.clone(); lamp2.position.set(-1.62, 2.12, 2.05); lamp2.rotation.z = -0.7; P(lamp2);
  refs.spaceLights = { stripMat, floorDots, cabinGlow, galleyLamp, beaconLight, beaconMat, camFill, glaMat, lampBulbs: [lampBulb.material] };
  // 阳光从北窗斜射进来的光柱（真空里没有灰尘，光柱是舱里飘着的灰）
  refs.shafts = new LightShafts({ rects: [{ cx: -0.66, cy: 1.75, w: 1.22, h: 1.45 }, { cx: 0.66, cy: 1.75, w: 1.22, h: 1.45 }], planeZ: -3.56, dir: V(-0.35, -0.2, 1).normalize(), length: 4.6, color: '#fff6e8', intensity: 0.03, slices: 6 });
  P(refs.shafts.group);

  // ===== 合批、做旧 =====
  batch.build(props);
  add(props);
  refs.gap.line.color.set('#ffd9a0');
  // 门外不再是宿舍走廊（开门时会被一道光门挡住），只留下那盏灯
  refs.corridor.traverse((o) => { if (o.isMesh) o.visible = false; });
  // 整个舱的材质压一压饱和度、加一层淡淡的脏印（天空盒、屏幕、发光的东西除外）
  weather(root, { skip: (o) => o.userData.keepMat || o.material === glaMat });

  refs.floaters = {
    list: floaters,
    // 一次冲击（太空垃圾擦过、开舱门）：所有东西被推一把
    impulse(s = 1, dir = null) { for (const f of floaters) { f.vel.add(dir ? dir.clone().multiplyScalar(s) : V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); f.ang.multiplyScalar(1 + s * 2); } },
  };
  refs.robot = robot;
  refs.candies = { group: candies, items: candyItems };

  // ===== 每帧更新 =====
  const _p = V(), _d = V();
  let scrT = 0, lapT = 0;
  refs.updaters.push((dt, t, g) => {
    // 飘浮的杂物：弹簧拉回原位 + 被人推开 + 慢慢自转
    const pl = g && g.ctrl ? g.ctrl.pos : null;
    const fdt = dt * (refs.floaters.timeScale ?? 1); // 彩蛋里“时间停住了”
    for (const f of floaters) {
      const o = f.obj;
      _d.copy(f.anchor).sub(o.position);
      f.vel.addScaledVector(_d, 0.35 * fdt);
      f.vel.y += Math.sin(t * 0.6 + f.ph) * f.amp * fdt;
      if (pl) {
        // 人的身体近似成一根竖着的胶囊
        const cy = clamp(o.position.y, pl.y + 0.2, pl.y + 1.7);
        _p.set(pl.x, cy, pl.z);
        const dist = o.position.distanceTo(_p);
        if (dist < 0.45 && dist > 1e-4) { _d.copy(o.position).sub(_p).normalize(); f.vel.addScaledVector(_d, (0.45 - dist) * 9 * fdt * f.push); f.ang.x += (Math.random() - 0.5) * fdt * 3; }
      }
      f.vel.multiplyScalar(Math.exp(-0.45 * fdt));
      o.position.addScaledVector(f.vel, fdt);
      o.position.x = clamp(o.position.x, -1.7, 1.7); o.position.y = clamp(o.position.y, 0.1, 2.88);
      f.ang.multiplyScalar(Math.exp(-0.05 * fdt));
      o.rotation.x += f.ang.x * fdt; o.rotation.y += f.ang.y * fdt; o.rotation.z += f.ang.z * fdt;
    }
    for (const c of candyItems) { c.m.position.set(Math.cos(t * c.sp + c.ph) * c.r, c.y + Math.sin(t * c.sp * 1.3 + c.ph) * 0.05, Math.sin(t * c.sp + c.ph) * c.r); c.m.rotation.y += dt * 2; }
    candies.position.y = 1.85 + Math.sin(t * 0.5) * 0.06;
    for (const d of drops) { d.m.position.set(d.a.x + Math.sin(t * 0.3 + d.ph) * 0.2, d.a.y + Math.sin(t * 0.41 + d.ph * 2) * 0.15, d.a.z + Math.cos(t * 0.27 + d.ph) * 0.2); }
    dropMat.uniforms.time.value = t;
    // 舱内设备：休眠舱的指示灯一闪一闪、压缩机风扇在转、接收站的天线慢慢转、约束环转个不停
    for (const [pi, p] of gear.pods.entries()) {
      p.fan.rotation.x += dt * 9;
      p.leds.forEach((l, i) => (l.visible = Math.sin(t * (1.3 + i * 0.7) + pi * 2 + i) > -0.4));
    }
    gear.station.dish.rotation.y = Math.sin(t * 0.25) * 1.2;
    const bhR = gear.blackHole;
    gear.storage.rings.forEach((r, i) => { r.rotation.x += dt * (0.6 + i * 0.35) * (bhR.agitate || 1); r.rotation.y += dt * (0.4 + i * 0.2) * (bhR.agitate || 1); });
    bhR.update(dt, t);
    // 水球：晃来晃去
    const W = refs.waterBall;
    if (W.group.visible) {
      ball.material.uniforms.time.value = t;
      W.group.position.set(0.55 + Math.sin(t * 0.37) * 0.12, 1.5 + Math.sin(t * 0.53) * 0.08, 5.45 + Math.cos(t * 0.29) * 0.1);
      ball.scale.set(W.size * (1 + Math.sin(t * 2.3) * 0.04), W.size * (1 - Math.sin(t * 2.3) * 0.04), W.size);
      if (!W.freed) { note.rotation.set(t * 0.4, t * 0.6, t * 0.3); note.scale.setScalar(Math.min(1, W.size * 1.6)); }
    }
    // 显示器（10 帧/秒）、笔记本（2 帧/秒）
    scrT -= dt;
    if (scrT <= 0) {
      scrT = 0.1;
      const o2 = g && g.S && g.CH && g.CH.o2 ? g.CH.o2(g) / 100 : 1;
      const alert = !!(g && g.S && g.S.f.alarm);
      for (const s of screens) { TS.drawOrbitScreen(s.canvas, t + (s.mode === 'life' ? 40 : 0), { o2, alert: alert || s.mode === 'life' }); s.tex.needsUpdate = true; }
    }
    lapT -= dt;
    if (lapT <= 0) { lapT = 0.5; for (const l of laptops) { TS.drawLaptop(l.canvas, t + l.ph, { title: l.title }); l.tex.needsUpdate = true; } }
    refs.shafts.update(dt, t);
  });
}
