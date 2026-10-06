'use strict';
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const ci = require('./ci');

const MIME = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', wasm: 'application/wasm',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
  ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg',
  webm: 'video/webm', mp4: 'video/mp4', ogv: 'video/ogg',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};
const STREAM_ABOVE = 16 * 1024 * 1024;
const TYRANO_PC = Buffer.from('\njQuery.userenv = function () { return "pc"; };\n');
const MAX_READS = 32;

const mimeOf = file => MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';

let reading = 0;
const queue = [];
async function limited(fn) {
  if (reading >= MAX_READS) await new Promise(resolve => queue.push(resolve));
  reading++;
  try { return await fn(); } finally {
    reading--;
    const next = queue.shift();
    if (next) next();
  }
}

async function readRange(file, start, length) {
  const buf = Buffer.allocUnsafe(length);
  if (!length) return buf;
  const fh = await fs.promises.open(file, 'r');
  try {
    let done = 0;
    while (done < length) {
      const { bytesRead } = await fh.read(buf, done, length - done, start + done);
      if (!bytesRead) break;
      done += bytesRead;
    }
    return done === length ? buf : buf.subarray(0, done);
  } finally { await fh.close(); }
}

function range(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start, end;
  if (m[1]) {
    start = +m[1];
    end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  } else {
    start = Math.max(0, size - +m[2]);
    end = size - 1;
  }
  return start > end || start >= size ? { bad: true } : { start, end };
}

async function find(root, url) {
  let rel;
  try { rel = decodeURIComponent(new URL(url).pathname); } catch { return null; }
  const direct = path.resolve(root, '.' + path.sep + rel);
  if (direct !== root && !direct.startsWith(root + path.sep)) return null;
  try { return { file: direct, st: await fs.promises.stat(direct) }; } catch {}
  const file = ci.resolveIn(root, rel);
  if (!file) return null;
  try { return { file, st: await fs.promises.stat(file) }; } catch { return null; }
}

async function respond(root, url, rangeHeader) {
  const found = await find(root, url);
  if (!found || !found.st.isFile()) return new Response('Not found', { status: 404 });
  const { file, st } = found;

  const size = st.size;
  const headers = {
    'Content-Type': mimeOf(file),
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  };
  if (/(^|[\\/])tyrano[\\/]libs\.js$/i.test(file)) {
    const body = Buffer.concat([fs.readFileSync(file), TYRANO_PC]);
    return new Response(body, { headers: { ...headers, 'Content-Length': String(body.length) } });
  }
  let start = 0, end = size - 1, status = 200;
  const r = range(rangeHeader, size);
  if (r && r.bad) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  if (r) {
    ({ start, end } = r);
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  const length = end - start + 1;
  headers['Content-Length'] = String(length);
  if (length > STREAM_ABOVE) {
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status, headers });
  }
  return new Response(await limited(() => readRange(file, start, length)), { status, headers });
}

module.exports = { respond, mimeOf };
