import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceKey } from '../services/qrService.js';

describe('buildDeviceKey', () => {
  it('is stable for same client install id', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'abc' });
    const b = buildDeviceKey({ ip: '9.9.9.9', userAgent: 'other', clientDeviceKey: 'abc' });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it('changes when client device key changes', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'abc' });
    const b = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'xyz' });
    assert.notEqual(a, b);
  });

  it('does not collapse unknown-device clients on the same NAT', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'unknown-device' });
    const b = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: 'unknown-device' });
    assert.notEqual(a, b);
  });

  it('does not collapse missing client keys on the same NAT', () => {
    const a = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: null });
    const b = buildDeviceKey({ ip: '1.2.3.4', userAgent: 'vk', clientDeviceKey: '' });
    assert.notEqual(a, b);
  });
});
