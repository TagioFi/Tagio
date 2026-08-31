export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3001", 10),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  databaseUrl: process.env.DATABASE_URL ?? "",

  robinhood: {
    rpcUrl: process.env.ROBINHOOD_RPC_URL ?? "",
    chainId: parseInt(process.env.ROBINHOOD_CHAIN_ID ?? "4663", 10),
    resolverAddress: (process.env.ROBINHOOD_RESOLVER_ADDRESS ?? "") as `0x${string}`,
    nftAddress: (process.env.ROBINHOOD_NFT_ADDRESS ?? "") as `0x${string}`,
    settlementTokenAddress: (process.env.ROBINHOOD_SETTLEMENT_TOKEN_ADDRESS ?? "") as `0x${string}`,
    usdgAddress: (process.env.ROBINHOOD_USDG_ADDRESS ?? "0x5fc5360d0400a0fd4f2af552add042d716f1d168") as `0x${string}`,
    feeWallet: (process.env.ROBINHOOD_FEE_WALLET ?? "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9") as `0x${string}`,
    // Mainnet Blockscout instance -- confirmed via docs.robinhood.com/chain/connecting
    // (2026-07-20; that page's "Mainnet" column also matches ROBINHOOD_RPC_URL's
    // default above, confirming it's the right column, not the testnet one).
    explorerUrl: process.env.ROBINHOOD_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com",
    // Deployed 2026-07-20 (contracts/script/DeployDisperser.s.sol), verified live
    // against the real contract (EmptyRecipients() selector matched on an
    // empty-array call). Wave 1 tech-updates: giveaway/airdrop batch payouts.
    batchDisperserAddress: (process.env.BATCH_DISPERSER_ADDRESS ?? "0x21B3b3E4752cA3810c791e30f226a15851DC7b19") as `0x${string}`,
    // Deployed 2026-07-20 (contracts/script/DeployClaimEscrow.s.sol), verified
    // live: attestor()/owner() both read back correctly, and a full
    // deposit->sign(viem)->claim round trip against a local Anvil deployment
    // of the same bytecode confirmed viem's off-chain signature is accepted
    // by the real Solidity ECDSA.recover check before this was ever used
    // against mainnet.
    claimEscrowAddress: (process.env.CLAIM_ESCROW_ADDRESS ?? "0xee0B89105aC36587169c7F1e75162EB7Aed9808e") as `0x${string}`,
    // Deployed 2026-07-20 (contracts/script/DeployCauseRegistry.s.sol), verified
    // live: bytecode present, causeCount() reads back 0 on a fresh deploy.
    causeRegistryAddress: (process.env.CAUSE_REGISTRY_ADDRESS ?? "0x06Ea330d1bC7bBEfA79F187E439fc51155A0e568") as `0x${string}`,
    // Deployed 2026-07-20 (contracts/script/DeploySimpleEscrow.s.sol), verified
    // live: bytecode present, escrowCount()=0 and DELIVER_WINDOW()=604800
    // (7 days) both read back correctly on a fresh deploy.
    simpleEscrowAddress: (process.env.SIMPLE_ESCROW_ADDRESS ?? "0xCDE4885F1b10dAFaF6ac85281BCD0E43Db73Fd90") as `0x${string}`,
    // Redeployed 2026-07-20 (contracts/script/DeployPrivateSendPool.s.sol) to
    // switch keeperFee to always-ETH (see the contract's own doc comment) --
    // verified live: bytecode present, getAllocation() on an unused
    // commitment reads back the zeroed struct. Nothing had moved through the
    // prior deploy, so no migration/backfill was needed.
    privateSendPoolAddress: (process.env.PRIVATE_SEND_POOL_ADDRESS ?? "0x1631b69a7aD282e3EC9246C3215f10a5812B50b4") as `0x${string}`,
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

  relay: {
    apiKey: process.env.RELAY_API_KEY ?? "edcabeb0-41ed-4827-9d8a-976280cfc0b7",
  },

  groq: {
    // Intent parsing only for giveaway/airdrop free-text -- never reply
    // generation, per X's automation rules (prior written approval required
    // for "AI reply bots"; a fixed reply bank keyed off Groq's structured
    // slot output stays clearly out of that category).
    apiKey: process.env.GROQ_API_KEY ?? "",
  },

  blockscout: {
    apiKey: process.env.BLOCKSCOUT_API_KEY ?? "",
  },

  claimEscrow: {
    // Signs "this wallet is who it says it is" attestations for
    // ClaimEscrow.claimNative/claimToken -- never signs an on-chain
    // transaction or holds user funds itself, just authorizes a payout to
    // whichever wallet the backend's own x_accounts table says is linked.
    // Dedicated key, deliberately separate from the contract deployer/owner
    // key, so a leak here can only forge claim authorizations, not touch
    // contract ownership or anything else.
    attestorPrivateKey: process.env.CLAIM_ESCROW_ATTESTOR_PRIVATE_KEY ?? "",
  },

  keeper: {
    // Wave 7 (Private Send): the first place in TagioPay where the backend
    // itself directly signs and broadcasts value-moving transactions, not
    // just off-chain attestations -- unlike claimEscrow.attestorPrivateKey
    // above (which only ever signs a message, never holds funds or
    // broadcasts), this wallet holds a real ETH gas float and spends it.
    // Deliberately a separate dedicated key from the attestor (confirmed
    // 2026-07-20, generated fresh after the two were briefly set identical)
    // so a leak here is bounded to this wallet's own gas float, never the
    // attestor's signing capability or vice versa. Funded by keeper fees
    // senders pay upfront (see PrivateSendPool.sol) -- not gas sponsorship,
    // since the sender pays for it, just not literally denominated as gas.
    privateKey: process.env.KEEPER_PRIVATE_KEY ?? "",
    // How often the keeper scans for claimable private sends it should
    // auto-claim on the recipient's behalf.
    pollIntervalMs: parseInt(process.env.KEEPER_POLL_INTERVAL_MS ?? "25000", 10),
    // Below this, the keeper skips claiming (would spend more than it has)
    // and logs a low-balance warning instead of trying and failing.
    // Recalibrated 2026-07-20 after the first live claim: a real claim()
    // costs ~76,000 gas (~0.0000044-0.0000076 ETH at this chain's observed
    // gas prices), so the original 0.002 ETH floor was a pre-launch guess
    // roughly 300x more conservative than actually necessary -- it would
    // have kept the keeper permanently idle even when genuinely funded
    // enough for hundreds of claims. 0.0001 ETH still leaves a real margin
    // (~15-20 claims worth) without blocking on funds that are already fine.
    minBalanceWei: process.env.KEEPER_MIN_BALANCE_WEI ?? "100000000000000", // 0.0001 ETH
  },

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
    // Own interval, own budget -- re-checking a giveaway's requirement hits
    // liking_users/retweeted_by/search, each a separate endpoint with its
    // own 15-min rate-limit window, independent of mentions/DMs. 2 minutes
    // gives ~30 checks across the 1-hour waiter window without being wasteful.
    giveawayWaiterPollIntervalMs: parseInt(process.env.X_BOT_GIVEAWAY_WAITER_POLL_INTERVAL_MS ?? "120000", 10),
    // Auxiliary on/off switch, independent of the credentials -- defaults to "on"
    // so this doesn't silently disable an already-running bot on redeploy; set
    // to "false" to pause polling (and its API spend) without touching X config.
    botEnabled: (process.env.X_BOT_ENABLED ?? "true") !== "false",
  },
};
