---
id: REQ-AUTH
type: requirement
title: Аутентификация приложения (JWT access + opaque refresh)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[users]]", "[[refresh_sessions]]", "[[memberships]]"]
adrs: ["[[ADR-007]]"]
requirements: ["[[multitenancy]]", "[[global-requirements]]"]
legacy_refs: [Conformance R3, CLAUDE.md §11]
sources: [01_ARCHITECTURE.md "Auth & multi-tenancy", APP_OVERVIEW.md §4, LCOS_Conformance R3, app/auth/*]
ssot_for: [app-auth, jwt-access-token, opaque-refresh, refresh-reuse-detection, password-hashing-argon2]
updated: 2026-07-20
---

# REQ-AUTH · Аутентификация приложения

**Type:** cross-cutting SSOT · **Status:** built · плоскость app-JWT (не путать с [[sqladmin-operator]], см. [[config-secrets]] R4).

Этот документ — единый источник по аутентификации приложения. Features ссылаются сюда, а не пересказывают её.

## Нормативное положение

- **N1. Access-токен** — подписанный JWT (PyJWT, HS256, `settings.jwt_secret`), TTL **15 мин**, в HttpOnly cookie `lcos_access`. Payload: `{sub, is_superadmin, org, sub_div, role, type:"access", iat, exp}`. Авторизация каждого запроса выводится из подписанного токена **stateless** (без обращения к БД) через `decode_access_token → AccessClaims`.
- **N2. Refresh-токен** — **opaque** случайная строка (`secrets.token_urlsafe(48)`), НЕ JWT. Хранится **только как SHA-256 хеш** (`refresh_sessions.token_hash`). TTL **30 мин sliding** (`expires_at` сдвигается +30 мин при каждой ротации), в HttpOnly cookie `lcos_refresh`, несёт `family_id`.
- **N3. `POST /auth/login`** — `PasswordAuthProvider.authenticate` (argon2, см. N8) → вычисление контекста по умолчанию → выпуск новой `refresh_sessions` со свежим `family_id`, обе cookie. Неверные креды → **generic 401**, причина не раскрывается.
- **N4. `POST /auth/refresh`** — поиск по хешу: не найдено → 401; истёк → 401; **`revoked` → reuse-detected: отзыв всего `family_id` (`revoke_family`) + 401**; иначе ротация в рамках того же `family_id` (старая строка помечается revoked, вставляется новая), контекст восстанавливается из `active_subdivision_id`, переиздаётся новый access.
- **N5. `POST /auth/logout`** — отзыв текущей refresh-строки, очистка cookie, 204.
- **N6. `GET /auth/me`** — **единственный источник** сайдбара FE и активного scope: `{user, active_context, organizations}`. Обычный пользователь видит только свои подразделения; superadmin — всё дерево org/subdivision.
- **N7. `POST /auth/switch-context`** — авторизация через `_role_for` (403 без доступа; 404 достижим только superadmin — не раскрывает существование); требует **живого** (не отозванного, не истёкшего) refresh (иначе 401, fail-closed); обновляет `refresh_sessions.active_subdivision_id`, переиздаёт **только** access-cookie.
- **N8. Пароли пользователей** — **argon2** (`app/auth/password.py`), отдельно от bcrypt SQLAdmin operator. Пути hash/verify не перепутаны (V-b). Пароли не логируются.

## Обоснование

Stateless access + короткий TTL даёт дешёвую авторизацию без обращения к БД на каждый запрос; серверное состояние refresh (хеш + `family_id`) обеспечивает отзыв и **reuse detection** — украденный refresh, воспроизведённый второй раз, обрушивает всё семейство токенов. Разделение access (JWT, статический scope) и refresh (opaque, ротируемый) — стандартная защита от replay. Восстановление `active_subdivision_id` при refresh сохраняет активный контекст между сессиями.

## Режимы отказа

- **Отзыв access не мгновенный** (явный non-goal) — компенсируется TTL 15 мин + отзывом refresh. Полный логаут со всех устройств требует отзыва `family_id`.
- **Пользователь без membership и не superadmin** входит, но не имеет активного контекста → данные тенанта закрыты (403 из `get_tenant_context`), FE показывает «нет доступных подразделений». Это корректный fail-closed, не баг (см. [[multitenancy]] R5.5).
- **Слабый `JWT_SECRET`/`SESSION_SECRET`** → startup-guard отказывается загружаться (см. [[fail-closed]] R8.6).
- **CSRF собран наполовину** (double-submit есть, `csrf_enabled=False`, FE не отправляет токен) — включение в prod без правки `backendRequest.ts` тихо ломает мутации; отложено в prod-чеклист (DEFER D-d).

## Связи

- ADR: [[ADR-007]] (две независимые плоскости auth).
- Сущности: [[users]] (глобальные, argon2 `password_hash`), [[refresh_sessions]] (хеш + `family_id` + `active_subdivision_id`), [[memberships]] (роль на подразделении).
- Требования: [[multitenancy]] (scope из JWT), [[config-secrets]] R4 (операторская плоскость), [[global-requirements]] R3.

## На это ссылаются

Features auth/платформы: `LCOS-F2` (App auth), `LCOS-F1` (Multitenancy), `LCOS-F7` (FE platform, `AuthGuard`/`useMeQuery`), и всё, что читает `get_tenant_context`.

## Источники

- 01_ARCHITECTURE.md → "JWT access + refresh-token flow", "Tenant scoping".
- APP_OVERVIEW.md §4; LCOS_Conformance_Alignment_GlobalRequirements.md R3, V-b.
- Код: `app/auth/{router,service,tokens,password,cookies,dependencies}.py`.
