// The courses, as plain data. Each key is a box described by its top-centre:
//   x, z      centre on the ground plane (the course runs towards -z)
//   top       height of the top face (what the player stands on)
//   w, d, h   width (x), depth (z) and thickness
//   type      normal | crumble | moving | blink | lava | bounce | checkpoint | finish
//   move      { axis: "x" | "y" | "z", amp, period, phase } slides the key back and forth
//   blink     { on, off, phase } seconds the key is there, then seconds it's gone
// Edit numbers here to change a course; the world builds itself from these lists.

export const COLORS = {
  crumble: "#ffd166",
  moving: "#b794f6",
  blink: "#5ee6ff",
  lava: "#ff3b30",
  bounce: "#4ea8ff",
  checkpoint: "#3ddc84",
  finish: "#ffcc00",
};

// Shared helpers for laying out a course. `size` is the default key width and depth.
function builder(size) {
  const b = { keys: [], signs: [], stage: 0, cursor: 0 };
  b.key = (o) => {
    const k = { w: size, d: size, h: 2, x: 0, top: 0, type: "normal", label: "", stage: b.stage, ...o };
    b.keys.push(k);
    return k;
  };
  // Place the next key `gap` units beyond the previous one along the course.
  b.next = (gap, o) => {
    const d = o.d ?? size;
    const z = b.cursor - gap - d / 2;
    b.cursor = z - d / 2;
    return b.key({ ...o, d, z });
  };
  b.sign = (text, x, y, z, sub = "") => b.signs.push({ text, sub, x, y, z });
  b.done = (extra) => {
    const checkpoints = b.keys.filter((k) => k.type === "checkpoint").sort((p, q) => p.cp - q.cp);
    const lowest = Math.min(...b.keys.map((k) => k.top - (k.move?.axis === "y" ? k.move.amp : 0)));
    return { keys: b.keys, signs: b.signs, checkpoints, killY: lowest - 25, ...extra };
  };
  return b;
}

// ---- Level 1: Keyboard Escape ------------------------------------------------------------------
function buildLevel1() {
  const b = builder(4.5);
  const { key, next, sign } = b;

  // Start pad
  key({ x: 0, z: 0, top: 0, w: 12, d: 10, label: "START", type: "checkpoint", cp: 0 });
  b.cursor = -5;

  // Stage 1 — Letter Row: friendly hops, gently climbing.
  b.stage = 1;
  [..."QWERTYUIOP"].forEach((ch, i) => {
    next(i < 3 ? 1.2 : 1.5, { x: Math.sin(i * 0.8) * 2.5, top: i * 0.3, label: ch });
  });
  let top = 9 * 0.3 + 0.3;

  // Stage 2 — Number Row: keys that crumble and keys that slide.
  b.stage = 2;
  next(1.5, { w: 9, d: 5, top, label: "SHIFT", type: "checkpoint", cp: 1 });
  const numberRow = [
    ["1", "normal"], ["2", "crumble"], ["3", "crumble"], ["4", "moving", 3, 3.4],
    ["5", "normal"], ["6", "moving", 3.5, 3.0], ["7", "crumble"], ["8", "moving", 3.5, 2.6],
    ["9", "crumble"], ["0", "normal"],
  ];
  numberRow.forEach(([label, type, amp, period], i) => {
    const o = { top, label, type };
    if (type === "moving") o.move = { axis: "x", amp, period, phase: i };
    next(1.5, o);
  });

  // Stage 3 — Spacebar Bridge: hop the red keys, then the Enter key launches you up.
  b.stage = 3;
  next(1.5, { w: 9, d: 5, top, label: "CTRL", type: "checkpoint", cp: 2 });
  const bridge = next(0, { w: 6, d: 30, top, label: "SPACE" });
  const bridgeStart = bridge.z + 15;
  [7, 15, 23].forEach((dz, i) => {
    const o = { x: 0, z: bridgeStart - dz, top: top + 0.6, w: 6, d: 1, h: 0.6, type: "lava", label: "" };
    if (i === 1) Object.assign(o, { w: 2.5, move: { axis: "x", amp: 1.75, period: 2.4, phase: 0 } });
    key(o);
  });
  next(0, { w: 6, d: 5, top, label: "ENTER", type: "bounce" });
  sign("Bounce!", 0, top + 4, b.cursor + 2.5);
  top += 6;

  // Stage 4 — Dash Gaps: only fast runners make the long jumps.
  b.stage = 4;
  next(0, { w: 9, d: 5, h: 8, top, label: "ALT", type: "checkpoint", cp: 3 });
  next(0, { w: 6, d: 12, top, label: "TAB" });
  const gaps = [
    [5, 0], [8, 30], [11, 60],
  ];
  gaps.forEach(([gap, need], i) => {
    sign(need ? `Need ⚡${need}+` : "Run and jump!", 0, top + 5, b.cursor + 1, need ? "Not enough? Run laps to power up!" : "");
    next(gap, { w: 6, d: 7, top, label: ["HOME", "END", "PG UP"][i] });
  });
  next(0, { w: 9, d: 5, top, label: "FN", type: "checkpoint", cp: 4 });
  next(0, { w: 6, d: 10, top, label: "INS" });
  sign("Need ⚡90+", 0, top + 5, b.cursor + 1, "The biggest gap of all!");
  next(14, { w: 7, d: 9, top, label: "DEL" });

  // Stage 5 — F-Key Tower: climb the zig-zag stairs to the Escape key.
  b.stage = 5;
  next(1, { w: 9, d: 5, top, label: "CAPS", type: "checkpoint", cp: 5 });
  for (let i = 1; i <= 12; i++) {
    top += 1.4;
    next(0.5, { x: (i % 2 ? 1 : -1) * 2.5, top, label: `F${i}`, move: i % 4 === 0 ? { axis: "x", amp: 2, period: 3, phase: i } : undefined, type: i % 4 === 0 ? "moving" : "normal" });
  }
  top += 1;
  next(1.5, { w: 8, d: 8, top, h: 3, label: "ESC", type: "finish" });
  sign("ESCAPE!", 0, top + 5, b.cursor + 4);

  return b.done({
    sky: "#8fd3ff",
    stages: [
      { name: "Start", color: "#f4f1ea" },
      { name: "Letter Row", color: "#f4f1ea" },
      { name: "Number Row", color: "#cfe8ff" },
      { name: "Spacebar Bridge", color: "#e9ddff" },
      { name: "Dash Gaps", color: "#d7f5dd" },
      { name: "F-Key Tower", color: "#ffe1cc" },
    ],
  });
}

// ---- Level 2: Numpad Nightmare (harder) ----------------------------------------------------------
// Smaller keys and longer hops, plus three new tricks: keys that blink in and out,
// elevator keys that ride up and down, and lava bars that sweep across the floor.
function buildLevel2() {
  const b = builder(3.6);
  const { key, next, sign } = b;

  key({ x: 0, z: 0, top: 0, w: 12, d: 10, label: "START", type: "checkpoint", cp: 0 });
  b.cursor = -5;
  sign("Numpad Nightmare", 0, 8, -6, "Level 2: smaller keys, trickier jumps!");

  // Stage 1 — Numpad Zig-Zag: hop left and right across the numpad, some keys crumble.
  b.stage = 1;
  let top = 0;
  const pad = [["7", -3], ["8", 0], ["9", 3], ["6", 3], ["5", 0, "crumble"], ["4", -3], ["1", -3], ["2", 0, "crumble"], ["3", 3]];
  pad.forEach(([label, x, type], i) => {
    top = 0.3 + i * 0.3;
    next(1.8, { x, top, label, type: type ?? "normal" });
  });
  next(1.8, { w: 7.5, top, label: "0" });

  // Stage 2 — Blinking Keys: each key vanishes for a moment. Watch the flicker, then go.
  b.stage = 2;
  next(1.5, { w: 9, d: 5, top, label: "NUM", type: "checkpoint", cp: 1 });
  sign("Blinking keys!", 0, top + 4.5, b.cursor + 1, "Jump when they're solid");
  ["+", "−", "×", "÷", "+", "−", "×", "÷"].forEach((label, i) => {
    next(2, { top, label, type: "blink", blink: { on: 1.9, off: 1.1, phase: (i % 2) * 1.5 } });
  });

  // Stage 3 — Elevators: ride the moving keys up to the next ledge.
  b.stage = 3;
  next(2, { w: 9, d: 5, top, label: "CLEAR", type: "checkpoint", cp: 2 });
  sign("Going up!", 0, top + 4.5, b.cursor + 1, "Ride the purple keys");
  for (let i = 0; i < 3; i++) {
    // The elevator travels between the ledge behind it and the next ledge, 5 higher.
    next(1.2, { w: 4.5, d: 4.5, top: top + 2.5, label: "↑", type: "moving", move: { axis: "y", amp: 2.5, period: 4.2, phase: i * 1.3 } });
    top += 5;
    next(1.2, { w: 6, d: 4, h: 6, top, label: ["PG UP", "HOME", "END"][i] });
  }

  // Stage 4 — Lava Sweep: lava bars slide across the backspace key. Dodge or jump them.
  b.stage = 4;
  next(0, { w: 9, d: 5, top, label: "PG DN", type: "checkpoint", cp: 3 });
  const floor = next(0, { w: 10, d: 26, top, label: "BACKSPACE" });
  const floorStart = floor.z + 13;
  [6, 12, 18].forEach((dz, i) => {
    key({ x: 0, z: floorStart - dz, top: top + 0.7, w: 3, d: 1.2, h: 0.7, type: "lava", move: { axis: "x", amp: 3.5, period: 3.2 - i * 0.3, phase: i * 2 } });
  });
  key({ x: 0, z: floorStart - 23, top: top + 0.7, w: 10, d: 1, h: 0.7, type: "lava" });
  // Then keys that slide forwards and back: time your jump for when they come close.
  ["↖", "↗", "↖"].forEach((label, i) => {
    next(3, { top, label, type: "moving", move: { axis: "z", amp: 1.5, period: 2.8, phase: i * 1.8 } });
  });

  // Stage 5 — Mega Gaps: even longer jumps. Build up Dash first!
  b.stage = 5;
  next(2.5, { w: 9, d: 5, top, label: "END", type: "checkpoint", cp: 4 });
  next(0, { w: 5, d: 12, top, label: "TAB" });
  sign("Need ⚡70+", 0, top + 5, b.cursor + 1, "Not enough? Run laps to power up!");
  next(12, { w: 5, d: 6, top, label: "PRT SC" });
  sign("Need ⚡110+", 0, top + 5, b.cursor + 1, "The mega gap!");
  next(16, { w: 6, d: 7, top, label: "SCR LK" });

  // Stage 6 — Arrow Key Climb: small steps that slide and blink, up to the POWER key.
  b.stage = 6;
  next(1, { w: 9, d: 5, top, label: "PAUSE", type: "checkpoint", cp: 5 });
  const arrows = ["↑", "←", "↓", "→", "↑", "←", "↓", "→"];
  arrows.forEach((label, i) => {
    top += 1.3;
    const o = { x: (i % 2 ? 1 : -1) * 2.2, top, label, w: 3.2, d: 3.2 };
    if (i % 3 === 1) Object.assign(o, { type: "moving", move: { axis: "x", amp: 1.8, period: 2.6, phase: i } });
    if (i % 3 === 2) Object.assign(o, { type: "blink", blink: { on: 2.2, off: 1, phase: i * 0.7 } });
    next(0.6, o);
  });
  top += 1;
  next(1.5, { w: 7, d: 7, top, h: 3, label: "POWER", type: "finish" });
  sign("YOU MADE IT!", 0, top + 5, b.cursor + 3.5);

  return b.done({
    sky: "#c3a8ff",
    stages: [
      { name: "Start", color: "#f4f1ea" },
      { name: "Numpad Zig-Zag", color: "#ffe3c2" },
      { name: "Blinking Keys", color: "#f4f1ea" },
      { name: "Elevators", color: "#ffd6e7" },
      { name: "Lava Sweep", color: "#ececec" },
      { name: "Mega Gaps", color: "#d7f5dd" },
      { name: "Arrow Key Climb", color: "#ffe1cc" },
    ],
  });
}

export const LEVELS = [
  { id: 1, name: "Keyboard Escape", tag: "Start here", build: buildLevel1 },
  { id: 2, name: "Numpad Nightmare", tag: "Harder! 🔥", build: buildLevel2 },
];

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
