import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { participants } from '../db/schema.js';
import { fetchVkAvatarUrl, batchFetchVkAvatarUrls } from './vkUserProfile.js';
import { publicUploadUrl, saveImageBuffer } from '../utils/uploadImageStorage.js';

const MAX_AVATAR_BYTES = 512 * 1024;
const RESYNC_MS = 24 * 60 * 60 * 1000;

const VK_PHOTO_HOST = /^(.*\.)?(userapi\.com|vk\.com|vkuserphoto\.ru)$/i;

export function isAllowedVkPhotoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return VK_PHOTO_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/** Rewrite /uploads/… to current PUBLIC_URL; drop unusable values. */
export function normalizeStoredAvatarUrl(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  const raw = stored.trim();
  try {
    const u = new URL(raw);
    const marker = '/uploads/';
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const name = u.pathname.slice(idx + marker.length);
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
      return publicUploadUrl(name);
    }
    return raw;
  } catch {
    if (raw.startsWith('/uploads/')) {
      const name = raw.slice('/uploads/'.length);
      if (/^[a-zA-Z0-9._-]+$/.test(name)) return publicUploadUrl(name);
    }
    return null;
  }
}

/** URLs the admin browser can load (not localhost mirrors from a remote admin host). */
export function isBrowserReachableAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export function pickParticipantAvatarUrl(opts: {
  stored?: string | null;
  vk?: string | null;
  preferStored?: boolean;
}): string | null {
  const normalized = normalizeStoredAvatarUrl(opts.stored);
  const stored = normalized && isBrowserReachableAvatarUrl(normalized) ? normalized : null;
  const vk = opts.vk?.trim() || null;
  if (opts.preferStored) return stored || vk;
  return vk || stored;
}

function extFromContentType(ct: string | null): string {
  if (!ct) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  return 'jpg';
}

async function mirrorUrlToParticipant(participantId: number, sourceUrl: string): Promise<string | null> {
  if (!isAllowedVkPhotoUrl(sourceUrl)) return null;
  const res = await fetch(sourceUrl, { redirect: 'follow' });
  if (!res.ok) return null;
  const ct = res.headers.get('content-type');
  if (ct && !ct.startsWith('image/')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) return null;
  const url = saveImageBuffer(buf, extFromContentType(ct));
  await db.update(participants)
    .set({ avatarUrl: url, avatarSyncedAt: new Date() })
    .where(eq(participants.id, participantId));
  return url;
}

/** Public URL for UI: VK photo for admin; mirrored file for mini-app fallback. */
export async function resolveParticipantAvatarUrl(
  p: { id: number; vkId: number | null; avatarUrl?: string | null; selfDeletedAt?: Date | null },
  opts?: { liveFallback?: boolean; preferVkPhoto?: boolean },
): Promise<string | null> {
  if (p.selfDeletedAt) return null;

  let vkUrl: string | null = null;
  if (opts?.liveFallback !== false && p.vkId) {
    vkUrl = await fetchVkAvatarUrl(p.vkId);
  }

  if (opts?.preferVkPhoto !== false && vkUrl) return vkUrl;
  if (p.avatarUrl) return p.avatarUrl;
  return vkUrl;
}

type ParticipantAvatarRow = {
  id: number;
  vkId: number | null;
  avatarUrl?: string | null;
  selfDeletedAt?: Date | null;
};

/** Batch VK photos + stored mirror. Skips localhost/broken mirrors so VK can win. */
export async function enrichParticipantsWithAvatarUrls<T extends ParticipantAvatarRow>(
  rows: T[],
  opts?: { preferStored?: boolean },
): Promise<(T & { avatarUrl: string | null })[]> {
  const active = rows.filter(r => !r.selfDeletedAt && r.vkId);
  const vkMap = await batchFetchVkAvatarUrls(active.map(r => r.vkId!));
  const preferStored = opts?.preferStored === true;

  return rows.map(r => {
    if (r.selfDeletedAt) return { ...r, avatarUrl: null };
    const vk = r.vkId ? vkMap.get(r.vkId) ?? null : null;
    const avatarUrl = pickParticipantAvatarUrl({
      stored: r.avatarUrl,
      vk,
      preferStored,
    });
    if (r.vkId && !normalizeStoredAvatarUrl(r.avatarUrl) && vk) {
      scheduleParticipantAvatarSync(r.id);
    }
    return { ...r, avatarUrl };
  });
}

export async function syncParticipantAvatar(
  participantId: number,
  opts?: { vkPhotoUrl?: string | null; force?: boolean },
): Promise<string | null> {
  const [p] = await db.select({
    id: participants.id,
    vkId: participants.vkId,
    avatarUrl: participants.avatarUrl,
    avatarSyncedAt: participants.avatarSyncedAt,
  }).from(participants).where(eq(participants.id, participantId)).limit(1);
  if (!p) return null;

  if (p.avatarUrl && !opts?.force) {
    if (p.avatarSyncedAt && Date.now() - p.avatarSyncedAt.getTime() < RESYNC_MS) {
      return p.avatarUrl;
    }
  }

  let source = opts?.vkPhotoUrl?.trim() || null;
  if (source && !isAllowedVkPhotoUrl(source)) source = null;
  if (!source && p.vkId) {
    source = await fetchVkAvatarUrl(p.vkId);
  }
  if (!source) return p.avatarUrl ?? null;

  try {
    return await mirrorUrlToParticipant(participantId, source);
  } catch (e) {
    console.warn('syncParticipantAvatar failed', participantId, e);
    return p.avatarUrl ?? null;
  }
}

export function scheduleParticipantAvatarSync(
  participantId: number,
  opts?: { vkPhotoUrl?: string | null },
): void {
  void syncParticipantAvatar(participantId, opts).catch(err => {
    console.warn('scheduleParticipantAvatarSync', participantId, err);
  });
}
