---
id: LCOS-F2
type: feature
title: Аутентификация приложения (JWT + refresh)
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, manager, admin, superadmin]
entities: ["[[users]]", "[[memberships]]", "[[refresh_sessions]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[auth]]", "[[fail-closed]]", "[[global-requirements]]"]
adrs: ["[[ADR-007]]"]
legacy_refs: [plan/00 G2, LCOS_Conformance R3, APP_OVERVIEW §4]
sources: ["APP_OVERVIEW.md §4", "01_ARCHITECTURE.md (Auth & multi-tenancy)", "LCOS_Conformance_Alignment_GlobalRequirements.md R3", "mvp.be app/auth/router.py:29", "mvp.be app/auth/tokens.py:37", "mvp.be app/auth/dependencies.py:32", "mvp.fe src/entities/auth", "mvp.fe src/shared/api/backendRequest.ts"]
updated: 2026-07-09
---
# LCOS-F2 · Аутентификация приложения (JWT + refresh)
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Плоскость аутентификации для **реальных пользователей кофейни** (React PWA). Это один из **двух полностью раздельных механизмов аутентификации**, которые никогда нельзя смешивать (незыблемое требование `CLAUDE.md`): аутентификация приложения (эта фича) против логина оператора SQLAdmin ([[LCOS-F3-sqladmin-operator]]). Пользователи приложения живут в глобальной таблице `users`, пароли хешируются через **argon2** (`app/auth/password.py`), а сессии используют **короткоживущий access-cookie JWT + непрозрачный refresh-cookie, отслеживаемый на сервере**.

Access-токен — это подписанный JWT (PyJWT, HS256, `jwt_secret`, TTL **15 min**), несущий `{sub, is_superadmin, org, sub_div, role, type, iat, exp}` в HttpOnly-cookie `lcos_access`; каждый запрос авторизуется **без состояния** по подписанному токену без обращения к БД. Refresh-токен — **непрозрачная** строка `token_urlsafe(48)` (не JWT), в `refresh_sessions` хранится **только её SHA-256-хеш**; это HttpOnly-cookie `lcos_refresh`, TTL **30 min sliding**, сгруппирован по `family_id` для ротации и обнаружения повторного использования. Активный контекст арендатора сохраняется в строке refresh (`active_organization_id`/`active_subdivision_id`), так что он переживает refresh (org хранится явно — org-level admin/manager может не иметь активного подразделения).

Fail-closed-свойства здесь важны: неверные учётные данные возвращают **обобщённый 401** (причина никогда не раскрывается), а **повторное использование отозванного refresh-токена отзывает весь `family_id`** (обнаружение кражи). Фронтенд **не хранит токены в JS** — он отправляет `credentials:'include'` и прозрачно делает refresh один раз при 401.

## Возможности

- `POST /auth/login`: argon2-проверка → вычисление дефолтного контекста → выдача cookie access + refresh со свежим `family_id` (плюс CSRF-cookie, если включён). Неверные учётные данные → обобщённый 401.
- `POST /auth/refresh`: поиск по хешу; не найдено/истекло → 401; **отозвано → обнаружено повторное использование: отзыв всего `family_id` + 401**; иначе ротация внутри того же `family_id`, восстановление контекста из `active_organization_id`/`active_subdivision_id`, перевыпуск access.
- `POST /auth/logout`: отзыв текущей строки refresh, очистка cookie, 204.
- `GET /auth/me`: **единственный источник** сайдбара/активного scope FE — обычный пользователь видит только свои subdivision, superadmin видит полное дерево org/subdivision.
- `POST /auth/switch-context`: авторизация через `_role_for` (403 без доступа; 404 достижим только superadmin, что избегает утечек существования); требует живой, не отозванный refresh; перевыпускает только access-cookie.
- Авторизация без состояния по подписанному access-JWT (без обращения к БД на каждый запрос); отзыв access не мгновенный (смягчён 15-минутным TTL) — явная не-цель.
- Хеширование паролей argon2 для `users`; допускаются короткие строки логина (`LoginIn.email` — обычная `str`, не `EmailStr`).
- Транспорт FE: только HttpOnly-cookie, refresh один раз при 401, затем повтор (кроме `/auth/refresh` и `/auth/login`).

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[member]] | Логин, refresh, logout; `/auth/me` возвращает только его subdivision; может `switch-context` среди них. |
| [[admin]] | membership-`Role`=admin (org-level или subdivision-level): управление своей орг «сверху вниз». Различие ролей — RBAC (`app/auth/rbac.py`), не auth. |
| [[manager]] | membership-`Role`=manager: прикладные фичи без управления сотрудниками/настройками. |
| [[superadmin]] | `/auth/me` возвращает полное дерево org/subdivision; может `switch-context` в любую org/subdivision (семантика 403/404 избегает утечек существования). |
| [[sqladmin-operator]] | **Не часть этой плоскости** — логин оператора — env/bcrypt/session-cookie, и у него нет строки в `users` (см. [[LCOS-F3-sqladmin-operator]]). |

## Задействованные сущности

- [[users]] — глобальная идентичность; `password_hash` (argon2, nullable для внешних провайдеров), `is_superadmin`, `is_active`.
- [[memberships]] — пользователь ↔ организация[↔subdivision] + `Role`; `organization_id` NOT NULL, `subdivision_id` NULLable (org-level); определяет, что возвращает `/auth/me` и что авторизует `switch-context`.
- [[refresh_sessions]] — хранит только `token_hash` (SHA-256), `family_id` (ротация/обнаружение повторного использования), `active_organization_id`/`active_subdivision_id` (восстановление контекста, `SET NULL`), `expires_at`, `last_used_at`, `revoked`.
- [[subdivisions]] / [[organizations]] — scope, встроенный в claims access-JWT (`org`, `sub_div`).

## Зависимости / связи

- **Требования:** [[auth]] (access JWT + непрозрачный refresh, ротация, обнаружение повторного использования), [[fail-closed]] (обобщённый 401, отзыв family при повторном использовании, требование живого refresh для switch), [[global-requirements]] (R3).
- **Фичи:** производит scope, потребляемый [[LCOS-F1-multitenancy]]; отдельная плоскость от [[LCOS-F3-sqladmin-operator]]; потребляется на клиенте через [[LCOS-F7-frontend-platform]] (AuthGuard, `backendRequest`).
- **ADR:** [[ADR-007]] (две независимые плоскости auth, никогда не смешиваются).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `POST /auth/login` с валидными учётными данными устанавливает HttpOnly `lcos_access` (JWT, 15 min) + `lcos_refresh` (непрозрачный); защищённый endpoint возвращает 401 без валидного access-cookie.
- [ ] AC-BE-2. Access-JWT подписан HS256 через `jwt_secret`, payload `{sub, is_superadmin, org, sub_div, role, type, iat, exp}`; авторизация разрешается по нему без состояния.
- [ ] AC-BE-3. Refresh-токен — непрозрачный `token_urlsafe(48)`; хранится только его SHA-256-хеш; TTL 30 min sliding.
- [ ] AC-BE-4. `POST /auth/refresh` делает ротацию внутри `family_id`; повторное использование **отозванного** токена отзывает весь `family_id` и возвращает 401 (тест обнаружения повторного использования под merge-gate).
- [ ] AC-BE-5. `POST /auth/login` с неверными учётными данными → обобщённый 401, не раскрывающий, какое поле было неверным; пароли никогда не логируются.
- [ ] AC-BE-6. `POST /auth/logout` отзывает текущую строку refresh и очищает cookie (204).
- [ ] AC-BE-7. `GET /auth/me` возвращает только subdivision вызывающего для обычного пользователя и полное дерево для superadmin.
- [ ] AC-BE-8. `POST /auth/switch-context` возвращает 403 без доступа, 404 только для superadmin, требует живой сессии refresh и перевыпускает только access-cookie.
- [ ] AC-BE-9. `users.password_hash` создаётся/проверяется через argon2 (`app/auth/password.py`), отдельно от bcrypt-пути оператора (V-b).

### Frontend
- [ ] AC-FE-1. Токены не живут в JS; `backendRequest` отправляет `credentials:'include'` (только HttpOnly-cookie).
- [ ] AC-FE-2. При 401 (кроме `/auth/refresh` и `/auth/login`) транспорт делает POST `/auth/refresh` **один раз** и повторяет исходный запрос; при настоящем сбое пользователь попадает на `/login`.
- [ ] AC-FE-3. `AuthGuard` защищает все непубличные маршруты через `useMeQuery()` — loading → спиннер, error → редирект на `/login`.
- [ ] AC-FE-4. Экран логина при сбое показывает единое обобщённое сообщение «неверный логин или пароль».

## Открытые вопросы / гейты

- Отзыв access-токена **не мгновенный** (не-цель) — смягчён 15-минутным TTL + отзывом refresh.
- Ограничение частоты на `/auth/login` не наблюдалось (Conformance DEFER; чек-лист прода R-Deploy).
- CSRF double-submit поддерживается на стороне сервера, но **выключен по умолчанию**, и FE не отправляет `X-CSRF-Token`; включение `csrf_enabled` в проде требует сначала подключить `backendRequest.ts` ([[LCOS-F66-prod-hardening]]).

## Источники

- `APP_OVERVIEW.md §4` (две плоскости auth, роли).
- `01_ARCHITECTURE.md` — «Auth & multi-tenancy» (поток access + refresh JWT, scope арендатора, засеянные аккаунты).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R3 / Part 4 (сценарии тестов auth).
- `mvp.be/app/auth/router.py:29` (`login`), `:46` (`refresh`), `:51` (`me`), `:56` (`switch_context`).
- `mvp.be/app/auth/tokens.py:37` (`create_access_token`), `:72` (`generate_refresh_token`), `:76` (`hash_refresh_token`).
- `mvp.be/app/auth/dependencies.py:32` (`get_current_context`, 401).
- `mvp.fe/src/entities/auth` (authApi me/login/logout/switchContext), `src/shared/api/backendRequest.ts` (refresh один раз при 401).
