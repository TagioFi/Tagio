// Mirrors contracts/src/PrivateSendPool.sol -- keep in sync when the contract changes.
export const privateSendPoolAbi = [
  {
    type: "function",
    name: "send",
    stateMutability: "payable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "keeperFeeWei", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sendToken",
    stateMutability: "payable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "keeperFeeWei", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAllocation",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "keeperFeeWei", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "Sent",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "keeperFeeWei", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "claimer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "keeperFeeWei", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "AlreadyExists", inputs: [] },
  { type: "error", name: "NotFound", inputs: [] },
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "InvalidSecret", inputs: [] },
  { type: "error", name: "IncorrectNativeValue", inputs: [] },
  { type: "error", name: "NativeTransferFailed", inputs: [] },
] as const;
