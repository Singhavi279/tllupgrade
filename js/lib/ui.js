// User-visible strings the components generate themselves (labels, aria text, form status).
// config.json → global.ui overrides any of these; the defaults below are only a safety net so a
// missing key renders something sensible instead of an empty label.
const DEFAULTS = {
  menuLabel: 'Menu',
  menuOpen: 'Open menu',
  menuClose: 'Close menu',
  slideLabel: 'Show slide {n}',
  eventSlideLabel: 'Show event {n}',
  upcomingEventsLabel: 'Upcoming events',
  nextUpLabel: 'Next up',
  greetingLabel: 'Hello in {language}',
  scrollLeft: 'Scroll left',
  scrollRight: 'Scroll right',
  backToTop: 'Back to top',
  loadError: 'Unable to load content. Please refresh.',
  formSelect: 'Select…',
  formSending: 'Sending…',
  formError: 'Could not submit right now. Please try again shortly.',
  ssoError: 'Signed in, but we could not complete subscription. Please retry.',
};

let STRINGS = { ...DEFAULTS };

/** Merge config.json's global.ui over the defaults. Keys starting with $ are comments. */
export function setStrings(ui = {}) {
  STRINGS = { ...DEFAULTS };
  for (const [k, v] of Object.entries(ui)) if (!k.startsWith('$') && typeof v === 'string') STRINGS[k] = v;
}

/** t('slideLabel', { n: 3 }) → "Show slide 3". Unknown keys return the key, so gaps are visible. */
export const t = (key, vars) => {
  const s = STRINGS[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
};
