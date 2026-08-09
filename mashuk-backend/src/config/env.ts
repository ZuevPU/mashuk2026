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
  VK_GROUP_ID: process.env.VK_GROUP_ID || '',
  VK_COMMUNITY_TOKEN: process.env.VK_COMMUNITY_TOKEN || '',
  /** Confirmation string from VK Callback API settings */
  VK_CALLBACK_CONFIRMATION: process.env.VK_CALLBACK_CONFIRMATION || '',
  /** Optional Callback API secret */
  VK_CALLBACK_SECRET: process.env.VK_CALLBACK_SECRET || '',
  /** Публичный URL API/загрузок (фото, QR) — не путать со ссылкой в push */
  PUBLIC_URL: process.env.PUBLIC_URL || '',
  /**
   * Ссылка в ЛС сообщества (fallback push).
   * Мини-приложение VK, не backend-хост.
   */
  VK_MINI_APP_URL: process.env.VK_MINI_APP_URL || 'https://vk.ru/app54662212',
  EXPORT_STORAGE_DIR: process.env.EXPORT_STORAGE_DIR || 'data/admin-exports',
  UNIFIED_RATING: process.env.UNIFIED_RATING !== 'false',
  /** Обмен опытом: лимит вопросов на участника за всю смену */
  EXCHANGE_MAX_QUESTIONS_TOTAL: process.env.EXCHANGE_MAX_QUESTIONS_TOTAL || '5',
  /** Обмен опытом: лимит ответов на участника за календарный день (МСК) */
  EXCHANGE_MAX_ANSWERS_PER_DAY: process.env.EXCHANGE_MAX_ANSWERS_PER_DAY || '5',
};
