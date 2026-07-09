---
id: LCOS-F18
type: feature
title: Supplier flexible criteria registry (Supplier.criteria JSONB)
epic: "[[LCOS-E4-suppliers]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]"]
requirements: ["[[supplier-criteria-registry]]", "[[multitenancy]]"]
adrs: ["[[ADR-017]]"]
legacy_refs: ["08 F2.1 (superseded)", plan F3-B1, "APP §10"]
sources: ["APP_OVERVIEW.md §10", "mvp.be app/domain/supplier_criteria.py", "mvp.be app/api/v1/routes/suppliers.py:49", "mvp.be app/api/v1/schemas.py:48", "mvp.be app/db/models.py:219", "mvp.fe src/pages/suppliers/ui/CriteriaFields.tsx"]
updated: 2026-07-09
---
# LCOS-F18 · Supplier flexible criteria registry (Supplier.criteria JSONB)

**Epic:** [[LCOS-E4-suppliers]] · **Status:** built · **Phase:** Phase 1

## Description

Supplier delivery conditions are heterogeneous (order volume, lead time, delivery weekdays, payment mode, deferral) and grow over time. Instead of a rigid column-per-condition schema that would force a migration for every new term, LCOS stores flexible conditions in a JSONB column `suppliers.criteria`, while the **definitions** of those conditions live in a typed registry `app/domain/supplier_criteria.py`. Adding or removing a criterion is a one-file edit of the registry — **no database migration** (values live in JSON, not columns).

The registry is the single source of truth shared by both layers: the backend validates incoming values against it, and the frontend renders a **dynamic form** from the same definitions served over `GET /suppliers/criteria-schema`. This keeps the set of criteria from drifting between client and server (see [[supplier-criteria-registry]]).

This is an as-built design that **supersedes** the planned `supplier_settings` side-table with fixed columns from 08_PHASE1_SPEC F2.1 (restructure-plan collision #4). Structural card fields (contacts, `min_order_amount`) remain dedicated columns on the supplier card ([[LCOS-F17-supplier-cards]]); `criteria` complements the card for the rarer/growing conditions. The consumer of these criteria — supplier scoring/comparison for order planning (REQ 1b) — is a deliberate seam; the value store and validation are built, the consumer is deferred by a checkpoint decision.

## Capabilities

- Flexible conditions stored in `suppliers.criteria` (JSONB, `NOT NULL default {}`, org-wide), never as ad-hoc columns.
- Typed registry `SUPPLIER_CRITERIA` of `CriterionDef` entries: `delivery_volume` (number, unit "ед./партия"), `delivery_lead_days` (days), `delivery_weekdays` (weekdays, 1=Mon…7=Sun), `payment_mode` (choice: `prepay` | `on_delivery` | `deferred`), `payment_deferral_days` (days). Registry order = form field order.
- `validate_criteria` normalizes any input: **unknown keys are silently dropped**, empty values omitted, each value coerced to its criterion kind; an invalid value raises `ValueError` → **422** at the API.
- Per-kind coercion: `number` (float ≥ 0), `days` (int ≥ 0), `choice` (must be in `choices`), `weekdays` (ints 1..7, sorted + de-duped), `boolean`, `text` (≤ 512 chars).
- `GET /suppliers/criteria-schema` serves the registry (`key`, `label`, `kind`, `unit`, `choices`, `description`) to the frontend; declared **before** `/{supplier_id}` so the path is not captured as an id.
- `criteria` flows through `SupplierCreate` / `SupplierUpdate` / `SupplierOut`; on `PATCH`, an explicit `criteria: null` means "leave untouched" (does not break the `NOT NULL` flush).
- Frontend renders one input per criterion kind from the schema, so adding/removing a criterion server-side needs **no frontend change**.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Edit a supplier card's criteria within their subdivision (same "any member of the subdivision" right as the card CRUD). |
| [[admin]] | Same, within the subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved; toggles the `suppliers` module gate in the SQLAdmin plane (see [[LCOS-F6-module-gates]]). |

Tenant scope (`organization_id`) comes from the active JWT context; isolation is covered by test (see [[multitenancy]]).

## Involved entities

- [[suppliers]] — carries the `criteria` JSONB column (`app/db/models.py:219`, `NOT NULL default {}`) alongside the structural card fields; `criteria` is org-scoped like the rest of the card.

## Dependencies / links

- **Requirements:** [[supplier-criteria-registry]] (the normative SSOT: registry-defined keys/types, API-level validation, 422 on invalid / silent drop of unknown, no migration to add a criterion), [[multitenancy]] (org scope + isolation).
- **Features:** [[LCOS-F17-supplier-cards]] (parent card CRUD that carries `criteria` in create/patch), [[LCOS-F40-ai-order-proposal]] (future consumer — order planning reads criteria via the same registry). Structural terms (`min_order_amount`) are on the card, not in `criteria`.
- **ADR:** [[ADR-017]] (self-service supplier seam — the settings a supplier would later edit are exactly these conditions).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. The registry `SUPPLIER_CRITERIA` is the SSOT of criterion keys, kinds and allowed values; adding a criterion is a registry edit with **no migration** (values persist in JSONB).
- [ ] AC-BE-2. `validate_criteria` drops unknown keys silently, omits empty values, and coerces each remaining value to its criterion kind.
- [ ] AC-BE-3. Coercion rules enforced: `number` rejects negatives, `days` rejects negative ints, `choice` rejects values outside `choices`, `weekdays` rejects values outside 1..7 and returns a sorted/de-duped list; an invalid value raises `ValueError` → **422** in the API.
- [ ] AC-BE-4. `GET /suppliers/criteria-schema` returns the registry serialized as `{key,label,kind,unit,choices,description}`, and is declared before `/{supplier_id}`.
- [ ] AC-BE-5. `SupplierOut.criteria` defaults to `{}`; `SupplierCreate`/`SupplierUpdate` run `validate_criteria` via a `field_validator` before persist.
- [ ] AC-BE-6. `PATCH /suppliers/{id}` with `criteria: null` leaves the stored value untouched (no `NOT NULL` flush failure); a non-null value is validated and replaces it.
- [ ] AC-BE-7. Values persist to the `suppliers.criteria` JSONB column, tenant-scoped by `organization_id`.

### Frontend
- [ ] AC-FE-1. `getSupplierCriteriaSchema` RTK query fetches `GET /suppliers/criteria-schema`; the criteria form is rendered from that list (`CriteriaFields`).
- [ ] AC-FE-2. Each criterion kind renders the correct control (number/days input, choice select, weekday toggle picker, boolean, text); adding/removing a criterion server-side needs no frontend change.
- [ ] AC-FE-3. Weekday picker uses `toggleWeekday` (sorted, de-duped); choices show human labels (`choiceLabel`), values format via `formatCriterionValue`.
- [ ] AC-FE-4. The supplier card displays non-empty criteria in **registry order** (`visibleCriteria`), not object-key order.
- [ ] AC-FE-5. Frontend criterion types mirror the backend (`CriterionKind` = number/days/choice/weekdays/boolean/text); covered by unit tests (`criteria.test.ts`, `CriteriaFields.test.tsx`).

### Other
- [ ] AC-OTHER-1. Consumer analytics (REQ 1b — supplier scoring/comparison for order planning) is **not built**: criteria are a validated store + seam only; the consumer is deferred by checkpoint decision.

## Open questions / gates

- **Consumer analytics deferred (REQ 1b):** the criteria model exists as a seam, but the consumer (comparison/scoring, order planning) is postponed — criteria are currently declarative. Value materializes only once a consumer ([[LCOS-F40-ai-order-proposal]]) reads them.
- **Well-known keys convention:** rarer conditions rely on the registry staying the single documented source; new keys must be added to the registry (not free-form) so FE and any planner read them uniformly.

## Sources

- `APP_OVERVIEW.md §10` (criteria JSONB + registry, validation at API, no-migration extension, consumer deferred).
- `mvp.be/app/domain/supplier_criteria.py` (`CriterionKind`, `CriterionDef`, `SUPPLIER_CRITERIA`, `validate_criteria`, `criteria_schema`).
- `mvp.be/app/api/v1/routes/suppliers.py:49` (`GET /suppliers/criteria-schema`), `:86` (PATCH `criteria: null` = leave untouched).
- `mvp.be/app/api/v1/schemas.py:31` (`SupplierOut.criteria`), `:48`/`:70` (`SupplierCreate`/`SupplierUpdate` validators).
- `mvp.be/app/db/models.py:219` (`suppliers.criteria` JSONB, `NOT NULL default {}`).
- `mvp.fe/src/entities/supplier/api/suppliersApi.ts:16` (`getSupplierCriteriaSchema`), `model/types.ts:52` (`CriterionDef`), `src/pages/suppliers/ui/CriteriaFields.tsx`, `src/pages/suppliers/lib/criteria.ts`.
