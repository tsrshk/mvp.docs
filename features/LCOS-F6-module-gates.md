---
id: LCOS-F6
type: feature
title: Гейты модулей
epic: "[[LCOS-E1-platform]]"
status: built
phase: "Phase 1"
roles: [superadmin, sqladmin-operator]
entities: ["[[system_settings]]"]
requirements: ["[[config-secrets]]", "[[fail-closed]]", "[[global-requirements]]"]
adrs: ["[[ADR-005]]"]
legacy_refs: [plan/00 G4, APP_OVERVIEW §3]
sources: ["APP_OVERVIEW.md §3", "01_ARCHITECTURE.md (App assembly, modules)", "plan/00_IMPLEMENTATION_PLAN.md G4", "mvp.be app/modules/registry.py:36", "mvp.be app/core/system_settings.py:58", "mvp.be app/api/v1/routes/suppliers.py:27", "mvp.be app/api/v1/routes/admin_system.py:68"]
updated: 2026-07-09
---
# LCOS-F6 · Гейты модулей
**Эпик:** [[LCOS-E1-platform]] · **Статус:** built · **Фаза:** Phase 1

## Описание

Легковесный runtime-механизм feature-flag, позволяющий superadmin включать/выключать целые продуктовые модули **без редеплоя**. Маршруты всегда **зарегистрированы**; модуль гейтируется во **время запроса** через FastAPI-зависимость `require_module(name)`, которая возвращает **404**, когда модуль отключён. Сам тумблер — boolean-ключ `system_settings` (`module_<name>_enabled`), разрешаемый через стандартный резолвер конфига (БД → дефолт реестра `True`), так что переключение его в SQLAdmin или через config API вступает в силу на следующем запросе.

Сегодня в реестре существуют два тумблера модулей — `module_ocr_enabled` и `module_suppliers_enabled` (оба дефолт `True`). Маршруты suppliers демонстрируют паттерн: роутер монтирует `dependencies=[Depends(require_module("suppliers"))]`, так что при выключенном тумблере каждый endpoint suppliers отвечает 404, как будто его нет. Это платформенный контракт, которому следует каждый будущий продуктовый эпик (plan G4): каждая новая F-фаза добавляет собственный `module_<name>_enabled` в `REGISTRY` и гейтирует свои маршруты, так что фичу можно чисто отключить с плоскости superadmin.

## Возможности

- `require_module(name)` — зависимость-гейт времени запроса: отключённый модуль → `HTTPException(404, "module '<name>' is disabled")`.
- `module_enabled(session, name)` — разрешает boolean `module_<name>_enabled` через резолвер конфига (БД → дефолт реестра `True`).
- Тумблеры — это `SettingSpec` из белого списка реестра (`module_ocr_enabled`, `module_suppliers_enabled`), типа `TYPE_BOOL`, дефолт `True`.
- Маршруты всегда смонтированы; только гейт решает видимость, так что включение/отключение — чистый runtime-конфиг (без деплоя кода).
- Config API `GET /admin/modules` сообщает superadmin текущее состояние модулей.
- Контракт расширяемости (G4): каждый будущий продуктовый эпик добавляет собственный тумблер модуля + гейтирует свои маршруты.

## Доступ по ролям

| Роль | Что может делать |
|---|---|
| [[superadmin]] | Переключает любой `module_<name>_enabled` через config API / SQLAdmin; читает состояние через `GET /admin/modules`. |
| [[sqladmin-operator]] | Те же тумблеры через ModelView `SystemSettingAdmin`. |
| [[admin]] / [[member]] | Не могут переключать; маршруты отключённого модуля просто возвращают им 404. |

## Задействованные сущности

- [[system_settings]] — хранит boolean `module_<name>_enabled`; в белом списке реестра, разрешается с тем же приоритетом БД → дефолт, что и все runtime-настройки.

## Зависимости / связи

- **Требования:** [[config-secrets]] (тумблеры модулей — это `system_settings` уровня 2, разрешаются БД → дефолт), [[fail-closed]] (отключено → 404, нет частичной экспозиции), [[global-requirements]] (контракт гейта модулей plan G4).
- **Фичи:** тумблеры живут в хранилище настроек [[LCOS-F4-config-secrets]], редактируются через [[LCOS-F3-sqladmin-operator]]; гейтируют OCR-модуль [[LCOS-F8-ocr-recognition]] и модуль suppliers [[LCOS-F17-supplier-cards]]; каждый будущий эпик ([[LCOS-E7-stock]], [[LCOS-E8-purchasing]], …) добавляет собственный гейт.
- **ADR:** [[ADR-005]] (трёхуровневый конфиг, которому принадлежат тумблеры).

## Критерии приёмки (AC)

### Backend
- [ ] AC-BE-1. `require_module(name)` возвращает 404 (`"module '<name>' is disabled"`), когда тумблер разрешается в False; пропускает, когда True.
- [ ] AC-BE-2. `module_enabled` разрешает `module_<name>_enabled` через резолвер конфига с дефолтом реестра `True`.
- [ ] AC-BE-3. Маршруты зарегистрированы безусловно; видимость решается только гейтом (endpoints отключённого модуля отдают 404, а не 401/403).
- [ ] AC-BE-4. `module_ocr_enabled` и `module_suppliers_enabled` существуют в реестре как `TYPE_BOOL`, дефолт `True`.
- [ ] AC-BE-5. Переключение модуля в SQLAdmin/config API меняет поведение на следующем запросе без редеплоя (резолвер читает БД по требованию).
- [ ] AC-BE-6. `GET /admin/modules` возвращает superadmin текущее состояние модулей.

## Открытые вопросы / гейты

- Сегодня гейтированы только два модуля (OCR, suppliers); сам путь submit инвойса не гейтирован модулем — подтвердить предполагаемое покрытие по мере появления новых эпиков (G4 требует, чтобы каждая новая F-фаза добавляла собственный гейт).
- Ни один FE-элемент не показывает отключённый модуль сверх 404 (отключённая фича просто недоступна для навигации) — приемлемо для единственного оператора Phase 1.

## Источники

- `APP_OVERVIEW.md §3` («Modules gated request-time via `require_module` → 404; routes always registered»).
- `01_ARCHITECTURE.md` — «App assembly» / реестр модулей.
- `plan/00_IMPLEMENTATION_PLAN.md` G4 (контракт гейта модулей для каждой фазы).
- `mvp.be/app/modules/registry.py:24` (`module_enabled`), `:36` (`require_module` → 404).
- `mvp.be/app/core/system_settings.py:58` (`MODULE_OCR_ENABLED`), `:59` (`MODULE_SUPPLIERS_ENABLED`).
- `mvp.be/app/api/v1/routes/suppliers.py:27` (`dependencies=[Depends(require_module("suppliers"))]`).
- `mvp.be/app/api/v1/routes/admin_system.py:68` (`list_modules`).
