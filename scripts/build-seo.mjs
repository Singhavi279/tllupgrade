#!/usr/bin/env node
// Reads seoconfig.json (+ config.json) → sitemap.xml, robots.txt, llms.txt, and rewrites index.html:
//   <head>  — title/meta/OG/Twitter/hreflang/JSON-LD, optional inlined CSS, LCP preload
//   #app    — static prerendered markup so the first paint and crawlers do not wait on JS
// Usage: node scripts/build-seo.mjs   (Node 18+, zero dependencies)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prerender, lcpImage, esc } from './prerender.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = async f => JSON.parse(await readFile(join(root, f), 'utf8'));
const seo = await read('seoconfig.json');
const cfg = await read('config.json').catch(() => null);
const { baseUrl: base } = seo.site;
const abs = p => (/^https?:/.test(p) ? p : base + (p.startsWith('/') ? p : '/' + p));
const perf = seo.performance ?? {};
const sd = seo.structuredData ?? {};
const sections = cfg?.page.sections ?? [];
const propsOf = name => sections.find(s => s.component === name)?.props ?? null;

// ---- sitemap.xml ----
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  seo.pages.map(p => `  <url>\n    <loc>${esc(abs(p.path))}</loc>\n` +
    (p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>\n` : '') +
    (p.changefreq ? `    <changefreq>${p.changefreq}</changefreq>\n` : '') +
    (p.priority != null ? `    <priority>${Number(p.priority).toFixed(1)}</priority>\n` : '') + `  </url>`).join('\n') + `\n</urlset>\n`;

// ---- robots.txt ----
const robots = seo.robots.rules.map(r => [`User-agent: ${r.userAgent}`, ...(r.allow ?? []).map(a => `Allow: ${a}`), ...(r.disallow ?? []).map(d => `Disallow: ${d}`)].join('\n')).join('\n\n') +
  '\n\n' + seo.robots.sitemaps.map(s => `Sitemap: ${abs(s)}`).join('\n') + '\n';

// ---- llms.txt (answer-engine summary) ----
const events = propsOf('EventGrid')?.cards ?? [];
const faq = [...(propsOf('FAQAccordion')?.questions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const spocs = propsOf('ContactSPOC')?.cards ?? [];
const evUrl = e => { const u = new URL(e.cta.action.url, base); u.search = ''; return u.toString(); };
const evLine = e => `- [${e.name}](${evUrl(e)}): ${e.shortDescription} (${e.dateText}, ${e.venue}; language: ${e.language})`;
const L = seo.llms;
const llmsSection = s => [`## ${s.heading}`, '',
  ...(s.includeEvents ? events.filter(e => Object.entries(s.includeEvents).every(([k, v]) => e[k] === v)).map(evLine) : []),
  ...(s.includeFaq ? faq.flatMap(q => [`### ${q.question}`, '', q.answer, '']) : []),
  ...(s.includeContacts ? spocs.map(c => `- ${c.category}: ${c.name}, ${c.email}${c.phone ? `, ${c.phone}` : ''}`) : []),
  ...(s.links ?? []).map(l => `- [${l.title}](${abs(l.url)}): ${l.description}`), ''];
const llms = [`# ${L.title}`, '', `> ${L.summary}`, '', ...L.details.map(d => `- ${d}`), '',
  ...L.sections.flatMap(llmsSection), `Last updated: ${seo.pages[0].lastmod ?? new Date().toISOString().slice(0, 10)}`, ''].join('\n');

// ---- structured data ----
const d = seo.defaults, pg = seo.pages[0];
const title = pg.title ?? d.title;
const desc = pg.description ?? d.description, img = abs(pg.og?.image ?? d.og.image), ogDesc = pg.og?.description ?? d.og.description ?? desc;
const pageUrl = abs(pg.path);

const ld = [{ '@context': 'https://schema.org', ...sd.organization }];

if (sd.emitWebsiteSchema) ld.push({
  '@context': 'https://schema.org', '@type': 'WebSite', name: seo.site.name, url: base, inLanguage: 'en-IN',
  publisher: { '@type': 'Organization', name: seo.site.publisher },
});

if (sd.emitWebPageSchema) ld.push({
  '@context': 'https://schema.org', '@type': 'WebPage', '@id': pageUrl, url: pageUrl, name: title, description: desc,
  inLanguage: 'en-IN', isPartOf: { '@type': 'WebSite', name: seo.site.name, url: base },
  primaryImageOfPage: { '@type': 'ImageObject', url: img },
  ...(sd.speakableSelectors?.length ? { speakable: { '@type': 'SpeakableSpecification', cssSelector: sd.speakableSelectors } } : {}),
});

if (sd.emitEventSchema) for (const e of events) ld.push({
  '@context': 'https://schema.org', '@type': 'Event', name: e.name, description: e.shortDescription, startDate: e.dateISO, inLanguage: e.language,
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  eventStatus: 'https://schema.org/EventScheduled',
  location: { '@type': 'Place', name: e.venue, address: { '@type': 'PostalAddress', addressLocality: e.venue, addressCountry: 'IN' } }, url: evUrl(e),
  organizer: { '@type': 'Organization', name: seo.site.name, url: base },
  ...(e.image?.src ? { image: abs(e.image.src) } : {}) });

// One ItemList ties the individual Events together so the calendar is understood as a portfolio.
if (sd.emitItemListSchema && events.length) ld.push({
  '@context': 'https://schema.org', '@type': 'ItemList', name: propsOf('EventGrid')?.heading?.replace(/\*/g, '') ?? 'Events',
  itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: events.length,
  itemListElement: events.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, url: evUrl(e) })) });

if (sd.emitFaqSchema && faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faq.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })) });

if (sd.emitBreadcrumbSchema) ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: base }] });

// ---- <head> ----
const meta = (n, c, attrName = 'name') => `<meta ${attrName}="${n}" content="${esc(c)}">`;
const lcp = perf.preloadLcpImage && cfg ? lcpImage(cfg) : null;
const headLines = [
  `<title>${esc(title)}</title>`, meta('description', desc), meta('keywords', d.keywords.join(', ')), meta('robots', d.robots),
  meta('theme-color', seo.site.themeColor), meta('author', seo.site.author),
  ...(seo.site.googleSiteVerification ? [meta('google-site-verification', seo.site.googleSiteVerification)] : []),
  ...(seo.site.favicon ? [`<link rel="icon" type="image/png" href="${esc(seo.site.favicon)}">`] : []),
  ...(seo.site.appleTouchIcon ? [`<link rel="apple-touch-icon" href="${esc(seo.site.appleTouchIcon)}">`] : []),
  `<link rel="canonical" href="${esc(pageUrl)}">`,
  `<link rel="alternate" hreflang="en-in" href="${esc(pageUrl)}">`,
  `<link rel="alternate" hreflang="x-default" href="${esc(pageUrl)}">`,
  meta('og:site_name', seo.site.name, 'property'), meta('og:type', d.og.type, 'property'), meta('og:title', title, 'property'), meta('og:description', ogDesc, 'property'),
  meta('og:url', pageUrl, 'property'), meta('og:locale', seo.site.defaultLocale, 'property'), ...seo.site.alternateLocales.map(l => meta('og:locale:alternate', l, 'property')),
  meta('og:image', img, 'property'), meta('og:image:alt', d.og.imageAlt, 'property'), meta('og:image:width', d.og.imageWidth, 'property'), meta('og:image:height', d.og.imageHeight, 'property'),
  ...(d.og.imageType ? [meta('og:image:type', d.og.imageType, 'property')] : []),
  meta('twitter:card', d.twitter.card), meta('twitter:site', d.twitter.site), meta('twitter:creator', d.twitter.creator ?? d.twitter.site),
  meta('twitter:title', title), meta('twitter:description', desc), meta('twitter:image', img), meta('twitter:image:alt', d.og.imageAlt),
  `<link rel="alternate" type="text/plain" href="${base}/llms.txt" title="LLM summary">`,
  ...(perf.preconnect ?? []).flatMap(u => [`<link rel="preconnect" href="${esc(u)}"${/gstatic/.test(u) ? ' crossorigin' : ''}>`]),
  ...(lcp ? [`<link rel="preload" as="image" href="${esc(lcp.src)}"${lcp.srcset ? ` imagesrcset="${esc(lcp.srcset)}"` : ''}${lcp.sizes ? ` imagesizes="${esc(lcp.sizes)}"` : ''} fetchpriority="high">`] : []),
  ...ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`),
];

// Inlining the stylesheet removes the one render-blocking round trip left on the critical path.
if (perf.inlineCss) {
  const raw = (await readFile(join(root, 'css/styles.css'), 'utf8')).replace(/<\/style/gi, '<\\/style');
  // Conservative minify: quoted strings are preserved verbatim, everything between them is squeezed.
  const css = raw.split(/('[^']*'|"[^"]*")/).map((part, i) => (i % 2 ? part
    : part.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}'))).join('');
  headLines.push(`<style>${css}</style>`);
} else {
  headLines.push(`<link rel="stylesheet" href="css/styles.css">`);
}

const head = headLines.map(l => '  ' + l).join('\n');
const app = prerender(cfg);

// ---- Google Fonts: vernacular families are subset to the glyphs the page actually renders ----
// (only the hero marquee greetings use them), instead of shipping each script's full charset.
let fontsBlock = '';
const googleFonts = cfg?.global?.theme?.fonts?.googleFonts ?? [];
if (googleFonts.length) {
  const greetChars = [...new Set((propsOf('HeroCarousel')?.greetings ?? []).flatMap(g => [...g.text]))].join('');
  const core = googleFonts.filter(f => !f.vernacular).map(f => f.query);
  const vern = googleFonts.filter(f => f.vernacular).map(f => f.query);
  const fontUrl = (families, text) => {
    const u = new URL('https://fonts.googleapis.com/css2');
    for (const f of families) u.searchParams.append('family', f);
    if (text) u.searchParams.set('text', text);
    u.searchParams.set('display', 'swap');
    return u.toString().replace(/%2B/g, '+'); // Google's own docs use literal + for spaces inside family names
  };
  const urls = [core.length && fontUrl(core), vern.length && fontUrl(vern, greetChars)].filter(Boolean);
  fontsBlock = urls.map(u => `<link rel="stylesheet" href="${esc(u)}" media="print" onload="this.media='all'">`).join('\n') +
    `\n<noscript>${urls.map(u => `<link rel="stylesheet" href="${esc(u)}">`).join('')}</noscript>`;
}

const htmlPath = join(root, 'index.html');
let html = await readFile(htmlPath, 'utf8');
const swap = (re, body, what) => {
  if (!re.test(html)) throw new Error(`index.html is missing the ${what} markers`);
  html = html.replace(re, body);
};
swap(/<!-- SEO:START[^>]*-->[\s\S]*?<!-- SEO:END -->/, `<!-- SEO:START (generated by scripts/build-seo.mjs — edit seoconfig.json, not this block) -->\n${head}\n  <!-- SEO:END -->`, 'SEO');
swap(/<!-- FONTS:START[^>]*-->[\s\S]*?<!-- FONTS:END -->/, `<!-- FONTS:START (generated by scripts/build-seo.mjs from config.json global.theme.fonts.googleFonts) -->\n${fontsBlock}\n<!-- FONTS:END -->`, 'FONTS');
swap(/<!-- APP:START[^>]*-->[\s\S]*?<!-- APP:END -->/, `<!-- APP:START (generated by scripts/build-seo.mjs from config.json — replaced by js/app.js on boot) -->\n${app}\n<!-- APP:END -->`, 'APP');

await Promise.all([writeFile(join(root, 'sitemap.xml'), sitemap), writeFile(join(root, 'robots.txt'), robots), writeFile(join(root, 'llms.txt'), llms), writeFile(htmlPath, html)]);
console.log(`✓ sitemap.xml (${seo.pages.length} urls), robots.txt, llms.txt`);
console.log(`✓ index.html: ${ld.length} JSON-LD blocks, ${perf.inlineCss ? 'CSS inlined' : 'CSS linked'}, ${lcp ? `LCP preload ${lcp.src}` : 'no LCP preload'}, ${Math.round(app.length / 1024)}KB prerender, ${googleFonts.length} font families (${googleFonts.filter(f => f.vernacular).length} subset)`);
