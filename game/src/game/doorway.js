// 门口的"光门"：出门时门外不再是走廊，而是一整片光——人走进光里，下一间 211 的门口也亮着同一片光，
// 人从光里走出来，门在身后自己关上、又锁上了。
//   kind：'warm' 第一章（暖白色的晨光）/ 'vortex' 第二章（紫色时空漩涡）/ 'light' 第三章（暖白色的一片雾光）/ 'forge' 第四章（熔炉一样的橘红色暖光）/ 'space' 第五章（淡蓝色光门）
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FRAG = {
  warm: /* glsl */ `
    uniform float time, power; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5; c.x *= 0.5;
      float r = length(c) * 2.0, a = atan(c.y, c.x);
      float rays = pow(abs(sin(a * 7.0 + time * 0.8)), 5.0) * 0.35 + pow(abs(sin(a * 13.0 - time * 1.3)), 9.0) * 0.25;
      vec3 col = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.98, 0.94), smoothstep(0.85, 0.0, r));
      float alpha = smoothstep(1.1, 0.2, r) + rays * smoothstep(1.2, 0.3, r);
      gl_FragColor = vec4(col * alpha * 2.0 * power, alpha * power);
    }`,
  vortex: /* glsl */ `
    uniform float time, power; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5; c.x *= 0.5;
      float r = length(c) * 2.0, a = atan(c.y, c.x);
      float sw = sin(a * 5.0 + r * 14.0 - time * 5.0) * 0.5 + 0.5;
      vec3 col = mix(vec3(0.35, 0.2, 1.0), vec3(0.3, 1.0, 0.95), sw);
      col = mix(col, vec3(1.0), smoothstep(0.35, 0.0, r));
      float alpha = smoothstep(1.0, 0.55, r) * (0.75 + 0.25 * sw);
      gl_FragColor = vec4(col * alpha * 1.6 * power, alpha * power);
    }`,
  light: /* glsl */ `
    uniform float time, power; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5; c.x *= 0.5;
      float r = length(c) * 2.0, a = atan(c.y, c.x);
      float rays = pow(abs(sin(a * 8.0 + time * 0.6)), 6.0) * 0.15;
      vec3 col = mix(vec3(1.0, 0.86, 0.66), vec3(1.0, 0.97, 0.9), smoothstep(0.8, 0.0, r));
      float alpha = smoothstep(1.05, 0.3, r) + rays * smoothstep(1.2, 0.4, r);
      gl_FragColor = vec4(col * alpha * 2.0 * power, alpha * power);
    }`,
  // 第四章：门外是熔炉那样的一片橘红色的暖光，风雪被光吹得一道道往外飘，火星往上飞
  forge: /* glsl */ `
    uniform float time, power; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; c.x *= 0.5;
      float r = length(c) * 2.0, a = atan(c.y, c.x);
      float rays = pow(abs(sin(a * 6.0 + time * 0.5)), 6.0) * 0.3;
      vec3 col = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.93, 0.78), smoothstep(0.85, 0.0, r));
      // 风雪：斜着往外飘的一道道白
      vec2 sp = vec2(vUv.x * 18.0 + time * 1.3, vUv.y * 6.0 + time * 0.4);
      float snow = step(0.93, h(floor(sp))) * smoothstep(0.2, 0.9, r);
      // 火星：往上飘的小亮点
      vec2 ep = vec2(vUv.x * 30.0, vUv.y * 14.0 - time * 1.6);
      float ember = step(0.97, h(floor(ep))) * smoothstep(0.1, 0.6, r);
      col += vec3(0.9, 0.95, 1.0) * snow * 0.6 + vec3(1.0, 0.6, 0.2) * ember;
      float alpha = smoothstep(1.05, 0.25, r) + rays * smoothstep(1.2, 0.35, r);
      gl_FragColor = vec4(col * alpha * 2.0 * power, alpha * power);
    }`,
  space: /* glsl */ `
    uniform float time, power; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5; c.x *= 0.5;
      float r = length(c) * 2.0, a = atan(c.y, c.x);
      float rays = pow(abs(sin(a * 10.0 - time * 2.0)), 8.0) * 0.5;
      vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), smoothstep(0.8, 0.0, r));
      float alpha = smoothstep(1.05, 0.25, r) + rays * smoothstep(1.2, 0.35, r);
      gl_FragColor = vec4(col * alpha * 2.0 * power, alpha * power);
    }`,
};
// 光门后面那层不透明的底色（挡住门外的走廊），和照进屋里的灯光颜色
const TINT = {
  warm: ['#fff3dc', '#ffe8c0'], vortex: ['#d8ccff', '#9a7aff'], light: ['#fff2dc', '#ffe2b8'], forge: ['#ffd8a8', '#ffb070'], space: ['#e2f4ff', '#cfe8ff'],
};
// 贴着门洞往屋里撒的一片光（墙上的光晕、地上的光斑）
const HALO_FRAG = /* glsl */ `
  uniform vec3 color; uniform float power; varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * vec2(1.6, 1.0);
    float a = smoothstep(0.5, 0.1, length(c)) * 0.35 * power;
    gl_FragColor = vec4(color * a, a);
  }`;
const SPILL_FRAG = /* glsl */ `
  uniform vec3 color; uniform float power; varying vec2 vUv;
  void main() {
    float along = clamp(vUv.x, 0.0, 1.0), across = clamp(vUv.y, 0.0, 1.0);
    float a = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.25, across) * smoothstep(1.0, 0.75, across) * 0.45 * power;
    gl_FragColor = vec4(color * a, a);
  }`;

const noRay = (m) => { m.userData.noRay = true; m.userData.noOutline = true; m.userData.keepMat = true; m.raycast = () => {}; m.castShadow = false; m.receiveShadow = false; return m; };

// 在门洞里放一片光。返回 { power }：0 = 看不见，1 = 全亮（门外被光完全挡住）
export function addDoorLight(g, kind = 'warm') {
  const R = g.refs, D = R.door;
  if (R.doorLight) R.doorLight.remove();
  const [back, spill] = TINT[kind] || TINT.warm;
  const group = new THREE.Group(); group.name = 'doorLight';
  const dz = D.z;
  const U = { time: { value: 0 }, power: { value: 0 } };
  // 最外层：一整块发光的底色，把门外的走廊 / 太空完全挡住
  const backMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(back).multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
  const backM = noRay(new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.2), backMat));
  backM.position.set(-1.955, 1.08, dz); backM.rotation.y = Math.PI / 2;
  group.add(backM);
  // 中间：每章自己的光门图案
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG[kind] || FRAG.warm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const portal = noRay(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.1), mat));
  portal.position.set(-1.9, 1.03, dz); portal.rotation.y = Math.PI / 2; portal.renderOrder = 4;
  group.add(portal);
  // 屋里这一面：墙上的光晕 + 地上从门口铺进来的一道光
  const hU = { color: { value: new THREE.Color(spill) }, power: U.power };
  const addMat = (frag) => new THREE.ShaderMaterial({ uniforms: hU, vertexShader: VERT, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = noRay(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.9), addMat(HALO_FRAG)));
  halo.position.set(-1.785, 1.1, dz); halo.rotation.y = Math.PI / 2; halo.renderOrder = 4;
  group.add(halo);
  const sg = new THREE.BufferGeometry();
  // 从门洞（x=-1.8，宽 0.76）往屋里（+x）铺 1.6m，越往里越宽、越淡
  sg.setAttribute('position', new THREE.Float32BufferAttribute([-1.8, 0.004, dz - 0.38, -1.8, 0.004, dz + 0.38, -0.2, 0.004, dz + 0.55, -0.2, 0.004, dz - 0.75], 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
  sg.setIndex([0, 2, 1, 0, 3, 2]);
  const spillM = noRay(new THREE.Mesh(sg, addMat(SPILL_FRAG)));
  spillM.renderOrder = 4;
  group.add(spillM);
  R.root.add(group);
  // 借走廊那盏灯把门口照亮（临时加灯会让所有材质重新编译，卡一下）
  const lamp = R.lights.corridor;
  if (lamp) { lamp.color.set(spill); lamp.position.set(-2.05, 1.6, dz); }
  const L = {
    kind, group,
    get power() { return U.power.value; },
    set power(v) {
      U.power.value = v;
      backMat.opacity = Math.min(1, v * 1.4);
      group.visible = v > 0.002;
      if (lamp) lamp.intensity = 3 * Math.min(v, 1.6);
    },
    remove() {
      group.parent && group.parent.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      if (lamp) lamp.intensity = 0;
      const i = R.updaters.indexOf(upd);
      if (i >= 0) R.updaters.splice(i, 1);
      if (R.doorLight === L) R.doorLight = null;
    },
  };
  const upd = (dt, t) => { U.time.value = t; };
  R.updaters.push(upd);
  R.doorLight = L;
  L.power = 0;
  return L;
}
