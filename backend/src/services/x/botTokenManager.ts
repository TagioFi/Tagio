import { pool } from "../../db/pool";
import { config } from "../../config";
import { refreshAccessToken } from "./oauth";

interface StoredBotToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 minutes before actual expiry

async function getStoredToken(): Promise<StoredBotToken | null> {
  const { rows } = await pool.query(
    "SELECT access_token, refresh_token, expires_at FROM x_bot_token WHERE id = 1",
  );
  if (rows.length === 0) return null;
  return {
    accessToken: rows[0].access_token,
    refreshToken: rows[0].refresh_token,
    expiresAt: new Date(rows[0].expires_at),
  };
}

async function saveToken(accessToken: string, refreshToken: string, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO x_bot_token (id, access_token, refresh_token, expires_at, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()`,
    [accessToken, refreshToken, expiresAt],
  );
}

// Returns a live access token for the bot's own X account, refreshing (and
// persisting the newly-rotated refresh token) whenever the current one is
// missing or close to expiry. First-ever call has no known expiry for the
// seeded .env token, so it forces an immediate refresh to establish one.
export async function getValidBotAccessToken(): Promise<string> {
  const stored = (await getStoredToken()) ?? {
    accessToken: config.x.botAccessTokenSeed,
    refreshToken: config.x.botRefreshTokenSeed,
    expiresAt: new Date(0),
  };

  if (Date.now() <= stored.expiresAt.getTime() - REFRESH_MARGIN_MS) {
    return stored.accessToken;
  }

  const refreshed = await refreshAccessToken(stored.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  const newRefreshToken = refreshed.refresh_token ?? stored.refreshToken;
  await saveToken(refreshed.access_token, newRefreshToken, expiresAt);
  return refreshed.access_token;
}
