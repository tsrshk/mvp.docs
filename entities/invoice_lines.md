---
id: invoice_lines
type: entity
title: invoice_lines — строки накладной
status: built
scope: subdivision
table: invoice_lines
pk: id (int)
used_by: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]"]
requirements: ["[[sku-identity-resolver]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:277-300, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# invoice_lines · строки накладной

**Scope:** subdivision (`organization_id` + `subdivision_id`) · **Status:** built

## Назначение
Позиции накладной, полученные из OCR ([[LCOS-F8-ocr-recognition]]) и разрешённые до идентичности POS
([[sku-identity-resolver]], [[LCOS-F13-sku-identity-resolver]]/[[LCOS-F14-learning-loop]]). `pos_ingredient_id` — долговечная
идентичность POS, фиксируемая при commit: снимок [[sku_mapping]].`pos_ingredient_id` в
момент записи; он держит долговечный POS ID, а НЕ кэш, поэтому переживает перестройку
[[ingredient_cache]].

> **DEAD CODE:** колонка `sku_embedding` (`Vector(1536)`) **НЕ ИСПОЛЬЗУЕТСЯ**. Она планировалась
> для семантического мэппинга, который так и не был реализован. Помечена к очистке (backlog **DEC-02**).
> Ни один путь её не читает и не пишет.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `organization_id` | uuid FK | no | граница, RESTRICT, индексируется (mixin) |
| `subdivision_id` | uuid FK | no | RESTRICT, индексируется (mixin) |
| `invoice_id` | int FK→invoices | no | `ondelete="CASCADE"`, индексируется |
| `line_no` | int | no | порядок строки |
| `description` | text | no | сырой текст строки (source_key для матчинга) |
| `sku` | varchar(128) | yes | SKU из документа |
| `quantity` | numeric(14,3) | yes | количество |
| `unit` | varchar(32) | yes | единица |
| `unit_price` | numeric(14,4) | yes | цена за единицу |
| `line_total` | numeric(14,2) | yes | итог строки (арифметическая проверка) |
| `pos_ingredient_id` | varchar(256) | yes | долговечный id POS, снимок при commit; NULL до commit |
| `sku_embedding` | Vector(1536) | yes | **НЕ ИСПОЛЬЗУЕТСЯ / dead-code (DEC-02)** |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `invoice_id → invoices.id` **CASCADE** (удаление накладной удаляет её строки).
- FK `organization_id`/`subdivision_id` **RESTRICT** (mixin).
- Нет UNIQUE-ограничений на строки (порядок задаётся `line_no`).
- `pos_ingredient_id` — не FK на [[ingredient_cache]]; долговечная строка по
  дизайну learning-loop (DEC-0011/DEC-0012, [[ADR-019]]).

## Используется фичами
[[LCOS-F8-ocr-recognition]] (строки OCR), [[LCOS-F9-line-matching]] (матчинг строка↔каталог), [[LCOS-F13-sku-identity-resolver]] (identity
resolver), [[LCOS-F14-learning-loop]] (learning-loop, снимок `pos_ingredient_id` при commit).

## Источники
- `mvp.be/app/db/models.py:277-300` (модель `InvoiceLine`), `:42` (`SKU_EMBEDDING_DIM`)
- [[sku-identity-resolver]], [[architecture]] — data-model
