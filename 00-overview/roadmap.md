---
id: OV-ROADMAP
type: overview
title: Roadmap — единый хребет фаз и эпиков
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 2
legacy_refs:
  - 07_PHASES.md (Э0–Э8)
  - plan/00_IMPLEMENTATION_PLAN.md (S1/S2/F3–F10/P2)
  - Local_OS_About.md (F1–F10)
sources:
  - 07_PHASES.md (SSOT product-phases, v1.0.0, verified 2026-07-03)
  - plan/00_IMPLEMENTATION_PLAN.md (SSOT phase-order, v1.0.1)
  - _RESTRUCTURE_PLAN.md (collision resolution 1, single spine)
---

# Roadmap LCOS — единый хребет

> Этот документ **примиряет два расходящихся плана** — `07_PHASES.md` (стадии Э0–Э8) и `plan/00_IMPLEMENTATION_PLAN.md` (стадии S1/S2/F3–F10/P2) — в один хребет поставки, зафиксированный в [[_RESTRUCTURE_PLAN]] (collision 1). Ни один легаси-код не потерян: каждый перенесён в `legacy_refs` своего эпика и в карту трассируемости ниже.

## Единый хребет

Граница фаз — **[[glossary]]** (продукт закрыл боль накладных в нашей собственной кофейне).

- **Фаза 1 — закрыть боль накладных в нашей кофейне = эпики E1–E8.**
  Платформа + клин накладных + SKU identity + suppliers-basic + стабилизация + качество OCR + остатки + закупки. Замкнутая петля «заказ → WhatsApp → приёмка по фото → расхождения → принято».
- **Фаза 2 — рост после Pilot-Gate = эпики E9–E15.**
  Аналитика продаж, локальный контекст, конкуренты, идеи меню, стратегические инсайты, упаковка в SaaS.

Граница взята из `07_PHASES.md` (Фаза 1 = боль накладных + закупки от начала до конца, Фаза 2 = позиционирование/рост), а не из `plan/00` (где F3–F10 сидели в «Фазе 1», а Фаза 2 = только SaaS). SaaS = [[LCOS-E15-saas]]; конкурентное позиционирование = [[LCOS-E11-competitor-menu]] / [[LCOS-E12-competitor-reviews]].

## Фаза 1 — E1–E8 (документирована детально)

| Эпик | Название | Статус | Что поставляет | Ступень лестницы |
|------|----------|--------|----------|------------------|
| [[LCOS-E1-platform]] | Платформа и основания | ✅ | Мультитенантность, auth, config/secrets, швы провайдеров, fail-closed, module gates, FE-платформа | (сквозной) |
| [[LCOS-E2-invoice-intake]] | Приёмка накладных (клин) | ✅ | Фото → OCR → сопоставление → валидация → payload Esupl + гейтированная запись | 1 |
| [[LCOS-E3-sku-identity]] | SKU identity и moat обучающей петли | ✅ | Двухконтекстный resolver, [[sku_mapping]], каталог+packings, [[ingredient_cache]] | 2 |
| [[LCOS-E4-suppliers]] | Справочник поставщиков и условия | 🟡 | CRUD карточек, гибкие критерии (JSONB), история цен + прайс-листы/ассортимент/аналитика (F20/F72–F75 ✅), локальный SSOT (ADR-021); self-service — задел | 3 |
| [[LCOS-E5-stabilization]] | Стабилизация и conformance | 🟡 | DEC-0011/0013/0012, fail-closed шифрование, merge-блокирующие тесты, dead-code-очистка | (сквозной) |
| [[LCOS-E6-ocr-quality]] | Качество захвата OCR | 📝 | Multi-page, контекст в промпте, авто-кроп, confidence gate | 1 |
| [[LCOS-E7-stock]] | Остатки и список «заканчивается» | 📝 | Снапшоты `stock_levels` + синк, `reorder_point`, экран `/stock` | 4 |
| [[LCOS-E8-purchasing]] | Закупки: черновики заказов и замыкание петли | 🟡 | `purchase_orders`, ручные и AI-черновики, текст для WhatsApp, сверка приёмки, живой режим | 4 |

Легенда: ✅ построено · 🟡 частично · 📝 запланировано (Фаза 1, реальный AC есть).

**Критический путь (07_PHASES §6):** Э0 → Э3 → Э4a → Э4b → Э5, т.е. вдоль хребта **E2/API → E7 → E8**. Распараллелено: E5-стабилизация с E2/E3; E4 с E7. Оценка Фазы 1 ≈ 190 ч ≈ 4 месяца при 10–15 ч/неделю.

### → [[glossary]] ←

Критерий перехода Фаза 1 → Фаза 2 (`ADR-003`; исторически **Wife-Gate**, термин заменён нейтральным «Pilot-Gate»): владелец пилотной кофейни (Customer Zero) после **4 недель реального использования** подтверждает «хуже без этого», измеримо экономит **≥3 ч/неделю**, и полный цикл прожит 2 недели без блокнота и без ручного двойного ввода в Esupl. Не пройден — во вторую фазу не переходим.

## Фаза 2 — E9–E15 (лёгкие эпики + заглушки фич)

| Эпик | Название | Статус | Что поставляет |
|------|----------|--------|----------|
| [[LCOS-E9-sales-analytics]] | Аналитика продаж и дайджест | 🔭 | Read-only синк продаж из Esupl, `sales_history`, еженедельный дайджест, подсказка `reorder_point` из потребления |
| [[LCOS-E10-local-context]] | Локальный контекст: погода и события | 🔭 | Провайдер погоды, координаты subdivision, события района, обогащение аномалий |
| [[LCOS-E11-competitor-menu]] | Меню и цены конкурентов | 🔭 | Справочник конкурентов, OCR меню (doc-type menu), сравнение с районом, отчёт о позиционировании |
| [[LCOS-E12-competitor-reviews]] | Отзывы конкурентов | 🔭 | Хранение+ингест отзывов, AI-анализ sentiment/трендов, секция дайджеста |
| [[LCOS-E13-menu-ideas]] | Кросс-рецептурные идеи меню | 🔭 | Идеи новых пунктов из имеющихся ингредиентов + оценка себестоимости |
| [[LCOS-E14-strategic-insights]] | Стратегические инсайты и еженедельный диалог | 🔭 | Еженедельные «3 вопроса», свободный диалог с контекстом всех модулей |
| [[LCOS-E15-saas]] | SaaS (Фаза 2) | 🔭 | Prod-hardening, self-service онбординг, биллинг, второй ERP-коннектор (iiko), масштабирование |

Легенда: 🔭 будущее (заглушка эпика + заглушки фич со ссылками, без детального AC). Оценка Фазы 2 ≈ 105 ч ≈ +2 месяца.

## Карта трассируемости: легаси-коды → LCOS-E#

Ничего из старой нумерации не потеряно — она консолидирована здесь и в `legacy_refs` каждого эпика.

| LCOS-E# | 07_PHASES (Э) | plan/00 (S/F/P) | Local_OS_About (F) | Спецификации / решения |
|---------|---------------|-----------------|--------------------|-----------------|
| E1 Platform | — (сквозные принципы §framework) | G1–G11 (сквозные требования) | Технологии/архитектура | Conformance R1–R9; ADR-004/005/006/007/008/009/010/011/012 |
| E2 Invoice intake | Э0 (API contract), Э1 (частично) | F1 (OCR) | F1 OCR, F2 mapping+receipt | 08 F0.x; ADR-002/016 |
| E3 SKU identity & moat | Э1 (mapping memory) | часть F2 | F2 (learning loop) | 08 F1.1/F1.2; DEC-0011/0013/0012; ADR-018/019/020 |
| E4 Supplier directory | Э2 (supplier settings) | F3 (directory/prices) | F3 directory, F4 comparison | 08 F2.x; ADR-017 (self-service seam) |
| E5 Stabilization | Э1 (P0 debt) | S1 (stabilization) | — | 08 Ф1/F1.x; Conformance Part 2; ALIGN-01/VER-01/DEC-02/DEC-05 |
| E6 OCR capture | (внутри Э5 по журналу) | S2 (OCR quality) | (внутри F1) | plan S2 (multi-page, confidence gate) |
| E7 Stock levels | Э3 (stock) | (в ветке закупок) | — | 08 F3.x; ADR-016 |
| E8 Purchasing | Э4a, Э4b, Э5 (loop closure) | (в ветке закупок) | — | 08 F4.x/F5.x |
| E9 Sales analytics | Э6 (sales history) | F5 (sales analytics) | F5 | plan F5; Q1/Q2/Q3 |
| E10 Local context | — | F6 (local context) | F6 | plan F6; Q4 |
| E11 Competitor menu | Э7, Э8 (menu + report) | F7 (competitor menu) | F7 | plan F7 |
| E12 Competitor reviews | — | F8 (reviews) | F8 | plan F8; Q5 |
| E13 Menu ideas | — | F9 (cross-recipe) | F9 | plan F9 |
| E14 Strategic insights | — | F10 (insights) | F10 | plan F10 |
| E15 SaaS | — | P2 (SaaS outline) | Фаза 2 (для рынка) | plan P2 |

**Заметки о примирении:**
- `07_PHASES` отнёс Э6–Э8 (история продаж + конкуренты) к своей «Фазе 2» — хребет это сохраняет (E9, E11). Остатки/заказы (Э3/Э4/Э5) были в Фазе 1 в `07_PHASES` → E7/E8 остаются в Фазе 1 хребта.
- `plan/00` считал F3–F10 частью Фазы 1, при этом Фаза 2 = только SaaS. Хребет **сдвигает границу на Pilot-Gate**: после того, как боль накладных+закупок закрыта. Аналитика/конкуренты/SaaS = Фаза 2.
- Стадии `plan/00` `F3`/`F4` (поставщики + сравнение цен) свёрнуты в единый эпик [[LCOS-E4-suppliers]]; сравнение цен — одна из его будущих фич.
- Коллизия «F» (plan F1–F10 vs 08 F0.1–F5.3 vs routine-steps стратегии) разрешена: все заменены на `LCOS-F#`, легаси только в `legacy_refs` (см. [[_RESTRUCTURE_PLAN]] collision 3).

## Зависимости (as-planned)

```
Phase 1: E1 (foundation, ready)
  → E2 (the invoice wedge) ─┬→ E3 (identity/moat)   [both built]
                            └→ E4 (suppliers)
  E5 (stabilization) — in parallel, fixes the principles + the test base
  E6 (OCR quality) — per the live-use journal (inside/after E2)
  E2 → E7 (stock) → E8 (purchasing: draft → AI draft → loop closure)
  ────────────── PILOT-GATE ──────────────
Phase 2: E9 (sales) → E10 (context)
        E11 (competitor menu) → E12 (reviews)
        E9+E11 → E13 (menu ideas)
        everything → E14 (insights) → E15 (SaaS)
```

## Сознательно НЕ в этих фазах

Авто-отправка заказов и любая запись в Esupl кроме гейтированного [[glossary]] `write_invoice`; прогнозирование спроса (ручные пороги + подсказки из истории); `supplier_prices`/ценовые алерты до E4-future; портал поставщика (только placeholder в схеме, `ADR-017`); Celery/APScheduler (в Фазе 1 всё запускается кнопкой); embeddings/pgvector-сопоставление (колонка `sku_embedding` не используется, backlog `DEC-02`). Полный список — [[product]] §5 dev stop-list.

## Связанные документы

- [[product]] — идентичность и стратегия (лестница рутин ↔ эпики)
- [[architecture]] — as-built реализация
- [[MOC]] — карта содержимого · [[index]] — журнал решений
- [[glossary]] · [[global-requirements]] (R1–R9)

## Sources

- `07_PHASES.md` v1.0.0 — стадии Э0–Э8, критический путь §6, развилки §7.
- `plan/00_IMPLEMENTATION_PLAN.md` v1.0.1 — стадии S1/S2/F3–F10/P2, сквозные G1–G11, определение Pilot-Gate §2.
- `_RESTRUCTURE_PLAN.md` — collision resolution 1/2/3, карта Epic→Feature ID.
