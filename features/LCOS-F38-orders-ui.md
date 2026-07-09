---
id: LCOS-F38
type: feature
title: UI ручного черновика /orders + индикатор min-order
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]", "[[ingredients]]", "[[packings]]"]
requirements: ["[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F4.2", "07 Э4a"]
sources: ["08_PHASE1_SPEC.md F4.2", "07_PHASES.md Э4a", "mvp.fe src/features/lines-table/ui/SkuSelect.tsx", "mvp.fe src/features/lines-table/ui/LinesTable.tsx:24-38", "mvp.fe src/app/App.tsx", "mvp.fe src/widgets/app-layout/ui/AppLayout.tsx"]
updated: 2026-07-09
---
# LCOS-F38 · UI ручного черновика /orders + индикатор min-order
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Описание

Экран `/orders` — это место, где владелец кофейни собирает реальный заказ вручную с телефона. Он перечисляет заказы на закупку по статусу и стартует **новый заказ** выбором поставщика (сначала поставщики с заполненными карточками). При создании черновика он предлагает «добавить то, что этот поставщик поставлял ранее» (prefill из [[LCOS-F37-purchase-orders]]) и показывает живой **индикатор min-order**: итог vs `min_order_amount` поставщика с предупреждением «нужно ещё X, чтобы достичь минимума». Состояние черновика персистируется на бэкенде (через `entities/purchase-draft`), так что перезагрузка никогда не теряет строки.

Редактор строк намеренно **не** переиспользует `features/lines-table` целиком: этот компонент жёстко привязан к Redux-слайсу счёта-фактуры (`LinesTable.tsx` читает `s.invoiceSession.lines`). Вместо этого фича строит собственную таблицу строк заказа (новый feature-слайс или UI внутри `entities/purchase-draft`), которая **переиспользует подкомпоненты** — `SkuSelect` (поиск по каталогу) и паттерны разметки `LineRow`/`LineCard` (десктоп-таблица + мобильные карточки). Сам `LinesTable` не рефакторится.

Этот экран канал-агностичен насчёт *отправки*: подтверждение и копируемое сообщение поставщику — родственная фича [[LCOS-F39-order-message]]; точка входа AI «Предложить заказ» — [[LCOS-F41-ai-order-ui]].

## Возможности

- Маршрут `/orders` («Orders») в навигации (сайдбар + мобильный drawer): список заказов на закупку, сгруппированный по статусу.
- Поток «Новый заказ»: выбор поставщика (сначала показаны карточки с настройками).
- Prefill при создании черновика: «добавить то, что поставлялось ранее» → строки с `origin=prefill` (из [[LCOS-F37-purchase-orders]] `GET /prefill`).
- Редактируемая таблица строк заказа: добавить/удалить строки, поиск по каталогу через переиспользуемый `SkuSelect`, количество + упаковка (`packing_id`) на строку.
- Живые итоги: `total_amount` и индикатор min-order пересчитываются при каждом изменении количества.
- Индикатор min-order: прогресс к `min_order_amount` с предупреждением о недоборе.
- Черновик, персистируемый на бэкенде (`entities/purchase-draft`), не localStorage — переживает перезагрузку.
- Mobile-first layout, пригодный для составления заказа с телефона.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Открыть `/orders`, создавать/редактировать черновики для своего subdivision, запускать prefill, смотреть индикатор min-order. |
| [[admin]] | То же, в пределах своего subdivision. |
| [[superadmin]] | Межтенантный доступ. |
| [[sqladmin-operator]] | Не участвует; нет доступа к `/orders` в плоскости приложения. |

Scope (`organization_id` / `subdivision_id`) берётся из активного JWT-контекста (см. [[multitenancy]]); экран показывает только собственные заказы и поставщиков вызывающего.

## Задействованные сущности

- [[purchase_orders]] — перечисляемый/редактируемый заголовок; `total_amount` управляет индикатором min-order.
- [[purchase_order_lines]] — редактируемые строки (`origin` = `manual` при ручном добавлении, `prefill` при засеве).
- [[suppliers]] — выбор поставщика + `min_order_amount` / `min_order_note` для индикатора (из [[LCOS-F17-supplier-cards]]).
- [[ingredients]] / [[packings]] — цели поиска по каталогу и выбор упаковки на строку.

## Зависимости / связи

- **Требования:** [[multitenancy]] (экран тенант-скоупирован из активного контекста).
- **Фичи:** построен на [[LCOS-F37-purchase-orders]] (вся персистентность + prefill API); подтверждение + сообщение поставщику — [[LCOS-F39-order-message]]; точка входа AI-предложения — [[LCOS-F41-ai-order-ui]] (переиспользует ровно этот экран без ветвления). Карточки поставщиков и `min_order_amount` приходят из [[LCOS-F17-supplier-cards]]. Переиспользование подкомпонентов (не полное переиспользование) из `features/lines-table` [[LCOS-F9-line-matching]].

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Нет новой поверхности на бэкенде помимо [[LCOS-F37-purchase-orders]]; этот экран потребляет существующие endpoint'ы (create/patch/get/prefill). (Покрыто AC F37.)

### Frontend
- [ ] AC-FE-1. Полный путь работает: новый заказ → выбор поставщика → prefill → редактирование количеств → `total_amount` и индикатор min-order пересчитываются вживую.
- [ ] AC-FE-2. Перезагрузка не теряет строки (черновик персистирован на бэкенде, не localStorage).
- [ ] AC-FE-3. Индикатор min-order показывает прогресс vs `min_order_amount` с сообщением «нужно ещё X»; скрыт/нейтрален, когда у поставщика нет минимума.
- [ ] AC-FE-4. Таблица строк заказа — **новый** слайс/UI, переиспользующий паттерны `SkuSelect` и `LineRow`/`LineCard`; `features/lines-table`/`LinesTable` не модифицируется.
- [ ] AC-FE-5. Мобильный layout пригоден для составления заказа с телефона (touch-цели, карточки).
- [ ] AC-FE-6. Навигационный пункт `/orders` присутствует в сайдбаре + drawer; список показывает заказы, сгруппированные по статусу.

## Открытые вопросы / гейты
- Приёмка владельцем (весь Э4a, с [[LCOS-F39-order-message]]): собрать реальный недельный заказ — prefill → редактирование → «нужно X, чтобы достичь минимума» → доложить → confirm → скопировать → отправить в канале поставщика; поставщик принимает формат без вопросов.

## Источники
- `08_PHASE1_SPEC.md F4.2` (маршрут, prefill, индикатор min-order, решение о непереиспользовании, `entities/purchase-draft`, AC).
- `07_PHASES.md Э4a` (собственная редактируемая таблица, переиспользующая подкомпоненты; SSOT — спека).
- `mvp.fe/src/features/lines-table/ui/SkuSelect.tsx` (переиспользуется), `LineRow.tsx`/`LineCard.tsx` (паттерны), `LinesTable.tsx:24-38` (почему вся таблица не переиспользуется — привязана к `invoiceSession`).
- `mvp.fe/src/app/App.tsx`, `src/widgets/app-layout/ui/AppLayout.tsx` — маршрут + навигация.
