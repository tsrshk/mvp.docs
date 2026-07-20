---
id: OV-DEVWF
type: guide
title: Как работать с проектом — организация репо, документация, разработка, поставка
status: current
phase: cross-cutting
updated: 2026-07-20
owner: Ivan
trust_tier: 3
sources:
  - Ревью организации проекта 2026-07-16 (repo/docs/bugs/dev/CI-CD)
  - Изолированный e2e-стек + скриншотная регрессия 2026-07-20 (mvp.fe/TESTING.md, mvp.be docker-compose e2e-профиль)
---

# Как работать с проектом

> Краткое ревью-путеводитель: организация репозиториев, документации и баг-трекинга, локальная разработка, поставка. Для навигации по знаниям начинайте с [[MOC]]; этот документ — про *процесс и механику* работы.

## 1. Организация репозиториев

Это **не монорепо**. `d:\_work\mvp` — workspace-репозиторий, который трекает только tooling: `.claude/skills/` (spec-kit слэш-команды), `.specify/` (каркас spec-kit), `specs/` (артефакты фич), `.tools/` (Node-утилиты). Три продуктовых репозитория живут внутри как **независимые git-репо** (не submodules) и явно игнорируются корневым `.gitignore`:

| Репо | Что | Remote | Основные ветки |
|---|---|---|---|
| `mvp.be` | Backend: FastAPI, SQLAlchemy 2 async, Alembic, pgvector, uv | `tsrshk/mvp.be` | `master`, рабочие `feat/*` |
| `mvp.fe` | Frontend: React 18 + Vite 6 + TS 5.7, Tailwind 4, Redux Toolkit, PWA, FSD | `tsrshk/mvp.fe` | `master`, `develop`, `feat/*` |
| `mvp.docs` | Этот vault (Obsidian) | `tsrshk/mvp.docs` | `master` |

Следствия: клонирование workspace-репо **не** подтягивает продуктовые репо — их клонируют отдельно в те же подкаталоги; коммиты и ветки в каждом репо независимы. Вход в IDE — `mvp.code-workspace` (VS Code multi-root).

## 2. Документация и порядок доверия

Вся документация — в `mvp.docs` (Obsidian vault, `[[wikilinks]]`, YAML front-matter, принцип SSOT). Вход: `README.md` → [[MOC]]. Ядро: `00-overview/` · `epics/` (LCOS-E#) · `features/` (LCOS-F#) · `entities/` · `roles/` · `requirements/` · `adr/` (append-only) · `reference/esupl-api/`. `work/` — живой процесс, `archive/` — никогда не читается как актуальное.

**Порядок доверия при конфликте:** код + `CLAUDE.md` > `adr/` > requirements/architecture > overview/product.

С 2026-07-16 **драйвер процесса разработки — spec-kit** (см. [[speckit-workflow]]): фича проходит `/speckit-specify → clarify → plan → tasks → implement` в `specs/NNN-slug/`, а vault остаётся ядром знаний и зеркалом фич; `spec.md` ссылается на каноническую `[[LCOS-F#]]`, при расхождении побеждает документ фичи.

## 3. Баг-трекинг

Баги живут в git: `mvp.docs/work/bugs/` — «один баг — один файл», ID `LCOS-B#`, шаблон `_TEMPLATE.md`, реестр `_INDEX.md` (Dataview), соглашения в `work/bugs/README.md`. Жизненный цикл `open → in-progress → fixed → verified` (+ `wontfix`/`dup`), severity S1–S4, обязательная связь `feature: "[[LCOS-F…]]"`. Verification-гейты (например VER-021) — отдельно, реестр открытых гейтов в `adr/index.md`. Внешнего трекера нет намеренно; при росте команды — выгрузка через `speckit-taskstoissues`.

## 4. Локальная разработка

С 2026-07-16 весь запуск стека идёт через **корневые команды workspace** — кроссплатформенная Node-оркестрация в `scripts/` (никаких `.ps1`/`.sh`), одинаково на Windows 11 и macOS. Точка входа для новичка — корневой `README.md`; там же таблица репозиториев и env-файлов.

```bash
yarn bootstrap    # первичная настройка (один раз)
yarn dev          # основной режим разработки
```

| Команда | Что делает |
|---|---|
| `yarn bootstrap` | Клонирует отсутствующие `mvp.fe`/`mvp.be`/`mvp.docs`, включает `corepack` (yarn@4.12.0 из `packageManager`), ставит зависимости фронта (`yarn install` в `mvp.fe`), копирует env-примеры в локальные файлы (`mvp.be/lcos.env.example` → `lcos.env`, `mvp.fe/.env.example` → `.env`) **только если целевого файла ещё нет**. Идемпотентна. |
| `yarn dev` | Основной режим: `db`+`backend` в Docker (detached, hot-reload через bind-mount), ожидание health бэкенда, затем нативный Vite dev-сервер фронта. Фронт — http://localhost:5173, API — http://localhost:8000/api/v1. Ctrl+C гасит фронт; контейнеры остаются (остановить: `docker compose -f mvp.be/docker-compose.yml down`). |
| `yarn dev:docker` | Режим «как на сервере»: весь стек в Docker по корневому `docker-compose.yml` (`db` + `backend` + `frontend` на nginx, `up --build`). Фронт — **http://localhost:8080** (порт выбран, чтобы не конфликтовать с Vite 5173), nginx проксирует `/api` → `backend:8000`. |
| `yarn reset` | Полный сброс: `down -v` (сносит том БД) → `build` → `up -d` → ожидание health; миграции и сид применяются автоматически (entrypoint бэкенда). Спрашивает подтверждение (`-y`/`--yes` пропускает), `--full` дополнительно переустанавливает зависимости FE начисто. |

**Под капотом** (если нужно управлять частями вручную):

- Backend: `cd mvp.be && docker compose up --build` — pgvector/pg16 + backend, авто `alembic upgrade head` + seed; Swagger `/docs`, SQLAdmin `/admin`. Конфиг именно `lcos.env`, **не** `.env` (docker compose ломает `$` в bcrypt-хэшах). Нативный режим (Windows): `docker compose up -d db` → `scripts\run-native.ps1`.
- Frontend: `cd mvp.fe && yarn dev` (http://localhost:5173, ждёт backend); сборка `yarn build` (`tsc -b && vite build`); тесты `yarn test:unit` (vitest), `yarn test:e2e` (Playwright, вручную — см. ниже); линт `yarn lint` (ESLint). Env для локалки не обязателен (дефолты в `src/shared/config/env.ts`); переопределения — `VITE_*` в `.env`.

**E2E (Playwright) — изолированный стек + скриншотная сверка.** E2E гоняется против ВЫДЕЛЕННОГО одноразового бэкенда, а не dev-стека: профиль `e2e` в `mvp.be/docker-compose.yml` поднимает `backend-e2e` (:8001) + `db-e2e` (:5433, своя БД `lcos_e2e`, свой том), запускаемые под отдельным compose-проектом `lcos-e2e`, — dev-данные (:8000/:5432) не трогаются. При `APP_ENV=e2e` монтируется тест-опора `/api/v1/__test__/reset` (вайп всех таблиц + пере-seed к детерминированному baseline); два независимых барьера (`APP_ENV=e2e` **и** имя целевой БД содержит `e2e`) не дают запустить сброс против не-e2e БД. Playwright сбрасывает БД до и после прогона → **после e2e не остаётся мусора**, а данные на экране стабильны → **скриншотная регрессия** (`playwright.visual.config.ts`, проект `stable`). Команды: `yarn e2e:up` / `yarn test:e2e` (functional) / `yarn test:e2e:visual[:update]` / `yarn e2e:down`. **Операционный SSOT — `mvp.fe/TESTING.md`** (стек, барьеры, команды, генерация baseline).

Тесты и линт BE — в контейнере: `docker compose run --rm backend pytest` (реальный Postgres, HTTP через respx), `... ruff check .`; merge-гейт: `pytest -m merge_gate`. Миграции: `docker compose run --rm backend alembic revision --autogenerate -m "..."` / `alembic upgrade head`. AI-ключи и тумблеры (`erp_write_enabled`, `ai_provider`, module-гейты) живут **в БД** (`system_settings`), не в env.

**`.tools/`** — ручные smoke/E2E-верификаторы (`verify-*.mjs`) и read-only пробы Esupl (`probe-*.mjs`). Требуют Chrome с `--remote-debugging-port=9222`, пробы — токен Esupl в `mvp.fe/.env`. В CI не подключены.

## 5. Поставка (CI/CD)

GitHub Actions есть в `mvp.be` и `mvp.fe` (по 3 workflow), но **все триггеры — только ручной `workflow_dispatch`**; на push/PR не запускается ничего, pre-commit/husky-хуков нет.

- `ci.yml` (BE): uv sync → ruff check → pytest на service-контейнере pgvector. `ci.yml` (FE): yarn install → build → vitest. E2E нигде не гоняются.
- `deploy-staging.yml` / `deploy-prod.yml`: docker build → push в DigitalOcean Container Registry → SSH на дроплет → `docker compose pull/up` (prod-compose `mvp.be/deploy/docker-compose.prod.yml`, единый для staging/prod, различие в `IMAGE_TAG` и `lcos.env` из GitHub Secrets) → health-check. Prod дополнительно защищён вводом `DEPLOY`. Миграции применяются автоматически в `entrypoint.sh`. TLS выносится на Caddy/Cloudflare перед nginx.

Релизов как таковых нет: ни git-тегов, ни CHANGELOG; «релиз» = ручной запуск deploy-workflow, образы тегируются `github.sha` + `staging`/`prod`.

## 6. Оценка и известные риски

**Сильное:** весь стек поднимается корневыми командами `yarn bootstrap` / `yarn dev` (кроссплатформенная Node-оркестрация, есть корневой README с картой репо); BE — одной командой с миграциями и сидом; env-примеры с рабочими dev-дефолтами закоммичены; фронт — единый пакет-менеджер Yarn 4.12.0 и ESLint; vault зрелый (append-only ADR, SSOT, ~0 битых ссылок); deploy-пайплайн реальный и с prod-гардом; баг-процесс и spec-kit-мост задокументированы.

**Устранено 2026-07-16** (план: [[OPTIMIZATION_PLAN_2026-07-16]]):

- ~~Нет автоматического CI на push/PR~~ — автозапуск на `push`/`pull_request` подготовлен и закоммичен в `ci.yml` обоих репо, включается расскомментированием блока `on:` (пока намеренно выключен).
- ~~Двойные lock-файлы во фронте~~ — остался только `yarn.lock`, `package-lock.json` удалён; всё на Yarn 4.12.0.
- ~~Нет ESLint/скрипта `lint` во фронте~~ — добавлен ESLint и `yarn lint`.
- ~~Нет единого «up» всего стека / нет корневого README~~ — корневой `README.md` + `yarn bootstrap`/`yarn dev`/`yarn dev:docker`/`yarn reset`.
- ~~Хардкод путей `D:/_work/mvp/...` в `.tools/`~~ — пути параметризованы (относительно расположения скриптов).

**Открытые риски / долги (по состоянию на 2026-07-16):**

1. **macOS не проверен** — корневая оркестрация писалась кроссплатформенно (Node ESM, без `.ps1`/`.sh`), но фактически прогонялась только на Windows 11; проверить при первом запуске на Mac. Нативный (не-Docker) запуск BE по-прежнему только Windows (`scripts\run-native.ps1`) — но это не основной путь, `yarn dev` держит BE в Docker.
2. **`work/` не досведён после реструктуризации**: конфликт SSOT `work/plan/00_IMPLEMENTATION_PLAN.md` ↔ [[roadmap]], раздвоенный backlog (`05_BACKLOG.md` + append), VER-021 описан в трёх местах, md-ревью в корне workspace вне vault. Диагностика и порядок устранения — `work/SPECKIT-AUDIT-2026-07-15.md`.
3. **Версионирование не начато** (0.1.0 везде, тегов нет) — приемлемо до пилота, но зафиксировать момент введения.

## Sources

- Ревью 2026-07-16: обход mvp.fe/mvp.be/mvp.docs/.tools/.specify, workflow-файлов `.github/workflows/*` обоих репо, `docker-compose*.yml`, `entrypoint.sh`, `work/bugs/`, `SPECKIT-AUDIT-2026-07-15.md`.
