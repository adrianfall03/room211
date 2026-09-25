// 镜子反射只画"镜子里看得见的部分"。
// 穿衣镜只有窄窄一条，Reflector 默认却按整个相机视野把整间屋子再画一遍（几百个物体 + 整张 768² 贴图）。
// 这里先算出"镜后虚拟相机 → 镜子四个角"围成的视锥：
//   · 视锥外的物体临时藏起来，不进反射的渲染；
//   · 反射贴图只画镜子投影到的那一块（剪裁矩形），其余像素镜子根本采样不到。
// 镜子里看得到的画面和原来逐像素一样。
import * as THREE from 'three';

const _mp = new THREE.Vector3(), _cp = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3();
const _la = new THREE.Vector3(), _tg = new THREE.Vector3(), _q = new THREE.Vector3(), _in = new THREE.Vector3();
const _rot = new THREE.Matrix4(), _cam = new THREE.PerspectiveCamera();
const _corners = [0, 1, 2, 3].map(() => new THREE.Vector3());
const _planes = [0, 1, 2, 3].map(() => new THREE.Plane());
const _sph = new THREE.Sphere();

// 和 Reflector.onBeforeRender 里完全一样的虚拟相机（斜裁剪只改投影矩阵的 z 行，不影响 x / y）
function reflectionCamera(mirror, camera) {
  _mp.setFromMatrixPosition(mirror.matrixWorld);
  _cp.setFromMatrixPosition(camera.matrixWorld);
  _rot.extractRotation(mirror.matrixWorld);
  _n.set(0, 0, 1).applyMatrix4(_rot);
  _v.subVectors(_mp, _cp);
  if (_v.dot(_n) > 0) return null; // 背对镜子，Reflector 自己也不画
  _v.reflect(_n).negate().add(_mp);
  _rot.extractRotation(camera.matrixWorld);
  _la.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
  _tg.subVectors(_mp, _la).reflect(_n).negate().add(_mp);
  _cam.position.copy(_v);
  _cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
  _cam.lookAt(_tg);
  _cam.updateMatrixWorld();
  _cam.projectionMatrix.copy(camera.projectionMatrix);
  return _cam;
}

// 画反射之前调用：设好剪裁矩形，把看不见的物体藏进 hidden；画完用 endMirror 恢复
export function beginMirror(mirror, camera, scene, hidden) {
  const rt = mirror.getRenderTarget();
  rt.scissorTest = false;
  const rc = reflectionCamera(mirror, camera);
  if (!rc) return;
  const { width: w, height: h } = mirror.geometry.parameters;
  const cs = _corners;
  cs[0].set(-w / 2, -h / 2, 0); cs[1].set(w / 2, -h / 2, 0); cs[2].set(w / 2, h / 2, 0); cs[3].set(-w / 2, h / 2, 0);
  for (const c of cs) c.applyMatrix4(mirror.matrixWorld);
  // ---- 剪裁矩形：镜子四个角投影到反射贴图上的范围（多留 2 像素给双线性采样）----
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
  for (const c of cs) {
    _q.copy(c).applyMatrix4(rc.matrixWorldInverse);
    if (_q.z > -camera.near) { ok = false; break; } // 有角跑到虚拟相机背后了，投影不可靠，整张画
    _q.applyMatrix4(rc.projectionMatrix);
    x0 = Math.min(x0, _q.x); x1 = Math.max(x1, _q.x); y0 = Math.min(y0, _q.y); y1 = Math.max(y1, _q.y);
  }
  if (ok) {
    const W = rt.width, H = rt.height;
    const px0 = Math.max(0, Math.floor((x0 * 0.5 + 0.5) * W) - 2), px1 = Math.min(W, Math.ceil((x1 * 0.5 + 0.5) * W) + 2);
    const py0 = Math.max(0, Math.floor((y0 * 0.5 + 0.5) * H) - 2), py1 = Math.min(H, Math.ceil((y1 * 0.5 + 0.5) * H) + 2);
    if (px1 > px0 && py1 > py0) { rt.scissor.set(px0, py0, px1 - px0, py1 - py0); rt.scissorTest = true; }
  }
  // ---- 视锥裁剪：虚拟相机穿过镜框四条边的四个平面，法线朝里 ----
  _mp.setFromMatrixPosition(mirror.matrixWorld);
  _in.subVectors(_mp, rc.position).add(_mp); // 顺着"虚拟相机 → 镜子中心"再往屋里走一段：一定在视锥里
  for (let i = 0; i < 4; i++) {
    const p = _planes[i];
    p.setFromCoplanarPoints(rc.position, cs[i], cs[(i + 1) % 4]);
    if (p.distanceToPoint(_in) < 0) p.negate();
  }
  const visit = (o) => {
    if (!o.visible) return;
    const ch = o.children;
    if (ch.length) { for (let i = 0; i < ch.length; i++) visit(ch[i]); return; } // 只藏叶子：父物体的包围球不一定包得住子物体
    if (!(o.isMesh || o.isPoints || o.isLine) || o.isInstancedMesh || !o.frustumCulled || o === mirror) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    for (let i = 0; i < 4; i++) if (_planes[i].distanceToPoint(_sph.center) < -_sph.radius) { o.visible = false; hidden.push(o); return; }
  };
  visit(scene);
}

export function endMirror(hidden) {
  for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
  hidden.length = 0;
}
