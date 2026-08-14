import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultForumWrapConfig,
  isForumWrapOpen,
  resolveForumWrapConfig,
} from '../services/forumWrapQuestionnaire.js';

describe('forumWrapQuestionnaire', () => {
  it('strips tomorrow-role and keeps wrap copy', () => {
    const cfg = defaultForumWrapConfig();
    assert.ok(cfg.steps.length > 0);
    assert.equal(cfg.opensAtMsk, '10:00');
    assert.ok(!cfg.steps.some(s => s.fields.some(f => f.type === 'role_select')));
    const thesis = cfg.steps.flatMap(s => s.fields).find(f => f.key === 'mainThesis');
    assert.match(thesis?.label || '', /форума/i);
  });

  it('uses stored config when steps exist', () => {
    const stored = defaultForumWrapConfig();
    stored.opensAtMsk = '18:30';
    const resolved = resolveForumWrapConfig({ forumWrapQuestionnaireConfig: stored });
    assert.equal(resolved.opensAtMsk, '18:30');
  });

  it('falls back to default when config is empty', () => {
    const resolved = resolveForumWrapConfig({ forumWrapQuestionnaireConfig: { steps: [] } });
    assert.ok(resolved.steps.length > 0);
  });

  it('opens when force-published', () => {
    const now = new Date('2026-08-14T06:00:00Z');
    const cfg = defaultForumWrapConfig();
    cfg.forcePublished = true;
    cfg.forcePublishedAt = now.toISOString();
    assert.equal(isForumWrapOpen(cfg, now), true);
  });
});
