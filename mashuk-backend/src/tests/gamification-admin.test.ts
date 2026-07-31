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

  it('admin role includes rating tab first', () => {
    const perms = permissionsFromDefaults('admin');
    const tabs = computeAllowedTabs('admin', perms);
    assert.equal(tabs[0], 'rating');
    assert.ok(tabs.includes('forum'));
    assert.ok(tabs.includes('admins'));
  });

  it('director and moderator roles include rating tab', () => {
    for (const role of ['director', 'moderator'] as const) {
      const tabs = computeAllowedTabs(role, permissionsFromDefaults(role));
      assert.ok(tabs.includes('rating'), `${role} should see rating`);
    }
  });

  it('moderator and gamification can update levels for revoke', () => {
    const mod = permissionsFromDefaults('moderator');
    const gam = permissionsFromDefaults('gamification');
    assert.equal(mod.levels.canUpdate, true);
    assert.equal(gam.levels.canUpdate, true);
  });
});
