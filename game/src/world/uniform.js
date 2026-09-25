// 美军军帽：AGSU 常服大檐帽（军官款 / 士兵款）、教官的"护林熊"宽檐帽
//   帽子原点在头顶挂点（character.helmetSlot）附近，帽圈刚好箍在额头上
import * as THREE from 'three';
import * as TX from '../core/textures.js';

const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

// 金色帽徽：军官是展翅的老鹰，士兵是圆形铜徽
function badgeTexture(officer) {
  const S = 128, c = TX.makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#fff1b0'); g.addColorStop(0.45, '#d9a93a'); g.addColorStop(1, '#8a5e14');
  ctx.fillStyle = g; ctx.strokeStyle = '#6a4508'; ctx.lineWidth = 2;
  if (officer) {
    // 展翅老鹰（简化剪影）+ 胸前的小盾牌
    ctx.beginPath();
    ctx.moveTo(64, 30);
    ctx.bezierCurveTo(40, 20, 16, 30, 6, 58);
    ctx.bezierCurveTo(22, 52, 30, 60, 40, 62);
    ctx.bezierCurveTo(34, 74, 42, 86, 52, 90);
    ctx.lineTo(56, 108); ctx.lineTo(64, 100); ctx.lineTo(72, 108); ctx.lineTo(76, 90);
    ctx.bezierCurveTo(86, 86, 94, 74, 88, 62);
    ctx.bezierCurveTo(98, 60, 106, 52, 122, 58);
    ctx.bezierCurveTo(112, 30, 88, 20, 64, 30);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 24, 9, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4f0e0'; ctx.fillRect(56, 56, 16, 7);
    ctx.fillStyle = '#a8322a'; for (let i = 0; i < 4; i++) ctx.fillRect(56 + i * 4, 63, 2, 14);
    ctx.fillStyle = '#23407a'; ctx.fillRect(56, 50, 16, 6);
    // 羽毛纹理
    ctx.strokeStyle = 'rgba(110,70,10,0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(40 - i * 5, 50 + i); ctx.lineTo(52 - i * 3, 40 + i * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(88 + i * 5, 50 + i); ctx.lineTo(76 + i * 3, 40 + i * 2); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.arc(64, 64, 52, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(110,70,10,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 42, 0, 6.28); ctx.stroke();
    ctx.fillStyle = '#7a5210';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 13 : 30; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  }
  const t = TX.toTex(c, { wrap: false });
  return t;
}

// AGSU 大檐帽：深绿帽墙 + 略微前翘的帽顶、黑色亮面帽檐、金色帽带，校官帽檐上还有一排金色橡树叶
export function makeServiceCap({ officer = true, scale = 1 } = {}) {
  const cap = new THREE.Group();
  cap.name = officer ? 'serviceCapOfficer' : 'serviceCap';
  const wool = std('#3e3d2c', 0.88);
  const band = std('#2b2a1f', 0.8);
  const visorMat = std('#0c0c0d', 0.14, 0.1, { envMapIntensity: 1.4 });
  const gold = std('#d8b04a', 0.28, 0.95, { emissive: new THREE.Color('#3a2a06'), emissiveIntensity: 0.5 });
  const R = 0.1;
  // 帽墙：箍在额头上的一圈
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.03, R, 0.05, 36, 1, true), wool);
  wall.material.side = THREE.DoubleSide;
  wall.position.y = 0.025; cap.add(wall);
  // 帽墙下沿的深色饰带
  const bandM = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.012, R * 1.004, 0.03, 36, 1, true), band);
  bandM.position.y = 0.016; cap.add(bandM);
  // 帽顶：往外撑开的"碟子"，前面比后面高（大檐帽的精神气）
  const top = new THREE.Group(); top.position.set(0, 0.05, 0.004); top.rotation.x = -0.14; cap.add(top);
  const prof = [[R * 1.03, 0], [R * 1.2, 0.012], [R * 1.34, 0.028], [R * 1.36, 0.036], [R * 1.3, 0.042], [R * 0.9, 0.046], [0.001, 0.047]].map(([x, y]) => new THREE.Vector2(x, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), wool);
  crown.scale.set(1, 1, 1.08);
  top.add(crown);
  const under = new THREE.Mesh(new THREE.CircleGeometry(R * 1.3, 36), wool);
  under.rotation.x = Math.PI / 2; under.position.y = 0.012; under.scale.set(1, 1.08, 1); top.add(under);
  // 顶上的滚边
  const piping = new THREE.Mesh(new THREE.TorusGeometry(R * 1.355, 0.0035, 6, 48), wool);
  piping.rotation.x = Math.PI / 2; piping.position.y = 0.035; piping.scale.set(1, 1.08, 1); top.add(piping);
  // 帽檐：前半圈、往下压
  const vs = new THREE.Shape();
  const a0 = -1.25, a1 = 1.25, r0 = R * 0.98, r1 = R * 1.58;
  vs.moveTo(Math.sin(a0) * r0, Math.cos(a0) * r0);
  for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * (i / 24); vs.lineTo(Math.sin(a) * r1 * (1 - 0.1 * Math.abs(Math.sin(a)) ** 2), Math.cos(a) * r1 * 0.78 + r0 * 0.22); }
  for (let i = 24; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / 24); vs.lineTo(Math.sin(a) * r0, Math.cos(a) * r0); }
  const vg = new THREE.ExtrudeGeometry(vs, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 4 });
  vg.rotateX(Math.PI / 2);
  // 帽檐往下弯一点
  const vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) { const z = vp.getZ(i); if (z > r0) vp.setY(i, vp.getY(i) - (z - r0) ** 2 * 2.4); }
  vg.computeVertexNormals();
  const visor = new THREE.Mesh(vg, visorMat);
  visor.position.set(0, 0.004, 0); visor.rotation.x = 0.2; cap.add(visor);
  // 金色帽带（左右两颗小纽扣）
  const cord = new THREE.Mesh(new THREE.TorusGeometry(R * 1.04, 0.0032, 6, 32, 2.3), gold);
  cord.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.15); cord.position.y = 0.012; cord.scale.set(1, 1.02, 1); cap.add(cord);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), gold);
    b.position.set(s * Math.sin(1.15) * R * 1.05, 0.012, Math.cos(1.15) * R * 1.05); cap.add(b);
  }
  // 校官：帽檐上一排金色橡树叶（俗称"炒鸡蛋"）
  if (officer) {
    const leafG = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 13; i++) {
      const a = -1.0 + (2.0 * i) / 12, rr = R * 1.4;
      const z = Math.cos(a) * rr * 0.78 + r0 * 0.22;
      const l = new THREE.Mesh(leafG, gold);
      l.scale.set(0.011, 0.0022, 0.006);
      l.position.set(Math.sin(a) * rr * (1 - 0.1 * Math.abs(Math.sin(a)) ** 2), 0.0028 - Math.max(0, z - r0) ** 2 * 2.4, z);
      l.rotation.y = a + (i % 2 ? 0.6 : -0.6);
      visor.add(l);
    }
  }
  // 帽徽：帽墙正前方
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(officer ? 0.058 : 0.04, officer ? 0.058 : 0.04), new THREE.MeshStandardMaterial({ map: badgeTexture(officer), transparent: true, alphaTest: 0.3, roughness: 0.3, metalness: 0.9, emissive: new THREE.Color('#5a4010'), emissiveIntensity: 0.35 }));
  badge.position.set(0, 0.058, R * 1.16 + 0.004); badge.rotation.x = -0.28; cap.add(badge);
  cap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cap.scale.setScalar(scale);
  return cap;
}

// 教官的宽檐帽（"护林熊"帽）：宽平帽檐 + 捏出四个凹的尖顶 + 铜色帽徽
export function makeCampaignHat({ scale = 1 } = {}) {
  const hat = new THREE.Group();
  hat.name = 'campaignHat';
  const felt = std('#5a5236', 0.95);
  const leather = std('#2a1c12', 0.5);
  const brass = std('#b88a3a', 0.3, 0.9);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.006, 48), felt);
  brim.position.y = 0.008; hat.add(brim);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.0035, 5, 64), leather);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.008; hat.add(rim);
  // 帽冠：车床轮廓 + "蒙大拿捏"（前后左右四个凹）
  const prof = [[0.104, 0], [0.104, 0.03], [0.098, 0.07], [0.082, 0.105], [0.05, 0.13], [0.012, 0.142], [0.001, 0.143]].map(([x, y]) => new THREE.Vector2(x, y));
  const cg = new THREE.LatheGeometry(prof, 48);
  const p = cg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const h = Math.max(0, (y - 0.04) / 0.1);
    const dent = Math.pow(Math.abs(Math.cos(2 * a)), 3) * 0.3 * h;
    p.setX(i, x * (1 - dent)); p.setZ(i, z * (1 - dent));
  }
  cg.computeVertexNormals();
  const crown = new THREE.Mesh(cg, felt); crown.position.y = 0.01; hat.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.022, 40, 1, true), leather);
  band.position.y = 0.022; hat.add(band);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 20), brass);
  disc.rotation.x = Math.PI / 2 - 0.05; disc.position.set(0, 0.045, 0.106); hat.add(disc);
  hat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  hat.scale.setScalar(scale);
  return hat;
}
