// 第四章隐藏任务线："书架背后的幽灵"（致敬《星际穿越》）
//   ① 玩一会儿之后，资料库里自己飘出来一张索引卡：INDEX 001「引力异常 → 信息接收站 · 频道 211」（笔迹和我一模一样）
//   ② 信息接收站切到频道 211：一段来源不明的摩尔斯电码，时间戳是考试前一天夜里 02:47，解码出 INDEX 002：储藏室 · 货柜 G 的授权码
//   ③ 打开货柜 G：里面约束着一颗微型黑洞"卡冈图雅"。凑近去看——失重里刹不住，胳膊肘撞上了控制杆……
//   ④ 从这里开始全是过场动画（两分多钟，随时可以跳过）：
//      约束失效，整艘船被宇宙一截一截地"吃掉"（全局裁剪面：切口烧得发亮，碎片被吸进越长越大的黑洞）；
//      你拼命飞回主舱，灯全灭了——黑暗里，书架上透出一缕光，越来越亮。你抽出了那本发光的《高等数学（下）》
//   ⑤ 书缝后面，是考试前一天夜里的 211：电脑前两个人在打排位，其中一个就是你自己。
//      你对着书缝大喊（他们听不见），扭头看见飞船正被一点点吞掉，转回来喊得更用力，从书架背后把三本书推了下去；
//      一个室友走过来，隔着两个背靠背的书架和你对望了一眼；
//      飞船的最后一块被吞掉的时候，电脑前的那个你回过头，好像看见了你，笑了一下
//   → 镜头慢慢拉远，一片白。开放结局
import * as THREE from 'three';
import { clamp, lerp, easeInOut, easeOut, dampAngle } from '../core/util.js';
import { PastDorm } from './pastdorm.js';
import { panelTex } from '../world/spacelook.js';
import { noClip } from '../world/fx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V(), _v2 = new THREE.Vector2();
const MORSE = { G: '--.', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const CARD = '彩蛋结局 · 书架背后的幽灵<small>那天晚上，211 的书架上掉下来三本书</small>';

// ---------------- 时间线（秒，从飞船开始被吞噬算起）----------------
const T3 = 25.6; // 抽出那本书：书缝后面是那天晚上的 211
const T4 = T3 + 19.4; // 大喊、回头看、推书
const T5 = T4 + 28.8; // 隔着书架对望
const T6 = T5 + 18.4; // 最后一块被吞掉 → 白
const T_END = T6 + 33;
// 能留下来的只有一个盒子：南（z 上限）、北（z 下限）、东（x 上限）、下（y 下限）、上（y 上限）
const KF = {
  s: [[0, 6.45], [2.4, 6.15], [5, 5.35], [8, 4.4], [12, 3.75], [18, 3.3], [T3, 3.0], [T4, 2.45], [T4 + 14, 1.75], [T5, 1.1], [T6, 0.45], [T6 + 9, -0.2], [T6 + 16, -0.78]],
  e: [[0, 1.95], [T3, 1.95], [T4, 1.6], [T5, 0.8], [T6, 0.25], [T6 + 16, -0.35]],
  n: [[0, -3.75], [T4, -3.75], [T5, -3.2], [T6, -2.6], [T6 + 16, -1.36]],
  b: [[0, -0.5], [T5, -0.5], [T6, -0.3], [T6 + 15, 0.08]],
  t: [[0, 3.6], [T5, 3.6], [T6, 3.25], [T6 + 15, 2.3]],
  bhR: [[0, 0.05], [3, 0.14], [6, 0.32], [12, 0.85], [T3, 1.6], [T5, 2.4], [T6 + 16, 3.4]],
  bhX: [[0, -1.05], [6, -0.8], [14, -0.2], [T3, 0.4]],
  bhY: [[0, 0.95], [14, 1.3], [T3, 1.5]],
  bhZ: [[0, 6.1], [6, 7.6], [14, 10], [T3, 12], [T6 + 16, 14]],
};
function kf(arr, t) {
  if (t <= arr[0][0]) return arr[0][1];
  for (let i = 1; i < arr.length; i++) {
    const [t1, v1] = arr[i];
    if (t <= t1) { const [t0, v0] = arr[i - 1]; return lerp(v0, v1, (t - t0) / (t1 - t0)); }
  }
  return arr[arr.length - 1][1];
}
const SHIP = { x0: -1.95, x1: 1.95, y0: -0.05, y1: 3.1, z0: -3.75, z1: 6.5 }; // 整艘船（含驾驶舱、储藏室）的外包围盒

// ---------------- 切口：所有内置材质共用的裁剪片段里加一段"烧得发亮的边" ----------------
// 只在开了裁剪面（也就是太空舱）时生效：离切面几厘米之内的地方加一圈白热 → 橙红的光，边上一粒一粒的火星
THREE.ShaderChunk.clipping_planes_pars_fragment += /* glsl */ `
#if NUM_CLIPPING_PLANES > 0
	float clipEdgeGlow = 0.0;
	float clipEdgeSeed = 0.0;
#endif
`;
THREE.ShaderChunk.clipping_planes_fragment += /* glsl */ `
#if NUM_CLIPPING_PLANES > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_CLIPPING_PLANES; i ++ ) {
		plane = clippingPlanes[ i ];
		clipEdgeGlow = max( clipEdgeGlow, 1.0 - smoothstep( 0.0, 0.05, plane.w - dot( vClipPosition, plane.xyz ) ) );
		clipEdgeSeed += plane.w;
	}
	#pragma unroll_loop_end
#endif
`;
THREE.ShaderChunk.opaque_fragment += /* glsl */ `
#if NUM_CLIPPING_PLANES > 0
	if ( clipEdgeGlow > 0.001 ) {
		vec3 cwp = transpose( mat3( viewMatrix ) ) * ( - vClipPosition - viewMatrix[ 3 ].xyz );
		float cn = fract( sin( dot( floor( cwp * 42.0 ) + floor( clipEdgeSeed * 6.0 ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
		float ce = clipEdgeGlow * clipEdgeGlow;
		gl_FragColor.rgb += mix( vec3( 1.0, 0.42, 0.12 ), vec3( 1.0, 0.9, 0.72 ), ce * ce ) * ce * ( 0.35 + 2.6 * cn * cn ) * 2.4;
	}
#endif
`;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const VERT_W = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
// 书架背板上的"窗口"：按屏幕坐标去取另一个时空那一帧（同一个镜头画的），边缘一圈暖光、轻微的引力透镜扭曲；
// 抽书之前只是一片从书缝里漏出来的暖光（glow）
const PORTAL_FRAG = /* glsl */ `
  uniform sampler2D tPast; uniform vec2 res; uniform float power, glow, time;
  varying vec2 vUv;
  void main() {
    vec2 uv = gl_FragCoord.xy / res;
    float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    uv += vec2(sin(uv.y * 90.0 + time * 3.0), cos(uv.x * 80.0 - time * 2.0)) * 0.0012 * (1.0 - smoothstep(0.0, 0.25, e));
    vec3 col = vec3(0.0);
    if (power > 0.001) col = texture2D(tPast, uv).rgb * power;
    col += vec3(1.0, 0.82, 0.55) * (1.0 - smoothstep(0.0, 0.05, e)) * 0.5 * power;
    float flick = 0.86 + 0.14 * sin(time * 6.0 + vUv.x * 9.0);
    col += vec3(1.0, 0.86, 0.62) * glow * flick * (0.45 + 0.9 * (1.0 - smoothstep(0.0, 0.5, e)));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// 时空的"切面"：一整面碎玻璃一样的裂纹（按世界坐标切格子，切面怎么缩放都一样密），裂缝里透着光
const RIFT_FRAG = /* glsl */ `
  uniform float time, power; uniform vec3 ax, ay; varying vec2 vUv; varying vec3 vW;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vec2(dot(vW, ax), dot(vW, ay)) * 2.3;
    vec2 ip = floor(p), fp = fract(p);
    float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + vec2(h(ip + o), h(ip + o + 17.0)) * (0.8 + 0.2 * sin(time * 0.7 + h(ip + o) * 6.28)) - fp;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = ip + o; } else if (d < d2) d2 = d;
    }
    float edge = 1.0 - smoothstep(0.0, 0.05, sqrt(d2) - sqrt(d1));
    float flick = 0.45 + 0.55 * sin(time * 7.0 + h(id) * 6.28);
    vec3 col = mix(vec3(0.45, 0.85, 1.0), vec3(1.0, 0.7, 0.38), h(id + 3.0));
    float shimmer = 0.05 * (0.6 + 0.4 * sin(p.x * 2.1 + time * 0.9) * sin(p.y * 1.7 - time * 0.6));
    float a = (edge * flick * 0.5 + shimmer) * power;
    gl_FragColor = vec4(col * a * 1.8, a);
  }`;
// 书缝里透出来的一缕光：越往外越宽、越淡，里面有灰尘在慢慢飘；面片侧对着镜头时淡掉（不然会变成一道亮线）
const BEAM_VERT = 'varying vec2 vUv; varying float vFace; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }';
const BEAM_FRAG = /* glsl */ `
  uniform float power, time; varying vec2 vUv; varying float vFace;
  void main() {
    float along = clamp(vUv.x, 0.0, 1.0), across = clamp(vUv.y, 0.0, 1.0);
    float c = abs(across - 0.5) * 2.0;
    float core = exp(-c * c * 4.5);
    float fall = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.03, along);
    float motes = 0.8 + 0.2 * sin(along * 41.0 - time * 0.8 + across * 13.0) * sin(along * 23.0 + time * 0.5 - across * 7.0);
    float a = clamp(power * core * fall * motes * 2.2 * smoothstep(0.08, 0.45, vFace), 0.0, 6.0);
    gl_FragColor = vec4(vec3(1.0, 0.84, 0.6) * a, a);
  }`;

const noRay = (m) => { m.userData.noRay = true; m.userData.noOutline = true; m.userData.keepMat = true; m.raycast = () => {}; m.castShadow = false; m.receiveShadow = false; return m; };

export class Secret {
  constructor(g, CH) {
    this.g = g; this.CH = CH;
    // 0 什么都没发生 / 1 索引卡飘出来了 / 2 读过索引卡 / 2.5 正在解码 / 3 频道 211 解码 / 4 货柜 G 开了
    // 4.5 撞上控制杆 / 5 飞船被吞噬（过场）/ 6 书架背后（过场）/ 7 结局
    this.stage = 0;
    this.code = [1 + Math.floor(g.rnd() * 9), Math.floor(g.rnd() * 10), Math.floor(g.rnd() * 10)].join('');
    this.lockerOpen = false;
    // 全局裁剪面（能留下来的只有一个盒子）：从这一章一开始就挂上（离得远远的，什么也不切），
    // 这样着色器一开始就按"有 5 个裁剪面"编译好，坍缩时不会卡
    this.box = { s: 1000, n: -1000, e: 1000, b: -1000, t: 1000 };
    this.prev = { ...this.box };
    this.planes = { s: new THREE.Plane(V(0, 0, -1), 1000), n: new THREE.Plane(V(0, 0, 1), 1000), e: new THREE.Plane(V(-1, 0, 0), 1000), b: new THREE.Plane(V(0, 1, 0), 1000), t: new THREE.Plane(V(0, -1, 0), 1000) };
    g.gfx.renderer.clippingPlanes = Object.values(this.planes);
    const R = g.refs, G = R.gear;
    this.A = G.archive; this.St = G.storage; this.BH = G.blackHole;
    this.tz = this.A.target.home.z;
    this.bhHome = this.BH.group.position.clone();
    this.card = null; this.jolt = 0; this.glow = 0;
    // 那本书的材质单独拿出来，好让它发光
    this.bookMats = [];
    this.A.target.group.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material && o.material.emissive) { o.material = o.material.clone(); this.bookMats.push(o.material); } });
    // 查看那本书的时候好瞄准：书外面套一个看不见的大一点的碰撞盒
    const tg = this.A.target;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, tg.h / 2, 0); hit.userData.iid = 'gBook';
    tg.group.add(hit);
    g.rayTargets && g.rayTargets.push(hit);
    // 时空的切面：南、北、东、下、上五面
    this.riftT = { value: 0 };
    this.rifts = {};
    for (const k of Object.keys(this.box)) {
      const U = { time: this.riftT, power: { value: 0 }, ax: { value: V(1, 0, 0) }, ay: { value: V(0, 1, 0) } };
      const m = noRay(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_W, fragmentShader: RIFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })));
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false;
      R.root.add(m);
      this.rifts[k] = { m, U };
    }
    // 书缝里透出来的那一缕光
    this.beam = this._makeBeam();
    R.root.add(this.beam.group);
    // 碎片：从切口上剥落下来，打着转被吸进黑洞（两种材质各一个实例化网格，一次绘制）
    this.debris = this._makeDebris();
    for (const im of this.debris.meshes) R.root.add(im);
    this.past = null; this.portal = null;
    this.viewPast = false;
    this.seqOn = false;
    this.leak = 0;
    this.BH.timeScale = 1; this.BH.agitate = 1;
  }

  _makeBeam() {
    const U = { power: { value: 0 }, time: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const group = new THREE.Group();
    const L = 2.5, w0 = 0.05, w1 = 0.7;
    for (const vert of [true, false]) {
      const geo = new THREE.BufferGeometry();
      const P = vert ? [0, -w0 / 2, 0, 0, w0 / 2, 0, L, w1 / 2, 0, L, -w1 / 2, 0] : [0, 0, -w0 / 2, 0, 0, w0 / 2, L, 0, w1 / 2, L, 0, -w1 / 2];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      const m = noRay(new THREE.Mesh(geo, mat)); m.renderOrder = 7; m.frustumCulled = false;
      group.add(m);
    }
    group.position.set(-1.47, 1.8, this.tz);
    group.rotation.z = -0.1;
    group.visible = false;
    return { group, U };
  }
  _makeDebris() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mats = [
      noClip(new THREE.MeshStandardMaterial({ color: '#9aa096', roughness: 0.55, metalness: 0.3, map: panelTex(1) })),
      noClip(new THREE.MeshStandardMaterial({ color: '#34383a', roughness: 0.42, metalness: 0.75 })),
    ];
    const N = 40;
    const meshes = mats.map((m) => {
      const im = noRay(new THREE.InstancedMesh(geo, m, N));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.frustumCulled = false;
      return im;
    });
    const items = [];
    for (let i = 0; i < N * 2; i++) items.push({ alive: false, kind: i % 2, p: V(), v: V(), q: new THREE.Quaternion(), axis: V(0, 1, 0), w: 0, size: V(), life: 0 });
    return { meshes, items, acc: 0 };
  }

  // ================== 交互 ==================
  handlers() {
    return {
      indexCard: { label: '索引卡', verb: '拿起来看', act: () => this.readCard() },
      lockerG: { label: '货柜 G', verb: () => (this.lockerOpen ? '查看' : '打开'), act: () => this.onLocker() },
      gargantua: { label: '卡冈图雅 · 微型黑洞', verb: () => (this.stage === 4 ? '凑近看看' : '查看'), reach: false, act: () => this.touch() },
      gBook: { label: '《高等数学（下）》', verb: '查看', act: () => this.onBook() },
      shelf: { label: '资料库', verb: '查看', reach: false, act: () => this.onShelf() },
    };
  }
  hint() {
    if (this.stage === 4) return '……货柜 G 里的装置，最好别碰。（碰了会怎样呢？）';
    return null;
  }

  onShelf() {
    const g = this.g;
    g.say(this.stage >= 1 ? '资料库……顶上那盒索引卡里，刚才自己飘出来一张。书也时不时地在抖。' : '资料库：每一本书都拿松紧带勒着，不然全飘走了。顶上还有一盒索引卡。', 3.6);
  }
  onBook() {
    const g = this.g;
    if (this.stage >= 5) return;
    g.say(this.stage >= 1 ? '《高等数学（下）》……它在自己轻轻地发抖？' : '《高等数学（下）》……到了太空也躲不掉。', 3);
  }

  // ① 索引卡自己飘出来
  cardFalls() {
    const g = this.g, c = this.A.card;
    this.stage = 1;
    c.visible = true;
    this.card = { t: 0, p0: c.position.clone(), p1: V(-1.2, 1.95, -0.95) };
    g.audio.chime(); g.audio.rumble(1.4, 0.2);
    this.jolt = 1.4;
    const near = g.camera.position.distanceTo(V(-1.5, 1.7, -1.07)) < 3.8;
    if (near) g.after(0.8, () => g.say('……？资料库里有张卡片自己飘出来了？', 3));
    else g.ui.toast('资料库那边好像有什么东西飘了出来……', '', '📚');
    if (g.refs.robot.state === 'follow') g.after(3.6, () => { g.refs.robot.talkT = 3; g.ui.subtitle('检测到微弱的引力扰动……来源：资料库？奇怪，那边什么都没有啊。', 3.4, '小圆（机器人）'); });
  }
  readCard() {
    const g = this.g;
    this.A.card.visible = false;
    this.card = null;
    if (this.stage < 2) this.stage = 2;
    g.audio.paper();
    const node = g.ui.doc({
      title: '索引卡', variant: 'plain',
      html: `<div style="font:bold 15px monospace;color:#888">INDEX · 001</div><div style="font-size:20px;line-height:1.8;margin:6px 0">引力异常 → 信息接收站 · <b style="color:#c0392b">频道 211</b></div><div style="color:#888">卡片背面，一行歪歪扭扭的小字：<br>"如果你看到了这张卡——去听听那个频道。"</div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    g.clue('idx1', '🕳️ 隐藏线索 · 索引卡 001：引力异常 → <b>信息接收站 · 频道 211</b>');
    g.after(0.5, () => g.say('这笔迹……怎么跟我的一模一样？', 3));
  }

  // ② 信息接收站 · 频道 211（返回 true 表示接管了接收站的界面）
  stationChannel() {
    if (this.stage < 2) return false;
    const g = this.g, S = g.S;
    g.audio.robotBeep(2, 1200);
    const pat = ['G', ...this.code].map((c) => MORSE[c]).join(' ');
    const pulses = pat.replace(/\./g, '▪').replace(/-/g, '▬');
    const night = `2026-${String(S.month).padStart(2, '0')}-${String(S.day - 1).padStart(2, '0')}`;
    const decoded = `解码结果：<b>INDEX · 002</b> → 储藏室 · 货柜 G · 授权码 <b style="font-size:24px;color:#c0392b;letter-spacing:4px">${this.code}</b>`;
    const node = g.ui.doc({
      title: '信息接收站 · 频道 211', variant: 'plain',
      html: `<div style="line-height:1.8">信号来源：<b>不明</b>（方位：本舱内部……资料库？）<br>时间戳：<b style="color:#c0392b">${night} · 02:47</b>（？？）<div style="font:bold 22px monospace;letter-spacing:4px;margin:10px 0;color:#2a6fd8">${pulses}</div><div class="dec">${this.stage >= 3 ? decoded : '自动解码中……'}</div></div>`,
    });
    g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
    if (this.stage === 2) {
      this.stage = 2.5;
      const dur = g.audio.morse(pat.replace(/ /g, '  '));
      setTimeout(() => { const d = node.querySelector('.dec'); if (d) d.innerHTML = decoded; this.decoded(night); }, Math.max(1600, dur * 1000 + 300));
      // 趁着弹窗开着，在后台把"那天晚上的 211"搭好（第一次搭会卡一下）
      setTimeout(() => { if (this.alive) this.ensurePast(); }, 150);
    }
    return true;
  }
  // 这一章还在不在（解码 / 预搭场景都是定时器触发的，玩家可能已经离开了太空舱）
  get alive() { return this.g.CH === this.CH && this.CH.secret === this && this.g.refs.gear; }
  decoded(night) {
    const g = this.g;
    if (this.stage >= 3 || !this.alive) return;
    this.stage = 3;
    g.clue('idx2', `🕳️ 隐藏线索 · INDEX 002（频道 211 解码）：储藏室 · <b>货柜 G</b> · 授权码 <b>${this.code}</b>`);
    g.after(0.3, () => g.say(`${night.slice(5).replace('-', ' 月 ')} 日 02:47……那不是考试前一天晚上吗？`, 3.6));
  }
  // 信息接收站大屏上显示的东西
  commsChannel() { return this.stage >= 2 && this.stage < 6 ? 'CH-211 · 来源不明 ⚠' : 'CH-01 · 返回舱'; }
  anomaly() { return this.stage >= 2 && this.stage < 6 ? 1 : 0; }
  commsLines(base) {
    if (this.stage < 2) return base;
    const extra = [{ text: '[??:??] CH-211：检测到来源不明的脉冲信号', color: '#ffd23f' }];
    if (this.stage >= 3) extra.push({ text: `[02:47] 解码：INDEX 002 → 货柜 G · ${this.code}`, color: '#ffd23f' });
    return [...base, ...extra];
  }

  // ③ 货柜 G
  onLocker() {
    const g = this.g;
    if (this.lockerOpen) { g.say('货柜里那颗小黑洞还在转。最好离它远一点……吧？', 3); return; }
    if (!this._lockerSeen) { this._lockerSeen = true; g.say('货柜 G……贴满了"严禁触碰"。门上有个 3 位的密码面板。', 3); }
    const box = g.ui.lock({
      n: 3, title: '货柜 G · 授权码', variant: 'holo', labels: ['G', 'G', 'G'],
      hint: this.stage >= 3 ? `频道 211 解码：<b>${this.code}</b>` : '面板上刻着一行小字："去问问那天晚上的自己"',
      onTick: () => g.audio.robotBeep(1, 1600),
      onSubmit: (c) => {
        if (c === this.code) { g.audio.unlock(); g.ui.closeModal(); this.openLocker(); return true; }
        g.audio.error(); return false;
      },
    });
    g.openModal(box);
  }
  openLocker() {
    const g = this.g, St = this.St;
    this.lockerOpen = true;
    if (this.stage < 4) this.stage = 4;
    g.audio.hiss(); g.audio.clunk();
    for (const d of St.doors) { const r0 = d.pivot.rotation.y; g.tween(1.2, (k) => (d.pivot.rotation.y = r0 - d.s * 1.9 * k), { ease: easeOut }); }
    this.BH.agitate = 2;
    g.after(1.0, () => { g.audio.sparkle(); g.say('……里面是……一个黑洞？！', 2.8); });
    g.after(1.6, () => { if (g.refs.robot.state === 'follow') { g.refs.robot.talkT = 3.4; g.refs.robot.emote.show('!', 1.6); g.ui.subtitle('那是"卡冈图雅"！实验用的微型奇点！千、千万别碰那个控制杆！', 3.4, '小圆（机器人）'); } });
    g.after(3.4, () => {
      g.audio.paper();
      const node = g.ui.doc({ title: '贴在约束球底座上的索引卡', variant: 'plain', html: `<div style="font:bold 15px monospace;color:#888">INDEX · 003</div><div style="font-size:20px;line-height:1.8;margin:6px 0">"它会带你回到那天晚上。"</div><div style="color:#888;text-align:right">—— ？</div>` });
      g.openModal(node, { closeKeys: ['Escape', 'KeyE'] });
      g.clue('idx3', '🕳️ 隐藏线索 · INDEX 003（货柜 G 里）：卡冈图雅"会带你回到那天晚上"。');
    });
  }

  // ④ 凑近去看——失重里刹不住，胳膊肘撞上了控制杆（从这里开始全是过场）
  touch() {
    const g = this.g, St = this.St;
    if (this.stage !== 4) { g.say(this.stage >= 5 ? '……' : '那颗小黑洞还在约束球里转。', 2.4); return; }
    this.stage = 4.5;
    this.cutStart();
    this.ensurePast();
    g._showSkip(() => this.skip());
    const after = (t, fn) => g.after(t, () => { if (this.stage === 4.5 && !this.skipped) fn(); });
    // 人飘到装置左前方（镜头在右边，别被自己挡住），身子放低一点，手和装置差不多高
    g.ctrl.pos.y = 0.08;
    g.auto = { path: [V(-1.3, 0, 5.48)], speed: 0.7, i: 0 };
    g._afterReach = () => { const y0 = g.ctrl.charYaw; g.tween(0.5, (k) => { g.ctrl.charYaw = y0 + (0.4 - y0) * k; g.ch.root.rotation.y = g.ctrl.charYaw; }); };
    g._cineTo(V(-0.74, 1.9, 4.95), V(-1.12, 1.12, 6.0), 1.0); // 储藏室的隔墙在 x=-0.6，镜头得在墙里面
    after(0.4, () => g.say('……好小的黑洞。吸积盘还在转，跟电影里的一模一样……', 2.8));
    after(2.6, () => { g.ch.setExpression('focus'); g._cutPose = { lookPitch: -0.45 }; g.say('再凑近一点看看……', 1.6); });
    after(3.6, () => { g.auto = { path: [V(-1.18, 0, 5.7)], speed: 0.35, i: 0 }; g._afterReach = null; g.say('欸、欸——刹不住——', 1.4); });
    after(4.5, () => {
      g.tween(0.25, (k) => (St.lever.rotation.x = lerp(-0.5, 0.75, k)), { ease: easeOut });
      g.audio.clunk(); g.audio.crack(); g._shake(0.3);
      g.ch.setExpression('shock'); g._cutPose = { lookPitch: -0.3, lookYaw: 0.4 };
      g.ui.subtitle('咔哒。', 1.0, '');
    });
    after(5.3, () => g.say('……我、我是不是碰到了什么？', 2));
    after(6.2, () => {
      g.audio.alarm(3); g.audio.rumble(3, 0.6);
      this.BH.agitate = 7;
      this.CH._alarm = 3;
      this.CH.speedLines(g, 1.4);
      g._shake(0.5);
      g.tween(0.6, (k) => (St.glass.material.opacity = 0.16 + k * 0.6), { done: () => { St.glass.visible = false; g.audio.crack(); } });
      g.fx.emit('spark', this.bhHome.clone(), { count: 40, speed: 1.6, spread: 1.4, up: 0.5, gravity: 0, drag: 1.4, life: 1.2, size: 0.05, colors: ['#bfe8ff', '#ffffff', '#ffc860'] });
      g.audio.pa();
      g.after(0.9, () => g.ui.subtitle('【警报】卡冈图雅约束失效！时空结构正在破裂——！', 2.6, '📢 舱内广播'));
    });
    after(8.4, () => {
      // 小圆先一步冲出了储藏室
      if (g.refs.robot.state === 'follow') { g.refs.robot.talkT = 2; g.ui.subtitle('快跑——！！', 1.4, '小圆（机器人）'); }
    });
    after(9.6, () => this.begin());
  }

  // ================== 过场：飞船被吞噬 → 书架背后 → 白 ==================
  begin() {
    const g = this.g, R = g.refs;
    this.stage = 5;
    this.seqOn = true; this.T = 0; this.events = []; this.ev = 0;
    this.slow = 1; this.slowTo = null; this.power = 1; this.blackT = null; this.leak = 0; this.leakTw = null;
    this.shakeA = 0; this.rumbleT = 0.5; this.crackT = 0.3; this.sparkT = 0;
    g.cine = null; g.auto = null; g._afterReach = null; g._cutPose = null;
    this.me = { pos: g.ctrl.pos.clone(), yaw: g.ch.root.rotation.y, yawT: g.ch.root.rotation.y, speed: 0, turn: 6 };
    this.pose = { lookPitch: -0.2 };
    this.mv = null;
    // 灯的原始亮度（每帧都要按"还有没有电、还在不在"重新算）
    this.base = { cock: R.cockLight ? R.cockLight.intensity : 0, hemi: R.lights.hemi.intensity };
    // 飘着的东西 / 不受裁剪面影响的东西（水球、镜子、光柱……）：过了切面就藏起来
    this.snap = R.floaters.list;
    const skip = new Set();
    for (const o of [R.spaceSky.group, this.BH.group, this.portal, this.beam.group, ...Object.values(this.rifts).map((r) => r.m), ...this.debris.meshes].filter(Boolean)) o.traverse((c) => skip.add(c));
    this.free = [];
    R.root.traverse((o) => { if (o.isMesh && o.visible && !skip.has(o) && o.material && ((o.material.isShaderMaterial && !o.material.clipping) || o.isReflector)) this.free.push(o); });
    // 西墙外面（宿舍门外的走廊墙之类）：裁剪盒没有西边界，最后会剩下一截飘在那儿，干脆一开始就藏起来
    const bb = new THREE.Box3();
    R.root.traverse((o) => { if (o.isMesh && o.visible && o.geometry && !skip.has(o)) { bb.setFromObject(o); if (bb.max.x < SHIP.x0 - 0.05) o.visible = false; } });
    R.robot.root.visible = false; // 小圆已经冲出去了
    g.audio.stopMusic();
    g.audio.startLoop('collapse', { freq: 120, gain: 0.14 });
    g.gfx.grade.target.aberration = 0.004;
    g.S.ach.add('gargantua');
    this.script();
    this.events.sort((a, b) => a[0] - b[0]);
  }

  // 整段过场的剧本
  script() {
    const g = this.g, S = g.S, me = S.name, tz = this.tz;
    const at = (t, fn) => this.events.push([t, fn]);
    const sub = (t, text, dur, w = me) => at(t, () => g.ui.subtitle(text, dur, w));
    const who = (k) => `${S.mates['ABC'.indexOf(k)]}（那天晚上）`;
    const meThen = `${me}（那天晚上）`;
    const expr = (t, e) => at(t, () => g.ch.setExpression(e));
    // 常用机位
    const faceCam = (fov = 36, dz = 0.12) => ({ p: V(-1.4, 1.8, tz + dz), l: V(-0.98, 1.75, tz), fov, hand: 0.004 }); // 书架跟前正对着脸
    const otsCam = (fov = 44) => ({ p: V(-0.44, 1.98, tz - 0.22), l: V(-2.3, 1.72, tz + 0.02), fov, hand: 0.004 }); // 右肩后面看书缝
    const deskCam = { p: V(-3.5, 1.52, -3.42), l: V(-4.75, 1.08, -1.95), p2: V(-3.58, 1.5, -3.3), dur: 4, fov: 46, past: true };
    const meThenCam = { p: V(-5.02, 1.3, -1.98), l: V(-4.5, 1.2, -2.42), fov: 40, past: true, hand: 0.002 };

    // ======== 第二幕：飞船被一截一截地吞掉，拼命飞回主舱 ========
    at(0, () => {
      g.ch.setExpression('shock');
      // 约束球的特写：万向环还在疯转，中间那颗小黑洞一下子胀大，后面的舱壁已经没了
      this.shot({ p: V(-0.72, 1.32, 5.44), l: V(-1.05, 0.95, 6.12), p2: V(-0.84, 1.2, 5.62), dur: 1.8, fov: 52, hand: 0.008 });
      g.audio.pa(); g.ui.subtitle('【警报】舱体结构完整性 41%……37%……29%……', 2.4, '📢 舱内广播');
      g.audio.rumble(3, 0.6);
    });
    at(1.7, () => { this.shot({ p: V(-0.86, 1.62, 6.0), l: V(-1.2, 1.66, 5.6), fov: 38, hand: 0.008 }); g.audio.heartbeat(); });
    at(2.2, () => { this.me.yawT = Math.PI; this.pose = { lookYaw: 0.5 }; });
    sub(2.3, '……跑！！', 1.2);
    at(2.6, () => {
      this.move([V(-1.18, 0.08, 5.7), V(-0.95, 0.18, 5.32), V(-0.45, 0.22, 5.08), V(-0.05, 0.24, 4.8), V(0.0, 0.25, 4.2), V(0.12, 0.25, 2.9), V(0.2, 0.22, 1.3), V(0.25, 0.2, 0.45)], 6.6);
      this.pose = {};
      g.audio.whoosh();
    });
    at(3.0, () => this.shot({ p: V(1.15, 1.6, 5.1), l: V(-0.55, 1.15, 4.95), p2: V(1.0, 1.55, 4.88), l2: V(-0.1, 1.15, 4.5), dur: 2.3, fov: 55, hand: 0.01 }));
    at(5.3, () => { this.shot({ p: V(0.62, 1.45, 1.1), l: V(0.05, 1.05, 3.9), p2: V(0.66, 1.5, 0.85), dur: 2.2, fov: 50, hand: 0.01 }); g.audio.whoosh(); });
    // 在他前面倒着跟拍：迎面飞过来，身后的南墙正在一截一截地没掉
    at(7.5, () => this.shot({ fn: () => { const p = this.me.pos; return { p: _e.set(-0.58, 1.72, Math.max(-0.6, p.z - 1.15)), l: _f.set(p.x, 1.3, p.z + 0.4) }; }, fov: 50, hand: 0.008 }));
    at(9.3, () => { this.me.yawT = 0.25; });
    at(9.9, () => this.shot({ p: V(0.72, 1.78, -0.6), l: V(-0.1, 1.35, 3.8), p2: V(0.66, 1.74, -0.38), dur: 3, fov: 44, hand: 0.006 }));
    sub(10.4, '……整艘飞船……在被一截一截地吞掉……', 2.8);
    at(12.6, () => { this.blackT = this.T; g.audio.powerDown(); });
    at(13.0, () => this.shot({ p: V(0.44, 1.83, 1.2), l: V(0.25, 1.82, 0.45), fov: 36, hand: 0.004 }));
    at(13.6, () => g.ui.subtitle('【警报】主电源……失……', 1.4, '📢 舱内广播'));
    expr(14.4, 'sad');
    sub(14.8, '……没地方……可以逃了……', 2.4);
    // 黑暗里，书架上透出一缕光
    at(16.6, () => { this.shot({ p: V(-0.72, 1.92, -1.75), l: V(-1.45, 1.78, tz + 0.1), p2: V(-0.82, 1.9, -1.6), dur: 3, fov: 42, hand: 0.003 }); this.leakTo(0.4, 2.6); g.audio.chime(); });
    // 他的脸在前景，背景左边就是那个在发光的书架；他先回头，再整个人转过去
    at(19.4, () => { this.shot({ p: V(0.52, 1.86, 1.28), l: V(-0.22, 1.8, -0.32), fov: 36, hand: 0.004 }); g.ch.setExpression('focus'); });
    at(19.9, () => { this.pose = { lookYaw: -1.05, lookPitch: 0.03 }; });
    sub(20.2, '……光？', 1.4);
    at(20.7, () => { this.pose = { lookYaw: -0.3 }; this.me.yawT = -2.29; });
    at(21.3, () => {
      this.move([V(0.25, 0.2, 0.45), V(-0.2, 0.19, -0.3), V(-0.72, 0.17, -0.92), V(-0.98, 0.16, tz)], 3.4, { yaw: -Math.PI / 2 });
      this.leakTo(1, 3.4);
      this.pose = {};
      this.shot({ fn: () => { const p = this.me.pos; return { p: _e.set(Math.min(0.7, p.x + 0.95), 1.86, p.z + 0.5), l: _f.set(-1.55, 1.62, tz) }; }, fov: 46, hand: 0.006 });
    });
    sub(21.8, '书架……在发光……？', 2);
    at(24.8, () => { this.shot({ p: V(-0.78, 1.93, -1.66), l: V(-1.5, 1.76, tz + 0.04), p2: V(-0.86, 1.9, -1.55), dur: 2.6, fov: 40, hand: 0.003 }); this.pose = { reach: 1, reachPitch: 0.35 }; });
    at(T3, () => this.pullBook());

    // ======== 第三幕：书缝后面，是考试前一天晚上的 211 ========
    // 正对着两台休眠舱中间的资料库：人是个剪影，书在他周围慢慢飘
    at(T3 + 1.3, () => this.shot({ p: V(0.55, 1.95, -1.02), l: V(-1.5, 1.72, tz), p2: V(0.2, 1.9, -1.05), dur: 4.5, fov: 46, hand: 0.003 }));
    sub(T3 + 1.6, '……时间……好像变慢了……', 2.4);
    at(T3 + 4.0, () => { this.shot(faceCam(40, -0.14)); this.pose = { lookPitch: 0.02 }; });
    sub(T3 + 4.3, '……这是……？', 1.6);
    // 推进书缝：从过去那边三本书的书顶上看过去，是电脑桌那一片
    at(T3 + 5.8, () => this.shot({ p: V(-1.28, 1.9, tz + 0.02), l: V(-4.6, 1.15, -2.2), p2: V(-1.62, 1.93, -1.06), dur: 3.2, fov: 46, hand: 0.002 }));
    sub(T3 + 6.8, '……211？', 1.8);
    at(T3 + 9.2, () => this.shot({ p: V(-4.64, 2.14, -5.84), l: V(-4.82, 2.3, -6.63), p2: V(-4.72, 2.22, -6.12), dur: 2.6, fov: 34, past: true, hand: 0.002 }));
    sub(T3 + 9.5, '挂钟……02:47。考试前一天晚上……', 2.6);
    at(T3 + 12.0, () => this.shot(deskCam));
    sub(T3 + 12.4, '上啊！打团啊！开大开大！', 1.6, who('A'));
    sub(T3 + 14.0, '别送了别送了——！', 1.4, who('C'));
    at(T3 + 15.2, () => this.shot(meThenCam));
    sub(T3 + 15.4, '这波操作我给满分！再来一把！', 1.6, who('B'));
    at(T3 + 17.1, () => { this.shot(faceCam(38)); g.ch.setExpression('focus'); });
    sub(T3 + 17.3, '……不行。明天八点考高数！', 2);

    // ======== 第四幕：大喊（他们听不见）→ 回头看飞船被吞掉 → 喊得更用力 → 把书推下去 ========
    // 书架夹在两台休眠舱中间，能拍到脸的地方只有书架跟前这一小块（或者书推下去以后从那天晚上那边隔着书缝拍）
    at(T4, () => { this.shot({ ...faceCam(40, 0.16), hand: 0.01 }); this.yell(1, '别打了——！！'); });
    at(T4 + 1.9, () => this.shot({ p: V(-2.95, 1.78, -1.2), l: V(-4.9, 1.1, -2.2), p2: V(-3.05, 1.76, -1.3), dur: 2, fov: 48, past: true, hand: 0.002 }));
    at(T4 + 3.4, () => { this.shot(otsCam()); g.ch.setExpression('sad'); this.pose = { grip: 1 }; });
    sub(T4 + 3.6, '……听不见吗……', 1.8);
    at(T4 + 5.2, () => this.shot(faceCam(38, -0.16)));
    at(T4 + 5.6, () => { this.pose = { grip: 0.6, lookYaw: 1.05, lookPitch: -0.05 }; });
    at(T4 + 6.8, () => { this.shot({ p: V(-0.8, 1.86, -0.9), l: V(0.2, 1.5, 3.0), p2: V(-0.74, 1.85, -0.76), l2: V(0.4, 1.45, 4.0), dur: 3.4, fov: 50, hand: 0.005 }); g.audio.rumble(3, 0.5); });
    sub(T4 + 7.4, '……船……快没了……', 2.2);
    at(T4 + 10.2, () => { this.shot(faceCam(36)); g.ch.setExpression('sad'); });
    at(T4 + 10.5, () => { this.pose = { grip: 1 }; });
    at(T4 + 11.3, () => { this.shot({ ...faceCam(34, 0.05), p2: V(-1.36, 1.79, tz + 0.04), dur: 2, hand: 0.012 }); this.yell(1.1, '听得见吗？！是我啊——！！', 2.2); this.shakeA = 0.02; });
    at(T4 + 13.6, () => this.shot(meThenCam));
    // 推书：这边伸手进书缝 → 切到那天晚上的宿舍，正对着书架——书自己歪出来、掉下去（镜头跟着摇到地上）
    const pushAt = (t, i, line) => {
      at(t, () => { this.shot(otsCam(40)); this.pose = { reach: 1, reachPitch: 0.3 }; this.lean(1); if (line) this.yell(1.05, line, 1.6); });
      at(t + 0.9, () => this.shot({ p: V(-3.55, 1.72, -1.02), l: V(-2.1, 1.76, -1.08), p2: V(-3.5, 1.3, -1.0), l2: V(-2.45, 0.12, -1.1), delay: 0.5, dur: 1.2, fov: 40, past: true, hand: 0.002 }));
      at(t + 1.1, () => { this.past.push(i); g.audio.paper(); });
      at(t + 2.2, () => { this.pose = { grip: 1 }; this.lean(0); });
    };
    pushAt(T4 + 14.6, 0, '求你了……快去睡觉啊！！');
    at(T4 + 17.2, () => this.shot({ p: V(-3.38, 1.56, -3.32), l: V(-4.4, 1.2, -2.0), fov: 44, past: true, hand: 0.002 }));
    sub(T4 + 17.4, '……？书怎么自己掉了？', 1.8, meThen);
    sub(T4 + 18.8, '宿舍闹鬼了吧哈哈哈哈！', 1.8, who('A'));
    pushAt(T4 + 20.2, 1, '');
    at(T4 + 22.6, () => this.shot(deskCam));
    sub(T4 + 22.7, '又掉一本？！', 1.4, who('C'));
    sub(T4 + 24.0, '别管了！高地要掉了！', 1.6, who('B'));
    pushAt(T4 + 25.0, 2, '');
    at(T4 + 27.3, () => this.shot({ ...deskCam, p: V(-3.3, 1.6, -3.1) }));
    sub(T4 + 27.4, '……算了，明天再捡。再来一把！', 1.5, meThen);

    // ======== 第五幕：隔着书架，两边的人对望了一眼 ========
    at(T5, () => {
      this.past.approach();
      this.past.setGlow(0.18, 1);
      // 跟在他身后：两边是上下铺，走廊尽头就是书架，那道缝里隐约有光
      this.shot({ p: V(-4.05, 1.72, -1.28), l: V(-2.2, 1.45, -1.08), p2: V(-3.72, 1.7, -1.22), l2: V(-2.2, 1.5, -1.08), dur: 3.2, fov: 44, past: true, hand: 0.004 });
    });
    sub(T5 + 0.2, '……等等，我去看看。', 1.8, who('A'));
    at(T5 + 3.2, () => this.shot({ p: V(-3.3, 1.25, -1.36), l: V(-2.45, 0.8, -1.05), p2: V(-3.22, 1.7, -1.3), l2: V(-2.3, 1.72, -1.08), delay: 0.9, dur: 1.6, fov: 42, past: true, hand: 0.002 }));
    // 对望：这边越过我的肩膀看见他 → 他的脸（隔着书缝）→ 那边越过他的肩膀看见我 → 我的脸
    at(T5 + 5.4, () => { this.shot({ p: V(-0.62, 1.86, -1.32), l: V(-2.38, 1.7, -1.07), p2: V(-0.72, 1.85, -1.28), dur: 2, fov: 28, hand: 0.002 }); g.ch.setExpression('sad'); this.pose = { grip: 1 }; });
    sub(T5 + 5.8, '……看这边……是我……！', 2.2);
    at(T5 + 7.4, () => this.shot({ p: V(-1.5, 1.76, tz), l: V(-2.4, 1.68, tz), p2: V(-1.56, 1.76, tz), dur: 1.6, fov: 30, hand: 0.0015 }));
    at(T5 + 9.0, () => this.shot({ p: V(-2.95, 1.87, -1.33), l: V(-1.0, 1.77, tz), p2: V(-2.88, 1.86, -1.3), dur: 2.2, fov: 30, past: true, hand: 0.0015 }));
    sub(T5 + 9.2, '……书架后面，好像有人？', 2.2, who('A'));
    at(T5 + 11.2, () => { this.shot(faceCam(32, -0.04)); g.ch.setExpression('focus'); });
    at(T5 + 12.4, () => this.shot({ ...deskCam, p: V(-3.25, 1.62, -3.25) }));
    sub(T5 + 12.5, '你眼花了吧！快回来，最后一波！', 2, meThen);
    at(T5 + 14.4, () => this.shot({ p: V(-3.05, 1.75, -0.7), l: V(-2.38, 1.7, -1.08), fov: 36, past: true, hand: 0.002 }));
    sub(T5 + 14.6, '……哦。', 1.2, who('A'));
    at(T5 + 15.2, () => this.past.leave());
    at(T5 + 15.8, () => { this.shot(faceCam(34)); g.ch.setExpression('sad'); });
    sub(T5 + 16.0, '不……别走……', 2);

    // ======== 第六幕：最后一块被吞掉。电脑前的那个你回过头，笑了一下 → 拉远，一片白 ========
    at(T6, () => { this.shot({ p: V(3.4, 2.6, -4.2), l: V(-0.9, 1.4, 1.0), p2: V(3.0, 2.45, -3.4), l2: V(-0.9, 1.4, 1.2), dur: 4.6, fov: 46, hand: 0.004 }); g.audio.rumble(4, 0.7); this.pose = { grip: 0.5 }; });
    at(T6 + 4.6, () => { this.shot(faceCam(34, -0.1)); g.ch.setExpression('sad'); });
    sub(T6 + 5.0, '……原来……那天晚上掉下来的书……是我推的。', 3.2);
    at(T6 + 8.2, () => this.shot({ p: V(-0.6, 1.95, tz - 0.36), l: V(-1.6, 1.74, tz + 0.05), p2: V(-0.7, 1.92, tz - 0.3), dur: 2.4, fov: 40, hand: 0.003 }));
    sub(T6 + 8.4, '我就是那个……“幽灵”。', 2.6);
    at(T6 + 10.6, () => this.shot({ p: V(-3.7, 1.36, -3.18), l: V(-4.5, 1.12, -2.4), p2: V(-3.82, 1.33, -3.02), dur: 4, fov: 40, past: true, hand: 0.002 }));
    at(T6 + 10.6, () => this.past.moveB());
    at(T6 + 11.0, () => { this.past.stopMe(); g.audio.stopLoop('collapse', 2); });
    at(T6 + 12.4, () => { this.past.turnMe(); this.past.setGlow(0.38, 1); });
    // 他看过去的方向：两张上下铺中间的书架，那道缝里泛着光，里面好像有个人
    at(T6 + 14.6, () => this.shot({ p: V(-4.25, 1.38, -1.12), l: V(-1.95, 1.78, -1.06), p2: V(-4.05, 1.42, -1.1), dur: 2, fov: 20, fov2: 17, past: true, hand: 0.0015 }));
    at(T6 + 16.6, () => this.shot({ p: V(-3.72, 1.3, -1.92), l: V(-4.47, 1.22, -2.36), p2: V(-3.8, 1.29, -1.98), dur: 3, fov: 30, past: true, hand: 0.0015 }));
    at(T6 + 17.5, () => { this.past.people.me.setExpression('warm'); g.audio.organ(10, 131); });
    at(T6 + 19.8, () => { this.shot(faceCam(32)); g.ch.setExpression('sad'); this.leakTo(1.6, 3); });
    at(T6 + 21.0, () => g.ch.setExpression('warm'));
    at(T6 + 22.4, () => {
      // 一路退到舱外：最后一小块书架、光，还有它身后大得吓人的卡冈图雅
      this.shot({ p: V(-0.55, 1.95, tz - 0.35), l: V(-1.5, 1.78, tz), p2: V(2.6, 2.3, -6.8), l2: V(-0.6, 1.6, 2.0), dur: 12, fov: 42, fov2: 50, hand: 0.002 });
      this.leakTo(3.2, 9);
      g.audio.riser(9);
      this.pose = { grip: 0.4 };
    });
    at(T6 + 26.6, () => g.ui.fade(1, { dur: 5, white: true }));
    at(T6 + 30.2, () => { g.audio.organ(8, 98); g.ui.fade(1, { dur: 0.01, white: true, card: CARD }); });
    at(T_END, () => this.ending());
  }

  // ---------- 过场里的小动作 ----------
  shot(o) {
    const vv = (a) => (a ? a.clone() : null);
    this.rig = { ...o, p: vv(o.p), l: vv(o.l), p2: vv(o.p2), l2: vv(o.l2), t: 0 };
    if (o.fn) this.rig.fn = o.fn;
    this.setView(!!o.past);
  }
  setView(past) {
    const g = this.g;
    this.viewPast = past && !!this.past;
    g.ch.root.visible = !this.viewPast;
    g.gfx.grade.set(this.viewPast ? 'past' : 'space', true);
  }
  move(pts, dur, { yaw = null } = {}) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => p.clone()), false, 'centripetal');
    this.mv = { c, t: 0, dur, last: pts[0].clone(), yawEnd: yaw };
  }
  leakTo(v, dur) { this.leakTw = { a: this.leak, b: v, t: 0, dur }; }
  lean(on) { this.leanTw = { a: this.me.pos.x, b: on ? -1.12 : -0.98, t: 0, dur: 0.5 }; }
  yell(pitch, line, dur = 1.8) {
    const g = this.g;
    g.ch.setExpression('shout');
    this.pose = { grip: 1, lookPitch: 0.05 };
    g.audio.shout(pitch + Math.random() * 0.08, 0.9 + (pitch - 1) * 2);
    this.shakeA = Math.max(this.shakeA, 0.012);
    g.ui.subtitle(line, dur, g.S.name);
  }

  pullBook() {
    const g = this.g, A = this.A;
    this.stage = 6;
    this.ensurePast();
    g.audio.heartbeat(); g.audio.organ(16, 98); g.audio.paper();
    g.audio.stopLoop('collapse', 1.5); g.audio.startLoop('collapse', { freq: 90, gain: 0.07 });
    this.slowTo = { a: this.slow, b: 0.42, t: 0, dur: 1.6 };
    // 抽书：书被抽出来、飘走；两边的书往外歪，留出一道缝
    const b = A.target.group, p0 = b.position.clone();
    if (A.straps[A.level]) A.straps[A.level].visible = false; // 那一层的松紧带崩开了
    // （书都往两边、往上飘：人就飘在书架跟前，别撞到脸上）
    g.tween(1.0, (k) => { b.position.set(p0.x + k * 0.3, p0.y + k * 0.1, p0.z + k * 0.06); b.rotation.set(k * 0.3, k * 0.5, k * 0.2); }, { ease: easeOut, done: () => { const p1 = b.position.clone(); g.tween(7, (k) => { b.position.set(p1.x + k * 0.12, p1.y + k * 0.55, p1.z + k * 0.55); b.rotation.x += 0.006; }); } });
    for (const nb of A.books) {
      if (nb.shelf !== A.level || nb === A.target) continue;
      const d = nb.idx - A.target.idx, sd = Math.sign(d);
      if (Math.abs(d) > 3) continue;
      const p1 = nb.group.position.clone();
      if (Math.abs(d) <= 2) g.tween(3.6, (k) => { nb.group.position.set(p1.x + k * 0.26, p1.y + k * (0.18 + 0.1 * Math.abs(d)), p1.z + sd * k * (0.4 + 0.12 * Math.abs(d))); nb.group.rotation.set(sd * k * 0.8, k * 0.6, k * 0.3); }, { ease: easeOut, delay: 0.2 + Math.abs(d) * 0.15 + (d > 0 ? 0.1 : 0) });
      else g.tween(0.8, (k) => { nb.group.position.z = p1.z + sd * 0.03 * k; nb.group.rotation.x = sd * 0.2 * k; }, { ease: easeOut, delay: 0.5 });
    }
    this.portal.visible = true;
    g.tween(2.0, (k) => (this.portalU.power.value = k), { delay: 0.6 });
    this.leakTo(0.85, 2.5);
    g.after(1.2, () => { if (this.seqOn) this.pose = {}; });
  }

  // 跳过：一片白 → 结局
  skip() {
    const g = this.g;
    if (this.stage >= 7 || this.skipped) return;
    this.skipped = true;
    this.seqOn = false; this.events = [];
    if (g._skipBtn) { g._skipBtn.remove(); g._skipBtn = null; }
    g.audio.stopAllLoops(0.4);
    g.ui.fade(1, { dur: 0.5, white: true, card: CARD });
    g.after(2.4, () => this.ending());
  }

  // ================== 每帧：过场里的船、黑洞、灯、碎片、人、镜头 ==================
  applyBox() {
    const B = this.box, P = this.planes;
    P.s.constant = B.s; P.n.constant = -B.n; P.e.constant = B.e; P.b.constant = -B.b; P.t.constant = B.t;
    this.g._clipZ = B.s;
  }
  inside(p, m = 0) { const B = this.box; return p.z <= B.s - m && p.z >= B.n + m && p.x <= B.e - m && p.y >= B.b + m && p.y <= B.t - m; }

  updateShip(dt) {
    const g = this.g, R = g.refs, T = this.T, B = this.box;
    Object.assign(this.prev, B);
    for (const k of ['s', 'e', 'n', 'b', 't']) B[k] = kf(KF[k], T);
    this.applyBox();
    // 黑洞：越长越大，退到船外面去
    const bh = this.BH;
    bh.radius = kf(KF.bhR, T);
    bh.group.position.set(kf(KF.bhX, T), kf(KF.bhY, T), kf(KF.bhZ, T));
    bh.agitate = 3;
    // 切面
    this.updateRifts();
    // 飘着的东西被拽向黑洞，过了切面就没了
    const bp = bh.group.position;
    for (const f of this.snap) f.anchor.lerp(bp, dt * 0.05 * this.slow);
    R.floaters.timeScale = this.slow;
    for (const o of this.free) if (o.visible && !this.inside(o.getWorldPosition(_a))) o.visible = false;
    this.updateLights(dt);
    this.spawnDebris(dt);
    // 声音：裂开的声音、低沉的轰鸣
    this.crackT -= dt; if (this.crackT <= 0) { this.crackT = (0.6 + Math.random() * 1.4) / Math.max(0.4, this.slow); g.audio.crack(); }
    this.rumbleT -= dt; if (this.rumbleT <= 0 && T < T6 + 20) { this.rumbleT = 3 + Math.random() * 3; g.audio.rumble(2.2, 0.28); }
    // 火花：沿着南边的切口
    this.sparkT -= dt;
    if (this.sparkT <= 0 && B.s < SHIP.z1 && B.s > SHIP.z0) {
      this.sparkT = 0.06 / Math.max(0.3, this.slow);
      const p = V(lerp(SHIP.x0, Math.min(SHIP.x1, B.e), Math.random()), lerp(Math.max(0, B.b), Math.min(3, B.t), Math.random()), B.s - 0.04);
      g.fx.emit('spark', p, { count: 2, speed: 0.6, spread: 1, up: 0.2, gravity: 0, drag: 1.2, life: 0.9, size: 0.05, colors: ['#bfe8ff', '#ffffff', '#ffc860'] });
    }
  }
  updateRifts() {
    const B = this.box, X = SHIP;
    const x0 = X.x0, x1 = Math.min(X.x1, B.e), y0 = Math.max(X.y0, B.b), y1 = Math.min(X.y1, B.t), z0 = Math.max(X.z0, B.n), z1 = Math.min(X.z1, B.s);
    const ok = x1 > x0 && y1 > y0 && z1 > z0;
    const face = (k, on, pos, sx, sy, rot, ax, ay, depth) => {
      const r = this.rifts[k], m = r.m;
      m.visible = ok && on;
      if (!m.visible) return;
      m.position.copy(pos); m.scale.set(Math.max(0.01, sx), Math.max(0.01, sy), 1); m.rotation.set(rot[0], rot[1], 0);
      r.U.ax.value.copy(ax); r.U.ay.value.copy(ay);
      r.U.power.value = clamp(depth / 0.4, 0, 1) * (0.35 + 0.25 * Math.min(1, this.slow + 0.3));
    };
    face('s', B.s < X.z1, _a.set((x0 + x1) / 2, (y0 + y1) / 2, B.s - 0.004), x1 - x0, y1 - y0, [0, 0], _b.set(1, 0, 0), _c.set(0, 1, 0), X.z1 - B.s);
    face('n', B.n > X.z0, _a.set((x0 + x1) / 2, (y0 + y1) / 2, B.n + 0.004), x1 - x0, y1 - y0, [0, 0], _b.set(1, 0, 0), _c.set(0, 1, 0), B.n - X.z0);
    face('e', B.e < X.x1, _a.set(B.e - 0.004, (y0 + y1) / 2, (z0 + z1) / 2), z1 - z0, y1 - y0, [0, Math.PI / 2], _b.set(0, 0, 1), _c.set(0, 1, 0), X.x1 - B.e);
    face('b', B.b > X.y0, _a.set((x0 + x1) / 2, B.b + 0.004, (z0 + z1) / 2), x1 - x0, z1 - z0, [-Math.PI / 2, 0], _b.set(1, 0, 0), _c.set(0, 0, 1), B.b - X.y0);
    face('t', B.t < X.y1, _a.set((x0 + x1) / 2, B.t - 0.004, (z0 + z1) / 2), x1 - x0, z1 - z0, [-Math.PI / 2, 0], _b.set(1, 0, 0), _c.set(0, 0, 1), X.y1 - B.t);
  }
  updateLights() {
    const g = this.g, R = g.refs, L = R.lights, SL = R.spaceLights, T = this.T;
    // 断电：闪几下，全灭
    let pw = 1;
    if (this.blackT != null) { const bt = T - this.blackT; pw = bt < 1.3 ? (Math.sin(bt * 37) > 0.2 ? 0.2 + 0.8 * (1 - bt / 1.3) : 0.04) : 0; }
    this.power = pw;
    // 警示灯靠电池还在转，直到被吞掉
    const beacon = R.hatch.beacon;
    if (this.inside(_a.set(-1.68, 2.35, 3.36))) this.CH._alarm = 0.5; else { this.CH._alarm = 0; beacon.light.intensity = 0; beacon.mat.emissiveIntensity = 0; }
    SL.stripMat.color.multiplyScalar(0.08 + 0.92 * pw);
    R.ceilMat.emissiveIntensity = 0.05 * pw;
    L.hemi.intensity = this.base.hemi * lerp(0.5, 1, pw);
    g.scene.environmentIntensity = lerp(0.08, 0.14, pw);
    const GL = SL.galleyLamp;
    GL.intensity = 1.2 * pw * (this.inside(GL.position) ? 1 : 0);
    if (L.wc) L.wc.intensity *= pw * (this.inside(L.wc.getWorldPosition(_a)) ? 1 : 0);
    for (const m of SL.lampBulbs) m.color.set(pw > 0.1 ? '#ffcf8a' : '#1a1712');
    // 东墙那盏工作灯：断电以后借给书架——书缝里透出来的光
    const cg = SL.cabinGlow;
    if (this.leak > 0.001 || pw < 0.05) {
      // 灯放在书架那一格的最里面：书是背光的，光从书与书之间、书顶上的缝里漏出来
      const fl = 0.9 + 0.1 * Math.sin(g.time * 9) * Math.sin(g.time * 5.3);
      cg.position.set(this.stage >= 6 ? -1.6 : -1.7, 1.86, this.tz); cg.color.set('#ffd29a'); cg.distance = 5.5; cg.decay = 1.4;
      cg.intensity = Math.min(4.5, this.leak * 3.5) * fl;
    } else cg.intensity = 1.8 * pw;
    // 驾驶舱那盏琥珀色的灯：驾驶舱没了以后，它变成吸积盘从南边照过来的光
    const kl = R.cockLight;
    if (kl) {
      if (this.inside(_b.set(0.35, 2.2, 5.4))) kl.intensity = this.base.cock * pw;
      else {
        kl.position.set(lerp(-0.4, 0.3, clamp(T / T3, 0, 1)), 1.7, Math.min(this.box.s + 2.4, 9));
        kl.color.set('#ffb068'); kl.distance = 16; kl.decay = 1.2;
        kl.intensity = 1.0 + this.BH.radius * 1.3;
      }
    }
  }
  spawnDebris(dt) {
    const B = this.box, P = this.prev, D = this.debris, X = SHIP;
    const x0 = X.x0, x1 = Math.min(X.x1, B.e), y0 = Math.max(X.y0, B.b), y1 = Math.min(X.y1, B.t), z0 = Math.max(X.z0, B.n), z1 = Math.min(X.z1, B.s);
    if (!(x1 > x0 && y1 > y0 && z1 > z0)) return;
    const faces = [];
    const add = (k, v, area, fn) => { if (v > 1e-4) faces.push({ k, w: area * (v / dt + 0.02), fn }); };
    if (B.s < X.z1) add('s', P.s - B.s, (x1 - x0) * (y1 - y0), (p, v) => { p.set(lerp(x0, x1, Math.random()), lerp(y0, y1, Math.random()), B.s + 0.03); v.set(0, 0, 1); });
    if (B.n > X.z0) add('n', B.n - P.n, (x1 - x0) * (y1 - y0), (p, v) => { p.set(lerp(x0, x1, Math.random()), lerp(y0, y1, Math.random()), B.n - 0.03); v.set(0, 0, -1); });
    if (B.e < X.x1) add('e', P.e - B.e, (z1 - z0) * (y1 - y0), (p, v) => { p.set(B.e + 0.03, lerp(y0, y1, Math.random()), lerp(z0, z1, Math.random())); v.set(1, 0, 0); });
    if (B.t < X.y1) add('t', P.t - B.t, (x1 - x0) * (z1 - z0), (p, v) => { p.set(lerp(x0, x1, Math.random()), B.t + 0.03, lerp(z0, z1, Math.random())); v.set(0, 1, 0); });
    if (B.b > X.y0) add('b', B.b - P.b, (x1 - x0) * (z1 - z0), (p, v) => { p.set(lerp(x0, x1, Math.random()), B.b - 0.03, lerp(z0, z1, Math.random())); v.set(0, -1, 0); });
    if (!faces.length) return;
    D.acc += dt * 11 * Math.max(0.35, this.slow);
    while (D.acc >= 1) {
      D.acc -= 1;
      const it = D.items.find((x) => !x.alive);
      if (!it) break;
      let r = Math.random() * faces.reduce((a, f) => a + f.w, 0), f = faces[0];
      for (const ff of faces) { r -= ff.w; if (r <= 0) { f = ff; break; } }
      f.fn(it.p, it.v);
      it.v.multiplyScalar(0.15 + Math.random() * 0.35).add(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25));
      it.alive = true; it.life = 0;
      it.kind = Math.random() < 0.7 ? 0 : 1;
      it.size.set(0.04 + Math.random() * 0.16, 0.008 + Math.random() * 0.03, 0.04 + Math.random() * 0.13);
      it.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      it.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      it.w = 0.6 + Math.random() * 2.4;
    }
  }
  updateDebris(dt) {
    const D = this.debris, bp = this.BH.group.position, r = this.BH.radius, d = dt * this.slow;
    const cnt = [0, 0];
    for (const it of D.items) {
      if (!it.alive) continue;
      it.life += d;
      _a.copy(bp).sub(it.p); const dist = _a.length(); _a.divideScalar(Math.max(dist, 1e-4));
      it.v.addScaledVector(_a, (0.12 + 1.6 * r / Math.max(0.8, dist * 0.6)) * d);
      it.v.addScaledVector(_b.set(-_a.z, 0.15, _a.x), 0.18 * d * r / Math.max(1, dist)); // 绕着黑洞打旋
      it.p.addScaledVector(it.v, d);
      it.q.multiply(_q.setFromAxisAngle(it.axis, it.w * d));
      const sh = clamp((dist - r * 1.05) / (r * 1.6 + 0.3), 0, 1);
      if (dist < r * 1.08 || it.life > 30) { it.alive = false; continue; }
      const im = D.meshes[it.kind];
      _s.copy(it.size).multiplyScalar(sh);
      _m.compose(it.p, it.q, _s);
      im.setMatrixAt(cnt[it.kind]++, _m);
    }
    D.meshes.forEach((im, i) => { im.count = cnt[i]; im.instanceMatrix.needsUpdate = true; });
  }
  updateMover(dt) {
    const g = this.g, M = this.mv, me = this.me;
    if (M) {
      M.t += dt;
      const k = easeInOut(clamp(M.t / M.dur, 0, 1));
      const p = M.c.getPointAt(k, _c);
      _d.copy(p).sub(M.last);
      me.speed = _d.length() / Math.max(dt, 1e-4);
      if (_d.lengthSq() > 1e-8) me.yawT = Math.atan2(_d.x, _d.z);
      M.last.copy(p);
      me.pos.copy(p);
      if (M.t >= M.dur) { this.mv = null; me.speed = 0; if (M.yawEnd != null) me.yawT = M.yawEnd; }
    }
    if (this.leanTw) {
      const L = this.leanTw; L.t += dt;
      me.pos.x = lerp(L.a, L.b, easeInOut(clamp(L.t / L.dur, 0, 1)));
      if (L.t >= L.dur) this.leanTw = null;
    }
    me.yaw = dampAngle(me.yaw, me.yawT, M ? 8 : 4, dt);
    // 飞得越快，身子越往前趴（像游泳 / 超人那样），绕着胯转，不是绕着脚
    me.pitch = lerp(me.pitch || 0, clamp(me.speed / 1.5, 0, 1) * 1.0, 1 - Math.exp(-dt * 4));
    g.ctrl.pos.copy(me.pos); g.ctrl.charYaw = me.yaw;
    const ch = g.ch, hh = 0.95, sp = Math.sin(me.pitch), cp = Math.cos(me.pitch);
    ch.root.rotation.order = 'YXZ';
    ch.root.rotation.set(me.pitch, me.yaw, 0);
    ch.root.position.set(me.pos.x - Math.sin(me.yaw) * hh * sp, me.pos.y + hh * (1 - cp) + Math.sin(g.time * 1.1) * 0.018, me.pos.z - Math.cos(me.yaw) * hh * sp);
    // 下一帧的姿势（抓着书架两边 → 手的 IK）
    const P = { float: 1, speed: me.speed, ...this.pose };
    P.lookPitch = (this.pose.lookPitch || 0) + me.pitch * 0.62; // 身子趴下去了，头还是要抬起来看前面
    if (this.pose.grip) {
      ch.root.updateMatrixWorld(true);
      const w = this.pose.grip, tz = this.tz;
      P.ikL = { p: ch.J.torso.worldToLocal(_a.set(-1.44, 1.66, tz + 0.21)).clone(), w, fing: 1.2 };
      P.ikR = { p: ch.J.torso.worldToLocal(_a.set(-1.44, 1.66, tz - 0.21)).clone(), w, fing: 1.2 };
      delete P.grip;
    }
    g._cutPose = P;
  }
  updateRig(dt) {
    const R = this.rig; if (!R) return;
    R.t += dt;
    const cam = this.g.camera, t = this.g.time;
    let p, l, fov = R.fov || 50;
    if (R.fn) { const o = R.fn(R.t); p = _e.copy(o.p); l = _f.copy(o.l); }
    else {
      const k = R.p2 || R.l2 || R.fov2 ? easeInOut(clamp((R.t - (R.delay || 0)) / (R.dur || 1), 0, 1)) : 0;
      p = _e.copy(R.p); l = _f.copy(R.l);
      if (R.p2) p.lerp(R.p2, k);
      if (R.l2) l.lerp(R.l2, k);
      if (R.fov2) fov = lerp(R.fov, R.fov2, k);
    }
    // 手持感：很轻的低频晃动；再加上冲击时的抖动
    const h = (R.hand ?? 0.004) + this.shakeA * 0.3;
    p.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9 + 1)) * h * 0.5;
    p.y += (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.7)) * h * 0.5;
    p.z += Math.sin(t * 1.1 + 4) * h * 0.5;
    if (this.shakeA > 0.0005) { p.x += (Math.random() - 0.5) * this.shakeA; p.y += (Math.random() - 0.5) * this.shakeA; this.shakeA *= Math.exp(-dt * 3); } else this.shakeA = 0;
    cam.position.copy(p);
    cam.lookAt(l);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ⑤ "那天晚上的 211"：另搭一个场景（第一次搭会卡一下，所以在解码频道的时候就在后台搭好）
  ensurePast() {
    if (this.past) return this.past;
    const g = this.g;
    this.past = new PastDorm(g);
    const c = this.A.cell;
    const U = { tPast: { value: this.past.rt.texture }, res: { value: new THREE.Vector2(1, 1) }, power: { value: 0 }, glow: { value: 0 }, time: { value: 0 } };
    this.portalU = U;
    const q = noRay(new THREE.Mesh(new THREE.PlaneGeometry(c.z1 - c.z0, c.y1 - c.y0), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: PORTAL_FRAG })));
    q.position.set(c.x, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2); q.rotation.y = Math.PI / 2;
    q.visible = false;
    g.refs.root.add(q);
    this.portal = q;
    g.ch.prepare && g.ch.prepare();
    // 着色器先在后台编译好（编译时不能带着太空舱的裁剪面，不然真正画的时候还得重编一遍）
    const r = g.gfx.renderer;
    try {
      const pl = r.clippingPlanes; r.clippingPlanes = [];
      this.past.rev.visible = true;
      if (r.compileAsync) r.compileAsync(this.past.scene, g.camera).catch(() => {});
      this.past.rev.visible = false;
      r.clippingPlanes = pl;
    } catch (e) { /* 忽略 */ }
    return this.past;
  }

  cutStart() {
    const g = this.g;
    g.state = 'cut';
    g._setHover(null);
    g.ui.closeModal(true);
    g.input.exitLock();
    g.ui.showHUD(false); g.ui.showTouch(false); g.ui.letterbox(true);
    g.auto = null; g._afterReach = null; g._cutPose = null;
    g.ch.setFirstPerson(false); // 第一人称时头是藏起来的，过场里要露出来
    if (!g.cine) g._cineSet(g.camera.position.clone(), g.camLook.clone().copy(g.camera.getWorldDirection(_b)).multiplyScalar(3).add(g.camera.position));
  }

  // ================== 每帧 ==================
  // 只在自由活动时（CH.update）
  update() {
    const g = this.g, S = g.S;
    if (this.stage === 0) {
      const near = g.camera.position.distanceTo(V(-1.5, 1.7, -1.07)) < 3.6;
      const ready = S.elapsed > 40 && (S.found.some(Boolean) || S.view || S.f.readNote);
      if ((ready && near) || S.elapsed > 150) this.cardFalls();
    }
  }
  // 每一帧（过场、结算时也要跑）
  world(dt, t) {
    const g = this.g, A = this.A;
    // 索引卡慢慢飘出来，然后在资料库前面打转
    const c = this.card;
    if (c) {
      c.t += dt;
      const k = easeOut(clamp(c.t / 3, 0, 1));
      A.card.position.lerpVectors(c.p0, c.p1, k);
      A.card.position.y += Math.sin(c.t * 1.2) * 0.03 * k;
      A.card.rotation.set(Math.sin(c.t * 0.7) * 0.4, Math.PI / 2 + c.t * 0.5, Math.sin(c.t * 0.9) * 0.3);
    }
    // 书自己在抖（像有人在书架背后推）；书缝里透出光来的时候抖得更厉害
    if (this.stage >= 1 && this.stage < 6 && this.jolt <= 0 && Math.random() < dt * (this.leak > 0.05 ? 1.2 : 0.1)) this.jolt = 0.6;
    if (this.jolt > 0 && this.stage < 6) {
      this.jolt -= dt;
      for (const b of A.books) {
        if (b.shelf !== A.level) continue;
        const amp = this.jolt > 0 ? 0.004 + this.leak * 0.004 : 0;
        b.group.position.set(b.home.x + (Math.random() - 0.5) * amp, b.home.y, b.home.z + (Math.random() - 0.5) * amp);
      }
    }
    // 那本书：线索出现后隐隐发光，书缝透光时越来越亮
    const want = this.stage >= 1 && this.stage < 5 ? 0.12 : this.stage >= 5 ? Math.min(1.4, this.leak) : 0;
    this.glow = lerp(this.glow, want, 1 - Math.exp(-dt * 3));
    for (const m of this.bookMats) { m.emissive.set('#ffc860'); m.emissiveIntensity = this.glow * (0.9 + 0.6 * Math.sin(t * 6)); }
    // 过场的时钟
    if (this.seqOn) {
      this.T += dt;
      while (this.ev < this.events.length && this.events[this.ev][0] <= this.T) this.events[this.ev++][1]();
    }
    if (this.slowTo) { const s = this.slowTo; s.t += dt; this.slow = lerp(s.a, s.b, easeInOut(clamp(s.t / s.dur, 0, 1))); if (s.t >= s.dur) this.slowTo = null; }
    if (this.leakTw) { const L = this.leakTw; L.t += dt; this.leak = lerp(L.a, L.b, easeInOut(clamp(L.t / L.dur, 0, 1))); if (L.t >= L.dur) this.leakTw = null; }
    this.BH.timeScale = this.stage >= 5 ? this.slow : 1;
    this.riftT.value += dt * (this.stage >= 5 ? this.slow : 1);
    if (this.seqOn) {
      this.updateShip(dt);
      this.updateDebris(dt);
      this.updateMover(dt);
      this.updateRig(dt);
    }
    // 书缝里的光：背板上一片暖光 + 往舱里斜射出来的一缕光
    if (this.portal) {
      const U = this.portalU;
      U.glow.value = this.stage >= 5 ? this.leak * (this.stage >= 6 ? 0.1 : 1) : 0;
      this.portal.visible = U.power.value > 0.005 || U.glow.value > 0.005;
      U.time.value = t;
      g.gfx.renderer.getDrawingBufferSize(U.res.value);
    }
    this.beam.U.power.value = this.stage >= 5 && this.stage < 7 ? this.leak : 0;
    this.beam.U.time.value = t;
    this.beam.group.visible = this.beam.U.power.value > 0.01;
    if (this.beam.group.visible && Math.random() < dt * 6 * this.leak) g.fx.emit('dust', _a.set(-1.4 + Math.random() * 1.2, 1.65 + Math.random() * 0.3, this.tz + (Math.random() - 0.5) * 0.3), { count: 1, speed: 0.04, spread: 1, up: 0.02, gravity: 0, drag: 0.5, life: 2.5, size: 0.02, colors: ['#ffe2b0', '#fff4e0'] });
    // 书架背后的那天晚上
    if (this.past && this.stage >= 6) {
      this.past.update(dt);
      this.needPast = !this.viewPast && this.portal.visible && this.portalU.power.value > 0.01;
      // 那边的键盘声（闷闷的）：镜头在那边、或者在书缝前的时候才听得见
      const near = this.viewPast || g.camera.position.x < -1.2;
      if (near && Math.random() < dt * (this.past.typing ? 9 : 3)) g.audio.typeKey();
    }
  }

  // 主画面渲染之前：先用同一个镜头把另一个时空画到贴图上（每一帧只画一次）
  beforeRender() {
    const g = this.g, gfx = g.gfx, r = gfx.renderer;
    gfx.viewScene = this.viewPast && this.past ? this.past.scene : null;
    if (!this.past) return;
    if (this.viewPast) {
      // 镜头在"那天晚上的 211"里：主画面画那边；书架缝后面的反向窗里是太空舱这边
      this.past.refs.westWall.visible = true;
      const U = this.past.revU;
      r.getDrawingBufferSize(U.res.value); U.time.value = g.time;
      if (this.past.rev.visible && U.power.value > 0.01) this.renderSpace();
    } else if (this.needPast) this.past.render(r, g.camera);
  }
  renderSpace() {
    const g = this.g, r = g.gfx.renderer, R = g.refs;
    if (!this.spaceRT) this.spaceRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 });
    const size = r.getDrawingBufferSize(_v2);
    if (this.spaceRT.width !== size.x || this.spaceRT.height !== size.y) this.spaceRT.setSize(size.x, size.y);
    // 从宿舍那边看过来：太空舱的西墙、资料库的背板、书架上的"窗"都得先拿掉
    const hide = [R.westWall, this.A.back, this.portal].filter(Boolean);
    const vis = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const chVis = g.ch.root.visible; g.ch.root.visible = true;
    g.gfx.shadows.arm();
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.spaceRT);
    r.render(g.scene, g.camera);
    r.setRenderTarget(prev);
    hide.forEach((o, i) => (o.visible = vis[i]));
    g.ch.root.visible = chVis;
    this.past.revU.tSpace.value = this.spaceRT.texture;
  }

  // 结局：白光退去——那天晚上的 211：电脑前的那个你转过身来，笑着望向书架（也就是望着镜头）
  ending() {
    const g = this.g, S = g.S;
    if (this.stage === 7) return;
    this.stage = 7;
    this.seqOn = false; this.events = [];
    if (g._skipBtn) { g._skipBtn.remove(); g._skipBtn = null; }
    this.ensurePast();
    const P = this.past;
    P.dropAll(); P.turnMe(true); P.moveB(); P.moveA(); P.setGlow(0.6, 0);
    P.people.me.setExpression('warm');
    this.rig = null;
    this.setView(true);
    g.camera.fov = 42; g.camera.updateProjectionMatrix();
    g.audio.stopAllLoops(1.5);
    S.ach.add('stay');
    S.done.push({ n: 4, elapsed: S.elapsed, par: this.CH.par, hints: S.hints });
    g.showEnd({ secret: true });
    this.endView(0);
    g.ui.fade(0, { dur: 2.6, white: true, card: '' });
  }
  // 结算时：镜头在书架这一侧，对着电脑前的那个你，轻轻地呼吸
  endView() {
    const g = this.g, t = g.time, cam = g.camera;
    cam.position.set(-3.5 + Math.sin(t * 0.21) * 0.05, 1.42 + Math.sin(t * 0.17) * 0.015, -1.72 + Math.sin(t * 0.13) * 0.04);
    cam.lookAt(-4.55, 1.12, -2.42);
  }

  dispose() {
    if (this.spaceRT) { this.spaceRT.dispose(); this.spaceRT = null; }
    const gfx = this.g.gfx;
    gfx.viewScene = null;
  }
}
