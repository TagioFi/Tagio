// Mirrors contracts/src/HashtagResolver.sol — keep in sync when the contract changes.
export const hashtagResolverAbi = [
  {
    type: "function",
    name: "getAccount",
    stateMutability: "view",
    inputs: [{ name: "hashtag", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
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
          { name: "registeredAt", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "nftTokenId", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "recoveryHash", type: "bytes32" },
          { name: "totalVolume", type: "uint64" },
          {
            name: "payouts",
            type: "tuple[]",
            components: [
              { name: "wallet", type: "address" },
              { name: "percentageBps", type: "uint16" },
            ],
          },
        ],
      },
    ],
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
    name: "isValidHashtag",
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
    type: "event",
    name: "HashtagRegistered",
    inputs: [
      { name: "hashtag", type: "string", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "registrant", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PayoutsUpdated",
    inputs: [
      { name: "hashtag", type: "string", indexed: true },
      {
        name: "newPayouts",
        type: "tuple[]",
        indexed: false,
        components: [
          { name: "wallet", type: "address" },
          { name: "percentageBps", type: "uint16" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "PaymentReceived",
    inputs: [
      { name: "hashtag", type: "string", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "isNative", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MetadataUpdated",
    inputs: [{ name: "hashtag", type: "string", indexed: true }],
  },
  {
    type: "event",
    name: "SubscriptionRenewed",
    inputs: [
      { name: "hashtag", type: "string", indexed: true },
      { name: "newExpiry", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "HashtagTransferred",
    inputs: [
      { name: "hashtag", type: "string", indexed: true },
      { name: "oldOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;
