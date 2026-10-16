// Tiny synthesised sound effects — no audio files to download.

let ctx = null;
let muted = false;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    if (wantAmbience) setAmbience(wantAmbience);
  } catch {
    ctx = null;
  }
}

export function setMuted(value) {
  muted = value;
  if (rain) rain.gain.gain.value = muted ? 0 : RAIN_VOLUME;
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
// Level 3 keycaps sit on real switch types, and each sounds different:
//   blue  = clicky (an extra sharp click), brown = soft tactile bump, red = smooth deep thock.
function keyClick(key, impact = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const area = key ? key.w * key.d : 20;
  const size = Math.min(2.6, Math.max(0.8, Math.sqrt(area / 20)));
  const v = 0.32 * Math.min(1.3, impact);
  const pitch = 1 + (Math.random() - 0.5) * 0.12;
  const sw = key?.switch;
  if (sw === "blue") {
    snap(t, 6200 * pitch, v * 0.9, 0.018);
    snap(t + 0.012, 5200 * pitch, v * 0.6, 0.015);
  }
  const clickVol = sw === "red" ? 0.35 : sw === "brown" ? 0.6 : 1;
  const deep = sw === "red" ? 0.8 : sw === "brown" ? 0.9 : 1;

  snap(t, (3800 * pitch) / size, v * clickVol, 0.035);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  const f = ((230 * pitch) / size) * (key?.switch ? deep : 1);
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

// The quieter "upstroke" as a keycap springs back up when you step off it.
function keyUp(key) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const size = Math.min(2.6, Math.max(0.8, Math.sqrt((key ? key.w * key.d : 20) / 20)));
  snap(t, (2900 + Math.random() * 300) / size, 0.07, 0.03);
  tone(170 / size, 140 / size, 0.05, { type: "triangle", volume: 0.05 });
}

// A soft electric-piano note: a sine with a gentle bell overtone that fades away.
function note(freq) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (const [mult, vol, len] of [[1, 0.11, 1.1], [2, 0.03, 0.6], [3.01, 0.015, 0.35]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
}

// Bubble wrap: a bright little pop with a puff of air.
function pop() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  snap(t, 1800 + Math.random() * 600, 0.28, 0.03);
  snap(t + 0.004, 600, 0.12, 0.05);
  tone(900 + Math.random() * 200, 300, 0.05, { type: "sine", volume: 0.08 });
}

// Jelly key: a wobbly "boing".
function jelly() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.35);
  lfo.frequency.value = 14;
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0.13, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.5);
  lfo.stop(t + 0.5);
}

// ---- Ambience: soft rain for the night-time level -------------------------------------------
const RAIN_VOLUME = 0.05;
let rain = null;
let wantAmbience = null;

function startRain() {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Pinkish noise with the odd louder drop, so it sounds like rain rather than static.
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
    data[i] = last * 6 + (Math.random() < 0.0004 ? (Math.random() - 0.5) * 1.5 : 0);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 2400;
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 250;
  const gain = ctx.createGain();
  gain.gain.value = muted ? 0 : RAIN_VOLUME;
  src.connect(low).connect(high).connect(gain).connect(ctx.destination);
  src.start();
  rain = { src, gain };
}

// "rain" or null. Safe to call before the first tap; it starts once sound is unlocked.
export function setAmbience(kind) {
  wantAmbience = kind;
  if (!ctx) return;
  if (kind === "rain" && !rain) startRain();
  if (kind !== "rain" && rain) {
    rain.src.stop();
    rain = null;
  }
}

export const sfx = {
  keyClick,
  keyUp,
  note,
  pop,
  jelly,
  jump: () => tone(300, 600, 0.15),
  bounce: () => tone(200, 1200, 0.35, { type: "triangle", volume: 0.15 }),
  die: () => tone(500, 80, 0.45, { type: "sawtooth", volume: 0.06 }),
  plus: () => tone(900, 1300, 0.06, { type: "sine", volume: 0.05 }),
  checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, f, 0.18, { type: "triangle", volume: 0.12, delay: i * 0.09 })),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.22, { type: "triangle", volume: 0.14, delay: i * 0.12 })),
};
