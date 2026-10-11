#!/usr/bin/env node
// Zero-dependency static dev server: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2]) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };

// index.html is generated (inlined CSS + prerendered #app), so a stale one would hide edits to
// config.json, seoconfig.json or the stylesheet. Rebuild it whenever a source is newer.
const SOURCES = ['config.json', 'seoconfig.json', 'css/styles.css', 'scripts/prerender.mjs', 'scripts/build-seo.mjs'];
const mtime = async f => (await stat(join(root, f)).catch(() => null))?.mtimeMs ?? Infinity;
let building = null;
async function rebuildIfStale() {
  const out = await mtime('index.html');
  const newest = Math.max(...await Promise.all(SOURCES.map(mtime)));
  if (newest <= out) return;
  building ??= new Promise(done => execFile(process.execPath, [join(root, 'scripts/build-seo.mjs')], (err, _o, errOut) => {
    console.log(err ? `! build failed: ${errOut.trim()}` : '↻ rebuilt index.html');
    building = null; done();
  }));
  await building;
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (file.endsWith('index.html')) await rebuildIfStale();
  try {
    const body = await readFile(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    // Text responses go out gzipped, matching how any real host serves them — local timings stay realistic.
    const gz = /text|javascript|json|xml|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', ...(gz ? { 'content-encoding': 'gzip' } : {}) }).end(gz ? gzipSync(body) : body);
  } catch { if (!res.headersSent) res.writeHead(404).end('Not found'); }
}).listen(port, () => console.log(`TLL dev server → http://localhost:${port}`));
