---
doc: lcos-auth-multitenancy-spec
title: "ТЗ: Авторизация и мультитенантность — LCOS Backend"
status: archived
archived: 2026-07-16
archived_from: mvp.be root
reason: "Историческая feature-спека auth/мультитенантности; реализована. SSOT — код и features"
trust_tier: 3
---

> Перенесено из корня mvp.be 2026-07-16. Историческая спека, реализована. SSOT — код (`mvp.be/app`) и epics/features. Хранится для истории.

# ТЗ: Авторизация и мультитенантность — LCOS Backend

> Feature-спека для агента (Claude Code), реализуется ПОВЕРХ существующего бэкенда (`lcos-backend-spec-phase1.md`). Соблюдать конвенции из `CLAUDE.md`. Прозаичные пояснения — на русском, код/идентификаторы — на English.
>
> **Важно:** этот документ снимает прежние non-goals «no authentication» и «no full multi-tenancy» — это запланированный триггер, ради которого `tenant_id` закладывался с первого дня.

---

## 1. Объём

**Входит:**
- Корпоративная структура: организация → подразделения → пользователи (членство many-to-many с ролью).
- Авторизация: login+password, argon2; провайдер за seam-ом (одна реализация).
- JWT-access в HttpOnly-куке + opaque refresh-токен с ротацией (sliding idle 30 мин).
- Активный контекст (организация/подразделение/роль) в JWT, перевыпуск при переключении.
- Роли: `superadmin` (глобально) и `admin` (на подразделение).
- Enforcement скоупа: единый dependency контекста + репозитории, требующие скоуп; `organization_id` — жёсткая граница изоляции.
- Эндпоинты `/auth/*` и контракт для сайдбара (переключатель + меню юзера).
- Миграция существующих операционных таблиц под новую модель.

**Non-goals (НЕ делать сейчас):**
- RBAC permission-матрица — нет (только проверки по роли `superadmin`/`admin`).
- OAuth/OIDC и прочие провайдеры — только seam, без реализаций.
- Самостоятельная регистрация, сброс пароля, email-флоу — нет (юзеры создаются вручную).
- Логика наследования подразделений (parent → child resolution) — нет (даже колонку не добавляем).
- SKU merge-resolution (слияние org-базы и subdivision-override) — только схема, без логики.
- Мгновенный глобальный отзыв access-токенов (denylist) — нет; митигация = короткий TTL + отзыв refresh.

---

## 2. Доменная модель

**Ключевое отличие от прежней модели `tenant_id`:**
- `tenant` = **организация**. `organization_id` — жёсткая граница изоляции, денормализуется в **каждую** операционную строку (прямая фильтрация без джойнов; задел под Postgres RLS позже).
- `subdivision_id` — раздел внутри тенанта (атрибуция + контроль доступа).
- **`users` — ГЛОБАЛЬНАЯ таблица, без `organization_id`** (Slack-модель: личность одна, тенант несёт *членство*). Логин/email уникальны глобально.

### Сущности

**organizations**
- `id` (uuid, pk)
- `name`
- `legal_name` (nullable)
- `created_at`, `updated_at`

**subdivisions**
- `id` (uuid, pk)
- `organization_id` (FK → organizations, NOT NULL) — граница изоляции
- `name`
- `created_at`, `updated_at`
- unique(`organization_id`, `name`)

**users** (глобальная)
- `id` (uuid, pk)
- `email` (unique, NOT NULL)
- `password_hash` (nullable — под будущие внешние провайдеры; для password-провайдера обязателен)
- `first_name`, `last_name`
- `is_superadmin` (bool, default false)
- `is_active` (bool, default true)
- `created_at`, `updated_at`

**memberships** (связь user ↔ subdivision с ролью)
- `id` (uuid, pk)
- `user_id` (FK → users, NOT NULL)
- `subdivision_id` (FK → subdivisions, NOT NULL)
- `role` (enum `Role`: `admin` — пока единственная назначаемая роль)
- `created_at`, `updated_at`
- unique(`user_id`, `subdivision_id`)
- Организация выводится через `subdivision.organization_id` (не денормализуем в membership).

**refresh_sessions** (серверная сессия refresh-токена)
- `id` (uuid, pk)
- `user_id` (FK → users)
- `token_hash` (хэш opaque refresh-токена; сам токен не хранится)
- `active_subdivision_id` (FK → subdivisions, nullable) — контекст для восстановления при рефреше
- `family_id` (uuid) — цепочка ротации для reuse-detection
- `expires_at` (sliding, +30 мин при каждой ротации)
- `revoked` (bool, default false)
- `created_at`, `updated_at`

### Изменения существующих таблиц (миграция)
- `invoices`: `tenant_id` → переименовать в `organization_id`; **добавить** `subdivision_id` (FK, NOT NULL после backfill).
- `invoice_lines`: денормализовать `organization_id` + `subdivision_id` (прямая фильтрация по границе).
- `suppliers`: `tenant_id` → `organization_id` (общий для организации; без `subdivision_id`).
- `system_settings`: оставить как операторские глобальные (НЕ тенантные); `ai_vpn_enabled` управляется супер-админом SQLAdmin, не прикладным юзером.
- SKU-маппинг (когда модуль появится): `organization_id` (NOT NULL) + `subdivision_id` (**nullable** override). Логику слияния не реализуем.

> Миграция Alembic: переименование колонок + backfill (один дефолтный org/subdivision для существующих данных) + расстановка NOT NULL после backfill. Помнить про `downgrade()`.

---

## 3. Доменные правила

- **Супер-админ** (`is_superadmin=true`): бог-режим. Видит и переключается в **любую** организацию/подразделение независимо от членства. В любом подразделении трактуется как `admin`.
- **Admin** (через membership): полный доступ в пределах **своего** подразделения.
- Обычный доступ к данным **всегда** ограничен `organization_id` активного контекста (жёсткая граница) и далее `subdivision_id` где применимо.
- Пользователь без активного членства и не супер-админ → войти может, но активного контекста нет → доступ к тенантным данным закрыт, фронт показывает «нет доступных подразделений».

---

## 4. Архитектура авторизации (два раздельных слоя)

**Слой 1 — AuthProvider (проверка личности), за seam-ом:**
```python
# app/auth/base.py
class AuthProvider(Protocol):
    name: str
    async def authenticate(self, credentials: dict) -> User | None: ...
```
- Единственная реализация: `PasswordAuthProvider` (`app/auth/password.py`), хэш argon2 (argon2-cffi). Альтернативных реализаций НЕ писать.

**Слой 2 — Session/Token (общий для всех провайдеров, НЕ часть провайдера):**
- `app/auth/tokens.py` — выпуск/верификация JWT-access (PyJWT), генерация и ротация refresh, reuse-detection по `family_id`.
- `app/auth/cookies.py` — установка/очистка кук, флаги из env.
- Любой провайдер на выходе даёт `User` → дальше единый код выпускает токены и ставит куки.

### JWT access-токен
- TTL: **15 мин** (env `ACCESS_TOKEN_TTL_MIN=15`).
- Payload: `sub` (user_id), `is_superadmin`, `org` (active_organization_id), `sub_div` (active_subdivision_id | null), `role` (роль в активном подразделении; для супер-админа = `admin`), `type="access"`, `iat`, `exp`.
- На каждом запросе авторизация решается из этого подписанного токена (stateless), без обращения к БД за контекстом.

### Refresh-токен
- Opaque случайная строка (НЕ JWT), хранится только как хэш в `refresh_sessions`.
- TTL: **30 мин, скользящий** (env `REFRESH_TOKEN_TTL_MIN=30`) — при каждой ротации `expires_at` сдвигается на +30 мин.
- Ротация: при `/auth/refresh` старый помечается `revoked`, выпускается новый в той же `family_id`.
- **Reuse-detection:** предъявлен уже отозванный токен из семьи → отозвать **всю** `family_id` (признак кражи) и потребовать повторный вход.
- Active context дублируется в `refresh_sessions.active_subdivision_id` — чтобы при рефреше восстановить контекст в новом access-токене.

---

## 5. Куки и CORS (mobile-first)

Флаги — через env, чтобы прод включал Secure без рефактора:
- `COOKIE_SECURE` (env, default локально `false`) — на проде `true`.
- `COOKIE_SAMESITE` (env, default `lax`).
- `HttpOnly` — всегда `true` для обоих токенов.

**Почему так для PWA по WiFi:** `site` в SameSite — это схема+хост (порт не учитывается). PWA `http://192.168.x.x:5173` и API `http://192.168.x.x:8000` — **один site**, поэтому `SameSite=Lax` куки ходят между ними по обычному HTTP без Secure. Условие: **оба на одном LAN-IP** (разные порты допустимы).

**CORS:** `Access-Control-Allow-Credentials: true` + конкретный origin (НЕ `*`); origin'ы из `CORS_ORIGINS`. Фронт шлёт запросы с `credentials: 'include'`.

**CSRF:** `SameSite=Lax` гасит основную часть. Для кросс-origin меняющих состояние запросов заложить CSRF-токен (double-submit) — реализовать минимально, включаемо флагом `CSRF_ENABLED` (на локалке можно off).

---

## 6. Эндпоинты `/auth/*`

**`POST /auth/login`** — `{ email, password }`
- Через `AuthProvider.authenticate`. При успехе: определить активный контекст по умолчанию (первое доступное членство; супер-админ без членств → первое подразделение в системе или null), создать `refresh_session`, выпустить access+refresh, поставить обе куки.
- Ответ: `{ user, active_context }`. Невалидные креды → 401 (без раскрытия, что именно неверно).

**`POST /auth/logout`**
- Отозвать текущий `refresh_session` (`revoked=true`), очистить обе куки. 204.

**`POST /auth/refresh`**
- Прочитать refresh-куку → валидировать (есть, не истёк, не revoked). При reuse → отозвать семью, 401.
- Ротация refresh (новый в той же семье, `expires_at` +30 мин), выпуск нового access с контекстом из `refresh_session.active_subdivision_id`. Обновить обе куки. 204 (или `{ active_context }`).

**`GET /auth/me`**
- Возвращает:
```json
{
  "user": { "id", "first_name", "last_name", "email", "is_superadmin" },
  "active_context": { "organization_id", "organization_name",
                      "subdivision_id", "subdivision_name", "role" },
  "organizations": [
    { "id", "name", "subdivisions": [ { "id", "name", "role" } ] }
  ]
}
```
- Обычный юзер: `organizations` = только подразделения с членством. **Супер-админ: всё дерево** организаций/подразделений (role = `admin`).
- Это единственный источник данных для сайдбара.

**`POST /auth/switch-context`** — `{ subdivision_id }`
- Проверить доступ: членство в этом подразделении ИЛИ `is_superadmin`. Иначе 403.
- Определить роль (супер-админ → `admin`), обновить `refresh_session.active_subdivision_id`, выпустить новый access с новым контекстом, обновить куку.
- Ответ: новый `active_context`.

---

## 7. Enforcement скоупа (non-negotiable)

- `app/auth/dependencies.py`: `get_current_context()` — FastAPI dependency, верифицирует access-JWT из куки и возвращает `RequestContext { user_id, is_superadmin, organization_id, subdivision_id, role }`.
- **Репозитории требуют скоуп в сигнатуре** — нельзя выполнить тенантный запрос без `organization_id`. Метод репозитория принимает `ctx`/`organization_id` явно; запросы фильтруются по `organization_id` (жёстко) и `subdivision_id` (где применимо).
- Защищённые роуты зависят от `get_current_context`; публичные (`/auth/login`, health) — нет.
- Авторизационные проверки (`admin`/`superadmin`) — отдельные dependency поверх контекста.
- Это покрывается тестами на изоляцию (см. §9) и должно блокировать merge.

---

## 8. Frontend (сайдбар, React + FSD)

Низ сайдбара, **сверху вниз**: переключатель контекста → меню юзера.

- **Переключатель:** дропдаун подразделений, **сгруппированных по организациям** (данные из `/auth/me.organizations`). Выбор → `POST /auth/switch-context` → инвалидировать RTK Query кэш (`me` + тенантные данные) → ре-рендер. Активное подразделение подсвечено.
- **Меню юзера:** имя + фамилия; **строкой ниже — роль для текущего подразделения** (`active_context.role`). Для супер-админа можно пометить контекст как god-mode.
- Если у юзера одно подразделение — дропдаун всё равно рендерится (seam), просто с одним пунктом.
- 401 на тенантных запросах → попытка `/auth/refresh`; если и он 401 → редирект на логин.

---

## 9. Тестирование

**Non-negotiables (обязательны, блокируют merge):**
- **Изоляция тенантов:** юзер организации A НЕ получает данные организации B ни на одном тенантном эндпоинте (главный тест безопасности — несколько кейсов).
- Запрос без валидного access → 401; с истёкшим → 401 (до рефреша).
- `switch-context` в чужое подразделение без членства и без superadmin → 403; супер-админ → ок.
- Refresh: ротация выдаёт новый токен и сдвигает окно; **reuse отозванного → отзыв всей семьи + 401**.
- Sliding idle: активность в пределах 30 мин держит сессию; «бездействие» > 30 мин → рефреш невозможен.
- Контекст в access-JWT соответствует активному подразделению; после switch — обновлён.
- Репозиторий нельзя вызвать без скоупа (контрактный тест).

**Стек/приёмы:** как в основной спеке (pytest-asyncio, реальный Postgres+pgvector через testcontainers, respx). Хелперы-фикстуры: создать org/subdivision/user/membership, залогинить, получить куки.

**Покрытие:** ядро auth (`tokens`, `dependencies`, `password`, репозитории со скоупом) — критические пути 100%, остальное ≥ порога ядра из основной спеки.

---

## 10. Конфигурация (добавления в .env)

```dotenv
# Auth
JWT_SECRET=change_me
ACCESS_TOKEN_TTL_MIN=15
REFRESH_TOKEN_TTL_MIN=30
AUTH_PROVIDER=password

# Cookies (mobile-first defaults)
COOKIE_SECURE=false          # прод: true
COOKIE_SAMESITE=lax
CSRF_ENABLED=false           # прод: true
```

---

## 11. Создание пользователей (вручную)

- Через SQLAdmin (CRUD по `users`/`organizations`/`subdivisions`/`memberships`) с хэшированием пароля argon2 при сохранении, либо seed-скрипт.
- **SQLAdmin-операторский вход (для тебя) и прикладная авторизация — РАЗДЕЛЬНЫ.** SQLAdmin = операторский бэкдор разработчика; `users` = реальные пользователи кофеен. Не смешивать механизмы входа.

---

## 12. Порядок выполнения для агента

1. Модели: `Organization`, `Subdivision`, `User` (глобальная), `Membership`, `RefreshSession`; enum `Role`.
2. Миграция: новые таблицы + переименование `tenant_id`→`organization_id`, добавление `subdivision_id`, backfill, NOT NULL; `downgrade()`.
3. `app/auth/base.py` (AuthProvider Protocol) + `password.py` (argon2).
4. `tokens.py` (JWT access, opaque refresh, ротация, reuse-detection) + `cookies.py` (env-флаги).
5. `dependencies.py` (`get_current_context`, проверки ролей) + обновить репозитории под обязательный скоуп.
6. `router.py`: `/auth/login|logout|refresh|me|switch-context`.
7. CORS с credentials; CSRF (минимально, за флагом).
8. SQLAdmin ModelView для новых сущностей + argon2 при создании юзера.
9. Frontend: переключатель (группировка по орг) + меню юзера (имя, роль); switch-флоу с инвалидацией кэша; авто-refresh на 401.
10. Тесты §9 (приоритет — изоляция тенантов).
11. Критерии приёмки §13.

---

## 13. Критерии приёмки

- [ ] Можно вручную создать org → subdivision → user → membership; войти по email+password.
- [ ] После логина стоят HttpOnly access+refresh куки; защищённые роуты доступны.
- [ ] Access-JWT несёт `org`/`sub_div`/`role`; авторизация запроса решается без БД-lookup контекста.
- [ ] `/auth/me` возвращает членства, сгруппированные по организациям; супер-админ — всё дерево.
- [ ] `switch-context` перевыпускает access с новым контекстом; чужое подразделение без прав → 403.
- [ ] Активность держит сессию через молчаливый refresh; idle > 30 мин → повторный вход.
- [ ] Reuse отозванного refresh → отзыв всей семьи + 401.
- [ ] **Юзер организации A не видит данные организации B ни на одном тенантном эндпоинте.**
- [ ] PWA по LAN-IP (один хост, порты 5173/8000) логинится и держит сессию на HTTP с `Lax`+`Secure=false`.
- [ ] Сайдбар: переключатель (группировка по орг) над меню юзера; в меню — имя + роль текущего подразделения.
- [ ] SQLAdmin-вход и прикладная авторизация работают раздельно.
- [ ] Тесты §9 зелёные; покрытие критических путей auth = 100%.

---

## 14. Отложено (явные будущие триггеры)

- Наследование подразделений (`parent_subdivision_id` + resolution) — добавляется отдельной миграцией.
- SKU merge-resolution (org-база + subdivision-override).
- RBAC permission-матрица при появлении ролей помимо admin.
- Внешние auth-провайдеры (OIDC/OAuth) в существующий seam.
- Access denylist для мгновенного отзыва прав (пока — короткий TTL).
- Postgres RLS поверх денормализованного `organization_id`.
