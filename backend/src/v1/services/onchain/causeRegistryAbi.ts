// Mirrors contracts/src/CauseRegistry.sol -- keep in sync when the contract changes.
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
  {
    type: "function",
    name: "getCause",
    stateMutability: "view",
    inputs: [{ name: "causeId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "organizer", type: "address" },
          { name: "token", type: "address" },
          { name: "goal", type: "uint256" },
          { name: "totalRaised", type: "uint256" },
          { name: "totalWithdrawn", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "donorTotal",
    stateMutability: "view",
    inputs: [
      { name: "causeId", type: "uint256" },
      { name: "donor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "causeCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "CauseCreated",
    inputs: [
      { name: "causeId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "organizer", type: "address", indexed: true },
      { name: "goal", type: "uint256", indexed: false },
      { name: "token", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Donated",
    inputs: [
      { name: "causeId", type: "uint256", indexed: true },
      { name: "donor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newTotalRaised", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "causeId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "proofUrl", type: "string", indexed: false },
      { name: "remainingBalance", type: "uint256", indexed: false },
    ],
  },
] as const;
