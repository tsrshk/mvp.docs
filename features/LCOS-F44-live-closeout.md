---
id: LCOS-F44
type: feature
title: Live-режим + метрики закрытия
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]", "[[invoice_lines]]", "[[purchase_order_lines]]", "[[system_settings]]"]
requirements: ["[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[ADR-003]]"]
legacy_refs: ["08 F5.3", "DEC-07", "07 Э5"]
sources: ["08_PHASE1_SPEC.md F5.3", "07_PHASES.md Э5", "mvp.fe src/pages/settings/ui/SettingsPage.tsx", "mvp.be app/domain/entities.py", "mvp.fe src/entities/invoice/model/sessionSlice.ts:22", "mvp.fe src/shared/ocr/providers/backend.ts:43", "mvp.fe src/widgets/prepare-step/ui/PrepareStep.tsx"]
updated: 2026-07-09
---
# LCOS-F44 · Live-режим + метрики закрытия
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Описание

Финальный шаг Phase 1: включить постоянные живые ERP-записи и инструментировать петлю, чтобы её закрытие можно было судить честно. Submit становится измеримым — строчный `match_origin` (`'auto' | 'manual' | None`) переносится на домене `InvoiceLineDraft` (frontend устанавливает его из бейджей авто-маппинга [[LCOS-F9-line-matching]]), а на submit бэкенд хранит счётчики на `invoices`: `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`. Единый блок **Metrics** на странице Settings репортит последние 30 дней — обработанные счета-фактуры, % авто-сматченных строк, медианное время «фото → отправка» и % строк AI-заказа, оставленных нетронутыми (из `purchase_order_lines.origin`). Это *единственный* dashboard-подобный экран в Phase 1 — он существует, чтобы валидировать закрытие фазы, а не как продуктовая фича.

Сам live-режим означает `erp_write_enabled=true` постоянно (безопасно только после работы над write-гейтом и серверной идемпотентности [[LCOS-F43-idempotency]]; чеклист включения дописывается в `WRITE_TRIAL.md`). Согласно DEC-07 (вариант B), временное многостраничное исправление сворачивается сюда: `MAX_INVOICE_PAGES` падает до `1` с честным сообщением, потому что живой распознаватель обрабатывает только первую страницу (`shared/ocr/providers/backend.ts:43`, `const page = pages[0]`) — не должно быть **молчаливой потери страниц**. Настоящее многостраничное распознавание вне scope Phase 1 и живёт в [[LCOS-F26-multipage-fix]] / [[LCOS-F29-multipage-recognize]] ([[LCOS-E6-ocr-quality]]).

## Возможности

- `match_origin` (`'auto'|'manual'|None`) добавлен на домен `InvoiceLineDraft`; FE устанавливает его из бейджей авто-маппинга.
- На submit счётчики хранятся на `invoices`: `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`.
- Блок Metrics на `SettingsPage` (окно 30 дней): счета-фактуры, % авто-сматченных строк, медиана фото→отправка, % строк AI-заказа без правок (из `purchase_order_lines.origin`).
- `erp_write_enabled=true` постоянно (после write-гейта + [[LCOS-F43-idempotency]]); чеклист дописан в `WRITE_TRIAL.md`.
- Временное многостраничное исправление (DEC-07 вариант B): `MAX_INVOICE_PAGES` → `1` + честное сообщение «один лист» в `PrepareStep`; нет молчаливой потери последующих страниц.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Запускает живую петлю (фото → записано в Esupl); видит блок Metrics на Settings. |
| [[admin]] | То же, в пределах своего subdivision. |
| [[superadmin]] | Межтенантный доступ; владеет решением `erp_write_enabled` через config. |
| [[sqladmin-operator]] | Переключает `erp_write_enabled` / модули в SQLAdmin-плоскости (см. [[LCOS-F3-sqladmin-operator]]). |

Scope из активного JWT-контекста; метрики вычисляются на тенант (см. [[multitenancy]]).

## Задействованные сущности

- [[invoices]] — несёт per-invoice счётчики (`auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms`), записываемые на submit.
- [[invoice_lines]] — `match_origin` на строку питает метрику % авто-сматченных.
- [[purchase_order_lines]] — `origin` питает метрику «% строк AI-заказа без правок».
- [[system_settings]] — `erp_write_enabled` (переключатель живой записи) и связанный конфиг.

## Зависимости / связи

- **Требования:** [[fail-closed]] (живые ERP-записи идут через fail-closed VPN-egress — VPN упал с включённым переключателем отказывает, а не течёт прямым egress), [[erp-esupl-integration]] (постоянная живая запись в Esupl; write-гейт + идемпотентность её охраняют).
- **ADR:** [[ADR-003]] (Pilot-Gate — ежедневное живое использование этой петли Customer Zero — критерий гейта).
- **Фичи:** требует [[LCOS-F43-idempotency]] до постоянных записей; читает пометки из [[LCOS-F9-line-matching]] (бейджи авто-маппинга) и [[LCOS-F40-ai-order-proposal]] (`origin='ai'`); временное многостраничное исправление координируется с [[LCOS-F26-multipage-fix]] / [[LCOS-F29-multipage-recognize]]. Закрывает петлю, открытую [[LCOS-F42-receipt-reconciliation]].

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `match_origin` — опциональное поле на `InvoiceLineDraft`; submit персистит `auto_mapped_lines`, `total_lines`, `edited_ai_lines`, `processing_ms` на `invoices`.
- [ ] AC-BE-2. Метрики совпадают с ручной сверкой счетов-фактур за один день (AC-1 спеки).
- [ ] AC-BE-3. `erp_write_enabled=true` безопасен постоянно (охраняется write-гейтом + [[LCOS-F43-idempotency]]); 10 подряд живых счетов-фактур проходят фото → `written` без ручного дублирования в Esupl.

### Frontend
- [ ] AC-FE-1. Блок Metrics на `SettingsPage` показывает цифры за 30 дней (счета-фактуры, % авто-строк, медиана фото→отправка, % AI-строк без правок) — единственный dashboard-экран.
- [ ] AC-FE-2. Нет молчаливой потери страниц: загрузка 2 страниц либо обрабатывает обе, либо показывает явное сообщение (`MAX_INVOICE_PAGES` → 1 + честный текст в `PrepareStep`).

### Прочее (data/infra)
- [ ] AC-OTHER-1. `WRITE_TRIAL.md` получает чеклист включения live; переключение `erp_write_enabled` записано там.

## Открытые вопросы / гейты
- **Pilot-Gate ([[ADR-003]]) / закрытие фазы (владелец):** две недели полного цикла без блокнота — AI-черновик → отправка в канале поставщика → фото приёмки с выбором склада → расхождения → `received` → счёт-фактура авто-записана в Esupl. Цели: ≥95% строк без правок, ≤30 с на счёт-фактуру, AI-черновик правится ≤30%. Если достигнуто — **Phase 1 закрыта**; если построенная петля не используется Customer Zero через 4 недели после раскатки → пересмотреть стратегию (kill-критерии).
- Настоящее многостраничное распознавание остаётся отложенным в [[LCOS-F29-multipage-recognize]]; эта фича гарантирует только отсутствие молчаливой потери.

## Источники
- `08_PHASE1_SPEC.md F5.3` (`match_origin` на `InvoiceLineDraft`, счётчики submit, блок Metrics, постоянный `erp_write_enabled`, DEC-07 вариант B многостраничное исправление, AC).
- `07_PHASES.md Э5` (`ERP_WRITE_ENABLED=ON` постоянно, DEFER-04, S2-метрика, критерий закрытия фазы).
- `mvp.fe/src/pages/settings/ui/SettingsPage.tsx` — расположение блока Metrics.
- `mvp.be/app/domain/entities.py` — `InvoiceLineDraft` (добавляет `match_origin`).
- `mvp.fe/src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES`), `src/shared/ocr/providers/backend.ts:43` (`const page = pages[0]` — где страницы отбрасываются), `src/widgets/prepare-step/ui/PrepareStep.tsx` (тексты «до 3 листов» к исправлению).
