export interface V2TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  isBaseCurrency?: boolean;
  underlyingTicker?: string;
  iconUrl?: string;
  assetType: "native" | "stablecoin" | "equity" | "etf" | "commodity";
}

export const ROBINHOOD_CHAIN_ID = 13746; // Robinhood Nitro L2

export const ETH: V2TokenInfo = {
  symbol: "ETH",
  name: "Ethereum",
  address: "0x0000000000000000000000000000000000000000",
  decimals: 18,
  isNative: true,
  isBaseCurrency: true,
  iconUrl: "https://ethereum.org/static/6b935ac0e6194247347855e56dcb4770/6ee09/eth-diamond-purple.png",
  assetType: "native",
};

export const USDG: V2TokenInfo = {
  symbol: "USDG",
  name: "Global Dollar",
  address: "0x2D92D94a45aFe77f6b0f191D5F4b11f7A2d1D50f",
  decimals: 6,
  isBaseCurrency: true,
  iconUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  assetType: "stablecoin",
};

export const FEATURED_ROBINHOOD_ASSETS: V2TokenInfo[] = [
  {
    symbol: "SPYR",
    name: "SPDR S&P 500 ETF Token",
    underlyingTicker: "SPY",
    address: "0x1111111111111111111111111111111111111111",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/spdr-s-and-p-500-etf-trust-logo.png",
    assetType: "etf",
  },
  {
    symbol: "QQQR",
    name: "Invesco QQQ Trust Token",
    underlyingTicker: "QQQ",
    address: "0x2222222222222222222222222222222222222222",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/invesco-qqq-logo.png",
    assetType: "etf",
  },
  {
    symbol: "GLDR",
    name: "SPDR Gold Shares Token",
    underlyingTicker: "GLD",
    address: "0x3333333333333333333333333333333333333333",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/pax-gold-paxg-logo.png",
    assetType: "commodity",
  },
  {
    symbol: "AAPLR",
    name: "Apple Inc. Token",
    underlyingTicker: "AAPL",
    address: "0x4444444444444444444444444444444444444444",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/apple-logo.png",
    assetType: "equity",
  },
  {
    symbol: "TSLAR",
    name: "Tesla Inc. Token",
    underlyingTicker: "TSLA",
    address: "0x5555555555555555555555555555555555555555",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/tesla-motors-logo.png",
    assetType: "equity",
  },
  {
    symbol: "NVDAR",
    name: "NVIDIA Corp. Token",
    underlyingTicker: "NVDA",
    address: "0x6666666666666666666666666666666666666666",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/nvidia-logo.png",
    assetType: "equity",
  },
  {
    symbol: "GOOGLR",
    name: "Alphabet Inc. Token",
    underlyingTicker: "GOOGL",
    address: "0x7777777777777777777777777777777777777777",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/google-logo.png",
    assetType: "equity",
  },
  {
    symbol: "AMZNR",
    name: "Amazon.com Inc. Token",
    underlyingTicker: "AMZN",
    address: "0x8888888888888888888888888888888888888888",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/amazon-logo.png",
    assetType: "equity",
  },
  {
    symbol: "MSFTR",
    name: "Microsoft Corp. Token",
    underlyingTicker: "MSFT",
    address: "0x9999999999999999999999999999999999999999",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/microsoft-logo.png",
    assetType: "equity",
  },
  {
    symbol: "COINR",
    name: "Coinbase Global Token",
    underlyingTicker: "COIN",
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    decimals: 18,
    iconUrl: "https://cryptologos.cc/logos/coinbase-logo.png",
    assetType: "equity",
  },
];

export const ALL_ROBINHOOD_ASSETS: V2TokenInfo[] = [
  ETH,
  USDG,
  ...FEATURED_ROBINHOOD_ASSETS,
];

export function resolveV2Token(symbolOrAddress: string): V2TokenInfo | null {
  if (!symbolOrAddress) return null;
  const clean = symbolOrAddress.trim().toLowerCase();

  return (
    ALL_ROBINHOOD_ASSETS.find(
      (t) =>
        t.symbol.toLowerCase() === clean ||
        t.address.toLowerCase() === clean ||
        t.underlyingTicker?.toLowerCase() === clean ||
        t.name.toLowerCase() === clean
    ) || null
  );
}
