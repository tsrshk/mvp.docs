---
doc: 05_BACKLOG
title: LCOS — Бэклог (выравнивание, решения, проверки, отложенное)
version: 1.0.0
status: current
updated: 2026-07-02
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [alignment-tasks, open-decisions, verifications, deferred-items]
---

# Бэклог

Открытые задачи текущей стадии. Источник — Часть 2 анализа соответствия. Классы: **ALIGN** (нарушение заявленного принципа, надо чинить), **DEC** (незакрытое решение, нужен выбор), **VER** (проверка ради цели «мочь тестировать»), **DEFER** (осознанно отложено).

Статусы тикета: `open | decided | in-progress | done`. Приоритет: `P0` (блокер стадии) · `P1` (важно) · `P2` (позже).

---

## ALIGN — нарушают заявленный принцип

- **[ALIGN-01] `encrypt()` пишет plaintext при пустом keyring** — `status: open` · `prio: P0`
  - Проблема: «dev fallback» противоречит fail-closed (ADR-006). Phase 1 крутится локально → это операционный путь. При незаданном `SECRETS_ENC_KEY` секреты лягут открытым текстом.
  - Действие: `encrypt()` без keyring → `RuntimeError`; startup-guard требует `SECRETS_ENC_KEY` всегда (снять исключение `APP_ENV=local`) **или** гарантировать валидный dev-KEK в `lcos.env.example`. Проверить `lcos.env.example`.
  - Готово, когда: запись секрета без keyring падает; локальный Phase 1 всегда шифрует.
  - Связи: ADR-006, ADR-010, REQ R2.2.

- **[ALIGN-02] Мёртвый код на фронте** — `status: open` · `prio: P1`
  - Удалить: `shared/llm` (кроме живых `stripCodeFence/clamp01/parseJsonSafe` → перенести в `shared/lib`), `shared/ocr/prompt.ts`+`parse.ts`, `shared/match/prompt.ts`+`parse.ts`, legacy browser-direct Esupl (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_*`), устаревшие комментарии «mock/Gemini/Claude».
  - Не трогать: `shared/ocr/rules.ts` (живые хелперы).
  - Готово, когда: grep не находит браузер-директ LLM/ERP; сборка зелёная.
  - Связи: ADR-012, REQ R9.

- **[ALIGN-03] Устаревшие docstrings** — `status: open` · `prio: P2`
  - `ErpProvider.write_invoice` говорит «None → env token», код fail-closed. Переписать; проверить прочие docstrings на «env fallback».
  - Связи: ADR-006.

## DEC — незакрытые решения (нужен выбор)

- **[DEC-01] Gemini как второй OCR/AI-вендор** — `status: open` · `prio: P1`
  - Факт: `gemini` зарегистрирован; LLM-транспорт не за Protocol; двойная роль `resolve_ai_provider`. Нарушает ADR-009.
  - Варианты: (A) claude-only — удалить gemini + ветку + enum-значения, снять двойную роль. (B) два вендора — вынести LLM за Protocol+registry, тесты на оба, инвариант «OCR name ≡ ai_provider enum».
  - **Рекомендация: (A) claude-only.**
  - Связи: ADR-009, REQ R7.3.

- **[DEC-02] `invoice_lines.sku_embedding Vector(1536)`** — `status: open` · `prio: P2`
  - Факт: колонка не читается/пишется, нет ANN-индекса, нет провайдера эмбеддингов.
  - Варианты: (A) удалить колонку; (B) достроить семантический матчинг.
  - **Рекомендация: (A) удалить** (расширение pgvector оставить).

- **[DEC-03] `CredentialScope.subdivision`** — `status: open` · `prio: P2`
  - Факт: объявлен, не используется, нет рантайм-вызова.
  - **Рекомендация: удалить** (по «none planned»); если предвидится per-subdivision POS-токен — оставить с явным комментарием-задел.

- **[DEC-04] CSRF полусобран** — `status: open` · `prio: P1`
  - Факт: сервер умеет double-submit, но `csrf_enabled=False`, фронт токен не шлёт. Включение в проде молча ломает мутации.
  - **Рекомендация: явно отложить** + внести в прод-чеклист (включение требует правки `backendRequest.ts`).
  - Связи: REQ R-Deploy.

- **[DEC-05] FE строит candidate-set, бэк игнорирует** — `status: open` · `prio: P2`
  - Варианты: (A) бэк принимает пред-фильтр; (B) FE перестаёт строить для backend-пути (оставить для mock).
  - **Рекомендация: (B).**

- **[DEC-06] `esupl.list_suppliers`/`list_ingredients` без токена** — `status: open` · `prio: P2`
  - Факт: зовут `_auth_headers()` без токена; docstrings — вне критического пути.
  - **Рекомендация: удалить или закрыть guard'ом** как недостижимые в Phase 1.

- **[DEC-07] Multi-page OCR теряет страницы** — `status: open` · `prio: P1`
  - Факт: FE `MAX_INVOICE_PAGES=3`, но шлётся `pages[0]`; бэк одностраничный → стр. 2–3 теряются молча.
  - Варианты: (A) multi-page на бэке; (B) `MAX_INVOICE_PAGES=1` сейчас, убрать тихую потерю.
  - **Рекомендация: (B) сейчас, (A) как фича.**

- **[DEC-08] POS-токен: кто ставит** — `status: open` · `prio: P2`
  - Факт: помимо SQLAdmin, org-admin ставит токен через `PUT /organizations/{id}/pos-config`.
  - **Рекомендация: оставить** (tenant-scoped, корректно для Phase 2). Подтвердить приемлемость для Phase 1.

## VER — проверки (нужны для цели «мочь тестировать»)

- **[VER-01] Merge-блокирующие тесты на non-negotiable** — `status: open` · `prio: P0`
  - Подтвердить/написать: fail-closed VPN, выбор egress-клиента, gating `ERP_WRITE_ENABLED`, tenant-isolation, refresh reuse-detection. Реальный Postgres+pgvector (testcontainers), egress через `respx`.
  - Готово, когда: тесты существуют и зелёные; закрывают перечисленное.
  - Связи: REQ R8, R3, R5; цель стабилизации.

- **[VER-02] argon2 vs bcrypt** — `status: open` · `prio: P1`
  - Подтвердить: `users.password_hash` реально argon2; bcrypt только для SQLAdmin-оператора; пути не перепутаны.
  - Связи: ADR-007, REQ R3.8.

- **[VER-03] Двойная роль `resolve_ai_provider`** — `status: open` · `prio: P1`
  - Подтвердить: нельзя зарегистрировать OCR-имя вне enum `ai_provider`. Частично снимается при DEC-01=(A).
  - Связи: DEC-01, REQ R7.3.

## DEFER — осознанно отложено на текущей стадии

- **[DEFER-01]** Rate-limiting на `/auth/login` (single-tenant local; → прод-чеклист).
- **[DEFER-02]** CI-пайплайн (non-negotiables как merge-gate).
- **[DEFER-03]** Прод-хардненинг: `Dockerfile.prod`, Hetzner, `COOKIE_SECURE=true`, `CSRF_ENABLED=true`, реальный `SECRETS_ENC_KEY`.
- **[DEFER-04]** Бэкенд-idempotency ключ (заменит per-browser `sentRegistry`).
- **[DEFER-05]** `localos.lastWarehouseId` без org-scope (низкий риск).
- **[DEFER-06]** FSD-линтер (steiger/dependency-cruiser); сейчас — ревью-конвенция.

---

## Журнал изменений
- 2026-07-02 v1.0.0 — создан из Части 2 анализа соответствия; заведены ALIGN/DEC/VER/DEFER.
