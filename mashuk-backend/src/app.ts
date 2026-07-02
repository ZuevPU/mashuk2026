import express, { type Request, type Response } from 'express';
import path from 'path';
import { sql } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { env } from './config/env.js';
import { db, pool } from './db/index.js';
import routes from './routes/index.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middlewares/errorHandler.js';

export function createApp() {
  const app = express();
  
  app.set('trust proxy', 1);

  app.use(cors());

  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Global rate limit
  app.use(rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // limit each IP to 200 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }));

  const healthHandler = (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  };

  app.get('/', healthHandler);
  app.get('/health', healthHandler);
  app.head('/', (_req, res) => res.status(200).end());
  app.head('/health', (_req, res) => res.status(200).end());

  app.get('/health/ready', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ status: 'ok', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'disconnected' });
    }
  });

  app.use('/api', routes);
  app.use('/api/admin', adminRoutes);

  app.use(errorHandler);

  return app;
}

export { pool };
