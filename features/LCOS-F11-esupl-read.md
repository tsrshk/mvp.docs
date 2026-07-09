---
id: LCOS-F11
type: feature
title: Read-интеграция с Esupl
epic: "[[LCOS-E2-invoice-intake]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[integration_credentials]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[erp-esupl-integration]]", "[[fail-closed]]", "[[provider-abstraction]]", "[[vpn-egress]]"]
adrs: ["[[ADR-004]]", "[[ADR-008]]", "[[ADR-006]]", "[[ADR-009]]"]
legacy_refs: [07 Э0, "08 F0.3", plan F1]
sources: ["APP_OVERVIEW.md §9", "08_PHASE1_SPEC.md F0.3", "mvp.be app/providers/erp/esupl.py:80", "mvp.be app/providers/erp/esupl.py:230", "mvp.be app/api/v1/routes/invoices.py:72"]
updated: 2026-07-09
---
# LCOS-F11 · Read-интеграция с Esupl
**Эпик:** [[LCOS-E2-invoice-intake]] · **Статус:** built · **Фаза:** Phase 1

## Описание

LCOS — точка записи для чеков, но **только для чтения** для всего остального в Esupl. F11 — read-поверхность единственного ERP-провайдера (`EsuplErpProvider`): team-scoped GET-вызовы, которые тянут поставщиков, каталожные позиции, отдельные ингредиенты (для валидации коммита) и запостенные инвойсы, плюс маршрут `GET /invoices`, который отображает заказы Esupl в форму фронтенда. Это опорная линия данных, против которой матчит [[LCOS-F9-line-matching]] и против которой валидирует [[LCOS-F10-invoice-status-machine]] (APP_OVERVIEW §9).

Каждое чтение team-scoped и требует Bearer-токен **арендатора**, разрешаемый вызывающим (per-org, из [[integration_credentials]]). Нет глобального/env-фолбэка токена: без токена Esupl отвечает 401 — [[fail-closed]] по замыслу (`_auth_headers` не возвращает заголовок `Authorization`, так что запрос уходит неаутентифицированным и Esupl его отклоняет). Все GET-ы проходят через один egress-хелпер (`_get`): он строит URL из `esupl_api_base`, позволяет `httpx` url-кодировать параметры, применяет VPN-guard (`requires_vpn=False` — Esupl сегодня достижим напрямую, статический шов, который может переключиться на VPN-only) и делает `raise_for_status()`, так что HTTP/сетевые ошибки распространяются, а не глотаются. Ответы разворачиваются толерантно (голый список или `{"data": […]}`), потому что зеркало API-доки не даёт тел ответов, а реальные формы подтверждаются в браузере.

Четыре чтения отображаются на реальные endpoints: поставщики = `GET /teams/{id}/following?is_virtual=1` (команды, за которыми следит наша команда — это наши поставщики), каталог = `GET /teams/{id}/products` (серверный поиск `product_name` LIKE), отдельная позиция = `GET /teams/{id}/products?id=` (строгое совпадение точного id, без фолбэка `items[0]` — используется на fail-closed пути коммита, чтобы сбой POS не мог быть ошибочно помечен «не найдено»), и инвойсы = `GET /teams/{id}/orders`. Маршрут `GET /invoices` читает заказы и нормализует каждый в `PosOrderOut`, выводя `is_submitted` из `status == 8` и `is_paid` из `payment_status == 2`, и толерируя заказы без `team_to` (sentinel id поставщика `0`, так что один заказ без поставщика не может обрушить 500 весь список).

## Возможности

- `list_suppliers(team_id, token)` — `GET /teams/{id}/following?is_virtual=1` → `SupplierRef` (external_id, name, tax_id/unp); базовый URL не настроен → пустой список + предупреждение.
- `list_ingredients(team_id, token, query)` — `GET /teams/{id}/products` с `fields=id,name,unit`; опциональный `query` → серверный `product_name` LIKE (`operator[product_name]=like`).
- `get_ingredient(team_id, pos_ingredient_id, token)` — `GET /teams/{id}/products?id=`; **строгое** совпадение точного id, иначе `None` (никогда `items[0]`); сетевые/5xx/VPN-ошибки распространяются (используется валидацией коммита).
- `validate_ingredient_on_commit(...)` — проверка существования + совпадения единиц, возвращающая `{valid, ingredient, error}`; толерантна к пустой единице (блокирует только когда обе единицы установлены и различаются, нормализовано по регистру/пробелам); timeout/OSError → fail-closed invalid.
- `list_invoices(team_id, token, per_page, page)` — `GET /teams/{id}/orders` с `include=team_to`, пагинация через `per_page`/`page`.
- Маршрут `GET /api/v1/invoices` — отображает заказы Esupl → `PosOrderOut`: `is_submitted = status==8`, `is_paid = payment_status==2`, толерантная обработка `team_to`/даты/итога; организация без `esupl_team_id` → пустой список.
- Единый SSOT доступа `get_esupl_access(session, org_id) → (team_id, token)`, используемый четырьмя точками вызова чтения (список/синхронизация поставщиков, каталог, инвойсы, валидация коммита).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Видит список поставщиков арендатора, каталог и запостенные инвойсы, вытянутые из Esupl, внутри своей subdivision. |
| [[admin]] | То же, что member; триггерит синхронизацию поставщиков/каталога для subdivision. |
| [[superadmin]] | Все арендаторы; управляет per-org токеном Esupl, который авторизует чтения. |
| [[sqladmin-operator]] | Не в потоке; хранит/ротирует токен Esupl в `integration_credentials` через плоскость SQLAdmin ([[LCOS-F3-sqladmin-operator]]). |

Чтения со scope арендатора: `team_id` выводится из `Organization.esupl_team_id` для активного контекста организации (см. [[auth]], [[multitenancy]]).

## Задействованные сущности

- [[suppliers]] — зеркало Esupl `following`; `list_suppliers` питает справочник поставщиков ([[LCOS-F17-supplier-cards]]).
- [[ingredients]] — зеркало каталога; `list_ingredients`/`get_ingredient` обеспечивают матчинг и валидацию коммита.
- [[invoices]] — `list_invoices` + `GET /invoices` представляют запостенные заказы Esupl (`PosOrderOut`).
- [[integration_credentials]] — per-org Bearer-токен Esupl (Fernet); разрешается вызывающим, никогда env.
- [[organizations]] — `esupl_team_id` (org ↔ ровно одна команда Esupl, [[ADR-004]]).
- [[subdivisions]] — `esupl_warehouse_id` (subdivision ↔ склад, [[ADR-008]]), используется с семейством чтений по складу.

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (контракт endpoints + позиция только-чтения), [[fail-closed]] (нет-токена → 401, POS недоступен распространяется как честный блок), [[provider-abstraction]] (единственная реализация `esupl` за ERP-`Protocol` — [[ADR-009]]), [[vpn-egress]] (шов `requires_vpn` + `guard_vpn`).
- **Фичи:** питает [[LCOS-F9-line-matching]] (каталог) и [[LCOS-F10-invoice-status-machine]] (валидация коммита + запись); потребитель синхронизации поставщиков — [[LCOS-F17-supplier-cards]]; чтения по складу расширяются [[LCOS-F12-warehouse-target]]; фикс путей, сделавший эти чтения реальными — legacy 08 F0.3 → [[LCOS-F28-esupl-contracts]].
- **ADR / решения:** [[ADR-004]] (org ↔ команда), [[ADR-008]] (subdivision ↔ склад), [[ADR-006]] (fail-closed egress), [[ADR-009]] (одна ERP-реализация).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `list_suppliers` вызывает `GET /teams/{id}/following?is_virtual=1` и отображает в `SupplierRef`; ненастроенный базовый URL → `[]` + предупреждение.
- [ ] AC-BE-2. `list_ingredients` вызывает `GET /teams/{id}/products`; непустой `query` добавляет `product_name` + `operator[product_name]=like` (серверный поиск).
- [ ] AC-BE-3. `get_ingredient` возвращает только совпадение точного `id`, иначе `None`; никогда не откатывается к `items[0]`; сетевые/5xx/VPN-ошибки распространяются (не глотаются как None).
- [ ] AC-BE-4. `validate_ingredient_on_commit` блокирует на несовпадении единиц только когда обе единицы установлены и различаются (нормализовано), и возвращает fail-closed invalid при timeout/сетевой ошибке.
- [ ] AC-BE-5. `list_invoices` вызывает `GET /teams/{id}/orders` с `include=team_to` и учитывает `per_page`/`page`.
- [ ] AC-BE-6. `GET /api/v1/invoices` отображает заказы в `PosOrderOut` с `is_submitted = status==8`, `is_paid = payment_status==2`, толерирует отсутствующий `team_to` (id поставщика `0`) и возвращает `[]`, когда у организации нет `esupl_team_id`.
- [ ] AC-BE-7. Каждое чтение требует per-org Bearer-токен (через `get_esupl_access`); нет токена → неаутентифицированный запрос → Esupl 401 (нет env-фолбэка); токены никогда не логируются.
- [ ] AC-BE-8. Все GET-ы маршрутизируются через единый egress-хелпер `_get` (построение URL, кодирование параметров `httpx`, `guard_vpn`, `raise_for_status`) и толерантно разворачивают list-или-`{data:[]}`.

### Frontend
- [ ] AC-FE-1. Список инвойсов отрисовывает `PosOrderOut` (номер, дата доставки, поставщик, итог, бейджи submitted/paid) из `GET /invoices`.
- [ ] AC-FE-2. Организация без настроенной команды Esupl показывает пустое состояние, а не ошибку.
- [ ] AC-FE-3. Данные поставщиков/каталога, всплывшие из чтений Esupl, только-для-чтения в UI (LCOS никогда не редактирует master-данные Esupl).

## Открытые вопросы / гейты

- **`S1` только-чтение (открыто):** подтвердить в браузере, что фильтры `products?id=` и `product_name` действительно учитываются; расхождение endpoint-ов `/products?id=` (код) vs `/ingredients/{id}` (проба) задокументировано.
- **`VER-021` долговечность (открыто, запуск владельцем):** стабильность `pos_ingredient_id` при edit/delete-recreate эмпирически не подтверждена; чтение отражает, не чинит — см. [[LCOS-E5-stabilization]].
- Формы ответов разбираются толерантно до живого подтверждения на команде 17957 (08 F0.3 AC-3).

## Источники

- `APP_OVERVIEW.md §9` (реальные endpoints, токен на чтение, SSOT `get_esupl_access`).
- `08_PHASE1_SPEC.md F0.3` (фикс team-scoped путей; нет-токена → `[]` + предупреждение; пагинация).
- `mvp.be/app/providers/erp/esupl.py:80` (`list_suppliers`), `:104` (`list_ingredients`), `:123` (`get_ingredient` строгое совпадение), `:154` (`validate_ingredient_on_commit`), `:230` (`list_invoices`), `:53` (egress-хелпер `_get`), `:286` (`_auth_headers` нет-токена → 401).
- `mvp.be/app/api/v1/routes/invoices.py:72` (`GET /invoices` → `PosOrderOut`, семантика status/payment).
