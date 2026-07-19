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

export interface ParsedSwapCommand {
  amount: string;
  fromSymbol: string;
  toSymbol: string;
}

// "swap 0.5 eth to GOOGL" / "swap 10 GOOGL to usdg" -- same "to" preposition
// as plainly's own swap phrasing, so the two products read the same way.
// Symbol validity (must resolve on the ETH/USDG/RWA allowlist, must differ)
// is deliberately left to the caller, same division of labor as the send
// grammar above leaves target resolution to targetResolver.ts.
const SWAP_PATTERN = /swap\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]{1,10})\s+to\s+([a-zA-Z]{1,10})/i;

// "buy 10 NVDA with 0.5 eth" / "buy SPCX with 130 USDG" -- the leading share
// count, if given, is descriptive only and never authoritative: every swap
// this engine executes is exact-INPUT (see swapExecution.ts), so there's no
// way to promise "exactly N shares out" the way a limit/exact-output order
// could. The amount that actually sizes the trade is always the one after
// "with". The real expected output is shown in the dashboard before the
// user ever signs anything, so an optimistic share count here can't cause a
// surprise spend -- only a surprise (fully disclosed, pre-signature) fill.
const BUY_PATTERN =
  /buy\s+(?:[0-9]*\.?[0-9]+\s+)?([a-zA-Z]{1,10})\s+with\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]{1,10})/i;

export function parseSwapCommand(rawText: string): ParsedSwapCommand | null {
  const swapMatch = rawText.match(SWAP_PATTERN);
  if (swapMatch) {
    const [, amount, fromSymbol, toSymbol] = swapMatch;
    return { amount, fromSymbol: fromSymbol.toUpperCase(), toSymbol: toSymbol.toUpperCase() };
  }

  const buyMatch = rawText.match(BUY_PATTERN);
  if (buyMatch) {
    const [, ticker, amount, currency] = buyMatch;
    return { amount, fromSymbol: currency.toUpperCase(), toSymbol: ticker.toUpperCase() };
  }

  return null;
}
