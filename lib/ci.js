'use strict';
const { existsSync, mkdirSync, readdirSync, renameSync } = require('fs');
const path = require('path');

const dirs = new Map();

function lookup(dir, name, fresh) {
  let names = dirs.get(dir);
  if (!names || fresh) {
    names = new Map();
    try {
      for (const n of readdirSync(dir)) if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
    } catch {}
    dirs.set(dir, names);
  }
  return names.get(name.toLowerCase());
}

function resolve(p) {
  p = path.resolve(p);
  if (existsSync(p)) return p;
  let cur = path.parse(p).root;
  for (const part of p.slice(cur.length).split(path.sep)) {
    if (!part) continue;
    const next = path.join(cur, part);
    if (existsSync(next)) { cur = next; continue; }
    const hit = lookup(cur, part) || lookup(cur, part, true);
    if (!hit) return null;
    cur = path.join(cur, hit);
  }
  return cur;
}

function resolveWrite(p) {
  p = path.resolve(p);
  const dir = resolve(path.dirname(p));
  return resolve(p) || (dir ? path.join(dir, path.basename(p)) : p);
}

function resolveIn(root, rel) {
  const p = path.resolve(root, '.' + path.sep + rel);
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return resolve(p);
}

function unbackslash(p) {
  if (typeof p !== 'string' || !p.includes('\\')) return p;
  const fixed = p.replace(/\\/g, '/');
  if (!existsSync(fixed) && existsSync(p)) {
    try {
      mkdirSync(path.dirname(fixed), { recursive: true });
      renameSync(p, fixed);
    } catch {}
  }
  return fixed;
}

module.exports = { resolve, resolveWrite, resolveIn, unbackslash };
