import { env } from '../config/env.js';

const VK_API = 'https://api.vk.com/method';
const VK_VERSION = '5.199';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { url: string | null; at: number };
const avatarCache = new Map<number, CacheEntry>();

function vkToken(): string | null {
  return env.VK_SERVICE_TOKEN || env.VK_COMMUNITY_TOKEN || null;
}

async function vkUsersGet(userIds: string, token: string): Promise<{ photo_100?: string; photo_200?: string } | null> {
  const qs = new URLSearchParams({
    user_ids: userIds,
    fields: 'photo_100,photo_200',
    access_token: token,
    v: VK_VERSION,
  });
  const res = await fetch(`${VK_API}/users.get?${qs}`);
  const data = await res.json() as {
    error?: { error_msg: string };
    response?: { photo_100?: string; photo_200?: string }[];
  };
  if (data.error || !data.response?.[0]) return null;
  return data.response[0];
}

/** VK avatar URL for admin participant card (cached 24h). */
export async function fetchVkAvatarUrl(vkId: number | null | undefined): Promise<string | null> {
  if (vkId == null || !Number.isFinite(vkId) || vkId <= 0) return null;
  const cached = avatarCache.get(vkId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.url;

  const token = vkToken();
  if (!token) {
    avatarCache.set(vkId, { url: null, at: Date.now() });
    return null;
  }

  try {
    const user = await vkUsersGet(String(vkId), token);
    const url = user?.photo_200 || user?.photo_100 || null;
    avatarCache.set(vkId, { url, at: Date.now() });
    return url;
  } catch {
    avatarCache.set(vkId, { url: null, at: Date.now() });
    return null;
  }
}
