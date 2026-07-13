---
id: price_list_upload
type: entity
title: price_list_upload — загруженный прайс/фото/сообщение поставщика + метаданные и версия
status: built
scope: org
table: price_list_uploads
pk: id (int)
used_by: ["[[LCOS-F72-supplier-price-list-upload]]", "[[LCOS-F73-price-list-parsing]]"]
requirements: ["[[erp-esupl-integration]]", "[[multitenancy]]"]
adrs: ["[[ADR-021]]"]
sources: [entities/price_list_upload.md, LCOS-E4-suppliers]
updated: 2026-07-13
---
# price_list_uploads · загрузка прайса поставщика

**Scope:** org (несёт `organization_id`, привязана к [[suppliers]]) · **Status:** built

## Назначение
Загруженный внутренним пользователем документ прайс-листа поставщика вместе с метаданными:
исходный файл/фото/буклет или вставленный текст сообщения, форма входа (`source_kind`),
дата вступления в силу, статус парсинга и общая уверенность, а также монотонная **версия**
прайса на пару (`organization_id`, `supplier_id`). Любой вход прогоняется через полный
парсинг/OCR ([[LCOS-F73-price-list-parsing]]); строки с низкой уверенностью помечаются
`needs_review` и дочищаются вручную, не блокируя загрузку. Одна загрузка порождает набор
позиций [[price_list_line]] (append-only). Дата наблюдения цены (`observed_at`) в строках
берётся из `effective_date`, а при NULL — из даты загрузки (драйвер freshness).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | |
| `organization_id` | uuid FK→organizations | no | **RESTRICT**, граница изоляции, индексируется |
| `supplier_id` | int FK→suppliers.id | no | **CASCADE** |
| `source_kind` | varchar | no | enum: `price_file` / `photo` / `booklet` / `message` — форма входа |
| `mime_type` | varchar(128) | yes | |
| `original_filename` | varchar(512) | yes | |
| `storage_ref` | varchar(1024) | yes | ключ/путь к сохранённому файлу/фото |
| `raw_text` | text | yes | для входа-сообщения / вставленного текста |
| `effective_date` | date | yes | с какой даты прайс действует; при NULL freshness берёт дату загрузки |
| `status` | varchar | no | enum: `uploaded` / `parsing` / `parsed` / `needs_review` / `failed` |
| `parse_provider` | varchar(64) | yes | |
| `parse_confidence` | numeric(5,4) | yes | общая уверенность парсинга (точность как у `sku_mapping.confidence`) |
| `parse_error` | text | yes | заполняется при `status=failed` (причина: `empty` / `too_large` / OCR-ошибка) |
| `version` | int | no | монотонная версия прайса на (`organization_id`, `supplier_id`); **UNIQUE**(org, supplier, version) |
| `uploaded_by` | uuid FK→users.id | yes | **SET NULL** |
| `note` | varchar(1024) | yes | |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `organization_id → organizations.id` **RESTRICT** — граница тенант-изоляции, индексируется.
- FK `supplier_id → suppliers.id` **CASCADE** — удаление поставщика удаляет его загрузки прайсов.
- FK `uploaded_by → users.id` **SET NULL** — удаление пользователя не ломает загрузку.
- **One-to-many** к [[price_list_line]] (`price_list_line.price_list_upload_id → price_list_uploads.id` **CASCADE**).
- **Индексы:** (`organization_id`, `supplier_id`); **UNIQUE**(`organization_id`, `supplier_id`, `version`) — закрывает гонку параллельных загрузок.
- **Версионирование:** `version` монотонно растёт на пару (`organization_id`, `supplier_id`); версии append-only (новая загрузка = новая версия, старые не перезаписываются).

## Используется фичами
[[LCOS-F72-supplier-price-list-upload]] (загрузка документа/фото/сообщения, хранение + метаданные, версия, триггер парсинга), [[LCOS-F73-price-list-parsing]] (парсинг загрузки → [[price_list_line]], confidence-gate `needs_review`, проекция в `supplier_prices`).

## Источники
- [[ARCH-SUPPLIER-PRICELISTS]] §1.2 — SSOT схемы `price_list_uploads`
- Дизайн-спек эпика [[LCOS-E4-suppliers]] (схема данных `price_list_uploads`)
- [[ADR-021]] (локальный SSOT поставщика)
