---
id: invoices
type: entity
title: invoices — накладная (draft → payload → запись)
status: built
scope: subdivision
table: invoices
pk: id (int)
used_by: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]", "[[LCOS-F11-esupl-read]]", "[[LCOS-F43-idempotency]]"]
requirements: ["[[invoice-status-machine]]", "[[erp-esupl-integration]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:257-313, 01_ARCHITECTURE.md#data-model, APP_OVERVIEW.md §7]
updated: 2026-07-16
---
# invoices · накладная

**Scope:** subdivision (несёт `organization_id` + `subdivision_id`) · **Status:** built

## Назначение
Накладная — центральная операционная сущность wedge-флоу (см. [[LCOS-E2-invoice-intake]]). Она движется
по машине статусов `draft → validated/rejected → prepared → written/failed`
([[invoice-status-machine]]). При `status=prepared` полностью разрешённое тело исходящей накладной
сохраняется в `esupl_payload`, чтобы (гейтированная) отправка в Esupl воспроизводила ровно
валидированные данные ([[erp-esupl-integration]]; запись за `ERP_WRITE_ENABLED`, см. [[fail-closed]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK | no | граница, RESTRICT, индексируется (mixin) |
| `subdivision_id` | uuid FK | no | локация, RESTRICT, индексируется (mixin) |
| `supplier_id` | int FK→suppliers | yes | без ondelete (семантика RESTRICT) |
| `image_ref` | varchar(1024) | yes | ссылка на скан |
| `ocr_provider` / `ocr_raw` | varchar/text | yes | OCR-провайдер + сырой ответ |
| `number` | varchar(128) | yes | номер накладной; индексируется |
| `issued_at` | timestamptz | yes | дата документа (aware с миграции `0015`, B1 гигиены) |
| `total_amount` | numeric(14,2) | yes | сумма |
| `currency` | varchar(8) | yes | валюта |
| `status` | enum `invoice_status` | no | default `draft`; индексируется |
| `validation_errors` | text | yes | причины отклонения (rejected) |
| `external_id` | varchar(128) | yes | id в Esupl; индексируется |
| `esupl_payload` | text | yes | JSON payload, заполняется на `prepared` |
| `idempotency_key` | uuid | yes | серверная идемпотентность submit ([[LCOS-F43-idempotency]]); NULL = неидемпотентный запрос |
| `idempotency_request_hash` | varchar(64) | yes | SHA-256 канонизированного `InvoiceDraft` — детектор конфликта «тот же ключ, другое тело» (FR-004) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

Enum `status`: `draft`, `validated`, `rejected`, `prepared`, `written`, `failed`.

## Отношения, FK, уникальность
- FK `organization_id`/`subdivision_id` **RESTRICT** (mixin).
- FK `supplier_id → suppliers.id` без явного ondelete → RESTRICT по умолчанию.
- `lines` — one-to-many, `cascade="all, delete-orphan"` ([[invoice_lines]]).
- **Уникальность:** `uq_invoices_org_external` UNIQUE(`organization_id`, `external_id`) —
  идемпотентность записи в POS (NULL различимы в PG → черновики без
  external_id не конфликтуют).
- **Уникальность:** `uq_invoices_org_idempotency_key` — партиальный UNIQUE(`organization_id`,
  `idempotency_key`) WHERE `idempotency_key IS NOT NULL` ([[LCOS-F43-idempotency]], миграция
  `0014`): один ключ на организацию, строки без ключа не конфликтуют; тот же индекс
  обслуживает look-up повтора.
- **Индекс:** `ix_invoices_org_status`(`organization_id`, `status`).

## Используется фичами
[[LCOS-F8-ocr-recognition]] (OCR → InvoiceDraft), [[LCOS-F9-line-matching]] (матчинг строка↔каталог),
[[LCOS-F10-invoice-status-machine]] (машина статусов + Esupl payload + гейтированная запись), [[LCOS-F11-esupl-read]] (чтение Esupl),
[[LCOS-F43-idempotency]] (серверный Idempotency-Key: ключ+хэш на строке, двухфазный submit).

## Источники
- `mvp.be/app/db/models.py:235-274` (модель `Invoice`), `:61-67` (`InvoiceStatus`)
- [[invoice-status-machine]], [[erp-esupl-integration]], [[architecture]] — data-model
