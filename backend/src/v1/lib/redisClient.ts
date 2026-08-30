import Redis from "ioredis";
import { config } from "../../config";

// Shared across cache.ts and the X OAuth pending-state store, so we don't open
// multiple Redis connections for the same process. Null when REDIS_URL is unset
// (local dev) -- callers fall back to an in-process store.
export const redis = config.redisUrl ? new Redis(config.redisUrl) : null;
