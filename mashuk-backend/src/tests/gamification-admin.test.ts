import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultPermissionRows,
  ADMIN_SECTIONS,
  type AdminSection,
  type SectionPermissions,
} from '../services/adminPermissionsDefaults.js';
import { computeAllowedTabs, defaultTabForRole } from '../services/adminTabAccess.js';

function permissionsFromDefaults(role: string): Record<AdminSection, SectionPermissions> {
  const rows = buildDefaultPermissionRows().filter(r => r.role === role);
  const out = {} as Record<AdminSection, SectionPermissions>;
  for (const section of ADMIN_SECTIONS) {
    const row = rows.find(r => r.section === section);
    out[section] = row ?? {
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canConfirm: false,
      canExport: false,
    };
  }
  return out;
}

describe('gamification admin access', () => {
  it('gamification role has tasks CRUD and rating tabs', () => {
    const perms = permissionsFromDefaults('gamification');
    assert.equal(perms.tasks.canRead, true);
    assert.equal(perms.tasks.canCreate, true);
    assert.equal(perms.forum.canRead, false);
    const tabs = computeAllowedTabs('gamification', perms);
    assert.ok(tabs.includes('rating'));
    assert.ok(tabs.includes('tasks'));
    assert.ok(!tabs.includes('forum'));
    assert.equal(defaultTabForRole('gamification', tabs), 'rating');
  });
});
