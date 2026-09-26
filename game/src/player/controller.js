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
    // 失重（第五章）：float 0..1；floatY 离地高度，空格往上飘、C 往下沉
    this.float = 0;
    this.floatTarget = 0.3;
    this.t = 0;
  }

  get forward() { return _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  setMode(mode) {
    this.mode = mode;
    this.ch.setFirstPerson(mode === 'first');
  }
  toggleMode() { this.setMode(this.mode === 'third' ? 'first' : 'third'); }

  teleport(x, z, charYaw = null) {
    this.pos.set(x, this.float > 0 ? this.floatTarget : 0, z);
    this.vel.set(0, 0, 0);
    if (charYaw !== null) { this.charYaw = charYaw; this.yaw = charYaw + Math.PI; }
  }

  eyeHeight() {
    const crouchW = this.ch && this.anim.crouchW ? this.anim.crouchW : 0;
    return lerp(1.6, 1.08, crouchW);
  }

  update(dt, { allowMove = true, extra = {} } = {}) {
    const inp = this.input;
    this.t += dt;
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
      // 触屏没有 Shift：摇杆推到底就算跑（失重时就是飞得更快）
      wantRun = inp.down('ShiftLeft') || inp.down('ShiftRight') || (inp.touch.active && Math.hypot(inp.touch.moveX, inp.touch.moveY) > 0.92);
      if (this.float > 0.5) {
        // 失重：按住空格（触屏"▲上浮"）往上飘、按住 C（触屏"▼下沉"）往下沉；只点一下就直接飘到最高 / 沉到最低
        const upK = inp.down('Space'), dnK = inp.down('KeyC') || inp.down('ControlLeft');
        if (upK) this.floatTarget += dt * 1.5;
        else if (inp.hit('Space')) this.floatTarget = 1.15;
        if (dnK) this.floatTarget -= dt * 1.5;
        else if (inp.hit('KeyC')) this.floatTarget = 0.12;
        this.floatTarget = clamp(this.floatTarget, 0.12, 1.15);
        this.vHold = upK || dnK;
        this.crouch = false;
      } else if (inp.hit('KeyC')) this.crouch = !this.crouch;
    }
    const floating = this.float > 0.5;
    const crouching = !floating && (this.crouch || (allowMove && (inp.down('ControlLeft') || inp.down('ControlRight'))));
    const maxSpeed = floating ? (wantRun ? 2.2 : 1.15) : crouching ? 0.85 : wantRun ? 3.0 : 1.55;
    const l = Math.hypot(wishX, wishZ);
    const tx = l > 0.01 ? (wishX / Math.max(1, l)) * maxSpeed : 0;
    const tz = l > 0.01 ? (wishZ / Math.max(1, l)) * maxSpeed : 0;
    // 失重时有惯性：起步慢、停下来还会往前飘一段
    const accel = floating ? (l > 0.01 ? 2.6 : 1.1) : l > 0.01 ? 10 : 14;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.z = damp(this.vel.z, tz, accel, dt);
    if (!this.sitting) {
      // 失重时身子是缩着飘的，碰撞圆小一点：储藏室那种窄门也好钻过去
      const r = floating ? 0.17 : this.radius;
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.collision.resolve(this.pos, r);
      const b = this.bounds;
      this.pos.x = clamp(this.pos.x, b.minX + r, b.maxX - r);
      this.pos.z = clamp(this.pos.z, b.minZ + r, b.maxZ - r);
      // 撞到东西：失重时的惯性速度也跟着被挡掉，不然会一直顶在门框上"卡住"
      if (floating && dt > 0) {
        const ax = (this.pos.x - px) / dt, az = (this.pos.z - pz) / dt;
        if (Math.abs(ax) < Math.abs(this.vel.x) - 0.05) this.vel.x = ax;
        if (Math.abs(az) < Math.abs(this.vel.z) - 0.05) this.vel.z = az;
      }
    }
    this.pos.y = this.float > 0 ? damp(this.pos.y, this.floatTarget * this.float, this.vHold ? 5 : 2.6, dt) : 0;
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
      float: this.float,
      ...extra,
      ...(this.overrides || {}),
    };
    this.anim.crouchW = damp(this.anim.crouchW || 0, prm.crouch, 8, dt);
    this.ch.root.position.set(this.pos.x, this.pos.y + this.float * Math.sin(this.t * 1.1) * 0.03, this.pos.z);
    this.ch.root.rotation.z = this.float * Math.sin(this.t * 0.6) * 0.05;
    this.ch.root.rotation.y = this.charYaw;
    const ev = this.ch.update(dt, prm);
    if (ev === 'step' && this.audio && !floating) this.audio.footstep(speed > 2.2);
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
      const eye = (this.sitting ? 1.22 : lerp(1.62, 1.08, crouchW)) + this.pos.y;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      cam.position.set(this.pos.x + fx * 0.1 + Math.cos(this.yaw) * bobX, eye + bobY, this.pos.z + fz * 0.1 - Math.sin(this.yaw) * bobX);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.curDist = 0;
      return;
    }
    const h = Math.min(2.7, (this.sitting ? 1.25 : lerp(1.52, 1.02, crouchW)) + this.pos.y);
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
    final.y = Math.min(final.y, 2.86);
    cam.position.copy(final);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // 相机太近时隐藏头部，避免穿模
    const close = final.distanceTo(origin) < 0.42;
    this.ch.setFirstPerson(close);
  }
}
