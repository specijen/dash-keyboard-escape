// Public leaderboard, stored in Supabase (see supabase/leaderboard.sql for the table and the
// submit_score function). Each player keeps one row per level with their best time.
// With ?net=local the board lives in this browser instead, for testing without Supabase.

import { loadSupabase } from "./net.js";

const LOCAL = new URLSearchParams(location.search).get("net") === "local";
const LOCAL_KEY = "dke-leaderboard-local";
const TIMEOUT = 8000;
export const MIN_TIME_MS = 15000; // matches the table's check; anything faster isn't a real run

function withTimeout(promise) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT))]);
}

// Turns a Supabase error into something we can show a kid.
export function friendlyError(err) {
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`;
  if (/PGRST20[25]|42P01|42883|does not exist|schema cache/i.test(text)) return "The leaderboard isn't set up yet.";
  return "Couldn't reach the leaderboard. Check the internet and try again.";
}

function localRows() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

export async function submitScore({ level, playerId, name, timeMs, dash, shirt }) {
  const row = { level, player_id: playerId, name, time_ms: Math.round(timeMs), dash, shirt };
  if (LOCAL) {
    const rows = localRows();
    const mine = rows.find((r) => r.level === level && r.player_id === playerId);
    if (mine) Object.assign(mine, { ...row, time_ms: Math.min(mine.time_ms, row.time_ms) });
    else rows.push(row);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    return;
  }
  const client = await withTimeout(loadSupabase());
  const { error } = await withTimeout(
    client.rpc("submit_score", {
      p_level: level, p_player_id: playerId, p_name: name, p_time_ms: row.time_ms, p_dash: dash, p_shirt: shirt,
    }),
  );
  if (error) throw error;
}

// Top players on a level, fastest first: [{ player_id, name, time_ms, dash, shirt }]
export async function fetchTop(level, limit = 10) {
  if (LOCAL) {
    return localRows().filter((r) => r.level === level).sort((a, b) => a.time_ms - b.time_ms).slice(0, limit);
  }
  const client = await withTimeout(loadSupabase());
  const { data, error } = await withTimeout(
    client.from("leaderboard").select("player_id, name, time_ms, dash, shirt").eq("level", level).order("time_ms").limit(limit),
  );
  if (error) throw error;
  return data ?? [];
}

// Where a time would place on a level (1 = fastest).
export async function fetchRank(level, timeMs) {
  if (LOCAL) return localRows().filter((r) => r.level === level && r.time_ms < timeMs).length + 1;
  const client = await withTimeout(loadSupabase());
  const { count, error } = await withTimeout(
    client.from("leaderboard").select("player_id", { count: "exact", head: true }).eq("level", level).lt("time_ms", Math.round(timeMs)),
  );
  if (error) throw error;
  return (count ?? 0) + 1;
}
