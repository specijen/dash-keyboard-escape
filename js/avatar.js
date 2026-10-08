import * as THREE from "../vendor/three.module.js";

// Everything the avatar picker offers. Add a colour or hat here and it appears in the menu.
export const OPTIONS = {
  skin: ["#ffcc33", "#f6d1b0", "#e0ac7e", "#b9825a", "#7a4e2d", "#8fd18f"],
  shirt: ["#2f80ed", "#eb3b3b", "#27ae60", "#9b51e0", "#ff7eb6", "#ff9f1a", "#222634", "#f2f2f2"],
  pants: ["#2b3a67", "#1b1b1f", "#7d8597", "#7a5230", "#c0392b", "#1e8449", "#d63384", "#e8e8e8"],
  hat: [
    { id: "none", label: "None" },
    { id: "cap", label: "Cap" },
    { id: "crown", label: "Crown" },
    { id: "tophat", label: "Top hat" },
    { id: "party", label: "Party" },
    { id: "bunny", label: "Bunny" },
  ],
  face: [
    { id: "smile", label: "Smile" },
    { id: "cool", label: "Cool" },
    { id: "wow", label: "Wow" },
    { id: "wink", label: "Wink" },
  ],
};

export const DEFAULT_LOOK = { name: "", skin: "#ffcc33", shirt: "#2f80ed", pants: "#2b3a67", hat: "none", face: "smile" };

export function randomLook(name = "") {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return {
    name,
    skin: pick(OPTIONS.skin),
    shirt: pick(OPTIONS.shirt),
    pants: pick(OPTIONS.pants),
    hat: pick(OPTIONS.hat).id,
    face: pick(OPTIONS.face).id,
  };
}

// Keep only values the picker knows about, so an old or hand-edited save can't break the avatar.
export function cleanLook(look) {
  const l = { ...DEFAULT_LOOK, ...(look || {}) };
  for (const key of ["skin", "shirt", "pants"]) if (!OPTIONS[key].includes(l[key])) l[key] = DEFAULT_LOOK[key];
  for (const key of ["hat", "face"]) if (!OPTIONS[key].some((o) => o.id === l[key])) l[key] = DEFAULT_LOOK[key];
  l.name = cleanName(l.name);
  return l;
}

export function cleanName(name) {
  return String(name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12);
}

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(color, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === "object" ? color : mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A limb that swings from its top end.
function limb(color, w, h, d, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(box(color, w, h, d, 0, -h / 2, 0));
  return pivot;
}

// Face features sit just in front of the head (head is 0.5 deep, so its front is z = 0.25).
function buildFace(id) {
  const g = new THREE.Group();
  const ink = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const f = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), ink);
    m.position.set(x, y, 0.26);
    g.add(m);
  };
  if (id === "cool") {
    f(0.46, 0.12, 0, 0.06); // sunglasses
    f(0.2, 0.04, 0, -0.12);
  } else if (id === "wow") {
    f(0.09, 0.09, -0.12, 0.07);
    f(0.09, 0.09, 0.12, 0.07);
    f(0.1, 0.12, 0, -0.12);
  } else if (id === "wink") {
    f(0.07, 0.11, -0.12, 0.05);
    f(0.11, 0.03, 0.12, 0.05);
    f(0.22, 0.04, 0, -0.11);
  } else {
    f(0.07, 0.11, -0.12, 0.05);
    f(0.07, 0.11, 0.12, 0.05);
    f(0.22, 0.04, 0, -0.11);
    f(0.04, 0.04, -0.12, -0.08);
    f(0.04, 0.04, 0.12, -0.08);
  }
  return g;
}

// Hats sit on top of the head (head top is y = 0.25 in head space).
function buildHat(id) {
  const g = new THREE.Group();
  if (id === "cap") {
    const red = mat("#eb3b3b");
    g.add(box(red, 0.6, 0.18, 0.56, 0, 0.33, 0));
    g.add(box(red, 0.5, 0.05, 0.3, 0, 0.26, 0.38));
  } else if (id === "crown") {
    const gold = new THREE.MeshLambertMaterial({ color: "#ffcc00", emissive: "#664400" });
    g.add(box(gold, 0.6, 0.14, 0.6, 0, 0.32, 0));
    for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24], [0, 0.24], [0, -0.24], [-0.24, 0], [0.24, 0]]) {
      g.add(box(gold, 0.1, 0.16, 0.1, x, 0.47, z));
    }
  } else if (id === "tophat") {
    const black = mat("#1b1b1f");
    g.add(box(black, 0.74, 0.05, 0.74, 0, 0.27, 0));
    g.add(box(black, 0.46, 0.46, 0.46, 0, 0.52, 0));
    g.add(box(mat("#eb3b3b"), 0.47, 0.08, 0.47, 0, 0.33, 0));
  } else if (id === "party") {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 12), mat("#ff7eb6"));
    cone.position.y = 0.55;
    cone.castShadow = true;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat("#ffcc00"));
    pom.position.y = 0.87;
    g.add(cone, pom);
  } else if (id === "bunny") {
    const white = mat("#f8f8f8");
    const pink = mat("#ff9ec4");
    for (const x of [-0.13, 0.13]) {
      const ear = box(white, 0.13, 0.5, 0.08, x, 0.5, 0);
      ear.add(box(pink, 0.07, 0.38, 0.02, 0, 0, 0.045));
      ear.rotation.z = x < 0 ? 0.12 : -0.12;
      g.add(ear);
    }
  }
  return g;
}

export function buildAvatar(look) {
  const l = cleanLook(look);
  const g = new THREE.Group();
  const legL = limb(l.pants, 0.38, 0.8, 0.4, -0.2, 0.8);
  const legR = limb(l.pants, 0.38, 0.8, 0.4, 0.2, 0.8);
  const armL = limb(l.skin, 0.3, 0.75, 0.3, -0.56, 1.58);
  const armR = limb(l.skin, 0.3, 0.75, 0.3, 0.56, 1.58);
  // Short sleeves in the shirt colour.
  armL.add(box(l.shirt, 0.32, 0.26, 0.32, 0, -0.12, 0));
  armR.add(box(l.shirt, 0.32, 0.26, 0.32, 0, -0.12, 0));
  const torso = box(l.shirt, 0.8, 0.8, 0.45, 0, 1.2, 0);
  const head = box(l.skin, 0.55, 0.5, 0.5, 0, 1.86, 0);
  head.add(buildFace(l.face), buildHat(l.hat));
  g.add(legL, legR, armL, armR, torso, head);
  if (l.name) g.add(nameTag(l.name));
  g.userData = { legL, legR, armL, armR };
  return g;
}

// The player's name floating above their head; always faces the camera.
function nameTag(name) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `800 64px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(name).width) + 56;
  canvas.width = w;
  canvas.height = 96;
  ctx.font = font;
  ctx.fillStyle = "rgba(20, 24, 48, 0.7)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 96, 40);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, w / 2, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const height = 0.42;
  sprite.scale.set((height * w) / 96, height, 1);
  sprite.position.y = 3.05;
  sprite.renderOrder = 10;
  return sprite;
}
