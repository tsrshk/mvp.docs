---
id: LCOS-F17
type: feature
title: Supplier cards — directory CRUD + delivery terms
epic: "[[LCOS-E4-suppliers]]"
status: built
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[suppliers]]", "[[organizations]]", "[[subdivisions]]"]
requirements: ["[[LCOS-F6-module-gates]]", "[[multitenancy]]", "[[erp-esupl-integration]]", "[[supplier-criteria-registry]]"]
adrs: ["[[ADR-004]]", "[[ADR-008]]"]
legacy_refs: [07 Э2, plan F3-B1, plan F3-B4, plan F3-F1, "APP §10"]
sources: ["plan/PHASE_F3_SUPPLIERS.md (status 2026-07-08)", "APP_OVERVIEW.md §10", "mvp.be app/api/v1/routes/suppliers.py", "mvp.be app/services/supplier_service.py"]
updated: 2026-07-09
---
# LCOS-F17 · Supplier cards — directory CRUD + delivery terms
**Epic:** [[LCOS-E4-suppliers]] · **Status:** built · **Phase:** Phase 1

## Description

A personal supplier directory for the pilot coffee shop: name, contacts, terms, and minimum order — instead of "in your head, WhatsApp, and a notebook". Suppliers are mirrored from the POS (the tenant's Esupl following teams) via `POST /suppliers/sync`, and on top of the mirror LCOS maintains an **editable card** (contacts, `delivery_terms`, `min_order_amount`/`min_order_note`) and soft-hides stale ones (`is_active`, no physical deletion — FK RESTRICT).

This is the first increment of epic E4: the **directory + card + CRUD** are implemented. Flexible criteria (`Supplier.criteria` JSONB + registry) are the adjacent feature [[LCOS-F18-supplier-criteria]]; price history and auto-collection from invoices are [[LCOS-F20-price-history]] / [[LCOS-F21-price-change-signal]] (📝 planned). The entire suppliers router is behind the `suppliers` module gate (see [[LCOS-F6-module-gates]]): turning it off in SQLAdmin → `404` on all endpoints, the section hidden in the UI.

The card also serves the invoice flow: `POST /suppliers/match` auto-resolves the supplier from invoice text (tax ID → name), and `GET /suppliers/search` feeds the dropdown in the SKU dropdown.

## Capabilities

- `GET /suppliers` — the local directory (the tenant's cards).
- `GET /suppliers/{id}` — a card (or `404`).
- `POST /suppliers` — create a card manually (`201`), tenant scope from the active context.
- `PATCH /suppliers/{id}` — partial update (`exclude_unset`): contacts / terms / min order / `is_active`; an explicit `null` in `criteria` is treated as "leave untouched" (does not break the NOT NULL flush).
- `POST /suppliers/sync` — synchronization from the POS (`get_esupl_access` → `list_suppliers` → upsert by `external_id`); without a linked Esupl team → `400`.
- `POST /suppliers/match` — auto-resolve by tax ID (exact) → name (blended score); `null` = not found.
- `GET /suppliers/search?q=` — search by name (case-insensitive partial) for the dropdown.
- `GET /suppliers/criteria-schema` — criteria definitions from the registry (declared BEFORE `/{supplier_id}` so the path is not caught as an id).
- **Name auto-resolve** — blended score: character trigrams (Dice) weight `0.65` + token Jaccard weight `0.35`, threshold `_MIN_NAME_SCORE = 0.4`; the tax ID (`tax_id`) is the priority exact match.
- FE: a mobile-first "Suppliers" page (responsive cards, bottom-sheet form, 44px targets), a nav item (sidebar + drawer), `entities/supplier` RTK endpoints.

## Role-based access

| Role | What they can do |
|---|---|
| [[member]] | Full CRUD of their subdivision's cards (create, edit contacts/terms, hide an inactive one), run sync, search/match a supplier. Permissions — "any member of the subdivision" (plan F3-B4). |
| [[admin]] | Same within the subdivision. |
| [[superadmin]] | Cross-tenant access. |
| [[sqladmin-operator]] | Does not CRUD cards; enables/disables the `suppliers` module gate in the SQLAdmin plane (`404` if disabled). |

Tenant scope (`organization_id`) — from the active JWT context; isolation is covered by a test (`tenant-isolation` in `test_suppliers_crud.py`), see [[multitenancy]].

## Entities involved

- [[suppliers]] — the Esupl mirror (`external_id`, `name`, `tax_id`) + the LCOS card (`contact_name`, `phone`, `messenger`, `delivery_terms`, `min_order_amount`, `min_order_note`, `is_active`, `criteria` JSONB); migration `0006` added the card fields.
- [[organizations]] — the tenant; `organization ↔ exactly one Esupl team` (`[[ADR-004]]`), the source of `team_id` for sync.
- [[subdivisions]] — a section within the tenant; `subdivision ↔ Esupl warehouse` (`[[ADR-008]]`).

## Dependencies / relations

- **Requirements:** [[LCOS-F6-module-gates]] (the whole router behind `require_module("suppliers")` → `404`), [[multitenancy]] (scope + isolation), [[erp-esupl-integration]] (`get_esupl_access` + `following?is_virtual=1` on sync, read-only), [[supplier-criteria-registry]] (`criteria` JSONB, registry).
- **Features:** [[LCOS-F18-supplier-criteria]] (flexible criteria), [[LCOS-F20-price-history]] + [[LCOS-F21-price-change-signal]] (📝 the next F3 increments), [[LCOS-F19-supplier-self-service]] (🔭 seam), [[LCOS-F9-line-matching]] / [[LCOS-F13-sku-identity-resolver]] (consumers of `match`/`search`).
- **ADR:** [[ADR-004]] (org ↔ Esupl team), [[ADR-008]] (subdivision ↔ warehouse).

## Acceptance criteria (AC)

### Backend
- [ ] AC-BE-1. Migration `0006` applies/rolls back; the new card fields are nullable; `is_active` defaults to True.
- [ ] AC-BE-2. CRUD: `POST /suppliers` → `201`; `PATCH /suppliers/{id}` partial (`exclude_unset`); `GET /suppliers/{id}` → a card or `404`.
- [ ] AC-BE-3. `PATCH` with `criteria: null` does not break the flush (NOT NULL) — treated as "leave untouched".
- [ ] AC-BE-4. `POST /suppliers/sync` resolves `team_id` via `get_esupl_access`; without an Esupl team → `400`; upsert by `external_id` (no duplicates); returns `{synced: n}`.
- [ ] AC-BE-5. `POST /suppliers/match`: the tax ID is the priority exact match; otherwise the best by name at score ≥ `0.4`; otherwise `null`.
- [ ] AC-BE-6. The name score is blended `0.65·trigram-Dice + 0.35·token-Jaccard` on normalized names.
- [ ] AC-BE-7. `GET /suppliers/search?q=` — case-insensitive partial by name; `q` min_length 1.
- [ ] AC-BE-8. The whole router behind `require_module("suppliers")`: with the module disabled, all endpoints → `404`.
- [ ] AC-BE-9. Tenant isolation: org A's suppliers are not visible from org B's scope (test).

### Frontend
- [ ] AC-FE-1. The "Suppliers" page — a list (name, contacts, last delivery, SKU count) with responsive cards on mobile.
- [ ] AC-FE-2. A card is editable (details, terms, min order); soft-hide of an inactive one.
- [ ] AC-FE-3. `entities/supplier` — RTK endpoints `getManagedSuppliers/createSupplier/updateSupplier` (backend-direct, tag `Supplier`); provider `backend|mock`.
- [ ] AC-FE-4. The "Suppliers" nav item (sidebar + drawer); with the module disabled the section is hidden.
- [ ] AC-FE-5. Browser verification on a mobile viewport (login → create `201` → patch `200`).

## Open questions / gates

- **Price history not implemented** (F3-B2/B3): `supplier_prices` append-only, auto-collection from the invoice, price-change warning → [[LCOS-F20-price-history]], [[LCOS-F21-price-change-signal]]. Plan F3's AC-2/3/5/6/7/9 relate to these and **remain open**.
- **Supplier-analytics consumer (REQ 1b)** — the model seam exists, the consumer is **deferred** per the checkpoint decision.
- Price chart/sparkline — outside the current increment.

## Sources

- `plan/PHASE_F3_SUPPLIERS.md` — "Implementation status (2026-07-08)" (F3-B1 + CRUD + mobile UI done; price history — the next increment), F3-B4 (module gate).
- `APP_OVERVIEW.md §10` (criteria JSONB + registry), `§9` (`get_esupl_access`, the following endpoint), `§11`.
- `mvp.be/app/api/v1/routes/suppliers.py` (router + `require_module("suppliers")`).
- `mvp.be/app/services/supplier_service.py:74` (`sync_from_erp`), `:92` (`create_card`), `:101` (`find_by_name`), `:23-27` (the score weights `0.65`/`0.35`, threshold `0.4`).
