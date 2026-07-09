---
doc: OBSOLETE_DOCS
title: LCOS — Устаревшие документы (кандидаты на удаление/архив)
version: 1.1.0
status: current
updated: 2026-07-03
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [obsolete-docs-list]
---

# Устаревшие документы — кандидаты на удаление

> Список файлов `mvp.docs/`, которые после создания `plan/*` (2026-07-03) больше
> не являются источником истины.
>
> **Статус 2026-07-03: раздел 1 (17 файлов) ПЕРЕНЕСЁН в `archive/`** (по регламенту
> README §5; агенты `archive/` не читают). Физическое удаление `archive/` — на усмотрение
> владельца в любой момент. Раздел 2 остаётся в корне до выполнения условий (фаза S1).

## 1. Перенесено в `archive/` 2026-07-03 (истина полностью перенесена или мертва)

| Файл | Почему устарел | Куда перенесена истина |
|---|---|---|
| `Local_OS_Functional_Stages_v01.md` | Стадии F0–F10 переформализованы; Telegram-стек мёртв | `plan/00_IMPLEMENTATION_PLAN.md` + `plan/PHASE_F*.md` |
| `Local_OS_Specification_v04.md` | Telegram-бот / Java-Node / no-auth — противоречит коду; актуальные крохи (метрики, объёмы данных, гейты S3–S5) извлечены | `plan/*` (метрики в фазах, S3–S5 в `PHASE_P2_SAAS_OUTLINE.md`) |
| `Local_OS_MVP1_AgentSpec.md` | Спека one-shot агента для F1/F2 в no-auth-архитектуре; F1/F2 реализованы иначе (mvp.be/mvp.fe); полезные остатки (промпт-правила, multi-page) учтены | `plan/PHASE_S2_OCR_CAPTURE.md`; as-built — `01_ARCHITECTURE.md` |
| `LCOS_Stabilization_AuthKeys_Spec.md` | Явно вытеснен более полным Conformance-документом (см. его шапку и README §7) | `LCOS_Conformance_Alignment_GlobalRequirements.md` → далее `02_REQUIREMENTS.md` |
| `scan-preprocessing-plan.md` | Phase 1 (normalize) сделана и описана в 01_ARCHITECTURE; Phases 2–4 переформализованы | `plan/PHASE_S2_OCR_CAPTURE.md` |
| `no-ai-ocr-options.md` | Анализ опций; решение зафиксировано | ADR-014 в `04_DECISIONS.md` |
| `recognition-feature.md` | Рабочий журнал закрытой фичи (2026-06-29), итог влит в архитектуру | `01_ARCHITECTURE.md` (recognition/каталог/фасовки) |
| `Local_OS_MVP_OnePager.docx` | Питч v01 (Poster/Telegram/Java) — мёртвый пивот | — (историческое) |
| `Local_OS_MVP_OnePager_v02.docx` | Питч v02 (purchasing/marketplace pivot) — мёртвый пивот | — |
| `Local_OS_OnePager_v03.docx` | Вытеснен `Local_OS_About.md` | `Local_OS_About.md` → `00_PRODUCT.md` |
| `Local_OS_Roadmap.xlsx` | Вытеснен v03, оба вытеснены планом | `plan/00_IMPLEMENTATION_PLAN.md` |
| `Local_OS_Roadmap_v03.xlsx` | То же | `plan/00_IMPLEMENTATION_PLAN.md` |
| `presentation.html` | Питч-материал прошлых пивотов | — |
| `investor_deck.html` | То же | — |
| `investor_deck_v02.html` | То же | — |
| `Local_OS_Deck_v03.html` | То же | — |
| `photo_2026-06-04_11-02-09.jpg` | Похоже на тестовое фото накладной в корне доков; проверить и убрать из docs (тест-фикстурам место в репо кода) | — |

## 2. Архивировать ТОЛЬКО после условия (сейчас ещё живые, остаются в корне)

| Файл | Условие удаления |
|---|---|
| `LCOS_Conformance_Alignment_GlobalRequirements.md` | После фазы S1: Часть 3 перенесена в `02_REQUIREMENTS.md` (Часть 2 уже перенесена в `05_BACKLOG.md`, Часть 1 — разовая сверка). До создания `02_REQUIREMENTS.md` это ЕДИНСТВЕННЫЙ носитель нормативных R1–R9 — не трогать. |
| `Local_OS_About.md` | После создания `00_PRODUCT.md` (перенос по README §7; запланировано в фазе S1). |

## 3. НЕ удалять (живое)

- `README.md`, `01_ARCHITECTURE.md`, `04_DECISIONS.md`, `05_BACKLOG.md` — канонические.
- `plan/*` — созданы 2026-07-03, нормативные требования имплементации.
- `api/esupl/**` — актуальный референс Esupl API; потребуется в фазе F5 (разведка данных
  продаж). Включая `api/esupl/raw/*` (collection.json + HOW-TO-REFRESH).

---

## Журнал изменений
- 2026-07-03 v1.1.0 — раздел 1 (17 файлов) фактически перенесён в `archive/` (git mv); раздел 2 остаётся до фазы S1.
- 2026-07-03 v1.0.0 — создан вместе с plan/*; разметка по карте миграции README §7.
