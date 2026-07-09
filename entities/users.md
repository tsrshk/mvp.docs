---
id: users
type: entity
title: users — global identity (no organization_id)
status: built
scope: global
table: users
pk: id (uuid)
used_by: ["[[LCOS-F1-multitenancy]]", "[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]", "[[multitenancy]]"]
sources: [mvp.be/app/db/models.py:124-143, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# users · global identity

**Scope:** global (the only tenant-table exception — **without** `organization_id`)
· **Status:** built

## Purpose
An identity is one per platform; the tenant carries *membership* via [[memberships]]. Email
is globally unique. The password is stored as a hash (argon2, see [[auth]]); `password_hash`
is nullable — planned for external providers. `is_superadmin` is a global god flag (not a
membership role; see [[superadmin]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `email` | varchar(320) | no | **globally UNIQUE** |
| `password_hash` | varchar(512) | yes | argon2; NULL for external providers |
| `first_name` / `last_name` | varchar(128) | yes | |
| `is_superadmin` | boolean | no | default false; global god mode ([[superadmin]]) |
| `is_active` | boolean | no | default true; deactivation without deletion |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- **Uniqueness:** `email` — `unique=True` (implicit `uq_users_email`).
- `memberships` — one-to-many, `cascade="all, delete-orphan"`.
- `users.id` is referenced by: [[memberships]] (CASCADE), [[refresh_sessions]] (CASCADE),
  [[sku_mapping]] `confirmed_by` (SET NULL).
- No `organization_id` of its own — the tenant is derived via membership→subdivision.

## Used by features
[[LCOS-F2-app-auth]] (authentication, JWT/refresh, switch-context), [[LCOS-F1-multitenancy]] (identity vs
tenant). `is_superadmin` separates the application god mode from the SQLAdmin operator plane
([[sqladmin-operator]]).

## Sources
- `mvp.be/app/db/models.py:124-143` (`User` model)
- [[auth]], [[architecture]] — data-model
