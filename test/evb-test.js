'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { aplib, unpack } = require('../lib/evb.js');

function pack(data) {
  const out = [data[0]];
  let tag = 0, n = 8;
  const bit = b => {
    if (n === 8) { tag = out.length; out.push(0); n = 0; }
    if (b) out[tag] |= 0x80 >> n;
    n++;
  };
  for (let k = 1; k < data.length; k++) { bit(0); out.push(data[k]); }
  bit(1); bit(1); bit(0); out.push(0);
  return Buffer.from(out);
}

function evb(root) {
  const table = [], blobs = [];
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const node = n => {
    const kids = n.children || [];
    table.push(u32(0), Buffer.alloc(8), u32(kids.length), Buffer.from(n.name + '\0', 'utf16le'), Buffer.from([kids.length || !n.data ? 3 : 2]));
    if (n.data) {
      let blob = n.data;
      if (n.chunks) {
        const chunks = n.chunks.map(c => (Buffer.isBuffer(c) && c.raw ? c : pack(c)));
        const sizes = chunks.map(c => c.length);
        const index = sizes.flatMap((s, k) => (k < sizes.length - 1 ? [u32(s), u32(0), u32(0)] : [u32(s)]));
        const block = 8 + 4 * index.length;
        blob = Buffer.concat([u32(block), u32(0), ...index, ...chunks]);
      }
      const opt = Buffer.alloc(53);
      opt.writeUInt32LE(n.data.length, 2);
      opt.writeUInt32LE(blob.length, 49);
      table.push(opt);
      blobs.push(blob);
    } else {
      table.push(Buffer.alloc(25));
      kids.forEach(node);
    }
  };
  node(root);
  const t = Buffer.concat(table);
  const pe = Buffer.alloc(512);
  pe.write('MZ', 0);
  pe.write('.enigma1', 400);
  const main = Buffer.concat([u32(t.length + 11), Buffer.alloc(8), u32(1)]);
  return Buffer.concat([pe, Buffer.from('EVB\0'), Buffer.alloc(60), main.subarray(0, 15), t, ...blobs]);
}

const vector = Object.assign(Buffer.from('5400686520717569636bec620e726f776ece66ae7880 6a756d7073ede4766575726074 3f6c617a79ea64fe67c000'.replace(/ /g, ''), 'hex'), { raw: true });
const quick = Buffer.from('The quick brown fox jumps over the lazy dog');
const page = Buffer.from('<!doctype html>'.repeat(50));
const game = {
  name: '%DEFAULT FOLDER%',
  children: [
    { name: 'package.json', data: Buffer.from('{"main":"www/index.html"}') },
    { name: 'www', children: [
      { name: 'index.html', data: page, chunks: [page.subarray(0, 300), page.subarray(300)] },
      { name: 'js', children: [{ name: 'quick.txt', data: quick, chunks: [vector] }] },
      { name: 'セーブ.txt', data: Buffer.from('save') },
      { name: 'empty.txt', data: Buffer.alloc(0) },
    ] },
  ],
};

module.exports = { evb, game };

if (require.main === module) {
  let failed = 0;
  const is = (desc, got, want) => {
    if (got === want) { console.log('ok ' + desc); return; }
    failed++;
    console.log('FAIL ' + desc + ' (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')');
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpgm-evb-'));
  const read = p => { try { return fs.readFileSync(path.join(tmp, 'out', p), 'utf8'); } catch { return null; } };

  is('aPLib decodes its reference vector', aplib(vector).toString(), quick.toString());
  is('aPLib round-trips literal data', aplib(pack(page)).toString(), page.toString());

  fs.writeFileSync(path.join(tmp, 'Game.exe'), evb(game));
  try { unpack(path.join(tmp, 'Game.exe'), path.join(tmp, 'out')); } catch (e) { console.log('FAIL unpack threw: ' + e.message); failed++; }
  is('a stored file is extracted at the root', read('package.json'), '{"main":"www/index.html"}');
  is('a file compressed in two chunks is extracted', read('www/index.html'), page.toString());
  is('a nested compressed file is extracted', read('www/js/quick.txt'), quick.toString());
  is('UTF-16 names survive', read('www/セーブ.txt'), 'save');
  is('an empty file is extracted', read('www/empty.txt'), '');

  const evil = { name: '%DEFAULT FOLDER%', children: [{ name: '..', children: [{ name: 'x', data: Buffer.from('x') }] }] };
  fs.writeFileSync(path.join(tmp, 'Evil.exe'), evb(evil));
  let msg = '';
  try { unpack(path.join(tmp, 'Evil.exe'), path.join(tmp, 'evil')); } catch (e) { msg = e.message; }
  is('a .. entry is refused', /bad name/.test(msg), true);

  fs.writeFileSync(path.join(tmp, 'Plain.exe'), Buffer.alloc(4096));
  msg = '';
  try { unpack(path.join(tmp, 'Plain.exe'), path.join(tmp, 'plain')); } catch (e) { msg = e.message; }
  is('an unpacked .exe is refused', /not packed/.test(msg), true);

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
