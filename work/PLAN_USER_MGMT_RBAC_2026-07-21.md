# User management + RBAC + auth-flow — план и прогресс

**Дата:** 2026-07-21 · **Ветка:** feature (создать от `develop`) · **Статус:** АНАЛИЗ → ждём решений по форкам

Полноценный CRUD для организаций, подразделений и пользователей от лица супер-админа;
назначение юзеров в орг/подразделения с ролями; роли грузятся из API; смена пароля юзеру
(одноразовый пароль → форс смены при входе); доработка авторизационного флоу (глазик,
экран задания нового пароля, email как логин, типовые правила паролей); 3 роли
(superadmin / admin / управляющий) с иерархией «сверху вниз».

> Задел на будущее: отправка email — сейчас не реализуется, но флоу проектируется так,
> чтобы позже подключить «сбросить пароль письмом» без переделок.

---

## 1. Анализ текущего состояния (проверено по коду)

### Backend
- **Данные:** `Organization` → `Subdivision` (FK, CASCADE) → `Membership(user_id, subdivision_id, role)`.
  `User` — глобальная таблица (email уникален глобально, регистронезависимо). Роль живёт
  ТОЛЬКО на membership и ТОЛЬКО на уровне подразделения; организация выводится через
  подразделение. [models.py](../../mvp.be/app/db/models.py)
- **Role enum:** единственное значение `admin`. `superadmin` — это булев флаг `User.is_superadmin`
  (god-mode, без membership), НЕ значение enum. `manager` не существует.
- **Auth:** `POST /auth/{login,logout,refresh,me,change-password,switch-context}`. Access-JWT
  (HS256, HttpOnly cookie, TTL 15м) несёт `{sub, is_superadmin, org, sub_div, role}` + opaque
  refresh с ротацией/reuse-detection. Пароли — argon2. [auth/](../../mvp.be/app/auth/)
- **`change-password`** уже существует: требует `current_password`, валидирует политику,
  снимает `must_change_password`, **отзывает все refresh-сессии** и переставляет свежую пару
  кук. [service.py:221](../../mvp.be/app/auth/service.py#L221)
- **`must_change_password`** (миграция 0023) + FE-гейт в `AuthGuard` + BE-гейт
  `require_password_current` (423 на write-методах). Уже работает для env-bootstrap супер-админа.
- **Политика паролей:** только `password_min_length` (дефолт 12) + «новый ≠ текущему».
  [password.py:34](../../mvp.be/app/auth/password.py#L34)
- **RBAC-энфорсмент:** реально гейтится ролью РОВНО ОДИН write-эндпоинт —
  `PUT /organizations/{id}/pos-config` через локальный `_authorize()`. Остальные ~19 write-эндпоинтов
  (invoices/suppliers/ingredients/price-lists/purchase-orders) проверяют только наличие
  тенант-контекста (`get_tenant_context`), НЕ роль. `require_superadmin` определён, но **не
  используется ни одним эндпоинтом**. (Подтверждает находку code-review 2026-07-20.)
- **CRUD орг/подразделений/юзеров через API ОТСУТСТВУЕТ.** Сейчас это делается только через
  SQLAdmin (отдельная operator-плоскость, env-креды, ADR-007) либо seed/bootstrap.
- **`GET /roles` не существует.**

### Frontend
- Redux Toolkit Query (`baseApi.injectEndpoints`), cookie-based auth, FSD
  (`entities/features/widgets/pages`, SSOT роутов в `shared/config/routes.ts`).
- `entities/auth` (authApi + типы), `AuthGuard` (гейт must_change_password), `LoginPage`,
  `ChangePasswordPage`. Логин сейчас — поле «Логин» type=text, **без глазика**. Экран смены
  пароля есть (используется при форс-смене). MIN_LENGTH=12 зеркалит бэк.
- Общие UI: `Button`, `ConfirmDialog`, `ConfirmButton`, `BottomSheet`, `ScrollTable`,
  `Accordion`, `Toaster` (`toast(msg)`), `StepCard`. Роутер — `createBrowserRouter` в `App.tsx`,
  lazy-страницы. RU-локализация — инлайн-строки (i18n-библиотеки нет).
- Паттерн CRUD-экранов для копирования: `pages/suppliers` + `pages/supplier-detail` +
  `features/supplier-form` + `entities/supplier` (RTKQ list/get/create/update).

### Документация (SSOT)
- `roles/{superadmin,admin,member}.md`, ADR-007 (две плоскости auth не смешиваются).
- Явно зафиксировано: **RBAC-матрицы в Phase 1 нет (non-goal)** — 2 уровня: superadmin(флаг)
  + admin(membership). Наш запрос это РАСШИРЯЕТ (продуктовое решение владельца) → docs нужно
  обновить синхронно.

---

## 2. Целевая ролевая модель

| Роль | Идентичность | Может |
|---|---|---|
| **superadmin** | `users.is_superadmin` (флаг, платформенный) | Всё. Создаёт организации. Создаёт/назначает любых юзеров, включая других superadmin. Пересекает границу тенанта. |
| **admin** | membership `role=admin`, **на уровне организации** | Управляет настройками своей орг + всеми её подразделениями. CRUD подразделений и юзеров в пределах своей орг-поддерева. Назначает роли admin/manager вниз. **НЕ** может: создавать организации, трогать чужие орг, повышать до superadmin. |
| **manager (Управляющий)** | membership `role=manager` (орг- или подразделение-уровень) | Полноценно пользуется приложением (накладные, поставки, поставщики, каталог, заявки). **НЕ** может: управлять сотрудниками и настройками орг. |

**Иерархия «сверху вниз»:** admin действует в своём орг-поддереве; вверх (на платформу/чужие
орг) — нельзя. superadmin — над всеми.

---

## 3. Решения (ЗАФИКСИРОВАНЫ пользователем 2026-07-21)

- **D1 ✓ superadmin остаётся флагом** `is_superadmin` (платформенный; не назначается через
  обычный membership). `GET /roles` возвращает назначаемые роли `[admin, manager]` + помечает
  superadmin платформенной. Создать superadmin может только другой superadmin.
- **D2 ✓ Расширяем `Membership`**: `+organization_id (NOT NULL, FK, CASCADE)`,
  `subdivision_id → NULLable`. `subdivision_id IS NULL` ⇒ роль на всю организацию.
  Бэкфилл org_id из подразделения; partial-unique на org-level строках.
- **D3 ✓ admin (не-superadmin)** может: CRUD подразделений своей орг; CRUD юзеров + назначение
  ролей admin/manager вниз в своём орг-поддереве; редактировать настройки своей орг.
  **НЕ может** создавать новые организации (только superadmin) и повышать до superadmin.
- **D4 ✓ Политика паролей**: min length **8**, обязательны буква + цифра, запрет крайних
  пробелов, «новый ≠ текущему». Сервер — авторитет (422), FE зеркалит.

---

## 4. План реализации (по фазам)

### Фаза 0 — модель и роли (BE)
1. Расширить `Role` enum: `admin`, `manager` (Alembic-миграция для PG enum type).
2. Миграция `Membership`: `+organization_id (NOT NULL, FK, CASCADE)`, `subdivision_id → NULLable`;
   бэкфилл org_id из subdivision; partial-unique `(user, org)` при `subdivision_id IS NULL` +
   существующий unique `(user, subdivision)`.
3. Обновить `AuthService._role_for`/`_default_subdivision`/`_membership_tree` под org-level
   membership.

### Фаза 1 — RBAC-ядро (BE)
4. Модуль `app/auth/rbac.py`: перечисление capabilities + маппинг роль→права + хелперы
   `require_role(...)`, `require_org_admin(org_id)`, `assert_can_manage_org(ctx, org_id)`
   (проверка орг-поддерева), `is_manager_or_above`. Единый SSOT прав (DRY).
5. Навесить гейты:
   - app-feature write (invoices/suppliers/ingredients/price-lists/purchase-orders) → member с
     ролью admin|manager|superadmin;
   - management (users/subdivisions/org settings) → admin своей орг | superadmin.
6. `GET /roles` — список назначаемых ролей с метаданными (scope, описание, платформенность).

### Фаза 2 — CRUD API (BE)
7. `app/api/v1/routes/admin_users.py` (или расширить organizations.py):
   - **Organizations:** GET list / GET one / POST / PATCH / DELETE (POST/DELETE — superadmin;
     PATCH — admin своей орг).
   - **Subdivisions:** CRUD в пределах орг (admin/superadmin).
   - **Users:** GET list (scoped) / GET one / POST (создать + задать one-time пароль,
     `must_change_password=true`) / PATCH (имя/актив) / DELETE (деактивация) / POST reset-password
     (задать новый one-time пароль, revoke-all-sessions).
   - **Memberships:** назначить/снять роль пользователя в орг/подразделении (scoped).
8. Репозитории: расширить `UserRepository` (list/create/update/deactivate/set_password),
   `OrganizationRepository` (create/update/delete/list), `SubdivisionRepository` (CRUD, list по орг),
   `MembershipRepository` (create/update role/delete/list scoped).
9. Скоуп-хелпер: список орг/подразделений/юзеров, видимых актору (superadmin — все; admin — своя
   орг-поддерево).

### Фаза 3 — авторизационный флоу (BE)
10. Политика паролей: расширить `validate_password` (буква+цифра+trim, конфиг-driven).
11. Email как логин: провайдер уже матчит по email; добавить строгую нормализацию/валидацию
    формата на входе создания юзера (pydantic `EmailStr`).
12. One-time пароль: при create/reset ставим `must_change_password=true`; существующий
    `change-password` флоу закрывает форс-смену (юзер знает временный пароль → это его
    `current_password`). Ничего нового в токенах не нужно.
13. (Задел email) заложить сервисный шов `password_reset` (без реализации отправки).

### Фаза 4 — Frontend
14. `entities/auth`: глазик (show/hide) на полях пароля (Login + ChangePassword); email type +
    валидация формата; зеркало правил паролей.
15. `entities/rbac` (или расширить auth): `useRolesQuery` (GET /roles); хелперы `can(...)` по
    активной роли из `me.active_context.role` + `is_superadmin`.
16. `entities/admin`: RTKQ для orgs/subdivisions/users/memberships (list/get/create/update/delete).
17. `pages/admin` (или `pages/settings` вкладки): «Организации», «Подразделения»,
    «Пользователи» — списки + формы (копируем паттерн suppliers). Раздел виден только
    admin/superadmin (гейт по роли + сервер — авторитет).
18. Роуты в `shared/config/routes.ts` (SSOT) + записи в `App.tsx`; пункт меню — по роли.
19. «Сбросить пароль» юзеру из карточки (admin/superadmin) → показать сгенерированный
    one-time пароль (позже — «отправить письмом»).

### Фаза 5 — тесты
20. **BE pytest:** политика паролей; RBAC-матрица (каждая роль × класс эндпоинтов, allow/deny);
    org-subtree скоуп (admin не видит/не трогает чужую орг); CRUD орг/подр/юзеров;
    one-time-password lifecycle (create→login→forced change→revoke); `GET /roles`.
21. **FE unit (vitest):** `can()`-логика, валидатор пароля, формы (валидация email/пароля).
22. **E2E (Playwright):** superadmin создаёт орг→подр→юзера→назначает роль; новый юзер входит по
    one-time паролю → форс-смена → доступ; admin ограничен своей орг; manager не видит
    управление юзерами; глазик показывает пароль.

### Фаза 6 — документация (SSOT)
23. Обновить `roles/*.md` (+ `manager.md`), ADR (новый: «RBAC 3 роли + org-level membership»,
    отменяет non-goal Phase 1), `creating-users.md`, requirements/features. Зафиксировать
    результаты и прогресс здесь.

---

## 5. Принципы (best practices)
- Сервер — единственный авторитет прав; FE-гейты только для UX.
- Единый SSOT прав (`rbac.py`) вместо ad-hoc проверок (устраняет текущий разнобой).
- Пароли: argon2, никогда не логируются/не возвращаются; one-time пароль показывается один раз.
- Роли — из API (не хардкод на FE), с заделом на расширение.
- Fail-closed: нет роли/скоупа → 403; неизвестный scope у не-superadmin → без утечки существования.
- Обратная совместимость миграций (server_default, бэкфилл, partial-unique).

## 6. Прогресс / Результаты
- [x] Анализ BE/FE/docs (проверено по коду + workflow-развёртка)
- [x] Решения по форкам D1–D4 (зафиксированы, §3)
- [x] **Фаза 0** — enum `Role`+manager; `Membership` org_id + nullable subdivision;
  `refresh_sessions.active_organization_id`; миграция **0024** (up+down проверены на
  throwaway-БД и на e2e-стеке); `AuthService` переписан под org-level контекст. seed фикс.
- [x] **Фаза 1** — `app/auth/rbac.py` (SSOT прав); гейт `require_app_write` на всех
  прикладных write-роутах; `GET /roles`.
- [x] **Фаза 2** — CRUD `organizations`(+subdivisions) и `users`(+memberships,
  reset-password); репозитории расширены; скоуп «своей орг-поддеревом».
- [x] **Фаза 3** — политика паролей (min 8 + буква+цифра + trim), email-валидация,
  генератор одноразового пароля, one-time-password lifecycle.
- [x] **Фаза 5a (BE)** — `tests/test_user_management.py` (21 тест): RBAC-матрица, скоуп,
  one-time-password, `/roles`, org-level membership. Итог: **360 pytest ✓**, ruff clean.
- [x] **Фаза 4 (FE)** — `PasswordInput` (глазик) на login+change-password; email-логин;
  `entities/admin` (RTKQ CRUD) + `useRolesQuery`; `shared/lib/rbac` (`canManage`/`isSuperadmin`);
  `pages/admin` (вкладки Пользователи/Организации, one-time-password диалог); роут `/admin`
  + пункт «Управление» в сайдбаре/дровере (гейт `canManage`). tsc ✓, eslint ✓.
- [x] **Фаза 5b (FE)** — vitest `password`/`rbac` (16 ✓); Playwright e2e
  `user-management.spec.ts` (3 ✓: глазик, гейт «Управление», создание юзера→OTP→форс-смена).
  Побочно исправлена гонка stale-`Me` в change-password (await refetch перед навигацией).
- [x] **Фаза 6** — [[ADR-023]]; `roles/manager.md`; обновлены `roles/admin.md`,
  `roles/superadmin.md`; этот файл.

**Задел под email:** флоу спроектирован так, что «сброс пароля письмом» подключается
позже без изменения контракта (одноразовый пароль → форс смены уже реализованы).

---

## 7. Код-ревью + верификация по факту (2026-07-21, после merge в develop)

Коммиты фичи: BE `9a686a4`, FE `f52a0b7`, docs `ebf7b12` (develop).

### Adversarial-ревью (workflow, 5 измерений → per-finding верификация)
29 находок, 26 подтверждено. **3 HIGH (реальный захват аккаунта)** — исправлены сразу:

- **create_membership не проверял target user_id** — org-admin мог привязать ЛЮБОГО юзера
  (в т.ч. superadmin) к своей орг по сырому id, затем `reset-password` → одноразовый пароль в
  ответе → вход под жертвой (эскалация до superadmin / cross-tenant). **Fix:** запрет привязки
  superadmin и юзера из чужой орг (target orgs ⊄ managed); проверка существования орг.
- **_assert_can_see_user слишком широк для credential-операций** — admin орг A мог сбросить
  пароль мульти-орг юзеру (A+B), т.к. пароль глобальный → захват доступа в B. **Fix:** новый
  `_assert_can_administer_user` (target не superadmin И все его орг ⊆ управляемых) на
  reset-password/update/deactivate.
- **PATCH is_active** позволял самодеактивацию в обход guard на DELETE. **Fix:** тот же guard.

Прочее исправлено: `_membership_tree` терял все subdivision-членства кроме первого в орг;
недетерминированный дефолтный контекст (добавлен order_by); duplicate-email race 500→409;
misleading 409 на несуществующей орг → 404. FE: дефолтная роль → manager (least-privilege),
superadmin-тумблер чистит org/role, confirm на reset-password, инвалидация `Me` на
membership/user-мутациях, серверные тексты ошибок вместо generic, ярлыки ролей из API (SSOT).
Фиксы: BE `26ea65c`, FE `f065b8e`. Добавлены регресс-тесты на ВСЕ deny-пути.

### Верификация по факту (throwaway-БД `lcos_verify`, seed OFF, ERP_WRITE OFF, POS-токен не задан)
- **Полный деплой-флоу:** миграции 0001→0024 → env-bootstrap первого superadmin
  (`root@localos.dev`, must_change_password) → форс-смена пароля при входе.
- **2 организации** (Альфа, Браво) + подразделения; **юзеры с ролями** admin/manager +
  одноразовые пароли. **33/33** проверок флоу + RBAC-deny прошли.
- **Повторная проверка после фиксов:** **12/12** attack-denial (attach foreign/superadmin →403,
  reset foreign/superadmin →403, self-deactivate →400, delete-org →403; при этом admin
  управляет своей орг, superadmin всемогущ). **ЗАПИСЬ в POS не производилась** (токен не задан,
  ERP_WRITE_ENABLED=false, POS-эндпоинты не вызывались).
- Итог: BE **370** pytest ✓ ruff ✓; FE tsc/eslint/vitest ✓; Playwright e2e **6/6** ✓.
