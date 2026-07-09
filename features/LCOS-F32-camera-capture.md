---
id: LCOS-F32
type: feature
title: Direct camera capture (mobile-first)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]"]
requirements: ["[[provider-abstraction]]"]
adrs: ["[[ADR-014]]"]
legacy_refs: [plan S2 (S2-F3), "scan-preprocessing-plan Phase 3"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §2 (S2-F3), §4 AC-3", "mvp.fe src/widgets/prepare-step/ui/PrepareStep.tsx:156", "mvp.fe src/shared/ocr/preprocess/normalizeImage.ts", "mvp.docs pwa-setup"]
updated: 2026-07-09
---
# LCOS-F32 · Direct camera capture (mobile-first)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Description

The product is a mobile-first PWA and the primary capture device is the phone in the user's hand at goods-in. Today the upload step uses a plain `<input type="file" accept=".jpg,.jpeg,.png,.pdf">`, which on mobile opens a chooser (gallery / files / camera) rather than the camera directly. This feature adds `capture="environment"` so tapping "add page" opens the rear camera straight away — one tap fewer, and the rear (not selfie) lens.

Optionally, if it is cheap to implement, the capture step warns on obvious quality problems (glare / blur) before recognition; if not cheap, that warning is explicitly deferred rather than half-built. Everything else in the pipeline is unchanged: a captured photo flows into the same auto-crop ([[LCOS-F31-auto-crop]]) and `normalizeImage` single-pass preprocessing before it reaches the OCR seam, and up to `MAX_INVOICE_PAGES` photos can be taken for a multi-page invoice ([[LCOS-F29-multipage-recognize]]). No image binarization is introduced ([[ADR-014]]).

This is a frontend-only capability — no backend contract change. It matters for Pilot-Gate because friction in step 1 (capture) is the biggest source of drop-off in the invoice routine.

## Capabilities

- `capture="environment"` on the page file-input so mobile taps open the rear camera directly.
- Falls back gracefully on desktop / unsupported browsers to the normal file chooser (attribute is advisory).
- Captured photo enters the existing pipeline: auto-crop ([[LCOS-F31-auto-crop]]) → `normalizeImage` (single resize+JPEG pass) → held page.
- Works with multi-page capture: repeated captures accumulate up to `MAX_INVOICE_PAGES = 3`.
- Optional cheap quality warning (glare / blur) at capture time — or an explicit deferral note if not cheap.

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Taps to capture invoice pages directly from the phone's rear camera at goods-in. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Same across tenants. |
| [[sqladmin-operator]] | Not in the flow. |

Client-side capture only; no extra server authorization.

## Involved entities

- [[invoices]] — captured photos become the `InvoiceDraft` on `/recognize`; nothing persisted at capture time.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (captured image goes through the same single-pass preprocessing before the OCR seam).
- **Features:** pairs with [[LCOS-F31-auto-crop]] (camera photos most need cropping/deskew) and [[LCOS-F29-multipage-recognize]] (capture multiple pages); feeds [[LCOS-F8-ocr-recognition]]. PWA/mobile-first context per the vault PWA setup note.
- **ADR:** [[ADR-014]] (no binarization in prep).

## Acceptance Criteria (AC)

### Frontend
- [ ] AC-FE-1. The page file-input carries `capture="environment"`; on a mobile browser, tapping "add page" opens the rear camera directly (not the selfie lens, not a generic chooser).
- [ ] AC-FE-2. On desktop / browsers without capture support, behavior falls back to the normal file chooser with no error.
- [ ] AC-FE-3. A captured photo flows through the existing auto-crop + `normalizeImage` single pass and is held as a page; multi-page capture accumulates up to `MAX_INVOICE_PAGES = 3`.
- [ ] AC-FE-4. Optional glare/blur warning is shown at capture only if cheap to detect; otherwise it is recorded as a deferred item (not partially implemented).

### Backend
- [ ] AC-BE-1. No backend change: `/invoices/recognize` contract (MIME set, per-page size, up to 3 pages) is unaffected by the capture source.

## Open questions / gates

- **Glare/blur warning is conditional** — ship only if implementable cheaply; otherwise defer explicitly (recorded, not left half-done).
- **iOS/Android PWA behavior** — confirm `capture` semantics across target mobile browsers; the attribute is advisory and must degrade cleanly.
- **PDF path** — `capture` applies to image capture; existing PDF attach path is unchanged.

## Sources

- `plan/PHASE_S2_OCR_CAPTURE.md` §2 S2-F3 (`capture="environment"`, optional glare/blur warning or defer), §4 AC-3 (real-photo pipeline).
- `mvp.fe/src/widgets/prepare-step/ui/PrepareStep.tsx:156` (`<input type="file" accept=".jpg,.jpeg,.png,.pdf">` — where `capture` is added), `src/shared/ocr/preprocess/normalizeImage.ts` (downstream single-pass prep), `src/entities/invoice/model/sessionSlice.ts:22` (`MAX_INVOICE_PAGES`).
- Vault: `pwa-setup` (mobile-first PWA context).
