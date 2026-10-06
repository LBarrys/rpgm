# rpgm

Runs Windows RPG Maker games natively on Alpine Linux, without Wine. Wayland only.

## Install

```sh
apk add electron         # MV/MZ (edge, testing)
apk add easyrpg-player   # 2000/2003
./build-mkxp-z.sh        # XP/VX/VX Ace; removes its build files after
./install.sh             # /usr/local; --user: ~/.local; --uninstall
```

## Use

```sh
rpgm [GAME_DIR | Game.exe]   # default: current directory
rpgm --test GAME             # playtest
rpgm --editor GAME           # F8 cheat menu (god mode, no clip, speed, teleport, items...)
rpgm --wasd GAME             # MV/MZ: WASD moves, E confirms, Q cancels
rpgm --translate FILE GAME   # show FILE's {"text": "translation"}; new text is added to fill in
rpgm --edit-save SAVE        # MV/MZ: edit a save as JSON in $EDITOR
rpgm --info GAME             # show what was detected
```

| Game | Runs on |
|---|---|
| MV, MZ, NW.js, `package.nw` | electron |
| Electron apps | electron |
| XP, VX, VX Ace | mkxp-z |
| 2000, 2003 | easyrpg-player |
| Enigma Virtual Box `.exe` | unpacked, then as above |

- **Missing graphics or sounds:** extract the game's [RTP](https://www.rpgmakerweb.com/run-time-package)
  to `~/.local/share/rpgm/rtp/` as `RPG2000`, `RPG2003`, `Standard`, `RPGVX` or `RPGVXAce`.
  `--info` names the one needed.
- **Garbled Japanese file names:** `apk add icu-data-full`.
- **Your own fixes:** `*.rpgm.js` (MV/MZ) or `*.rpgm.rb` (XP/VX/VX Ace) in the game folder run after
  the game's scripts.
- **A shim breaks a game:** `RPGM_RGSS_SKIP=name,...` skips files in `lib/rgss/`.

Saves stay in the game folder; everything else is in `~/.local/share/rpgm/`.

## What it fixes

- Case-sensitive file names.
- NW.js APIs, `SharedArrayBuffer`, Steam (stubbed).
- Old MV games running too fast above 60 Hz.
- `\` save paths, `%APPDATA%`.
- XP/VX/VX Ace: Ruby 1.8, Win32API, `.ini` files, known broken plugins.

## Tests

`./test/run.sh`; node and ruby tests run if installed.

## Credits

Based on [rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs)
(bakustarver), with ideas from [Kawariki](https://github.com/Orochimarufan/Kawariki) (Taeyeon Mori),
[rmse](https://github.com/nathan-b/rmse) (Nathan Baker) and the cheat menus of
[emerladCoder](https://github.com/emerladCoder/RPG-Maker-MV-Cheat-Menu-Plugin),
[paramonos](https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin) and
[yeetay233](https://github.com/yeetay233/rpgm-cheatmenu). `lib/evb.js` ports
[evbunpack](https://github.com/mos9527/evbunpack) (mos9527, Apache-2.0) and aplib (Sandor Nemes,
GPL-3.0). Runs on [mkxp-z](https://github.com/mkxp-z/mkxp-z), extending its `win32_wrap.rb` and
`kgl2_wrap.rb` (Ancurio, Splendide Imaginarius, white-axe), and
[EasyRPG Player](https://easyrpg.org/player/). Mostly written by Claude (Anthropic).

GPL-3.0; the shims in `lib/rgss/` are CC0.
