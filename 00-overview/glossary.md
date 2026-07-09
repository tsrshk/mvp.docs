---
id: OV-GLOSSARY
type: overview
title: LCOS glossary of terms
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 3
sources:
  - APP_OVERVIEW.md §4–§11 (verified_against_code 2026-07-09)
  - 06_STRATEGY.md §1–§2 (moat, routine ladder)
  - plan/00_IMPLEMENTATION_PLAN.md §2 (Pilot-Gate), G3/G5/G6
---

# LCOS glossary

> Product, domain, and architecture terms. Definitions are in English prose; identifiers/codes are kept verbatim (codebase convention). Authority: code + [[architecture]] > `DEC-0011/0013` > docs. Data entities in more detail are in `entities/`, requirements in `requirements/`.

## Product and strategy

### moat
**A moat / an accumulating lock-in asset.** In LCOS this is the learning-loop mapping: the [[sku_mapping]] table, where matches of "supplier invoice line → POS SKU" accumulate with every confirmed invoice. Each time there is less manual work — this is the main early switching cost (leaving for a competitor = losing the accumulated mapping). OCR is a commodity and does not protect; the moat does. See [[LCOS-E3-sku-identity]], §8 learning loop in [[architecture]], `ADR-019`/`ADR-020`.

### Pilot-Gate
**The Phase 1 → Phase 2 transition criterion** (`ADR-003`). The product has been proven on its own (pilot) business: the pilot coffee shop's owner (Customer Zero) after **4 weeks** of real use says "worse without it", with a measurable saving of **≥3 h/week**. Historically it was called **Wife-Gate** in the vision docs and `ADR-003` — the term is replaced by the neutral **Pilot-Gate** (`Wife-Gate == Pilot-Gate`). Before it is passed — no billing, no onboarding, no SaaS. See [[roadmap]], [[glossary]].

## SKU identity and the learning loop

### source_key
**The mapping's identity key — the raw invoice line text**, normalized on the backend (`normalize_source_key`, SSOT), *not* the SKU name from the catalog. FE normalization (`normalizeSourceKey`) mirrors the backend (verified by a golden-vector parity test). The full composite key of [[sku_mapping]] (`DEC-0012` / `ADR-019`): `(scope_type, scope_id, supplier_external_id, source_key)` — the supplier in the key is mandatory, because the same text from **different suppliers** can point to different POS SKUs. See [[sku-identity-resolver]].

### draft-resolve vs commit-resolve
Two different contexts of identity resolution in the invoice flow:
- **draft-resolve** (`prepare()`, **tolerant**): builds the Esupl payload from the **local catalog**; hints — fuzzy / LLM / exact-cache — live **only here**; `pos_ingredient_id` is not touched. The goal is to help the human fill in the lines.
- **commit-resolve** (`submit()` → `_resolve_commit_identities` → Phase-2 live validation, **fail-closed**): the durable `pos_ingredient_id` is taken **only from [[sku_mapping]]** (priority `subdivision → org`, only a confirmed identity: `method=manual` OR `confirmed_by IS NOT NULL`). Cache / fuzzy / AI **do not participate** on commit. Then a live query to the POS; no exact match → `None` → block + review.

The separation is the essence of the two-context model `DEC-0011`/`DEC-0013` variant A. See [[sku-identity-resolver]], [[invoice-status-machine]], [[architecture]] §6–§7.

### pos_ingredient_id
**A str identity anchor for a POS SKU** — a durable reference to a POS item, stored in [[sku_mapping]] and on the invoice line ([[invoice_lines]]). Invariant: `pos_ingredient_id == str(esupl_item_id)` — one Esupl entity in two representations: an **int catalog copy** (`esupl_item_id`, for the payload) and a **str identity anchor** (`pos_ingredient_id`). On commit resolve it is taken only from a confirmed mapping, never from the cache/hints. The open durability gate — `VER-021` (whether the id is stable under edit/delete-recreate), owner-run, merge gated.

### sku_mapping
**The moat table.** It stores `(scope, supplier_external_id, source_key) → pos_ingredient_id` + `method` / `confidence` / `confirmed_by` / `packing`. It is written by a separate client call `POST /ingredients/mappings` in the `onSend` handler (persist-then-commit, **before** sending — it survives an invoice reject by design, `ADR-020`), **not** as a side effect of the submit endpoint. It is read on commit resolve. It was migrated entirely from localStorage to the backend. Entity — [[sku_mapping]]; feature — [[LCOS-F14-learning-loop]].

### ingredient_cache
**A non-authoritative draft-only cache** of matches, scope-aware, **fully rebuildable without losing mappings**. It participates only in draft resolve (hints in `prepare`), and **does not participate on commit** (VER-022 — scope asymmetry — is closed: there is no cache on the commit path). Do not confuse it with [[sku_mapping]] (the moat, durable, authoritative). Entity — [[ingredient_cache]].

## Architecture and infrastructure

### ERP_WRITE_ENABLED
**The toggle for the real write to Esupl**, default **False (OFF)**. When OFF, `write_invoice()` does not perform a write — the invoice gets the status `prepared` and a prepared-id, the payload is built, but nothing goes to the POS. It is the single write-point in the whole application (`POST /teams/{id}/outgoing-invoices`); all other Esupl access is read-only. It embodies human-in-the-loop and fail-closed. See [[erp-esupl-integration]], [[invoice-status-machine]], `ADR-002`, `ADR-006`.

### fail-closed
**The principle: on an unavailable dependency or a missing secret — an explicit error, never a silent fallback/degradation** (`ADR-006`, R8). Manifestations: no POS token → Esupl 401; VPN down while `ai_vpn_enabled` → refusal, no silent direct egress to the AI; config tiers 2–3 **have no env fallback**; commit identity resolution on `None`/mismatch/POS unavailability → block + review, not "take `items[0]`". A single error envelope `{"error":{code,message,details?}}`. Requirement — [[fail-closed]]; the egress part — [[vpn-egress]].

### tenant / subdivision
**Tenant = organization** (`organization`). `organization_id` is denormalized into every operational/catalog row — a tenant query is impossible without a scope (never from client input, only from the JWT). **Subdivision = a subdivision** (a point/warehouse) within an organization; operational rows also carry `subdivision_id`. Hierarchy: `organization → subdivision → membership(user↔subdivision+role)`. Bindings: `organization ↔ exactly one Esupl team`; `subdivision ↔ Esupl warehouse` (`ADR-004`, `ADR-008`). Requirement — [[multitenancy]]; entities — [[organizations]], [[subdivisions]].

### member / admin / superadmin
**Roles of the application auth plane** (JWT), not to be confused with the admin-panel operator:
- **member** — a basic application user, access via a `membership` to a subdivision; works with invoices/catalog within their scope. Role — [[member]].
- **admin** — elevated rights at the subdivision level (managing the catalog, suppliers, settings of their scope). Role — [[admin]].
- **superadmin** — a global role of the application plane. Role — [[superadmin]].

A separate **second plane** is the **SQLAdmin operator** (env + bcrypt, session cookie): the `admin_system` routes (superadmin config) are gated precisely by this SQLAdmin operator plane, **not by the application JWT superadmin** (`ADR-007`). Role — [[sqladmin-operator]]. The `supplier` role is a schema placeholder for the future only ([[supplier-future]], `ADR-017`).

### ProviderContext
**A container of cross-infrastructure dependencies** (e.g. the tenant scope, access to secrets/session), passed into providers **outside the `Protocol` signatures**. The rule (G1, `ADR-009`): services depend only on `providers/*/base.py` (the Protocol); cross-infra goes through `ProviderContext`, without polluting the domain signatures of the interface. It lets us keep "one implementation per seam" and add providers (OCR=`claude`, ERP=`esupl`) without infrastructure leaking into the contract. See [[provider-abstraction]].

## Other frequent terms

- **Customer Zero** — the pilot coffee shop (the founder's wife's), on which the product is validated before sales.
- **wedge** — invoices: the most frequent measurable pain, the entry point that fills the data for subsequent routines. See [[product]] §2.
- **write-point** — LCOS as the "invoice write-point" on top of the ERP; read-only to everything else in Esupl.
- **draft** — `InvoiceDraft`: the raw recognized lines + the supplier from the name, before prepare/submit.
- **prepared / validated / written / rejected / failed** — invoice statuses, see [[invoice-status-machine]].
- **module gate** — a request-time module gate (`modules/registry.py::require_module` → 404); routes are always registered.
- **enc:v2** — the Fernet envelope format `enc:v2:<key_id>:<token>`, a versioned KEK, rotation without losing old ciphertexts. See [[secret-encryption]], `ADR-010`/`ADR-011`.

## Related documents

- [[product]] · [[roadmap]] · [[architecture]] · [[MOC]]
- Requirements: [[fail-closed]] · [[multitenancy]] · [[sku-identity-resolver]] · [[invoice-status-machine]] · [[provider-abstraction]] · [[erp-esupl-integration]] · [[secret-encryption]] · [[supplier-criteria-registry]] · [[vpn-egress]] · [[config-secrets]] · [[auth]] · [[global-requirements]]

## Sources

- `APP_OVERVIEW.md` §4 (multitenancy/auth), §5 (secrets/fail-closed), §6–§7 (invoice flow, SKU identity), §8 (learning loop), §11 (data model) — verified_against_code 2026-07-09.
- `06_STRATEGY.md` §1–§2 — moat, routine ladder, identity.
- `plan/00_IMPLEMENTATION_PLAN.md` §2 (Pilot-Gate), G3/G5/G6.
