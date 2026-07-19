---
type: plan
title: "Рефакторинг: двухфазный submit + идемпотентность + гигиена схемы БД"
feature: "[[LCOS-F43-idempotency]]"
epic: "[[LCOS-E8-purchasing]]"
status: planned
sources:
  - "specs/001-invoice-submit-idempotency/db-review-2026-07-16.md"
  - "specs/001-invoice-submit-idempotency/{spec,plan,tasks}.md"
  - "mvp.be app/services/invoice_service.py:250"
  - "mvp.be app/db/session.py:28"
  - "mvp.be app/db/models.py"
updated: 2026-07-16
---

# План рефакторинга: submit-идемпотентность + гигиена схемы

> Вытекает из ревью [[db-review-2026-07-16]]. Часть A — обязательная предпосылка
> реализации [[LCOS-F43-idempotency]] (правит spec-kit-план 001 ДО старта T008).
> Часть B — независимая гигиена схемы, отдельная поставка, можно параллельно.

**Подтверждённый факт, на котором стоит часть A**: транзакция — одна на запрос
(`get_session` в `app/db/session.py:28` коммитит после ответа; репозитории делают
только `flush()`). Значит, в текущем `submit()` (`invoice_service.py:250`)
`erp.write_invoice` вызывается ДО какого-либо commit — строка накладной и ключ
идемпотентности не видны конкурентам и не переживают крэш до конца запроса.
Отсюда обе дыры: гонка (2 ERP-вызова) и крэш-ретрай (повторный ERP-вызов).

---

## Часть A — двухфазный submit + серверная идемпотентность

**Цель**: «один submit → одна строка invoices → один ERP-вызов» верно на 100%,
включая конкурентные запросы и ретрай после крэша (SC-001/SC-002 спеки 001).

**Инвариант порядка (ядро рефакторинга)**: ключ идемпотентности коммитится в БД
**до** первого байта в сторону ERP. Никакой ERP-вызов не делается из транзакции,
которую ещё можно потерять.

### A0. Синхронизация spec-kit артефактов (до кода)

- [ ] A0.1 В `specs/001.../tasks.md` поправить T002: **две** колонки
      (`idempotency_key: Uuid | None`, `idempotency_request_hash: String(64) | None`);
      T008: двухфазный submit (см. A2); T004: конкурентный сценарий обязателен.
- [ ] A0.2 В `specs/001.../plan.md` (Technical Context → Storage) добавить хэш-колонку
      и зафиксировать инвариант порядка «commit ключа до ERP-вызова».
- [ ] A0.3 Прогнать заново Constitution Check плана (меняется форма submit —
      принципы I/II затрагиваются, вердикты ожидаемо PASS, но фиксация обязательна).

### A1. Схема и миграция

- [ ] A1.1 `app/db/models.py` (Invoice): добавить
      `idempotency_key: Mapped[uuid.UUID | None] = mapped_column(Uuid)` и
      `idempotency_request_hash: Mapped[str | None] = mapped_column(String(64))`.
- [ ] A1.2 Партиальный уникальный индекс
      `uq_invoices_org_idempotency_key (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL` — он же обслуживает look-up, отдельный
      индекс не нужен. Образец — `uq_invoices_org_external` (`models.py:295`).
- [ ] A1.3 Alembic `0014_invoice_idempotency_key`: обе колонки + индекс, явный
      `downgrade` (drop index → drop columns). Данные не бэкфиллятся (nullable).

### A2. Рефакторинг `InvoiceService.submit()` — двухфазная запись

Разбить текущий монолит `submit()` на три шага с явными границами транзакций.
Сессия остаётся request-scoped; внутри шагов используем `session.commit()` явно
(двухфазность — осознанное отступление от «commit только в get_session»,
зафиксировать комментарием на методе).

- [ ] A2.1 **Шаг 1 — резервирование (короткая транзакция).**
      До `validate_draft`/`prepare`: если ключ передан —
      посчитать `request_hash = sha256(canonical_json(draft))` (канонизация:
      `model_dump(mode="json")` → JSON с сортировкой ключей; считается ДО prepare,
      пока draft не мутирован), затем look-up по
      `(organization_id, idempotency_key)`:
      - ключ найден, хэш совпал → **replay**: вернуть сохранённую строку
        (selectinload `lines`), флаг `replayed=True`, никакой обработки;
      - ключ найден, хэш не совпал → типизированная ошибка
        `idempotency_key_conflict` (HTTP 422, единый конверт) — fail-closed;
      - ключ не найден → insert строки-резервации (status=`draft`,
        key+hash проставлены) + **commit**. `IntegrityError` на уникальном
        индексе = проиграна гонка → rollback → повторный look-up → ветка replay
        или 409 (см. A2.4).
- [ ] A2.2 **Шаг 2 — обработка (без commit-обязательств).**
      Существующий конвейер: `validate_draft` → `prepare` → commit-валидация
      ингредиентов → построение payload. Результат пишется UPDATE-ом в строку
      резервации (статусы rejected/validated/prepared — как сейчас) + **commit**.
      Терминальные статусы (rejected/validated) завершают submit здесь —
      ERP-вызова нет, replay этих исходов безопасен.
- [ ] A2.3 **Шаг 3 — ERP-вызов после commit `prepared`.**
      Только при `erp_write_enabled`: `erp.write_invoice` вызывается ПОСЛЕ того,
      как строка со статусом `prepared` и ключом закоммичена. Итог (`written` +
      `external_id` | `failed` + причина) — отдельным UPDATE + commit.
      Dry-run-ветка (лог payload) не меняется.
      Остаточное окно «ERP записал, финальный UPDATE упал» = известный
      dual-write-долг (outbox отложен, PROJECT_REVIEW_2026-07-10); с ключом
      ретрай уже НЕ создаёт дубль — replay вернёт строку `prepared`, и оператор
      видит расхождение, вместо второго счёта в Esupl.
- [ ] A2.4 **Поведение проигравшего гонку.** Если после `IntegrityError`
      перечитанная строка находится в нефинальном состоянии (резервация ещё
      обрабатывается победителем) → `409 idempotency_key_in_flight` +
      `Retry-After: 1`. Новый enum-статус НЕ вводим (без миграции enum):
      «в полёте» = строка с ключом в статусе `draft`.

### A3. Транспортный слой

- [ ] A3.1 `app/api/v1/routes/invoices.py` (`submit_invoice`, :88): принять
      необязательный заголовок `Idempotency-Key`, провалидировать как uuid
      (невалидный → 422, wire-shape guard), прокинуть в `service.submit(draft, key)`.
      Без заголовка — поведение как сегодня (FR-005, обратная совместимость).
- [ ] A3.2 На replay-ответе выставлять заголовок `Idempotency-Replayed: true`.
      Статус-код replay = 201 (тот же контракт, что у оригинала).

### A4. Тесты (пишутся до реализации, падают)

- [ ] A4.1 **Merge-gate (respx)**: два последовательных submit с одним ключом →
      1 строка `invoices`, ровно 1 `erp.write_invoice`, второй ответ == первому
      + `Idempotency-Replayed: true`.
- [ ] A4.2 **Конкурентный merge-gate**: два одновременных submit
      (`asyncio.gather`, две сессии) с одним ключом → 1 строка, ≤1 ERP-вызов,
      проигравший получает replay или 409, не 500. Ключевой тест — ловит
      главную дыру (ERP-вызов до commit).
- [ ] A4.3 Конфликт: тот же ключ + другое тело → 422 `idempotency_key_conflict`.
- [ ] A4.4 Крэш-ретрай: первый submit падает ПОСЛЕ шага 1 (мок роняет prepare) →
      повтор с тем же ключом не создаёт вторую строку; исход детерминирован.
- [ ] A4.5 Обратная совместимость: без заголовка — все существующие тесты submit
      зелёные без изменений (SC-004).
- [ ] A4.6 Replay `failed`-исхода: повтор НЕ перезапускает запись (edge case спеки).

### A5. Frontend (после A1–A4, без изменений против плана 001)

- [ ] A5.1 `invoicesApi.ts:164` — генерировать uuid, слать `Idempotency-Key`,
      ретрай переиспользует тот же ключ.
- [ ] A5.2 Удалить `shared/pos/sentRegistry.ts` + ре-экспорт; `grep sentRegistry` пуст.

**Definition of Done (A)**: A4.1–A4.6 зелёные (A4.1/A4.2 — под merge-gate);
контракт `POST /invoices` без ключа не изменён; документ сущности [[invoices]]
обновлён (обе колонки + индекс); DEFER-04 снят, статус фичи `planned → done`.

---

## Часть B — гигиена схемы (независимая поставка)

Отдельная ветка/PR, не смешивать с A. Порядок — по убыванию пользы.

### B1. `invoices.issued_at`: явный тип со временной зоной

- [ ] B1.1 `models.py:268`: `mapped_column()` → `mapped_column(DateTime(timezone=True))`.
      (Семантически лучше `Date`, но это ломает контракт `InvoiceDraft.issued_at`
      и FE — НЕ в этой поставке; зафиксировать как candidate в backlog.)
- [ ] B1.2 Миграция `0015`: `ALTER COLUMN issued_at TYPE timestamptz USING
      issued_at AT TIME ZONE 'UTC'`. Существующие значения писались как UTC-naive
      (проверить по факту на seed/бою до апгрейда) + downgrade обратно.
- [ ] B1.3 Тест: round-trip aware-datetime через API не теряет офсет
      (регресс к семейству BUG-1 parseIsoDate).

### B2. Денежные аннотации: `float` → `Decimal`

- [ ] B2.1 `models.py`: у всех `Numeric`-колонок аннотация `Mapped[Decimal | None]`
      (`total_amount`, `quantity`, `unit_price`, `line_total`, `min_order_amount`,
      `default_tax_rate`, `factor`, `confidence`, `packing`,
      `price_per_base_unit`, `price`, `parse_confidence`, `resolution_confidence`).
      Схема БД не меняется — миграция НЕ нужна.
- [ ] B2.2 Прогнать mypy/pyright + pytest; убрать ставшие лишними
      `Decimal(str(...))`-страховки ТОЛЬКО там, где тип теперь гарантирован ORM
      (границы Pydantic не трогать).

### B3. `supplier_prices`: check «хотя бы одна привязка к SKU»

- [ ] B3.1 `CheckConstraint("ingredient_id IS NOT NULL OR pos_ingredient_id IS NOT NULL",
      name="sku_ref_present")` на `SupplierPrice`.
- [ ] B3.2 Миграция `0016`: перед добавлением — проверить существующие строки
      (`SELECT count(*) WHERE both NULL`); осиротевшие (после SET NULL от удаления
      ingredient) — решение: оставить и делать констрейнт `NOT VALID` + `VALIDATE`
      после чистки, либо чистка в той же миграции. Downgrade — drop constraint.

### B4. `users.email`: регистронезависимая уникальность

- [ ] B4.1 Функциональный уникальный индекс `uq_users_email_lower (lower(email))`
      миграцией `0017`; старый `unique=True` на колонке оставить (не мешает).
- [ ] B4.2 Перед индексом — проверка дублей `lower(email)` в существующих данных.
- [ ] B4.3 Нормализовать email на входе (auth/регистрация/seed): `strip().lower()`
      при поиске и создании пользователя.

### B5. `refresh_sessions`: индекс по сроку + чистка

- [ ] B5.1 Индекс `ix_refresh_sessions_expires_at` (та же миграция `0017`).
- [ ] B5.2 Чистка протухших/`revoked` строк: периодический DELETE
      (`expires_at < now() - interval '30 days'`). Механизм — по месту
      (стартовый hook + суточный цикл достаточно для пилота); отметить в
      деплой-чеклисте продакшена.

**Definition of Done (B)**: миграции 0015–0017 с рабочим downgrade; existing-data
проверки (B3.2, B4.2) выполнены и задокументированы в PR; тайпчек и тесты зелёные.

---

## Порядок, зависимости, риски

```text
A0 → A1 → A2 → A3 → A4(gate) → A5(FE)          # одна поставка, backend авторитетен
B1..B5 — независимо от A, отдельный PR          # можно параллельно, кроме файла models.py
```

- **Конфликт по `models.py`**: A1 и B1/B2/B3 правят один файл — если ведутся
  параллельно, B ребейзится на A (A приоритетнее: блокирует пилот).
- **Нумерация миграций**: A забирает `0014`; B — `0015+` (при пересечении веток
  перенумеровать при ребейзе).
- **Риск A2 (явные commit в сервисе)**: тесты, вызывающие `submit()` внутри
  внешней транзакции, могут сломаться на вложенном commit — проверить фикстуры
  (savepoint-паттерн) до реализации; при необходимости — `session.begin_nested()`
  в тестовой фикстуре.
- **Вне scope**: outbox/реконсиляция dual-write (осознанный долг), RLS,
  унификация int/uuid PK, `issued_at → Date`.
