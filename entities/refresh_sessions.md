---
id: refresh_sessions
type: entity
title: refresh_sessions — серверная сессия refresh-токена
status: built
scope: global
table: refresh_sessions
pk: id (uuid)
used_by: ["[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]"]
sources: [mvp.be/app/db/models.py:173-192, "archive/lcos-auth-multitenancy-spec.md §3.2"]
updated: 2026-07-09
---
# refresh_sessions · сессия refresh-токена

**Scope:** global (привязана к [[users]], не к арендатору) · **Status:** built

## Назначение
Серверная запись непрозрачного refresh-токена. Хранится только **хэш** токена (не сам
токен). Скользящее окно (30 мин простоя), ротация при refresh и детекция повторного
использования по `family_id`. Активный контекст org/subdivision дублируется здесь, чтобы
восстанавливать его при refresh (см. [[auth]]).

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `user_id` | uuid FK→users | no | `ondelete="CASCADE"`, индексируется |
| `token_hash` | varchar(128) | no | **UNIQUE**; хэш непрозрачного refresh, не сам токен |
| `active_subdivision_id` | uuid FK→subdivisions | yes | `ondelete="SET NULL"` — активный контекст |
| `family_id` | uuid | no | индексируется; цепочка ротации → детекция повторного использования |
| `expires_at` | timestamptz | no | абсолютный TTL |
| `last_used_at` | timestamptz | yes | обновляется при ротации; NULL до первой |
| `revoked` | boolean | no | default false; отзыв всего семейства при повторном использовании |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `user_id → users.id` **CASCADE**.
- FK `active_subdivision_id → subdivisions.id` **SET NULL** (удаление локации не
  ломает сессию, лишь сбрасывает контекст).
- **Уникальность:** `token_hash` уникален.
- `family_id` индексируется — всё семейство токенов отзывается при обнаружении повторного
  использования уже ротированного токена.

## Используется фичами
[[LCOS-F2-app-auth]] (JWT+refresh: скользящее окно, ротация, детекция повторного использования, восстановление
активного контекста).

## Источники
- `mvp.be/app/db/models.py:173-192` (модель `RefreshSession`)
- [[auth]] — sliding idle §3.2
