import dotenv from 'dotenv';
import { env } from './config/env.js';
import { validateEnv } from './config/validateEnv.js';
import { createApp } from './app.js';
import { startAnalyticsScheduler } from './services/analyticsService.js';

dotenv.config();
validateEnv();

const app = createApp();

const port = env.PORT || 8080;
const host = '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
  startAnalyticsScheduler();
});