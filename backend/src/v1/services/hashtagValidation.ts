const HASHTAG_PATTERN = /^[a-z0-9_]{3,32}$/;
export const TOTAL_BPS = 10000;

export function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

export function isValidHashtag(raw: string): boolean {
  return HASHTAG_PATTERN.test(normalizeHashtag(raw));
}

export interface PayoutRecipient {
  wallet: string;
  percentageBps: number;
}

export function isValidPayoutSplit(payouts: PayoutRecipient[]): boolean {
  if (payouts.length === 0) return false;
  const sum = payouts.reduce((acc, p) => acc + p.percentageBps, 0);
  return sum === TOTAL_BPS && payouts.every((p) => p.percentageBps > 0);
}
