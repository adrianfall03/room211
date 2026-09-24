// 第四章：失重太空舱 211 —— 还是那间宿舍的布局，被搬进了近地轨道上的一节太空舱。
//   日式动画（赛璐璐）渲染：两阶明暗 + 冷色暗部 + 深蓝描边 + 人物边缘光 + 集中线；
//   窗外（跟着镜头走的天空盒）：平涂的地球（昼夜交替、城市灯光、大气光环）、月亮、带星芒的太阳、会眨眼的星星；
//   屋里：所有没固定住的东西都飘在半空，三个室友裹着睡袋飘在上铺打呼噜（吹鼻涕泡），失控的机器人小圆在天花板附近打转
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import * as TS from '../core/tex_space.js';
import * as TT from '../core/tex_toon.js';
import { mulberry32, clamp, lerp, smoothstep } from '../core/util.js';
import { toonifyScene, toonMat, addOutline, addRim, GRAD_ANIME, STYLES } from './toonkit.js';
import { LightShafts, Emote } from './fx.js';

export function buildSpaceTextures(B) {
  const T = {};
  T.floor = TS.genDeck(); T.floorDirt = TS.genDeckDirt();
  T.wall = TS.genPadWall();
  const cs = TS.genCeilingSpace(); T.ceiling = cs.map; T.ceilingEm = cs.emissiveMap;
  T.woodDark = TS.genPanel({ base: '#8d9bb0', line: '#6f7d93', seed: 1 });
  T.woodLight = TS.genPanel({ base: '#e8edf3', line: '#b8c2d0', seed: 2 });
  T.woodOrange = TS.genPanel({ base: '#ff9a4d', line: '#d8702a', seed: 3 });
  T.doorWood = TS.genHatchDoor();
  T.blackLaminate = TS.genPanel({ base: '#2e3f62', line: '#44577e', seed: 4 });
  T.curtain = TS.genShutter(); T.curtain.repeat.set(3, 3);
  T.net = TS.genCargoNet(); T.net.repeat.set(5, 5);
  const flat = (c, o, r) => { const t = TT.genFlat(c, o); t.repeat.set(r[0], r[1]); return t; };
  T.grayCloth = flat('#a9bcd8', { pattern: 'dots', fg: '#ffffff', S: 64, step: 16, r: 2.5 }, [3, 3]);
  T.pinkCloth = flat('#ff9a4d', { pattern: 'stripes', fg: '#ffb070', S: 32, step: 8 }, [3, 3]);
  T.blackCloth = flat('#2e3f62', { pattern: 'stripes', fg: '#3e5078', S: 32, step: 8 }, [2, 2]);
  T.blueCloth = flat('#3a6fd8', { pattern: 'stars', fg: '#ffd23f', S: 64, step: 32, r: 6 }, [2, 2]);
  T.whiteCloth = flat('#f4f6fa', { pattern: 'dots', fg: '#cfe0ff', S: 64, step: 16, r: 2.5 }, [2, 2]);
  T.bamboo = flat('#6fb7c9', { pattern: 'stripes', fg: '#8fd0de', S: 32, step: 8 }, [2, 4]);
  T.floral = flat('#ffd23f', { pattern: 'stars', fg: '#ffffff', S: 64, step: 32, r: 7 }, [2, 2]);
  T.polka = flat('#243452', { pattern: 'dots', fg: '#ffffff', S: 128, step: 16, r: 3 }, [3, 2]);
  T.yellowDots = TT.genFlat('#ffd23f', { pattern: 'dots', fg: '#243452', S: 64, step: 21, r: 6 });
  T.patternRoll = flat('#2ec4c9', { pattern: 'check', fg: '#ffffff', S: 64, step: 16 }, [1, 2]);
  T.cardboard = TS.genCargoBag(); T.cardboard350 = TS.genCargoBag({ print: '350' });
  for (const k of ['paperMath', 'foldedNote1', 'foldedNote2', 'notebook', 'stickyMain', 'suitNote', 'roster']) T[k] = B[k];
  const wv = TX.makeCanvas(4, 4); wv.getContext('2d').fillStyle = '#000'; wv.getContext('2d').fillRect(0, 0, 4, 4);
  T.windowView = TX.toTex(wv);
  T.clockFace = TS.genMissionClock();
  T.mousepad = TS.genMousepadSpace();
  return T;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, cast = true } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? std(mat) : mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const glowMat = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });

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
const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap, nightMap, cloudMap; uniform vec3 sunDir; uniform float cloudRot, nightBoost, time;
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vec3 n = normalize(vN);
    float d = dot(n, sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    float lit = smoothstep(-0.015, 0.02, d);
    vec3 dayCol = day * mix(0.7, 1.0, step(0.32, d));
    vec3 nightCol = day * vec3(0.05, 0.07, 0.16) + vec3(0.008, 0.016, 0.05);
    vec3 col = mix(nightCol, dayCol, lit);
    // 晨昏线：一道暖色的光带
    col += vec3(1.0, 0.42, 0.22) * smoothstep(0.09, 0.0, abs(d - 0.012)) * 0.4;
    // 夜里的城市灯光
    vec3 lights = texture2D(nightMap, vUv).rgb;
    col += lights * (1.0 - smoothstep(-0.06, 0.04, d)) * nightBoost * (0.85 + 0.15 * sin(time * 3.0 + vUv.x * 80.0));
    // 云（赛璐璐的云：暗面也是一刀切）
    vec4 cl = texture2D(cloudMap, vec2(vUv.x + cloudRot, vUv.y));
    float cs = mix(0.07, 1.0, smoothstep(-0.02, 0.05, d)) * mix(0.82, 1.0, step(0.3, d));
    col = mix(col, cl.rgb * cs + vec3(0.02, 0.03, 0.08), cl.a * 0.9);
    // 大气边缘光
    float fr = pow(1.0 - clamp(dot(n, -normalize(vDir)), 0.0, 1.0), 2.6);
    col += vec3(0.32, 0.66, 1.0) * fr * (0.2 + 1.1 * smoothstep(-0.25, 0.45, d));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const HALO_FRAG = /* glsl */ `
  uniform vec3 sunDir; uniform float boost;
  varying vec2 vUv; varying vec3 vN; varying vec3 vDir;
  void main() {
    vec3 n = normalize(vN), v = normalize(vDir);
    float k = smoothstep(0.0, 0.42, dot(n, v));
    float side = 0.35 + 0.9 * max(0.0, dot(n, sunDir));
    float back = pow(max(0.0, dot(v, sunDir)), 10.0) * 3.0;
    vec3 col = mix(vec3(0.22, 0.5, 1.0), vec3(0.7, 0.9, 1.0), k) * k * (side * 0.8 + back) * boost;
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
    vec3 c = texture2D(map, vUv).rgb;
    c *= mix(0.08, 1.0, smoothstep(-0.02, 0.03, d)) * mix(0.75, 1.0, step(0.35, d));
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
const STAR_VERT = /* glsl */ `
  attribute float aSize; attribute float aPh; attribute vec3 aCol;
  uniform float time, scale;
  varying vec3 vCol; varying float vTw;
  void main() {
    vec3 rel = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + rel, 1.0);
    vTw = 0.55 + 0.45 * sin(time * (1.3 + aPh) + aPh * 17.0);
    gl_PointSize = aSize * scale * (0.75 + 0.35 * vTw);
    vCol = aCol;
  }`;
const STAR_FRAG = /* glsl */ `
  uniform sampler2D map; varying vec3 vCol; varying float vTw;
  void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vCol * t.rgb * t.a * vTw, 1.0); }`;

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
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N), col = new Float32Array(N * 3);
  const tints = [[1, 1, 1], [0.75, 0.85, 1], [1, 0.92, 0.75], [0.85, 0.95, 1]];
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 28, u * 28, Math.sin(a) * r * 28], i * 3);
    const big = rnd();
    size[i] = big > 0.985 ? 9 + rnd() * 6 : big > 0.9 ? 4 + rnd() * 3 : 1.6 + rnd() * 2;
    ph[i] = rnd() * 3;
    const tc = tints[(rnd() * tints.length) | 0], b = 0.6 + rnd() * 0.6;
    col.set([tc[0] * b, tc[1] * b, tc[2] * b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  sg.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const starU = { time: U.time, scale: { value: 1 }, map: { value: TS.genGlowDot() } };
  const stars = skyObj(new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, depthTest: false, depthWrite: false, transparent: false, blending: THREE.AdditiveBlending })), -110);
  group.add(stars);
  // 少数几颗亮星用四角星芒（动画里的"闪"）
  const M2 = 26, p2 = new Float32Array(M2 * 3), s2 = new Float32Array(M2), ph2 = new Float32Array(M2), c2 = new Float32Array(M2 * 3);
  for (let i = 0; i < M2; i++) {
    const u = rnd() * 1.4 - 0.4, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    p2.set([Math.cos(a) * r * 27, u * 27, Math.sin(a) * r * 27], i * 3);
    s2[i] = 14 + rnd() * 14; ph2[i] = rnd() * 3; c2.set([1, 1, 1], i * 3);
  }
  const sg2 = new THREE.BufferGeometry();
  sg2.setAttribute('position', new THREE.BufferAttribute(p2, 3)); sg2.setAttribute('aSize', new THREE.BufferAttribute(s2, 1));
  sg2.setAttribute('aPh', new THREE.BufferAttribute(ph2, 1)); sg2.setAttribute('aCol', new THREE.BufferAttribute(c2, 3));
  const sparkU = { time: U.time, scale: starU.scale, map: { value: TS.genSparkle() } };
  group.add(skyObj(new THREE.Points(sg2, new THREE.ShaderMaterial({ uniforms: sparkU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, depthTest: false, depthWrite: false, transparent: false, blending: THREE.AdditiveBlending })), -109));

  // 太阳（在地球之前画：被地球挡住就看不见了）
  const quad = new THREE.PlaneGeometry(1, 1);
  const sunTex = TS.genSunSprite();
  const mkSprite = (tex, color, sizeV, order, opacity = 1) => {
    const u = { map: { value: tex }, color: { value: new THREE.Color(color) }, opacity: { value: opacity }, center: { value: V() }, size: { value: sizeV }, rot: { value: 0 } };
    const m = skyObj(new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, depthTest: false, depthWrite: false, transparent: false, blending: THREE.AdditiveBlending })), order);
    group.add(m);
    return u;
  };
  const sunU = mkSprite(sunTex, '#fff6e8', 9, -106);
  const sunCore = mkSprite(TS.genGlowDot(64), '#ffffff', 2.2, -105);

  // 地球：视线斜下方，半径约 11°
  const earthDirN = V(0.12, -0.085, -1).normalize();
  const ED = 30, ER = 6.1;
  const day = TS.genEarthDay();
  const clouds = TS.genEarthClouds();
  const night = TS.genEarthNight(day);
  const earthU = { dayMap: { value: day.tex }, nightMap: { value: night.tex }, cloudMap: { value: clouds }, sunDir: { value: sunDir }, cloudRot: { value: 0 }, nightBoost: { value: 1 }, time: U.time };
  const halo = skyObj(new THREE.Mesh(new THREE.SphereGeometry(ER * 1.075, 48, 32), skyMat(HALO_FRAG, { sunDir: { value: sunDir }, boost: { value: 1 } }, { blending: THREE.AdditiveBlending, side: THREE.BackSide })), -104);
  halo.position.copy(earthDirN).multiplyScalar(ED);
  group.add(halo);
  const earth = skyObj(new THREE.Mesh(new THREE.SphereGeometry(ER, 72, 48), skyMat(EARTH_FRAG, earthU)), -103);
  earth.position.copy(earthDirN).multiplyScalar(ED);
  earth.rotation.set(0.25, -0.35, 0.18);
  group.add(earth);
  earth.updateMatrixWorld(true);
  // 正对着舱窗的那一点在贴图上的位置（城市灯光拼的数字就画在那）
  const face = earthDirN.clone().negate().applyQuaternion(earth.quaternion.clone().invert());
  const faceU = ((Math.atan2(face.z, -face.x) / (Math.PI * 2)) + 1) % 1, faceV = Math.acos(clamp(face.y, -1, 1)) / Math.PI;

  // 月亮：左上方远处
  const moon = skyObj(new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 20), skyMat(MOON_FRAG, { map: { value: TS.genMoon() }, sunDir: { value: sunDir } })), -107);
  moon.position.copy(V(-0.62, 0.3, -1).normalize().multiplyScalar(29));
  group.add(moon);
  // 远处缓缓飞过的人造卫星（一个小亮点 + 两片太阳能板的闪光）
  const satU = mkSprite(TS.genSparkle(), '#bfe8ff', 0.5, -102, 0.9);

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
    sunVisible() { return smoothstep(earthAng * 0.92, earthAng * 1.12, sunDir.angleTo(earthDirN)); },
    update(dt, t, { theta = 0, drawH = 800, nightBoost = 1 } = {}) {
      U.time.value = t;
      starU.scale.value = drawH / 900;
      // 轨道一圈：太阳绕着舱转；θ=0 在身后（满地球），θ=π 躲到地球背后（日食光环 + 全是夜景）
      sunDir.copy(earthDirN).multiplyScalar(-Math.cos(theta)).addScaledVector(side, 0.9 * Math.sin(theta)).addScaledVector(up2, 0.3 * Math.max(0, Math.cos(theta))).normalize();
      sunU.center.value.copy(sunDir).multiplyScalar(28);
      sunCore.center.value.copy(sunU.center.value);
      sunU.rot.value = t * 0.05;
      const vis = this.sunVisible();
      sunU.size.value = 9 + Math.sin(t * 2.3) * 0.25;
      sunU.opacity.value = 1; sunCore.opacity.value = 1;
      halo.material.uniforms.boost.value = 1 + (1 - vis) * 0.45;
      earthU.cloudRot.value = t * 0.0015;
      earthU.nightBoost.value = nightBoost;
      // 卫星：沿一条斜线慢慢飞，一闪一闪
      const k = (t * 0.012) % 1;
      _t.set(-1 + k * 2, 0.25 + k * 0.2, -1).normalize().multiplyScalar(26);
      satU.center.value.copy(_t); satU.opacity.value = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.1)) ** 8;
      satU.rot.value = t * 0.3;
    },
  };
}

// ================= 洗手间窗外：穿着宇航服的三只猴子（彩蛋）=================
export function buildSpaceOutside() {
  const group = new THREE.Group(); group.name = 'spaceOutside';
  const monkeys = [];
  const suit = std('#f4f6fa', { roughness: 0.7 }), fur = std('#8a5a3a'), face = std('#f0c9a0'), dark = std('#1a1410');
  const visor = new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false });
  const orange = std('#ff8a3d');
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    body.add(mesh(new THREE.CapsuleGeometry(0.16, 0.26, 6, 14), suit, { y: 0 }));
    body.add(mesh(new THREE.BoxGeometry(0.26, 0.3, 0.12), suit, { y: 0.04, z: -0.16 }));
    body.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), orange, { y: 0.1, z: 0.15 }));
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
  const tether = mesh(new THREE.BufferGeometry(), std('#ffd23f'), { cast: false });
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

// ================= 失控的机器人"小圆" =================
function makeRobot() {
  const root = new THREE.Group(); root.name = 'robot';
  const body = new THREE.Group(); root.add(body);
  const white = std('#f6f8fc', { roughness: 0.4 }), cyan = std('#2ec4c9'), orange = std('#ff8a3d'), dark = std('#243452');
  body.add(mesh(new THREE.SphereGeometry(0.15, 28, 20), white));
  // 脸：前面一块弧形屏幕
  const fc = TX.makeCanvas(256, 128);
  TS.drawRobotFace(fc, 'dizzy', 0);
  const faceTex = TX.toTex(fc, { wrap: false });
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false });
  const faceM = mesh(new THREE.SphereGeometry(0.153, 28, 16, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.5 - 0.5, 1.0), faceMat, { cast: false });
  faceM.userData.keepMat = true; faceM.userData.noOutline = true;
  body.add(faceM);
  // 耳朵（会扑腾的小翅膀）+ 光环 + 天线
  const ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.145, 0.04, 0); body.add(e);
    e.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20, 1, false, 0, Math.PI), cyan, { rz: s * Math.PI / 2, ry: Math.PI / 2 }));
    ears.push(e);
  }
  const ring = mesh(new THREE.TorusGeometry(0.21, 0.012, 8, 40), orange);
  ring.rotation.x = Math.PI / 2 - 0.35; body.add(ring);
  body.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), dark, { y: 0.18 }));
  const tipMat = glowMat('#ff4a5a');
  const tip = mesh(new THREE.SphereGeometry(0.018, 10, 8), tipMat, { y: 0.225, cast: false }); body.add(tip);
  // 推进器的光
  const jet = mesh(new THREE.SphereGeometry(0.04, 10, 8), glowMat('#7fe0ff', { transparent: true, opacity: 0.8 }), { y: -0.15, s: [1, 0.5, 1], cast: false });
  body.add(jet);
  const emote = new Emote(root, 0.38);
  return { root, body, faceCanvas: fc, faceTex, faceMat, ears, ring, tipMat, jet, emote, mode: 'dizzy' };
}

// ================= 裹着睡袋飘在上铺的室友（动画脸）=================
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
    float fr = 1.0 - abs(dot(n, v));
    vec3 col = mix(color, vec3(0.92, 0.98, 1.0), smoothstep(0.3, 0.9, fr));
    float a = (0.16 + smoothstep(0.4, 0.85, fr) * 0.7) * opacity;
    // 动画风格的高光：两块硬边的亮斑
    float s1 = step(0.955, dot(n, normalize(vec3(-0.45, 0.55, 0.7))));
    float s2 = step(0.985, dot(n, normalize(vec3(0.4, -0.35, 0.85))));
    col += vec3(s1 + s2 * 0.7);
    a = max(a, (s1 * 0.95 + s2 * 0.6) * opacity);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
export function waterMaterial({ color = '#8fd8ff', wob = 0.02, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, wob: { value: wob }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false,
  });
}

function makeSleeper({ bag = '#3a6fd8', hair = '#2a2a3a', skin = '#ffe0c8', style = 'spiky', mouth = 'o', seed = 0 }) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const bagMat = new THREE.MeshStandardMaterial({ map: TS.genSleepingBag(bag), roughness: 0.8 });
  // 睡袋沿本地 z 躺着，头在 +z
  body.add(mesh(new THREE.CapsuleGeometry(0.2, 1.05, 8, 18), bagMat, { rx: Math.PI / 2, s: [1, 1, 0.78] }));
  body.add(mesh(new THREE.TorusGeometry(0.14, 0.045, 10, 24), std('#ff8a3d'), { z: 0.66, s: [1, 0.85, 1] }));
  // 两根固定带
  for (const z of [-0.3, 0.25]) body.add(mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 28), std('#243452'), { z, s: [1, 0.8, 1] }));
  // 头：朝上（+y 是脸朝的方向），睡着的脸 + 翘起来的头发
  const head = new THREE.Group(); head.position.set(0, 0.03, 0.78); body.add(head);
  const faceTex = TS.genSleeperFace(skin, { mouth, seed });
  const headM = mesh(new THREE.SphereGeometry(0.13, 28, 20), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }));
  // 球体贴图的正脸在 +z、头顶在 +y：绕 (0,1,1) 转半圈，脸朝 +y（天花板），头顶朝 +z（睡袋外面）
  headM.quaternion.setFromAxisAngle(V(0, 1, 1).normalize(), Math.PI);
  head.add(headM);
  const hairMat = std(hair, { roughness: 0.5 });
  const hairG = new THREE.Group(); head.add(hairG);
  hairG.add(mesh(new THREE.SphereGeometry(0.138, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, { rx: Math.PI / 2 + 0.35, z: 0.005 }));
  const spikes = [];
  const rnd = mulberry32(900 + seed);
  const nSp = style === 'spiky' ? 9 : style === 'bob' ? 0 : 3;
  for (let i = 0; i < nSp; i++) {
    // 刺猬头：一圈短尖刺，从头顶往后脑勺方向翘（失重里头发全都飘起来）
    const a = (i / nSp) * Math.PI * 2;
    const sp = new THREE.Group(); sp.position.set(Math.sin(a) * 0.07, -0.03 + Math.cos(a) * 0.06, 0.1); head.add(sp);
    sp.rotation.set(Math.PI / 2 + 0.35 - Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.7);
    sp.add(mesh(new THREE.ConeGeometry(0.03, 0.09 + rnd() * 0.05, 7), hairMat, { y: 0.045 }));
    spikes.push({ g: sp, ph: rnd() * 6.28, base: sp.rotation.clone() });
  }
  if (style === 'bob') {
    for (const s of [-1, 1]) hairG.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), hairMat, { x: s * 0.11, y: -0.02, z: 0.02, s: [0.7, 1, 1.2] }));
  }
  // 呆毛（动画人物必备）
  const ahoge = new THREE.Group(); ahoge.position.set(0, 0.02, 0.13); head.add(ahoge);
  ahoge.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI * 1.3), hairMat, { y: 0.05, rz: 0.3 }));
  // 飘起来的两只胳膊（失重时人睡着，手会自己浮起来）
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.17, 0.08, 0.45); body.add(a);
    a.add(mesh(new THREE.CapsuleGeometry(0.045, 0.3, 5, 10), bagMat, { y: 0.17 }));
    a.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), std(skin), { y: 0.36 }));
    a.rotation.set(0.5, 0, s * -0.35);
    arms.push({ g: a, s });
  }
  // 鼻涕泡
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 16), waterMaterial({ color: '#bfe8ff', wob: 0.004 }));
  bubble.position.set(0.02, 0.13, 0.02); bubble.renderOrder = 6; bubble.userData.noRay = true; bubble.raycast = () => {};
  head.add(bubble);
  const emote = new Emote(root, 0.5);
  return { root, body, head, spikes, arms, bubble, emote, ph: seed * 1.3 };
}

// ================= 装饰整个太空舱 =================
export function decorateSpace(ctx) {
  const { K, M, T, root, refs, collision, add, mark, block, camBox, LAYOUT } = ctx;
  const { SZ, DOOR, WR } = LAYOUT;
  const rnd = mulberry32(4040);
  const props = new THREE.Group(); props.name = 'spaceProps';
  const P = (o) => { props.add(o); return o; };

  // ===== 收拾：地上的复习资料、紫光涂鸦、窗户雾气、原来的窗景都不要了 =====
  root.traverse((o) => { if (o.userData.iid === 'paper' && o.isMesh) o.visible = false; });
  refs.fog.mesh.visible = false;
  refs.doodle.mesh.visible = false;
  refs.sticky.visible = false;
  refs.studentId.visible = false;
  refs.view.visible = false;
  refs.lock.group.visible = false;
  if (refs.interact.roster) refs.interact.roster.visible = false;
  // 遮光板一开始是关着的
  refs.curtain.layout(1); refs.curtain.f = 1;
  M.curtain.emissiveIntensity = 0.02;
  // 天花板、地板、墙都要挡阳光（太阳会从各个方向照进来）
  for (const o of refs.occluders) o.castShadow = true;

  // ===== 天空盒 =====
  const sky = buildSpaceSky();
  root.add(sky.group);
  refs.spaceSky = sky;

  // ===== 舷窗：加厚的圆角窗框 + 一圈螺栓 =====
  {
    const shape = new THREE.Shape();
    const rr = (s, x, y, w, h, r) => { s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); };
    rr(shape, -1.48, -0.92, 2.96, 1.84, 0.3);
    const hole = new THREE.Path(); rr(hole, -1.3, -0.77, 2.6, 1.54, 0.22); shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 10 });
    const bez = mesh(g, std('#e8edf3', { roughness: 0.35 }), { y: 1.75, z: -3.6 });
    P(bez);
    const gasket = new THREE.Shape(); rr(gasket, -1.33, -0.8, 2.66, 1.6, 0.24);
    const gh = new THREE.Path(); rr(gh, -1.3, -0.77, 2.6, 1.54, 0.22); gasket.holes.push(gh);
    P(mesh(new THREE.ExtrudeGeometry(gasket, { depth: 0.09, bevelEnabled: false, curveSegments: 10 }), std('#243452'), { y: 1.75, z: -3.62 }));
    const boltG = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), boltM = std('#8d9bb0', { metalness: 0.6, roughness: 0.3 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const x = Math.cos(a) * 1.42, y = Math.sin(a) * 0.86;
      P(mesh(boltG, boltM, { x: clamp(x, -1.4, 1.4), y: 1.75 + clamp(y, -0.85, 0.85), z: -3.505, rx: Math.PI / 2, cast: false }));
    }
    const sign = mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshStandardMaterial({ map: TS.genSign(['⚠ ZERO-G', '请抓紧扶手 · HOLD ON'], { W: 512, H: 132 }), roughness: 0.6 }), { x: 0.9, y: 2.78, z: -3.595, cast: false });
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
    const pm = mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.12, bevelEnabled: false, curveSegments: 32 }), std('#dfe5ee', { roughness: 0.5 }), { x: cx, y: cy, z: WR.z1 + 0.01 });
    wcWin.add(pm);
    const ring = mesh(new THREE.TorusGeometry(r, 0.045, 12, 48), std('#e8edf3', { roughness: 0.3 }), { x: cx, y: cy, z: WR.z1 + 0.0 });
    wcWin.add(ring);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; wcWin.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), std('#8d9bb0', { metalness: 0.6, roughness: 0.3 }), { x: cx + Math.cos(a) * (r + 0.075), y: cy + Math.sin(a) * (r + 0.075), z: WR.z1 - 0.01, rx: Math.PI / 2, cast: false })); }
    wcWin.add(mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false }), { x: cx, y: cy, z: WR.z1 + 0.06, ry: Math.PI, cast: false }));
  }
  // 跟着镜头的补光：动画里人物正面总是亮堂堂的
  const camFill = new THREE.DirectionalLight('#e6f2ff', 0.7); camFill.castShadow = false;
  P(camFill); P(camFill.target);

  // ===== 扶手（橙色）、天花板边的灯带、地脚灯、线缆 =====
  const railM = std('#ff9a3d', { roughness: 0.35 }), standM = std('#8d9bb0', { roughness: 0.3, metalness: 0.5 });
  const rail = (a, b) => {
    const len = a.distanceTo(b);
    const m = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 10), railM);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    P(m);
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, i / (n - 1));
      const s = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 8), standM, { cast: false });
      s.position.copy(p); if (Math.abs(p.x) > 1.7) { s.position.x += Math.sign(p.x) * 0.035; s.rotation.z = Math.PI / 2; } else { s.position.z += Math.sign(p.z) * 0.035; s.rotation.x = Math.PI / 2; }
      P(s);
    }
  };
  rail(V(1.72, 2.5, -3.2), V(1.72, 2.5, 4.2));
  rail(V(-1.72, 2.5, -3.2), V(-1.72, 2.5, 3.45));
  rail(V(-1.2, 2.72, -3.53), V(1.2, 2.72, -3.53));
  rail(V(-1.72, 0.9, 3.5), V(-1.72, 1.7, 3.5));
  rail(V(1.4, 1.0, 4.43), V(1.4, 1.9, 4.43));
  // 灯带：天花板和墙交界处一圈青色
  const stripMat = glowMat('#8fe8ff');
  for (const x of [-1.77, 1.77]) P(mesh(new THREE.BoxGeometry(0.025, 0.025, 7.9), stripMat, { x, y: 2.93, z: 0.45, cast: false }));
  P(mesh(new THREE.BoxGeometry(3.5, 0.025, 0.025), stripMat, { y: 2.93, z: -3.57, cast: false }));
  P(mesh(new THREE.BoxGeometry(3.5, 0.025, 0.025), stripMat, { y: 2.93, z: SZ - 0.03, cast: false }));
  // 地脚灯：沿两面长墙一排小灯（跑道灯）
  const dotPos = [];
  for (let z = -3.3; z < 4.3; z += 0.5) { dotPos.push(V(1.77, 0.06, z)); if (z < 3.5 || z > 4.45) dotPos.push(V(-1.77, 0.06, z)); }
  const floorDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), glowMat('#7fe0ff'), dotPos.length);
  const m4 = new THREE.Matrix4();
  dotPos.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); floorDots.setMatrixAt(i, m4); });
  floorDots.userData.noOutline = true;
  P(floorDots);
  // 线缆：沿着天花板角落，每隔一段有卡扣
  const cableCols = ['#243452', '#ff4a5a', '#e8edf3'];
  for (const x of [-1.66, 1.66]) {
    cableCols.forEach((c, ci) => {
      const pts = [];
      for (let z = -3.4; z <= 4.3; z += 0.4) pts.push(V(x - Math.sign(x) * ci * 0.03, 2.84 - Math.abs(Math.sin(z * 3.9)) * 0.035 - ci * 0.012, z));
      P(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.011, 5), std(c, { roughness: 0.5 }), { cast: false }));
    });
    for (let z = -3.2; z <= 4.3; z += 1.2) P(mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), std('#8d9bb0'), { x: x - Math.sign(x) * 0.03, y: 2.86, z, cast: false }));
  }
  // 标语牌
  const sign = (lines, x, y, z, ry, w = 0.6, h = 0.2, o = {}) => {
    const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: TS.genSign(lines, { W: 512, H: Math.round((512 * h) / w), ...o }), roughness: 0.6 }), { x, y, z, ry, cast: false });
    P(m); return m;
  };
  sign(['MODULE 211', 'CREW QUARTERS · 乘员舱'], 0, 2.78, SZ - 0.012, Math.PI, 0.9, 0.24);
  sign(['AIRLOCK', '气闸舱 →'], -1.785, 2.3, 3.2, Math.PI / 2, 0.5, 0.18, { accent: '#ff4a5a' });
  sign(['O₂'], 1.785, 1.95, 1.2, -Math.PI / 2, 0.2, 0.2, { fg: '#2ec4c9' });
  // 灭火器 + 急救包
  const ext = new THREE.Group(); ext.position.set(1.62, 0.9, SZ - 0.1);
  ext.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 16), std('#ff4a5a', { roughness: 0.35 })));
  ext.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 10), std('#243452'), { y: 0.24 }));
  P(ext); mark('extinguisher', ext);
  const aid = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.1), std('#f4f6fa'), { x: -1.2, y: 1.55, z: SZ - 0.06 });
  aid.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.005), std('#ff4a5a'), { z: 0.052, cast: false }));
  aid.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.005), std('#ff4a5a'), { z: 0.052, cast: false }));
  P(aid); mark('firstAid', aid);

  // ===== 气闸舱门：门上加圆形观察窗 + 转轮；门边的密码面板 + 红色警示灯 =====
  const D = refs.door;
  const DW = DOOR.z1 - DOOR.z0 - 0.02;
  const hatch = new THREE.Group(); hatch.position.set(-DW / 2, 0, -0.03); D.pivot.add(hatch);
  const chrome = std('#d8dde6', { roughness: 0.25, metalness: 0.8 });
  hatch.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 10, 32), chrome, { y: 1.62, rx: 0 }));
  hatch.add(mesh(new THREE.CircleGeometry(0.13, 28), new THREE.MeshStandardMaterial({ color: '#0c1a33', roughness: 0.1, emissive: new THREE.Color('#1a3a6a'), emissiveIntensity: 0.4 }), { y: 1.62, z: -0.005, ry: Math.PI, cast: false }));
  const wheel = new THREE.Group(); wheel.position.set(0, 1.02, -0.05); hatch.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.16, 0.018, 10, 36), std('#ffd23f', { roughness: 0.4 })));
  for (let i = 0; i < 4; i++) wheel.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), chrome, { rz: (i * Math.PI) / 4 }));
  wheel.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 16), chrome, { rx: Math.PI / 2 }));
  mark('door', hatch);
  // 门框一圈黄黑警示条
  const hzC = TX.makeCanvas(256, 32), hz = hzC.getContext('2d');
  hz.fillStyle = TS.SP.yellow; hz.fillRect(0, 0, 256, 32); hz.fillStyle = TS.SP.ink;
  for (let x = -32; x < 288; x += 32) { hz.beginPath(); hz.moveTo(x, 32); hz.lineTo(x + 16, 32); hz.lineTo(x + 32, 0); hz.lineTo(x + 16, 0); hz.fill(); }
  const hzTex = TX.toTex(hzC); hzTex.repeat.set(4, 1);
  const hzM = new THREE.MeshStandardMaterial({ map: hzTex, roughness: 0.6 });
  const dcz = (DOOR.z0 + DOOR.z1) / 2;
  P(mesh(new THREE.PlaneGeometry(DOOR.z1 - DOOR.z0 + 0.36, 0.08), hzM, { x: -1.787, y: 2.17, z: dcz, ry: Math.PI / 2, cast: false }));
  for (const z of [DOOR.z0 - 0.14, DOOR.z1 + 0.14]) { const h = mesh(new THREE.PlaneGeometry(2.2, 0.08), hzM, { x: -1.787, y: 1.08, z, ry: Math.PI / 2, rz: Math.PI / 2, cast: false }); P(h); }
  // 密码面板（门框北边、开关上方）
  const kpC = TX.makeCanvas(128, 160);
  const kpTex = TX.toTex(kpC, { wrap: false });
  const keypad = new THREE.Group(); keypad.position.set(-1.782, 1.66, 3.36); keypad.rotation.y = Math.PI / 2;
  keypad.add(mesh(new THREE.BoxGeometry(0.17, 0.22, 0.03), std('#2e3f62', { roughness: 0.4 })));
  keypad.add(mesh(new THREE.PlaneGeometry(0.14, 0.175), glowMat('#ffffff', { map: kpTex }), { z: 0.016, cast: false }));
  P(keypad); mark('door', keypad);
  // 警示灯（报警时转起来，红光扫过整个舱）
  const beacon = new THREE.Group(); beacon.position.set(-1.74, 2.35, 3.36);
  beacon.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), std('#243452'), { rz: Math.PI / 2 }));
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ff5a6a', emissive: new THREE.Color('#ff2a3a'), emissiveIntensity: 0.2, transparent: true, opacity: 0.85, roughness: 0.2 });
  beacon.add(mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat, { x: 0.015, rz: -Math.PI / 2, cast: false }));
  P(beacon);
  const beaconLight = new THREE.SpotLight('#ff3a4a', 0, 9, 0.5, 0.5, 1.2);
  beaconLight.position.set(-1.68, 2.35, 3.36); beaconLight.castShadow = false;
  P(beaconLight); P(beaconLight.target);
  refs.hatch = { wheel, keypad: { canvas: kpC, tex: kpTex }, beacon: { mat: beaconMat, light: beaconLight } };

  // ===== 显示器：轨道图 / 生命维持 =====
  const screens = [];
  for (const [mon, mode] of [[refs.monitor.group, 'orbit'], [refs.monitor2, 'life']]) {
    const c = TX.makeCanvas(320, 180);
    TS.drawOrbitScreen(c, 0, {});
    const tex = TX.toTex(c, { wrap: false });
    mon.userData.screenMat.map = tex; mon.userData.screenMat.toneMapped = false; mon.userData.screenMat.needsUpdate = true;
    screens.push({ canvas: c, tex, mode });
  }
  refs.spaceScreens = screens;

  // ===== 飘在半空的东西 =====
  const floaters = [];
  const addF = (obj, x, y, z, { spin = 0.4, amp = 0.05, push = 1, id = null } = {}) => {
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
    const cupTex = TX.makeCanvas(128, 64), cx = cupTex.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, 128, 64); cx.fillStyle = '#ff4a5a'; cx.fillRect(0, 8, 128, 20); cx.fillStyle = '#fff'; cx.font = 'bold 16px sans-serif'; cx.fillText('太空拉面', 30, 24);
    const cup = mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.12, 18, 1, true), new THREE.MeshStandardMaterial({ map: TX.toTex(cupTex), side: THREE.DoubleSide }));
    const g = group(cup, mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.005, 16), std('#f4f6fa'), { y: -0.06 }));
    const noodleM = std('#ffe08a');
    for (let i = 0; i < 6; i++) {
      const pts = []; const a0 = rnd() * 6.28;
      for (let k = 0; k < 8; k++) pts.push(V(Math.cos(a0 + k * 0.8) * 0.03 * (1 + k * 0.15), 0.04 + k * 0.035, Math.sin(a0 + k * 0.8) * 0.03 * (1 + k * 0.15)));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.004, 4), noodleM, { cast: false }));
    }
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.16, 0.012), std('#d8dde6', { metalness: 0.7 }), { x: 0.03, y: 0.12, rz: 0.3 }));
    addF(g, 0.25, 1.45, -1.3, { spin: 0.3, id: 'noodles' });
  }
  // 可乐罐
  for (const [x, y, z] of [[-0.45, 1.9, 0.95], [0.95, 2.3, 2.95], [-0.8, 1.15, -2.75], [0.55, 2.55, -0.4]]) {
    const can = group(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), std('#e8202a', { roughness: 0.3, metalness: 0.4 })), mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 16), std('#d8dde6', { metalness: 0.8 }), { y: 0.065 }));
    addF(can, x, y, z, { spin: 1.2, id: 'cola' });
  }
  // 袜子
  for (const [x, y, z, c] of [[1.0, 1.75, -2.95, '#f4f6fa'], [-0.3, 2.45, 3.1, '#ff9a4d'], [0.15, 0.7, 2.6, '#3a6fd8']]) {
    const sock = group(mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), std(c)), mesh(new THREE.CapsuleGeometry(0.035, 0.06, 4, 10), std(c), { y: -0.1, z: 0.05, rx: Math.PI / 2 }), mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 12), std('#243452'), { y: 0.1 }));
    addF(sock, x, y, z, { spin: 1.0, id: 'sock' });
  }
  // 摊开的书
  const bookCols = ['#3a6fd8', '#ff4a5a', '#2ec4c9', '#ffd23f'];
  for (const [x, y, z] of [[0.55, 1.2, 2.25], [-0.95, 2.1, -1.0], [0.15, 2.6, -2.45], [-0.3, 0.75, -0.2]]) {
    const c = bookCols[floaters.length % 4];
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const half = new THREE.Group(); half.rotation.y = s * 0.45; b.add(half);
      half.add(mesh(new THREE.BoxGeometry(0.15, 0.2, 0.008), std(c), { x: s * 0.075 }));
      half.add(mesh(new THREE.BoxGeometry(0.14, 0.19, 0.012), std('#fbf8f0'), { x: s * 0.072, z: -0.009 * 0 + 0.002 }));
    }
    addF(b, x, y, z, { spin: 0.5, id: 'book' });
  }
  // 笔
  for (let i = 0; i < 5; i++) {
    const pen = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8), std(['#ffd23f', '#3a6fd8', '#ff4a5a', '#2ec4c9', '#243452'][i]));
    addF(pen, 1.0 + (rnd() - 0.5) * 0.5, 1.2 + rnd() * 0.5, 0.2 + (rnd() - 0.5) * 1.2, { spin: 2.0 });
  }
  // 复习资料在空中飘
  for (let i = 0; i < 6; i++) {
    const p = mesh(new THREE.PlaneGeometry(0.21, 0.29, 2, 2), new THREE.MeshStandardMaterial({ map: T.paperMath[i % 4], side: THREE.DoubleSide, roughness: 0.9 }), { cast: true });
    const pp = p.geometry.attributes.position; for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.sin(pp.getX(k) * 12) * 0.012);
    p.geometry.computeVertexNormals();
    addF(p, -0.6 + rnd() * 1.4, 1.1 + rnd() * 1.5, -2.8 + rnd() * 6.2, { spin: 0.5, id: 'paper' });
  }
  // 小黄鸭
  {
    const y = std('#ffd23f');
    const duck = group(mesh(new THREE.SphereGeometry(0.07, 16, 12), y, { s: [1, 0.8, 1.2] }), mesh(new THREE.SphereGeometry(0.045, 14, 10), y, { y: 0.07, z: 0.05 }), mesh(new THREE.ConeGeometry(0.018, 0.04, 8), std('#ff8a3d'), { y: 0.065, z: 0.1, rx: Math.PI / 2 }));
    for (const s of [-1, 1]) duck.add(mesh(new THREE.SphereGeometry(0.008, 6, 5), std('#1a2238'), { x: s * 0.022, y: 0.085, z: 0.085, cast: false }));
    addF(duck, -0.2, 1.75, 0.25, { spin: 0.6, id: 'duck' });
  }
  // 手柄
  {
    const pad = group(mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 10), std('#243452'), { rz: Math.PI / 2 }));
    for (const s of [-1, 1]) pad.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#243452'), { x: s * 0.07, y: -0.025 }));
    pad.add(mesh(new THREE.SphereGeometry(0.009, 6, 5), std('#ff4a5a'), { x: 0.05, y: 0.02, z: 0.02, cast: false }));
    pad.add(mesh(new THREE.SphereGeometry(0.009, 6, 5), std('#2ec4c9'), { x: 0.065, y: 0.03, z: 0.012, cast: false }));
    addF(pad, 0.65, 1.6, -0.3, { spin: 0.8, id: 'gamepad' });
  }
  // 枕头 + 耳机
  addF(mesh(new THREE.BoxGeometry(0.45, 0.12, 0.3), std('#f4f6fa'), { s: [1, 1, 1] }), -1.1, 1.55, 2.05, { spin: 0.2, id: 'pillow' });
  {
    const hs = group(mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), std('#243452')));
    for (const s of [-1, 1]) hs.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), std('#ff9a3d'), { x: s * 0.09, rz: Math.PI / 2 }));
    addF(hs, 1.05, 2.05, 0.05, { spin: 0.6, id: 'headphones' });
  }
  // 苹果
  addF(group(mesh(new THREE.SphereGeometry(0.05, 16, 12), std('#e8202a', { roughness: 0.3 })), mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), std('#5a3a20'), { y: 0.055 })), 0.3, 1.1, 1.05, { spin: 0.7, id: 'apple' });
  // 糖豆：一小团五颜六色的豆子（张嘴去接！）
  const candies = new THREE.Group();
  const cc = ['#ff4a5a', '#ffd23f', '#2ec4c9', '#3a6fd8', '#7fd48a', '#ff9a3d'];
  const candyItems = [];
  for (let i = 0; i < 16; i++) {
    const c = mesh(new THREE.SphereGeometry(0.02, 10, 8), std(cc[i % cc.length], { roughness: 0.3 }), { s: [1, 0.65, 1], cast: false });
    c.userData.noOutline = true;
    candies.add(c); candyItems.push({ m: c, ph: rnd() * 6.28, r: 0.05 + rnd() * 0.12, sp: 0.3 + rnd() * 0.6, y: (rnd() - 0.5) * 0.12 });
  }
  candies.position.set(-0.1, 1.85, 1.55); P(candies); mark('candies', candies);
  // 小水珠
  const drops = [];
  const dropMat = waterMaterial({ color: '#9fe0ff', wob: 0.003 });
  for (let i = 0; i < 12; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.018 + rnd() * 0.02, 12, 10), dropMat);
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

  // ===== 睡袋里的三个室友（上铺）=====
  const sleepers = [
    { ...makeSleeper({ bag: '#3a6fd8', hair: '#2a2a3a', style: 'spiky', mouth: 'o', seed: 1 }), anchor: V(-1.28, 2.02, 0.21), yaw: 0, roll: -0.5, id: 'sleeperA' },
    { ...makeSleeper({ bag: '#ff8a3d', hair: '#e8b04a', style: 'spiky', mouth: 'smile', seed: 2 }), anchor: V(-1.28, 2.0, -2.34), yaw: Math.PI, roll: 0.5, id: 'sleeperB' },
    { ...makeSleeper({ bag: '#2ec4c9', hair: '#6a3a8a', style: 'bob', mouth: 'o', seed: 3 }), anchor: V(1.28, 2.04, -2.34), yaw: 0, roll: 0.55, id: 'sleeperC' },
  ];
  for (const s of sleepers) {
    s.root.position.copy(s.anchor); s.root.rotation.set(0, s.yaw, s.roll);
    P(s.root); mark(s.id, s.root);
  }
  // ===== 机器人小圆（天花板附近打转）=====
  const robot = makeRobot();
  robot.home = V(-0.2, 2.5, 1.5);
  robot.root.position.copy(robot.home);
  P(robot.root); mark('robot', robot.root);
  robot.spin = V(2.3, 3.1, 1.7);
  // ===== 洗手间里的大水球（里面泡着一张纸条）=====
  const wb = new THREE.Group(); wb.position.set(0.55, 1.5, 5.45);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 30), waterMaterial({ color: '#7fd0ff', wob: 0.012 }));
  ball.renderOrder = 6; wb.add(ball);
  const noteC = TX.makeCanvas(128, 96), nx = noteC.getContext('2d');
  nx.fillStyle = '#fff6c8'; nx.fillRect(0, 0, 128, 96); nx.strokeStyle = '#e8c860'; nx.strokeRect(3, 3, 122, 90);
  const noteTex = TX.toTex(noteC, { wrap: false });
  const note = mesh(new THREE.PlaneGeometry(0.1, 0.075), new THREE.MeshStandardMaterial({ map: noteTex, side: THREE.DoubleSide, roughness: 0.8 }), { cast: false });
  note.userData.noOutline = true;
  wb.add(note);
  P(wb); mark('waterBall', wb);
  refs.waterBall = { group: wb, ball, note, noteCanvas: noteC, noteTex, size: 1, pop: 0 };

  // ===== 灯光：舱内 LED（夜间模式偏蓝）、地球反光、阳光、屏幕光 =====
  const L = refs.lights;
  L.hemi.color.set('#bfe0ff'); L.hemi.groundColor.set('#6a5a9a'); L.hemi.intensity = 0.7;
  L.sun.color.set('#fff1d6'); L.sun.intensity = 0; L.sun.shadow.camera.far = 40;
  L.winLight.intensity = 0;
  L.monLight.color.set('#7fe0ff'); L.monLight.distance = 3.2;
  for (const s of L.ceilSpots) { s.color.set('#eaf6ff'); s.angle = 1.2; }
  const earthLight = new THREE.PointLight('#8fc0ff', 0, 9, 1.1); earthLight.position.set(0, 1.8, -3.0); P(earthLight);
  const cabinGlow = new THREE.PointLight('#8fb8ff', 0.9, 7, 1.2); cabinGlow.position.set(0, 2.5, 0.5); P(cabinGlow);
  refs.spaceLights = { stripMat, floorDots, earthLight, cabinGlow, beaconLight, beaconMat, camFill };
  // 阳光从北窗斜射进来的光柱
  refs.shafts = new LightShafts({ rects: [{ cx: -0.66, cy: 1.75, w: 1.22, h: 1.45 }, { cx: 0.66, cy: 1.75, w: 1.22, h: 1.45 }], planeZ: -3.56, dir: V(-0.35, -0.2, 1).normalize(), length: 4.6, color: '#fff0d0', intensity: 0.03, slices: 6 });
  P(refs.shafts.group);

  // ===== 镜框附近的东西不描边；整个舱卡通化（动画风）=====
  add(props);
  const mirrorPos = refs.mirrors.map((m) => m.mesh.getWorldPosition(V()));
  const wp = V();
  root.traverse((o) => { if (o.isMesh && !o.isReflector && mirrorPos.some((p) => o.getWorldPosition(wp).distanceTo(p) < 0.05)) o.userData.noOutline = true; });
  const map = toonifyScene(root, { skip: (o) => o === sky.group || o.userData.keepMat, style: 'anime', minR: 0.03 });
  const R = (m) => map.get(m) || m;
  L.tubeMats = L.tubeMats.map(R);
  refs.strip.userData.switchMat = R(refs.strip.userData.switchMat);
  K.M.curtain = R(K.M.curtain);
  const netM = R(K.M.net); netM.opacity = 0.24;
  const ceilMat = R(K.M.ceiling);
  ceilMat.emissiveMap = T.ceilingEm; ceilMat.emissive = new THREE.Color('#bfe8ff'); ceilMat.emissiveIntensity = 0.35; ceilMat.needsUpdate = true;
  refs.ceilMat = ceilMat;
  refs.hatch.beacon.mat = R(beaconMat); refs.spaceLights.beaconMat = refs.hatch.beacon.mat;
  // 人物 / 飘着的小东西加上动画的边缘光
  const rimmed = new Set();
  const rimAll = (o) => o.traverse((c) => { if (c.isMesh && c.material && c.material.isMeshToonMaterial && !c.material.transparent && !rimmed.has(c.material)) { rimmed.add(c.material); addRim(c.material, 0.3); } });
  for (const f of floaters) rimAll(f.obj);
  for (const s of sleepers) rimAll(s.root);
  rimAll(robot.root);
  refs.gap.line.color.set('#bfe8ff');
  // 门外不再是宿舍走廊（开门时会被一道光门挡住），只留下那盏灯
  refs.corridor.traverse((o) => { if (o.isMesh) o.visible = false; });

  refs.floaters = {
    list: floaters,
    // 一次冲击（太空垃圾擦过、开舱门）：所有东西被推一把
    impulse(s = 1, dir = null) { for (const f of floaters) { f.vel.add(dir ? dir.clone().multiplyScalar(s) : V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); f.ang.multiplyScalar(1 + s * 2); } },
  };
  refs.sleepers = sleepers;
  refs.robot = robot;
  refs.candies = { group: candies, items: candyItems };

  // ===== 每帧更新 =====
  const _p = V(), _d = V(), _q = new THREE.Quaternion();
  let scrT = 0;
  refs.updaters.push((dt, t, g) => {
    // 飘浮的杂物：弹簧拉回原位 + 被人推开 + 慢慢自转
    const pl = g && g.ctrl ? g.ctrl.pos : null;
    for (const f of floaters) {
      const o = f.obj;
      _d.copy(f.anchor).sub(o.position);
      f.vel.addScaledVector(_d, 0.35 * dt);
      f.vel.y += Math.sin(t * 0.6 + f.ph) * f.amp * dt;
      if (pl) {
        // 人的身体近似成一根竖着的胶囊
        const cy = clamp(o.position.y, pl.y + 0.2, pl.y + 1.7);
        _p.set(pl.x, cy, pl.z);
        const dist = o.position.distanceTo(_p);
        if (dist < 0.45 && dist > 1e-4) { _d.copy(o.position).sub(_p).normalize(); f.vel.addScaledVector(_d, (0.45 - dist) * 9 * dt * f.push); f.ang.x += (Math.random() - 0.5) * dt * 3; }
      }
      f.vel.multiplyScalar(Math.exp(-0.45 * dt));
      o.position.addScaledVector(f.vel, dt);
      o.position.x = clamp(o.position.x, -1.7, 1.7); o.position.y = clamp(o.position.y, 0.1, 2.88);
      f.ang.multiplyScalar(Math.exp(-0.05 * dt));
      o.rotation.x += f.ang.x * dt; o.rotation.y += f.ang.y * dt; o.rotation.z += f.ang.z * dt;
    }
    for (const c of candyItems) { c.m.position.set(Math.cos(t * c.sp + c.ph) * c.r, c.y + Math.sin(t * c.sp * 1.3 + c.ph) * 0.05, Math.sin(t * c.sp + c.ph) * c.r); c.m.rotation.y += dt * 2; }
    candies.position.y = 1.85 + Math.sin(t * 0.5) * 0.06;
    for (const d of drops) { d.m.position.set(d.a.x + Math.sin(t * 0.3 + d.ph) * 0.2, d.a.y + Math.sin(t * 0.41 + d.ph * 2) * 0.15, d.a.z + Math.cos(t * 0.27 + d.ph) * 0.2); }
    dropMat.uniforms.time.value = t;
    // 睡着的室友：慢慢飘、头发飘、胳膊浮着、鼻涕泡一鼓一鼓
    for (const s of sleepers) {
      s.root.position.set(s.anchor.x, s.anchor.y + Math.sin(t * 0.7 + s.ph) * 0.05, s.anchor.z + Math.sin(t * 0.33 + s.ph) * 0.04);
      s.body.rotation.set(Math.sin(t * 0.4 + s.ph) * 0.06, 0, Math.sin(t * 0.5 + s.ph) * 0.08);
      for (const sp of s.spikes) { sp.g.rotation.x = sp.base.x + Math.sin(t * 1.7 + sp.ph) * 0.12; sp.g.rotation.z = sp.base.z + Math.sin(t * 1.3 + sp.ph) * 0.1; }
      for (const a of s.arms) a.g.rotation.x = 0.5 + Math.sin(t * 0.8 + s.ph + a.s) * 0.12;
      const br = (t * 0.45 + s.ph) % 1;
      const bs = br < 0.85 ? 0.2 + (br / 0.85) * 0.9 : 1.1 * (1 - (br - 0.85) / 0.15);
      s.bubble.scale.setScalar(Math.max(0.05, bs));
      s.bubble.material.uniforms.time.value = t;
      if (br > 0.97 && !s._pop) { s._pop = true; if (Math.random() < 0.5) s.emote.show('zzz', 1.6, 0.22); } else if (br < 0.5) s._pop = false;
      s.emote.update(dt);
    }
    // 水球：晃来晃去
    const W = refs.waterBall;
    if (W.group.visible) {
      ball.material.uniforms.time.value = t;
      W.group.position.set(0.55 + Math.sin(t * 0.37) * 0.12, 1.5 + Math.sin(t * 0.53) * 0.08, 5.45 + Math.cos(t * 0.29) * 0.1);
      ball.scale.set(W.size * (1 + Math.sin(t * 2.3) * 0.04), W.size * (1 - Math.sin(t * 2.3) * 0.04), W.size);
      if (!W.freed) { note.rotation.set(t * 0.4, t * 0.6, t * 0.3); note.scale.setScalar(Math.min(1, W.size * 1.6)); }
    }
    // 显示器（10 帧/秒）
    scrT -= dt;
    if (scrT <= 0) {
      scrT = 0.1;
      const o2 = g && g.S ? clamp(1 - g.S.elapsed / g.S.limit, 0, 1) : 1;
      const alert = !!(g && g.S && g.S.f.alarm);
      for (const s of screens) { TS.drawOrbitScreen(s.canvas, t + (s.mode === 'life' ? 40 : 0), { o2, alert: alert || s.mode === 'life' }); s.tex.needsUpdate = true; }
    }
    refs.shafts.update(dt, t);
  });
}
