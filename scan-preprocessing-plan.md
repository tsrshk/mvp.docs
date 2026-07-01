# Scan preprocessing & capture UX — plan

**Date:** 2026-06-22
**Context:** OCR is done by **vision-LLMs** (Gemini 2.5 Flash Lite, Claude Haiku 4.5),
not a classic OCR engine. This single fact drives every decision below — techniques
that help Tesseract (binarization, hard grayscale, thresholding) are neutral-to-harmful
for vision-LLMs, which were trained on natural RGB photos and read 2D layout natively.

Currently there is **zero** client-side preprocessing: `fileToOcrPage` sends the raw
captured file straight to the provider (`shared/ocr/encode.ts`).

## Guiding decisions (the "why")

- **Do NOT build a draw/mark-line-items UI.** Vision-LLMs read whole-page layout; manual
  region marking helps only OCR-engine→LLM pipelines (which we don't use). High effort,
  high friction, ~zero ROI. Industry scanners (CamScanner, Adobe Scan, Apple Notes, MS
  Lens) never ask users to mark fields — they work at the page level.
- **UX = "auto-first, manual-optional", never a mandatory crop.** Silent auto-crop +
  deskew by default; show the result with corner handles already placed; force a confirm
  step only on a weak quality signal (low edge confidence, extreme skew, blur, page fills
  <~60% of frame).
- **Accuracy levers, by impact:** (1) tight crop to document boundary, (2) deliberate
  resize to the provider's budget, (3) keep smallest critical glyphs ≥~20–25px tall in
  the final image, (4) catch glare at capture (it makes VLMs *hallucinate* confident wrong
  values), (5) JPEG q≈85–90 encoded exactly once, (6) post-recognition confidence gate.
- **Pitfalls to avoid:** binarization/threshold, aggressive grayscale/denoise, upscaling a
  low-res capture, sending an oversized full-frame and letting the provider silently
  downscale, over-cropping into the content, multiple JPEG passes.

## Insertion points (verified in code)

- `shared/ocr/encode.ts` — `fileToOcrPage(File) → OcrPage` (base64 + mime). The boundary.
- `widgets/upload-step/ui/UploadStep.tsx` — `attach()` at line 40: where picked files
  become held binaries + Redux metadata. **Preprocess here** so the held binary == exactly
  what's sent == what PhotoViewer shows (also keeps bbox overlay coords aligned).
- `shared/lib/fileHolder.ts` — ordered held binaries, index-aligned with metadata.
- `features/photo-viewer/ui/PhotoViewer.tsx` — displays binaries; host for crop overlay.
- `shared/ocr/rules.ts` — `waybillSeries/waybillNumber.isValid`, `totalRow.matches` —
  the per-field validators that become the confidence gate.

---

## Phase 1 — Silent normalization pipeline  *(pure win, no UX change)*  ✅ DONE 2026-06-22

New module `shared/ocr/preprocess/`:

- `config.ts` — constants + rationale:
  - `MAX_LONG_EDGE = 1568` (Claude Haiku native long-edge cap; also safe for Gemini tiling).
  - `JPEG_QUALITY = 0.88` (quality floor ~85–90; encode once).
- `normalizeImage.ts` — `normalizeImage(file: File): Promise<File>`:
  1. PDFs / non-images → returned unchanged (PDFs go to Claude as document blocks).
  2. Decode via `createImageBitmap(file, { imageOrientation: 'from-image' })`; fallback to
     an `<img>` element (both honor EXIF orientation in current browsers — critical for
     iPhone captures).
  3. `scale = min(1, MAX_LONG_EDGE / max(w, h))` — **never upscale**.
  4. Draw to a canvas at scaled size; `toBlob('image/jpeg', JPEG_QUALITY)`.
  5. Wrap in a new `File` (name → `.jpg`, type `image/jpeg`).
  6. **Fail-open**: any error → return the original file (preprocessing must never block
     recognition).
- `index.ts` — barrel; re-export from `shared/ocr/index.ts`.

Wire into `UploadStep.attach`: make it `async`, run `normalizeImage` over accepted files,
add a lightweight "Обрабатываю…" disabled state, then `addHeldFiles(prepared)` +
`filesAttached(prepared metadata)`.

**Win:** a 4000px / 8MB phone photo → ~1568px / ~300KB, EXIF-rotated correctly, single
JPEG pass. Reliable accuracy + cost improvement with no friction. **Verify:** `tsc`/build
green, manual scan still recognizes.

## Phase 2 — Crop + perspective (auto-first, manual-optional)  *(biggest chunk)*

- Crop overlay on the attached image in `PhotoViewer` (or a dedicated step): draggable
  corner handles, rotate.
- Auto edge-detection via **lazy-loaded OpenCV.js** (~8MB WASM, load only on scanner open):
  grayscale → blur → Canny/Otsu → largest quad → `warpPerspective`. Manual corner-drag is
  the always-available fallback (classical contour detection fails on cluttered/low-contrast
  backgrounds).
- Output feeds the Phase 1 normalize step (crop first, then resize+encode once).
- Confirm step **conditional** on weak quality signal, not mandatory.

## Phase 3 — Capture-time guidance  *(smaller)*

- `capture="environment"` on the file input for direct camera use on mobile.
- Optional: auto-capture when edges stable; glare/blur warning ("сдвиньте, чтобы убрать
  блик") — glare is the one defect worth catching at the source.

## Phase 4 — Post-recognition confidence gate  *(independent of capture)*

- Use `rules.ts` validators after recognition: if `waybillSeries`/`waybillNumber` and the
  total all validate, auto-advance to the Esupl draft; otherwise surface **only** the
  failing fields for one-tap correction or a targeted single-page retake — not a full form.

## Follow-up / refinements

- Provider-aware resize target (token-perfect): Claude caps both long-edge **and** visual
  tokens (`ceil(w/28)·ceil(h/28) ≤ 1568` on Haiku) — near-square images at 1568px still
  exceed the token cap and get silently downscaled. Compute a token-aware target per
  provider once Phase 1 is validated.
- A/B harness on real receipts (raw vs cropped+resized vs +binarized) per provider to tune
  the exact target.
