---
id: LCOS-F24
type: feature
title: Блокирующие merge неотменяемые тесты (VER-01)
epic: "[[LCOS-E5-stabilization]]"
status: partial
phase: "Phase 1"
roles: [superadmin, admin, member]
entities: ["[[integration_credentials]]", "[[sku_mapping]]", "[[invoices]]"]
requirements: ["[[fail-closed]]", "[[global-requirements]]", "[[multitenancy]]", "[[auth]]", "[[secret-encryption]]"]
adrs: ["[[ADR-006]]"]
legacy_refs: [plan S1-B7 S1-B8, 08 F1.5, backlog VER-01 VER-02, Conformance V-a/V-b]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B7 §S1-B8", "08_PHASE1_SPEC.md F1.5", "LCOS_Conformance_Alignment_GlobalRequirements.md V-a/V-b Part 4", "APP_OVERVIEW.md §12", "mvp.be pyproject.toml:65", "TZ__STABILIZATION_2026-07-09__ALIGNED.md S8"]
updated: 2026-07-09
---
# LCOS-F24 · Блокирующие merge неотменяемые тесты (VER-01)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** partial · **Phase:** Phase 1

## Описание

Неотменяемые инварианты платформы — fail-closed VPN-egress, корректный выбор egress-клиента, гейт `ERP_WRITE_ENABLED`, изоляция тенантов, обнаружение повторного использования refresh и шифрование секретов — бесполезны как гарантии, если при их поломке тест не падает. Эта фича делает эти инварианты блокирующими merge: каждый покрыт тестом на реальном Postgres+pgvector (egress замокан через `respx`), и тесты сгруппированы под единым маркером, чтобы сломанный инвариант не мог смёржиться.

Существуют два трека маркеров. Трек SKU/commit (`merge_gate`, 17 тестов: устойчивый id + commit-гейт DEC-0013) **построен и зелёный** и был расширен во время стабилизации (S8) ранее отсутствовавшими DB/HTTP/component-тестами (criteria API 422 + JSONB round-trip, None-ветви `get_esupl_access`, `sync_catalog_from_erp`, устойчивость per-org bootstrap, `CriteriaFields`). Платформенный трек (VER-01 / `non_negotiable`) **частичный**: базовые файлы тестов существуют (`test_egress.py`, `test_provider_egress.py`, `test_vpn_toggle.py`, `test_tenant_isolation.py`, `test_tenant.py`, `test_auth.py`, `test_secrets.py`, `test_secret_isolation.py`), но объединяющий pytest-маркер `non_negotiable` из plan S1-B7/08 F1.5 **ещё не зарегистрирован** в `pyproject.toml` (только `merge_gate`), поэтому нет единой точки входа `pytest -m non_negotiable` и нет пер-сценарного merge-маппинга. Завершение этой фичи = подтвердить покрытие, добавить недостающие кейсы, зарегистрировать маркер и доказать, что каждый сценарий падает при преднамеренной поломке (spot-check VPN + ERP-гейт).

## Возможности

- Одна команда на трек гейта: `pytest -m merge_gate` (SKU/commit, готово) и `pytest -m non_negotiable` (платформа, добавить).
- Fail-closed VPN-тест: `ai_vpn_enabled=True` + мёртвый туннель → `VpnUnavailableError` (503 `vpn_unavailable`), с утверждением, что **ни один** запрос не прошёл через прямой клиент.
- Тест выбора egress-клиента: `via_vpn=True` → vpn_client; `False` → direct; отсутствующий vpn_client при `via_vpn=True` → ошибка, а не фоллбэк.
- Тест ERP write-гейта: OFF → синтетический `esupl-prepared-<number>`, ноль HTTP-вызовов (respx); ON → реальный POST с org Bearer-токеном.
- Тест изоляции тенантов: репозиторий нельзя инстанцировать без `organization_id`; данные org A невидимы в scope org B (suppliers/invoices/ingredients).
- Тест обнаружения повторного использования refresh: воспроизведение ротированного refresh отзывает весь `family_id` и возвращает 401.
- Тесты секретов: plaintext на входе → `enc:v2:*` в БД; ротация видна при следующем вызове (без кэша); нет AI-ключа → `AiUnavailableError` без чтения env.
- Тест паролей (VER-02): `users.password_hash` — argon2 (`app/auth/password.py`); bcrypt только у SQLAdmin-оператора (`core/security.py`); два пути не пересекаются.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[superadmin]] | Бенефициар: гейт защищает межтенантную изоляцию и обработку секретов, которые затрагивает superadmin config. |
| [[admin]] | Бенефициар: изоляция тенантов и write-гейт защищают их данные и ERP-записи. |
| [[member]] | Бенефициар: fail-closed egress защищает их OCR/AI-вызовы от молчаливой утечки. |
| [[sqladmin-operator]] | Не рантайм-актор; тесты разделения encryption/auth-плоскости покрывают operator-плоскость. |

Это QA/CI-фича; поверхности для конечного пользователя нет.

## Задействованные сущности

- [[integration_credentials]] — предмет тестов шифрования секретов и no-cache-ротации.
- [[sku_mapping]] — предмет трека `merge_gate`: устойчивый id / commit-гейт DEC-0013.
- [[invoices]] — предмет теста гейта `ERP_WRITE_ENABLED` (синтетический id при OFF, реальный POST при ON).

## Зависимости / связи

- **Требования:** [[fail-closed]] (каталог `R8` — чеклист, который эти тесты обеспечивают), [[global-requirements]] (соответствие R1–R9, Part 4 сценарии приёмки), [[multitenancy]] (изоляция `R5.3`/`R5.4`), [[auth]] (`R3.3` обнаружение повторного refresh, `R3.8` argon2), [[secret-encryption]] (`R2`).
- **Фичи:** fail-closed encrypt-кейс со-владеется с [[LCOS-F23-failclosed-encryption]]; трек SKU/commit — это гейт для [[LCOS-F22-sku-stabilization]]; VPN/egress-кейсы охраняют [[LCOS-F5-provider-seams]] и [[LCOS-F8-ocr-recognition]]; write-гейт охраняет [[LCOS-F10-invoice-status-machine]].
- **Решения:** [[ADR-006]] (fail-closed egress).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. Fail-closed VPN: `ai_vpn_enabled=True` + мёртвый туннель → `VpnUnavailableError` (503); утвердить, что запроса через прямой клиент не было.
- [ ] AC-BE-2. Выбор egress-клиента: `via_vpn=True` → vpn_client, `False` → direct; отсутствующий vpn_client при `via_vpn=True` → ошибка (не фоллбэк).
- [ ] AC-BE-3. `ERP_WRITE_ENABLED` OFF → синтетический `esupl-prepared-<number>`, ноль HTTP-вызовов (respx); ON → реальный POST с org Bearer-токеном (тот же путь кода).
- [ ] AC-BE-4. Изоляция тенантов: тенант-репозиторий нельзя сконструировать без `organization_id`; данные org A не видны в scope org B.
- [ ] AC-BE-5. Обнаружение повторного refresh: воспроизведение ротированного refresh отзывает весь `family_id` + 401.
- [ ] AC-BE-6. Секреты: plaintext → `enc:v2:*`; ротация эффективна при следующем вызове (без кэша); нет AI-ключа → `AiUnavailableError` без чтения env.
- [ ] AC-BE-7. Пароли (VER-02): пользователи приложения используют argon2 (`app/auth/password.py`); bcrypt только для SQLAdmin-оператора (`core/security.py`); пути не пересекаются.
- [ ] AC-BE-8. Pytest-маркер `non_negotiable` зарегистрирован в `pyproject.toml`; `pytest -m non_negotiable` запускается зелёным, и каждый сценарий выше ссылается на тест, который его закрывает.
- [ ] AC-BE-9. Spot-check: преднамеренная поломка VPN-инварианта и ERP write-гейта заставляет соответствующий тест упасть (доказывает, что гейт «кусается»).
- [x] AC-BE-10. `pytest -m merge_gate` (17: устойчивый id + commit-гейт DEC-0013) зелёный на реальном Postgres+pgvector; пробелы S8 (criteria API 422 + JSONB, None-ветви `get_esupl_access`, синхронизация каталога, устойчивость bootstrap, `CriteriaFields`) добавлены.

### Frontend
- [x] AC-FE-1. FE-набор тестов (`vitest`) зелёный (43 passed), включая golden-vector тест паритета нормализации `source_key`, который охраняет инвариант автозаполнения рва.
- [ ] AC-FE-2. Компонентные тесты существуют для рендера/emit `CriteriaFields` и HTTP-клиента criteria-схемы (добавления S8 остаются зелёными).

### Прочее (infra/CI)
- [ ] AC-OTHER-1. Тесты работают на реальном Postgres+pgvector (не SQLite), egress через `respx`; требуется живое DB-окружение (`DATABASE_URL`) (`S0`).
- [ ] AC-OTHER-2. CI-пайплайн, запускающий `pytest -m non_negotiable` как merge-гейт, зафиксирован в prod-чеклисте (`R-Deploy`); сам CI — это DEFER-02 для Phase 1 (сейчас вручную).

## Открытые вопросы / гейты

- **Маркер `non_negotiable` ещё не зарегистрирован** — только `merge_gate` существует в `pyproject.toml:65-67`; это основной оставшийся пробел, который держит фичу в статусе `partial`.
- **Принуждение через CI отложено** — CLAUDE.md хочет CI-обеспеченных неотменяемых инвариантов; Phase 1 запускает их вручную (DEFER-02).
- **VER-021 — отдельно** — гейт устойчивости ([[LCOS-F28-esupl-contracts]], [[VER-021_ESUPL_DURABILITY_TEST]]) выполняется владельцем и ортогонален этому набору тестов; merge остаётся под гейтом по нему независимо.

## Источники

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B7` (шесть неотменяемых сценариев), `S1-B8` (argon2 vs bcrypt), `§5 AC-3`.
- `08_PHASE1_SPEC.md F1.5` (REQ-1 подтвердить/расширить, REQ-2 маркер `non_negotiable` + `pyproject.toml`).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` — V-a (блокирующие merge тесты), V-b (пароли), Part 4 сценарии тестов.
- `APP_OVERVIEW.md §12` (реальный Postgres+pgvector, respx, `merge_gate` = 17, 209/43 зелёные).
- `TZ__STABILIZATION_2026-07-09__ALIGNED.md S8` (merge_gate = 17, а не 5; S8 добавил DB/HTTP/component-тесты).
- `mvp.be/pyproject.toml:65-67` (зарегистрирован только `merge_gate`); `mvp.be/tests/` (существующие egress/tenant/auth/secret наборы).
