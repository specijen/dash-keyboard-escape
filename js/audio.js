// Tiny synthesised sound effects — no audio files to download.

let ctx = null;
let muted = false;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(value) {
  muted = value;
}

function tone(freq, endFreq, duration, { type = "square", volume = 0.08, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  jump: () => tone(300, 600, 0.15),
  bounce: () => tone(200, 1200, 0.35, { type: "triangle", volume: 0.15 }),
  land: () => tone(140, 60, 0.08, { type: "triangle", volume: 0.12 }),
  die: () => tone(500, 80, 0.45, { type: "sawtooth", volume: 0.06 }),
  plus: () => tone(900, 1300, 0.06, { type: "sine", volume: 0.05 }),
  checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.18, { type: "triangle", volume: 0.12, delay: i * 0.09 })),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.22, { type: "triangle", volume: 0.14, delay: i * 0.12 })),
};
