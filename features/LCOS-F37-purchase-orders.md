---
id: LCOS-F37
type: feature
title: purchase_orders + строки + машина статусов + prefill
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[purchase_orders]]", "[[purchase_order_lines]]", "[[suppliers]]", "[[ingredients]]", "[[packings]]", "[[invoice_lines]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]", "[[multitenancy]]"]
adrs: []
legacy_refs: ["08 F4.1", "07 Э4a"]
sources: ["08_PHASE1_SPEC.md F4.1", "07_PHASES.md Э4a", "mvp.be app/db/models.py:60-66,219-220", "mvp.be app/db/models.py:247-260", "mvp.be app/api/v1/routes/invoices.py:45-49"]
updated: 2026-07-09
---
# LCOS-F37 · purchase_orders + строки + машина статусов + prefill
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Описание

Дата- и API-хребет закупок: персистируемый заголовок `purchase_orders` с собственной машиной статусов, плюс `purchase_order_lines`. Это серверный фундамент, на котором строятся UI заказов ([[LCOS-F38-orders-ui]]), копируемое сообщение поставщику ([[LCOS-F39-order-message]]) и AI-предложение ([[LCOS-F40-ai-order-proposal]]). Каждый заказ тенант-скоупирован (organization + subdivision из активного JWT-контекста, см. [[multitenancy]]) и привязан к одному поставщику из локального справочника ([[LCOS-F17-supplier-cards]]).

Жизненный цикл заказа — нативный Postgres-enum `purchase_order_status` со значениями `draft → confirmed → sent_manually → received`, плюс `draft|confirmed → cancelled`. Он объявлен ровно как существующий enum `InvoiceStatus` (референс-паттерн, на который указывает спека), так что делит ту же миграционную и валидационную идиому (см. [[invoice-status-machine]]). Ничто здесь не пишет в Esupl (глобальное ограничение G5): заказ на закупку — это LCOS-внутреннее состояние — исходящий канал — это копируемый текст, а не ERP-вызов.

Чтобы сделать создание черновика быстрым, endpoint **prefill** возвращает позиции, которые данный поставщик поставлял ранее — выведенные на бэкенде из `invoice_lines` этого поставщика (ингредиент, последний `unit_price`, последнее `quantity`). Prefill вычисляется на стороне сервера из реальной истории счетов-фактур, а не на frontend, и скоупирован поставщиком в пределах организации вызывающего.

## Возможности

- `POST /purchase-orders` — создать `draft`-заказ для поставщика (scope тенанта из активного контекста).
- `GET /purchase-orders?status=` — список заказов, фильтруемый по статусу.
- `GET /purchase-orders/{id}` — заголовок заказа + строки (или `404`).
- `PATCH /purchase-orders/{id}` — редактировать поля заголовка и **заменить строки** (строки обновляются полной PUT-подобной заменой, `total_amount` пересчитывается).
- `POST /purchase-orders/{id}/confirm` — `draft → confirmed`, проставляя `confirmed_by`/`confirmed_at`; после confirm редактирование строк возвращает `409`.
- `POST /purchase-orders/{id}/cancel` — `draft|confirmed → cancelled`.
- `GET /purchase-orders/prefill?supplier_id=` — позиции, ранее поставленные этим поставщиком (ингредиент, последняя цена, последнее количество), построенные на бэкенде из `invoice_lines`.
- Денормализованный `total_amount` (`Numeric(14,2)`) держится равным сумме итогов строк при каждом изменении строк.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Создавать/редактировать/подтверждать/отменять заказы в пределах своего subdivision; запрашивать prefill. Любой член subdivision (план Э4a). |
| [[admin]] | То же, в пределах своего subdivision. |
| [[superadmin]] | Межтенантный доступ. |
| [[sqladmin-operator]] | Не участвует в потоке заказов; оперирует только config/module-плоскостями (см. [[LCOS-F3-sqladmin-operator]]). |

Scope тенанта (`organization_id` / `subdivision_id`) берётся из активного JWT-контекста; межтенантные чтения заблокированы (см. [[multitenancy]]).

## Задействованные сущности

- [[purchase_orders]] — заголовок: `id (uuid pk)`, `organization_id`, `subdivision_id`, `supplier_id (FK int)`, `status` (нативный enum `purchase_order_status`), `total_amount Numeric(14,2)` (денормализованный), `confirmed_by (FK users uuid, nullable)`, `confirmed_at`, `notes`.
- [[purchase_order_lines]] — `po_id (FK CASCADE)`, `line_no`, `ingredient_id (FK uuid)`, `packing_id (FK uuid, nullable)`, `quantity Numeric(14,3)`, `unit_price Numeric(14,4), nullable`, `origin` enum(`manual/ai/prefill`).
- [[suppliers]] — цель заказа; карточки поставщиков поставляют условия доставки и данные min-order, используемые даунстрим ([[LCOS-F38-orders-ui]]).
- [[ingredients]] / [[packings]] — ссылки строк; `packing_id` позволяет заказу нести количества на уровне упаковок.
- [[invoice_lines]] — единственный источник для prefill (последняя цена/количество на ингредиент поставщика).

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (G5 — заказы на закупку никогда не пишут в Esupl; ERP остаётся read-only), [[invoice-status-machine]] (`InvoiceStatus` — паттерн объявления/переходов, переиспользуемый для `purchase_order_status`), [[multitenancy]] (scope org/subdivision + изоляция).
- **Фичи:** потребляется [[LCOS-F38-orders-ui]] (UI ручного черновика), [[LCOS-F39-order-message]] (confirm → сообщение), [[LCOS-F40-ai-order-proposal]] (предложения пишут строки `origin='ai'` через этот API), [[LCOS-F42-receipt-reconciliation]] (счёт-фактура связывается обратно с открытым PO). Prefill переиспользует историю счетов-фактур из [[LCOS-E2-invoice-intake]]; строки несут POS-устойчивую идентичность через [[sku_mapping]] (ров из [[LCOS-E3-sku-identity]]).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Миграция добавляет `purchase_orders` + `purchase_order_lines` с нативным enum `purchase_order_status` (объявлен как `InvoiceStatus`); применяется и откатывается чисто.
- [ ] AC-BE-2. Машина статусов: все валидные переходы (`draft→confirmed→sent_manually→received`, `draft|confirmed→cancelled`) принимаются; каждый невалидный переход → `409` (протестировано исчерпывающе).
- [ ] AC-BE-3. `total_amount` всегда равен сумме итогов строк после любого изменения строк (тест пересчёта).
- [ ] AC-BE-4. Редактирование строк `confirmed` (или позднее) заказа → `409` (строки заморожены после confirm).
- [ ] AC-BE-5. `GET /purchase-orders/prefill?supplier_id=` возвращает только позиции этого поставщика в пределах org вызывающего, построенные из `invoice_lines` (ингредиент, последний `unit_price`, последнее `quantity`) — протестировано на скоупинг по org.
- [ ] AC-BE-6. Путь записи в Esupl нигде не существует в роутере (G5); confirm/cancel — только LCOS-внутренние.
- [ ] AC-BE-7. `POST /purchase-orders` и `PATCH` тенант-скоупированы из активного контекста; заказ org A не читается из org B (тест изоляции).

### Frontend
- [ ] AC-FE-1. `entities/purchase-draft` (FSD) экспонирует RTK-endpoint'ы для create/get/patch/confirm/cancel/prefill; черновик персистируется на бэкенде (не localStorage). (Композиция экрана живёт в [[LCOS-F38-orders-ui]].)

## Открытые вопросы / гейты
- Per-position минимальное количество / кратность — это **не** колонка — это свойство пары поставщик×SKU; в Phase 1 округление до упаковок обрабатывается `packings.factor`. Потребность на уровне поставщика прошла бы через `extra_terms` ([[LCOS-F18-supplier-criteria]]).
- **Pilot-Gate ([[ADR-003]]):** этот хребет должен обслуживать реальный недельный цикл заказов, используемый Customer Zero.

## Источники
- `08_PHASE1_SPEC.md F4.1` (схема, API, машина статусов, контракт prefill, AC).
- `07_PHASES.md Э4a` («Черновик заказа руками»: таблицы + без записи в Esupl).
- `mvp.be/app/db/models.py:60-66,219-220` — `InvoiceStatus` + `SAEnum(..., name="invoice_status")` (шаблон нативного PG-enum для `purchase_order_status`).
- `mvp.be/app/db/models.py:247-260` — `invoice_lines` (`sku`, `quantity`, `unit_price`, `line_total`) — достаточно данных для prefill.
- `mvp.be/app/api/v1/routes/invoices.py:45-49` — пример POST-маршрута (`submit_invoice`); `routes/suppliers.py` — паттерн тонкого роутера.
