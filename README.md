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

## The course

1. **Letter Row**: friendly hops across QWERTY.
2. **Number Row**: yellow keys crumble, purple keys slide.
3. **Spacebar Bridge**: jump the red keys, then the blue **Enter** key bounces you up.
4. **Dash Gaps**: long jumps that need enough Dash (the signs say how much).
5. **F-Key Tower**: climb the zig-zag stairs to the giant **ESC** key.

Progress (Dash, checkpoint, best time) is saved on each device.

## Changing the course

Everything lives in `js/levels.js` as plain numbers: key positions, gaps, which keys
crumble or move, and the Dash each sign asks for. The world builds itself from that list.

## Files

```
index.html       page, HUD and menus
style.css        layout and touch controls
js/main.js       game loop, camera, saving, menus
js/player.js     the blocky avatar and its physics
js/world.js      builds keys from the course data; moving and crumbling keys
js/levels.js     the course itself
js/input.js      keyboard, mouse, joystick and jump button
js/audio.js      synthesised sound effects
vendor/          three.js r160 (MIT licence)
```

## Running it locally

Any static web server works, for example:

```
python3 -m http.server
```

Then open http://localhost:8000.

## Hosting

Served by GitHub Pages from the `main` branch root.
