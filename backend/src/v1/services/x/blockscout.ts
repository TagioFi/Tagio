import { config } from "../../../config";

const API_BASE = "https://api.blockscout.com/4663/api/v2";

export interface TokenHolder {
  address: `0x${string}`;
  balance: bigint;
}

interface HoldersResponse {
  items: Array<{ address: { hash: string }; value: string }>;
  next_page_params: Record<string, string | number> | null;
}

// Confirmed working live (2026-07-20) against USDG. Paginates (50 holders
// per page) until `count` is reached or the token runs out of holders.
export async function getTopHolders(tokenAddress: string, count: number): Promise<TokenHolder[]> {
  const holders: TokenHolder[] = [];
  let pageParams: Record<string, string | number> | null = null;

  while (holders.length < count) {
    const params = new URLSearchParams();
    if (pageParams) {
      for (const [key, value] of Object.entries(pageParams)) params.set(key, String(value));
    }
    const url = `${API_BASE}/tokens/${tokenAddress}/holders${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.blockscout.apiKey}` } });
    if (!res.ok) {
      throw new Error(`Blockscout holders lookup failed: ${res.status}`);
    }
    const body = (await res.json()) as HoldersResponse;
    for (const item of body.items) {
      holders.push({ address: item.address.hash as `0x${string}`, balance: BigInt(item.value) });
    }
    if (!body.next_page_params || body.items.length === 0) break;
    pageParams = body.next_page_params;
  }

  return holders.slice(0, count);
}
