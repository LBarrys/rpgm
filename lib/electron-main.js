'use strict';
const { app, BrowserWindow, clipboard, ipcMain, protocol, screen, session, shell } = require('electron');
const path = require('path');
const ci = require('./ci');
const game = require('./game');
const serve = require('./serve');

let g;
try { g = game.load(process.env.RPGM_GAME || process.cwd()); } catch (e) { console.error(`rpgm: ${e.message}`); process.exit(1); }
if (g.translate) {
  try { require('./translate').read(g.translate); } catch (e) {
    console.error(`rpgm: ${g.translate}: ${e.message}; translation is off and the file is left alone`);
    g.translate = '';
  }
}
process.chdir(path.dirname(path.join(g.root, g.main)));
app.setName(g.title);
app.setVersion(String(g.pkg.version || '1.0.0'));
app.setPath('userData', g.data);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
}]);

const webPreferences = {
  preload: path.join(__dirname, 'electron-preload.js'),
  nodeIntegration: true,
  contextIsolation: false,
  sandbox: false,
  webSecurity: false,
  backgroundThrottling: false,
  spellcheck: false,
};

function windowOptions(w = {}) {
  const icon = w.icon && ci.resolveIn(g.root, w.icon);
  const opts = {
    title: w.title || g.title,
    width: +w.width || 816,
    height: +w.height || 624,
    useContentSize: true,
    center: true,
    resizable: w.resizable !== false,
    fullscreen: !!w.fullscreen,
    frame: w.frame !== false,
    alwaysOnTop: !!(w.always_on_top || w['always-on-top']),
    show: w.show !== false,
    backgroundColor: '#000000',
    webPreferences,
  };
  if (icon) opts.icon = icon;
  for (const [k, v] of [['minWidth', w.min_width], ['minHeight', w.min_height], ['maxWidth', w.max_width], ['maxHeight', w.max_height]]) {
    if (+v > 0) opts[k] = +v;
  }
  return opts;
}

const ops = {
  init: () => ({ root: g.root, main: path.join(g.root, g.main), argv: g.test ? ['test'] : [], manifest: g.pkg, dataPath: g.data, editor: g.editor, wasd: g.wasd, translate: g.translate,
    scripts: game.userScripts(g.root).map(n => 'app://game' + game.urlPath(n)) }),
  id: w => w.id,
  hookClose: (w, on) => { w.rpgmHook = !!on; },
  nextOpen: (w, opts) => { w.rpgmNextOpen = opts && typeof opts === 'object' ? opts : {}; },
  lastOpened: w => w.rpgmLastOpened || null,
  setProp: (w, key, value) => { w.rpgmProps[key] = value; },
  getProp: (w, key) => (Object.hasOwn(w.rpgmProps, key) ? w.rpgmProps[key] : null),
  isVisible: w => w.isVisible(),
  close: (w, force) => { setImmediate(() => (force ? w.destroy() : w.close())); },
  quit: () => { for (const w of BrowserWindow.getAllWindows()) w.rpgmForce = true; setImmediate(() => app.quit()); },
  closeAll: () => BrowserWindow.getAllWindows().forEach(w => setImmediate(() => w.close())),
  show: w => w.show(),
  hide: w => w.hide(),
  focus: w => w.focus(),
  blur: w => w.blur(),
  minimize: w => w.minimize(),
  maximize: w => w.maximize(),
  unmaximize: w => w.unmaximize(),
  restore: w => w.restore(),
  center: w => w.center(),
  fullscreen: (w, on) => w.setFullScreen(on == null ? !w.isFullScreen() : !!on),
  isFullscreen: w => w.isFullScreen(),
  isAlwaysOnTop: w => w.isAlwaysOnTop(),
  bounds: w => w.getBounds(),
  setBounds: (w, b) => w.setBounds(b),
  title: w => w.getTitle(),
  setTitle: (w, t) => w.setTitle(String(t)),
  setResizable: (w, v) => w.setResizable(!!v),
  setAlwaysOnTop: (w, v) => w.setAlwaysOnTop(!!v),
  setMinimumSize: (w, x, y) => w.setMinimumSize(x | 0, y | 0),
  setMaximumSize: (w, x, y) => w.setMaximumSize(x | 0, y | 0),
  requestAttention: (w, v) => w.flashFrame(!!v),
  setProgressBar: (w, v) => w.setProgressBar(+v),
  devtools: (w, on) => { if (on) w.webContents.openDevTools({ mode: 'detach' }); else w.webContents.closeDevTools(); },
  isDevToolsOpen: w => w.webContents.isDevToolsOpened(),
  zoom: (w, z) => { if (z != null) w.webContents.setZoomLevel(+z); return w.webContents.getZoomLevel(); },
  reload: w => w.webContents.reloadIgnoringCache(),
  clearCache: w => { w.webContents.session.clearCache(); },
  screens: () => screen.getAllDisplays().map(d => ({
    id: d.id, bounds: d.bounds, work_area: d.workArea, scaleFactor: d.scaleFactor, isBuiltIn: d.internal,
  })),
  clipRead: (w, type) => (type === 'html' ? clipboard.readHTML() : type === 'rtf' ? clipboard.readRTF() : clipboard.readText()),
  clipWrite: (w, data) => clipboard.write(data),
  clipClear: () => clipboard.clear(),
  clipTypes: () => clipboard.availableFormats(),
  openExternal: (w, url) => { shell.openExternal(String(url)); },
  openPath: (w, p) => { shell.openPath(String(p)); },
  showItem: (w, p) => { shell.showItemInFolder(String(p)); },
};

function cloneable(v) {
  const t = typeof v;
  if (v === null || v === undefined || t === 'function' || t === 'symbol') return null;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
}

ipcMain.on('nw', (e, target, op, ...args) => {
  try {
    const w = target ? BrowserWindow.fromId(target) : BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) { e.returnValue = null; return; }
    e.returnValue = cloneable(ops[op](w, ...args));
  } catch (err) {
    console.error(`rpgm: nw ${op} failed:`, err);
    e.returnValue = null;
  }
});

const nwEvents = {
  focus: 'focus', blur: 'blur', minimize: 'minimize', restore: 'restore', maximize: 'maximize',
  resize: 'resize', move: 'move', 'enter-full-screen': 'enter-fullscreen', 'leave-full-screen': 'leave-fullscreen',
};

function emit(w, ev) {
  for (const t of [w, w.rpgmOpener]) {
    if (t && !t.isDestroyed()) t.webContents.send('nw-event', w.id, ev);
  }
}

app.on('browser-window-created', (_e, w) => {
  w.removeMenu();
  w.rpgmProps = {};
  w.on('close', e => {
    if (w.rpgmHook && !w.rpgmForce) { e.preventDefault(); emit(w, 'close'); }
  });
  for (const [ev, nwEv] of Object.entries(nwEvents)) {
    w.on(ev, () => { if (!w.isDestroyed()) emit(w, nwEv); });
  }
  w.webContents.on('did-finish-load', () => emit(w, 'loaded'));
  const id = w.id;
  const opener = () => w.rpgmOpener;
  w.on('closed', () => {
    const o = opener();
    if (o && !o.isDestroyed()) o.webContents.send('nw-event', id, 'closed');
    const rest = BrowserWindow.getAllWindows().filter(x => !x.isDestroyed());
    if (!rest.some(x => x.isVisible())) rest.forEach(x => x.destroy());
  });
  const external = url => /^(https?|mailto):/i.test(url);
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) { shell.openExternal(url); return { action: 'deny' }; }
    const opts = windowOptions(w.rpgmNextOpen);
    w.rpgmNextOpen = undefined;
    return { action: 'allow', overrideBrowserWindowOptions: opts };
  });
  w.webContents.on('did-create-window', child => {
    child.rpgmOpener = w;
    w.rpgmLastOpened = child.id;
  });
  w.webContents.on('will-navigate', (e, url) => { if (external(url)) { e.preventDefault(); shell.openExternal(url); } });
  if (g.test) {
    w.webContents.on('before-input-event', (e, i) => {
      if (i.type === 'keyDown' && i.key === 'F12') w.webContents.toggleDevTools();
    });
  }
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerLanguages([]);

  protocol.handle('app', req => serve.respond(g.root, req.url, req.headers.get('range')));

  new BrowserWindow(windowOptions(g.win)).loadURL('app://game' + game.urlPath(g.main));
});
