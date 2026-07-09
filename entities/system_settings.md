---
id: system_settings
type: entity
title: system_settings — non-secret settings (KV, whitelist)
status: built
scope: global
table: system_settings
pk: id (int)
used_by: ["[[LCOS-F3-sqladmin-operator]]", "[[LCOS-F4-config-secrets]]", "[[LCOS-F5-provider-seams]]", "[[LCOS-F6-module-gates]]"]
requirements: ["[[config-secrets]]", "[[provider-abstraction]]", "[[fail-closed]]"]
sources: [mvp.be/app/db/models.py:366-377, mvp.be/CLAUDE.md, 01_ARCHITECTURE.md#data-model]
updated: 2026-07-09
---
# system_settings · non-secret settings

**Scope:** global (deploy-wide KV) · **Status:** built

## Purpose
A key-value store of the application's non-secret settings (the `app_settings` role) with a
whitelist of keys (the `app/core/system_settings` registry). There are **NO secrets here** —
they live in [[integration_credentials]] (see [[config-secrets]], [[secret-encryption]]).
Managed by the superadmin via the **SQLAdmin operator plane** ([[sqladmin-operator]]), not by
an application user.

It holds the runtime provider selection and the module gates: `ai_provider` (resolved by
`core/effective_config.py` — OCR/AI from the DB, not from env; see [[provider-abstraction]]),
`ai_vpn_enabled` (fail-closed VPN egress, [[fail-closed]], [[vpn-egress]]),
`module_*_enabled` (module gates, [[LCOS-F6-module-gates]]).

## Key fields
| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK | no | autoincrement |
| `key` | varchar(128) | no | **UNIQUE**; must be in the whitelist registry |
| `value` | text | yes | serialized value |
| `created_at` / `updated_at` | timestamptz | no | `TimestampMixin` |

## Relations, FK, uniqueness
- **Uniqueness:** `key` unique (`uq_system_settings_key`).
- No FK — a global KV table (without `organization_id`).
- Key validity is enforced not by a DB constraint but by the whitelist of the
  `app/core/system_settings` registry.

## Used by features
[[LCOS-F3-sqladmin-operator]] (SQLAdmin operator plane + config API), [[LCOS-F4-config-secrets]] (three-level config),
[[LCOS-F5-provider-seams]] (provider selection + fail-closed egress: `ai_provider`, `ai_vpn_enabled`),
[[LCOS-F6-module-gates]] (module gates `module_*_enabled`).

## Sources
- `mvp.be/app/db/models.py:366-377` (`SystemSetting` model)
- `mvp.be/CLAUDE.md` (provider implementation selection, module gates)
- [[config-secrets]], [[provider-abstraction]], [[architecture]]
