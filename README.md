# rpgm

Run Windows releases of RPG Maker games natively on Alpine Linux, without Wine.

A small rewrite of [rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs)
for musl, with no bundled binaries. MV and MZ run on Alpine's own `electron`; XP, VX and VX Ace run
on [mkxp-z](https://github.com/mkxp-z/mkxp-z).

## Install

```sh
apk add electron       # Alpine edge, testing repository
./install.sh           # into /usr/local, as root; --user for ~/.local, --uninstall to remove
./build-mkxp-z.sh      # only for XP/VX/VX Ace: Alpine does not package mkxp-z
```

`unzip` is needed for games shipped as `package.nw`.

## Use

```sh
rpgm [GAME_DIR | Game.exe]    # default: the current directory
rpgm --test GAME              # playtest: F9 debug menu, F12 devtools
rpgm --info GAME              # engine, version and runtime found
rpgm --setup GAME             # XP/VX/VX Ace: write an mkxp.json that loads the shims
```

| Game | Runs on |
|---|---|
| RPG Maker MV, MZ, other NW.js games (`package.json`, `package.nw`) | `electron` + rpgm's NW.js shim |
| Electron games (`resources/app`, `app.asar`) | `electron` |
| RPG Maker XP, VX, VX Ace | `mkxp-z` + the shims in `lib/rgss/` |

## How it works

- `rpgm` (POSIX sh) detects the engine and starts the runtime.
- `lib/electron-preload.js` provides the NW.js APIs games use (`nw.Window`, `nw.App`, `nw.gui`,
  `process.mainModule`, `window.prompt` via zenity/kdialog/yad) with Node.js in the page.
- `lib/ci.js` resolves file names case-insensitively, as Windows does; `lib/serve.js` serves game
  files over `app://`, a bounded number at a time.
- The game runs from the folder holding `index.html`, so mod loaders find `www/mods`. Saves stay in
  the game's `save/` folder, compatible with Windows; browser storage is in `~/.local/share/rpgm/`.
- `lib/rgss/all.rb` loads mkxp-z's `win32_wrap.rb` and `kgl2_wrap.rb`, then shims for what Windows
  RGSS did and mkxp-z does not: `user32` window calls, Ruby 1.9's `DL`, `.ini` access, input
  polling, CRLF text reads, `msgbox` output and lenient argument checks. `RPGM_RGSS_SKIP` leaves
  shims out by name.

## Limitations

- MV/MZ need Alpine edge, where `electron` lives.
- No `SharedArrayBuffer` (games are not served cross-origin isolated); Steam plugins such as
  `greenworks` and other Windows DLLs cannot load.
- Games packed inside `Game.exe` (Enigma Virtual Box) must be unpacked first, e.g. with
  [evbunpack](https://github.com/mos9527/evbunpack).
- Games get full access to your files, as with NW.js. Run only games you trust.

## Tests

`./test/run.sh` needs a shell and, for the `lib/` tests, node. CI runs it on Alpine edge.

## Credits and license

Based on rpgmakermlinux-cicpoffs by bakustarver. mkxp-z by Roza and contributors runs the RGSS
games; its `win32_wrap.rb` and `kgl2_wrap.rb` (Ancurio, Splendide Imaginarius, white-axe) are
extended by the CC0 shims in `lib/rgss/`. Most of the code was written by Claude (Anthropic) with
the maintainer, against real games. GPL-3.0.
