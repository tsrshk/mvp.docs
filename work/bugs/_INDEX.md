---
id: BUGS-INDEX
type: moc
title: Реестр багов LCOS — живой индекс
status: current
phase: cross-cutting
updated: 2026-07-16
owner: Ivan
trust_tier: 2
---

# Реестр багов LCOS

Живой индекс дефектов. Таблицы ниже собираются автоматически из frontmatter файлов
`LCOS-B#` (Dataview). Соглашения и жизненный цикл — [[README]], шаблон нового бага —
[[_TEMPLATE]].

## Открытые (нужно действие)

```dataview
TABLE WITHOUT ID
  ("[[" + file.name + "|" + id + "]]") AS "ID",
  severity AS "Sev", status AS "Статус", area AS "Область",
  feature AS "Фича", found AS "Найден"
FROM "work/bugs"
WHERE type = "bug" AND status != "verified" AND status != "wontfix" AND status != "dup"
SORT severity ASC, found ASC
```

## Ждут проверки (fixed → verified)

```dataview
TABLE WITHOUT ID
  ("[[" + file.name + "|" + id + "]]") AS "ID",
  severity AS "Sev", commit AS "Commit", fixed AS "Пофикшен"
FROM "work/bugs"
WHERE type = "bug" AND status = "fixed"
SORT fixed ASC
```

## Закрытые / отклонённые

```dataview
TABLE WITHOUT ID
  ("[[" + file.name + "|" + id + "]]") AS "ID",
  status AS "Статус", severity AS "Sev", verified AS "Проверен"
FROM "work/bugs"
WHERE type = "bug" AND (status = "verified" OR status = "wontfix" OR status = "dup")
SORT verified DESC
```

---

## Ручной индекс (если Dataview выключен)

> Держи актуальным только если открываешь vault без плагина Dataview.
> Иначе таблицы выше — источник истины.

| ID | Severity | Статус | Область | Фича | Заголовок |
|---|---|---|---|---|---|
| _пока пусто_ | | | | | |

**Следующий свободный ID:** `LCOS-B1`
