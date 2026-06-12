# shift-money-transactions

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/shifts/222/money-transactions`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `per_page` | 1 | optional |  |
| `filter[user_id]` | 93 | optional |  |
| `filter[money_transaction_category_id]` | 3 | optional |  |
| `filter[comment]` | комм | optional |  |
| `include` | user:fields(id|full_name),money_transaction_category | optional |  |


## GET show

`GET https://api.esupl.com/v1/teams/1/shifts/1/money-transactions/9`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `fields` | id,user_id | optional |  |
| `include` | user:fields(id|full_name),money_transaction_category:fields(name) | optional |  |


## POST store

`POST https://api.esupl.com/v1/teams/1/shifts/9/money-transactions`

**Request body** (raw)

```json
{
  "type": "consumption",
  "amount": 5,
  "transaction_date": "2021-09-07T13:09:00+00:00"
}
```


## PUT update

`PUT https://api.esupl.com/v1/teams/1/shifts/1/money-transactions/9`

**Request body** (raw)

```json
{
  "type": "income",
  "amount": 777,
  "transaction_date": "2021-08-15T18:00:42+00:00"
}
```


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/shifts/1/money-transactions/9`

