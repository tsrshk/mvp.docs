/* =========================================================================
 * View: Сравнение поставщиков (price comparison) + ценовые алерты
 * /compare (alerts + SKU list) · /compare/:sku (price table + savings + explain)
 * ========================================================================= */
(function () {
  const MONTHLY_VOLUME = { 'ing-milk': 260, 'ing-braz': 45, 'ing-cup250': 3200 }; // ед./мес (прокси)
  const ALERT_META = {
    price_increase:      { tone: 'warn',   icon: I.up,    label: 'Рост цены' },
    cheaper_alternative: { tone: 'good',   icon: I.coins, label: 'Дешевле рядом' },
  };

  /* compute comparison rows for a SKU */
  function compareRows(sku) {
    const rows = (supplierPrices[sku] || []).map((r) => {
      const pts = r.points;
      const last = pts[pts.length - 1];
      const stale = daysAgo(last.date) > STALENESS_DAYS;
      // trend: last vs first point >=90d earlier (else earliest)
      let base = pts[0];
      for (let i = pts.length - 1; i >= 0; i--) { if (daysAgo(pts[i].date) >= 90) { base = pts[i]; break; } }
      const trendPct = pts.length > 1 && base !== last ? ((last.price - base.price) / base.price) * 100 : null;
      return { supplier: supById(r.supplier_id), price: last.price, date: last.date, min_batch: r.min_batch, stale, trendPct };
    });
    // current = latest observation date; best = lowest active (non-stale) price
    const current = rows.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const active = rows.filter((r) => !r.stale);
    const best = active.slice().sort((a, b) => a.price - b.price)[0];
    rows.forEach((r) => { r.isCurrent = r === current; r.isBest = best && r === best; });
    return { rows, current, best };
  }

  function savings(sku, current, best) {
    if (!best || !current || best.price >= current.price) return null;
    const vol = MONTHLY_VOLUME[sku] || 0;
    const perUnit = current.price - best.price;
    return { perUnit, vol, monthly: perUnit * vol };
  }

  /* ---- HUB: alerts + SKU list ------------------------------------------- */
  route('/compare', () => {
    const unread = state.alerts.filter((a) => !a.read_at);
    const skus = Object.keys(supplierPrices);
    return {
      section: 'compare', title: 'Сравнение',
      html: `
        <div class="page-head"><div class="page-head__row">
          <div class="flex1"><div class="page-title">Сравнение поставщиков</div>
          <div class="page-sub">Цены по позициям, динамика и подсказки об экономии. Никаких автозаказов.</div></div>
          ${unread.length ? `<button class="btn btn--sm" id="mark-all">Прочитать все</button>` : ''}
        </div></div>

        <div class="section-label" style="margin-top:0">Ценовые алерты ${unread.length ? badge('danger', String(unread.length)) : ''}</div>
        <div class="stack stagger" id="alerts">
          ${state.alerts.length ? state.alerts.map(alertCard).join('') : empty(I.bell, 'Тихо', 'Новых ценовых сигналов нет.')}
        </div>

        <div class="section-label">Сравнение по позициям</div>
        <div class="stack stagger">
          ${skus.map((sku) => {
            const ing = ingById(sku); const { rows, current, best } = compareRows(sku);
            const sv = savings(sku, current, best);
            return `<div class="card card--tap" onclick="go('/compare/${sku}')">
              <div class="rowcard">
                <div class="rowcard__main">
                  <div class="rowcard__title">${esc(ing.name)}</div>
                  <div class="rowcard__meta">${rows.length} ${plural(rows.length, 'поставщик', 'поставщика', 'поставщиков')} · лучшая ${fmtMoney(best.price)} BYN/${esc(ing.unit)}</div>
                  ${sv ? `<div class="mt">${badge('good', `экономия ≈ ${fmtMoney(sv.monthly)} BYN/мес`)}</div>` : `<div class="mt">${badge('muted', 'текущий поставщик оптимален')}</div>`}
                </div>
                ${I.chevR.replace('<svg', '<svg class="chev"')}
              </div></div>`;
          }).join('')}
        </div>`,
      mount(root) {
        $$('[data-alert]', root).forEach((c) => c.onclick = (e) => {
          if (e.target.closest('[data-read]')) return;
          const a = state.alerts.find((x) => x.id === Number(c.dataset.alert));
          a.read_at = a.read_at || new Date().toISOString();
          go('/compare/' + a.ingredient_id);
        });
        $$('[data-read]', root).forEach((b) => b.onclick = (e) => {
          e.stopPropagation();
          const a = state.alerts.find((x) => x.id === Number(b.dataset.read));
          a.read_at = new Date().toISOString(); render();
        });
        const ma = $('#mark-all', root);
        if (ma) ma.onclick = () => { state.alerts.forEach((a) => a.read_at = a.read_at || new Date().toISOString()); render(); toast('Все алерты прочитаны'); };
      },
    };
  });

  function alertCard(a) {
    const meta = ALERT_META[a.kind]; const ing = ingById(a.ingredient_id); const s = supById(a.supplier_id);
    const unread = !a.read_at;
    return `<div class="card card--tap" data-alert="${a.id}" style="${unread ? 'border-left:3px solid var(--color-' + meta.tone + ')' : 'opacity:.72'}">
      <div class="rowcard">
        <div class="iconbtn" style="background:var(--color-${meta.tone}-soft);color:var(--color-${meta.tone});width:38px;height:38px;flex:none">${meta.icon}</div>
        <div class="rowcard__main">
          <div class="row gap-sm">${badge(meta.tone, meta.label)}${unread ? '' : `<span class="muted" style="font-size:12px">прочитано</span>`}</div>
          <div class="rowcard__meta" style="color:var(--color-ink);margin-top:5px">${esc(a.message)}</div>
          <div class="hint">${esc(ing.name)} · ${esc(s.name)} · ${relDate(a.created_at)}</div>
        </div>
        ${unread ? `<button class="btn btn--sm" data-read="${a.id}">✓</button>` : ''}
      </div></div>`;
  }

  /* ---- DETAIL: price table + savings + explain -------------------------- */
  route('/compare/:sku', (p) => {
    const ing = ingById(p.sku);
    if (!ing || !supplierPrices[p.sku]) return { section: 'compare', title: 'Сравнение', html: empty(I.scale, 'Нет данных', 'По этой позиции нет ценовых наблюдений.') };
    const { rows, current, best } = compareRows(p.sku);
    const sv = savings(p.sku, current, best);

    const badges = (r) => `${r.isBest ? badge('good', 'лучшая') : ''} ${r.isCurrent ? badge('accent', 'текущий') : ''} ${r.stale ? badge('muted', 'устарела') : ''}`;

    const tableRows = rows.map((r) => `<tr style="${r.stale ? 'opacity:.55' : ''}">
      <td class="strong">${esc(r.supplier.name)}<div class="hint">${esc(r.min_batch)}</div></td>
      <td class="num tabnum strong">${fmtMoney(r.price)}</td>
      <td class="num">${trend(r.trendPct)}</td>
      <td class="muted nowrap">${fmtDate(r.date)}</td>
      <td>${badges(r)}</td>
    </tr>`).join('');

    const cards = rows.map((r) => `<div class="card card--pad" style="${r.stale ? 'opacity:.6' : ''}">
      <div class="row row--between"><div class="strong">${esc(r.supplier.name)}</div><div class="big-money">${fmtMoney(r.price)} <span class="muted" style="font-size:12px">BYN/${esc(ing.unit)}</span></div></div>
      <div class="row row--between mt gap-sm"><span class="muted" style="font-size:13px">${esc(r.min_batch)} · ${r.stale ? 'цена от ' + fmtDate(r.date) : relDate(r.date)}</span>${trend(r.trendPct)}</div>
      <div class="mt row gap-sm row--wrap">${badges(r)}</div>
    </div>`).join('');

    return {
      section: 'compare', title: ing.name, container: 'container--form',
      html: `
        <a class="back-link" href="#/compare">${I.back}Сравнение</a>
        <div class="page-head"><div class="page-title">${esc(ing.name)}</div>
        <div class="page-sub">${esc(ing.category)} · ${rows.length} ${plural(rows.length, 'поставщик', 'поставщика', 'поставщиков')} · цена за ${esc(ing.unit)}</div></div>

        ${sv ? `
          <div class="card card--pad mb" style="border-color:#bfe6cf;background:linear-gradient(180deg,var(--color-good-soft),#f2fbf5)">
            <div class="row row--between">
              <div><div class="section-label" style="margin:0;color:var(--color-good)">Потенциальная экономия</div>
                <div class="big-money" style="font-size:24px;color:var(--color-good)">≈ ${fmtMoney(sv.monthly)} BYN/мес</div></div>
              ${I.coins.replace('<svg', '<svg style="width:34px;height:34px;color:var(--color-good)"')}
            </div>
            <details class="mt"><summary class="pointer" style="color:var(--color-good);font-weight:600;font-size:13px">Как считается</summary>
              <div class="hint mt" style="line-height:1.6">(${fmtMoney(current.price)} − ${fmtMoney(best.price)}) BYN/${esc(ing.unit)} × ${fmtQty(sv.vol)} ${esc(ing.unit)}/мес = <b>${fmtMoney(sv.monthly)} BYN/мес</b>.<br>Объём — среднемесячный по приёмкам за 90 дней. Устаревшие цены (старше ${STALENESS_DAYS} дн.) в расчёте не участвуют.</div>
            </details>
          </div>` : `<div class="vpanel vpanel--ok mb">${I.checkc}<div>Текущий поставщик уже даёт лучшую активную цену.</div></div>`}

        <div class="hide-mobile table-wrap mb">
          <table class="tbl"><thead><tr>
            <th>Поставщик</th><th class="num">Цена</th><th class="num">Тренд 90д</th><th>Наблюдение</th><th></th>
          </tr></thead><tbody>${tableRows}</tbody></table>
        </div>
        <div class="show-mobile stack mb">${cards}</div>

        <button class="btn btn--block" id="explain" style="border-color:var(--color-accent);color:var(--color-accent)">${I.sparkles}Объяснить рекомендацию</button>
        <div class="hint center mt">AI поясняет только по этим ценам и ничего не заказывает.</div>
      `,
      mount(root) {
        $('#explain', root).onclick = () => explain(ing, rows, current, best, sv);
      },
    };
  });

  function explain(ing, rows, current, best, sv) {
    openSheet('Пояснение AI', `<div class="center" style="padding:24px"><div class="spinner"></div><div class="hint mt">Модель формулирует рекомендацию…</div></div>`, {
      onMount(body) {
        setTimeout(() => {
          const stale = rows.filter((r) => r.stale);
          const text = sv
            ? `У «${best.supplier.name}» позиция «${ing.name}» стоит ${fmtMoney(best.price)} BYN/${ing.unit} — самая низкая среди свежих цен. `
              + `Текущий поставщик «${current.supplier.name}» дороже на ${fmtMoney(current.price - best.price)} BYN/${ing.unit}`
              + `${current.trendPct ? ` (и цена выросла на ${current.trendPct.toFixed(1).replace('.', ',')}% за период)` : ''}. `
              + `При объёме ~${fmtQty(sv.vol)} ${ing.unit}/мес перевод закупки экономит ≈ ${fmtMoney(sv.monthly)} BYN в месяц. `
              + `${stale.length ? `Цена «${stale[0].supplier.name}» (от ${fmtDate(stale[0].date)}) устарела и в расчёт не бралась. ` : ''}`
              + `Рекомендация информационная — оформите заказ вручную, если условия поставки подходят.`
            : `Текущий поставщик «${current.supplier.name}» (${fmtMoney(current.price)} BYN/${ing.unit}) уже предлагает лучшую активную цену. Переключение не даст экономии.`;
          body.innerHTML = `<div class="reasonbar"><div class="reasonbar__title">${I.sparkles}Рекомендация</div>
            <div style="margin-top:8px;line-height:1.6">${esc(text)}</div></div>
            <button class="btn btn--primary btn--block mt-lg" data-close>Понятно</button>`;
          $('[data-close]', body).onclick = closeSheet;
        }, 950);
      },
    });
  }
})();
