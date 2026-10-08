// Notices when a new version of the game has been published while it's open.
// It asks the server for the fingerprint (ETag / Last-Modified) of the game's files,
// remembers what it saw first, and calls `onUpdate` once that changes.

const FILES = [
  "./",
  "style.css",
  "js/main.js",
  "js/levels.js",
  "js/world.js",
  "js/player.js",
  "js/avatar.js",
  "js/input.js",
  "js/audio.js",
  "js/update.js",
  "js/config.js",
  "js/net.js",
  "js/remote.js",
  "js/multiplayer.js",
];
const EVERY = 3 * 60 * 1000;

async function fingerprint() {
  const parts = await Promise.all(
    FILES.map(async (file) => {
      const res = await fetch(file, { method: "HEAD", cache: "no-store" });
      if (!res.ok) return "";
      return res.headers.get("etag") || res.headers.get("last-modified") || "";
    }),
  );
  return parts.join("|");
}

export function watchForUpdates(onUpdate) {
  if (location.protocol === "file:") return;
  let first = null;
  let found = false;
  const check = async () => {
    if (found || document.hidden) return;
    try {
      const now = await fingerprint();
      if (!now.replaceAll("|", "")) return; // server gave us nothing to compare
      if (first === null) first = now;
      else if (now !== first) {
        found = true;
        onUpdate();
      }
    } catch {
      // Offline or a blip — try again next time.
    }
  };
  check();
  setInterval(check, EVERY);
  document.addEventListener("visibilitychange", check);
  return check;
}
