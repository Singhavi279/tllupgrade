// Admin CMS — a small, dependency-free editor for config.json and seoconfig.json.
// It edits the real files' structure in place: keys are never added or dropped by editing a value,
// only by the explicit add / remove buttons on a list.
import { h } from '../js/lib/dom.js';

// ---------------------------------------------------------------------------------------------
// Sign-in gate.
// This is a PLACEHOLDER. The site is static, so there is no server to send an SMS or check a code:
// anything checked in the browser can be read and bypassed by anyone who opens the source. It keeps
// casual visitors out of the editor, nothing more. For production, replace `verifyOtp` with calls to
// a real OTP service (send + verify endpoints) and have that service — not this file — authorise
// every save. The default code for this build is 123456.
// ---------------------------------------------------------------------------------------------
const DEFAULT_OTP = '123456';
const SESSION_KEY = 'tll-admin-session';
const verifyOtp = async (_phone, otp) => otp === DEFAULT_OTP;

const store = {
  // A sign-in lasts for the tab's lifetime, capped at 8 hours.
  get() { try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY)); return v && Date.now() - v.at < 8 * 36e5 ? v : null; } catch { return null; } },
  set(v) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch {} },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} },
};

const root = document.getElementById('root');
let toastTimer;
function toast(msg, isErr = false) {
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  document.body.append(h('div', { class: `toast${isErr ? ' toast--err' : ''}`, role: 'status' }, msg));
  toastTimer = setTimeout(() => document.querySelector('.toast')?.remove(), isErr ? 6000 : 3200);
}

// ---------------------------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------------------------
function showLogin() {
  let phone = '';
  const err = h('p', { class: 'err', 'aria-live': 'polite' });
  const phoneIn = h('input', { type: 'tel', inputmode: 'numeric', autocomplete: 'tel', placeholder: '98XXXXXXXX', maxlength: 15, 'aria-label': 'Phone number' });
  const otpIn = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6-digit code', maxlength: 6, 'aria-label': 'One-time password' });
  const otpBox = h('label', { hidden: true }, 'One-time password', otpIn);
  const go = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Send OTP');
  let step = 'phone';

  const form = h('form', { class: 'login-card', novalidate: true, onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    if (step === 'phone') {
      const digits = phoneIn.value.replace(/\D/g, '');
      if (digits.length < 10) { err.textContent = 'Enter a valid 10-digit phone number.'; return phoneIn.focus(); }
      phone = digits; step = 'otp';
      phoneIn.readOnly = true; otpBox.hidden = false; go.textContent = 'Verify & sign in'; otpIn.focus();
      return;
    }
    go.disabled = true;
    const ok = await verifyOtp(phone, otpIn.value.trim());
    go.disabled = false;
    if (!ok) { err.textContent = 'That code is not right. Please try again.'; otpIn.select(); return; }
    store.set({ phone, at: Date.now() });
    mountApp();
  } },
    h('h1', {}, 'Admin CMS'),
    h('p', {}, 'Sign in with your phone number to edit the site content.'),
    h('label', {}, 'Phone number', phoneIn),
    otpBox,
    h('div', { class: 'login-note' }, h('strong', {}, 'Demo build: '), 'no SMS is sent. Use the default OTP ', h('strong', {}, DEFAULT_OTP), '.'),
    err, go);
  root.replaceChildren(h('div', { class: 'login' }, form));
  phoneIn.focus();
}

// ---------------------------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------------------------
const FILES = {
  config: { name: 'config.json', label: 'Site content', data: null, dirty: false },
  seo: { name: 'seoconfig.json', label: 'SEO & meta', data: null, dirty: false },
};
let tab = 'config';
let selected = { config: 0, seo: 0 };
let api = false;                       // true when the local dev server's save/upload endpoints answer
const previews = new Map();            // image path → blob URL of a freshly picked file

const apiFetch = (path, body) => fetch(`api/${path}`, {
  method: body ? 'POST' : 'GET', headers: { 'x-admincms': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const pretty = k => String(k).replace(/^\$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
const isMeta = k => typeof k === 'string' && k.startsWith('$');
const clone = v => structuredClone(v);

/** The pieces of each file the sidebar offers, as { label, hint, parent, key } so editing mutates in place. */
function groupsFor(tabKey) {
  const d = FILES[tabKey].data;
  if (tabKey === 'seo') return Object.keys(d).filter(k => !isMeta(k)).map(k => ({ label: pretty(k), parent: d, key: k }));
  const out = [];
  if (d.meta) out.push({ label: 'Site meta', parent: d, key: 'meta' });
  for (const k of Object.keys(d.global ?? {})) out.push({ label: `Settings · ${pretty(k)}`, parent: d.global, key: k });
  (d.page?.sections ?? []).forEach((s, i) => out.push({
    label: SECTION_LABELS[s.component] ?? pretty(s.component), hint: s.enabled === false ? 'hidden' : s.id, parent: d.page.sections, key: i,
  }));
  return out;
}

function markDirty(tabKey) {
  FILES[tabKey].dirty = true;
  document.querySelectorAll('[data-dirty]').forEach(el => { el.hidden = !(FILES.config.dirty || FILES.seo.dirty); });
  const t = document.querySelector(`[data-tab="${tabKey}"] i`); if (t) t.hidden = false;
}

// ---------------------------------------------------------------------------------------------
// Field renderers. `parent[key]` is read and written directly — no copies to keep in sync.
// ---------------------------------------------------------------------------------------------
const IMAGE_KEY = /(^|[a-z])(src|logo|photo|favicon|poster|image|touchicon)$/i;
const IMAGE_VAL = /(\/|\.(png|jpe?g|webp|svg|gif|avif)(\?|$))/i;
const isImageField = (key, v) => typeof key === 'string' && key !== 'srcset' && IMAGE_KEY.test(key) && typeof v === 'string' && (v === '' || IMAGE_VAL.test(v));
const imgSrc = v => previews.get(v) ?? (/^(https?:|data:|blob:|\/\/)/i.test(v) ? v : `../${v}`);

const SECTION_LABELS = { FAQAccordion: 'FAQ', WhyTLLLive: 'Why Languages Live', PartnerB2B: 'Partner with us', NewsletterSSO: 'Newsletter', ContactSPOC: 'Contacts', PastSpeakers: 'Speakers' };

const itemTitle = (v, i) => {
  if (v && typeof v === 'object') {
    for (const k of ['name', 'heading', 'title', 'label', 'question', 'category', 'text', 'alt', 'id', 'component', 'path', 'userAgent', 'query']) {
      if (typeof v[k] === 'string' && v[k]) return v[k].replace(/\*/g, '');
    }
  }
  return typeof v === 'string' ? v : `Item ${i + 1}`;
};

function leaf(tabKey, parent, key, label) {
  const v = parent[key], id = `f-${Math.random().toString(36).slice(2, 9)}`;
  const set = val => { parent[key] = val; markDirty(tabKey); };

  if (key === 'component' && typeof v === 'string') return h('div', { class: 'field' }, h('label', { for: id }, `${label} (fixed)`), h('input', { id, type: 'text', value: v, disabled: true }));
  if (isMeta(key)) return h('p', { class: 'field field--note' }, typeof v === 'string' ? v : '');
  if (typeof v === 'boolean') {
    return h('div', { class: 'field field--check' },
      h('input', { id, type: 'checkbox', checked: v, onchange: e => set(e.target.checked) }), h('label', { for: id }, label));
  }
  if (typeof v === 'number') {
    return h('div', { class: 'field' }, h('label', { for: id }, label),
      h('input', { id, type: 'number', step: 'any', value: v, oninput: e => { const n = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(n)) set(n); } }));
  }
  if (isImageField(key, v)) return imageField(tabKey, parent, key, label, id);

  const text = v ?? '';
  const long = String(text).length > 90 || String(text).includes('\n');
  const onIn = e => set(e.target.value === '' && v === null ? null : e.target.value);
  return h('div', { class: 'field' }, h('label', { for: id }, label),
    long ? h('textarea', { id, rows: Math.min(8, Math.ceil(String(text).length / 90) + 1), oninput: onIn }, text)
         : h('input', { id, type: 'text', value: text, oninput: onIn }));
}

function imageField(tabKey, parent, key, label, id) {
  const thumb = h('img', { class: 'thumb', alt: '', src: parent[key] ? imgSrc(parent[key]) : null, hidden: !parent[key], onerror: e => { e.target.hidden = true; }, onload: e => { e.target.hidden = false; } });
  const hint = h('p', { class: 'hint' });
  const input = h('input', { id, type: 'text', value: parent[key] ?? '', placeholder: 'assets/… or https://…', oninput: e => {
    parent[key] = e.target.value; markDirty(tabKey);
    thumb.hidden = !e.target.value; if (e.target.value) thumb.src = imgSrc(e.target.value);
  } });
  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/avif', hidden: true, onchange: async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const dir = /^assets\//.test(parent[key] ?? '') ? parent[key].replace(/[^/]*$/, '') : 'assets/uploads/';
    const name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '') || 'image';
    const path = dir + name;
    const url = URL.createObjectURL(file); previews.set(path, url);
    if (api) {
      try {
        const base64 = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(file); });
        const res = await apiFetch('upload', { path, base64 });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || res.statusText);
        hint.textContent = `Uploaded to ${path}.`;
      } catch (err) { toast(`Upload failed: ${err.message}`, true); return; }
    } else {
      // No server to write to: hand the file back to be committed under the path we point the field at.
      const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
      hint.textContent = `Saved to your downloads. Add it to the repo as ${path} and commit it, then this field will resolve.`;
    }
    parent[key] = path; input.value = path; thumb.src = url; thumb.hidden = false; markDirty(tabKey);
  } });
  return h('div', { class: 'field' }, h('label', { for: id }, label),
    h('div', { class: 'img-row' }, thumb,
      h('div', { class: 'grow' }, input,
        h('div', {}, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => picker.click() }, 'Replace image…'), picker)),
    ), hint);
}

function objectBody(tabKey, obj) {
  const rows = [];
  for (const k of Object.keys(obj)) rows.push(fieldFor(tabKey, obj, k, pretty(k)));
  return rows;
}

function fieldFor(tabKey, parent, key, label) {
  const v = parent[key];
  if (Array.isArray(v)) return arrayField(tabKey, parent, key, label);
  if (v && typeof v === 'object') return h('div', { class: 'group' }, h('div', { class: 'group-title' }, label), objectBody(tabKey, v));
  return leaf(tabKey, parent, key, label);
}

function arrayField(tabKey, parent, key, label) {
  const arr = parent[key];
  const wrap = h('div', { class: 'group' });
  const redraw = () => { markDirty(tabKey); const n = arrayField(tabKey, parent, key, label); wrap.replaceWith(n); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; redraw(); };
  const remove = i => { if (confirm(`Remove “${itemTitle(arr[i], i)}”?`)) { arr.splice(i, 1); redraw(); } };
  const dup = i => { arr.splice(i + 1, 0, clone(arr[i])); redraw(); };
  const primitive = arr.every(x => x === null || typeof x !== 'object');

  wrap.append(h('div', { class: 'group-title' }, `${label} · ${arr.length}`));
  arr.forEach((item, i) => {
    if (primitive) {
      const inp = h('input', { type: 'text', value: item ?? '', 'aria-label': `${label} ${i + 1}`, oninput: e => { arr[i] = e.target.value; markDirty(tabKey); } });
      wrap.append(h('div', { class: 'field list-row' }, inp,
        h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === arr.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Remove', onclick: () => remove(i) }, '✕')));
      return;
    }
    const title = h('span', { class: 't' }, itemTitle(item, i));
    const body = h('div', { class: 'body' }, h('div', { class: 'group' }, objectBody(tabKey, item)));
    // Keep the summary label live while its title field is edited.
    body.addEventListener('input', () => { title.textContent = itemTitle(item, i); });
    const stop = fn => e => { e.preventDefault(); e.stopPropagation(); fn(); };
    wrap.append(h('details', { class: 'item' },
      h('summary', {}, title,
        h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, onclick: stop(() => move(i, -1)) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === arr.length - 1, onclick: stop(() => move(i, 1)) }, '↓'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Duplicate', onclick: stop(() => dup(i)) }, '⧉'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Remove', onclick: stop(() => remove(i)) }, '✕')),
      body));
  });
  wrap.append(h('div', { class: 'arr-foot' }, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => {
    // A new row starts as a copy of the last one (or blank), so it already has the right shape to fill in.
    arr.push(arr.length ? (primitive ? '' : clone(arr[arr.length - 1])) : '');
    redraw();
  } }, `+ Add ${pretty(key).replace(/s$/i, '').toLowerCase()}`)));
  return wrap;
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------
const serialise = tabKey => JSON.stringify(FILES[tabKey].data, null, 2) + '\n';

function download(tabKey) {
  const f = FILES[tabKey];
  const url = URL.createObjectURL(new Blob([serialise(tabKey)], { type: 'application/json' }));
  const a = h('a', { href: url, download: f.name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${f.name} downloaded. Replace the file in the repo with it and run node scripts/build-seo.mjs.`);
}

async function save(tabKey) {
  if (!api) return download(tabKey);
  const f = FILES[tabKey];
  try {
    const res = await apiFetch('save', { file: f.name, data: f.data });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || res.statusText);
    f.dirty = false;
    document.querySelector(`[data-tab="${tabKey}"] i`)?.setAttribute('hidden', '');
    document.querySelectorAll('[data-dirty]').forEach(el => { el.hidden = !(FILES.config.dirty || FILES.seo.dirty); });
    toast(out.rebuilt ? `${f.name} saved and the site was rebuilt.` : `${f.name} saved, but the rebuild failed: ${out.buildError}`, !out.rebuilt);
  } catch (e) { toast(`Save failed: ${e.message}`, true); }
}

// ---------------------------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------------------------
function render() {
  const f = FILES[tab], groups = groupsFor(tab);
  selected[tab] = Math.min(selected[tab], groups.length - 1);
  const g = groups[selected[tab]];
  const target = g.parent[g.key];

  const nav = groups.map((x, i) => h('button', { class: 'nav-item', type: 'button', 'aria-current': String(i === selected[tab]), onclick: () => { selected[tab] = i; render(); scrollTo(0, 0); } },
    h('span', {}, x.label), x.hint && h('small', {}, x.hint)));

  const tabs = Object.entries(FILES).map(([k, v]) => h('button', { class: 'tab', type: 'button', 'data-tab': k, role: 'tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; render(); } },
    v.label, ' ', h('i', { hidden: !v.dirty, title: 'Unsaved changes', style: { 'font-style': 'normal', color: 'var(--warn)' } }, '●')));

  const body = target && typeof target === 'object' && !Array.isArray(target)
    ? h('div', { class: 'group' }, objectBody(tab, target))
    : Array.isArray(target) ? arrayField(tab, g.parent, g.key, g.label) : leaf(tab, g.parent, g.key, g.label);

  const actions = h('div', { class: 'main-head' },
    h('h2', {}, g.label), h('span', {}, f.name),
    h('span', { class: 'dirty', 'data-dirty': '', hidden: !(FILES.config.dirty || FILES.seo.dirty) }, 'Unsaved changes'));

  document.querySelector('.layout')?.replaceWith(h('div', { class: 'layout' },
    h('nav', { class: 'side', 'aria-label': 'Sections' }, h('div', { class: 'tabs', role: 'tablist' }, tabs), nav),
    h('main', { class: 'main' }, actions, body)));

  const saveBtn = document.getElementById('btn-save'); saveBtn.hidden = !api; saveBtn.textContent = `Save ${f.name}`;
}

async function mountApp() {
  const session = store.get();
  const apiPill = h('span', { class: 'pill pill--warn', title: 'Saving to disk needs the local dev server (node scripts/serve.mjs). Here, Download gives you the edited file.' }, 'Download mode');
  const saveBtn = h('button', { id: 'btn-save', class: 'btn btn--primary', type: 'button', hidden: true, onclick: () => save(tab) });
  root.replaceChildren(
    h('header', { class: 'top' },
      h('h1', {}, 'Admin CMS'), apiPill,
      h('a', { class: 'btn btn--ghost btn--sm', href: '../', target: '_blank', rel: 'noopener' }, 'View site ↗'),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => download(tab) }, 'Download JSON'),
      saveBtn,
      h('span', { class: 'pill' }, `+91 ${session?.phone?.slice(-10) ?? ''}`),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { store.clear(); location.reload(); } }, 'Sign out')),
    h('div', { class: 'layout' }, h('p', { style: { padding: '2rem' } }, 'Loading…')));

  try {
    const [c, s] = await Promise.all(['../config.json', '../seoconfig.json'].map(u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); })));
    FILES.config.data = c; FILES.seo.data = s;
  } catch (e) { root.querySelector('.layout').replaceChildren(h('p', { class: 'err', style: { padding: '2rem' } }, `Could not load the site files: ${e.message}`)); return; }

  try { const r = await apiFetch('ping'); api = r.ok && (await r.json()).ok === true; } catch { api = false; }
  if (api) { apiPill.className = 'pill pill--ok'; apiPill.textContent = 'Local save on'; apiPill.title = 'Edits are written straight to config.json / seoconfig.json and the site is rebuilt.'; }

  render();
  addEventListener('beforeunload', e => { if (FILES.config.dirty || FILES.seo.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

store.get() ? mountApp() : showLogin();
