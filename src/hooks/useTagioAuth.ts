/**
 * The v2 sign-in state machine: **connect wallet → connect X → dashboard**.
 *
 * Step 1 is wagmi/RainbowKit (see `useWallet`). Step 2 is a wallet signature
 * posted to `POST /v2/auth/signin`, which either hands back a JWT (this wallet
 * is already bound to an X account) or an `authorizeUrl` we navigate to. X
 * sends the user to `GET /v2/auth/x/callback` on the API, which redirects back
 * to `/auth/callback#token=…&xHandle=…` — see `src/routes/auth.callback.tsx`.
 *
 * There is no "skip" path: the dashboard is only reachable in stage `ready`.
 */

import { useCallback, useEffect, useState } from "react";
import { useSignMessage } from "wagmi";

import { useWallet } from "@/hooks/useWallet";
import {
  AUTH_EVENT,
  api,
  buildSignInMessage,
  clearAuthSession,
  friendlyError,
  getStoredSession,
  jwtExpiresAt,
  setReturnTo,
  setStoredSession,
} from "@/lib/tagio-api";
import { robinhoodChain } from "@/lib/wagmi";
import type { V2Session, V2SignInResponse } from "@/types/tagio-v2";

export type AuthStage =
  /** Waiting on hydration or on wagmi restoring a previous connection. */
  | "restoring"
  /** Step 1 outstanding. */
  | "connect-wallet"
  /** Step 2 outstanding: the wallet is connected but not bound to an X account. */
  | "link-x"
  /** Step 2 in flight: signing, calling signin, or bouncing to x.com. */
  | "linking"
  /** Both steps done — the dashboard may render. */
  | "ready";

export interface TagioAuth {
  stage: AuthStage;
  address: string | null;
  isConnected: boolean;
  isWrongNetwork: boolean;
  session: V2Session | null;
  xHandle: string | null;
  error: string | null;
  /** Runs step 2. Safe to call repeatedly; no-op without a connected wallet. */
  connectX: () => Promise<void>;
  /** Drops the local session (the wallet stays connected). */
  signOut: () => void;
}

function sameWallet(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function useTagioAuth(): TagioAuth {
  const { address, isConnected, isConnecting, isRestoring, isWrongNetwork, chainId } = useWallet();
  const { signMessageAsync } = useSignMessage();

  // The stored session is read after mount only: the server render has no
  // localStorage, and painting a signed-in shell it can't know about would
  // mismatch on hydration.
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<V2Session | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setSession(getStoredSession());
  }, []);

  // Pick up sessions written elsewhere: the /auth/callback route in this tab
  // (custom event) and sign-in/out in another tab (`storage`).
  useEffect(() => {
    const sync = () => setSession(getStoredSession());
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // A session belongs to the wallet that signed for it. Switching accounts or
  // disconnecting invalidates it, otherwise the dashboard would keep rendering
  // one wallet's tags while another is connected.
  //
  // The `isConnecting` guard matters: wagmi reports no address at all while it
  // rehydrates a connection, and every page load starts there — including the
  // one right after the X callback. Clearing on that transient null would throw
  // away the session the user just earned.
  useEffect(() => {
    if (!mounted || !session || isConnecting) return;

    const drop = () => {
      clearAuthSession();
      setSession(null);
      setError(null);
    };

    if (address) {
      if (!sameWallet(address, session.walletAddress)) drop();
      return;
    }

    // No address and nothing in flight. That is usually a real disconnect, but
    // it is also what the first client render looks like for a beat before
    // wagmi's reconnect starts — so give it one.
    const timer = window.setTimeout(drop, 600);
    return () => window.clearTimeout(timer);
  }, [mounted, address, isConnecting, session]);

  const connectX = useCallback(async () => {
    if (!address) return;
    setError(null);
    setLinking(true);
    try {
      const message = buildSignInMessage(address, chainId ?? robinhoodChain.id);
      const signature = await signMessageAsync({ message });

      const result = await api.post<V2SignInResponse>("/v2/auth/signin", {
        walletAddress: address,
        signature,
        message,
      });

      if (result.needsXLink) {
        // Come back to whatever page started the hop.
        setReturnTo(`${window.location.pathname}${window.location.search}`);
        // Full-page navigation: x.com is a different origin, not a fetch.
        window.location.assign(result.authorizeUrl);
        return; // stay in `linking` while the browser leaves this page
      }

      const next: V2Session = {
        walletAddress: address,
        xHandle: result.xHandle ?? null,
        expiresAt: jwtExpiresAt(result.token),
      };
      setStoredSession(next, result.token);
      setSession(next);
      setLinking(false);
    } catch (err) {
      // Wallets reject signature requests with a plain Error; anything from the
      // API arrives as ApiError.
      const message =
        err instanceof Error && /reject|denied|cancel/i.test(err.message)
          ? "Signature request rejected."
          : friendlyError(err);
      setError(message);
      setLinking(false);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(() => {
    clearAuthSession();
    setSession(null);
    setError(null);
  }, []);

  const authed = Boolean(session && address && sameWallet(address, session.walletAddress));

  // Holding a session with no address yet means the effect above is still
  // deciding whether this is a reconnect or a real disconnect. Show the
  // restoring copy rather than flashing "connect a wallet" at someone who is
  // already signed in.
  const settling = Boolean(session) && !address;

  const stage: AuthStage =
    !mounted || isRestoring || settling
      ? "restoring"
      : !address
        ? "connect-wallet"
        : authed
          ? "ready"
          : linking
            ? "linking"
            : "link-x";

  return {
    stage,
    address,
    isConnected,
    isWrongNetwork,
    session: authed ? session : null,
    xHandle: authed ? (session?.xHandle ?? null) : null,
    error,
    connectX,
    signOut,
  };
}
