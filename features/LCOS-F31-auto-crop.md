---
id: LCOS-F31
type: feature
title: Auto-crop document edges (OpenCV.js, client-side)
epic: "[[LCOS-E6-ocr-quality]]"
status: planned
phase: "Phase 1"
roles: [member, admin, superadmin]
entities: ["[[invoices]]"]
requirements: ["[[provider-abstraction]]"]
adrs: ["[[ADR-014]]"]
legacy_refs: [plan S2 (S2-F2), "scan-preprocessing-plan Phase 2"]
sources: ["plan/PHASE_S2_OCR_CAPTURE.md §2 (S2-F2), §4 AC-3/AC-4", "mvp.fe src/features/image-cropper/ui/ImageCropper.tsx", "mvp.fe src/shared/ocr/preprocess/cropImage.ts", "mvp.fe src/shared/ocr/preprocess/normalizeImage.ts", "mvp.fe src/shared/ocr/preprocess/config.ts (MAX_LONG_EDGE)"]
updated: 2026-07-09
---
# LCOS-F31 · Auto-crop document edges (OpenCV.js, client-side)
**Epic:** [[LCOS-E6-ocr-quality]] · **Status:** planned · **Phase:** Phase 1

## Description

A photo of a waybill on a desk usually includes the table surface, hands and background clutter. Sending the whole frame to the vision model wastes the 1568px budget on non-document pixels and lowers recognition quality. Today the user must drag the four corner handles of `ImageCropper` manually. This feature adds **automatic** document-edge detection so the frame is proposed for them, with manual correction always available as a fallback ("auto-first, manual-optional").

Detection runs entirely on the client with a lazily loaded OpenCV.js (~8MB WASM). It loads only when the scanner opens, so it must not enter the main bundle. The pipeline is the classic quad-finder: grayscale → blur → Canny/Otsu edges → largest quadrilateral → `warpPerspective`; the result is handed to the existing `ImageCropper` with the corner handles pre-placed. Per [[ADR-014]] no binarization/thresholding of the final image is introduced — the model wants a natural photo, just cropped and deskewed.

Crucially the flow is **fail-open**: if OpenCV fails to load (offline, broken WASM) or finds no confident quad, the user simply gets today's manual cropper and recognition is never blocked. A forced confirm step appears **only** on a weak quality signal (low edge confidence, strong skew, document filling <60% of the frame); otherwise the crop is applied quietly. The pipeline order is fixed: crop → the existing `normalizeImage` (single resize+JPEG pass), so a cropped page is encoded exactly once ([[provider-abstraction]] preprocessing contract).

## Capabilities

- Automatic document-boundary detection on the captured image using lazily loaded OpenCV.js (grayscale → blur → Canny/Otsu → largest quad → `warpPerspective`).
- Detected quad is shown as pre-placed corner handles in the existing `ImageCropper`; manual adjustment is always available.
- Quiet apply on a strong signal; a forced confirm step only on a weak signal (low edge confidence, strong skew, or document <60% of frame).
- Pipeline order crop → `normalizeImage` (one resize to `MAX_LONG_EDGE = 1568` + one JPEG encode) — no stacked compression; mirrors the existing single-pass `cropImage`.
- Fail-open: any OpenCV/WASM load or detection error falls back to manual crop; recognition proceeds regardless.
- OpenCV.js is code-split and lazy-loaded — not present in the initial/main bundle.
- No binarization/thresholding of the output image (ADR-014).

## Access by role

| Role | What they can do |
|---|---|
| [[member]] | Captures/attaches a page; the document is auto-cropped and shown for confirmation; can adjust corners manually. |
| [[admin]] | Same as member, within their subdivision. |
| [[superadmin]] | Same across tenants. |
| [[sqladmin-operator]] | Not in the flow. |

Purely a client-side capture aid; no additional server authorization.

## Involved entities

- [[invoices]] — the auto-crop improves the page bytes that become an `InvoiceDraft` on `/recognize`; nothing is persisted at this step.

## Dependencies / links

- **Requirements:** [[provider-abstraction]] (the preprocessing contract: a page is one deliberate resize+JPEG pass before the OCR seam receives it).
- **Features:** feeds [[LCOS-F8-ocr-recognition]] / [[LCOS-F29-multipage-recognize]] (cleaner pages per request); pairs with [[LCOS-F32-camera-capture]] (camera photos most need cropping). The existing `ImageCropper` (manual crop) is the fallback surface.
- **ADR:** [[ADR-014]] (no binarization/threshold in image prep).

## Acceptance Criteria (AC)

### Frontend
- [ ] AC-FE-1. On 5 real desk photos of waybills, the document quad is detected and proposed automatically in at least 4; corner handles are pre-placed in `ImageCropper`.
- [ ] AC-FE-2. Manual corner adjustment is always available and, on confirm, produces the provider-ready page via the same single-pass crop→normalize (`cropImage` → `MAX_LONG_EDGE`, one JPEG encode).
- [ ] AC-FE-3. A forced confirm step appears only on a weak quality signal (low edge confidence / strong skew / document <60% of frame); on a strong signal the crop applies quietly.
- [ ] AC-FE-4. Fail-open: with OpenCV.js unavailable (offline / broken WASM) the flow degrades to today's manual cropper and recognition is not blocked.
- [ ] AC-FE-5. OpenCV.js is code-split and lazy-loaded only when the scanner opens — a `vite build` chunk-size check confirms it is not in the main bundle.
- [ ] AC-FE-6. No binarization/thresholding is applied to the output image (ADR-014); the page remains a natural cropped photo.

### Backend
- [ ] AC-BE-1. No backend change: `/invoices/recognize` still receives a single normalized JPEG per page and its MIME/size contract is unchanged; the auto-crop must not produce bytes exceeding `MAX_LONG_EDGE` or the size cap.

### Other (QA/perf)
- [ ] AC-OTHER-1. Bundle/perf: opening the scanner triggers the lazy OpenCV load once; time-to-interactive of the app's initial route is unaffected (OpenCV absent from the entry chunk).

## Open questions / gates

- **Fail-open is mandatory** — auto-crop is an aid, never a gate; any failure silently reverts to manual crop.
- **Weak-signal thresholds** (edge confidence, skew angle, <60% frame) need tuning against real photos; capture the tuned values in `work/phase-s2.md`.
- **WASM weight** — ~8MB must stay out of the main bundle; confirm caching so repeat scans don't re-download.

## Sources

- `plan/PHASE_S2_OCR_CAPTURE.md` §2 S2-F2 (auto-first/manual-optional, lazy OpenCV.js pipeline, weak-signal confirm, crop→normalize order, fail-open, no binarization/ADR-014), §4 AC-3 (5-photo detection metric), AC-4 (not in main bundle).
- `mvp.fe/src/features/image-cropper/ui/ImageCropper.tsx` (manual corner-handle cropper, fallback surface), `src/shared/ocr/preprocess/cropImage.ts` (single-pass crop→resize→JPEG, fail-open), `src/shared/ocr/preprocess/normalizeImage.ts`, `src/shared/ocr/preprocess/config.ts` (`MAX_LONG_EDGE = 1568`).
