# money-transactions

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/money-transactions`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `per_page` | 1 | optional |  |
| `filter[user_id]` | 93 | optional |  |
| `filter[money_transaction_category_id]` | 3 | optional |  |
| `filter[comment]` | комм | optional |  |
| `include` | user:fields(id|full_name),money_transaction_category:fields(name),money_transaction_owner | optional |  |


## GET show

`GET https://api.esupl.com/v1/teams/1/money-transactions/2`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | user | optional |  |
| `fields` | id | optional |  |


## POST store

`POST https://api.esupl.com/v1/teams/1/money-transactions`

**Request body** (raw)

```json
{
  "money_transaction_category_id": 1,
  "type": "income",
  "amount": 0.01,
  "comment": "платежи",
  "transaction_date": "2021-08-18T18:41:00.000Z"
}
```


## PUT update

`PUT https://api.esupl.com/v1/teams/1/money-transactions/5`

Updates the information about the terminal.

**Request body** (raw)

```json
{
    "money_transaction_category_id": null,
    "type": "income",
    "amount": 1.77,
    "comment": "коммунальные платежи: свет",
    "transaction_date": "2019-05-26T00:00:00.000Z"
}
```


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/money-transactions/5`

Deletes the terminal.

