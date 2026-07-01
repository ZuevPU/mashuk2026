import dotenv from 'dotenv';
import { env } from './config/env.js';
import { validateEnv } from './config/validateEnv.js';
import { createApp } from './app.js';
import { startAnalyticsScheduler } from './services/analyticsService.js';
dotenv.config();
validateEnv();
const app = createApp();
const port = env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    startAnalyticsScheduler();
});
