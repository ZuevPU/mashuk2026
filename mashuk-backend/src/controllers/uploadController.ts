import { Response } from 'express';
import { env } from '../config/env.js';
import { ParticipantRequest } from '../middlewares/requireParticipant.js';
import { AdminRequest } from '../middlewares/adminAuth.js';
import { saveUploadedImage, ensureUploadDir, publicUploadUrl } from '../utils/uploadImageStorage.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_ADMIN_FILE_BYTES = 100 * 1024 * 1024;

export const uploadPhoto = async (req: ParticipantRequest, res: Response): Promise<void> => {
  try {
    const { dataUrl, photoUrl } = req.body as { dataUrl?: string; photoUrl?: string };

    if (photoUrl && /^https?:\/\//.test(photoUrl)) {
      res.json({ url: photoUrl });
      return;
    }

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Expected dataUrl (base64 image) or photoUrl' });
      return;
    }

    const url = await saveUploadedImage(dataUrl);
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

export const uploadAdminFile = async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const { dataUrl, filename: suggestedName } = req.body as { dataUrl?: string; filename?: string };
    const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Expected dataUrl (base64) with mime type' });
      return;
    }
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_ADMIN_FILE_BYTES) {
      res.status(400).json({ error: 'File too large (max 100MB)' });
      return;
    }
    ensureUploadDir();
    const extFromMime = mime.includes('pdf') ? 'pdf'
      : mime.includes('zip') ? 'zip'
        : mime.includes('presentation') ? 'pptx'
          : mime.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const safeBase = (suggestedName || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const filename = `${crypto.randomUUID()}-${safeBase.includes('.') ? safeBase : `${safeBase}.${extFromMime}`}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    const url = publicUploadUrl(filename);
    res.json({ url, fileUrl: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};
