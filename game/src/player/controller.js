// 角色控制：移动、碰撞、第三/第一人称相机
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, lerp } from '../core/util.js';

const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
const _hit = new THREE.Vector3();

export class Controller {
  constructor({ camera, character, input, collision, camBoxes, bounds, audio }) {
    this.camera = camera;
    this.ch = character;
    this.input = input;
    this.collision = collision;
    this.camBoxes = camBoxes;
    this.bounds = bounds;
    this.audio = audio;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.15;
    this.charYaw = 0;
    this.mode = 'third';
    this.crouch = false;
    this.enabled = true;
    this.radius = 0.22;
    this.camDist = 1.65;
    this.curDist = 1.65;
    this.camPos = new THREE.Vector3();
    this.bob = 0;
    this.anim = { speed: 0 };
    this.overrides = null; // 由过场动画接管
    this.sitting = false;
    this.fpBlend = 0;
    this.sensitivity = 1;
    this.invertY = false;
  }

  get forward() { return _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  setMode(mode) {
    this.mode = mode;
    this.ch.setFirstPerson(mode === 'first');
  }
  toggleMode() { this.setMode(this.mode === 'third' ? 'first' : 'third'); }

  teleport(x, z, charYaw = null) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    if (charYaw !== null) { this.charYaw = charYaw; this.yaw = charYaw + Math.PI; }
  }

  eyeHeight() {
    const crouchW = this.ch && this.anim.crouchW ? this.anim.crouchW : 0;
    return lerp(1.6, 1.08, crouchW);
  }

  update(dt, { allowMove = true, extra = {} } = {}) {
    const inp = this.input;
    const look = inp.consumeLook();
    if (allowMove) {
      this.yaw -= look.x * 0.0023 * this.sensitivity;
      this.pitch -= look.y * 0.0023 * this.sensitivity * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, this.mode === 'first' ? -1.35 : -1.0, this.mode === 'first' ? 1.35 : 0.85);
    }
    // 移动
    let wishX = 0, wishZ = 0, wantRun = false;
    if (allowMove && !this.sitting) {
      const ax = inp.axis();
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      wishX = fx * ax.y + rx * ax.x;
      wishZ = fz * ax.y + rz * ax.x;
      wantRun = inp.down('ShiftLeft') || inp.down('ShiftRight');
      if (inp.hit('KeyC')) this.crouch = !this.crouch;
    }
    const crouching = this.crouch || (allowMove && (inp.down('ControlLeft') || inp.down('ControlRight')));
    const maxSpeed = crouching ? 0.85 : wantRun ? 3.0 : 1.55;
    const l = Math.hypot(wishX, wishZ);
    const tx = l > 0.01 ? (wishX / Math.max(1, l)) * maxSpeed : 0;
    const tz = l > 0.01 ? (wishZ / Math.max(1, l)) * maxSpeed : 0;
    const accel = l > 0.01 ? 10 : 14;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.z = damp(this.vel.z, tz, accel, dt);
    if (!this.sitting) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.collision.resolve(this.pos, this.radius);
      const b = this.bounds;
      this.pos.x = clamp(this.pos.x, b.minX + this.radius, b.maxX - this.radius);
      this.pos.z = clamp(this.pos.z, b.minZ + this.radius, b.maxZ - this.radius);
    }
    const speed = Math.hypot(this.vel.x, this.vel.z);
    // 朝向
    if (this.mode === 'first') {
      if (!this.sitting) this.charYaw = dampAngle(this.charYaw, this.yaw + Math.PI, 20, dt);
    } else if (speed > 0.15 && !this.sitting) {
      this.charYaw = dampAngle(this.charYaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    }
    // 角色动画
    const lookYaw = wrapAngle(this.yaw + Math.PI - this.charYaw);
    const prm = {
      speed: this.sitting ? 0 : speed,
      crouch: crouching && !this.sitting ? 1 : 0,
      sit: this.sitting ? 1 : 0,
      lookYaw: this.mode === 'third' ? (Math.abs(lookYaw) < 1.9 ? lookYaw : 0) : 0,
      lookPitch: this.mode === 'third' ? this.pitch * 0.5 : this.pitch * 0.3,
      holdPitch: this.pitch,
      ...extra,
      ...(this.overrides || {}),
    };
    this.anim.crouchW = damp(this.anim.crouchW || 0, prm.crouch, 8, dt);
    this.ch.root.position.set(this.pos.x, 0, this.pos.z);
    this.ch.root.rotation.y = this.charYaw;
    const ev = this.ch.update(dt, prm);
    if (ev === 'step' && this.audio) this.audio.footstep(speed > 2.2);
    this.anim.speed = speed;
    this._updateCamera(dt, speed);
  }

  _updateCamera(dt, speed) {
    const cam = this.camera;
    const crouchW = this.anim.crouchW || 0;
    if (this.mode === 'first') {
      this.bob += dt * speed * 5.2;
      const bobY = Math.sin(this.bob * 2) * 0.018 * Math.min(1, speed / 1.5);
      const bobX = Math.cos(this.bob) * 0.012 * Math.min(1, speed / 1.5);
      const eye = this.sitting ? 1.22 : lerp(1.62, 1.08, crouchW);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      cam.position.set(this.pos.x + fx * 0.1 + Math.cos(this.yaw) * bobX, eye + bobY, this.pos.z + fz * 0.1 - Math.sin(this.yaw) * bobX);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.curDist = 0;
      return;
    }
    const h = this.sitting ? 1.25 : lerp(1.52, 1.02, crouchW);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const shoulder = 0.24;
    const target = _v.set(this.pos.x + rx * shoulder, h, this.pos.z + rz * shoulder);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    let want = this.camDist;
    // 起点：头部中心（避免肩膀偏移点在家具里）
    const origin = new THREE.Vector3(this.pos.x, h, this.pos.z);
    const off = new THREE.Vector3().copy(target).sub(origin);
    _ray.origin.copy(origin);
    _ray.direction.copy(off.clone().add(dir.clone().multiplyScalar(want))).normalize();
    const total = off.clone().add(dir.clone().multiplyScalar(want)).length();
    let maxT = total;
    for (const b of this.camBoxes) {
      if (b.containsPoint(origin)) continue;
      const p = _ray.intersectBox(b, _hit);
      if (p) {
        const t = p.distanceTo(origin);
        if (t < maxT) maxT = t;
      }
    }
    const allowed = Math.max(0.25, maxT - 0.14);
    const ratio = Math.min(1, allowed / total);
    const desired = this.curDist > ratio ? ratio : damp(this.curDist, ratio, 4, dt);
    this.curDist = desired;
    const final = origin.clone().add(off.clone().add(dir.clone().multiplyScalar(want)).multiplyScalar(desired));
    // 与床架、墙面保持距离，避免镜头贴在蚊帐/床栏上
    const m = 0.16;
    for (const b of this.camBoxes) {
      if (b.min.y > 2.5) continue; // 天花板
      if (final.y < b.min.y - 0.05 || final.y > b.max.y + 0.05) continue;
      if (b.containsPoint(origin)) continue;
      const x0 = b.min.x - m, x1 = b.max.x + m, z0 = b.min.z - m, z1 = b.max.z + m;
      if (final.x > x0 && final.x < x1 && final.z > z0 && final.z < z1) {
        const dl = final.x - x0, dr = x1 - final.x, db = final.z - z0, df = z1 - final.z;
        const mn = Math.min(dl, dr, db, df);
        if (mn === dl) final.x = x0; else if (mn === dr) final.x = x1; else if (mn === db) final.z = z0; else final.z = z1;
      }
    }
    cam.position.copy(final);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // 相机太近时隐藏头部，避免穿模
    const close = final.distanceTo(origin) < 0.42;
    this.ch.setFirstPerson(close);
  }
}
