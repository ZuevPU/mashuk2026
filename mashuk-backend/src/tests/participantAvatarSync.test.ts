import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedVkPhotoUrl } from '../services/participantAvatarSync.js';

describe('participantAvatarSync', () => {
  it('allows VK CDN photo URLs', () => {
    assert.equal(isAllowedVkPhotoUrl('https://sun9-88.userapi.com/impg/example.jpg'), true);
    assert.equal(isAllowedVkPhotoUrl('https://vk.com/images/camera_200.png'), true);
  });

  it('rejects non-VK hosts', () => {
    assert.equal(isAllowedVkPhotoUrl('https://example.com/a.jpg'), false);
    assert.equal(isAllowedVkPhotoUrl('http://sun9.userapi.com/x.jpg'), false);
  });
});
