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

// \$? tolerates "send $1 usdg to ..." -- a dollar-denominated stablecoin makes
// a literal "$" prefix on the amount an extremely natural typo/habit, not an
// edge case (confirmed live 2026-07-26: a real launch-eve mention with no bot
// reply at all, caused by exactly this gap).
const COMMAND_PATTERN_1 =
  /(?:send|pay|tip)\s+\$?([0-9]*\.?[0-9]+)\s+(eth|usdg)\s+to\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})/i;

const COMMAND_PATTERN_2 =
  /(?:send|pay|tip)\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})\s+\$?([0-9]*\.?[0-9]+)\s+(eth|usdg)/i;

export function parseCommand(rawText: string): ParsedCommand | null {
  let amount = "";
  let tokenRaw = "";
  let targetRaw = "";

  const match1 = rawText.match(COMMAND_PATTERN_1);
  if (match1) {
    [, amount, tokenRaw, targetRaw] = match1;
  } else {
    const match2 = rawText.match(COMMAND_PATTERN_2);
    if (!match2) return null;
    [, targetRaw, amount, tokenRaw] = match2;
  }

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
const SWAP_PATTERN = /swap\s+\$?([0-9]*\.?[0-9]+)\s+([a-zA-Z]{1,10})\s+to\s+([a-zA-Z]{1,10})/i;

// "buy 10 NVDA with 0.5 eth" / "buy SPCX with 130 USDG" -- the leading share
// count, if given, is descriptive only and never authoritative: every swap
// this engine executes is exact-INPUT (see swapExecution.ts), so there's no
// way to promise "exactly N shares out" the way a limit/exact-output order
// could. The amount that actually sizes the trade is always the one after
// "with". The real expected output is shown in the dashboard before the
// user ever signs anything, so an optimistic share count here can't cause a
// surprise spend -- only a surprise (fully disclosed, pre-signature) fill.
const BUY_PATTERN =
  /buy\s+(?:[0-9]*\.?[0-9]+\s+)?([a-zA-Z]{1,10})\s+with\s+\$?([0-9]*\.?[0-9]+)\s+([a-zA-Z]{1,10})/i;

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

// Wave 5: donations/crowdfunding. "$"-prefixed, deliberately distinct from
// the bare-keyword send/swap grammar above so there's no ambiguity between
// command families. "usdc" is accepted as a synonym for our one on-chain
// stablecoin (usdg) since that's the vocabulary the original spec used.
function normalizeToken(raw: string): BotToken {
  return raw.toLowerCase() === "eth" ? "native" : "usdg";
}

export type CauseAction = "create" | "donate" | "leaderboard" | "withdraw";

export interface ParsedCauseCommand {
  action: CauseAction;
  name?: string; // create
  goalAmount?: string; // create
  goalToken?: BotToken; // create
  organizerWallet?: `0x${string}`; // create
  causeId?: number; // donate | leaderboard | withdraw
  amount?: string; // donate | withdraw
  token?: BotToken; // donate
  reason?: string; // withdraw
}

const CAUSE_CREATE_PATTERN =
  /\$cause\s+create\s+"([^"]+)"\s+goal:\s*\$?([0-9]*\.?[0-9]+)\s*(eth|usdg|usdc)\s+wallet:\s*(0x[a-fA-F0-9]{40})/i;
const CAUSE_DONATE_PATTERN = /\$cause\s+donate\s+\$?([0-9]*\.?[0-9]+)\s*(eth|usdg|usdc)\s+#CAUSE-(\d+)/i;
const CAUSE_LEADERBOARD_PATTERN = /\$cause\s+leaderboard\s+#CAUSE-(\d+)/i;
// Withdraw amount is always denominated in whatever token the cause itself
// was created with -- a token word may still appear in the text right after
// the amount (matching the natural "1000USDC" phrasing), it's just not
// captured or trusted, since the cause's own on-chain record is what
// actually determines the token.
const CAUSE_WITHDRAW_PATTERN =
  /\$cause\s+withdraw\s+#CAUSE-(\d+)\s+\$?([0-9]*\.?[0-9]+)\s*(?:eth|usdg|usdc)?\s+(?:to\s+)?"([^"]+)"/i;

export function parseCauseCommand(rawText: string): ParsedCauseCommand | null {
  let m = rawText.match(CAUSE_CREATE_PATTERN);
  if (m) {
    return {
      action: "create",
      name: m[1],
      goalAmount: m[2],
      goalToken: normalizeToken(m[3]!),
      organizerWallet: m[4] as `0x${string}`,
    };
  }

  m = rawText.match(CAUSE_DONATE_PATTERN);
  if (m) {
    return { action: "donate", amount: m[1], token: normalizeToken(m[2]!), causeId: Number(m[3]) };
  }

  m = rawText.match(CAUSE_LEADERBOARD_PATTERN);
  if (m) {
    return { action: "leaderboard", causeId: Number(m[1]) };
  }

  m = rawText.match(CAUSE_WITHDRAW_PATTERN);
  if (m) {
    return { action: "withdraw", causeId: Number(m[1]), amount: m[2], reason: m[3] };
  }

  return null;
}

// "$donate 50usdg to "Flood Relief Turkey"" -- donating to a cause by its
// free-text name rather than #CAUSE-<id>. Donating directly to an @handle
// ("$donate 10usdg to @RedCross") is intentionally just the existing plain
// send grammar under different framing, not a cause at all -- no separate
// parsing needed for that form.
export interface ParsedDonateToNameCommand {
  amount: string;
  token: BotToken;
  causeName: string;
}

const DONATE_TO_NAME_PATTERN = /\$donate\s+\$?([0-9]*\.?[0-9]+)\s*(eth|usdg|usdc)\s+to\s+"([^"]+)"/i;

export function parseDonateToName(rawText: string): ParsedDonateToNameCommand | null {
  const m = rawText.match(DONATE_TO_NAME_PATTERN);
  if (!m) return null;
  return { amount: m[1]!, token: normalizeToken(m[2]!), causeName: m[3]! };
}

// Wave 6: generic escrow. "$"-prefixed, same family as the cause commands
// above. No dispute/jury system in v1 (confirmed 2026-07-20) -- accept,
// deliver, release, and cancel are the only state transitions; the deliver/
// release safety-net timers live entirely in the contract, not here.
export type EscrowAction = "create" | "accept" | "deliver" | "release" | "cancel";

export interface ParsedEscrowCommand {
  action: EscrowAction;
  description?: string; // create
  amount?: string; // create
  token?: BotToken; // create
  counterpartyHandle?: string; // create -- resolved to a wallet by the caller, same as send's @handle targets
  escrowId?: number; // accept | deliver | release | cancel
  proofUrl?: string; // deliver
}

const ESCROW_CREATE_PATTERN =
  /\$escrow\s+"([^"]+)"\s+\$?([0-9]*\.?[0-9]+)\s*(eth|usdg|usdc)\s+@([a-zA-Z0-9_]{1,15})/i;
const ESCROW_ACCEPT_PATTERN = /\$accept\s+#(\d+)/i;
const ESCROW_DELIVER_PATTERN = /\$deliver\s+#(\d+)\s+(\S+)/i;
const ESCROW_RELEASE_PATTERN = /\$release\s+#(\d+)/i;
const ESCROW_CANCEL_PATTERN = /\$cancel\s+#(\d+)/i;

export function parseEscrowCommand(rawText: string): ParsedEscrowCommand | null {
  let m = rawText.match(ESCROW_CREATE_PATTERN);
  if (m) {
    return {
      action: "create",
      description: m[1],
      amount: m[2],
      token: normalizeToken(m[3]!),
      counterpartyHandle: m[4],
    };
  }

  m = rawText.match(ESCROW_ACCEPT_PATTERN);
  if (m) return { action: "accept", escrowId: Number(m[1]) };

  m = rawText.match(ESCROW_DELIVER_PATTERN);
  if (m) return { action: "deliver", escrowId: Number(m[1]), proofUrl: m[2] };

  m = rawText.match(ESCROW_RELEASE_PATTERN);
  if (m) return { action: "release", escrowId: Number(m[1]) };

  m = rawText.match(ESCROW_CANCEL_PATTERN);
  if (m) return { action: "cancel", escrowId: Number(m[1]) };

  return null;
}

// Wave 7: private send. "$"-prefixed, same family as cause/escrow. Same
// three target kinds as the plain send command (@handle, #hashtag,
// 0xaddress) -- a hashtag or raw wallet address resolves straight to a
// concrete address with no X account needed at all, so only the @handle
// path requires the recipient to already be a linked wallet (see
// privateSendHandler.ts).
export interface ParsedPrivateSendCommand {
  amount: string;
  token: BotToken;
  targetType: BotTargetType;
  targetValue: string;
}

const PRIVATE_SEND_PATTERN =
  /\$psend\s+\$?([0-9]*\.?[0-9]+)\s*(eth|usdg|usdc)\s+to\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})/i;

export function parsePrivateSendCommand(rawText: string): ParsedPrivateSendCommand | null {
  const m = rawText.match(PRIVATE_SEND_PATTERN);
  if (!m) return null;
  const [, amount, tokenRaw, targetRaw] = m;
  const token = normalizeToken(tokenRaw!);

  if (targetRaw!.startsWith("@")) {
    return { amount: amount!, token, targetType: "x_account", targetValue: targetRaw!.slice(1) };
  }
  if (targetRaw!.startsWith("#")) {
    return { amount: amount!, token, targetType: "hashtag", targetValue: targetRaw!.slice(1).toLowerCase() };
  }
  return { amount: amount!, token, targetType: "wallet", targetValue: targetRaw! };
}

// Manual fallback for the recipient side -- no arguments, just resolves
// their own oldest still-claimable private send (see
// privateSendHandler.handleClaimCommand).
const CLAIM_PATTERN = /\$claim\b/i;

export function isClaimCommand(rawText: string): boolean {
  return CLAIM_PATTERN.test(rawText);
}
