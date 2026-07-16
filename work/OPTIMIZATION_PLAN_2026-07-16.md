---
id: WK-OPT-2026-07-16
type: plan
title: План оптимизации DX — репо, CI, кроссплатформенный запуск, уборка документации
status: current
updated: 2026-07-16
owner: Ivan
trust_tier: 3
sources:
  - "[[dev-workflow]] — ревью организации проекта 2026-07-16"
  - "[[SPECKIT-AUDIT-2026-07-15]] — аудит vault"
---

# План оптимизации DX (2026-07-16)

> Утверждённый Ivan план по итогам ревью [[dev-workflow]]. **Этот документ — задание на имплементацию**: исполнитель проходит фазы по порядку, каждая фаза — отдельный коммит (или несколько) в указанном репо. Автодеплой НЕ делаем. Jira нет и не будет — все упоминания внешнего трекера вычищаются.

## Контекст для исполнителя

- `d:\_work\mvp` — workspace-git (трекает `.tools/`, `.claude/`, `.specify/`, `specs/` и корневые файлы). `mvp.fe`, `mvp.be`, `mvp.docs` — **три независимых git-репо** внутри workspace (не submodules). Коммиты делаются в каждом репо отдельно.
- Целевые платформы разработки: **Windows 11 и macOS** — всё новое должно работать на обеих. Общий знаменатель: Node 20+ (обязателен для FE), Docker Desktop, git. **Никаких новых .ps1/.sh-скриптов** — вся оркестрация на Node (`.mjs`) и docker compose.
- Порядок доверия и соглашения vault — `mvp.docs/README.md`. Существующее поведение приложений не менять — план только про DX/инфраструктуру/документацию.

---

## Фаза 1 — Гигиена фронтенда: только Yarn (репо: mvp.fe)

Сейчас в репо лежат и `yarn.lock`, и `package-lock.json`; CI использует Yarn 4 (corepack), README велит `npm install`.

1. Удалить `package-lock.json`.
2. В `package.json` добавить поле `packageManager: "yarn@4.x"` (точную версию взять из `.github/workflows/ci.yml` / `.yarnrc.yml`, они должны совпасть).
3. Проверить `.yarnrc.yml`: `nodeLinker: node-modules` остаётся.
4. Заменить все упоминания `npm install` / `npm run …` на yarn-эквиваленты в `README.md`, `TESTING.md`, `DEPLOYMENT.md` (и где ещё найдётся по grep `npm `).
5. В `.gitignore` FE убедиться, что артефакты yarn berry (`.yarn/cache` и т.п.) обработаны согласно текущей схеме (`nodeLinker: node-modules` → `.yarn/` кроме `releases/`/`patches/` обычно игнорируется — привести к рекомендованному для node-modules виду, не ломая текущий чекаут).

**Приёмка:** свежий `yarn install --immutable` проходит; `yarn build` и `yarn test:unit` зелёные; `git grep "npm install"` по mvp.fe пуст (кроме, возможно, исторических доков — их не трогаем, если они уходят в архив в Фазе 7).

## Фаза 2 — ESLint на фронте (репо: mvp.fe)

1. Добавить dev-зависимости: `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
2. Создать flat-config `eslint.config.js`: базово `typescript-eslint` recommended (НЕ type-checked вариант — быстрее и без привязки к tsconfig project references) + `react-hooks` recommended; ignores: `dist`, `dev-dist`, `coverage`, `e2e/**` (playwright — по желанию), `.yarn`.
3. Скрипт `"lint": "eslint ."` в `package.json`.
4. Прогнать по кодовой базе. Стратегия к находкам: авто-фиксы (`--fix`) применить; массовые спорные правила (например `no-explicit-any`, если сотни срабатываний) — перевести в `off`/`warn` на уровне конфига с комментарием, а не рефакторить код. Цель фазы — работающий линтер с нулём errors, а не переписывание кода.
5. Вписать шаг `yarn lint` в `.github/workflows/ci.yml` между install и build.

**Приёмка:** `yarn lint` — 0 errors; build/tests по-прежнему зелёные.

## Фаза 3 — CI на push/PR, подготовить и закомментировать (репо: mvp.be и mvp.fe)

Триггеры готовим, но **оставляем закомментированными** — включение = раскомментировать одну секцию. Деплой-workflow не трогаем вообще.

В обоих `.github/workflows/ci.yml` над существующим `on: workflow_dispatch` добавить закомментированный блок с поясняющим комментарием:

```yaml
# Автозапуск CI подготовлен, но выключен. Чтобы включить — раскомментировать блок ниже.
# on:
#   push:
#     branches: [master, develop]
#   pull_request:
on:
  workflow_dispatch:
```

(В mvp.be ветки `[master]`, в mvp.fe `[master, develop]` — по фактическим веткам репо.)

**Приёмка:** yaml валиден (workflow_dispatch продолжает работать), закомментированный блок синтаксически корректен при раскомментировании.

## Фаза 4 — .tools: убрать хардкод путей, задокументировать (репо: workspace)

1. В `.tools/fetch-docs.mjs` и `.tools/gen-docs.mjs` заменить абсолютные `D:/_work/mvp/...` на пути, вычисляемые от расположения скрипта: `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')` → корень workspace, дальше относительные сегменты через `path.join` (не конкатенация строк — Windows/macOS).
2. Пройти grep-ом по всем `.tools/*.mjs` на другие абсолютные пути/`D:` и починить тем же способом.
3. Создать `.tools/README.md`: назначение каждого скрипта (одной строкой), предпосылки — Chrome, запущенный с `--remote-debugging-port=9222`; для probe-скриптов — валидный токен Esupl в `mvp.fe/.env`; напоминание, что все probe — строго read-only к Esupl.

**Приёмка:** `git grep -nE "[A-Za-z]:[/\\\\]_work" .tools` пуст; `node .tools/gen-docs.mjs` отрабатывает (или падает по причине отсутствия входных данных, но не по причине пути).

## Фаза 5 — Единый кроссплатформенный запуск стека (репо: workspace, правка в mvp.be)

Цель — три команды из корня workspace, работающие одинаково на Windows и macOS:

| Команда | Что делает |
|---|---|
| `yarn dev` | БД+бэкенд в Docker (hot-reload через bind-mount, уже работает), фронт нативно `yarn dev` (Vite HMR). Основной режим разработки. |
| `yarn dev:docker` | Весь стек в Docker: db + backend + frontend (nginx-образ, прокси `/api` → backend). Режим «как на сервере». |
| `yarn reset` | Полный сброс: `docker compose down -v` (сносит pgdata) → пересборка образов `--build` → up; миграции и сид применятся сами (entrypoint). Плюс флаг `--full`: дополнительно чистая переустановка FE (`rm node_modules` кроссплатформенно из Node + `yarn install`). |

Реализация:

1. **Корневой `package.json`** (workspace-репо): `"private": true`, `packageManager: yarn@4.x` (той же версии, что FE), без зависимостей; скрипты — тонкие обёртки над Node-скриптами: `"dev": "node scripts/dev.mjs"`, `"dev:docker": "node scripts/dev.mjs --docker"`, `"reset": "node scripts/reset.mjs"`, `"bootstrap": "node scripts/bootstrap.mjs"` (Фаза 6).
2. **Корневой `docker-compose.yml`** (workspace-репо) для режима `dev:docker`: через `include: - mvp.be/docker-compose.yml` (compose v2.20+) подключить существующий BE-стек и добавить сервис `frontend`: `build: ./mvp.fe`, порт `5173:80` (или `80:80` — решить и задокументировать), `depends_on: backend`. Существующий `mvp.be/docker-compose.yml` при этом **не менять** (или менять минимально; любые правки — отдельным коммитом в mvp.be). Nginx-конфиг FE уже проксирует `/api` на `backend:8000` — проверить имя апстрима, при расхождении поправить build-arg/конфиг.
3. **`scripts/dev.mjs`** (workspace): без `--docker` — `docker compose up -d` в `mvp.be` (db+backend), дождаться health `/api/v1/health` (fetch-поллинг с таймаутом и внятной ошибкой), затем spawn `yarn dev` в `mvp.fe` с наследованием stdio; Ctrl+C гасит фронт (контейнеры оставить — быстрый рестарт; отметить в README). С `--docker` — `docker compose up --build` по корневому compose. Все spawn — через `{ shell: false }` и явный бинарь; на Windows учесть `yarn.cmd`/corepack (проще: `spawn('corepack', ['yarn', 'dev'], ...)` или `shell: true` — исполнителю выбрать и проверить на Windows).
4. **`scripts/reset.mjs`** (workspace): подтверждение через readline («сносит локальную БД, продолжить? y/N», флаг `-y` для обхода) → `docker compose down -v` → `docker compose build` → `up -d` → health-check → лог «БД пересоздана, миграции+сид применены». `--full` — плюс переустановка FE.
5. **Предпосылки** скрипты проверяют сами и падают с понятным сообщением: docker доступен (`docker info`), Node ≥ 20, каталоги `mvp.fe`/`mvp.be` существуют (иначе отсылать к `yarn bootstrap`).
6. `mvp.be/scripts/run-native.ps1` остаётся как есть — опциональный Windows-путь, в новых доках упоминается как альтернатива, не как основной режим.

**Приёмка:** на Windows — все три команды работают из корня (`yarn dev` даёт рабочий фронт на :5173 с живым бэком; `yarn dev:docker` — рабочий стек; `yarn reset -y` — чистая БД с сидом). macOS-прогон исполнитель сделать не может — в README пометить «проверено: Windows; macOS — проверить при первом запуске» и вести чек-лист.

## Фаза 6 — Корневой README + bootstrap (репо: workspace)

1. **`README.md` в корне workspace**: что это за workspace и почему три отдельных репо; таблица репо и их remotes; предпосылки (git, Docker Desktop, Node 20+, corepack); Quick start: `yarn bootstrap` → `yarn dev`; таблица корневых команд (dev / dev:docker / reset / bootstrap); ссылки на `mvp.docs/00-overview/dev-workflow.md` (процесс) и `MOC.md` (знания); где лежат env-примеры и что их копирует bootstrap.
2. **`scripts/bootstrap.mjs`**: клонирует отсутствующие `mvp.fe` / `mvp.be` / `mvp.docs` с их remotes (URL-ы захардкодить константами вверху файла с комментарием); `corepack enable`; `yarn install` в mvp.fe; копирует `mvp.be/lcos.env.example → lcos.env` и `mvp.fe/.env.example → .env`, **только если целевых файлов нет** (существующие не перезаписывать никогда); в конце печатает «что дальше»: `yarn dev`. Идемпотентен — повторный запуск ничего не ломает.
3. Обновить `mvp.docs/00-overview/dev-workflow.md`: §4 «Локальная разработка» переписать на новые корневые команды (старые прямые команды оставить как «под капотом»); §6 — вычеркнуть закрытые риски (двойной lock, пути в .tools, нет корневого README, нет единого up), обновить `updated`.

**Приёмка:** в чистом каталоге `bootstrap` доводит до работающего `yarn dev` без ручных шагов (кроме доступа к git-remote); повторный запуск bootstrap — no-op.

## Фаза 7 — Уборка документации (репо: mvp.docs + mvp.be + workspace)

### 7a. Досвести `work/` по готовому аудиту

Пройти `mvp.docs/work/SPECKIT-AUDIT-2026-07-15.md` и закрыть все **medium** (10 шт.) в предложенном там порядке. Ключевое из аудита:
- Backlog: слить `work/05_BACKLOG__append_2026-07-08.md` в `work/05_BACKLOG.md`, append-файл — в `archive/`.
- Снять `ssot_for` с `work/plan/00_IMPLEMENTATION_PLAN.md` и `work/plan/PHASE_*.md` (SSOT фаз — [[roadmap]], SSOT требований — epics/features); файлам проставить честный статус (`superseded`/`historical`) или переместить в `archive/`.
- VER-021: оставить один канонический документ (`work/VER-021_ESUPL_DURABILITY_TEST.md`), добавить ему front-matter; остальные упоминания превратить в ссылки.
- Починить указатель `work/09_PHASE1_TASKS.md` → `08_PHASE1_SPEC.md` (тот в архиве) и рассинхрон статуса `work/_RESTRUCTURE_PLAN.md` (front-matter `in_progress` vs тело `COMPLETE`).
- Из `_RESTRUCTURE_PLAN.md` убрать/скорректировать директиву «ALL docs in ENGLISH» — фактический язык vault русский (закреплено в README vault).
- Low-замечания (54) — по остаточному принципу, не блокируют фазу.

### 7b. Разнести бесхозные md

- Корень workspace: все `*_REVIEW*.md`, `REQUIREMENTS_STATUS*.md` и прочие md-артефакты ревью (кроме нового `README.md`) → `mvp.docs/archive/` (в начало каждого — строка «перенесено из корня workspace 2026-07-16»). В workspace-репо они исчезают, в mvp.docs появляются коммитом.
- `mvp.be`: `DIAGNOSIS.md`, `DELIVERABLES.txt`, `IMPLEMENTATION_SUMMARY.md`, `lcos-backend-spec-phase1.md`, `lcos-auth-multitenancy-spec.md` → `mvp.docs/archive/`. **Остаются в mvp.be:** `README.md`, `CLAUDE.md`, `DEPLOYMENT.md`; `VERIFICATION_CHECKLIST.md` — сначала проверить, не ссылается ли на него живой процесс (VER-021, merge-гейт): если да — оставить и связать из vault, если нет — тоже в архив.
- Перед перемещением каждого файла grep-ом проверить входящие ссылки (vault + оба кода-репо) и починить их.

### 7c. Вычистить Jira

Jira в проекте нет и не будет. Grep по `mvp.docs` (и `.claude/skills` не трогать — это апстрим spec-kit) на `Jira`/`джир`: в `work/bugs/README.md` и других процессных доках заменить формулировки «выгрузим в Jira» на «внешний трекер не планируется; при росте команды — GitHub Issues через speckit-taskstoissues». Описание vault как «база знаний в стиле Confluence/Jira» в README — это метафора формата, можно оставить или заменить на «в стиле wiki» — на вкус исполнителя.

**Приёмка:** аудит-medium закрыты (отметить в самом аудит-файле); в корне workspace из md остался только README; `git grep -i jira mvp.docs/work` не находит процессных обещаний Jira; битых wikilinks не прибавилось.

---

## Порядок и зависимости

Фазы 1→2 последовательно (обе в mvp.fe). Фазы 3, 4 — независимы, в любой момент. Фаза 5 до Фазы 6 (README описывает команды из 5). Фаза 7 — независима, можно параллельно. Итоговые коммиты: mvp.fe (фазы 1–3), mvp.be (фаза 3, минимум из 5, часть 7b), mvp.docs (6.3, 7a–7c), workspace (4, 5, 6, часть 7b).

## Явно вне скоупа

- Автодеплой, изменение deploy-workflow — нет.
- Монорепо-миграция, submodules — нет.
- Git-теги/CHANGELOG/версионирование — отложено до пилота.
- Pre-commit/husky-хуки — нет.
- Jira/внешний трекер — нет и не будет.
- Рефакторинг кода приложений под ESLint сверх авто-фиксов — нет.
