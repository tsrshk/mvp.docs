/* =========================================================================
 * View: Поставщики (suppliers) — list · card detail · edit (dynamic criteria)
 * ========================================================================= */
(function () {
  const payMode = { prepay: 'Предоплата', on_delivery: 'По факту', deferred: 'Отсрочка' };

  function fmtCriterion(def, val) {
    if (val == null || val === '' || (Array.isArray(val) && !val.length)) return null;
    switch (def.kind) {
      case 'number': return `${fmtQty(val)} ${def.unit || ''}`.trim();
      case 'days': return `${val} ${def.unit || 'дн.'}`;
      case 'weekdays': return val.map((d) => WEEKDAYS[d - 1]).join(', ');
      case 'choice': return (def.choices.find((c) => c.value === val) || {}).label || val;
      default: return String(val);
    }
  }

  /* ---- LIST -------------------------------------------------------------- */
  route('/suppliers', () => ({
    section: 'suppliers', title: 'Поставщики',
    html: `
      <div class="page-head"><div class="page-head__row">
        <div class="flex1"><div class="page-title">Поставщики</div>
        <div class="page-sub">Справочник, контакты и условия поставки — вместо блокнота и переписок.</div></div>
        <button class="btn btn--primary hide-mobile" id="sup-add">${I.plus}Добавить</button>
      </div></div>

      <div class="grid grid--auto stagger">
        ${suppliers.map(supCard).join('')}
      </div>
      <button class="btn btn--primary btn--block show-mobile mt" id="sup-add-m">${I.plus}Добавить поставщика</button>
    `,
    mount(root) {
      $$('[data-sup]', root).forEach((c) => c.onclick = () => go('/suppliers/' + c.dataset.sup));
      const add = () => openEdit(null, root);
      $('#sup-add', root) && ($('#sup-add', root).onclick = add);
      $('#sup-add-m', root) && ($('#sup-add-m', root).onclick = add);
    },
  }));

  function supCard(s) {
    return `<div class="card card--tap card--pad" data-sup="${s.id}" style="${s.is_active ? '' : 'opacity:.6'}">
      <div class="row row--between">
        <div class="flex1 truncate"><div class="strong" style="font-size:15px">${esc(s.name)}</div>
        <div class="hint">${s.categories.join(', ')}</div></div>
        ${s.is_active ? '' : badge('muted', 'скрыт')}
      </div>
      <div class="divider"></div>
      <div class="row row--between gap-sm" style="font-size:13px">
        <span class="muted">${esc(s.contact_name)} · ${esc(channelLabel[s.contact_channel] || '')}</span>
        <span class="chip">${s.sku_count} SKU</span>
      </div>
      <div class="row row--between mt gap-sm" style="font-size:13px">
        <span class="muted">Поставка ${relDate(s.last_delivery)}</span>
        <span class="strong tabnum">мин. ${s.min_order_amount ? fmtMoney(s.min_order_amount) + ' BYN' : '—'}</span>
      </div>
    </div>`;
  }

  /* ---- DETAIL ------------------------------------------------------------ */
  route('/suppliers/:id', (p) => {
    const s = supById(p.id);
    if (!s) return { section: 'suppliers', title: 'Поставщик', html: empty(I.truck, 'Не найдено', 'Поставщик не найден.') };
    return {
      section: 'suppliers', title: s.name, container: 'container--form',
      html: `<a class="back-link" href="#/suppliers">${I.back}Поставщики</a><div id="sup"></div>`,
      mount(root) { drawDetail(root, s); },
    };
  });

  function drawDetail(root, s) {
    const host = $('#sup', root);
    const crit = CRITERIA_SCHEMA.map((def) => {
      const v = fmtCriterion(def, s.criteria[def.key]);
      return v == null ? '' : kv(def.label, v);
    }).join('');
    const ch = channelLabel[s.contact_channel] || '—';

    host.innerHTML = `
      <div class="page-head"><div class="page-head__row">
        <div class="flex1"><div class="page-title">${esc(s.name)}</div>
        <div class="page-sub">УНП ${esc(s.tax_id)} · ${s.categories.join(', ')}${s.is_active ? '' : ' · скрыт'}</div></div>
        <button class="btn btn--sm" id="sup-edit">Изменить</button>
      </div></div>

      <div class="stack">
        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Контакты</div>
          ${kv('Контактное лицо', s.contact_name || '—')}
          ${kv('Телефон', s.phone || '—')}
          ${kv('Канал связи', `${ch}${s.contact_value ? ' · ' + esc(s.contact_value) : ''}`)}
        </div>

        <div class="card card--pad">
          <div class="section-label" style="margin-top:0">Условия поставки</div>
          ${kv('Минимальный заказ', s.min_order_amount ? fmtMoney(s.min_order_amount) + ' BYN' : '—', true)}
          ${s.min_order_note ? `<div class="hint" style="margin-top:-6px">${esc(s.min_order_note)}</div>` : ''}
          ${crit || '<div class="hint">Критерии не заданы</div>'}
          ${s.delivery_terms ? `<div class="hint mt">${esc(s.delivery_terms)}</div>` : ''}
        </div>

        <div class="row gap-sm">
          <a class="btn btn--primary flex1" href="#/orders/new">${I.cart}Заказать</a>
          <a class="btn flex1" href="#/compare">${I.scale}Сравнить цены</a>
        </div>
        <button class="btn btn--block ${s.is_active ? 'btn--danger' : ''}" id="sup-toggle">${s.is_active ? 'Скрыть (сделать неактивным)' : 'Вернуть в активные'}</button>
      </div>`;

    $('#sup-edit', host).onclick = () => openEdit(s, root);
    $('#sup-toggle', host).onclick = () => { s.is_active = !s.is_active; drawDetail(root, s); toast(s.is_active ? 'Поставщик активен' : 'Поставщик скрыт'); };
  }

  /* ---- EDIT (dynamic criteria form) ------------------------------------- */
  function openEdit(s, root) {
    const isNew = !s;
    const m = s || { name: '', tax_id: '', contact_name: '', phone: '', contact_channel: 'telegram', contact_value: '',
      delivery_terms: '', min_order_amount: '', min_order_note: '', criteria: {}, categories: ['Молочка'], is_active: true, sku_count: 0, last_delivery: null };

    const critFields = CRITERIA_SCHEMA.map((def) => {
      const v = m.criteria[def.key];
      let control = '';
      if (def.kind === 'number' || def.kind === 'days')
        control = `<input class="input" type="number" min="0" data-crit="${def.key}" value="${v ?? ''}" placeholder="${def.unit || ''}">`;
      else if (def.kind === 'choice')
        control = `<select class="select" data-crit="${def.key}"><option value="">—</option>${def.choices.map((c) => `<option value="${c.value}" ${v === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}</select>`;
      else if (def.kind === 'weekdays')
        control = `<div class="weekday-pick" data-crit-wd="${def.key}">${WEEKDAYS.map((w, i) => `<button type="button" class="${(v || []).includes(i + 1) ? 'on' : ''}" data-wd="${i + 1}">${w}</button>`).join('')}</div>`;
      return `<div class="field"><label>${def.label}${def.unit && def.kind !== 'weekdays' ? ` <span class="muted">(${def.unit})</span>` : ''}</label>${control}</div>`;
    }).join('');

    openSheet(isNew ? 'Новый поставщик' : 'Изменить карточку', `
      <div class="field"><label>Название</label><input class="input" id="f-name" value="${esc(m.name)}" placeholder="ООО «…»"></div>
      <div class="grid grid--2" style="gap:0 12px">
        <div class="field"><label>Контактное лицо</label><input class="input" id="f-contact" value="${esc(m.contact_name)}"></div>
        <div class="field"><label>Телефон</label><input class="input" id="f-phone" value="${esc(m.phone)}"></div>
      </div>
      <div class="grid grid--2" style="gap:0 12px">
        <div class="field"><label>Канал</label><select class="select" id="f-channel">
          ${Object.entries(channelLabel).map(([k, l]) => `<option value="${k}" ${m.contact_channel === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
        <div class="field"><label>Адрес канала</label><input class="input" id="f-cval" value="${esc(m.contact_value)}" placeholder="@ник / номер"></div>
      </div>
      <div class="grid grid--2" style="gap:0 12px">
        <div class="field"><label>Мин. заказ, BYN</label><input class="input" type="number" min="0" id="f-min" value="${m.min_order_amount ?? ''}"></div>
        <div class="field"><label>Примечание к минимуму</label><input class="input" id="f-minnote" value="${esc(m.min_order_note || '')}"></div>
      </div>

      <div class="section-label" style="margin-top:8px">Гибкие критерии (реестр)</div>
      ${critFields}

      <div class="field"><label>Условия доставки</label><textarea class="textarea" id="f-terms">${esc(m.delivery_terms || '')}</textarea></div>

      <button class="btn btn--primary btn--block mt" id="f-save">${I.check}${isNew ? 'Создать' : 'Сохранить'}</button>
    `, {
      onMount(body) {
        $$('[data-crit-wd] button', body).forEach((b) => b.onclick = () => b.classList.toggle('on'));
        $('#f-save', body).onclick = () => {
          const criteria = {};
          $$('[data-crit]', body).forEach((inp) => {
            const key = inp.dataset.crit; const def = CRITERIA_SCHEMA.find((d) => d.key === key);
            if (inp.value === '') return;
            criteria[key] = (def.kind === 'number' || def.kind === 'days') ? Number(inp.value) : inp.value;
          });
          $$('[data-crit-wd]', body).forEach((wd) => {
            const days = $$('button.on', wd).map((b) => Number(b.dataset.wd)).sort((a, z) => a - z);
            if (days.length) criteria[wd.dataset.critWd] = days;
          });
          const name = $('#f-name', body).value.trim();
          if (!name) { toast('Укажите название'); return; }
          Object.assign(m, {
            name,
            contact_name: $('#f-contact', body).value.trim(),
            phone: $('#f-phone', body).value.trim(),
            contact_channel: $('#f-channel', body).value,
            contact_value: $('#f-cval', body).value.trim(),
            min_order_amount: $('#f-min', body).value ? Number($('#f-min', body).value) : null,
            min_order_note: $('#f-minnote', body).value.trim(),
            delivery_terms: $('#f-terms', body).value.trim(),
            criteria,
          });
          if (isNew) { m.id = Math.max(...suppliers.map((x) => x.id)) + 1; suppliers.push(m); }
          closeSheet();
          toast(isNew ? 'Поставщик создан' : 'Карточка сохранена', 'good');
          if (isNew) go('/suppliers/' + m.id);
          else render();
        };
      },
    });
  }

  function kv(k, v, strong) {
    return `<div class="row row--between" style="padding:7px 0;border-bottom:1px solid var(--color-line)">
      <span class="muted">${k}</span><span class="${strong ? 'strong' : ''}" style="text-align:right">${v}</span></div>`;
  }
})();
