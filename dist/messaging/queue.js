/**
 * Message queue factory - creates appropriate queue implementation
 */
import { RedisQueue } from './redis-queue.js';
import { MemoryQueue } from './memory-queue.js';
import { logger } from '../utils/logger.js';
/**
 * Create message queue instance
 * Uses Redis if CODEX_REDIS_URL is set, otherwise falls back to in-memory queue
 */
export function createMessageQueue() {
    const redisUrl = process.env.CODEX_REDIS_URL;
    if (redisUrl) {
        logger.info('QueueFactory', 'Creating Redis queue', { redisUrl });
        return new RedisQueue(redisUrl);
    }
    logger.info('QueueFactory', 'Creating in-memory queue (Redis not configured)');
    return new MemoryQueue();
}
/**
 * Check if Redis is available
 */
export async function isRedisAvailable(redisUrl) {
    const url = redisUrl || process.env.CODEX_REDIS_URL;
    if (!url) {
        return false;
    }
    try {
        const ioredis = await import('ioredis');
        // In ESM, the default export is the Redis constructor
        const Redis = ioredis.default || ioredis;
        const client = new Redis(url);
        await client.ping();
        await client.quit();
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=queue.js.map