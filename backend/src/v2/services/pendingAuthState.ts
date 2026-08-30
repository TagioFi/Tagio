import { redis } from "../../lib/redisClient";

export interface PendingV2AuthState {
  walletAddress: string;
  codeVerifier: string;
}

const PREFIX = "v2:auth:state:";
const TTL_SECONDS = 600; // 10 minutes

const memoryStore = new Map<string, { value: PendingV2AuthState; expiresAt: number }>();

export async function storePendingV2AuthState(state: string, data: PendingV2AuthState): Promise<void> {
  if (redis) {
    await redis.set(`${PREFIX}${state}`, JSON.stringify(data), "EX", TTL_SECONDS);
  } else {
    memoryStore.set(state, {
      value: data,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });
  }
}

export async function consumePendingV2AuthState(state: string): Promise<PendingV2AuthState | null> {
  if (redis) {
    const raw = await redis.get(`${PREFIX}${state}`);
    if (!raw) return null;
    await redis.del(`${PREFIX}${state}`);
    return JSON.parse(raw) as PendingV2AuthState;
  }

  const entry = memoryStore.get(state);
  if (!entry) return null;
  memoryStore.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry.value;
}
