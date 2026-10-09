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

// A short burst of noise, shaped like the snap of a key switch. Made once, reused.
let noise = null;
function noiseBuffer() {
  if (!noise) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return noise;
}

function snap(t, freq, volume, length) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + length + 0.01);
}

// Mechanical keyboard "clack" for landing on a key: the switch click, the key
// bottoming out ("thock"), then a quieter rattle. Bigger keys sound deeper;
// harder landings are louder. A little randomness so no two presses match.
function keyClick(key, impact = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const area = key ? key.w * key.d : 20;
  const size = Math.min(2.6, Math.max(0.8, Math.sqrt(area / 20)));
  const v = 0.32 * Math.min(1.3, impact);
  const pitch = 1 + (Math.random() - 0.5) * 0.12;

  snap(t, (3800 * pitch) / size, v, 0.035);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  const f = (230 * pitch) / size;
  body.type = "triangle";
  body.frequency.setValueAtTime(f * 1.7, t);
  body.frequency.exponentialRampToValueAtTime(f, t + 0.03);
  bodyGain.gain.setValueAtTime(v * 0.9, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07 * size);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(t);
  body.stop(t + 0.08 * size + 0.02);

  snap(t + 0.022 + Math.random() * 0.01, (2400 * pitch) / size, v * 0.35, 0.025);
}

export const sfx = {
  keyClick,
  jump: () => tone(300, 600, 0.15),
  bounce: () => tone(200, 1200, 0.35, { type: "triangle", volume: 0.15 }),
  die: () => tone(500, 80, 0.45, { type: "sawtooth", volume: 0.06 }),
  plus: () => tone(900, 1300, 0.06, { type: "sine", volume: 0.05 }),
  checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.18, { type: "triangle", volume: 0.12, delay: i * 0.09 })),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.22, { type: "triangle", volume: 0.14, delay: i * 0.12 })),
};
