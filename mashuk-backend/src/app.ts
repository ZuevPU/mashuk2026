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

  const corsOrigins = env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: corsOrigins.length === 1 && corsOrigins[0] === '*'
      ? true
      : corsOrigins.length > 0
        ? corsOrigins
        : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Shift-Id'],
  }));

  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Global rate limit (admin API excluded — many parallel reads on Questions tab)
  app.use(rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/admin'),
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
