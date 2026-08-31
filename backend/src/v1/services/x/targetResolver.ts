import { pool } from "../../../db/pool";
import { getWalletByXHandle } from "./xAccountService";
import type { ParsedCommand } from "./commandParser";

// Only targetType/targetValue are ever read here -- relaxed to a Pick so
// callers that don't have a full ParsedCommand (e.g. the dashboard's
// directly-JSON-posted private-send recipient, not parsed from bot-command
// text at all) can reuse this without fabricating unused amount/token fields.
export async function resolveTargetWallet(
  command: Pick<ParsedCommand, "targetType" | "targetValue">,
): Promise<`0x${string}` | null> {
  switch (command.targetType) {
    case "wallet":
      return command.targetValue as `0x${string}`;

    case "hashtag": {
      // 1. Check v2 handles first
      const v2Res = await pool.query(
        "SELECT owner_wallet FROM v2_handles WHERE LOWER(handle) = LOWER($1)",
        [command.targetValue.toLowerCase()]
      );
      if (v2Res.rows.length > 0) {
        return v2Res.rows[0].owner_wallet as `0x${string}`;
      }

      // 2. Check legacy v1 hashtags
      const { rows } = await pool.query(
        "SELECT owner_wallet FROM hashtags WHERE hashtag = $1 AND active = true",
        [command.targetValue],
      );
      return rows.length === 0 ? null : (rows[0].owner_wallet as `0x${string}`);
    }

    case "x_account": {
      // 1. Check v2 handles (by linked X handle or tag name directly)
      const v2Res = await pool.query(
        "SELECT owner_wallet FROM v2_handles WHERE LOWER(x_handle) = LOWER($1) OR LOWER(handle) = LOWER($1) LIMIT 1",
        [command.targetValue.toLowerCase()]
      );
      if (v2Res.rows.length > 0) {
        return v2Res.rows[0].owner_wallet as `0x${string}`;
      }

      // 2. Check v2_wallet_identities
      const idRes = await pool.query(
        "SELECT wallet_address FROM v2_wallet_identities WHERE LOWER(x_handle) = LOWER($1) LIMIT 1",
        [command.targetValue.toLowerCase()]
      );
      if (idRes.rows.length > 0) {
        return idRes.rows[0].wallet_address as `0x${string}`;
      }

      // 3. Check legacy x_accounts
      return (await getWalletByXHandle(command.targetValue)) as `0x${string}` | null;
    }
  }
}
