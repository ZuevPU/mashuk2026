import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlaceholderDisplayName,
  pickPersonName,
  sanitizePersonName,
} from '../services/participantName.js';

describe('participantName', () => {
  it('detects the registration fallback name', () => {
    assert.equal(isPlaceholderDisplayName('Тест', 'Пользователь'), true);
    assert.equal(isPlaceholderDisplayName('тест', 'пользователь'), true);
    assert.equal(isPlaceholderDisplayName('Анна', 'Иванова'), false);
    assert.equal(isPlaceholderDisplayName('', ''), false);
  });

  it('prefers VK names over the client placeholder', () => {
    const picked = pickPersonName({
      vkFirstName: 'Мария',
      vkLastName: 'Соколова',
      clientFirstName: 'Тест',
      clientLastName: 'Пользователь',
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.firstName, 'Мария');
    assert.equal(picked.lastName, 'Соколова');
  });

  it('keeps a real client name when VK is empty', () => {
    const picked = pickPersonName({
      clientFirstName: 'E2E',
      clientLastName: 'User',
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.firstName, 'E2E');
    assert.equal(picked.lastName, 'User');
  });

  it('rejects placeholder when VK is also empty', () => {
    const picked = pickPersonName({
      clientFirstName: 'Тест',
      clientLastName: 'Пользователь',
    });
    assert.equal(picked.ok, false);
    assert.equal(picked.firstName, '');
    assert.equal(picked.lastName, '');
  });

  it('trims person names', () => {
    assert.equal(sanitizePersonName('  Анна  '), 'Анна');
  });
});
