// 灯光着色：照不到的灯直接跳过。
// three.js 的片元着色器会给场景里每一盏点光 / 聚光都算一遍完整的 PBR 光照和阴影采样，
// 哪怕这盏灯此刻亮度是 0（走廊灯、还没点着的炉子、关着的台灯……），或者这个像素早就在它的照射范围之外。
// 第四章实测：三盏关着的聚光 + 三盏关着的点光，每帧白白多花 3.5ms 左右的 GPU。
// 灯又不能直接 visible = false——灯的数量一变，所有材质都得重新编译着色器，游戏会卡住好几秒。
// 这里改 three.js 的 lights_fragment_begin：算完这盏灯在这个像素的颜色后，颜色是 0（directLight.visible 为 false）
// 就不采阴影、不算 BRDF。颜色是 0 时这盏灯本来加上的就是 0，所以画面一个像素都不变。
// 整盏灯都关着的时候，所有像素走同一条分支，GPU 直接整段跳过。
import * as THREE from 'three';

const RE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

// 从 start 这一行之后开始包一层 if ( cond )，一直包到它后面第一个 end 为止
function wrap(src, start, cond, end = RE) {
  const a = src.indexOf(start);
  if (a < 0) return null;
  const b = src.indexOf(end, a);
  if (b < 0) return null;
  const s = a + start.length, e = b + end.length;
  return src.slice(0, s) + `\n\t\tif ( ${cond} ) {\n` + src.slice(s, e) + '\n\t\t}' + src.slice(e);
}

export function patchLightSkip() {
  let src = THREE.ShaderChunk.lights_fragment_begin;
  for (const [start, cond, end] of [
    // 点光、聚光：超出照射距离 / 在灯罩外面的像素，颜色也是 0
    ['getPointLightInfo( pointLight, geometryPosition, directLight );', 'directLight.visible'],
    ['getSpotLightInfo( spotLight, geometryPosition, directLight );', 'directLight.visible'],
    // 平行光（太阳 / 月光）永远算 visible，只看灯本身关没关
    ['getDirectionalLightInfo( directionalLight, directLight );', 'directLight.color != vec3( 0.0 )'],
    // 面光源：颜色 0 时 RE_Direct_RectArea 加的也全是 0
    ['rectAreaLight = rectAreaLights[ i ];', 'rectAreaLight.color != vec3( 0.0 )', 'RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'],
  ]) {
    const out = wrap(src, start, cond, end);
    if (!out) { console.warn('lightskip: three.js 的 lights_fragment_begin 变了，跳过这项优化'); return false; }
    src = out;
  }
  THREE.ShaderChunk.lights_fragment_begin = src;
  return true;
}
