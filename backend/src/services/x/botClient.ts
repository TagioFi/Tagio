import { getValidBotAccessToken } from "./botTokenManager";

const API_BASE = "https://api.x.com/2";

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
  if (!res.ok) {
    throw new XApiError(res.status, `X API ${path} failed: ${res.status} ${await res.text()}`);
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

// NOTE: verified against X API v2 docs, not against a live account -- worth a
// smoke test (mention/DM the bot for real) once credentials are live, since
// this is the part of X's API that's changed shape the most over time.
export async function listNewMentions(sinceId: string | null): Promise<XMention[]> {
  const botId = await getBotUserId();
  const params = new URLSearchParams({ max_results: "20" });
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

export async function replyToDirectMessage(dmConversationId: string, text: string): Promise<void> {
  await authedFetch(`/dm_conversations/${dmConversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
