import { pool } from "../../db/pool";
import { getWalletByXHandle } from "./xAccountService";
import type { ParsedCommand } from "./commandParser";

export async function resolveTargetWallet(command: ParsedCommand): Promise<`0x${string}` | null> {
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
