// Multiplayer rooms. Everyone in a room shares their position a few times a second
// (broadcast) and who they are (presence: name + avatar). Nothing is stored anywhere.
//
// Two transports with the same shape:
//   supabase — the real thing, via Supabase Realtime
//   local    — BroadcastChannel between tabs of one browser, for testing (add ?net=local)

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L or O to mix up with 1 and 0

export function newRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

export function cleanRoomCode(text) {
  return String(text ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export function newPlayerId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---- Supabase Realtime -------------------------------------------------------------------
let clientPromise = null;

function loadSupabase() {
  clientPromise ??= new Promise((resolve, reject) => {
    if (window.supabase) return resolve(window.supabase);
    const s = document.createElement("script");
    s.src = "vendor/supabase.js";
    s.onload = () => resolve(window.supabase);
    s.onerror = () => {
      clientPromise = null;
      reject(new Error("Couldn't load the multiplayer library"));
    };
    document.head.append(s);
  }).then((lib) =>
    lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  );
  return clientPromise;
}

async function supabaseTransport(code, myId, handlers) {
  const client = await loadSupabase();
  const channel = client.channel(`dke-room-${code}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: myId, enabled: true } },
  });
  let meta = null;
  let joined = false;
  const roster = () => {
    const state = channel.presenceState();
    return Object.values(state).map((metas) => metas[metas.length - 1]);
  };
  for (const event of ["state", "race", "finish"]) {
    channel.on("broadcast", { event }, ({ payload }) => handlers.onMessage(event, payload));
  }
  channel.on("presence", { event: "sync" }, () => handlers.onRoster(roster()));
  channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      joined = true;
      handlers.onStatus("connected");
      if (meta) channel.track(meta);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      handlers.onStatus("error", err?.message || status);
    } else if (status === "CLOSED") {
      joined = false;
      handlers.onStatus("closed");
    }
  });
  return {
    send: (event, payload) => joined && channel.send({ type: "broadcast", event, payload }),
    track: (m) => {
      meta = m;
      if (joined) channel.track(m); // otherwise sent once the channel has joined
    },
    leave: () => client.removeChannel(channel),
  };
}

// ---- Local (testing) ----------------------------------------------------------------------
function localTransport(code, myId, handlers) {
  const bc = new BroadcastChannel(`dke-room-${code}`);
  const others = new Map(); // id -> { meta, seen }
  let meta = null;
  const emitRoster = () => handlers.onRoster([...(meta ? [meta] : []), ...[...others.values()].map((o) => o.meta)]);
  bc.onmessage = ({ data }) => {
    if (data.from === myId) return;
    if (data.kind === "hello") {
      const isNew = !others.has(data.from);
      others.set(data.from, { meta: data.meta, seen: Date.now() });
      if (isNew && meta) bc.postMessage({ kind: "hello", from: myId, meta });
      emitRoster();
    } else if (data.kind === "bye") {
      others.delete(data.from);
      emitRoster();
    } else handlers.onMessage(data.kind, data.payload);
  };
  const beat = setInterval(() => {
    if (meta) bc.postMessage({ kind: "hello", from: myId, meta });
    let changed = false;
    for (const [id, o] of others) if (Date.now() - o.seen > 4000) changed = others.delete(id) || changed;
    if (changed) emitRoster();
  }, 1000);
  setTimeout(() => handlers.onStatus("connected"), 50);
  return {
    send: (kind, payload) => bc.postMessage({ kind, from: myId, payload }),
    track: (m) => {
      meta = m;
      bc.postMessage({ kind: "hello", from: myId, meta });
      emitRoster();
    },
    leave: () => {
      clearInterval(beat);
      bc.postMessage({ kind: "bye", from: myId });
      bc.close();
    },
  };
}

// ---- Room ---------------------------------------------------------------------------------
// handlers: onRoster(players[]), onMessage(event, payload), onStatus(status, detail)
export async function joinRoom(code, myId, handlers) {
  const local = new URLSearchParams(location.search).get("net") === "local";
  return local ? localTransport(code, myId, handlers) : supabaseTransport(code, myId, handlers);
}
