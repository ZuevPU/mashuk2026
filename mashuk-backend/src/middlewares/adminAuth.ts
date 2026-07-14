import { Request, Response, NextFunction } from 'express';
import { roleCan, verifyAdminToken } from '../utils/adminToken.js';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
  adminId?: number;
  adminLogin?: string;
  adminRole?: string;
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
  req.adminRole = verified.role;
  next();
};

export function requireAdminRole(...actions: Array<'read' | 'moderate' | 'export' | 'settings' | 'users' | 'delete'>) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const role = req.adminRole || 'admin';
    const ok = actions.every(a => roleCan(role, a));
    if (!ok) {
      res.status(403).json({ error: 'Insufficient permissions', role });
      return;
    }
    next();
  };
}
