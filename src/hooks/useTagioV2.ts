/**
 * TanStack Query bindings for the TagioFi v2 API.
 *
 * Covers the endpoint surface in `technical-docs/frontend-integration-v2.md`
 * §4: asset registry, handles + elections, settlement quoting, invoices and the
 * Groq intent parser.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, api, cleanHandle } from "@/lib/tagio-api";
import type {
  PortfolioSettlementQuoteResult,
  SingleSwapQuoteResult,
  V2AssetsResponse,
  V2ConfirmSettlementBody,
  V2CreateInvoiceBody,
  V2CreateInvoiceResponse,
  V2ElectionInput,
  V2HandleDetails,
  V2Invoice,
  V2InvoiceResponse,
  V2OwnerHandlesResponse,
  V2ParsedBotIntent,
  V2RegisterHandleBody,
  V2SettlementRecord,
  V2TokenInfo,
} from "@/types/tagio-v2";

// ── A. RWA token registry ───────────────────────────────────────────────────

export function useV2Assets(query: string = "", featuredOnly: boolean = false) {
  return useQuery({
    queryKey: ["v2-assets", query, featuredOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (featuredOnly) params.set("featured", "true");
      if (query) params.set("q", query);
      const qs = params.toString();
      return api.get<V2AssetsResponse>(`/v2/assets${qs ? `?${qs}` : ""}`);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useV2Asset(symbolOrAddress: string | undefined) {
  return useQuery({
    queryKey: ["v2-asset", symbolOrAddress],
    queryFn: () => api.get<V2TokenInfo>(`/v2/assets/${symbolOrAddress}`),
    enabled: Boolean(symbolOrAddress),
    staleTime: 1000 * 60 * 5,
  });
}

// ── B. Handles & portfolio elections ────────────────────────────────────────

export function useV2Handle(handle: string | undefined) {
  return useQuery({
    queryKey: ["v2-handle", handle ? cleanHandle(handle) : null],
    queryFn: () => api.get<V2HandleDetails>(`/v2/handles/${cleanHandle(handle!)}`),
    enabled: Boolean(handle && cleanHandle(handle).length > 0),
    retry: false,
  });
}

export function useV2HandlesByOwner(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["v2-handles-owner", walletAddress?.toLowerCase()],
    // The endpoint has answered both bare (`[…]`) and wrapped
    // (`{ ownerWallet, total, handles }`); accept either so a backend deploy
    // can't empty the tag list under us.
    queryFn: async () => {
      const payload = await api.get<V2HandleDetails[] | V2OwnerHandlesResponse>(
        `/v2/handles/owner/${walletAddress}`,
      );
      return Array.isArray(payload) ? payload : (payload.handles ?? []);
    },
    enabled: Boolean(walletAddress),
  });
}

/**
 * Is a tag free to claim? `GET /v2/handles/:handle` 404s for an unregistered
 * tag, which is the only availability signal the API exposes.
 */
export function useV2HandleAvailability(handle: string | undefined) {
  const clean = handle ? cleanHandle(handle).toLowerCase() : "";

  return useQuery({
    queryKey: ["v2-handle-availability", clean],
    queryFn: async (): Promise<{ available: boolean; ownerWallet: string | null }> => {
      try {
        const details = await api.get<V2HandleDetails>(`/v2/handles/${clean}`);
        return { available: false, ownerWallet: details.ownerWallet ?? null };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { available: true, ownerWallet: null };
        }
        throw err;
      }
    },
    enabled: clean.length >= 3,
    staleTime: 30_000,
    retry: false,
  });
}

export function useRegisterV2Handle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V2RegisterHandleBody) =>
      api.post<V2HandleDetails>("/v2/handles/register", {
        ...body,
        handle: cleanHandle(body.handle),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["v2-handle", data.handle] });
      queryClient.invalidateQueries({
        queryKey: ["v2-handles-owner", data.ownerWallet?.toLowerCase()],
      });
    },
  });
}

export function useUpdateV2Elections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      handle,
      ownerWallet,
      elections,
    }: {
      handle: string;
      ownerWallet: string;
      elections: V2ElectionInput[];
    }) =>
      api.put<V2HandleDetails>(`/v2/handles/${cleanHandle(handle)}/elections`, {
        ownerWallet,
        elections,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["v2-handle", cleanHandle(variables.handle)] });
    },
  });
}

// ── C. Multi-leg routing & settlement ───────────────────────────────────────

export function useV2SingleQuote(params: {
  fromToken?: string | undefined;
  toToken?: string | undefined;
  amount: number | string;
  userWallet?: string | undefined;
}) {
  const amount = Number(params.amount);
  return useQuery({
    queryKey: ["v2-quote", params.fromToken, params.toToken, amount],
    queryFn: () =>
      api.post<SingleSwapQuoteResult>("/v2/settle/quote", {
        fromSymbolOrAddress: params.fromToken,
        toSymbolOrAddress: params.toToken,
        amountIn: amount,
        userWallet: params.userWallet,
      }),
    enabled: Boolean(params.fromToken && params.toToken && amount > 0),
    refetchInterval: 15_000,
  });
}

/**
 * The core v2 call: allocates an inbound amount across the recipient's elected
 * portfolio and quotes every leg. Re-quotes on an interval because Relay quotes
 * go stale.
 */
export function useV2ElectionQuote(params: {
  handle?: string | undefined;
  fromToken: string;
  amount: number | string;
  userWallet?: string | undefined;
}) {
  const amount = Number(params.amount);
  const handle = params.handle ? cleanHandle(params.handle) : undefined;

  return useQuery({
    queryKey: ["v2-election-quote", handle, params.fromToken, amount],
    queryFn: () =>
      api.post<PortfolioSettlementQuoteResult>("/v2/settle/election-quote", {
        recipientHandle: handle,
        fromSymbolOrAddress: params.fromToken,
        amountIn: amount,
        userWallet: params.userWallet,
      }),
    enabled: Boolean(handle && amount > 0),
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useConfirmV2Settlement() {
  return useMutation({
    mutationFn: (body: V2ConfirmSettlementBody) =>
      api.post<V2SettlementRecord>("/v2/settle/confirm", body),
  });
}

// ── D. Invoices & pay-links ─────────────────────────────────────────────────

export function useV2Invoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["v2-invoice", invoiceId],
    // Wrapped as { invoice, isExpired, handleDetails } upstream.
    queryFn: async () => (await api.get<V2InvoiceResponse>(`/v2/invoices/${invoiceId}`)).invoice,
    enabled: Boolean(invoiceId),
    retry: false,
  });
}

export function useCreateV2Invoice() {
  return useMutation({
    // Wrapped as { invoice, payUrl, handleDetails } upstream.
    mutationFn: async (body: V2CreateInvoiceBody) =>
      (
        await api.post<V2CreateInvoiceResponse>("/v2/invoices", {
          ...body,
          recipientHandle: cleanHandle(body.recipientHandle),
        })
      ).invoice,
  });
}

// ── E. Groq natural-language bot ────────────────────────────────────────────

export function useParseBotIntent() {
  return useMutation({
    mutationFn: (text: string) => api.post<V2ParsedBotIntent>("/v2/bot/parse-intent", { text }),
  });
}

export function useRouteBotIntent() {
  return useMutation({
    mutationFn: (payload: string | Record<string, unknown>) =>
      api.post<Record<string, unknown>>(
        "/v2/bot/route-intent",
        typeof payload === "string" ? { text: payload } : payload,
      ),
  });
}
