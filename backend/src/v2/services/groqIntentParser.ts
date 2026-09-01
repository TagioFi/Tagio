import Groq from "groq-sdk";
import { config } from "../../config";

export type V2BotAction = "send" | "swap" | "invoice" | "election" | "escrow" | "giveaway" | "airdrop" | "unrecognized";
export type V2TargetType = "x_account" | "hashtag" | "wallet";

export interface V2ParsedBotIntent {
  action: V2BotAction;
  target: string | null;
  targetType: V2TargetType | null;
  amount: number | null;
  token: string | null;
  fromToken?: string | null;
  toToken?: string | null;
  memo: string | null;
  elections: { symbol: string; basisPoints: number }[] | null;
  giveawayCount?: number | null;
  confidence: number;
}

const SYSTEM_PROMPT = `You are the TagioFi universal natural language intent parser for Twitter/X bot commands on Robinhood Chain (EVM 4663).
STRICT ALLOWED ASSETS: ETH, USDG, WETH, SPCX, AAPL, TSLA, NVDA, GOOGL, AMZN, MSFT, META, COIN.
Do NOT accept or process any unlisted tokens or memecoins (e.g. BTC, SOL, DOGE, PEPE). If an unsupported token is requested, return action "unrecognized".

Classify the user's message into one of these actions:
1. "send": Paying, tipping, transferring, or sending funds to a recipient (@handle, #tag, or 0x address).
   Examples:
   - "@TagioPayBot send @nobody 0.5 usdg" -> action: "send", target: "@nobody", targetType: "x_account", amount: 0.5, token: "USDG"
   - "@TagioPayBot send 0.5 usdg to @nobody" -> action: "send", target: "@nobody", targetType: "x_account", amount: 0.5, token: "USDG"
   - "@TagioPayBot tip #alex 100 USDG for the design" -> action: "send", target: "#alex", targetType: "hashtag", amount: 100, token: "USDG", memo: "for the design"
   - "@TagioPayBot pay 0.05 eth to 0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9" -> action: "send", target: "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9", targetType: "wallet", amount: 0.05, token: "ETH"
   - "send $50 in usdg to @bob" -> action: "send", target: "@bob", targetType: "x_account", amount: 50, token: "USDG"

2. "swap": Buying, selling, or swapping tokenized RWA equities, ETFs, USDG, and ETH.
   Examples:
   - "swap 50 USDG to AAPL" -> action: "swap", amount: 50, fromToken: "USDG", toToken: "AAPL"
   - "buy 100 USDG of SPCX" -> action: "swap", amount: 100, fromToken: "USDG", toToken: "SPCX"
   - "buy 0.1 eth of NVDA" -> action: "swap", amount: 0.1, fromToken: "ETH", toToken: "NVDA"
   - "sell 2 TSLA for USDG" -> action: "swap", amount: 2, fromToken: "TSLA", toToken: "USDG"

3. "invoice": Creating an invoice or pay-link request.
   Examples:
   - "invoice @client 250 USDG for frontend work" -> action: "invoice", target: "@client", targetType: "x_account", amount: 250, token: "USDG", memo: "frontend work"

4. "election": Setting portfolio receive-side preference (total basis points must equal 10,000 = 100%).
   Examples:
   - "set portfolio 60% SPCX 30% USDG 10% NVDA" -> action: "election", elections: [{"symbol": "SPCX", "basisPoints": 6000}, {"symbol": "USDG", "basisPoints": 3000}, {"symbol": "NVDA", "basisPoints": 1000}]
   - "set my mix to 100 USDG" -> action: "election", elections: [{"symbol": "USDG", "basisPoints": 10000}]

5. "escrow": Creating or managing a milestone escrow.
   Examples:
   - "escrow 500 usdg to @designer for 3 logos" -> action: "escrow", target: "@designer", targetType: "x_account", amount: 500, token: "USDG", memo: "for 3 logos"

6. "giveaway" or "airdrop": Community engagement rewards.
   Examples:
   - "giveaway 50 usdg to 10 random people who liked this" -> action: "giveaway", amount: 50, token: "USDG", giveawayCount: 10

7. "unrecognized": Casual chat, questions, greetings, or non-financial statements.

Return ONLY a JSON object:
{
  "action": "send" | "swap" | "invoice" | "election" | "escrow" | "giveaway" | "airdrop" | "unrecognized",
  "target": string | null,
  "targetType": "x_account" | "hashtag" | "wallet" | null,
  "amount": number | null,
  "token": string | null,
  "fromToken": string | null,
  "toToken": string | null,
  "memo": string | null,
  "elections": [{"symbol": string, "basisPoints": number}] | null,
  "giveawayCount": number | null,
  "confidence": number
}`;

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  groqClient ??= new Groq({ apiKey: config.groq.apiKey });
  return groqClient;
}

export async function parseV2BotIntent(text: string): Promise<V2ParsedBotIntent> {
  if (!config.groq.apiKey) {
    return {
      action: "unrecognized",
      target: null,
      targetType: null,
      amount: null,
      token: null,
      memo: null,
      elections: null,
      confidence: 0,
    };
  }

  try {
    const res = await getGroqClient().chat.completions.create({
      model: config.groq.model || "qwen/qwen3.8-27b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Empty Groq response");

    const json = JSON.parse(content);
    return {
      action: json.action || "unrecognized",
      target: json.target || null,
      targetType: json.targetType || null,
      amount: typeof json.amount === "number" ? json.amount : json.amount ? parseFloat(json.amount) : null,
      token: json.token ? String(json.token).toUpperCase() : null,
      fromToken: json.fromToken ? String(json.fromToken).toUpperCase() : null,
      toToken: json.toToken ? String(json.toToken).toUpperCase() : null,
      memo: json.memo || null,
      elections: Array.isArray(json.elections) ? json.elections : null,
      giveawayCount: typeof json.giveawayCount === "number" ? json.giveawayCount : null,
      confidence: typeof json.confidence === "number" ? json.confidence : 0.95,
    };
  } catch (err: any) {
    console.error("[GroqIntentParser] Error:", err.message);
    return {
      action: "unrecognized",
      target: null,
      targetType: null,
      amount: null,
      token: null,
      memo: null,
      elections: null,
      confidence: 0,
    };
  }
}
