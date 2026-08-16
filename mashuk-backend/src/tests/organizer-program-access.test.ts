import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { createAdminToken } from '../utils/adminToken.js';
import { resolveTestAdminShiftId } from './adminTestHelper.js';
import { db } from '../db/index.js';
import { events } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  buildDefaultPermissionRows,
  type SectionPermissions,
} from '../services/adminPermissionsDefaults.js';

function permissionsFromDefaults(role: string): Record<string, SectionPermissions> {
  const rows = buildDefaultPermissionRows().filter(r => r.role === role);
  const out: Record<string, SectionPermissions> = {};
  for (const row of rows) {
    out[row.section] = {
      canRead: row.canRead,
      canCreate: row.canCreate,
      canUpdate: row.canUpdate,
      canDelete: row.canDelete,
      canConfirm: row.canConfirm,
      canExport: row.canExport,
    };
  }
  return out;
}

describe('organizer program access', () => {
  it('defaults allow program create/update and deny settings-only actions', () => {
    const perms = permissionsFromDefaults('organizer');
    assert.equal(perms.events.canCreate, true);
    assert.equal(perms.events.canUpdate, true);
    assert.equal(perms.events.canDelete, false);
    assert.equal(perms.push.canCreate, false);
    assert.equal(perms.knowledge.canUpdate, true);
  });
});

describe('organizer program HTTP', { skip: !process.env.DATABASE_URL }, () => {
  const app = createApp();

  async function organizerAuth(): Promise<Record<string, string>> {
    const token = createAdminToken(91001, 'organizer-test', 'organizer');
    const shiftId = await resolveTestAdminShiftId(app, token);
    return {
      Authorization: `Bearer ${token}`,
      'X-Admin-Shift-Id': String(shiftId),
    };
  }

  it('can create an event and cannot send push or open KB for everyone', async () => {
    const auth = await organizerAuth();
    const created = await request(app)
      .post('/api/admin/events')
      .set(auth)
      .send({ title: 'P1 organizer event', dayNumber: 2, isPublished: false });
    assert.notEqual(created.status, 403, created.text);
    assert.ok([200, 201].includes(created.status), created.text);
    const eventId = Number(created.body.event?.id);
    if (eventId > 0) {
      await db.delete(events).where(eq(events.id, eventId));
    }

    const push = await request(app)
      .post('/api/admin/push/send')
      .set(auth)
      .send({ text: 'should not send' });
    assert.equal(push.status, 403);

    const kb = await request(app)
      .post('/api/admin/kb/open-shift')
      .set(auth)
      .send({});
    assert.equal(kb.status, 403);
  });
});
