import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function extractParticipantQrToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const fromHash = (hashPart: string): string | null => {
    const qIdx = hashPart.indexOf('?');
    const query = qIdx >= 0 ? hashPart.slice(qIdx + 1) : '';
    if (!query) return null;
    return new URLSearchParams(query).get('qr');
  };
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const from = fromHash(trimmed.slice(hashIdx + 1));
    if (from) return from;
  }
  const m = trimmed.match(/[?&]qr=([^&\s#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return trimmed;
}

function extractTaskIdFromInput(input: string): string | null {
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

function parseTaskQrScan(raw: string): { taskId: number; qrToken: string } | null {
  const qrToken = extractParticipantQrToken(raw);
  const taskIdStr = extractTaskIdFromInput(raw);
  if (!qrToken || !taskIdStr) return null;
  const taskId = Number(taskIdStr);
  if (!Number.isFinite(taskId) || taskId <= 0) return null;
  return { taskId, qrToken };
}

describe('parseTaskQrScan', () => {
  it('parses task deep link', () => {
    const raw = 'https://app.example.com/#/tasks?task=42&qr=abc123';
    assert.deepEqual(parseTaskQrScan(raw), { taskId: 42, qrToken: 'abc123' });
  });
});
