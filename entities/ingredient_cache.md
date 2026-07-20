---
id: ingredient_cache
type: entity
title: ingredient_cache — кэш ингредиентов POS (неавторитетный, перестраиваемый)
status: reserved  # схема есть (built), но в runtime не читается/не пишется — см. Назначение
scope: scoped
table: ingredient_cache
pk: id (uuid)
used_by: []  # ни одного runtime read/write; инварианты стерегут тесты (см. ниже)
requirements: ["[[sku-identity-resolver]]"]
sources: [mvp.be/app/db/models.py:432-461, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# ingredient_cache · кэш ингредиентов POS

**Scope:** scope-aware (`scope_type` + `scope_id`: org или subdivision) · **Status:** reserved (схема есть, runtime не подключён)

## Назначение
Кэш данных об ингредиентах POS. **Неавторитетный** и **перестраиваемый** без потери данных
(draft-only, задел [[LCOS-F16-ingredient-cache]]). Ключ области — пара (`scope_type`, `scope_id`), а не
прямой FK на [[organizations]]/[[subdivisions]] (дизайн scope-aware learning-loop).

> **Статус реализации (2026-07-20):** таблица создана миграцией 0004 и модель `IngredientCache`
> существует, но в приложении НЕТ ни одного read/write этого кэша — identity resolver
> ([[sku-identity-resolver]], [[LCOS-F13-sku-identity-resolver]]) читает только [[sku_mapping]] и
> [[ingredients]], а НЕ этот кэш. Это зарезервированная инфраструктура moat-дизайна
> (DEC-0011/DEC-0013): её инварианты — «нет FK от `sku_mapping` на кэш» и «rebuild кэша не
> сиротит мэппинги» — застрахованы тестами (`test_ingredient_cache_invariants.py`,
> merge-gate), но заполнение/чтение будет подключено отдельной задачей. Долговечная
> идентичность и сейчас держится в [[sku_mapping]]/[[invoice_lines]] через `pos_ingredient_id`.

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
Пока НИ ОДНОЙ фичей в runtime (зарезервировано). Задел: [[LCOS-F16-ingredient-cache]]
(кэш ингредиентов, draft-only) — при подключении resolver [[LCOS-F13-sku-identity-resolver]]
сможет брать отсюда кандидатов для матчинга. Сейчас resolver кэш не читает.

## Источники
- `mvp.be/app/db/models.py:432-461` (модель `IngredientCache`)
- [[sku-identity-resolver]], [[architecture]] — data-model
