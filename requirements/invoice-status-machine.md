---
id: REQ-INVOICE-STATUS
type: requirement
title: Машина статусов накладной (draft→validated→rejected→prepared→written→failed)
status: built
scope: cross-cutting
roles: [member, admin]
entities: ["[[invoices]]", "[[invoice_lines]]"]
adrs: ["[[ADR-001]]", "[[ADR-002]]", "[[ADR-006]]"]
requirements: ["[[erp-esupl-integration]]", "[[sku-identity-resolver]]", "[[fail-closed]]", "[[global-requirements]]"]
legacy_refs: [07 Э1, plan F1, 08 F0.x]
sources: [01_ARCHITECTURE.md "prepare()→payload", "Enums (InvoiceStatus)", APP_OVERVIEW.md §6]
updated: 2026-07-09
---

# REQ-INVOICE-STATUS · Машина статусов накладной

**Type:** cross-cutting SSOT · **Status:** built. Жизненный цикл `Invoice` от распознавания до (gated) записи в POS.

## Нормативное положение

- **N1. Enum `InvoiceStatus` (native PG enum):** `draft → validated → rejected → prepared → written → failed`. По умолчанию `draft`, индексирован. Семантика:
  - `validated` — OCR ok, арифметика прошла, но **ещё не** разрешено в POS-payload.
  - `rejected` — провал арифметики/обязательных полей **или** commit-resolve identity (fail-closed).
  - `prepared` — полностью разрешено в `EsuplOutgoingInvoice`, готово к отправке; **payload сохранён в `invoices.esupl_payload`**.
  - `written` — реально записано в Esupl (только при `ERP_WRITE_ENABLED`).
  - `failed` — запись в ERP не удалась.
- **N2. API из двух шагов:** `recognize` (только OCR, без persist) → клиент правит → `submit`. `prepare` — чистый resolve-шаг (также `POST /invoices/prepare` для предпросмотра), не persist-ит.
- **N3. `submit(draft)` = `validate_draft` + `prepare` + persist:** `validate_draft` проверяет номер, положительный total, сумму строк vs total в пределах `_TOTAL_TOLERANCE = Decimal("0.05")`; затем `prepare` (draft-resolve, [[sku-identity-resolver]] N1) и commit-resolve identity; персистит локальную [[invoices]], выставляет статус.
- **N4. `esupl_payload` замораживается на `prepared`** — чтобы поздняя gated-отправка воспроизвела **точное** валидированное тело без повторного resolve.
- **N5. Запись гейтится дважды:** `submit` вызывает `erp.write_invoice` **только** при `resolve_bool(ERP_WRITE_ENABLED)` (по умолчанию False); сам `EsuplErpProvider.write_invoice` **повторно гейтит** по тому же флагу (возвращает `esupl-prepared-<number>` без egress при OFF). См. [[erp-esupl-integration]] N4.
- **N6. Исключения записи не роняют запрос:** `submit` перехватывает их и пишет `status=failed` + `validation_errors`, не 500.
- **N7. Идемпотентность записи:** `UNIQUE(organization_id, external_id)` на [[invoices]] (PG трактует NULL как различные → черновики без `external_id` не конфликтуют); `get_by_external_id` для повторной записи. Идемпотентность самого submit — серверный `Idempotency-Key` ([[LCOS-F43-idempotency]], DEFER-04 снят 2026-07-16): партиальный `UNIQUE(organization_id, idempotency_key)`, двухфазный submit (commit ключа до ERP-вызова), replay без повторного `erp.write_invoice`; per-browser guard удалён.

## Обоснование

Разделение статусов делает различимыми «распознано», «валидно, но не готово к POS», «готово», «записано» и «ошибка записи» — критично для human-in-the-loop ([[ADR-002]]): человек видит ровно то, что готово к отправке. Сохранение `esupl_payload` на `prepared` замораживает валидированное тело, поэтому двойная запись (локальная БД + ERP) не выполняет resolve заново при отправке. Двойной gate записи — часть fail-closed read-only режима.

## Режимы отказа

- **Провал арифметики/обязательных полей** → `rejected` (не тихая отправка неверного total).
- **Провал commit-resolve identity** → `rejected` + review (см. [[sku-identity-resolver]] N3).
- **Запись в ERP не удалась** → `failed` + `validation_errors`, запрос не падает с 500.
- **`ERP_WRITE_ENABLED=OFF`** → `prepared` (не `written`); FE toast "Prepared… POS write disabled".
- **Строки без SKU** отбрасываются при отправке (новые ингредиенты никогда не создаются) — намеренно, не ошибка.

## Связи

- ADR: [[ADR-001]] (точка записи), [[ADR-002]] (human-in-the-loop), [[ADR-006]] (fail-closed).
- Сущности: [[invoices]] (`status`, `esupl_payload`, `external_id`), [[invoice_lines]] (снапшот `pos_ingredient_id`).
- Требования: [[erp-esupl-integration]] (write/gate), [[sku-identity-resolver]] (commit-resolve → rejected), [[fail-closed]], [[global-requirements]] R8.3.

## На это ссылаются

`LCOS-F10` (Invoice status machine + Esupl payload + gated write), `LCOS-F8`/`F9` (recognize/prepare), `LCOS-F13`/`F14` (commit-resolve → status), `LCOS-F43` (server-side idempotency — DEFER-04).

## Источники

- 01_ARCHITECTURE.md → "Enums (InvoiceStatus)", "How a request flows", "prepare() flow", Data model (`invoices`).
- APP_OVERVIEW.md §6.
- Код: `app/services/invoice_service.py` (`submit`/`prepare`/`validate_draft`), `app/db/models.py` (`InvoiceStatus`).
