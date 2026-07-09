---
id: ingredient_cache
type: entity
title: ingredient_cache — кэш ингредиентов POS (неавторитетный, перестраиваемый)
status: built
scope: scoped
table: ingredient_cache
pk: id (uuid)
used_by: ["[[LCOS-F16-ingredient-cache]]", "[[LCOS-F13-sku-identity-resolver]]"]
requirements: ["[[sku-identity-resolver]]"]
sources: [mvp.be/app/db/models.py:432-461, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# ingredient_cache · кэш ингредиентов POS

**Scope:** scope-aware (`scope_type` + `scope_id`: org или subdivision) · **Status:** built

## Назначение
Кэш данных об ингредиентах POS. **Неавторитетный** и **перестраиваемый** без потери данных
(draft-only, [[LCOS-F16-ingredient-cache]]). Ключ области — пара (`scope_type`, `scope_id`), а не
прямой FK на [[organizations]]/[[subdivisions]] (дизайн scope-aware learning-loop). Identity
resolver ([[sku-identity-resolver]], [[LCOS-F13-sku-identity-resolver]]) читает кэш ради подсказок для матчинга,
но долговечная идентичность держится в [[sku_mapping]]/[[invoice_lines]] через `pos_ingredient_id`,
так что перестройка кэша не делает мэппинги сиротами.

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `scope_type` | varchar(32) | no | `org` / `subdivision` (как строка, не enum) |
| `scope_id` | uuid | no | индексируется; id организации или subdivision |
| `pos_ingredient_id` | varchar(256) | no | долговечный id POS |
| `name` | varchar(512) | yes | название из POS |
| `unit` | varchar(32) | yes | единица |
| `category` | varchar(256) | yes | категория POS |
| `pos_version` | varchar(128) | yes | версия записи в POS |
| `content_hash` | varchar(128) | yes | хэш содержимого (детекция изменений при синхронизации) |
| `is_active` | boolean | no | default true |
| `synced_at` | timestamptz | yes | момент последней синхронизации |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- **Нет FK** на organizations/subdivisions — область задаётся парой (`scope_type`,
  `scope_id`) ради гибкости и перестройки.
- **Уникальность:** `uq_ingredient_cache_scope_pos_id` UNIQUE(`scope_type`, `scope_id`,
  `pos_ingredient_id`).
- **Индекс:** `scope_id` индексируется.

## Используется фичами
[[LCOS-F16-ingredient-cache]] (кэш ингредиентов, draft-only), [[LCOS-F13-sku-identity-resolver]] (resolver: источник кандидатов
для матчинга строк).

## Источники
- `mvp.be/app/db/models.py:432-461` (модель `IngredientCache`)
- [[sku-identity-resolver]], [[architecture]] — data-model
