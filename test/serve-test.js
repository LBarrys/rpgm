'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { respond, mimeOf } = require('../lib/serve.js');
const { parsePackage } = require('../lib/game.js');

let failed = 0;
function is(desc, got, want) {
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpgm-serve-'));
fs.mkdirSync(path.join(root, 'img', 'system'), { recursive: true });
fs.writeFileSync(path.join(root, 'img', 'system', 'iconset.png'), '0123456789');
fs.writeFileSync(path.join(root, 'empty.json'), '');
fs.writeFileSync(path.join(root, 'test.wasm'), Buffer.from('0061736d01000000', 'hex'));
const url = p => 'app://game' + p;

(async () => {
  let r = await respond(root, url('/img/System/IconSet.png'));
  is('a wrong-case request is served', r.status, 200);
  is('with its content type', r.headers.get('content-type'), 'image/png');
  is('and its length', r.headers.get('content-length'), '10');
  is('and the whole file', await r.text(), '0123456789');
  is('pages are cross-origin isolated (opener)', r.headers.get('cross-origin-opener-policy'), 'same-origin');
  is('pages are cross-origin isolated (embedder)', r.headers.get('cross-origin-embedder-policy'), 'credentialless');

  r = await respond(root, url('/img/system/iconset.png'), 'bytes=2-5');
  is('a byte range is a 206', r.status, 206);
  is('with a Content-Range', r.headers.get('content-range'), 'bytes 2-5/10');
  is('and only those bytes', await r.text(), '2345');

  r = await respond(root, url('/img/system/iconset.png'), 'bytes=7-');
  is('an open-ended range runs to the end', await r.text(), '789');
  r = await respond(root, url('/img/system/iconset.png'), 'bytes=-3');
  is('a suffix range is the last bytes', await r.text(), '789');
  r = await respond(root, url('/img/system/iconset.png'), 'bytes=4-99');
  is('a range past the end is clamped', r.headers.get('content-range'), 'bytes 4-9/10');
  r = await respond(root, url('/img/system/iconset.png'), 'bytes=20-30');
  is('a range starting past the end is a 416', r.status, 416);
  r = await respond(root, url('/img/system/iconset.png'), 'items=0-1');
  is('a range in another unit is ignored', r.status, 200);

  r = await respond(root, url('/empty.json'));
  is('an empty file is served empty', (await r.arrayBuffer()).byteLength, 0);
  is('wasm gets the type instantiateStreaming needs', mimeOf('x/TEST.WASM'), 'application/wasm');
  is('unknown extensions are octet-stream', mimeOf('x/a.rpgmvp'), 'application/octet-stream');

  is('a missing file is a 404', (await respond(root, url('/nope.png'))).status, 404);
  is('a folder is a 404', (await respond(root, url('/img'))).status, 404);
  is('.. cannot climb out of the game', (await respond(root, url('/%2e%2e/%2e%2e/etc/passwd'))).status, 404);
  is('a malformed escape is a 404', (await respond(root, url('/%E0%A4%A'))).status, 404);

  const burst = await Promise.all(Array.from({ length: 1000 }, (_, i) =>
    respond(root, url('/img/system/iconset.png'), i % 2 ? 'bytes=0-0' : null).then(x => x.status)));
  is('1000 requests at once all succeed', burst.filter(s => s !== 200 && s !== 206).length, 0);

  is('package.json: a trailing comma is accepted', JSON.stringify(parsePackage('{"window":{"width":816,},}')), '{"window":{"width":816}}');
  is('package.json: comments are accepted', JSON.stringify(parsePackage('{ // a\n"a": /* b */ 1 }')), '{"a":1}');
  is('package.json: commas and slashes in strings survive', parsePackage('{"a":"x//y,}",}').a, 'x//y,}');
  is('package.json: a BOM is accepted', parsePackage('﻿{"a":1}').a, 1);
  let threw = false;
  try { parsePackage('{a:1}'); } catch { threw = true; }
  is('package.json: real garbage still fails', threw, true);

  fs.rmSync(root, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL serve tests crashed: ' + e.message); process.exit(1); });
