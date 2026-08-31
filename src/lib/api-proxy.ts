/**
 * Server-side passthrough to the TagioFi API.
 *
 * The browser talks to this app's own origin at /api/*, and the server forwards
 * to the real API. That sidesteps CORS entirely: the upstream only sends
 * `access-control-allow-origin: https://tagiopay.com`, so a direct browser call
 * from any other origin (every local dev port, preview deploys) is blocked and
 * surfaces as an opaque "Failed to fetch". A server-to-server request sends no
 * Origin header at all, so nothing is gated.
 */

import { API_PROXY_PREFIX } from "@/lib/api-config";

export { API_PROXY_PREFIX };

/**
 * Upstream origin. Reads process.env first so the deployed server can be
 * repointed without a rebuild, falling back to the build-time VITE_API_URL.
 */
export function getUpstreamBase(): string {
  const fromProcess =
    typeof process !== "undefined"
      ? (process.env?.["API_URL"] ?? process.env?.["VITE_API_URL"])
      : undefined;
  const fromVite = import.meta.env["VITE_API_URL"] as string | undefined;
  return (fromProcess ?? fromVite ?? "https://api.tagiopay.com").replace(/\/+$/, "");
}

export function isApiProxyRequest(url: URL): boolean {
  return url.pathname === API_PROXY_PREFIX || url.pathname.startsWith(`${API_PROXY_PREFIX}/`);
}

// Hop-by-hop and origin-identifying headers that must not be replayed upstream.
// Forwarding `origin` would re-introduce the very CORS check we're avoiding.
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "origin",
  "referer",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "expect",
  "content-length",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  // Same-origin now, so upstream CORS headers are meaningless and can only confuse.
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
]);

export async function handleApiProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const upstreamPath = url.pathname.slice(API_PROXY_PREFIX.length) || "/";
  const target = `${getUpstreamBase()}${upstreamPath}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: "follow",
    });
  } catch (error) {
    console.error(`[api-proxy] ${request.method} ${target} failed:`, error);
    return Response.json({ error: "The TagioFi API is unreachable right now." }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
