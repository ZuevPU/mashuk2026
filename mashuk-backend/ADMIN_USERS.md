# Учётные записи админки

После `npm run db:seed` или `AUTO_SEED=true` на сервере создаются три администратора:

| Логин | Пароль (8 символов) | Роль |
|-------|---------------------|------|
| zuev | `ZuevPu26` | superadmin |
| serveeva | `Servee26` | admin |
| avakan | `Avakan26` | admin |

Пароли хранятся в БД в виде scrypt-хеша. Сменить пароль можно напрямую в таблице `admin_users` (через seed или SQL после генерации нового хеша).

## Вход в админку

1. Откройте админ-панель в браузере
2. Введите **логин** и **пароль** из таблицы выше
3. Backend выдаёт JWT-токен (7 дней), дальше запросы идут с `Authorization: Bearer ...`

## Добавить нового админа вручную

```sql
-- Пароль нужно захешировать через npm run db:seed или API; проще добавить в seedAdmins.ts и перезапустить seed
INSERT INTO admin_users (login, password_hash, role) VALUES ('newlogin', '<scrypt-hash>', 'admin');
```

Или добавьте запись в `src/db/seedAdmins.ts` → `DEFAULT_ADMINS` и выполните `npm run db:seed`.
