'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ci = require('./ci');

function loose(text) {
  const n = text.length;
  const skip = i => {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text.startsWith('//', i)) { while (i < n && text[i] !== '\n') i++; continue; }
      if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      return i;
    }
  };
  let out = '', i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (text.startsWith('//', i) || text.startsWith('/*', i)) {
      i = skip(i);
    } else if (c === ',' && (text[skip(i + 1)] === '}' || text[skip(i + 1)] === ']')) {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function parsePackage(text) {
  text = text.replace(/^\uFEFF/, '');
  try { return JSON.parse(text); } catch (e) {
    try { return JSON.parse(loose(text)); } catch { throw e; }
  }
}

function load(dir) {
  const root = fs.realpathSync(dir);
  let pkg = {};
  const pj = ci.resolve(path.join(root, 'package.json'));
  if (pj) {
    try { pkg = parsePackage(fs.readFileSync(pj, 'utf8')); }
    catch (e) { console.warn(`rpgm: ignoring unreadable package.json (${e.message})`); }
  }
  const candidates = [pkg.main, 'www/index.html', 'index.html'].filter(m => /\.html?$/i.test(m || ''));
  const html = candidates.map(m => ci.resolveIn(root, m)).find(Boolean);
  if (!html) throw new Error(`no index.html in ${root}`);

  const id = crypto.createHash('sha1').update(root).digest('hex').slice(0, 12);
  const share = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const win = pkg.window || {};
  return {
    root,
    pkg,
    win,
    main: path.relative(root, html).split(path.sep).join('/'),
    id,
    data: path.join(share, 'rpgm', id),
    title: win.title || pkg.name || path.basename(root),
    test: !!process.env.RPGM_TEST,
    cheat: !!process.env.RPGM_CHEAT,
    wasd: !!process.env.RPGM_WASD,
    translate: process.env.RPGM_TRANSLATE || '',
  };
}

const urlPath = main => '/' + main.split('/').map(encodeURIComponent).join('/');

function userScripts(root) {
  try { return fs.readdirSync(root).filter(n => /\.rpgm\.js$/i.test(n)).sort(); } catch { return []; }
}

const WASD = { 87: 'up', 65: 'left', 83: 'down', 68: 'right', 69: 'ok', 81: 'escape' };
const wasd = keyMapper => Object.assign(keyMapper, WASD);

function capFps(w, clock = () => w.performance.now()) {
  const S = w.SceneManager;
  if (!S || !w.Utils || w.Utils.RPGMAKER_NAME !== 'MV' || /_accumulator/.test(String(S.updateMain))) return false;
  const step = 1000 / 60, update = S.update;
  let next = 0;
  S.update = function (...args) {
    const now = clock();
    if (now < next - 1) { this.requestUpdate(); return; }
    next = Math.max(next, now - step) + step;
    update.apply(this, args);
  };
  return true;
}

module.exports = { load, urlPath, parsePackage, userScripts, wasd, capFps };
