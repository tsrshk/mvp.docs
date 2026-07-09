---
id: OV-GLOSSARY
type: overview
title: Глоссарий терминов LCOS
status: current
phase: cross-cutting
updated: 2026-07-09
owner: Ivan
trust_tier: 3
sources:
  - APP_OVERVIEW.md §4–§11 (verified_against_code 2026-07-09)
  - 06_STRATEGY.md §1–§2 (moat, routine ladder)
  - plan/00_IMPLEMENTATION_PLAN.md §2 (Pilot-Gate), G3/G5/G6
---

# Глоссарий LCOS

> Продуктовые, доменные и архитектурные термины. Определения — русской прозой; идентификаторы/коды сохранены дословно (соглашение кодовой базы). Авторитет: код + [[architecture]] > `DEC-0011/0013` > документы. Сущности данных подробнее — в `entities/`, требования — в `requirements/`.

## Продукт и стратегия

### moat
**Ров / накапливающийся актив lock-in.** В LCOS это маппинг обучающей петли: таблица [[sku_mapping]], где с каждой подтверждённой накладной накапливаются сопоставления «строка накладной поставщика → SKU POS». Каждый раз ручной работы меньше — это главная ранняя цена переключения (уход к конкуренту = потеря накопленного маппинга). OCR — коммодити и не защищает; moat защищает. См. [[LCOS-E3-sku-identity]], §8 learning loop в [[architecture]], `ADR-019`/`ADR-020`.

### Pilot-Gate
**Критерий перехода Фаза 1 → Фаза 2** (`ADR-003`). Продукт доказан на своём (пилотном) бизнесе: владелец пилотной кофейни (Customer Zero) после **4 недель** реального использования говорит «хуже без этого», с измеримой экономией **≥3 ч/неделю**. Исторически он назывался **Wife-Gate** в vision-документах и `ADR-003` — термин заменён нейтральным **Pilot-Gate** (`Wife-Gate == Pilot-Gate`). До прохождения — ни биллинга, ни онбординга, ни SaaS. См. [[roadmap]], [[glossary]].

## SKU identity и обучающая петля

### source_key
**Ключ identity маппинга — сырой текст строки накладной**, нормализованный на backend (`normalize_source_key`, SSOT), *а не* имя SKU из каталога. FE-нормализация (`normalizeSourceKey`) зеркалит backend (проверено golden-vector parity-тестом). Полный составной ключ [[sku_mapping]] (`DEC-0012` / `ADR-019`): `(scope_type, scope_id, supplier_external_id, source_key)` — поставщик в ключе обязателен, потому что один и тот же текст от **разных поставщиков** может указывать на разные SKU POS. См. [[sku-identity-resolver]].

### draft-resolve vs commit-resolve
Два разных контекста резолвинга identity в потоке накладной:
- **draft-resolve** (`prepare()`, **толерантный**): строит payload Esupl из **локального каталога**; подсказки — fuzzy / LLM / exact-cache — живут **только здесь**; `pos_ingredient_id` не трогается. Цель — помочь человеку заполнить строки.
- **commit-resolve** (`submit()` → `_resolve_commit_identities` → Phase-2 live-валидация, **fail-closed**): durable `pos_ingredient_id` берётся **только из [[sku_mapping]]** (приоритет `subdivision → org`, только подтверждённая identity: `method=manual` OR `confirmed_by IS NOT NULL`). Cache / fuzzy / AI **не участвуют** на commit. Затем живой запрос к POS; нет точного совпадения → `None` → block + review.

Разделение — суть модели двух контекстов `DEC-0011`/`DEC-0013` вариант A. См. [[sku-identity-resolver]], [[invoice-status-machine]], [[architecture]] §6–§7.

### pos_ingredient_id
**Str-якорь identity для SKU POS** — durable-ссылка на позицию POS, хранимая в [[sku_mapping]] и на строке накладной ([[invoice_lines]]). Инвариант: `pos_ingredient_id == str(esupl_item_id)` — одна сущность Esupl в двух представлениях: **int-копия каталога** (`esupl_item_id`, для payload) и **str-якорь identity** (`pos_ingredient_id`). На commit resolve берётся только из подтверждённого маппинга, никогда из кэша/подсказок. Открытый gate durability — `VER-021` (стабилен ли id при edit/delete-recreate), owner-run, merge гейтирован.

### sku_mapping
**Таблица moat.** Хранит `(scope, supplier_external_id, source_key) → pos_ingredient_id` + `method` / `confidence` / `confirmed_by` / `packing`. Записывается отдельным клиентским вызовом `POST /ingredients/mappings` в обработчике `onSend` (persist-then-commit, **перед** отправкой — переживает reject накладной by design, `ADR-020`), **а не** как побочный эффект submit-эндпоинта. Читается на commit resolve. Целиком мигрирована из localStorage на backend. Сущность — [[sku_mapping]]; фича — [[LCOS-F14-learning-loop]].

### ingredient_cache
**Неавторитетный draft-only кэш** сопоставлений, scope-aware, **полностью пересобираемый без потери маппингов**. Участвует только в draft resolve (подсказки в `prepare`), и **не участвует на commit** (VER-022 — асимметрия scope — закрыта: на commit-пути кэша нет). Не путать с [[sku_mapping]] (moat, durable, авторитетный). Сущность — [[ingredient_cache]].

## Архитектура и инфраструктура

### ERP_WRITE_ENABLED
**Тумблер реальной записи в Esupl**, по умолчанию **False (OFF)**. При OFF `write_invoice()` не выполняет запись — накладная получает статус `prepared` и prepared-id, payload построен, но в POS ничего не уходит. Это единственная точка записи во всём приложении (`POST /teams/{id}/outgoing-invoices`); весь остальной доступ к Esupl — read-only. Воплощает human-in-the-loop и fail-closed. См. [[erp-esupl-integration]], [[invoice-status-machine]], `ADR-002`, `ADR-006`.

### fail-closed
**Принцип: при недоступной зависимости или отсутствующем секрете — явная ошибка, никогда тихий fallback/деградация** (`ADR-006`, R8). Проявления: нет POS-токена → Esupl 401; VPN down при `ai_vpn_enabled` → отказ, без тихого direct-egress к AI; уровни конфигурации 2–3 **не имеют env-fallback**; резолвинг commit identity при `None`/mismatch/недоступности POS → block + review, а не «взять `items[0]`». Единый конверт ошибок `{"error":{code,message,details?}}`. Требование — [[fail-closed]]; часть про egress — [[vpn-egress]].

### tenant / subdivision
**Тенант = organization** (`organization`). `organization_id` денормализован в каждую операционную/каталожную строку — запрос тенанта невозможен без scope (никогда из клиентского ввода, только из JWT). **Subdivision = подразделение** (точка/склад) внутри организации; операционные строки также несут `subdivision_id`. Иерархия: `organization → subdivision → membership(user↔subdivision+role)`. Привязки: `organization ↔ ровно одна команда Esupl`; `subdivision ↔ склад Esupl` (`ADR-004`, `ADR-008`). Требование — [[multitenancy]]; сущности — [[organizations]], [[subdivisions]].

### member / admin / superadmin
**Роли плоскости auth приложения** (JWT), не путать с оператором админ-панели:
- **member** — базовый пользователь приложения, доступ через `membership` к subdivision; работает с накладными/каталогом в рамках своего scope. Роль — [[member]].
- **admin** — повышенные права на уровне subdivision (управление каталогом, поставщиками, настройками своего scope). Роль — [[admin]].
- **superadmin** — глобальная роль плоскости приложения. Роль — [[superadmin]].

Отдельная **вторая плоскость** — **SQLAdmin operator** (env + bcrypt, session-куки): routes `admin_system` (superadmin config) гейтятся именно этой плоскостью SQLAdmin operator, **а не app-JWT superadmin** (`ADR-007`). Роль — [[sqladmin-operator]]. Роль `supplier` — placeholder в схеме только на будущее ([[supplier-future]], `ADR-017`).

### ProviderContext
**Контейнер сквозных инфраструктурных зависимостей** (например, scope тенанта, доступ к секретам/сессии), передаваемых в провайдеры **вне сигнатур `Protocol`**. Правило (G1, `ADR-009`): сервисы зависят только от `providers/*/base.py` (Protocol); сквозная инфраструктура идёт через `ProviderContext`, не загрязняя доменные сигнатуры интерфейса. Это позволяет держать «по одной реализации на шов» и добавлять провайдеров (OCR=`claude`, ERP=`esupl`) без утечки инфраструктуры в контракт. См. [[provider-abstraction]].

## Прочие частые термины

- **Customer Zero** — пилотная кофейня (жены основателя), на которой продукт валидируется до продаж.
- **wedge** — накладные: самая частая измеримая боль, точка входа, наполняющая данные для последующих рутин. См. [[product]] §2.
- **write-point** — LCOS как «точка записи накладной» поверх ERP; read-only ко всему остальному в Esupl.
- **draft** — `InvoiceDraft`: сырые распознанные строки + поставщик из названия, до prepare/submit.
- **prepared / validated / written / rejected / failed** — статусы накладной, см. [[invoice-status-machine]].
- **module gate** — request-time gate модуля (`modules/registry.py::require_module` → 404); routes всегда зарегистрированы.
- **enc:v2** — формат Fernet-конверта `enc:v2:<key_id>:<token>`, версионированный KEK, ротация без потери старых шифротекстов. См. [[secret-encryption]], `ADR-010`/`ADR-011`.

## Связанные документы

- [[product]] · [[roadmap]] · [[architecture]] · [[MOC]]
- Требования: [[fail-closed]] · [[multitenancy]] · [[sku-identity-resolver]] · [[invoice-status-machine]] · [[provider-abstraction]] · [[erp-esupl-integration]] · [[secret-encryption]] · [[supplier-criteria-registry]] · [[vpn-egress]] · [[config-secrets]] · [[auth]] · [[global-requirements]]

## Sources

- `APP_OVERVIEW.md` §4 (multitenancy/auth), §5 (secrets/fail-closed), §6–§7 (invoice flow, SKU identity), §8 (learning loop), §11 (data model) — verified_against_code 2026-07-09.
- `06_STRATEGY.md` §1–§2 — moat, routine ladder, identity.
- `plan/00_IMPLEMENTATION_PLAN.md` §2 (Pilot-Gate), G3/G5/G6.
