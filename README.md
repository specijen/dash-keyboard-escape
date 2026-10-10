# Dash Keyboard Escape

A 3D obby in the browser: race across a giant keyboard and hit **ESC** to escape.
Every second you keep moving you get **+1 ⚡ Dash**. More Dash means faster running
and longer jumps, so gaps you can't clear at first become possible later.

Plays on computers and iPads, with nothing to install.

## Controls

| Computer | iPad |
|---|---|
| **W A S D** / arrows: move | Left thumb: floating joystick |
| **Space**: jump | **JUMP** button |
| Drag the mouse: look (Q / E also turn) | Right thumb: drag to look |
| **Shift**: walk carefully | Push the joystick part-way to go slower |
| **Esc**: pause | ⏸ button |

The 🚩 button sends you back to your last checkpoint if you get stuck.

## Your avatar

The first time you press Play you pick a look: skin, shirt and pants colours, a
hairstyle (short, spiky, long, ponytail, pigtails, bob, curly, mohawk or buns) and hair
colour, a hat (cap, crown, top hat, party hat or bunny ears), a face, and your name, which floats
above your head. Change it any time with **🎨 Avatar & name** on the menu. Each device
remembers its own avatar.

## Play together

Tap **👥 Play together** on the menu. One person taps **Host a game** and gets a
4-letter room code; everyone else types the code and taps **Join**. You see each
other's avatars and names running the course.

The host (👑) can tap **🏁 Start race**: everyone is sent back to START, there's a
3-2-1 countdown, and a results board shows the finishing order and times. Everyone
keeps their own Dash, so practising pays off. The 👥 chip under the timer reopens the room.

Multiplayer uses Supabase Realtime (`js/config.js` holds the project URL and its
publishable key, which is safe to be public). Nothing is stored: positions and names
are passed between players in the room and forgotten. There's no chat.
Free-plan notes: Supabase pauses a project after about a week with no use
(press **Restore** in the dashboard), and the free plan includes 2 million
Realtime messages a month.

For testing on one computer, open the game in two tabs with `?net=local` on the
address; they talk to each other without Supabase.

## Leaderboard

**🏆 Leaderboard** on the menu shows the 10 fastest players on each level, for everyone
who plays the game. When you escape, your time is sent automatically (if you've set a name)
and the win screen shows your place. Each player keeps one entry per level: their best time.
A player with no name who makes the top 10 is asked for a nickname on the win screen.
After Level 1, the win screen also offers a button straight to Level 2.

It's stored in the Supabase project. One-time setup: in the Supabase dashboard open
**SQL Editor → New query**, paste in `supabase/leaderboard.sql` and press **Run**.
To remove an entry (say, a rude name), open **Table Editor → leaderboard**, select the row
and delete it.

## The levels

Pick a level on the menu. Dash is shared between levels; best times are kept for each.

### Level 1: Keyboard Escape

1. **Letter Row**: friendly hops across QWERTY.
2. **Number Row**: yellow keys crumble, purple keys slide.
3. **Spacebar Bridge**: jump the red keys, then the blue **Enter** key bounces you up.
4. **Dash Gaps**: long jumps that need enough Dash (the signs say how much).
5. **F-Key Tower**: climb the zig-zag stairs to the giant **ESC** key.

### Level 2: Numpad Nightmare (harder)

Smaller keys, longer hops, and three new tricks.

1. **Numpad Zig-Zag**: hop left and right across the numpad; 5 and 2 crumble.
2. **Blinking Keys**: cyan keys vanish for a second. They flicker just before they go.
3. **Elevators**: ride the purple keys up to each ledge.
4. **Lava Sweep**: red bars slide across the backspace key, then keys slide forwards and back.
5. **Mega Gaps**: jumps that need ⚡70 and ⚡110.
6. **Arrow Key Climb**: small sliding and blinking steps up to the **POWER** key.

In Play together, a race always runs on the host's level and brings everyone onto it.

Progress (Dash, checkpoint, best times) is saved on each device; leaderboard times are online.

## Changing the course

Everything lives in `js/levels.js` as plain numbers (one function per level): key positions, gaps, which keys
crumble or move, and the Dash each sign asks for. The world builds itself from that list.

## Files

```
index.html       page, HUD and menus
style.css        layout and touch controls
js/main.js       game loop, camera, saving, menus
js/player.js     player movement and physics
js/avatar.js     builds the blocky avatar: colours, hair, hats, faces, name tag
js/world.js      builds keys from the course data; moving and crumbling keys
js/levels.js     the course itself
js/input.js      keyboard, mouse, joystick and jump button
js/audio.js      synthesised sound effects
js/update.js     spots new versions and shows the Refresh banner
js/multiplayer.js  rooms, lobby, sharing your position, race messages
js/net.js        connection: Supabase Realtime, or local tabs for testing
js/remote.js     draws and smooths the other players
js/config.js     Supabase project URL and publishable key
js/leaderboard.js  public leaderboard: submit a time, top 10, your place
supabase/        one-time SQL setup for the leaderboard table
sw.js            service worker: always-fresh files, offline copy
vendor/          three.js r160 and supabase-js 2.116.0 (MIT licences)
```

## Running it locally

Any static web server works, for example:

```
python3 -m http.server
```

Then open http://localhost:8000.

## Hosting

Served by GitHub Pages from the `main` branch root.

`sw.js` is a small service worker that re-checks every file with the server on each
load, so a new version appears straight away rather than after GitHub Pages' 10-minute
cache. It also keeps a copy so the game opens offline. While the game is open,
`js/update.js` checks for a new version every few minutes and shows a **Refresh**
banner when there is one. If you add a new JS file, add it to the list in `js/update.js`.
