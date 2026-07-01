import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
}

export const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction): void => {
  const token = req.headers['x-admin-token'];
  if (token !== env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized admin' });
    return;
  }
  req.isAdmin = true;
  next();
};
