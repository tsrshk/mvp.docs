---
id: LCOS-F16
type: feature
title: Ingredient cache (draft-only, non-authoritative)
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[ingredient_cache]]", "[[sku_mapping]]", "[[invoice_lines]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[sku-identity-resolver]]", "[[fail-closed]]", "[[erp-esupl-integration]]"]
adrs: ["[[DEC-0011]]", "[[ADR-018]]", "[[DEC-0013]]"]
legacy_refs: [DEC-0011, DEC-0013, "VER-022", "DEFER-016"]
sources: ["APP_OVERVIEW.md §7 §11", "04_DECISIONS__DEC-0011.md", "mvp.be app/db/models.py:432", "mvp.be app/services/invoice_service.py:295"]
updated: 2026-07-09
---
# LCOS-F16 · Ingredient cache (draft-only, non-authoritative)

**Epic:** [[LCOS-E3-sku-identity]] · **Status:** built · **Phase:** Phase 1

## Description

`ingredient_cache` is the **non-authoritative, rebuildable** snapshot of POS ingredient master data. It exists to serve the tolerant draft/display tier cheaply, and it is architecturally defined so that it can **never** compromise the moat. Two design invariants carry the whole feature (`[[DEC-0011]]`):

1. **No FK from the moat to the cache.** `sku_mapping.pos_ingredient_id` is a durable POS id *string* with no foreign key to `ingredient_cache.id` (a surrogate PK). Therefore the cache can be dropped and rebuilt whole without orphaning a single mapping — the moat survives a stale catalog because it is anchored to the durable POS id, not to cached attributes.
2. **Absent from the commit path.** The fail-closed commit resolver (`_resolve_commit_identities`, see [[LCOS-F13-sku-identity-resolver]]) reads authority *only* from `sku_mapping` and does live POS validation; it never reads the cache. This closes **VER-022** — the old "cache is org-only" scope-asymmetry cannot recur, because the cache is not a commit tier at all (`[[DEC-0013]]`).

The cache is scope-aware (`scope_type`, `scope_id`) with `UNIQUE(scope_type, scope_id, pos_ingredient_id)`, holds a snapshot (`name`, `unit`, `category`), change-detection columns (`pos_version`, `content_hash`), a soft-delete flag (`is_active`, if POS removed the item), and `synced_at`.

> **As-built scope note.** What is *built and enforced* here is the durable-identity **architecture**: the table, its uniqueness, the no-FK invariant, and its deliberate absence from the commit path. The live *population/read* path is **not yet wired** — no service currently reads or writes `ingredient_cache`, and today's draft-resolve reads the [[LCOS-F15-sku-catalog]] `ingredients` table directly. The cache is a provisioned, invariant-guarded seam; the sync strategy (lazy TTL refresh + forced refresh on invoice open + revalidation on commit) is specified in `[[DEC-0011]]` and deferred, with delta-sync/webhooks tracked as DEFER-016.

## Capabilities

- Non-authoritative snapshot of POS ingredient master data: `name`, `unit`, `category`, `pos_version`/`content_hash` (change detection), `is_active` (soft-delete), `synced_at`.
- Scope-aware isolation: `scope_type`/`scope_id` with `UNIQUE(scope_type, scope_id, pos_ingredient_id)`.
- Anchored on the durable `pos_ingredient_id`; **no** FK from `sku_mapping` → the cache is fully rebuildable (drop + rebuild) without losing mappings.
- Draft-only by design: intended for the tolerant draft/display tier; explicitly **not** a commit-path authority (`[[DEC-0011]]` / `[[DEC-0013]]`).
- VER-022 closed: the cache is off the commit path entirely, so no scope-asymmetry between draft and commit is possible.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | No direct UI; when populated, cached master data only informs the tolerant draft display within their scope. |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved. |

The cache is an internal acceleration/display seam — it has no dedicated tenant-facing endpoint and never gates a send.

## Involved entities

- [[ingredient_cache]] — the non-authoritative snapshot; scope-aware; `UNIQUE(scope_type, scope_id, pos_ingredient_id)`; surrogate PK is never a mapping target.
- [[sku_mapping]] — deliberately has **no** FK to the cache; anchored on the durable POS id so it survives a cache rebuild.
- [[invoice_lines]] — snapshots the durable `pos_ingredient_id` at commit, so a committed line likewise survives a cache rebuild.
- [[subdivisions]], [[organizations]] — the `(scope_type, scope_id)` the cache is partitioned by.

## Dependencies / links

- **Requirements:** [[sku-identity-resolver]] (defines the cache as the draft tier, never commit authority), [[fail-closed]] (commit reads authority only from confirmed `sku_mapping` + live POS), [[erp-esupl-integration]] (the read-only source a future sync would pull from).
- **Features:** [[LCOS-F13-sku-identity-resolver]] (the commit resolver that deliberately excludes the cache), [[LCOS-F15-sku-catalog]] (the `ingredients` table that actually backs draft-resolve today), [[LCOS-F14-learning-loop]] (the moat that must survive cache rebuild), [[LCOS-F11-esupl-read]] (the POS read seam).
- **ADR:** [[DEC-0011]] (POS = SoT; cache non-authoritative + rebuildable; no FK), [[ADR-018]] (commit trusts only confirmed mappings), [[DEC-0013]] (variant A — cache exact-match never auto-commits/auto-creates a mapping).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `ingredient_cache` exists with `scope_type`, `scope_id`, `pos_ingredient_id`, snapshot fields (`name`/`unit`/`category`), change-detection (`pos_version`/`content_hash`), `is_active`, `synced_at`, and `UNIQUE(scope_type, scope_id, pos_ingredient_id)`.
- [ ] AC-BE-2. `sku_mapping` has **no** FK to `ingredient_cache` (schema test `test_mapping_has_no_fk_to_cache`).
- [ ] AC-BE-3. The commit path reads no authority (existence / unit) from the cache — the commit resolver reads only `sku_mapping` and validates live against POS (`[[DEC-0011]]` / `[[DEC-0013]]`).
- [ ] AC-BE-4. Dropping and rebuilding `ingredient_cache` leaves `sku_mapping` intact and resolvable (`test_cache_rebuild_preserves_mappings`).
- [ ] AC-BE-5. VER-022 regression: the cache is absent from the commit path, so no draft/commit scope-asymmetry exists.
- [ ] AC-BE-6. A cache exact-match without a commit-eligible mapping does **not** auto-commit and does **not** create a mapping (variant A, `[[ADR-018]]`) — covered by the merge-gate test.

### Frontend
- [ ] AC-FE-1. No dedicated cache UI: cached master data (once a population path exists) may inform the tolerant draft display only, and never gates or auto-confirms a send.

### Other
- [ ] AC-OTHER-1. Cache invariants are pinned by `merge_gate` tests (`test_mapping_has_no_fk_to_cache`, `test_cache_rebuild_preserves_mappings`).

## Open questions / gates

- **Population/read not wired** — no service currently reads or writes `ingredient_cache`; draft-resolve uses the [[LCOS-F15-sku-catalog]] `ingredients` table directly. The table is a provisioned, invariant-guarded seam.
- **Sync strategy deferred** — lazy TTL refresh + forced refresh on invoice open + revalidation on commit is specified in `[[DEC-0011]]` but not implemented; delta-sync/webhooks = DEFER-016 (until a volume/frequency trigger).
- **VER-021** — durability of `pos_ingredient_id` is the lynchpin the whole non-authoritative model rests on; empirically unconfirmed, owner-run, merge gated.

## Sources

- `APP_OVERVIEW.md §7` (`ingredient_cache` non-authoritative, draft-only, rebuildable; VER-022 closed), `§11` (data model).
- `04_DECISIONS__DEC-0011.md` (non-authoritative cache; MUST-NOT FK to cache; MUST be rebuildable; commit reads no authority from cache; sync strategy + DEFER-016).
- `mvp.be/app/db/models.py:432` (`IngredientCache`: scope-aware, `UNIQUE(scope_type, scope_id, pos_ingredient_id)`), `:464` (`SkuMapping` — durable POS id string, no FK to cache).
- `mvp.be/app/services/invoice_service.py:295` (`_resolve_commit_identities` reads only `sku_mapping`), `:343` (`_validate_ingredients_on_commit`, live POS, cache absent).
</content>
