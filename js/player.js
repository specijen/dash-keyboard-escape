import * as THREE from "../vendor/three.module.js";

const HALF_W = 0.4;
const HEIGHT = 2.0;
const GRAVITY = 40;
const JUMP_SPEED = 16;
const BOUNCE_SPEED = 26;
const COYOTE = 0.12; // grace period to jump after running off an edge
const JUMP_BUFFER = 0.15; // a jump pressed just before landing still counts
const STEP_UP = 0.6; // small ledges are climbed automatically

function box(color, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

// A limb that swings from its top end.
function limb(color, w, h, d, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = box(color, w, h, d);
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}

function buildAvatar() {
  const g = new THREE.Group();
  const legL = limb(0x2b3a67, 0.38, 0.8, 0.4, -0.2, 0.8);
  const legR = limb(0x2b3a67, 0.38, 0.8, 0.4, 0.2, 0.8);
  const armL = limb(0xffcc33, 0.3, 0.75, 0.3, -0.56, 1.58);
  const armR = limb(0xffcc33, 0.3, 0.75, 0.3, 0.56, 1.58);
  const torso = box(0x2f80ed, 0.8, 0.8, 0.45);
  torso.position.y = 1.2;
  const head = box(0xffcc33, 0.55, 0.5, 0.5);
  head.position.y = 1.86;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.02), eyeMat);
    eye.position.set(x, 0.05, 0.26);
    head.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.02), eyeMat);
  smile.position.set(0, -0.11, 0.26);
  head.add(smile);
  g.add(legL, legR, armL, armR, torso, head);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = buildAvatar();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = 0;
    this.stride = 0;
  }

  spawn(at) {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.ground = null;
    this.jumpBuffer = 0;
  }

  get bounds() {
    return {
      min: { x: this.pos.x - HALF_W, y: this.pos.y, z: this.pos.z - HALF_W },
      max: { x: this.pos.x + HALF_W, y: this.pos.y + HEIGHT, z: this.pos.z + HALF_W },
    };
  }

  overlaps(b, grow = 0) {
    const p = this.bounds;
    const e = 1e-4 - grow;
    return (
      p.min.x < b.max.x - e && p.max.x > b.min.x + e &&
      p.min.y < b.max.y - e && p.max.y > b.min.y + e &&
      p.min.z < b.max.z - e && p.max.z > b.min.z + e
    );
  }

  // One fixed physics step. `move` is the stick/keys vector in camera space (length ≤ 1).
  // Pushes event names onto `events` for sounds and game logic.
  step(dt, move, yaw, speed, world, jumpPressed, events) {
    if (jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer -= dt;

    // Ride along with whatever we're standing on.
    if (this.ground && this.ground.solid) this.pos.add(this.ground.delta);

    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const tx = (fx * move.y + rx * move.x) * speed;
    const tz = (fz * move.y + rz * move.x) * speed;
    const a = 1 - Math.exp(-(this.grounded ? 14 : 5) * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      events.push("jump");
    }
    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -60);

    const wasGrounded = this.grounded;
    const fallSpeed = this.vel.y;
    this.grounded = false;
    this.ground = null;
    this.moveAxis("x", this.vel.x * dt, world, wasGrounded);
    this.moveAxis("z", this.vel.z * dt, world, wasGrounded);
    this.moveAxis("y", this.vel.y * dt, world, wasGrounded, events, fallSpeed);

    for (const key of world.keys) {
      if (key.type === "lava" && this.overlaps(key.box, 0.05)) {
        events.push("die");
        return;
      }
    }
    if (this.pos.y < world.course.killY) events.push("die");
  }

  moveAxis(axis, d, world, wasGrounded, events, fallSpeed) {
    this.pos[axis] += d;
    for (const key of world.keys) {
      if (!key.solid || !this.overlaps(key.box)) continue;
      const b = key.box;
      if (axis === "y") {
        if (d <= 0) {
          this.pos.y = b.max.y;
          this.land(key, world, events, fallSpeed);
        } else {
          this.pos.y = b.min.y - HEIGHT;
          this.vel.y = 0;
        }
        continue;
      }
      const rise = b.max.y - this.pos.y;
      if (wasGrounded && rise > 0 && rise <= STEP_UP) {
        this.pos.y = b.max.y;
        continue;
      }
      // Push out on whichever side our centre is on — robust even when a moving key hits us.
      this.pos[axis] = this.pos[axis] < key.pos[axis] ? b.min[axis] - HALF_W : b.max[axis] + HALF_W;
      this.vel[axis] = 0;
    }
  }

  land(key, world, events, fallSpeed) {
    if (key.type === "bounce") {
      this.vel.y = BOUNCE_SPEED;
      events.push("bounce");
      return;
    }
    if (fallSpeed < -12) events.push("land");
    this.vel.y = 0;
    this.grounded = true;
    this.ground = key;
    world.stepOn(key);
  }

  // Per-frame: position the avatar, face the way we're running, swing the limbs.
  animate(dt) {
    this.mesh.position.copy(this.pos);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * (1 - Math.exp(-15 * dt));
    }
    this.mesh.rotation.y = this.facing;
    const { legL, legR, armL, armR } = this.mesh.userData;
    if (this.grounded) {
      this.stride += dt * Math.min(hs, 20) * 1.2;
      const swing = Math.sin(this.stride) * Math.min(1, hs / 6) * 0.9;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing;
      armR.rotation.x = swing;
      armL.rotation.z = armR.rotation.z = 0;
    } else {
      legL.rotation.x = 0.5;
      legR.rotation.x = -0.3;
      armL.rotation.x = armR.rotation.x = -2.6;
      armL.rotation.z = -0.2;
      armR.rotation.z = 0.2;
    }
  }
}
