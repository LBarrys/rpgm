# rpgm

Run Windows releases of RPG Maker games natively on Alpine Linux, without Wine.

A minimal rewrite of [rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs)
for musl: about 2,300 lines of shell, JavaScript and Ruby, no bundled binaries. MV and MZ games are
HTML5 apps packaged with NW.js; the original project downloads glibc builds of NW.js and ships
glibc helper binaries, none of which run on Alpine. rpgm uses Alpine's own `electron` package
instead, with a compatibility layer for the NW.js APIs games expect.

## Install

```sh
apk add electron            # Alpine edge, testing repository
./install.sh                # system-wide, as root (into /usr/local)
./install.sh --user         # or into ~/.local
```

Optional: `unzip`, for games shipped as `package.nw`. For XP/VX/VX Ace you need `mkxp-z`, which
Alpine does not package — `./build-mkxp-z.sh` builds it from source and installs it alongside rpgm.
Uninstall with `./install.sh --uninstall`.

There is an `APKBUILD` for packaging it properly (`abuild -r`, once the release is tagged);
`PREFIX` and `DESTDIR` are honoured by `install.sh` for that.

## Use

```sh
rpgm                                # the game in the current directory
rpgm ~/Games/SomeGame               # or a folder, or its Game.exe
rpgm --test ~/Games/SomeGame        # playtest mode: F9 debug menu, F12 devtools
rpgm --info ~/Games/SomeGame        # what was detected, and what is silently broken
rpgm --setup ~/Games/SomeGame       # XP/VX/VX Ace: write an mkxp.json loading the shims
rpgm --version                      # quote this in bug reports; --info prints it too
```

Pointed at a folder it cannot run, rpgm says which engine it found instead and what does
run it — Wolf RPG, KiriKiri and Ren'Py games, RPG Maker 2000/2003, and games still packed
inside their `.exe` all get their own answer rather than "not recognized".

| Engine | Handled by |
|---|---|
| RPG Maker MV, MZ | rpgm |
| Other NW.js games (`package.json` / `package.nw`) | rpgm, best effort |
| Electron games (`resources/app`, `resources/app.asar`) | system `electron`, best effort |
| RPG Maker XP/VX/VX Ace | `mkxp-z`, plus [the shims below](#rpg-maker-xpvxvx-ace) |

## How it works

`rpgm` is POSIX sh: it works out which engine a folder holds and hands it to Electron, which stands
in for NW.js — same Chromium, same Node.js in the page, kept current by `apk`.

- **Case-insensitive files** (`lib/ci.js`). Windows games ask for `img/System/IconSet.png` when the
  file is `img/system/iconset.png`. Lookups fall back to a case-insensitive match, replacing the
  original's cicpoffs FUSE mount. Node's `fs` is patched the same way.
- **NW.js API shim** (`lib/electron-preload.js`). `nw.Window`, `nw.App`, `nw.Clipboard`, `nw.Shell`,
  `nw.Screen`, stub `nw.Menu`/`Tray`, `require('nw.gui')`, `process.mainModule`,
  `chrome.runtime.reload`, and NW.js close-event semantics. `process.versions.nw` reports a modern
  NW.js, which some plugins branch on. Windows opened with `nw.Window.open()` get Node.js, and the
  game quits when its last visible window closes.
- **`window.prompt()`**, which NW.js had and Electron throws on. Answered with `zenity`, `kdialog`
  or `yad`, whichever is installed; without any, it returns the default and warns rather than
  killing the game.
- **Working directory.** The game runs from the folder holding `index.html` (`www/` for MV), the
  base NW.js games assume. Mod loaders resolve `www/mods` from there; running from the game root
  makes them search one level too high and silently find nothing.
- **Saves** are written by the game itself into `www/save/` or `save/`, byte-identical to what
  NW.js wrote, so they move freely to and from a Windows install.
- **Serving files** (`lib/serve.js`). Game files reach the page over `app://`, read by Node with at
  most 32 open at once, and `rpgm` raises the open-file limit to the hard maximum before starting
  Electron. Games that request hundreds of assets at boot otherwise exhaust the default 1024 file
  descriptors, and Electron aborts with `No file descriptors available`.
- **`package.json`** is read the way NW.js reads it: comments and trailing commas are accepted.
- **Per-game profile.** Browser storage lives in `~/.local/share/rpgm/<id>/`. `package.nw` games
  are unpacked to `~/.local/share/rpgm/unpacked/<id>/`.
- Nothing leaves your machine except what the game requests: Electron's spellchecker, which would
  otherwise fetch dictionaries, is off.

## Modded games

`rpgm --info` reports why a mod is not taking effect. Three separate mechanisms fail three ways:

- **Plugins** (`js/plugins/*.js`) run only if listed in `js/plugins.js` with `"status":true`.
  Copying a file into the folder does nothing on its own — on Windows either. `--info` lists files
  present but unregistered, entries whose file is missing, and entries switched off.
- **Mod-loader mods** (`www/mods`) are found at run time by a loader plugin and deliberately absent
  from `plugins.js`. `--info` counts them and names the loader.
- **Letter case.** If a mod's filename differs in case from the file it replaces, Windows
  overwrites and Linux keeps both, so the game loads the original. `--info` lists such paths.

Mod managers deploy mods for the game *they* launch, and MO2 overlays files virtually. rpgm runs
the game directly, so only mods physically in the game folder take effect.

## RPG Maker XP/VX/VX Ace

These run under [mkxp-z](https://github.com/mkxp-z/mkxp-z). `rpgm --setup` writes the game an
`mkxp.json` that loads `lib/rgss/all.rb`, which pulls in mkxp-z's own wrappers and rpgm's shims in
the order they need. If the game already has an `mkxp.json`, rpgm prints the keys to add instead of
touching it — merging would mean parsing JSON5, and getting that wrong discards every setting the
game shipped with.

Almost nothing here announces itself. A Windows API call that fails takes down the whole script it
sits in, and the game dies much later somewhere unrelated; `rpgm --info` names what is missing.

| Shim | What breaks without it |
|---|---|
| `msgbox_echo.rb` | RGSS reports errors with `msgbox`, which mkxp-z only shows in a window. Games that catch their own script errors then fail invisibly. This prints every dialog to the console — reach for it first when a log just stops. |
| `win32_wrap.rb` *(mkxp-z's)* | Unwrapped, `Win32API.new` **raises** instead of returning a no-op, aborting the script it appears in — usually one that was about to define a module, so the game dies later on `uninitialized constant`. |
| `kgl2_wrap.rb` *(mkxp-z's)* | Khas Ultra Lighting's `KGL2.klib`. Without it `Game_Map#initialize` never gets `initialize_ultra_graphics` and the game dies as it starts. |
| `user32_wrap.rb` | The window-geometry calls `win32_wrap.rb` leaves out. The mouse scripts subtract a garbage window origin and pin the pointer to a corner; Fullscreen++ divides by a zero-sized desktop and raises the moment you toggle fullscreen. |
| `dl_wrap.rb` | Ruby 1.9's `DL`, removed in 2.2. The all-keys input script nearly every game carries allocates its key buffer with it, so it never loads and every key mapped by letter does nothing. |
| `input_poll.rb` | Those same scripts replace `Input.update` — the only thing that refreshes mkxp-z's key states — so *all* input stops. Calls the real one once a frame when nothing else has. |
| `textmode.rb` | Windows strips `\r` while reading; Linux does not. Hand-written JSON and translation parsers then return `nil`, or collapse a file into one unusable entry, and the game fails far from the cause. |
| `ini_wrap.rb` | kernel32's `.ini` functions, which `win32_wrap.rb` stubs to 0 — so a game reading its saved volume from `Game.ini` gets 0 and plays silently. |
| `lenient.rb` | mkxp-z type-checks arguments RGSS never did (`Argument 0: Expected bool`), and rejects library names that are not valid Ruby constants. Goes last: it chains onto the two above. |

Two more traps have no shim, because they are configuration:

- **A mistyped `mkxp.json` is discarded whole.** mkxp-z parses it as JSON5, logs one line on
  failure, and falls back to defaults for *every* setting in the file. One missing comma is enough.
  `--info` points at the line.
- **F12 reloads the game**, and few survive it — a loading screen held in a global still points at
  sprites the reset disposed. Windows builds ship a DLL that swallows the key; it cannot load here,
  so `--setup` writes `"enableReset": false`, and `--info` warns when a config leaves it on.

Windows DLLs cannot load at all (`Exec format error`). Games usually carry on without whatever the
DLL did, and some cannot be ported: one palette optimiser finds a Bitmap's pixels by chasing raw
32-bit pointers through the Windows RGSS player's memory, a layout mkxp-z does not have.

Text that comes out as boxes means the game asked for a Windows font. Put a `.ttf` in a `Fonts/`
folder beside the game, or map the name with `"fontSub"`.

`RPGM_RGSS_SKIP="user32_wrap textmode"` leaves shims out. `RPGM_MKXPZ_PRELOAD` points at mkxp-z's
`scripts/preload` if rpgm cannot find it next to the `mkxp-z` command.

### Tuning

`--setup` leaves mkxp-z's graphics and performance settings commented out at the engine's own
defaults, so uncommenting one is the whole edit. Upstream's
[Graphical Enhancements](https://github.com/mkxp-z/mkxp-z/wiki/Graphical-Enhancements) and
[Performance Tips](https://github.com/mkxp-z/mkxp-z/wiki/Performance-Tips) name the features but
not the keys; these come from mkxp-z's own bundled `mkxp.json`:

| Key | Default | What it does |
|---|---|---|
| `smoothScaling`, `smoothScalingDown` | `0` | Screen scaling up / down: 0 nearest, 1 bilinear, 2 bicubic, 3 lanczos3, 4 xBRZ |
| `bitmapSmoothScaling`, `bitmapSmoothScalingDown` | `0` | The same, for individual bitmaps |
| `xbrzScalingFactor` | `1.0` | How far xBRZ scales; at least window height ÷ game height |
| `bicubicSharpness` | `100` | Sharpness for bicubic |
| `smoothScalingMipmaps` | `false` | Mipmaps when downscaling |
| `integerScalingActive` | `false` | Scale by whole pixels first, so every game pixel stays one size |
| `enableHires`, `textureScalingFactor`, `framebufferScalingFactor`, `atlasScalingFactor` | `false`, `1.0` | Replacement art from a `Hires/` folder |
| `vsync`, `syncToRefreshrate`, `fixedFramerate`, `frameSkip` | off, off, `0`, `false` | Frame pacing |
| `YJITEnable` | `false` | Compile hot Ruby; mkxp-z bundles Ruby 3.1, so it is available |
| `subImageFix` | `false` | Driver workaround for missing text or tilesets; costs speed |
| `enableBlitting` | `true` on Linux | Framebuffer blitting, the faster path |

Four combinations fail silently, and `--info` reports each: `smoothScaling` past bilinear
**force-disables `enableBlitting`**; `smoothScalingMipmaps` needs one of the `*Down` keys at `1`;
`enableHires` does nothing while the scaling factors are `1.0` or there is no `Hires/` folder; and
xBRZ with `xbrzScalingFactor` at `1.0` has nothing to scale. `--info` tokenises the config
(`lib/json5get.awk`), so a setting parked behind a `//` is correctly read as off.

## Limitations

- `electron` lives in Alpine edge's testing repository, so MV/MZ games need edge.
- `SharedArrayBuffer` is unavailable: NW.js served games from `file://`, where it exists, and rpgm
  serves from `app://`, which is not cross-origin isolated. Well-written mods fall back.
- Steam-only plugins (`greenworks` and friends) cannot load — they are native Windows binaries.
  Games generally continue past the failure.
- Electron is much newer than the NW.js builds games shipped with; a few old plugins may rely on
  behaviour since removed.
- Games packed inside `Game.exe` (Enigma Virtual Box) must be unpacked first, e.g. with
  [evbunpack](https://github.com/mos9527/evbunpack).
- Like NW.js, this gives the game full access to your files. Only run games you trust.

## Differences from the original

Removed on purpose: the NW.js downloader and version switcher (`apk` updates `electron`), cicpoffs,
the yad GUI, auto-updater, bug reporter, cheat/script menu, Pixi 5 swap, plugin installers, the
Steam compatibility tool, game exporter, the Enigma/InstallShield/Tyrano/krkr unpackers, and the
paid-version installer. Plugins can still be added by hand in `js/plugins/` and `js/plugins.js`.
RPG Maker 2000/2003 and Godot are left to `easyrpg-player` and `godot` directly — rpgm added
nothing to either.

## Tests

```sh
./test/run.sh          # everything whose prerequisites are present
```

Three tiers: `static` asserts on what `--info` and `--setup` report about skeleton game
folders, `unit` runs `lib/ci.js` under node, and `integration` plays a real MV game under
Electron to exercise the NW.js shim from inside a running game. The first two need nothing
but a shell, awk and node, and are what CI runs; the third skips itself unless Electron, a
corescript checkout and a display are present. [`test/README.md`](test/README.md) has the
details and how to add a case.

## Credits

- [rpgmakermlinux-cicpoffs](https://github.com/bakustarver/rpgmakermlinux-cicpoffs) by bakustarver —
  the project this is a rewrite of, and where most of the engine detection logic comes from.
- [mkxp-z](https://github.com/mkxp-z/mkxp-z) by Roza and contributors, and mkxp before it, which is
  what actually runs the XP/VX/VX Ace games here.
- `win32_wrap.rb` and `kgl2_wrap.rb` are mkxp-z's own preload scripts, by Ancurio, Splendide
  Imaginarius and white-axe. The shims in `lib/rgss/` extend them and follow their CC0 terms.
- Claude (Anthropic) wrote most of this code, paired with the maintainer against real games —
  every shim here exists because something concrete broke and got traced to its cause.

## License

GPL-3.0, same as the original project.
