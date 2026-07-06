-- Admin auth: admin_users table exists since 0001; credentials seeded via npm run db:seed
DELETE FROM "admin_users" WHERE "login" = 'admin';
