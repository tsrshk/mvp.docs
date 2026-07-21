---
id: LCOS-F1
type: feature
title: Мультиарендность и изоляция арендаторов
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[organizations]]", "[[subdivisions]]", "[[users]]", "[[memberships]]", "[[refresh_sessions]]"]
requirements: ["[[multitenancy]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-008]]", "[[ADR-004]]"]
legacy_refs: [plan/00 G2, LCOS_Conformance R5, APP_OVERVIEW §4]
sources: ["APP_OVERVIEW.md §4 §11", "01_ARCHITECTURE.md (Data model, Auth & multi-tenancy, Cross-cutting)", "LCOS_Conformance_Alignment_GlobalRequirements.md R5", "mvp.be app/db/base.py", "mvp.be app/db/repositories.py:33", "mvp.be app/auth/dependencies.py:46"]
updated: 2026-07-09
---
# LCOS-F1 · Мультиарендность и изоляция арендаторов
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Жёсткая граница изоляции данных, на которой стоит вся платформа. Арендатор — это **организация**; модель идентичности в стиле «Slack» вкладывает **organization → subdivision (физическая точка, которая соответствует складу Esupl) → membership (пользователь ↔ subdivision + роль)**. `organization_id` **денормализован в каждую операционную и каталожную строку** с `ondelete=RESTRICT`, а операционные строки дополнительно несут `subdivision_id`. `users` — единственная глобальная таблица: у неё нет `organization_id`; пользователь достигает арендатора только через `membership`.

Изоляция обеспечивается структурно, а не дисциплиной: **репозитории арендатора требуют `organization_id` в конструкторе**, поэтому запрос арендатора невозможен без scope, а scope всегда происходит из подписанного access-JWT (claims `org` / `sub_div`), никогда из клиентского ввода (см. [[LCOS-F2-app-auth]]). `get_tenant_context` возвращает **403**, когда `organization_id` отсутствует, закрывая данные арендатора для любого аутентифицированного пользователя без активного контекста организации.

Каждый операционный эпик ([[LCOS-E2-invoice-intake]], [[LCOS-E3-sku-identity]], [[LCOS-E4-suppliers]]) наследует эту границу бесплатно, расширяя scoped-миксины. «Ров» цикла обучения также привязывает свои scope (`scope_type`/`scope_id`) к этой иерархии — см. [[sku-identity-resolver]].

## Возможности

- Иерархия org/subdivision/membership с единственной глобальной таблицей `users`; `memberships` хранит `organization_id` явно (NOT NULL), `subdivision_id` NULLable (NULL ⇒ org-level роль на всю орг) — ADR-023, миграция 0024.
- Денормализованный `organization_id` в каждой операционной/каталожной таблице через `OrganizationScopedMixin`; `subdivision_id` добавляется `SubdivisionScopedMixin` (таблица со scope на уровне subdivision несёт оба столбца).
- FK на границе арендатора — `RESTRICT`; родитель-потомок внутри арендатора — `CASCADE`; `refresh_sessions.active_subdivision_id` — `SET NULL`.
- Репозитории арендатора (`SupplierRepository`, `IngredientRepository`, `InvoiceRepository`) принимают `organization_id` в конструкторе — запрос без scope сконструировать нельзя.
- Scope разрешается из подписанного JWT через `get_tenant_context`; `require_superadmin` защищает маршруты god-mode.
- `superadmin` — глобальный boolean на `User` (god-mode: видит/переключается в любую org/subdivision); enum `role` `{admin, manager}` на membership (ADR-023): admin управляет своей орг «сверху вниз», manager — прикладные фичи. Энфорсмент — SSOT `app/auth/rbac.py`.
- Org ↔ ровно одна команда Esupl (`organizations.esupl_team_id`); subdivision ↔ склад Esupl (`subdivisions.esupl_warehouse_id`) — несекретные ID-столбцы, питающие payload ERP.
- Фронтенд проецирует активный scope из кэша `/auth/me` в RxJS `activeScope$`; хранилища на уровне браузера ключуются по `orgScopeToken()`, чтобы предотвратить межарендаторскую утечку.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Работает только внутри своих subdivision(ов); запросы арендатора автоматически ограничены scope из JWT. Не может достичь данных другой организации. |
| [[admin]] | Та же изоляция, что и member, плюс административные возможности внутри subdivision, где у него есть membership с ролью `admin`. |
| [[superadmin]] | Глобальный флаг на `User`: видит и может переключаться в любую org/subdivision независимо от membership; трактуется как `admin` в каждой subdivision. |
| [[sqladmin-operator]] | Управляет структурой org/subdivision/user/membership через SQLAdmin ModelViews (см. [[LCOS-F3-sqladmin-operator]]); работает вне плоскости JWT арендатора. |

Пользователь без membership и без флага superadmin может аутентифицироваться, но у него **нет активного контекста** → данные арендатора закрыты (403); FE показывает «нет доступных subdivision».

## Задействованные сущности

- [[organizations]] — арендатор и жёсткая граница изоляции; `esupl_team_id` привязывает его к одной команде Esupl.
- [[subdivisions]] — физическая точка внутри арендатора; уникальность `(organization_id, name)`; соответствует складу Esupl.
- [[users]] — единственная глобальная таблица (без `organization_id`); достигает арендатора только через membership.
- [[memberships]] — пользователь ↔ организация[↔subdivision] + `Role`; `organization_id` NOT NULL, `subdivision_id` NULLable (NULL ⇒ org-level); уникальность `(user_id, subdivision_id)` + partial-unique org-level.
- [[refresh_sessions]] — хранит `active_subdivision_id` (`SET NULL`), чтобы активный контекст восстанавливался при refresh.

## Зависимости / связи

- **Требования:** [[multitenancy]] (денормализованный `organization_id`, scoped-репозитории, scope-из-JWT), [[auth]] (claims scope происходят из подписанного access-JWT), [[global-requirements]] (R5).
- **Фичи:** потребляется каждой операционной фичей — [[LCOS-F10-invoice-status-machine]], [[LCOS-F17-supplier-cards]], [[LCOS-F13-sku-identity-resolver]] все расширяют scoped-миксины; scope происходит в [[LCOS-F2-app-auth]]; структура управляется через [[LCOS-F3-sqladmin-operator]]; проецируется на клиенте через [[LCOS-F7-frontend-platform]].
- **ADR:** [[ADR-008]] (модель мультиарендности; subdivision = склад Esupl), [[ADR-004]] (org ↔ одна команда Esupl).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Каждая операционная/каталожная таблица (`suppliers`, `invoices`, `invoice_lines`, `ingredients`, `packings`) несёт `organization_id` (`OrganizationScopedMixin`, `ondelete=RESTRICT`, `nullable=False`, индексирован); invoices/lines также несут `subdivision_id`.
- [ ] AC-BE-2. `users` — единственная таблица без `organization_id`; пользователь достигает данных арендатора исключительно через `membership`.
- [ ] AC-BE-3. Репозитории арендатора нельзя инстанцировать без `organization_id` (аргумент конструктора) — запрос арендатора без scope структурно невозможен (тест под merge-gate).
- [ ] AC-BE-4. Scope берётся из подписанного access-JWT (`org`, `sub_div`), никогда из клиентского ввода; `get_tenant_context` возвращает 403, когда `organization_id` отсутствует.
- [ ] AC-BE-5. Межарендаторский доступ невозможен: запрос со scope организации A не может читать/писать строки организации B (тест изоляции под merge-gate).
- [ ] AC-BE-6. `superadmin` — глобальный boolean `User` (не строка роли); может переключаться в любую org/subdivision; `require_superadmin` защищает маршруты god-mode.
- [ ] AC-BE-7. Поведение удаления FK соответствует правилам границы: FK на границе арендатора — `RESTRICT`, родитель-потомок внутри арендатора — `CASCADE`, `refresh_sessions.active_subdivision_id` — `SET NULL`.

### Frontend
- [ ] AC-FE-1. Активный scope выводится из кэша `/auth/me` (авторитетен бэкенд) и проталкивается в `activeScope$`; UI никогда не позволяет клиенту заявить scope, который JWT не предоставляет.
- [ ] AC-FE-2. Хранилища на уровне браузера (выученные маппинги, реестр отправленных инвойсов) ключуются по `orgScopeToken()`, чтобы два арендатора не могли столкнуться; преавторизационный токен — `'noorg'`.
- [ ] AC-FE-3. Login / logout / switch-context инвалидируют кэши `['Me','Invoice','Supplier','Ingredient']`, чтобы данные арендатора перезапрашивались при смене scope.
- [ ] AC-FE-4. Пользователь без membership (и не superadmin) видит «нет доступных subdivision» и никаких данных арендатора.

## Открытые вопросы / гейты

- **Инвариант под merge-gate (VER-01):** набор тестов изоляции арендаторов блокирует merge; его регрессия не может попасть в main.
- `localos.lastWarehouseId` намеренно **не** ограничен scope организации (низкорисковый UI-дефолт) — отмечено как пункт DEFER в Conformance §2.4.
- Не-цели Phase 1: нет OAuth, нет саморегистрации, нет масштабирования арендаторов ([[LCOS-F70-tenancy-scaling]] — это Phase 2). (RBAC-матрица прав — ранее не-цель — реализована в [[ADR-023]] / [[LCOS-F76-user-org-management]].)

## Источники

- `APP_OVERVIEW.md §4` (мультиарендность и auth), `§11` (модель данных).
- `01_ARCHITECTURE.md` — Data model / mixins, «Auth & multi-tenancy», «Cross-cutting → Multi-tenancy scoping».
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R5.
- `mvp.be/app/db/base.py` (`OrganizationScopedMixin`, `SubdivisionScopedMixin`, соглашение об именовании).
- `mvp.be/app/db/repositories.py:33` (`SupplierRepository.__init__` требует `organization_id`), `:116`, `:185`.
- `mvp.be/app/auth/dependencies.py:46` (`get_tenant_context` → 403), `:56` (`require_superadmin`).
