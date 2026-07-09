---
id: LCOS-F25
type: feature
title: Dead-code / seam cleanup bundle
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin]
entities: ["[[invoice_lines]]", "[[integration_credentials]]", "[[sku_mapping]]"]
requirements: ["[[provider-abstraction]]", "[[fail-closed]]", "[[erp-esupl-integration]]", "[[global-requirements]]"]
adrs: ["[[DEC-0011]]"]
legacy_refs: [plan S1-B2 S1-B3 S1-B4 S1-B5 S1-B6 S1-F1 S1-F2, 08 F1.3, backlog DEC-01 DEC-02 DEC-03 DEC-05 DEC-06 ALIGN-02 ALIGN-03, Conformance D-a D-b D-c D-e D-f A2 A3]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B2..B6 §S1-F1 §S1-F2 §AC-4..AC-7", "08_PHASE1_SPEC.md F1.3", "LCOS_Conformance_Alignment_GlobalRequirements.md 2.1/2.2", "APP_OVERVIEW.md §11", "TZ__STABILIZATION_2026-07-09__ALIGNED.md S6"]
updated: 2026-07-09
---
# LCOS-F25 · Dead-code / seam cleanup bundle

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Description

The stated principles are "one implementation per seam" and "no dead code / no unplanned components." Several places violate them: a second (Gemini) OCR/AI implementation, an unused vector column, a declared-but-unused credential scope, an unauthenticated Esupl code path, stale docstrings that contradict the code, and a bundle of frontend dead modules. This feature is the cleanup bundle that removes them so the codebase matches its declared invariants (`R7`, `R9`).

Backend removals: drop the Gemini OCR provider and the `if gemini else claude` transport branch, purge `gemini` from `CredentialProvider` / `ai_provider` / `gemini_model` (enum migration + row cleanup), and simplify the double-duty `resolve_ai_provider()` to a single vendor while keeping runtime model selection (DEC-01 = A, closes VER-03). Drop the unused `invoice_lines.sku_embedding Vector(1536)` column (keep the `vector` extension) and remove `SKU_EMBEDDING_DIM` (DEC-02 = A). Remove `CredentialScope.subdivision` from the enum + partial-unique index (DEC-03). Close the unauthenticated Esupl egress: `list_suppliers`/`list_ingredients` must be unreachable without a token — raise, never a silent `[]` when `ESUPL_API_BASE` is set (DEC-06). Fix the stale `ErpProvider.write_invoice` docstring ("None → fallback to global env token") to describe fail-closed (ALIGN-03).

Frontend removals (ALIGN-02): delete `shared/llm` (moving the live `stripCodeFence`/`clamp01`/`parseJsonSafe` helpers into `shared/lib`), `shared/ocr/prompt.ts` + `parse.ts`, `shared/match/prompt.ts` + `parse.ts`, and the browser-direct Esupl path (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_API_URL`, `VITE_ESUPL_READ_ONLY` from `.env.example` and `shared/pos/config.ts`), plus stale "mock/Gemini/Claude" comments — while **not** touching the live `shared/ocr/rules.ts` waybill helpers. Stop building/sending the candidate-set to the backend `suggest-matches` path; keep `buildMatchCandidates` for the mock provider only (DEC-05 = B). Finally, resolve the orphaned `IngredientSKUFactory.save()` (TZ S6): either wire it into an explicit "create mapping from picker" (`method='manual'`) flow or delete it — with no `cache_exact`/`confirmed_by='system'` auto-create.

## Capabilities

- Single OCR/AI vendor: only `claude` registered; `gemini` removed from providers, transport, enum, and stored rows; `resolve_ai_provider()` simplified (runtime `anthropic_model` selection kept).
- `invoice_lines.sku_embedding` column dropped (extension `vector` retained); `SKU_EMBEDDING_DIM` removed.
- `CredentialScope.subdivision` removed from the enum and the `uq_credentials_active_per_scope` partial-unique index (index recreated).
- No unauthenticated Esupl egress path remains: `list_suppliers`/`list_ingredients` removed or guarded to be unreachable without a token.
- `ErpProvider.write_invoice` and sibling docstrings describe fail-closed (no "env fallback").
- Frontend dead modules deleted; live helpers relocated to `shared/lib`; `rules.ts` untouched; build stays green.
- Backend `suggest-matches` no longer receives an FE candidate-set (backend remains the authoritative catalog source); mock keeps its candidate builder.
- Orphaned FE `save()` factory either wired into an explicit manual-mapping flow or deleted (zero dead code), never auto-creating commit-eligible mappings.

## Access by role

| Role | What they can do |
|---|---|
| [[superadmin]] | Config-plane beneficiary: `ai_provider` choices no longer include a non-existent `gemini`; the AI-provider resolver is unambiguous. |
| [[sqladmin-operator]] | Operator-plane beneficiary: stale `gemini` credential rows and the unused subdivision scope are gone, so the admin surface reflects reality. |
| [[member]] / [[admin]] | No user-visible change; the invoice flow behaves identically after cleanup. |

This is a maintenance feature with no new end-user capability.

## Involved entities

- [[invoice_lines]] — loses the unused `sku_embedding` column (schema-only change; no data read/written from it).
- [[integration_credentials]] — loses `gemini` rows and the `subdivision` credential scope; partial-unique index recreated.
- [[sku_mapping]] — indirectly touched via the orphaned FE factory decision (must not gain auto-created commit-eligible rows).

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (`R7.3`: one impl per seam; `R7.5`: no new impls without a trigger), [[fail-closed]] (`R8.2`: no unauthenticated egress; docstrings match fail-closed behaviour), [[erp-esupl-integration]] (read paths must carry a token), [[global-requirements]] (`R9.3`: no dead modules/exports).
- **Features:** the `sku_embedding` drop and the `save()` decision are tracked from [[LCOS-F22-sku-stabilization]]; the single-vendor invariant supports [[LCOS-F5-provider-seams]] and [[LCOS-F8-ocr-recognition]]; the candidate-set change touches [[LCOS-F9-line-matching]].
- **Decisions:** [[DEC-0011]] (`sku_embedding` is a dead placeholder for future semantic matching; backlog DEC-02 open).

## Acceptance Criteria (AC)

### Backend
- [ ] AC-BE-1. `grep -ri gemini mvp.be/app` is empty (except migrations); enums carry no `gemini`; the OCR registry contains only `claude`; `pytest` green (DEC-01 = A, closes VER-03).
- [ ] AC-BE-2. `invoice_lines.sku_embedding` is absent from the schema (migration up + working downgrade); the `vector` extension remains; `SKU_EMBEDDING_DIM` removed; `grep sku_embedding app/` empty.
- [ ] AC-BE-3. `CredentialScope.subdivision` removed from the enum (migration); `subdivision_id` removed from `uq_credentials_active_per_scope` (index recreated) and from now-dead signatures.
- [ ] AC-BE-4. No code path issues an unauthenticated HTTP request to Esupl: `list_suppliers`/`list_ingredients` are removed or raise without a token (test), never a silent `[]` when `ESUPL_API_BASE` is set.
- [ ] AC-BE-5. `ErpProvider.write_invoice` and any sibling docstrings describe fail-closed with no "env fallback" wording (ALIGN-03).

### Frontend
- [ ] AC-FE-1. `grep -r "VITE_ESUPL\|shared/llm\|ocr/prompt\|match/prompt" mvp.fe/src` is empty; `npm run build` green; the live `stripCodeFence`/`clamp01`/`parseJsonSafe` helpers now live in `shared/lib`.
- [ ] AC-FE-2. `shared/ocr/rules.ts` waybill helpers (`waybillSeries.isValid`/`isWaybillIdValid`/`totalRow`) remain and workbench validation still works.
- [ ] AC-FE-3. The backend `suggest-matches` request payload carries no `candidates` (devtools); `buildMatchCandidates` remains only for the mock provider (DEC-05 = B).
- [ ] AC-FE-4. `IngredientSKUFactory.save()` is either wired into an explicit "create mapping from picker" flow (`method='manual'`, requires a human action) or deleted; no `cache_exact`/`confirmed_by='system'` auto-create is introduced (variant C stays vetoed).

### Other (docs)
- [ ] AC-OTHER-1. ADR records for DEC-01(A), DEC-02(A), DEC-03, DEC-05(B), DEC-06 are written; backlog rows ALIGN-02/ALIGN-03 and the DEC-* above move to `done`.

## Open questions / gates

- **`CredentialScope.subdivision` — delete vs keep as a Phase-2 seam:** default is delete (per "none planned"); if a per-subdivision POS token is foreseen, keep it with an explicit "Phase 2 seam, unused" comment and a PHASE_P2 entry.
- **`sku_embedding` backlog DEC-02** is still `open`; this feature is where it closes.
- **CSRF (DEC-04) and POS-config authority (DEC-08)** are decided elsewhere (defer / keep) and are not part of this removal bundle.

## Sources

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B2..S1-B6` (backend removals), `§2 S1-F1/S1-F2` (frontend), `§5 AC-4..AC-7`.
- `08_PHASE1_SPEC.md F1.3` (sku_embedding drop + candidate-set B, migration references).
- `LCOS_Conformance_Alignment_GlobalRequirements.md §2.1` (A2 dead code, A3 docstrings), `§2.2` (D-a Gemini, D-b sku_embedding, D-c subdivision scope, D-e candidate-set, D-f unauthenticated egress).
- `APP_OVERVIEW.md §11` (`sku_embedding` unused, DEC-02 open); `TZ__STABILIZATION_2026-07-09__ALIGNED.md S6` (orphaned `IngredientSKUFactory.save()`).
- Current state: `mvp.fe/src/shared/llm/*`, `shared/ocr/prompt.ts`+`parse.ts`, `shared/match/prompt.ts`+`parse.ts`, `shared/pos/config.ts` (`VITE_ESUPL_*`), `.env.example`, `entities/order` all still present; `mvp.be/app/providers/erp/esupl.py:80/:104` (list methods).
