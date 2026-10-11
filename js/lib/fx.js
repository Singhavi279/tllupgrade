// Interaction effects. Pointer-driven values are written as CSS variables; all motion itself lives in CSS.
import { h, icon, $$, rangoli } from './dom.js';
import { t } from './ui.js';

export const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const raf = fn => { let id; return (...a) => { cancelAnimationFrame(id); id = requestAnimationFrame(() => fn(...a)); }; };

/** 3D tilt + glare. Writes --rx/--ry (deg) and --mx/--my (%). */
export function tilt(el, max = 6) {
  if (!FINE || REDUCE) return;
  const move = raf(e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((.5 - y) * max).toFixed(2)}deg`); el.style.setProperty('--ry', `${((x - .5) * max).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

/** Delegated spotlight: any [data-spot] element gets --mx/--my in px relative to itself. */
export function initSpot() {
  if (!FINE) return;
  const move = raf(e => {
    const t = e.target.closest?.('[data-spot]'); if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
  document.addEventListener('pointermove', move, { passive: true });
}

/** Magnetic buttons: nudge toward the pointer using the individual `translate` property. */
export function magnet(el, pull = .22) {
  if (!FINE || REDUCE) return;
  el.addEventListener('pointermove', raf(e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--tx', `${((e.clientX - r.left - r.width / 2) * pull).toFixed(1)}px`);
    el.style.setProperty('--ty', `${((e.clientY - r.top - r.height / 2) * pull).toFixed(1)}px`);
  }));
  el.addEventListener('pointerleave', () => { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); });
}

/** Mouse drag-to-scroll for horizontal scroll-snap rails (touch already scrolls natively). */
export function dragScroll(rail) {
  let down = false, moved = false, sx = 0, sl = 0;
  rail.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button) return; down = true; moved = false; sx = e.clientX; sl = rail.scrollLeft; });
  addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (!moved && Math.abs(dx) > 6) { moved = true; rail.classList.add('dragging'); }
    if (moved) rail.scrollLeft = sl - dx;
  });
  addEventListener('pointerup', () => { if (!down) return; down = false; rail.classList.remove('dragging'); });
  rail.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  rail.addEventListener('dragstart', e => e.preventDefault());
}

export function railArrows(rail) {
  const step = dir => rail.scrollBy({ left: dir * Math.max(280, rail.clientWidth * .75), behavior: REDUCE ? 'auto' : 'smooth' });
  return h('div', { class: 'arrows' },
    h('button', { class: 'arrow arrow--prev', type: 'button', 'aria-label': t('scrollLeft'), onclick: () => step(-1) }, icon('arrow', 18)),
    h('button', { class: 'arrow', type: 'button', 'aria-label': t('scrollRight'), onclick: () => step(1) }, icon('arrow', 18)));
}

/**
 * Seamless marquee. `host` (overflow:hidden) contains `track`; `makeSet()` returns one set of items.
 * Builds an even number of identical sets so translateX(-50%) loops exactly, and scales duration to a constant speed.
 */
export function marquee(host, track, makeSet, { speed = 55 } = {}) {
  const build = () => {
    const probe = makeSet(); track.replaceChildren(probe);
    const w = probe.getBoundingClientRect().width || 1;
    const k = Math.max(1, Math.ceil(host.clientWidth / w));
    track.replaceChildren(...Array.from({ length: k * 2 }, (_, i) => { const s = i ? makeSet() : probe; if (i) { s.setAttribute('aria-hidden', 'true'); s.inert = true; } return s; }));
    track.style.setProperty('--mq-dur', `${((w * k) / speed).toFixed(1)}s`);
  };
  build();
  let t, last = host.clientWidth;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(host.clientWidth - last) > 40) { last = host.clientWidth; build(); } }, 250); });
}

/** Pause infinite animations while off-screen so they cost nothing. */
export function ambient(root = document) {
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-paused', !e.isIntersecting)), { rootMargin: '120px' });
  $$('[data-ambient]', root).forEach(el => io.observe(el));
}

/**
 * Full-screen loader: the logo sits in the centre, a rangoli blooms out of it and one greeting
 * rides each petal. `fonts` maps a language tag to its font stack so each script renders correctly.
 */
export function intro(cfg, logo, greetings = [], fonts = () => null) {
  if (!cfg?.enabled || REDUCE) return;
  try { if (cfg.oncePerSession) { if (sessionStorage.getItem('tll-intro')) return; sessionStorage.setItem('tll-intro', '1'); } } catch {}
  const gs = greetings.length ? greetings : [{ text: 'नमस्ते', lang: 'hi', label: 'Hindi' }];
  const step = 360 / gs.length;
  // Each arm is rotated to its own angle and scaled out of the centre; the word counter-rotates so it stays upright.
  const arm = (g, i) => h('div', { class: 'bl-arm', style: { '--a': `${step * i}deg`, '--i': i } },
    h('span', { class: 'bl-word', lang: g.lang, style: { 'font-family': fonts(g.lang) } }, g.text));
  const el = h('div', { class: 'bloom', role: 'status', 'aria-label': cfg.ariaLabel ?? 'Loading' },
    h('div', { class: 'bl-stage' },
      rangoli({ rings: 4, petals: gs.length, className: 'bl-r' }),
      gs.map(arm),
      h('img', { class: 'bl-logo', src: logo.src, alt: '', height: 120 })),
    cfg.caption && h('p', { class: 'bl-cap' }, cfg.caption));
  document.documentElement.classList.add('is-loading');
  document.body.append(el);
  setTimeout(() => el.classList.add('is-out'), 2300);
  setTimeout(() => { el.remove(); document.documentElement.classList.remove('is-loading'); }, 3000);
}
