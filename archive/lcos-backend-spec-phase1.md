---
doc: lcos-backend-spec-phase1
title: "ТЗ: Backend LCOS — Phase 1 (локальное развёртывание)"
status: archived
archived: 2026-07-16
archived_from: mvp.be root
reason: "Историческое Phase-1 ТЗ; реализовано. SSOT требований — epics/features и roadmap"
trust_tier: 3
---

> Перенесено из корня mvp.be 2026-07-16. Историческое ТЗ Phase-1, реализовано. SSOT требований — [[roadmap]] и epics/features. Хранится для истории.

# ТЗ: Backend LCOS — Phase 1 (локальное развёртывание)

> Документ для исполнения агентом Claude Code. Прозаичные пояснения — на русском, технические идентификаторы/код/конфиг — на английском. Цель: поднять расширяемый бэкенд, запускаемый в Docker Compose и доступный в локальной WiFi-сети для тестирования мобильного приложения.

---

## 1. Контекст

LCOS — слой стратегической аналитики над ERP. Бэкенд — это **точка записи накладных** (OCR → валидация → запись в ERP и локальное хранилище одновременно), а не POS и не операционный учёт. Phase 1 обслуживает одну кофейню (Customer Zero).

Фронтенд (React + Vite + TS + RTK Query + FSD) уже работает и общается с бэкендом по обычной сети. Часть внешних сервисов доступна **только из-под VPN** — их egress идёт через VPN-sidecar, при этом фронт↔бэк и Claude API остаются на обычной сети.

---

## 2. Объём Phase 1

**Входит:**
- FastAPI-бэкенд со слоистой, расширяемой архитектурой.
- Абстракция провайдеров (OCR, ERP) через интерфейсы — seams есть, по одной реализации на провайдер.
- PostgreSQL 16 + pgvector, миграции через Alembic.
- `tenant_id` во всех прикладных таблицах, один дефолтный tenant (single-tenant first).
- Togglable-модули через env/конфиг.
- Админ-панель супер-админа: CRUD над записями + системный конфиг + статус VPN + переключатели модулей.
- VPN-sidecar (gluetun) для egress провайдеров, требующих туннеля.
- Запуск в Docker Compose, доступность в локальной WiFi-сети.

**Non-goals (намеренно вне Phase 1):**
- Аутентификация конечных пользователей — **нет**.
- Multi-tenancy в полном виде — **нет** (только `tenant_id` в схеме).
- Фоновая обработка задач (Celery/очереди) — **нет** (OCR синхронный; оставить seam).
- Облачный хостинг — **нет** (только локальный Docker).

**Правка non-goal (подтвердить у владельца):** аутентификация **админ-поверхности** включается как узкое исключение — один супер-админ через env-креды + сессия. Пользовательской авторизации по-прежнему нет.

---

## 3. Стек (зафиксирован)

| Слой | Технология |
|---|---|
| Язык | Python 3.12+ |
| Web-фреймворк | FastAPI |
| ASGI-сервер | Uvicorn (dev) |
| ORM | SQLAlchemy 2.0 (async) |
| Миграции | Alembic |
| Валидация/схемы | Pydantic v2 |
| Конфиг | pydantic-settings (env) |
| БД | PostgreSQL 16 + pgvector |
| HTTP-клиент (egress) | httpx (async) |
| Админка | SQLAdmin + кастомные admin-роуты |
| VPN egress | gluetun (sidecar) |
| Контейнеризация | Docker + Docker Compose |
| Управление зависимостями | uv (или pip-tools) |
| Тесты | pytest + pytest-asyncio, httpx AsyncClient, respx, testcontainers, pytest-cov |

---

## 4. Архитектура и структура каталогов

Слоистая (hexagonal-leaning) структура: API → services (use-cases) → providers/repositories. Провайдеры и модули — first-class, за интерфейсами.

```
backend/
  app/
    main.py                  # сборка FastAPI app, lifespan, роутеры, CORS, admin mount
    core/
      config.py              # Settings (pydantic-settings), чтение env
      logging.py             # структурное логирование
      security.py            # admin-аутентификация (session/token)
    api/
      v1/
        router.py            # агрегатор роутеров v1
        routes/
          health.py
          invoices.py        # OCR → валидация → запись (заглушки use-case)
          suppliers.py
          admin_system.py    # системный конфиг, VPN-статус, toggles
    domain/
      entities.py            # доменные модели (не привязаны к ORM)
    providers/
      base.py                # общий Protocol + registry/factory
      ocr/
        base.py              # OcrProvider (Protocol)
        claude.py            # ClaudeVisionOcrProvider (единственная реализация)
      erp/
        base.py              # ErpProvider (Protocol)
        esupl.py             # EsuplErpProvider (единственная реализация)
    services/
      invoice_service.py     # use-case: распознать → валидировать → записать
      supplier_service.py
    db/
      session.py             # async engine, session factory
      base.py                # DeclarativeBase, common mixins (tenant_id, timestamps)
      models.py              # ORM-модели
      repositories.py        # репозитории (абстракция доступа к данным)
    modules/
      registry.py            # включение/выключение модулей по env/конфигу
    admin/
      setup.py               # SQLAdmin: ModelView для записей + auth backend
  alembic/                   # миграции
  alembic.ini
  pyproject.toml
  Dockerfile
  .env.example
docker-compose.yml
README.md
```

**Принципы:**
- Слой `services` не знает о конкретных провайдерах — только об интерфейсах из `providers/*/base.py`.
- Выбор реализации провайдера — через registry/factory по значению из env (`OCR_PROVIDER=claude`, `ERP_PROVIDER=esupl`).
- Модули включаются/исключаются через `modules/registry.py`, читающий env-флаги.

---

## 5. Паттерн провайдеров (seams)

Определить интерфейсы как `typing.Protocol` (или ABC). Реализовать по одной на провайдер. Регистрация через простой реестр, разрешение — по env.

```python
# app/providers/ocr/base.py
from typing import Protocol
from app.domain.entities import InvoiceDraft

class OcrProvider(Protocol):
    name: str
    requires_vpn: bool   # объявляет, нужен ли egress через VPN
    async def extract_invoice(self, image_bytes: bytes, mime_type: str) -> InvoiceDraft: ...
```

```python
# app/providers/erp/base.py
from typing import Protocol
from app.domain.entities import InvoiceDraft, SupplierRef

class Warehouse(BaseModel):
    """Представление склада из POS-системы"""
    provider_warehouse_id: int  # ID в POS
    name: str

class ErpProvider(Protocol):
    name: str
    requires_vpn: bool
    async def list_suppliers(self) -> list[SupplierRef]: ...
    async def get_warehouses(self, team_id: int) -> list[Warehouse]: ...  # новый метод
    async def write_invoice(self, draft: InvoiceDraft) -> str: ...   # returns external id
```

```python
# app/providers/base.py
_OCR_REGISTRY: dict[str, type] = {}
_ERP_REGISTRY: dict[str, type] = {}

def register_ocr(name: str):
    def deco(cls): _OCR_REGISTRY[name] = cls; return cls
    return deco

def get_ocr_provider(name: str) -> OcrProvider:
    return _OCR_REGISTRY[name]()   # фабрика; инъекция конфига по месту
```

**HTTP-клиент с учётом VPN — два режима маршрутизации:**

1. **Статический** (`requires_vpn=True` на провайдере) — для сервисов, которые *всегда* требуют туннель. Зашивается при регистрации провайдера.
2. **Рантайм-тумблер** (для ИИ) — egress к ИИ маршрутизируется через VPN или напрямую в зависимости от **переключателя в `system_settings`**, управляемого супер-админом (см. §7). Это не статический флаг провайдера, а решение на момент запроса.

Выбор клиента — через фабрику, читающую текущее состояние тумблера:

```python
# app/providers/http.py
async def get_egress_client(*, via_vpn: bool) -> httpx.AsyncClient:
    # via_vpn вычисляется вызывающим: либо provider.requires_vpn (статика),
    # либо текущее значение настройки ai_vpn_enabled (рантайм, для ИИ)
    return app.state.vpn_client if via_vpn else app.state.direct_client
```

Оба клиента (`direct_client` и `vpn_client` через прокси gluetun) создаются один раз в lifespan и переиспользуются; выбирается нужный, без пересоздания на каждый запрос.

OCR/ИИ-провайдер вычисляет `via_vpn` так:
```python
via_vpn = await settings_repo.get_bool("ai_vpn_enabled", default=settings.AI_VPN_DEFAULT)
client = await get_egress_client(via_vpn=via_vpn)
```

Значение `ai_vpn_enabled` кэшируется в памяти и инвалидируется при изменении из админки (чтобы не дёргать БД на каждом OCR-вызове).

> **Открытый вопрос:** прочие VPN-only сервисы (помимо ИИ) пока не названы. Механизм заложен generically — для «всегда через VPN» ставится `requires_vpn=True`, для управляемого админом egress используется рантайм-тумблер.

---

## 6. Модель данных (высокоуровнево)

Общий mixin для всех прикладных таблиц:

```python
# app/db/base.py
class TenantTimestampMixin:
    tenant_id: Mapped[str]        # индексирован; default = "default"
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

Минимальные таблицы Phase 1 (детали уточняются по ходу F0–F10):
- `suppliers` — поставщики (синхронизируются из ERP/Esupl, хранятся локально).
- `invoices` — накладные: исходное изображение/ссылка, распознанные поля, статус валидации, external_id из ERP, **warehouse_id** (целевой склад для этой накладной; может быть null для дефолтного выбора).
- `invoice_lines` — позиции накладной.
- `warehouses` — кэш доступных складов из POS-системы (синхронизируется явно админом). org_id + provider + provider_warehouse_id + name.
- `user_preferences` — пользовательские настройки (last_selected_warehouse_id в разрезе user + org + subdivision). Для сохранения последнего выбранного склада при сканировании.
- `system_settings` — key-value системный конфиг (включая флаги модулей и статусные поля).
- `admin_users` — один супер-админ (либо хранить креды в env без таблицы — на выбор; см. §7).

Все — с `tenant_id`, индекс по `(tenant_id, ...)`. pgvector-колонки добавляются там, где понадобится семантический поиск (например, маппинг SKU) — в Phase 1 достаточно подготовить расширение.

Включить расширение в init-миграции:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 7. Админ-панель

**CRUD над записями:** SQLAdmin, смонтировать на `/admin`. Завести `ModelView` для `suppliers`, `invoices`, `invoice_lines`, `warehouses`, `system_settings`.

**Системный конфиг и VPN:** отдельные admin-роуты (`/api/v1/admin/...`) либо кастомные страницы:
- **тумблер «ИИ через VPN» (вкл/выкл)** — запись в `system_settings.ai_vpn_enabled`, инвалидирует кэш; ключевой контрол супер-админа;
- статус VPN (up/down, текущий egress IP — запрос наружу через VPN-клиент);
- переключатели модулей (запись в `system_settings` / env-override);
- просмотр последних OCR-прогонов (для отладки точности);
- **синхронизация складов** — эндпоинт `POST /api/v1/admin/sync-warehouses` (явная синхронизация: берёт список складов из текущего ERP-провайдера, кэширует в таблицу `warehouses`).

**Аутентификация админки** (узкое исключение non-goal):
- Один супер-админ. Креды из env: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`.
- AuthenticationBackend SQLAdmin + сессия (cookie). Минимально, без ролей и регистрации.
- Конечных пользователей это не касается — у них авторизации нет.

**Тумблер «ИИ через VPN» — поведение (VPN = требование, fail-closed):**
- Положение ON → весь egress к ИИ идёт через gluetun; OFF → напрямую.
- Дефолт при старте — из env `AI_VPN_DEFAULT` (для LCOS = `true`); супер-админ переопределяет в рантайме.
- **При тумблере ON и недоступном VPN запросы к ИИ отклоняются с понятной ошибкой (fail-closed)** — трафик НЕ уходит напрямую мимо туннеля. Это и есть соблюдение требования.
- Переключение в OFF — **осознанное операционное решение** супер-админа (например, на отладку), а не автоматический fallback. Никакого тихого обхода требования.

**VPN-креды — режим конфигурации (рекомендация):** сами параметры VPN-подключения (провайдер, ключи, сервер) настраиваются **декларативно** через env/compose и поднимаются gluetun-ом. Админка **управляет тумблером egress и показывает статус**, но **не редактирует VPN-креды в рантайме** — это чувствительная поверхность, выносим за Phase 1. (Подтвердить.)

---

## 7a. API для работы с накладными и складами

**Эндпоинты накладных** (`/api/v1/invoices`):

- `POST /invoices/recognize` — фото → распознанный черновик. Возвращает `InvoiceDraft`, включая рекомендуемый `default_warehouse_id` (последний выбранный пользователем из `user_preferences`, либо `None` для дефолта подразделения).
- `POST /invoices/prepare` — черновик (с опциональным `warehouse_id`) → POS-payload preview. Использует `warehouse_id` из черновика; если не указан, берёт дефолт подразделения.
- `POST /invoices` — черновик → валидация → запись в БД + ERP. Сохраняет `warehouse_id` в `invoices.warehouse_id`; **если в черновике был указан `warehouse_id`, сохраняет его в `user_preferences.last_warehouse_id` для этого юзера+орг+subdiv**.

**Эндпоинт списка складов** (для дропдауна на фронте):

- `GET /api/v1/warehouses` — возвращает список доступных складов (из таблицы `warehouses`, привязанной к организации). Поле: `provider_warehouse_id`, `name`. Требует синхронизацию через админ-эндпоинт `/admin/sync-warehouses` перед первым использованием.

**Структура `InvoiceDraft`:**
```python
class InvoiceDraft(BaseModel):
    supplier_external_id: str | None = None
    supplier_name: str | None = None
    supplier_tax_id: str | None = None
    number: str | None = None
    issued_at: datetime | None = None
    total_amount: Decimal | None = None
    currency: str | None = None
    warehouse_id: int | None = None  # опциональный выбор пользователя; None = дефолт подразделения
    lines: list[InvoiceLineDraft] = Field(default_factory=list)
    raw: str | None = None
```

---

## 8. VPN egress (gluetun sidecar)

Через туннель ходят: (а) провайдеры с `requires_vpn=True` — всегда; (б) **запросы к ИИ — когда тумблер `ai_vpn_enabled` в ON** (см. §5, §7). Остальной egress — напрямую.

Вариант роутинга для Phase 1 (простой и Compose-native): отдельный `httpx`-клиент бэкенда, использующий gluetun как HTTP/SOCKS-прокси (gluetun умеет поднимать встроенный прокси). Бэкенд остаётся на обычной сети для входящих, а нужные исходящие запросы направляет через прокси gluetun.

```yaml
# фрагмент docker-compose.yml
  gluetun:
    image: qmcgaw/gluetun
    cap_add: [NET_ADMIN]
    environment:
      VPN_SERVICE_PROVIDER: ${VPN_PROVIDER}
      VPN_TYPE: ${VPN_TYPE}            # wireguard | openvpn
      # ...креды провайдера VPN из .env
      HTTPPROXY: "on"                  # встроенный HTTP-прокси gluetun
      HTTPPROXY_LISTENING_ADDRESS: ":8888"
    ports:
      - "8888:8888"                    # только для локальной отладки
    restart: unless-stopped
```

Бэкенд держит два долгоживущих клиента и выбирает нужный:
```python
direct_client = httpx.AsyncClient()
vpn_client    = httpx.AsyncClient(proxy="http://gluetun:8888")
# для ИИ: выбор по текущему значению ai_vpn_enabled (см. §5)
```

**Поведение при отказе VPN (fail-closed, т.к. VPN — требование):**
- gluetun по умолчанию режет трафик при падении туннеля — защита от утечки мимо VPN.
- При `ai_vpn_enabled=ON` и недоступном VPN бэкенд **отклоняет запросы к ИИ с понятной ошибкой** и НЕ переключается автоматически на прямой egress. Никакого silent-fallback.
- Бэкенд корректно обрабатывает timeout VPN-клиента (быстрая понятная ошибка, не падение сервиса), без бесконечных ретраев через мёртвый туннель.
- Переключение `ai_vpn_enabled` в OFF — только ручное, осознанное действие супер-админа.

---

## 9. Конфигурация (.env.example)

```dotenv
# App
APP_ENV=local
APP_HOST=0.0.0.0
APP_PORT=8000

# Database
POSTGRES_USER=lcos
POSTGRES_PASSWORD=change_me
POSTGRES_DB=lcos
DATABASE_URL=postgresql+asyncpg://lcos:change_me@db:5432/lcos

# Providers
OCR_PROVIDER=claude
ERP_PROVIDER=esupl
ANTHROPIC_API_KEY=sk-ant-...
ESUPL_API_BASE=
ESUPL_API_KEY=

# Modules (togglable)
MODULE_OCR_ENABLED=true
MODULE_SUPPLIERS_ENABLED=true

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=         # bcrypt-хэш
SESSION_SECRET=change_me

# VPN (declarative)
VPN_PROVIDER=
VPN_TYPE=wireguard
# ...креды конкретного VPN-провайдера
AI_VPN_DEFAULT=true          # дефолт тумблера "ИИ через VPN" при старте; админ меняет в рантайме

# CORS / LAN
CORS_ORIGINS=http://localhost:5173,http://<host-lan-ip>:5173
```

---

## 10. Docker Compose (сервисы)

- `db` — `pgvector/pgvector:pg16`, volume для данных, healthcheck.
- `backend` — собранный из `backend/Dockerfile`, bind `0.0.0.0:8000`, зависит от `db` (healthy), монтирует код в dev.
- `gluetun` — VPN-sidecar (§8).
- `adminer` *(опц., только dev)* — для инспекции БД.

Требования:
- `backend` слушает `0.0.0.0`, порт проброшен на хост → доступен по LAN-IP.
- healthcheck `backend`: `GET /api/v1/health` → 200.
- Alembic-миграции применяются при старте (entrypoint: `alembic upgrade head` затем `uvicorn`).
- **Каталог `alembic/versions/` смонтирован volume-ом на хост** — чтобы сгенерированные внутри контейнера revision-файлы попадали в репозиторий, а не терялись при остановке контейнера (см. §12).

---

## 11. Локальная сеть и мобильное тестирование

- Бэкенд биндится на `0.0.0.0:8000`; мобильное приложение обращается к `http://<host-lan-ip>:8000`.
- В README описать получение LAN-IP хоста (`ip addr` / `ifconfig` / `ipconfig`).
- **CORS** настроить из `CORS_ORIGINS` (включая LAN-IP фронта).
- **HTTPS-нюанс:** некоторые мобильные фичи требуют secure-context. Если упрётесь — добавить опциональный self-signed/`mkcert` для локального HTTPS. В Phase 1 по умолчанию HTTP; задокументировать обходной путь.
- Проверить, что хостовый firewall не блокирует порт 8000 в LAN.

---

## 12. Эксплуатационные требования

- **Health:** `GET /api/v1/health` (app), плюс проверка соединения с БД.
- **Миграции:** Alembic — авторинг и применение, см. §12a ниже.
- **Логирование:** структурное (JSON в проде, читаемое в dev), уровень из env.
- **Ошибки:** единый exception handler → консистентный JSON-формат ошибок.
- **Versioning API:** всё под `/api/v1`.

---

## 12a. Миграции БД (Alembic) — авторинг и управление

Нужно не только **применять** миграции, но и **создавать** их по мере эволюции схемы. В связке Docker + async SQLAlchemy + pgvector есть нюансы — фиксирую их явно.

**Конфигурация под async (`alembic/env.py`):**
- env.py должен работать с async-движком: внутри `run_migrations_online()` использовать async engine и `connection.run_sync(do_run_migrations)`.
- `target_metadata` = метаданные `DeclarativeBase` из `app/db/base.py` (импортировать все модели, иначе autogenerate их не увидит).
- URL брать из того же `Settings`/`DATABASE_URL`, что и приложение (один источник правды).

**Autogenerate-процесс (основной путь):**
```bash
# создать ревизию по разнице моделей и БД
docker compose run --rm backend alembic revision --autogenerate -m "add invoices table"
# применить
docker compose run --rm backend alembic upgrade head
```
- **Обязательно: `alembic/versions/` смонтирован на хост** (§10) — иначе сгенерированный файл останется в контейнере и пропадёт.
- **Autogenerate не серебряная пуля.** Каждую сгенерированную ревизию ПРОСМАТРИВАТЬ и править руками перед коммитом: он часто пропускает server defaults, переименования (видит как drop+add), изменения enum, индексы, кастомные типы. Не коммитить ревизию вслепую.

**pgvector — порядок и типы:**
- `CREATE EXTENSION IF NOT EXISTS vector` должен выполняться в **первой** (init) миграции, ДО любых таблиц с `Vector`-колонками.
- В `env.py` и в ревизиях импортировать тип из `pgvector.sqlalchemy` (`from pgvector.sqlalchemy import Vector`), иначе autogenerate не распознает колонку и/или ревизия не применится.
- Расширение `vector` не должно «удаляться» автогенератором — проверять, что в ревизиях нет `DROP EXTENSION`.

**Команды управления:**
```bash
alembic upgrade head          # применить все
alembic downgrade -1          # откатить на одну
alembic downgrade <rev>       # откатить до конкретной
alembic history --verbose     # история ревизий
alembic current               # текущая ревизия БД
alembic heads                 # проверить, нет ли расхождения веток
```
(все — через `docker compose run --rm backend ...`)

**Дисциплина:**
- Naming convention для constraint/index задать в `metadata` (`naming_convention`) — иначе автогенерённые имена будут нестабильны между БД и миграции «поплывут».
- Каждая ревизия должна иметь рабочий `downgrade()` (для локали — обязательно, пригодится при итерациях схемы).
- Все таблицы — с `tenant_id` (mixin), это попадает в ревизии автоматически.
- Init-миграция: extension `vector` → базовые таблицы (§6).

**Автоприменение vs ручной контроль:** entrypoint при старте делает `alembic upgrade head` (удобно для локали). Авторинг (`revision`), откаты (`downgrade`) и просмотр — всегда вручную через `docker compose run`. Не привязывать создание ревизий к старту контейнера.

---

## 13. Порядок выполнения для Claude Code

1. Инициализировать проект (`pyproject.toml`, зависимости, структуру каталогов из §4).
2. `core/config.py` (Settings) + `core/logging.py`.
3. `db/session.py`, `db/base.py` (mixin с `tenant_id`), Alembic init + миграция с `CREATE EXTENSION vector` и базовыми таблицами (§6).
4. Интерфейсы провайдеров + registry (§5); реализации `claude.py` и `esupl.py` (заглушки с реальными подписями).
5. Use-case `invoice_service` (распознать → валидировать → записать; запись в ERP и локальную БД).
6. Роутеры v1: `health`, `invoices`, `suppliers`, `admin_system`.
7. `core/security.py` + admin-аутентификация; SQLAdmin (`admin/setup.py`) с ModelView и auth backend.
8. `Dockerfile`, `docker-compose.yml` (db + backend + gluetun), `.env.example`, entrypoint с миграциями.
9. CORS + bind `0.0.0.0`; README с инструкцией запуска и LAN-доступа.
10. Тесты (§16.1): инфраструктура (pytest-asyncio, тестовая БД на testcontainers, respx, фикстуры), fake-провайдеры, тесты non-negotiables и use-case, pytest-cov с порогом по ядру. Отдельно — каркас OCR-eval (§16.2).
11. Прогнать критерии приёмки (§14).

---

## 14. Критерии приёмки

- [ ] `docker compose up` поднимает db + backend + gluetun без ошибок.
- [ ] Миграции применяются автоматически; `vector`-расширение создано.
- [ ] `alembic revision --autogenerate` создаёт ревизию, и файл появляется в `alembic/versions/` на хосте (volume работает); `upgrade`/`downgrade` отрабатывают.
- [ ] `GET http://<host-lan-ip>:8000/api/v1/health` → 200 с другого устройства в той же WiFi.
- [ ] Фронт с LAN-IP проходит CORS и получает данные.
- [ ] `/admin` требует логин супер-админа; после входа доступен CRUD над `suppliers`/`invoices`.
- [ ] Смена `OCR_PROVIDER` / `ERP_PROVIDER` в env меняет реализацию без правок кода вызывающего слоя.
- [ ] Провайдер с `requires_vpn=True` маршрутизирует egress через gluetun; падение VPN → понятная ошибка, бэкенд жив.
- [ ] Тумблер `ai_vpn_enabled` из админки переключает egress ИИ между «через VPN» и «напрямую» в рантайме, без рестарта; смена видна на следующем OCR-вызове.
- [ ] При `ai_vpn_enabled=ON` и недоступном VPN запрос к ИИ **отклоняется с ошибкой** (fail-closed), трафик не уходит напрямую.
- [ ] Отключение модуля через env исключает его роуты/функциональность.
- [ ] Все прикладные таблицы содержат `tenant_id` (default `"default"`).
- [ ] `pytest` зелёный; тесты non-negotiables (fail-closed VPN, выбор egress-клиента, tenant_id, admin-auth) присутствуют и проходят.
- [ ] Покрытие ядра (`services`/`providers`/`core/security`/egress) ≥ порога; критические пути — 100%; CI падает при просадке по ядру.
- [ ] OCR-eval harness запускается отдельной командой и выдаёт field-level accuracy против ground-truth датасета.

---

## 15. Настройка Claude Code для разработки

Чтобы Claude Code строил по этой спеке консистентно (а не угадывал стек и раскладку), до первого запуска положить в корень репозитория конфиг-файлы. Claude Code читает их автоматически в начале каждой сессии.

**Раскладка конфигов:**
```
backend/
  CLAUDE.md                 # поведенческий контракт проекта (читается каждую сессию)
  CLAUDE.local.md           # личные заметки, gitignored (опц.)
  .claude/
    settings.json           # настройки проекта (permissions), в git
    settings.local.json     # личные override, gitignored
    rules/
      providers.md          # paths: app/providers/** — правила seam-провайдеров
      db.md                 # paths: app/db/**, alembic/** — async SQLAlchemy, tenant_id
      security.md           # admin-auth, секреты, VPN-egress
  .mcp.json                 # project-scoped MCP (опц., напр. Postgres для интроспекции БД)
```

**Принципы (по актуальной практике Claude Code):**
- `CLAUDE.md` — это **поведенческий контракт, а не документация**. Держать коротким и высокосигнальным (~20–80 строк для одного сервиса), только то, что Claude иначе угадает неверно. Ссылаться на эту спеку, а не дублировать её.
- Глубокие/узкие правила выносить в `.claude/rules/*.md` с `paths`-фронтматтером (glob) — тогда они подгружаются только при работе с релевантными файлами. Правило без `paths` грузится всегда.
- **Non-negotiables (tenant_id, fail-closed VPN-egress) дублировать в CI/тесты/pre-commit, а не только в прозе** — CLAUDE.md формирует «обычное» поведение, но не гарантирует его. Что блокирует merge — должно жить в пайплайне.
- `.claude/rules/` и `CLAUDE.md` коммитятся в git (общие для команды). Личное — в `CLAUDE.local.md` / `settings.local.json` (gitignored).
- Auto memory (Claude Code v2.1.59+) накапливает заметки между сессиями — проверять и чистить через `/memory`; не дублировать в CLAUDE.md то, что Claude и так выучит за сессию.

**Готовый `CLAUDE.md` для проекта — см. отдельный файл `CLAUDE.md` в поставке.** Положить в корень `backend/` ДО первого запуска Claude Code.

**Workflow-рекомендации:**
- Запускать сложные задачи в plan mode (показать план → подтвердить → исполнить), особенно сборку каркаса.
- После `/compact` корневой `CLAUDE.md` перечитывается с диска; вложенные — только при обращении к файлам в их каталоге.
- Для интроспекции БД при разработке можно подключить Postgres MCP через `.mcp.json` (опц., только dev).

---

## 16. Тестирование

**Цель — не «число покрытия», а покрытие того, что важно.** При лимите часов гонка за 100% — ловушка: тесты на тривиальный код ради цифры, хрупкие тесты на реализацию вместо поведения, ложная уверенность. Бьём по приоритетам.

### 16.1. Тесты кода (корректность)

**Приоритеты (обязательны, должны блокировать merge):**
1. **Non-negotiables:**
   - VPN fail-closed: `ai_vpn_enabled=ON` + VPN недоступен → запрос к ИИ отклонён с ошибкой, НЕ ушёл напрямую.
   - Выбор egress-клиента (VPN vs direct) по тумблеру — корректный для обоих положений.
   - `tenant_id` присутствует на всех таблицах; запросы скоупятся по tenant.
   - Админка под auth; пользовательские роуты работают без auth.
2. **Провайдерные seam-ы:** контрактные тесты против `Protocol` + fake-реализации (fake OCR / fake ERP). Fake заодно доказывает, что seam реально абстрактен.
3. **Use-case `invoice_service`:** OCR → валидация → запись в ERP + локальную БД (на fake-провайдерах).
4. **API-слой:** тесты эндпоинтов через httpx AsyncClient против тестовой БД.
5. **Миграции:** smoke-тест `upgrade head` с нуля + `downgrade`.

**Стек и приёмы:**
- pytest + pytest-asyncio.
- httpx AsyncClient для API-тестов.
- **Тестовая БД — реальный Postgres+pgvector** (SQLite не годится из-за pgvector): testcontainers-python либо отдельная test-БД в compose. Каждый тест — в транзакции с откатом (изоляция + скорость).
- **respx** (или httpx MockTransport) для мока исходящих HTTP (Claude API, Esupl) — обычные тесты НЕ ходят в реальные API.
- factory_boy / фикстуры для тестовых данных.
- pytest-cov для измерения.

**Политика покрытия (tiered, не один глобальный %):**
- Ядро (`services`, `providers`, `core/security`, egress-логика): порог ~90%+; критические пути (fail-closed, выбор клиента) — 100%.
- Из знаменателя исключать тривиальное: `config`, `__init__`, сами миграции, сгенерированное.
- CI падает при просадке ниже порога **по ядру**, а не по глобальному числу (иначе стимул тестировать тривиал ради цифры).

### 16.2. OCR-accuracy eval (отдельный harness, не unit-тест)

Самое ценное «тестирование» на текущей фазе — оно отвечает на вопрос «достаточно ли хорошо для жены».
- Источник ground truth: готовый датасет из Telegram (фото накладной + вручную введённые номер/сумма/поставщик).
- Метрика: **field-level accuracy** по ключевым полям против ground truth.
- Запуск: регрессия при каждом изменении препроцессинга (grayscale/contrast/adaptive threshold) — видеть, улучшает изменение точность или нет.
- **Держать отдельно от pytest-прогона:** медленный, ходит в реальный Claude API (под VPN), стоит денег. Запускать по требованию (`make eval` / отдельная команда), не в CI на каждый коммит.

---

## 17. Решения к подтверждению владельцем

1. **Admin auth** как узкое исключение non-goal «no authentication» — ок? (заложено: один супер-админ, env-креды + сессия).
2. **ИИ через VPN — рантайм-тумблер супер-админа** (дефолт из `AI_VPN_DEFAULT`), при этом VPN-креды задаются декларативно в env/compose и в рантайме из панели не редактируются — ок?
3. **Админка через SQLAdmin** на старте, своя React-админка позже поверх того же admin-API — ок? (быстрее при лимите часов).
4. **OCR синхронный**, без Celery; фоновая обработка — отдельный seam на будущее — ок?
