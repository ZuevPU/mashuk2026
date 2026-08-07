import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedVkPhotoUrl,
  isBrowserReachableAvatarUrl,
  normalizeStoredAvatarUrl,
  pickParticipantAvatarUrl,
} from '../services/participantAvatarSync.js';

describe('participantAvatarSync', () => {
  it('allows VK CDN photo URLs', () => {
    assert.equal(isAllowedVkPhotoUrl('https://sun9-88.userapi.com/impg/example.jpg'), true);
    assert.equal(isAllowedVkPhotoUrl('https://vk.com/images/camera_200.png'), true);
  });

  it('rejects non-VK hosts', () => {
    assert.equal(isAllowedVkPhotoUrl('https://example.com/a.jpg'), false);
    assert.equal(isAllowedVkPhotoUrl('http://sun9.userapi.com/x.jpg'), false);
  });

  it('skips localhost mirrors so VK photo can be used', () => {
    assert.equal(isBrowserReachableAvatarUrl('http://localhost:8080/uploads/a.jpg'), false);
    const vk = 'https://sun9-88.userapi.com/impg/x.jpg';
    assert.equal(
      pickParticipantAvatarUrl({
        stored: 'http://localhost:8080/uploads/a.jpg',
        vk,
        preferStored: true,
      }),
      vk,
    );
  });

  it('rewrites relative uploads path', () => {
    const n = normalizeStoredAvatarUrl('/uploads/abc.jpg');
    assert.ok(n?.endsWith('/uploads/abc.jpg'));
  });
});
