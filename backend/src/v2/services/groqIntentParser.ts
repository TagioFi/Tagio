import Groq from "groq-sdk";
import { config } from "../../config";

export type V2BotAction = "send" | "invoice" | "election" | "unrecognized";
export type V2TargetType = "x_account" | "hashtag" | "wallet";

export interface V2ParsedBotIntent {
  action: V2BotAction;
  target: string | null;
  targetType: V2TargetType | null;
  amount: number | null;
  token: string | null;
  memo: string | null;
  elections: { symbol: string; basisPoints: number }[] | null;
  confidence: number;
}

const SYSTEM_PROMPT = `You are the TagioFi v2 natural language intent parser for Twitter/X bot commands on Robinhood Chain (ETH, USDG, and tokenized RWA equities like SPYR, QQQR, AAPLR, TSLAR, NVDAR, GLDR).

Classify the user's message into one of these actions:
1. "send": Paying, tipping, transferring, or sending funds to a recipient (@handle, #tag, or 0x address).
   Examples:
   - "@TagioPayBot send @vlad 40 usdg" -> action: "send", target: "@vlad", targetType: "x_account", amount: 40, token: "USDG"
   - "@TagioPayBot send 40 usdg to @vlad" -> action: "send", target: "@vlad", targetType: "x_account", amount: 40, token: "USDG"
   - "@TagioPayBot tip #alex 100 USDG for the design" -> action: "send", target: "#alex", targetType: "hashtag", amount: 100, token: "USDG", memo: "for the design"
   - "@TagioPayBot pay 0.5 eth to 0x1234567890123456789012345678901234567890" -> action: "send", target: "0x1234567890123456789012345678901234567890", targetType: "wallet", amount: 0.5, token: "ETH"
   - "send $50 in usdg to @bob" -> action: "send", target: "@bob", targetType: "x_account", amount: 50, token: "USDG"

2. "invoice": Creating a payment link or invoice request.
   Examples:
   - "invoice @client 250 USDG for frontend work" -> action: "invoice", target: "@client", amount: 250, token: "USDG", memo: "frontend work"

3. "election": Setting or updating portfolio receive-side preference.
   Examples:
   - "set portfolio 60% SPYR 30% USDG 10% GLDR" -> action: "election", elections: [{"symbol": "SPYR", "basisPoints": 6000}, {"symbol": "USDG", "basisPoints": 3000}, {"symbol": "GLDR", "basisPoints": 1000}]

4. "unrecognized": Casual chat, questions, or unclear intent.

Return ONLY a JSON object matching this schema:
{
  "action": "send" | "invoice" | "election" | "unrecognized",
  "target": string | null,
  "targetType": "x_account" | "hashtag" | "wallet" | null,
  "amount": number | null,
  "token": string | null,
  "memo": string | null,
  "elections": [{"symbol": string, "basisPoints": number}] | null,
  "confidence": number
}`;

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  groqClient ??= new Groq({ apiKey: config.groq.apiKey });
  return groqClient;
}

// Fast deterministic regex checks for standard phrases (0ms latency)
function fastRegexParse(text: string): V2ParsedBotIntent | null {
  const clean = text.replace(/@tagiopaybot\s*/gi, "").trim();

  // Match: send @target 40 usdg OR send 40 usdg to @target OR $send @target 40 usdg
  const pA = /(?:\$|\b)send\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})\s+\$?([0-9]*\.?[0-9]+)\s*([a-zA-Z0-9_]{2,10})/i;
  const mA = clean.match(pA);
  if (mA) {
    const targetRaw = mA[1];
    const amount = parseFloat(mA[2]);
    const token = mA[3].toUpperCase();
    const targetType: V2TargetType = targetRaw.startsWith("@") ? "x_account" : targetRaw.startsWith("#") ? "hashtag" : "wallet";
    return {
      action: "send",
      target: targetRaw,
      targetType,
      amount,
      token,
      memo: null,
      elections: null,
      confidence: 1.0,
    };
  }

  const pB = /(?:\$|\b)send\s+\$?([0-9]*\.?[0-9]+)\s*([a-zA-Z0-9_]{2,10})\s+to\s+(@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]{3,32}|0x[a-fA-F0-9]{40})/i;
  const mB = clean.match(pB);
  if (mB) {
    const amount = parseFloat(mB[1]);
    const token = mB[2].toUpperCase();
    const targetRaw = mB[3];
    const targetType: V2TargetType = targetRaw.startsWith("@") ? "x_account" : targetRaw.startsWith("#") ? "hashtag" : "wallet";
    return {
      action: "send",
      target: targetRaw,
      targetType,
      amount,
      token,
      memo: null,
      elections: null,
      confidence: 1.0,
    };
  }

  return null;
}

export async function parseV2BotIntent(text: string): Promise<V2ParsedBotIntent> {
  // Step 1: Fast regex pass
  const fast = fastRegexParse(text);
  if (fast) return fast;

  // Step 2: Groq AI fallback for natural phrasing
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
      amount: typeof json.amount === "number" ? json.amount : null,
      token: json.token ? json.token.toUpperCase() : null,
      memo: json.memo || null,
      elections: Array.isArray(json.elections) ? json.elections : null,
      confidence: typeof json.confidence === "number" ? json.confidence : 0.8,
    };
  } catch (err) {
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
