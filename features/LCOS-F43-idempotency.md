---
id: LCOS-F43
type: feature
title: Серверная идемпотентность submit (DEFER-04)
epic: "[[LCOS-E8-purchasing]]"
status: done
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]"]
requirements: ["[[erp-esupl-integration]]", "[[invoice-status-machine]]"]
adrs: []
legacy_refs: ["08 F5.2", "DEFER-04", "07 Э5"]
sources: ["08_PHASE1_SPEC.md F5.2", "07_PHASES.md Э5", "mvp.be app/api/v1/routes/invoices.py:88", "mvp.be app/services/invoice_service.py", "mvp.be alembic/versions/0014_invoice_idempotency_key.py", "mvp.fe src/shared/pos/idempotency.ts"]
updated: 2026-07-16
---
# LCOS-F43 · Серверная идемпотентность submit (DEFER-04)
**Epic:** [[LCOS-E8-purchasing]] · **Status:** done (2026-07-16) · **Phase:** Phase 1

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

- [x] AC-BE-1. Два submit с тем же `Idempotency-Key` → ровно один счёт-фактура и один ERP-вызов. Evidence: merge-gate тесты `tests/features/invoice/submit/test_idempotency_merge_gate.py` (последовательный + **конкурентный** на реальных транзакциях; ERP-вызовы считаются на провайдер-шве — тот же паттерн, что и merge-gate suite DEC-0011, вместо respx).
- [x] AC-BE-2. Ключ хранится на `invoices` (`idempotency_key` + партиальный `uq_invoices_org_idempotency_key` в scope организации, миграция `0014`); повтор возвращает оригинальный результат без второй записи. Дополнительно: `idempotency_request_hash` детектит конфликт «тот же ключ, другое тело» → типизированный `idempotency_key_conflict` (fail-closed).
- [x] AC-BE-3. Отсутствующий ключ → неидемпотентный путь как раньше; некорректный (не uuid) → 422 до персиста; тело `InvoiceDraft` не изменено. Evidence: `tests/features/invoice/submit/test_idempotency_http.py`.

### Frontend

- [x] AC-FE-1. Frontend генерирует uuid и шлёт `Idempotency-Key`; ключ хранится per-identity в `shared/pos/idempotency.ts` (localStorage) — повтор/перезагрузка/вторая вкладка переиспользуют тот же ключ; исход `validated` сбрасывает ключ (исправленный resend — новое тело — не конфликтует по FR-004).
- [x] AC-FE-2. `grep sentRegistry` по mvp.fe пуст — guard и ре-экспорт удалены (vitest 354 ✓, tsc ✓, build ✓).

## Ключевой инвариант реализации

Двухфазный submit: строка с ключом и статусом `prepared` **коммитится ДО первого байта
в сторону ERP** (`invoice_service.py::_submit`). Гонка разрешается unique-индексом
(проигравший возвращает строку победителя, не 500); крэш-ретрай с тем же ключом даёт
replay без повторного `erp.write_invoice`. Replay `failed`-исхода НЕ перезапускает запись.

## Открытые вопросы / гейты

- **DEFER-04:** снят 2026-07-16 (`05_BACKLOG.md`); фича разблокирует постоянные живые записи ([[LCOS-F44-live-closeout]]).
- Остаточное окно dual-write (крэш между ERP-записью и финальным UPDATE) — известный отложенный долг (outbox), ретраи при этом уже безопасны.

## Источники
- `08_PHASE1_SPEC.md F5.2` (заголовок `Idempotency-Key`, уникальная колонка, повтор возвращает оригинал, удаление `sentRegistry`, AC).
- `07_PHASES.md Э5` («DEFER-04 backend-идемпотентность отправки»).
- `mvp.be/app/api/v1/routes/invoices.py:46` — тело `POST /invoices` — это домен `InvoiceDraft`.
- `mvp.fe/src/shared/pos/sentRegistry.ts`, `src/shared/pos/index.ts` — браузерный guard на удаление.
