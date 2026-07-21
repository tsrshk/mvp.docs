---
id: users
type: entity
title: users — глобальная идентичность (без organization_id)
status: built
scope: global
table: users
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]", "[[multitenancy]]"]
sources: ["mvp.be/app/db/models.py (class User)", 01_ARCHITECTURE.md#data-model]
updated: 2026-07-16
---
# users · глобальная идентичность

**Scope:** global (единственное исключение среди tenant-таблиц — **без** `organization_id`)
· **Status:** built

## Назначение
Идентичность одна на платформу; арендатор несёт *членство* через [[memberships]]. Email
глобально уникален. Пароль хранится как хэш (argon2, см. [[auth]]); `password_hash`
nullable — заложено под внешних провайдеров. `is_superadmin` — глобальный god-флаг (не
роль членства; см. [[superadmin]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `email` | varchar(320) | no | **глобально UNIQUE** |
| `password_hash` | varchar(512) | yes | argon2; NULL для внешних провайдеров |
| `first_name` / `last_name` | varchar(128) | yes | |
| `is_superadmin` | boolean | no | default false; глобальный god mode ([[superadmin]]) |
| `is_active` | boolean | no | default true; деактивация без удаления |
| `must_change_password` | boolean | no | default false; одноразовый пароль → форс смены при входе (ADR-023; env-bootstrap superadmin, admin-set/reset паролей) |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- **Уникальность:** `email` — `unique=True` (байтовая, неявный `uq_users_email`) **плюс**
  функциональный `uq_users_email_lower` UNIQUE(`lower(email)`) (миграция `0017`, B4 гигиены):
  `Ivan@x` и `ivan@x` — один пользователь. Вход нормализуется (strip+lower) в
  `UserRepository.get_by_email` и seed.
- `memberships` — one-to-many, `cascade="all, delete-orphan"`.
- На `users.id` ссылаются: [[memberships]] (CASCADE), [[refresh_sessions]] (CASCADE),
  [[sku_mapping]] `confirmed_by` (SET NULL).
- Собственного `organization_id` нет — арендатор выводится через membership→subdivision.

## Используется фичами
[[LCOS-F2-app-auth]] (аутентификация, JWT/refresh, switch-context), [[LCOS-F1-multitenancy]] (идентичность vs
арендатор). `is_superadmin` отделяет god mode приложения от операционной плоскости SQLAdmin
([[sqladmin-operator]]).

## Источники
- `mvp.be/app/db/models.py` (`class User`)
- [[auth]], [[architecture]] — data-model
