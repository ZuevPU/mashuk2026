import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminRolePermissions } from '../db/schema.js';
import {
  ADMIN_ROLES,
  ADMIN_SECTIONS,
  buildDefaultPermissionRows,
  type AdminSection,
  type PermissionAction,
  type SectionPermissions,
  SECTION_LABELS,
  ROLE_LABELS,
  PERMISSION_ACTION_LABELS,
} from './adminPermissionsDefaults.js';

type MatrixCache = Map<string, SectionPermissions>;

let cache: MatrixCache | null = null;

function cacheKey(role: string, section: string): string {
  return `${role}:${section}`;
}

function permFromRow(row: typeof adminRolePermissions.$inferSelect): SectionPermissions {
  return {
    canRead: row.canRead,
    canCreate: row.canCreate,
    canUpdate: row.canUpdate,
    canDelete: row.canDelete,
    canConfirm: row.canConfirm,
    canExport: row.canExport,
  };
}

export async function ensureAdminPermissionsSeeded(): Promise<void> {
  const [existing] = await db.select({ id: adminRolePermissions.id }).from(adminRolePermissions).limit(1);
  if (existing) {
    await ensureGamificationRolePermissions();
    await ensureOrganizerRolePermissions();
    return;
  }
  const rows = buildDefaultPermissionRows();
  if (rows.length === 0) return;
  await db.insert(adminRolePermissions).values(
    rows.map(r => ({
      role: r.role,
      section: r.section,
      canRead: r.canRead,
      canCreate: r.canCreate,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canConfirm: r.canConfirm,
      canExport: r.canExport,
    })),
  );
  invalidatePermissionsCache();
}

/** Insert gamification matrix rows on DBs seeded before the role existed. */
export async function ensureGamificationRolePermissions(): Promise<void> {
  const [existing] = await db.select({ id: adminRolePermissions.id })
    .from(adminRolePermissions)
    .where(and(eq(adminRolePermissions.role, 'gamification'), eq(adminRolePermissions.section, 'tasks')))
    .limit(1);
  if (existing) return;

  const defaults = buildDefaultPermissionRows().filter(r => r.role === 'gamification');
  if (defaults.length === 0) return;
  await db.insert(adminRolePermissions).values(
    defaults.map(r => ({
      role: r.role,
      section: r.section,
      canRead: r.canRead,
      canCreate: r.canCreate,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canConfirm: r.canConfirm,
      canExport: r.canExport,
    })),
  );
  invalidatePermissionsCache();
}

/** Insert organizer matrix rows on DBs seeded before the role existed. */
export async function ensureOrganizerRolePermissions(): Promise<void> {
  const [existing] = await db.select({ id: adminRolePermissions.id })
    .from(adminRolePermissions)
    .where(and(eq(adminRolePermissions.role, 'organizer'), eq(adminRolePermissions.section, 'events')))
    .limit(1);
  if (existing) return;

  const defaults = buildDefaultPermissionRows().filter(r => r.role === 'organizer');
  if (defaults.length === 0) return;
  await db.insert(adminRolePermissions).values(
    defaults.map(r => ({
      role: r.role,
      section: r.section,
      canRead: r.canRead,
      canCreate: r.canCreate,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canConfirm: r.canConfirm,
      canExport: r.canExport,
    })),
  );
  invalidatePermissionsCache();
}

export function invalidatePermissionsCache(): void {
  cache = null;
}

async function loadCache(): Promise<MatrixCache> {
  if (cache) return cache;
  await ensureAdminPermissionsSeeded();
  const rows = await db.select().from(adminRolePermissions);
  const m = new Map<string, SectionPermissions>();
  for (const row of rows) {
    m.set(cacheKey(row.role, row.section), permFromRow(row));
  }
  cache = m;
  return m;
}

function actionAllowed(p: SectionPermissions, action: PermissionAction): boolean {
  switch (action) {
    case 'read': return p.canRead;
    case 'create': return p.canCreate;
    case 'update': return p.canUpdate;
    case 'delete': return p.canDelete;
    case 'confirm': return p.canConfirm;
    case 'export': return p.canExport;
    default: return false;
  }
}

export async function roleCanSection(
  role: string,
  section: AdminSection,
  action: PermissionAction,
): Promise<boolean> {
  if (role === 'admin' || role === 'superadmin') return true;
  const m = await loadCache();
  const p = m.get(cacheKey(role, section));
  if (!p) return false;
  return actionAllowed(p, action);
}

export async function getPermissionsForRole(role: string): Promise<Record<AdminSection, SectionPermissions>> {
  const m = await loadCache();
  const out = {} as Record<AdminSection, SectionPermissions>;
  for (const section of ADMIN_SECTIONS) {
    if (role === 'admin' || role === 'superadmin') {
      out[section] = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canConfirm: true,
        canExport: true,
      };
    } else {
      out[section] = m.get(cacheKey(role, section)) ?? {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canConfirm: false,
        canExport: false,
      };
    }
  }
  return out;
}

export async function getFullRightsMatrix(): Promise<{
  sections: Array<{ key: AdminSection; label: string }>;
  roles: Array<{ key: string; label: string }>;
  actions: Array<{ key: PermissionAction; label: string }>;
  cells: Array<{
    role: string;
    section: AdminSection;
    permissions: SectionPermissions;
  }>;
}> {
  await loadCache();
  const rows = await db.select().from(adminRolePermissions);
  const roleSet = new Set<string>([...ADMIN_ROLES, 'superadmin']);
  rows.forEach(r => roleSet.add(r.role));

  return {
    sections: ADMIN_SECTIONS.map(key => ({ key, label: SECTION_LABELS[key] })),
    roles: [...roleSet].sort().map(key => ({ key, label: ROLE_LABELS[key] ?? key })),
    actions: (['read', 'create', 'update', 'delete', 'confirm', 'export'] as PermissionAction[]).map(key => ({
      key,
      label: PERMISSION_ACTION_LABELS[key],
    })),
    cells: rows.map(r => ({
      role: r.role,
      section: r.section as AdminSection,
      permissions: permFromRow(r),
    })),
  };
}

export async function patchRightsMatrix(
  updates: Array<{ role: string; section: AdminSection; permissions: Partial<SectionPermissions> }>,
): Promise<void> {
  for (const u of updates) {
    const patch: Partial<typeof adminRolePermissions.$inferInsert> = {};
    if (u.permissions.canRead != null) patch.canRead = u.permissions.canRead;
    if (u.permissions.canCreate != null) patch.canCreate = u.permissions.canCreate;
    if (u.permissions.canUpdate != null) patch.canUpdate = u.permissions.canUpdate;
    if (u.permissions.canDelete != null) patch.canDelete = u.permissions.canDelete;
    if (u.permissions.canConfirm != null) patch.canConfirm = u.permissions.canConfirm;
    if (u.permissions.canExport != null) patch.canExport = u.permissions.canExport;
    if (Object.keys(patch).length === 0) continue;

    const [existing] = await db.select().from(adminRolePermissions)
      .where(and(eq(adminRolePermissions.role, u.role), eq(adminRolePermissions.section, u.section)))
      .limit(1);

    if (!existing) {
      await db.insert(adminRolePermissions).values({
        role: u.role,
        section: u.section,
        canRead: u.permissions.canRead ?? false,
        canCreate: u.permissions.canCreate ?? false,
        canUpdate: u.permissions.canUpdate ?? false,
        canDelete: u.permissions.canDelete ?? false,
        canConfirm: u.permissions.canConfirm ?? false,
        canExport: u.permissions.canExport ?? false,
      });
    } else {
      await db.update(adminRolePermissions)
        .set(patch)
        .where(and(eq(adminRolePermissions.role, u.role), eq(adminRolePermissions.section, u.section)));
    }
  }
  invalidatePermissionsCache();
}

export async function resetRightsMatrixToDefaults(): Promise<void> {
  await db.delete(adminRolePermissions);
  const rows = buildDefaultPermissionRows();
  await db.insert(adminRolePermissions).values(
    rows.map(r => ({
      role: r.role,
      section: r.section,
      canRead: r.canRead,
      canCreate: r.canCreate,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canConfirm: r.canConfirm,
      canExport: r.canExport,
    })),
  );
  invalidatePermissionsCache();
}
