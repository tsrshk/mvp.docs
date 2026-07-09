---
id: LCOS-F34
type: feature
title: get_stock + снапшоты stock_levels + синхронизация
epic: "[[LCOS-E7-stock]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[stock_levels]]", "[[ingredients]]", "[[subdivisions]]"]
requirements: ["[[erp-esupl-integration]]", "[[provider-abstraction]]", "[[fail-closed]]", "[[multitenancy]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: [07 Э3, "08 F3.1", ADR-016]
sources: ["07_PHASES.md Э3", "08_PHASE1_SPEC.md F3.1", "ADR-016", "mvp.be app/providers/erp/base.py", "mvp.be app/domain/entities.py", "mvp.be app/api/v1/routes/suppliers.py:26"]
updated: 2026-07-09
---
# LCOS-F34 · get_stock + снапшоты stock_levels + синхронизация

**Epic:** [[LCOS-E7-stock]] · **Status:** planned · **Phase:** Phase 1

## Описание

Дата-хребет эпика остатков: способ получить количества ингредиентов по складам, хранить их как снапшоты с временными метками в новой таблице `stock_levels` и обновлять по запросу. Видимость остатков — входной гейт к планированию заказов ([[LCOS-E8-purchasing]]) — без неё «предложи заказ» — это гадание.

Два источника остатков сосуществуют по [[ADR-016]]: **A** — `remains`, вытягиваемые из Esupl через новый метод провайдера `ErpProvider.get_stock()` (`source='esupl'`); **C** — ручной ввод (`source='manual'`, производимый путём корректировки [[LCOS-F36-stock-screen]]). Стратегия сборки — сначала выпустить C как гарантированно работающий путь, затем включить A, когда контракт `remains` эмпирически подтверждён в браузере против реального read-only токена. `stock_levels` — таблица истории (снапшоты, никогда не перезаписываются): последний снапшот на ингредиент побеждает на чтении.

Следуя конвенции переносимости, `stock_levels` несёт `organization_id`, `subdivision_id`, `source` и внешний id склада с первого дня. Триггер ручного обновления (`POST /stock/sync`) зеркалит существующий шов `POST /suppliers/sync` — синхронный, без Celery — резолвя team и токен так же, как это делает синхронизация поставщиков, и матчит возвращённые элементы на `ingredients.esupl_item_id`. Несматченные остатки всплывают как предупреждения, а не молча отбрасываются.

## Возможности

- Шов провайдера `ErpProvider.get_stock(team_id, warehouse_id, api_token) -> list[StockItemRef]` за существующим ERP `Protocol`, с толерантным парсером для неподтверждённых форм поля `remains` (`item_id`/`ingredient_id`, `quantity`/`remains`, `unit`, `warehouse_id`).
- Новый DTO `StockItemRef` в `domain/entities.py` (по образцу родственного `IngredientRef`): внешний id ингредиента, количество, единица, `as_of`.
- Таблица снапшотов `stock_levels` (история): `organization_id`, `subdivision_id`, `ingredient_id` (FK uuid), `warehouse_id` (int), `quantity Numeric(14,3)`, `as_of timestamptz`, `source ('esupl'|'manual')`; уникальность по `(organization_id, ingredient_id, warehouse_id, as_of)`.
- `POST /api/v1/stock/sync` — ручной триггер, который вытягивает `remains`, матчит на `ingredients.esupl_item_id`, пишет один снапшот на сматченный ингредиент и возвращает сводку со счётчиками и предупреждениями о несматченных элементах.
- `GET /api/v1/stock` — последний снапшот на ингредиент для текущего subdivision, каждый с `as_of` и `is_low = quantity <= reorder_point` (false, когда порог NULL — см. [[LCOS-F35-reorder-point]]).
- Таргетинг склада переиспользует `Subdivision.esupl_warehouse_id`, ту же ссылку на склад, что используется для постинга счетов-фактур ([[LCOS-F12-warehouse-target]]) — один справочник складов на всё приложение.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Читать остатки и триггерить обновление в пределах своего subdivision. |
| [[admin]] | То же, что и member, в пределах своего subdivision. |
| [[superadmin]] | Доступ по всем тенантам. |
| [[sqladmin-operator]] | Не в потоке; управляет Esupl-токеном/`ai_provider` в SQLAdmin-плоскости (см. [[LCOS-F3-sqladmin-operator]]). |

Stock-endpoint'ы тенант-скоупированы: `organization_id` / `subdivision_id` берутся из активного JWT-контекста (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[stock_levels]] — новая таблица снапшотов/истории, записываемая этой фичей; читается `GET /stock` (последний на ингредиент) и потребляется [[LCOS-F36-stock-screen]].
- [[ingredients]] — цель матчинга для синхронизации через `esupl_item_id`; несёт `reorder_point`, используемый для вычисления `is_low` (добавляется [[LCOS-F35-reorder-point]]).
- [[subdivisions]] — поставляет `esupl_warehouse_id` (склад для запроса) и скоупирует снапшот.

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (team-scoped read-only доступ к Esupl `remains`), [[provider-abstraction]] (`get_stock` живёт за ERP `Protocol` + реестром), [[fail-closed]] (нет токена → пустой результат + предупреждение, никогда молчаливый прямой вызов), [[multitenancy]] (снапшоты и чтения скоупированы по тенанту).
- **Фичи:** питает [[LCOS-F36-stock-screen]] (список + ручная корректировка) и зависит от [[LCOS-F35-reorder-point]] для вычисления `is_low`. Делит справочник складов с [[LCOS-F12-warehouse-target]]. Ручной (`source='manual'`) путь — гарантированный фоллбэк, который пишет экран. Даунстрим-потребитель: [[LCOS-F40-ai-order-proposal]] в [[LCOS-E8-purchasing]].
- **ADR:** [[ADR-016]] (источник остатков/потребления — стратегия вариантов A + C, kill-триггер при расхождении >50%).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `ErpProvider.get_stock(team_id, warehouse_id, api_token) -> list[StockItemRef]` добавлен в ERP `Protocol` (`providers/erp/base.py`) с толерантным парсером для предполагаемой формы `remains`; `StockItemRef` определён в `domain/entities.py`.
- [ ] AC-BE-2. Миграция `stock_levels` создаёт колонки и уникальность `(organization_id, ingredient_id, warehouse_id, as_of)`; строки — снапшоты (история), никогда не обновляются на месте.
- [ ] AC-BE-3. `POST /api/v1/stock/sync` резолвит team/токен как `POST /suppliers/sync`, использует `Subdivision.esupl_warehouse_id`, матчит `remains` на `ingredients.esupl_item_id`, пишет снапшот на сматченный элемент и возвращает несматченные элементы как предупреждения.
- [ ] AC-BE-4. respx-тест: синхронизация создаёт снапшот; повтор с тем же `as_of` идемпотентен (уникальность держится); несматченные элементы появляются в списке предупреждений.
- [ ] AC-BE-5. `GET /api/v1/stock` возвращает последний снапшот на ингредиент для subdivision, каждый с `as_of` и корректным `is_low` (`quantity <= reorder_point`; false, когда порог NULL).
- [ ] AC-BE-6. Изоляция тенантов stock-endpoint'ов покрыта тестом (тенант никогда не видит снапшоты другого тенанта).
- [ ] AC-BE-7. Fail-closed: без сконфигурированного Esupl-токена синхронизация возвращает пустой/припаркованный результат плюс предупреждение — никакой попытки прямого egress, никакого падения.
- [ ] AC-BE-8 (owner-accepted, отложено). Живая синхронизация: количества и единицы для 5 выборочных ингредиентов совпадают с UI Esupl (гейт включения варианта A).

### Frontend
- [ ] AC-FE-1. Метод шва `PosProvider.listStock()` добавлен в `shared/pos/provider.ts` (рядом с `listSuppliers`/`sendInvoice`), с реализациями `backend` и `mock`, подключёнными через `shared/pos/factory.ts`.
- [ ] AC-FE-2. Вызов `syncStock()` маппится на `POST /stock/sync`; `mock`-провайдер возвращает demo-снапшоты и demo-сводку для разработки без живого токена.
- [ ] AC-FE-3. `listStock()` экспонирует на UI-слой per-ingredient `quantity`, `unit`, `as_of`, `reorder_point` и `is_low` ([[LCOS-F36-stock-screen]] их рендерит).

### Прочее
- [ ] AC-OTHER-1. Вариант A vs C — задокументированный гейт ([[ADR-016]]): C выпускается первым; A включается только после подтверждения контракта `remains` в браузере. Заметка о контракте Э0 (`REMAINS_CONTRACT.md`) — предпосылка — см. [[LCOS-F28-esupl-contracts]].

## Открытые вопросы / гейты

- **Контракт remains не верифицирован вживую** — имена полей и скоупинг склада — предположения до подтверждения в браузере; парсер должен оставаться толерантным ([[ADR-016]], [[LCOS-F28-esupl-contracts]]).
- **Kill-критерий (07 Э3 / ADR-016):** если живые остатки расходятся >50% с реальностью, и inline-фиксы это не лечат, эпик остаётся на ручном (C), а [[LCOS-E8-purchasing]] деградирует до «reorder_point + ручное количество в момент заказа».
- Consumption-as-proxy (вариант B, приход − расход) вне scope здесь — опциональное дополнение в [[LCOS-E8-purchasing]] (путь F44), не блокер.

## Источники

- `07_PHASES.md Э3` (снапшоты + список дефицита, ~30 ч; kill-критерий).
- `08_PHASE1_SPEC.md F3.1` (`get_stock` + `stock_levels` + синхронизация — REQ-1..4, AC-1..3).
- `ADR-016` (источник остатков/потребления: A/B/C, стратегия фоллбэка).
- `mvp.be/app/providers/erp/base.py`, `app/domain/entities.py` (`IngredientRef` — модель DTO).
- `mvp.be/app/api/v1/routes/suppliers.py:26` (паттерн маршрута синхронизации).
- `mvp.be/app/db/models.py` — `Subdivision.esupl_warehouse_id`, `Ingredient.esupl_item_id`.
- `mvp.fe/src/shared/pos/provider.ts`, `shared/pos/providers/{backend,mock}.ts`, `shared/pos/factory.ts` (POS-шов).
