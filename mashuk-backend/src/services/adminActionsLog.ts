import { db } from '../db/index.js';
import { adminActionsLog } from '../db/schema.js';
import { AdminRequest } from '../middlewares/adminAuth.js';

const CRITICAL_TYPES = new Set([
  'points_add',
  'points_remove',
  'role_change',
  'task_moderate',
  'question_update',
  'question_delete',
  'event_update',
  'event_delete',
  'participant_reset',
  'push_send',
  'medal_award',
  'forum_settings',
  'admin_user_change',
]);

export async function logAdminAction(opts: {
  req?: AdminRequest;
  adminId?: number;
  adminLogin?: string;
  actionType: string;
  section?: string;
  objectId?: string | number;
  oldValue?: unknown;
  newValue?: unknown;
  comment?: string;
  isCritical?: boolean;
}): Promise<void> {
  try {
    const adminId = opts.adminId ?? opts.req?.adminId;
    const adminLogin = opts.adminLogin ?? opts.req?.adminLogin;
    const ip = opts.req?.ip || (opts.req?.headers?.['x-forwarded-for'] as string) || null;
    const isCritical = opts.isCritical ?? CRITICAL_TYPES.has(opts.actionType);
    await db.insert(adminActionsLog).values({
      adminId: adminId ?? null,
      adminLogin: adminLogin ?? null,
      actionType: opts.actionType,
      section: opts.section ?? null,
      objectId: opts.objectId != null ? String(opts.objectId) : null,
      oldValue: opts.oldValue as object ?? null,
      newValue: opts.newValue as object ?? null,
      comment: opts.comment ?? null,
      ip: ip ? String(ip).slice(0, 100) : null,
      isCritical,
    });
  } catch (err) {
    console.error('logAdminAction failed:', err);
  }
}
