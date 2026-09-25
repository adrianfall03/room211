// "卡冈图雅"：储藏室货柜 G 里约束着的一颗微型黑洞（致敬《星际穿越》）。
//   黑色的视界 + 一圈刺眼的光子环 + 被引力透镜"掀"到上下两侧的吸积盘光弧 + 倾斜的、会转的吸积盘。
//   全部用 ShaderMaterial：时空坍缩时整间舱会被一刀一刀"切掉"（全局裁剪面），只有它不受影响。
import * as THREE from 'three';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// 视界：纯黑，写深度（挡住后半个吸积盘）
const HORIZON_FRAG = /* glsl */ `void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;
// 吸积盘：内圈白热、外圈橙红，一条条旋臂在转；朝向镜头这一侧更亮（多普勒增亮）
const DISK_FRAG = /* glsl */ `
  uniform float time, power; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
    float inner = 0.42;
    float band = smoothstep(inner, inner + 0.05, r) * smoothstep(1.0, 0.7, r);
    float swirl = 0.55 + 0.45 * sin(a * 3.0 + 18.0 / (r + 0.2) - time * 2.6) * sin(a * 7.0 - time * 1.3 + r * 30.0);
    float streak = 0.7 + 0.3 * h(vec2(floor((a + time * 0.6) * 40.0), floor(r * 30.0)));
    vec3 hot = vec3(1.0, 0.95, 0.85), mid = vec3(1.0, 0.62, 0.25), cool = vec3(0.75, 0.22, 0.08);
    float k = smoothstep(inner, 1.0, r);
    vec3 col = mix(hot, mid, smoothstep(0.0, 0.45, k)); col = mix(col, cool, smoothstep(0.45, 1.0, k));
    float dop = 0.7 + 0.5 * sin(a + 1.2);
    float I = band * swirl * streak * dop * (1.4 - k) * power;
    gl_FragColor = vec4(col * I * 2.2, I);
  }`;
// 面向镜头的光晕：光子环 + 被透镜掀到视界上方 / 下方的吸积盘光弧 + 外面一圈淡淡的辉光
const HALO_FRAG = /* glsl */ `
  uniform float time, power; varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0; float d = length(c) * 3.0; // 单位：视界半径
    vec2 dir = normalize(c + 1e-5);
    float ring = exp(-pow((d - 1.06) / 0.05, 2.0)) * 1.6;
    float arc = smoothstep(1.02, 1.12, d) * smoothstep(1.75, 1.2, d) * pow(abs(dir.y), 0.7);
    arc *= 0.75 + 0.25 * sin(atan(c.y, c.x) * 9.0 - time * 3.0);
    float glowv = exp(-(d - 1.0) * 1.8) * 0.35 * step(1.0, d);
    float dop = 0.75 + 0.35 * dir.x;
    vec3 col = vec3(1.0, 0.88, 0.7) * ring + vec3(1.0, 0.65, 0.3) * arc * dop * 1.3 + vec3(1.0, 0.7, 0.45) * glowv;
    float a = clamp(ring + arc * 0.9 + glowv, 0.0, 1.0) * step(0.98, d) * power;
    gl_FragColor = vec4(col * a * 1.8, a);
  }`;

export function makeBlackHole() {
  const group = new THREE.Group(); group.name = 'gargantua';
  const U = { time: { value: 0 }, power: { value: 1 } };
  const noRay = (m) => { m.userData.noRay = true; m.userData.noOutline = true; m.userData.keepMat = true; m.raycast = () => {}; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; return m; };
  const horizon = noRay(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: HORIZON_FRAG })));
  group.add(horizon);
  const tilt = new THREE.Group(); tilt.rotation.set(0.22, 0, 0.12); group.add(tilt);
  const diskGeo = new THREE.PlaneGeometry(7, 7); diskGeo.rotateX(-Math.PI / 2);
  const disk = noRay(new THREE.Mesh(diskGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: DISK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })));
  disk.renderOrder = 8;
  tilt.add(disk);
  const halo = noRay(new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  halo.renderOrder = 9;
  // 光晕永远正对着镜头
  halo.onBeforeRender = (r, s, cam) => { halo.quaternion.copy(cam.quaternion); if (halo.parent) { halo.parent.getWorldQuaternion(_q).invert(); halo.quaternion.premultiply(_q); } halo.updateMatrixWorld(); };
  group.add(halo);
  return {
    group, horizon, disk, halo, uniforms: U,
    set radius(r) { group.scale.setScalar(Math.max(1e-4, r)); },
    get radius() { return group.scale.x; },
    // timeScale：书架背后“时间停住了”的时候转得很慢
    update(dt, t) { this._t = (this._t || 0) + dt * (this.timeScale ?? 1); U.time.value = this._t; },
  };
}
const _q = new THREE.Quaternion();
