---
id: LCOS-F35
type: feature
title: reorder_point на ingredients
epic: "[[LCOS-E7-stock]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[stock_levels]]"]
requirements: ["[[multitenancy]]", "[[provider-abstraction]]"]
adrs: ["[[ADR-016]]"]
legacy_refs: [07 Э3, "08 F3.2"]
sources: ["07_PHASES.md Э3", "08_PHASE1_SPEC.md F3.2", "mvp.be app/api/v1/routes/ingredients.py", "mvp.be app/services/catalog.py"]
updated: 2026-07-09
---
# LCOS-F35 · reorder_point на ingredients

**Epic:** [[LCOS-E7-stock]] · **Status:** planned · **Phase:** Phase 1

## Описание

Per-ingredient порог пополнения — единственное число, превращающее сырой снапшот остатков в решение. `reorder_point` — nullable колонка `Numeric(14,3)` на `ingredients`; когда `quantity` снапшота падает на уровень порога или ниже, этот ингредиент помечается `is_low` в `GET /stock` и всплывает в блоке списка покупок «Low» на [[LCOS-F36-stock-screen]]. Порог NULL означает «не отслеживается» и никогда не помечается как low.

Значение вводится вручную пока что (Phase 1). Более поздняя фича — «предложить `reorder_point` из фактического потребления» ([[LCOS-F49-reorder-suggestion]], Phase 2) — будет предлагать пороги из истории продаж/потребления, но это явно вне scope здесь.

Механически эта фича маленькая: добавить колонку, экспонировать её на чтении каталога расширением существующей формы `IngredientRef` (а не вводить параллельную Out-схему) и добавить endpoint `PATCH /api/v1/ingredients/{id}` в `routes/ingredients.py` (который сегодня только обслуживает `GET` через `services/catalog.py::list_catalog`). Само вычисление `is_low` живёт в [[LCOS-F34-stock-levels]] `GET /stock`; эта фича владеет значением порога, которое он читает.

## Возможности

- `ingredients.reorder_point` — nullable порог `Numeric(14,3)` на ингредиент, скоупированный собственным scope тенанта ингредиента.
- `PATCH /api/v1/ingredients/{id}` — установить или очистить `reorder_point` ингредиента.
- `reorder_point` добавлен в вывод чтения каталога (`IngredientRef` расширен), так что и каталог, и stock-экран могут его отображать и редактировать.
- Семантика порога: `is_low = quantity <= reorder_point`; порог NULL → никогда не low.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[member]] | Просмотреть порог; может корректировать его inline со stock-экрана. |
| [[admin]] | Задаёт/курирует значения `reorder_point` для ингредиентов subdivision. |
| [[superadmin]] | То же по всем тенантам. |
| [[sqladmin-operator]] | Не участвует. |

Endpoint тенант-скоупирован через активный JWT-контекст (см. [[auth]], [[multitenancy]]); ингредиент можно патчить только в пределах его собственного scope тенанта.

## Задействованные сущности

- [[ingredients]] — получает колонку `reorder_point`; цель PATCH и значение, переносимое в чтение каталога.
- [[stock_levels]] — потребляет `reorder_point` косвенно: `GET /stock` джойнит `quantity` последнего снапшота против порога ингредиента для вычисления `is_low` (владеет [[LCOS-F34-stock-levels]]).

## Зависимости / связи

- **Требования:** [[multitenancy]] (порог и PATCH скоупированы по тенанту), [[provider-abstraction]] (путь чтения каталога без изменений — тот же шов `IngredientRef`, который наполняет ERP-синхронизация каталога).
- **Фичи:** потребляется [[LCOS-F34-stock-levels]] (`is_low` в `GET /stock`) и редактируется из [[LCOS-F36-stock-screen]] (inline-установка порога). Замещается-вперёд [[LCOS-F49-reorder-suggestion]] (предложение, выведенное из потребления, Phase 2). Питает расчёт размера заказа в [[LCOS-F40-ai-order-proposal]].
- **ADR:** [[ADR-016]] (сигнал дефицита определён против этого порога; ручной ввод — гарантированный путь).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Миграция добавляет `ingredients.reorder_point Numeric(14,3)` nullable (по умолчанию NULL = не отслеживается).
- [ ] AC-BE-2. `PATCH /api/v1/ingredients/{id}` устанавливает и очищает `reorder_point`; значение round-trip'ит (сохранено, затем возвращено на чтении).
- [ ] AC-BE-3. Чтение каталога (`services/catalog.py::list_catalog` через `GET /api/v1/ingredients`) включает `reorder_point` расширением `IngredientRef` (без параллельной Out-схемы).
- [ ] AC-BE-4. `is_low` в `GET /stock` корректен во всех четырёх случаях: ниже, выше, равно и NULL-порог (тест с фиксированными количествами).
- [ ] AC-BE-5. Изоляция тенантов: ингредиент можно патчить/читать только в пределах его собственного scope тенанта.

### Frontend
- [ ] AC-FE-1. Stock-таблица рендерит `reorder_point` каждого ингредиента (пусто/прочерк при NULL).
- [ ] AC-FE-2. Порог устанавливается inline из строки ингредиента (вызывает `PATCH /ingredients/{id}`); блок «Low» перевыводится немедленно после изменения.
- [ ] AC-FE-3. Установка порога на ингредиенте с количеством ниже перемещает его в блок «Low»; его очистка (NULL) убирает — проверено против AC [[LCOS-F36-stock-screen]].

## Открытые вопросы / гейты

- **Вручную сейчас, выведено позже** — автоматическое предложение порога из потребления отложено в [[LCOS-F49-reorder-suggestion]] (Phase 2); Phase 1 — только ручной ввод.
- Должен ли `reorder_point` быть per-warehouse (vs per-ingredient) — в Phase 1 не нужно — один subdivision = один основной склад (`Subdivision.esupl_warehouse_id`).

## Источники

- `07_PHASES.md Э3` (`ingredients.reorder_point` ручной ввод).
- `08_PHASE1_SPEC.md F3.2` (колонка + `PATCH /ingredients/{id}` + расширение `IngredientRef` — REQ-1, AC-1).
- `mvp.be/app/api/v1/routes/ingredients.py` (сейчас только GET, 22 строки).
- `mvp.be/app/services/catalog.py` (`list_catalog`).
