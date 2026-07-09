# members

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/members`

Gets all members for the given team.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | role | optional |  |


## GET show

`GET https://api.esupl.com/v1/teams/1/members/1933`

Gets the information about the team member.

**Query parameters**

| Param | Example | Required | Description |
|---|---|---|---|
| `include` | warehouses:fields(id|name|address) | optional |  |


## POST store

`POST https://api.esupl.com/v1/teams/1/members`

Creates a new member for the given team.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "full_name": "Bill Gates",
  "email": "bill.gates@esupl.com",
  "role_id": 1,
  "pin": "1111",
  "password": "123456",
  "password_confirmation": "123456"
}
```


## PUT update

`PUT https://api.esupl.com/v1/teams/1/members/2211`

Updates the given team member.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "pin": "ddas"
}
```


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/members/1`

Deletes the member from the given team.

