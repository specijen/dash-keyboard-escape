import * as THREE from "../vendor/three.module.js";
import { COLORS } from "./levels.js";

const CRUMBLE_WARN = 0.8; // seconds a crumble key shakes before it drops
const POP_WARN = 0.45; // bubble keys pop a little faster
const PRESS_DEPTH = 0.3; // how far a keycap sinks when you stand on it
const SWITCH_COLORS = { red: "#e5383b", brown: "#9c6644", blue: "#3a86ff" };
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

// Boxes come with one draw call per face; a key only needs two (its top, and everything else).
// Reorders the faces into [sides, top] so the GPU draws each key in two calls instead of six.
function topAndSides(geo) {
  const idx = geo.index.array;
  const sides = [];
  const top = [];
  for (const g of geo.groups) {
    const part = Array.from(idx.subarray(g.start, g.start + g.count));
    (g.materialIndex === 2 ? top : sides).push(...part);
  }
  geo.setIndex([...sides, ...top]);
  geo.clearGroups();
  geo.addGroup(0, sides.length, 0);
  geo.addGroup(sides.length, top.length, 1);
  return geo;
}

// One-colour shapes don't need their faces drawn separately at all.
function solid(geo) {
  geo.clearGroups();
  return geo;
}

// A keycap: sloped sides, so the bottom is wider than the top you stand on.
function keycapGeometry(w, h, d) {
  const g = new THREE.BoxGeometry(w + 0.5, h, d + 0.5);
  const pos = g.attributes.position;
  const sx = (w - 0.05) / (w + 0.5), sz = (d - 0.05) / (d + 0.5);
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setXYZ(i, pos.getX(i) * sx, pos.getY(i), pos.getZ(i) * sz);
  }
  g.computeVertexNormals();
  return topAndSides(g);
}

// A bubble-wrap bubble: a clear dome on a flat disc.
function bubbleMesh(w, h) {
  const g = new THREE.Group();
  const film = new THREE.MeshLambertMaterial({ color: "#cfefff", transparent: true, opacity: 0.55 });
  const disc = new THREE.Mesh(solid(new THREE.CylinderGeometry(w / 2, w / 2, h * 0.4, 24)), film);
  disc.position.y = -h * 0.3;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), film);
  dome.position.y = -h * 0.1; // the dome rises from the disc to the key's top
  dome.scale.y = (h * 0.6) / (w / 2);
  g.add(disc, dome);
  return { group: g, mats: [film] };
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
  const pole = new THREE.Mesh(solid(new THREE.CylinderGeometry(0.08, 0.08, 3, 8)), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  pole.position.y = 1.5;
  const flag = new THREE.Mesh(solid(new THREE.BoxGeometry(1.2, 0.8, 0.05)), new THREE.MeshLambertMaterial({ color: 0x3ddc84 }));
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
    this.events = []; // things that happened this step, for sounds and messages
    this.spell = course.spell ? { word: course.spell, progress: 0, done: false } : null;
    this.keys = course.keys.map((k) => this.makeKey(k));
    this.time = 0;
    if (course.stars) this.addStars();

    for (const s of course.signs) {
      const m = signMesh(s);
      m.position.set(s.x, s.y, s.z);
      scene.add(m);
      this.objects.push(m);
    }

  }

  makeKey(def) {
    const color = def.color ?? COLORS[def.type] ?? this.course.stages[def.stage].color;
    const side = new THREE.MeshLambertMaterial({ color: shade(color, -0.12) });
    const topMat = new THREE.MeshLambertMaterial({ map: keyTexture(def.label, def.w, def.d, color) });
    if (def.type === "lava") {
      side.emissive = new THREE.Color(0xaa1100);
      topMat.emissive = new THREE.Color(0x661100);
    }
    const keycap = this.course.keycaps && !def.plain && def.type !== "lava";
    let mesh;
    let cap = null;
    let mats = [side, topMat];
    if (def.pop) {
      const bubble = bubbleMesh(def.w, def.h);
      mesh = bubble.group;
      mats = bubble.mats;
    } else if (keycap) {
      // Keycap on top of a key switch, like a real mechanical keyboard.
      mesh = new THREE.Group();
      cap = new THREE.Mesh(keycapGeometry(def.w, def.h, def.d), [side, topMat]);
      cap.castShadow = cap.receiveShadow = true;
      mesh.add(cap);
    } else {
      mesh = new THREE.Mesh(topAndSides(new THREE.BoxGeometry(def.w, def.h, def.d)), [side, topMat]);
      mesh.castShadow = def.type !== "lava";
      mesh.receiveShadow = true;
    }
    if (def.blink || def.jelly) for (const m of mats) m.transparent = true;
    if (def.jelly) for (const m of mats) m.opacity = 0.85;
    this.scene.add(mesh);
    this.objects.push(mesh);

    const key = {
      ...def,
      mesh,
      mats,
      cap,
      topMat,
      base: new THREE.Vector3(def.x, def.top - def.h / 2, def.z),
      pos: new THREE.Vector3(def.x, def.top - def.h / 2, def.z),
      delta: new THREE.Vector3(),
      box: new THREE.Box3(),
      solid: def.type !== "lava",
      crumble: { state: "idle", t: 0 },
      // Level 3 keycaps sink when stood on and spring back up when you leave.
      pressable: keycap && !def.jelly && def.press !== false,
      pressOffset: 0,
      standT: -1,
      wobbleT: -9,
      gateDrop: 0,
    };
    if (keycap && !def.pop) {
      // The switch underneath: a dark housing with a coloured stem, softly backlit.
      const sw = new THREE.Group();
      const size = Math.min(def.w, def.d, 4) * 0.5;
      key.glowMat = new THREE.MeshLambertMaterial({ color: "#20232e", emissive: new THREE.Color("#000000") });
      const housing = new THREE.Mesh(solid(new THREE.BoxGeometry(size, 0.8, size)), key.glowMat);
      housing.position.y = -0.4 - 0.25;
      const stem = new THREE.Mesh(
        solid(new THREE.BoxGeometry(size * 0.3, 0.5, size * 0.3)),
        new THREE.MeshLambertMaterial({ color: SWITCH_COLORS[def.switch] ?? SWITCH_COLORS.brown }),
      );
      stem.position.y = 0;
      sw.add(housing, stem);
      key.housingY = -def.h / 2 - 0.25;
      sw.position.y = key.housingY;
      mesh.add(sw);
      key.housing = sw;
    }
    if (def.type === "checkpoint") {
      const flag = flagMesh();
      flag.position.set(def.w / 2 - 0.8, def.h / 2, -def.d / 2 + 0.8);
      mesh.add(flag);
      key.flag = flag;
    }
    this.place(key);
    return key;
  }

  addStars() {
    const n = 700;
    const points = new Float32Array(n * 3);
    const centre = this.course.keys[Math.floor(this.course.keys.length / 2)];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.08 + Math.random() * 0.9;
      const r = 260;
      points.set([Math.cos(a) * Math.cos(up) * r, Math.sin(up) * r, centre.z + Math.sin(a) * Math.cos(up) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
    this.scene.add(stars);
    this.objects.push(stars);
  }

  place(key) {
    key.mesh.position.copy(key.pos);
    const half = new THREE.Vector3(key.w / 2, key.h / 2, key.d / 2);
    key.box.min.copy(key.pos).sub(half);
    key.box.max.copy(key.pos).add(half);
  }

  // Called every physics step the player is standing on (or bouncing off) a key.
  stepOn(key) {
    key.standT = this.time;
    if (key.type === "crumble" && key.crumble.state === "idle") key.crumble = { state: "shaking", t: 0 };
    if (key.jelly && this.time - key.wobbleT > 0.3) key.wobbleT = this.time;
    // Typing puzzle: letters only count in the right order.
    const sp = this.spell;
    if (key.spell && sp && !sp.done && key.spell.i === sp.progress) {
      sp.progress += 1;
      key.lit = true;
      this.events.push({ type: "letter", progress: sp.progress, word: sp.word });
      if (sp.progress === sp.word.length) {
        sp.done = true;
        for (const k of this.keys) if (k.gate) k.opening = true;
        this.events.push({ type: "gate" });
      }
    }
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // Fixed-step update: moving keys slide, crumble keys shake, drop and return,
  // keycaps sink under you, gates open.
  step(dt) {
    this.time += dt;
    for (const key of this.keys) {
      const before = key.pos.clone();
      key.pos.copy(key.base);
      if (key.move) {
        const { axis, amp, period, phase } = key.move;
        key.pos[axis] += Math.sin((this.time / period) * Math.PI * 2 + phase) * amp;
      }
      if (key.pressable) {
        const pressed = this.time - key.standT < 0.03;
        const target = pressed ? -PRESS_DEPTH : 0;
        const speed = pressed ? 6 : 2.5; // snap down, spring back up
        const was = key.pressOffset;
        key.pressOffset += Math.max(-speed * dt, Math.min(speed * dt, target - key.pressOffset));
        if (was < -PRESS_DEPTH * 0.8 && !pressed && !key.released) {
          key.released = true;
          this.events.push({ type: "release", key });
        }
        if (pressed) key.released = false;
        key.pos.y += key.pressOffset;
      }
      if (key.opening && key.gateDrop < key.h + 0.5) {
        key.gateDrop = Math.min(key.h + 0.5, key.gateDrop + dt * 3);
        if (key.gateDrop > key.h * 0.6) key.solid = false;
      }
      key.pos.y -= key.gateDrop;
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
        if (c.state === "shaking" && c.t > (key.pop ? POP_WARN : CRUMBLE_WARN)) {
          Object.assign(c, { state: "gone", t: 0 });
          if (key.pop) this.events.push({ type: "pop", key });
        }
        if (c.state === "gone") {
          key.solid = false;
          if (key.pop) key.mesh.visible = false;
          else {
            key.pos.y = key.base.y - c.t * c.t * 20;
            key.mesh.visible = c.t < 1;
          }
          if (c.t > CRUMBLE_GONE) {
            Object.assign(c, { state: "idle", t: 0 });
            key.pos.copy(key.base);
            key.solid = true;
            key.mesh.visible = true;
            key.mesh.scale.setScalar(1);
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
        if (key.pop) {
          // Bubbles swell a little before they pop.
          const k = 1 + Math.min(1, key.crumble.t / POP_WARN) * 0.12;
          key.mesh.scale.set(k, 1 + (k - 1) * 1.5, k);
        } else {
          key.mesh.position.x += (Math.random() - 0.5) * 0.15;
          key.mesh.position.z += (Math.random() - 0.5) * 0.15;
        }
      }
      if (key.blink) {
        const opacity = !key.solid ? 0.12 : key.blinkWarn ? (Math.sin(this.time * 40) > 0 ? 0.9 : 0.35) : 1;
        for (const m of key.mats) m.opacity = opacity;
      }
      // The switch stays put while the keycap above it sinks.
      if (key.housing) key.housing.position.y = key.housingY - key.pressOffset;
      // Slow rainbow backlight drifting along the course.
      if (key.glowMat) key.glowMat.emissive.setHSL((this.time * 0.06 + key.base.z * 0.006 + 10) % 1, 0.9, 0.32);
      if (key.jelly) {
        const t = this.time - key.wobbleT;
        const w = t < 1.4 ? Math.sin(t * 20) * Math.exp(-t * 3.5) * 0.25 : 0;
        key.cap.scale.set(1 + w * 0.6, 1 - w, 1 + w * 0.6);
      }
      if (key.lit && !key.litDone) {
        key.litDone = true;
        key.topMat.emissive = new THREE.Color("#ffb703");
        key.topMat.emissiveIntensity = 0.55;
      }
      if (key.flag) key.flag.userData.flag.rotation.y = Math.sin(this.time * 3 + key.cp) * 0.3;
      if (key.type === "lava") {
        const glow = 0.5 + 0.5 * Math.sin(this.time * 6);
        key.mats[0].emissive.setRGB(0.5 + glow * 0.3, 0.05, 0);
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
