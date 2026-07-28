/**
 * Backfill mirrored avatars for participants without avatar_url.
 * Run: npm run sync-avatars (from mashuk-backend)
 */
import 'dotenv/config';
import { isNull, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { syncParticipantAvatar } from '../services/participantAvatarSync.js';

const LIMIT = Number(process.env.AVATAR_SYNC_LIMIT || 500);

async function main() {
  const rows = await db.select({ id: participants.id })
    .from(participants)
    .where(and(isNull(participants.avatarUrl), isNull(participants.selfDeletedAt)))
    .limit(LIMIT);

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    const url = await syncParticipantAvatar(r.id, { force: true });
    if (url) ok += 1;
    else fail += 1;
  }
  console.log(`sync-avatars: total=${rows.length} mirrored=${ok} empty=${fail}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
