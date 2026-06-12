# money-transaction-categories

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/money-transaction-categories`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `filter[name]` | 1 | optional |  |
| `per_page` | 1 | optional |  |
| `all` | true | optional |  |
| `fields` | id,name | optional |  |


## GET show

`GET https://api.esupl.com/v1/teams/1/money-transaction-categories/12`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,name,color | optional |  |


## POST store

`POST https://api.esupl.com/v1/teams/1/money-transaction-categories`

**Request body** (raw)

```json
{
    "name": "Коммунальные услуги",
    "color": "green"
}
```


## PUT update

`PUT https://api.esupl.com/v1/teams/1/money-transaction-categories/5`

Updates the information about the terminal.

**Request body** (raw)

```json
{
    "name": "Новое название для категории"
}
```


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/money-transaction-categories/13`

Deletes the terminal.

