# TODO

## Wolf RPG Editor

No open-source native engine exists. [Browser Woditor](https://frostyhowl.com/browser-woditor/)
(ruka) is the real engine built for WebAssembly, with SmokingWOLF's permission; 0.6.2.0 ran its
sample game in Chromium.

- [ ] Run games released as Browser Woditor builds (`index.html` + `woditor.wasm` + `Data.wolf`)
      on electron, offline, with saves kept.
- [ ] Ask ruka ([Ci-en](https://ci-en.net/creator/12702), [X](https://x.com/rikka_gamedev))
      whether private play of owned games is allowed. Until then ordinary releases stay on Wine:
      the licence forbids converting games you hold no rights to (adding `BrowserWoditor.dat`
      and repacking `Data.wolf`).
- Gaps: no mp4 (ogv only), no network functions, nothing that needs Windows.

## PMJS

[PMJS](https://github.com/ruslan-k/pmjs) (MIT) runs MV games natively on Node with SDL2 and
GLES2, without a browser. A monthly routine checks it for new releases.

- [ ] Build and run it on Alpine (musl) and Wayland; send fixes upstream.
- [ ] Add `fetch()` upstream.
- [ ] Opt-in for MV games when installed (for example `RPGM_PMJS=1`); electron stays the default.
- Missing upstream, left to PMJS: most of MZ, Effekseer (MZ animations), WebGL shader plugins.
  Never possible: HTML/CSS games (like Secretary), which stay on electron.
