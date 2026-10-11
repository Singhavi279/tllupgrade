// Times Internet Languages Live v2 — config.json → native components. Pure ES modules, zero dependencies.
import { $, $$, h, svg, icon, rich, litWords, rangoli, onMount, flushMount } from './lib/dom.js';
import { tilt, initSpot, magnet, dragScroll, railArrows, marquee, ambient, intro, REDUCE } from './lib/fx.js';
import { initForms, openForm, startSSO, handleSSOReturn } from './lib/forms.js';

let CFG;
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const vFont = lang => (CFG.global.theme.fonts.vernacular?.[lang] ? `${CFG.global.theme.fonts.vernacular[lang]}, ${CFG.global.theme.fonts.display}` : null);
const clip = (str = '', max, label) => {
  if (!max || str.length <= max) return str;
  console.warn(`[TLL] "${label}" exceeds ${max} chars (${str.length}); truncated.`);
  return str.slice(0, max - 1).trimEnd() + '…';
};
function withUtm(url, id) {
  try {
    const u = new URL(url, location.href);
    for (const [k, v] of Object.entries(CFG.global.utm)) if (!k.startsWith('$') && !u.searchParams.has(k)) u.searchParams.set(k, v);
    if (id && !u.searchParams.has('utm_content')) u.searchParams.set('utm_content', id);
    return u.toString();
  } catch { return url; }
}

/** Render a CTA {text, action} as <a> or <button> depending on action type. */
function cta(c, cls = 'btn btn--primary', id) {
  const a = c.action || {};
  if (a.type === 'url') {
    const ext = a.target === '_blank';
    return h('a', { class: cls, href: a.appendUtm ? withUtm(a.url, id) : a.url, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, c.text);
  }
  if (a.type === 'form') return h('button', { class: cls, type: 'button', onclick: () => openForm(a.formId) }, c.text);
  if (a.type === 'sso-optin') return h('button', { class: cls, type: 'button', onclick: startSSO }, c.text);
  return h('span', { class: cls }, c.text);
}
const sectionHead = (p, extra, cls = '') => h('header', { class: `sec-head reveal ${cls}`.trim() },
  p.subheading && h('p', { class: 'eyebrow' }, p.subheading), h('h2', {}, rich(p.heading)), p.description && h('p', { class: 'lede' }, p.description), extra);
const section = (s, cls, ...kids) => h('section', { id: s.id, class: `sec ${cls} ${s.theme ? `theme-${s.theme}` : ''}`.trim() }, ...kids);
const toran = () => h('div', { class: 'toran', 'aria-hidden': 'true' });
const lazyImg = (src, alt, extra = {}) => h('img', { src, alt, loading: 'lazy', decoding: 'async', draggable: 'false', referrerpolicy: 'no-referrer', ...extra });

// ---------- component registry: JSON "component" name → function returning a DOM node ----------
const Components = {
  Navbar(s) {
    const p = s.props;
    const links = cls => p.items.map(i => h('li', {}, h('a', { href: i.href, class: i.variant === 'cta' ? `btn btn--primary btn--sm ${cls}` : null }, i.label)));
    const sheet = h('nav', { class: 'sheet', id: 'nav-sheet', 'aria-label': 'Menu' }, h('ul', {}, p.items.map(i => h('li', {}, h('a', { href: i.href }, i.label)))));
    const burger = h('button', { class: 'burger', type: 'button', 'aria-label': 'Open menu', 'aria-expanded': 'false', 'aria-controls': 'nav-sheet' }, h('span'), h('span'));
    const setOpen = o => { sheet.classList.toggle('open', o); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); document.body.classList.toggle('nav-open', o); };
    burger.addEventListener('click', () => setOpen(!sheet.classList.contains('open')));
    sheet.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    return h('header', { class: 'nav', id: s.id },
      h('div', { class: 'nav-in' }, h('a', { href: p.logo.href, class: 'nav-logo', 'aria-label': p.logo.alt }, h('img', { src: p.logo.src, alt: p.logo.alt, height: 54 })), h('ul', { class: 'nav-links' }, links('')), burger), sheet);
  },

  TrendingTicker(s) {
    const p = s.props, max = CFG.global.limits.trendingHighlightsMax; let hl = 0;
    const defs = p.items.map(i => ({ ...i, hl: i.highlight && hl++ < max }));
    const makeSet = () => h('div', { class: 'mq-set' }, defs.map(i => h('a', { class: 'tick' + (i.hl ? ' tick--hl' : ''), href: i.appendUtm ? withUtm(i.href) : i.href, target: i.external ? '_blank' : null, rel: i.external ? 'noopener' : null }, i.hl && h('span', { class: 'dot', 'aria-hidden': 'true' }), i.text)));
    const track = h('div', { class: 'mq-track', 'data-ambient': '' }), host = h('div', { class: 'mq' }, track);
    onMount(() => marquee(host, track, makeSet, { speed: 45 }));
    return h('div', { class: 'ticker', id: s.id }, h('span', { class: 'ticker-label' }, p.label), host);
  },

  HeroCarousel(s) {
    const p = s.props, c = p.carousel, dur = c.intervalMs;
    const events = CFG.page.sections.find(x => x.component === 'EventGrid')?.props.cards ?? [];
    const ev = events.find(e => e.id === p.featuredEventId) ?? events.find(e => e.status === 'upcoming');
    let idx = 0, timer, visible = true, hover = false;

    const wm = m => { if (!m.watermark?.eventName) return null; const w = { ...c.watermark, ...m.watermark }; return h('div', { class: `wm wm--${w.position}`, style: { opacity: w.opacity } }, h('strong', {}, w.eventName), h('span', {}, w.dateText)); };
    const slides = c.media.map((m, i) => h('figure', { class: 'slide' + (i ? '' : ' on'), 'aria-hidden': i ? 'true' : 'false' },
      m.type === 'video'
        ? h('video', { src: m.src, poster: m.poster, muted: true, loop: true, playsinline: true, preload: i ? 'none' : 'metadata', 'aria-label': m.alt })
        : h('img', { src: m.src, alt: m.alt, loading: i ? 'lazy' : 'eager', fetchpriority: i ? null : 'high', referrerpolicy: 'no-referrer' }), wm(m)));
    const pips = c.media.map((_, i) => h('button', { class: 'pip' + (i ? '' : ' on'), type: 'button', 'aria-label': `Show slide ${i + 1}`, onclick: () => go(i) }, h('span', { class: 'bar' })));

    const play = () => slides[idx].querySelector('video')?.play().catch(() => {});
    function go(n) {
      slides[idx].classList.remove('on'); slides[idx].setAttribute('aria-hidden', 'true'); slides[idx].querySelector('video')?.pause(); pips[idx].classList.remove('on');
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add('on'); slides[idx].setAttribute('aria-hidden', 'false'); play();
      void pips[idx].offsetWidth; pips[idx].classList.add('on'); schedule();
    }
    const canPlay = () => c.autoplay && !(c.respectReducedMotion && REDUCE) && visible && !hover;
    function schedule() { clearTimeout(timer); if (canPlay()) timer = setTimeout(() => go(idx + 1), dur); }

    // Greeting that wipes through the scripts of India (native script, in the right font).
    const gs = p.greetings ?? []; let gi = 0;
    const word = g => h('span', { class: 'greet-word', lang: g.lang, style: { 'font-family': vFont(g.lang) } }, g.text);
    const wordBox = gs.length && h('div', { class: 'greet-box' }, word(gs[0]));
    const label = gs.length && h('span', { class: 'greet-label' }, h('i'), h('b', {}, `Hello in ${gs[0].label}`));
    const gcap = gs.length && h('div', { class: 'greet', 'aria-hidden': 'true' }, wordBox, label);

    const ups = events.filter(e => e.status === 'upcoming'), order = ev ? [ev, ...ups.filter(e => e !== ev)] : [];
    let ti = 0;
    const tBody = h('div', { class: 'ticket-body' });
    const fill = e => tBody.replaceChildren(h('p', { class: 'ticket-name' }, e.name),
      h('ul', { class: 'ticket-meta' }, h('li', {}, icon('calendar', 16), e.dateText), h('li', {}, icon('pin', 16), e.venue)),
      cta(e.cta, 'btn btn--light btn--sm', 'hero-' + e.id));
    const tDots = order.map((_, i) => h('button', { class: 'tdot' + (i ? '' : ' on'), type: 'button', 'aria-label': `Show event ${i + 1}`, onclick: () => show(i) }));
    const tCount = h('span', { class: 'tcount' }, `01 / ${String(order.length).padStart(2, '0')}`);
    function show(n) {
      ti = (n + order.length) % order.length; tDots.forEach((d, i) => d.classList.toggle('on', i === ti));
      tCount.textContent = `${String(ti + 1).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}`;
      tBody.classList.remove('swap'); void tBody.offsetWidth; fill(order[ti]); tBody.classList.add('swap');
    }
    if (order.length) fill(order[0]);
    const next = order.length && h('aside', { class: 'hero-ticket', 'aria-label': 'Upcoming events' },
      h('div', { class: 'ticket-top' }, h('span', { class: 'live' }, h('i'), p.nextLabel ?? 'Next up'), order.length > 1 && tCount), tBody,
      order.length > 1 && h('div', { class: 'tdots' }, tDots));

    const cityTrack = h('div', { class: 'mq-track', 'data-ambient': '' }), cityHost = h('div', { class: 'mq' }, cityTrack);
    if (p.cities?.length) onMount(() => marquee(cityHost, cityTrack, () => h('div', { class: 'mq-set' }, p.cities.map(ct => h('span', { class: 'city' }, h('b', {}, ct.name), h('i', { lang: ct.lang, style: { 'font-family': vFont(ct.lang) } }, ct.native)))), { speed: 38 }));

    const root = h('section', { class: 'hero', id: s.id, style: { '--dur': `${dur}ms` } },
      h('div', { class: 'hero-media' }, slides), h('div', { class: 'hero-scrim' }), h('div', { class: 'hero-grain' }),
      h('div', { class: 'hero-copy' },
        h('img', { class: 'hero-logo', src: p.logo.src, alt: p.logo.alt, height: 72 }),
        gcap, h('h1', {}, rich(p.tagline)), h('p', { class: 'lede' }, p.description),
        h('div', { class: 'hero-cta' }, cta(p.cta, 'btn btn--primary btn--lg'), p.secondaryCta && cta(p.secondaryCta, 'btn btn--glass btn--lg'))),
      next, h('div', { class: 'pips' }, pips), p.cities?.length && h('div', { class: 'cities' }, cityHost));

    onMount(() => {
      $$('.btn--lg', root).forEach(b => magnet(b));
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); }).observe(root);
      if (c.pauseOnHover) {
        root.addEventListener('pointerenter', () => { hover = true; root.classList.add('is-hover'); clearTimeout(timer); });
        root.addEventListener('pointerleave', () => { hover = false; root.classList.remove('is-hover'); void pips[idx].offsetWidth; pips[idx].classList.remove('on'); void pips[idx].offsetWidth; pips[idx].classList.add('on'); schedule(); });
      }
      play(); schedule();
      if (order.length > 1 && !REDUCE) setInterval(() => { if (visible && !hover) show(ti + 1); }, 5000);
      if (gs.length > 1 && !REDUCE) setInterval(() => {
        if (!visible) return;
        gi = (gi + 1) % gs.length; wordBox.replaceChildren(word(gs[gi])); label.lastChild.textContent = `Hello in ${gs[gi].label}`;
      }, 2800);
    });
    return root;
  },

  AboutUs(s) {
    const p = s.props, paras = [].concat(p.content);
    return section(s, 'about theme-light', toran(), rangoli({ rings: 6, petals: 10, className: 'about-r' }),
      h('div', { class: 'wrap about-grid' },
        h('h2', { class: 'reveal' }, rich(p.heading)),
        h('div', { class: 'about-body' }, h('p', { class: 'lit' }, litWords(paras[0])), paras.slice(1).map(t => h('p', { class: 'reveal' }, t)))));
  },

  EventGrid(s) {
    const p = s.props, L = CFG.global.limits;
    // One card design for every event: the banner fills a fixed 3:2 frame edge to edge (no blank borders),
    // and all text sits on a solid panel below, so legibility never depends on the image.
    const card = (e, i, clone) => {
      const fb = e.image.fallback || { bgColor: '#2E3A87', textColor: '#fff' };
      const fbArt = () => h('div', { class: 'card-fb', style: { background: fb.bgColor, color: fb.textColor }, role: 'img', 'aria-label': e.image.alt }, h('span', {}, e.name));
      const media = e.image.src
        ? lazyImg(e.image.src, e.image.alt, { class: 'fg', onerror(ev) { ev.target.closest('.card-media').replaceChildren(fbArt()); } })
        : fbArt();
      const el = h('article', { class: `card card--${e.status} reveal`, id: clone ? null : `event-${e.id}`, lang: e.language, style: { '--accent': fb.bgColor, '--i': i } },
        h('div', { class: 'card-media' }, media),
        h('div', { class: 'card-body' },
          h('div', { class: 'card-top' }, h('span', { class: `chip chip--${e.status}` }, e.status === 'past' ? 'Past' : 'Upcoming'), h('span', { class: 'cat' }, e.category)),
          h('h3', {}, e.name), h('p', { class: 'desc' }, clip(e.shortDescription, L.eventShortDescription, `${e.id}.shortDescription`)),
          h('ul', { class: 'tags' }, e.tags.slice(0, L.eventTagsMax).map(t => h('li', {}, clip(t, L.eventTagLength, `${e.id}.tag`)))),
          h('ul', { class: 'meta' }, h('li', {}, icon('calendar', 16), h('time', { datetime: e.dateISO }, e.dateText)), h('li', {}, icon('pin', 16), e.venue)),
          cta(e.cta, 'btn btn--light', clone ? 'clone-' + e.id : e.id)));
      tilt(el, 5); return el;
    };
    const groups = (p.groups ?? [{ status: null, title: p.heading, layout: 'grid' }]).map(g => {
      const list = p.cards.filter(c => !g.status || c.status === g.status); if (!list.length) return null;
      const rail = g.layout === 'rail';
      let body, tools = null;
      if (rail && !REDUCE) {
        // Past events drift past on their own; hover pauses, so a card can be read and clicked.
        const track = h('div', { class: 'mq-track', 'data-ambient': '' });
        body = h('div', { class: 'mq mq--cards' }, track);
        let n = 0; onMount(() => marquee(body, track, () => { const first = !n++; return h('div', { class: 'mq-set' }, list.map((c, i) => card(c, i, !first))); }, { speed: 36 }));
      } else if (rail) {
        body = h('ul', { class: 'rail' }, list.map((c, i) => h('li', {}, card(c, i)))); dragScroll(body); tools = railArrows(body);
      } else body = h('div', { class: 'cards' }, list.map((c, i) => card(c, i)));
      return h('div', { class: `group group--${g.status}` },
        h('div', { class: 'group-head reveal' }, h('div', {}, g.kicker && h('p', { class: 'eyebrow' }, g.kicker), h('h3', {}, g.title)),
          h('div', { class: 'group-tools' }, g.countLabel && h('span', { class: 'count' }, `${String(list.length).padStart(2, '0')} ${g.countLabel}`), tools)), body);
    });
    return section(s, 'events theme-light', h('div', { class: 'wrap' }, sectionHead(p), groups));
  },

  PastSpeakers(s) {
    const p = s.props;
    const initials = n => h('div', { class: 'avatar', 'aria-hidden': 'true' }, n.replace(/^(Dr|Smt|Shri)\.?\s/, '').split(' ').map(w => w[0]).slice(0, 2).join(''));
    const person = x => h('li', { class: 'person' },
      x.photo ? lazyImg(x.photo, x.name, { width: 320, height: 400, onerror(e) { e.target.replaceWith(initials(x.name)); } }) : initials(x.name),
      h('div', { class: 'info' }, h('strong', {}, x.name), h('span', {}, x.designation), h('em', {}, x.organization)));
    const tables = p.tables.map(t => {
      const rail = t.variant !== 'featured';
      let list, tools = null;
      if (rail && !REDUCE) {
        const track = h('div', { class: 'mq-track', 'data-ambient': '' }); list = h('div', { class: `mq mq--people${/2|second|alumni/i.test(t.variant) ? ' mq--rev' : ''}` }, track);
        onMount(() => marquee(list, track, () => h('ul', { class: 'mq-set' }, t.people.map(person)), { speed: 30 }));
      } else {
        list = h('ul', { class: rail ? 'rail rail--people' : 'vip-grid' }, t.people.map(person));
        if (rail) { dragScroll(list); tools = railArrows(list); }
      }
      return h('div', { class: `people people--${t.variant}` }, h('div', { class: 'group-head reveal' }, h('h3', {}, t.title), tools), list);
    });
    return section(s, 'speakers theme-dark', h('div', { class: 'spot', 'data-spot': '' }), rangoli({ rings: 6, petals: 12, className: 'speakers-r' }), h('div', { class: 'wrap' }, sectionHead(p), tables));
  },

  BrandWall(s) {
    const p = s.props, logos = [...p.logos].sort(byOrder);
    const rows = [0, 1].map(r => {
      const order = r ? [...logos].reverse() : logos;
      const track = h('div', { class: 'mq-track', 'data-ambient': '' }), host = h('div', { class: `mq${r ? ' mq--rev' : ''}` }, track);
      onMount(() => marquee(host, track, () => h('div', { class: 'mq-set' }, order.map(l => h('div', { class: 'logo-chip' }, h('img', { src: l.src, alt: l.alt, loading: 'lazy', height: 36 })))), { speed: r ? 34 : 42 }));
      return host;
    });
    return section(s, 'brands theme-light', h('div', { class: 'wrap' }, sectionHead(p)), logos.length ? h('div', { class: 'brand-rows' }, rows) : null);
  },

  WhyTLLLive(s) {
    const p = s.props, cards = [...p.cards].sort(byOrder);
    const stack = h('div', { class: 'stack' }, cards.map((c, i) => h('article', { class: 'k', style: { '--i': i } },
      h('span', { class: 'k-n', 'aria-hidden': 'true' }, c.number ?? String(i + 1).padStart(2, '0')),
      h('div', { class: 'k-b' }, h('h3', {}, c.heading), h('p', {}, c.description)), rangoli({ rings: 3, petals: 10, className: 'k-r' }))));
    onMount(() => stackRanges(stack));
    return section(s, 'why theme-dark', h('div', { class: 'spot', 'data-spot': '' }), h('div', { class: 'wrap why-grid' }, sectionHead(p, null, 'why-head'), stack));
  },

  PartnerB2B(s) {
    const p = s.props;
    return section(s, 'partner', h('div', { class: 'blob blob--a', 'data-ambient': '' }), h('div', { class: 'blob blob--b', 'data-ambient': '' }), h('div', { class: 'blob blob--c', 'data-ambient': '' }),
      h('div', { class: 'wrap' }, sectionHead(p, h('div', { class: 'sec-cta' }, cta(p.cta, 'btn btn--light btn--lg'))),
        h('div', { class: 'tiles' }, p.cards.map((c, i) => h('article', { class: 'tile reveal', 'data-spot': '' }, h('span', { class: 'tile-n' }, String(i + 1).padStart(2, '0')), h('h3', {}, c.heading), h('p', {}, c.description))))));
  },

  FAQAccordion(s) {
    const p = s.props;
    const items = [...p.questions].sort(byOrder).map(q => h('details', { class: 'faq reveal', name: 'faq' }, h('summary', {}, h('span', {}, q.question)),
      h('p', {}, q.answer.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/).map((t, i) => (i % 2 ? h('a', { href: `mailto:${t}` }, t) : t)))));
    return section(s, 'faqsec theme-light', h('div', { class: 'wrap wrap--narrow' }, sectionHead(p), h('div', { class: 'faq-list' }, items)));
  },

  NewsletterSSO(s) {
    const p = s.props;
    return section(s, 'newsletter theme-light', h('div', { class: 'wrap' }, h('div', { class: 'news reveal' }, rangoli({ rings: 6, petals: 10, className: 'news-r' }), h('div', { class: 'hero-grain' }),
      sectionHead(p, cta(p.cta, 'btn btn--dark btn--lg')), h('p', { class: 'fine' }, CFG.global.sso.consentText))));
  },

  ContactSPOC(s) {
    const p = s.props;
    return section(s, 'contactus theme-light', h('div', { class: 'wrap' }, sectionHead(p), h('div', { class: 'contacts' }, p.cards.map(c => h('article', { class: 'contact-card reveal' },
      h('div', { class: 'contact-ic' }, icon(c.icon ?? 'mail', 22)), h('p', { class: 'cat' }, c.category), h('h3', {}, c.name),
      h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}` }, icon('phone', 16), c.phone), h('a', { href: `mailto:${c.email}` }, icon('mail', 16), c.email))))));
  },

  Footer(s) {
    const p = s.props, max = CFG.global.limits.footerTablesMax;
    return h('footer', { class: 'footer', id: s.id }, toran(), h('div', { class: 'footer-glow', 'aria-hidden': 'true' }),
      h('div', { class: 'wrap footer-grid', style: { '--cols': Math.min(p.tables.length, max) } },
        h('div', { class: 'footer-brand' }, h('a', { href: p.logo.href }, h('img', { src: p.logo.src, alt: p.logo.alt, height: 72 })), h('p', {}, p.description),
          h('ul', { class: 'socials' }, p.socials.map(x => h('li', {}, h('a', { href: x.appendUtm ? withUtm(x.url, `footer-${x.icon}`) : x.url, 'aria-label': x.label, target: '_blank', rel: 'noopener' }, icon(x.icon) ?? x.label))))),
        p.tables.slice(0, max).map(t => h('nav', { class: 'footer-col', 'aria-label': t.heading }, h('h3', {}, t.heading), h('ul', {}, t.items.map(i => h('li', {}, h('a', { href: i.href, target: i.external ? '_blank' : null, rel: i.external ? 'noopener' : null }, i.label))))))),
      h('div', { class: 'wordmark', 'aria-hidden': 'true' }, p.wordmark ?? CFG.meta.siteName),
      h('p', { class: 'copy wrap' }, '© ' + p.copyrightText.replace('{year}', new Date().getFullYear())));
  }
};

/** Why-section: measure when each sticky card gets covered, expose as px ranges for a scroll() timeline in CSS. */
function stackRanges(stack) {
  const cards = [...stack.children];
  const calc = () => {
    const top0 = stack.getBoundingClientRect().top + scrollY, gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
    let y = 0; const ys = cards.map(c => { const t = y; y += c.offsetHeight + gap; return t; });
    const tops = cards.map(c => parseFloat(getComputedStyle(c).top) || 0);
    cards.forEach((c, i) => { if (i === cards.length - 1) return; c.style.setProperty('--from', `${Math.round(top0 + ys[i] - tops[i])}px`); c.style.setProperty('--to', `${Math.round(top0 + ys[i + 1] - tops[i + 1])}px`); });
  };
  new ResizeObserver(calc).observe(stack); new ResizeObserver(calc).observe(document.body); calc();
}

// ---------- boot ----------
function applyTheme(t) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(t.colors)) r.setProperty(`--c-${k}`, v);
  r.setProperty('--font-display', t.fonts.display); r.setProperty('--font-body', t.fonts.body); if (t.fonts.accent) r.setProperty('--font-accent', t.fonts.accent);
}
async function boot() {
  const app = $('#app');
  try { CFG = await (await fetch('config.json', { cache: 'no-cache' })).json(); }
  catch (e) { app.replaceChildren(h('p', { class: 'boot' }, 'Unable to load content. Please refresh.')); return console.error(e); }
  initForms(CFG); applyTheme(CFG.global.theme);
  const frag = document.createDocumentFragment();
  for (const s of CFG.page.sections) {
    if (s.enabled === false) continue;
    const fn = Components[s.component];
    if (!fn) { console.warn('[TLL] No component registered for', s.component); continue; }
    try { frag.append(fn(s)); } catch (e) { console.error(`[TLL] ${s.component} failed`, e); }
  }
  app.replaceChildren(frag);
  app.after(h('a', { class: 'to-top', href: '#top', 'aria-label': 'Back to top' }, svg('svg', { class: 'to-top-ring', viewBox: '0 0 52 52', 'aria-hidden': 'true' }, svg('circle', { cx: 26, cy: 26, r: 24, pathLength: 1 })), icon('arrow', 20)));
  flushMount(); ambient(); initSpot();
  performance.mark('tll-mounted');
  if (!CSS.supports('animation-timeline: view()')) {      // graceful fallback without scroll-driven animations
    document.documentElement.classList.add('no-sda');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    $$('.reveal', app).forEach(el => io.observe(el));
    addEventListener('scroll', () => $('.nav-in')?.classList.toggle('solid', scrollY > 80), { passive: true });
  }
  const nav = CFG.page.sections.find(x => x.component === 'Navbar');
  intro(CFG.global.intro, nav?.props.logo ?? { src: '' });
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  handleSSOReturn();
}
boot();
