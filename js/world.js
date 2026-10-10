import * as THREE from "../vendor/three.module.js";
import { COLORS } from "./levels.js";

const CRUMBLE_WARN = 0.8; // seconds a crumble key shakes before it drops
const CRUMBLE_GONE = 2.5; // seconds before it comes back

function shade(hex, amount) {
  return "#" + new THREE.Color(hex).offsetHSL(0, 0, amount).getHexString();
}

// Draws a keycap face: a rounded, slightly lighter dish with the label in the middle.
function keyTexture(label, w, d, color) {
  const scale = 64;
  const cw = Math.min(1024, Math.round(w * scale));
  const ch = Math.min(1024, Math.round(d * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = shade(color, -0.06);
  ctx.fillRect(0, 0, cw, ch);
  const m = Math.min(cw, ch) * 0.1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(m, m, cw - m * 2, ch - m * 2, m * 1.5);
  ctx.fill();
  if (label) {
    const size = Math.min(ch * 0.45, (cw * 1.4) / Math.max(2, label.length));
    ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(40, 40, 60, 0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cw / 2, ch / 2 + size * 0.05);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function signMesh({ text, sub }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20, 24, 48, 0.82)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 1008, 240, 48);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${sub ? 96 : 120}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.fillText(text, 512, sub ? 120 : 165);
  if (sub) {
    ctx.fillStyle = "#ffd166";
    ctx.font = `700 52px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.fillText(sub, 512, 205);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), mat);
}

function flagMesh() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  pole.position.y = 1.5;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.05), new THREE.MeshLambertMaterial({ color: 0x3ddc84 }));
  flag.position.set(0.6, 2.55, 0);
  g.add(pole, flag);
  g.userData.flag = flag;
  return g;
}

export class World {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    this.objects = []; // everything we add to the scene, so a level can be cleared away
    this.keys = course.keys.map((k) => this.makeKey(k));
    this.time = 0;

    for (const s of course.signs) {
      const m = signMesh(s);
      m.position.set(s.x, s.y, s.z);
      scene.add(m);
      this.objects.push(m);
    }

  }

  makeKey(def) {
    const color = COLORS[def.type] ?? this.course.stages[def.stage].color;
    const side = new THREE.MeshLambertMaterial({ color: shade(color, -0.12) });
    const topMat = new THREE.MeshLambertMaterial({ map: keyTexture(def.label, def.w, def.d, color) });
    if (def.type === "lava") {
      side.emissive = new THREE.Color(0xaa1100);
      topMat.emissive = new THREE.Color(0x661100);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), [side, side, topMat, side, side, side]);
    mesh.castShadow = def.type !== "lava";
    mesh.receiveShadow = true;
    if (def.blink) for (const m of [side, topMat]) m.transparent = true;
    this.scene.add(mesh);
    this.objects.push(mesh);

    const key = {
      ...def,
      mesh,
      base: new THREE.Vector3(def.x, def.top - def.h / 2, def.z),
      pos: new THREE.Vector3(def.x, def.top - def.h / 2, def.z),
      delta: new THREE.Vector3(),
      box: new THREE.Box3(),
      solid: def.type !== "lava",
      crumble: { state: "idle", t: 0 },
    };
    if (def.type === "checkpoint") {
      const flag = flagMesh();
      flag.position.set(def.w / 2 - 0.8, def.h / 2, -def.d / 2 + 0.8);
      mesh.add(flag);
      key.flag = flag;
    }
    this.place(key);
    return key;
  }

  place(key) {
    key.mesh.position.copy(key.pos);
    const half = new THREE.Vector3(key.w / 2, key.h / 2, key.d / 2);
    key.box.min.copy(key.pos).sub(half);
    key.box.max.copy(key.pos).add(half);
  }

  // Player stood on a crumble key: start its countdown.
  stepOn(key) {
    if (key.type === "crumble" && key.crumble.state === "idle") key.crumble = { state: "shaking", t: 0 };
  }

  // Fixed-step update: moving keys slide, crumble keys shake, drop and return.
  step(dt) {
    this.time += dt;
    for (const key of this.keys) {
      const before = key.pos.clone();
      if (key.move) {
        const { axis, amp, period, phase } = key.move;
        key.pos[axis] = key.base[axis] + Math.sin((this.time / period) * Math.PI * 2 + phase) * amp;
      }
      if (key.blink) {
        // Solid for `on` seconds, gone for `off` seconds; flickers just before it vanishes.
        const { on, off, phase } = key.blink;
        const t = (this.time + phase) % (on + off);
        key.solid = t < on;
        key.blinkWarn = key.solid && t > on - 0.5;
      }
      const c = key.crumble;
      if (c.state !== "idle") {
        c.t += dt;
        if (c.state === "shaking" && c.t > CRUMBLE_WARN) Object.assign(c, { state: "gone", t: 0 });
        if (c.state === "gone") {
          key.solid = false;
          key.pos.y = key.base.y - c.t * c.t * 20;
          key.mesh.visible = c.t < 1;
          if (c.t > CRUMBLE_GONE) {
            Object.assign(c, { state: "idle", t: 0 });
            key.pos.copy(key.base);
            key.solid = true;
            key.mesh.visible = true;
          }
        }
      }
      key.delta.subVectors(key.pos, before);
      this.place(key);
    }
  }

  // Per-frame visual touches that don't affect physics.
  animate() {
    for (const key of this.keys) {
      if (key.crumble.state === "shaking") {
        key.mesh.position.x += (Math.random() - 0.5) * 0.15;
        key.mesh.position.z += (Math.random() - 0.5) * 0.15;
      }
      if (key.blink) {
        const opacity = !key.solid ? 0.12 : key.blinkWarn ? (Math.sin(this.time * 40) > 0 ? 0.9 : 0.35) : 1;
        for (const m of new Set(key.mesh.material)) m.opacity = opacity;
      }
      if (key.flag) key.flag.userData.flag.rotation.y = Math.sin(this.time * 3 + key.cp) * 0.3;
      if (key.type === "lava") {
        const glow = 0.5 + 0.5 * Math.sin(this.time * 6);
        key.mesh.material[0].emissive.setRGB(0.5 + glow * 0.3, 0.05, 0);
      }
    }
  }

  // Remove this level from the scene and free its GPU memory.
  dispose() {
    for (const obj of this.objects) {
      obj.removeFromParent();
      obj.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) {
          m?.map?.dispose();
          m?.dispose();
        }
      });
    }
    this.objects = [];
    this.keys = [];
  }

  setCheckpointReached(cp) {
    for (const key of this.keys) {
      if (key.flag) key.flag.userData.flag.material.color.set(key.cp <= cp ? 0xffcc00 : 0x3ddc84);
    }
  }
}
