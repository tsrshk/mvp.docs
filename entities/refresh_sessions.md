---
id: refresh_sessions
type: entity
title: refresh_sessions — server-side refresh-token session
status: built
scope: global
table: refresh_sessions
pk: id (uuid)
used_by: ["[[LCOS-F2-app-auth]]"]
requirements: ["[[auth]]"]
sources: [mvp.be/app/db/models.py:173-192, lcos-auth-multitenancy-spec.md §3.2]
updated: 2026-07-09
---
# refresh_sessions · refresh-token session

**Scope:** global (bound to [[users]], not to a tenant) · **Status:** built

## Purpose
A server-side record of an opaque refresh token. Only the token **hash** is stored (not the
token itself). Sliding window (30 min idle), rotation on refresh, and reuse detection by
`family_id`. The active org/subdivision context is duplicated here to restore it on refresh
(see [[auth]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid PK | no | `uuid4` |
| `user_id` | uuid FK→users | no | `ondelete="CASCADE"`, indexed |
| `token_hash` | varchar(128) | no | **UNIQUE**; hash of the opaque refresh, not the token itself |
| `active_subdivision_id` | uuid FK→subdivisions | yes | `ondelete="SET NULL"` — active context |
| `family_id` | uuid | no | indexed; rotation chain → reuse detection |
| `expires_at` | timestamptz | no | absolute TTL |
| `last_used_at` | timestamptz | yes | updated on rotation; NULL until the first |
| `revoked` | boolean | no | default false; revoke the whole family on reuse |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- FK `user_id → users.id` **CASCADE**.
- FK `active_subdivision_id → subdivisions.id` **SET NULL** (deleting a location does not
  break the session, it only resets the context).
- **Uniqueness:** `token_hash` unique.
- `family_id` indexed — the entire token family is revoked when reuse of an
  already-rotated token is detected.

## Used by features
[[LCOS-F2-app-auth]] (JWT+refresh: sliding window, rotation, reuse detection, restoration of the
active context).

## Sources
- `mvp.be/app/db/models.py:173-192` (`RefreshSession` model)
- [[auth]] — sliding idle §3.2
