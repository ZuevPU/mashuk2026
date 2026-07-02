import express, { type Request, type Response } from 'express';
import path from 'path';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db, pool } from './db/index.js';
import routes from './routes/index.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middlewares/errorHandler.js';

function resolveCorsOrigin(requestOrigin: string | undefined): string | undefined {
  const configured = env.CORS_ORIGIN;
  if (!configured || configured === '*') return requestOrigin || '*';
  // null origin = opaque origin (VK iframe / sandboxed content) — allow it
  if (requestOrigin === 'null' || !requestOrigin) return '*';
  const allowed = configured.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(requestOrigin)) return requestOrigin;
  if (allowed.length === 1) return allowed[0];
  return undefined;
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const origin = resolveCorsOrigin(req.headers.origin);
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Test-Vk-Id, X-Admin-Token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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
