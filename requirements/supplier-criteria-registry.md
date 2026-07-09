---
id: REQ-SUPPLIER-CRITERIA
type: requirement
title: Supplier flexible criteria registry (Supplier.criteria JSONB + registry)
status: built
scope: cross-cutting
roles: [admin, member]
entities: ["[[suppliers]]"]
adrs: ["[[ADR-017]]"]
requirements: ["[[multitenancy]]", "[[sku-identity-resolver]]", "[[global-requirements]]"]
legacy_refs: [08 F2.1 (superseded), plan F3, APP §10]
sources: [APP_OVERVIEW.md §10, 01_ARCHITECTURE.md "suppliers", app/domain/supplier_criteria.py]
updated: 2026-07-09
---

# REQ-SUPPLIER-CRITERIA · Supplier flexible criteria registry

**Type:** cross-cutting SSOT · **Status:** built. An extensible model of delivery terms. An **as-built design, superseding** the planned 08_PHASE1_SPEC F2.1 (see restructure-plan collision #4).

## Normative statement

- **N1. `suppliers.criteria` — a JSONB column** on [[suppliers]] (tenant-scoped, org-wide). Stores a flexible set of delivery terms without a fixed column schema.
- **N2. Definitions — in a registry** `app/domain/supplier_criteria.py`: `CriterionDef` describes each criterion (minimum order volume/amount, delivery lead time, delivery days, payment mode, payment deferral). The registry is the SSOT of keys/types/validation.
- **N3. Validation against the registry at the API level:** invalid values → **422**; **unknown keys are silently dropped** (not a 422 — tolerance to extra keys). The value is coerced to the criterion's type from the registry.
- **N4. A new criterion — by editing the registry, without migrations** — JSONB needs no ALTER TABLE. This is the key property: a product extension of the terms is not blocked by the migration cycle.
- **N5. Separate structural fields of the supplier card** (not in `criteria`, migration `0006`): `contact_name`, `phone`, `messenger`, `delivery_terms` (Text), `min_order_amount` (Numeric), `min_order_note`, `is_active` (soft-hide of obsolete ones). Flexible criteria supplement the card, they do not replace it.
- **N6. Consumer analytics (REQ 1b) — a seam, the consumer is deferred:** the criteria model exists, but the consumer (supplier comparison/scoring) is deferred by a checkpoint decision — right now it is only storage + validation.

## Rationale

Delivery terms differ across suppliers and change over time; a rigid column schema would require a migration for every new criterion. JSONB + a registry gives adding a criterion by editing a single file, while preserving validation (unlike "a dump into JSON"). The tolerant dropping of unknown keys lets the FE/integrations send extra fields without breaking. Separating the structural card (contacts, min order) and the flexible `criteria` keeps the frequent fields typed and the rare/growing ones flexible.

## Failure modes

- **An invalid value of a known criterion** → 422 (not a silent save of garbage).
- **An unknown key** → silently dropped (deliberate tolerance; not an error).
- **`is_active=false`** — the supplier is hidden from the active choice (soft-hide), not deleted (the invoice history is intact).
- **Risk:** consumer analytics is not built — the criteria are declarative for now; the product value (scoring/comparison) appears only with a consumer.

## Relations

- ADR: [[ADR-017]] (supplier self-service — the `supplier_settings` schema seam, the portal is not built; an adjacent theme of terms).
- Entities: [[suppliers]] (`criteria` JSONB + the card).
- Requirements: [[multitenancy]] (org-scope), [[sku-identity-resolver]] (`supplier_external_id` in the moat's composite key), [[global-requirements]].

## Referenced by

`LCOS-F18` (Supplier flexible criteria registry), `LCOS-F17` (Supplier cards CRUD + delivery terms), `LCOS-F20`/`F21` (price history / price-change signal — future consumers of the criteria).

## Sources

- APP_OVERVIEW.md §10; 01_ARCHITECTURE.md → Data model (`suppliers`, fields F3-B1, migration 0006).
- Code: `app/domain/supplier_criteria.py` (`CriterionDef`), `app/api/v1/routes/suppliers.py`.
- Legacy (superseded): 08_PHASE1_SPEC.md F2.1.
