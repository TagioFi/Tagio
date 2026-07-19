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

  // Canonical per developers.uniswap.org's v3/v4 Robinhood Chain deployment pages
  // (confirmed 2026-07-19) -- same addresses already cross-verified in plainly's
  // backend. Overridable via env for flexibility; default to the real deployment.
  uniswap: {
    wethAddress: (process.env.UNISWAP_WETH_ADDRESS ?? "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73") as `0x${string}`,
    v3FactoryAddress: (process.env.UNISWAP_V3_FACTORY_ADDRESS ?? "0x1f7d7550b1b028f7571e69a784071f0205fd2efa") as `0x${string}`,
    v3QuoterAddress: (process.env.UNISWAP_V3_QUOTER_ADDRESS ?? "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7") as `0x${string}`,
    v3SwapRouterAddress: (process.env.UNISWAP_V3_SWAP_ROUTER_ADDRESS ?? "0xcaf681a66d020601342297493863e78c959e5cb2") as `0x${string}`,
    v4QuoterAddress: (process.env.UNISWAP_V4_QUOTER_ADDRESS ?? "0x8dc178efb8111bb0973dd9d722ebeff267c98f94") as `0x${string}`,
    v4StateViewAddress: (process.env.UNISWAP_V4_STATE_VIEW_ADDRESS ?? "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b") as `0x${string}`,
    universalRouterAddress: (process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS ?? "0x8876789976decbfcbbbe364623c63652db8c0904") as `0x${string}`,
    permit2Address: (process.env.UNISWAP_PERMIT2_ADDRESS ?? "0x000000000022D473030F116dDEE9F6B43aC78BA3") as `0x${string}`,
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
