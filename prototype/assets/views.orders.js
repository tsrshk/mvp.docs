/* =========================================================================
 * View: Заказы (purchase orders / procurement planning)
 * list · new (supplier pick) · editor (min-order + AI proposal) · message
 * ========================================================================= */
(function () {
  let poSeq = 33;
  let ordFilter = 'open';

  const GROUPS = [
    { key: 'open', label: 'В работе', match: (s) => ['draft', 'confirmed', 'sent_manually'].includes(s) },
    { key: 'draft', label: 'Черновики', match: (s) => s === 'draft' },
    { key: 'received', label: 'Получены', match: (s) => s === 'received' },
    { key: 'all', label: 'Все', match: () => true },
  ];

  /* ---- LIST -------------------------------------------------------------- */
  route('/orders', () => ({
    section: 'orders', title: 'Заказы',
    html: `
      <div class="page-head"><div class="page-head__row">
        <div class="flex1"><div class="page-title">Заказы поставщикам</div>
        <div class="page-sub">Соберите заказ, подтвердите и отправьте текстом. Запись в ${esc(org.pos)} не выполняется.</div></div>
        <a class="btn btn--primary hide-mobile" href="#/orders/new">${I.plus}Новый заказ</a>
      </div></div>

      <div class="segmented mb" id="ord-seg">
        ${GROUPS.map((g) => {
          const c = state.purchaseOrders.filter((p) => g.match(p.status)).length;
          return `<button data-f="${g.key}" class="${g.key === ordFilter ? 'on' : ''}">${g.label}<span class="count">${c}</span></button>`;
        }).join('')}
      </div>

      <div id="ord-list"></div>
      <a class="btn btn--primary btn--block show-mobile mt" href="#/orders/new">${I.plus}Новый заказ</a>
    `,
    mount(root) {
      drawList(root);
      $('#ord-seg', root).addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        ordFilter = b.dataset.f;
        $$('#ord-seg button', root).forEach((x) => x.classList.toggle('on', x.dataset.f === ordFilter));
        drawList(root);
      });
    },
  }));

  function drawList(root) {
    const g = GROUPS.find((x) => x.key === ordFilter);
    const items = state.purchaseOrders.filter((p) => g.match(p.status));
    const host = $('#ord-list', root);
    if (!items.length) { host.innerHTML = empty(I.cart, 'Нет заказов', 'Создайте новый заказ поставщику.'); return; }
    host.innerHTML = `<div class="stack stagger">` + items.map((po) => {
      const s = supById(po.supplier_id);
      const total = poTotal(po);
      const min = s.min_order_amount || 0;
      const short = min && total < min ? min - total : 0;
      return `<div class="card card--tap" onclick="go('/orders/${po.id}')">
        <div class="rowcard">
          <div class="rowcard__main">
            <div class="rowcard__title">${esc(s.name)}</div>
            <div class="rowcard__meta">${esc(po.id)} · ${po.lines.length} поз. · ${relDate(po.created_at)}</div>
            <div class="mt row gap-sm row--wrap">${statusBadge(PO_STATUS, po.status)}${
              po.status === 'draft' && short ? badge('warn', `+${fmtMoney(short)} до минимума`) : ''}${
              po.lines.some((l) => l.origin === 'ai') ? badge('accent', 'AI') : ''}</div>
          </div>
          <div class="rowcard__right"><div class="strong tabnum">${money(total)}</div></div>
          ${I.chevR.replace('<svg', '<svg class="chev"')}
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  /* ---- NEW: supplier picker --------------------------------------------- */
  route('/orders/new', () => ({
    section: 'orders', title: 'Новый заказ', container: 'container--form',
    html: `
      <a class="back-link" href="#/orders">${I.back}Заказы</a>
      <div class="page-head"><div class="page-title">Кому заказываем?</div>
      <div class="page-sub">Сначала — поставщики с заполненной карточкой.</div></div>
      <div class="stack stagger">
        ${suppliers.filter((s) => s.is_active).map((s) => `
          <button class="card card--tap card--pad" style="text-align:left" data-sup="${s.id}">
            <div class="row row--between">
              <div class="flex1"><div class="strong" style="font-size:15px">${esc(s.name)}</div>
              <div class="hint">${s.categories.join(', ')} · мин. заказ ${s.min_order_amount ? fmtMoney(s.min_order_amount) + ' BYN' : '—'}</div></div>
              ${I.chevR.replace('<svg', '<svg style="width:18px;color:var(--color-line-strong)"')}
            </div>
          </button>`).join('')}
      </div>`,
    mount(root) {
      $$('[data-sup]', root).forEach((b) => b.onclick = () => {
        const id = 'PO-' + String(++poSeq).padStart(4, '0');
        const po = { id, supplier_id: Number(b.dataset.sup), status: 'draft', created_at: new Date().toISOString(), confirmed_at: null, lines: [] };
        state.purchaseOrders.unshift(po);
        go('/orders/' + id);
      });
    },
  }));

  /* ---- EDITOR ------------------------------------------------------------ */
  route('/orders/:id', (p) => {
    const po = state.purchaseOrders.find((x) => x.id === p.id);
    if (!po) return { section: 'orders', title: 'Заказ', html: empty(I.cart, 'Не найдено', 'Заказ не найден.') };
    return {
      section: 'orders', title: po.id, container: 'container--form',
      html: `<a class="back-link" href="#/orders">${I.back}Заказы</a><div id="po"></div>`,
      mount(root) { drawEditor(root, po); },
    };
  });

  function drawEditor(root, po) {
    const host = $('#po', root);
    const s = supById(po.supplier_id);
    const editable = po.status === 'draft';
    const total = poTotal(po);
    const min = s.min_order_amount || 0;
    const pct = min ? Math.min(100, Math.round((total / min) * 100)) : 100;
    const reached = !min || total >= min;
    const short = reached ? 0 : min - total;

    const minCard = min ? `
      <div class="card card--pad">
        <div class="row row--between mb"><div class="strong">Минимальный заказ</div>
          <div class="tabnum muted">${fmtMoney(total)} / ${fmtMoney(min)} BYN</div></div>
        <div class="progress"><div class="progress__bar ${reached ? 'ok' : 'warn'}" style="width:${pct}%"></div></div>
        <div class="hint mt" style="color:${reached ? 'var(--color-good)' : 'var(--color-warn)'};font-weight:600">
          ${reached ? '✓ Минимум достигнут' : `Нужно ещё ${fmtMoney(short)} BYN, чтобы достичь минимума`}
        </div>
        ${s.min_order_note ? `<div class="hint">${esc(s.min_order_note)}</div>` : ''}
      </div>` : '';

    const lines = po.lines.map((l, idx) => {
      const ing = ingById(l.ingredient_id);
      const om = originMeta[l.origin];
      const lineTotal = l.qty * packFactor(l.packing) * l.unit_price;
      return `<div class="card card--pad" style="padding:12px 14px">
        <div class="row row--between gap-sm">
          <div class="flex1 truncate strong">${esc(ing.name)}</div>
          <span class="badge badge--${om.tone} badge--sm" title="${om.title}">${l.origin === 'ai' ? I.sparkles : ''}${om.label}</span>
        </div>
        ${l.origin === 'ai' && l.reason ? `<div class="hint" style="color:var(--color-accent-strong)">${esc(l.reason)}</div>` : ''}
        <div class="row row--between mt gap-sm">
          <div class="row gap-sm">
            ${editable ? `<button class="btn btn--sm" data-dec="${idx}" aria-label="меньше">−</button>` : ''}
            <span class="tabnum strong" style="min-width:46px;text-align:center">${fmtQty(l.qty)}</span>
            ${editable ? `<button class="btn btn--sm" data-inc="${idx}" aria-label="больше">+</button>` : ''}
            <span class="muted nowrap">${esc(l.packing)}</span>
          </div>
          <div class="row gap-sm">
            <span class="tabnum strong">${money(lineTotal)}</span>
            ${editable ? `<button class="iconbtn" style="width:32px;height:32px" data-del="${idx}" aria-label="удалить">${I.trash.replace('<svg', '<svg style="width:17px;color:var(--color-muted)"')}</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    host.innerHTML = `
      <div class="page-head"><div class="page-head__row">
        <div class="flex1"><div class="page-title">${esc(s.name)}</div>
        <div class="page-sub">${esc(po.id)} · создан ${relDate(po.created_at)}</div></div>
        ${statusBadge(PO_STATUS, po.status)}
      </div></div>

      <div class="stack">
        ${editable ? `
          <div class="row gap-sm row--wrap">
            <button class="btn flex1" id="po-ai" style="border-color:var(--color-accent);color:var(--color-accent)">${I.sparkles}Предложить заказ</button>
            <button class="btn flex1" id="po-prefill">${I.clock}Из истории</button>
          </div>` : ''}

        ${minCard}

        <div>
          <div class="section-label">Позиции · ${po.lines.length}</div>
          ${po.lines.length ? `<div class="stack">${lines}</div>` : empty(I.box, 'Пусто', editable ? 'Добавьте позиции вручную, из истории или предложением AI.' : 'Нет позиций.')}
        </div>

        ${editable ? `<button class="btn btn--block" id="po-add">${I.plus}Добавить позицию</button>` : ''}

        <div class="card card--pad"><div class="row row--between">
          <div class="muted">Итого</div><div class="big-money">${money(total)}</div></div></div>

        ${editable
          ? `<button class="btn btn--primary btn--block" id="po-confirm" ${po.lines.length ? '' : 'disabled'}>${I.check}Подтвердить и собрать сообщение</button>`
          : po.status === 'confirmed' || po.status === 'sent_manually'
            ? `<button class="btn btn--block" id="po-msg">${I.copy}Показать сообщение поставщику</button>`
            : ''}
        ${editable ? `<div class="hint center">AI предлагает — решение и отправка за вами.</div>` : ''}
      </div>`;

    // qty steppers
    $$('[data-inc]', host).forEach((b) => b.onclick = () => { const l = po.lines[+b.dataset.inc]; l.qty++; if (l.origin === 'ai') l.origin = 'manual'; drawEditor(root, po); });
    $$('[data-dec]', host).forEach((b) => b.onclick = () => { const l = po.lines[+b.dataset.dec]; l.qty = Math.max(1, l.qty - 1); if (l.origin === 'ai') l.origin = 'manual'; drawEditor(root, po); });
    $$('[data-del]', host).forEach((b) => b.onclick = () => { po.lines.splice(+b.dataset.del, 1); drawEditor(root, po); });

    if (editable) {
      $('#po-ai', host).onclick = () => proposeOrder(root, po, s);
      $('#po-prefill', host).onclick = () => prefill(root, po, s);
      $('#po-add', host).onclick = () => openAddPicker(root, po, s);
      $('#po-confirm', host).onclick = () => confirmOrder(root, po, s);
    } else if ($('#po-msg', host)) {
      $('#po-msg', host).onclick = () => showMessage(po, s, false);
    }
  }

  /* ---- AI proposal (deterministic: stock <= reorder → round up to packs) - */
  function proposeOrder(root, po, s) {
    const candidates = ingredients.filter((ing) => s.categories.includes(ing.category) && ing.stock <= ing.reorder);
    let added = 0;
    candidates.forEach((ing) => {
      if (po.lines.some((l) => l.ingredient_id === ing.id)) return;
      const deficit = ing.reorder - ing.stock;
      const packs = Math.max(1, Math.ceil(deficit / ing.pack.factor));
      const price = lastPrice(ing.id, s.id) ?? guessPrice(ing.id);
      po.lines.push({ ingredient_id: ing.id, qty: packs, packing: ing.pack.label, unit_price: price, origin: 'ai',
        reason: `Остаток ${fmtQty(ing.stock)} ${ing.unit} ниже порога ${fmtQty(ing.reorder)} ${ing.unit}` });
      added++;
    });
    drawEditor(root, po);
    toast(added ? `Планировщик предложил ${added} ${plural(added, 'позицию', 'позиции', 'позиций')}` : 'Всё выше порога — предлагать нечего', added ? 'good' : '');
  }

  function prefill(root, po, s) {
    const cat = ingredients.filter((ing) => s.categories.includes(ing.category));
    let added = 0;
    cat.forEach((ing) => {
      if (po.lines.some((l) => l.ingredient_id === ing.id)) return;
      po.lines.push({ ingredient_id: ing.id, qty: 1, packing: ing.pack.label, unit_price: lastPrice(ing.id, s.id) ?? guessPrice(ing.id), origin: 'prefill', reason: '' });
      added++;
    });
    drawEditor(root, po);
    toast(added ? `Добавлено из истории: ${added}` : 'История пуста', added ? 'good' : '');
  }

  function openAddPicker(root, po, s) {
    const pool = ingredients.filter((ing) => s.categories.includes(ing.category) && !po.lines.some((l) => l.ingredient_id === ing.id));
    const render = (list) => list.length ? list.map((ing) => `
      <button class="card card--tap card--pad" style="width:100%;text-align:left;margin-bottom:8px" data-pick="${ing.id}">
        <div class="row row--between"><div><div class="strong">${esc(ing.name)}</div>
        <div class="hint">${esc(ing.category)} · остаток ${fmtQty(ing.stock)} ${esc(ing.unit)}</div></div>
        ${I.plus.replace('<svg', '<svg style="width:18px;color:var(--color-accent)"')}</div></button>`).join('') : `<div class="empty">Все позиции этого поставщика уже в заказе</div>`;
    openSheet('Добавить позицию', `<div class="hint mb">Каталог ${esc(org.pos)} · ${esc(s.name)}</div><div id="add-list">${render(pool)}</div>`, {
      onMount(body) {
        $$('[data-pick]', body).forEach((b) => b.onclick = () => {
          const ing = ingById(b.dataset.pick);
          po.lines.push({ ingredient_id: ing.id, qty: 1, packing: ing.pack.label, unit_price: lastPrice(ing.id, s.id) ?? guessPrice(ing.id), origin: 'manual', reason: '' });
          closeSheet(); drawEditor(root, po); toast('Позиция добавлена', 'good');
        });
      },
    });
  }

  /* ---- confirm → composed message --------------------------------------- */
  function confirmOrder(root, po, s) {
    po.status = 'confirmed';
    po.confirmed_at = new Date().toISOString();
    drawEditor(root, po);
    showMessage(po, s, true);
  }

  function composeMessage(po, s) {
    const lines = po.lines.map((l) => `• ${ingById(l.ingredient_id).name} — ${fmtQty(l.qty)} ${l.packing}`).join('\n');
    return `Здравствуйте! Заказ для «${org.name}», ${org.subdivision}.\n\n${lines}\n\nИтого: ~${fmtMoney(poTotal(po))} BYN.\nКогда удобно подвезти? Спасибо!\n— ${org.name}`;
  }

  function channelHint(s) {
    const label = channelLabel[s.contact_channel] || 'канал';
    let link = '';
    if (s.contact_channel === 'telegram') link = 'https://t.me/' + s.contact_value.replace('@', '');
    else if (s.contact_channel === 'phone' || s.contact_channel === 'whatsapp' || s.contact_channel === 'viber') link = 'tel:' + s.contact_value.replace(/[^\d+]/g, '');
    return { label, value: s.contact_value, link };
  }

  function showMessage(po, s, firstConfirm) {
    const text = composeMessage(po, s);
    const ch = channelHint(s);
    openSheet('Сообщение поставщику', `
      <div class="reasonbar mb"><div class="reasonbar__title">${I.send}Отправьте вручную в свой канал</div>
        <div class="hint" style="color:var(--color-ink);margin-top:4px">Интеграций с мессенджерами нет — LCOS готовит текст, отправляете вы.
        Канал ${esc(s.name)}: <b>${esc(ch.label)} ${esc(ch.value)}</b></div></div>
      <div class="msgbox" id="msg-text">${esc(text)}</div>
      <div class="row gap-sm mt-lg">
        <button class="btn btn--primary flex1" id="msg-copy">${I.copy}Копировать</button>
        ${ch.link ? `<a class="btn" href="${esc(ch.link)}" target="_blank" rel="noopener">${I.send}Открыть ${esc(ch.label)}</a>` : ''}
      </div>
      <div class="hint center mt">После копирования заказ помечается «Отправлен».</div>
    `, {
      onMount(body) {
        $('#msg-copy', body).onclick = async () => {
          try { await navigator.clipboard.writeText(text); }
          catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
          po.status = 'sent_manually';
          if (!po.confirmed_at) po.confirmed_at = new Date().toISOString();
          closeSheet();
          toast('Скопировано · заказ отмечен «Отправлен»', 'good');
          const cont = $('.container'); const cur = state.purchaseOrders.find((x) => x.id === po.id);
          if (cont && $('#po', cont)) drawEditor(cont, cur); else go('/orders');
        };
      },
    });
    if (firstConfirm) toast('Заказ подтверждён', 'good');
  }

  /* ---- price helpers ----------------------------------------------------- */
  function lastPrice(ingId, supId) {
    const rows = supplierPrices[ingId]; if (!rows) return null;
    const row = rows.find((r) => r.supplier_id === supId); if (!row) return null;
    return row.points[row.points.length - 1].price;
  }
  const PRICE_GUESS = { 'ing-milk': 2.35, 'ing-cream': 6.90, 'ing-braz': 26.90, 'ing-ethio': 28.50, 'ing-caramel': 9.40, 'ing-vanilla': 9.40, 'ing-cup250': 0.14, 'ing-lid90': 0.09, 'ing-sugar': 0.04 };
  const guessPrice = (id) => PRICE_GUESS[id] ?? 1;
})();
