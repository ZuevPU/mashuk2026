import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken } from '../utils/adminToken.js';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
  adminId?: number;
  adminLogin?: string;
}

export const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized admin' });
    return;
  }

  const verified = verifyAdminToken(authHeader.slice(7));
  if (!verified) {
    res.status(401).json({ error: 'Unauthorized admin' });
    return;
  }

  req.isAdmin = true;
  req.adminId = verified.adminId;
  req.adminLogin = verified.login;
  next();
};
