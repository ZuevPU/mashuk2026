# Admin users

## Roles (v1 matrix)

| Role | read | moderate | export | settings | users | delete |
|------|------|----------|--------|----------|-------|--------|
| admin | yes | yes | yes | yes | yes | yes |
| moderator | yes | yes | no | no | no | no |
| analyst | yes | no | yes | no | no | no |
| director | yes | no | yes | no | no | no |

JWT includes `role`. Dangerous routes use `requireAdminRole(...)`.

## Seed

```powershell
cd mashuk-backend
npx tsx src/db/seedAdmins.ts
```

## CRUD

- `GET /api/admin/admin-users`
- `POST /api/admin/admin-users` `{ login, password, role }`
- `PATCH /api/admin/admin-users/:id` `{ role?, password?, isActive? }`

UI: вкладка «Админы» в mashuk-admin.
