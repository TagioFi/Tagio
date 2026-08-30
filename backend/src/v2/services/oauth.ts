import { randomBytes, createHash } from "crypto";
import { config } from "../../config";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function getV2RedirectUri(): string {
  // If explicitly configured, or derive from backend host
  if (process.env.X_OAUTH_V2_REDIRECT_URI) {
    return process.env.X_OAUTH_V2_REDIRECT_URI;
  }
  return "https://api.tagiopay.com/v2/auth/x/callback";
}

export function buildAuthorizeUrl(params: { state: string; codeChallenge: string; scope: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.x.clientId);
  url.searchParams.set("redirect_uri", getV2RedirectUri());
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${config.x.clientId}:${config.x.clientSecret}`).toString("base64");
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getV2RedirectUri(),
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`X token exchange failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as TokenResponse;
}

export interface AuthenticatedXUser {
  id: string;
  name: string;
  username: string;
}

export async function getAuthenticatedXUser(accessToken: string): Promise<AuthenticatedXUser> {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch authenticated X user: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { data: AuthenticatedXUser };
  return data.data;
}
