/* =========================================================================
 * View: Накладные (invoices) — list · import wedge (photo→OCR→workbench) · detail
 * ========================================================================= */
(function () {
  let invFilter = 'all';

  const FILTERS = [
    { key: 'all', label: 'Все' },
    { key: 'prepared', label: 'К отправке' },
    { key: 'validated', label: 'Проверены' },
    { key: 'written', label: 'Записаны' },
    { key: 'rejected', label: 'Внимание' },
  ];

  function filtered() {
    return invFilter === 'all' ? state.invoices : state.invoices.filter((i) => i.status === invFilter);
  }

  /* ---- LIST -------------------------------------------------------------- */
  route('/invoices', () => ({
    section: 'invoices', title: 'Накладные',
    html: `
      <div class="page-head">
        <div class="page-head__row">
          <div class="flex1">
            <div class="page-title">Накладные</div>
            <div class="page-sub">Приёмка: фото → распознавание → проверка → запись в ${esc(org.pos)}</div>
          </div>
          <a class="btn btn--primary hide-mobile" href="#/invoices/import">${I.plus}Новая накладная</a>
        </div>
      </div>

      <div class="grid grid--3 mb stagger">
        ${metric('Записано за месяц', state.invoices.filter((i) => i.status === 'written').length, 'накладных', 'good')}
        ${metric('Готовы к отправке', state.invoices.filter((i) => ['prepared', 'validated'].includes(i.status)).length, 'ожидают действия', 'accent')}
        ${metric('Требуют внимания', state.invoices.filter((i) => i.status === 'rejected').length, 'отклонены', 'danger')}
      </div>

      <div class="segmented mb" id="inv-seg">
        ${FILTERS.map((f) => {
          const c = f.key === 'all' ? state.invoices.length : state.invoices.filter((i) => i.status === f.key).length;
          return `<button data-f="${f.key}" class="${f.key === invFilter ? 'on' : ''}">${f.label}<span class="count">${c}</span></button>`;
        }).join('')}
      </div>

      <div id="inv-list"></div>

      <a class="btn btn--primary btn--block show-mobile mt" href="#/invoices/import">${I.camera}Новая накладная</a>
    `,
    mount(root) {
      renderList(root);
      $('#inv-seg', root).addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        invFilter = b.dataset.f;
        $$('#inv-seg button', root).forEach((x) => x.classList.toggle('on', x.dataset.f === invFilter));
        renderList(root);
      });
    },
  }));

  function renderList(root) {
    const items = filtered();
    const host = $('#inv-list', root);
    if (!items.length) { host.innerHTML = empty(I.inbox, 'Пусто', 'Нет накладных в этом статусе.'); return; }

    // desktop table
    const rows = items.map((inv) => {
      const s = supById(inv.supplier_id);
      return `<tr class="tap" onclick="go('/invoices/${inv.id}')">
        <td class="strong">${esc(inv.number)}</td>
        <td>${esc(s ? s.name : '—')}</td>
        <td class="muted nowrap">${fmtDate(inv.issued_at)}</td>
        <td class="num tabnum">${money(inv.total_amount, inv.currency)}</td>
        <td>${statusBadge(INVOICE_STATUS, inv.status)}</td>
      </tr>`;
    }).join('');

    // mobile cards
    const cards = items.map((inv) => {
      const s = supById(inv.supplier_id);
      return `<div class="card card--tap" onclick="go('/invoices/${inv.id}')">
        <div class="rowcard">
          <div class="rowcard__main">
            <div class="rowcard__title">${esc(inv.number)} · ${esc(s ? s.name : '—')}</div>
            <div class="rowcard__meta">${fmtDate(inv.issued_at)} · ${inv.line_count} поз.</div>
            <div class="mt gap-sm">${statusBadge(INVOICE_STATUS, inv.status)}</div>
          </div>
          <div class="rowcard__right"><div class="strong tabnum">${money(inv.total_amount, inv.currency)}</div></div>
          ${I.chevR.replace('<svg', '<svg class="chev"')}
        </div>
      </div>`;
    }).join('');

    host.innerHTML = `
      <div class="hide-mobile table-wrap">
        <table class="tbl"><thead><tr>
          <th>Номер</th><th>Поставщик</th><th>Дата</th><th class="num">Сумма</th><th>Статус</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="show-mobile stack stagger">${cards}</div>`;
  }

  /* ---- DETAIL ------------------------------------------------------------ */
  route('/invoices/:id', (p) => {
    const inv = state.invoices.find((i) => String(i.id) === String(p.id));
    if (!inv) return { section: 'invoices', title: 'Накладная', html: empty(I.inbox, 'Не найдено', 'Накладная не найдена.') };
    const s = supById(inv.supplier_id);
    return {
      section: 'invoices', title: inv.number, container: 'container--form',
      html: `
        <a class="back-link" href="#/invoices">${I.back}Накладные</a>
        <div class="page-head"><div class="page-head__row">
          <div class="flex1"><div class="page-title">${esc(inv.number)}</div>
          <div class="page-sub">${esc(s ? s.name : '—')} · ${fmtDateLong(inv.issued_at)}</div></div>
          ${statusBadge(INVOICE_STATUS, inv.status)}
        </div></div>

        ${inv.status === 'rejected' ? `
          <div class="vpanel vpanel--err mb">${I.octagon}<div><div>Накладная отклонена — ничего не записано в ${esc(org.pos)}.</div>
          <div style="font-weight:500;margin-top:4px">${esc(inv.validation_errors || '')}</div></div></div>` : ''}
        ${inv.status === 'prepared' ? `
          <div class="vpanel vpanel--ok mb">${I.checkc}<div>Payload собран и сохранён. Запись в ${esc(org.pos)} — за тумблером <code>ERP_WRITE_ENABLED</code>.</div></div>` : ''}

        <div class="card card--pad mb">
          <div class="section-label" style="margin-top:0">Реквизиты</div>
          ${kv('Поставщик', s ? s.name : '—')}
          ${kv('Номер документа', inv.number)}
          ${kv('Дата', fmtDate(inv.issued_at))}
          ${kv('Позиций', inv.line_count)}
          ${kv('Сумма', money(inv.total_amount, inv.currency), true)}
        </div>

        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Статус-машина</div>
          <div class="row row--wrap gap-sm">
            ${['draft', 'validated', 'prepared', 'written'].map((st) => {
              const active = st === inv.status;
              const done = ['draft', 'validated', 'prepared', 'written'].indexOf(st) < ['draft', 'validated', 'prepared', 'written'].indexOf(inv.status);
              return `<span class="chip" style="${active ? 'border-color:var(--color-accent);color:var(--color-accent);background:var(--color-accent-soft)' : done ? 'color:var(--color-good)' : ''}">${INVOICE_STATUS[st].label}</span>`;
            }).join('')}
          </div>
          <div class="hint mt">Черновик → проверена (арифметика) → готова (payload) → записана в POS. Отклонение блокирует запись.</div>
        </div>
      `,
    };
  });

  /* ---- IMPORT (wedge flow) ---------------------------------------------- */
  let imp; // { step, lines }
  route('/invoices/import', () => ({
    section: 'invoices', title: 'Новая накладная', container: 'container--form',
    html: `<a class="back-link" href="#/invoices">${I.back}Накладные</a><div id="imp"></div>`,
    mount(root) { imp = { step: 1, lines: null }; drawImport(root); },
  }));

  function drawImport(root) {
    const host = $('#imp', root);
    const steps = ['Фото', 'Распознавание', 'Проверка'];
    const stepper = `<div class="stepper">${steps.map((s, i) => {
      const n = i + 1; const cls = imp.step === n ? 'on' : imp.step > n ? 'done' : '';
      return `${i ? '<span class="step__line"></span>' : ''}<span class="step ${cls}"><span class="step__num">${imp.step > n ? '✓' : n}</span>${s}</span>`;
    }).join('')}</div>`;

    if (imp.step === 1) {
      host.innerHTML = stepper + `
        <div class="card card--pad">
          <div class="page-title" style="font-size:18px">Загрузите фото накладной</div>
          <div class="page-sub mb">Сфотографируйте бумажную ТТН или прикрепите скан. Распознаем позиции автоматически.</div>
          <label class="dropzone" style="display:block;cursor:pointer">
            ${I.camera}
            <div class="strong mt">Нажмите, чтобы выбрать фото</div>
            <div class="hint">JPG, PNG или PDF · до 15 МБ</div>
            <input type="file" accept="image/*" hidden id="imp-file">
          </label>
          <button class="btn btn--primary btn--block mt-lg" id="imp-demo">Загрузить демо-накладную →</button>
          <div class="hint center mt">Демо: ТТН от «Молочный Дом», 4 позиции</div>
        </div>`;
      const start = () => { imp.step = 2; drawImport(root); simulateOcr(root); };
      $('#imp-demo', host).onclick = start;
      $('#imp-file', host).onchange = start;
    }

    if (imp.step === 2) {
      host.innerHTML = stepper + `
        <div class="card card--pad center" style="padding:44px 20px">
          <div class="spinner"></div>
          <div class="strong mt-lg">Распознаём накладную…</div>
          <div class="hint">Vision-модель извлекает поставщика и позиции. Данные пока нигде не сохраняются.</div>
        </div>`;
    }

    if (imp.step === 3) drawWorkbench(root, stepper);
  }

  function simulateOcr(root) {
    setTimeout(() => {
      imp.lines = demoOcrLines.map((l) => ({ ...l }));
      imp.step = 3;
      drawImport(root);
    }, 1400);
  }

  function drawWorkbench(root, stepper) {
    const host = $('#imp', root);
    const s = supById(1);
    const lines = imp.lines;
    const blockers = lines.filter((l) => !l.sku).length;
    const total = lines.reduce((sum, l) => sum + l.qty * l.price, 0);

    const vpanel = blockers
      ? `<div class="vpanel vpanel--err">${I.octagon}<div><div>${blockers} ${plural(blockers, 'строка не сопоставлена', 'строки не сопоставлены', 'строк не сопоставлены')} со SKU каталога.</div><div style="font-weight:500;margin-top:2px">Сопоставьте все позиции — иначе запись в ${esc(org.pos)} заблокирована.</div></div></div>`
      : `<div class="vpanel vpanel--ok">${I.checkc}<div>Все позиции сопоставлены, арифметика сходится. Готово к отправке.</div></div>`;

    const lineCards = lines.map((l, idx) => {
      const ing = l.sku ? ingById(l.sku) : null;
      const mapBadge = ing
        ? badge('good', ing.name)
        : l.suggestion
          ? `<button class="badge badge--warn" data-map="${idx}" style="cursor:pointer">${I.sparkles} предложить: ${esc(ingById(l.suggestion).name)}</button>`
          : `<button class="badge badge--danger" data-map="${idx}" style="cursor:pointer">${I.warn} сопоставить</button>`;
      return `<div class="card card--pad" style="padding:12px 14px">
        <div class="row row--between"><div class="strong flex1 truncate">${esc(l.raw)}</div><div class="tabnum nowrap">${money(l.qty * l.price)}</div></div>
        <div class="row row--between mt gap-sm">
          <div class="muted tabnum">${fmtQty(l.qty)} ${esc(l.unit)} × ${fmtMoney(l.price)}</div>
          <div>${mapBadge}</div>
        </div>
      </div>`;
    }).join('');

    host.innerHTML = stepper + `
      <div class="stack">
        <div class="card card--pad">
          <div class="row row--between">
            <div><div class="section-label" style="margin:0">Поставщик (авто-матч)</div>
              <div class="strong" style="font-size:16px">${esc(s.name)}</div>
              <div class="hint">УНП ${esc(s.tax_id)} · распознан из шапки документа</div></div>
            ${badge('info', 'совпадение 0,92')}
          </div>
        </div>

        ${vpanel}

        <button class="btn btn--block" id="imp-ai" style="border-color:var(--color-accent);color:var(--color-accent)">${I.sparkles}Подобрать товары для непонятных строк</button>

        <div>
          <div class="section-label">Позиции · ${lines.length}</div>
          <div class="stack">${lineCards}</div>
        </div>

        <div class="card card--pad">
          <div class="row row--between"><div class="muted">Итого по накладной</div><div class="big-money">${money(total)}</div></div>
        </div>

        <button class="btn btn--primary btn--block" id="imp-send" ${blockers ? 'disabled' : ''}>${I.send}Отправить в ${esc(org.pos)}</button>
        <div class="hint center">Human-in-the-loop: запись выполняется только по вашему подтверждению.</div>
      </div>`;

    // map a line via SKU sheet
    $$('[data-map]', host).forEach((b) => b.onclick = () => openSkuPicker(Number(b.dataset.map), root));
    // AI: accept suggestions
    $('#imp-ai', host).onclick = () => {
      let n = 0;
      lines.forEach((l) => { if (!l.sku && l.suggestion) { l.sku = l.suggestion; n++; } });
      drawImport(root);
      toast(n ? `AI сопоставил ${n} ${plural(n, 'строку', 'строки', 'строк')}` : 'Нет уверенных совпадений', n ? 'good' : '');
    };
    // send
    $('#imp-send', host).onclick = () => {
      if (blockers) return;
      const s2 = supById(1);
      const newInv = { id: 1042, number: 'ТТН-4478', supplier_id: 1, issued_at: new Date().toISOString(),
        total_amount: total, currency: 'BYN', status: 'prepared', line_count: lines.length };
      state.invoices.unshift(newInv);
      toast('Накладная подготовлена (payload сохранён)', 'good');
      go('/invoices/' + newInv.id);
    };
  }

  function openSkuPicker(idx, root) {
    const list = ingredients.map((ing) =>
      `<button class="card card--tap card--pad" style="width:100%;text-align:left;margin-bottom:8px" data-pick="${ing.id}">
        <div class="row row--between"><div><div class="strong">${esc(ing.name)}</div>
        <div class="hint">${esc(ing.category)} · ${esc(ing.unit)}</div></div>${I.chevR.replace('<svg', '<svg style="width:18px;color:var(--color-line-strong)"')}</div>
      </button>`).join('');
    openSheet('Сопоставить со SKU каталога', `
      <div class="hint mb">Строка: «${esc(imp.lines[idx].raw)}». Выберите позицию каталога ${esc(org.pos)}.</div>
      <div class="field"><input class="input" placeholder="Поиск по каталогу…" id="sku-q">${I.search}</div>
      <div id="sku-list">${list}</div>`, {
      onMount(body) {
        const draw = (q) => {
          $('#sku-list', body).innerHTML = ingredients.filter((ing) => ing.name.toLowerCase().includes(q.toLowerCase()))
            .map((ing) => `<button class="card card--tap card--pad" style="width:100%;text-align:left;margin-bottom:8px" data-pick="${ing.id}">
              <div class="strong">${esc(ing.name)}</div><div class="hint">${esc(ing.category)} · ${esc(ing.unit)}</div></button>`).join('') || `<div class="empty">Ничего не найдено</div>`;
          bind(body);
        };
        const bind = (body) => $$('[data-pick]', body).forEach((b) => b.onclick = () => {
          imp.lines[idx].sku = b.dataset.pick; closeSheet(); drawImport(root);
          toast('Сопоставлено — обучающая петля пополнена', 'good');
        });
        $('#sku-q', body).oninput = (e) => draw(e.target.value);
        bind(body);
      },
    });
  }

  /* helpers */
  function metric(label, value, sub, tone) {
    return `<div class="card metric"><div class="metric__label">${label}</div>
      <div class="metric__value" style="color:var(--color-${tone})">${value} <small>${sub}</small></div></div>`;
  }
  function kv(k, v, strong) {
    return `<div class="row row--between" style="padding:7px 0;border-bottom:1px solid var(--color-line)">
      <span class="muted">${k}</span><span class="${strong ? 'strong big-money' : 'strong'}">${v}</span></div>`;
  }
})();
