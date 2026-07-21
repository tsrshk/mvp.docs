---
id: LCOS-F76
type: feature
title: Управление пользователями и организациями в приложении (RBAC, 3 роли)
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [manager, admin, superadmin]
entities: ["[[users]]", "[[memberships]]", "[[organizations]]", "[[subdivisions]]", "[[refresh_sessions]]"]
requirements: ["[[auth]]", "[[multitenancy]]", "[[global-requirements]]", "[[fail-closed]]"]
adrs: ["[[ADR-023]]", "[[ADR-007]]"]
legacy_refs: []
sources: ["mvp.be app/auth/rbac.py", "mvp.be app/api/v1/routes/organizations.py", "mvp.be app/api/v1/routes/users.py", "mvp.be app/api/v1/routes/roles.py", "mvp.be app/auth/password.py", "mvp.be alembic/versions/0024_membership_org_level_roles.py", "mvp.fe src/pages/admin", "mvp.fe src/entities/admin", "mvp.fe src/shared/lib/rbac.ts"]
updated: 2026-07-21
---
# LCOS-F76 · Управление пользователями и организациями (RBAC)

**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание
Полноценное управление структурой (организации, подразделения) и пользователями **из
приложения** (app-plane, JWT), а не только через плоскость [[sqladmin-operator]]. Вводит
3-ролевую модель RBAC ([[ADR-023]]) с единым SSOT энфорсмента `app/auth/rbac.py`. Роли
грузятся с бэка (`GET /roles`), не хардкодятся на фронте. Две плоскости auth по-прежнему не
смешиваются ([[ADR-007]]).

## Ролевая модель
- **superadmin** — платформенный флаг `users.is_superadmin` (режим Бога). Создаёт/удаляет
  организации, создаёт любых пользователей (в т.ч. других superadmin), назначает роли в
  любой орг.
- **admin** — `role=admin` на [[memberships]] (org-level или subdivision-level). Управляет
  своей организацией и всеми её подразделениями «сверху вниз»: CRUD подразделений и
  пользователей, назначение ролей admin/manager вниз, настройки орг (POS-конфиг). **НЕ**
  создаёт новые организации и **НЕ** выдаёт superadmin.
- **manager** («Управляющий») — `role=manager`. Полный доступ к прикладным фичам (накладные,
  поставки, поставщики, каталог, заявки), **без** управления сотрудниками/настройками.

## Возможности (endpoints, app-JWT)
- `GET /roles` — назначаемые роли + метаданные (scope, platform, app_access, can_manage);
  superadmin дополнительно видит платформенную роль.
- **Организации:** `GET /organizations` (superadmin — все; admin — свои), `POST` (superadmin),
  `GET/PATCH /organizations/{id}` (admin своей орг / superadmin), `DELETE` (superadmin).
- **Подразделения:** `GET/POST /organizations/{id}/subdivisions`,
  `PATCH/DELETE /organizations/{id}/subdivisions/{sid}` (admin своей орг / superadmin).
- **Пользователи:** `GET /users` (scoped), `POST /users` (создание + одноразовый пароль),
  `GET/PATCH /users/{id}` (имя, is_active — с reactivation), `DELETE /users/{id}`
  (мягкая деактивация + отзыв сессий), `POST /users/{id}/reset-password` (одноразовый пароль).
- **Членства:** `GET /users/{id}/memberships`, `POST /users/memberships`,
  `PATCH/DELETE /users/memberships/{id}`.

## Авторизация (SSOT `app/auth/rbac.py`)
- `require_app_write` — прикладные write-роуты: `admin|manager|superadmin` (на чтениях no-op).
- `assert_can_manage_org` — управление: superadmin ИЛИ любое admin-членство в целевой орг.
- `_assert_can_administer_user` (routes/users) — credential-операции (reset/deactivate/update
  is_active): target НЕ superadmin И **все** организации target ⊆ управляемых актором
  (пароль/статус глобальны ⇒ иначе cross-tenant takeover). `create_membership` не даёт
  привязать superadmin или чужого юзера в свою орг. `DELETE`/создание орг — только superadmin.
- Self-lockout guard: нельзя деактивировать себя (DELETE и PATCH is_active).

## Одноразовый пароль и политика
- Пароль, заданный админом при создании/сбросе, — **одноразовый**: `must_change_password=True`
  → форс смены при первом входе (переиспользует `POST /auth/change-password`, отзыв всех
  сессий). Сгенерированный сервером пароль показывается администратору один раз.
- Политика (SSOT `validate_password`, сервер — авторитет): длина ≥ 8, минимум одна буква и
  одна цифра, без крайних пробелов, новый ≠ текущему. Логин — email (структурная валидация).
- Задел под email: «сброс пароля письмом» подключается позже без изменения контракта.

## Фронт
- `pages/admin` (вкладки «Пользователи»/«Организации»), раздел виден только admin/superadmin
  (`shared/lib/rbac.canManage`, сервер — авторитет; маршрут `/admin` за гейтом).
- `entities/admin` (RTKQ CRUD) + `useRolesQuery`; `PasswordInput` с «глазиком» на login и
  смене пароля; email-логин.
- UX: подтверждения на деструктивные действия (удаление орг/подразделения — модалка, удаление
  членства — two-tap, деактивация — модалка, reset-password — модалка), reactivation юзера,
  дизейбл кнопок во время мутаций (анти-дабл-сабмит), серверные тексты ошибок (403/409/422),
  дефолтная роль — наименее привилегированная (`manager`), одноразовый пароль показывается раз.

## Критерии приёмки
- **AC-BE-1.** Каждый write-эндпоинт управления гейтится RBAC; admin ограничен своим
  орг-поддеревом; manager получает 403 на управление, но может писать прикладные фичи.
- **AC-BE-2.** admin не может: создать орг, выдать superadmin, привязать/сбросить пароль
  чужого или superadmin-пользователя, деактивировать себя (регресс-тесты
  `tests/test_user_management.py`).
- **AC-BE-3.** Одноразовый пароль форсит смену; reset отзывает сессии; `GET /roles` отдаёт
  `{admin, manager}` (+ superadmin для superadmin).
- **AC-FE-1.** Раздел «Управление» виден и доступен только admin/superadmin; создание юзера →
  показ одноразового пароля → форс смены при входе (e2e `e2e/user-management.spec.ts`).
- **AC-FE-2.** Валидация email/пароля (зеркало политики), обработка ошибок сервера,
  подтверждения деструктивных действий (unit `pages/admin/ui/AdminPage.test.tsx`,
  `shared/lib/{rbac,password}.test.ts`).

## Связи
[[ADR-023]] · [[ADR-007]] · [[LCOS-F2-app-auth]] · [[LCOS-F1-multitenancy]] ·
[[LCOS-F3-sqladmin-operator]] · [[memberships]] · [[users]] · [[organizations]] ·
[[subdivisions]] · [[superadmin]] · [[admin]] · [[manager]]
