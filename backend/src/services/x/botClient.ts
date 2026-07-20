import { getValidBotAccessToken } from "./botTokenManager";
import { log } from "../../lib/logger";

const API_BASE = "https://api.x.com/2";

// Warn once a stream is down to 20% of its per-15min budget, so a 429 can be
// anticipated (and the poll interval reconsidered) before it actually happens --
// mentions and DMs have wildly different limits (300/15min vs 15/15min), so this
// is the only reliable early signal for either.
const RATE_LIMIT_WARN_THRESHOLD = 0.2;

export class XApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

export interface XMention {
  id: string;
  text: string;
  authorId: string;
}

export interface XDirectMessage {
  id: string;
  text: string;
  senderId: string;
  dmConversationId: string;
}

function checkRateLimitHeaders(path: string, res: Response): void {
  const limit = Number(res.headers.get("x-rate-limit-limit"));
  const remaining = Number(res.headers.get("x-rate-limit-remaining"));
  const reset = res.headers.get("x-rate-limit-reset");
  if (!limit || Number.isNaN(remaining)) return; // header absent on this endpoint

  if (remaining / limit <= RATE_LIMIT_WARN_THRESHOLD) {
    log.warn("x_api_rate_limit_low", {
      path,
      remaining,
      limit,
      resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : undefined,
    });
  }
}

async function authedFetch(path: string, init?: RequestInit): Promise<any> {
  const accessToken = await getValidBotAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  checkRateLimitHeaders(path, res);

  if (!res.ok) {
    const body = await res.text();
    log.error("x_api_call_failed", { path, status: res.status });
    throw new XApiError(res.status, `X API ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

let cachedBotUserId: string | null = null;

export async function getBotUserId(): Promise<string> {
  if (cachedBotUserId) return cachedBotUserId;
  const body = await authedFetch("/users/me");
  cachedBotUserId = body.data.id as string;
  return cachedBotUserId;
}

// Verified against a live account: X only includes author_id on a tweet object
// when explicitly requested via tweet.fields -- without it, every mention's
// authorId comes back undefined, and every mention silently fails the
// "is this a linked user" check no matter who sent it.
export async function listNewMentions(sinceId: string | null): Promise<XMention[]> {
  const botId = await getBotUserId();
  const params = new URLSearchParams({ max_results: "20", "tweet.fields": "author_id" });
  if (sinceId) params.set("since_id", sinceId);

  const body = await authedFetch(`/users/${botId}/mentions?${params}`);
  const tweets = (body.data ?? []) as Array<{ id: string; text: string; author_id: string }>;
  return tweets.map((t) => ({ id: t.id, text: t.text, authorId: t.author_id }));
}

// DM events endpoint has no since_id filter -- fetch the recent page and let the
// caller filter against its own last-seen cursor (event ids are chronologically
// sortable as bigints).
export async function listRecentDirectMessages(): Promise<XDirectMessage[]> {
  const params = new URLSearchParams({
    max_results: "20",
    "dm_event.fields": "sender_id,dm_conversation_id",
  });
  const body = await authedFetch(`/dm_events?${params}`);
  const events = (body.data ?? []) as Array<{
    id: string;
    text?: string;
    sender_id: string;
    dm_conversation_id: string;
    event_type: string;
  }>;
  return events
    .filter((e) => e.event_type === "MessageCreate" && e.text)
    .map((e) => ({ id: e.id, text: e.text as string, senderId: e.sender_id, dmConversationId: e.dm_conversation_id }));
}

export async function replyToMention(tweetId: string, text: string): Promise<void> {
  await authedFetch("/tweets", {
    method: "POST",
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
  });
}

// Uses the same OAuth 2.0 user-context bearer token as every other call here
// -- X's v2 media upload endpoint accepts it directly, so this never needs
// the older v1.1 endpoint's OAuth 1.0a signing (the X_API_KEY/X_API_SECRET/
// X_ACCESS_TOKEN_SECRET env vars are unused leftovers from the dev portal
// setup, not something this bot's auth relies on).
export async function uploadMedia(buffer: Buffer, mimeType: string): Promise<string> {
  const accessToken = await getValidBotAccessToken();
  const form = new FormData();
  form.append("media", new Blob([buffer], { type: mimeType }), "receipt.png");
  form.append("media_category", "tweet_image");

  const res = await fetch(`${API_BASE}/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    log.error("x_api_call_failed", { path: "/media/upload", status: res.status });
    throw new XApiError(res.status, `X API /media/upload failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

export async function replyToMentionWithMedia(tweetId: string, text: string, mediaId: string): Promise<void> {
  await authedFetch("/tweets", {
    method: "POST",
    body: JSON.stringify({
      text,
      reply: { in_reply_to_tweet_id: tweetId },
      media: { media_ids: [mediaId] },
    }),
  });
}

export async function replyToDirectMessage(dmConversationId: string, text: string): Promise<void> {
  await authedFetch(`/dm_conversations/${dmConversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
