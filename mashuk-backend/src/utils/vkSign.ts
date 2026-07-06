import crypto from 'crypto';

export function buildSignedLaunchParams(
  vkUserId: number,
  appSecret: string,
  extra: Record<string, string> = {},
): string {
  const params: Record<string, string> = {
    vk_user_id: String(vkUserId),
    vk_app_id: extra.vk_app_id ?? '12345',
    vk_ts: extra.vk_ts ?? String(Math.floor(Date.now() / 1000)),
    ...extra,
  };
  delete params.sign;

  const sortedKeys = Object.keys(params)
    .filter(k => k.startsWith('vk_'))
    .sort();
  const signPayload = sortedKeys
    .map(k => `${k}=${encodeURIComponent(params[k] ?? '')}`)
    .join('&');
  const sign = crypto
    .createHmac('sha256', appSecret)
    .update(signPayload)
    .digest()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=$/, '');

  return new URLSearchParams({ ...params, sign }).toString();
}

export function verifyVkLaunchParams(
  launchParams: string,
  appSecret: string,
): { ok: true; vkUserId: number } | { ok: false; error: string } {
  try {
    const urlParams = new URLSearchParams(launchParams);
    const sign = urlParams.get('sign');
    if (!sign) return { ok: false, error: 'No sign found in params' };

    const ts = urlParams.get('vk_ts');
    if (ts) {
      const ageSec = Math.floor(Date.now() / 1000) - Number(ts);
      if (Number.isNaN(Number(ts)) || ageSec > 86400 || ageSec < -300) {
        return { ok: false, error: 'Expired launch params' };
      }
    }

    const queryParams: Record<string, string> = {};
    for (const [key, value] of urlParams.entries()) {
      if (key.startsWith('vk_')) queryParams[key] = value;
    }

    const sortedKeys = Object.keys(queryParams).sort();
    const signPayload = sortedKeys
      .map(key => `${key}=${encodeURIComponent(queryParams[key] ?? '')}`)
      .join('&');
    const hash = crypto
      .createHmac('sha256', appSecret)
      .update(signPayload)
      .digest()
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=$/, '');

    if (hash !== sign) return { ok: false, error: 'Invalid sign' };

    const vkUserId = Number(queryParams['vk_user_id']);
    if (!vkUserId) return { ok: false, error: 'Missing vk_user_id' };
    return { ok: true, vkUserId };
  } catch {
    return { ok: false, error: 'Failed to parse params' };
  }
}
