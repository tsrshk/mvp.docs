---
doc: plan/PHASE_S1_STABILIZATION
title: Фаза S1 — Стабилизация и выравнивание (бэклог ALIGN/DEC/VER + перенос доков)
version: 1.0.1
status: current
updated: 2026-07-03
verified_against_code: n/a
owner: Ivan
supersedes: []
superseded_by: none
trust_tier: 2
ssot_for: [phase-s1-requirements]
---

# Фаза S1 — Стабилизация и выравнивание

> Технические требования на закрытие бэклога `05_BACKLOG.md` (ALIGN/DEC/VER) и достройку
> тестовой базы. Обязательна ПЕРЕД любыми новыми фичами: чинит нарушения заявленных
> принципов и даёт merge-блокирующие тесты, на которые обопрутся все последующие фазы.
> Сквозные требования — `plan/00_IMPLEMENTATION_PLAN.md` §4 (G1–G11).

**Цель:** код полностью соответствует нормативным требованиям R1–R9
(`LCOS_Conformance_Alignment_GlobalRequirements.md`, Часть 3); незакрытые решения DEC-*
закрыты и оформлены ADR; non-negotiables покрыты тестами.

**Зависимости:** нет. **Оценка:** 1–2 недели.

---

## 1. Объём — backend

### S1-B1. ALIGN-01: `encrypt()` fail-closed (P0)
- `core/secrets.py::encrypt()` при пустом keyring → `RuntimeError` (сейчас пишет plaintext).
- Startup-guard (`main.py::_ensure_strong_secrets`): `SECRETS_ENC_KEY` обязателен **всегда**
  (снять исключение для `APP_ENV=local`).
- `lcos.env.example` содержит валидный dev-KEK (сгенерированный Fernet-ключ), чтобы локальный
  запуск «из коробки» шифровал.
- Тест: запись секрета без keyring падает; секрет в БД всегда `enc:v2:*`.

### S1-B2. DEC-01 = (A) claude-only
Принято решение (A) из бэклога — оформить ADR:
- Удалить OCR-провайдер `gemini` (`providers/ocr/gemini.py`, регистрацию), ветку
  `gemini_complete` из `providers/ai.py`, значение `gemini` из `CredentialProvider`
  и из choices `ai_provider`/`gemini_model` в `REGISTRY` (миграция enum + чистка
  `system_settings`/`integration_credentials` строк gemini).
- Снять двойную роль `resolve_ai_provider()` (остаётся один вендор; функцию упростить,
  но runtime-выбор модели `anthropic_model` сохранить).
- `GEMINI_API_BASE` удалить из `Settings`/`lcos.env.example`.
- Это закрывает и VER-03. Возврат Gemini — только по реальному триггеру (новый ADR).

### S1-B3. DEC-02 = (A): удалить `invoice_lines.sku_embedding`
- Миграция: drop колонки `sku_embedding` (Vector(1536)); расширение pgvector в БД оставить.
- Удалить `SKU_EMBEDDING_DIM` и мёртвые упоминания.

### S1-B4. DEC-03: удалить `CredentialScope.subdivision`
- Убрать значение из enum + миграция; убрать `subdivision_id` из partial-unique индекса
  `uq_credentials_active_per_scope` (пересоздать индекс) и из сигнатур
  `get_active_credential`, если после удаления параметр мёртв.
- Если владелец решит оставить как задел для Phase 2 — вместо удаления: явный комментарий
  «задел Phase 2, не используется» + пункт в PHASE_P2. По умолчанию — удалить.

### S1-B5. DEC-06: закрыть неаутентифицированный egress Esupl
- `EsuplErpProvider.list_suppliers`/`list_ingredients`: удалить (рекомендация) или guard,
  делающий их недостижимыми без токена (raise, не тихий `[]` при заданном `ESUPL_API_BASE`).
  Не должно остаться пути неаутентифицированного запроса к Esupl.
- Если удаляются — убрать из `ErpProvider` Protocol и всех вызовов.

### S1-B6. ALIGN-03: docstrings
- `ErpProvider.write_invoice`: убрать «None → fallback to global env token», описать
  fail-closed. Grep по `env fallback`/`фолбэк` в docstrings — исправить все аналогичные.

### S1-B7. VER-01: merge-блокирующие тесты non-negotiables (P0)
Подтвердить наличие / дописать (pytest, testcontainers Postgres+pgvector, respx):
1. **Fail-closed VPN**: `ai_vpn_enabled=True` + мёртвый туннель → `VpnUnavailableError`
   (503 `vpn_unavailable`), нет запроса через direct-клиент.
2. **Выбор egress-клиента**: `via_vpn=True` → vpn_client; `False` → direct; отсутствие
   vpn_client при `via_vpn=True` → ошибка, не fallback.
3. **Гейт `ERP_WRITE_ENABLED`**: OFF → синтетический `esupl-prepared-<number>`, ноль
   HTTP-вызовов (respx); ON → реальный POST с Bearer-токеном органиазции.
4. **Tenant-изоляция**: репозиторий не инстанцируется без `organization_id`; данные org A
   не видны в скоупе org B (suppliers/invoices/ingredients).
5. **Refresh reuse-detection**: повторное предъявление ротированного refresh → revoke всей
   `family_id` + 401.
6. **Секреты**: ввод plaintext → в БД `enc:v2:*`; ротация видна следующим вызовом (без кэша);
   нет AI-ключа → `AiUnavailableError` без чтения env.

### S1-B8. VER-02: argon2 vs bcrypt
- Тест/проверка: `users.password_hash` производится и проверяется argon2
  (`app/auth/password.py`); bcrypt — только SQLAdmin-оператор (`core/security.py`);
  пути не перепутаны.

## 2. Объём — frontend

### S1-F1. ALIGN-02: мёртвый код (P1)
- Удалить: `shared/llm` (живые `stripCodeFence`/`clamp01`/`parseJsonSafe` → `shared/lib`),
  `shared/ocr/prompt.ts` + `parse.ts`, `shared/match/prompt.ts` + `parse.ts`,
  browser-direct Esupl (`VITE_POS_PROVIDER=esupl`, `VITE_ESUPL_API_URL`,
  `VITE_ESUPL_READ_ONLY` из `.env.example` и pos/config), устаревшие комментарии
  «mock/Gemini/Claude».
- НЕ трогать `shared/ocr/rules.ts` (живые хелперы workbench/валидатора).

### S1-F2. DEC-05 = (B): кандидаты для matching
- FE перестаёт строить/отправлять candidate-set для backend-пути `suggest-matches`
  (`buildMatchCandidates` остаётся только для mock-провайдера).

### S1-F3. DEC-07 = (B): убрать тихую потерю страниц
- До реализации multi-page (фаза S2): `MAX_INVOICE_PAGES=1` ИЛИ явное предупреждение в UI
  «распознаётся только первая страница» при >1 файле. Тихой потери страниц быть не должно.

## 3. Объём — решения и документация

- **DEC-04 (CSRF)**: оформить ADR «отложено», внести в прод-чеклист PHASE_P2:
  включение `CSRF_ENABLED` требует правки `backendRequest.ts` (чтение cookie + заголовок
  `X-CSRF-Token`). Код не менять.
- **DEC-08 (pos-config)**: оформить ADR «оставить как есть» (org-admin может ставить
  свой POS-токен) — подтверждено для Phase 1.
- ADR-записи в `04_DECISIONS.md` на: DEC-01(A), DEC-02(A), DEC-03, DEC-04(defer),
  DEC-05(B), DEC-06, DEC-07(B→A в S2), DEC-08(keep).
- **Терминология Pilot-Gate**: новая ADR-запись (ссылкой на ADR-003, append-only):
  гейт Phase 1 → Phase 2 переименован Wife-Gate → **Pilot-Gate** («проверка на собственном
  пилотном бизнесе»); критерии не меняются. При создании `00_PRODUCT.md`/`02_REQUIREMENTS.md`/
  `03_ROADMAP.md` использовать только новый термин (как в `plan/*`).
- **Перенос доков** (карта миграции README §7): создать `02_REQUIREMENTS.md`
  (из Части 3 GlobalRequirements, с учётом решений выше), `00_PRODUCT.md` (из
  `Local_OS_About.md`), `03_ROADMAP.md` (из `Local_OS_Functional_Stages_v01.md` +
  ссылка на `plan/`); обновить реестр README; статусы `05_BACKLOG.md` → done.

## 4. Вне объёма
- Multi-page OCR на бэке (фаза S2), rate-limiting, CI, прод-хардненинг (PHASE_P2),
  бэкенд-idempotency (DEFER-04), FSD-линтер (DEFER-06).

---

## 5. Acceptance Criteria

**Fail-closed / секреты**
- [ ] AC-1. Запись любого секрета при пустом keyring → `RuntimeError`; приложение с пустым
      `SECRETS_ENC_KEY` не стартует ни в одном `APP_ENV` (тест + ручной запуск).
- [ ] AC-2. `lcos.env.example` содержит валидный dev-KEK; свежий `docker compose up` из
      example-конфига шифрует секреты (`enc:v2:*` в БД).
- [ ] AC-3. Тесты S1-B7 (1–6) существуют, зелёные, и падают при намеренной поломке
      соответствующего инварианта (spot-check минимум для VPN и ERP-гейта).

**Один вендор / чистота seams**
- [ ] AC-4. `grep -ri gemini mvp.be/app` → пусто (кроме миграций); enum'ы без `gemini`;
      OCR-registry содержит только `claude`; `pytest` зелёный.
- [ ] AC-5. Колонки `invoice_lines.sku_embedding` нет в схеме (миграция применена,
      downgrade рабочий); расширение `vector` на месте.
- [ ] AC-6. Не существует code-path неаутентифицированного HTTP-запроса к Esupl
      (тест: `list_suppliers`/`list_ingredients` удалены или падают без токена).

**Frontend**
- [ ] AC-7. `grep -r "VITE_ESUPL\|shared/llm\|ocr/prompt\|match/prompt" mvp.fe/src` → пусто;
      `npm run build` зелёный; workbench-валидация (waybill-правила из `rules.ts`) работает.
- [ ] AC-8. При прикреплении >1 страницы UI либо не позволяет (лимит 1), либо явно
      предупреждает о распознавании только первой; тихой потери нет.

**Документация**
- [ ] AC-9. `02_REQUIREMENTS.md`, `00_PRODUCT.md`, `03_ROADMAP.md` созданы с front-matter,
      внесены в реестр README; все строки `05_BACKLOG.md` ALIGN/DEC/VER — `done`
      (или явно перенесены); новые ADR в `04_DECISIONS.md`.
- [ ] AC-10. Общий DoD G10 выполнен (pytest+ruff+build зелёные, 01_ARCHITECTURE бампнут).

---

## Журнал изменений
- 2026-07-03 v1.0.1 — добавлен пункт: ADR-запись о переименовании Wife-Gate → Pilot-Gate при переносе доков.
- 2026-07-03 v1.0.0 — создан из 05_BACKLOG + Conformance Части 2/4.
