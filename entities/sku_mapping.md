---
id: sku_mapping
type: entity
title: sku_mapping — долговечный мэппинг source_key → ингредиент POS (moat learning-loop)
status: built
scope: scoped
table: sku_mapping
pk: id (uuid)
used_by: ["[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]"]
adrs: ["[[ADR-019]]", "[[ADR-020]]"]
sources: [mvp.be/app/db/models.py (SkuMapping), __DEC-0011, __DEC-0013]
updated: 2026-07-09
---
# sku_mapping · moat learning-loop

**Scope:** scope-aware (`scope_type` + `scope_id`) · **Status:** built

## Назначение
Мэппинг сырого текста строки накладной (`source_key`) на **долговечный id ингредиента POS**.
Ядро moat learning-loop ([[LCOS-E3-sku-identity]], [[LCOS-F14-learning-loop]]): каждый подтверждённый матч
переиспользуется. `pos_ingredient_id` — долговечная POS-строка **без FK** на
[[ingredient_cache]], так что перестройка кэша не делает мэппинги сиротами
(DEC-0011/DEC-0013, [[ADR-019]]/[[ADR-020]]).

**DEC-0012 (ADR-019):** поставщик — часть ключа. Один и тот же сырой текст от РАЗНЫХ
поставщиков может маппиться на РАЗНЫЕ SKU POS — без `supplier_external_id` в ключе это
UNIQUE-коллизия. `''` = supplier-agnostic/legacy.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope_type` | varchar(32) | no | `org` / `subdivision` (как строка) |
| `scope_id` | uuid | no | индексируется |
| `source_key` | varchar(512) | no | сырой текст строки (нормализованный) |
| `supplier_external_id` | varchar(256) | no | server_default `''`; долговечный id поставщика Esupl |
| `pos_ingredient_id` | varchar(256) | no | долговечный id POS (НЕ FK) |
| `method` | enum `mapping_method` | no | `manual` / `fuzzy` / `ai` |
| `confidence` | numeric(5,4) | yes | оценка матча |
| `confirmed_by` | uuid FK→users | yes | `ondelete="SET NULL"` |
| `confirmed_at` | timestamptz | yes | момент подтверждения |
| `packing` | numeric(12,4) | yes | обученный коэффициент фасовки по (supplier, source_key) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Составной ключ / уникальность
- **Составной UNIQUE:** `uq_sku_mapping_scope_supplier_source` UNIQUE(**`scope_type`,
  `scope_id`, `supplier_external_id`, `source_key`**) — идентичность мэппинга. Именно
  поставщик в ключе разделяет одинаковый текст от разных поставщиков.
- **Нет FK** `pos_ingredient_id → ingredient_cache` (по дизайну — rebuild-safe).
- FK `confirmed_by → users.id` **SET NULL** (удаление пользователя не ломает мэппинг).
- **Индекс:** `scope_id` индексируется.

## Заметки о поведении
- `packing` **не читается** fail-closed commit-резолвером ([[fail-closed]]); но при
  автозаполнении FE восстанавливает его в строку, и он множится в количество, фактически
  отправляемое в POS → некорректное значение — проблема качества данных, а не косметика.
- Nullable `packing`: legacy/identity-only мэппинги без фасовки.

## Используется фичами
[[LCOS-F13-sku-identity-resolver]] (identity resolver читает мэппинги), [[LCOS-F14-learning-loop]] (learning-loop:
запись/подтверждение, долговечный moat).

## Источники
- `mvp.be/app/db/models.py` (модель `SkuMapping` и enum `MappingMethod`)
- [[ADR-019]], [[ADR-020]], DEC-0011/DEC-0013, [[sku-identity-resolver]]
