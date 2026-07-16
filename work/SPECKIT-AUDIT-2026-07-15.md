---
doc: SPECKIT-AUDIT-2026-07-15
title: Аудит документации vault (mvp.docs) — отчёт от 2026-07-15
status: current
updated: 2026-07-15
owner: Ivan
trust_tier: 2
supersedes: []
superseded_by: none
ssot_for: [doc-audit-2026-07-15]
---

# Аудит документации vault

Отчёт по сквозной проверке документации `mvp.docs` и md-файлов в корне `d:\_work\mvp`.
Аудит **диагностический**: сами документы не правились, ниже — только находки и рекомендации.
Эталон схемы front-matter снят с живых файлов (`features/LCOS-F72`, `adr/ADR-018`,
`entities/price_list_upload`, work-tier `05_BACKLOG`).

## а) Сводка

- **Проверено файлов:** 222 (четыре зоны: `work` + корень 28; `features` 83; `epics`/`entities`/`roles` 48; `requirements`/`adr`/`00-overview`/`reference` 63). Директория `archive/` в объём не входила; корневые md-файлы `d:\_work\mvp` учтены как «вне vault».
- **Замечаний всего:** 64.

| Severity | Кол-во | Характер |
|---|---|---|
| high | 0 | Критичных нарушений не найдено. |
| medium | 10 | Битые вики-ссылки, отсутствие front-matter у гейт/индекс-документов, конкурирующие SSOT, рассинхрон `status`. |
| low | 54 | В основном md-файлы вне vault (учтены в нескольких зонах), зеркало Esupl API без метаданных, завершённые процессные доки в `work/`, мелочи схемы. |

**Общий вердикт:** ядро vault (features, epics, entities, roles, requirements, adr, 00-overview)
в хорошем состоянии — 100% файлов имеют корректный front-matter, статусы согласованы, даты
свежие (2026-07-09..07-13), append-only у ADR соблюдён, из ~900+ вики-ссылок битых почти нет.
Проблемы сконцентрированы на периферии: живой рабочий слой `work/` (незавершённая
реструктуризация, рассинхрон статусов) и артефакты ревью в корне репозитория.

## б) Medium-замечания (приоритет)

> **Статус закрытия — 2026-07-16 (Phase 7a/7c, [[OPTIMIZATION_PLAN_2026-07-16]]).** Все 10 medium закрыты:
> - [x] `LCOS-F20`, `LCOS-F72` (×2), `entities/price_list_upload` — `[[ARCH-SUPPLIER-PRICELISTS]]` → `[[ARCH_SUPPLIER_PRICELISTS]]`.
> - [x] `reference/esupl-api/esupl-api-index` — добавлен front-matter (id/type/title/status/updated).
> - [x] `VER-021_ESUPL_DURABILITY_TEST` — добавлен work-tier front-matter (`status: in_progress`, `ssot_for: [VER-021]`).
> - [x] `TZ__STABILIZATION_2026-07-09__ALIGNED` — добавлен front-matter (`status: current`).
> - [x] `05_BACKLOG__append_2026-07-08` — влит в `05_BACKLOG.md` и удалён; VER-021 сведён к ссылке на канонический `[[VER-021_ESUPL_DURABILITY_TEST]]`.
> - [x] `05_BACKLOG` — `updated` → 2026-07-16, version → 1.3.0.
> - [x] `plan/00_IMPLEMENTATION_PLAN` + `plan/PHASE_*` (кроме живых `PHASE_F3_SUPPLIERS`, `ARCH_SUPPLIER_PRICELISTS`; включая `PHASE_F4_SUPPLIER_COMPARE`, не попавший в перечень выше по недосмотру) → `status: superseded`, `superseded_by: [[roadmap]]`, `ssot_for` очищен; указатель `09_PHASE1_TASKS` → `08_PHASE1_SPEC` заменён на `features/LCOS-F*`.
> - [x] `_RESTRUCTURE_PLAN` — `status` → `complete` (совпал с телом), директива «ALL docs in ENGLISH» отменена (vault — русская проза).
> - [x] 7c Jira: `work/bugs/README.md` — обещания «выгрузим в Jira» заменены на «внешний трекер не планируется; GitHub Issues через `speckit-taskstoissues`».

| Файл | Проблема | Рекомендация |
|---|---|---|
| `features/LCOS-F20-price-history.md` | Битая вики-ссылка `[[ARCH-SUPPLIER-PRICELISTS]]` (дефисы) — реальный basename `ARCH_SUPPLIER_PRICELISTS` (подчёркивания). | Заменить на `[[ARCH_SUPPLIER_PRICELISTS]]`. |
| `features/LCOS-F72-supplier-price-list-upload.md` | Та же битая ссылка `[[ARCH-SUPPLIER-PRICELISTS]]`, 2 вхождения (строки 24 и 63/AC-BE-5). | Заменить оба вхождения на `[[ARCH_SUPPLIER_PRICELISTS]]`. |
| `entities/price_list_upload.md` | Та же битая ссылка (строка 62, помечена как SSOT схемы). | Заменить на `[[ARCH_SUPPLIER_PRICELISTS]]`. Далее — определиться, кто SSOT схемы (см. п. «д»). |
| `reference/esupl-api/esupl-api-index.md` | Нет YAML front-matter — единственный индекс-раздел vault без метаданных, свежесть зеркала API не отслеживается. | Добавить front-matter (id/type/title/status/updated); проза-зеркало на английском допустима, обёртке метаданные нужны. |
| `work/VER-021_ESUPL_DURABILITY_TEST.md` | Нет front-matter; `Status: GATE TEST` записан в теле, машиночитаемых полей нет — при том что это ключевой гейт-док (блокирует merge, PRE-2). | Добавить work-tier front-matter (status: in_progress, updated, owner, ssot_for: [VER-021]). |
| `work/TZ__STABILIZATION_2026-07-09__ALIGNED.md` | Нет front-matter; метаданные (Date/Authority/Supersedes-scope) — буллетами в теле. Для живого ТЗ статус обязателен. | Добавить front-matter (status current/in_progress). |
| `work/05_BACKLOG__append_2026-07-08.md` | Нет front-matter; вдобавок append по собственной merge-инструкции и по `_RESTRUCTURE_PLAN` должен был влиться в `05_BACKLOG` — VER-021 сейчас описан в 3 местах (нарушение SSOT). | Влить содержимое в `05_BACKLOG.md`, файл удалить; VER-021 оставить в одном месте, остальное — ссылки. |
| `work/05_BACKLOG.md` | `status: current` при `updated: 2026-07-03`, но append от 2026-07-08 не влит — бэклог фактически неактуален и раздвоен. | После слияния append обновить `updated`; по disposition стать `work/backlog.md`. |
| `work/plan/00_IMPLEMENTATION_PLAN.md` | `status: current` + `ssot_for: [implementation-plan, phase-order, ...]`, но содержимое реконсилировано в `00-overview/roadmap.md` (roadmap явно зафиксировал, что границы фаз взял НЕ отсюда) — два SSOT для порядка фаз. | Сменить `status` на `superseded` (`superseded_by → roadmap`) или увести в `work/plan-archive/`. |
| `work/_RESTRUCTURE_PLAN.md` | Front-matter `status: in_progress` / `updated: 2026-07-09`, а тело — `STATUS: COMPLETE 2026-07-09`; disposition-таблица не выполнена до конца (append не влит, plan/ не переведён в plan-archive) — журнал расходится с реальностью. | Довести миграцию до конца ЛИБО зафиксировать честный статус; завершённый процессный журнал — кандидат в `archive/`. |

## в) Low-замечания (агрегировано по типам)

54 low-замечания сводятся к нескольким классам. Крупнейший (md-файлы вне vault) вынесен
отдельно в раздел «г» — в зонах он засчитан многократно, потому что каждая зона проверяла
корень `d:\_work\mvp` независимо.

- **Md-файлы вне vault (8 уникальных, повторяются в 4 зонах → основная масса low).** Отчёты ревью и дизайн-доки в корне `d:\_work\mvp` без front-matter. Подробно — раздел «г».
- **Зеркало Esupl API без метаданных — 13 файлов.** `reference/esupl-api/{handbooks, loyalty, me, members, menu, money-transaction-categories, money-transactions, roles, shift-money-transactions, shifts, units, warehouse}.md` + `raw/HOW-TO-REFRESH.md`. Для зеркала стороннего API английская проза допустима, но без front-matter не отследить свежесть слепка. Рекомендация: встроить простановку front-matter в процедуру обновления (`raw/HOW-TO-REFRESH.md`), иначе метаданные потеряются при следующем рефреше. `HOW-TO-REFRESH` — операционная инструкция, а не зеркало, ей front-matter нужен в любом случае.
- **Завершённые процессные доки, засидевшиеся в `work/`.** `TZ__FIX_DISCREPANCY_BUCKET1_2026-07-09.md` (`status: complete`, scope F1–F5 закрыт); ~9 файлов `work/plan/PHASE_*` (F5–F10, P2, S1, S2) с `status: current` + `ssot_for: [phase-*-requirements]`, хотя требования извлечены в `epics/` и `features/` — двойной SSOT. Рекомендация: сменить статус на `superseded` (`superseded_by → эпики/фичи`) или увести в `archive/`/`plan-archive/`. Исключения (живые, претензий нет): `PHASE_F3` (2026-07-13, ссылки на F72–F75) и `ARCH_SUPPLIER_PRICELISTS` (новая схема, ADR-021). `09_PHASE1_TASKS.md` — front-matter корректен, но тело указывает на `08_PHASE1_SPEC.md (SSOT)`, который перемещён в `archive/`, а AC живут в `features/LCOS-F*` — устаревший SSOT-указатель.
- **Мелочи схемы front-matter в entities (4).** `price_list_upload.md` и `price_list_line.md` — поле `sources` ссылается на сам файл (циклический источник вместо кода/ADR); `suppliers.md` — `[[ADR-021]]` в поле `requirements` вместо `adrs`; `stock_levels.md` — `sources` содержит мусор-заглушку `PHASE_S1... n/a`. Рекомендация: `sources` должны указывать на код/ADR/спеку по порядку доверия, не на себя.
- **Единичные.** `_RESTRUCTURE_PLAN.md` — ~15 нерезолвящихся `[[вики-ссылок]]`-примеров (умышленный журнал дрейфа: `[[erp-esupl]]`, `[[F9-line-catalog-matching]]`, `[[ADR-index]]` и т.п.) засоряют граф Obsidian — обернуть в backticks; плюс проза целиком английская. `adr/ADR-016.md` — форвард-ссылка на несуществующие `api/esupl/REMAINS_CONTRACT.md` + `SALES_CONTRACT.md` (пути `api/esupl/` в репозитории нет; зеркало живёт в `reference/esupl-api/`). ADR append-only — чинить не переписыванием, а в принимающей стороне (`[[LCOS-F28-esupl-contracts]]`) или новым ADR.

## г) Md-файлы в корне d:\_work\mvp (вне vault)

Восемь md-файлов лежат в корне репозитория без front-matter и вне структуры vault. Это
артефакты цикла ревью 2026-07-08..10. Делятся на «ещё живые» (в `work/`) и «отработанные»
(в `archive/`). Общий принцип: при переносе добавить front-matter, а относительные
markdown-ссылки на соседей заменить на вики-ссылки (иначе сломаются).

| Файл | Что это | Куда перенести |
|---|---|---|
| `REQUIREMENTS_STATUS.md` | Живой статус Phase-1 + чек-лист ручного тестирования, открытые риски (VER-021, fail-closed). | → `mvp.docs/work/` + front-matter (`status: current`). Внутри дублирует статусы фич — оставить ссылки, статусы живут во front-matter фич. |
| `BACKEND_DB_REVIEW.md` | Код-ревью БД 2026-07-10, есть незакрытые находки (неидемпотентный submit, ERP-запись до коммита БД). | → `mvp.docs/work/` + front-matter; открытые находки извлечь в `05_BACKLOG`; после отработки → `archive/` (по образцу `IMPLEMENTATION_REVIEW_2026-07-09.md`). |
| `FRONTEND_REVIEW.md` | FE-ревью 2026-07-10, открытые находки (мемоизация, cache-invalidation tag при смене тенанта). | → `mvp.docs/work/` + front-matter; находки в бэклог; после отработки → `archive/`. |
| `PROJECT_REVIEW_2026-07-10.md` | Итоговый синтез-отчёт с ещё активными рекомендациями (транзакционный путь, `ERP_WRITE_ENABLED`, правка `00-overview/architecture.md:146`). Ссылка `[[LCOS-F43-idempotency]]` резолвится. | → `mvp.docs/work/`; действия извлечь в `05_BACKLOG`; после отработки → `archive/`. |
| `REVIEW_PROGRESS_2026-07-10.md` | Сам помечен «SUPERSEDED 2026-07-10, kept only as an audit trail». Содержит относительные ссылки на соседей. | → `mvp.docs/archive/`; относительные ссылки заменить на вики-ссылки. |
| `FE_TEST_BUGS_2026-07-10.md` | Все 5 багов исправлены 2026-07-10, хранится «для истории». | → `mvp.docs/archive/`. |
| `IMPLEMENTATION_REVIEW.md` | Ревью DEC-0011 от 2026-07-08 («NOT MERGE-READY»); блокеры отработаны. В `archive/` уже лежат родственные `IMPLEMENTATION_REVIEW__PATCH_DEC-0011.md` и `IMPLEMENTATION_REVIEW_2026-07-09.md`. | → `mvp.docs/archive/`; при необходимости переименовать с датой, чтобы отличать от тёзок. |
| `sku-selection-architecture.md` | Дизайн SKU factory эпохи DEC-0011; решение кодифицировано в `ADR-018`/`ADR-019` и фичах, прецедент `SKU_MECHANISM.md` уже в `archive/`. | → `mvp.docs/archive/` (SSOT теперь ADR/features); предварительно сверить, нет ли незадокументированных решений. |

Примечание по языку: `_RESTRUCTURE_PLAN` содержит директиву «ALL docs in ENGLISH» (owner-update
2026-07-09), которая противоречит фактическому состоянию vault (русская проза в ADR/features/
overview) и заявленной конвенции. Стоит зафиксировать актуальное решение по языку явно —
иначе директива продолжит порождать дрейф.

## д) Предложенный порядок устранения

1. **Битые вики-ссылки (medium, 5 минут).** Заменить `[[ARCH-SUPPLIER-PRICELISTS]]` → `[[ARCH_SUPPLIER_PRICELISTS]]` в `LCOS-F20`, `LCOS-F72` (2 вхождения), `entities/price_list_upload`. Дёшево, чинит все ссылочные medium разом.
2. **Front-matter гейт/индекс-документам (medium).** `VER-021_ESUPL_DURABILITY_TEST`, `TZ__STABILIZATION...ALIGNED`, `reference/esupl-api/esupl-api-index` — добавить YAML-шапки. По esupl-api заодно встроить простановку front-matter в `raw/HOW-TO-REFRESH.md`, чтобы закрыть и 13 low одним процессом.
3. **Развязать двойные SSOT порядка фаз (medium).** Определиться: `roadmap` — SSOT, тогда `plan/00_IMPLEMENTATION_PLAN` и `PHASE_*` перевести в `superseded`/`plan-archive`. Это же снимает пачку low по `PHASE_*` и указатель в `09_PHASE1_TASKS`.
4. **Довести реструктуризацию `_RESTRUCTURE_PLAN` до конца (medium).** Влить `05_BACKLOG__append` в `05_BACKLOG` (убирает раздвоение и SSOT-нарушение по VER-021), обновить `updated`, синхронизировать статус самого плана с реальностью или отправить его в `archive/`.
5. **Разобрать корневые md-файлы (раздел «г»).** Сначала извлечь открытые находки ревью в `05_BACKLOG`, затем разнести файлы: живые → `work/`, отработанные → `archive/`, всем добавить front-matter, относительные ссылки → вики-ссылки.
6. **Мелочи схемы entities (low).** Починить `sources` (self-source, мусор-заглушки) в `price_list_upload`/`price_list_line`/`stock_levels`, перенести `[[ADR-021]]` в поле `adrs` в `suppliers`.
7. **Косметика (low).** Обернуть примеры-ссылки `_RESTRUCTURE_PLAN` в backticks; форвард-ссылку `ADR-016` починить в принимающей фиче или новым ADR (append-only — сам ADR не трогать); зафиксировать решение по языку документации.
