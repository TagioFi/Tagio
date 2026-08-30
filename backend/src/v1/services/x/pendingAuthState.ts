import { redis } from "../../lib/redisClient";

const STATE_TTL_SECONDS = 15 * 60;

export interface PendingAuthState {
  walletAddress: string;
  codeVerifier: string;
}

const memoryStore = new Map<string, { value: PendingAuthState; expiresAt: number }>();

function key(state: string): string {
  return `x_oauth_state:${state}`;
}

export async function storePendingAuthState(state: string, data: PendingAuthState): Promise<void> {
  if (redis) {
    await redis.set(key(state), JSON.stringify(data), "EX", STATE_TTL_SECONDS);
    return;
  }
  memoryStore.set(key(state), { value: data, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 });
}

// One-time read: the state is consumed and deleted so a callback URL can't be replayed.
export async function consumePendingAuthState(state: string): Promise<PendingAuthState | null> {
  if (redis) {
    const raw = await redis.get(key(state));
    if (!raw) return null;
    await redis.del(key(state));
    return JSON.parse(raw) as PendingAuthState;
  }

  const entry = memoryStore.get(key(state));
  memoryStore.delete(key(state));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.value;
}
