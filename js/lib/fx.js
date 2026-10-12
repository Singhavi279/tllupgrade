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

/** Prev/next round buttons; `step(dir)` is called with -1 or 1. */
export function arrows(step) {
  return h('div', { class: 'arrows' },
    h('button', { class: 'arrow arrow--prev', type: 'button', 'aria-label': t('scrollLeft'), onclick: () => step(-1) }, icon('arrow', 18)),
    h('button', { class: 'arrow', type: 'button', 'aria-label': t('scrollRight'), onclick: () => step(1) }, icon('arrow', 18)));
}

export function railArrows(rail) {
  return arrows(dir => rail.scrollBy({ left: dir * Math.max(280, rail.clientWidth * .75), behavior: REDUCE ? 'auto' : 'smooth' }));
}

/**
 * Seamless marquee. `makeSet()` returns one set of items; identical sets are laid end to end so the loop has no seam.
 *
 * Default: `host` (overflow:hidden) holds `track`, which a CSS animation slides by exactly one period.
 *
 * `interactive`: `host` becomes a real scroller instead. A rAF loop drifts it at `speed` px/s (negative `dir` runs it
 * backwards) and wraps the position by one period, so touch swipe, trackpad, mouse drag, the arrow buttons and the
 * Left/Right keys all move the same seamless strip. Drift pauses on hover and focus, and after any manual input
 * until things have been idle for a moment. Returns `{ step(dir) }` for external prev/next buttons.
 */
export function marquee(host, track, makeSet, { speed = 55, interactive = false, dir = 1 } = {}) {
  let period = 1, pos = 0, target = null, wrote = 0, resumeAt = 0, hover = false, visible = true, raf = 0, prev = 0;
  const build = () => {
    const probe = makeSet(); track.replaceChildren(probe);
    const w = probe.getBoundingClientRect().width || 1;
    const k = Math.max(1, Math.ceil(host.clientWidth / w));
    period = w * k;
    track.replaceChildren(...Array.from({ length: k * (interactive ? 3 : 2) }, (_, i) => {
      const s = i ? makeSet() : probe;
      if (i) {
        s.setAttribute('aria-hidden', 'true');
        // Clones stay clickable when interactive (the strip is scrubbed by hand) but leave the tab order.
        if (interactive) s.querySelectorAll('a,button').forEach(el => { el.tabIndex = -1; }); else s.inert = true;
      }
      return s;
    }));
    track.style.setProperty('--mq-dur', `${(period / speed).toFixed(1)}s`);
    if (interactive) { pos = period; target = null; host.scrollLeft = wrote = pos; }
  };
  build();
  let t, last = host.clientWidth;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (Math.abs(host.clientWidth - last) > 40) { last = host.clientWidth; build(); } }, 250); });
  if (!interactive) return { step() {} };

  host.classList.add('mq--scroll');
  host.tabIndex = 0;
  const idle = ms => { resumeAt = performance.now() + ms; };
  const step = d => { target = (target ?? pos) + d * Math.max(280, host.clientWidth * .75); idle(4000); kick(); };
  const tick = now => {
    raf = 0;
    const dt = Math.min(64, now - (prev || now)); prev = now;
    let moved = false;
    if (target != null) {
      const diff = target - pos;
      if (Math.abs(diff) < .5) { pos = target; target = null; } else pos += diff * (1 - Math.exp(-dt / 120));
      moved = true;
    } else if (!hover && now >= resumeAt && !host.matches(':focus-within')) { pos += dir * speed * dt / 1000; moved = true; }
    else pos = host.scrollLeft; // someone else is driving: follow, never write (a write would cancel a touch fling)
    // Content repeats every `period`, so folding the position back into the middle copy is invisible.
    while (pos < period) { pos += period; if (target != null) target += period; moved = true; }
    while (pos >= period * 2) { pos -= period; if (target != null) target -= period; moved = true; }
    if (moved) { host.scrollLeft = pos; wrote = host.scrollLeft; }
    if (visible) kick(); else prev = 0;
  };
  function kick() { if (!raf && visible) raf = requestAnimationFrame(tick); }
  // Anything that moved the scroller that we didn't (finger, wheel, scrollbar, drag) takes over from the loop.
  host.addEventListener('scroll', () => { if (Math.abs(host.scrollLeft - wrote) > 1.5) { pos = host.scrollLeft; target = null; idle(3000); } }, { passive: true });
  host.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hover = true; });
  host.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = false; idle(600); } });
  for (const ev of ['touchstart', 'wheel']) host.addEventListener(ev, () => idle(4000), { passive: true });
  host.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d && e.target === host) { e.preventDefault(); step(d); }
  });
  dragScroll(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: '120px' }).observe(host);
  kick();
  return { step };
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
