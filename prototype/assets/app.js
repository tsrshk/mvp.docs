/* =========================================================================
 * LCOS Prototype — shell, router, shared UI helpers
 * No dependencies. Hash-based routing. Views register into ROUTES.
 * ========================================================================= */

/* ---- icon set (lucide-style, 24x24 stroke) ------------------------------- */
const I = {
  file:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a2 2 0 0 0 2 2h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>',
  truck:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  cart:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
  scale:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 21h8"/><path d="m3 7 4-1 4 1-4 8a3 3 0 0 1-4-2z" transform="translate(1 0)"/><path d="m13 7 4-1 4 1-4 8a3 3 0 0 1-4-2z" transform="translate(0 0)"/><path d="M7 6l5-1 5 1"/></svg>',
  settings:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  bell:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  menu:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  chevR:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  back:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  plus:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  check:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  checkc:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
  warn:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  octagon:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  x:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  camera:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  sparkles:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>',
  copy:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  up:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>',
  down:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 6 6 4-4 8 8"/><path d="M17 17h4v-4"/></svg>',
  flat:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
  box:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  search:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  send:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
  clock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  coins:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
  trash:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  phone:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  inbox:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  link:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

/* ---- small DOM helpers --------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const go = (path) => { location.hash = '#' + path; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- shared component builders ------------------------------------------- */
function badge(tone, label, dot = false) {
  return `<span class="badge badge--${tone}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;
}
function statusBadge(map, key) {
  const s = map[key] || { label: key, tone: 'muted' };
  return badge(s.tone, s.label, true);
}
function trend(pct) {
  if (pct == null) return '<span class="trend trend--flat">—</span>';
  const cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const icon = cls === 'up' ? I.up : cls === 'down' ? I.down : I.flat;
  const sign = pct > 0 ? '+' : '';
  return `<span class="trend trend--${cls}">${icon}${sign}${pct.toFixed(1).replace('.', ',')}%</span>`;
}
const money = (n, cur = 'BYN') => `${fmtMoney(n)}&nbsp;${cur}`;
function empty(icon, title, sub) {
  return `<div class="empty">${icon}<div class="empty__title">${esc(title)}</div><div>${esc(sub || '')}</div></div>`;
}
/* Russian plural: plural(n, '1', '2..4', '5..0') */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/* ---- toast --------------------------------------------------------------- */
function toast(msg, kind = '') {
  const host = $('#toast-host') || document.body.appendChild(el('<div id="toast-host" class="toast-host"></div>'));
  const t = el(`<div class="toast ${kind}">${kind === 'good' ? I.check : ''}<span>${esc(msg)}</span></div>`);
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; t.style.transition = 'all .25s'; setTimeout(() => t.remove(), 260); }, 2600);
}

/* ---- sheet / modal ------------------------------------------------------- */
function openSheet(title, bodyHTML, { onMount } = {}) {
  closeSheet();
  const scrim = el(`
    <div class="scrim" id="scrim">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet__grip"></div>
        <div class="sheet__head">
          <div class="sheet__title">${esc(title)}</div>
          <button class="iconbtn sheet__close" data-close aria-label="Закрыть">${I.x}</button>
        </div>
        <div class="sheet__body">${bodyHTML}</div>
      </div>
    </div>`);
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) closeSheet(); });
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  if (onMount) onMount($('.sheet__body', scrim));
}
function closeSheet() {
  const s = $('#scrim');
  if (s) { s.remove(); document.body.style.overflow = ''; }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---- router -------------------------------------------------------------- */
const ROUTES = [];
function route(pattern, handler) { ROUTES.push({ parts: pattern.split('/').filter(Boolean), handler }); }
function resolve(path) {
  const segs = path.split('/').filter(Boolean);
  const matches = [];
  for (const r of ROUTES) {
    if (r.parts.length !== segs.length) continue;
    const params = {}; let ok = true, paramCount = 0;
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i];
      if (p[0] === ':') { params[p.slice(1)] = decodeURIComponent(segs[i]); paramCount++; }
      else if (p !== segs[i]) { ok = false; break; }
    }
    if (ok) matches.push({ handler: r.handler, params, paramCount });
  }
  if (!matches.length) return null;
  // most specific wins: fewest param (wildcard) segments
  matches.sort((a, b) => a.paramCount - b.paramCount);
  return matches[0];
}

const NAV = [
  { section: 'invoices',  label: 'Накладные',  icon: I.file },
  { section: 'orders',    label: 'Заказы',     icon: I.cart },
  { section: 'suppliers', label: 'Поставщики', icon: I.truck },
  { section: 'compare',   label: 'Сравнение',  icon: I.scale },
];

function unreadAlerts() { return state.alerts.filter((a) => !a.read_at).length; }

/* ---- shell render -------------------------------------------------------- */
function renderShell() {
  const app = $('#app');
  app.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar__brand brand">Local<em>OS</em></div>
      <nav class="sidebar__nav" id="side-nav"></nav>
      <div class="sidebar__foot">
        <a class="nav-link" href="#/settings" data-nav="settings">${I.settings}<span>Настройки</span></a>
        <div class="ctx mt">
          <div class="ctx__avatar">Г</div>
          <div class="flex1"><div class="ctx__name">${esc(org.name)}</div><div class="ctx__sub">${esc(org.subdivision)}</div></div>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="brand">Local<em>OS</em></div>
        <div class="topbar__title" id="top-title"></div>
        <div class="topbar__spacer"></div>
        <button class="iconbtn iconbtn-wrap" id="bell-btn" aria-label="Оповещения">${I.bell}<span class="iconbtn__badge" id="bell-badge" hidden></span></button>
      </header>
      <main id="view"></main>
    </div>

    <nav class="bottombar" id="bottom-nav"></nav>
  `;

  // desktop nav
  $('#side-nav').innerHTML = NAV.map((n) =>
    `<a class="nav-link" href="#/${n.section}" data-nav="${n.section}">${n.icon}<span>${n.label}</span>${
      n.section === 'compare' ? `<span class="nav-link__count" data-alertcount hidden></span>` : ''}</a>`).join('');

  // mobile tabs
  $('#bottom-nav').innerHTML = NAV.map((n) =>
    `<button class="tab" data-nav="${n.section}" onclick="go('/${n.section}')">${n.icon}<span>${n.label}</span>${
      n.section === 'compare' ? `<span class="tab__dot" data-alertcount hidden></span>` : ''}</button>`).join('');

  $('#bell-btn').addEventListener('click', () => go('/compare'));
  refreshAlertBadges();
}

function refreshAlertBadges() {
  const n = unreadAlerts();
  $$('[data-alertcount]').forEach((e) => { e.hidden = n === 0; e.textContent = n; });
  const bb = $('#bell-badge'); if (bb) { bb.hidden = n === 0; bb.textContent = n; }
}

function setActiveNav(section, title) {
  $$('[data-nav]').forEach((e) => e.classList.toggle('active', e.dataset.nav === section));
  const tt = $('#top-title'); if (tt) tt.textContent = title || '';
}

/* ---- render current route ------------------------------------------------ */
function render() {
  const path = location.hash.replace(/^#/, '') || '/invoices';
  closeSheet();
  const m = resolve(path) || resolve('/invoices');
  const out = m.handler(m.params) || {};
  const view = $('#view');
  view.innerHTML = `<div class="container ${out.container || ''} view-enter">${out.html || ''}</div>`;
  setActiveNav(out.section, out.title);
  refreshAlertBadges();
  window.scrollTo(0, 0);
  if (out.mount) out.mount($('.container', view));
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  renderShell();
  render(); // routes are registered at load-time by each view file (route(...))
});
