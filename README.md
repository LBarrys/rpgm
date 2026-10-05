# rpgm

Run Windows releases of RPG Maker games natively on Alpine Linux, without Wine.

A small rewrite of [rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs)
for musl, with no bundled binaries. MV and MZ run on Alpine's own `electron`; XP, VX and VX Ace run
on [mkxp-z](https://github.com/mkxp-z/mkxp-z). Wayland only: there is no X11 or Xwayland path.

## Install

```sh
apk add electron       # Alpine edge, testing repository
./install.sh           # into /usr/local, as root; --user for ~/.local, --uninstall to remove
./build-mkxp-z.sh      # only for XP/VX/VX Ace: Alpine does not package mkxp-z
```

`build-mkxp-z.sh` installs the build dependencies it is missing (through `doas` or `sudo` when not
run as root), builds in a temporary folder, and removes both when it ends, so only mkxp-z itself is
left behind. Its SDL is built for Wayland only, without X11 or KMS/DRM, and it draws with Mesa's
OpenGL over EGL; the ANGLE translation layer is left out.

Nothing else is needed: games shipped as `package.nw`, or packed inside `Game.exe` with Enigma
Virtual Box, are unpacked on first run by `lib/evb.js`, which runs on `electron`. Zip file names
are read as UTF-8, or as Shift-JIS when an older Japanese tool wrote them; decoding Shift-JIS needs
ICU's full data, so for such a game rpgm may ask for `apk add icu-data-full`.

## Use

```sh
rpgm [GAME_DIR | Game.exe]    # default: the current directory
rpgm --test GAME              # playtest: F9 debug menu, F12 devtools
rpgm --editor GAME            # MV/MZ: F8 opens an in-game editor
rpgm --wasd GAME              # MV/MZ: WASD moves, E confirms, Q cancels
rpgm --edit-save SAVE_FILE    # MV/MZ: edit a save as JSON in $EDITOR
rpgm --info GAME              # engine, version and runtime found
rpgm --setup GAME             # XP/VX/VX Ace: write an mkxp.json that loads the shims
```

| Game | Runs on |
|---|---|
| RPG Maker MV, MZ, other NW.js games (`package.json`, `package.nw`) | `electron` + rpgm's NW.js shim |
| Electron games (`resources/app`, `app.asar`) | `electron` |
| RPG Maker XP, VX, VX Ace | `mkxp-z` + the shims in `lib/rgss/` |
| Any of these packed in an Enigma Virtual Box `.exe` | unpacked to `~/.local/share/rpgm/unpacked/`, then as above |

## How it works

- `rpgm` (POSIX sh) detects the engine and starts the runtime on Wayland: Electron with
  `--ozone-platform=wayland` and client-side window decorations, mkxp-z with `SDL_VIDEODRIVER=wayland`.
- `lib/electron-preload.js` provides the NW.js APIs games use (`nw.Window`, `nw.App`, `nw.gui`,
  `process.mainModule`, `window.prompt` via zenity/kdialog/yad) with Node.js in the page.
- `lib/ci.js` resolves file names case-insensitively, as Windows does; `lib/serve.js` serves game
  files over `app://`, a bounded number at a time, cross-origin isolated so `SharedArrayBuffer`
  works as it did under NW.js.
- Steam's `greenworks` is replaced by a stand-in that reports Steam as unavailable, so games that
  load it keep running without achievements or cloud saves.
- `--editor` adds a panel (`lib/editor.js`) for gold, items, weapons, armor, actors (level, HP, MP,
  stats), switches and variables. It changes the running game through the game's own functions, so
  plugins stay consistent; nothing is written until you save in-game.
- `--edit-save` (`lib/savejson.js`) is for saves the game cannot load: it decodes MZ saves with
  zlib and MV saves with the game's own `lz-string.js`, opens the JSON in `$EDITOR` (default `vi`),
  and writes it back in the same format, keeping the first original as `.bak`.
- Windows habits are smoothed over: a save path built with `\` (`save\file1.rpgsave`) becomes a real
  folder, and saves already written under such a name are moved into it; `USERPROFILE`, `APPDATA`
  and `LOCALAPPDATA` point into `~/.local/share/rpgm/windows/`; TyranoBuilder games are told they
  run on a PC, not a phone.
- Any `*.rpgm.js` file in the game folder is loaded after the game's core scripts (and, for MV, its
  plugins), for your own fixes or mods without editing the game.
- The game runs from the folder holding `index.html`, so mod loaders find `www/mods`. Saves stay in
  the game's `save/` folder, compatible with Windows; browser storage is in `~/.local/share/rpgm/`.
- `lib/rgss/all.rb` loads mkxp-z's `win32_wrap.rb` and `kgl2_wrap.rb`, then shims for what Windows
  RGSS did and mkxp-z does not: Ruby 1.8 behaviour for XP and VX (`obj.type`, `Array#nitems`, ...),
  `user32` window calls, Ruby 1.9's `DL`, `.ini` access, input
  polling, CRLF text reads, `msgbox` output and lenient argument checks. `RPGM_RGSS_SKIP` leaves
  shims out by name.
- `lib/rgss/patches.rb` then edits the game's scripts before they run, and prints each change. It
  removes plugins that need Windows-only DLLs or only did what mkxp-z already does (Auto Font
  Install, `wfcrypt`, KGC_BitmapExtension's `TRGSSX`, `winmm` joysticks), cuts Steam ownership
  checks, copies text with `dup` where `clone` kept Ruby 3's frozen strings frozen, and refreshes
  input for Pokemon Essentials' `raw_key_states`. `RPGM_RGSS_SKIP=patches` turns it off.
- Any `*.rpgm.rb` file in an XP/VX/VX Ace game folder runs after the game's scripts, just before
  `Main`, as `*.rpgm.js` does for MV/MZ.

## Limitations

- MV/MZ need Alpine edge, where `electron` lives.
- A Wayland compositor is required; `rpgm` refuses to start a game without `WAYLAND_DISPLAY`.
- Windows DLLs cannot load; Steam features are off (see above).
- The Enigma unpacker is a port of [evbunpack](https://github.com/mos9527/evbunpack)'s current
  format and is tested against it on generated archives; very old Enigma versions use a layout it
  does not read.
- Games get full access to your files, as with NW.js. Run only games you trust.

## Tests

`./test/run.sh` needs a shell and, for the `lib/` tests, node. CI runs it on Alpine edge.

## Credits and license

Based on rpgmakermlinux-cicpoffs by bakustarver; the editors were inspired by
[rmse](https://github.com/nathan-b/rmse) by Nathan Baker, and the Windows, Tyrano, Ruby 1.8, WASD,
user-script and RGSS script-patch fixes by [Kawariki](https://github.com/Orochimarufan/Kawariki) by Taeyeon Mori. mkxp-z by Roza and contributors runs the RGSS
games; its `win32_wrap.rb` and `kgl2_wrap.rb` (Ancurio, Splendide Imaginarius, white-axe) are
extended by the CC0 shims in `lib/rgss/`. `lib/evb.js` is ported from evbunpack by mos9527
(Apache-2.0) and aplib by Sandor Nemes (GPL-3.0). Most of the code was written by Claude
(Anthropic) with the maintainer, against real games. GPL-3.0.
