---
doc: REQUIREMENTS_STATUS
title: "Статус требований Phase-1 (снимок 2026-07-10)"
status: archived
archived: 2026-07-15
archived_from: repo-root (d:/_work/mvp)
reason: "Статусы фич — SSOT во front-matter features/LCOS-F*; переходим на spec-kit"
trust_tier: 3
open_findings: true
open_findings_action: extract-to-[[05_BACKLOG]]
---

> Архивировано 2026-07-15 из корня репозитория. Документ инертен — не читается как актуальный. Содержит НЕзакрытые находки: перед опорой на spec-kit вынести в [[05_BACKLOG]].
# Where We Are vs Phase-1 Requirements — LCOS

**Date:** 2026-07-10 · **Purpose:** give the owner a grounded "current position" and a **manual test checklist of already-built functionality** — so effort goes into *verifying and hardening the built wedge*, not building new features. Cross-checked docs (`roadmap.md`, `09_PHASE1_TASKS.md`, `05_BACKLOG*`, `TZ__STABILIZATION…ALIGNED.md`, features E1–E5) against actual code (`mvp.be/app`, `mvp.be/tests`, `mvp.fe/src`, `mvp.fe/e2e`).

## Position summary

**Phase-1 is exactly where the docs say.** The invoice wedge is **built and code-verified**: E1 platform, E2 intake, E3 SKU identity/learning-loop. E4 suppliers is **partial** (cards + criteria-registry live; price-history/self-service planned). E5 stabilization is **partial** (the DEC-0011/0013 commit path and 17 merge-gate tests are confirmed in code; fail-closed encryption, dead-code cleanup, multipage fix, receipts rename still open). E6 (OCR quality), E7 (stock), E8 (purchasing) have **zero code** — correctly, since they sit behind the Pilot-Gate.

**Code and docs agree on almost everything checked.** The right move now is to **manually exercise the built E2–E4 wedge with the real coffee shop**, not start E6/E7/E8. Two things to surface immediately: **(1)** fail-closed secret encryption still has a silent-plaintext fallback in local mode (contradicts a stated non-negotiable); **(2)** **VER-021** (Esupl `pos_ingredient_id` durability) is still empirically unconfirmed and keeps merge gated — it is the top open technical risk for the pilot.

> Exact green-test counts (docs claim ~209 BE / 43 FE) could **not** be run here — no local Postgres; the DB-backed suite runs only in CI.

## Epic status (Phase 1)

| Epic | Doc says | Code reality | Verdict |
|------|----------|--------------|---------|
| **E1 Platform** | ✅ built | Org/Subdivision/User/Membership/RefreshSession scoped; IntegrationCredential (Fernet), SystemSetting registry; provider seams; auth + AuthGuard + e2e (3 tests pass) | **matches** |
| **E2 Invoice intake (wedge)** | ✅ built | `/recognize` `/prepare` `/suggest-matches` `POST`(submit) `list` `get`; `invoice_service` recognize→prepare→submit, commit-validation, write gated by `ERP_WRITE_ENABLED` (default off), fail-closed; workbench + warehouse selector | **matches** |
| **E3 SKU identity & moat** | ✅ built | `IngredientCache`/`SkuMapping`/`Ingredient`/`Packing`; sku/match/catalog services; learning loop **migrated off localStorage to backend** (apply-on-load + persist-on-send, method=manual→commit-eligible); mappings tests present | **ahead** |
| **E4 Suppliers & criteria** | 🟡 partial | `suppliers` CRUD + criteria-schema + JSONB `criteria` + registry validate; FE SuppliersPage/Form/CriteriaFields; e2e suppliers spec. No price-history/self-service (planned) | **matches** |
| **E5 Stabilization** | 🟡 partial | F22 confirmed (`_resolve_commit_identities` = DEC-0011/0013 variant A exactly); **exactly 17 `@pytest.mark.merge_gate`** functions. F23 fail-closed encryption **NOT done** (local plaintext fallback). F27 receipts-rename **NOT done**. DEC-02 `sku_embedding` drop **NOT done** | **matches** |
| **E6 OCR quality** | 📝 planned | Single-page only; FE sends `page[0]` (DEC-07 known loss). No auto-crop/confidence-gate. Nothing built | **matches** |
| **E7 Stock** | 📝 planned | No stock model/routes/`reorder_point`/`/stock` page. Nothing built | **matches** |
| **E8 Purchasing** | 📝 planned | No `purchase_orders`/order routes/planning service/`/orders` page. Nothing built | **matches** |

## ✅ Manual test checklist — exercise these BUILT features now (priority order)

1. **Invoice wedge end-to-end (E2).** Upload a real supplier invoice photo at `/invoices/new` → OCR draft renders lines; supplier auto-resolves from OCR (УНП/name); per-line arithmetic (qty×price) checks out; `/prepare` builds an Esupl payload only when supplier+warehouse+team+all lines resolve (else a warnings list). *This is the whole product — surfaces OCR/resolver gaps before anything new is built.*
2. **SKU learning loop & moat (E3).** Pick a SKU on a fresh line and Send. Re-open a second invoice from the **same supplier** with the same line text → mapping auto-applies **from backend** (not localStorage); `GET /ingredients/mappings` shows the row (`method=manual`). A **different** supplier with identical text must **not** inherit it. *Newest wiring (S6), most likely to have edge bugs; the moat only compounds if this works.*
3. **Fail-closed commit gate — DEC-0011/0013 (E3/E5).** Try to submit with (a) a line with **no** confirmed sku_mapping → must **block** ("requires manual confirmation"); (b) POS/Esupl unreachable → must **block** (not fail-open); (c) unit mismatch → must **block**. None may silently pass. *Merge-gate non-negotiable guarding wrong ERP writes.*
4. **ERP write gate (guardrail).** With `ERP_WRITE_ENABLED=OFF` (default), submit a fully-resolved invoice → status becomes `prepared`, **no** POST to Esupl `outgoing-invoices`; payload built but not sent. *The single safety valve — verify before ever flipping it on.*
5. **Supplier CRUD + flexible criteria (E4).** Create a supplier with delivery conditions; edit criteria; submit an invalid/out-of-registry criterion → backend **422**; valid JSONB round-trips. Enter 5–7 real suppliers from a phone (mobile layout).
6. **Auth & multitenancy (E1).** Login (admin/admin; iter/iter superadmin); wrong creds → honest error; logged-out deep-link → `/login`; org A user cannot read org B on any endpoint; refresh rotation + **reuse-detection** (reused refresh token rejected). *(The 3 e2e auth tests already automate the first three — [FRONTEND E2E](mvp.fe/e2e/auth.spec.ts).)*
7. **Warehouse target on submit (F12).** Selector defaults from subdivision, blocks submit when empty, chosen warehouse (not a silent default) flows into the payload. *Wrong warehouse corrupts Esupl stock.*
8. **Fail-closed encryption of secrets (E5 gap).** Store a POS token / AI key with `SECRETS_ENC_KEY` **unset** and inspect `integration_credentials`. **Today it stores PLAINTEXT** (only a `log.warning`) in local mode — confirm, and decide whether **F23** must ship before entering real credentials. *(In prod this is already fail-closed — KEK required at startup.)*
9. **Multi-page invoice loss (DEC-07 known gap).** Upload a 2–3 page invoice → confirm whether pages 2–3 are silently dropped (only `page[0]` sent) and whether the user is warned. *Owner should know invoices must be single-page today, or lines vanish.*

## ⛔ Scope guardrails — do NOT drift into these (dev stop-list)

- **No chat/conversational UI** before routine-ladder step 4 (confirmed absent — keep it so).
- **No billing** (F68 = Phase 2).
- **No Celery/APScheduler/background jobs** — OCR stays synchronous (F47 scheduler = Phase 2). Seams only.
- **No ERP writes** beyond the `ERP_WRITE_ENABLED` gate (default OFF); Esupl is strictly read-only. Do **not** run the VER-021 durability probe in a read-only/dev session — it is owner-run, write-gated.
- **No pgvector / embedding matching.** `sku_embedding` still exists (unused) but matching is text-normalize + confirmed `sku_mapping` only. DEC-02 = **drop** the column, not use it.
- **Do not start E6 / E7 / E8** — all three are 📝 with zero code. Harden the built E2–E4 wedge in the real shop first; the **Pilot-Gate** (4 weeks real use, ≥3 h/week saved) governs Phase-2 entry.
- **One implementation per seam** (OCR=claude, ERP=esupl). Note: **gemini OCR/AI is still live** (`providers/ocr/gemini.py`, `ai.py` dispatch) — do not expand it; DEC-01 is claude-only.

## ⚠️ Gaps where docs & code disagree (worth resolving)

1. **Fail-closed encryption not fully implemented** despite the CLAUDE.md non-negotiable — `encrypt()` silently stores **plaintext** with a `log.warning` when `SECRETS_ENC_KEY` is unset (local mode). E5 honestly marks **F23 "planned"**, but `05_BACKLOG` traces ALIGN-01→F1.4 as if scheduled. Prioritize before real credentials are entered. *(Prod is safe — KEK enforced at startup.)*
2. **VER-021 (Esupl `pos_ingredient_id` durability) unconfirmed, owner-run, merge stays gated.** The entire DEC-0011 commit-identity model rests on this assumption — **top open technical risk** for the pilot.
3. **Doc test-count inconsistencies** (non-blocking, erode trust): E5 epic claims 209 BE/43 FE; TZ DoD says 201/37; TZ body says "10 merge_gate (7+3)" but DoD/epic say 17 — **code shows exactly 17**. Reconcile the numbers.
4. **DEC-05 not applied** — FE still builds a match candidate-set on the backend path (`entities/invoice/api/invoicesApi.ts:139`); ratified recommendation B was to stop building it for the backend path. Slated under F1.3/F25.
5. **`sku_embedding` column drop (DEC-02/F1.3) not done** — `Vector(1536)` + `SKU_EMBEDDING_DIM` still live; harmless but contradicts the decision (a pgvector footgun).
6. **`entities/order` → `receipts` rename (F27) not done** — cosmetic, but a named Phase-1 item reading as unstarted.
7. **Gemini remains a second OCR/AI vendor** despite the one-impl guardrail + DEC-01 — explicitly deferred, not a blocker, but the seam has two live implementations.

---

**Bottom line:** you are **not behind** — the built wedge (E1–E4) matches the plan, E3 is arguably ahead. Spend the next stretch on the **9-item checklist above** with the real coffee shop, close the **F23 encryption** and **VER-021 durability** gaps, and hold the line on the stop-list until the Pilot-Gate.

Backend & DB: [BACKEND_DB_REVIEW.md](BACKEND_DB_REVIEW.md) · Frontend: [FRONTEND_REVIEW.md](FRONTEND_REVIEW.md)
