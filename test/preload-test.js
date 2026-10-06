'use strict';
const Module = require('module');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

let calls = [];
const handlers = {};
let now = { bounds: { x: 10, y: 20, width: 816, height: 624 }, fullscreen: false, top: false };
const reply = (op, args) => {
  if (op === 'init') return { root: '/', main: '/index.html', argv: [], manifest: {}, dataPath: '/', scripts: [] };
  if (op === 'id') return 7;
  if (op === 'state') return now;
  if (op === 'setBounds') return (now = { ...now, bounds: { ...now.bounds, ...args[0] } });
  if (op === 'fullscreen') return (now = { ...now, fullscreen: args[0] == null ? !now.fullscreen : args[0] });
  return null;
};
const electron = {
  ipcRenderer: {
    sendSync: (_ch, _target, op, ...args) => { calls.push(op); return reply(op, args); },
    on: (ch, f) => { handlers[ch] = f; },
  },
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? electron : load.call(this, request, ...rest); };
global.window = { addEventListener() {}, location: { reload() {} } };
require('../lib/electron-preload.js');

const win = window.nw.Window.get();
calls = [];
const seen = [];
for (let frame = 0; frame < 60; frame++) seen.push(win.x, win.y, win.width, win.height, win.isFullscreen, win.isAlwaysOnTop);
is('60 frames of window reads cost one call to the main process', calls, ['state']);
is('and give the window state', seen.slice(0, 6), [10, 20, 816, 624, false, false]);
calls = [];
win.width = 1024;
is('a size change is seen at once', [win.width, win.height], [1024, 624]);
win.toggleFullscreen();
is('so is fullscreen', win.isFullscreen, true);
is('each change is one call', calls, ['setBounds', 'fullscreen']);
let sizeInHandler = null;
win.on('resize', () => { sizeInHandler = win.width; });
handlers['nw-event'](null, 7, 'resize', { ...now, bounds: { ...now.bounds, width: 640 } });
is('a resize from outside reaches the cache before the game hears of it', sizeInHandler, 640);
calls = [];
win.moveBy(5, 5);
is('moveBy uses the cache and makes one call', [calls, win.x, win.y], [['setBounds'], 15, 25]);

process.exit(failed ? 1 : 0);
