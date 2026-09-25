// 键鼠 + 触屏输入
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.dragging = false;
    this.mouseClicked = false;
    this.sensitivity = 1;
    this.enabled = true;
    this.touch = { active: false, moveX: 0, moveY: 0, lookId: null, moveId: null, lastX: 0, lastY: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      } else if (this.dragging) {
        this.dx += (e.movementX || 0) * 1.3;
        this.dy += (e.movementY || 0) * 1.3;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        if (this.locked) this.mouseClicked = true;
        else this.dragging = true;
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 某些环境不支持指针锁定，退化为拖拽视角 */ }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  anyHit(...codes) { return codes.some((c) => this.hit(c)); }

  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.touch.active) { x += this.touch.moveX; y += this.touch.moveY; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const r = { x: this.dx * this.sensitivity, y: this.dy * this.sensitivity };
    this.dx = 0; this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }

  // 触屏：左半屏虚拟摇杆，右半屏拖动视角
  bindTouch(stickEl, knobEl) {
    const t = this.touch;
    const base = { x: 0, y: 0 };
    const R = 55;
    const onStart = (e) => {
      for (const touch of e.changedTouches) {
        const target = touch.target;
        if (target.closest && target.closest('.tbtn, .overlay, .modal, #hud-inventory, button, input')) continue;
        if (touch.clientX < window.innerWidth * 0.45 && t.moveId === null) {
          t.moveId = touch.identifier;
          base.x = touch.clientX; base.y = touch.clientY;
          stickEl.style.display = 'block';
          stickEl.style.left = `${base.x - 70}px`; stickEl.style.top = `${base.y - 70}px`;
          knobEl.style.transform = 'translate(0px,0px)';
          t.active = true;
        } else if (t.lookId === null) {
          t.lookId = touch.identifier;
          t.lastX = touch.clientX; t.lastY = touch.clientY;
        }
      }
    };
    const onMove = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === t.moveId) {
          let dx = touch.clientX - base.x, dy = touch.clientY - base.y;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
          knobEl.style.transform = `translate(${dx}px,${dy}px)`;
          t.moveX = dx / R; t.moveY = -dy / R;
          e.preventDefault();
        } else if (touch.identifier === t.lookId) {
          this.dx += (touch.clientX - t.lastX) * 2.2;
          this.dy += (touch.clientY - t.lastY) * 2.2;
          t.lastX = touch.clientX; t.lastY = touch.clientY;
          e.preventDefault();
        }
      }
    };
    const onEnd = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === t.moveId) {
          t.moveId = null; t.moveX = 0; t.moveY = 0; t.active = false;
          stickEl.style.display = 'none';
        } else if (touch.identifier === t.lookId) {
          t.lookId = null;
        }
      }
    };
    window.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }

  press(code) {
    this.pressed.add(code);
  }
  // 触屏上"按住"的按钮
  hold(code, v) {
    if (v) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); } else this.keys.delete(code);
  }
}
