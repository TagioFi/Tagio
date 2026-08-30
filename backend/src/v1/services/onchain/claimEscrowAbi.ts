// Mirrors contracts/src/ClaimEscrow.sol -- keep in sync when the contract changes.
export const claimEscrowAbi = [
  {
    type: "function",
    name: "depositNative",
    stateMutability: "payable",
    inputs: [{ name: "xUserIdHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "depositToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "xUserIdHash", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimNative",
    stateMutability: "nonpayable",
    inputs: [
      { name: "xUserIdHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "xUserIdHash", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
