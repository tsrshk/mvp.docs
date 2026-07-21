---
id: memberships
type: entity
title: memberships — членство user↔организация[↔подразделение] с ролью
status: built
scope: org
table: memberships
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]", "[[LCOS-F76-user-org-management]]"]
requirements: ["[[auth]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py, mvp.be/alembic/versions/0024_membership_org_level_roles.py, "[[ADR-023]]"]
updated: 2026-07-21
---
# memberships · членство и роль

**Scope:** org (org-level либо subdivision-level) · **Status:** built

## Назначение
Связь между [[users]] и организацией с ролью. Членство ВСЕГДА привязано к
[[organizations]] (`organization_id`, NOT NULL); подразделение — опционально
(`subdivision_id` NULLable). `subdivision_id IS NULL` ⇒ роль действует на **всю
организацию** (все подразделения, включая орг ещё без подразделений); заполнено ⇒ роль
ограничена конкретным [[subdivisions|подразделением]]. Роли membership — enum `role` =
`{admin, manager}` (ADR-023); `superadmin` — платформенный флаг на [[users]], не здесь.
См. [[admin]], [[manager]], [[member]].

## Ключевые поля
| Поле | Тип | Null | Примечания |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `user_id` | uuid FK→users | no | `ondelete="CASCADE"`, индексируется |
| `organization_id` | uuid FK→organizations | no | `ondelete="CASCADE"`, индексируется; org-якорь членства |
| `subdivision_id` | uuid FK→subdivisions | **yes** | `ondelete="CASCADE"`; NULL ⇒ роль на всю организацию |
| `role` | enum `role` | no | default `admin`; enum = {`admin`, `manager`} |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Отношения, FK, уникальность
- FK `user_id → users.id` **CASCADE**; `organization_id → organizations.id` **CASCADE**;
  `subdivision_id → subdivisions.id` **CASCADE**.
- **Уникальность:**
  - `memberships_user_subdivision` UNIQUE(`user_id`, `subdivision_id`) — одно
    subdivision-членство на пользователя в подразделении (NULL-и в PG различимы, поэтому
    эта констрейнта НЕ ловит дубли org-level строк);
  - partial-unique `uq_memberships_user_org_level` (`user_id`, `organization_id`)
    `WHERE subdivision_id IS NULL` — не более одного org-level членства на пару (user, org).
- **Инвариант:** если `subdivision_id` задан, он должен принадлежать `organization_id`
  (проверяется в сервисном слое — routes/users, routes/organizations).
- `role` — PG-энум `role` = `{admin, manager}` (значение `manager` добавлено миграцией
  `0024`; ту же миграцию бэкфиллит `organization_id` из подразделения существующих строк).

## Используется фичами
[[LCOS-F1-multitenancy]] (какие арендаторы/локации доступны пользователю),
[[LCOS-F2-app-auth]] (список членств управляет switch-context и активными
org/subdivision/role в access JWT), [[LCOS-F76-user-org-management]] (назначение ролей —
CRUD членств из приложения; авторизация «сверху вниз» по org-поддереву).

## Источники
- `mvp.be/app/db/models.py` (модель `Membership`, `Role`), `alembic/versions/0024_*`
- [[ADR-023]], [[auth]], [[multitenancy]]
