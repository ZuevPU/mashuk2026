import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceKey } from '../services/qrService.js';

describe('buildDeviceKey', () => {
  it('is stable for same inputs', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'abc' });
    const b = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'abc' });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it('changes when client device key changes', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'abc' });
    const b = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'xyz' });
    assert.notEqual(a, b);
  });
});
