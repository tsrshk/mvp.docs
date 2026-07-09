---
id: LCOS-F18
type: feature
title: Реестр гибких критериев поставщика (Supplier.criteria JSONB)
epic: "[[LCOS-E4-suppliers]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]"]
adrs: ["[[ADR-017]]"]
legacy_refs: ["08 F2.1 (superseded)", plan F3-B1, "APP §10"]
sources: ["APP_OVERVIEW.md §10", "mvp.be app/domain/supplier_criteria.py", "mvp.be app/api/v1/routes/suppliers.py:49", "mvp.be app/api/v1/schemas.py:48", "mvp.be app/db/models.py:219", "mvp.fe src/pages/suppliers/ui/CriteriaFields.tsx"]
updated: 2026-07-09
---
# LCOS-F18 · Реестр гибких критериев поставщика (Supplier.criteria JSONB)

**Эпик:** [[LCOS-E4-suppliers]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Условия поставки поставщиков разнородны (объём заказа, срок поставки, дни доставки, режим оплаты, отсрочка) и растут со временем. Вместо жёсткой схемы «столбец-на-условие», которая вынуждала бы миграцию под каждый новый термин, LCOS хранит гибкие условия в JSONB-столбце `suppliers.criteria`, тогда как **определения** этих условий живут в типизированном реестре `app/domain/supplier_criteria.py`. Добавление или удаление критерия — это правка одного файла реестра — **без миграции базы данных** (значения живут в JSON, не в столбцах).

Реестр — единственный источник истины, разделяемый обоими слоями: бэкенд валидирует входящие значения против него, а фронтенд отрисовывает **динамическую форму** из тех же определений, отдаваемых через `GET /suppliers/criteria-schema`. Это удерживает набор критериев от расхождения между клиентом и сервером (см. [[supplier-criteria-registry]]).

Это as-built дизайн, который **вытесняет** запланированную side-таблицу `supplier_settings` с фиксированными столбцами из 08_PHASE1_SPEC F2.1 (коллизия #4 плана реструктуризации). Структурные поля карточки (контакты, `min_order_amount`) остаются выделенными столбцами на карточке поставщика ([[LCOS-F17-supplier-cards]]); `criteria` дополняет карточку для более редких/растущих условий. Потребитель этих критериев — скоринг/сравнение поставщиков для планирования заказов (REQ 1b) — это намеренный шов; хранилище значений и валидация построены, потребитель отложен по решению checkpoint.

## Возможности

- Гибкие условия хранятся в `suppliers.criteria` (JSONB, `NOT NULL default {}`, на уровне организации), никогда как ad-hoc столбцы.
- Типизированный реестр `SUPPLIER_CRITERIA` из записей `CriterionDef`: `delivery_volume` (number, единица «ед./партия»), `delivery_lead_days` (days), `delivery_weekdays` (weekdays, 1=Пн…7=Вс), `payment_mode` (choice: `prepay` | `on_delivery` | `deferred`), `payment_deferral_days` (days). Порядок реестра = порядок полей формы.
- `validate_criteria` нормализует любой ввод: **неизвестные ключи молча отбрасываются**, пустые значения опускаются, каждое значение приводится к своему виду критерия; невалидное значение бросает `ValueError` → **422** на API.
- Приведение на вид: `number` (float ≥ 0), `days` (int ≥ 0), `choice` (должно быть в `choices`), `weekdays` (int-ы 1..7, отсортированы + дедуплицированы), `boolean`, `text` (≤ 512 символов).
- `GET /suppliers/criteria-schema` отдаёт реестр (`key`, `label`, `kind`, `unit`, `choices`, `description`) фронтенду; объявлен **перед** `/{supplier_id}`, чтобы путь не был захвачен как id.
- `criteria` протекает через `SupplierCreate` / `SupplierUpdate` / `SupplierOut`; на `PATCH` явный `criteria: null` означает «не трогать» (не ломает flush `NOT NULL`).
- Фронтенд отрисовывает один input на вид критерия из схемы, так что добавление/удаление критерия на стороне сервера не требует **изменений фронтенда**.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Редактирует критерии карточки поставщика внутри своей subdivision (то же право «любой member subdivision», что и CRUD карточки). |
| [[admin]] | То же, внутри subdivision. |
| [[superadmin]] | Межарендаторский доступ. |
| [[sqladmin-operator]] | Не участвует; переключает гейт модуля `suppliers` в плоскости SQLAdmin (см. [[LCOS-F6-module-gates]]). |

Scope арендатора (`organization_id`) приходит из активного контекста JWT; изоляция покрыта тестом (см. [[multitenancy]]).

## Задействованные сущности

- [[suppliers]] — несёт JSONB-столбец `criteria` (`app/db/models.py:219`, `NOT NULL default {}`) рядом со структурными полями карточки; `criteria` со scope организации, как и остальная карточка.

## Зависимости / связи

- **Требования:** [[supplier-criteria-registry]] (нормативный SSOT: определённые реестром ключи/типы, валидация на уровне API, 422 на невалидном / молчаливый отброс неизвестного, нет миграции для добавления критерия), [[multitenancy]] (scope организации + изоляция).
- **Фичи:** [[LCOS-F17-supplier-cards]] (родительский CRUD карточки, несущий `criteria` в create/patch), [[LCOS-F40-ai-order-proposal]] (будущий потребитель — планирование заказов читает критерии через тот же реестр). Структурные условия (`min_order_amount`) — на карточке, не в `criteria`.
- **ADR:** [[ADR-017]] (шов self-service поставщика — настройки, которые поставщик позже редактировал бы, — это именно эти условия).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Реестр `SUPPLIER_CRITERIA` — SSOT ключей критериев, видов и допустимых значений; добавление критерия — правка реестра **без миграции** (значения сохраняются в JSONB).
- [ ] AC-BE-2. `validate_criteria` молча отбрасывает неизвестные ключи, опускает пустые значения и приводит каждое оставшееся значение к своему виду критерия.
- [ ] AC-BE-3. Правила приведения обеспечены: `number` отклоняет отрицательные, `days` отклоняет отрицательные int, `choice` отклоняет значения вне `choices`, `weekdays` отклоняет значения вне 1..7 и возвращает отсортированный/дедуплицированный список; невалидное значение бросает `ValueError` → **422** в API.
- [ ] AC-BE-4. `GET /suppliers/criteria-schema` возвращает реестр, сериализованный как `{key,label,kind,unit,choices,description}`, и объявлен перед `/{supplier_id}`.
- [ ] AC-BE-5. `SupplierOut.criteria` по умолчанию `{}`; `SupplierCreate`/`SupplierUpdate` запускают `validate_criteria` через `field_validator` перед сохранением.
- [ ] AC-BE-6. `PATCH /suppliers/{id}` с `criteria: null` оставляет хранимое значение нетронутым (нет сбоя flush `NOT NULL`); ненулевое значение валидируется и заменяет его.
- [ ] AC-BE-7. Значения сохраняются в JSONB-столбец `suppliers.criteria`, со scope арендатора по `organization_id`.

### Frontend
- [ ] AC-FE-1. RTK-query `getSupplierCriteriaSchema` запрашивает `GET /suppliers/criteria-schema`; форма критериев отрисовывается из этого списка (`CriteriaFields`).
- [ ] AC-FE-2. Каждый вид критерия отрисовывает правильный элемент (input number/days, select choice, weekday toggle picker, boolean, text); добавление/удаление критерия на стороне сервера не требует изменений фронтенда.
- [ ] AC-FE-3. Weekday-picker использует `toggleWeekday` (отсортировано, дедуплицировано); choices показывают человеческие метки (`choiceLabel`), значения форматируются через `formatCriterionValue`.
- [ ] AC-FE-4. Карточка поставщика отображает непустые критерии в **порядке реестра** (`visibleCriteria`), не в порядке ключей объекта.
- [ ] AC-FE-5. Типы критериев фронтенда зеркалят бэкенд (`CriterionKind` = number/days/choice/weekdays/boolean/text); покрыто юнит-тестами (`criteria.test.ts`, `CriteriaFields.test.tsx`).

### Прочее
- [ ] AC-OTHER-1. Аналитика потребителя (REQ 1b — скоринг/сравнение поставщиков для планирования заказов) **не построена**: критерии — только валидированное хранилище + шов; потребитель отложен по решению checkpoint.

## Открытые вопросы / гейты

- **Аналитика потребителя отложена (REQ 1b):** модель критериев существует как шов, но потребитель (сравнение/скоринг, планирование заказов) отложен — критерии сейчас декларативны. Ценность материализуется только когда потребитель ([[LCOS-F40-ai-order-proposal]]) их читает.
- **Соглашение о well-known ключах:** более редкие условия опираются на то, что реестр остаётся единственным задокументированным источником; новые ключи должны добавляться в реестр (не свободной формой), чтобы FE и любой планировщик читали их единообразно.

## Источники

- `APP_OVERVIEW.md §10` (критерии JSONB + реестр, валидация на API, расширение без миграции, потребитель отложен).
- `mvp.be/app/domain/supplier_criteria.py` (`CriterionKind`, `CriterionDef`, `SUPPLIER_CRITERIA`, `validate_criteria`, `criteria_schema`).
- `mvp.be/app/api/v1/routes/suppliers.py:49` (`GET /suppliers/criteria-schema`), `:86` (PATCH `criteria: null` = не трогать).
- `mvp.be/app/api/v1/schemas.py:31` (`SupplierOut.criteria`), `:48`/`:70` (валидаторы `SupplierCreate`/`SupplierUpdate`).
- `mvp.be/app/db/models.py:219` (`suppliers.criteria` JSONB, `NOT NULL default {}`).
- `mvp.fe/src/entities/supplier/api/suppliersApi.ts:16` (`getSupplierCriteriaSchema`), `model/types.ts:52` (`CriterionDef`), `src/pages/suppliers/ui/CriteriaFields.tsx`, `src/pages/suppliers/lib/criteria.ts`.
