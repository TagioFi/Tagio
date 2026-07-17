// Deterministic, keyword-triggered command parsing -- intentionally not an LLM/AI
// reply bot. X's automation rules require prior written approval for "AI reply
// bots" that generate dynamic responses; a fixed regex parser with templated
// replies stays clearly out of that category.

export type BotToken = "native" | "usdg";
export type BotTargetType = "hashtag" | "wallet" | "x_account";

export interface ParsedCommand {
  amount: string;
  token: BotToken;
  targetType: BotTargetType;
  targetValue: string;
}

const COMMAND_PATTERN =
  /send\s+([0-9]*\.?[0-9]+)\s+(eth|usdg)\s+to\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})/i;

export function parseCommand(rawText: string): ParsedCommand | null {
  const match = rawText.match(COMMAND_PATTERN);
  if (!match) return null;

  const [, amount, tokenRaw, targetRaw] = match;
  const token: BotToken = tokenRaw.toLowerCase() === "eth" ? "native" : "usdg";

  if (targetRaw.startsWith("@")) {
    return { amount, token, targetType: "x_account", targetValue: targetRaw.slice(1) };
  }
  if (targetRaw.startsWith("#")) {
    return { amount, token, targetType: "hashtag", targetValue: targetRaw.slice(1).toLowerCase() };
  }
  return { amount, token, targetType: "wallet", targetValue: targetRaw };
}
