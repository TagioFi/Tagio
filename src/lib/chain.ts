import { defineChain } from "viem";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
});

export const RESOLVER_ADDRESS = "0x1326bBA97a060b6c4B445E0dD83342203795725E" as const;
export const HASHTAG_NFT_ADDRESS = "0x364469b9709D7E0E2bf6a049Aca3a8B436FbcEa3" as const;

// Mirrors contracts/src/HashtagResolver.sol — the subset the frontend calls, plus
// custom errors so viem can decode reverts into readable names.
export const resolverAbi = [
  {
    type: "function",
    name: "settlementToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "registrationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "renewalFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "hashtag", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hashtagOwner",
    stateMutability: "view",
    inputs: [{ name: "hashtag", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "registerHashtag",
    stateMutability: "payable",
    inputs: [
      { name: "hashtag", type: "string" },
      { name: "name", type: "string" },
      { name: "imageUrl", type: "string" },
      { name: "websiteUrl", type: "string" },
      {
        name: "socials",
        type: "tuple[]",
        components: [
          { name: "key", type: "string" },
          { name: "value", type: "string" },
        ],
      },
      { name: "recoveryHash", type: "bytes32" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "renewSubscription",
    stateMutability: "payable",
    inputs: [{ name: "hashtag", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "receivePayment",
    stateMutability: "payable",
    inputs: [{ name: "hashtag", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "receiveTokenPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hashtag", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updatePayouts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hashtag", type: "string" },
      {
        name: "newPayouts",
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "percentageBps", type: "uint16" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hashtag", type: "string" },
      { name: "name", type: "string" },
      { name: "imageUrl", type: "string" },
      { name: "websiteUrl", type: "string" },
      {
        name: "socials",
        type: "tuple[]",
        components: [
          { name: "key", type: "string" },
          { name: "value", type: "string" },
        ],
      },
    ],
    outputs: [],
  },
  { type: "error", name: "InvalidHashtag", inputs: [] },
  { type: "error", name: "HashtagAlreadyExists", inputs: [] },
  { type: "error", name: "HashtagNotFound", inputs: [] },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "SubscriptionExpired", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "PaymentFailed", inputs: [] },
  { type: "error", name: "TokenDistributionFailed", inputs: [] },
  { type: "error", name: "FeeTransferFailed", inputs: [] },
  { type: "error", name: "SettlementTokenNotSet", inputs: [] },
  { type: "error", name: "IncorrectNativeFee", inputs: [] },
  { type: "error", name: "UnexpectedNativeValue", inputs: [] },
  { type: "error", name: "InvalidPercentageSum", inputs: [] },
  { type: "error", name: "NoPayouts", inputs: [] },
  { type: "error", name: "TooManyPayouts", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
] as const;
