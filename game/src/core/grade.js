// 调色 + 转场后处理：每一章有自己的"滤镜"（废墟：泛黄老胶片；卡通：高饱和暖色），
// 章节之间的"时空穿越"转场也在这里做：画面旋涡扭曲 + 色散 + 径向模糊 + 闪白。
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    brightness: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    sepia: { value: 0 },
    vignette: { value: 0 },
    grain: { value: 0 },
    scratch: { value: 0 },
    aberration: { value: 0 },
    warp: { value: 0 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    speed: { value: 0 },
    speedColor: { value: new THREE.Color(1, 1, 1) },
    aspect: { value: 1 },
    lowTint: { value: new THREE.Color(1, 1, 1) },
    highTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, saturation, contrast, brightness, sepia, vignette, grain, scratch, aberration, warp, flash, aspect, speed;
    uniform vec3 tint, flashColor, speedColor, lowTint, highTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 sampleAb(vec2 uv, vec2 dir, float ab) {
      return vec3(texture2D(tDiffuse, uv + dir * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * ab).b);
    }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      c.x *= aspect;
      float r = length(c);
      // 时空旋涡：越靠近中心转得越多，同时往中心吸
      if (warp > 0.001) {
        float w = warp * warp;
        float ang = w * 7.0 * (1.0 - smoothstep(0.0, 0.9, r)) + sin(time * 3.0 + r * 12.0) * 0.08 * warp;
        float s = sin(ang), co = cos(ang);
        c = mat2(co, -s, s, co) * c;
        c *= 1.0 - w * 0.45 * (1.0 - smoothstep(0.0, 0.8, r));
        c.x /= aspect;
        uv = c + 0.5;
        c.x *= aspect;
      }
      vec2 dir = normalize(c + 1e-5) * min(r, 0.8);
      float ab = aberration + warp * 0.035;
      vec3 col = sampleAb(uv, dir, ab);
      // 径向模糊（转场时）
      if (warp > 0.01) {
        vec3 acc = col;
        for (int i = 1; i < 6; i++) {
          float k = float(i) / 6.0 * warp * 0.12;
          acc += sampleAb(uv - (uv - 0.5) * k, dir, ab);
        }
        col = acc / 6.0;
        col += vec3(0.55, 0.35, 1.0) * warp * warp * 0.35 * (1.0 - smoothstep(0.0, 0.7, r));
      }
      // 调色
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      vec3 sep = vec3(l) * vec3(1.12, 0.96, 0.72);
      col = mix(col, sep, sepia);
      col = (col - 0.5) * contrast + 0.5 + brightness;
      col *= tint;
      // 分离色调：暗部一种颜色、亮部一种颜色（电影里常见的"青橙"）
      col *= mix(lowTint, highTint, smoothstep(0.05, 0.75, l));
      // 暗角
      col *= 1.0 - vignette * smoothstep(0.3, 0.95, r);
      // 老胶片：竖向划痕 + 帧闪烁
      if (scratch > 0.001) {
        float fr = floor(time * 18.0);
        float sx = hash(vec2(fr, 1.7));
        float line = smoothstep(0.0009, 0.0, abs(vUv.x - sx)) * step(0.72, hash(vec2(fr, 9.1)));
        float sx2 = hash(vec2(fr, 4.3));
        line += smoothstep(0.0006, 0.0, abs(vUv.x - sx2)) * step(0.85, hash(vec2(fr, 2.2))) * 0.7;
        col = mix(col, vec3(0.92, 0.86, 0.72), line * scratch * 0.35);
        col *= 1.0 - scratch * 0.06 * hash(vec2(fr, 3.3));
        // 灰点
        float d = hash(floor(vUv * vec2(320.0, 180.0)) + fr);
        col = mix(col, vec3(0.08, 0.06, 0.05), step(0.9993, d) * scratch);
      }
      // 动画的"集中线"：从画面四周往中心射的细线，每秒换十几次
      if (speed > 0.001) {
        float a = atan(c.y, c.x) / 6.2831853 + 0.5;
        float fr = floor(time * 14.0);
        float cell = floor(a * 180.0);
        float h1 = hash(vec2(cell, fr));
        float w = abs(fract(a * 180.0) - 0.5) * 2.0;
        float inner = 0.3 + hash(vec2(cell, fr + 7.0)) * 0.28;
        float line = step(0.55, h1) * (1.0 - smoothstep(0.0, 0.35 + h1 * 0.4, w)) * smoothstep(inner, inner + 0.3, r);
        col = mix(col, speedColor, clamp(line * speed, 0.0, 1.0) * 0.85);
      }
      // 颗粒
      if (grain > 0.001) col += grain * (hash(vUv * vec2(1733.0, 977.0) + fract(time * 7.13)) - 0.5);
      col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// 各章节的滤镜参数
export const GRADES = {
  normal: { saturation: 1, contrast: 1, brightness: 0, tint: [1, 1, 1], sepia: 0, vignette: 0, grain: 0, scratch: 0, aberration: 0 },
  ruin: { saturation: 0.72, contrast: 1.08, brightness: -0.015, tint: [1.04, 0.97, 0.86], sepia: 0.32, vignette: 0.55, grain: 0.07, scratch: 1, aberration: 0.0025 },
  // 雨林：暴雨夜——暗部偏青绿、亮部（钨丝灯、马灯）偏琥珀，压饱和，胶片颗粒 + 较重的暗角
  jungle: { saturation: 0.86, contrast: 1.12, brightness: -0.01, tint: [1, 1, 1], sepia: 0, vignette: 0.58, grain: 0.055, scratch: 0, aberration: 0.0012, lowTint: [0.88, 1.03, 1.0], highTint: [1.08, 1.0, 0.86] },
  // 太空舱：写实电影感——暗部偏青、亮部偏暖，压一点饱和，胶片颗粒 + 暗角 + 一丝镜头色散
  space: { saturation: 0.88, contrast: 1.1, brightness: -0.012, tint: [1, 1, 1], sepia: 0, vignette: 0.52, grain: 0.05, scratch: 0, aberration: 0.0014, lowTint: [0.9, 1.02, 1.05], highTint: [1.06, 1.0, 0.9] },
  // 结局：阳光明媚的征兵报到现场
  finale: { saturation: 1.1, contrast: 1.05, brightness: 0.0, tint: [1.04, 1.0, 0.95], sepia: 0, vignette: 0.3, grain: 0.012, scratch: 0, aberration: 0 },
};
const NEUTRAL3 = [1, 1, 1];

// 低画质不走后处理，用 CSS 滤镜凑个近似的色调
export const CSS_GRADES = {
  normal: '',
  ruin: 'sepia(0.38) saturate(0.8) contrast(1.08)',
  jungle: 'saturate(0.86) contrast(1.12) brightness(0.96)',
  space: 'saturate(0.88) contrast(1.1) brightness(0.97)',
  finale: 'saturate(1.1) contrast(1.05)',
};

export class GradePass extends ShaderPass {
  constructor() {
    super(GradeShader);
    this.set('normal', true);
  }
  set(name, instant = false) {
    const g = GRADES[name] || GRADES.normal;
    this.target = { lowTint: NEUTRAL3, highTint: NEUTRAL3, ...g };
    if (instant) this.cur = { ...this.target, tint: [...g.tint], lowTint: [...this.target.lowTint], highTint: [...this.target.highTint] };
  }
  get warp() { return this.uniforms.warp.value; }
  set warp(v) { this.uniforms.warp.value = v; }
  get flash() { return this.uniforms.flash.value; }
  set flash(v) { this.uniforms.flash.value = v; }
  get speed() { return this.uniforms.speed.value; }
  set speed(v) { this.uniforms.speed.value = v; }
  update(dt, t, aspect) {
    const k = 1 - Math.exp(-dt * 2.5);
    const U = this.uniforms, c = this.cur, g = this.target;
    for (const key of ['saturation', 'contrast', 'brightness', 'sepia', 'vignette', 'grain', 'scratch', 'aberration']) {
      c[key] += (g[key] - c[key]) * k;
      U[key].value = c[key];
    }
    for (let i = 0; i < 3; i++) {
      c.tint[i] += (g.tint[i] - c.tint[i]) * k;
      c.lowTint[i] += (g.lowTint[i] - c.lowTint[i]) * k;
      c.highTint[i] += (g.highTint[i] - c.highTint[i]) * k;
    }
    U.tint.value.setRGB(c.tint[0], c.tint[1], c.tint[2]);
    U.lowTint.value.setRGB(c.lowTint[0], c.lowTint[1], c.lowTint[2]);
    U.highTint.value.setRGB(c.highTint[0], c.highTint[1], c.highTint[2]);
    U.time.value = t;
    U.aspect.value = aspect;
    // 全部参数都是中性时整个 pass 跳过，不浪费一次全屏绘制
    const neutral = Math.abs(c.saturation - 1) < 0.005 && Math.abs(c.contrast - 1) < 0.005 && Math.abs(c.brightness) < 0.002 && c.sepia < 0.005 && c.vignette < 0.005
      && c.grain < 0.002 && c.scratch < 0.01 && c.aberration < 0.0002 && U.warp.value < 0.001 && U.flash.value < 0.001 && U.speed.value < 0.001
      && Math.abs(c.tint[0] - 1) + Math.abs(c.tint[1] - 1) + Math.abs(c.tint[2] - 1) < 0.01
      && [0, 1, 2].every((i) => Math.abs(c.lowTint[i] - 1) < 0.004 && Math.abs(c.highTint[i] - 1) < 0.004);
    this.enabled = !neutral;
  }
}
