// Keyboard + mouse on computers; a floating joystick (left side), camera drag
// (right side) and a JUMP button on touch screens.

const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
]);
const STICK_RADIUS = 60;

export class Input {
  constructor(canvas, ui) {
    this.keys = new Set();
    this.jumpQueued = false;
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.dragId = null;
    this.last = { x: 0, y: 0 };
    this.ui = ui;
    this.enabled = false;

    addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.code === "Space" && !e.repeat) this.jumpQueued = true;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.release());

    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      const isTouch = e.pointerType !== "mouse";
      if (isTouch && e.clientX < innerWidth * 0.45 && this.stick.id === null) {
        Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
        ui.stick.style.transform = `translate(${e.clientX - 70}px, ${e.clientY - 70}px)`;
        ui.stick.classList.add("active");
        ui.knob.style.transform = "translate(0px, 0px)";
      } else if (this.dragId === null) {
        this.dragId = e.pointerId;
        this.last = { x: e.clientX, y: e.clientY };
      } else return;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.ox;
        let dy = e.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) {
          dx *= STICK_RADIUS / len;
          dy *= STICK_RADIUS / len;
        }
        this.stick.x = dx / STICK_RADIUS;
        this.stick.y = -dy / STICK_RADIUS;
        ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.dragId) {
        this.look.x += e.clientX - this.last.x;
        this.look.y += e.clientY - this.last.y;
        this.last = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stick.id) {
        Object.assign(this.stick, { id: null, x: 0, y: 0 });
        ui.stick.classList.remove("active");
      }
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom += e.deltaY;
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    ui.jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.enabled) this.jumpQueued = true;
    });

    // Stop iPad Safari from zooming or scrolling the page mid-game.
    for (const type of ["gesturestart", "gesturechange", "dblclick"]) {
      document.addEventListener(type, (e) => e.preventDefault());
    }
    document.addEventListener("touchmove", (e) => {
      if (!e.target.closest?.(".overlay")) e.preventDefault();
    }, { passive: false });
  }

  release() {
    this.keys.clear();
    Object.assign(this.stick, { id: null, x: 0, y: 0 });
    this.ui.stick.classList.remove("active");
    this.dragId = null;
    this.jumpQueued = false;
  }

  // Movement in camera space: y is forward, x is right. Length is at most 1.
  move() {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (this.stick.id !== null) {
      x = this.stick.x;
      y = this.stick.y;
    }
    // Shift walks, for careful hops once you're really fast.
    if (k.has("ShiftLeft") || k.has("ShiftRight")) {
      x *= 0.4;
      y *= 0.4;
    }
    return { x, y, mag: Math.hypot(x, y) };
  }

  // Q/E turn the camera from the keyboard.
  turn() {
    return (this.keys.has("KeyE") ? 1 : 0) - (this.keys.has("KeyQ") ? 1 : 0);
  }

  takeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  takeLook() {
    const l = { ...this.look, zoom: this.zoom };
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    return l;
  }
}
