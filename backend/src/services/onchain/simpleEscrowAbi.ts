// Mirrors contracts/src/SimpleEscrow.sol -- keep in sync when the contract changes.
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
    name: "escrowCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "counterparty", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "description", type: "string", indexed: false },
    ],
  },
] as const;

// Mirrors the Status enum in SimpleEscrow.sol.
export const ESCROW_STATUS = ["None", "Created", "Accepted", "Delivered", "Released", "Cancelled"] as const;
