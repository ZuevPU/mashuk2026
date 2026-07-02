import dotenv from 'dotenv';
import { env } from './config/env.js';
import { validateEnv } from './config/validateEnv.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { startAnalyticsScheduler } from './services/analyticsService.js';
dotenv.config();
validateEnv();
const app = createApp();
const port = env.PORT || 8080;
const host = '0.0.0.0';
app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
    console.log(`Health: / and /health (liveness), /health/ready (DB check)`);
    if (env.PUBLIC_URL)
        console.log(`PUBLIC_URL: ${env.PUBLIC_URL}`);
    void (async () => {
        try {
            await runMigrations();
            if (process.env.AUTO_SEED === 'true') {
                try {
                    await runSeed();
                }
                catch (err) {
                    console.error('Seed skipped or failed (non-fatal):', err);
                }
            }
            startAnalyticsScheduler();
        }
        catch (err) {
            console.error('Startup failed after listen:', err);
            process.exit(1);
        }
    })();
});
