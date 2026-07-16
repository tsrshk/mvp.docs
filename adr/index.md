---
id: ADR-INDEX
type: adr-index
title: Реестр архитектурных решений (журнал ADR)
status: current
updated: 2026-07-13
sources: [04_DECISIONS.md, 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md]
---
# Реестр архитектурных решений (журнал ADR)

Append-only журнал зафиксированных решений. Мы не переписываем прошлую запись — когда что-то меняется, помечаем её `superseded` и добавляем новую со ссылкой. Записи кодифицируют ранее принятые решения (собранные из кода, `CLAUDE.md`, продуктовых документов и анализа); дата кодификации — 2026-07-02, если явно не указано иное. Порядок доверия: **code > normative > descriptive** ([[ADR-015]]).

## Реестр

| ID | Decision | Status | Date |
|---|---|---|---|
| [[ADR-001]] | LCOS — точка ввода накладных, а не POS | accepted | 2026-07-02 |
| [[ADR-002]] | Human-in-the-loop | accepted | 2026-07-02 |
| [[ADR-003]] | Фазовая дисциплина и Pilot-Gate (Wife-Gate) | accepted | 2026-07-02 |
| [[ADR-004]] | Esupl как основная ERP | accepted | 2026-07-02 |
| [[ADR-005]] | Трёхуровневое разделение конфигурации/секретов, без фолбэка в env | accepted | 2026-07-02 |
| [[ADR-006]] | Fail-closed повсюду | accepted | 2026-07-02 |
| [[ADR-007]] | Две независимые плоскости аутентификации | accepted | 2026-07-02 |
| [[ADR-008]] | Organization-as-tenant; multi-tenant-ready, single-tenant-first | accepted | 2026-07-02 |
| [[ADR-009]] | One implementation per provider-seam until a real trigger | accepted (excl. `gemini`) | 2026-07-02 |
| [[ADR-010]] | Secret encryption at-rest (Fernet envelope, versioned KEK) | accepted | 2026-07-02 |
| [[ADR-011]] | Секреты читаются без кэширования | accepted | 2026-07-02 |
| [[ADR-012]] | Фронтенд не хранит секретов | accepted | 2026-07-02 |
| [[ADR-013]] | Photo-first поток накладной | accepted | 2026-06-29 |
| [[ADR-014]] | OCR через vision-LLM, а не классический OCR-движок | accepted | 2026-06-22 |
| [[ADR-015]] | Режим документации (порядок доверия, архив инертен) | accepted | 2026-07-02 |
| [[ADR-016]] | Источник остатков и потребления | proposed | 2026-07-03 |
| [[ADR-017]] | Self-service поставщика — оставить дверь открытой, но не строить портал | accepted | 2026-07-03 |
| [[ADR-018]] | SKU-identity commit-gate: POS = SoT, mapping on a durable id, variant A | accepted | 2026-07-08 |
| [[ADR-019]] | DEC-0012: composite key for `sku_mapping` (supplier in the key) | accepted | 2026-07-09 |
| [[ADR-020]] | Moat accumulation channel: client-side `POST /ingredients/mappings` in `onSend` | accepted | 2026-07-09 |
| [[ADR-021]] | Локальный SSOT поставщика; POS только для SKU-связей; единый ряд supplier_prices | accepted | 2026-07-13 |
| [[ADR-022]] | Диплинки и tenant-скоупинг: URL — идентичность сущности и табы, tenant вне URL | accepted | 2026-07-16 |

## Детальные записи решений (DEC)
Фрагментарные DEC-записи, свёрнутые в полные документы и кодифицированные [[ADR-018]]:

| ID | Decision | Status | Codified in |
|---|---|---|---|
| [[DEC-0011]] | POS as SoT of identity; mapping on a durable POS ID; two-phase authority | accepted | [[ADR-018]] |
| [[DEC-0013]] | Commit requires confirmed SKU identity (variant A) | accepted | [[ADR-018]] |

> **DEC-0012** ратифицирован как [[ADR-019]] (composite key для `sku_mapping`). Отдельного DEC-документа не имеет.

## Открытые гейты / долги
- **VER-021** (durability `pos_ingredient_id`) — GATE, требует WRITE в песочницу Esupl → owner-run; не закрывается в read-only. Linchpin [[DEC-0011]] / [[ADR-018]].
- **BACKLOG DEC-01** — резолюция второго OCR/AI-вендора `gemini` (нарушает [[ADR-009]]): claude-only (рекомендуется) или завершить seam.
- **BACKLOG DEC-02** — очистка мёртвого кода: неиспользуемый `invoice_lines.sku_embedding` (pgvector), browser-direct LLM/ERP (A2), plaintext-фолбэк в `encrypt()` (A1). См. [[LCOS-E5-stabilization]].
- **ALIGN-014** — seam `ERPProvider` READ (`list_ingredients`, `get_ingredient`).

## Changelog
- 2026-07-16 v1.6.0 — добавлен [[ADR-022]] (диплинки и tenant-скоупинг: URL — источник идентичности сущности и активной табы; tenant вне URL, switch-context с детали → redirect на список; id локальный, не `external_id`; wizard вне URL; SSOT путей `shared/config/routes.ts`).
- 2026-07-13 v1.5.0 — добавлен [[ADR-021]] (локальный SSOT поставщика; POS только для SKU-связей и durable `supplier_external_id`; частичный реверс [[DEC-0011]] для справочника поставщиков; единый ряд `supplier_prices` с дискриминатором `source`). Устранён долг: реестр v1.4.0 не отражал уже принятый ADR-021, на который ссылается конституция.
- 2026-07-09 v1.4.0 — добавлен [[ADR-020]] (канал накопления moat = client-side `POST /ingredients/mappings` в `onSend`; persist-then-commit независимо от reject накладной; FE `save()` удалён; висячая ссылка `ADR-013` удалена из APP_OVERVIEW §8).
- 2026-07-09 v1.3.0 — добавлен [[ADR-019]] (DEC-0012 ратифицирован: composite key для `sku_mapping` с `supplier_external_id`; для миграции learning-loop в бэкенд).
- 2026-07-09 v1.2.0 — добавлен [[ADR-018]] (SKU-identity commit-gate: кодификация [[DEC-0011]] + [[DEC-0013]] вариант A; зафиксировано вето варианта C из `TZ__STABILIZATION_2026-07-09`, вариант A ратифицирован).
- 2026-07-03 v1.1.0 — добавлены [[ADR-016]] (источник остатков/потребления — proposed, резолвится Э0-пробами) и [[ADR-017]] (self-service поставщика — accepted, заготовка схемы без портала).
- 2026-07-02 v1.0.0 — создан; [[ADR-001]]…[[ADR-015]] кодифицированы из кода, CLAUDE.md, продуктовых документов и анализа.

## Ссылки
- [[README]] · [[MOC]] · [[architecture]] · [[glossary]]
