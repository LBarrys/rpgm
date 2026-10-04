'use strict';
// Ported from evbunpack by mos9527 (Apache-2.0, https://github.com/mos9527/evbunpack) and the aPLib
// decompressor in aplib by Sandor Nemes (GPL-3.0, https://github.com/snemes/aplib), with changes.
const fs = require('fs');
const path = require('path');

function aplib(src) {
  if (src.length >= 24 && src.toString('latin1', 0, 4) === 'AP32') {
    src = src.subarray(src.readUInt32LE(4), src.readUInt32LE(4) + src.readUInt32LE(8));
  }
  const out = [];
  let i = 0, tag = 0, bits = 0;
  const byte = () => { if (i >= src.length) throw new Error('end'); return src[i++]; };
  const bit = () => {
    if (--bits < 0) { tag = byte(); bits = 7; }
    const b = (tag >> 7) & 1;
    tag = (tag << 1) & 0xff;
    return b;
  };
  const gamma = () => { let r = 1; do r = (r << 1) + bit(); while (bit()); return r; };
  const copy = (offs, len) => {
    while (len--) {
      const j = offs > 0 ? out.length - offs : -offs;
      if (j < 0 || j >= out.length) throw new Error('offset');
      out.push(out[j]);
    }
  };
  try {
    let r0 = -1, lwm = 0;
    out.push(byte());
    for (;;) {
      if (!bit()) { if (i < src.length) out.push(src[i++]); lwm = 0; } else if (!bit()) {
        let offs = gamma();
        if (!lwm && offs === 2) copy(r0, gamma());
        else {
          offs = ((offs - (lwm ? 2 : 3)) << 8) + byte();
          let len = gamma();
          if (offs >= 32000) len++;
          if (offs >= 1280) len++;
          if (offs < 128) len += 2;
          copy(offs, len);
          r0 = offs;
        }
        lwm = 1;
      } else if (!bit()) {
        const b = byte();
        if (!(b >> 1)) break;
        copy(b >> 1, 2 + (b & 1));
        r0 = b >> 1;
        lwm = 1;
      } else {
        let offs = 0;
        for (let k = 0; k < 4; k++) offs = (offs << 1) + bit();
        if (offs) copy(offs, 1); else out.push(0);
        lwm = 0;
      }
    }
  } catch {}
  return Buffer.from(out);
}

function unpack(exe, dest) {
  const fd = fs.openSync(exe, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (pos, len) => {
    const b = Buffer.alloc(len);
    return b.subarray(0, fs.readSync(fd, b, 0, len, pos));
  };

  let magic = -1;
  for (let pos = 0; pos < size && magic < 0; pos += 1 << 20) {
    const i = read(pos, (1 << 20) + 3).indexOf('EVB\0', 0, 'latin1');
    if (i >= 0) magic = pos + i;
  }
  if (magic < 0) throw new Error(`${exe} is not packed with Enigma Virtual Box`);

  const main = read(magic + 64, 16);
  let data = magic + 80 + main.readUInt32LE(0) - 12;
  let pos = magic + 79;
  const nodes = [];
  let max = 0, seen = 0;
  for (;;) {
    const head = read(pos, 16);
    if (head.length < 16) break;
    pos += 16;
    let end = pos;
    while (end + 1 < size) { const p = read(end, 2); if (!p[0] && !p[1]) break; end += 2; }
    const node = { name: read(pos, end - pos).toString('utf16le'), type: read(end + 2, 1)[0], count: head.readUInt32LE(12) };
    pos = end + 3;
    if (node.type === 2) {
      const opt = read(pos, 53);
      pos += 53;
      Object.assign(node, { original: opt.readUInt32LE(2), stored: opt.readUInt32LE(49), offset: data });
      data += node.stored;
    } else if (node.type === 3) {
      pos += 25;
      max += node.count;
    } else break;
    nodes.push(node);
    if (++seen > max && max > 0) break;
  }

  const write = (file, n) => {
    const out = fs.openSync(file, 'w');
    try {
      if (n.original === n.stored) {
        for (let done = 0; done < n.stored; done += 1 << 20) fs.writeSync(out, read(n.offset + done, Math.min(1 << 20, n.stored - done)));
        return;
      }
      const block = read(n.offset, 4).readUInt32LE(0);
      const table = read(n.offset + 8, block - 8);
      let at = n.offset + block, left = n.stored - block, total = 0;
      for (let k = 0; left > 0; k += 12) {
        const chunk = read(at, Math.min(k + 4 <= table.length ? table.readUInt32LE(k) : 65536, left));
        if (!chunk.length) break;
        at += chunk.length;
        left -= chunk.length;
        total += fs.writeSync(out, aplib(chunk));
      }
      if (total !== n.original) throw new Error(`${file}: unpacked ${total} bytes, expected ${n.original}`);
    } finally { fs.closeSync(out); }
  };

  let next = 0;
  const walk = dir => {
    const n = nodes[next++];
    if (!n) throw new Error('the file table is cut short');
    const name = n.type === 3 && n.name === '%DEFAULT FOLDER%' ? '' : n.name;
    if (/[\\/:]/.test(name) || name === '.' || name === '..') throw new Error(`bad name in file table: ${name}`);
    const p = path.join(dir, name);
    if (n.type === 2) write(p, n);
    else {
      fs.mkdirSync(p, { recursive: true });
      for (let k = 0; k < n.count; k++) walk(p);
    }
  };
  fs.mkdirSync(dest, { recursive: true });
  for (let k = 0; k < main.readUInt32LE(12); k++) walk(dest);
  fs.closeSync(fd);
}

module.exports = { aplib, unpack };

if (require.main === module) {
  try { unpack(process.argv[2], process.argv[3]); } catch (e) { console.error(`rpgm: ${e.message}`); process.exit(1); }
}
