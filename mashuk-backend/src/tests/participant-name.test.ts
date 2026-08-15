import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasCyrillicScript,
  isLatinOnlyPersonName,
  isPlaceholderDisplayName,
  needsVkDisplayNameHeal,
  parseEditablePersonName,
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

  it('accepts a real name for profile edit', () => {
    const parsed = parseEditablePersonName('  Анна-Мария ', 'О’Коннор');
    assert.equal('firstName' in parsed, true);
    if ('firstName' in parsed) {
      assert.equal(parsed.firstName, 'Анна-Мария');
      assert.equal(parsed.lastName, 'О’Коннор');
    }
  });

  it('rejects placeholder and empty names on edit', () => {
    assert.equal('error' in parseEditablePersonName('Тест', 'Пользователь'), true);
    assert.equal('error' in parseEditablePersonName('', 'Иванов'), true);
    assert.equal('error' in parseEditablePersonName('Анна', '123'), true);
  });

  it('detects Latin-only VK names like Petr Zuev', () => {
    assert.equal(isLatinOnlyPersonName('Petr', 'Zuev'), true);
    assert.equal(isLatinOnlyPersonName('Пётр', 'Зуев'), false);
    assert.equal(isLatinOnlyPersonName('Петр', 'Зуев'), false);
    assert.equal(isLatinOnlyPersonName('Тест', 'Пользователь'), false);
    assert.equal(hasCyrillicScript('Зуев'), true);
    assert.equal(hasCyrillicScript('Zuev'), false);
    assert.equal(needsVkDisplayNameHeal('Petr', 'Zuev'), true);
    assert.equal(needsVkDisplayNameHeal('Пётр', 'Зуев'), false);
  });

  it('prefers the Russian VK name over a Latin registration name', () => {
    const picked = pickPersonName({
      vkFirstName: 'Пётр',
      vkLastName: 'Зуев',
      clientFirstName: 'Petr',
      clientLastName: 'Zuev',
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.firstName, 'Пётр');
    assert.equal(picked.lastName, 'Зуев');
  });

  it('keeps a Cyrillic client name when VK only has Latin', () => {
    const picked = pickPersonName({
      vkFirstName: 'Petr',
      vkLastName: 'Zuev',
      clientFirstName: 'Пётр',
      clientLastName: 'Зуев',
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.firstName, 'Пётр');
    assert.equal(picked.lastName, 'Зуев');
  });
});
