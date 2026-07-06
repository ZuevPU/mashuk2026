import type { Express } from 'express';
import request from 'supertest';
import assert from 'node:assert/strict';

export async function getAdminBearerToken(app: Express): Promise<string> {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ login: 'zuev', password: 'ZuevPu26' });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.token);
  return res.body.token as string;
}
