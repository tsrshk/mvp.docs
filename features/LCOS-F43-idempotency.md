---
id: LCOS-F43
type: feature
title: Серверная идемпотентность submit (DEFER-04)
epic: "[[LCOS-E8-purchasing]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]"]
adrs: []
legacy_refs: ["08 F5.2", "DEFER-04", "07 Э5"]
sources: ["08_PHASE1_SPEC.md F5.2", "07_PHASES.md Э5", "mvp.be app/api/v1/routes/invoices.py:46", "mvp.fe src/shared/pos/sentRegistry.ts", "mvp.fe src/shared/pos/index.ts"]
updated: 2026-07-09
---
# LCOS-F43 · Серверная идемпотентность submit (DEFER-04)
**Epic:** [[LCOS-E8-purchasing]] · **Status:** planned · **Phase:** Phase 1

## Описание

Делает submit счёта-фактуры безопасным для повтора, на сервере. Сегодня guard от дублирующего submit живёт только в браузере (`shared/pos/sentRegistry.ts`) — хрупкий против перезагрузок, множественных вкладок и гонок. DEFER-04 переносит гарантию на бэкенд: frontend отправляет заголовок `Idempotency-Key` (uuid) на `POST /invoices`; бэкенд хранит его (колонка на `invoices` с уникальным ограничением) и при повторе с тем же ключом возвращает **оригинальный результат без второго ERP-вызова**. Как только это существует, браузерный guard удаляется (вместе с его ре-экспортом в `shared/pos/index.ts`).

Это предпосылка Phase 1 для включения постоянных живых записей ([[LCOS-F44-live-closeout]]): с взведённым путём записи в ERP повторённый submit никогда не должен создавать второй счёт-фактуру в Esupl. Уникальный ключ на `invoices` — это то, что обеспечивает «один submit → один счёт-фактура → один ERP-вызов» даже при повторах.

## Возможности

- Заголовок `Idempotency-Key` (uuid) принимается на `POST /invoices`, генерируется frontend'ом.
- Ключ персистируется на `invoices` с уникальным ограничением; тело домена `InvoiceDraft` остаётся неизменным.
- Повторный submit с тем же ключом → возвращается оригинальный результат, без второго ERP-вызова.
- Повтор с frontend с тем же ключом безопасен.
- Браузерный guard `shared/pos/sentRegistry.ts` удалён (с его ре-экспортом в `shared/pos/index.ts`).

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Отправлять счета-фактуры; повторы прозрачно дедуплицируются на сервере. |
| [[admin]] | То же, в пределах своего subdivision. |
| [[superadmin]] | Межтенантный доступ. |
| [[sqladmin-operator]] | Не участвует. |

Scope из активного JWT-контекста (см. [[multitenancy]]); ключ идемпотентности уникален в пределах пути submit.

## Задействованные сущности

- [[invoices]] — получает колонку ключа идемпотентности + уникальное ограничение; ключ защищает от дублирующей строки и дублирующей ERP-записи.

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (гарантия — «один submit → одна запись в Esupl»; повтор возвращает хранимый результат без пере-вызова ERP), [[invoice-status-machine]] (идемпотентность оборачивает путь submit `POST /invoices`).
- **Фичи:** укрепляет submit в [[LCOS-F10-invoice-status-machine]] ([[LCOS-E2-invoice-intake]]); предпосылка для постоянного включения живых ERP-записей в [[LCOS-F44-live-closeout]].

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Два submit с тем же `Idempotency-Key` → ровно один счёт-фактура и один ERP-вызов (respx-тест).
- [ ] AC-BE-2. Ключ хранится на `invoices` с уникальным ограничением; повтор возвращает оригинальный результат (без второй записи).
- [ ] AC-BE-3. Обработка отсутствующего/некорректного ключа определена (отклонён или трактуется как неидемпотентный) без нарушения существующего контракта тела `InvoiceDraft`.

### Frontend
- [ ] AC-FE-1. Frontend генерирует и отправляет uuid `Idempotency-Key` на `POST /invoices`; повтор с тем же ключом безопасен.
- [ ] AC-FE-2. `grep sentRegistry` пуст — браузерный guard и его ре-экспорт в `shared/pos/index.ts` удалены.

## Открытые вопросы / гейты
- **DEFER-04:** это отложенный пункт, который разблокирует постоянные живые записи; отслеживается в `05_BACKLOG.md`.

## Источники
- `08_PHASE1_SPEC.md F5.2` (заголовок `Idempotency-Key`, уникальная колонка, повтор возвращает оригинал, удаление `sentRegistry`, AC).
- `07_PHASES.md Э5` («DEFER-04 backend-идемпотентность отправки»).
- `mvp.be/app/api/v1/routes/invoices.py:46` — тело `POST /invoices` — это домен `InvoiceDraft`.
- `mvp.fe/src/shared/pos/sentRegistry.ts`, `src/shared/pos/index.ts` — браузерный guard на удаление.
