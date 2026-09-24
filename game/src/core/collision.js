// 俯视 2D 碰撞：角色是圆，家具/墙是轴对齐矩形
export class CollisionWorld {
  constructor() {
    this.boxes = [];
  }
  add(minX, maxX, minZ, maxZ, id = '') {
    const b = { minX, maxX, minZ, maxZ, id, enabled: true };
    this.boxes.push(b);
    return b;
  }
  addCentered(x, z, w, d, id = '') {
    return this.add(x - w / 2, x + w / 2, z - d / 2, z + d / 2, id);
  }
  setEnabled(id, v) {
    for (const b of this.boxes) if (b.id === id) b.enabled = v;
  }
  resolve(pos, r) {
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          } else {
            // 圆心在矩形内部：推向最近的边
            const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bb = b.maxZ - pos.z;
            const m = Math.min(l, rr, t, bb);
            if (m === l) pos.x = b.minX - r;
            else if (m === rr) pos.x = b.maxX + r;
            else if (m === t) pos.z = b.minZ - r;
            else pos.z = b.maxZ + r;
          }
        }
      }
    }
    return pos;
  }
}
