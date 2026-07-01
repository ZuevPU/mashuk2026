import { env } from './env.js';
export function validateEnv() {
    if (!env.DATABASE_URL) {
        console.error('FATAL: DATABASE_URL is required');
        process.exit(1);
    }
    if (!env.SKIP_VK_SIGN && !env.VK_APP_SECRET) {
        console.error('FATAL: VK_APP_SECRET is required when SKIP_VK_SIGN=false');
        process.exit(1);
    }
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && env.ADMIN_SECRET === 'dev-admin-secret') {
        console.error('FATAL: Change ADMIN_SECRET from dev-admin-secret in production');
        process.exit(1);
    }
    if (isProd && env.CORS_ORIGIN === '*') {
        console.warn('WARN: CORS_ORIGIN=* in production — restrict to your frontend/admin URLs');
    }
    if (isProd && !env.PUBLIC_URL) {
        console.warn('WARN: PUBLIC_URL is not set — uploaded file URLs may be incorrect');
    }
}
