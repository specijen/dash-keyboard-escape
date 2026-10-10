// Play together: hosting / joining a room by code, the lobby screen, sharing our position,
// and race messages. The race itself (countdown, finishing) is run by main.js through the
// callbacks passed in.

import { joinRoom, newRoomCode, cleanRoomCode, newPlayerId } from "./net.js";
import { Remotes } from "./remote.js";
import { cleanName } from "./avatar.js";

const SEND_MOVING = 1 / 6; // seconds between position updates while moving
const SEND_IDLE = 2; // ...and while standing still
const ROOM_KEY = "dke-room";
const ID_KEY = "dke-id";

function session(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    return null;
  }
}

export class Multiplayer {
  // hooks: getLook(), getLevel(), onRaceStart(id, delayMs, level), onFinish({ raceId, id, name, time }), toast(text), onChange()
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.remotes = new Remotes(scene);
    this.id = session(ID_KEY) || newPlayerId();
    session(ID_KEY, this.id);
    this.room = null;
    this.code = null;
    this.status = "offline";
    this.roster = [];
    this.sendTimer = 0;
    this.joinedAt = 0;
  }

  get inRoom() {
    return !!this.code;
  }

  get host() {
    return [...this.roster].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))[0];
  }

  get isHost() {
    return this.host?.id === this.id;
  }

  me() {
    const look = this.hooks.getLook() || {};
    return { id: this.id, name: cleanName(look.name) || "Player", look, joinedAt: this.joinedAt };
  }

  async hostRoom() {
    return this.join(newRoomCode());
  }

  async join(text) {
    const code = cleanRoomCode(text);
    if (code.length !== 4) throw new Error("Room codes are 4 letters");
    if (this.code === code) return;
    if (this.inRoom) this.leave();
    this.code = code;
    this.status = "connecting";
    this.joinedAt = Date.now();
    session(ROOM_KEY, code);
    this.hooks.onChange();
    try {
      const room = await joinRoom(code, this.id, {
        onRoster: (players) => {
          this.roster = players.filter((p) => p && p.id);
          this.remotes.sync(this.roster, this.id);
          this.hooks.onChange();
        },
        onMessage: (event, payload) => this.receive(event, payload),
        onStatus: (status, detail) => {
          this.status = status;
          if (status === "error") console.warn("Multiplayer:", detail);
          this.hooks.onChange();
        },
      });
      if (this.code !== code) return room.leave(); // left again while connecting
      this.room = room;
      room.track(this.me());
    } catch (err) {
      console.warn(err);
      this.status = "error";
      this.hooks.onChange();
    }
  }

  // Rejoin the room we were in before a refresh (e.g. after an update).
  rejoin() {
    const code = session(ROOM_KEY);
    if (code) this.join(code);
  }

  leave() {
    this.room?.leave();
    this.room = null;
    this.code = null;
    this.status = "offline";
    this.roster = [];
    this.remotes.clear();
    session(ROOM_KEY, null);
    this.hooks.onChange();
  }

  // Name or avatar changed.
  updateMe() {
    this.room?.track(this.me());
  }

  receive(event, payload) {
    if (!payload || typeof payload !== "object") return;
    if (event === "state") {
      if (payload.l !== undefined && payload.l !== this.hooks.getLevel()) this.remotes.hide(payload.id);
      else this.remotes.update(payload);
    }
    else if (event === "race" && payload.action === "start") {
      this.hooks.onRaceStart(String(payload.id), Math.min(Math.max(+payload.delay || 0, 0), 5000), Number(payload.level) || 0);
    } else if (event === "finish") {
      const time = +payload.time;
      if (!Number.isFinite(time)) return;
      this.hooks.onFinish({ raceId: String(payload.raceId), id: String(payload.id), name: cleanName(payload.name) || "Player", time });
    }
  }

  // Host only: everyone (including us) gets a 3-2-1 countdown.
  startRace() {
    if (!this.room || !this.isHost) return;
    const id = Math.random().toString(36).slice(2, 8);
    const delay = 3500;
    const level = this.hooks.getLevel();
    this.room.send("race", { action: "start", id, delay, level });
    this.hooks.onRaceStart(id, delay, level);
  }

  sendFinish(raceId, time) {
    const me = this.me();
    this.room?.send("finish", { raceId, id: this.id, name: me.name, time });
  }

  // Every frame: share our position now and then, and move everyone else's avatar.
  tick(dt, player) {
    this.remotes.animate(dt);
    if (!this.room || this.status !== "connected") return;
    const moving = !player.grounded || Math.hypot(player.vel.x, player.vel.z) > 0.2;
    this.sendTimer -= dt;
    if (this.sendTimer > 0) return;
    this.sendTimer = moving ? SEND_MOVING : SEND_IDLE;
    const r = (v) => Math.round(v * 100) / 100;
    this.room.send("state", {
      id: this.id,
      p: [r(player.pos.x), r(player.pos.y), r(player.pos.z)],
      v: [r(player.vel.x), r(player.vel.y), r(player.vel.z)],
      f: r(player.facing),
      g: player.grounded,
      l: this.hooks.getLevel(),
    });
  }
}
