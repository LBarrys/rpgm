# rpgm

Runs Windows RPG Maker games natively on Alpine Linux (musl), without Wine.

## Goals

- Small, minimal, simple. Prefer the smallest change that works; don't add dependencies or layers.
- Wayland only at run time. Don't add X11 code paths.
- No Wine, ever. Engines: electron (MV/MZ/NW.js), mkxp-z (XP/VX/VX Ace), easyrpg-player (2000/2003).
- Experimental or costly features are opt-in (a flag or an `RPGM_*` variable), off by default.

## Workflow

- Commit and push straight to `main`. No branches or pull requests.
- When asked to analyse or research, give findings first; edit only when asked.
- Report what was and wasn't tested; say plainly when something couldn't be checked on a real game.
- Respect licences: don't build features that break a tool's or game's terms.

## Code

- `rpgm` is POSIX sh: must pass `shellcheck` and run under GNU sh and BusyBox sh.
- Match the surrounding style; comments only where the why isn't obvious.
- Every change gets tests; `sh test/run.sh` and `busybox sh test/run.sh` must both pass.
- MV/MZ: behave like NW.js (e.g. `require`/`process` in the page, no `module`/`exports`).
- RGSS shims loaded before the game's scripts hook with `alias_method`, never `prepend`
  (a game's later `alias` would recurse forever). `prepend` only after game scripts load.
- Options get a short and long form (`-C|--no-cheat`, `-t|--translate`, `-T|--test`, `-e|--edit-save`).
- Cheat state that should survive is kept in the save, on the player.

## README rules

- Fewest words possible. Lists and tables over paragraphs.
- Only what a user needs to install, run, or fix a game. No internals.
- A new feature gets one line at most.

## TODO.md

- One short status line per item.
