/**
 * Shared between the browser client and the server proxy, so importing the
 * prefix never drags server-only code into the client bundle.
 */

/** Path prefix the browser calls; everything after it is forwarded upstream. */
export const API_PROXY_PREFIX = "/api";
