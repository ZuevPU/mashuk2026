import { env } from '../config/env.js';
import { verifyVkLaunchParams } from '../utils/vkSign.js';
export const vkAuthMiddleware = (req, res, next) => {
    // Локальная разработка (если включен SKIP_VK_SIGN)
    if (env.SKIP_VK_SIGN) {
        const testVkId = req.headers['x-test-vk-id'];
        req.vkUserId = testVkId ? Number(testVkId) : 1;
        return next();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No Bearer token provided' });
        return;
    }
    const vkLaunchParams = authHeader.split(' ')[1];
    const verified = verifyVkLaunchParams(vkLaunchParams, env.VK_APP_SECRET);
    if (!verified.ok) {
        res.status(401).json({ error: `Unauthorized: ${verified.error}` });
        return;
    }
    req.vkUserId = verified.vkUserId;
    next();
};
