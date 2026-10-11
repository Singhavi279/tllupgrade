// Config-driven forms (native <dialog>), Times SSO opt-in and toasts.
import { h } from './dom.js';
import { t } from './ui.js';

let CFG;
export const initForms = cfg => { CFG = cfg; };

export function toast(msg) { const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); setTimeout(() => t.remove(), 5000); }

export function openForm(formId, preset = {}) {
  const f = CFG.global.forms[formId]; if (!f) return console.error('[TLL] Unknown form', formId);
  const events = CFG.page.sections.find(s => s.component === 'EventGrid')?.props.cards ?? [];
  const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' });
  const status = h('p', { class: 'form-status', role: 'status' });
  const field = fl => {
    const common = { name: fl.name, id: `f-${formId}-${fl.name}`, required: fl.required, autocomplete: fl.autocomplete };
    if (fl.type === 'checkbox') {
      const span = h('span', {}); let rest = fl.label;
      for (const l of fl.links ?? []) { const [a, b] = rest.split(l.text); span.append(a, h('a', { href: l.href, target: '_blank', rel: 'noopener' }, l.text)); rest = b ?? ''; }
      span.append(rest);
      return h('label', { class: 'check', for: common.id }, h('input', { ...common, type: 'checkbox', checked: fl.checked }), span);
    }
    let input;
    if (fl.type === 'select') {
      const opts = fl.optionsFrom === 'events' ? events.map(e => e.name) : fl.options;
      input = h('select', common, h('option', { value: '' }, t('formSelect')), opts.map(o => h('option', { value: o, selected: preset[fl.name] === o }, o)));
    } else if (fl.type === 'textarea') input = h('textarea', { ...common, rows: 3, placeholder: fl.placeholder });
    else input = h('input', { ...common, type: fl.type, placeholder: fl.placeholder });
    return h('label', { for: common.id }, h('span', {}, fl.label + (fl.required && !/optional/i.test(fl.label) ? ' *' : '')), input);
  };
  const form = h('form', { method: 'dialog', class: 'form', novalidate: false }, f.fields.map(field),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel'), h('button', { class: 'btn btn--primary', type: 'submit' }, f.submitText)), status);
  form.addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = t('formSending');
    const body = Object.fromEntries([...form.elements].filter(x => x.name).map(x => [x.name, x.type === 'checkbox' ? x.checked : x.value]));
    try {
      const r = await fetch(f.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.status);
      form.replaceChildren(h('p', { class: 'success' }, f.successMessage));
    } catch { status.textContent = t('formError'); }
  });
  dlg.append(h('button', { class: 'modal-x', 'aria-label': 'Close', onclick: () => dlg.close() }, '×'), h('h3', { id: 'modal-title' }, f.title), f.intro && h('p', { class: 'fine' }, f.intro), form);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg); dlg.showModal();
}

export function startSSO() {
  const s = CFG.global.sso, u = new URL(s.loginUrl);
  u.searchParams.set('channel', s.channel); u.searchParams.set('ru', s.returnUrl);
  location.href = u.toString();
}
export async function handleSSOReturn() {
  if (new URLSearchParams(location.search).get('subscribed') !== '1') return;
  const s = CFG.global.sso;
  try { await fetch(s.optinEndpoint, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ listId: s.marketingListId }) }); toast("You're subscribed. Welcome aboard!"); }
  catch { toast(t('ssoError')); }
  history.replaceState(null, '', location.pathname);
}
