// Static HTML for the first paint and for crawlers, generated from config.json.
// The browser replaces #app with the live components on boot, so this markup is a
// visual + semantic stand-in only: same text, same class names, no behaviour.
// Every emitter is keyed by the same `component` name the JS registry uses.

import { ICONS } from '../js/lib/icons.js';

/** Same markup icon() produces at runtime, so prerendered rows measure identically. */
const ico = (name, size = 20) => (ICONS[name]
  ? `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${ICONS[name]}" fill="currentColor"></path></svg>`
  : '');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "Find your *moment*" → Find your <em>moment</em> (mirrors rich() in js/lib/dom.js). */
const rich = (t = '') => String(t).split(/\*(.+?)\*/g).map((x, i) => (i % 2 ? `<em>${esc(x)}</em>` : esc(x))).join('');
const attr = (k, v) => (v == null || v === false ? '' : ` ${k}="${esc(v)}"`);
const logoImg = (lg, height, extra = '') => `<img src="${esc(lg.src)}" alt="${esc(lg.alt)}" height="${height}"` +
  (lg.width && lg.height ? ` width="${Math.round((height * lg.width) / lg.height)}"` : '') + extra + '>';
const img = (src, alt, extra = '') => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${extra}>`;
const list = (a = []) => a.join('');

/** Links render as plain anchors; anything JS-driven (forms, SSO) degrades to the contact mail link. */
const cta = (c, cls, mailto) => {
  if (!c) return '';
  const a = c.action ?? {};
  if (a.type === 'url') return `<a class="${cls}" href="${esc(a.url)}"${a.target === '_blank' ? ' target="_blank" rel="noopener"' : ''}>${esc(c.text)}</a>`;
  return mailto ? `<a class="${cls}" href="mailto:${esc(mailto)}">${esc(c.text)}</a>` : `<span class="${cls}">${esc(c.text)}</span>`;
};
const head = (p, cls = '') => `<header class="${`sec-head ${cls}`.trim()}">` +
  (p.subheading ? `<p class="eyebrow">${esc(p.subheading)}</p>` : '') +
  `<h2>${rich(p.heading)}</h2>` + (p.description ? `<p class="lede">${esc(p.description)}</p>` : '') + '</header>';
const sec = (s, cls, inner) => `<section id="${esc(s.id)}" class="sec ${cls}${s.theme ? ` theme-${s.theme}` : ''}">${inner}</section>`;

// The "next up" panel is emitted too: it is the one hero block whose arrival would otherwise shift layout.
const ticket = (p, ctx) => {
  const ups = ctx.events.filter(e => e.status === 'upcoming');
  const first = ctx.events.find(e => e.id === p.featuredEventId) ?? ups[0];
  if (!first) return '';
  const n = ups.length || 1;
  return `<aside class="hero-ticket" aria-label="${esc(ctx.t('upcomingEventsLabel', null, 'Upcoming events'))}"><div class="ticket-top">` +
    `<span class="live"><i></i>${esc(p.nextLabel ?? ctx.t('nextUpLabel', null, 'Next up'))}</span>` +
    (n > 1 ? `<span class="tcount">01 / ${String(n).padStart(2, '0')}</span>` : '') + `</div>` +
    `<div class="ticket-body"><p class="ticket-name">${esc(first.name)}</p>` +
    `<ul class="ticket-meta"><li>${ico('calendar', 16)}${esc(first.dateText)}</li><li>${ico('pin', 16)}${esc(first.venue)}</li></ul>` +
    (first.cta?.action?.url ? `<a class="btn btn--light btn--sm" href="${esc(first.cta.action.url)}">${esc(first.cta.text)}</a>` : '') +
    `</div></aside>`;
};

const EMIT = {
  Navbar: (s, ctx) => {
    const p = s.props;
    return `<header class="nav" id="${esc(s.id)}"><div class="nav-in">` +
      `<a href="${esc(p.logo.href)}" class="nav-logo" aria-label="${esc(p.logo.alt)}">${logoImg(p.logo, 54, ' fetchpriority="high"')}</a>` +
      `<ul class="nav-links">${list(p.items.map(i => `<li><a href="${esc(i.href)}"${attr('class', i.variant === 'cta' ? 'btn btn--primary btn--sm' : null)}>${esc(i.label)}</a></li>`))}</ul>` +
      `</div></header>`;
  },

  TrendingTicker: s => `<div class="ticker" id="${esc(s.id)}"><span class="ticker-label">${esc(s.props.label)}</span>` +
    `<div class="mq"><div class="mq-track"><div class="mq-set">${list(s.props.items.map(i => `<a class="tick${i.highlight ? ' tick--hl' : ''}" href="${esc(i.href)}">${esc(i.text)}</a>`))}</div></div></div></div>`,

  // The hero is the LCP block, so it is emitted with the real classes and the first slide eager.
  HeroCarousel: (s, ctx) => {
    const p = s.props, m = p.carousel.media[0] ?? {};
    const slide = m.type === 'video'
      ? `<figure class="slide on">${m.poster ? `<img src="${esc(m.poster)}" alt="${esc(m.alt ?? '')}" fetchpriority="high" decoding="async">` : ''}</figure>`
      : `<figure class="slide on"><img src="${esc(m.src)}"${attr('srcset', m.srcset)}${attr('sizes', m.sizes)}${attr('width', m.width)}${attr('height', m.height)} alt="${esc(m.alt ?? '')}" fetchpriority="high" decoding="sync"></figure>`;
    return `<section class="hero" id="${esc(s.id)}"><div class="hero-media">${slide}</div><div class="hero-scrim"></div><div class="hero-grain"></div>` +
      `<div class="hero-copy">${logoImg(p.logo, 132, ' class="hero-logo"')}` +
      `<h1>${rich(p.tagline)}</h1><p class="lede">${esc(p.description)}</p>` +
      `<div class="hero-cta">${cta(p.cta, 'btn btn--primary btn--lg', ctx.mailto)}${cta(p.secondaryCta, 'btn btn--glass btn--lg', ctx.mailto)}</div></div>` +
      ticket(p, ctx) +
      `<div class="cities"><div class="mq"><div class="mq-track"><div class="mq-set">` +
      list((p.greetings ?? []).map(g => `<span class="city city--greet"><i lang="${esc(g.lang)}">${esc(g.text)}</i><b>${esc(ctx.t('greetingLabel', { language: g.label }, 'Hello in {language}'))}</b></span>`)) +
      `</div></div></div></div></section>`;
  },

  AboutUs: s => {
    const p = s.props, items = p.stats?.items ?? [];
    return sec(s, 'about theme-light', `<div class="wrap about-grid"><div class="about-aside"><h2>${rich(p.heading)}</h2>` +
      (items.length ? `<div class="stats">${list(items.map(x => `<article class="stat"><span class="stat-num"><b>${esc(x.value)}</b><i>${esc(x.suffix ?? '')}</i></span><h3>${esc(x.label)}</h3>${x.sub ? `<p>${esc(x.sub)}</p>` : ''}</article>`))}</div>` : '') +
      `</div><div class="about-body">${list([].concat(p.content).map(t => `<p>${esc(t)}</p>`))}</div></div>`);
  },

  EventGrid: s => {
    const p = s.props;
    const card = e => `<article class="ev"><h3>${esc(e.name)}</h3>` +
      `<p class="ev-meta"><time datetime="${esc(e.dateISO ?? '')}">${esc(e.dateText)}</time> · ${esc(e.venue)} · ${esc(e.category)}</p>` +
      `<p>${esc(e.shortDescription)}</p>` + (e.cta?.action?.url ? `<a href="${esc(e.cta.action.url)}">${esc(e.cta.text)}</a>` : '') + `</article>`;
    const group = g => `<div class="ev-group"><h3 class="ev-group-title">${esc(g.title)}</h3>` +
      list(p.cards.filter(c => c.status === g.status).map(card)) + `</div>`;
    return sec(s, 'events', `<div class="wrap">${head(p)}${list((p.groups ?? []).map(group))}</div>`);
  },

  PastSpeakers: s => {
    const p = s.props;
    const person = x => `<li><strong>${esc(x.name)}</strong> — ${esc(x.designation)}${x.organisation ? `, ${esc(x.organisation)}` : ''}</li>`;
    return sec(s, 'speakers theme-dark', `<div class="wrap">${head(p)}` +
      list((p.tables ?? []).map(t => `<div class="sp-group"><h3>${esc(t.title)}</h3><ul>${list((t.people ?? []).map(person))}</ul></div>`)) + `</div>`);
  },

  BrandWall: s => sec(s, 'brands', `<div class="wrap">${head(s.props)}<ul class="brand-list">` +
    list([...(s.props.logos ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(l => `<li>${esc(String(l.alt).replace(/ logo$/i, ''))}</li>`)) + `</ul></div>`),

  WhyTLLLive: s => sec(s, 'why', `<div class="wrap">${head(s.props)}` +
    list([...(s.props.cards ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(c => `<article class="k"><h3>${esc(c.heading)}</h3><p>${esc(c.description)}</p></article>`)) + `</div>`),

  PartnerB2B: (s, ctx) => sec(s, 'partner', `<div class="wrap">${head(s.props)}` +
    list((s.props.cards ?? []).map(c => `<article class="po"><h3>${esc(c.heading)}</h3><p>${esc(c.description)}</p></article>`)) +
    cta(s.props.cta, 'btn btn--primary', ctx.mailto) + `</div>`),

  // Q&A in <details> is both the accessible no-JS fallback and the block answer engines quote.
  FAQAccordion: s => sec(s, 'faq', `<div class="wrap">${head(s.props)}` +
    list([...(s.props.questions ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(q => `<details class="qa"><summary><h3>${esc(q.question)}</h3></summary><p>${esc(q.answer)}</p></details>`)) + `</div>`),

  NewsletterSSO: (s, ctx) => sec(s, 'newsletter theme-light', `<div class="wrap"><div class="news">${head(s.props)}` +
    cta(s.props.cta, 'btn btn--dark btn--lg', ctx.mailto) + (s.props.consentText ? `<p class="fine">${esc(s.props.consentText)}</p>` : '') + `</div></div>`),

  ContactSPOC: s => sec(s, 'contact', `<div class="wrap">${head(s.props)}` +
    list((s.props.cards ?? []).map(c => `<article class="spoc"><h3>${esc(c.category)}</h3><p>${esc(c.name)}</p>` +
      `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>${c.phone ? `<p><a href="tel:${esc(String(c.phone).replace(/\s+/g, ''))}">${esc(c.phone)}</a></p>` : ''}</article>`)) + `</div>`),

  Footer: s => {
    const p = s.props;
    return `<footer class="foot" id="${esc(s.id)}"><div class="wrap">` +
      `${logoImg(p.logo, 72, ' loading="lazy" decoding="async"')}` +
      `<p>${esc(p.description)}</p>` +
      list((p.tables ?? []).map(t => `<nav class="foot-col"><h3>${esc(t.heading)}</h3><ul>${list((t.items ?? []).map(i => `<li><a href="${esc(i.href)}">${esc(i.label)}</a></li>`))}</ul></nav>`)) +
      `<ul class="foot-social">${list((p.socials ?? []).map(x => `<li><a href="${esc(x.url)}" rel="noopener">${esc(x.label)}</a></li>`))}</ul>` +
      `<p class="foot-legal">© ${esc(String(p.copyrightText ?? '').replace('{year}', new Date().getFullYear()))}</p>` +
      `</div></footer>`;
  },
};

/** Build the static #app contents for every enabled section config.json declares. */
export function prerender(cfg) {
  const mailto = cfg.page.sections.find(s => s.component === 'ContactSPOC')?.props.cards?.[0]?.email;
  const ui = cfg.global?.ui ?? {};
  const t = (k, vars, dflt) => String(ui[k] ?? dflt).replace(/\{(\w+)\}/g, (m, x) => vars?.[x] ?? m);
  const ctx = { mailto, t, events: cfg.page.sections.find(s => s.component === 'EventGrid')?.props.cards ?? [] };
  const out = [];
  for (const s of cfg.page.sections) {
    if (s.enabled === false) continue;
    const fn = EMIT[s.component];
    if (!fn) { console.warn(`[prerender] no emitter for ${s.component} — section will be JS-only`); continue; }
    out.push(fn(s, ctx));
  }
  return out.join('\n');
}

/** The one image worth a <link rel=preload>: the first hero slide, which is the LCP candidate. */
export function lcpImage(cfg) {
  const m = cfg.page.sections.find(s => s.component === 'HeroCarousel')?.props.carousel?.media?.[0];
  if (!m) return null;
  if (m.type === 'video') return m.poster ? { src: m.poster } : null;
  return m.src ? { src: m.src, srcset: m.srcset, sizes: m.sizes } : null;
}
