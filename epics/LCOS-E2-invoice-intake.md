---
id: LCOS-E2
type: epic
title: Приём накладных (клин)
status: built
phase: "Phase 1"
features: ["[[LCOS-F8-ocr-recognition]]", "[[LCOS-F9-line-matching]]", "[[LCOS-F10-invoice-status-machine]]", "[[LCOS-F11-esupl-read]]", "[[LCOS-F12-warehouse-target]]"]
legacy_refs: [07 Э0/Э1, plan F1, 08 F0.x]
sources: [APP_OVERVIEW.md §6 §9, 08_PHASE1_SPEC.md §Э0, 07_PHASES.md Э0/Э1]
updated: 2026-07-09
---

# LCOS-E2 · Приём накладных (клин)

**Статус:** built · **Фаза:** Phase 1 · **Тип:** продуктовый клин

## Описание

Первый и основной продуктовый клин: превратить фото бумажной накладной в оприходование товара, записанное в ERP, убрав ручной ввод. Поток: **Фото → распознать (OCR, vision-LLM) → InvoiceDraft → prepare() → submit() → write_invoice()**. `prepare()` выполняется в толерантном draft-контексте (собирает payload из локального каталога; хинты живут только здесь); `submit()` выполняется в fail-closed commit-контексте (арифметика → идентичность → живая валидация POS → статус). Реальная запись в Esupl происходит только при `ERP_WRITE_ENABLED` (по умолчанию OFF → возвращается `prepared`-id без записи).

LCOS — это **точка записи накладных** и read-only по отношению к остальным данным Esupl. Идентичность строки (устойчивый `pos_ingredient_id`) — предмет отдельного эпика [[LCOS-E3-sku-identity]]; данный эпик покрывает сам конвейер и его машину состояний.

## Цель / ценность

Закрыть боль владельца кофейни №1 — ручной ввод накладных и их проведение. Ценность измерима: накладная от известного поставщика проходит путь от фото до `prepared`/`written` за минуты, с участием человека только на подтверждении. Это шаг 1 лестницы рутин и вход в Pilot-Gate ([[ADR-003]]).

## Фичи

| ID | Название | Статус | Ссылка |
|---|---|---|---|
| LCOS-F8 | OCR-распознавание (фото → InvoiceDraft) | ✅ built | [[LCOS-F8-ocr-recognition]] |
| LCOS-F9 | Сопоставление строк с каталогом (draft-resolve) | ✅ built | [[LCOS-F9-line-matching]] |
| LCOS-F10 | Машина состояний накладной + Esupl payload + гейтированная запись | ✅ built | [[LCOS-F10-invoice-status-machine]] |
| LCOS-F11 | Read-интеграция с Esupl | ✅ built | [[LCOS-F11-esupl-read]] |
| LCOS-F12 | Выбор целевого склада | 📝 planned | [[LCOS-F12-warehouse-target]] |

## Ключевые сущности / требования

- Сущности: [[invoices]], [[invoice_lines]], [[ingredients]], [[packings]], [[sku_mapping]], [[suppliers]].
- Требования: [[invoice-status-machine]], [[sku-identity-resolver]], [[erp-esupl-integration]], [[fail-closed]], [[provider-abstraction]].
- Роли: [[member]] (принимает накладную), [[admin]] (настройки подразделения).

## Гейты

- **`ERP_WRITE_ENABLED` = OFF по умолчанию:** конвейер живёт в `prepared`; включение реальной записи — осознанный шаг Customer Zero (07_PHASES §Э0 kill-критерии: «запись падает → конвейер остаётся в prepared, эскалация в Esupl»).
- **`VER-021` durability (открыто, owner-run):** стабильность `pos_ingredient_id` эмпирически не подтверждена; merge остаётся гейтированным — детали в [[LCOS-E5-stabilization]].
- **`S1` read-only (открыто):** подтвердить в браузере, что фильтры `products?id=` / `product_name` соблюдаются; расхождение `/products` vs `/ingredients` задокументировано.
- **Статусы:** `rejected` / `validated` / `prepared` / `written` / `failed` — нормативная машина в [[invoice-status-machine]].

## legacy_refs

07 Э0 (контракт API + разведка) / Э1; plan F1; 08_PHASE1_SPEC F0.x (F0.6 = выбор склада → [[LCOS-F12-warehouse-target]]).

## Источники

- APP_OVERVIEW.md §6 (ключевой поток), §9 (интеграция с Esupl)
- 08_PHASE1_SPEC.md §Э0 (контракты, F0.6), 07_PHASES.md Э0/Э1
- ADR: [[ADR-006]], [[ADR-009]], [[ADR-016]]
