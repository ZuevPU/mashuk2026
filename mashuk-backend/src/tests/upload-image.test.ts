import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOwnUploadUrl,
  saveUploadedImage,
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
});
