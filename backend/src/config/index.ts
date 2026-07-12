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
  },

  redisUrl: process.env.REDIS_URL ?? "",

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "",

  gasStationPrivateKey: process.env.GAS_STATION_PRIVATE_KEY ?? "",
};
