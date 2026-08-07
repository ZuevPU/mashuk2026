import { env } from '../config/env.js';

const VK_API = 'https://api.vk.com/method';
const VK_VERSION = '5.199';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { url: string | null; at: number };
const avatarCache = new Map<number, CacheEntry>();

type VkUserPhoto = { id?: number; photo_100?: string; photo_200?: string };

function vkToken(): string | null {
  return env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN || null;
}

function photoFromUser(u: VkUserPhoto): string | null {
  return u.photo_200 || u.photo_100 || null;
}

async function vkUsersGetMany(userIds: string, token: string): Promise<VkUserPhoto[]> {
  const qs = new URLSearchParams({
    user_ids: userIds,
    fields: 'photo_100,photo_200',
    access_token: token,
    v: VK_VERSION,
  });
  const res = await fetch(`${VK_API}/users.get?${qs}`);
  const data = await res.json() as {
    error?: { error_msg: string; error_code?: number };
    response?: VkUserPhoto[];
  };
  if (data.error) {
    console.warn('VK users.get avatars:', data.error.error_code, data.error.error_msg);
    return [];
  }
  if (!data.response?.length) return [];
  return data.response;
}

function cacheAvatar(vkId: number, url: string | null): void {
  avatarCache.set(vkId, { url, at: Date.now() });
}

/** VK avatar URL (cached 24h). */
export async function fetchVkAvatarUrl(vkId: number | null | undefined): Promise<string | null> {
  if (vkId == null || !Number.isFinite(vkId) || vkId <= 0) return null;
  const cached = avatarCache.get(vkId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.url;

  const token = vkToken();
  if (!token) return null;

  try {
    const users = await vkUsersGetMany(String(vkId), token);
    const url = users[0] ? photoFromUser(users[0]) : null;
    cacheAvatar(vkId, url);
    return url;
  } catch {
    cacheAvatar(vkId, null);
    return null;
  }
}

const BATCH_SIZE = 100;

/** Batch users.get for participant lists (admin). */
export async function batchFetchVkAvatarUrls(vkIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const token = vkToken();
  if (!token || vkIds.length === 0) return out;

  const unique = [...new Set(vkIds.filter(id => id > 0))];
  const needFetch: number[] = [];

  for (const id of unique) {
    const c = avatarCache.get(id);
    if (c && Date.now() - c.at < CACHE_TTL_MS && c.url) {
      out.set(id, c.url);
    } else {
      needFetch.push(id);
    }
  }

  for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
    const chunk = needFetch.slice(i, i + BATCH_SIZE);
    try {
      const users = await vkUsersGetMany(chunk.join(','), token);
      const byId = new Map<number, VkUserPhoto>();
      for (const u of users) {
        if (u.id != null) byId.set(u.id, u);
      }
      for (const id of chunk) {
        const url = photoFromUser(byId.get(id) ?? {});
        if (url) {
          cacheAvatar(id, url);
          out.set(id, url);
        } else {
          cacheAvatar(id, null);
        }
      }
    } catch {
      for (const id of chunk) {
        cacheAvatar(id, null);
      }
    }
  }

  return out;
}
