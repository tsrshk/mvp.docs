---
id: OV-CREATE-USERS
type: guide
title: Как создавать пользователей — первый супер-админ и последующие юзеры
status: current
phase: cross-cutting
updated: 2026-07-21
owner: Ivan
trust_tier: 2
sources:
  - app/bootstrap.py (env-bootstrap первого супер-админа), app/seed.py (демо iter/oter)
  - app/admin/setup.py (SQLAdmin ModelViews, UserAdmin.on_model_change)
  - mvp.be/DEPLOYMENT.md §2.4, mvp.be/README.md §Доступы (DEV)
  - Реализация «env-bootstrap + форс смены пароля» 2026-07-21
---

# Как создавать пользователей

> Операционный how-to для оператора/супер-админа: как появляется **первый** доступ и как
> заводить **последующих** пользователей. Про сами роли — [[superadmin]] · [[admin]] ·
> [[member]] · [[sqladmin-operator]]. Про механизм плоскостей входа — [[auth]], [[ADR-007]].

## Три РАЗДЕЛЬНЫЕ плоскости «первого доступа»

Не смешивать (см. [[sqladmin-operator]]):

| Плоскость | Как задаётся | Что создаёт | Когда |
|---|---|---|---|
| SQLAdmin-оператор | env `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` (**bcrypt**) | вход в `/admin` (НЕ строка в [[users]]) | всегда |
| Демо-seed | `SEED_DEMO_DATA=true` | демо-тенант + `iter`/`oter` | dev / e2e |
| Env-bootstrap | env `BOOTSTRAP_SUPERADMIN_*` | первый прикладной [[superadmin]] (`users`, **argon2**) | прод (пустая БД) |

## 1. Первый супер-админ

### DEV — через демо-seed
`SEED_DEMO_DATA=true` идемпотентно создаёт `iter`/`iter` (супер-админ) и `oter`/`oter`
(admin подразделения). Вход — `POST /api/v1/auth/login`. Ручной перезапуск:
`docker compose run --rm backend python -m app.seed`. Демо-юзеры **не** форсят смену пароля.

### ПРОД — через env-bootstrap (рекомендуется)
В проде `SEED_DEMO_DATA=false`, поэтому `iter` нет. Первого супер-админа заводит
`app/bootstrap.py` при старте:

1. Задать `BOOTSTRAP_SUPERADMIN_EMAIL` + `BOOTSTRAP_SUPERADMIN_PASSWORD` (пароль — plaintext,
   хэшируется argon2 в рантайме).
2. Деплой → на старте `alembic upgrade head` → `app.seed` (в проде пропускается) →
   `app.bootstrap` создаёт супер-админа с `must_change_password=true`.
3. Войти по email+паролю → приложение форсит экран `/change-password` (дальше не пускает,
   пока пароль не сменён).
4. **Убрать** `BOOTSTRAP_SUPERADMIN_*` из окружения.

Свойства: create-once (гейт «есть ли ЛЮБОЙ супер-админ» — рестарты/повторные деплои ничего
не пересоздают), пустой email/пароль ⇒ выключено, пароль в логах не печатается. Детали
деплоя — `mvp.be/DEPLOYMENT.md §2.4`.

### ПРОД — фолбэк через SQLAdmin
Если env-bootstrap не использовался, супер-админа можно создать вручную через `/admin` →
`UserAdmin` (см. §2, поставить `is_superadmin=true`). Такой юзер **не** форсит смену пароля.

## 2. Последующие пользователи — через SQLAdmin `/admin`

Оператор ([[sqladmin-operator]]) входит на `/admin` (env-креды `ADMIN_USERNAME`) и создаёт
сущности в ModelViews. **Порядок важен** — организация → подразделение → пользователь →
членство:

1. **Organization** (`OrganizationAdmin`) — создать организацию ([[organizations]]).
2. **Subdivision** (`SubdivisionAdmin`) — подразделение под этой организацией ([[subdivisions]]).
3. **User** (`UserAdmin`) — пользователь ([[users]]):
   - в поле `password_hash` ввести **plaintext** — оно argon2-хэшируется при сохранении
     (`UserAdmin.on_model_change`; если значение уже выглядит как `$argon2` — оставляется);
   - `is_superadmin` — глобальный флаг (супер-админ, членство не нужно) либо оставить false;
   - `is_active` — активен ли вход.
4. **Membership** (`MembershipAdmin`) — связать `user` + `subdivision`, роль `admin`
   (единственное значение enum в Phase 1) ([[memberships]]).
5. **Проверка** — пользователь входит в приложении по email + пароль (валидирует всю цепочку).

### Роли — шпаргалка
- **[[superadmin]]** = `users.is_superadmin = true` (глобально, без членства).
- **[[admin]]** = `memberships.role = admin` для конкретного подразделения.
- **[[member]]** = любой пользователь с членством.
- Явный non-goal Phase 1: полноценной RBAC-матрицы нет (см. [[auth]]).

### Про `must_change_password`
Пользователи, созданные через SQLAdmin (и демо-seed), **не** форсят смену пароля — флаг по
умолчанию `false`. Его ставит только env-bootstrap первому супер-админу. Юзер может сменить
пароль сам в приложении (иконка «ключ» в меню пользователя → экран `/change-password`).

## Связи
[[superadmin]] · [[admin]] · [[member]] · [[sqladmin-operator]] · [[auth]] · [[users]] ·
[[memberships]] · [[organizations]] · [[subdivisions]] · [[ADR-007]] ·
[[LCOS-F3-sqladmin-operator]] · [[LCOS-F2-app-auth]]
