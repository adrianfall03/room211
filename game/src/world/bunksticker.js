import * as THREE from 'three';
import portraitUrl from '../assets/bunk-portrait.jpg';
import { mulberry32 } from '../core/util.js';

// The supplied print stays intact; paper tint and physical wear belong to the scene.
export function createBunkSticker(worn = false) {
  const group = new THREE.Group();
  group.name = 'door-bunk-portrait';
  const map = new THREE.TextureLoader().load(portraitUrl);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const paper = new THREE.PlaneGeometry(0.42, 0.595, 32, 44);
  const pos = paper.attributes.position, uv = paper.attributes.uv;
  const rnd = mulberry32(21172);
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const edge = Math.min(u, v, 1 - u, 1 - v);
    const stain = worn ? 0.16 * Math.sin(u * 19 + v * 8) ** 2 + 0.15 * (1 - v) : 0.02 * rnd();
    const c = new THREE.Color(worn ? '#a68b43' : '#c7a94e').multiplyScalar(1 - stain);
    colors.push(c.r, c.g, c.b);
    // Lift the lower corner and ripple the paper; outer edges become brittle.
    if (worn) {
      const curl = Math.max(0, (u - 0.7) / 0.3) * Math.max(0, (0.25 - v) / 0.25);
      pos.setZ(i, 0.003 * Math.sin(u * 12 + v * 5) + 0.065 * curl * curl);
      if (edge < 0.03) pos.setXY(i, pos.getX(i) + (rnd() - 0.5) * 0.009, pos.getY(i) + (rnd() - 0.5) * 0.01);
    }
  }
  paper.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (worn) {
    const indices = [];
    for (let i = 0; i < paper.index.count; i += 3) {
      const ids = [0, 1, 2].map(k => paper.index.getX(i + k));
      const u = ids.reduce((s, j) => s + uv.getX(j), 0) / 3;
      const v = ids.reduce((s, j) => s + uv.getY(j), 0) / 3;
      const edge = Math.min(u, v, 1 - u, 1 - v);
      // Missing corners, edge chips and two short tears, away from the face.
      const torn = u < 0.14 && v > 0.87 + u * 0.6
        || u > 0.84 && v < (u - 0.84) * 0.65
        || u < 0.22 && Math.abs(v - 0.22 - u * 0.2) < 0.013
        || u > 0.8 && Math.abs(v - 0.71 + u * 0.08) < 0.013
        || edge < 0.025 && rnd() < 0.32;
      if (!torn) indices.push(...ids);
    }
    paper.setIndex(indices);
  }
  paper.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.98, side: THREE.DoubleSide });
  const print = new THREE.Mesh(paper, material);
  print.receiveShadow = true;
  group.add(print);
  if (worn) {
    // A thin dusty veil reduces ink contrast, following the same torn surface.
    const dust = new THREE.Mesh(paper.clone(), new THREE.MeshStandardMaterial({ color: '#b39a66', transparent: true, opacity: 0.17, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
    dust.position.z = 0.0007;
    group.add(dust);
  }
  group.rotation.z = worn ? -0.025 : -0.009;
  return group;
}
