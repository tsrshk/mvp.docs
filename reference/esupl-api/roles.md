# roles

[← Back to index](README.md)

## GET index

`GET https://api.esupl.com/v1/teams/1/roles`

Gets the list of the roles.


## GET show

`GET https://api.esupl.com/v1/teams/1/roles/15`

Gets the information about the role.


## POST store

`POST https://api.esupl.com/v1/teams/1/roles`

Creates a new role.

**Headers**

- `Authorization: Bearer {access_token}`
- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Cashier",
  "options": {
    "use_work_shifts": false,
    "modules": {
        "dashboard": "full",
        "abc": "without",
        "dishes": "view"
    }
  }
}
```


## PUT update

`PUT https://api.esupl.com/v1/teams/1/roles/15`

Updates the information about the role.

**Headers**

- `Content-Type: application/json`

**Request body** (raw)

```json
{
  "name": "Cashier (updated)",
  "options": {
    "use_work_shifts": false,
    "modules": {
        "dashboard": "full",
        "abc": "without",
        "dishes": "view"
    }
  }
}
```


## DELETE destroy

`DELETE https://api.esupl.com/v1/teams/1/roles/15`

Deletes the role.

