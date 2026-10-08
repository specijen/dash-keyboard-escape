// The course, as plain data. Each key is a box described by its top-centre:
//   x, z      centre on the ground plane (the course runs towards -z)
//   top       height of the top face (what the player stands on)
//   w, d, h   width (x), depth (z) and thickness
//   type      normal | crumble | moving | lava | bounce | checkpoint | finish
// Edit numbers here to change the course; the world builds itself from this list.

export const STAGES = [
  { name: "Start", color: "#f4f1ea" },
  { name: "Letter Row", color: "#f4f1ea" },
  { name: "Number Row", color: "#cfe8ff" },
  { name: "Spacebar Bridge", color: "#e9ddff" },
  { name: "Dash Gaps", color: "#d7f5dd" },
  { name: "F-Key Tower", color: "#ffe1cc" },
];

export const COLORS = {
  crumble: "#ffd166",
  moving: "#b794f6",
  lava: "#ff3b30",
  bounce: "#4ea8ff",
  checkpoint: "#3ddc84",
  finish: "#ffcc00",
};

export function buildCourse() {
  const keys = [];
  const signs = [];
  let stage = 0;
  let cursor = 0; // the far (-z) edge of the last key placed

  const key = (o) => {
    const k = { w: 3, d: 3, h: 2, x: 0, top: 0, type: "normal", label: "", stage, ...o };
    keys.push(k);
    return k;
  };
  // Place the next key `gap` units beyond the previous one along the course.
  const next = (gap, o) => {
    const d = o.d ?? 3;
    const z = cursor - gap - d / 2;
    cursor = z - d / 2;
    return key({ ...o, d, z });
  };
  const sign = (text, x, y, z, sub = "") => signs.push({ text, sub, x, y, z });

  // Start pad
  key({ x: 0, z: 0, top: 0, w: 12, d: 10, label: "START", type: "checkpoint", cp: 0 });
  cursor = -5;

  // Stage 1 — Letter Row: friendly hops, gently climbing.
  stage = 1;
  [..."QWERTYUIOP"].forEach((ch, i) => {
    next(i < 3 ? 1.2 : 1.8, { x: Math.sin(i * 0.8) * 2.5, top: i * 0.3, label: ch });
  });
  let top = 9 * 0.3 + 0.3;

  // Stage 2 — Number Row: keys that crumble and keys that slide.
  stage = 2;
  next(1.8, { w: 9, d: 5, top, label: "SHIFT", type: "checkpoint", cp: 1 });
  const numberRow = [
    ["1", "normal"], ["2", "crumble"], ["3", "crumble"], ["4", "moving", 3, 3.0],
    ["5", "normal"], ["6", "moving", 4, 2.6], ["7", "crumble"], ["8", "moving", 4, 2.2],
    ["9", "crumble"], ["0", "normal"],
  ];
  numberRow.forEach(([label, type, amp, period], i) => {
    const o = { top, label, type };
    if (type === "moving") o.move = { axis: "x", amp, period, phase: i };
    next(1.8, o);
  });

  // Stage 3 — Spacebar Bridge: hop the red keys, then the Enter key launches you up.
  stage = 3;
  next(1.8, { w: 9, d: 5, top, label: "CTRL", type: "checkpoint", cp: 2 });
  const bridge = next(0, { w: 4.5, d: 30, top, label: "SPACE" });
  const bridgeStart = bridge.z + 15;
  [7, 15, 23].forEach((dz, i) => {
    const o = { x: 0, z: bridgeStart - dz, top: top + 0.6, w: 4.5, d: 1, h: 0.6, type: "lava", label: "" };
    if (i === 1) Object.assign(o, { w: 2, move: { axis: "x", amp: 1.25, period: 2.4, phase: 0 } });
    key(o);
  });
  next(0, { w: 4.5, d: 5, top, label: "ENTER", type: "bounce" });
  sign("Bounce!", 0, top + 4, cursor + 2.5);
  top += 6;

  // Stage 4 — Dash Gaps: only fast runners make the long jumps.
  stage = 4;
  next(0, { w: 9, d: 5, h: 8, top, label: "ALT", type: "checkpoint", cp: 3 });
  next(0, { w: 4.5, d: 12, top, label: "TAB" });
  const gaps = [
    [5, 0], [8, 30], [11, 60],
  ];
  gaps.forEach(([gap, need], i) => {
    sign(need ? `Need ⚡${need}+` : "Run and jump!", 0, top + 5, cursor + 1, need ? "Not enough? Run laps to power up!" : "");
    next(gap, { w: 4.5, d: 6, top, label: ["HOME", "END", "PG UP"][i] });
  });
  next(0, { w: 9, d: 5, top, label: "FN", type: "checkpoint", cp: 4 });
  next(0, { w: 4.5, d: 10, top, label: "INS" });
  sign("Need ⚡90+", 0, top + 5, cursor + 1, "The biggest gap of all!");
  next(14, { w: 6, d: 8, top, label: "DEL" });

  // Stage 5 — F-Key Tower: climb the zig-zag stairs to the Escape key.
  stage = 5;
  next(1, { w: 9, d: 5, top, label: "CAPS", type: "checkpoint", cp: 5 });
  for (let i = 1; i <= 12; i++) {
    top += 1.4;
    next(0.6, { x: (i % 2 ? 1 : -1) * 2.5, top, label: `F${i}`, move: i % 4 === 0 ? { axis: "x", amp: 2, period: 3, phase: i } : undefined, type: i % 4 === 0 ? "moving" : "normal" });
  }
  top += 1;
  next(1.5, { w: 8, d: 8, top, h: 3, label: "ESC", type: "finish" });
  sign("ESCAPE!", 0, top + 5, cursor + 4);

  const checkpoints = keys.filter((k) => k.type === "checkpoint").sort((a, b) => a.cp - b.cp);
  const lowest = Math.min(...keys.map((k) => k.top));
  return { keys, signs, checkpoints, killY: lowest - 25 };
}
