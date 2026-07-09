---
id: LCOS-E6
type: epic
title: OCR capture quality
status: planned
phase: "Phase 1"
features: ["[[LCOS-F29-multipage-recognize]]", "[[LCOS-F30-recognition-context]]", "[[LCOS-F31-auto-crop]]", "[[LCOS-F32-camera-capture]]", "[[LCOS-F33-confidence-gate]]"]
legacy_refs: [plan S2]
sources: [07_PHASES.md S2, 08_PHASE1_SPEC.md, APP_OVERVIEW.md §6]
updated: 2026-07-09
---

# LCOS-E6 · OCR capture quality

**Status:** 📝 planned · **Phase:** Phase 1

## Description

Improving the reliability of the pipeline's first step — capturing and recognizing the invoice photo. The wedge ([[LCOS-E2-invoice-intake]]) recognizes single-page photos; this epic completes the quality work: robust recognition of multi-page invoices, passing recognition context into the prompt (a list of known SKUs/suppliers as a hint to the model), page auto-crop (OpenCV.js on the client), direct camera capture (mobile-first PWA), and a post-recognition confidence gate that prevents garbage lines from silently slipping into the draft.

Part of the problem is already covered by the interim fix for silent multi-page loss ([[LCOS-F26-multipage-fix]] in [[LCOS-E5-stabilization]]); this epic is the full solution.

## Goal / value

Fewer manual edits after OCR → closer to "the AI does the work, the human only confirms." Poor capture is the main source of friction in step 1; removing it directly affects passing the Pilot-Gate.

## Features

| ID | Name | Status | Link |
|---|---|---|---|
| LCOS-F29 | Multi-page recognition | 📝 planned | [[LCOS-F29-multipage-recognize]] |
| LCOS-F30 | Recognition context in the prompt | 📝 planned | [[LCOS-F30-recognition-context]] |
| LCOS-F31 | Auto-crop (OpenCV.js) | 📝 planned | [[LCOS-F31-auto-crop]] |
| LCOS-F32 | Camera capture | 📝 planned | [[LCOS-F32-camera-capture]] |
| LCOS-F33 | Post-recognition confidence gate | 📝 planned | [[LCOS-F33-confidence-gate]] |

## Key entities / requirements

- Entities: [[invoices]], [[invoice_lines]], [[ingredients]], [[suppliers]], [[system_settings]] (OCR prompt).
- Requirements: [[provider-abstraction]], [[vpn-egress]], [[invoice-status-machine]].
- Roles: [[member]] (captures and recognizes).

## Gates

- **Confidence gate (kill-criteria):** lines below the confidence threshold do not pass silently — they are either flagged for review or block the draft; silent data loss is unacceptable (the principle from [[LCOS-E5-stabilization]]).
- **VPN-egress:** the OCR provider is called only through the VPN sidecar when `ai_vpn_enabled`; VPN down → fail-closed refusal ([[ADR-006]], [[vpn-egress]]).
- **OCR prompt** is stored in `system_settings` (migration `1e12…`), edited without a deploy.

## legacy_refs

plan S2 (OCR quality).

## Sources

- 07_PHASES.md S2, 08_PHASE1_SPEC.md (OCR section)
- APP_OVERVIEW.md §6 (recognize), §3 (OCR providers)
- ADR: [[ADR-006]], [[ADR-009]], [[ADR-012]]
