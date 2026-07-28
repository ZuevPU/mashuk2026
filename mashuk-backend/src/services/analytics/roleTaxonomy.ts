import { ROLE_CATALOG, ROLE_MATRIX, ROLE_KEYS, getRoleMeta } from '../roleService.js';
import { db } from '../../db/index.js';
import { pedagogicalRoles } from '../../db/schema.js';

export async function getRoleTaxonomyPayload() {
  const dbRoles = await db.select().from(pedagogicalRoles);
  const catalog = ROLE_CATALOG.map(r => ({
    roleKey: r.roleKey,
    name: r.name,
    quadrant: r.quadrant,
    essence: r.essence,
    iconKey: r.iconKey,
  }));
  return {
    matrix: ROLE_MATRIX,
    roleKeys: ROLE_KEYS,
    catalog,
    dbRoles,
    labelFor: (key: string | null | undefined) => getRoleMeta(key || '')?.name ?? key ?? '—',
  };
}
