---
id: LCOS-F1
type: feature
title: Multitenancy & tenant isolation
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin, sqladmin-operator]
entities: ["[[organizations]]", "[[subdivisions]]", "[[users]]", "[[memberships]]", "[[refresh_sessions]]"]
requirements: ["[[multitenancy]]", "[[auth]]", "[[global-requirements]]"]
adrs: ["[[ADR-008]]", "[[ADR-004]]"]
legacy_refs: [plan/00 G2, LCOS_Conformance R5, APP_OVERVIEW §4]
sources: ["APP_OVERVIEW.md §4 §11", "01_ARCHITECTURE.md (Data model, Auth & multi-tenancy, Cross-cutting)", "LCOS_Conformance_Alignment_GlobalRequirements.md R5", "mvp.be app/db/base.py", "mvp.be app/db/repositories.py:33", "mvp.be app/auth/dependencies.py:46"]
updated: 2026-07-09
---
# LCOS-F1 · Multitenancy & tenant isolation
**Epic:** [[LCOS-E1-platform]] · **Status:** built · **Phase:** Phase 1

## Description

The hard data-isolation boundary the whole platform stands on. The tenant is the **organization**; a "Slack-style" identity model nests **organization → subdivision (a physical point that maps to an Esupl warehouse) → membership (user ↔ subdivision + role)**. `organization_id` is **denormalized onto every operational and catalog row** with `ondelete=RESTRICT`, and operational rows additionally carry `subdivision_id`. `users` is the single global table — it has no `organization_id`; a user reaches a tenant only through a `membership`.

Isolation is enforced structurally, not by discipline: **tenant repositories require `organization_id` in their constructor**, so a tenant query is impossible without a scope, and the scope always originates from the signed access-JWT (`org` / `sub_div` claims), never from client input (see [[LCOS-F2-app-auth]]). `get_tenant_context` returns **403** when no `organization_id` is present, closing tenant data to any authenticated user who has no active org context.

Every operational epic ([[LCOS-E2-invoice-intake]], [[LCOS-E3-sku-identity]], [[LCOS-E4-suppliers]]) inherits this boundary for free by extending the scoped mixins. The learning-loop moat also keys its scopes (`scope_type`/`scope_id`) off this hierarchy — see [[sku-identity-resolver]].

## Capabilities

- Org/subdivision/membership hierarchy with a single global `users` table; org is derived through the subdivision, not stored on the membership.
- Denormalized `organization_id` on every operational/catalog table via `OrganizationScopedMixin`; `subdivision_id` added by `SubdivisionScopedMixin` (a subdivision-scoped table carries both columns).
- Tenant-boundary FKs are `RESTRICT`; parent-child within a tenant are `CASCADE`; `refresh_sessions.active_subdivision_id` is `SET NULL`.
- Tenant repositories (`SupplierRepository`, `IngredientRepository`, `InvoiceRepository`) take `organization_id` in the constructor — a scopeless query cannot be constructed.
- Scope resolved from the signed JWT by `get_tenant_context`; `require_superadmin` gates god-mode routes.
- `superadmin` is a global boolean on `User` (god-mode: sees/switches into any org/subdivision, treated as `admin` everywhere); `Role.admin` is the only membership role — no RBAC matrix (explicit non-goal).
- Org ↔ exactly one Esupl team (`organizations.esupl_team_id`); subdivision ↔ Esupl warehouse (`subdivisions.esupl_warehouse_id`) — non-secret ID columns feeding the ERP payload.
- Frontend projects the active scope from the `/auth/me` cache into the RxJS `activeScope$`; per-browser stores are keyed by `orgScopeToken()` to prevent cross-tenant leakage.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Operates only within their own subdivision(s); tenant queries auto-scoped from JWT. Cannot reach another org's data. |
| [[admin]] | Same isolation as member, with admin capabilities inside subdivisions where they hold an `admin` membership. |
| [[superadmin]] | Global flag on `User`: sees and can switch into any org/subdivision regardless of membership; treated as `admin` in every subdivision. |
| [[sqladmin-operator]] | Manages the org/subdivision/user/membership structure through SQLAdmin ModelViews (see [[LCOS-F3-sqladmin-operator]]); operates outside the tenant JWT plane. |

A user with no membership and no superadmin flag can authenticate but has **no active context** → tenant data is closed (403); the FE shows "no available subdivisions."

## Involved entities

- [[organizations]] — the tenant and hard isolation boundary; `esupl_team_id` binds it to one Esupl team.
- [[subdivisions]] — physical point inside a tenant; unique `(organization_id, name)`; maps to an Esupl warehouse.
- [[users]] — the single global table (no `organization_id`); reaches a tenant only via a membership.
- [[memberships]] — user ↔ subdivision + `Role`; unique `(user_id, subdivision_id)`; org derived through the subdivision.
- [[refresh_sessions]] — holds `active_subdivision_id` (`SET NULL`) so the active context is restored on refresh.

## Dependencies / links

- **Requirements:** [[multitenancy]] (denormalized `organization_id`, scoped repos, scope-from-JWT), [[auth]] (scope claims originate in the signed access-JWT), [[global-requirements]] (R5).
- **Features:** consumed by every operational feature — [[LCOS-F10-invoice-status-machine]], [[LCOS-F17-supplier-cards]], [[LCOS-F13-sku-identity-resolver]] all extend the scoped mixins; scope originates in [[LCOS-F2-app-auth]]; structure managed via [[LCOS-F3-sqladmin-operator]]; projected client-side by [[LCOS-F7-frontend-platform]].
- **ADR:** [[ADR-008]] (multitenancy model; subdivision = Esupl warehouse), [[ADR-004]] (org ↔ one Esupl team).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. Every operational/catalog table (`suppliers`, `invoices`, `invoice_lines`, `ingredients`, `packings`) carries `organization_id` (`OrganizationScopedMixin`, `ondelete=RESTRICT`, `nullable=False`, indexed); invoices/lines also carry `subdivision_id`.
- [ ] AC-BE-2. `users` is the only table without `organization_id`; a user reaches tenant data solely through a `membership`.
- [ ] AC-BE-3. Tenant repositories cannot be instantiated without `organization_id` (constructor arg) — a scopeless tenant query is structurally impossible (merge-gated test).
- [ ] AC-BE-4. Scope is taken from the signed access-JWT (`org`, `sub_div`), never from client input; `get_tenant_context` returns 403 when `organization_id` is absent.
- [ ] AC-BE-5. Cross-tenant access is impossible: a request scoped to org A cannot read/write org B rows (merge-gated isolation test).
- [ ] AC-BE-6. `superadmin` is a global `User` boolean (not a role row); can switch into any org/subdivision; `require_superadmin` gates god-mode routes.
- [ ] AC-BE-7. FK delete behavior matches the boundary rules: tenant-boundary FKs `RESTRICT`, in-tenant parent-child `CASCADE`, `refresh_sessions.active_subdivision_id` `SET NULL`.

### Frontend
- [ ] AC-FE-1. Active scope is derived from the `/auth/me` cache (backend authoritative) and pushed into `activeScope$`; the UI never lets the client assert a scope the JWT doesn't grant.
- [ ] AC-FE-2. Per-browser stores (learned mappings, sent-invoice ledger) are keyed by `orgScopeToken()` so two tenants can't collide; pre-auth token is `'noorg'`.
- [ ] AC-FE-3. Login / logout / switch-context invalidate `['Me','Invoice','Supplier','Ingredient']` caches so tenant data refetches on scope change.
- [ ] AC-FE-4. A user with no membership (and not superadmin) sees "no available subdivisions" and no tenant data.

## Open questions / gates

- **Invariant is merge-gated (VER-01):** the tenant-isolation suite blocks merge; its regression cannot land in main.
- `localos.lastWarehouseId` is intentionally **not** org-scoped (low-risk UI default) — noted as a DEFER item in Conformance §2.4.
- Phase-1 non-goals: no RBAC permission matrix, no OAuth, no self-registration, no tenancy scaling ([[LCOS-F70-tenancy-scaling]] is Phase 2).

## Sources

- `APP_OVERVIEW.md §4` (multitenancy & auth), `§11` (data model).
- `01_ARCHITECTURE.md` — Data model / mixins, "Auth & multi-tenancy", "Cross-cutting → Multi-tenancy scoping".
- `LCOS_Conformance_Alignment_GlobalRequirements.md` R5.
- `mvp.be/app/db/base.py` (`OrganizationScopedMixin`, `SubdivisionScopedMixin`, naming convention).
- `mvp.be/app/db/repositories.py:33` (`SupplierRepository.__init__` requires `organization_id`), `:116`, `:185`.
- `mvp.be/app/auth/dependencies.py:46` (`get_tenant_context` → 403), `:56` (`require_superadmin`).
