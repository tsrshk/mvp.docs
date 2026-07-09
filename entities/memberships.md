---
id: memberships
type: entity
title: memberships — user↔subdivision membership with a role
status: built
scope: subdivision
table: memberships
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:146-170, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# memberships · membership and role

**Scope:** subdivision · **Status:** built

## Purpose
A many-to-many link between [[users]] and [[subdivisions]] with a role. The organization is
derived via the subdivision (not stored in the row). The membership role is `admin` (the
only assignable role; `superadmin` is a global flag on the user, not here). See [[admin]],
[[member]].

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `user_id` | uuid FK→users | no | `ondelete="CASCADE"`, indexed |
| `subdivision_id` | uuid FK→subdivisions | no | `ondelete="CASCADE"`, indexed |
| `role` | enum `role` | no | default `admin`; enum = {`admin`} |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `user_id → users.id` **CASCADE**; FK `subdivision_id → subdivisions.id` **CASCADE**.
- **Uniqueness:** `memberships_user_subdivision` UNIQUE(`user_id`, `subdivision_id`) —
  one membership per user per subdivision.
- `role` — PG enum `role`; Phase 1 contains only `admin` (see `Role` StrEnum).

## Used by features
[[LCOS-F1-multitenancy]] (which tenants/locations are available to the user), [[LCOS-F2-app-auth]] (the list of
memberships drives switch-context and the active org/subdivision/role in the access JWT).

## Sources
- `mvp.be/app/db/models.py:146-170` (`Membership` model), `:45-46` (`Role`)
- [[auth]], [[architecture]] — data-model
