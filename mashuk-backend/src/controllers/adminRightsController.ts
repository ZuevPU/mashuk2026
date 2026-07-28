import { Response } from 'express';
import { AdminRequest } from '../middlewares/adminAuth.js';
import {
  getFullRightsMatrix,
  getPermissionsForRole,
  patchRightsMatrix,
  resetRightsMatrixToDefaults,
} from '../services/adminPermissionsService.js';
import type { AdminSection } from '../services/adminPermissionsDefaults.js';
import { logAdminAction } from '../services/adminActionsLog.js';

export async function getRightsMatrix(_req: AdminRequest, res: Response): Promise<void> {
  const matrix = await getFullRightsMatrix();
  res.json({ matrix });
}

export async function patchRightsMatrixHandler(req: AdminRequest, res: Response): Promise<void> {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  await patchRightsMatrix(
    updates.map((u: { role: string; section: AdminSection; permissions: Record<string, boolean> }) => ({
      role: u.role,
      section: u.section,
      permissions: {
        canRead: u.permissions?.canRead,
        canCreate: u.permissions?.canCreate,
        canUpdate: u.permissions?.canUpdate,
        canDelete: u.permissions?.canDelete,
        canConfirm: u.permissions?.canConfirm,
        canExport: u.permissions?.canExport,
      },
    })),
  );
  await logAdminAction({
    req,
    actionType: 'forum_settings',
    section: 'admins',
    newValue: { rightsMatrixPatch: updates.length },
    isCritical: true,
  });
  res.json({ ok: true, matrix: await getFullRightsMatrix() });
}

export async function resetRightsMatrixHandler(req: AdminRequest, res: Response): Promise<void> {
  await resetRightsMatrixToDefaults();
  await logAdminAction({
    req,
    actionType: 'forum_settings',
    section: 'admins',
    comment: 'rights matrix reset to defaults',
    isCritical: true,
  });
  res.json({ ok: true, matrix: await getFullRightsMatrix() });
}

import {
  computeAllowedTabs,
  defaultTabForRole,
  allowedSectionsList,
} from '../services/adminTabAccess.js';

export async function getMyPermissions(req: AdminRequest, res: Response): Promise<void> {
  const role = req.adminRole || 'admin';
  const permissions = await getPermissionsForRole(role);
  const allowedTabs = computeAllowedTabs(role, permissions);
  const allowedSections = allowedSectionsList(permissions);
  const defaultTab = defaultTabForRole(role, allowedTabs);
  res.json({
    role,
    permissions,
    allowedSections,
    allowedTabs,
    defaultTab,
    analyticsDashboards: role === 'gamification' ? ['activity'] : null,
  });
}
