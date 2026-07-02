import dotenv from 'dotenv';
import { env } from './config/env.js';
import { validateEnv } from './config/validateEnv.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { startAnalyticsScheduler } from './services/analyticsService.js';

dotenv.config();

const app = createApp();
const port = env.PORT || 8080;
const host = '0.0.0.0';

// validateEnv() runs AFTER listen() so the healthcheck port is always open
// immediately, even if env config is wrong on the platform. A crash from bad
// config then shows up clearly in runtime logs instead of silently blocking
// the port and making the deploy healthcheck fail with no visible reason.
app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
  console.log(`Health: / and /health (liveness), /health/ready (DB check)`);
  if (env.PUBLIC_URL) console.log(`PUBLIC_URL: ${env.PUBLIC_URL}`);

  void (async () => {
    const envOk = validateEnv();
    if (!envOk) {
      console.error('Startup config invalid — server stays up for healthchecks, but DB/auth routes will fail until env vars are fixed and the app is restarted.');
      return;
    }

    try {
      await runMigrations();
      if (process.env.AUTO_SEED === 'true') {
        try {
          await runSeed();
        } catch (err) {
          console.error('Seed skipped or failed (non-fatal):', err);
        }
      }
      startAnalyticsScheduler();
    } catch (err) {
      console.error('Migrations failed — server stays up for healthchecks, but DB routes will fail until this is fixed and the app is restarted:', err);
    }
  })();
});
