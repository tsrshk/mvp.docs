---
id: REQ-MULTITENANCY
type: requirement
title: Multitenancy and scoping (organization → subdivision → membership)
status: built
scope: cross-cutting
roles: [member, admin, superadmin]
entities: ["[[organizations]]", "[[subdivisions]]", "[[memberships]]", "[[users]]"]
adrs: ["[[ADR-008]]", "[[ADR-004]]"]
requirements: ["[[auth]]", "[[global-requirements]]"]
legacy_refs: [Conformance R5, plan G-tenant]
sources: [01_ARCHITECTURE.md "org/subdivision/user hierarchy", APP_OVERVIEW.md §4, LCOS_Conformance R5]
updated: 2026-07-09
---

# REQ-MULTITENANCY · Multitenancy and scoping

**Type:** cross-cutting SSOT · **Status:** built. The single source on tenant isolation.

## Normative statement

- **N1. Hierarchy (Slack model):** `organization` (isolation boundary) → `subdivision` (= Esupl warehouse) → `membership` (user↔subdivision+role). `users` — the **only global** table (without an `organization_id`). The org is derived **through** the subdivision, it is not stored in `memberships`.
- **N2. Scope denormalization:** `organization_id` is present on **every** operational/catalog row, `ondelete=RESTRICT`, `nullable=False`, indexed (`OrganizationScopedMixin`). Operational rows carry `subdivision_id` **as well** (`SubdivisionScopedMixin`). Intra-tenant parent-child FKs — `CASCADE`.
- **N3. Repositories require the scope in the constructor:** tenant repositories (`SupplierRepository`, `IngredientRepository`, `InvoiceRepository`) take `organization_id` (and optionally `subdivision_id`) in `__init__` — a tenant query is **structurally impossible** without a scope.
- **N4. Scope only from the signed JWT:** `org`/`sub_div` are taken from the access token (see [[auth]] N1), **never** from client input. `get_tenant_context` → **403** when there is no `organization_id` ("no active organization context").
- **N5. Roles:** `is_superadmin` (a global boolean flag on [[users]]) + `Role.admin` (per-subdivision via [[memberships]]). No RBAC matrix (an explicit non-goal). A user without a membership and not a superadmin logs in but the context is closed (403).
- **N6. FE scope** is derived from the `GET /auth/me` cache (the backend is authoritative); per-browser stores are keyed by `orgScopeToken()` — switching the active scope resets the caches/defaults, so no data leaks between tenants in one browser.
- **N7. Esupl binding:** `organization ↔ exactly one Esupl team` (`organizations.esupl_team_id`); `subdivision ↔ Esupl warehouse` (`subdivisions.esupl_warehouse_id`). These are **non-secret** ID columns (see [[secret-encryption]] R6.5).

## Rationale

A denormalized `organization_id` + a constructor-mandatory scope makes isolation a structural invariant rather than a calling discipline: you cannot forget the filter because a repository without a scope does not instantiate. Scope from the signed token rules out tenant spoofing by the client. The "multi-tenant-ready, single-tenant-first" model allows entering Phase 2 without a rewrite (Phase 1 — one default tenant).

## Failure modes

- **A request without an org context** → 403 (fail-closed), not a silent fetch of global data.
- **`RESTRICT` on tenant FKs** — deleting an organization/subdivision with live operational rows is rejected by the DB (no cascading wipe of the invoice history).
- **A user without a membership** → a closed context (see N5) — expected, not an error.
- **Risk:** `localos.lastWarehouseId` in localStorage is currently **without** an org scope (a low-risk UI default, DEFER); the other per-browser stores are keyed by `orgScopeToken()`.

## Relations

- ADR: [[ADR-008]] (organization-as-tenant), [[ADR-004]] (Esupl team/warehouse binding).
- Entities: [[organizations]], [[subdivisions]], [[memberships]], [[users]].
- Requirements: [[auth]] (source of the scope), [[global-requirements]] R5.

## Referenced by

`LCOS-F1` (Multitenancy & tenant isolation), any feature with a tenant repository: `LCOS-F8`..`LCOS-F18`, catalog, suppliers, invoices.

## Sources

- 01_ARCHITECTURE.md → "The org/subdivision/user hierarchy", "Tenant scoping / query enforcement", ORM base & mixins.
- APP_OVERVIEW.md §4; LCOS_Conformance R5, V-a (tenant-isolation tests).
- Code: `app/db/{base,repositories,models}.py`, `app/auth/dependencies.py::get_tenant_context`.
