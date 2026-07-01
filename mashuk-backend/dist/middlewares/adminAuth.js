import { env } from '../config/env.js';
export const adminAuthMiddleware = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (token !== env.ADMIN_SECRET) {
        res.status(401).json({ error: 'Unauthorized admin' });
        return;
    }
    req.isAdmin = true;
    next();
};
