---
id: LCOS-E3
type: epic
title: Идентичность SKU и moat на цикле обучения
status: built
phase: "Phase 1"
features: ["[[LCOS-F13-sku-identity-resolver]]", "[[LCOS-F14-learning-loop]]", "[[LCOS-F15-sku-catalog]]", "[[LCOS-F16-ingredient-cache]]"]
legacy_refs: [DEC-0011, DEC-0013, DEC-0012, 08 F1.1/F1.2]
sources: [APP_OVERVIEW.md §7 §8 §11, 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md, 01_ARCHITECTURE.md]
updated: 2026-07-09
---

# LCOS-E3 · Идентичность SKU и moat на цикле обучения

**Статус:** built · **Фаза:** Phase 1 · **Тип:** архитектурный moat

## Описание

Двухконтекстная модель идентичности SKU — сердце защитного moat продукта. Разделены две сущности: **мастер-данные ингредиента** (`name`, `unit`, `category` — чужой актив, принадлежит POS; LCOS никогда не является источником истины) и **маппинг** (`source_key` → идентичность — актив LCOS, накапливающийся moat).

Два контекста разрешения:
- **Draft-resolve** (`prepare`, толерантный): payload из локального каталога; хинты (fuzzy / LLM / exact-cache) живут ТОЛЬКО здесь, `pos_ingredient_id` не трогается.
- **Commit-resolve** (`submit` → `_resolve_commit_identities` → Phase 2, **fail-closed**): устойчивый `pos_ingredient_id` берётся **только из `sku_mapping`**, с приоритетом `subdivision → org`, и **только подтверждённая идентичность** (`method=manual` ИЛИ `confirmed_by IS NOT NULL`). Cache / fuzzy / AI на коммите не участвуют. Затем живой запрос к POS; None / mismatch / недоступность → блок + review.

Ключ — составной `(scope_type, scope_id, supplier_external_id, source_key)` — один и тот же текст строки от разных поставщиков может указывать на разные SKU в POS ([[ADR-019]], DEC-0012).

## Цель / ценность

Каждая подтверждённая человеком строка делает следующую накладную от того же поставщика точнее — цикл обучения, который конкурент без истории клиента воспроизвести не может. Это и есть настоящий moat: не OCR (который скопируют), а накопленная, привязанная к арендатору, подтверждённая идентичность.

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F13 | Двухконтекстный резолвер идентичности SKU | ✅ built | [[LCOS-F13-sku-identity-resolver]] |
| LCOS-F14 | Moat маппинга на цикле обучения | ✅ built | [[LCOS-F14-learning-loop]] |
| LCOS-F15 | Каталог SKU и упаковки | ✅ built | [[LCOS-F15-sku-catalog]] |
| LCOS-F16 | Кэш ингредиентов (только draft) | ✅ built | [[LCOS-F16-ingredient-cache]] |

## Ключевые сущности / требования

- Сущности: [[sku_mapping]], [[ingredients]], [[packings]], [[ingredient_cache]], [[invoice_lines]].
- Требования: [[sku-identity-resolver]], [[fail-closed]], [[erp-esupl-integration]].
- Роли: [[member]] (подтверждает идентичность отправкой), [[admin]].

## Гейты

- **DEC-0013 вариант A (ратифицирован):** точное совпадение по кэшу БЕЗ подтверждённого маппинга НЕ авто-коммитит и НЕ авто-создаёт маппинг. Вариант C (авто-создание) был предложен в ТЗ и **отклонён** ([[ADR-018]]).
- **DEC-0012 / [[ADR-019]]:** составной ключ с `supplier_external_id` — иначе идентичные тексты от разных поставщиков коллидируют.
- **[[ADR-020]] persist-then-commit:** подтверждённый маппинг записывается отдельным вызовом `POST /ingredients/mappings` **до** отправки, чтобы он пережил отклонение первой накладной (иначе moat никогда не инициализируется).
- **VER-022 (закрыто):** асимметрия скоупа кэша устранена — на commit-пути кэша нет.
- **`sku_embedding` — мёртвый код:** колонка [[invoice_lines]].`sku_embedding` НЕ используется (нет ANN-индекса, нет провайдера эмбеддингов, нет чтения/записи); заглушка под будущий семантический матчинг, помечена на очистку (backlog DEC-02, статус: open) — см. [[LCOS-F25-deadcode-cleanup]].

## legacy_refs

DEC-0011 / DEC-0013 (вариант A) / DEC-0012 (составной ключ); 08_PHASE1_SPEC F1.1/F1.2 (заменены as-built-дизайном moat).

## Источники

- APP_OVERVIEW.md §7 (двухконтекстная идентичность), §8 (цикл обучения), §11 (модель данных)
- 04_DECISIONS__DEC-0011.md, 04_DECISIONS__DEC-0013.md, 01_ARCHITECTURE.md
- ADR: [[ADR-018]], [[ADR-019]], [[ADR-020]]
