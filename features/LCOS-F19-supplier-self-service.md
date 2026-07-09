---
id: LCOS-F19
type: feature
title: Supplier self-service seam (schema door, no portal)
epic: "[[LCOS-E4-suppliers]]"
status: planned
phase: "Phase 1"
roles: [supplier-future, admin, superadmin]
entities: ["[[suppliers]]", "[[users]]"]
requirements: ["[[multitenancy]]", "[[auth]]"]
adrs: ["[[ADR-017]]"]
legacy_refs: ["08 F2.3", "07 Э2", "plan F3"]
sources: ["04_DECISIONS.md ADR-017", "08_PHASE1_SPEC.md F2.3", "APP_OVERVIEW.md §13 (non-goals)", "mvp.be app/db/models.py:45"]
updated: 2026-07-09
---
# LCOS-F19 · Supplier self-service seam (schema door, no portal)

**Epic:** [[LCOS-E4-suppliers]] · **Status:** planned · **Phase:** Phase 1

## Description

In the future a supplier fills in their own conditions themselves — delivery schedule, minimum order amount, price list — instead of the owner transcribing them. Building that portal in Phase 1 would scatter a solo developer's focus ("one routine at a time"), so the decision ([[ADR-017]], accepted) is to lay only a cheap **schema door**, not behaviour: the migration to add the enum value and the FK is cheap now and expensive later.

The planned seam is minimal: a `supplier` value in the `Role` enum, and a nullable `suppliers.portal_user_id → users.id` FK (the account that would later log in as that supplier). No routes, no UI, no branches in auth. Deferred explicitly: a global supplier user, invite tokens, and the "own settings only" access scope. Target behaviour belongs to Phase 2 self-service onboarding ([[LCOS-F67-onboarding]]).

**Doc ↔ code correction:** as of the current codebase the seam is **not yet migrated** — `Role` (`app/db/models.py:45`) carries only the active roles, and `suppliers` has **no `portal_user_id`** column. So F19 is genuinely planned: even the schema door is a backlog migration, not built. Note also that ADR-017 anticipated a separate `supplier_settings` table as the thing a supplier would later edit; the as-built path instead keeps flexible conditions on `suppliers.criteria` (see [[LCOS-F18-supplier-criteria]]), so when the portal is built the editable surface is the supplier card + its `criteria`, not a separate settings table.

## Capabilities

- (Planned) `supplier` value in the `Role` enum — schema seam only, never assigned or gated in Phase 1.
- (Planned) Nullable FK `suppliers.portal_user_id → users.id` (`ON DELETE SET NULL`) on the supplier card.
- ADR-017 recorded as the accepted decision defining what is deferred (global supplier user, invite tokens, "own settings only" scope).
- **Not** built: no supplier-facing routes, no UI, no auth branches for `supplier`.

## Access by role

| Role | What they can do |
|---|---|
| [[supplier-future]] | Nothing in Phase 1 — the role grants no capability and is assigned to no one. The seam exists to fix the boundary, not to grant access. |
| [[admin]] | Would, in a future increment, link a supplier card to a portal user (`portal_user_id`); not available in Phase 1. |
| [[superadmin]] | Same, cross-tenant, in the future. |
| [[sqladmin-operator]] | Not involved. |

The target authentication plane is the **app plane** (a distinct application user class, application login, scope "own settings only") — NOT the SQLAdmin operator plane and not a full tenant [[admin]]/[[member]] (see [[auth]]).

## Involved entities

- [[suppliers]] — would gain the nullable `portal_user_id` FK (the linked portal account); the card + its `criteria` are the editable surface a supplier would later own.
- [[users]] — the global user table; a future "supplier" user would be a row here, referenced by `suppliers.portal_user_id` (`SET NULL` on delete).

## Dependencies / links

- **Requirements:** [[multitenancy]] (a future supplier user's scope would be "own settings only", narrower than a tenant member), [[auth]] (target app-plane login; the seam must not add auth branches in Phase 1).
- **Features:** [[LCOS-F18-supplier-criteria]] / [[LCOS-F17-supplier-cards]] (the card + `criteria` that a supplier would edit), [[LCOS-F67-onboarding]] (Phase 2 self-service onboarding where the portal may be completed).
- **ADR:** [[ADR-017]] (accepted — door open, portal not built; enumerates deferred items).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. A migration adds the `supplier` value to the `Role` PG enum via manual `op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'supplier'")` (autogenerate does not detect enum-value additions); `downgrade()` is a no-op with a comment (removing a PG-enum value is unsafe).
- [ ] AC-BE-2. The same migration adds nullable `suppliers.portal_user_id` (FK → `users.id`, `ON DELETE SET NULL`).
- [ ] AC-BE-3. No routes, no UI, no auth branches are added for `supplier` — schema only.
- [ ] AC-BE-4. Migration applies and downgrades cleanly; after it the enum contains `supplier` and the column exists; the full pytest suite stays green (behaviour unchanged).

### Frontend
- [ ] AC-FE-1. No frontend work in Phase 1 (no supplier portal, no login branch, no UI surface).

### Other
- [ ] AC-OTHER-1. ADR-017 section exists and enumerates the deferred scope (global supplier user, invite tokens, "own settings only").

## Open questions / gates

- **Seam not yet in code:** the enum value and `portal_user_id` are a backlog migration, not present today — closing AC-BE-1/2 is the remaining Phase-1 work for this feature.
- **Editable surface divergence:** ADR-017 named a `supplier_settings` table; as-built conditions live on `suppliers.criteria`. A future portal edits the card + `criteria`; reconcile the ADR wording when the portal is built.
- **Target behaviour is Phase 2** — full self-service onboarding is [[LCOS-F67-onboarding]] ([[LCOS-E15-saas]]).

## Sources

- `04_DECISIONS.md ADR-017` (accepted; door open, portal not built; deferred items) → folded into `adr/ADR-017.md`.
- `08_PHASE1_SPEC.md F2.3` (schema seam: enum value + `portal_user_id`; manual `ALTER TYPE`; no routes/UI/auth; ADR requirement).
- `APP_OVERVIEW.md §13` (Phase-1 non-goals: supplier portal is schema seam only, ADR-017).
- `mvp.be/app/db/models.py:45` (`Role` enum — `supplier` value not yet present), `:198` (`Supplier` model — no `portal_user_id` yet).
