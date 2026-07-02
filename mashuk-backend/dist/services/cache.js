import { LRUCache } from 'lru-cache';
export const cache = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 5, // 5 minutes
});
export function clearCache(keyPrefix) {
    if (!keyPrefix) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(keyPrefix)) {
            cache.delete(key);
        }
    }
}
