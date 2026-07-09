---
id: role-supplier-future
type: role
title: supplier (future role — schema seam only, ADR-017)
status: future
plane: app-plane (planned) — behavior NOT built
identity: Role.supplier (enum seam value) + suppliers.portal_user_id → users.id (nullable, seam)
sources:
  - 04_DECISIONS.md ADR-017 (Supplier self-service: door left open)
  - 08_PHASE1_SPEC.md F2.3, 07_PHASES.md Э2
  - db/models.py (Role enum seam, Supplier.portal_user_id)
updated: 2026-07-09
---
# supplier-future

**Plane:** app-plane (in the future) · **Status:** 🔭 future — **schema seam only, no behavior** · **Basis:** [[ADR-017]].

## Who this is (in the future)
An external supplier who fills in their own settings — delivery schedule, minimum order amount, price list. In Phase 1 such a subject **does not exist at runtime**: the portal is not being built, so as not to scatter the solo developer's focus ("one routine at a time"). Only a **door** is laid in — cheap now, an expensive schema migration later.

## What exactly is laid in (seam), and what is NOT
**Laid in (schema-only):**
- The `supplier` value in enum `Role` (migration `ALTER TYPE role ADD VALUE 'supplier'` — a seam).
- Nullable FK `suppliers.portal_user_id → users.id` on the [[suppliers]] card.
- A dedicated supplier settings table (`supplier_settings` per the ADR) — the very one the supplier themselves later edits; the terms live separately from `suppliers`, which remains a mirror of Esupl.

**NOT built (deferred):**
- No routes, no UI, no branches in auth under `supplier`.
- A global supplier user, invite tokens, an access scope of "only your own settings".

> Correctness (doc↔code): in the current `Role` enum there is effectively **a single value `admin`** (see [[admin]]); the `supplier` value is a planned seam from ADR-017, not an active role. The front-matter `identity` describes the target schema, not what already gates access. If the enum value has not yet been added in the code — this remains a backlog migration, behavior does not change.

## Authentication plane (target)
When the portal is built — app-plane: a separate class of application user (a global supplier user), login via the application auth, scope "only your own settings". This is NOT [[sqladmin-operator]] and not a full tenant [[admin]]/[[member]]. For now — none of this is active.

## Capabilities
None. In Phase 1 the role grants nothing and is assigned to no one. This section exists to record the seam and its boundaries, not current rights.

## Features granting/using the role
- [[LCOS-F19-supplier-self-service]] — the seam itself (enum value + `portal_user_id` + ADR record), epic [[LCOS-E4-suppliers]].
- The target behavior belongs to Phase 2 — self-service onboarding ([[LCOS-E15-saas]] / F67), where the supplier portal may be built out.

## Relations / requirements
[[ADR-017]] · [[suppliers]] · [[supplier-criteria-registry]] · [[users]] · [[admin]] · [[member]]

## Sources
- `04_DECISIONS.md` §ADR-017 (lines 135–140) — "door left open, portal not built"; deferred: a global supplier user, invite tokens, the scope "only your own settings".
- `08_PHASE1_SPEC.md` F2.3 (supplier self-service seam), `07_PHASES.md` Э2 (lines 53–57, 138).
- `09_PHASE1_TASKS.md` F2.3 (T-2.3.1 enum/FK migration, T-2.3.2 ADR).
- `APP_OVERVIEW.md` §Phase 1 Non-goals (supplier portal — schema seam only, ADR-017).
