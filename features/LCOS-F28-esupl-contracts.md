---
id: LCOS-F28
type: feature
title: Контракты Esupl API (Э0)
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin, admin]
entities: ["[[suppliers]]", "[[ingredients]]", "[[invoices]]", "[[sku_mapping]]", "[[integration_credentials]]"]
requirements: ["[[erp-esupl-integration]]", "[[fail-closed]]", "[[sku-identity-resolver]]"]
adrs: ["[[DEC-0011]]", "[[DEC-0013]]"]
legacy_refs: [08 Э0 F0.1 F0.2 F0.3, plan S1, TZ__STABILIZATION S0/S1/S1-GATE, VER-021]
sources: ["TZ__STABILIZATION_2026-07-09__ALIGNED.md S0/S1/S1-GATE/S9", "APP_OVERVIEW.md §9 §13", "VER-021_ESUPL_DURABILITY_TEST.md", "08_PHASE1_SPEC.md F0.3", "mvp.be app/providers/erp/esupl.py:4", "reference/esupl-api"]
updated: 2026-07-09
---
# LCOS-F28 · Контракты Esupl API (Э0)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Описание

Весь клин зависит от того, что Esupl (POS) API ведёт себя так, как предполагает commit-резолвер. Эта фича — read-only верификация контракта, которая снижает риск интеграции: подтвердить, что endpoint'ы, на которые опирается код, действительно фильтруют как ожидается, разрешить задокументированное расхождение endpoint'ов и формально пометить единственный гейт, который нельзя закрыть в read-only сессии.

**Жёсткое ограничение — read-only:** чтения разрешены; любые create/edit/delete/POST запрещены, а `ERP_WRITE_ENABLED` остаётся OFF. При этом ограничении выполнимая сейчас работа (S1) — подтвердить чтением, что `GET /teams/{id}/products?id=` действительно фильтрует по id (не игнорирует его) и что `product_name` + `operator[product_name]=like` действительно ищут — тот же вызов `/teams/{id}/products?id=`, который использует commit-валидация. Известное **расхождение endpoint'ов** также должно быть разрешено: код commit-валидации читает `/teams/{id}/products?id=`, тогда как проба/документ VER-021 оперируют `/teams/{id}/ingredients/{id}` — это *разные ресурсы*. Либо задокументировать, что `products.id == ingredients.id` (тогда свидетельство устойчивости переносится), либо измерить устойчивость на фактически используемом `/products?id=`.

**Гейт устойчивости VER-021** заблокирован ограничением read-only: проба (`scripts/ver021_durability_probe.py`) нуждается в create/edit/delete в песочнице (`VER021_CONFIRM=yes-write-to-sandbox-17957`, `ERP_WRITE_ENABLED=true`), что нарушает read-only. Поэтому она **не может быть закрыта агентом** — остаётся OPEN, выполняется владельцем (Иваном) вне read-only сессии, а таблица результатов вставляется в `01_ARCHITECTURE.md`. Merge остаётся под гейтом по VER-021, как и раньше. Эта фича также включает уже приземлённые read-фиксы Э0 (`F0.3`): team-scoped чтения `following`/`products`/`orders` с per-org токеном и fail-closed пустыми результатами.

## Возможности

- Верифицированный read-контракт: таблица «request → response» (только GET) из песочницы, доказывающая, что `products?id=` фильтрует по id, а `product_name`/`operator[product_name]=like` ищет.
- Разрешённое расхождение: задокументированное утверждение, справедливо ли `products.id == ingredients.id`, либо решение измерить устойчивость прямо на `/products?id=`.
- Team-scoped, аутентифицированные чтения (Э0 / `F0.3`): поставщики `GET /teams/{id}/following?is_virtual=1`, каталог `GET /teams/{id}/products` (server-side `product_name` LIKE), один элемент `GET /teams/{id}/products?id=` (commit-валидация), приёмки `GET /teams/{id}/orders`; все fail-closed при отсутствующем токене (пустой список + предупреждение, никогда неаутентифицированный запрос).
- Явный учёт гейта: VER-021 помечен как owner-run / write-gated в `01_ARCHITECTURE.md`; merge остаётся под гейтом; ничего не закрывается молча.
- Согласование документации (S9): `01_ARCHITECTURE` фиксирует авторитет единицы измерения (D2), VER-022 закрыт через DEC-0013 и VER-021 OPEN/write-gated.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[superadmin]] | Владеет верификацией песочницы и вставляет таблицу свидетельств; запускает write-gated пробу VER-021 вне read-only сессии. |
| [[admin]] | Задаёт org POS-токен (`PUT /organizations/{id}/pos-config`), аутентифицирующий team-scoped чтения; выигрывает от подтверждённых контрактов. |
| [[member]] | Прямого действия нет; выигрывает от валидированного пути коммита (корректный резолв `pos_ingredient_id`). |
| [[sqladmin-operator]] | Может задать POS-токен в SQLAdmin; write-гейт (`ERP_WRITE_ENABLED`) переключается здесь только для owner-run пробы. |

Каждое чтение Esupl несёт Bearer-токен тенанта (`get_esupl_access(session, org_id) → (team_id, token)`), SSOT для доступа к POS (4 места вызова: список/синхронизация поставщиков, каталог, приёмки, коммит).

## Задействованные сущности

- [[suppliers]] — зеркало Esupl `following`; read-фикс подкрепляет синхронизацию поставщиков.
- [[ingredients]] — зеркало локального каталога; связь id между `products` и `ingredients` — суть расхождения.
- [[invoices]] — commit-валидация читает `/products?id=`, чтобы подтвердить разрешённый элемент перед (gated) записью.
- [[sku_mapping]] — поставляет `pos_ingredient_id`, который коммит валидирует против POS; устойчивость этого id — то, что зондирует VER-021.
- [[integration_credentials]] — per-org Esupl-токен (Fernet), аутентифицирующий каждое чтение; fail-closed при отсутствии.

## Зависимости / связи

- **Требования:** [[erp-esupl-integration]] (read-only контракт, `get_esupl_access` SSOT, каталог endpoint'ов), [[fail-closed]] (нет точного совпадения → `None` на коммите; нет неаутентифицированного egress; отсутствующий токен → пусто + предупреждение), [[sku-identity-resolver]] (commit-валидация — потребитель подтверждённого контракта).
- **Фичи:** валидирует пути чтения [[LCOS-F11-esupl-read]]; подкрепляет commit-резолвер в [[LCOS-F22-sku-stabilization]]; токен, на который она опирается, управляется [[LCOS-F4-config-secrets]]; гейт устойчивости блокирует тот же merge, что и [[LCOS-F22-sku-stabilization]].
- **Решения:** [[DEC-0011]] (T2: одна сущность Esupl в двух представлениях — int payload `esupl_item_id` / str-якорь `pos_ingredient_id` `== str(esupl id)`), [[DEC-0013]] (VER-022 закрыт; VER-021 остаётся открытым).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Read-only свидетельство из песочницы (только GET): таблица «request → response», показывающая, что `GET /teams/{id}/products?id=` фильтрует по id (не игнорирует его) и что `product_name` + `operator[product_name]=like` ищет; вставлена в `01_ARCHITECTURE.md`.
- [ ] AC-BE-2. Расхождение `/products?id=` (код) vs `/ingredients/{id}` (проба/документ) разрешено в `01_ARCHITECTURE.md`: либо задокументировано `products.id == ingredients.id` (свидетельство переносится), либо устойчивость измерена на `/products?id=`.
- [ ] AC-BE-3. Team-scoped чтения несут per-org токен и fail-closed: нет токена → пустой список + предупреждение, никогда неаутентифицированный запрос (respx-тесты; `F0.3` AC-1/AC-2, `grep` по старым путям `{base}/suppliers`/`{base}/ingredients` чист).
- [ ] AC-BE-4. Если `id=` не учитывается → **STOP** и открыть DEC для разрешения по стабильному коду (не откатываться молча к `items[0]`).
- [ ] AC-BE-5. `alembic upgrade head` (вкл. `0007_supplier_criteria`) с рабочим downgrade; `pytest -m merge_gate` + полный DB-набор + `vitest` зелёные (S0 infra-гейт).

### Frontend
- [ ] AC-FE-1. Верификация не требует изменения FE-контракта; чтения приёмок/каталога, потребляемые workbench и списком счетов-фактур, продолжают работать против подтверждённых endpoint'ов.

### Прочее (гейт / docs)
- [ ] AC-OTHER-1. Устойчивость VER-021 помечена как owner-run / write-gated в `01_ARCHITECTURE.md`; она **не** закрывается в read-only сессии; merge остаётся под гейтом. См. [[VER-021_ESUPL_DURABILITY_TEST]].
- [ ] AC-OTHER-2. Согласование документации S9: `01_ARCHITECTURE` фиксирует авторитет единицы измерения (D2), VER-022 закрыт через DEC-0013, VER-021 OPEN/write-gated; `04_DECISIONS` отмечает D1 (вариант C) отклонён вето и S2 закрыт через DEC-0011 T2.

## Открытые вопросы / гейты

- **VER-021 (OPEN, owner-run):** устойчив ли `pos_ingredient_id` при edit / delete-recreate? Эмпирически не подтверждено; проба требует записей в песочницу → owner-run. Merge остаётся под гейтом (`[[VER-021_ESUPL_DURABILITY_TEST]]`).
- **S1 (OPEN, read-only):** подтвердить, что фильтры `products?id=` / `product_name` учитываются; если нет — STOP и открыть DEC.
- **Идентичность endpoint'ов:** справедливо ли `products.id == ingredients.id` — ответ решает, переносится ли существующее свидетельство VER-021.

## Источники

- `TZ__STABILIZATION_2026-07-09__ALIGNED.md` — S0 (infra-гейт: живой Postgres+pgvector, `0007` up/down), S1 (read-only контракт + расхождение endpoint'ов), S1-GATE (VER-021 заблокирован read-only, owner-run), S9 (согласование документации), подтверждённый SSOT потока данных.
- `APP_OVERVIEW.md §9` (реальные endpoint'ы, `get_esupl_access` SSOT), `§13` (VER-021 owner-run, S1 открыт).
- `VER-021_ESUPL_DURABILITY_TEST.md` (сценарии пробы, sandbox-only guard, PASS/FAIL матрица, пометка owner-run).
- `08_PHASE1_SPEC.md F0.3` (team-scoped пути чтения, fail-closed пусто + предупреждение, respx-тесты, AC-1/AC-2/AC-3).
- `mvp.be/app/providers/erp/esupl.py:4-9` (docstring endpoint'ов), `:80` (`list_suppliers`), `:104/:116/:139` (`list_ingredients` / `products` / `products?id=`), `:242` (`orders`); `reference/esupl-api/` (зеркало контракта).
