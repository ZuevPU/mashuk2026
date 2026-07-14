import crypto from 'crypto';

/** Генерация токена для QR deep-link */
export function generateQrToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function buildTaskQrUrl(baseUrl: string, taskId: number, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#/tasks?task=${taskId}&qr=${token}`;
}

export function buildEventQrUrl(baseUrl: string, eventId: number, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#/program?event=${eventId}&qr=${token}`;
}

export function buildParticipantQrUrl(baseUrl: string, participantId: number, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#/volunteer?p=${participantId}&qr=${token}`;
}
