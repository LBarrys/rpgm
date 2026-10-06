'use strict';
const fs = require('fs');

function read(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return Object.create(null);
    throw e;
  }
  text = text.replace(/^﻿/, '');
  const parsed = text.trim() ? JSON.parse(text) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected a JSON object of "text": "translation"');
  const dict = Object.create(null);
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') throw new Error(`the translation of ${JSON.stringify(k)} is not text`);
    dict[k] = v;
  }
  return dict;
}

function write(file, dict) {
  const tmp = `${file}.rpgm-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dict, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function translator(dict) {
  const outputs = new Set(Object.values(dict).filter(Boolean));
  const fresh = [];
  return {
    fresh,
    learn(k, v) { if (v) { dict[k] = v; outputs.add(v); } },
    tr(s) {
      if (typeof s !== 'string' || !s) return s;
      if (s in dict) return dict[s] || s;
      if (!outputs.has(s) && s.length > 1 && /\p{L}/u.test(s)) { dict[s] = ''; fresh.push(s); }
      return s;
    },
  };
}

function sync(file, t, state) {
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch {}
  if (!t.fresh.length && mtime === state.mtime) return;
  let disk;
  try { disk = read(file); } catch { return; }
  for (const k in disk) t.learn(k, disk[k]);
  const added = t.fresh.splice(0).filter(s => !(s in disk));
  for (const s of added) disk[s] = '';
  if (added.length) write(file, disk);
  try { state.mtime = fs.statSync(file).mtimeMs; } catch {}
}

function install(w, file, every = 2000) {
  const t = translator(read(file));
  const state = { mtime: 0 };
  let depth = 0;
  const wrap = (proto, name, make) => {
    if (proto && typeof proto[name] === 'function') proto[name] = make(proto[name]);
  };
  const base = w.Window_Base && w.Window_Base.prototype;
  wrap(base, 'convertEscapeCharacters', f => function (text, ...rest) { return f.call(this, t.tr(text), ...rest); });
  for (const name of ['processCharacter', 'flushTextState']) {
    wrap(base, name, f => function (...args) {
      depth++;
      try { return f.apply(this, args); } finally { depth--; }
    });
  }
  wrap(w.Bitmap && w.Bitmap.prototype, 'drawText', f => function (text, ...rest) {
    return f.call(this, depth || typeof text !== 'string' ? text : t.tr(text), ...rest);
  });
  const flush = () => sync(file, t, state);
  w.setInterval(flush, every);
  w.addEventListener('beforeunload', flush);
  return { t, flush };
}

module.exports = { read, write, translator, sync, install };
