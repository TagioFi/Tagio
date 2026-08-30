import { erc20Abi, getAddress, isAddress } from "viem";
import { config } from "../config";
import { getPublicClient } from "../v1/services/onchain/client";

// ============================================================================
// SECTION 1: ROBINHOOD CHAIN TOKENS & EQUITIES (Preserved for Robinhood Engine)
// ============================================================================

export interface TokenInfo {
  symbol: string;
  address: `0x${string}`;
  native?: boolean;
  decimals: number;
}

export const USDG: TokenInfo = {
  symbol: "USDG",
  address: config.robinhood.usdgAddress,
  decimals: 6,
};

export const ETH: TokenInfo = {
  symbol: "ETH",
  address: config.uniswap.wethAddress,
  native: true,
  decimals: 18,
};

export const ROBINHOOD_STOCK_TOKENS: TokenInfo[] = [
  { symbol: "AAPL", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", decimals: 18 },
  { symbol: "TSLA", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", decimals: 18 },
  { symbol: "NVDA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", decimals: 18 },
  { symbol: "GOOGL", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", decimals: 18 },
  { symbol: "AMZN", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18 },
  { symbol: "MSFT", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", decimals: 18 },
  { symbol: "META", address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", decimals: 18 },
  { symbol: "COIN", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", decimals: 18 },
  { symbol: "SPCX", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", decimals: 18 },
];

export const STOCK_TOKENS = ROBINHOOD_STOCK_TOKENS;

const ROBINHOOD_TICKER_ALIASES: Record<string, string> = {
  SPY: "SPCX",
};

export function findToken(symbol: string): TokenInfo | undefined {
  const upper = ROBINHOOD_TICKER_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
  if (upper === USDG.symbol) return USDG;
  if (upper === ETH.symbol) return ETH;
  return ROBINHOOD_STOCK_TOKENS.find((t) => t.symbol === upper);
}

export async function resolveToken(input: string): Promise<TokenInfo | undefined> {
  const known = findToken(input);
  if (known) return known;

  const trimmed = input.trim();
  if (!isAddress(trimmed)) return undefined;

  const address = getAddress(trimmed);
  const client = getPublicClient();

  try {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
      client
        .readContract({ address, abi: erc20Abi, functionName: "symbol" })
        .catch(() => address.slice(0, 8)),
    ]);
    if (typeof decimals !== "number") return undefined;
    return { symbol: String(symbol), address, decimals };
  } catch {
    return undefined;
  }
}

// ============================================================================
// SECTION 2: SOLANA TOKENS & xSTOCKS (UI Surface & Solana Intent Layer)
// ============================================================================

export interface SolanaTokenInfo {
  slug?: string;
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  isNative?: boolean;
  isBaseCurrency?: boolean;
  underlyingTicker?: string;
  iconUrl?: string;
}

// ── Base Working Currencies (SOL & USDC only) ──────────────────────────────

export const SOL: SolanaTokenInfo = {
  symbol: "SOL",
  name: "Solana",
  mint: "11111111111111111111111111111111",
  decimals: 9,
  isNative: true,
  isBaseCurrency: true,
  iconUrl: "https://assets.relay.link/icons/792703809/light.png",
};

export const USDC: SolanaTokenInfo = {
  symbol: "USDC",
  name: "USD Coin",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
  isBaseCurrency: true,
  iconUrl: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png?1696506694",
};

export const SOLANA_BASE_CURRENCIES: SolanaTokenInfo[] = [SOL, USDC];

// ── Curated Featured xStocks on Solana ─────────────────────────────────────

export const FEATURED_SOLANA_STOCKS: SolanaTokenInfo[] = [
  {
    "slug": "alphabet-xstock",
    "name": "Alphabet xStock",
    "symbol": "GOOGLx",
    "underlyingTicker": "GOOGL",
    "mint": "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684aae04a3d8452e0ae4bad8_Ticker%3DGOOG%2C%20Company%20Name%3DAlphabet%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "amazon-xstock",
    "name": "Amazon xStock",
    "symbol": "AMZNx",
    "underlyingTicker": "AMZN",
    "mint": "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497d354d7140b01657a793_Ticker%3DAMZN%2C%20Company%20Name%3DAmazon.com%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "amd-xstock",
    "name": "AMD xStock",
    "symbol": "AMDx",
    "underlyingTicker": "AMD",
    "mint": "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9239eabefb77e81ffb2bd_Ticker%3DAMDx%2C%20Company%20Name%3DAMD%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "apple-xstock",
    "name": "Apple xStock",
    "symbol": "AAPLx",
    "underlyingTicker": "AAPL",
    "mint": "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6849799260ee65bf38841f90_Ticker%3DAAPL%2C%20Company%20Name%3DApple%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "coinbase-xstock",
    "name": "Coinbase xStock",
    "symbol": "COINx",
    "underlyingTicker": "COIN",
    "mint": "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c131b2d6d8cbe9e61a3dc_Ticker%3DCOIN%2C%20Company%20Name%3DCoinbase%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "meta-xstock",
    "name": "Meta xStock",
    "symbol": "METAx",
    "underlyingTicker": "META",
    "mint": "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497dee3db1bae97b91ac05_Ticker%3DMETA%2C%20Company%20Name%3DMeta%20Platforms%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "microsoft-xstock",
    "name": "Microsoft xStock",
    "symbol": "MSFTx",
    "underlyingTicker": "MSFT",
    "mint": "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497bdc918924ea97fd8211_Ticker%3DMSFT%2C%20Company%20Name%3DMicrosoft%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "nasdaq-xstock",
    "name": "Nasdaq xStock",
    "symbol": "QQQx",
    "underlyingTicker": "QQQ",
    "mint": "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68511cb6e367f19f06664527_QQQx.svg",
    "decimals": 8
  },
  {
    "slug": "netflix-xstock",
    "name": "Netflix xStock",
    "symbol": "NFLXx",
    "underlyingTicker": "NFLX",
    "mint": "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf6c149d917d503f6cda6_Ticker%3DNFLX%2C%20Company%20Name%3DNetflix%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "nvidia-xstock",
    "name": "NVIDIA xStock",
    "symbol": "NVDAx",
    "underlyingTicker": "NVDA",
    "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684961bfb45e3c4d777b9997_Ticker%3DNVDA%2C%20Company%20Name%3DNVIDIA%20Corp%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "palantir-xstock",
    "name": "Palantir xStock",
    "symbol": "PLTRx",
    "underlyingTicker": "PLTR",
    "mint": "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0c4c0e5466272c52958b_Ticker%3DPLTR%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "sp500-xstock",
    "name": "SP500 xStock",
    "symbol": "SPYx",
    "underlyingTicker": "SPY",
    "mint": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/685116624ae31d5ceb724895_Ticker%3DSPX%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "tesla-xstock",
    "name": "Tesla xStock",
    "symbol": "TSLAx",
    "underlyingTicker": "TSLA",
    "mint": "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684aaf9559b2312c162731f5_Ticker%3DTSLA%2C%20Company%20Name%3DTesla%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  }
];

// ── Complete xStocks Directory on Solana (714 Assets) ─────────────────────

export const ALL_SOLANA_XSTOCKS: SolanaTokenInfo[] = [
  {
    "slug": "3m-xstock",
    "name": "3M xStock",
    "symbol": "MMMx",
    "underlyingTicker": "MMM",
    "mint": "XsTEo8W2L8JprN57bmJgatDT84z57ReJYizr5f32BfP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d8b6da94eb4c75e620_MMMx.png",
    "decimals": 8
  },
  {
    "slug": "abbott-xstock",
    "name": "Abbott xStock",
    "symbol": "ABTx",
    "underlyingTicker": "ABT",
    "mint": "XsHtf5RpxsQ7jeJ9ivNewouZKJHbPxhPoEy6yYvULr7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf6359f8fa1d916afe97b_Ticker%3DABT%2C%20Company%20Name%3DAbbot%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "abbvie-xstock",
    "name": "AbbVie xStock",
    "symbol": "ABBVx",
    "underlyingTicker": "ABBV",
    "mint": "XswbinNKyPmzTa5CskMbCPvMW6G5CMnZXZEeQSSQoie",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be7c58986cdaeeee5bbba_Ticker%3DABBV%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "abrdn-physical-palladium-shares-xstock",
    "name": "abrdn Physical Palladium Shares xStock",
    "symbol": "PALLx",
    "underlyingTicker": "PALL",
    "mint": "XsTTtPA5V19YwHKDv4xeVXNM6kdsQNJvg3MyWkRUckt",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833cfc391ee68cb46210fa_Ticker%3DPALLx%2C%20Company%20Name%3DPhysical%20Palladium%20Shares%20ETF%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "abrdn-physical-platinum-shares-xstock",
    "name": "abrdn Physical Platinum Shares xStock",
    "symbol": "PPLTx",
    "underlyingTicker": "PPLT",
    "mint": "Xst6eFD4YT6sz9RLMysN9SyvaZWtraSdVJQGu5ZkAme",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833d08dffe581c71e9abbe_Ticker%3DPPLTx%2C%20Company%20Name%3DPhysical%20Platinum%20Shares%20ETF%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "accenture-xstock",
    "name": "Accenture xStock",
    "symbol": "ACNx",
    "underlyingTicker": "ACN",
    "mint": "Xs5UJzmCRQ8DWZjskExdSQDnbE6iLkRu2jjrRAB1JSU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0b0e15af8be8257db52f_Ticker%3DACN%2C%20Company%20Name%3Daccenture%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "adobe-xstock",
    "name": "Adobe xStock",
    "symbol": "ADBEx",
    "underlyingTicker": "ADBE",
    "mint": "XsDZMGEU8zadWFCkTtPBoPWYcUX3JHVmghnwf2Mve2q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68df8f74c808c83ef5b43335_Ticker%3DADBEx%2C%20Company%20Name%3DAdobe%20Inc%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "aflac-xstock",
    "name": "Aflac xStock",
    "symbol": "AFLx",
    "underlyingTicker": "AFL",
    "mint": "XsQ2JJPzG5EMvkRPSshA1mmpVvGPKBNYQmvuEnzpJhZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e223be2927c9329f9347_AFLx.png",
    "decimals": 8
  },
  {
    "slug": "agilent-technologies-xstock",
    "name": "Agilent Technologies xStock",
    "symbol": "Ax",
    "underlyingTicker": "A",
    "mint": "Xs5drDwMFxkcChq5cU49EX2oTQUVWQ64qsSL5bVQoS3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2551e352bc5cecd76f7_Ax.png",
    "decimals": 8
  },
  {
    "slug": "aia-xstock",
    "name": "AIA xStock",
    "symbol": "AIAGRx",
    "underlyingTicker": "AIAGR",
    "mint": "XsQk7zRMNmbgSr4ZnvANH4enGH7zkUAtahKuckYy7x7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b98d6487a776d7abfd_AIAGRx.png",
    "decimals": 8
  },
  {
    "slug": "air-products-and-chemicals-xstock",
    "name": "Air Products and Chemicals xStock",
    "symbol": "APDx",
    "underlyingTicker": "APD",
    "mint": "XsdeDQyocwoXYq4rvm3eAxN4uDUqww78i9nKLABhp6h",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e20c2f7186b52061d672_APDx.png",
    "decimals": 8
  },
  {
    "slug": "airbnb-xstock",
    "name": "Airbnb xStock",
    "symbol": "ABNBx",
    "underlyingTicker": "ABNB",
    "mint": "XscSc1zjbVizEnhCzzehJ9fzztm3WRKdn9pjmriKDuN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e218b588832a4c881ae0_ABNBx.png",
    "decimals": 8
  },
  {
    "slug": "akamai-technologies-xstock",
    "name": "Akamai Technologies xStock",
    "symbol": "AKAMx",
    "underlyingTicker": "AKAM",
    "mint": "XsJW9EhZBVQawVj1aGFweU2LwQjZCvyHVYb3vXq8s99",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d495063765fcf36dc6_AKAMx.png",
    "decimals": 8
  },
  {
    "slug": "albemarle-xstock",
    "name": "Albemarle xStock",
    "symbol": "ALBx",
    "underlyingTicker": "ALB",
    "mint": "XsGea4488p7ydWQTQMYxtvCXDJiAJwgt4HsoKiKrGa3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d2f7bf3b5638348fb8_ALBx.png",
    "decimals": 8
  },
  {
    "slug": "alcoa-xstock",
    "name": "Alcoa xStock",
    "symbol": "AAx",
    "underlyingTicker": "AA",
    "mint": "Xs2XDRGh6AhivmYgaVa8woDGKGccR1WnnGnw9vqSWD9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e99e65d1c9321055ac_AAx.png",
    "decimals": 8
  },
  {
    "slug": "align-technology-xstock",
    "name": "Align Technology xStock",
    "symbol": "ALGNx",
    "underlyingTicker": "ALGN",
    "mint": "XsmMYEkQRXZ9CodFfqGEwNvtqVZdsDLHoYqPVm2EpHX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33bf6cce9266a5824a2_ALGNx.png",
    "decimals": 8
  },
  {
    "slug": "alliant-energy-xstock",
    "name": "Alliant Energy xStock",
    "symbol": "LNTx",
    "underlyingTicker": "LNT",
    "mint": "Xs1WFZQyEwCZwEyZHRxTzd2KoEoa6MVfv2aZeAc2HXK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d8de2cb121e35752e7_LNTx.png",
    "decimals": 8
  },
  {
    "slug": "allstate-xstock",
    "name": "Allstate xStock",
    "symbol": "ALLx",
    "underlyingTicker": "ALL",
    "mint": "Xs1kbMkmahb44LPLLdjscSYZ4c2HUu4WNfgk8P7ndQf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21a28410e9537a9323c_ALLx.png",
    "decimals": 8
  },
  {
    "slug": "ally-financial-xstock",
    "name": "Ally Financial xStock",
    "symbol": "ALLYx",
    "underlyingTicker": "ALLY",
    "mint": "XsRifLZvp2XvCpPFQNK6XGTjHSL7sTZmmGyEs4NLAV2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33012b481cd10a7c39e_ALLYx.png",
    "decimals": 8
  },
  {
    "slug": "alnylam-pharmaceuticals-xstock",
    "name": "Alnylam Pharmaceuticals xStock",
    "symbol": "ALNYx",
    "underlyingTicker": "ALNY",
    "mint": "Xs1asXCeRWVFLE3mun2UZhaY9VEDYfyjUhp5mjkjX7b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25a953f0b6f81d40f37_ALNYx.png",
    "decimals": 8
  },
  {
    "slug": "alphabet-xstock",
    "name": "Alphabet xStock",
    "symbol": "GOOGLx",
    "underlyingTicker": "GOOGL",
    "mint": "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684aae04a3d8452e0ae4bad8_Ticker%3DGOOG%2C%20Company%20Name%3DAlphabet%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "altria-xstock",
    "name": "Altria xStock",
    "symbol": "MOx",
    "underlyingTicker": "MO",
    "mint": "XsztStxbbGZE63p8DyD8YCpzyWFJwwy2PNcyaf3cZz8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b93dedcedc87d89301_MOx.png",
    "decimals": 8
  },
  {
    "slug": "amazon-xstock",
    "name": "Amazon xStock",
    "symbol": "AMZNx",
    "underlyingTicker": "AMZN",
    "mint": "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497d354d7140b01657a793_Ticker%3DAMZN%2C%20Company%20Name%3DAmazon.com%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "amber-xstock",
    "name": "Amber xStock",
    "symbol": "AMBRx",
    "underlyingTicker": "AMBR",
    "mint": "XsaQTCgebC2KPbf27KUhdv5JFvHhQ4GDAPURwrEhAzb",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68652e463fd5d0c86d866c65_AMBRx.svg",
    "decimals": 8
  },
  {
    "slug": "amd-xstock",
    "name": "AMD xStock",
    "symbol": "AMDx",
    "underlyingTicker": "AMD",
    "mint": "XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9239eabefb77e81ffb2bd_Ticker%3DAMDx%2C%20Company%20Name%3DAMD%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "ameren-xstock",
    "name": "Ameren xStock",
    "symbol": "AEEx",
    "underlyingTicker": "AEE",
    "mint": "XssLKajmwH79hK14cqp65fFg2Eyteh23nmSaJpKRmzx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e270ab2b9761d3a54fda_AEEx.png",
    "decimals": 8
  },
  {
    "slug": "american-electric-power-xstock",
    "name": "American Electric Power xStock",
    "symbol": "AEPx",
    "underlyingTicker": "AEP",
    "mint": "XsP8GpS93XjmDg5oVVCVqZsffkWadVCqZYp4BFFJnJm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1fe9e65d1c9320fa428_AEPx.png",
    "decimals": 8
  },
  {
    "slug": "american-international-xstock",
    "name": "American International xStock",
    "symbol": "AIGx",
    "underlyingTicker": "AIG",
    "mint": "XsTg4SHooxeYYvQK5Q2wdKBKY46UdtZkF2LfNwbHEtu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2486f3f12933f870562_AIGx.png",
    "decimals": 8
  },
  {
    "slug": "american-tower-xstock",
    "name": "American Tower xStock",
    "symbol": "AMTx",
    "underlyingTicker": "AMT",
    "mint": "XsvYPZkrDDg7259oDv5E76HSmeLWgHPgNEQ44KVbJJU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d724dc85407f79c774_AMTx.png",
    "decimals": 8
  },
  {
    "slug": "american-water-works-xstock",
    "name": "American Water Works xStock",
    "symbol": "AWKx",
    "underlyingTicker": "AWK",
    "mint": "XsUQA7YBvJyBXDrQy23WNydKWdhVCPRVMxEF6MgXytd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e29f536f62aa99a9a304_AWKx.png",
    "decimals": 8
  },
  {
    "slug": "ameriprise-financial-xstock",
    "name": "Ameriprise Financial xStock",
    "symbol": "AMPx",
    "underlyingTicker": "AMP",
    "mint": "XsqWwT9y8ajA8LXQEy7msQmM6ExkP8Va3XYcr7oVhXg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e245b588832a4c885de6_AMPx.png",
    "decimals": 8
  },
  {
    "slug": "ametek-xstock",
    "name": "AMETEK xStock",
    "symbol": "AMEx",
    "underlyingTicker": "AME",
    "mint": "XsVNxwvuQghf6TYBmCck75ddYD3KiWozujR8C67bPXC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e227268c11bbce9913b2_AMEx.png",
    "decimals": 8
  },
  {
    "slug": "amgen-xstock",
    "name": "Amgen xStock",
    "symbol": "AMGNx",
    "underlyingTicker": "AMGN",
    "mint": "XsgKwBMbv8LDzEYRgbKtyqsub6QB56PQVzgTGbiGaNe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a31781f40f2ddc0da3_AMGNx.png",
    "decimals": 8
  },
  {
    "slug": "amphenol-xstock",
    "name": "Amphenol xStock",
    "symbol": "APHx",
    "underlyingTicker": "APH",
    "mint": "XsvqNba1k4wF5ZEZ6Nrx8AXUDkKzAFuj4HaVDEemyYH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a37cc5b77e68cd06d3_APHx.png",
    "decimals": 8
  },
  {
    "slug": "analog-devices-xstock",
    "name": "Analog Devices xStock",
    "symbol": "ADIx",
    "underlyingTicker": "ADI",
    "mint": "Xs3CytsvJshAYy1TQjq2o2yVWCyEGinNpvkB6f3Qs31",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a0953f0b6f81d36b85_ADIx.png",
    "decimals": 8
  },
  {
    "slug": "annaly-capital-management-xstock",
    "name": "Annaly Capital Management xStock",
    "symbol": "NLYx",
    "underlyingTicker": "NLY",
    "mint": "XsFzP3jXofHQ3GKPYoGfFNQQKyWrNcPR5Xgg8gbk9op",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fb4e56d67ba7ec7406_NLYx.png",
    "decimals": 8
  },
  {
    "slug": "anta-sports-products-xstock",
    "name": "ANTA Sports Products xStock",
    "symbol": "ANTASx",
    "underlyingTicker": "ANTAS",
    "mint": "XsdP2Pc9F6UsUujiydSsBGZGNYpDMivEjNfQ1ytHD1P",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099ebbbbdc8cd7f900090_ANTASx.png",
    "decimals": 8
  },
  {
    "slug": "apa-xstock",
    "name": "APA xStock",
    "symbol": "APAx",
    "underlyingTicker": "APA",
    "mint": "Xs5b8FFins32GgTH2FURV3Y873yA85jc4kZ6r8H9YyR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33ac7e87feb70acfe9a_APAx.png",
    "decimals": 8
  },
  {
    "slug": "api-xstock",
    "name": "APi xStock",
    "symbol": "APGx",
    "underlyingTicker": "APG",
    "mint": "XsNKyNtZCbtcCFtJHSeKTGqNQ9gCEaAaKrZBzPH5LLS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34f1781f40f2ddd91cb_APGx.png",
    "decimals": 8
  },
  {
    "slug": "apollo-global-management-xstock",
    "name": "Apollo Global Management xStock",
    "symbol": "APOx",
    "underlyingTicker": "APO",
    "mint": "XsosRSUc3n5pod3YNNyQ7go6811xWYd3YME2uEQohEx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21d4a6aeb33d139bf67_APOx.png",
    "decimals": 8
  },
  {
    "slug": "apple-xstock",
    "name": "Apple xStock",
    "symbol": "AAPLx",
    "underlyingTicker": "AAPL",
    "mint": "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6849799260ee65bf38841f90_Ticker%3DAAPL%2C%20Company%20Name%3DApple%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "applied-digital-corporation-xstock",
    "name": "Applied Digital Corporation xStock",
    "symbol": "APLDx",
    "underlyingTicker": "APLD",
    "mint": "Xs2ZEuDVSQkNnXHqfqEYKVShLHpecyKfdfpEYwiHtQE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470257481c80f2c6353f6_APLDx.png",
    "decimals": 8
  },
  {
    "slug": "applied-industrial-technologies-xstock",
    "name": "Applied Industrial Technologies xStock",
    "symbol": "AITx",
    "underlyingTicker": "AIT",
    "mint": "XsvJzDTuRrc3cWVwPXVcaXaFJFVtGcpDsfCA56z868Q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33f9e65d1c932109690_AITx.png",
    "decimals": 8
  },
  {
    "slug": "applied-materials-inc-xstock",
    "name": "Applied Materials, Inc. xStock",
    "symbol": "AMATx",
    "underlyingTicker": "AMAT",
    "mint": "XsQZdaWUAGC4R3fgD2N1fupKvJfJq6YM51ccnsLUWFA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47023b7c373efc6a089a2_AMATx.png",
    "decimals": 8
  },
  {
    "slug": "applied-optoelectronics-xstock",
    "name": "Applied Optoelectronics xStock",
    "symbol": "AAOIx",
    "underlyingTicker": "AAOI",
    "mint": "XsGHwSbPaUJu6r5dtJLHXkXenPgCQf4Sx2hb4e2sbCZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a69085d327c6daf7177dfc4_AAOIx.png",
    "decimals": 8
  },
  {
    "slug": "applovin-xstock",
    "name": "AppLovin xStock",
    "symbol": "APPx",
    "underlyingTicker": "APP",
    "mint": "XsPdAVBi8Zc1xvv53k4JcMrQaEDTgkGqKYeh7AYgPHV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0deccaecf631c0c174ea_Ticker%3DAPP%2C%20Company%20Name%3Dapp%20lovin%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "aramark-xstock",
    "name": "Aramark xStock",
    "symbol": "ARMKx",
    "underlyingTicker": "ARMK",
    "mint": "XsVhUJLbtEhVSPHFcyjZYYXJqmK8j8kfD553wZ8of6W",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31a28410e9537aa07a8_ARMKx.png",
    "decimals": 8
  },
  {
    "slug": "archer-daniels-midland-xstock",
    "name": "Archer-Daniels-Midland xStock",
    "symbol": "ADMx",
    "underlyingTicker": "ADM",
    "mint": "XsK6kBQe7QDQVmW1PupBZCc4oBpPbsRdPgvqCqvfCXX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e254c8a1cd3be66f4a45_ADMx.png",
    "decimals": 8
  },
  {
    "slug": "ares-management-xstock",
    "name": "Ares Management xStock",
    "symbol": "ARESx",
    "underlyingTicker": "ARES",
    "mint": "Xsm7SVTuyeaeD5fwaWD1RFKX7Rr8WmNGz5j35r5npth",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2994f2d04f1d9a785ec_ARESx.png",
    "decimals": 8
  },
  {
    "slug": "arista-networks-inc-xstock",
    "name": "Arista Networks, Inc. xStock",
    "symbol": "ANETx",
    "underlyingTicker": "ANET",
    "mint": "XsrsM2RgtYxXqxmy4iWgxQJUkkHG1U5wzi74sVNUW8m",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47023dc9ec064bb61c554_ANETx.png",
    "decimals": 8
  },
  {
    "slug": "arm-xstock",
    "name": "ARM xStock",
    "symbol": "ARMx",
    "underlyingTicker": "ARM",
    "mint": "XswUFSYE5CWsZM3X3yo6e2pZvxcAzx912DonGvgUFka",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690855c35bdb064f67fa66_ARMx.png",
    "decimals": 8
  },
  {
    "slug": "arrow-electronics-xstock",
    "name": "Arrow Electronics xStock",
    "symbol": "ARWx",
    "underlyingTicker": "ARW",
    "mint": "XscZvQvu7gYS4yuF3NcCeDbQjQynZ823xGCk9uUVePN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33828410e9537aa1c5e_ARWx.png",
    "decimals": 8
  },
  {
    "slug": "arthur-j-gallagher-xstock",
    "name": "Arthur J. Gallagher xStock",
    "symbol": "AJGx",
    "underlyingTicker": "AJG",
    "mint": "XsYka4UhXnzoqmdPCfqX8EZBQcN2MkrG4gJt4SxGvsN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2254f11a0bdd7093080_AJGx.png",
    "decimals": 8
  },
  {
    "slug": "asml-xstock",
    "name": "ASML xStock",
    "symbol": "ASMLx",
    "underlyingTicker": "ASML",
    "mint": "XshuHQ6o6SVpUNawvnnTMxsZ4tacZsNgVCLorv7TkFq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9243c0d1fea07994767cc_Ticker%3DASMLx%2C%20Company%20Name%3DASML%20xStock%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "asmpt-xstock",
    "name": "ASMPT xStock",
    "symbol": "ASMPTx",
    "underlyingTicker": "ASMPT",
    "mint": "XscQZXWUx2vw2cP1oQSBgRVJaky1pV6anaAKomxoFYn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a2daa87a2c3a3b57c5c_ASMPTx.png",
    "decimals": 8
  },
  {
    "slug": "assurant-xstock",
    "name": "Assurant xStock",
    "symbol": "AIZx",
    "underlyingTicker": "AIZ",
    "mint": "Xs7U7QD6amUpjuEZ1VM3rx5TSrKtJ3r7xU1aRcTHhw8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32df7bf3b563834d766_AIZx.png",
    "decimals": 8
  },
  {
    "slug": "ast-spacemobile-xstock",
    "name": "AST SpaceMobile xStock",
    "symbol": "ASTSx",
    "underlyingTicker": "ASTS",
    "mint": "XsR4LAtaBgTKTRUhiijY1ba13nx4bepeEcag2Pr4dZ1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da374316d501a3dcc5f164_Ticker%3DASTSx%2C%20Company%20Name%3DAST%20SpaceMobile%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "astera-labs-xstock",
    "name": "Astera Labs xStock",
    "symbol": "ALABx",
    "underlyingTicker": "ALAB",
    "mint": "XsuJLDjTibUFnh1gNgnXeDSjQTVffnaWFKzUht5rVvc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e231e6a2081336f8ad24_ALABx.png",
    "decimals": 8
  },
  {
    "slug": "astrazeneca-xstock",
    "name": "AstraZeneca xStock",
    "symbol": "AZNx",
    "underlyingTicker": "AZN",
    "mint": "Xs3ZFkPYT2BN7qBMqf1j1bfTeTm1rFzEFSsQ1z3wAKU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf47b066fa1085ae953e9_Ticker%3DAZN%2C%20Company%20Name%3Dastrazeneca%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "ati-xstock",
    "name": "ATI xStock",
    "symbol": "ATIx",
    "underlyingTicker": "ATI",
    "mint": "Xs7jmdBozN4RTu3YgSZeLcimiHJcsovXjvRtHhJbafT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28ce6a2081336f92357_ATIx.png",
    "decimals": 8
  },
  {
    "slug": "atlassian-xstock",
    "name": "Atlassian xStock",
    "symbol": "TEAMx",
    "underlyingTicker": "TEAM",
    "mint": "XsLhefHBtc8r9nStXgXtu9tHeEWYRXxSXrpbnfwTJ7v",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30a4f11a0bdd70a04dc_TEAMx.png",
    "decimals": 8
  },
  {
    "slug": "atmos-energy-xstock",
    "name": "Atmos Energy xStock",
    "symbol": "ATOx",
    "underlyingTicker": "ATO",
    "mint": "Xsz1UqWKSjB4X7zcvXV6XVL5eBA2YaRqEjXZVP6GXwZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2843dedcedc87d969f5_ATOx.png",
    "decimals": 8
  },
  {
    "slug": "autodesk-xstock",
    "name": "Autodesk xStock",
    "symbol": "ADSKx",
    "underlyingTicker": "ADSK",
    "mint": "Xs2jBYo5VxMmuNjpBnMShsLB26dtK75bt42ag93ZdHU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2432421b195884ccfdb_ADSKx.png",
    "decimals": 8
  },
  {
    "slug": "automatic-data-processing-xstock",
    "name": "Automatic Data Processing xStock",
    "symbol": "ADPx",
    "underlyingTicker": "ADP",
    "mint": "XsCBDrb61PyQqTJp7uHhD4vj1MkD5UK6jpxUBbgG7i1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d1b961d4173306ea90_ADPx.png",
    "decimals": 8
  },
  {
    "slug": "autozone-xstock",
    "name": "AutoZone xStock",
    "symbol": "AZOx",
    "underlyingTicker": "AZO",
    "mint": "XsfLtqmidw4ouMrdWvH5usSs3r77Usm6rXGygxhRTjz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e22bc1a6bf4e7d217a06_AZOx.png",
    "decimals": 8
  },
  {
    "slug": "avery-dennison-xstock",
    "name": "Avery Dennison xStock",
    "symbol": "AVYx",
    "underlyingTicker": "AVY",
    "mint": "XsAfpyk9U7qUZKq9STpXyzDaoQjGRe6Yqo7TYebpxkx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e335253b5873d2d0788c_AVYx.png",
    "decimals": 8
  },
  {
    "slug": "axon-enterprise-xstock",
    "name": "Axon Enterprise xStock",
    "symbol": "AXONx",
    "underlyingTicker": "AXON",
    "mint": "Xshh7vNfHqyqbnfuvhn8o53wXcuUbBYKASPq8DEHPbx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2652fd4a49f2e674adf_AXONx.png",
    "decimals": 8
  },
  {
    "slug": "baker-hughes-xstock",
    "name": "Baker Hughes xStock",
    "symbol": "BKRx",
    "underlyingTicker": "BKR",
    "mint": "XsBE7iAzaJEBpSwG5JZ7zQTWNgTaerweBy7nJCachaJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690850ec1c4f616f104d09_BKRx.png",
    "decimals": 8
  },
  {
    "slug": "ball-xstock",
    "name": "Ball xStock",
    "symbol": "BALLx",
    "underlyingTicker": "BALL",
    "mint": "Xsy9RdWC26fp8c84BB2SD4eE74vG1478YKjxAwjRRQY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ffc1a6bf4e7d223b83_BALLx.png",
    "decimals": 8
  },
  {
    "slug": "bank-of-america-xstock",
    "name": "Bank of America xStock",
    "symbol": "BACx",
    "underlyingTicker": "BAC",
    "mint": "XswsQk4duEQmCbGzfqUUWYmi7pV7xpJ9eEmLHXCaEQP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf5a74604b4f162fd0efd_Ticker%3DBAC%2C%20Company%20Name%3DBank%20of%20America%20Corporation%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "bank-of-china-xstock",
    "name": "Bank Of China xStock",
    "symbol": "BANKCx",
    "underlyingTicker": "BANKC",
    "mint": "Xs3uhDYpQGfkeZ7rrzQgmozWQHC5uDLUa6iAN65qHM1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b2de2d7051659a41f6_BANKx.png",
    "decimals": 8
  },
  {
    "slug": "bank-of-communications-xstock",
    "name": "Bank of Communications xStock",
    "symbol": "BOCOMx",
    "underlyingTicker": "BOCOM",
    "mint": "XscjyoChdmwiZwDzQZQXEVFsyYTc6Bhfn9TzyfufjVd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099ca03ec3d86e37b07b0_BOCOMx.png",
    "decimals": 8
  },
  {
    "slug": "bank-of-new-york-mellon-xstock",
    "name": "Bank of New York Mellon xStock",
    "symbol": "BNYx",
    "underlyingTicker": "BNY",
    "mint": "Xs2hXX5B6aYUn1Nf8RkspKQbBTjbsa1Co9SjpwgZbNr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34924dc85407f7b1feb_BNYx.png",
    "decimals": 8
  },
  {
    "slug": "becton-dickinson-xstock",
    "name": "Becton Dickinson xStock",
    "symbol": "BDXx",
    "underlyingTicker": "BDX",
    "mint": "Xs3yrczxLidKAArdTKepU5NV8KUmwFM11NMyYbGqWDZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2453d340815b60dbe73_BDXx.png",
    "decimals": 8
  },
  {
    "slug": "bending-spoons-xstock",
    "name": "Bending Spoons xStock",
    "symbol": "BSPx",
    "underlyingTicker": "BSP",
    "mint": "XsYMHtwJcWon5GkPHzdDbCCztKtKzEurJnbydxgjsqS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a3ecfd740764aa1079e905d_BSPx.png",
    "decimals": 8
  },
  {
    "slug": "berkshire-hathaway-xstock",
    "name": "Berkshire Hathaway xStock",
    "symbol": "BRK.Bx",
    "underlyingTicker": "BRK.B",
    "mint": "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684ab977b76d1a151f09c858_Ticker%3DBRK.B%2C%20Company%20Name%3Dberkshire-hathaway%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "best-buy-xstock",
    "name": "Best Buy xStock",
    "symbol": "BBYx",
    "underlyingTicker": "BBY",
    "mint": "Xsac5qkc4B254kpnb2qneeu6qsNX1fPtACeuNEiXWMR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30bda3d6aedb4350b94_BBYx.png",
    "decimals": 8
  },
  {
    "slug": "biogen-xstock",
    "name": "Biogen xStock",
    "symbol": "BIIBx",
    "underlyingTicker": "BIIB",
    "mint": "Xsv9aoiWTdvBzVpvetL7LBkuS9xvceDdbLkfqMbTVDx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2721e352bc5cecda626_BIIBx.png",
    "decimals": 8
  },
  {
    "slug": "bit-digital-xstock",
    "name": "Bit Digital xStock",
    "symbol": "BTBTx",
    "underlyingTicker": "BTBT",
    "mint": "XsPLBFy59Q3hY59KLAJur8QyvziMF4xUxGTxXqXE7cT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9282f3efdcd28f21c1cd3_Ticker%3DBTBTx%2C%20Company%20Name%3DBit%20Digital%2C%20Size%3D32x32-1.svg",
    "decimals": 8
  },
  {
    "slug": "bitgo-xstock",
    "name": "Bitgo xStock",
    "symbol": "BTGOx",
    "underlyingTicker": "BTGO",
    "mint": "XsvHMmbDcd14DHHW16PkxPGW7ks77ehxUv1E9Zmxgj4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833cc2a0e647a4eee200b2_Ticker%3DBTGOx%2C%20Company%20Name%3DBitgo%20holdings%20Inc.%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "bitmine-xstock",
    "name": "Bitmine xStock",
    "symbol": "BMNRx",
    "underlyingTicker": "BMNR",
    "mint": "XsrBCwaH8c46xiqXBChzobgufRKxQxAWUWbndgBNzFn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7dcba4814d0df92a40df3_Ticker%3DBMNRx%2C%20Company%20Name%3DBitmine%20xStock%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "bjs-wholesale-club-xstock",
    "name": "BJ's Wholesale Club xStock",
    "symbol": "BJx",
    "underlyingTicker": "BJ",
    "mint": "XsAGAMqiAySqkUDf5ZXCTR4v6hSgcBj7mQQy7w3Nja7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e341d09b3213b2db7392_BJx.png",
    "decimals": 8
  },
  {
    "slug": "blackstone-xstock",
    "name": "Blackstone xStock",
    "symbol": "BXx",
    "underlyingTicker": "BX",
    "mint": "XsYtTeabUTJnkxWrHZUChwcKpNq6BbqPbWs9ZgLk4Xa",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1cb253b5873d2cf5f7f_BXx.png",
    "decimals": 8
  },
  {
    "slug": "block-xstock",
    "name": "Block xStock",
    "symbol": "XYZx",
    "underlyingTicker": "XYZ",
    "mint": "XsDP3d7dBNMVVZT6W5abD9jxZPGbrenPaj322sWn9Ct",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24c9f3406f549bfdde0_XYZx.png",
    "decimals": 8
  },
  {
    "slug": "bloom-energy-xstock",
    "name": "Bloom Energy xStock",
    "symbol": "BEx",
    "underlyingTicker": "BE",
    "mint": "XsmGSEqT6VXpVis3aVBDxaNwPgHNXbkjkVUCncsLkNB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690856b20117c19d29be76_BEx.png",
    "decimals": 8
  },
  {
    "slug": "boc-hong-kong-xstock",
    "name": "BOC Hong Kong xStock",
    "symbol": "BOCHKx",
    "underlyingTicker": "BOCHK",
    "mint": "XsdyyYJSCDVHBdAujSoWnQEDBQi9Y85YxoGVueJNf1j",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099d15f6c613d42ea3a82_BOCHKx.png",
    "decimals": 8
  },
  {
    "slug": "boeing-xstock",
    "name": "Boeing xStock",
    "symbol": "BAx",
    "underlyingTicker": "BA",
    "mint": "XsBcnKnZMsPaerLiUQ4eMFy4Fjysot4RugYXYDjiqCP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a74f2d04f1d9a6bacd_BAx.png",
    "decimals": 8
  },
  {
    "slug": "borgwarner-xstock",
    "name": "BorgWarner xStock",
    "symbol": "BWAx",
    "underlyingTicker": "BWA",
    "mint": "Xs34rXKEs63rPs3qWZeAubRmSVJNG5hSy6Ubt7Qag2F",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fdc1a6bf4e7d223a54_BWAx.png",
    "decimals": 8
  },
  {
    "slug": "boston-scientific-xstock",
    "name": "Boston Scientific xStock",
    "symbol": "BSXx",
    "underlyingTicker": "BSX",
    "mint": "Xs7vm4sZj1LiNLvnxUCyUTuxRMTt4WGJfdbCASTYhN9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1fdf87302708562cc86_BSXx.png",
    "decimals": 8
  },
  {
    "slug": "brera-xstock",
    "name": "Brera xStock",
    "symbol": "SLMTx",
    "underlyingTicker": "SLMT",
    "mint": "XsPHkGBbztHCCe1RMhiAs7CxVqoghmyd6zDUfrbfVWG",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833cdc300503f3d144ab1c_Ticker%3DSLMTx%2C%20Company%20Name%3DBrera%20Holdings%20PLC%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "bristol-myers-squibb-xstock",
    "name": "Bristol-Myers Squibb xStock",
    "symbol": "BMYx",
    "underlyingTicker": "BMY",
    "mint": "Xsa3dm4UT6TdzPJV75UiuGUeGywYUnfSNhsV5nHPZEu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1bdc7e87feb70ab85d0_BMYx.png",
    "decimals": 8
  },
  {
    "slug": "broadcom-xstock",
    "name": "Broadcom xStock",
    "symbol": "AVGOx",
    "underlyingTicker": "AVGO",
    "mint": "XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684aaef288f41927892d12c1_Ticker%3DAVGO%2C%20Company%20Name%3DBroadcom%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "broadridge-financial-solutions-xstock",
    "name": "Broadridge Financial Solutions xStock",
    "symbol": "BRx",
    "underlyingTicker": "BR",
    "mint": "XsvEMALzsRVnPED4KEAd7pivT5ho9vgqzqZxQxNBkWW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ea9f3406f549c0c581_BRx.png",
    "decimals": 8
  },
  {
    "slug": "brookfield-asset-management-xstock",
    "name": "Brookfield Asset Management xStock",
    "symbol": "BAMx",
    "underlyingTicker": "BAM",
    "mint": "XsLdXScusw7mCSATbp7bWKfyBR1RVWEEayKgRcmJ8dZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2dccf0d8d5d6ca3bf24_BAMx.png",
    "decimals": 8
  },
  {
    "slug": "brown-brown-xstock",
    "name": "Brown & Brown xStock",
    "symbol": "BROx",
    "underlyingTicker": "BRO",
    "mint": "Xs9hw3a4acJr629NUzDbEC376rv3AhfmwvXm9BNnD9G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e41781f40f2ddd4275_BROx.png",
    "decimals": 8
  },
  {
    "slug": "budweiser-brewing-co-apac-xstock",
    "name": "Budweiser Brewing Co APAC xStock",
    "symbol": "BDWAPx",
    "underlyingTicker": "BDWAP",
    "mint": "XscpBVm2popZi9D3rPNEV5fyxonLfJeTZ8iFeowZQ9b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a1e882ab1db4373e906_BDWAPx.png",
    "decimals": 8
  },
  {
    "slug": "burlington-stores-xstock",
    "name": "Burlington Stores xStock",
    "symbol": "BURLx",
    "underlyingTicker": "BURL",
    "mint": "Xszn8sMqeBqfLDXAsDa9uEYo6WT3LYSD4jje2pGK6k5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bf52efb881364d1be5_BURLx.png",
    "decimals": 8
  },
  {
    "slug": "bwx-technologies-xstock",
    "name": "BWX Technologies xStock",
    "symbol": "BWXTx",
    "underlyingTicker": "BWXT",
    "mint": "XsVpsBVdjW8SWAu4jAjqJ9qnGYzBmUzNDRcG6uiZ9xo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e43bed1b88de0cd8db_BWXTx.png",
    "decimals": 8
  },
  {
    "slug": "byd-xstock",
    "name": "BYD xStock",
    "symbol": "BYDCOx",
    "underlyingTicker": "BYDCO",
    "mint": "Xsbcv5nSVTc5A7jRZNe2Sg6VtgCyyb32SC2nnaPK5MZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b780016b99e32849fa_BYDCOx.png",
    "decimals": 8
  },
  {
    "slug": "c-h-robinson-worldwide-xstock",
    "name": "C.H. Robinson Worldwide xStock",
    "symbol": "CHRWx",
    "underlyingTicker": "CHRW",
    "mint": "Xsm5zBfHeiGWjraGLwT8DwJhYGjUfhESs7QANcYVp8E",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2baa19a50c2f1973c2f_CHRWx.png",
    "decimals": 8
  },
  {
    "slug": "cadence-design-systems-xstock",
    "name": "Cadence Design Systems xStock",
    "symbol": "CDNSx",
    "underlyingTicker": "CDNS",
    "mint": "XsrB8RyBpbMWm8zCQutdT2n95BgNj4rJFfxuhHFjk2v",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c3c8a1cd3be66eb5b7_CDNSx.png",
    "decimals": 8
  },
  {
    "slug": "camden-property-trust-xstock",
    "name": "Camden Property Trust xStock",
    "symbol": "CPTx",
    "underlyingTicker": "CPT",
    "mint": "XsvoRXtZZfwvkLhp4qKPR9B9mcbuWakDUWnPszYw2BT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e339be2927c932a07964_CPTx.png",
    "decimals": 8
  },
  {
    "slug": "capital-one-financial-xstock",
    "name": "Capital One Financial xStock",
    "symbol": "COFx",
    "underlyingTicker": "COF",
    "mint": "Xstd4ems8vhfGwTngpXCzgnSvJ4oD7E5gExUue2KEZX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b8b588832a4c87b508_COFx.png",
    "decimals": 8
  },
  {
    "slug": "cardinal-health-xstock",
    "name": "Cardinal Health xStock",
    "symbol": "CAHx",
    "underlyingTicker": "CAH",
    "mint": "XsrstNGy7STAR22txNru2ahbEwdBadFJwYRCBNEQYBS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e226b961d41733073542_CAHx.png",
    "decimals": 8
  },
  {
    "slug": "carlisle-companies-xstock",
    "name": "Carlisle Companies xStock",
    "symbol": "CSLx",
    "underlyingTicker": "CSL",
    "mint": "XsATdqpeobhFEM71r5MgZe4E5BcHuWk6jSnYnHLYTwS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30d3dedcedc87d9e517_CSLx.png",
    "decimals": 8
  },
  {
    "slug": "carpenter-technology-xstock",
    "name": "Carpenter Technology xStock",
    "symbol": "CRSx",
    "underlyingTicker": "CRS",
    "mint": "Xs8FjYWcxTREaUj5hv77f4M2UCreGfP7HegLvqzX56X",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2879d738e95105bfc69_CRSx.png",
    "decimals": 8
  },
  {
    "slug": "carrier-global-xstock",
    "name": "Carrier Global xStock",
    "symbol": "CARRx",
    "underlyingTicker": "CARR",
    "mint": "XsvQh2FdVWMpbNsnYAbDNg38GtAWBEjcweJR42yRTgy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21f95063765fcf2ce18_CARRx.png",
    "decimals": 8
  },
  {
    "slug": "carvana-xstock",
    "name": "Carvana xStock",
    "symbol": "CVNAx",
    "underlyingTicker": "CVNA",
    "mint": "Xs8YT2AdFmjuG2HFjcvVTpXPwneiKNHMrR49muHY7z9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23ad09b3213b2dabfd8_CVNAx.png",
    "decimals": 8
  },
  {
    "slug": "caseys-general-stores-xstock",
    "name": "Casey's General Stores xStock",
    "symbol": "CASYx",
    "underlyingTicker": "CASY",
    "mint": "XsDBYWqoxayY5cqFWs6jNJn4wv5vbP3RkTNqceEQRGW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e267f87302708563270c_CASYx.png",
    "decimals": 8
  },
  {
    "slug": "caterpillar-xstock",
    "name": "Caterpillar xStock",
    "symbol": "CATx",
    "underlyingTicker": "CAT",
    "mint": "XsRvd1meWQ9kW1SrZPa1jokQqmBoPWWjd6wGTgdp5E6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1942f7186b52061757a_CATx.png",
    "decimals": 8
  },
  {
    "slug": "cathay-pacific-airways-xstock",
    "name": "Cathay Pacific Airways xStock",
    "symbol": "CTPCAx",
    "underlyingTicker": "CTPCA",
    "mint": "Xs9ZqDkZpNZ62FMdQeAQhz5a9fNQ7hXy2XCWDvEnpKn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a22bd300b45d168cf88_CTPCAx.png",
    "decimals": 8
  },
  {
    "slug": "cbre-xstock",
    "name": "CBRE xStock",
    "symbol": "CBREx",
    "underlyingTicker": "CBRE",
    "mint": "XsTJV8FFx22kv41kMcuHawx8eoDybUnLxiiEscw317x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24a17bc5767a5d23fd0_CBREx.png",
    "decimals": 8
  },
  {
    "slug": "cdw-xstock",
    "name": "CDW xStock",
    "symbol": "CDWx",
    "underlyingTicker": "CDW",
    "mint": "XsMmhKdFMiFdNFBcznYHx2zAU1SLtMnUL2G6bRzPpaY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34e4f2d04f1d9a83fb1_CDWx.png",
    "decimals": 8
  },
  {
    "slug": "cencora-xstock",
    "name": "Cencora xStock",
    "symbol": "CORx",
    "underlyingTicker": "COR",
    "mint": "Xsst4VThLi3nvYTsNCVwJi1z23LfXrdyKmhArkrSn1n",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e22c9e65d1c9320fc609_CORx.png",
    "decimals": 8
  },
  {
    "slug": "centene-xstock",
    "name": "Centene xStock",
    "symbol": "CNCx",
    "underlyingTicker": "CNC",
    "mint": "XsegJtRFtvC3qqhNYdN2QXxumd2fjvWQmithQZ33ehS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e269d09b3213b2dadced_CNCx.png",
    "decimals": 8
  },
  {
    "slug": "centerpoint-energy-xstock",
    "name": "CenterPoint Energy xStock",
    "symbol": "CNPx",
    "underlyingTicker": "CNP",
    "mint": "Xsx9i1A6e4xc9r5Gxxy4uZV4YSmwAXBJScvGLRv4nH2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e279e6a2081336f9141f_CNPx.png",
    "decimals": 8
  },
  {
    "slug": "cerebras-systems-xstock",
    "name": "Cerebras Systems xStock",
    "symbol": "CBRSx",
    "underlyingTicker": "CBRS",
    "mint": "Xstq9oUsBPd8LSyivHhnt8P8t9xK5RYoM9P6izLczvm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a69085a327c6daf7177dc88_CBRSx.png",
    "decimals": 8
  },
  {
    "slug": "cf-industries-xstock",
    "name": "CF Industries xStock",
    "symbol": "CFx",
    "underlyingTicker": "CF",
    "mint": "XsH9yfX7GuRbCDnNvD4A7x8gvMc8sc8Htz1fQd7VYWw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2eb7cc5b77e68ce1ec5_CFx.png",
    "decimals": 8
  },
  {
    "slug": "charles-schwab-xstock",
    "name": "Charles Schwab xStock",
    "symbol": "SCHWx",
    "underlyingTicker": "SCHW",
    "mint": "XsK5U9qwT9ErPXnpgDzV9voTGASZbZnNTYTGVxCqPii",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1af2fd4a49f2e66b46b_SCHWx.png",
    "decimals": 8
  },
  {
    "slug": "charter-communications-xstock",
    "name": "Charter Communications xStock",
    "symbol": "CHTRx",
    "underlyingTicker": "CHTR",
    "mint": "XstvDoqmcKjMHZP8FoWy3Ee2EkCf4KZgqNtg21WFW3X",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e340f6cce9266a582afc_CHTRx.png",
    "decimals": 8
  },
  {
    "slug": "cheniere-energy-xstock",
    "name": "Cheniere Energy xStock",
    "symbol": "LNGx",
    "underlyingTicker": "LNG",
    "mint": "XsYLZdcMYST418xZhTV6KaHqr8BWqaKS3J45ywqigF9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2127cee5807de12b6adc_LNGx.png",
    "decimals": 8
  },
  {
    "slug": "chery-automobile-xstock",
    "name": "Chery Automobile xStock",
    "symbol": "CRAUTx",
    "underlyingTicker": "CRAUT",
    "mint": "XsN23gnUFVBFR2RL9pQicMG1NNy56okJ9eTTQUSNubA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099fd17efa11178ad14ad_CRAUTx.png",
    "decimals": 8
  },
  {
    "slug": "chevron-xstock",
    "name": "Chevron xStock",
    "symbol": "CVXx",
    "underlyingTicker": "CVX",
    "mint": "XsNNMt7WTNA2sV3jrb1NNfNgapxRF5i4i6GcnTRRHts",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be50accfbb14c64319124_Ticker%3DCVX%2C%20Company%20Name%3Dchevron%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "china-construction-bank-xstock",
    "name": "China Construction Bank xStock",
    "symbol": "CCONBx",
    "underlyingTicker": "CCONB",
    "mint": "XsvPonyU9dZWsZsT2rJ1MBRAmPw8gMtS7M3ERko8XkK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b1bd300b45d1685b66_CCONBx.png",
    "decimals": 8
  },
  {
    "slug": "china-hongqiao-xstock",
    "name": "China Hongqiao xStock",
    "symbol": "CHONGx",
    "underlyingTicker": "CHONG",
    "mint": "Xs1Pd2VsTd1MBDnnBNtH2V68Z5WPNtMmYmE9cuMoBcT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099e56ca3df47b271a091_CHONGx.png",
    "decimals": 8
  },
  {
    "slug": "china-life-insurance-xstock",
    "name": "China Life Insurance xStock",
    "symbol": "CLINSx",
    "underlyingTicker": "CLINS",
    "mint": "XsoHpcJS91HhgMCe9ApwgpXbXFjV4ZoYATsZ5WQM4RB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b3d42c44172ba01c64_CLINSx.png",
    "decimals": 8
  },
  {
    "slug": "china-longyuan-power-xstock",
    "name": "China Longyuan Power xStock",
    "symbol": "CLONPx",
    "underlyingTicker": "CLONP",
    "mint": "XsyGQnVqV2XoDzSGsHoemfpvpctbEMtqdBvRk1nGnLZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a09aa87a2c3a3b55e03_CLONPx.png",
    "decimals": 8
  },
  {
    "slug": "china-mengniu-dairy-xstock",
    "name": "China Mengniu Dairy xStock",
    "symbol": "CMENDx",
    "underlyingTicker": "CMEND",
    "mint": "XsD87ikehM9bu4pEdyT32TdMP2J5ph3F1uBCwEFdLUo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a2a3ef98558f5987b96_CMENDx.png",
    "decimals": 8
  },
  {
    "slug": "china-merchants-port-xstock",
    "name": "China Merchants Port xStock",
    "symbol": "CMERPx",
    "underlyingTicker": "CMERP",
    "mint": "Xsa8uVzPAfd1FwuHEhVXKFj9Nn2Bprn4DAzUw7Hz7SR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a37de2d7051659aec9c_CMERPx.png",
    "decimals": 8
  },
  {
    "slug": "china-overseas-land-investment-xstock",
    "name": "China Overseas Land & Investment xStock",
    "symbol": "COVELx",
    "underlyingTicker": "COVEL",
    "mint": "XsSWT1Cw3vemPuy82ATtfT8R347jctHVri1m2NzfD2G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099fb2c0c8a37aa0ee70a_COVELx.png",
    "decimals": 8
  },
  {
    "slug": "china-petroleum-chemical-xstock",
    "name": "China Petroleum & Chemical xStock",
    "symbol": "CPETCx",
    "underlyingTicker": "CPETC",
    "mint": "Xsk88vf8LbRSVFTd9nu7kBsC2hNpQt4UckiV7eLSct4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099c778855aa1e5df7af7_CPETCx.png",
    "decimals": 8
  },
  {
    "slug": "china-resources-beer-holdings-xstock",
    "name": "China Resources Beer Holdings xStock",
    "symbol": "CRESBx",
    "underlyingTicker": "CRESB",
    "mint": "XsptDxuTbpFNx9vic5CMDRiGzPDhNDcVp2i9bUdTktn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a133fef5edff2a2e999_CRESPx.png",
    "decimals": 8
  },
  {
    "slug": "china-resources-land-xstock",
    "name": "China Resources Land xStock",
    "symbol": "CRESLx",
    "underlyingTicker": "CRESL",
    "mint": "XsbsVbQ24JD4HKnrz4eLktPBgZEMX3cooqiFapFjUtB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099e12f54fa584badc70a_CRESLx.png",
    "decimals": 8
  },
  {
    "slug": "china-resources-mixc-lifestyle-services-xstock",
    "name": "China Resources Mixc Lifestyle Services xStock",
    "symbol": "CRESMx",
    "underlyingTicker": "CRESM",
    "mint": "XsKFSq4aTzj9L2g1rqbdcewZH3bZNE2WwWBZKcGNxsX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a133fef5edff2a2e999_CRESPx.png",
    "decimals": 8
  },
  {
    "slug": "china-resources-power-xstock",
    "name": "China Resources Power xStock",
    "symbol": "CRESPx",
    "underlyingTicker": "CRESP",
    "mint": "Xs22M1UvnSTzoiVopRbsYxcSFX4caT93eQgx27R8Xu7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a133fef5edff2a2e999_CRESPx.png",
    "decimals": 8
  },
  {
    "slug": "china-shenhua-energy-xstock",
    "name": "China Shenhua Energy xStock",
    "symbol": "CSHEEx",
    "underlyingTicker": "CSHEE",
    "mint": "XspgPmoq1m39tGMLmourzxXgGmSLbjfxiytABBwGA2u",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b4b5d7e0e65038e3cd_CSHEEx.png",
    "decimals": 8
  },
  {
    "slug": "china-taiping-insurance-xstock",
    "name": "China Taiping Insurance xStock",
    "symbol": "CTINSx",
    "underlyingTicker": "CTINS",
    "mint": "Xst1K519UWCXvw2nKW6qHWfiUmFA3ybvvYpifzYhTWF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a2754339d07bcad672f_CTINSx.png",
    "decimals": 8
  },
  {
    "slug": "chipotle-mexican-grill-xstock",
    "name": "Chipotle Mexican Grill xStock",
    "symbol": "CMGx",
    "underlyingTicker": "CMG",
    "mint": "XsR1ktNCRYDoDNxhaSxF6NX2HyT4ACSQBgPRLpXTWmm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2423d340815b60dbccc_CMGx.png",
    "decimals": 8
  },
  {
    "slug": "chow-tai-fook-jewellery-xstock",
    "name": "Chow Tai Fook Jewellery xStock",
    "symbol": "CTFJWx",
    "underlyingTicker": "CTFJW",
    "mint": "XsWgkRwEBBWSzUTXX8CU84LpRheciMF8o6ZdSMR3Gny",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a08882ab1db4373d85f_CTFJWx.png",
    "decimals": 8
  },
  {
    "slug": "church-dwight-xstock",
    "name": "Church & Dwight xStock",
    "symbol": "CHDx",
    "underlyingTicker": "CHD",
    "mint": "Xs712gQLCYkFSYJwdu3pE5itNfyKwsXQ1HEGZF8Esc5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ad17bc5767a5d28142_CHDx.png",
    "decimals": 8
  },
  {
    "slug": "ciena-xstock",
    "name": "Ciena xStock",
    "symbol": "CIENx",
    "underlyingTicker": "CIEN",
    "mint": "XsE5qZhg6oL1ypWwtwXPQtW1EpFSvRmLXk9ceX9TtZx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2064e56d67ba7ebb605_CIENx.png",
    "decimals": 8
  },
  {
    "slug": "cincinnati-financial-xstock",
    "name": "Cincinnati Financial xStock",
    "symbol": "CINFx",
    "underlyingTicker": "CINF",
    "mint": "XsNufzbQz3zzhuGTSBi73Rds6wo1ghjn74ooK7ZbLVX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28fe6a2081336f92414_CINFx.png",
    "decimals": 8
  },
  {
    "slug": "cintas-xstock",
    "name": "Cintas xStock",
    "symbol": "CTASx",
    "underlyingTicker": "CTAS",
    "mint": "XszBTLtg8oMmEWsZHbJJwViiB6unNh2ei1e6miArqps",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e213b588832a4c8815da_CTASx.png",
    "decimals": 8
  },
  {
    "slug": "circle-xstock",
    "name": "Circle xStock",
    "symbol": "CRCLx",
    "underlyingTicker": "CRCL",
    "mint": "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6861ae6944c62c8dd3a0e165_CRCLx.svg",
    "decimals": 8
  },
  {
    "slug": "cisco-xstock",
    "name": "Cisco xStock",
    "symbol": "CSCOx",
    "underlyingTicker": "CSCO",
    "mint": "Xsr3pdLQyXvDJBFgpR5nexCEZwXvigb8wbPYp4YoNFf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bec77bfaeef7ac61f7231_Ticker%3DCSCO%2C%20Company%20Name%3DCisco%20Systems%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "citic-xstock",
    "name": "CITIC xStock",
    "symbol": "CITICx",
    "underlyingTicker": "CITIC",
    "mint": "XsdSGGAQyFiEuCVyV5ZQgB79pXXpr7vZPm3nhvHwKzK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099d56b9d19ba75990fc8_CITICx.png",
    "decimals": 8
  },
  {
    "slug": "citigroup-xstock",
    "name": "Citigroup xStock",
    "symbol": "Cx",
    "underlyingTicker": "C",
    "mint": "XsM1FstDXh1pA4uNXzvJdAop9SRJnnRdWt2o8A2mLpN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e19cb588832a4c879e42_Cx.png",
    "decimals": 8
  },
  {
    "slug": "citizens-financial-xstock",
    "name": "Citizens Financial xStock",
    "symbol": "CFGx",
    "underlyingTicker": "CFG",
    "mint": "Xsp9avBowUQeip8NfLXcwfw5VT74kc72BafgYPXN74a",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e275536f62aa99a96bec_CFGx.png",
    "decimals": 8
  },
  {
    "slug": "ck-asset-xstock",
    "name": "CK Asset xStock",
    "symbol": "CKAHx",
    "underlyingTicker": "CKAH",
    "mint": "XsEV5rBKdRtbmVLXmCxTm6Dox3467drekVVwpupVLrP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f4a81224cdf379257e_CKAHx.png",
    "decimals": 8
  },
  {
    "slug": "ck-hutchison-xstock",
    "name": "CK Hutchison xStock",
    "symbol": "CKHUTx",
    "underlyingTicker": "CKHUT",
    "mint": "XsjMBmvjeERTrf2odjQKQKFgBVWsiC5J9Mhe9eCNyfW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099da6f5fed4ed2d147cf_CKHUTx.png",
    "decimals": 8
  },
  {
    "slug": "ck-infrastructure-xstock",
    "name": "CK Infrastructure xStock",
    "symbol": "CKINFx",
    "underlyingTicker": "CKINF",
    "mint": "XsgYr5PbwmUuQTDFwVDAx2M4KzZKwz2zvYMzg4Nuwym",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f9bd300b45d168a4de_CKINFx.png",
    "decimals": 8
  },
  {
    "slug": "clean-harbors-xstock",
    "name": "Clean Harbors xStock",
    "symbol": "CLHx",
    "underlyingTicker": "CLH",
    "mint": "XsRwkmMcYT1jEJ9cnUsnWkUitWJRufu2qCmd6fbRRYj",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e314b6da94eb4c76d536_CLHx.png",
    "decimals": 8
  },
  {
    "slug": "cleanspark-xstock",
    "name": "CleanSpark xStock",
    "symbol": "CLSKx",
    "underlyingTicker": "CLSK",
    "mint": "Xsn3H7ACEpSF2ULxeiD6kW4jRZXpurh8ZPttyfoS56W",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da32b7b8e5d7f8e84d3fb7_Ticker%3DCLSKx%2C%20Company%20Name%3DCleanSpark%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "clorox-xstock",
    "name": "Clorox xStock",
    "symbol": "CLXx",
    "underlyingTicker": "CLX",
    "mint": "XshmkFbMrRMtVb2HoJw1nc9jGMKNjTWcutT86YpMbKi",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3474f11a0bdd70a3cca_CLXx.png",
    "decimals": 8
  },
  {
    "slug": "cloudflare-xstock",
    "name": "Cloudflare xStock",
    "symbol": "NETx",
    "underlyingTicker": "NET",
    "mint": "XsR3LAMkzuPP8DnfYaiB2grTWqkBVy286gjJVErK1bi",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2128331ba77d524b6036_NETx.png",
    "decimals": 8
  },
  {
    "slug": "clp-xstock",
    "name": "CLP xStock",
    "symbol": "CLPHDx",
    "underlyingTicker": "CLPHD",
    "mint": "XsC1MeKZhxG5mv1h6oen9YVT2Skfxa3GMVkXymkTF8N",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f28d6487a776d7d296_CLPHDx.png",
    "decimals": 8
  },
  {
    "slug": "cme-xstock",
    "name": "CME xStock",
    "symbol": "CMEx",
    "underlyingTicker": "CME",
    "mint": "Xsx234fZF5KMZ5catYi7m9P682Pk9TWWHF5jAfYGZJk",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c836507d0c6e99f041_CMEx.png",
    "decimals": 8
  },
  {
    "slug": "cms-energy-xstock",
    "name": "CMS Energy xStock",
    "symbol": "CMSx",
    "underlyingTicker": "CMS",
    "mint": "Xs6Udev3M1atxRjjXCjAg24BdjYuLs6Qj7eTh7XjEjW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bb7e6b3ff5a3aa9b09_CMSx.png",
    "decimals": 8
  },
  {
    "slug": "coca-cola-xstock",
    "name": "Coca-Cola xStock",
    "symbol": "KOx",
    "underlyingTicker": "KO",
    "mint": "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684beb344604b4f162f66f93_Ticker%3DCOKE%2C%20Company%20Name%3DCokeCola%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "cognizant-technology-solutions-xstock",
    "name": "Cognizant Technology Solutions xStock",
    "symbol": "CTSHx",
    "underlyingTicker": "CTSH",
    "mint": "XsMNmV7wVizphwXgMtXTVhLDpqmKPdfoYPK3JTXXnYW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a06ee5fff84d2ec18d_CTSHx.png",
    "decimals": 8
  },
  {
    "slug": "coherent-xstock",
    "name": "Coherent xStock",
    "symbol": "COHRx",
    "underlyingTicker": "COHR",
    "mint": "XsipFyePxrgwZJrX4s26RJ25cqwpkfn6ec8JLy26w5b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f51a4837ed32e92bcf_COHRx.png",
    "decimals": 8
  },
  {
    "slug": "coinbase-xstock",
    "name": "Coinbase xStock",
    "symbol": "COINx",
    "underlyingTicker": "COIN",
    "mint": "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c131b2d6d8cbe9e61a3dc_Ticker%3DCOIN%2C%20Company%20Name%3DCoinbase%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "colgate-palmolive-xstock",
    "name": "Colgate-Palmolive xStock",
    "symbol": "CLx",
    "underlyingTicker": "CL",
    "mint": "XsWzjAeMsR9pMX1aKkq7uDKpr11daUHkmjXya15yCqd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f21a4837ed32e929d4_CLx.png",
    "decimals": 8
  },
  {
    "slug": "comcast-xstock",
    "name": "Comcast xStock",
    "symbol": "CMCSAx",
    "underlyingTicker": "CMCSA",
    "mint": "XsvKCaNsxg2GN8jjUmq71qukMJr7Q1c5R2Mk9P8kcS8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bfbe3db57e5f5f6b277aa_Ticker%3DCMCSA%2C%20Company%20Name%3DComcast%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "comfort-systems-usa-xstock",
    "name": "Comfort Systems USA xStock",
    "symbol": "FIXx",
    "underlyingTicker": "FIX",
    "mint": "XsPTVwrSE3MMZF1bt15vxM7NuuRHdsBJ7mtGW4cttHX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e201e095f9612ea68137_FIXx.png",
    "decimals": 8
  },
  {
    "slug": "conocophillips-xstock",
    "name": "ConocoPhillips xStock",
    "symbol": "COPx",
    "underlyingTicker": "COP",
    "mint": "Xs58CxmUcgT17reeVV64se747XuRfjsJQnpb8DX9TDq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b4d09b3213b2da4ab3_COPx.png",
    "decimals": 8
  },
  {
    "slug": "consolidated-edison-xstock",
    "name": "Consolidated Edison xStock",
    "symbol": "EDx",
    "underlyingTicker": "ED",
    "mint": "XsESyqE7kRmE1RVQDmo4aiMGMXogeY1Sdo8FQKwAmco",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24ff87302708563109d_EDx.png",
    "decimals": 8
  },
  {
    "slug": "constellation-brands-xstock",
    "name": "Constellation Brands xStock",
    "symbol": "STZx",
    "underlyingTicker": "STZ",
    "mint": "Xs6eATub8cqKdztx4asCRFMSzMwtNqAUWiDaUPXxUtD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c2e095f9612ea73cb3_STZx.png",
    "decimals": 8
  },
  {
    "slug": "constellation-energy-corporation-xstock",
    "name": "Constellation Energy Corporation xStock",
    "symbol": "CEGx",
    "underlyingTicker": "CEG",
    "mint": "Xssu2cDLdZXZYrq17frTVrb3meumRCAzEf7pXyxoWVN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47024fd353a454f097a03_CEGx.png",
    "decimals": 8
  },
  {
    "slug": "copart-xstock",
    "name": "Copart xStock",
    "symbol": "CPRTx",
    "underlyingTicker": "CPRT",
    "mint": "XshHba6o5aAUPJFL19gmvSn4KRk6N44JVgiFt6UoRsB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e289da3d6aedb4349c84_CPRTx.png",
    "decimals": 8
  },
  {
    "slug": "core-msci-emerging-markets-xstock",
    "name": "Core MSCI Emerging Markets xStock",
    "symbol": "IEMGx",
    "underlyingTicker": "IEMG",
    "mint": "XsFnZawJdLdXfBSEt5Vw29K5vdBiHotdPLjUPafpfHs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/693d6518ef0e99747bb51d6a_Ticker%3DIEMGx%2C%20Company%20Name%3DCore%20MSCI%20Emerging%20Markets%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "core-scientific-xstock",
    "name": "Core Scientific xStock",
    "symbol": "CORZx",
    "underlyingTicker": "CORZ",
    "mint": "XsBGEXxbBcuu8Nrokj14G8v4ezT3JYWWLneTzXK8t6Z",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d92708e65e3ad1c0cc0d84_Ticker%3DCORZx%2C%20Company%20Name%3DCore%20Scientific%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "coreweave-xstock",
    "name": "CoreWeave xStock",
    "symbol": "CRWVx",
    "underlyingTicker": "CRWV",
    "mint": "Xs3trfdPXSZuxBJsgau6HRfu8SdrCirkwHpPNgSpJz9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a69085c6c58353223265430_CRWVx.png",
    "decimals": 8
  },
  {
    "slug": "corning-xstock",
    "name": "Corning xStock",
    "symbol": "GLWx",
    "underlyingTicker": "GLW",
    "mint": "Xsg3UgvjxpUgV3WZx9Wt9deLx7qvKYp6ZLY6xMY2Dfq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b03bed1b88de0bf0c3_GLWx.png",
    "decimals": 8
  },
  {
    "slug": "corpay-xstock",
    "name": "Corpay xStock",
    "symbol": "CPAYx",
    "underlyingTicker": "CPAY",
    "mint": "XsPtqd1RVDcZzSmeVwY253J4EHVUqMSrR9FcFmjZjqq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a312ec47a2210c0acc_CPAYx.png",
    "decimals": 8
  },
  {
    "slug": "corteva-xstock",
    "name": "Corteva xStock",
    "symbol": "CTVAx",
    "underlyingTicker": "CTVA",
    "mint": "XsJXYLby91CWhGhTXds9oxjoc8EdsLy2iuxmq55U1Y3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e22d0b02c72b786c1de6_CTVAx.png",
    "decimals": 8
  },
  {
    "slug": "cosco-shipping-xstock",
    "name": "COSCO SHIPPING xStock",
    "symbol": "COSCx",
    "underlyingTicker": "COSC",
    "mint": "Xsq94yaNbSREX4vckv2jKRaZziduQMQX3nwDm4eJNet",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099df5ada5f1c8771ff70_COSCx.png",
    "decimals": 8
  },
  {
    "slug": "costar-xstock",
    "name": "CoStar xStock",
    "symbol": "CSGPx",
    "underlyingTicker": "CSGP",
    "mint": "XsJH1qPyJgbJiYo2KZXNirCQxC3QqQgYE1iNHY3Ecm2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e326b588832a4c893059_CSGPx.png",
    "decimals": 8
  },
  {
    "slug": "coupang-xstock",
    "name": "Coupang xStock",
    "symbol": "CPNGx",
    "underlyingTicker": "CPNG",
    "mint": "XsoVbMATH8hMemisZZvGCc9YEkve3Yiirr2VtinKTuw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b9481ad4a14d0c56b1_CPNGx.png",
    "decimals": 8
  },
  {
    "slug": "crowdstrike-xstock",
    "name": "CrowdStrike xStock",
    "symbol": "CRWDx",
    "underlyingTicker": "CRWD",
    "mint": "Xs7xXqkcK7K8urEqGg52SECi79dRp2cEKKuYjUePYDw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c10fbaf9d90e3d974ae23_Ticker%3DCRWD%2C%20Company%20Name%3DCrowdstrike%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "crown-castle-xstock",
    "name": "Crown Castle xStock",
    "symbol": "CCIx",
    "underlyingTicker": "CCI",
    "mint": "XsbPN4VFi14geuC8D2Tb2u37kQM83VSkfMUyvXsWWoC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25124dc85407f7a350e_CCIx.png",
    "decimals": 8
  },
  {
    "slug": "cspc-pharmaceutical-xstock",
    "name": "CSPC Pharmaceutical xStock",
    "symbol": "CSPCx",
    "underlyingTicker": "CSPC",
    "mint": "Xs5hnQoLHnA2xeHaaxYGkCV2Kp12SwCEeCKBK7BW3gr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a178ac183427fff0493_CSPCx.png",
    "decimals": 8
  },
  {
    "slug": "csx-xstock",
    "name": "CSX xStock",
    "symbol": "CSXx",
    "underlyingTicker": "CSX",
    "mint": "XskJzVZDKvqm999PGat2ifznPVmmDXn4Zi1LZ7Y5CVr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d4c3e7fb8af52aa790_CSXx.png",
    "decimals": 8
  },
  {
    "slug": "cummins-xstock",
    "name": "Cummins xStock",
    "symbol": "CMIx",
    "underlyingTicker": "CMI",
    "mint": "XsqZ16VmoeszDniTfGTnwPBMv7j7uSDArddziagHWit",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c912b481cd10a6b844_CMIx.png",
    "decimals": 8
  },
  {
    "slug": "curtiss-wright-xstock",
    "name": "Curtiss-Wright xStock",
    "symbol": "CWx",
    "underlyingTicker": "CW",
    "mint": "XsWCYadcnfTLH3W8sBbJZepwotUkfV1qg7QQmzVo8M8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27b953f0b6f81d4236a_CWx.png",
    "decimals": 8
  },
  {
    "slug": "cvs-health-xstock",
    "name": "CVS Health xStock",
    "symbol": "CVSx",
    "underlyingTicker": "CVS",
    "mint": "XsKWyokwxJfb5aVBfDJYGte4wk2NPMNFo6SivouPeSy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b64f11a0bdd708e188_CVSx.png",
    "decimals": 8
  },
  {
    "slug": "d-r-horton-xstock",
    "name": "D.R. Horton xStock",
    "symbol": "DHIx",
    "underlyingTicker": "DHI",
    "mint": "XsiNAvTHpvygKjMqb8Hz5Nqeo8NTAsWzT6DYLH287FA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e249da3d6aedb4345cb9_DHIx.png",
    "decimals": 8
  },
  {
    "slug": "danaher-xstock",
    "name": "Danaher xStock",
    "symbol": "DHRx",
    "underlyingTicker": "DHR",
    "mint": "Xseo8tgCZfkHxWS9xbFYeKFyMSbWEvZGFV1Gh53GtCV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bfa59ce8102ff96cee2fe_Ticker%3DDHR%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "darden-restaurants-xstock",
    "name": "Darden Restaurants xStock",
    "symbol": "DRIx",
    "underlyingTicker": "DRI",
    "mint": "XsTNaRrDQtFJi56TAQbmk6tHzWQvihWGoafKSJzbJdY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a2536f62aa99a9ad52_DRIx.png",
    "decimals": 8
  },
  {
    "slug": "datadog-xstock",
    "name": "Datadog xStock",
    "symbol": "DDOGx",
    "underlyingTicker": "DDOG",
    "mint": "XsQJQHNMLiZCBHgJfq2yK95BFraouUdSspv1aD8jCgQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f0f87302708562c5d1_DDOGx.png",
    "decimals": 8
  },
  {
    "slug": "deckers-outdoor-xstock",
    "name": "Deckers Outdoor xStock",
    "symbol": "DECKx",
    "underlyingTicker": "DECK",
    "mint": "XsbahiFKw3f3pgsAwREvQZAdERbV1NGUjWnkzUaBz91",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ed12ec47a2210c42db_DECKx.png",
    "decimals": 8
  },
  {
    "slug": "deere-xstock",
    "name": "Deere xStock",
    "symbol": "DEx",
    "underlyingTicker": "DE",
    "mint": "Xsh3Lt6pLpH65udstiFuZThJ6gyQTL6ryVXtNwEy5zd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b3cf0d8d5d6ca2d072_DEx.png",
    "decimals": 8
  },
  {
    "slug": "dell-technologies-inc-xstock",
    "name": "Dell Technologies Inc. xStock",
    "symbol": "DELLx",
    "underlyingTicker": "DELL",
    "mint": "Xsu7Tc5J2fVUE4H5vYAiSr34cvLJeCsYPMjAYnayQn6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47023e0af7d8174659604_DELLx.png",
    "decimals": 8
  },
  {
    "slug": "delta-air-lines-xstock",
    "name": "Delta Air Lines xStock",
    "symbol": "DALx",
    "underlyingTicker": "DAL",
    "mint": "XsQVuhV5fBEb3b8TauFuRimcXSJdVrKqFgQTVqLZiq9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e224da3d6aedb4342e32_DALx.png",
    "decimals": 8
  },
  {
    "slug": "devon-energy-xstock",
    "name": "Devon Energy xStock",
    "symbol": "DVNx",
    "underlyingTicker": "DVN",
    "mint": "Xs8WNVWbYNsHsqEu9WTb9AazMfG7wFxFat11V6mVK1x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2349d738e95105bbd5d_DVNx.png",
    "decimals": 8
  },
  {
    "slug": "dexcom-xstock",
    "name": "DexCom xStock",
    "symbol": "DXCMx",
    "underlyingTicker": "DXCM",
    "mint": "Xsspestq9YiZofYG2pvuHgYM1aKdRNocveBodzrGjbg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2747992dc1d3a699b17_DXCMx.png",
    "decimals": 8
  },
  {
    "slug": "dfdv-xstock",
    "name": "DFDV xStock",
    "symbol": "DFDVx",
    "underlyingTicker": "DFDV",
    "mint": "Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6861b8b7beb9cf856e2332d5_DFDVx.svg",
    "decimals": 8
  },
  {
    "slug": "diamondback-energy-xstock",
    "name": "Diamondback Energy xStock",
    "symbol": "FANGx",
    "underlyingTicker": "FANG",
    "mint": "XsdLjeamzdsWW5aBhsGVAaQFcZtCL6yF9nhtWfszGT3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e256be2927c9329fbc15_FANGx.png",
    "decimals": 8
  },
  {
    "slug": "dicks-sporting-goods-xstock",
    "name": "Dick's Sporting Goods xStock",
    "symbol": "DKSx",
    "underlyingTicker": "DKS",
    "mint": "Xs9aEtZqQDzTtb1PLVJ2W2d6NGJSSaJepTsQ2CZAjhn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31f1cd17aa2ee837401_DKSx.png",
    "decimals": 8
  },
  {
    "slug": "digital-realty-trust-xstock",
    "name": "Digital Realty Trust xStock",
    "symbol": "DLRx",
    "underlyingTicker": "DLR",
    "mint": "Xstp4CYu1181rhhi7w32Lj6wQZ2VDjFhQNKZwZARk5G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2097cc5b77e68cd54d5_DLRx.png",
    "decimals": 8
  },
  {
    "slug": "direxion-semiconductor-bull-3x-xstock",
    "name": "Direxion Semiconductor Bull 3X xStock",
    "symbol": "SOXLx",
    "underlyingTicker": "SOXL",
    "mint": "XsdZDkoMdUb6iKDAKKappuM7C1Q2HmTqC8jNujbfmCu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2130037374d3e44ffe01_SOXLx.png",
    "decimals": 8
  },
  {
    "slug": "dollar-general-xstock",
    "name": "Dollar General xStock",
    "symbol": "DGx",
    "underlyingTicker": "DG",
    "mint": "Xsuex5gGigmPKMs6hsYpHbcg8HwBbBdWkGKub9MQbea",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2951cd17aa2ee830603_DGx.png",
    "decimals": 8
  },
  {
    "slug": "dollar-tree-xstock",
    "name": "Dollar Tree xStock",
    "symbol": "DLTRx",
    "underlyingTicker": "DLTR",
    "mint": "XsPWGRNQF1Thif9qaadTNtF8xfHTb8sjvw1NC46hkED",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c02421b195884d2d97_DLTRx.png",
    "decimals": 8
  },
  {
    "slug": "dominion-energy-xstock",
    "name": "Dominion Energy xStock",
    "symbol": "Dx",
    "underlyingTicker": "D",
    "mint": "XsiYzgRPqPjAaJjpDMo2CaQ7c9khuCwD7Hj1po2dxSj",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2179d738e95105bab9d_Dx.png",
    "decimals": 8
  },
  {
    "slug": "doordash-xstock",
    "name": "DoorDash xStock",
    "symbol": "DASHx",
    "underlyingTicker": "DASH",
    "mint": "XsuW1yxtbifjEYojFLmoavTWBT7hsuUXXeReAWK9X91",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e210d09b3213b2da9f0a_DASHx.png",
    "decimals": 8
  },
  {
    "slug": "dover-xstock",
    "name": "Dover xStock",
    "symbol": "DOVx",
    "underlyingTicker": "DOV",
    "mint": "XsXG3ytqNM8wMwxbZnbZjY3wFua4nU58ZR6Lwr5wSDp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26f4f11a0bdd7096b83_DOVx.png",
    "decimals": 8
  },
  {
    "slug": "dow-xstock",
    "name": "Dow xStock",
    "symbol": "DOWx",
    "underlyingTicker": "DOW",
    "mint": "XsKWMeTN8wmhrkoWKy6tXAj6476Guj8zonzQu7jivqP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ac6f3f12933f874a81_DOWx.png",
    "decimals": 8
  },
  {
    "slug": "draftkings-xstock",
    "name": "DraftKings xStock",
    "symbol": "DKNGx",
    "underlyingTicker": "DKNG",
    "mint": "XscCMVe1Qu2rk1YoCDJGwMLZkfVnd69xcPER4DJ8tpB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32112b481cd10a7bc47_DKNGx.png",
    "decimals": 8
  },
  {
    "slug": "dte-energy-xstock",
    "name": "DTE Energy xStock",
    "symbol": "DTEx",
    "underlyingTicker": "DTE",
    "mint": "XsVK4gk4X1ANBSKF9DGjy9WseKhBfMUuEmP8v7J8u2G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26b6ee5fff84d2e98b3_DTEx.png",
    "decimals": 8
  },
  {
    "slug": "duke-energy-xstock",
    "name": "Duke Energy xStock",
    "symbol": "DUKx",
    "underlyingTicker": "DUK",
    "mint": "XswU7kXY6dGgMqpiWW2jKSYVZMsCWv5LKcLaFBgYzPv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c628410e9537a8d9a1_DUKx.png",
    "decimals": 8
  },
  {
    "slug": "dynatrace-xstock",
    "name": "Dynatrace xStock",
    "symbol": "DTx",
    "underlyingTicker": "DT",
    "mint": "Xs8Jb7S3qqWbgkRGvwKmT62MD7gt1qYU7oUaR9oDC11",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33c7d5d025cdcf9c8dd_DTx.png",
    "decimals": 8
  },
  {
    "slug": "east-west-bancorp-xstock",
    "name": "East West Bancorp xStock",
    "symbol": "EWBCx",
    "underlyingTicker": "EWBC",
    "mint": "XsitAUXgChdnHHVx2qa1Fhw6xe5ZPog1XrEGg4Pp5XW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e02fd4a49f2e67b164_EWBCx.png",
    "decimals": 8
  },
  {
    "slug": "eaton-corporation-plc-xstock",
    "name": "Eaton Corporation plc xStock",
    "symbol": "ETNx",
    "underlyingTicker": "ETN",
    "mint": "Xs8S5L4HkJpeBWF1J4oyUX6rVwGHmG7GZ7PiChPt7nY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470246d0d414a50a495d2_ETNx.png",
    "decimals": 8
  },
  {
    "slug": "ecolab-xstock",
    "name": "Ecolab xStock",
    "symbol": "ECLx",
    "underlyingTicker": "ECL",
    "mint": "XsPPAW5wuUa1ALN1NstEkUAajbwycXTRxtWoLfFriy4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e202d09b3213b2da96f8_ECLx.png",
    "decimals": 8
  },
  {
    "slug": "edison-international-xstock",
    "name": "Edison International xStock",
    "symbol": "EIXx",
    "underlyingTicker": "EIX",
    "mint": "Xsm4TwT5UtCCjkcrj2eMZDPNCTdBeJacMmRCrxoXpZ8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e283f7bf3b5638345632_EIXx.png",
    "decimals": 8
  },
  {
    "slug": "edwards-lifesciences-xstock",
    "name": "Edwards Lifesciences xStock",
    "symbol": "EWx",
    "underlyingTicker": "EW",
    "mint": "XsSfT8eYeR2NqYFwCNLRNfDARHUTXvLeSnGbw2UKqrA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e233b961d4173307405e_EWx.png",
    "decimals": 8
  },
  {
    "slug": "elanco-animal-health-xstock",
    "name": "Elanco Animal Health xStock",
    "symbol": "ELANx",
    "underlyingTicker": "ELAN",
    "mint": "XsKLqYX4dXLxZhM7bXyNsQdf5P1wFAuwLYaSPqt3j1q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e349de2cb121e357af71_ELANx.png",
    "decimals": 8
  },
  {
    "slug": "elevance-health-xstock",
    "name": "Elevance Health xStock",
    "symbol": "ELVx",
    "underlyingTicker": "ELV",
    "mint": "XsJbC4TFupSLpxNwsfq9o1BB5tdTT7eZ3YNerVvE49H",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d3536f62aa99a8db77_ELVx.png",
    "decimals": 8
  },
  {
    "slug": "eli-lilly-xstock",
    "name": "Eli Lilly xStock",
    "symbol": "LLYx",
    "underlyingTicker": "LLY",
    "mint": "Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684ad0eaa9a1efe9b1b7155a_Ticker%3DLLY%2C%20Company%20Name%3DLilly%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "emcor-xstock",
    "name": "EMCOR xStock",
    "symbol": "EMEx",
    "underlyingTicker": "EME",
    "mint": "XsHsi7FvQo4T7AkmtyszYkhNdKDCVgrJFS7CWGeaeM8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25412b481cd10a73079_EMEx.png",
    "decimals": 8
  },
  {
    "slug": "emerson-electric-xstock",
    "name": "Emerson Electric xStock",
    "symbol": "EMRx",
    "underlyingTicker": "EMR",
    "mint": "Xskqq9tKh2gc1PBJHf2q6jMgBpt3AojT3HVkWhjoY5h",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d93dedcedc87d8af42_EMRx.png",
    "decimals": 8
  },
  {
    "slug": "energy-fuels-inc-xstock",
    "name": "Energy Fuels Inc. xStock",
    "symbol": "UUUUx",
    "underlyingTicker": "UUUU",
    "mint": "XsYHvpLWfTfqdLkPbCc4eUT21eH521BRTXBypgzpEDH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c4702232bef020d3b43f00_UUUUx.png",
    "decimals": 8
  },
  {
    "slug": "energy-select-sector-spdr-fund-xstock",
    "name": "Energy Select Sector SPDR Fund xStock",
    "symbol": "XLEx",
    "underlyingTicker": "XLE",
    "mint": "Xs54CrhmpVp6uxZXwgSTegrRH2kShh88XFPzgf4BExu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47025164fd872f5e94e52_XLEx.png",
    "decimals": 8
  },
  {
    "slug": "enhanced-group-xstock",
    "name": "Enhanced Group xStock",
    "symbol": "ENHAx",
    "underlyingTicker": "ENHA",
    "mint": "XsGAnis8BY5TLxEGdPY1LeeqY1DHPcUkkBQWRyQaJya",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2155a117cf655c21245f_ENHAx.png",
    "decimals": 8
  },
  {
    "slug": "enn-energy-xstock",
    "name": "ENN Energy xStock",
    "symbol": "ENNHLx",
    "underlyingTicker": "ENNHL",
    "mint": "XsfTYmMC73C6xJsc5k92ZWBdQtEtmnRsVtkN9s5RPQZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a3f891d3d57311d0fae_ENNHLx.png",
    "decimals": 8
  },
  {
    "slug": "entegris-xstock",
    "name": "Entegris xStock",
    "symbol": "ENTGx",
    "underlyingTicker": "ENTG",
    "mint": "XsD6kFBZCYumf4awQ9tgFFh8m2HGJBtTFdLYt7HcwRr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a1c7e87feb70ac648f_ENTGx.png",
    "decimals": 8
  },
  {
    "slug": "entergy-xstock",
    "name": "Entergy xStock",
    "symbol": "ETRx",
    "underlyingTicker": "ETR",
    "mint": "XssZsJPrzg7n9Sc1stfPcB4vygcVeMfz5uZK2gPwNdv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2323d340815b60dab1a_ETRx.png",
    "decimals": 8
  },
  {
    "slug": "eog-resources-xstock",
    "name": "EOG Resources xStock",
    "symbol": "EOGx",
    "underlyingTicker": "EOG",
    "mint": "XsfBx5h3LBhypgy7goD4i8nAfLU8ZZ5QBSQUtASRVox",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f66f3f12933f86ce47_EOGx.png",
    "decimals": 8
  },
  {
    "slug": "eqt-xstock",
    "name": "EQT xStock",
    "symbol": "EQTx",
    "underlyingTicker": "EQT",
    "mint": "XsvS1ZY358vAjNJ7s3fz13s64ZqYF36rgUDR8yVJkuA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26c0b02c72b786c5863_EQTx.png",
    "decimals": 8
  },
  {
    "slug": "equifax-xstock",
    "name": "Equifax xStock",
    "symbol": "EFXx",
    "underlyingTicker": "EFX",
    "mint": "Xs3dfAaDSQMVrDcEVbxypK4UeXhCbDBK2AgAWCHwqmq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2cc95063765fcf36859_EFXx.png",
    "decimals": 8
  },
  {
    "slug": "equinix-xstock",
    "name": "Equinix xStock",
    "symbol": "EQIXx",
    "underlyingTicker": "EQIX",
    "mint": "XsBo6pg8N9kk7YnL69NnBBSZBWDkF1gHWjTAXpYuAVo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c4a19a50c2f196485c_EQIXx.png",
    "decimals": 8
  },
  {
    "slug": "equitable-xstock",
    "name": "Equitable xStock",
    "symbol": "EQHx",
    "underlyingTicker": "EQH",
    "mint": "Xsf8f6sqb9p6JK9oR8UHXk7CmFDvofc1nxeink7AoGA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31f25a7f80a1d60e282_EQHx.png",
    "decimals": 8
  },
  {
    "slug": "equity-lifestyle-properties-xstock",
    "name": "Equity Lifestyle Properties xStock",
    "symbol": "ELSx",
    "underlyingTicker": "ELS",
    "mint": "XsMPKfVuLeJ4mSahPcSgVGHEVGt41QU41CfgfvRzvBG",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33d24dc85407f7b1834_ELSx.png",
    "decimals": 8
  },
  {
    "slug": "essex-property-trust-xstock",
    "name": "Essex Property Trust xStock",
    "symbol": "ESSx",
    "underlyingTicker": "ESS",
    "mint": "XsZsYW1U5exCzHqwsxwjTDABR2SW9MzKccXSkAgx47N",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e028410e9537a9d52d_ESSx.png",
    "decimals": 8
  },
  {
    "slug": "evercore-xstock",
    "name": "Evercore xStock",
    "symbol": "EVRx",
    "underlyingTicker": "EVR",
    "mint": "XsmTgboNTsssYV1VZrS4u1YMkcNWTKVMzUjghkXa3RF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3296f3f12933f87e971_EVRx.png",
    "decimals": 8
  },
  {
    "slug": "everest-xstock",
    "name": "Everest xStock",
    "symbol": "EGx",
    "underlyingTicker": "EG",
    "mint": "XsvYonMjAxFXYW6PKBz9jFEuvX6xAhm9BifzxgLzurb",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34f268c11bbce9a2983_EGx.png",
    "decimals": 8
  },
  {
    "slug": "evergy-xstock",
    "name": "Evergy xStock",
    "symbol": "EVRGx",
    "underlyingTicker": "EVRG",
    "mint": "XswxMcsrN9WpDhX7wDf53ZFGWNhcWYKSa6UY26AgpET",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d43d340815b60e8b17_EVRGx.png",
    "decimals": 8
  },
  {
    "slug": "everpure-xstock",
    "name": "Everpure xStock",
    "symbol": "Px",
    "underlyingTicker": "P",
    "mint": "XsqSsaDYsEAFwRwcwchPc9J1zX21VtHiXGJjFt5Ph5t",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b17992dc1d3a69c7ac_Px.png",
    "decimals": 8
  },
  {
    "slug": "eversource-energy-xstock",
    "name": "Eversource Energy xStock",
    "symbol": "ESx",
    "underlyingTicker": "ES",
    "mint": "XsgPX8MYf23yPRv9DrT5ofHn4mThBZgkhboLHz5uSx7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2921a4837ed32e9b2f2_ESx.png",
    "decimals": 8
  },
  {
    "slug": "exelixis-xstock",
    "name": "Exelixis xStock",
    "symbol": "EXELx",
    "underlyingTicker": "EXEL",
    "mint": "XsAPSDzHwPr2UX83cY4KCHSdyvfighyeTPLaPXq1m3o",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e313253b5873d2d06191_EXELx.png",
    "decimals": 8
  },
  {
    "slug": "exelon-xstock",
    "name": "Exelon xStock",
    "symbol": "EXCx",
    "underlyingTicker": "EXC",
    "mint": "XswJRi3vQhng81dGRXnaUjpyCzM89pwvYyHveT2xzEB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e237be2927c9329fa351_EXCx.png",
    "decimals": 8
  },
  {
    "slug": "expand-energy-xstock",
    "name": "Expand Energy xStock",
    "symbol": "EXEx",
    "underlyingTicker": "EXE",
    "mint": "XsodbeGRpfyAzq1MMqZu7u1vCYNKNDuYrCtofaT1PJK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d11e352bc5cecdf909_EXEx.png",
    "decimals": 8
  },
  {
    "slug": "expeditors-international-of-washington-xstock",
    "name": "Expeditors International of Washington xStock",
    "symbol": "EXPDx",
    "underlyingTicker": "EXPD",
    "mint": "XsJB61YjcXkEf114fDGMMnWhhFf8a1x12Z6hARUUeAM",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bde6a2081336f946ee_EXPDx.png",
    "decimals": 8
  },
  {
    "slug": "extra-space-storage-xstock",
    "name": "Extra Space Storage xStock",
    "symbol": "EXRx",
    "underlyingTicker": "EXR",
    "mint": "XseFccApcVhrqASiXFM97ZkX7a2uDWbUWjC4T82LgAT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26a953f0b6f81d41a59_EXRx.png",
    "decimals": 8
  },
  {
    "slug": "exxon-mobil-xstock",
    "name": "Exxon Mobil xStock",
    "symbol": "XOMx",
    "underlyingTicker": "XOM",
    "mint": "XsaHND8sHyfMfsWPj6kSdd5VwvCayZvjYgKmmcNL5qh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684abe960ee12e238c0a1f0b_Ticker%3DXOM%2C%20Company%20Name%3DExxonMobil%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "f5-xstock",
    "name": "F5 xStock",
    "symbol": "FFIVx",
    "underlyingTicker": "FFIV",
    "mint": "XspZSVf3tmPqV7QXqNzCjmvv11nnAtQ4n4YwPxykt3U",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b8ab2b9761d3a5857d_FFIVx.png",
    "decimals": 8
  },
  {
    "slug": "fair-isaac-xstock",
    "name": "Fair Isaac xStock",
    "symbol": "FICOx",
    "underlyingTicker": "FICO",
    "mint": "XsiZh3X1uThVm4bNh8PzyXVNe3v11oS6v2DCGdkboUL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27f9e65d1c932100a17_FICOx.png",
    "decimals": 8
  },
  {
    "slug": "fastenal-xstock",
    "name": "Fastenal xStock",
    "symbol": "FASTx",
    "underlyingTicker": "FAST",
    "mint": "Xs58AdBQTkqkejRvfMrGMQMML1m5xMQKVfKgPmqNhwg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e229c6acaee76a6650e8_FASTx.png",
    "decimals": 8
  },
  {
    "slug": "fedex-freight-xstock",
    "name": "FedEx Freight xStock",
    "symbol": "FDXFx",
    "underlyingTicker": "FDXF",
    "mint": "XsVT5d6jAm7dTcwz9o5jCUVrpdd1t86WLf4U7wb9mxs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690852e575be9df9de439d_FDXFx.png",
    "decimals": 8
  },
  {
    "slug": "fedex-xstock",
    "name": "FedEx xStock",
    "symbol": "FDXx",
    "underlyingTicker": "FDX",
    "mint": "XsEmsxmtT12GBiqtvTxoNaipTBNEdUs6oq7pwHFHTb7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f47d5d025cdcf8a4f4_FDXx.png",
    "decimals": 8
  },
  {
    "slug": "ferguson-enterprises-xstock",
    "name": "Ferguson Enterprises xStock",
    "symbol": "FERGx",
    "underlyingTicker": "FERG",
    "mint": "XsfdW27Z6gk5otDjYw5R2ad7PP1dKoR1Qx2ayurRBGc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23e953f0b6f81d3fd72_FERGx.png",
    "decimals": 8
  },
  {
    "slug": "fidelity-aaa-clo-xstock",
    "name": "Fidelity AAA CLO xStock",
    "symbol": "FAAAx",
    "underlyingTicker": "FAAA",
    "mint": "Xs8rb8QG9mEuQ41g2cUzuJLZt3xEPQFhvgb9s4obXSn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2131e4ec0afbd2d60335_FAAAx.png",
    "decimals": 8
  },
  {
    "slug": "fidelity-national-financial-xstock",
    "name": "Fidelity National Financial xStock",
    "symbol": "FNFx",
    "underlyingTicker": "FNF",
    "mint": "XsPH7DxK5rGBdoFSSCpU6HgJZp1mKpRTVnsKQUN1j8B",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e329cf0d8d5d6ca3ebe1_FNFx.png",
    "decimals": 8
  },
  {
    "slug": "fidelity-national-information-services-xstock",
    "name": "Fidelity National Information Services xStock",
    "symbol": "FISx",
    "underlyingTicker": "FIS",
    "mint": "XsTdkPyDNVtJYUjV7VhyZwtqQmA2Lg4DdTkRjYPD2gQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2cb4e56d67ba7ec4d44_FISx.png",
    "decimals": 8
  },
  {
    "slug": "fifth-third-bancorp-xstock",
    "name": "Fifth Third Bancorp xStock",
    "symbol": "FITBx",
    "underlyingTicker": "FITB",
    "mint": "XsVsC5yPcJKdeuZDejjymo2KJTuE3zdXZoSVuTXA7qv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2360b02c72b786c2304_FITBx.png",
    "decimals": 8
  },
  {
    "slug": "first-citizens-bancshares-xstock",
    "name": "First Citizens BancShares xStock",
    "symbol": "FCNCAx",
    "underlyingTicker": "FCNCA",
    "mint": "XsccgtwEgwSxTh553v8iVLxNUrbHJfdnaJUjxgZfr48",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ddc3e7fb8af52b7fde_FCNCAx.png",
    "decimals": 8
  },
  {
    "slug": "first-horizon-xstock",
    "name": "First Horizon xStock",
    "symbol": "FHNx",
    "underlyingTicker": "FHN",
    "mint": "XsD9pjJdLHkbvk3hGF13Mq9nY5ELLeGbQAoeDLZcRY8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e343b6da94eb4c76fb8b_FHNx.png",
    "decimals": 8
  },
  {
    "slug": "first-solar-xstock",
    "name": "First Solar xStock",
    "symbol": "FSLRx",
    "underlyingTicker": "FSLR",
    "mint": "XsSbcq8MZso4DLAMgtRKjzCvgozdh4sje8PLj45kxJZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27e2f7186b5206227ef_FSLRx.png",
    "decimals": 8
  },
  {
    "slug": "firstenergy-xstock",
    "name": "FirstEnergy xStock",
    "symbol": "FEx",
    "underlyingTicker": "FE",
    "mint": "XsLpCFJxUb43H6da8YzrS4j79wuddw8Z4GETup7hKMc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28fb588832a4c88a0df_FEx.png",
    "decimals": 8
  },
  {
    "slug": "fiserv-xstock",
    "name": "Fiserv xStock",
    "symbol": "FISVx",
    "underlyingTicker": "FISV",
    "mint": "XsXU2DbkVLWPRBG3QEpEXCTKS8Jv8VCxkB7e7ThdyLC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2967992dc1d3a69ad03_FISVx.png",
    "decimals": 8
  },
  {
    "slug": "ford-motor-xstock",
    "name": "Ford Motor xStock",
    "symbol": "Fx",
    "underlyingTicker": "F",
    "mint": "XsBNJXGu68cBH5hgFxdqZkeh8cMQv32jeEtZtYTYvfS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2191e352bc5cecd51ab_Fx.png",
    "decimals": 8
  },
  {
    "slug": "fortinet-xstock",
    "name": "Fortinet xStock",
    "symbol": "FTNTx",
    "underlyingTicker": "FTNT",
    "mint": "XsWrVR5F8eUgoienkVAQLwjvtzEAUoWWcwhcDzu3qRX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1cee6a2081336f85a8f_FTNTx.png",
    "decimals": 8
  },
  {
    "slug": "fortive-xstock",
    "name": "Fortive xStock",
    "symbol": "FTVx",
    "underlyingTicker": "FTV",
    "mint": "XsvL1QcWfqpUM7CQzcNsicatBTZK2dgJRTor3SHUXdD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d51cd17aa2ee833dc1_FTVx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-clearbridge-enhanced-income-xstock",
    "name": "Franklin ClearBridge Enhanced Income xStock",
    "symbol": "YLDEx",
    "underlyingTicker": "YLDE",
    "mint": "Xs4uZnG2mzZQKgnmuYboj1PRBtascAvWh5NdVMfz2aW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2132e81f51a5f6471c35_YLDEx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-intelligent-machines-xstock",
    "name": "Franklin Intelligent Machines xStock",
    "symbol": "IQMx",
    "underlyingTicker": "IQM",
    "mint": "XsGqU2JhofxjZBBhuXAroJGdiyZdvbx64tPx1Mu6DVK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2134e736d6c35aae6a55_IQMx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-senior-loan-xstock",
    "name": "Franklin Senior Loan xStock",
    "symbol": "FLBLx",
    "underlyingTicker": "FLBL",
    "mint": "XsCZJYnCmjs5cYZDMLVxVzvMy5AK2oqsWpobS6SYno8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2132e81f51a5f6471c35_YLDEx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-small-cap-enhanced-xstock",
    "name": "Franklin Small Cap Enhanced xStock",
    "symbol": "FSMLx",
    "underlyingTicker": "FSML",
    "mint": "Xs9nAeuqjogYHy2UfL6jYqGmM5MPrRjuz6UYk8H79mZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2132e81f51a5f6471c35_YLDEx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-u-s-equity-index-xstock",
    "name": "Franklin U.S. Equity Index xStock",
    "symbol": "USPXx",
    "underlyingTicker": "USPX",
    "mint": "XsBNz5UKYqcALjS5Xnm7HesMapyKLxkmfWPGHBek36x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2132e81f51a5f6471c35_YLDEx.png",
    "decimals": 8
  },
  {
    "slug": "franklin-u-s-mid-cap-multi-factor-xstock",
    "name": "Franklin U.S. Mid Cap Multi-Factor xStock",
    "symbol": "FLQMx",
    "underlyingTicker": "FLQM",
    "mint": "XsZdwvwEAn7KH8bCCo8AkxJmSm4MbaRxcDeh9Gt2VTF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2132e81f51a5f6471c35_YLDEx.png",
    "decimals": 8
  },
  {
    "slug": "freeport-mcmoran-xstock",
    "name": "Freeport-McMoRan xStock",
    "symbol": "FCXx",
    "underlyingTicker": "FCX",
    "mint": "XsT9Z9BYM5Bp2JAuKVgw1XLdENGyvQwC5C2gAuzeKyY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c52421b195884c704d_FCXx.png",
    "decimals": 8
  },
  {
    "slug": "ftai-aviation-xstock",
    "name": "FTAI Aviation xStock",
    "symbol": "FTAIx",
    "underlyingTicker": "FTAI",
    "mint": "XsX857TxHhoS3CbRt58me2xx8zcAn6n5kMJScZKrHJa",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28512ec47a2210bf6ef_FTAIx.png",
    "decimals": 8
  },
  {
    "slug": "fundrise-innovation-fund-llc-xstock",
    "name": "Fundrise Innovation Fund, LLC xStock",
    "symbol": "VCXx",
    "underlyingTicker": "VCX",
    "mint": "Xs7UsqobM3EJgMeHwdAbmDBCZH1G5WTCjatpeYcCr8x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47025118263491619ac6d_VCXx.png",
    "decimals": 8
  },
  {
    "slug": "galaxy-digital-xstock",
    "name": "Galaxy Digital xStock",
    "symbol": "GLXYx",
    "underlyingTicker": "GLXY",
    "mint": "Xs3c2aZenyRQwXjki5MDxJEJ2km27ef2rWQMFWx7QKJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7e003105b5ac81fac5fdc_Ticker%3DGLXYx%2C%20Company%20Name%3DGalaxy%20Digital%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "galaxy-entertainment-xstock",
    "name": "Galaxy Entertainment xStock",
    "symbol": "GENTEx",
    "underlyingTicker": "GENTE",
    "mint": "Xs8q9nMs3HPqxpGqxRXaSrnVcMXPKkXzR9f9XT9doXG",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099fe5bb37e9dda124c38_GENTEx.png",
    "decimals": 8
  },
  {
    "slug": "gamestop-xstock",
    "name": "Gamestop xStock",
    "symbol": "GMEx",
    "underlyingTicker": "GME",
    "mint": "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c125f1c48a3dab4c66137_Ticker%3DGME%2C%20Company%20Name%3Dgamestop%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "gaming-and-leisure-properties-xstock",
    "name": "Gaming and Leisure Properties xStock",
    "symbol": "GLPIx",
    "underlyingTicker": "GLPI",
    "mint": "XsbohnBoBBbXg2scrDy9yzBqeXhNN53F5dcjwFF8XFR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32f1781f40f2ddd7bb5_GLPIx.png",
    "decimals": 8
  },
  {
    "slug": "ge-aerospace-xstock",
    "name": "GE Aerospace xStock",
    "symbol": "GEx",
    "underlyingTicker": "GE",
    "mint": "XsfsBjSZoXXKJsxoSt8TyLYsjhBAKFaDPZTCQbFRirP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e19536507d0c6e99d259_GEx.png",
    "decimals": 8
  },
  {
    "slug": "ge-healthcare-technologies-xstock",
    "name": "GE HealthCare Technologies xStock",
    "symbol": "GEHCx",
    "underlyingTicker": "GEHC",
    "mint": "XsQoxoLVogLGYRRRcFwjdcFQVLxFpCuYfDtvh3vJ2Ft",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e271268c11bbce994a5b_GEHCx.png",
    "decimals": 8
  },
  {
    "slug": "ge-vernova-inc-xstock",
    "name": "GE Vernova Inc. xStock",
    "symbol": "GEVx",
    "underlyingTicker": "GEV",
    "mint": "XswXzAsMV9kebQjCVtr1btvrQgQ7C4C9kKgH4QYAVzw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47024abb509491b0e50bb_GEVx.png",
    "decimals": 8
  },
  {
    "slug": "geely-automobile-xstock",
    "name": "Geely Automobile xStock",
    "symbol": "GEELx",
    "underlyingTicker": "GEEL",
    "mint": "XsxsXLryvGn9xUBvkzcjNLR9C1krKy8YEySN7yVEyme",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f07f499c94e28a0799_GEELx.png",
    "decimals": 8
  },
  {
    "slug": "gen-digital-xstock",
    "name": "Gen Digital xStock",
    "symbol": "GENx",
    "underlyingTicker": "GEN",
    "mint": "Xso2H7vbDS6HVokLUecSG5GvWAZXjH7PEHAH9rAYXUP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e328f87302708563cccb_GENx.png",
    "decimals": 8
  },
  {
    "slug": "generac-xstock",
    "name": "Generac xStock",
    "symbol": "GNRCx",
    "underlyingTicker": "GNRC",
    "mint": "XsAiJ9xc1eBoVEz4npaJqySHLrpCoyo1oFfJJpYSXPW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3053d340815b60eadf4_GNRCx.png",
    "decimals": 8
  },
  {
    "slug": "general-dynamics-xstock",
    "name": "General Dynamics xStock",
    "symbol": "GDx",
    "underlyingTicker": "GD",
    "mint": "Xsgk6nv6V81zQms4mcvUiEtLDdVueXfWPRCaxayqkSN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1cf3bed1b88de0c0481_GDx.png",
    "decimals": 8
  },
  {
    "slug": "general-mills-xstock",
    "name": "General Mills xStock",
    "symbol": "GISx",
    "underlyingTicker": "GIS",
    "mint": "XsKfQxVh7wasRmzPQEs4qvnmayt5KTX1CqvQdJ8XcSJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2dd6ee5fff84d2ee143_GISx.png",
    "decimals": 8
  },
  {
    "slug": "general-motors-xstock",
    "name": "General Motors xStock",
    "symbol": "GMx",
    "underlyingTicker": "GM",
    "mint": "XsSFgHPgZgYNSuz1ttNHNp8zUBBMZGngFcMMfKPK6JQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e6953f0b6f81d3c4e8_GMx.png",
    "decimals": 8
  },
  {
    "slug": "genuine-parts-xstock",
    "name": "Genuine Parts xStock",
    "symbol": "GPCx",
    "underlyingTicker": "GPC",
    "mint": "XsAB7oiJL94kURXya1i35Rv9ZoY9EoJSWM3dQ9mZp7t",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31195063765fcf39ef5_GPCx.png",
    "decimals": 8
  },
  {
    "slug": "gilead-sciences-xstock",
    "name": "Gilead Sciences xStock",
    "symbol": "GILDx",
    "underlyingTicker": "GILD",
    "mint": "XsmAFboVqfDwGPgXfd7oCunvYAYSzzkuKE2BDRzwjGy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1abf873027085627c5b_GILDx.png",
    "decimals": 8
  },
  {
    "slug": "global-payments-xstock",
    "name": "Global Payments xStock",
    "symbol": "GPNx",
    "underlyingTicker": "GPN",
    "mint": "XsKbuY5Wyzz7Zzz6uxi69hHdxhrE53d746Sb1jBZyD1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fb28410e9537a9f030_GPNx.png",
    "decimals": 8
  },
  {
    "slug": "global-x-copper-miners-xstock",
    "name": "Global X Copper Miners xStock",
    "symbol": "COPXx",
    "underlyingTicker": "COPX",
    "mint": "XsybfiKkD4UmjkAGT2uR8X2sq9AWFtvGJM2KTffoALZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833cf2da07851a5f7fc225_Ticker%3DCOPXx%2C%20Company%20Name%3DGlobal%20X%20Copper%20Miners%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "global-x-dax-germany-xstock",
    "name": "Global X DAX Germany xStock",
    "symbol": "DAXx",
    "underlyingTicker": "DAX",
    "mint": "XsKbKZ6e1BtERDn2cF11WkpVwvzSWCrf83AMafgnMQT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2153bd217b698278a2b5_DAXx.png",
    "decimals": 8
  },
  {
    "slug": "global-x-uranium-etf-xstock",
    "name": "Global X Uranium ETF xStock",
    "symbol": "URAx",
    "underlyingTicker": "URA",
    "mint": "Xsq9sEQjYiUTSZ55RrbHAzVfz8HotwFGrqgxkgiv4LB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47026450797bfec90f0b4_URAx.png",
    "decimals": 8
  },
  {
    "slug": "globe-life-xstock",
    "name": "Globe Life xStock",
    "symbol": "GLx",
    "underlyingTicker": "GL",
    "mint": "Xs2yt21rb2HpuMxE2EBHpcfd8mGdDPDysgWjVaDDR5w",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32724dc85407f7aedc7_GLx.png",
    "decimals": 8
  },
  {
    "slug": "gold-xstock",
    "name": "Gold xStock",
    "symbol": "GLDx",
    "underlyingTicker": "GLD",
    "mint": "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/685123a7747987b071b10d47_Ticker%3DGLD%2C%20Company%20Name%3DGold%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "goldman-sachs-xstock",
    "name": "Goldman Sachs xStock",
    "symbol": "GSx",
    "underlyingTicker": "GS",
    "mint": "XsgaUyp4jd1fNBCxgtTKkW64xnnhQcvgaxzsbAq5ZD1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c114972ed2d868a1b3f95_Ticker%3DGS%2C%20Company%20Name%3DGoldman%20Sachs%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "graco-xstock",
    "name": "Graco xStock",
    "symbol": "GGGx",
    "underlyingTicker": "GGG",
    "mint": "XseQK4PEeLfxY7HgvuSiawFUL5gfveK2maPMV9Ma8qv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3332f7186b52062c290_GGGx.png",
    "decimals": 8
  },
  {
    "slug": "haidilao-international-xstock",
    "name": "Haidilao International xStock",
    "symbol": "HAIDLx",
    "underlyingTicker": "HAIDL",
    "mint": "XssLkiDcsHvkTi2BXDLnXszTktNnTPBXFMVTvMBvVtb",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a366a1a71f98486bf9f_HAIDLx.png",
    "decimals": 8
  },
  {
    "slug": "haier-smart-home-xstock",
    "name": "Haier Smart Home xStock",
    "symbol": "HAIERx",
    "underlyingTicker": "HAIER",
    "mint": "XsW6LqAt4tGLAWu31ya4BQ9DLdpXeVEDSNZSqzbkYRC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099e7891d3d57311cce33_HAIERx.png",
    "decimals": 8
  },
  {
    "slug": "halliburton-xstock",
    "name": "Halliburton xStock",
    "symbol": "HALx",
    "underlyingTicker": "HAL",
    "mint": "XsYq2q3UxkwdHmhxJf5wbuXfDWuy5mYP5xsDBVEDK8Q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26836507d0c6e9a5365_HALx.png",
    "decimals": 8
  },
  {
    "slug": "hasbro-xstock",
    "name": "Hasbro xStock",
    "symbol": "HASx",
    "underlyingTicker": "HAS",
    "mint": "XsRgwrznvMYsZ1i7ckfxjk6RWR4npsmZT3kqHuRfrva",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e348253b5873d2d082b4_HASx.png",
    "decimals": 8
  },
  {
    "slug": "hca-healthcare-xstock",
    "name": "HCA Healthcare xStock",
    "symbol": "HCAx",
    "underlyingTicker": "HCA",
    "mint": "XsJ5MSaKx3Y6bKEfmrRmovGEdRM53KWqEEHuaNUsQpD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e20af7bf3b563833ff7e_HCAx.png",
    "decimals": 8
  },
  {
    "slug": "healthpeak-properties-xstock",
    "name": "Healthpeak Properties xStock",
    "symbol": "DOCx",
    "underlyingTicker": "DOC",
    "mint": "XsgtMhyQgTevrWQNyLpHxwQeRAeaxQEtoiV1pNyxmfy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31c12b481cd10a7b884_DOCx.png",
    "decimals": 8
  },
  {
    "slug": "heico-xstock",
    "name": "Heico xStock",
    "symbol": "HEIx",
    "underlyingTicker": "HEI",
    "mint": "XsjZ8V6qPBNbhXeFawPssBPUW8f7Sv39uxEnzxCboTq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31912ec47a2210c8035_HEIx.png",
    "decimals": 8
  },
  {
    "slug": "henderson-land-development-xstock",
    "name": "Henderson Land Development xStock",
    "symbol": "HNDLDx",
    "underlyingTicker": "HNDLD",
    "mint": "XsXQAtNjEzXfEotjKz6QQ9WHBdhbzMbPJDQfsc3UR7D",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a008d6487a776d7e1ab_HNDLDx.png",
    "decimals": 8
  },
  {
    "slug": "hewlett-packard-enterprise-xstock",
    "name": "Hewlett Packard Enterprise xStock",
    "symbol": "HPEx",
    "underlyingTicker": "HPE",
    "mint": "Xszp97B7zgeyNUFkymHdxXp3Y5KTZ1rzd2bAL9TW34t",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e208c8a1cd3be66eec6e_HPEx.png",
    "decimals": 8
  },
  {
    "slug": "hilton-worldwide-xstock",
    "name": "Hilton Worldwide xStock",
    "symbol": "HLTx",
    "underlyingTicker": "HLT",
    "mint": "Xs66hB4NftAJmu73aeBc6RXQC4DX4LwU4xvnfsz581r",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e07e6b3ff5a3a9c143_HLTx.png",
    "decimals": 8
  },
  {
    "slug": "hims-hers-xstock",
    "name": "Hims & Hers xStock",
    "symbol": "HIMSx",
    "underlyingTicker": "HIMS",
    "mint": "XsprHSJzwz3qmHcEf7j7WcUk6hMUL4sPLuAdWaSY1oh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2129e9b56934e3149170_HIMSx.png",
    "decimals": 8
  },
  {
    "slug": "home-depot-xstock",
    "name": "Home Depot xStock",
    "symbol": "HDx",
    "underlyingTicker": "HD",
    "mint": "XszjVtyhowGjSC5odCqBpW1CtXXwXjYokymrk7fGKD3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be484171c0a11201e098d_Ticker%3DHD%2C%20Company%20Name%3DHome%20Depot%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "honeywell-xstock",
    "name": "Honeywell xStock",
    "symbol": "HONx",
    "underlyingTicker": "HON",
    "mint": "XsRbLZthfABAPAfumWNEJhPyiKDW6TvDVeAeW7oKqA2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c08d12385ea1da806a5bb_Ticker%3DHON%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "hong-kong-and-china-gas-xstock",
    "name": "Hong Kong and China Gas xStock",
    "symbol": "HKCGAx",
    "underlyingTicker": "HKCGA",
    "mint": "XsgLierNGzsEw1eziSPaKANRPfxXadZ6syo4WdGz2S7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a015d95fd32a2be4f61_HKCGAx.png",
    "decimals": 8
  },
  {
    "slug": "hong-kong-exchanges-and-clearing-xstock",
    "name": "Hong Kong Exchanges and Clearing xStock",
    "symbol": "HKEXCx",
    "underlyingTicker": "HKEXC",
    "mint": "XsZQt7qW9vH5SWXZPsn1ZAybCSkq5MW2r6HGo891u1X",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099cd6ca3df47b271778e_HKEXCx.png",
    "decimals": 8
  },
  {
    "slug": "horizon-robotics-xstock",
    "name": "Horizon Robotics xStock",
    "symbol": "HRZRBx",
    "underlyingTicker": "HRZRB",
    "mint": "XskaoJotEKofUeTnxQfvoQuW2kbL53uvnDJqVXj7Gf7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a345ada5f1c877265ac_HRZRBx.png",
    "decimals": 8
  },
  {
    "slug": "host-hotels-resorts-xstock",
    "name": "Host Hotels & Resorts xStock",
    "symbol": "HSTx",
    "underlyingTicker": "HST",
    "mint": "XsYbh3CsZ4qCMcfPKEtHAYbePTywhwCkFvdN7Hx3bHA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e63dedcedc87d9c69c_HSTx.png",
    "decimals": 8
  },
  {
    "slug": "howmet-aerospace-xstock",
    "name": "Howmet Aerospace xStock",
    "symbol": "HWMx",
    "underlyingTicker": "HWM",
    "mint": "XsCX8NnXq3qx6zUxXxWwjV2yQnGc9C5y6UyXvE6RG7r",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c21e352bc5ceccee33_HWMx.png",
    "decimals": 8
  },
  {
    "slug": "hp-xstock",
    "name": "HP xStock",
    "symbol": "HPQx",
    "underlyingTicker": "HPQ",
    "mint": "Xs23PmjqLoJvcLJ2LyMzi17HmkFua1yZsmcxWd4q8Zz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b7c1a6bf4e7d22108a_HPQx.png",
    "decimals": 8
  },
  {
    "slug": "hubbell-xstock",
    "name": "Hubbell xStock",
    "symbol": "HUBBx",
    "underlyingTicker": "HUBB",
    "mint": "XsCz2AUyFUuadE9zxfs7ywkbMvaQNeVTeNBK15L43Qc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28cde2cb121e356f8e3_HUBBx.png",
    "decimals": 8
  },
  {
    "slug": "humana-xstock",
    "name": "Humana xStock",
    "symbol": "HUMx",
    "underlyingTicker": "HUM",
    "mint": "XseFxRyaaJixiAzKBrSZAAKSLMQKVYceUGadwUAsQ7L",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23bb961d41733074716_HUMx.png",
    "decimals": 8
  },
  {
    "slug": "huntington-bancshares-xstock",
    "name": "Huntington Bancshares xStock",
    "symbol": "HBANx",
    "underlyingTicker": "HBAN",
    "mint": "XsuFbhEyBaWikFEfA3QM92rr9VVYm79Lip4cC5rnSp5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e260c7e87feb70ac06cf_HBANx.png",
    "decimals": 8
  },
  {
    "slug": "hut-8-xstock",
    "name": "Hut 8 xStock",
    "symbol": "HUTx",
    "underlyingTicker": "HUT",
    "mint": "XsG5QyZTQnVSpsXRpD92K5ZGoxXjsmfTyx7fW7r18DV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9276eb010df995f68ade2_Ticker%3DHUTx%2C%20Company%20Name%3DHut%208%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "idex-xstock",
    "name": "IDEX xStock",
    "symbol": "IEXx",
    "underlyingTicker": "IEX",
    "mint": "XsYoSPpGDGNwgn5HDxgwFxbcrsf8Xjr4Lc62j33JjfK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e59e65d1c9321053c4_IEXx.png",
    "decimals": 8
  },
  {
    "slug": "idexx-laboratories-xstock",
    "name": "IDEXX Laboratories xStock",
    "symbol": "IDXXx",
    "underlyingTicker": "IDXX",
    "mint": "Xs2AVjDnFK6ShEvX6QfSFodHpy8znSBhimB4kvTFTa1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23e52efb881364cc17a_IDXXx.png",
    "decimals": 8
  },
  {
    "slug": "illinois-tool-works-xstock",
    "name": "Illinois Tool Works xStock",
    "symbol": "ITWx",
    "underlyingTicker": "ITW",
    "mint": "Xs7NEcjqek7SN135xwSafr721njNVyenBdd7NDG2cYo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e424dc85407f79d1c0_ITWx.png",
    "decimals": 8
  },
  {
    "slug": "illumina-xstock",
    "name": "Illumina xStock",
    "symbol": "ILMNx",
    "underlyingTicker": "ILMN",
    "mint": "XsahzH43C2rZpZmYX6eCm2avkeYCzntC168xPdqrDzi",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e295de2cb121e3570842_ILMNx.png",
    "decimals": 8
  },
  {
    "slug": "incyte-xstock",
    "name": "Incyte xStock",
    "symbol": "INCYx",
    "underlyingTicker": "INCY",
    "mint": "XspemH4yD2PcDuZP4g8whQEeve3jrGbX331ksyaR9G3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f812b481cd10a7a2d8_INCYx.png",
    "decimals": 8
  },
  {
    "slug": "industrial-and-commercial-bank-of-china-xstock",
    "name": "Industrial And Commercial Bank Of China xStock",
    "symbol": "ICBCx",
    "underlyingTicker": "ICBC",
    "mint": "XswoSyxJ3NayixJFM4y7JUNL8CFDrL68oUw7nr3Kbnz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b09af13d6c349fab83_ICBCx.png",
    "decimals": 8
  },
  {
    "slug": "ingersoll-rand-xstock",
    "name": "Ingersoll Rand xStock",
    "symbol": "IRx",
    "underlyingTicker": "IR",
    "mint": "XsWx5RzivC8d5XwnLiMcgQqqhXiDnrTDwFCDap1o6NW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26dde2cb121e356dcd9_IRx.png",
    "decimals": 8
  },
  {
    "slug": "insmed-xstock",
    "name": "Insmed xStock",
    "symbol": "INSMx",
    "underlyingTicker": "INSM",
    "mint": "XsR6i1PnDGCbiV1KHsiMBdKz4MuDgpWHr3QSwC7zNMz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c8cf0d8d5d6ca3b63e_INSMx.png",
    "decimals": 8
  },
  {
    "slug": "intel-xstock",
    "name": "Intel xStock",
    "symbol": "INTCx",
    "underlyingTicker": "INTC",
    "mint": "XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0a334cac334b4a41651b_Ticker%3DINTC%2C%20Company%20Name%3DIntel%20Corp%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "interactive-brokers-xstock",
    "name": "Interactive Brokers xStock",
    "symbol": "IBKRx",
    "underlyingTicker": "IBKR",
    "mint": "XsTS8D9tBV6oQRqkixzNCThctMwFzxScetp4BA9ByTK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24cf873027085630fb4_IBKRx.png",
    "decimals": 8
  },
  {
    "slug": "intercontinental-exchange-xstock",
    "name": "Intercontinental Exchange xStock",
    "symbol": "ICEx",
    "underlyingTicker": "ICE",
    "mint": "XsG6o69zE7mQCeFf6utyMx9Q89cJjGV4vTwi3wFHrkN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1dd3d340815b60d5b6b_ICEx.png",
    "decimals": 8
  },
  {
    "slug": "international-business-machines-xstock",
    "name": "International Business Machines xStock",
    "symbol": "IBMx",
    "underlyingTicker": "IBM",
    "mint": "XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bfb32f7000e98d733283f_Ticker%3DIBM%2C%20Company%20Name%3DIBM%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "international-flavors-fragrances-xstock",
    "name": "International Flavors & Fragrances xStock",
    "symbol": "IFFx",
    "underlyingTicker": "IFF",
    "mint": "XsXhUW1Mcpff3vCZWb7v3USU5Zpg1nvFPyfzF3XD6NP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2cebe2927c932a02e25_IFFx.png",
    "decimals": 8
  },
  {
    "slug": "international-paper-xstock",
    "name": "International Paper xStock",
    "symbol": "IPx",
    "underlyingTicker": "IP",
    "mint": "XsS6AVyq5YpDA5yCUYuwxvkk5hvKvFxAt5tUJik9Y5H",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d7ab2b9761d3a5987c_IPx.png",
    "decimals": 8
  },
  {
    "slug": "intuit-xstock",
    "name": "Intuit xStock",
    "symbol": "INTUx",
    "underlyingTicker": "INTU",
    "mint": "XsfodJMz7SyMNsSgATVDcbuMiQDqQoAiRTL1xuyHNUn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e26f3f12933f86c118_INTUx.png",
    "decimals": 8
  },
  {
    "slug": "intuitive-surgical-xstock",
    "name": "Intuitive Surgical xStock",
    "symbol": "ISRGx",
    "underlyingTicker": "ISRG",
    "mint": "XsgBcHP3frsQGHr5EoDdoPZMANk52Y4JPg5BYx98NwL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1aff6cce9266a56fbb9_ISRGx.png",
    "decimals": 8
  },
  {
    "slug": "invitation-homes-xstock",
    "name": "Invitation Homes xStock",
    "symbol": "INVHx",
    "underlyingTicker": "INVH",
    "mint": "XsQFmCYjvPGgqYYAth5zNhW8NSCabdamgM1kXMorJs7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e2c7e87feb70acb396_INVHx.png",
    "decimals": 8
  },
  {
    "slug": "iqvia-xstock",
    "name": "IQVIA xStock",
    "symbol": "IQVx",
    "underlyingTicker": "IQV",
    "mint": "Xstzb2X8HbtJVUephHsF7XknnwiBRYMxWoLyfUBWaoC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26fda3d6aedb4348daa_IQVx.png",
    "decimals": 8
  },
  {
    "slug": "iren-xstock",
    "name": "IREN xStock",
    "symbol": "IRENx",
    "underlyingTicker": "IREN",
    "mint": "Xshh1dRsnxatP45yBfrzU9MrvrFCvxHQGTrWjgdA81E",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b212b30538b9572d1c30a_IRENx.png",
    "decimals": 8
  },
  {
    "slug": "iron-mountain-xstock",
    "name": "Iron Mountain xStock",
    "symbol": "IRMx",
    "underlyingTicker": "IRM",
    "mint": "XssP4Vb5pahDsdKUXy74gD34DzotHCYKGXegd1KHdiA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e257f873027085631c5f_IRMx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-0-3-month-treasury-bond-etf-xstock",
    "name": "iShares 0-3 Month Treasury Bond ETF xStock",
    "symbol": "SGOVx",
    "underlyingTicker": "SGOV",
    "mint": "XsYD72ntjj7ZwoFDZCDmN2gamTcLpnywqvG7PQN5vCN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470267cb1279c0aae519f_SGOVx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-msci-france-xstock",
    "name": "iShares MSCI France xStock",
    "symbol": "EWQx",
    "underlyingTicker": "EWQ",
    "mint": "Xs1neEMHNaDDSHqE9nvDGkmuX73ZASKcLtQqwmVAQde",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b214d39febb098a5c7eb6_EWQx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-msci-germany-xstock",
    "name": "iShares MSCI Germany xStock",
    "symbol": "EWGx",
    "underlyingTicker": "EWG",
    "mint": "XsM51PKxDNQBZR65VRxRjNqcMWUBoYwHeVn2FR6WXi9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b214d39febb098a5c7eb6_EWQx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-msci-south-korea-xstock",
    "name": "iShares MSCI South Korea xStock",
    "symbol": "EWYx",
    "underlyingTicker": "EWY",
    "mint": "XswenHXJtDWYMh89uRYx2tZcABxwXSn7j3jidDPS1Yo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b214d39febb098a5c7eb6_EWQx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-msci-united-kingdom-xstock",
    "name": "iShares MSCI United Kingdom xStock",
    "symbol": "EWUx",
    "underlyingTicker": "EWU",
    "mint": "XsbWCMXPzLdZMLpPtiiWE7M99fySmsnK5eFCWGWfDQ8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b214d39febb098a5c7eb6_EWQx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-semiconductor-xstock",
    "name": "iShares Semiconductor xStock",
    "symbol": "SOXXx",
    "underlyingTicker": "SOXX",
    "mint": "XsEsHeiNZf88sABxu74TPuXbQThdaQGdzPVZUBicjtQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b214d39febb098a5c7eb6_EWQx.png",
    "decimals": 8
  },
  {
    "slug": "ishares-silver-trust-xstock",
    "name": "iShares Silver Trust xStock",
    "symbol": "SLVx",
    "underlyingTicker": "SLV",
    "mint": "XsxAd6okt8y1RRK6gNg7iJaqiWNiq5Md5EDf3ZrF2dm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833ceacd346c4f31385d24_Ticker%3DSLVx%2C%20Company%20Name%3DiShares%20Silver%20Trust%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "ishares-u-s-aerospace-defense-etf-xstock",
    "name": "iShares U.S. Aerospace & Defense ETF xStock",
    "symbol": "ITAx",
    "underlyingTicker": "ITA",
    "mint": "XsXoAR52Q2NYFkYiNqhCq4FauvyA1tdRsrmEYNf9fuh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470267cb1279c0aae519f_SGOVx.png",
    "decimals": 8
  },
  {
    "slug": "itt-xstock",
    "name": "ITT xStock",
    "symbol": "ITTx",
    "underlyingTicker": "ITT",
    "mint": "Xsva3qbt1TDUgQPnU3vVDasaPoUHXPU9FjYXzEUYY8G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f2536f62aa99a9e5a1_ITTx.png",
    "decimals": 8
  },
  {
    "slug": "j-m-smucker-xstock",
    "name": "J.M. Smucker xStock",
    "symbol": "SJMx",
    "underlyingTicker": "SJM",
    "mint": "XsqtzaHCKV2zsgRYitGJtcecfmBkdJsdrpSXZgQryHE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34636507d0c6e9b0e87_SJMx.png",
    "decimals": 8
  },
  {
    "slug": "j-t-global-express-xstock",
    "name": "J&T Global Express xStock",
    "symbol": "JTGEXx",
    "underlyingTicker": "JTGEX",
    "mint": "XsMotTTUju1CZRh88eCRM1Pm6f91qHh1kbmaBYdS85b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a1ca2ebbe869a8b182a_JTGEXx.png",
    "decimals": 8
  },
  {
    "slug": "jabil-xstock",
    "name": "Jabil xStock",
    "symbol": "JBLx",
    "underlyingTicker": "JBL",
    "mint": "XsnZQ49Abxr3RJgRSxYd4azhUg4MQVT3amiyaq84oA1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e249de2cb121e356c7fe_JBLx.png",
    "decimals": 8
  },
  {
    "slug": "jacobs-solutions-xstock",
    "name": "Jacobs Solutions xStock",
    "symbol": "Jx",
    "underlyingTicker": "J",
    "mint": "Xs2ry2jjmvy67pYFweVbdeoPPRdUjnbBEubtXguWbXK",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30d0b02c72b786cdac1_Jx.png",
    "decimals": 8
  },
  {
    "slug": "janus-henderson-aaa-clo-xstock",
    "name": "Janus Henderson AAA CLO xStock",
    "symbol": "JAAAx",
    "underlyingTicker": "JAAA",
    "mint": "XsEYQJtVa51Ww3y28jV1FwheMgmDj8BpxYiCPThcLWW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b213b282383c65f317242_JAAAx.png",
    "decimals": 8
  },
  {
    "slug": "jb-hunt-transport-services-xstock",
    "name": "JB Hunt Transport Services xStock",
    "symbol": "JBHTx",
    "underlyingTicker": "JBHT",
    "mint": "Xs5CSFf663gjowEA7ANX8ZhPe4AkLWMqLbriVu1JmUV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bcc1a6bf4e7d22133d_JBHTx.png",
    "decimals": 8
  },
  {
    "slug": "jd-health-international-xstock",
    "name": "JD Health International xStock",
    "symbol": "JDHLTx",
    "underlyingTicker": "JDHLT",
    "mint": "Xsaax31N2dJnKtkDbbJfvdYgz1zWmgx3xaYf6yjNuWx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a05b5ef2b3729ab9b8c_JDHLTx.png",
    "decimals": 8
  },
  {
    "slug": "jd-logistics-xstock",
    "name": "JD Logistics xStock",
    "symbol": "JDLOGx",
    "underlyingTicker": "JDLOG",
    "mint": "XsrGQPAF78mZRdnYK9U7m9wR93h3zpToVGv9yAuQUzf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a21882ab1db4373eba3_JDLOGx.png",
    "decimals": 8
  },
  {
    "slug": "jersey-mikes-subs-xstock",
    "name": "Jersey Mike's Subs xStock",
    "symbol": "JMKEx",
    "underlyingTicker": "JMKE",
    "mint": "XsBeB5z2oA2fvaVim3rRbqHV4Cxxz9nNCjqoUtFooXY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690853e45caa7299114e3e_JMIKESx.png",
    "decimals": 8
  },
  {
    "slug": "johnson-johnson-xstock",
    "name": "Johnson & Johnson xStock",
    "symbol": "JNJx",
    "underlyingTicker": "JNJ",
    "mint": "XsGVi5eo1Dh2zUpic4qACcjuWGjNv8GCt3dm5XcX6Dn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684ace98941130a24503a315_Ticker%3DJNJ%2C%20Company%20Name%3Djohnson-johnson%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "jones-lang-lasalle-xstock",
    "name": "Jones Lang LaSalle xStock",
    "symbol": "JLLx",
    "underlyingTicker": "JLL",
    "mint": "Xs8YQm9hLMTcTVSdPwBDLTFLpbcyxYBG4SGPXRp5s2y",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31e6ee5fff84d2f066f_JLLx.png",
    "decimals": 8
  },
  {
    "slug": "jpmorgan-chase-xstock",
    "name": "JPMorgan Chase xStock",
    "symbol": "JPMx",
    "underlyingTicker": "JPM",
    "mint": "XsMAqkcKsUewDrzVkait4e5u4y8REgtyS7jWgCpLV2C",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684acf34c10a7e0add155c61_Ticker%3DJPM%2C%20Company%20Name%3DJPMorganChase%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "jpmorgan-ultra-short-income-xstock",
    "name": "JPMorgan Ultra-Short Income xStock",
    "symbol": "JPSTx",
    "underlyingTicker": "JPST",
    "mint": "XsCAXu7xTaZMG9b9KJhNWYapuvNjxPuE4SysZq8uvMq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2139c629c99daba99326_JPSTx.png",
    "decimals": 8
  },
  {
    "slug": "kenvue-xstock",
    "name": "Kenvue xStock",
    "symbol": "KVUEx",
    "underlyingTicker": "KVUE",
    "mint": "XsDDkXqF1sr1ixW4Y93Geqfd2LbrWxokCjQf9poGN3c",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25fab2b9761d3a54073_KVUEx.png",
    "decimals": 8
  },
  {
    "slug": "keurig-dr-pepper-xstock",
    "name": "Keurig Dr Pepper xStock",
    "symbol": "KDPx",
    "underlyingTicker": "KDP",
    "mint": "XsdvuTpWkg6TSzpGJrdEwUwtWT7UrUzMxYTLhUZs9s9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e246be2927c9329faf3a_KDPx.png",
    "decimals": 8
  },
  {
    "slug": "keycorp-xstock",
    "name": "KeyCorp xStock",
    "symbol": "KEYx",
    "underlyingTicker": "KEY",
    "mint": "Xs5GgkWgze4XgU7NC5iXJqvbGufxQBJKH5JRN2MSPWQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c7a75e19a321125dd0_KEYx.png",
    "decimals": 8
  },
  {
    "slug": "keysight-technologies-xstock",
    "name": "Keysight Technologies xStock",
    "symbol": "KEYSx",
    "underlyingTicker": "KEYS",
    "mint": "XsXzXSMoSdF3gczdPhECXHN3TwfkUpNkthUvpEJVbDn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e20f1cd17aa2ee826d4f_KEYSx.png",
    "decimals": 8
  },
  {
    "slug": "kimberly-clark-xstock",
    "name": "Kimberly-Clark xStock",
    "symbol": "KMBx",
    "underlyingTicker": "KMB",
    "mint": "XsNnfg6KXzaRsH8PE9T9YEahq3MQpSZ3dQAa4hcL1SN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2610b02c72b786c4884_KMBx.png",
    "decimals": 8
  },
  {
    "slug": "kimco-realty-xstock",
    "name": "Kimco Realty xStock",
    "symbol": "KIMx",
    "underlyingTicker": "KIM",
    "mint": "XseurSPz9hnmd6k1eQT52a8QC53QcoCoD4qVbPmWzCC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e7be2927c932a04110_KIMx.png",
    "decimals": 8
  },
  {
    "slug": "kinder-morgan-xstock",
    "name": "Kinder Morgan xStock",
    "symbol": "KMIx",
    "underlyingTicker": "KMI",
    "mint": "XsQxeWjN2M3Spr5YHRQiM1oQ8fgpJWtdBdg1E2ZrjFg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2121a4837ed32e93fee_KMIx.png",
    "decimals": 8
  },
  {
    "slug": "kkr-xstock",
    "name": "KKR xStock",
    "symbol": "KKRx",
    "underlyingTicker": "KKR",
    "mint": "XsTd1xJRAwAddguKdxYPGoS3qhctGsJb1ue4Rm6URFa",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2041e352bc5cecd325d_KKRx.png",
    "decimals": 8
  },
  {
    "slug": "kla-corporation-xstock",
    "name": "KLA Corporation xStock",
    "symbol": "KLACx",
    "underlyingTicker": "KLAC",
    "mint": "Xsw2uU1i8tHjbgstUbtt3m6kg7BS7AgG5aj8z7ddmmN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47025dc5b4018719f75f2_KLACx.png",
    "decimals": 8
  },
  {
    "slug": "knight-swift-transportation-xstock",
    "name": "Knight-Swift Transportation xStock",
    "symbol": "KNXx",
    "underlyingTicker": "KNX",
    "mint": "XsUyRqfxY2XtFvP99Lkn2DDWtxNNAY6w5CVDu1F68G1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e337f6cce9266a582289_KNXx.png",
    "decimals": 8
  },
  {
    "slug": "kraq-xstock",
    "name": "KRAQ xStock",
    "symbol": "KRAQx",
    "underlyingTicker": "KRAQ",
    "mint": "XsAiRejKuvLAdq9KtedrMSrabz7SWdzKoVK6Qgac1Ki",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69833cd1adc81c9956175fcd_Ticker%3DKRAQx%2C%20Company%20Name%3DKRAKacquisition%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "kuaishou-technology-xstock",
    "name": "Kuaishou Technology xStock",
    "symbol": "KUAIx",
    "underlyingTicker": "KUAI",
    "mint": "XsD9Zgip86m52ob2c9MNTtDVoin1KmgdCNUCCDwsEPF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f19af13d6c349fdb2a_KUAIx.png",
    "decimals": 8
  },
  {
    "slug": "kunlun-energy-xstock",
    "name": "Kunlun Energy xStock",
    "symbol": "KUNLx",
    "underlyingTicker": "KUNL",
    "mint": "XsxnZRxni2PYV3KTmfqJmZHFK1z55DV4pigWDuMZH8i",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a39a2945548620f5fe0_KUNLx.png",
    "decimals": 8
  },
  {
    "slug": "l3harris-technologies-xstock",
    "name": "L3Harris Technologies xStock",
    "symbol": "LHXx",
    "underlyingTicker": "LHX",
    "mint": "XssE4tb3kc3f5V5cRL6dsuffP9wDm915W4bAsyNf62A",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21ea75e19a32111e36b_LHXx.png",
    "decimals": 8
  },
  {
    "slug": "lam-research-corporation-xstock",
    "name": "Lam Research Corporation xStock",
    "symbol": "LRCXx",
    "underlyingTicker": "LRCX",
    "mint": "XsSN912SN4Whn2xn59vWZHt1uLbw9WnoNGp5MigmHFf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47022e23fd2cf0bc2b81f_LRCXx.png",
    "decimals": 8
  },
  {
    "slug": "lamar-advertising-xstock",
    "name": "Lamar Advertising xStock",
    "symbol": "LAMRx",
    "underlyingTicker": "LAMR",
    "mint": "XsqZyeL1GGWZzMQ5hh3KckQnXNt3Yt96QHBUdiJSoFS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32428410e9537aa0cb4_LAMRx.png",
    "decimals": 8
  },
  {
    "slug": "laopu-gold-xstock",
    "name": "Laopu Gold xStock",
    "symbol": "LAOPGx",
    "underlyingTicker": "LAOPG",
    "mint": "XscTQ6FeMPkhTuhFsrCZRn4fBmGsvqnFmPKfbC9B24g",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a33d42c44172ba082b7_LAOPGx.png",
    "decimals": 8
  },
  {
    "slug": "las-vegas-sands-xstock",
    "name": "Las Vegas Sands xStock",
    "symbol": "LVSx",
    "underlyingTicker": "LVS",
    "mint": "Xs9bwo2tkrKRJxr9787rKj2bKcQUMFNtbzruYTrxdst",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e306a75e19a321128b37_LVSx.png",
    "decimals": 8
  },
  {
    "slug": "lattice-semiconductor-xstock",
    "name": "Lattice Semiconductor xStock",
    "symbol": "LSCCx",
    "underlyingTicker": "LSCC",
    "mint": "XsjaZAWtPNA1ZWqbPZxaDWtx1h9L23ucmRquwuSHQuf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ca25a7f80a1d60a27b_LSCCx.png",
    "decimals": 8
  },
  {
    "slug": "leidos-xstock",
    "name": "Leidos xStock",
    "symbol": "LDOSx",
    "underlyingTicker": "LDOS",
    "mint": "Xs5VFGqt7aQ3Dykyk7A4NFL9K2z3x2BAnEDzvokY9Us",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30fa75e19a321128fe8_LDOSx.png",
    "decimals": 8
  },
  {
    "slug": "lennar-xstock",
    "name": "Lennar xStock",
    "symbol": "LENx",
    "underlyingTicker": "LEN",
    "mint": "XsHjfVcciZyPmujpSYXKGyQZ3k4yyzxnUXE6CYdZ3AD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2db9d738e95105c3a41_LENx.png",
    "decimals": 8
  },
  {
    "slug": "lennox-international-xstock",
    "name": "Lennox International xStock",
    "symbol": "LIIx",
    "underlyingTicker": "LII",
    "mint": "Xs4MEQwg4mtEjAbtBzKsmrDccxX64Y4emF2yJptPJ3q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e9ab2b9761d3a5a147_LIIx.png",
    "decimals": 8
  },
  {
    "slug": "liberty-media-xstock",
    "name": "Liberty Media xStock",
    "symbol": "FWONKx",
    "underlyingTicker": "FWONK",
    "mint": "XsDum7DWP825ChLAhSN5NYBpoCUsHJJdRKTPseA9VxR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d81e352bc5cecdfd6d_FWONKx.png",
    "decimals": 8
  },
  {
    "slug": "lincoln-electric-xstock",
    "name": "Lincoln Electric xStock",
    "symbol": "LECOx",
    "underlyingTicker": "LECO",
    "mint": "Xs7wdJdbcu1oR36AvumDgFLPiHmhpF9GEHQT6h16zAf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e310f6cce9266a5807cd_LECOx.png",
    "decimals": 8
  },
  {
    "slug": "linde-xstock",
    "name": "Linde xStock",
    "symbol": "LINx",
    "underlyingTicker": "LIN",
    "mint": "XsSr8anD1hkvNMu8XQiVcmiaTP7XGvYu7Q58LdmtE8Z",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf2b1132313f4529a3160_Ticker%3DLIN%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "live-nation-entertainment-xstock",
    "name": "Live Nation Entertainment xStock",
    "symbol": "LYVx",
    "underlyingTicker": "LYV",
    "mint": "XsFU9pEZTmFTwGowKZkVtagbF5ivCJ4WTyPEZrzVFzY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27cc3e7fb8af52b305c_LYVx.png",
    "decimals": 8
  },
  {
    "slug": "lockheed-martin-xstock",
    "name": "Lockheed Martin xStock",
    "symbol": "LMTx",
    "underlyingTicker": "LMT",
    "mint": "XssULacY8D3z3a8HoQuLid8wdJHcZLGpSST9MkNFzox",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c07d5d025cdcf86ebc_LMTx.png",
    "decimals": 8
  },
  {
    "slug": "loews-xstock",
    "name": "Loews xStock",
    "symbol": "Lx",
    "underlyingTicker": "L",
    "mint": "XsUn5iqqryPGjArLc1FWnzaquVsCjTPciXQGkRyWfho",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2da1e352bc5cecdfe60_Lx.png",
    "decimals": 8
  },
  {
    "slug": "lowes-companies-xstock",
    "name": "Lowe's Companies xStock",
    "symbol": "LOWx",
    "underlyingTicker": "LOW",
    "mint": "XsixDLxXcKZBcRBddYiPZjB9FJcKMTLd4B7VBeKo3pB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b7a75e19a321119117_LOWx.png",
    "decimals": 8
  },
  {
    "slug": "lpl-financial-xstock",
    "name": "LPL Financial xStock",
    "symbol": "LPLAx",
    "underlyingTicker": "LPLA",
    "mint": "Xsk7doh3Qsz51GJdGFUdXcW4PFSKgfj1KGMy6jjbk6J",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2adf87302708563599d_LPLAx.png",
    "decimals": 8
  },
  {
    "slug": "lumentum-holdings-inc-xstock",
    "name": "Lumentum Holdings Inc. xStock",
    "symbol": "LITEx",
    "underlyingTicker": "LITE",
    "mint": "XsexQ9qqNbDkLE6XwCN9ceVhLo8Lxc7UheVR6eBkKyo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470267ba4d7385d0c4ee5_LITEx.png",
    "decimals": 8
  },
  {
    "slug": "m-t-bank-xstock",
    "name": "M&T Bank xStock",
    "symbol": "MTBx",
    "underlyingTicker": "MTB",
    "mint": "XsMXtu6uQkfvxCYURytUcQvhFCoqvphtoezVBh42CfZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e261a75e19a321120c31_MTBx.png",
    "decimals": 8
  },
  {
    "slug": "macom-technology-solutions-xstock",
    "name": "MACOM Technology Solutions xStock",
    "symbol": "MTSIx",
    "underlyingTicker": "MTSI",
    "mint": "XsGkSoEbLmqH2GCixj1MdGYHDbRaJdgnnDPrYhMuLxA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e298cf0d8d5d6ca39a40_MTSIx.png",
    "decimals": 8
  },
  {
    "slug": "mara-xstock",
    "name": "MARA xStock",
    "symbol": "MARAx",
    "underlyingTicker": "MARA",
    "mint": "XsguBZPkM9BDmxspmWe29EmrYZBv21ENcC27Pqh7grB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7e28162595af68b2fc5e6_Ticker%3DMARAx%2C%20Company%20Name%3DMARA%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "marathon-petroleum-xstock",
    "name": "Marathon Petroleum xStock",
    "symbol": "MPCx",
    "underlyingTicker": "MPC",
    "mint": "XsyqGLaBLmGCZstuUrvo7iWhJkZgg4KEBtcxVFBsYSg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e77992dc1d3a69279f_MPCx.png",
    "decimals": 8
  },
  {
    "slug": "markel-xstock",
    "name": "Markel xStock",
    "symbol": "MKLx",
    "underlyingTicker": "MKL",
    "mint": "XsE44zHnRJVdk5vRpy2YvUPbbg4caoxihL8EKDatiCn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b4cf0d8d5d6ca3a58d_MKLx.png",
    "decimals": 8
  },
  {
    "slug": "marriott-international-xstock",
    "name": "Marriott International xStock",
    "symbol": "MARx",
    "underlyingTicker": "MAR",
    "mint": "Xs85zRMSv4KTRqSNjZSFWgEXEyb3esxUBzhTj377DH8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d5de2cb121e3567bcb_MARx.png",
    "decimals": 8
  },
  {
    "slug": "marsh-xstock",
    "name": "Marsh xStock",
    "symbol": "MRSHx",
    "underlyingTicker": "MRSH",
    "mint": "Xso2JLSTXQjpDXw1r7ZxbC2JCbB6iLGw65kUzQvgTwH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1da741b90f6528fbca1_MRSHx.png",
    "decimals": 8
  },
  {
    "slug": "martin-marietta-materials-xstock",
    "name": "Martin Marietta Materials xStock",
    "symbol": "MLMx",
    "underlyingTicker": "MLM",
    "mint": "Xsvi61uutcLdAsa5NxJ2c9geLgzUFM3tMtpJ44eoegt",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25dcf0d8d5d6ca3731d_MLMx.png",
    "decimals": 8
  },
  {
    "slug": "marvell-xstock",
    "name": "Marvell xStock",
    "symbol": "MRVLx",
    "underlyingTicker": "MRVL",
    "mint": "XsuxRGDzbLjnJ72v74b7p9VY6N66uYgTCyfwwRjVCJA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0eb412d3850c2c01cd29_Ticker%3DMRVL%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "masco-xstock",
    "name": "Masco xStock",
    "symbol": "MASx",
    "underlyingTicker": "MAS",
    "mint": "XsNZFvmZv6zEeAxgF5L72Nt6A2K8Uo6u7aRDLm7Smvc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3049f3406f549c0d590_MASx.png",
    "decimals": 8
  },
  {
    "slug": "mastec-xstock",
    "name": "MasTec xStock",
    "symbol": "MTZx",
    "underlyingTicker": "MTZ",
    "mint": "XsvBVwk5d7eU6prsSxHJPu2adEm5q6wx55mbhov2UnF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b3741b90f652907928_MTZx.png",
    "decimals": 8
  },
  {
    "slug": "mastercard-xstock",
    "name": "Mastercard xStock",
    "symbol": "MAx",
    "underlyingTicker": "MA",
    "mint": "XsApJFV9MAktqnAc6jqzsHVujxkGm9xcSUffaBoYLKC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684ad1ca13c7aaa9ece4cbbf_Ticker%3DMA%2C%20Company%20Name%3DMastercard%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "mccormick-xstock",
    "name": "McCormick xStock",
    "symbol": "MKCx",
    "underlyingTicker": "MKC",
    "mint": "XscRMWo5xvLxenVLxmodRqZC3UJwACXoxAEEGQzrzKd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33d481ad4a14d0ce1c0_MKCx.png",
    "decimals": 8
  },
  {
    "slug": "mcdonalds-xstock",
    "name": "McDonald's xStock",
    "symbol": "MCDx",
    "underlyingTicker": "MCD",
    "mint": "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf77838b45bb94ff32be7_Ticker%3DMCD%2C%20Company%20Name%3DMcDonalds%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "mckesson-xstock",
    "name": "McKesson xStock",
    "symbol": "MCKx",
    "underlyingTicker": "MCK",
    "mint": "XsnoiYFyBemVokJpx3ddt6mPB3v2HepSevRLXSfj3Y5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c7c8a1cd3be66eb78a_MCKx.png",
    "decimals": 8
  },
  {
    "slug": "medline-xstock",
    "name": "Medline xStock",
    "symbol": "MDLNx",
    "underlyingTicker": "MDLN",
    "mint": "XsxaiepK535fVqavwRvJVTC64KaCLTtCgQT5jpR3rJt",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a1df3bfae09d0d34f4fc0b3_Ticker%3DMDLNx%2C%20Company%20Name%3DMedline%2C%20size%3D256x256.png",
    "decimals": 8
  },
  {
    "slug": "medtronic-xstock",
    "name": "Medtronic xStock",
    "symbol": "MDTx",
    "underlyingTicker": "MDT",
    "mint": "XsDgw22qRLTv5Uwuzn6T63cW69exG41T6gwQhEK22u2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bfc99a86580de629510e9_Ticker%3DMDT%2C%20Company%20Name%3DMedtronic%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "meituan-xstock",
    "name": "Meituan xStock",
    "symbol": "MEITx",
    "underlyingTicker": "MEIT",
    "mint": "XsLvCfSnXJjoVaAJENHxKRzCZaWJpyVQQfJgkHp9oXM",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099cc3155aebbcfd9037b_MEITx.png",
    "decimals": 8
  },
  {
    "slug": "merck-xstock",
    "name": "Merck xStock",
    "symbol": "MRKx",
    "underlyingTicker": "MRK",
    "mint": "XsnQnU7AdbRZYe2akqqpibDdXjkieGFfSkbkjX1Sd1X",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be6ff5bd0a5643adf85ec_Ticker%3DMRK%2C%20Company%20Name%3DMerck%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "meta-xstock",
    "name": "Meta xStock",
    "symbol": "METAx",
    "underlyingTicker": "META",
    "mint": "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497dee3db1bae97b91ac05_Ticker%3DMETA%2C%20Company%20Name%3DMeta%20Platforms%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "metlife-xstock",
    "name": "MetLife xStock",
    "symbol": "METx",
    "underlyingTicker": "MET",
    "mint": "XsGhGG2TNXuJLFL5q7pAomKtMVc2YvVqs4G1hyBZLfw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2357e6b3ff5a3aa40a4_METx.png",
    "decimals": 8
  },
  {
    "slug": "mettler-toledo-international-xstock",
    "name": "Mettler-Toledo International xStock",
    "symbol": "MTDx",
    "underlyingTicker": "MTD",
    "mint": "XsXb7oGeK1N5Jk9mm9VD4ZQrXsu9NULWP3C3n7hhDWp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a428410e9537a993cc_MTDx.png",
    "decimals": 8
  },
  {
    "slug": "microchip-technology-xstock",
    "name": "Microchip Technology xStock",
    "symbol": "MCHPx",
    "underlyingTicker": "MCHP",
    "mint": "Xs9GioXYhWaR1Pt7HLiNRgkHynWdPPWcdZWdUCHkZNj",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e228c7e87feb70abcd79_MCHPx.png",
    "decimals": 8
  },
  {
    "slug": "micron-technology-xstock",
    "name": "Micron Technology xStock",
    "symbol": "MUx",
    "underlyingTicker": "MU",
    "mint": "XsQLZycSZ7QnBBdBXQaTbQdiUcbRqjNJgyBGAMzhHav",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9255f8726a885fd35927b_Ticker%3DMUx%2C%20Company%20Name%3DMicron%20Technology%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "microsoft-xstock",
    "name": "Microsoft xStock",
    "symbol": "MSFTx",
    "underlyingTicker": "MSFT",
    "mint": "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68497bdc918924ea97fd8211_Ticker%3DMSFT%2C%20Company%20Name%3DMicrosoft%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "microstrategy-xstock",
    "name": "MicroStrategy xStock",
    "symbol": "MSTRx",
    "underlyingTicker": "MSTR",
    "mint": "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0d47eee3a9c3fa12475a_Ticker%3DMSTR%2C%20Company%20Name%3DMicroStrategy%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "mid-america-apartment-communities-xstock",
    "name": "Mid-America Apartment Communities xStock",
    "symbol": "MAAx",
    "underlyingTicker": "MAA",
    "mint": "XsUGoD9Dik1iNBgsjSzdjt7psrGgWpQ29DQr825e8Le",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f90b02c72b786ccb5f_MAAx.png",
    "decimals": 8
  },
  {
    "slug": "mixue-xstock",
    "name": "Mixue xStock",
    "symbol": "MIXUx",
    "underlyingTicker": "MIXU",
    "mint": "Xs85byjTdWv5Z3YpUqyJjeRaZsxQDz81skYjQKdPDZc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a20a81224cdf3794909_MIXUx.png",
    "decimals": 8
  },
  {
    "slug": "mks-xstock",
    "name": "MKS xStock",
    "symbol": "MKSIx",
    "underlyingTicker": "MKSI",
    "mint": "XsVDmkYEQ3wwLkXKdkRmic3HroSbReejAcnY9eNmrRW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2970b02c72b786c7c1f_MKSIx.png",
    "decimals": 8
  },
  {
    "slug": "mmg-xstock",
    "name": "MMG xStock",
    "symbol": "MMGx",
    "underlyingTicker": "MMG",
    "mint": "XsfLyKBQbxGQu7jQk37Ev55Sb9hxfbiHxX7X3msqHTs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a188d6487a776d7f656_MMGx.png",
    "decimals": 8
  },
  {
    "slug": "moderna-xstock",
    "name": "Moderna xStock",
    "symbol": "MRNAx",
    "underlyingTicker": "MRNA",
    "mint": "XsViHjyRbiSBskjizb1gszGTmZqtAH8TuqwJ7sB5AcP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d9481ad4a14d0c6ad8_MRNAx.png",
    "decimals": 8
  },
  {
    "slug": "mondelez-international-xstock",
    "name": "Mondelez International xStock",
    "symbol": "MDLZx",
    "underlyingTicker": "MDLZ",
    "mint": "Xs3hGRD2NSyUUC1fjK5gKe8hXQgLoqxjR5WtYL1NBbg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1dec8a1cd3be66ec283_MDLZx.png",
    "decimals": 8
  },
  {
    "slug": "mongodb-xstock",
    "name": "MongoDB xStock",
    "symbol": "MDBx",
    "underlyingTicker": "MDB",
    "mint": "Xs12gqhuCeC9gpUdN6uDJQfpyKNf9Y4uK2TKY6c7NrZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27c17bc5767a5d2615c_MDBx.png",
    "decimals": 8
  },
  {
    "slug": "monolithic-power-systems-xstock",
    "name": "Monolithic Power Systems xStock",
    "symbol": "MPWRx",
    "underlyingTicker": "MPWR",
    "mint": "Xs9YEeNWvRwWK4wPHPaitx9mFyfU6hbUY539BLJSHCN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e37e6b3ff5a3a9c224_MPWRx.png",
    "decimals": 8
  },
  {
    "slug": "moodys-xstock",
    "name": "Moody's xStock",
    "symbol": "MCOx",
    "underlyingTicker": "MCO",
    "mint": "XseTVygt2sUPQsfYbYVMXzV1AeMRE6Usj9DEWwStMe3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f86ee5fff84d2e4b11_MCOx.png",
    "decimals": 8
  },
  {
    "slug": "morgan-stanley-xstock",
    "name": "Morgan Stanley xStock",
    "symbol": "MSx",
    "underlyingTicker": "MS",
    "mint": "XsUucbjDLYbER4WNNffn1eQ9cDnAcFVfLgSZeLHPDZS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1991cd17aa2ee8213f3_MSx.png",
    "decimals": 8
  },
  {
    "slug": "motorola-solutions-xstock",
    "name": "Motorola Solutions xStock",
    "symbol": "MSIx",
    "underlyingTicker": "MSI",
    "mint": "Xsa1gZ38panjmJwh6cr9QQ1YpRBEzVfxrykWSsiWvJe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2009e65d1c9320fa691_MSIx.png",
    "decimals": 8
  },
  {
    "slug": "msci-xstock",
    "name": "MSCI xStock",
    "symbol": "MSCIx",
    "underlyingTicker": "MSCI",
    "mint": "Xs4BPW5YU7RsXMmCt6CyDphWH3YLtyaXDXEzZDmj33G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e241b588832a4c885c7e_MSCIx.png",
    "decimals": 8
  },
  {
    "slug": "mtr-xstock",
    "name": "MTR xStock",
    "symbol": "MTRCPx",
    "underlyingTicker": "MTRCP",
    "mint": "Xs1myeXT9eHk3aAX2xa6LZ5AWBJzsDLc5RxT9zYqWAm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099ed2c0c8a37aa0ecf3b_MTRCPx.png",
    "decimals": 8
  },
  {
    "slug": "mueller-industries-xstock",
    "name": "Mueller Industries xStock",
    "symbol": "MLIx",
    "underlyingTicker": "MLI",
    "mint": "XsikuTgNGjzibezDk9u22QGW8zQaGWyK61vN4gQE4Dc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30c6f3f12933f87a48c_MLIx.png",
    "decimals": 8
  },
  {
    "slug": "nasdaq-inc-xstock",
    "name": "Nasdaq Inc. xStock",
    "symbol": "NDAQx",
    "underlyingTicker": "NDAQ",
    "mint": "XsLSwcujLXXgCPZWPZKRsksbZrWupPMNKmg6A71g2Ba",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2472f7186b520620447_NDAQx.png",
    "decimals": 8
  },
  {
    "slug": "nasdaq-xstock",
    "name": "Nasdaq xStock",
    "symbol": "QQQx",
    "underlyingTicker": "QQQ",
    "mint": "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68511cb6e367f19f06664527_QQQx.svg",
    "decimals": 8
  },
  {
    "slug": "natera-xstock",
    "name": "Natera xStock",
    "symbol": "NTRAx",
    "underlyingTicker": "NTRA",
    "mint": "Xsw75QJKjhyvcSFDnqrtXn7amNhCVgeoaoo3rp3sDak",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e276c7e87feb70ac1c96_NTRAx.png",
    "decimals": 8
  },
  {
    "slug": "nebius-xstock",
    "name": "Nebius xStock",
    "symbol": "NBISx",
    "underlyingTicker": "NBIS",
    "mint": "Xsii5eERa2sKFyTHQqdYxpxL5xoUSLVurzHeqBEMBho",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a6908599b43ea065286a59d_NBISx.png",
    "decimals": 8
  },
  {
    "slug": "netapp-xstock",
    "name": "NetApp xStock",
    "symbol": "NTAPx",
    "underlyingTicker": "NTAP",
    "mint": "XsjLc87ewHkMhsxhNRLy4TZFG64ycoZb23hLc2WW7iZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e266b961d41733076332_NTAPx.png",
    "decimals": 8
  },
  {
    "slug": "netflix-xstock",
    "name": "Netflix xStock",
    "symbol": "NFLXx",
    "underlyingTicker": "NFLX",
    "mint": "XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf6c149d917d503f6cda6_Ticker%3DNFLX%2C%20Company%20Name%3DNetflix%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "neurocrine-biosciences-xstock",
    "name": "Neurocrine Biosciences xStock",
    "symbol": "NBIXx",
    "underlyingTicker": "NBIX",
    "mint": "XsCNTvYMAHYPuHc5r9WWhnYfvAZMLLsguv2NBLs8wrx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e307e095f9612ea766e2_NBIXx.png",
    "decimals": 8
  },
  {
    "slug": "new-york-times-xstock",
    "name": "New York Times xStock",
    "symbol": "NYTx",
    "underlyingTicker": "NYT",
    "mint": "Xsfyi9JrpUDKaBZxgAAFS7wWV5xeTUkYoQLs3SUiYdg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e346f87302708563def4_NYTx.png",
    "decimals": 8
  },
  {
    "slug": "newmont-xstock",
    "name": "Newmont xStock",
    "symbol": "NEMx",
    "underlyingTicker": "NEM",
    "mint": "XssuE11NLek5vAeHNS2Jm8PFvT4PE7dtnpZwasWTGDT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1bada3d6aedb433dbe8_NEMx.png",
    "decimals": 8
  },
  {
    "slug": "nextera-energy-xstock",
    "name": "NextEra Energy xStock",
    "symbol": "NEEx",
    "underlyingTicker": "NEE",
    "mint": "Xs4f5EbxL1bB89N7ADF7smF8fXxifJa3t6SexZufBWA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a61cd17aa2ee821ac2_NEEx.png",
    "decimals": 8
  },
  {
    "slug": "nike-xstock",
    "name": "Nike xStock",
    "symbol": "NKEx",
    "underlyingTicker": "NKE",
    "mint": "XsGYpMvKbVt6ViHqRd7cF3s746dAMFBQWcC49hB9VVP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e22af7bf3b5638341557_NKEx.png",
    "decimals": 8
  },
  {
    "slug": "nisource-xstock",
    "name": "NiSource xStock",
    "symbol": "NIx",
    "underlyingTicker": "NI",
    "mint": "XsC3CiuRAFKN99m2ye6q7xrYMx4NuBdr1JR2gVWgFLD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b6741b90f652907b13_NIx.png",
    "decimals": 8
  },
  {
    "slug": "nongfu-spring-xstock",
    "name": "Nongfu Spring xStock",
    "symbol": "NONGx",
    "underlyingTicker": "NONG",
    "mint": "XsZHUEeic6QiGEadqCje2zBoTxNX1B3857CjYkMEfuw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099d36f5fed4ed2d14309_NONGx.png",
    "decimals": 8
  },
  {
    "slug": "nordson-xstock",
    "name": "Nordson xStock",
    "symbol": "NDSNx",
    "underlyingTicker": "NDSN",
    "mint": "Xsgfrh1tHEuCADVTuQDZiG5LRcVYeEU1wKT3YKuucbA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fc7e6b3ff5a3aad48d_NDSNx.png",
    "decimals": 8
  },
  {
    "slug": "norfolk-southern-xstock",
    "name": "Norfolk Southern xStock",
    "symbol": "NSCx",
    "underlyingTicker": "NSC",
    "mint": "Xs4UsCDQKKJqHjidgoZBHUW9emLD4njpLPsYesp4ZpZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1fba75e19a32111cd17_NSCx.png",
    "decimals": 8
  },
  {
    "slug": "northern-trust-xstock",
    "name": "Northern Trust xStock",
    "symbol": "NTRSx",
    "underlyingTicker": "NTRS",
    "mint": "XsRx9hY5BQWniDRahLNtV4uyyvQcnaRgrqw5ops842R",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e267da3d6aedb43487d6_NTRSx.png",
    "decimals": 8
  },
  {
    "slug": "northrop-grumman-xstock",
    "name": "Northrop Grumman xStock",
    "symbol": "NOCx",
    "underlyingTicker": "NOC",
    "mint": "Xs1eyZcwrzzYW3hDjfpm7PiJrC9RyFszsHpqfTeUTCE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1ee9e65d1c9320f8f95_NOCx.png",
    "decimals": 8
  },
  {
    "slug": "novo-nordisk-xstock",
    "name": "Novo Nordisk xStock",
    "symbol": "NVOx",
    "underlyingTicker": "NVO",
    "mint": "XsfAzPzYrYjd4Dpa9BU3cusBsvWfVB9gBcyGC87S57n",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf139788d618501b65727_Ticker%3DNOVO_B%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "nrg-energy-xstock",
    "name": "NRG Energy xStock",
    "symbol": "NRGx",
    "underlyingTicker": "NRG",
    "mint": "XsZ9qtReiaokaUfW3bEUx2AU4Zmcjk9Y95nEtFMqEXn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2884f11a0bdd7097f27_NRGx.png",
    "decimals": 8
  },
  {
    "slug": "nucor-xstock",
    "name": "Nucor xStock",
    "symbol": "NUEx",
    "underlyingTicker": "NUE",
    "mint": "XsvdeDvbEfZkvfEUixS9SydEfJopFFD6NJjXZN1haYr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e215ab2b9761d3a5166e_NUEx.png",
    "decimals": 8
  },
  {
    "slug": "nuscale-power-corporation-xstock",
    "name": "NuScale Power Corporation xStock",
    "symbol": "SMRx",
    "underlyingTicker": "SMR",
    "mint": "XsrwdnwLHjVnyy7fgE2Pdwjp3czEm73jPjkSC5xzUBw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470268eb950e7e25dbd58_SMRx.png",
    "decimals": 8
  },
  {
    "slug": "nutanix-xstock",
    "name": "Nutanix xStock",
    "symbol": "NTNXx",
    "underlyingTicker": "NTNX",
    "mint": "XsLsExw7d7cjbN65GwQzS7HaDxCtyE3rjywcNXqEtxL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3306ee5fff84d2f1180_NTNXx.png",
    "decimals": 8
  },
  {
    "slug": "nvidia-xstock",
    "name": "NVIDIA xStock",
    "symbol": "NVDAx",
    "underlyingTicker": "NVDA",
    "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684961bfb45e3c4d777b9997_Ticker%3DNVDA%2C%20Company%20Name%3DNVIDIA%20Corp%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "oreilly-automotive-xstock",
    "name": "O'Reilly Automotive xStock",
    "symbol": "ORLYx",
    "underlyingTicker": "ORLY",
    "mint": "XsZCRtj2wRfksr19c4Bf4L2WBB5EYPmr1nBQS1yXApD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e5e6a2081336f870d5_ORLYx.png",
    "decimals": 8
  },
  {
    "slug": "occidental-petroleum-xstock",
    "name": "Occidental Petroleum xStock",
    "symbol": "OXYx",
    "underlyingTicker": "OXY",
    "mint": "XsRNiTxDeRvxTEMTV5BC98N7cTZXxjNdLnudR8YeB2b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e251f873027085631457_OXYx.png",
    "decimals": 8
  },
  {
    "slug": "oklo-xstock",
    "name": "Oklo xStock",
    "symbol": "OKLOx",
    "underlyingTicker": "OKLO",
    "mint": "XsJb1p4Ks6VFggq68JyMz7S3kdRfkqh4wA6EMyxi4DD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7e0776e3e580d44037709_Ticker%3DOKLOx%2C%20Company%20Name%3DOklo%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "okta-xstock",
    "name": "Okta xStock",
    "symbol": "OKTAx",
    "underlyingTicker": "OKTA",
    "mint": "XsHXJXdfTGnrfygPVvnzb7xdsUiunEQZew7teAyvosL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d1268c11bbce99b97a_OKTAx.png",
    "decimals": 8
  },
  {
    "slug": "old-dominion-freight-line-xstock",
    "name": "Old Dominion Freight Line xStock",
    "symbol": "ODFLx",
    "underlyingTicker": "ODFL",
    "mint": "XsuEQKUzuiMTMwFTm6MHBeTvknFU585gwu9u4CNKjQD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23f95063765fcf2eb8f_ODFLx.png",
    "decimals": 8
  },
  {
    "slug": "omega-healthcare-investors-xstock",
    "name": "Omega Healthcare Investors xStock",
    "symbol": "OHIx",
    "underlyingTicker": "OHI",
    "mint": "XsAeqdosiRKYKtYRLoao2TQDB16yLRP82MCwd7ibVuH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3254f11a0bdd70a1c1e_OHIx.png",
    "decimals": 8
  },
  {
    "slug": "omnicom-xstock",
    "name": "Omnicom xStock",
    "symbol": "OMCx",
    "underlyingTicker": "OMC",
    "mint": "XscmXyJYjYbGNhxQsPjjRYsEwscg6uPFJzR6Af7Qi18",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2abe095f9612ea72e8f_OMCx.png",
    "decimals": 8
  },
  {
    "slug": "on-semiconductor-xstock",
    "name": "ON Semiconductor xStock",
    "symbol": "ONx",
    "underlyingTicker": "ON",
    "mint": "XsTzZxvfNdVESw8oEn7cNPnfQ4SGk7ncBSezfU6dxa7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2301a4837ed32e95892_ONx.png",
    "decimals": 8
  },
  {
    "slug": "ondas-xstock",
    "name": "Ondas xStock",
    "symbol": "ONDSx",
    "underlyingTicker": "ONDS",
    "mint": "Xsgc9YTqdAH1GzDLBGQcScCMgkKsVBn4hBmqtNRospY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b212c9a1bc201ec5bf6af_ONDSx.png",
    "decimals": 8
  },
  {
    "slug": "oneok-xstock",
    "name": "ONEOK xStock",
    "symbol": "OKEx",
    "underlyingTicker": "OKE",
    "mint": "XspDMNC416uCcUbngqyAwzk1phuRYdmm6AMsWo3EHd4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2257e6b3ff5a3aa2ffb_OKEx.png",
    "decimals": 8
  },
  {
    "slug": "onto-innovation-xstock",
    "name": "Onto Innovation xStock",
    "symbol": "ONTOx",
    "underlyingTicker": "ONTO",
    "mint": "Xsu33VJj7s2tMUZfAQ8bbGgpDEnfXdCsKHSC4p6C5tS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f6c7e87feb70acd325_ONTOx.png",
    "decimals": 8
  },
  {
    "slug": "open-xstock",
    "name": "OPEN xStock",
    "symbol": "OPENx",
    "underlyingTicker": "OPEN",
    "mint": "XsGtpmjhmC8kyjVSWL4VicGu36ceq9u55PTgF8bhGv6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/688cb3ec1f3801d9bc17729e_Ticker%3DOPENx%2C%20Company%20Name%3DOpendoor%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "oracle-xstock",
    "name": "Oracle xStock",
    "symbol": "ORCLx",
    "underlyingTicker": "ORCL",
    "mint": "XsjFwUPiLofddX5cWFHW35GCbXcSu1BCUGfxoQAQjeL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a85e84900f3308e8e3232a2_ORCLx.svg",
    "decimals": 8
  },
  {
    "slug": "otis-worldwide-xstock",
    "name": "Otis Worldwide xStock",
    "symbol": "OTISx",
    "underlyingTicker": "OTIS",
    "mint": "XszGT2Jo6bZz2SZBmhPstvo2xSs37q67nUJS7gtAfvx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e278c3e7fb8af52b2c56_OTISx.png",
    "decimals": 8
  },
  {
    "slug": "ovintiv-xstock",
    "name": "Ovintiv xStock",
    "symbol": "OVVx",
    "underlyingTicker": "OVV",
    "mint": "Xs1b4xMzH16fHZuFUoXxni8THVafJ9t5dFL6kPUyG4k",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fe25a7f80a1d60cd20_OVVx.png",
    "decimals": 8
  },
  {
    "slug": "paccar-xstock",
    "name": "PACCAR xStock",
    "symbol": "PCARx",
    "underlyingTicker": "PCAR",
    "mint": "Xs1rnpzumX77Zz3nVrRGbDYzTM4PM7vgvS4BLTG6ckQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e20ec6acaee76a664136_PCARx.png",
    "decimals": 8
  },
  {
    "slug": "packaging-corp-of-america-xstock",
    "name": "Packaging Corp of America xStock",
    "symbol": "PKGx",
    "underlyingTicker": "PKG",
    "mint": "Xstq2wirnUgqHdMvvWafGVbdtg9y845zxAy7iVixkRU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2ccb588832a4c88e2f2_PKGx.png",
    "decimals": 8
  },
  {
    "slug": "palantir-xstock",
    "name": "Palantir xStock",
    "symbol": "PLTRx",
    "underlyingTicker": "PLTR",
    "mint": "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0c4c0e5466272c52958b_Ticker%3DPLTR%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "palo-alto-networks-xstock",
    "name": "Palo Alto Networks xStock",
    "symbol": "PANWx",
    "underlyingTicker": "PANW",
    "mint": "XsQ6NfzzLH8nspjrB9X8R2K64Zz7Tnxqu12juDiMPMW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da399945c6f790cef50e0d_Ticker%3DPANWx%2C%20Company%20Name%3DPalo%20Alto%20Networks%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "parker-hannifin-xstock",
    "name": "Parker Hannifin xStock",
    "symbol": "PHx",
    "underlyingTicker": "PH",
    "mint": "XskVc7XiWmSqvzbjhA2LqGHQhvBdBNfatfeTpNru6KP",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1bc95063765fcf28209_PHx.png",
    "decimals": 8
  },
  {
    "slug": "paychex-xstock",
    "name": "Paychex xStock",
    "symbol": "PAYXx",
    "underlyingTicker": "PAYX",
    "mint": "Xsuo3Vd8T7MVAx3miKJ1beX4sGutzdL3GJsjk1yFbxA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2654f11a0bdd7095fbd_PAYXx.png",
    "decimals": 8
  },
  {
    "slug": "paypal-xstock",
    "name": "PayPal xStock",
    "symbol": "PYPLx",
    "underlyingTicker": "PYPL",
    "mint": "XshWQWYVp5ff8CrAEsGmLVKD47nBWi3Ygn5v8wXK27G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da33df9bf32c1d3b2fad2d_Ticker%3DPYPLx%2C%20Company%20Name%3DPYPLx%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "penumbra-xstock",
    "name": "Penumbra xStock",
    "symbol": "PENx",
    "underlyingTicker": "PEN",
    "mint": "Xsbd5DQzyAjsjzZiLP3NYztwkapYQpPLBvYsnzyHscq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e342e6a2081336f9ad3a_PENx.png",
    "decimals": 8
  },
  {
    "slug": "pepsico-xstock",
    "name": "PepsiCo xStock",
    "symbol": "PEPx",
    "underlyingTicker": "PEP",
    "mint": "Xsv99frTRUeornyvCfvhnDesQDWuvns1M852Pez91vF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be8662b90a208c5d5b8e5_Ticker%3DPEP%2C%20Company%20Name%3DPepsico%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "performance-food-xstock",
    "name": "Performance Food xStock",
    "symbol": "PFGCx",
    "underlyingTicker": "PFGC",
    "mint": "XsTnXvRqrDisLoYpLDUowPx2HLhd6p44ZAbEKyGsL3g",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f9a75e19a3211282b9_PFGCx.png",
    "decimals": 8
  },
  {
    "slug": "permian-resources-xstock",
    "name": "Permian Resources xStock",
    "symbol": "PRx",
    "underlyingTicker": "PR",
    "mint": "XsXh1W6QRHJBYdzVrngAxn4t4JQnJBYk7iM2S1hwqdT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32cc6acaee76a670bc2_PRx.png",
    "decimals": 8
  },
  {
    "slug": "pfizer-xstock",
    "name": "Pfizer xStock",
    "symbol": "PFEx",
    "underlyingTicker": "PFE",
    "mint": "XsAtbqkAP1HJxy7hFDeq7ok6yM43DQ9mQ1Rh861X8rw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be5e3c54ff3f5c6c9b36f_Ticker%3DPFE%2C%20Company%20Name%3Dpfizer%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "pg-e-xstock",
    "name": "PG&E xStock",
    "symbol": "PCGx",
    "underlyingTicker": "PCG",
    "mint": "XsPq3VY73br4wpgi2a4b3jAdvuhstpknXVJ2fA4vNmk",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25a9e65d1c9320fedfd_PCGx.png",
    "decimals": 8
  },
  {
    "slug": "philip-morris-xstock",
    "name": "Philip Morris xStock",
    "symbol": "PMx",
    "underlyingTicker": "PM",
    "mint": "Xsba6tUnSjDae2VcopDB6FGGDaxRrewFCDa5hKn5vT3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0981cbec78a581a6bfe7_Ticker%3DPM%2C%20Company%20Name%3Dphilip%20morris%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "phillips-66-xstock",
    "name": "Phillips 66 xStock",
    "symbol": "PSXx",
    "underlyingTicker": "PSX",
    "mint": "XsYvZVxiNdjuHQQzdCmf4TMSTBgvarV2gLi2akooV8V",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f93bed1b88de0c2849_PSXx.png",
    "decimals": 8
  },
  {
    "slug": "picc-property-and-casualty-xstock",
    "name": "PICC Property and Casualty xStock",
    "symbol": "PICCx",
    "underlyingTicker": "PICC",
    "mint": "XsFRjWSNaDPz9nVYUsSky5dJKjN6W5JupHCHbNwg4mE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099d6201fd8d20c4cc794_PICCx.png",
    "decimals": 8
  },
  {
    "slug": "ping-an-insurance-group-co-of-china-xstock",
    "name": "Ping An Insurance Group Co. of China xStock",
    "symbol": "PICOx",
    "underlyingTicker": "PICO",
    "mint": "XsioL5whfekeqi92geGL9hqkDWJ2XuDbXDcmBkJktro",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099b5de2d7051659a43b3_PICOx.png",
    "decimals": 8
  },
  {
    "slug": "pinnacle-financial-partners-xstock",
    "name": "Pinnacle Financial Partners xStock",
    "symbol": "PNFPx",
    "underlyingTicker": "PNFP",
    "mint": "Xs9pFT45PF5PH1hgwQ5fknXYWVZassVSq4spNswnVtR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31d95063765fcf3a54e_PNFPx.png",
    "decimals": 8
  },
  {
    "slug": "pinnacle-west-capital-xstock",
    "name": "Pinnacle West Capital xStock",
    "symbol": "PNWx",
    "underlyingTicker": "PNW",
    "mint": "XsaZESJuX1EC73t54PmbirdQ5JHPHQsPnMB54bgZLp4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3364f2d04f1d9a82c16_PNWx.png",
    "decimals": 8
  },
  {
    "slug": "pinterest-xstock",
    "name": "Pinterest xStock",
    "symbol": "PINSx",
    "underlyingTicker": "PINS",
    "mint": "XswgfhwvyLQ6ZdNsrwBGkBVpqXzQPpDykCDBmiti1o5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e331b588832a4c89392c_PINSx.png",
    "decimals": 8
  },
  {
    "slug": "planet-labs-xstock",
    "name": "Planet Labs xStock",
    "symbol": "PLx",
    "underlyingTicker": "PL",
    "mint": "XsMJtFbb8BwzQtck3oRXyAfs7SAPRuTXnSEDNd7BAVz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da3d32e02d03041f0a8e7d_Ticker%3DPLx%2C%20Company%20Name%3DPlanet%20Labs%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "pnc-financial-services-xstock",
    "name": "PNC Financial Services xStock",
    "symbol": "PNCx",
    "underlyingTicker": "PNC",
    "mint": "Xss1A59GFZcvyuTXLXMyYdJ7e9kpHq6AFKNjcVZ1rjA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d228410e9537a8e05e_PNCx.png",
    "decimals": 8
  },
  {
    "slug": "pop-mart-international-xstock",
    "name": "Pop Mart International xStock",
    "symbol": "POPMTx",
    "underlyingTicker": "POPMT",
    "mint": "XsyQU594M51pbhveG89CPanCJHPJt1tjLJroKMeHrmm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099e8daeac47666c60c39_POPMTx.png",
    "decimals": 8
  },
  {
    "slug": "postal-savings-bank-of-china-xstock",
    "name": "Postal Savings Bank Of China xStock",
    "symbol": "PSBOCx",
    "underlyingTicker": "PSBOC",
    "mint": "XsZDpnjZWLY4yN5FMgTg2GZSdH7ZpWuHPYsooTKXH6u",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099bb03ec3d86e37afaf3_PSBOCx.png",
    "decimals": 8
  },
  {
    "slug": "power-assets-xstock",
    "name": "Power Assets xStock",
    "symbol": "PWAHLx",
    "underlyingTicker": "PWAHL",
    "mint": "XsQqMhANWwSjKHAV2rEN1yGaBRxSBRbFGxwzmfjJcBh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a045d95fd32a2be508c_PWAHLx.png",
    "decimals": 8
  },
  {
    "slug": "ppg-industries-xstock",
    "name": "PPG Industries xStock",
    "symbol": "PPGx",
    "underlyingTicker": "PPG",
    "mint": "XsoCb51izF2MpU5XghroQDRxtJ2vtcMY9v5Mk1pqaBr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2811781f40f2ddcdf5d_PPGx.png",
    "decimals": 8
  },
  {
    "slug": "ppl-xstock",
    "name": "PPL xStock",
    "symbol": "PPLx",
    "underlyingTicker": "PPL",
    "mint": "Xs12SMK4MA7sLVS8eTged2pXns736u3qe2a1a9io6he",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28bd09b3213b2daf093_PPLx.png",
    "decimals": 8
  },
  {
    "slug": "prada-xstock",
    "name": "Prada xStock",
    "symbol": "PRADx",
    "underlyingTicker": "PRAD",
    "mint": "Xsb9LAiNr8LAGa8G9Uo1UxoWKs43adKvhXTdTtFt7mo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a0f5ada5f1c87723875_PRADx.png",
    "decimals": 8
  },
  {
    "slug": "principal-financial-xstock",
    "name": "Principal Financial xStock",
    "symbol": "PFGx",
    "underlyingTicker": "PFG",
    "mint": "XsChiU9gDeWj7HYrqioNUn8C81jaHZwegfGQdQXHnhd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a64e56d67ba7ec3a07_PFGx.png",
    "decimals": 8
  },
  {
    "slug": "procter-gamble-xstock",
    "name": "Procter & Gamble xStock",
    "symbol": "PGx",
    "underlyingTicker": "PG",
    "mint": "XsYdjDjNUygZ7yGKfQaB6TxLh2gC6RRjzLtLAGJrhzV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684be3c6fa6a62fb260a51e3_Ticker%3DPG%2C%20Company%20Name%3DProctor%20%26%20Gamble%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "progressive-xstock",
    "name": "Progressive xStock",
    "symbol": "PGRx",
    "underlyingTicker": "PGR",
    "mint": "XsGDHfnSNxofQ2qXzcty9r4HB5HFszUCrQhjN7mbEcw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b97992dc1d3a68faba_PGRx.png",
    "decimals": 8
  },
  {
    "slug": "prologis-xstock",
    "name": "Prologis xStock",
    "symbol": "PLDx",
    "underlyingTicker": "PLD",
    "mint": "XsnXCL5FtHLHH1jW5Nknd5BjuazxnnkCAGR6fWPwPJL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b53dedcedc87d88dd8_PLDx.png",
    "decimals": 8
  },
  {
    "slug": "prudential-financial-xstock",
    "name": "Prudential Financial xStock",
    "symbol": "PRUx",
    "underlyingTicker": "PRU",
    "mint": "XsPhDoJMMgARN4eB8apaPNFUjVBKqx3WtRS4ddBwKVw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e252da3d6aedb434620e_PRUx.png",
    "decimals": 8
  },
  {
    "slug": "ptc-xstock",
    "name": "PTC xStock",
    "symbol": "PTCx",
    "underlyingTicker": "PTC",
    "mint": "Xs25CGQuYuoXrMMWUSxo9WmvnQZyFzBChaHbUPXzm6b",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3219f3406f549c0f1a6_PTCx.png",
    "decimals": 8
  },
  {
    "slug": "public-service-enterprise-xstock",
    "name": "Public Service Enterprise xStock",
    "symbol": "PEGx",
    "underlyingTicker": "PEG",
    "mint": "XsUytoK53kCKfXC61Dn3ZM8sjyVBUpScF111pfMG69U",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24b1e352bc5cecd7138_PEGx.png",
    "decimals": 8
  },
  {
    "slug": "public-storage-xstock",
    "name": "Public Storage xStock",
    "symbol": "PSAx",
    "underlyingTicker": "PSA",
    "mint": "XsBLm8wotoJMHjonHcr1btz9RwLa3EWjhtbs3DbQphg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e230f7bf3b5638341865_PSAx.png",
    "decimals": 8
  },
  {
    "slug": "qnity-electronics-xstock",
    "name": "Qnity Electronics xStock",
    "symbol": "Qx",
    "underlyingTicker": "Q",
    "mint": "XsqUtYxpP7o3b2yupu7WZ2bi9u68W7VHQTFNR36mz96",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e264be2927c9329fe2f4_Qx.png",
    "decimals": 8
  },
  {
    "slug": "qualcomm-xstock",
    "name": "Qualcomm xStock",
    "symbol": "QCOMx",
    "underlyingTicker": "QCOM",
    "mint": "XsUUG8bjFN2KvzLTpzavvEKdAjMAeLTZiTeAQJ9uhvB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e19d4f11a0bdd708ceca_QCOMx.png",
    "decimals": 8
  },
  {
    "slug": "quanta-services-inc-xstock",
    "name": "Quanta Services, Inc. xStock",
    "symbol": "PWRx",
    "underlyingTicker": "PWR",
    "mint": "XsLR2VCGNzYVLfJGEwwNZsRYDZBGyBnoQH5rPGvwodA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47025e733d5fae8b8d887_PWRx.png",
    "decimals": 8
  },
  {
    "slug": "quest-diagnostics-xstock",
    "name": "Quest Diagnostics xStock",
    "symbol": "DGXx",
    "underlyingTicker": "DGX",
    "mint": "XsFyCPFNa7os3PvzuYQJcpws9WQS6bci2W8zqesHwPN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b512ec47a2210c15a8_DGXx.png",
    "decimals": 8
  },
  {
    "slug": "ralph-lauren-xstock",
    "name": "Ralph Lauren xStock",
    "symbol": "RLx",
    "underlyingTicker": "RL",
    "mint": "XstJ1deKwoZVAzj1oF14s7g8ZPLumJKyiQXysym5duM",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fe953f0b6f81d49394_RLx.png",
    "decimals": 8
  },
  {
    "slug": "raymond-james-financial-xstock",
    "name": "Raymond James Financial xStock",
    "symbol": "RJFx",
    "underlyingTicker": "RJF",
    "mint": "XsgQwodongKCYRux621fuQzxQRv3fyXQKyPzc2CJ7Ys",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e280be2927c9329ff51d_RJFx.png",
    "decimals": 8
  },
  {
    "slug": "rb-global-xstock",
    "name": "RB Global xStock",
    "symbol": "RBAx",
    "underlyingTicker": "RBA",
    "mint": "XsTCwtofQgx1SLYkouHvVg22beYhn1dmj1vtC3TUp6M",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34c1cd17aa2ee83989f_RBAx.png",
    "decimals": 8
  },
  {
    "slug": "realty-income-xstock",
    "name": "Realty Income xStock",
    "symbol": "Ox",
    "underlyingTicker": "O",
    "mint": "XsyMphR2LaL2YBiorsZYFhdN96xKTSi64L3pmiAHLc3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21f28410e9537a9339b_Ox.png",
    "decimals": 8
  },
  {
    "slug": "red-cat-xstock",
    "name": "Red Cat xStock",
    "symbol": "RCATx",
    "underlyingTicker": "RCAT",
    "mint": "Xs6yCfUGbkjcvivWr4crLR7pJGxEXspsuuUMhxNEEUw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b212d52b2438fa9d49b52_RCATx.png",
    "decimals": 8
  },
  {
    "slug": "reddit-xstock",
    "name": "Reddit xStock",
    "symbol": "RDDTx",
    "underlyingTicker": "RDDT",
    "mint": "XsXEEJX7WoXfre8ZqYx1M1yXnEwd1Ww3YhvfESA2DzE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b07d5d025cdcf95cf5_RDDTx.png",
    "decimals": 8
  },
  {
    "slug": "regal-rexnord-xstock",
    "name": "Regal Rexnord xStock",
    "symbol": "RRXx",
    "underlyingTicker": "RRX",
    "mint": "XszxuQCqE72vU4ABTFDFwhs28AeSUHqzbWWVWDkhfYZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e310268c11bbce99e442_RRXx.png",
    "decimals": 8
  },
  {
    "slug": "regency-centers-xstock",
    "name": "Regency Centers xStock",
    "symbol": "REGx",
    "underlyingTicker": "REG",
    "mint": "XsJzAzVt6H498zDafSaWj3htVDYQPmh23jUAM2Rt2qn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31336507d0c6e9ae6ee_REGx.png",
    "decimals": 8
  },
  {
    "slug": "regeneron-pharmaceuticals-xstock",
    "name": "Regeneron Pharmaceuticals xStock",
    "symbol": "REGNx",
    "underlyingTicker": "REGN",
    "mint": "XsWkTtvUXJgrvxvgGuHRRqk6iwDuviEQZw4uJFUUGgX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e20dc3e7fb8af52adb43_REGNx.png",
    "decimals": 8
  },
  {
    "slug": "regions-financial-xstock",
    "name": "Regions Financial xStock",
    "symbol": "RFx",
    "underlyingTicker": "RF",
    "mint": "Xsk2PGWHCQweEwYWNqA72KbuUdNz518MBzHSaBDLowq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e29d17bc5767a5d275d0_RFx.png",
    "decimals": 8
  },
  {
    "slug": "reinsurance-group-of-america-xstock",
    "name": "Reinsurance Group of America xStock",
    "symbol": "RGAx",
    "underlyingTicker": "RGA",
    "mint": "XsFvsyP8i3Qpat1BK78Yjq3PsTNhD3SV5FHryJrWbHs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e320c7e87feb70acec3e_RGAx.png",
    "decimals": 8
  },
  {
    "slug": "reliance-xstock",
    "name": "Reliance xStock",
    "symbol": "RSx",
    "underlyingTicker": "RS",
    "mint": "XskVwPpXzyc9Fc4vqvHJ5v4ojMDWyjzcdPYTK8vFrUy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bf4f2d04f1d9a79f3d_RSx.png",
    "decimals": 8
  },
  {
    "slug": "renaissancere-xstock",
    "name": "RenaissanceRe xStock",
    "symbol": "RNRx",
    "underlyingTicker": "RNR",
    "mint": "Xs5m7mD1sRUu3ryXiYNDqCTd67hQVZRSro2zxxWqTtn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e350268c11bbce9a29ee_RNRx.png",
    "decimals": 8
  },
  {
    "slug": "republic-services-xstock",
    "name": "Republic Services xStock",
    "symbol": "RSGx",
    "underlyingTicker": "RSG",
    "mint": "XsUkTUDE9hCG9GLEpw3STiGuf58hYmpymiF3z1nPh3A",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e244a19a50c2f196da92_RSGx.png",
    "decimals": 8
  },
  {
    "slug": "resmed-xstock",
    "name": "ResMed xStock",
    "symbol": "RMDx",
    "underlyingTicker": "RMD",
    "mint": "XsjsQvjH8BEXCjrgNiVhmhFiYPcNRXGj262fDupfV1A",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e27a2f7186b5206225ed_RMDx.png",
    "decimals": 8
  },
  {
    "slug": "restaurant-brands-international-xstock",
    "name": "Restaurant Brands International xStock",
    "symbol": "QSRx",
    "underlyingTicker": "QSR",
    "mint": "XsG3eLvLbHwYQP3r7tSznE6bEvcA2Ko1TpYwbyD6RQk",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34a1a4837ed32ea2fe9_QSRx.png",
    "decimals": 8
  },
  {
    "slug": "revolution-medicines-xstock",
    "name": "Revolution Medicines xStock",
    "symbol": "RVMDx",
    "underlyingTicker": "RVMD",
    "mint": "XsCRJ3YusYCZ8ihZbmdao46y3ddSibxPK29UsitD9J9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2754a6aeb33d13a15d8_RVMDx.png",
    "decimals": 8
  },
  {
    "slug": "riot-platforms-xstock",
    "name": "Riot Platforms xStock",
    "symbol": "RIOTx",
    "underlyingTicker": "RIOT",
    "mint": "Xs31mE5EiqjSHEaiX9QDKCN6NvSGCqpJ6f1FNq2wri5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7e5343928fcaa3aca7dd3_Ticker%3DRIOTx%2C%20Company%20Name%3DRiot%20Platforms%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "rivian-automotive-xstock",
    "name": "Rivian Automotive xStock",
    "symbol": "RIVNx",
    "underlyingTicker": "RIVN",
    "mint": "XsoxDMY8s3ZV7zD4Yd87wAvURyxA8VXkd7w6HNuQkzj",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32e6ee5fff84d2f1028_RIVNx.png",
    "decimals": 8
  },
  {
    "slug": "robinhood-xstock",
    "name": "Robinhood xStock",
    "symbol": "HOODx",
    "underlyingTicker": "HOOD",
    "mint": "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684c0f39cede10b9afa4852f_Ticker%3DHOOD%2C%20Company%20Name%3DRobinhood%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "roblox-xstock",
    "name": "Roblox xStock",
    "symbol": "RBLXx",
    "underlyingTicker": "RBLX",
    "mint": "Xss5RAku5EH6UViFdvW7ss9xQjwQLsrs2opPMhb3k43",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d924e2dd85bbba96dca6b1_Ticker%3DRBLXx%2C%20Company%20Name%3DRoblox%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "robostrategy-xstock",
    "name": "RoboStrategy xStock",
    "symbol": "BOTx",
    "underlyingTicker": "BOT",
    "mint": "Xsi8P9r7ZWDBBnBj9JTfnKWqyKNV19X2CQPWQsGdjnS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a3ecc2e2be03875b9084d78_BOTx.png",
    "decimals": 8
  },
  {
    "slug": "rocket-lab-xstock",
    "name": "Rocket Lab xStock",
    "symbol": "RKLBx",
    "underlyingTicker": "RKLB",
    "mint": "XsKSh3QDynp6oms9yHjZXbZo3pKzUBoqUFKPHS2g9Bh",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da3d8cf15a3157280f41d5_Ticker%3DRKLBx%2C%20Company%20Name%3DRocket%20Lab%20X%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "rockwell-automation-xstock",
    "name": "Rockwell Automation xStock",
    "symbol": "ROKx",
    "underlyingTicker": "ROK",
    "mint": "XsnR8Rtrd8yFDGP3g2HwLdGiw58UcXjggXzgkL3pNYz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e22bbe2927c9329f9991_ROKx.png",
    "decimals": 8
  },
  {
    "slug": "roivant-sciences-xstock",
    "name": "Roivant Sciences xStock",
    "symbol": "ROIVx",
    "underlyingTicker": "ROIV",
    "mint": "XsR5eHL5sXTwUckUcenkZyBdAkShFBcNDiYeecBMaCu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e351c7e87feb70ad0dfe_ROIVx.png",
    "decimals": 8
  },
  {
    "slug": "roku-xstock",
    "name": "Roku xStock",
    "symbol": "ROKUx",
    "underlyingTicker": "ROKU",
    "mint": "Xss4k5HDz8CwyNnbZixMs3XgaXvnMoWtpxeqzFK6wvA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2df4f2d04f1d9a7b4bf_ROKUx.png",
    "decimals": 8
  },
  {
    "slug": "rollins-xstock",
    "name": "Rollins xStock",
    "symbol": "ROLx",
    "underlyingTicker": "ROL",
    "mint": "XsY112rrZJhJE1J1Z8BTSk135spPGHuGRCfnvr5pSdQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31c17bc5767a5d2df61_ROLx.png",
    "decimals": 8
  },
  {
    "slug": "roper-technologies-xstock",
    "name": "Roper Technologies xStock",
    "symbol": "ROPx",
    "underlyingTicker": "ROP",
    "mint": "XsCbNmXqgaDVDTpXaATSrki9ATKwu1wzfhcYwPriMns",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25c9e65d1c9320ff006_ROPx.png",
    "decimals": 8
  },
  {
    "slug": "ross-stores-xstock",
    "name": "Ross Stores xStock",
    "symbol": "ROSTx",
    "underlyingTicker": "ROST",
    "mint": "XsPYJyoTnjc471VCHEERVBVrJ7xuQhDYWddPw6koNVV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e624dc85407f79d2f4_ROSTx.png",
    "decimals": 8
  },
  {
    "slug": "royal-gold-xstock",
    "name": "Royal Gold xStock",
    "symbol": "RGLDx",
    "underlyingTicker": "RGLD",
    "mint": "XsgiYbKzzyYzuxRj1R4E6rvfVccASCGepmWEMpJdFG2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2deda3d6aedb434da24_RGLDx.png",
    "decimals": 8
  },
  {
    "slug": "rpm-international-xstock",
    "name": "RPM International xStock",
    "symbol": "RPMx",
    "underlyingTicker": "RPM",
    "mint": "XsBGGtLnNqa87iTENkgtBV4itt6LNxz7osKS1nmnqTD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e323b588832a4c892e92_RPMx.png",
    "decimals": 8
  },
  {
    "slug": "rtx-xstock",
    "name": "RTX xStock",
    "symbol": "RTXx",
    "underlyingTicker": "RTX",
    "mint": "XsN53tgjZA4QU8iuedPNHxxCbDqKcJqbrT1f8jBXzdC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e19a536f62aa99a8a265_RTXx.png",
    "decimals": 8
  },
  {
    "slug": "russell-2000-xstock",
    "name": "Russell 2000 xStock",
    "symbol": "IWMx",
    "underlyingTicker": "IWM",
    "mint": "XsbELVbLGBkn7xfMfyYuUipKGt1iRUc2B7pYRvFTFu3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d9291a3395504fbc89d605_Ticker%3DIWMx%2C%20Company%20Name%3DRussell%202000%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "s-p-small-cap-xstock",
    "name": "S&P Small Cap xStock",
    "symbol": "IJRx",
    "underlyingTicker": "IJR",
    "mint": "XsyZcb97BzETAqi9BoP2C9D196MiMNBisGMVNje2Thz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d92991e134e5e066e696f5_Ticker%3DIJRx%2C%20Company%20Name%3DS%26P%20Small%20Cap%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "saia-xstock",
    "name": "Saia xStock",
    "symbol": "SAIAx",
    "underlyingTicker": "SAIA",
    "mint": "XsdzBn1wxCibSdDZgaaWqGtdvo2JSFueo2CwHnA69Lf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3322fd4a49f2e67eae5_SAIAx.png",
    "decimals": 8
  },
  {
    "slug": "salesforce-xstock",
    "name": "Salesforce xStock",
    "symbol": "CRMx",
    "underlyingTicker": "CRM",
    "mint": "XsczbcQ3zfcgAEt9qHQES8pxKAVG5rujPSHQEXi4kaN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf3670e24ef4c92a6a7fc_Ticker%3DCRM%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "sandisk-corporation-xstock",
    "name": "Sandisk Corporation xStock",
    "symbol": "SNDKx",
    "underlyingTicker": "SNDK",
    "mint": "Xswbpc8UqU6e1j9QZEWCjBMjyvz4twqD7PCy6j2e7jj",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c4702538cc5a9b19dd2ba2_SNDKx.png",
    "decimals": 8
  },
  {
    "slug": "sands-china-xstock",
    "name": "Sands China xStock",
    "symbol": "SNDSCx",
    "underlyingTicker": "SNDSC",
    "mint": "XsFRth3iT4KjYSzVvWpdeFhFjzdguCFiv3zMWJEodsF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a0bd42c44172ba05c56_SNDSCx.png",
    "decimals": 8
  },
  {
    "slug": "sba-communications-xstock",
    "name": "SBA Communications xStock",
    "symbol": "SBACx",
    "underlyingTicker": "SBAC",
    "mint": "Xs3BuKwwLLSgKCKPBeSN5Wje5gP8McsHrt6pnqWzjhs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c52f7186b520626bb1_SBACx.png",
    "decimals": 8
  },
  {
    "slug": "schwab-international-equity-xstock",
    "name": "Schwab International Equity xStock",
    "symbol": "SCHFx",
    "underlyingTicker": "SCHF",
    "mint": "XsWAnFM77x6YvpdaZoos79R12o4Yj4r7EVkaTWddzhU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/693d65f5ea55745f01f4db8e_Ticker%3DSCHFx%2C%20Company%20Name%3DSchwab%20International%20Equity%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "sempra-xstock",
    "name": "Sempra xStock",
    "symbol": "SREx",
    "underlyingTicker": "SRE",
    "mint": "XsbicvsCUHE9ja8gTsjzruDxQTKeyij94i3phx3NuNf",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2144a6aeb33d139b9bc_SREx.png",
    "decimals": 8
  },
  {
    "slug": "servicenow-xstock",
    "name": "ServiceNow xStock",
    "symbol": "NOWx",
    "underlyingTicker": "NOW",
    "mint": "XsBnEFd2EtpwBRNVfN8qLZcVUnuqXRaGCSEEFChLfxL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c0ab2b9761d3a4d41f_NOWx.png",
    "decimals": 8
  },
  {
    "slug": "sharonai-xstock",
    "name": "SharonAI xStock",
    "symbol": "SHAZx",
    "underlyingTicker": "SHAZ",
    "mint": "XshjhoEnkjn6T6f2oyzVrAnMFgixpvFoBp7KepdByJ7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a69086185c38d2705c0349a_SHAZx.png",
    "decimals": 8
  },
  {
    "slug": "sharplink-gaming-xstock",
    "name": "SharpLink Gaming xStock",
    "symbol": "SBETx",
    "underlyingTicker": "SBET",
    "mint": "XsEoih2x6nZuUjFwzGoba6MFmtzCkzW2c4YAm6baQbq",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d8f6123f28541081f18ca1_Ticker%3DSBETx%2C%20Company%20Name%3DSharpLink%20Gaming%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "shenzhou-international-xstock",
    "name": "Shenzhou International xStock",
    "symbol": "SZIGHx",
    "underlyingTicker": "SZIGH",
    "mint": "XsvkFi5zMUCQ9Ynzjsu2d5wcpTEZBW5ZRggHhDBUwRC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a2e6f162772354c9a87_SZIGHx.png",
    "decimals": 8
  },
  {
    "slug": "sherwin-williams-xstock",
    "name": "Sherwin-Williams xStock",
    "symbol": "SHWx",
    "underlyingTicker": "SHW",
    "mint": "XsfgitU15HiJX9UJN2fhcpbfRr5P8XJXvC1nuJs3jAr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1eab961d417330707e7_SHWx.png",
    "decimals": 8
  },
  {
    "slug": "simon-property-xstock",
    "name": "Simon Property xStock",
    "symbol": "SPGx",
    "underlyingTicker": "SPG",
    "mint": "XsUXFEjcDYrp7NuzHtC88JLyirmnLpA8nde1e8eRxEn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1fca19a50c2f1969179_SPGx.png",
    "decimals": 8
  },
  {
    "slug": "sino-biopharmaceutical-xstock",
    "name": "Sino Biopharmaceutical xStock",
    "symbol": "SNBIOx",
    "underlyingTicker": "SNBIO",
    "mint": "XsyeAGJ5CS1uDtDcnFaHTW3QCF5eL2CAt8vcrRBeAs5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a1a6cbd177731e298d8_SNBIOx.png",
    "decimals": 8
  },
  {
    "slug": "sino-land-xstock",
    "name": "Sino Land xStock",
    "symbol": "SINOx",
    "underlyingTicker": "SINO",
    "mint": "XsUtvf2GurvELy5dM2cHVZHZ4ufkviBv6gjQFfKKHeL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a11479f1404fa36d993_SINOx.png",
    "decimals": 8
  },
  {
    "slug": "sinotruk-xstock",
    "name": "Sinotruk xStock",
    "symbol": "SINOTx",
    "underlyingTicker": "SINOT",
    "mint": "XsgiiLos4YromwpmshTMTN6z3PSbD51HSn9k9xysujp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a125f6c613d42ea6db0_SINOTx.png",
    "decimals": 8
  },
  {
    "slug": "sitc-international-xstock",
    "name": "SITC International xStock",
    "symbol": "SITCx",
    "underlyingTicker": "SITC",
    "mint": "XsLwAZXq8MyrkrdsfmPoRxrdQMvGjwveSK9Ug33uRku",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a156f5fed4ed2d18f11_SITCx.png",
    "decimals": 8
  },
  {
    "slug": "sk-hynix-xstock",
    "name": "SK hynix xStock",
    "symbol": "SKHYx",
    "underlyingTicker": "SKHY",
    "mint": "XsnhgGRQwhExfS2bmWzR6EYddKGPRGDEjeJsatkmKqU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a4fa85e78142f6af5d1c718_SKHYx.png",
    "decimals": 8
  },
  {
    "slug": "smoore-international-xstock",
    "name": "Smoore International xStock",
    "symbol": "SMOIHx",
    "underlyingTicker": "SMOIH",
    "mint": "XswbKzrwuU9XaDu5w5xLXFwSwr9AbyusuP8SMYirr49",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a3d3155aebbcfd968b8_SMOIHx.png",
    "decimals": 8
  },
  {
    "slug": "snap-on-xstock",
    "name": "Snap-on xStock",
    "symbol": "SNAx",
    "underlyingTicker": "SNA",
    "mint": "XsKxGKYM3RsRvdgzAZXAh7HZiReynB5pxvoTLRMJiF9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d0741b90f652909a47_SNAx.png",
    "decimals": 8
  },
  {
    "slug": "snowflake-xstock",
    "name": "Snowflake xStock",
    "symbol": "SNOWx",
    "underlyingTicker": "SNOW",
    "mint": "Xs3QCTNpPWTFYRQ9yPv9gsvWKNJGk45UQ1bb1w7xznc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1dee095f9612ea66b25_SNOWx.png",
    "decimals": 8
  },
  {
    "slug": "sofi-technologies-xstock",
    "name": "SoFi Technologies xStock",
    "symbol": "SOFIx",
    "underlyingTicker": "SOFI",
    "mint": "Xsipo31rLh5EqPMR2cArn6kVPAD83C6rxbmCrT9Wu5u",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c6b961d4173307b727_SOFIx.png",
    "decimals": 8
  },
  {
    "slug": "solstice-advanced-materials-xstock",
    "name": "Solstice Advanced Materials xStock",
    "symbol": "SOLSx",
    "underlyingTicker": "SOLS",
    "mint": "XszuTk3Rr5HXpV7Nrfpg7KAZJfDccPAYLKBsRbLYRx4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3221781f40f2ddd75fc_SOLSx.png",
    "decimals": 8
  },
  {
    "slug": "somnigroup-international-xstock",
    "name": "Somnigroup International xStock",
    "symbol": "SGIx",
    "underlyingTicker": "SGI",
    "mint": "XsU3RZd5ufTcCJneLjDhTrU47ma9ypnhXyvJACRZrTv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e30ae095f9612ea7686a_SGIx.png",
    "decimals": 8
  },
  {
    "slug": "southern-copper-xstock",
    "name": "Southern Copper xStock",
    "symbol": "SCCOx",
    "underlyingTicker": "SCCO",
    "mint": "XsQD8itHh5CdrWMiH8cZPB55KSATjdXsxcSJJ14YCFD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f7be2927c932a0493a_SCCOx.png",
    "decimals": 8
  },
  {
    "slug": "southern-xstock",
    "name": "Southern xStock",
    "symbol": "SOx",
    "underlyingTicker": "SO",
    "mint": "Xs5nNLYnMuwBTMQ7KnfCgfsDBa9WehDa1EZqzicarZm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c56ee5fff84d2e0a7e_SOx.png",
    "decimals": 8
  },
  {
    "slug": "southwest-airlines-xstock",
    "name": "Southwest Airlines xStock",
    "symbol": "LUVx",
    "underlyingTicker": "LUV",
    "mint": "XseRUafvQDXZSddDFpsXQPBNggurszyztkh4TEnvEuM",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c21e352bc5cecdecc6_LUVx.png",
    "decimals": 8
  },
  {
    "slug": "sp500-xstock",
    "name": "SP500 xStock",
    "symbol": "SPYx",
    "underlyingTicker": "SPY",
    "mint": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/685116624ae31d5ceb724895_Ticker%3DSPX%2C%20Company%20Name%3DSP500%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "spacex-xstock",
    "name": "SpaceX xStock",
    "symbol": "SPCXx",
    "underlyingTicker": "SPCX",
    "mint": "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a299151671e5a8f636b0b33_SPCXx.png",
    "decimals": 8
  },
  {
    "slug": "spdr-euro-stoxx-50-xstock",
    "name": "SPDR EURO STOXX 50 xStock",
    "symbol": "FEZx",
    "underlyingTicker": "FEZ",
    "mint": "XsbZDdYJKxEBQASz4KBj23NRgymXw2NK6mbNQ6PYhC7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b213cf28978179c654e6b_FEZx.png",
    "decimals": 8
  },
  {
    "slug": "spdr-s-p-oil-gas-exploration-production-etf-xstock",
    "name": "SPDR S&P Oil & Gas Exploration & Production ETF xStock",
    "symbol": "XOPx",
    "underlyingTicker": "XOP",
    "mint": "XsAk6BoV4kBXUM6WXodKyM21CN92G9jArwAzFvbh3LX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47025164fd872f5e94e52_XLEx.png",
    "decimals": 8
  },
  {
    "slug": "ss-c-technologies-xstock",
    "name": "SS&C Technologies xStock",
    "symbol": "SSNCx",
    "underlyingTicker": "SSNC",
    "mint": "Xsq4wQVyggsJXzrjQK51M8bxK3duFaRegcX5Vxdbfcx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e31bc1a6bf4e7d22509e_SSNCx.png",
    "decimals": 8
  },
  {
    "slug": "stanley-black-decker-xstock",
    "name": "Stanley Black & Decker xStock",
    "symbol": "SWKx",
    "underlyingTicker": "SWK",
    "mint": "XsNotS1p6BsTADzMaZVu14SJbuH9V4CYYyRZ8mn6WAQ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32ae6a2081336f990b9_SWKx.png",
    "decimals": 8
  },
  {
    "slug": "starbucks-xstock",
    "name": "Starbucks xStock",
    "symbol": "SBUXx",
    "underlyingTicker": "SBUX",
    "mint": "Xs9gd8SGbYQn9kkUYQayn46BdqQbvvUshEF6ZpRAzM7",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1bdf6cce9266a571240_SBUXx.png",
    "decimals": 8
  },
  {
    "slug": "state-street-xstock",
    "name": "State Street xStock",
    "symbol": "STTx",
    "underlyingTicker": "STT",
    "mint": "Xs6QWdM8Lgdf3gUfmhZfZDu8DKcoMyxjgyU46R28RUR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23a12ec47a2210bac36_STTx.png",
    "decimals": 8
  },
  {
    "slug": "steel-dynamics-xstock",
    "name": "Steel Dynamics xStock",
    "symbol": "STLDx",
    "underlyingTicker": "STLD",
    "mint": "Xsw7mKDicsyZ7dgSMfFxhX5nbgat3uG9V1nCxDy6Gvp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e258c7e87feb70ac0327_STLDx.png",
    "decimals": 8
  },
  {
    "slug": "strategy-pp-fixed-xstock",
    "name": "Strategy PP Fixed xStock",
    "symbol": "STRKx",
    "underlyingTicker": "STRK",
    "mint": "XsaQGz41BEQkS9xAB44uvUtuXcdLJAXEU1dogEzWMZ8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/693d670f7657f41de805d720_Ticker%3DSTRKx%2C%20Company%20Name%3DStrategy%20PP%20Fixed%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "strategy-pp-variable-xstock",
    "name": "Strategy PP Variable xStock",
    "symbol": "STRCx",
    "underlyingTicker": "STRC",
    "mint": "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/693d66a2b661bfc9971dcdac_Ticker%3DSTRCx%2C%20Company%20Name%3DStrategy%20PP%20Variable%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "strive-inc-series-a-preferred-xstock",
    "name": "Strive, Inc. Series A Preferred xStock",
    "symbol": "SATAx",
    "underlyingTicker": "SATA",
    "mint": "XsAxB3xLnt7xto5ChiSbVNHBoXcXzKuzS7FieiNYwtY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b215130538b9572d1c7c7_SATAx.png",
    "decimals": 8
  },
  {
    "slug": "stryker-xstock",
    "name": "Stryker xStock",
    "symbol": "SYKx",
    "underlyingTicker": "SYK",
    "mint": "XshACd866qcdJYTotipkEHNKKnjDHJJkUciUxKVenE3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1c31e352bc5ceccf020_SYKx.png",
    "decimals": 8
  },
  {
    "slug": "sun-communities-xstock",
    "name": "Sun Communities xStock",
    "symbol": "SUIx",
    "underlyingTicker": "SUI",
    "mint": "XsWaSDd1S6YhQfsnTquL5ht2TGHe3mabeZ2Kvfpjsnc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3091cd17aa2ee836821_SUIx.png",
    "decimals": 8
  },
  {
    "slug": "sunny-optical-technology-group-xstock",
    "name": "Sunny Optical Technology Group xStock",
    "symbol": "SUOPTx",
    "underlyingTicker": "SUOPT",
    "mint": "XsVpajrhXA4CffEm652abYSS2iDiKnLnarPYxaokYis",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a3ab5ef2b3729abc432_SUOPTx.png",
    "decimals": 8
  },
  {
    "slug": "super-micro-computer-inc-xstock",
    "name": "Super Micro Computer, Inc. xStock",
    "symbol": "SMCIx",
    "underlyingTicker": "SMCI",
    "mint": "XsMxAoJP47FQGLsVUvSS2QfBaHdNsd7DRU6nWRL8RSa",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c4702409531b5477c260d1_SMCIx.png",
    "decimals": 8
  },
  {
    "slug": "swire-properties-xstock",
    "name": "Swire Properties xStock",
    "symbol": "SWPRPx",
    "underlyingTicker": "SWPRP",
    "mint": "Xsxr7Bmw3Sj4ib4RziMw3CZuFVfCUgFuXi4W5bbmrV4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a03de2d7051659ac296_SWPRPx.png",
    "decimals": 8
  },
  {
    "slug": "synchrony-financial-xstock",
    "name": "Synchrony Financial xStock",
    "symbol": "SYFx",
    "underlyingTicker": "SYF",
    "mint": "XsWMBE3QzwuS7pJET8GUyaGzjNJG49RToPBYWdGHUTG",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e292c8a1cd3be66f721a_SYFx.png",
    "decimals": 8
  },
  {
    "slug": "synopsys-xstock",
    "name": "Synopsys xStock",
    "symbol": "SNPSx",
    "underlyingTicker": "SNPS",
    "mint": "XsfGN1hFHbigfAzUY1nLRjrECm3ohGzVcim5pMqgp9d",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d8c3e7fb8af52aadd8_SNPSx.png",
    "decimals": 8
  },
  {
    "slug": "sysco-xstock",
    "name": "Sysco xStock",
    "symbol": "SYYx",
    "underlyingTicker": "SYY",
    "mint": "XszobR4az4oYsssmwsFov326662q84g7UPXzRgrGvfS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e253f6cce9266a57734d_SYYx.png",
    "decimals": 8
  },
  {
    "slug": "t-mobile-xstock",
    "name": "T-Mobile xStock",
    "symbol": "TMUSx",
    "underlyingTicker": "TMUS",
    "mint": "XswCi2U1G6Ppbw1QhG45yKb8UKuR1FKLJrquv2FZSD4",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da3de910a7b8b2abcb94e4_Ticker%3DTMUSx%2C%20Company%20Name%3DT-Mobile%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "t-rowe-price-xstock",
    "name": "T. Rowe Price xStock",
    "symbol": "TROWx",
    "underlyingTicker": "TROW",
    "mint": "Xs8urJdzBSFLaKqxZiMackbXDkyZbwPeAwz7PepQ1eD",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b02421b195884d263d_TROWx.png",
    "decimals": 8
  },
  {
    "slug": "t1-energy-xstock",
    "name": "T1 Energy xStock",
    "symbol": "TEx",
    "underlyingTicker": "TE",
    "mint": "XsEn37JjZxj3m9YayAyCCJFaQKBPZc6aUEiLEus5igu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690863c1f8f231f7af0fda_TEx.png",
    "decimals": 8
  },
  {
    "slug": "take-two-interactive-software-xstock",
    "name": "Take-Two Interactive Software xStock",
    "symbol": "TTWOx",
    "underlyingTicker": "TTWO",
    "mint": "XssvmC28hqLgtT5kf8R8eAv3mejy4XftJ6MXB8QywTa",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24d7d5d025cdcf9082a_TTWOx.png",
    "decimals": 8
  },
  {
    "slug": "talen-energy-xstock",
    "name": "Talen Energy xStock",
    "symbol": "TLNx",
    "underlyingTicker": "TLN",
    "mint": "Xs8yLZVjsYmQ5Tu4e5JDVQeo4cbRRDCVERgtSGJFn3q",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34d2fd4a49f2e67f943_TLNx.png",
    "decimals": 8
  },
  {
    "slug": "tapestry-xstock",
    "name": "Tapestry xStock",
    "symbol": "TPRx",
    "underlyingTicker": "TPR",
    "mint": "Xs2zWfkYjSCCW4fdC1L36rz77YzTcQtji7ewjWPvuWW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26aa19a50c2f196f28f_TPRx.png",
    "decimals": 8
  },
  {
    "slug": "targa-resources-xstock",
    "name": "Targa Resources xStock",
    "symbol": "TRGPx",
    "underlyingTicker": "TRGP",
    "mint": "XsmhtZrbnheSvztwRW82ZqZqMjaRnAQqyWERFh1A4Kr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2214e56d67ba7ebc263_TRGPx.png",
    "decimals": 8
  },
  {
    "slug": "tbll-xstock",
    "name": "TBLL xStock",
    "symbol": "TBLLx",
    "underlyingTicker": "TBLL",
    "mint": "XsqBC5tcVQLYt8wqGCHRnAUUecbRYXoJCReD6w7QEKp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/688cb5a681cc1775c4cd3cae_Ticker%3DTBLLx%2C%20Company%20Name%3DInvesco%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "td-synnex-xstock",
    "name": "TD Synnex xStock",
    "symbol": "SNXx",
    "underlyingTicker": "SNX",
    "mint": "Xsh64eWgeLab2YtKPRy15Zj7tXrUncjVwszGW9F5tWG",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2be1e352bc5cecdeafd_SNXx.png",
    "decimals": 8
  },
  {
    "slug": "teledyne-technologies-xstock",
    "name": "Teledyne Technologies xStock",
    "symbol": "TDYx",
    "underlyingTicker": "TDY",
    "mint": "XsBKXQehs7BBCZ8YbJ8X5B37BE1ymf9KyMJwbj6Jpoy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2724f11a0bdd7096ecd_TDYx.png",
    "decimals": 8
  },
  {
    "slug": "tencent-xstock",
    "name": "Tencent xStock",
    "symbol": "TCENTx",
    "underlyingTicker": "TCENT",
    "mint": "XsXb7KCxcxTi6hqWfYyEe1kpTwtiCeU5TJbEz8N7RWn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099af76502e4a0a15b67c_TCENTx.png",
    "decimals": 8
  },
  {
    "slug": "tenet-healthcare-xstock",
    "name": "Tenet Healthcare xStock",
    "symbol": "THCx",
    "underlyingTicker": "THC",
    "mint": "XsBYWM8wgvSJfvNybgc6qxGxkD584FSycCWRiCvwZHk",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e300f6cce9266a57fe9b_THCx.png",
    "decimals": 8
  },
  {
    "slug": "teradyne-inc-xstock",
    "name": "Teradyne, Inc. xStock",
    "symbol": "TERx",
    "underlyingTicker": "TER",
    "mint": "Xsbe4fwmjVQEWEPkzfyxqNdPUUK7X9dKfTJrZdDbNgx",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470240289b609b13cb522_TERx.png",
    "decimals": 8
  },
  {
    "slug": "terawulf-xstock",
    "name": "TeraWulf xStock",
    "symbol": "WULFx",
    "underlyingTicker": "WULF",
    "mint": "XsuwUbQSzCJN2wZabD1Gxf1MER2Ypa7hMzVMYB2WawJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7e5e8b1212907904c8095_Ticker%3DWULFx%2C%20Company%20Name%3DTeraWulf%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "tesla-xstock",
    "name": "Tesla xStock",
    "symbol": "TSLAx",
    "underlyingTicker": "TSLA",
    "mint": "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684aaf9559b2312c162731f5_Ticker%3DTSLA%2C%20Company%20Name%3DTesla%20Inc.%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "texas-instruments-xstock",
    "name": "Texas Instruments xStock",
    "symbol": "TXNx",
    "underlyingTicker": "TXN",
    "mint": "XsU4fHhJEFcrwNh4RYuHmWdaoCfsrWKEm4UEs3zTJwH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e196a19a50c2f1961ab2_TXNx.png",
    "decimals": 8
  },
  {
    "slug": "texas-pacific-land-xstock",
    "name": "Texas Pacific Land xStock",
    "symbol": "TPLx",
    "underlyingTicker": "TPL",
    "mint": "XsNpiekiQLb87S2VqmaYjez6sNSrjoK78nCPAF8uaCF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c4e6a2081336f94a12_TPLx.png",
    "decimals": 8
  },
  {
    "slug": "textron-xstock",
    "name": "Textron xStock",
    "symbol": "TXTx",
    "underlyingTicker": "TXT",
    "mint": "XsjWGbe4McmJXNRd6hQYsS8dEsPKTfT38fxSebugRbn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f3f7bf3b563834ab2d_TXTx.png",
    "decimals": 8
  },
  {
    "slug": "the-carlyle-xstock",
    "name": "The Carlyle xStock",
    "symbol": "CGx",
    "underlyingTicker": "CG",
    "mint": "XsaLeEQ2RtXLwLYBtJv1wT7CXk4paWCvKxNWMNk4mbZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33e9d738e95105c7b55_CGx.png",
    "decimals": 8
  },
  {
    "slug": "the-cigna-xstock",
    "name": "The Cigna xStock",
    "symbol": "CIx",
    "underlyingTicker": "CI",
    "mint": "XsGfYyioN9bfk6M6RGKvucDq8grQehqkBz8ziEtT124",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e1741b90f6528fbf99_CIx.png",
    "decimals": 8
  },
  {
    "slug": "the-cooper-companies-xstock",
    "name": "The Cooper Companies xStock",
    "symbol": "COOx",
    "underlyingTicker": "COO",
    "mint": "XsWetupD7QGe8e5fXsJAPHYFXFTUdYVjT44hJMsVDtY",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e324ab2b9761d3a5c350_COOx.png",
    "decimals": 8
  },
  {
    "slug": "the-estee-lauder-companies-xstock",
    "name": "The Estee Lauder Companies xStock",
    "symbol": "ELx",
    "underlyingTicker": "EL",
    "mint": "XsTisPuTVM8VVHagEyeGR7CBt6TUD93AEhptETHWMsd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2bca75e19a3211256cc_ELx.png",
    "decimals": 8
  },
  {
    "slug": "the-hartford-insurance-xstock",
    "name": "The Hartford Insurance xStock",
    "symbol": "HIGx",
    "underlyingTicker": "HIG",
    "mint": "XsLw8Pw975zbR4QPQkAorVYM6qQq21jSztyDoskVz5x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25b3bed1b88de0c6a98_HIGx.png",
    "decimals": 8
  },
  {
    "slug": "the-hershey-xstock",
    "name": "The Hershey xStock",
    "symbol": "HSYx",
    "underlyingTicker": "HSY",
    "mint": "XscEuBenD5X7CMVdh6MKzTSBQLsKNqmsoLiXHrQMitH",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e28e95063765fcf3385b_HSYx.png",
    "decimals": 8
  },
  {
    "slug": "the-kraft-heinz-xstock",
    "name": "The Kraft Heinz xStock",
    "symbol": "KHCx",
    "underlyingTicker": "KHC",
    "mint": "XszMPpjvc5nyynUGktkn7JkqkfFYxunE29Rxi4Vo8C5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c9f873027085636bc8_KHCx.png",
    "decimals": 8
  },
  {
    "slug": "the-kroger-xstock",
    "name": "The Kroger xStock",
    "symbol": "KRx",
    "underlyingTicker": "KR",
    "mint": "XsHyXCSuYHca6SxpSLb2taKiWkoJA48pVcnqyFguHf5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2574f11a0bdd709574c_KRx.png",
    "decimals": 8
  },
  {
    "slug": "the-travelers-companies-xstock",
    "name": "The Travelers Companies xStock",
    "symbol": "TRVx",
    "underlyingTicker": "TRV",
    "mint": "Xsxd1sqLaPsmmmYTZHr2GnNufXXiH5rZcahP99TyeDr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2052421b195884ca3e0_TRVx.png",
    "decimals": 8
  },
  {
    "slug": "the-walt-disney-xstock",
    "name": "The Walt Disney xStock",
    "symbol": "DISx",
    "underlyingTicker": "DIS",
    "mint": "Xsg93jDV656ULQ5u9yT2x5DS9b4xGD8aDCtfESSW6Bb",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a51781f40f2ddc0ea9_DISx.png",
    "decimals": 8
  },
  {
    "slug": "the-wharf-holdings-xstock",
    "name": "The Wharf Holdings xStock",
    "symbol": "WRFHDx",
    "underlyingTicker": "WRFHD",
    "mint": "XsQqWNfMfAVg8hSfGMFzSvEfqwhid5qcZVmm6ny6g3a",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a25dc9226b0bc91963b_WHRFRx.png",
    "decimals": 8
  },
  {
    "slug": "thermo-fisher-xstock",
    "name": "Thermo Fisher xStock",
    "symbol": "TMOx",
    "underlyingTicker": "TMO",
    "mint": "Xs8drBWy3Sd5QY3aifG9kt9KFs2K3PGZmx7jWrsrk57",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bf4d930b0fdc50503056d_Ticker%3DTMO%2C%20Company%20Name%3DThermo_Fisher_Scientific%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "tingyi-xstock",
    "name": "Tingyi xStock",
    "symbol": "TNGYIx",
    "underlyingTicker": "TNGYI",
    "mint": "XsMMFdkb82bRyNcwXxWZQqkurJuzdqZ5Wf6ydd5exBe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a30cf5e24a9900d81a9_TNGYIx.png",
    "decimals": 8
  },
  {
    "slug": "tjx-companies-xstock",
    "name": "TJX Companies xStock",
    "symbol": "TJXx",
    "underlyingTicker": "TJX",
    "mint": "XsPWZN3FYcrvpEnxrQqogbVZtxpRX9tFomymKw2dWJS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a425a7f80a1d5fc385_TJXx.png",
    "decimals": 8
  },
  {
    "slug": "toll-brothers-xstock",
    "name": "Toll Brothers xStock",
    "symbol": "TOLx",
    "underlyingTicker": "TOL",
    "mint": "XsnbxjqAYHWuP4Fro7GnJ3kkUh6g9B2xWUMwaVeVgyL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3123bed1b88de0d0792_TOLx.png",
    "decimals": 8
  },
  {
    "slug": "ton-xstock",
    "name": "TON xStock",
    "symbol": "TONXx",
    "underlyingTicker": "TONX",
    "mint": "XscE4GUcsYhcyZu5ATiGUMmhxYa1D5fwbpJw4K6K4dp",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7db29223cfd256ebb952c_Ticker%3DTONx%2C%20Company%20Name%3DTON%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "tqqq-xstock",
    "name": "TQQQ xStock",
    "symbol": "TQQQx",
    "underlyingTicker": "TQQQ",
    "mint": "XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/685125548a5829b9b59a6156_TQQQx.svg",
    "decimals": 8
  },
  {
    "slug": "tractor-supply-xstock",
    "name": "Tractor Supply xStock",
    "symbol": "TSCOx",
    "underlyingTicker": "TSCO",
    "mint": "XsYMTZRVKs9he9redAPMhaBbCbmZvUxMTApsfCZsKzt",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f5f7bf3b563834ac00_TSCOx.png",
    "decimals": 8
  },
  {
    "slug": "tradeweb-markets-xstock",
    "name": "Tradeweb Markets xStock",
    "symbol": "TWx",
    "underlyingTicker": "TW",
    "mint": "Xs1vPiv1k4jph8JkwRfnCjog6pXKuYzVVpdRVSt3hWA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3457d5d025cdcf9d4c7_TWx.png",
    "decimals": 8
  },
  {
    "slug": "transdigm-xstock",
    "name": "TransDigm xStock",
    "symbol": "TDGx",
    "underlyingTicker": "TDG",
    "mint": "XsaY4eSxkNswy2kg8j7CWS7v154y5kkxYRiqX2ffpVZ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1f752efb881364c638a_TDGx.png",
    "decimals": 8
  },
  {
    "slug": "transunion-xstock",
    "name": "TransUnion xStock",
    "symbol": "TRUx",
    "underlyingTicker": "TRU",
    "mint": "XsyvvjANUH1LpSQkRr3xgCyfxJLcNtpEVyFFNpJcDsb",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32bc1a6bf4e7d2259f2_TRUx.png",
    "decimals": 8
  },
  {
    "slug": "trimble-xstock",
    "name": "Trimble xStock",
    "symbol": "TRMBx",
    "underlyingTicker": "TRMB",
    "mint": "XsJ8MXED4y4NCxfX6ZE9XJiXLXLgBNzEYDtmnx2hbZ1",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3443bed1b88de0d3228_TRMBx.png",
    "decimals": 8
  },
  {
    "slug": "truist-financial-xstock",
    "name": "Truist Financial xStock",
    "symbol": "TFCx",
    "underlyingTicker": "TFC",
    "mint": "XspgPjzWCN6w4b8xHyfN8NRXrgdNMYx5nsWgiGGeK4R",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e211253b5873d2cfa550_TFCx.png",
    "decimals": 8
  },
  {
    "slug": "tsmc-xstock",
    "name": "TSMC xStock",
    "symbol": "TSMx",
    "underlyingTicker": "TSM",
    "mint": "XsafvsGtzFqqHgTnA3aPC83EAMkacU5mcGtcSayhpVV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d92310e65e3ad1c0cb9040_Ticker%3DTSMx%2C%20Company%20Name%3DTSMC%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "twilio-xstock",
    "name": "Twilio xStock",
    "symbol": "TWLOx",
    "underlyingTicker": "TWLO",
    "mint": "XsQVYwNXBY7UNaLonk5qTbr3RzFC87CECGXWWfJomt2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e278953f0b6f81d421d7_TWLOx.png",
    "decimals": 8
  },
  {
    "slug": "twist-bioscience-xstock",
    "name": "Twist Bioscience xStock",
    "symbol": "TWSTx",
    "underlyingTicker": "TWST",
    "mint": "XsMAsw5BADYr3m19HhYeXrG1qAieeP75DT8tKn42DFA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a69085fb20117c19d29c093_TWSTx.png",
    "decimals": 8
  },
  {
    "slug": "tyler-technologies-xstock",
    "name": "Tyler Technologies xStock",
    "symbol": "TYLx",
    "underlyingTicker": "TYL",
    "mint": "XsiSQ5MUFoAwjrGB1x3FsXTthfwJnJgHVXj9tDKuvr8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e332c8a1cd3be66fdef3_TYLx.png",
    "decimals": 8
  },
  {
    "slug": "tyson-foods-xstock",
    "name": "Tyson Foods xStock",
    "symbol": "TSNx",
    "underlyingTicker": "TSN",
    "mint": "XsWV8voFNehNEbuBW8cEAMWwjicXCYskUT4616PFZ6a",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2fa17bc5767a5d2c285_TSNx.png",
    "decimals": 8
  },
  {
    "slug": "u-s-bancorp-xstock",
    "name": "U.S. Bancorp xStock",
    "symbol": "USBx",
    "underlyingTicker": "USB",
    "mint": "Xsieiissncd7uzAW2kwNJPDKBfWcyvdibgxSMQindKF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d0b6da94eb4c75d04a_USBx.png",
    "decimals": 8
  },
  {
    "slug": "uber-xstock",
    "name": "Uber xStock",
    "symbol": "UBERx",
    "underlyingTicker": "UBER",
    "mint": "XsAsZLF4MmsvS1sDxRMrUz7REjHfwbC9UAMXSRBqgEB",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68d7eb5ae02d03041fc55c51_Ticker%3DUBERx%2C%20Company%20Name%3DUBER%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "udr-xstock",
    "name": "UDR xStock",
    "symbol": "UDRx",
    "underlyingTicker": "UDR",
    "mint": "XstJ29hJ96UCddwezTPe9mXLiamEApRt85ChkTSRh5f",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32e12ec47a2210c8e40_UDRx.png",
    "decimals": 8
  },
  {
    "slug": "ulta-beauty-xstock",
    "name": "Ulta Beauty xStock",
    "symbol": "ULTAx",
    "underlyingTicker": "ULTA",
    "mint": "Xse5GAs99zAj5bzMAbwjooLn4AHn1Ny6nUcN6vt5vrR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c1e6a2081336f94870_ULTAx.png",
    "decimals": 8
  },
  {
    "slug": "union-pacific-xstock",
    "name": "Union Pacific xStock",
    "symbol": "UNPx",
    "underlyingTicker": "UNP",
    "mint": "Xsehrw5hHiQ16Vfxxctj8ewUhtRCzbCrBYS278ctAAy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a93bed1b88de0beca7_UNPx.png",
    "decimals": 8
  },
  {
    "slug": "uniqure-xstock",
    "name": "uniQure xStock",
    "symbol": "QUREx",
    "underlyingTicker": "QURE",
    "mint": "XsuE5LvQcc9P67iWVqsysQ84DBDRWssbiKnwY8JtwpL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a690860a729a50e535a5675_QUREx.png",
    "decimals": 8
  },
  {
    "slug": "united-airlines-xstock",
    "name": "United Airlines xStock",
    "symbol": "UALx",
    "underlyingTicker": "UAL",
    "mint": "XsKq6Ac27X857u18jH8MrWQ3bEA5ZfUSGriawpyu8xw",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24fd09b3213b2daca7d_UALx.png",
    "decimals": 8
  },
  {
    "slug": "united-parcel-service-xstock",
    "name": "United Parcel Service xStock",
    "symbol": "UPSx",
    "underlyingTicker": "UPS",
    "mint": "XsnqNkeDhvaK8C5B3Z4D1ciCupVAgkw1AdS3U2uEn26",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1dc1781f40f2ddc3a35_UPSx.png",
    "decimals": 8
  },
  {
    "slug": "united-rentals-xstock",
    "name": "United Rentals xStock",
    "symbol": "URIx",
    "underlyingTicker": "URI",
    "mint": "XsLR9avpksMgLqB5Mw3jBNjzdvSDUKGw4onApxDGE6x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1ff2f7186b52061cf00_URIx.png",
    "decimals": 8
  },
  {
    "slug": "united-therapeutics-xstock",
    "name": "United Therapeutics xStock",
    "symbol": "UTHRx",
    "underlyingTicker": "UTHR",
    "mint": "XsrazTRfp2iGrUcZkkoB8PpM9qApe77RbohmknHh9XJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b29e65d1c932102814_UTHRx.png",
    "decimals": 8
  },
  {
    "slug": "unitedhealth-xstock",
    "name": "UnitedHealth xStock",
    "symbol": "UNHx",
    "underlyingTicker": "UNH",
    "mint": "XszvaiXGPwvk2nwb3o9C1CX4K6zH8sez11E6uyup6fe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684abb4c69185d8a871e2ab5_Ticker%3DUNH%2C%20Company%20Name%3DUnited%20Health%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "unum-xstock",
    "name": "Unum xStock",
    "symbol": "UNMx",
    "underlyingTicker": "UNM",
    "mint": "XsAhRsoTzG6cpxTxvH9qSze3Kwg2gmYbABi5xqrGm7G",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3066ee5fff84d2ef928_UNMx.png",
    "decimals": 8
  },
  {
    "slug": "us-foods-xstock",
    "name": "US Foods xStock",
    "symbol": "USFDx",
    "underlyingTicker": "USFD",
    "mint": "Xspjr5y1bLtPTeSg13NBzxcE3JKZjYQrdpHKxAGsQYs",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2c3b588832a4c88dc12_USFDx.png",
    "decimals": 8
  },
  {
    "slug": "usa-rare-earth-inc-xstock",
    "name": "USA Rare Earth Inc. xStock",
    "symbol": "USARx",
    "underlyingTicker": "USAR",
    "mint": "XsJJneENiaBPqqcdK1gMsfwi9cbw111azigzRYHoctX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c47022d27fea5e2c352266_USARx.png",
    "decimals": 8
  },
  {
    "slug": "valero-energy-xstock",
    "name": "Valero Energy xStock",
    "symbol": "VLOx",
    "underlyingTicker": "VLO",
    "mint": "XsmMjZH2ex52ecoCqBN1sMADoWQziXpe9j6z6QVmafF",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1e94f11a0bdd70907ba_VLOx.png",
    "decimals": 8
  },
  {
    "slug": "vaneck-agribusiness-etf-xstock",
    "name": "VanEck Agribusiness ETF xStock",
    "symbol": "MOOx",
    "underlyingTicker": "MOO",
    "mint": "Xs72K1Ta1D5ccNy3RzSyQWGgZywWvphX78pL8WBk1Bo",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470278a014cb155f9fe2a_MOOx.png",
    "decimals": 8
  },
  {
    "slug": "vaneck-gold-miners-xstock",
    "name": "VanEck Gold Miners xStock",
    "symbol": "GDXx",
    "underlyingTicker": "GDX",
    "mint": "XsVRhRg9eRE9PrsoPsAt5Mifa8mfjm9R3vdw6orp54j",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b213e51f5a83deaf6d290_GDXx.png",
    "decimals": 8
  },
  {
    "slug": "vaneck-semiconductor-etf-xstock",
    "name": "VanEck Semiconductor ETF xStock",
    "symbol": "SMHx",
    "underlyingTicker": "SMH",
    "mint": "XstuBvLo7soZzj3beCCPonHpR3eUfPNSeQzw35Swons",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c4702775e221c68f54a9ac_SMHx.png",
    "decimals": 8
  },
  {
    "slug": "vaneck-uranium-and-nuclear-xstock",
    "name": "VanEck Uranium and Nuclear xStock",
    "symbol": "NLRx",
    "underlyingTicker": "NLR",
    "mint": "XsTSfxoQry8okZoGMN5t6mExibDq3gA2NDLJeLztX7E",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b213e51f5a83deaf6d290_GDXx.png",
    "decimals": 8
  },
  {
    "slug": "vanguard-ftse-europe-etf-xstock",
    "name": "Vanguard FTSE Europe ETF xStock",
    "symbol": "VGKx",
    "underlyingTicker": "VGK",
    "mint": "XsosCAu1L8Ebpr4SdBDV1EboYDRTWCH8j79UnHYzvbN",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470269e9ab36e999bc852_VUGx.png",
    "decimals": 8
  },
  {
    "slug": "vanguard-growth-etf-xstock",
    "name": "Vanguard Growth ETF xStock",
    "symbol": "VUGx",
    "underlyingTicker": "VUG",
    "mint": "XsNVBwVGqtDqmA2Waoiux5mfykH8nepLK74z3ZoQWK2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470269e9ab36e999bc852_VUGx.png",
    "decimals": 8
  },
  {
    "slug": "vanguard-s-p-500-xstock",
    "name": "Vanguard S&P 500 xStock",
    "symbol": "VOOx",
    "underlyingTicker": "VOO",
    "mint": "Xsd7TduTbjuYCFL7Uoujb8SbkZLmUsuYNLn7KdvX21x",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b21412917f9d10c29fcb6_VOOx.png",
    "decimals": 8
  },
  {
    "slug": "vanguard-total-international-stock-etf-xstock",
    "name": "Vanguard Total International Stock ETF xStock",
    "symbol": "VXUSx",
    "underlyingTicker": "VXUS",
    "mint": "XsLT5v4DAd1kwViPQh3SZiT5kzJfNLxzJxJN1dySZTe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470269e9ab36e999bc852_VUGx.png",
    "decimals": 8
  },
  {
    "slug": "vanguard-total-world-xstock",
    "name": "Vanguard Total World xStock",
    "symbol": "VTx",
    "underlyingTicker": "VT",
    "mint": "XsEdDDTcVGJU6nvdRdVnj53eKTrsCkvtrVfXGmUK68V",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/693d66542105e6cbefeb7cbf_Ticker%3DVTx%2C%20Company%20Name%3DVanguard%20Total%20World%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "vanguard-xstock",
    "name": "Vanguard xStock",
    "symbol": "VTIx",
    "underlyingTicker": "VTI",
    "mint": "XsssYEQjzxBCFgvYFFNuhJFBeHNdLWYeUSP8F45cDr9",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68511e335ee1314f602d9a7c_Ticker%3DVTI%2C%20Company%20Name%3DVanguard%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "veeva-systems-xstock",
    "name": "Veeva Systems xStock",
    "symbol": "VEEVx",
    "underlyingTicker": "VEEV",
    "mint": "XspuRH5i611hbZjGtYsiaLmhnGya23UU4jnwADWr9yV",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a22fd4a49f2e677cee_VEEVx.png",
    "decimals": 8
  },
  {
    "slug": "ventas-xstock",
    "name": "Ventas xStock",
    "symbol": "VTRx",
    "underlyingTicker": "VTR",
    "mint": "XsEvH8WR4t5FU5GT1cfsmPnvrmEknd4UXA68uJ1F25L",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e24ec3e7fb8af52b1320_VTRx.png",
    "decimals": 8
  },
  {
    "slug": "veralto-xstock",
    "name": "Veralto xStock",
    "symbol": "VLTOx",
    "underlyingTicker": "VLTO",
    "mint": "Xs6mp36rvKSo7vTM588J1HUZF1sbNjK3KSz12fNM7P5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34ba19a50c2f197d46d_VLTOx.png",
    "decimals": 8
  },
  {
    "slug": "verisign-xstock",
    "name": "VeriSign xStock",
    "symbol": "VRSNx",
    "underlyingTicker": "VRSN",
    "mint": "Xsy4NX4cCf4YjN6iwypnQ8crXtNkyA2K3jypAX5NfQ6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2b42fd4a49f2e67899f_VRSNx.png",
    "decimals": 8
  },
  {
    "slug": "verisk-analytics-xstock",
    "name": "Verisk Analytics xStock",
    "symbol": "VRSKx",
    "underlyingTicker": "VRSK",
    "mint": "XsBDavbmVc22RNAgsHwUDEeC8f8VVCKLCcxFbfFUEzW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e29be095f9612ea72685_VRSKx.png",
    "decimals": 8
  },
  {
    "slug": "verizon-communications-xstock",
    "name": "Verizon Communications xStock",
    "symbol": "VZx",
    "underlyingTicker": "VZ",
    "mint": "Xs4VKGG8TTan8UN3mC1ufsDMamBtBLE4Ahfkyv2tfuy",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1a117bc5767a5d19da3_VZx.png",
    "decimals": 8
  },
  {
    "slug": "vertex-pharmaceuticals-xstock",
    "name": "Vertex Pharmaceuticals xStock",
    "symbol": "VRTXx",
    "underlyingTicker": "VRTX",
    "mint": "XsgCWpLUC3pv6JmNAFtkYmuwSaikShy8QZRuripgBzn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1bf6ee5fff84d2e053c_VRTXx.png",
    "decimals": 8
  },
  {
    "slug": "vertiv-holdings-co-xstock",
    "name": "Vertiv Holdings Co xStock",
    "symbol": "VRTx",
    "underlyingTicker": "VRT",
    "mint": "XsLUiVEwYeoneKpgR1C2Q4DBUZhX4xDktSCfQqq8zmn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/69c470220866928c53deffec_VRTx.png",
    "decimals": 8
  },
  {
    "slug": "viatris-xstock",
    "name": "Viatris xStock",
    "symbol": "VTRSx",
    "underlyingTicker": "VTRS",
    "mint": "Xs9uh84WXf2F4P4UVRLvNGwv753ArA69kUk6r4GKVoA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2d6cf0d8d5d6ca3bca0_VTRSx.png",
    "decimals": 8
  },
  {
    "slug": "vici-properties-xstock",
    "name": "VICI Properties xStock",
    "symbol": "VICIx",
    "underlyingTicker": "VICI",
    "mint": "XsN9HmM3TqbY317obKz1fYbRvR81MT9qbL5eUSiGto3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e26e17bc5767a5d2598a_VICIx.png",
    "decimals": 8
  },
  {
    "slug": "vida-global-xstock",
    "name": "Vida Global xStock",
    "symbol": "VIDAx",
    "underlyingTicker": "VIDA",
    "mint": "XsfCC9VL4DamVGNgdJpfLXB3sBVa158Gbx8sh7NzmTk",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b212fb240211b0faa73d6_VIDAx.png",
    "decimals": 8
  },
  {
    "slug": "viking-xstock",
    "name": "Viking xStock",
    "symbol": "VIKx",
    "underlyingTicker": "VIK",
    "mint": "XsEWryPA68Tddfrw31uSv18aysuZ6gb4vszk856hqQ6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e34e1781f40f2ddd9183_VIKx.png",
    "decimals": 8
  },
  {
    "slug": "virgin-galactic-xstock",
    "name": "Virgin Galactic xStock",
    "symbol": "SPCEx",
    "underlyingTicker": "SPCE",
    "mint": "Xsgrm4D6VBTfDx5bs7GNdjtmWDgZ8V79r3YpsYwf5py",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da3cd71b11b6b9e4d26866_Ticker%3DVirgin%20Galactic%20xStock%2C%20Company%20Name%3DSPCEx%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "visa-xstock",
    "name": "Visa xStock",
    "symbol": "Vx",
    "underlyingTicker": "V",
    "mint": "XsqgsbXwWogGJsNcVZ3TyVouy2MbTkfCFhCGGGcQZ2p",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684acfd76eb8395c6d1d2210_Ticker%3DV%2C%20Company%20Name%3DVisa%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "volatility-shares-2x-bitcoin-strategy-xstock",
    "name": "Volatility Shares 2x Bitcoin Strategy xStock",
    "symbol": "BITXx",
    "underlyingTicker": "BITX",
    "mint": "XsraCsjDB8cYn672MZSxCzZBhrodEPXD7pWd5EiRUhm",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a0b2142bc1f4f247bab54e3_BITXx.png",
    "decimals": 8
  },
  {
    "slug": "vulcan-materials-xstock",
    "name": "Vulcan Materials xStock",
    "symbol": "VMCx",
    "underlyingTicker": "VMC",
    "mint": "XsAtnoftgxL6kJErDeCL8m2e364mAYgEbSfSKxi4ctJ",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2504f2d04f1d9a74b98_VMCx.png",
    "decimals": 8
  },
  {
    "slug": "w-p-carey-xstock",
    "name": "W.P. Carey xStock",
    "symbol": "WPCx",
    "underlyingTicker": "WPC",
    "mint": "Xs3jL3WdD8YSqLeiy7Tt7dGEeBZziFMYboyUMSr38AE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2f452efb881364d4164_WPCx.png",
    "decimals": 8
  },
  {
    "slug": "w-r-berkley-xstock",
    "name": "W.R. Berkley xStock",
    "symbol": "WRBx",
    "underlyingTicker": "WRB",
    "mint": "XsnARtma2bEi2x1JuKuznZa1QzQkLaedxHW6KeUCz8J",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3089d738e95105c54a0_WRBx.png",
    "decimals": 8
  },
  {
    "slug": "w-w-grainger-xstock",
    "name": "W.W. Grainger xStock",
    "symbol": "GWWx",
    "underlyingTicker": "GWW",
    "mint": "XsSuZjygy7yrbyZJNzBj78ysrKDFMv11HrPPwBUE2Dn",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e21b3d340815b60d907c_GWWx.png",
    "decimals": 8
  },
  {
    "slug": "walmart-xstock",
    "name": "Walmart xStock",
    "symbol": "WMTx",
    "underlyingTicker": "WMT",
    "mint": "Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/684bebd366d5089b2da3cf7e_Ticker%3DWMT%2C%20Company%20Name%3DWalmart%2C%20size%3D256x256.svg",
    "decimals": 8
  },
  {
    "slug": "warner-bros-discovery-xstock",
    "name": "Warner Bros. Discovery xStock",
    "symbol": "WBDx",
    "underlyingTicker": "WBD",
    "mint": "XsZUSqxAXKJkEimvD4CoVvEb4WUC92TFgj5zRtBxFeL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da3a1adc2ff6166dca95d1_Ticker%3DWBDx%2C%20Company%20Name%3DWarner%20Bros.%20Discovery%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "waste-management-xstock",
    "name": "Waste Management xStock",
    "symbol": "WMx",
    "underlyingTicker": "WM",
    "mint": "XscZ13Vr2dH9GV8vxVAgFsXz2YMoDCAz3QanuCcwsr5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1dbe095f9612ea668a1_WMx.png",
    "decimals": 8
  },
  {
    "slug": "waters-xstock",
    "name": "Waters xStock",
    "symbol": "WATx",
    "underlyingTicker": "WAT",
    "mint": "XsGmxpiwpg9oBuRoyczLkXs7j82v9Rb4BTHwTkvXnNA",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25d536f62aa99a95ac2_WATx.png",
    "decimals": 8
  },
  {
    "slug": "watsco-xstock",
    "name": "Watsco xStock",
    "symbol": "WSOx",
    "underlyingTicker": "WSO",
    "mint": "Xsgefxs1R4c5pYqhijeA3QLT42i38J7QpBtnt4GGk1f",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e3261cd17aa2ee83778f_WSOx.png",
    "decimals": 8
  },
  {
    "slug": "wec-energy-xstock",
    "name": "WEC Energy xStock",
    "symbol": "WECx",
    "underlyingTicker": "WEC",
    "mint": "Xsxq7WqXpiNFrdWSd6CA27LXmCsCrGyC9C3uaebmaqU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2593d340815b60e229f_WECx.png",
    "decimals": 8
  },
  {
    "slug": "wells-fargo-xstock",
    "name": "Wells Fargo xStock",
    "symbol": "WFCx",
    "underlyingTicker": "WFC",
    "mint": "XspHXejQ3A4VeimAqR1mAkvgTWgpmmoNR5CUhwCqzqr",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e198536f62aa99a89a94_WFCx.png",
    "decimals": 8
  },
  {
    "slug": "welltower-xstock",
    "name": "Welltower xStock",
    "symbol": "WELLx",
    "underlyingTicker": "WELL",
    "mint": "XsuKHFvcZLWvhk8XcprK4tiAZRefQ4nfTyNs6b9BArz",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1b10b02c72b786b9506_WELLx.png",
    "decimals": 8
  },
  {
    "slug": "wendys-xstock",
    "name": "Wendy's xStock",
    "symbol": "WENx",
    "underlyingTicker": "WEN",
    "mint": "Xs4uNhvBDAcp2mz3g9XR5q3vzLgmF1ANWxJgWk2d5u3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/68da38203936d726c61fd4b8_Ticker%3DWENx%2C%20Company%20Name%3DWendy%27s%20xStock%2C%20Size%3D32x32.svg",
    "decimals": 8
  },
  {
    "slug": "wesco-international-xstock",
    "name": "WESCO International xStock",
    "symbol": "WCCx",
    "underlyingTicker": "WCC",
    "mint": "Xspj4rFiCCXJyymfNgkwBG9AXZbyp69HGyHwfz6WHTE",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e836507d0c6e9abf51_WCCx.png",
    "decimals": 8
  },
  {
    "slug": "west-pharmaceutical-services-xstock",
    "name": "West Pharmaceutical Services xStock",
    "symbol": "WSTx",
    "underlyingTicker": "WST",
    "mint": "XsptQPquxvzKZ7pZTXNhvtXRxFP8vvC6BmS6QL1PALe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2aea75e19a321124831_WSTx.png",
    "decimals": 8
  },
  {
    "slug": "western-digital-xstock",
    "name": "Western Digital xStock",
    "symbol": "WDCx",
    "underlyingTicker": "WDC",
    "mint": "XsmopJuh6C6uNFJa3KaVoYqEtrf3Y7M5LYwRLKLER3h",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e19f0b02c72b786b8a8f_WDCx.png",
    "decimals": 8
  },
  {
    "slug": "westinghouse-air-brake-technologies-xstock",
    "name": "Westinghouse Air Brake Technologies xStock",
    "symbol": "WABx",
    "underlyingTicker": "WAB",
    "mint": "XsGFoZFgiRxDk49QCAQUArX84V88t7Bz3fsExp7HLuX",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e23cc8a1cd3be66f36fc_WABx.png",
    "decimals": 8
  },
  {
    "slug": "weyerhaeuser-xstock",
    "name": "Weyerhaeuser xStock",
    "symbol": "WYx",
    "underlyingTicker": "WY",
    "mint": "XsrTDXGz8cxi4s4vQrX63NhrtZZmPEFkgbsJQG7UERR",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e16ee5fff84d2ee46d_WYx.png",
    "decimals": 8
  },
  {
    "slug": "wh-xstock",
    "name": "WH xStock",
    "symbol": "WHGROx",
    "underlyingTicker": "WHGRO",
    "mint": "XsQDsbd6nqERiTZY2TkBheUG53QsewgCa2eaCSS4PYe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a0d6f5fed4ed2d189b7_WHGROx.png",
    "decimals": 8
  },
  {
    "slug": "wharf-real-estate-investment-xstock",
    "name": "Wharf Real Estate Investment xStock",
    "symbol": "WHRFRx",
    "underlyingTicker": "WHRFR",
    "mint": "XsXQY2nH5bKDLEHwigMzqnmicscdXei1MhduRZeF4F3",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a25dc9226b0bc91963b_WHRFRx.png",
    "decimals": 8
  },
  {
    "slug": "williams-companies-xstock",
    "name": "Williams Companies xStock",
    "symbol": "WMBx",
    "underlyingTicker": "WMB",
    "mint": "Xso4umc25VxszLT64SYNT7TMeZudAC75xwNo7qFjJFu",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e1d6b961d4173306f203_WMBx.png",
    "decimals": 8
  },
  {
    "slug": "williams-sonoma-xstock",
    "name": "Williams-Sonoma xStock",
    "symbol": "WSMx",
    "underlyingTicker": "WSM",
    "mint": "XsxjGDiXTcvRjbHgAkngyJgix766hJHKB3XLzNiRSro",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2939f3406f549c063b0_WSMx.png",
    "decimals": 8
  },
  {
    "slug": "woodward-xstock",
    "name": "Woodward xStock",
    "symbol": "WWDx",
    "underlyingTicker": "WWD",
    "mint": "Xs1xSyecLzT2u188qGFs1JTBXeE9RmBX1pc11o5X6U2",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2a9d09b3213b2db03cf_WWDx.png",
    "decimals": 8
  },
  {
    "slug": "workday-xstock",
    "name": "Workday xStock",
    "symbol": "WDAYx",
    "underlyingTicker": "WDAY",
    "mint": "XsDa7zkFPXdu1wz29JLEV2XtWvrLdb16s4yH1LcKQ5r",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2827cc5b77e68cdaadd_WDAYx.png",
    "decimals": 8
  },
  {
    "slug": "wuxi-biologics-xstock",
    "name": "WuXi Biologics xStock",
    "symbol": "WUXIBx",
    "underlyingTicker": "WUXIB",
    "mint": "Xsza1ZaAjp3SfM5ejn7BPdNCJePtSh7iLK58rqF4i1z",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099f7891d3d57311cd657_WUXIBx.png",
    "decimals": 8
  },
  {
    "slug": "wuxi-xdc-cayman-xstock",
    "name": "WuXi XDC Cayman xStock",
    "symbol": "WXXDCx",
    "underlyingTicker": "WXXDC",
    "mint": "XsakKPtdcDAk78qkX3vqdJucecauLw6tcL6BJhG5nA8",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a28de2d7051659ae034_WXXDCx.png",
    "decimals": 8
  },
  {
    "slug": "xcel-energy-xstock",
    "name": "Xcel Energy xStock",
    "symbol": "XELx",
    "underlyingTicker": "XEL",
    "mint": "Xsr6MgLKmoEmN4aL78MQ2q98R8wJnZ3FaCZUMwkNbNU",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e237be2927c9329fa2e4_XELx.png",
    "decimals": 8
  },
  {
    "slug": "xiaomi-xstock",
    "name": "Xiaomi xStock",
    "symbol": "XIAOx",
    "underlyingTicker": "XIAO",
    "mint": "XsvP4b65AoC8f2hEuXj3yAKzRCLtW4aCQupZcuK1vAe",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099ba5d95fd32a2be1629_XIAOx.png",
    "decimals": 8
  },
  {
    "slug": "xpo-xstock",
    "name": "XPO xStock",
    "symbol": "XPOx",
    "underlyingTicker": "XPO",
    "mint": "XsJF1CN5uFwF5eD7b8htZDeYzY9o4kdepkvBdsa32ZT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e29d1cd17aa2ee8309c6_XPOx.png",
    "decimals": 8
  },
  {
    "slug": "xylem-xstock",
    "name": "Xylem xStock",
    "symbol": "XYLx",
    "underlyingTicker": "XYL",
    "mint": "XsqFzD9CqfpnmTiFH631bcvQcDReVTMFZMSjk5aXQZL",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e286b961d41733077f5c_XYLx.png",
    "decimals": 8
  },
  {
    "slug": "yum-brands-xstock",
    "name": "Yum Brands xStock",
    "symbol": "YUMx",
    "underlyingTicker": "YUM",
    "mint": "XsNor8pbicnexAYvgvq3p8EXwyRj9UzjYu92ZnrJLqC",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e241a75e19a32111fade_YUMx.png",
    "decimals": 8
  },
  {
    "slug": "zebra-technologies-xstock",
    "name": "Zebra Technologies xStock",
    "symbol": "ZBRAx",
    "underlyingTicker": "ZBRA",
    "mint": "Xsxe5ypvCfynj9q9bJgB2Y88sZNCnxtEb9icgdbsPFT",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e33825a7f80a1d60fd93_ZBRAx.png",
    "decimals": 8
  },
  {
    "slug": "zhaojin-mining-industry-xstock",
    "name": "Zhaojin Mining Industry xStock",
    "symbol": "ZHAOMx",
    "underlyingTicker": "ZHAOM",
    "mint": "XsPRsZhqX1Ef1n7bwLtyA6hZPP96Gp99H11MHHA9UQ5",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a709a32bbbdc8cd7f904b3f_ZHAOMx.png",
    "decimals": 8
  },
  {
    "slug": "zijin-gold-international-xstock",
    "name": "Zijin Gold International xStock",
    "symbol": "ZJGLDx",
    "underlyingTicker": "ZJGLD",
    "mint": "Xs64245JybP9rgXJZJZcxKKRwqJnRpGKzoKtVNcyhoS",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7099dd071779fc9537d8a0_ZJGLDx.png",
    "decimals": 8
  },
  {
    "slug": "zimmer-biomet-xstock",
    "name": "Zimmer Biomet xStock",
    "symbol": "ZBHx",
    "underlyingTicker": "ZBH",
    "mint": "XsE48wmot6dKRcCGVQUXFSrpnRZ4U4yC762ZktjkoGW",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e2e22421b195884d5258_ZBHx.png",
    "decimals": 8
  },
  {
    "slug": "zoetis-xstock",
    "name": "Zoetis xStock",
    "symbol": "ZTSx",
    "underlyingTicker": "ZTS",
    "mint": "XsRPgsEQ3dFR84DhMv18jtob5D77FivAsTTsv1jCYmv",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e25ff7bf3b5638343bf5_ZTSx.png",
    "decimals": 8
  },
  {
    "slug": "zoom-communications-xstock",
    "name": "Zoom Communications xStock",
    "symbol": "ZMx",
    "underlyingTicker": "ZM",
    "mint": "XsgDPEr2Zk1YkWnw1Mm77APoZpeTj8BQZeGSMVtBZGd",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e29a4f11a0bdd7098ff7_ZMx.png",
    "decimals": 8
  },
  {
    "slug": "zscaler-xstock",
    "name": "Zscaler xStock",
    "symbol": "ZSx",
    "underlyingTicker": "ZS",
    "mint": "Xsb1a2VbaT6rLLq48qcgMQ1iPbs5fW2JZZURBxKfhY6",
    "iconUrl": "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a58e32bf6cce9266a58180d_ZSx.png",
    "decimals": 8
  }
];

const SOLANA_TICKER_MAP = new Map<string, SolanaTokenInfo>();
for (const stock of ALL_SOLANA_XSTOCKS) {
  SOLANA_TICKER_MAP.set(stock.symbol.toUpperCase(), stock);
  if (stock.underlyingTicker) {
    SOLANA_TICKER_MAP.set(stock.underlyingTicker.toUpperCase(), stock);
  }
}

const SOLANA_COMMON_ALIASES: Record<string, string> = {
  APPLE: "AAPLx",
  AAPL: "AAPLx",
  TESLA: "TSLAx",
  TSLA: "TSLAx",
  NVIDIA: "NVDAx",
  NVDA: "NVDAx",
  GOOGLE: "GOOGLx",
  GOOG: "GOOGLx",
  GOOGL: "GOOGLx",
  ALPHABET: "GOOGLx",
  AMAZON: "AMZNx",
  AMZN: "AMZNx",
  MICROSOFT: "MSFTx",
  MSFT: "MSFTx",
  FACEBOOK: "METAx",
  META: "METAx",
  COINBASE: "COINx",
  COIN: "COINx",
  SPACEX: "SPYx",
  SP500: "SPYx",
  SPY: "SPYx",
  NASDAQ: "QQQx",
  QQQ: "QQQx",
  PALANTIR: "PLTRx",
  PLTR: "PLTRx",
  AMD: "AMDx",
  NETFLIX: "NFLXx",
  NFLX: "NFLXx",
};

export function findSolanaToken(symbolOrTicker: string): SolanaTokenInfo | undefined {
  const upper = symbolOrTicker.trim().toUpperCase();
  if (upper === "SOL") return SOL;
  if (upper === "USDC") return USDC;

  const resolvedSymbol = SOLANA_COMMON_ALIASES[upper] ?? upper;
  return SOLANA_TICKER_MAP.get(resolvedSymbol) ?? SOLANA_TICKER_MAP.get(upper);
}

export function resolveSolanaToken(input: string): SolanaTokenInfo | undefined {
  const trimmed = input.trim();
  const bySymbol = findSolanaToken(trimmed);
  if (bySymbol) return bySymbol;

  return ALL_SOLANA_XSTOCKS.find((t) => t.mint === trimmed);
}
