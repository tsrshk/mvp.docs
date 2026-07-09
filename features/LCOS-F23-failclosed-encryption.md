---
id: LCOS-F23
type: feature
title: Fail-closed шифрование секретов (ALIGN-01)
epic: "[[LCOS-E5-stabilization]]"
status: planned
phase: "Phase 1"
roles: [superadmin, sqladmin-operator, admin]
entities: ["[[integration_credentials]]", "[[system_settings]]"]
requirements: ["[[secret-encryption]]", "[[fail-closed]]", "[[config-secrets]]"]
adrs: ["[[ADR-006]]"]
legacy_refs: [plan S1-B1, 08 F1.4, backlog ALIGN-01, Conformance A1/R2]
sources: ["plan/PHASE_S1_STABILIZATION.md §S1-B1 §AC-1/2", "08_PHASE1_SPEC.md F1.4", "LCOS_Conformance_Alignment_GlobalRequirements.md A1/R2/R8.4", "mvp.be app/core/secrets.py:78", "mvp.be app/main.py:110"]
updated: 2026-07-09
---
# LCOS-F23 · Fail-closed шифрование секретов (ALIGN-01)

**Epic:** [[LCOS-E5-stabilization]] · **Status:** planned · **Phase:** Phase 1

## Описание

Слой секретов-в-покое обёрнут в Fernet-конверт (`enc:v2:<key_id>:<token>`) с версионированием KEK и ротацией — он уже *превосходит* план (`Conformance I4/R2`). Но есть одно нарушение принципа: `encrypt()` молча деградирует до plaintext, когда keyring пуст. Поскольку Phase 1 работает **локально**, это операционный путь, а не гипотетический: если `SECRETS_ENC_KEY` не задан, интеграционные секреты (AI-ключи, POS-токены) попадают в базу в открытом виде. `decrypt()` уже fail-closed (он бросает исключение, когда шифротекст присутствует, но keyring отсутствует), поэтому асимметрию нужно исправить именно на пути записи.

Эта фича делает `encrypt()` fail-closed и закрывает брешь на старте. Сегодня `app/core/secrets.py::encrypt` логирует `"SECRETS_ENC_KEY not set — secret stored WITHOUT encryption"` и возвращает значение без изменений; а `app/main.py::_ensure_strong_secrets` требует `SECRETS_ENC_KEY` только когда `app_env != "local"`. Исправление: `encrypt()` бросает `RuntimeError` при пустом keyring, стартовый guard требует непустой `SECRETS_ENC_KEY` в **любом** окружении, а `lcos.env.example` поставляется с валидным сгенерированным dev-KEK (с пометкой «заменить в prod»), чтобы свежий `docker compose up` шифровал «из коробки». Это удовлетворяет нормативное требование `R2.2` / `R8.4`.

## Возможности

- `encrypt()` отказывается хранить plaintext: пустой keyring бросает `RuntimeError` вместо возврата значения с предупреждением.
- Стартовый guard требует `SECRETS_ENC_KEY` безусловно (исключение для `APP_ENV=local` убрано); отсутствующий ключ прерывает загрузку с понятным сообщением.
- `lcos.env.example` содержит рабочий dev-KEK, чтобы локальный Phase 1 всегда шифровал из чистого checkout.
- Существующее поведение ротации/keyring (`enc:v2:<kid>`, `SECRETS_ENC_KEYS_OLD` только на расшифровку, `validate_keyring()`) сохраняется без изменений.
- Регрессионный тест доказывает, что секрет, записанный без keyring, падает, и что секрет, записанный через SQLAdmin, хранится как `enc:v2:*`.

## Доступ по ролям

| Роль | Что можно делать |
|---|---|
| [[sqladmin-operator]] | Вводит интеграционные секреты как plaintext в SQLAdmin; `on_model_change` шифрует перед сохранением. После этого изменения неверно сконфигурированный (без ключа) инстанс падает громко, а не хранит plaintext. |
| [[superadmin]] | То же через config API; также задаёт/ротирует платформенный AI-ключ. |
| [[admin]] | Может задать org POS-токен через `PUT /organizations/{id}/pos-config` (write-only); он шифруется в покое с той же гарантией. |
| [[member]] | Нет доступа к секретам. |

Сам KEK живёт только в `.env` (deploy/trust-root); ни одна роль приложения не может его прочитать.

## Задействованные сущности

- [[integration_credentials]] — зашифрованное хранилище (Fernet); каждая запись должна давать `enc:v2:*` либо падать. Это основная поверхность исправления.
- [[system_settings]] — несекретный рантайм-конфиг; в покое не затрагивается, но тот же стартовый guard защищает путь загрузки, который его читает.

## Зависимости / связи

- **Требования:** [[secret-encryption]] (`R2.2`: `encrypt()` должен бросать исключение при пустом keyring; `R2.3`/`R2.5` уже выполнены), [[fail-closed]] (`R8.4`/`R8.6`: нет фоллбэка на plaintext, загрузка отказывается при отсутствующем KEK), [[config-secrets]] (трёхуровневый конфиг; KEK — единственный секретный материал в env помимо JWT/session).
- **Фичи:** защищает учётные данные, потребляемые [[LCOS-F4-config-secrets]] и [[LCOS-F5-provider-seams]]; AI-ключ, который она охраняет, используется в [[LCOS-F8-ocr-recognition]].
- **Решения:** [[ADR-006]] (fail-closed поза для egress и секретов).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `encrypt()` (`app/core/secrets.py:78`) бросает `RuntimeError`, когда keyring пуст (`_primary()`/`_keyring()` равен `None`), вместо возврата значения с предупреждением.
- [ ] AC-BE-2. `_ensure_strong_secrets` (`app/main.py:110`) требует непустой `SECRETS_ENC_KEY` во **всех** окружениях; исключение `app_env != "local"` на `:124` убрано. Загрузка с пустым ключом прерывается с понятной ошибкой.
- [ ] AC-BE-3. `lcos.env.example` содержит валидный сгенерированный dev-KEK с комментарием «заменить в prod»; свежий `docker compose up` из примера шифрует секреты (`enc:v2:*` в БД).
- [ ] AC-BE-4. Тест: запись любого секрета без keyring бросает `RuntimeError`; секрет, введённый через SQLAdmin, хранится как шифротекст `enc:v2:*` (расширить `tests/test_secrets.py`).
- [ ] AC-BE-5. `decrypt()` без изменений и по-прежнему fail-closed (`RuntimeError`, когда шифротекст присутствует, но keyring отсутствует).
- [ ] AC-BE-6. Ротация по-прежнему работает: старый шифротекст под `SECRETS_ENC_KEYS_OLD` остаётся читаемым; `validate_keyring()` по-прежнему отклоняет невалидный KEK на старте.

### Frontend
- [ ] AC-FE-1. Изменений на фронтенде нет: ключи никогда не достигают браузера. FE продолжает отображать только маскированные `{is_set, last4}` для POS-токена; открытый секрет никогда не возвращается клиенту.

### Прочее (docs/infra)
- [ ] AC-OTHER-1. Docstring модуля в `secrets.py` (строки 14-16 / 79-80) обновлён, чтобы описывать fail-closed поведение, с удалением формулировки dev-фоллбэка «stored WITHOUT encryption».

## Открытые вопросы / гейты

- **Пересечение с обязательным покрытием:** кейсы шифрования секретов входят в merge-гейт набор VER-01 — координировать с [[LCOS-F24-merge-gate-tests]], чтобы fail-closed encrypt-тест был помечен и защищён гейтом.
- **Prod-чеклист (отложено):** реальные `SECRETS_ENC_KEY`/`JWT_SECRET`/`SESSION_SECRET` и `COOKIE_SECURE=true` — это пункты `R-Deploy`, вне scope Phase 1.

## Источники

- `plan/PHASE_S1_STABILIZATION.md §1 S1-B1`, `§5 AC-1/AC-2` (fail-closed encrypt, стартовый guard, dev-KEK).
- `08_PHASE1_SPEC.md F1.4` (REQ-1/REQ-2, AC-1/AC-2, references).
- `LCOS_Conformance_Alignment_GlobalRequirements.md` — A1 (нарушение), R2.2/R2.3/R2.5, R8.4/R8.6, Part 4 тесты секретов.
- `mvp.be/app/core/secrets.py:78-88` (`encrypt` plaintext-фоллбэк на удаление), `:100-117` (`decrypt` уже fail-closed).
- `mvp.be/app/main.py:110-126` (`_ensure_strong_secrets`, исключение `app_env != "local"` на удаление); `mvp.be/lcos.env.example`; `mvp.be/tests/test_secrets.py`.
