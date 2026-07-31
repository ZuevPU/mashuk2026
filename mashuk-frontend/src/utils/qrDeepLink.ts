/** Deep-link волонтёра: #/volunteer?qr=ТОКЕН&task=ID */

export function buildParticipantVolunteerUrl(qrToken: string, participantId?: number | null): string {
  const origin = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`
    : '';
  const params = new URLSearchParams();
  params.set('qr', qrToken);
  if (participantId) params.set('p', String(participantId));
  return `${origin}#/volunteer?${params.toString()}`;
}

/** Извлечь qr-токен из сырого токена или полной ссылки #/volunteer?qr=… */
export function extractParticipantQrToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const fromHash = (hashPart: string): string | null => {
    const qIdx = hashPart.indexOf('?');
    const query = qIdx >= 0 ? hashPart.slice(qIdx + 1) : '';
    if (!query) return null;
    const params = new URLSearchParams(query);
    return params.get('qr');
  };

  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const from = fromHash(trimmed.slice(hashIdx + 1));
    if (from) return from;
  }

  try {
    const u = new URL(trimmed);
    const qr = u.searchParams.get('qr');
    if (qr) return qr;
    if (u.hash) {
      const from = fromHash(u.hash.replace(/^#/, ''));
      if (from) return from;
    }
  } catch {
    /* raw token */
  }

  const m = trimmed.match(/[?&]qr=([^&\s#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);

  return trimmed;
}

/** Токен QR из ссылки задания (#/tasks?task=ID&qr=TOKEN) или сырой код */
export function extractTaskQrToken(input: string): string {
  return extractParticipantQrToken(input);
}

export function parseTaskQrScan(raw: string): { taskId: number; qrToken: string } | null {
  const qrToken = extractTaskQrToken(raw);
  const taskIdStr = extractTaskIdFromInput(raw);
  if (!qrToken || !taskIdStr) return null;
  const taskId = Number(taskIdStr);
  if (!Number.isFinite(taskId) || taskId <= 0) return null;
  return { taskId, qrToken };
}

export function extractTaskIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const after = trimmed.slice(hashIdx + 1);
    const qIdx = after.indexOf('?');
    if (qIdx >= 0) {
      const task = new URLSearchParams(after.slice(qIdx + 1)).get('task');
      if (task) return task;
    }
  }
  const m = trimmed.match(/[?&]task=(\d+)/i);
  return m?.[1] ?? null;
}

/** Парсинг QR события: #/program?event=ID&qr=TOKEN или vk.me?ref=event_ID_TOKEN */
export function parseEventQrScan(raw: string): { eventId: number; qrToken: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const refMatch = trimmed.match(/(?:[?&]ref=|\/)event_(\d+)_([a-f0-9]+)/i)
    || trimmed.match(/^event_(\d+)_([a-f0-9]+)$/i);
  if (refMatch) {
    const eventId = Number(refMatch[1]);
    if (Number.isFinite(eventId) && eventId > 0) {
      return { eventId, qrToken: refMatch[2] };
    }
  }

  const qrToken = extractParticipantQrToken(trimmed);
  let eventIdStr: string | null = null;
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const after = trimmed.slice(hashIdx + 1);
    const qIdx = after.indexOf('?');
    if (qIdx >= 0) {
      eventIdStr = new URLSearchParams(after.slice(qIdx + 1)).get('event');
    }
  }
  if (!eventIdStr) {
    const m = trimmed.match(/[?&]event=(\d+)/i);
    eventIdStr = m?.[1] ?? null;
  }
  if (!qrToken || !eventIdStr) return null;
  const eventId = Number(eventIdStr);
  if (!Number.isFinite(eventId) || eventId <= 0) return null;
  return { eventId, qrToken };
}
