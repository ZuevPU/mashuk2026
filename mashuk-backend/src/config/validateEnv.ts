import { env } from './env.js';

// Never process.exit() here: this runs after the HTTP server is already
// listening, and / and /health are documented liveness checks that must
// stay up regardless of config problems (Timeweb/Docker healthcheck depends
// on it — see TIMEWEB_BACKEND_FIX.md). Config errors are logged loudly and
// surface naturally instead: DB-dependent routes fail via errorHandler,
// /health/ready reports db:disconnected, and VK/admin auth reject requests.
export function validateEnv(): boolean {
  let ok = true;

  if (!env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is required — DB-dependent routes will fail until this is set.');
    ok = false;
  }

  if (!env.SKIP_VK_SIGN && !env.VK_APP_SECRET) {
    console.error('FATAL: VK_APP_SECRET is required when SKIP_VK_SIGN=false — VK auth will reject all requests until this is set.');
    ok = false;
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && env.ADMIN_SECRET === 'dev-admin-secret') {
    console.error('FATAL: ADMIN_SECRET is still the dev default in production — change it immediately, admin routes are insecure.');
    ok = false;
  }

  if (isProd && env.CORS_ORIGIN === '*') {
    console.warn('WARN: CORS_ORIGIN=* in production — restrict to your frontend/admin URLs');
  }

  if (isProd && !env.PUBLIC_URL) {
    console.warn('WARN: PUBLIC_URL is not set — uploaded file URLs may be incorrect');
  }

  return ok;
}
