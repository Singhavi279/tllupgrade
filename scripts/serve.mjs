#!/usr/bin/env node
// Zero-dependency static dev server: node scripts/serve.mjs [port]
// Also hosts the /admincms/api/* endpoints that let the admin GUI write config.json, seoconfig.json
// and uploaded images straight to disk. Those endpoints only exist here — a static host such as
// GitHub Pages has no server, so the GUI falls back to downloading the edited files there.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2]) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4' };

// index.html is generated (inlined CSS + prerendered #app), so a stale one would hide edits to
// config.json, seoconfig.json or the stylesheet. Rebuild it whenever a source is newer.
const SOURCES = ['config.json', 'seoconfig.json', 'css/styles.css', 'scripts/prerender.mjs', 'scripts/build-seo.mjs'];
const mtime = async f => (await stat(join(root, f)).catch(() => null))?.mtimeMs ?? Infinity;
let building = null;
const rebuild = () => (building ??= new Promise(done => execFile(process.execPath, [join(root, 'scripts/build-seo.mjs')], (err, _o, errOut) => {
  console.log(err ? `! build failed: ${errOut.trim()}` : '↻ rebuilt index.html');
  building = null; done(err ? errOut.trim() || err.message : null);
})));
async function rebuildIfStale() {
  const out = await mtime('index.html');
  const newest = Math.max(...await Promise.all(SOURCES.map(mtime)));
  if (newest > out) await rebuild();
}

// ---- admin API ----
const EDITABLE = new Set(['config.json', 'seoconfig.json']);
const IMAGE_PATH = /^assets\/[\w\-./]+\.(png|jpe?g|webp|svg|gif|avif)$/i;
const MAX_BODY = 20 * 1024 * 1024;
const json = (res, code, obj) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(obj));
const readBody = req => new Promise((ok, fail) => {
  const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > MAX_BODY) { fail(new Error('body too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
  req.on('error', fail);
});
// These endpoints write to disk, so they answer only to this machine and only to pages this server served.
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const sameOrigin = req => { const o = req.headers.origin; return !o || new URL(o).host === req.headers.host; };

async function adminApi(req, res, route) {
  if (!isLocal(req) || !sameOrigin(req) || req.headers['x-admincms'] !== '1') return json(res, 403, { error: 'forbidden' });
  if (route === 'ping') return json(res, 200, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON body' }); }

  if (route === 'save') {
    if (!EDITABLE.has(body.file) || body.data == null || typeof body.data !== 'object') return json(res, 400, { error: 'unknown file or empty data' });
    await writeFile(join(root, body.file), JSON.stringify(body.data, null, 2) + '\n');
    const buildError = await rebuild();
    return json(res, 200, { ok: true, file: body.file, rebuilt: !buildError, buildError });
  }
  if (route === 'upload') {
    const rel = normalize(String(body.path ?? '')).replace(/\\/g, '/');
    if (!IMAGE_PATH.test(rel) || rel.includes('..') || typeof body.base64 !== 'string') return json(res, 400, { error: 'path must be assets/… with an image extension' });
    const dest = join(root, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(body.base64, 'base64'));
    return json(res, 200, { ok: true, path: rel });
  }
  return json(res, 404, { error: 'unknown route' });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const path = normalize(decodeURIComponent(url.pathname));
    if (path.startsWith('/admincms/api/')) return await adminApi(req, res, path.slice('/admincms/api/'.length));

    let file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    // /admincms → /admincms/ so the page's relative URLs resolve (GitHub Pages does the same).
    if (!path.endsWith('/') && !extname(path) && (await stat(file).catch(() => null))?.isDirectory()) return res.writeHead(301, { location: path + '/' + url.search }).end();
    if (file === join(root, 'index.html')) await rebuildIfStale();

    const body = await readFile(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    // Text responses go out gzipped, matching how any real host serves them — local timings stay realistic.
    const gz = /text|javascript|json|xml|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', ...(gz ? { 'content-encoding': 'gzip' } : {}) }).end(gz ? gzipSync(body) : body);
  } catch (e) { if (!res.headersSent) res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500).end(e.code === 'ENOENT' || e.code === 'EISDIR' ? 'Not found' : 'Server error'); }
}).listen(port, () => console.log(`TLL dev server → http://localhost:${port}   (admin: /admincms/)`));
