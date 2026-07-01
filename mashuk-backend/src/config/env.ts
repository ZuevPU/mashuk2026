import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 8080,
  DATABASE_URL: process.env.DATABASE_URL || '',
  VK_APP_SECRET: process.env.VK_APP_SECRET || '',
  SKIP_VK_SIGN: process.env.SKIP_VK_SIGN === 'true',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  ADMIN_SECRET: process.env.ADMIN_SECRET || 'dev-admin-secret',
  VK_SERVICE_TOKEN: process.env.VK_SERVICE_TOKEN || '',
  PUBLIC_URL: process.env.PUBLIC_URL || '',
};
