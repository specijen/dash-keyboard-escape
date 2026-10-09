import * as THREE from "../vendor/three.module.js";
import { buildCourse, STAGES } from "./levels.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Input } from "./input.js";
import { sfx, unlockAudio, setMuted } from "./audio.js";
import { OPTIONS, cleanLook, cleanName, randomLook } from "./avatar.js";
import { watchForUpdates } from "./update.js";
import { Multiplayer } from "./multiplayer.js";

const STEP = 1 / 120;
const BASE_SPEED = 8;
const SPEED_PER_DASH = 0.12;
const MAX_SPEED = 30;
const SAVE_KEY = "dash-keyboard-escape-v1";

const $ = (id) => document.getElementById(id);
const ui = {
  dash: $("dash"), plus: $("plus"), speed: $("speed"), stage: $("stage"), timer: $("timer"), toast: $("toast"),
  stick: $("stick"), knob: $("knob"), jump: $("jump"), menu: $("menu"), win: $("win"),
  play: $("play"), restart: $("restart"), reset: $("reset"), again: $("again"),
  sound: $("btn-sound"), back: $("btn-back"), pause: $("btn-pause"),
  winTime: $("win-time"), winBest: $("win-best"), winDash: $("win-dash"), winTitle: $("win-title"),
  update: $("update"), updateBtn: $("update-btn"),
  openMp: $("open-mp"), mp: $("mp"), mpOut: $("mp-out"), mpIn: $("mp-in"), mpHost: $("mp-host"), mpCode: $("mp-code"),
  mpJoin: $("mp-join"), mpError: $("mp-error"), mpRoom: $("mp-room"), mpStatus: $("mp-status"), mpPlayers: $("mp-players"),
  mpRace: $("mp-race"), mpWait: $("mp-wait"), mpPlay: $("mp-play"), mpLeave: $("mp-leave"), mpBack: $("mp-back"),
  roomChip: $("room-chip"), roomChipText: $("room-chip-text"), countdown: $("countdown"),
  raceResults: $("race-results"), winMenu: $("win-menu"), raceAgain: $("race-again"), winTag: $("win-tag"),
  avatar: $("avatar"), openAvatar: $("open-avatar"), name: $("name"), random: $("random"), avatarDone: $("avatar-done"),
};

// ---- Saved progress (per device) -------------------------------------------
const fresh = () => ({ dash: 0, cp: 0, runTime: 0, best: null, wins: 0, muted: false });
let save = fresh();
try {
  save = { ...save, ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") };
} catch {}
// `look` is only missing on a brand-new device; first Play opens the picker then.
if (save.look) save.look = cleanLook(save.look);
if (!(save.best >= 10)) save.best = null; // an old bug could save a near-zero best time
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}

// ---- Scene -------------------------------------------------------------------
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 60, 170);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8877cc, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
scene.add(sun, sun.target);

const course = buildCourse();
const world = new World(scene, course);
const player = new Player(scene, save.look);
const input = new Input(canvas, ui);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 75 : 60;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---- Camera ------------------------------------------------------------------
const cam = { yaw: 0, pitch: 0.42, dist: 11, target: new THREE.Vector3() };

function updateCamera(dt, snap = false) {
  if (state === "avatar") return previewCamera(dt);
  camera.clearViewOffset();
  const look = input.takeLook();
  cam.yaw -= look.x * 0.006 + input.turn() * 2.5 * dt;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.y * 0.005, 0.05, 1.3);
  cam.dist = THREE.MathUtils.clamp(cam.dist + look.zoom * 0.01, 5, 20);
  const want = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  if (snap) cam.target.copy(want);
  else cam.target.lerp(want, 1 - Math.exp(-12 * dt));
  const c = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * c * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * c * cam.dist,
  );
  camera.lookAt(cam.target);
  sun.position.copy(player.pos).add(new THREE.Vector3(12, 30, 8));
  sun.target.position.copy(player.pos);
}

// Close-up of the avatar's front, nudged so it isn't hidden behind the picker card.
function previewCamera(dt) {
  input.takeLook();
  const want = player.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
  cam.target.lerp(want, 1 - Math.exp(-8 * dt));
  const yaw = player.facing;
  const w = innerWidth, h = innerHeight;
  const dist = w > h ? 5.2 : 6.4;
  camera.position.set(
    cam.target.x + Math.sin(yaw) * dist,
    cam.target.y + 0.6,
    cam.target.z + Math.cos(yaw) * dist,
  );
  camera.lookAt(cam.target);
  if (w > h) camera.setViewOffset(w, h, w * 0.22, 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.2, w, h);
  sun.position.copy(player.pos).add(new THREE.Vector3(Math.sin(yaw) * 10, 20, Math.cos(yaw) * 10));
  sun.target.position.copy(player.pos);
}

// ---- Game state ----------------------------------------------------------------
let state = "menu"; // menu | avatar | lobby | countdown | playing | won
let moveTime = 0;
let shownStage = -1;
let toastTimer = 0;

const speed = () => Math.min(MAX_SPEED, BASE_SPEED + save.dash * SPEED_PER_DASH);

function toast(text, seconds = 1.8) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  toastTimer = seconds;
}

function respawn() {
  const k = course.checkpoints[save.cp] ?? course.checkpoints[0];
  player.spawn(new THREE.Vector3(k.x, k.top, k.z));
  cam.yaw = cam.resumeYaw = 0;
  updateCamera(0, true);
}

function renderHud() {
  ui.dash.textContent = save.dash;
  ui.speed.textContent = `Speed ${speed().toFixed(1)}`;
  const t = race?.phase === "running" ? (performance.now() - race.goAt) / 1000 : race?.phase === "finished" ? race.myTime : save.runTime;
  ui.timer.textContent = `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  ui.sound.textContent = save.muted ? "🔇" : "🔊";
}

function gainDash() {
  save.dash += 1;
  ui.plus.classList.remove("pop");
  void ui.plus.offsetWidth; // restart the CSS animation
  ui.plus.classList.add("pop");
  if (save.dash % 10 === 0) {
    sfx.plus();
    if (save.dash % 50 === 0) toast(`⚡ ${save.dash} Dash! You're getting fast!`);
  }
}

function physicsStep() {
  const move = input.move();
  const events = [];
  world.step(STEP);
  player.step(STEP, move, cam.yaw, speed(), world, input.takeJump(), events);

  if (move.mag > 0.3) {
    moveTime += STEP;
    if (moveTime >= 1) {
      moveTime -= 1;
      gainDash();
    }
  }
  save.runTime += STEP;

  for (const e of events) {
    if (e === "die") {
      sfx.die();
      toast("Oops! Back to the checkpoint");
      canvas.classList.remove("flash");
      void canvas.offsetWidth;
      canvas.classList.add("flash");
      respawn();
      return;
    }
    if (e === "click") sfx.keyClick(player.ground, player.impact);
    else sfx[e]?.();
  }

  const g = player.ground;
  if (!g) return;
  if (g.stage !== shownStage) {
    shownStage = g.stage;
    ui.stage.textContent = g.stage ? `Stage ${g.stage} · ${STAGES[g.stage].name}` : "Start";
  }
  if (g.type === "checkpoint" && g.cp > save.cp) {
    save.cp = g.cp;
    world.setCheckpointReached(save.cp);
    sfx.checkpoint();
    toast("Checkpoint saved! 🚩");
    persist();
  }
  if (g.type === "finish") win();
}

// ---- Menus -------------------------------------------------------------------------
function show(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function openMenu() {
  if (state === "countdown") return;
  // Close whatever screen we came from so the menu is never hidden underneath it.
  show(ui.mp, false);
  show(ui.win, false);
  if (state === "won") {
    // Leaving the win screen: start the next run from START, not on top of ESC.
    if (race?.phase === "finished") race = null;
    world.setCheckpointReached(0);
    respawn();
  }
  state = "menu";
  input.enabled = false;
  input.release();
  cam.resumeYaw = cam.yaw;
  ui.play.textContent = save.cp > 0 || save.runTime > 0 ? "Continue" : "Play";
  show(ui.menu, true);
  persist();
}

function play() {
  unlockAudio();
  if (!save.look) return openAvatar(true);
  show(ui.menu, false);
  show(ui.win, false);
  show(ui.mp, false);
  if (state === "menu" && cam.resumeYaw !== undefined) cam.yaw = cam.resumeYaw;
  state = "playing";
  input.enabled = true;
}

function startOver() {
  save.cp = 0;
  save.runTime = 0;
  world.setCheckpointReached(0);
  respawn();
  persist();
}

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

function win() {
  state = "won";
  input.enabled = false;
  input.release();
  sfx.win();
  confetti();
  if (race?.phase === "running") {
    race.phase = "finished";
    race.myTime = (performance.now() - race.goAt) / 1000;
    race.results.set(mp.id, { name: mp.me().name, time: race.myTime });
    mp.sendFinish(race.id, race.myTime);
    save.runTime = race.myTime; // the race clock is the run time
  }
  save.wins += 1;
  const newBest = save.best === null || save.runTime < save.best;
  if (newBest) save.best = save.runTime;
  ui.winTitle.textContent = save.look?.name ? `${save.look.name} escaped! 🎉` : "You escaped! 🎉";
  ui.winTime.textContent = fmt(save.runTime) + (newBest ? "  ⭐ New best!" : "");
  ui.winBest.textContent = fmt(save.best);
  ui.winDash.textContent = save.dash;
  renderResults();
  save.cp = 0;
  save.runTime = 0;
  persist();
  setTimeout(() => state === "won" && show(ui.win, true), 900);
}

// ---- Avatar picker --------------------------------------------------------------------
let draft = null;
let playAfterAvatar = false;

function buildPicker() {
  for (const key of ["skin", "shirt", "pants", "hairColor"]) {
    const box = $(`opt-${key}`);
    for (const color of OPTIONS[key]) {
      const b = document.createElement("button");
      b.className = "swatch";
      b.style.background = color;
      b.dataset.key = key;
      b.dataset.value = color;
      b.setAttribute("aria-label", `${key} ${color}`);
      box.append(b);
    }
  }
  for (const key of ["hair", "hat", "face"]) {
    const box = $(`opt-${key}`);
    for (const { id, label } of OPTIONS[key]) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = label;
      b.dataset.key = key;
      b.dataset.value = id;
      box.append(b);
    }
  }
  ui.avatar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-key]");
    if (!b) return;
    draft[b.dataset.key] = b.dataset.value;
    refreshPicker();
  });
}

function refreshPicker() {
  for (const b of ui.avatar.querySelectorAll("[data-key]")) {
    b.classList.toggle("on", draft[b.dataset.key] === b.dataset.value);
  }
  player.setLook(draft);
}

function openAvatar(thenPlay = false) {
  playAfterAvatar = thenPlay;
  state = "avatar";
  input.enabled = false;
  input.release();
  draft = { ...(save.look ?? randomLook()) };
  ui.name.value = draft.name;
  player.preview = true;
  show(ui.menu, false);
  show(ui.avatar, true);
  document.body.classList.add("picking");
  refreshPicker();
}

function closeAvatar() {
  draft.name = cleanName(ui.name.value);
  save.look = cleanLook(draft);
  player.setLook(save.look);
  player.preview = false;
  mp.updateMe();
  persist();
  show(ui.avatar, false);
  document.body.classList.remove("picking");
  ui.name.blur();
  state = "menu";
  if (playAfterAvatar === "lobby") openLobby();
  else if (playAfterAvatar) play();
  else openMenu();
}

buildPicker();
ui.name.addEventListener("input", () => {
  draft.name = cleanName(ui.name.value);
  player.setLook(draft);
});
ui.name.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ui.name.blur();
});
ui.random.addEventListener("click", () => {
  draft = randomLook(cleanName(ui.name.value));
  refreshPicker();
});
ui.avatarDone.addEventListener("click", closeAvatar);
ui.openAvatar.addEventListener("click", () => openAvatar(false));

ui.play.addEventListener("click", play);
ui.restart.addEventListener("click", () => {
  startOver();
  play();
});
ui.reset.addEventListener("click", () => {
  if (!confirm("Reset everything? Your Dash and best time will go back to zero.")) return;
  save = { ...fresh(), muted: save.muted, look: save.look };
  startOver();
  renderHud();
  play();
});
ui.again.addEventListener("click", () => {
  if (race?.phase === "finished") race = null;
  respawn();
  world.setCheckpointReached(0);
  play();
});
ui.pause.addEventListener("click", openMenu);
ui.back.addEventListener("click", () => {
  if (state === "playing") respawn();
});
ui.sound.addEventListener("click", () => {
  save.muted = !save.muted;
  setMuted(save.muted);
  persist();
  renderHud();
});
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input")) return;
  if (state === "lobby" && e.code === "Escape") return openMenu();
  if (state === "avatar" && e.code === "Escape") return closeAvatar();
  if (e.code === "Escape" || e.code === "KeyP") state === "playing" ? openMenu() : state === "menu" && play();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") openMenu();
});
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") document.body.classList.add("touch");
});
if (navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");
setInterval(() => state === "playing" && persist(), 5000);
addEventListener("pagehide", persist);

// ---- Updates: always load fresh files, and offer a refresh when a new version is published ----
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const checkForUpdate = watchForUpdates(() => show(ui.update, true));
ui.updateBtn.addEventListener("click", () => {
  persist();
  location.reload();
});

// ---- Play together ---------------------------------------------------------------------------
// race: { id, phase: countdown | running | finished, goAt, myTime, results: Map(id -> { name, time }) }
let race = null;

const mp = new Multiplayer(scene, {
  getLook: () => save.look,
  onRaceStart: startRaceCountdown,
  onFinish: ({ raceId, id, name, time }) => {
    if (!race || race.id !== raceId || race.results.has(id)) return;
    race.results.set(id, { name, time });
    const place = [...race.results.values()].filter((r) => r.time <= time).length;
    if (race.phase === "running") toast(`🏁 ${name} finished ${ordinal(place)}!`);
    renderResults();
  },
  toast,
  onChange: renderMp,
});

const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]);
const medal = (n) => ["🥇", "🥈", "🥉"][n - 1] ?? `${n}.`;

function startRaceCountdown(id, delay) {
  if (state === "avatar") closeAvatar();
  for (const el of [ui.menu, ui.win, ui.mp]) show(el, false);
  race = { id, phase: "countdown", goAt: performance.now() + delay, myTime: null, results: new Map() };
  save.cp = 0;
  save.runTime = 0;
  world.setCheckpointReached(0);
  respawn();
  state = "countdown";
  input.enabled = false;
  input.release();
  show(ui.countdown, true);
}

// Called every frame during the countdown.
function updateCountdown(now) {
  const left = (race.goAt - now) / 1000;
  if (left > 0) {
    const n = String(Math.ceil(Math.min(left, 3)));
    if (ui.countdown.textContent !== n) {
      ui.countdown.textContent = n;
      ui.countdown.classList.remove("go");
      sfx.keyClick(null, 1);
    }
    return;
  }
  race.phase = "running";
  ui.countdown.textContent = "GO!";
  ui.countdown.classList.add("go");
  sfx.checkpoint();
  setTimeout(() => show(ui.countdown, false), 800);
  state = "menu"; // play() picks up from here
  play();
}

function renderResults() {
  const racing = race && race.phase !== "countdown";
  show(ui.raceResults, !!racing);
  show(ui.raceAgain, !!racing && mp.isHost);
  ui.winTag.textContent = racing
    ? "Waiting for everyone to finish…"
    : "Run it again — you keep all your Dash, so you'll be even faster!";
  if (!racing) return;
  const done = [...race.results.entries()].sort((a, b) => a[1].time - b[1].time);
  ui.raceResults.replaceChildren(
    ...done.map(([id, r], i) => {
      const li = document.createElement("li");
      if (id === mp.id) li.className = "me";
      const who = document.createElement("span");
      who.textContent = `${medal(i + 1)} ${r.name}`;
      const time = document.createElement("span");
      time.textContent = fmt(r.time);
      li.append(who, time);
      return li;
    }),
  );
  const still = mp.roster.filter((p) => !race.results.has(p.id));
  for (const p of still) {
    const li = document.createElement("li");
    li.className = "waiting";
    li.textContent = `🏃 ${cleanName(p.name) || "Player"} still running…`;
    ui.raceResults.append(li);
  }
  if (!still.length) ui.winTag.textContent = mp.isHost ? "Everyone's home! Race again?" : "Everyone's home! The host can start another race.";
  if (race.myTime !== null) {
    const place = done.findIndex(([id]) => id === mp.id) + 1;
    ui.winTitle.textContent = place ? `You came ${ordinal(place)}! ${place === 1 ? "🏆" : "🎉"}` : ui.winTitle.textContent;
  }
}

function renderMp() {
  const inRoom = mp.inRoom;
  show(ui.mpOut, !inRoom);
  show(ui.mpIn, inRoom);
  show(ui.roomChip, inRoom);
  if (!inRoom) {
    ui.mpError.textContent = mp.status === "error" ? "Couldn't connect. Check the internet and try again." : "";
    return;
  }
  ui.mpRoom.textContent = mp.code;
  const others = mp.roster.filter((p) => p.id !== mp.id).length;
  ui.mpStatus.textContent =
    mp.status === "connecting" ? "Connecting…"
    : mp.status === "error" ? "Couldn't connect to the room. Check the internet, or leave and try again."
    : others ? "" : "Waiting for others to join… Tell them the code!";
  ui.mpStatus.classList.toggle("error", mp.status === "error");
  const host = mp.host;
  ui.mpPlayers.replaceChildren(
    ...mp.roster.map((p) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = typeof p.look?.shirt === "string" && /^#[0-9a-f]{6}$/i.test(p.look.shirt) ? p.look.shirt : "#2f80ed";
      const name = document.createElement("span");
      name.textContent = `${cleanName(p.name) || "Player"}${p.id === mp.id ? " (you)" : ""}${p.id === host?.id ? " 👑" : ""}`;
      li.append(dot, name);
      return li;
    }),
  );
  show(ui.mpRace, mp.isHost && mp.status === "connected");
  show(ui.mpWait, !mp.isHost && mp.status === "connected");
  ui.roomChipText.textContent = `${mp.code} · ${Math.max(1, mp.roster.length)}`;
  if (state === "won") renderResults();
}

function openLobby() {
  if (state === "countdown") return;
  if (state === "avatar") closeAvatar();
  state = "lobby";
  input.enabled = false;
  input.release();
  show(ui.menu, false);
  show(ui.win, false);
  show(ui.mp, true);
  renderMp();
}

async function joinFromInput() {
  const code = ui.mpCode.value;
  try {
    ui.mpError.textContent = "";
    await mp.join(code);
  } catch (err) {
    ui.mpError.textContent = err.message;
  }
}

ui.openMp.addEventListener("click", () => {
  unlockAudio();
  if (!save.look) return openAvatar("lobby");
  openLobby();
});
ui.roomChip.addEventListener("click", openLobby);
ui.mpHost.addEventListener("click", () => mp.hostRoom());
ui.mpJoin.addEventListener("click", joinFromInput);
ui.mpCode.addEventListener("input", () => {
  const clean = ui.mpCode.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (clean !== ui.mpCode.value) ui.mpCode.value = clean;
});
ui.mpCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinFromInput();
});
ui.mpRace.addEventListener("click", () => mp.startRace());
ui.raceAgain.addEventListener("click", () => mp.startRace());
ui.mpPlay.addEventListener("click", () => {
  state = "menu";
  play();
});
ui.mpLeave.addEventListener("click", () => {
  mp.leave();
  race = null;
});
ui.mpBack.addEventListener("click", openMenu);
ui.winMenu.addEventListener("click", openMenu);
// Tapping the dimmed background around the Play together card also goes back.
ui.mp.addEventListener("click", (e) => {
  if (e.target === ui.mp) openMenu();
});
mp.rejoin();
renderMp();

// ---- Confetti on the Escape key ---------------------------------------------------------
const bits = [];
function confetti() {
  const colors = [0xff3b30, 0xffcc00, 0x3ddc84, 0x4ea8ff, 0xb794f6, 0xff8fd8];
  for (let i = 0; i < 120; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.06), new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
    m.position.copy(player.pos).add(new THREE.Vector3(0, 2, 0));
    const a = Math.random() * Math.PI * 2;
    const s = 4 + Math.random() * 8;
    bits.push({ m, v: new THREE.Vector3(Math.cos(a) * s, 10 + Math.random() * 10, Math.sin(a) * s), life: 4 });
    scene.add(m);
  }
}
function animateConfetti(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.v.y -= 20 * dt;
    b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += dt * 8;
    b.m.rotation.y += dt * 6;
    if ((b.life -= dt) <= 0) {
      scene.remove(b.m);
      bits.splice(i, 1);
    }
  }
}

// ---- Main loop ------------------------------------------------------------------------------
setMuted(save.muted);
world.setCheckpointReached(save.cp);
respawn();
renderHud();
openMenu();

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state === "playing") {
    acc += dt;
    while (acc >= STEP && state === "playing") {
      physicsStep();
      acc -= STEP;
    }
  } else {
    acc = 0;
    if (state === "menu") cam.yaw += dt * 0.15; // slow turntable behind the menu
    if (state === "countdown") updateCountdown(now);
  }
  mp.tick(dt, player);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) ui.toast.classList.remove("show");
  world.animate();
  player.animate(dt);
  animateConfetti(dt);
  updateCamera(dt);
  renderHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for testing from the browser console.
window.game = { mp, get race() { return race; }, checkForUpdate, openAvatar, closeAvatar, get save() { return save; }, input, player, world, course, cam, physicsStep, STEP, get state() { return state; } };
