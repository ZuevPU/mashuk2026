import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && /^https:\/\/zuevpu-mashuk2026-[a-z0-9]+\.twc1\.net$/i.test(origin.replace(/\/$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin.replace(/\/$/, ''));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
