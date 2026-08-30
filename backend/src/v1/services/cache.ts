import { redis } from "../lib/redisClient";

const RESOLVE_TTL_SECONDS = 60;

// In-process fallback so resolution caching still works with no Redis configured
// (e.g. local dev, or a single-instance deploy). Lost on restart, not shared
// across instances — swap REDIS_URL in once the service is multi-instance.
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function getCachedResolution(hashtag: string): Promise<string | null> {
  const key = `resolve:${hashtag}`;
  if (redis) return redis.get(key);
  return memoryGet(key);
}

export async function setCachedResolution(hashtag: string, payload: unknown): Promise<void> {
  const key = `resolve:${hashtag}`;
  const value = JSON.stringify(payload);
  if (redis) {
    await redis.set(key, value, "EX", RESOLVE_TTL_SECONDS);
    return;
  }
  memorySet(key, value, RESOLVE_TTL_SECONDS);
}
