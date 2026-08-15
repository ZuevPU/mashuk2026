import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceImageUrlList,
  extractUploadFilename,
  isOwnUploadUrl,
  resolveStoredUploadUrl,
  saveUploadedImage,
  toStoredUploadPath,
  UploadImageError,
  publicUploadBaseUrl,
} from '../utils/uploadImageStorage.js';
import { TINY_PNG_DATA_URL } from './fixtures/tinyPng.js';
import fs from 'fs';
import path from 'path';

describe('uploadImageStorage', () => {
  it('accepts tiny png dataUrl and writes under uploads/', async () => {
    const url = await saveUploadedImage(TINY_PNG_DATA_URL);
    assert.ok(url.includes('/uploads/'));
    assert.ok(isOwnUploadUrl(url));
    const name = url.split('/uploads/')[1];
    const filePath = path.join(process.cwd(), 'uploads', name);
    assert.ok(fs.existsSync(filePath));
    fs.unlinkSync(filePath);
  });

  it('rejects non-image mime', async () => {
    await assert.rejects(
      () => saveUploadedImage('data:image/svg+xml;base64,PHN2Zy8+'),
      (err: unknown) => err instanceof UploadImageError,
    );
  });

  it('isOwnUploadUrl only allows our uploads path', () => {
    const base = publicUploadBaseUrl();
    assert.equal(isOwnUploadUrl(`${base}/uploads/abc.jpg`), true);
    assert.equal(isOwnUploadUrl('https://example.com/uploads/abc.jpg'), false);
    assert.equal(isOwnUploadUrl(`${base}/api/secret`), false);
  });

  it('rewrites /api/uploads and json-shaped image lists', () => {
    assert.equal(extractUploadFilename('https://host.example/api/uploads/uuid-file.jpg'), 'uuid-file.jpg');
    assert.equal(extractUploadFilename('/uploads/uuid-file.jpg'), 'uuid-file.jpg');
    const resolved = resolveStoredUploadUrl('https://old.example/api/uploads/uuid-file.jpg');
    assert.ok(resolved.endsWith('/uploads/uuid-file.jpg'));
    assert.equal(toStoredUploadPath(resolved), '/uploads/uuid-file.jpg');
    const list = coerceImageUrlList('["/uploads/a.jpg","https://x.test/api/uploads/a.jpg"]');
    assert.equal(list.length, 1);
    assert.ok(list[0].endsWith('/uploads/a.jpg'));
  });

  it('keeps inline data-image URLs for home-notice photos', () => {
    const data = 'data:image/jpeg;base64,/9j/4AAQ';
    const list = coerceImageUrlList([data, '/uploads/a.jpg']);
    assert.equal(list[0], data);
    assert.ok(list[1].endsWith('/uploads/a.jpg'));
  });
});
