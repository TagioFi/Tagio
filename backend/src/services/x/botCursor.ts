import { pool } from "../../db/pool";

export async function getCursor(stream: "mentions" | "dms"): Promise<string | null> {
  const { rows } = await pool.query("SELECT last_seen_id FROM x_bot_cursor WHERE stream = $1", [stream]);
  return rows.length === 0 ? null : rows[0].last_seen_id;
}

export async function setCursor(stream: "mentions" | "dms", lastSeenId: string): Promise<void> {
  await pool.query(
    `INSERT INTO x_bot_cursor (stream, last_seen_id, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (stream) DO UPDATE SET last_seen_id = EXCLUDED.last_seen_id, updated_at = now()`,
    [stream, lastSeenId],
  );
}
