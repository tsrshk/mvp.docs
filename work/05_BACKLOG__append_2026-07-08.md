# 05_BACKLOG — append 2026-07-08 (под DEC-0011)

> Merge-инструкция: дописать в `05_BACKLOG`. ID сквозные — при коллизии перенумеровать и поправить ссылки в DEC-0011.

---

## VER-021 — Стабильность `pos_ingredient_id` в Esupl  `[P0 · линчпин DEC-0011]`

**Вопрос.** Является ли `pos_ingredient_id` durable? Конкретно:
- Сохраняется ли ID при edit позиции (переименование, смена `unit`, смена категории)?
- Что происходит при удалении + пересоздании позиции?
- Что происходит при merge/split позиций (если Esupl это умеет)?

**Метод.** Контракт/API Esupl + эмпирическая проверка на тестовом аккаунте (изменить позицию → сверить ID).

**Acceptance.**
- Задокументирован жизненный цикл ID в `01_ARCHITECTURE`.
- Подтверждено: ID durable при edit. Если нет → открыть DEC на альтернативный якорь идентичности; DEC-0011 переходит в Reopened.

**Blocks:** DEC-0011 Phase 2, ALIGN-015.

---

## VER-022 — Scope каталога ингредиентов в Esupl  `[P1]`

**Вопрос.** Каталог ингредиентов per-subdivision или общий на организацию?

**Acceptance.** Scope зафиксирован в `01_ARCHITECTURE`; определено значение по умолчанию для `ingredient_cache.scope_type` (`org` | `subdivision`). Для одной кофейни неблокирующе, но модель уже заложена scope-aware.

---

## ALIGN-014 — READ-seam `ERPProvider` (`list_ingredients`, `get_ingredient`)  `[P0]`

**Что.** Ввести READ-контракт провайдера ERP:
- `list_ingredients(scope) -> [Ingredient]`
- `get_ingredient(pos_ingredient_id) -> Ingredient | None`

Одна реализация (Esupl) за seam. Сейчас интеграция — write-point only; это дыра под F5–F10 и прямой пререк DEC-0011 Phase 2.

**Acceptance.** Seam + Esupl-реализация + integration-тест против sandbox либо зафиксированного контракта. `get_ingredient` возвращает `None` (не бросает fallback) при отсутствии — решение о блокировке принимает commit-путь.

**Blocks:** DEC-0011 Phase 2, F5–F10.

---

## ALIGN-015 — Схема `ingredient_cache` + `sku_mapping` + Alembic migration  `[P0]`

**Что.** Реализовать модель данных DEC-0011: две таблицы, SQLAlchemy 2.0 async, Alembic-миграция, регистрация в SQLAdmin для инспекции.

**Acceptance.**
- `sku_mapping` БЕЗ FK на `ingredient_cache.id` (durable ID only).
- UNIQUE-констрейнты по эскизу DEC-0011.
- Embedding/`pgvector` в этой модели не вводится.
- Проходит `test_mapping_has_no_fk_to_cache`.

**Depends on:** VER-021 (форма якоря), VER-022 (значение scope).

---

## ALIGN-016 — Merge-blocking тесты инвариантов DEC-0011  `[P0]`

**Что.** Реализовать как merge-blocking (по правилу «тесты на архитектурные non-negotiables»):
- `test_cache_rebuild_preserves_mappings`
- `test_commit_blocked_when_pos_unavailable`
- `test_commit_blocked_when_pos_id_missing`
- `test_commit_blocked_on_unit_mismatch`
- `test_matching_resolves_subdivision_before_org`
- `test_mapping_has_no_fk_to_cache`

**Acceptance.** Все зелёные; настроены как блокирующие merge (pytest + testcontainers).

**Depends on:** ALIGN-014, ALIGN-015.

---

## DEFER-016 — Delta-sync / webhooks каталога ингредиентов  `[DEFERRED]`

**Что.** Инкрементальная синхронизация каталога (webhooks / delta polling) вместо TTL + on-open + on-commit.

**Rationale отсрочки.** Customer Zero = сотни позиций, копейки данных. TTL-refresh + refresh при открытии накладной + re-валидация на commit достаточны. Строить сейчас — переусложнение.

**Trigger на пересмотр.** Размер каталога / латентность refresh / жалобы на staleness matching. Реализуется за существующим seam `ERPProvider` без изменения DEC-0011.

---

## DEC-0012 — Правило `source_key`: нормализация и ключ mapping  `[OPEN · решить до массового накопления mappings]`

**Вопрос.** Что именно является ключом `sku_mapping`?
- нормализованный текст строки накладной?
- supplier product code?
- композит `(supplier_id, supplier_product_code)` с fallback на нормализованный текст?

**Почему важно.** Ключ определяет качество и переносимость mapping — то есть целостность moat. Слишком свободный текст → грязный, нестабильный ключ. Supplier code стабильнее, но не всегда доступен (кофейня печатает накладную и вбивает поля вручную). Миграция ключа задним числом, после накопления mappings, — дорогая.

**Предварительная рекомендация к решению.** Ключ = `(supplier_id, normalized_line_description)`; при наличии supplier product code использовать его как приоритетный компонент ключа. Финализировать ДО накопления реальных mappings.

**Acceptance.** Правило нормализации зафиксировано (регистр, пробелы, единицы в тексте, транслитерация) + выбран состав ключа + зафиксировано в DEC и `01_ARCHITECTURE`.
