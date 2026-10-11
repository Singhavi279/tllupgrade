#!/usr/bin/env node
// Reads seoconfig.json (+ config.json for events) → sitemap.xml, robots.txt, llms.txt, and injects <head> meta/OG/JSON-LD into index.html.
// Usage: node scripts/build-seo.mjs   (Node 18+, zero dependencies)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = async f => JSON.parse(await readFile(join(root, f), 'utf8'));
const seo = await read('seoconfig.json');
const cfg = await read('config.json').catch(() => null);
const { baseUrl: base } = seo.site;
const abs = p => (/^https?:/.test(p) ? p : base + (p.startsWith('/') ? p : '/' + p));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- sitemap.xml ----
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  seo.pages.map(p => `  <url>\n    <loc>${esc(abs(p.path))}</loc>\n` +
    (p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>\n` : '') +
    (p.changefreq ? `    <changefreq>${p.changefreq}</changefreq>\n` : '') +
    (p.priority != null ? `    <priority>${Number(p.priority).toFixed(1)}</priority>\n` : '') + `  </url>`).join('\n') + `\n</urlset>\n`;

// ---- robots.txt ----
const robots = seo.robots.rules.map(r => [`User-agent: ${r.userAgent}`, ...(r.allow ?? []).map(a => `Allow: ${a}`), ...(r.disallow ?? []).map(d => `Disallow: ${d}`)].join('\n')).join('\n\n') +
  '\n\n' + seo.robots.sitemaps.map(s => `Sitemap: ${abs(s)}`).join('\n') + '\n';

// ---- llms.txt ----
const events = cfg?.page.sections.find(s => s.component === 'EventGrid')?.props.cards ?? [];
const evUrl = e => { const u = new URL(e.cta.action.url, base); u.search = ''; return u.toString(); };
const evLine = e => `- [${e.name}](${evUrl(e)}): ${e.shortDescription} (${e.dateText}, ${e.venue}; language: ${e.language})`;
const L = seo.llms;
const llms = [`# ${L.title}`, '', `> ${L.summary}`, '', ...L.details.map(d => `- ${d}`), '',
  ...L.sections.flatMap(s => [`## ${s.heading}`, '',
    ...(s.includeEvents ? events.filter(e => Object.entries(s.includeEvents).every(([k, v]) => e[k] === v)).map(evLine) : []),
    ...(s.links ?? []).map(l => `- [${l.title}](${abs(l.url)}): ${l.description}`), ''])].join('\n');

// ---- <head> injection ----
const d = seo.defaults, pg = seo.pages[0];
const title = pg.title ?? d.title;
const desc = pg.description ?? d.description, img = abs(pg.og?.image ?? d.og.image), ogDesc = pg.og?.description ?? d.og.description ?? desc;
const meta = (n, c, attr = 'name') => `<meta ${attr}="${n}" content="${esc(c)}">`;
const ld = [{ '@context': 'https://schema.org', ...seo.structuredData.organization }];
if (seo.structuredData.emitEventSchema) for (const e of events) ld.push({
  '@context': 'https://schema.org', '@type': 'Event', name: e.name, description: e.shortDescription, startDate: e.dateISO, inLanguage: e.language,
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: e.venue }, url: evUrl(e),
  organizer: { '@type': 'Organization', name: seo.site.name, url: base }, ...(e.image.src ? { image: abs(e.image.src) } : {}) });
const faq = cfg?.page.sections.find(x => x.component === 'FAQAccordion')?.props.questions ?? [];
if (seo.structuredData.emitFaqSchema && faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })) });
const head = [
  `<title>${esc(title)}</title>`, meta('description', desc), meta('keywords', d.keywords.join(', ')), meta('robots', d.robots), meta('theme-color', seo.site.themeColor), meta('author', seo.site.author),
  ...(seo.site.googleSiteVerification ? [meta('google-site-verification', seo.site.googleSiteVerification)] : []),
  ...(seo.site.favicon ? [`<link rel="icon" type="image/png" href="${seo.site.favicon}">`] : []),
  `<link rel="canonical" href="${esc(abs(pg.path))}">`,
  meta('og:site_name', seo.site.name, 'property'), meta('og:type', d.og.type, 'property'), meta('og:title', title, 'property'), meta('og:description', ogDesc, 'property'),
  meta('og:url', abs(pg.path), 'property'), meta('og:locale', seo.site.defaultLocale, 'property'), ...seo.site.alternateLocales.map(l => meta('og:locale:alternate', l, 'property')),
  meta('og:image', img, 'property'), meta('og:image:alt', d.og.imageAlt, 'property'), meta('og:image:width', d.og.imageWidth, 'property'), meta('og:image:height', d.og.imageHeight, 'property'),
  meta('twitter:card', d.twitter.card), meta('twitter:site', d.twitter.site), meta('twitter:creator', d.twitter.creator ?? d.twitter.site), meta('twitter:title', title), meta('twitter:description', desc), meta('twitter:image', img),
  `<link rel="alternate" type="text/plain" href="${base}/llms.txt" title="LLM summary">`,
  ...ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
].map(l => '  ' + l).join('\n');

const htmlPath = join(root, 'index.html');
let html = await readFile(htmlPath, 'utf8');
html = html.replace(/<!-- SEO:START[^>]*-->[\s\S]*?<!-- SEO:END -->/, `<!-- SEO:START (generated by scripts/build-seo.mjs from seoconfig.json) -->\n${head}\n  <!-- SEO:END -->`);

await Promise.all([writeFile(join(root, 'sitemap.xml'), sitemap), writeFile(join(root, 'robots.txt'), robots), writeFile(join(root, 'llms.txt'), llms), writeFile(htmlPath, html)]);
console.log('✓ sitemap.xml, robots.txt, llms.txt written; index.html <head> updated');
