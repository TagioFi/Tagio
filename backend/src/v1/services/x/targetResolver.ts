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
      const { rows } = await pool.query(
        "SELECT owner_wallet FROM hashtags WHERE hashtag = $1 AND active = true",
        [command.targetValue],
      );
      return rows.length === 0 ? null : (rows[0].owner_wallet as `0x${string}`);
    }

    case "x_account":
      return (await getWalletByXHandle(command.targetValue)) as `0x${string}` | null;
  }
}
