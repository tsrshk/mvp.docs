---
doc: README
title: Хранилище документации LCOS — карта и соглашения
version: 2.0.0
status: current
updated: 2026-07-09
owner: Ivan
trust_tier: 0
---

# Хранилище документации LCOS

База знаний в стиле Confluence/Jira в формате Markdown, рассчитанная на открытие как **Obsidian vault**. Перекрёстные ссылки используют вики-ссылки Obsidian — двойные квадратные скобки вокруг basename файла. Требования следуют **SSOT**: каждая возможность/требование записывается один раз и связывается ссылками, никогда не дублируется.

Начните отсюда: **[[MOC]]** (Map of Content) — связанный индекс всего.

## Структура

| Папка | Что здесь находится |
|---|---|
| `00-overview/` | [[product]] (видение/стратегия), [[architecture]] (as-built SSOT), [[roadmap]] (фазы), [[glossary]], [[MOC]], [[speckit-workflow]] (мост vault ↔ spec-kit), [[dev-workflow]] (как работать с проектом: репо, локальный запуск, CI/CD) |
| `epics/` | `LCOS-E1..E15` — документы эпиков, каждый ссылается на свои фичи |
| `features/` | `LCOS-F1..F71` — документы фич (родительский эпик, описание, возможности, доступ по ролям, сущности, **AC разбит по Backend / Frontend / прочему**) |
| `entities/` | Документы модели данных, по одному на таблицу (SSOT схемы) |
| `roles/` | `superadmin`, `admin`, `member`, `sqladmin-operator`, `supplier-future` |
| `requirements/` | Сквозной SSOT: auth, multitenancy, config-secrets, fail-closed, vpn-egress, provider-abstraction, erp-esupl-integration, sku-identity-resolver, invoice-status-machine, secret-encryption, supplier-criteria-registry, global-requirements (R1–R9) |
| `adr/` | Architecture Decision Records `ADR-001..020` + `DEC-0011`/`DEC-0013` + [[index]] |
| `reference/` | Справочник внешних интеграций (`esupl-api/`) |
| `work/` | Живые процессные документы (согласованный ТЗ, журналы правок, открытые gate, поэтапные спецификации `work/plan/`, backlog, задачи) |
| `archive/` | Инертные исторические и вытесненные документы — никогда не читаются как актуальные, никогда не возрождаются |

## Нумерация и ID
- **Эпики** `LCOS-E#`, **фичи** `LCOS-F#` (grouped-typed, ключ проекта `LCOS`). Каждая фича объявляет свой родительский эпик во front-matter и ссылается на него.
- Фаза 1 (`E1–E8`) документирована полностью с AC. Фаза 2 (`E9–E15`) документирована в виде заглушек (активируются по требованию). Граница — **Pilot-Gate** (см. [[glossary]], [[ADR-003]]).
- Легаси-коды из старых планов (Э0–Э8 / S1–S2 / F3–F10 / P2) сохранены в `legacy_refs` каждого документа и сопоставлены в [[roadmap]].

## Соглашения
- **Язык:** русский (проза) + английские идентификаторы/код (стиль кодовой базы).
- **Front-matter:** каждый документ открывается YAML (`id`/`type`/`title`/`status`/`sources`/…).
- **Вики-ссылки по basename:** `[[sku_mapping]]`, `[[fail-closed]]`, `[[ADR-018]]`, `[[LCOS-F8-ocr-recognition]]`.
- **Порядок доверия (при конфликте):** код + `CLAUDE.md` > `adr/` (решения) > requirements/architecture > overview/product. Когда документы расходятся с кодом, побеждает код, а документ исправляется.
- **Append-only решения:** ADR никогда не переписываются; вытесняются новым ADR.

## Запись о миграции (2026-07-09)
Это хранилище заменяет предыдущую плоскую кучу нумерованных/`TZ__`/аудиторских документов. Ничего не было удалено:
- `01_ARCHITECTURE.md` + `APP_OVERVIEW.md` → слиты в [[architecture]] (оригиналы в `archive/`).
- `06_STRATEGY.md` (+ `Local_OS_About.md`) → [[product]]; `07_PHASES.md` + `plan/00` → [[roadmap]].
- `08_PHASE1_SPEC.md` + `LCOS_Conformance…` (R1–R9) → `requirements/` + AC фич.
- `04_DECISIONS.md` (+ `__DEC-0011`/`__DEC-0013`) → `adr/` (один файл на ADR + [[index]]).
- Процессные артефакты (`TZ__*`, `IMPLEMENTATION_REVIEW*`, `*_AUDIT`, `EVIDENCE__*`) → `archive/`; всё ещё живые (согласованный стабилизационный ТЗ, журнал правок Bucket-1, gate VER-021) → `work/`.
- `api/esupl/` → `reference/esupl-api/`. Поэтапные спецификации → `work/plan/`.
- План реструктуризации и лог генерации: `work/_RESTRUCTURE_PLAN.md`.
