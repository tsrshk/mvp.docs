/* =========================================================================
 * View: Настройки (settings) — light demo: контекст, POS, модули
 * ========================================================================= */
(function () {
  const modules = [
    { key: 'invoices', label: 'Накладные', on: true, locked: true },
    { key: 'suppliers', label: 'Поставщики', on: true, locked: false },
    { key: 'orders', label: 'Заказы (закупки)', on: true, locked: false },
    { key: 'compare', label: 'Сравнение поставщиков', on: true, locked: false },
  ];

  route('/settings', () => ({
    section: 'settings', title: 'Настройки', container: 'container--form',
    html: `
      <div class="page-head"><div class="page-title">Настройки</div>
      <div class="page-sub">Контекст, интеграция POS и модули. Демонстрационные значения.</div></div>

      <div class="stack">
        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Контекст</div>
          ${kv('Организация', org.name)}
          ${kv('Подразделение', org.subdivision)}
          ${kv('POS / ERP', org.pos)}
        </div>

        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Интеграция ${esc(org.pos)}</div>
          <div class="row row--between"><span class="muted">Чтение (справочники, накладные)</span>${badge('good', 'подключено', true)}</div>
          <div class="row row--between mt"><span class="muted">Запись накладных (ERP_WRITE_ENABLED)</span>${badge('warn', 'выключено', true)}</div>
          <div class="hint mt">Fail-closed: пока запись выключена, накладные доходят до статуса «готова», но не пишутся в POS.</div>
        </div>

        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Модули</div>
          ${modules.map((m) => `<div class="row row--between" style="padding:9px 0;border-bottom:1px solid var(--color-line)">
            <span>${m.label}${m.locked ? ' <span class="muted" style="font-size:12px">(ядро)</span>' : ''}</span>
            <button class="switch ${m.on ? 'on' : ''}" data-mod="${m.key}" ${m.locked ? 'disabled' : ''} aria-label="переключить"><span></span></button>
          </div>`).join('')}
          <div class="hint mt">Выключение модуля скрывает раздел и возвращает 404 на его роутах (module gate).</div>
        </div>
      </div>`,
    mount(root) {
      $$('[data-mod]', root).forEach((b) => { if (!b.disabled) b.onclick = () => { b.classList.toggle('on'); toast('Демо: переключение модуля не влияет на прототип'); }; });
    },
  }));

  function kv(k, v) {
    return `<div class="row row--between" style="padding:7px 0;border-bottom:1px solid var(--color-line)">
      <span class="muted">${k}</span><span class="strong">${esc(v)}</span></div>`;
  }
})();
