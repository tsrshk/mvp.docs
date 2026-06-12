# shifts

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/shifts`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `per_page` | 25 | optional |  |
| `filter[user_id]` | 93 | optional |  |
| `filter[money_transaction_category_id]` | 3 | optional |  |
| `filter[comment]` | комм | optional |  |
| `filter[opened_at]` | 2021-08-15, | optional |  |
| `include` | opened_by_user:fields(id|full_name) | optional |  |


## GET show

`GET https://api.esupl.com/v1/teams/1/shifts/1`

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | money_transactions | optional |  |


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/shifts/1`

Deletes the terminal.

