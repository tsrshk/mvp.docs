---
id: memberships
type: entity
title: memberships — членство user↔subdivision с ролью
status: built
scope: subdivision
table: memberships
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:146-170, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# memberships · членство и роль

**Scope:** subdivision · **Status:** built

## Назначение
Связь many-to-many между [[users]] и [[subdivisions]] с ролью. Организация
выводится через subdivision (в строке не хранится). Роль членства — `admin` (единственная
назначаемая роль; `superadmin` — глобальный флаг на пользователе, не здесь). См. [[admin]],
[[member]].

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `user_id` | uuid FK→users | no | `ondelete="CASCADE"`, индексируется |
| `subdivision_id` | uuid FK→subdivisions | no | `ondelete="CASCADE"`, индексируется |
| `role` | enum `role` | no | default `admin`; enum = {`admin`} |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `user_id → users.id` **CASCADE**; FK `subdivision_id → subdivisions.id` **CASCADE**.
- **Уникальность:** `memberships_user_subdivision` UNIQUE(`user_id`, `subdivision_id`) —
  одно членство на пользователя в одном subdivision.
- `role` — PG-энум `role`; Фаза 1 содержит только `admin` (см. `Role` StrEnum).

## Используется фичами
[[LCOS-F1-multitenancy]] (какие арендаторы/локации доступны пользователю), [[LCOS-F2-app-auth]] (список
членств управляет switch-context и активными org/subdivision/role в access JWT).

## Источники
- `mvp.be/app/db/models.py:146-170` (модель `Membership`), `:45-46` (`Role`)
- [[auth]], [[architecture]] — data-model
