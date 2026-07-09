---
id: LCOS-E5
type: epic
title: Стабилизация и соответствие
status: partial
phase: "Phase 1"
features: ["[[LCOS-F22-sku-stabilization]]", "[[LCOS-F23-failclosed-encryption]]", "[[LCOS-F24-merge-gate-tests]]", "[[LCOS-F25-deadcode-cleanup]]", "[[LCOS-F26-multipage-fix]]", "[[LCOS-F27-receipts-rename]]", "[[LCOS-F28-esupl-contracts]]"]
legacy_refs: [plan S1, 08 Э1/F1.x, Conformance Part 2]
sources: [APP_OVERVIEW.md §12 §13, TZ__STABILIZATION_2026-07-09__ALIGNED.md, VER-021_ESUPL_DURABILITY_TEST.md, 05_BACKLOG.md]
updated: 2026-07-09
---

# LCOS-E5 · Стабилизация и соответствие

**Статус:** 🟡 partial · **Фаза:** Phase 1

## Описание

Технический долг и качество, необходимые для перевода конвейера накладных в продакшн-режим. Сюда входят ратификация двухконтекстной идентичности (DEC-0011/0013 вариант A, DEC-0012 составной ключ), fail-closed-шифрование (ALIGN-01), набор merge-блокирующих non-negotiable-тестов (VER-01), очистка мёртвого кода (включая неиспользуемый `sku_embedding`), промежуточный фикс молчаливой потери многостраничных накладных, FE-переименование `entities/order → receipts` (убирает коллизию до появления заказов на закупку) и документирование контрактов Esupl (Э0).

Это «мост» между построенным клином и его продакшн-использованием — бо́льшая часть уже сделана и верифицирована (209 BE / 43 FE тестов зелёные на реальном Postgres), но остаются открытые гейтированные пункты (VER-021, S1).

## Цель / ценность

Довести систему до состояния, когда Customer Zero включает `ERP_WRITE_ENABLED` и полагается на конвейер ежедневно, без риска молчаливой потери данных, утечки секретов или регрессии инвариантов. Соответствие R1–R9 → [[global-requirements]].

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F22 | Стабилизация идентичности SKU (DEC-0011/0013/0012) | ✅ built | [[LCOS-F22-sku-stabilization]] |
| LCOS-F23 | Fail-closed-шифрование (ALIGN-01) | 📝 planned | [[LCOS-F23-failclosed-encryption]] |
| LCOS-F24 | Merge-блокирующие non-negotiable-тесты (VER-01) | 🟡 partial | [[LCOS-F24-merge-gate-tests]] |
| LCOS-F25 | Очистка мёртвого кода / швов | 📝 planned | [[LCOS-F25-deadcode-cleanup]] |
| LCOS-F26 | Промежуточный фикс молчаливой потери многостраничных | 📝 planned | [[LCOS-F26-multipage-fix]] |
| LCOS-F27 | Переименование entities/order → receipts | 📝 planned | [[LCOS-F27-receipts-rename]] |
| LCOS-F28 | Контракты Esupl API (Э0) | 📝 planned | [[LCOS-F28-esupl-contracts]] |

## Ключевые сущности / требования

- Сущности: [[sku_mapping]], [[ingredient_cache]], [[integration_credentials]], [[invoice_lines]].
- Требования: [[fail-closed]], [[secret-encryption]], [[sku-identity-resolver]], [[erp-esupl-integration]], [[global-requirements]].
- Роли: [[admin]], [[sqladmin-operator]].

## Гейты

- **`VER-021` durability (OPEN, owner-run):** стабилен ли `pos_ingredient_id` при edit / delete-recreate — эмпирически НЕ подтверждено; проба требует WRITE в песочницу → owner-run, не может быть закрыта в read-only. **Merge остаётся гейтированным.** См. [[VER-021_ESUPL_DURABILITY_TEST]].
- **`S1` read-only (OPEN):** подтвердить, что фильтры `products?id=` / `product_name` соблюдаются; расхождение эндпоинтов `/products?id=` (код) vs `/ingredients/{id}` (проба) задокументировано.
- **DEC-0013 вариант A** ратифицирован, вариант C отклонён ([[ADR-018]]).
- **merge_gate marker:** 17 тестов durable-id + DEC-0013; на данный момент 209 BE / 43 FE зелёные.
- **backlog DEC-02:** удалить `sku_embedding` (статус: open).

## legacy_refs

plan S1 (стабилизация); 08_PHASE1_SPEC Э1 / F1.x; LCOS_Conformance Part 2; backlog DEC-02/DEC-05/ALIGN-01/VER-01.

## Источники

- APP_OVERVIEW.md §12 (тестирование), §13 (состояние/открытые пункты)
- TZ__STABILIZATION_2026-07-09__ALIGNED.md (согласованный merge-gate)
- VER-021_ESUPL_DURABILITY_TEST.md, 05_BACKLOG.md
- ADR: [[ADR-018]], [[ADR-019]], [[ADR-020]]
