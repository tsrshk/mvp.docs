---
id: LCOS-F15
type: feature
title: SKU catalog & packings
epic: "[[LCOS-E3-sku-identity]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[ingredients]]", "[[packings]]", "[[invoice_lines]]", "[[suppliers]]", "[[subdivisions]]", "[[organizations]]"]
requirements: ["[[erp-esupl-integration]]", "[[sku-identity-resolver]]", "[[multitenancy]]"]
adrs: ["[[DEC-0011]]", "[[ADR-018]]"]
legacy_refs: [DEC-0011, "08 F1.1", "08 F1.2", "REQ 3", "REQ 4"]
sources: ["APP_OVERVIEW.md §7 §11", "mvp.be app/api/v1/routes/ingredients.py:70", "mvp.be app/services/catalog.py:25", "mvp.be app/services/catalog.py:59", "mvp.be app/services/invoice_service.py:422", "mvp.be app/db/models.py:303"]
updated: 2026-07-09
---
# LCOS-F15 · SKU catalog & packings

**Epic:** [[LCOS-E3-sku-identity]] · **Status:** built · **Phase:** Phase 1

## Description

The local `ingredients` table is LCOS's **mirror of the POS catalog** — organization-scoped, with an optional per-subdivision override (a position specific to one point; `NULL` = shared across the org). It is deliberately **non-authoritative**: POS (Esupl) is the single source of truth for ingredient identity and attributes (`[[DEC-0011]]`), so this catalog is never treated as authority on the commit path. Its two jobs are (1) to feed the tolerant **draft-resolve** that builds the Esupl outgoing-invoice payload and (2) to power the SKU picker on the frontend (REQ 3/4).

On draft-resolve (`_resolve_line`, see [[LCOS-F9-line-matching]]) the catalog supplies each line's numeric Esupl foreign keys — `esupl_item_id`, `esupl_unit_id` — plus `default_tax_rate` and a default packing. Note the two representations of one Esupl entity: `esupl_item_id` (int, a payload copy) versus the durable string `pos_ingredient_id`/`external_id` used as the identity anchor elsewhere (`pos_ingredient_id == str(esupl id)`). If any POS-required field is missing the line is marked *not POS-ready* with a resolution note — nothing is fabricated.

`packings` model how many base units live in one packing unit (`factor`); a SKU may have several, with **at most one default** (enforced by a partial unique index) so auto-fill is deterministic. Each packing also carries `esupl_packing_id`.

Catalog population is via `POST /ingredients/sync-from-erp`, which pulls the POS catalog through the read-only [[erp-esupl-integration]] seam and adds missing org-level positions. It is **idempotent and additive-only**: existing `external_id`s are skipped, and stored rows are neither updated nor deleted (catalog drift is a known gap). The same sync function is the SSOT for both the startup bootstrap and the manual endpoint.

## Capabilities

- `GET /ingredients` — returns the catalog for the active scope (org rows + active-subdivision overrides) as `IngredientRef`, including packings sorted default-first.
- `GET /ingredients/search?q=` — case-insensitive partial match by name.
- `GET /ingredients/by-supplier/{supplier_id}` — distinct ingredients this supplier has delivered, derived from invoice history (`invoice_lines.sku == Ingredient.external_id`), org-scoped; used for grouping in the SKU dropdown and prefilling orders.
- Draft-resolve consumes the catalog: `esupl_item_id`, `esupl_unit_id`, `default_tax_rate`, and the default (or first) packing are copied into the line for the payload.
- Packings: `factor`, `is_default` (≤ 1 default per ingredient via partial unique index), `esupl_packing_id`.
- `POST /ingredients/sync-from-erp` — idempotent additive sync of the org-level catalog (`subdivision_id = NULL`); existing keys loaded in one query (no N+1); errors propagate (VPN/ERP failures surface as `503`, not swallowed into a `200`).
- Uniqueness `(organization_id, subdivision_id, external_id)`; `external_id` is the ERP SKU id.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Reads the catalog and searches it within their scope; triggers an ERP sync (tenant-scoped). |
| [[admin]] | Same, within their subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Not involved in the catalog flow. |

The endpoints are tenant-scoped (active context from the JWT); a member sees org-wide positions plus their active subdivision's overrides (REQ 3). See [[auth]], [[multitenancy]].

## Involved entities

- [[ingredients]] — the local catalog (mirror of POS); source of numeric Esupl FKs and `default_tax_rate` on draft-resolve; `(org, subdivision, external_id)` unique.
- [[packings]] — per-SKU packing options; ≤ 1 default per ingredient; `factor`, `esupl_packing_id`.
- [[invoice_lines]] — `by-supplier` derives history from lines; a resolved line carries the catalog `external_id` in `sku`.
- [[suppliers]] — `by-supplier` grouping key.
- [[subdivisions]], [[organizations]] — scope boundary (org row vs subdivision override).

## Dependencies / links

- **Requirements:** [[erp-esupl-integration]] (sync via `list_ingredients`, read-only), [[sku-identity-resolver]] (the catalog is the tolerant *draft* tier only — not commit authority), [[multitenancy]] (org/subdivision scoping).
- **Features:** [[LCOS-F13-sku-identity-resolver]] (draft-resolve consumes the FKs; commit does **not** trust the catalog), [[LCOS-F9-line-matching]] (matches a line to a catalog SKU), [[LCOS-F11-esupl-read]] (the POS read the sync pulls from), [[LCOS-F16-ingredient-cache]] (a separate non-authoritative acceleration seam), [[LCOS-F14-learning-loop]] (the picked catalog SKU's durable id is what a confirmed mapping stores).
- **ADR:** [[DEC-0011]] (POS = SoT, the catalog is non-authoritative), [[ADR-018]] (commit trusts only confirmed `sku_mapping`, never the catalog/cache).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `GET /ingredients` returns org rows + active-subdivision overrides as `IngredientRef`, packings sorted default-first.
- [ ] AC-BE-2. `GET /ingredients/search?q=` is a case-insensitive partial match by name.
- [ ] AC-BE-3. `GET /ingredients/by-supplier/{id}` returns distinct ingredients joined via `invoice_lines.sku == Ingredient.external_id`, filtered to the caller's organization.
- [ ] AC-BE-4. Draft-resolve (`_resolve_line`) fills `esupl_item_id`, `esupl_unit_id`, `default_tax_rate`, and the default packing; when any POS-required field is missing the line is flagged not-POS-ready with a note (no fabricated values).
- [ ] AC-BE-5. At most one default packing per ingredient (partial unique index); the resolver picks the default, else the first packing.
- [ ] AC-BE-6. `POST /ingredients/sync-from-erp` is idempotent and additive: existing `external_id`s are skipped; stored rows are not updated or deleted; existing keys are loaded in a single query (no N+1).
- [ ] AC-BE-7. Sync requires the org to be linked to an Esupl team (else `400`); ERP/VPN failures propagate to the global handlers (`VpnUnavailable → 503`) rather than being swallowed into a `200` body.
- [ ] AC-BE-8. Uniqueness `(organization_id, subdivision_id, external_id)`; the catalog sync and the startup bootstrap call the same SSOT function.
- [ ] AC-BE-9. Tenant isolation: catalog reads and sync never cross organization boundaries.

### Frontend
- [ ] AC-FE-1. The SKU picker lists the catalog from `GET /ingredients` and auto-fills the default packing on a match.
- [ ] AC-FE-2. Search-as-you-type queries `GET /ingredients/search`.
- [ ] AC-FE-3. The SKU dropdown can group by supplier using `GET /ingredients/by-supplier/{id}`.
- [ ] AC-FE-4. A line whose catalog match is missing or incomplete for POS shows its resolution note rather than silently proceeding.

### Other
- [ ] AC-OTHER-1. `ingredient_to_ref` is the single ORM→domain converter (SSOT) used by both the routes and `SKUService`.

## Open questions / gates

- **Catalog drift** — sync is additive-only; it does not update renamed/re-priced/removed POS rows. A reconcile/update pass is a separate task (noted in `catalog.py`).
- **base + override merge** — combining an org base row with a subdivision override into one effective view is intentionally *not* implemented (spec §2); overrides stand alone.
- **S1 read-only** — confirm the `products?id=` / `product_name` filters are honoured; the `/products?id=` (code) vs `/ingredients/{id}` (probe) endpoint discrepancy is documented (see [[LCOS-F11-esupl-read]]).

## Sources

- `APP_OVERVIEW.md §7` (two-context model, catalog as draft tier), `§11` (data model, migrations `0001…0009`).
- `mvp.be/app/api/v1/routes/ingredients.py:70` (`list_ingredients`), `:75` (`search`), `:86` (`by-supplier`), `:210` (`sync-from-erp`).
- `mvp.be/app/services/catalog.py:25` (`ingredient_to_ref` SSOT), `:52` (`list_catalog`), `:59` (`sync_catalog_from_erp`, idempotent additive).
- `mvp.be/app/services/invoice_service.py:422` (`_resolve_line`, draft-context catalog resolve).
- `mvp.be/app/services/sku_service.py:82` (`SKUService` suppliers/ingredients/by-supplier).
- `mvp.be/app/db/models.py:303` (`Ingredient`), `:336` (`Packing`, one-default partial unique index).
</content>
