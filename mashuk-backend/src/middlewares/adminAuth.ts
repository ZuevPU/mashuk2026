import { Request, Response, NextFunction } from 'express';
import { verifyAdminToken, roleCan } from '../utils/adminToken.js';
import { roleCanSection } from '../services/adminPermissionsService.js';
import type { AdminSection, PermissionAction } from '../services/adminPermissionsDefaults.js';

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

export function requireAdminPermission(section: AdminSection, action: PermissionAction) {
  return async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
    const role = req.adminRole || 'admin';
    if (role === 'admin' || role === 'superadmin') {
      next();
      return;
    }
    try {
      const ok = await roleCanSection(role, section, action);
      if (!ok) {
        res.status(403).json({ error: 'Insufficient permissions', role, section, action });
        return;
      }
      next();
    } catch (err) {
      console.error('requireAdminPermission error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/** Legacy coarse checks — used until all routes use requireAdminPermission. */
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
