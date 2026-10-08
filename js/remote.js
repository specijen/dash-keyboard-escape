import * as THREE from "../vendor/three.module.js";
import { buildAvatar, disposeAvatar, poseLimbs } from "./avatar.js";

const PREDICT = 0.35; // seconds we'll guess ahead from the last update before waiting

// The other players in the room: built from their presence (name + look), moved by their
// position updates, and smoothed so they glide between the few updates a second we get.
export class Remotes {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
  }

  // roster: [{ id, name, look }] including ourselves.
  sync(roster, myId) {
    const ids = new Set();
    for (const p of roster) {
      if (!p?.id || p.id === myId) continue;
      ids.add(p.id);
      const key = JSON.stringify([p.name, p.look]);
      let r = this.players.get(p.id);
      if (!r) {
        r = { last: null, at: 0, pos: null, facing: 0, stride: 0 };
        this.players.set(p.id, r);
      }
      if (r.key !== key) {
        if (r.mesh) disposeAvatar(r.mesh);
        r.mesh = buildAvatar({ ...p.look, name: p.name || "Player" });
        r.mesh.visible = !!r.pos;
        this.scene.add(r.mesh);
        r.key = key;
      }
    }
    for (const [id, r] of this.players) {
      if (!ids.has(id)) {
        if (r.mesh) disposeAvatar(r.mesh);
        this.players.delete(id);
      }
    }
  }

  // s: { id, p: [x, y, z], v: [vx, vy, vz], f: facing, g: grounded }
  update(s) {
    const r = this.players.get(s?.id);
    if (!r || !Array.isArray(s.p) || !Array.isArray(s.v)) return;
    r.last = s;
    r.at = performance.now();
    const target = new THREE.Vector3(...s.p);
    if (!r.pos || r.pos.distanceTo(target) > 10) r.pos = target.clone(); // first sight or respawn
    r.mesh.visible = true;
  }

  animate(dt) {
    const now = performance.now();
    for (const r of this.players.values()) {
      if (!r.last || !r.pos) continue;
      const age = Math.min((now - r.at) / 1000, PREDICT);
      const [x, y, z] = r.last.p;
      const [vx, vy, vz] = r.last.v;
      const want = new THREE.Vector3(x + vx * age, r.last.g ? y : y + vy * age - 20 * age * age, z + vz * age);
      r.pos.lerp(want, 1 - Math.exp(-14 * dt));
      r.mesh.position.copy(r.pos);
      let diff = r.last.f - r.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.facing += diff * (1 - Math.exp(-12 * dt));
      r.mesh.rotation.y = r.facing;
      const hs = Math.hypot(vx, vz);
      if (r.last.g) r.stride += dt * Math.min(hs, 20) * 1.2;
      poseLimbs(r.mesh, r.last.g, hs, r.stride);
    }
  }

  get count() {
    return this.players.size;
  }

  clear() {
    for (const r of this.players.values()) if (r.mesh) disposeAvatar(r.mesh);
    this.players.clear();
  }
}
