export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3001", 10),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  databaseUrl: process.env.DATABASE_URL ?? "",

  robinhood: {
    rpcUrl: process.env.ROBINHOOD_RPC_URL ?? "",
    chainId: parseInt(process.env.ROBINHOOD_CHAIN_ID ?? "0", 10),
    resolverAddress: (process.env.ROBINHOOD_RESOLVER_ADDRESS ?? "") as `0x${string}`,
    nftAddress: (process.env.ROBINHOOD_NFT_ADDRESS ?? "") as `0x${string}`,
    settlementTokenAddress: (process.env.ROBINHOOD_SETTLEMENT_TOKEN_ADDRESS ?? "") as `0x${string}`,
    usdgAddress: (process.env.ROBINHOOD_USDG_ADDRESS ?? "") as `0x${string}`,
  },

  redisUrl: process.env.REDIS_URL ?? "",

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "",

  x: {
    clientId: process.env.X_CLIENT_ID ?? "",
    clientSecret: process.env.X_CLIENT_SECRET ?? "",
    oauthRedirectUri: process.env.X_OAUTH_REDIRECT_URI ?? "",
    // Seed values only -- the bot's live, rotating tokens are read from/written to
    // the x_bot_token table after the first refresh. These just prime that row.
    botAccessTokenSeed: process.env.X_ACCESS_TOKEN ?? "",
    botRefreshTokenSeed: process.env.X_REFRESH_TOKEN ?? "",
    // Mentions and DMs have very different X API rate limits (300/15min vs
    // 15/15min for GET /2/dm_events -- a 20x gap) and must poll on separate
    // intervals or the DM budget gets blown almost immediately. 30s for mentions
    // uses only 10% of its budget; 90s for DMs uses ~67% of its much tighter one,
    // leaving margin. Polling frequency doesn't meaningfully affect billing for
    // either (since_id makes empty mention-polls free, DM events dedupe within a
    // 24h UTC window) -- these are rate-limit-driven defaults, not cost-driven.
    mentionsPollIntervalMs: parseInt(process.env.X_BOT_MENTIONS_POLL_INTERVAL_MS ?? "30000", 10),
    dmPollIntervalMs: parseInt(process.env.X_BOT_DM_POLL_INTERVAL_MS ?? "90000", 10),
    // Auxiliary on/off switch, independent of the credentials -- defaults to "on"
    // so this doesn't silently disable an already-running bot on redeploy; set
    // to "false" to pause polling (and its API spend) without touching X config.
    botEnabled: (process.env.X_BOT_ENABLED ?? "true") !== "false",
  },
};
