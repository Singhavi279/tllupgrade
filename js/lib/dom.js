// DOM helpers: safe element builder, SVG icons, procedural rangoli, rich-text accents, mount queue.
import { ICONS } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Safe DOM builder: every string goes through text nodes, never innerHTML. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (val != null) el.style.setProperty(p, val); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter(Boolean));
  return el;
}
export const icon = (name, size = 20) => ICONS[name] && svg('svg', { class: 'ico', viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: ICONS[name], fill: 'currentColor' }));

/** "Find your *moment*" → ["Find your ", <em>moment</em>]. */
export const rich = (text = '') => String(text).split(/\*(.+?)\*/g).map((t, i) => (i % 2 ? h('em', {}, t) : t));

/** Words as spans carrying a staggered scroll-reveal start (--s, in % of the timeline). */
export const litWords = text => {
  const parts = String(text).split(/\s+/).filter(Boolean);
  return parts.map((w, i) => h('span', { class: 'w', style: { '--s': ((i / parts.length) * 36).toFixed(2) } }, w + ' '));
};

/** Procedural rangoli / mandala: concentric rings of petals + dots. Stroke uses currentColor. */
export function rangoli({ rings = 5, petals = 10, className = '' } = {}) {
  const s = svg('svg', { class: `rangoli ${className}`.trim(), viewBox: '-320 -320 640 640', 'aria-hidden': 'true', focusable: 'false' });
  for (let k = 0; k < rings; k++) {
    const ri = 28 + k * 54, ro = ri + 64, n = petals + k * 4, hw = (Math.PI * ri / n) * 1.3 + 7, len = ro - ri;
    const d = `M0 ${-ri}C${hw} ${-ri - len * .25} ${hw * .8} ${-ro + len * .25} 0 ${-ro}C${-hw * .8} ${-ro + len * .25} ${-hw} ${-ri - len * .25} 0 ${-ri}Z`;
    const g = svg('g', { class: k % 2 ? 'ring ring--fill' : 'ring' });
    for (let i = 0; i < n; i++) g.append(svg('path', { d, transform: `rotate(${(360 / n) * i})` }));
    for (let i = 0; i < n; i++) {
      const a = ((360 / n) * (i + .5) * Math.PI) / 180;
      g.append(svg('circle', { cx: ((ro + 9) * Math.sin(a)).toFixed(1), cy: (-(ro + 9) * Math.cos(a)).toFixed(1), r: 2.4 }));
    }
    s.append(g);
  }
  return s;
}

// Work that needs layout (marquees, measurements) is queued by components and run once after mount.
const queue = [];
export const onMount = fn => queue.push(fn);
export const flushMount = () => queue.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error('[TLL] mount task failed', e); } });
