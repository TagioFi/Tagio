import Redis from "ioredis";
import { config } from "../config";

const redis = config.redisUrl ? new Redis(config.redisUrl) : null;

const RESOLVE_TTL_SECONDS = 60;

export async function getCachedResolution(hashtag: string): Promise<string | null> {
  if (!redis) return null;
  return redis.get(`resolve:${hashtag}`);
}

export async function setCachedResolution(hashtag: string, payload: unknown): Promise<void> {
  if (!redis) return;
  await redis.set(`resolve:${hashtag}`, JSON.stringify(payload), "EX", RESOLVE_TTL_SECONDS);
}
