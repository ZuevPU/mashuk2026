import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
function ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}
export const uploadPhoto = async (req, res) => {
    try {
        const { dataUrl, photoUrl } = req.body;
        if (photoUrl && /^https?:\/\//.test(photoUrl)) {
            res.json({ url: photoUrl });
            return;
        }
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
            res.status(400).json({ error: 'Expected dataUrl (base64 image) or photoUrl' });
            return;
        }
        const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) {
            res.status(400).json({ error: 'Invalid dataUrl format' });
            return;
        }
        const ext = match[1].split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
            res.status(400).json({ error: 'Image too large (max 5MB)' });
            return;
        }
        ensureUploadDir();
        const filename = `${crypto.randomUUID()}.${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
        const baseUrl = env.PUBLIC_URL || `http://localhost:${env.PORT}`;
        res.json({ url: `${baseUrl}/uploads/${filename}` });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed' });
    }
};
