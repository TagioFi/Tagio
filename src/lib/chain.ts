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
export const CAUSE_REGISTRY_ADDRESS = "0x06Ea330d1bC7bBEfA79F187E439fc51155A0e568" as const;
export const SIMPLE_ESCROW_ADDRESS = "0xCDE4885F1b10dAFaF6ac85281BCD0E43Db73Fd90" as const;
export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const USDG_DECIMALS = 6;

// Mirrors the Status enum in SimpleEscrow.sol.
export const ESCROW_STATUS = ["None", "Created", "Accepted", "Delivered", "Released", "Cancelled"] as const;

// Mirrors contracts/src/CauseRegistry.sol.
export const causeRegistryAbi = [
  {
    type: "function",
    name: "createCause",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "organizer", type: "address" },
      { name: "goal", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "causeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "donate",
    stateMutability: "payable",
    inputs: [
      { name: "causeId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "causeId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "proofUrl", type: "string" },
    ],
    outputs: [],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "EmptyName", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "CauseNotFound", inputs: [] },
  { type: "error", name: "NotOrganizer", inputs: [] },
  { type: "error", name: "IncorrectNativeValue", inputs: [] },
  { type: "error", name: "UnexpectedNativeValue", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
] as const;

// Mirrors contracts/src/SimpleEscrow.sol.
export const simpleEscrowAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "payable",
    inputs: [
      { name: "counterparty", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "token", type: "address" },
      { name: "description", type: "string" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getEscrow",
    stateMutability: "view",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "description", type: "string" },
          { name: "status", type: "uint8" },
          { name: "deliverDeadline", type: "uint256" },
          { name: "releaseDeadline", type: "uint256" },
          { name: "proofUrl", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "accept",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelBeforeAccept",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deliver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      { name: "proofUrl", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundAfterDeliverDeadline",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "forceRelease",
    stateMutability: "nonpayable",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "EscrowNotFound", inputs: [] },
  { type: "error", name: "NotCreator", inputs: [] },
  { type: "error", name: "NotCounterparty", inputs: [] },
  { type: "error", name: "WrongStatus", inputs: [] },
  { type: "error", name: "DeliverDeadlineNotPassed", inputs: [] },
  { type: "error", name: "ReleaseDeadlineNotPassed", inputs: [] },
  { type: "error", name: "IncorrectNativeValue", inputs: [] },
  { type: "error", name: "UnexpectedNativeValue", inputs: [] },
  { type: "error", name: "NativeTransferFailed", inputs: [] },
] as const;

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
