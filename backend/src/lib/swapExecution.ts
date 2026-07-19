import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type PublicClient,
} from "viem";
import { config } from "../config";
import { getPublicClient } from "../services/onchain/client";
import { resolveToken } from "./rwaTokens";
import { encodeWethPath, quoteSwap, type SwapQuote, type SwapRouting } from "./uniswapV3";

// Non-custodial by design: this module only ever builds unsigned transaction
// calldata. The user's own wallet signs and broadcasts it -- this backend
// never holds a private key or submits a transaction on anyone's behalf.
export interface UnsignedTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
}

export interface SwapPlan {
  // v3 needs at most one (approve the token to SwapRouter02); v4 needs up to
  // two (approve Permit2, then approve Universal Router within Permit2) the
  // first time a wallet swaps a given token.
  approvals: UnsignedTx[];
  swap: UnsignedTx;
  quote: SwapQuote;
  // fromSymbol's amount, in its own base units -- distinct from swap.value,
  // which is only the native-ETH msg.value and is "0" for an ERC20-in swap.
  amountInBaseUnits: string;
}

// A flat 1% tolerance works fine for the deep, canonical ETH<->USDG pool,
// but thin RWA-token pools (confirmed low v3 liquidity for several stock
// tickers) can move more than that between quoting and the swap actually
// landing on-chain -- worse for v4 plans, which need 0-2 approval txs to
// confirm first, widening the window. Scale the tolerance with the quote's
// own measured price impact instead of one number for every pair: a deep
// pool with ~0% impact still gets the tight 1% floor; a pool already
// showing meaningful impact gets proportionally more room, capped so a
// truly illiquid pool still fails closed rather than accepting an
// arbitrarily bad fill.
const MIN_SLIPPAGE_BPS = 100n; // 1%
const MAX_SLIPPAGE_BPS = 500n; // 5% ceiling
function slippageBpsFor(quote: SwapQuote): bigint {
  const impactBps = BigInt(Math.max(0, Math.round(quote.priceImpactPct * 100)));
  const scaled = MIN_SLIPPAGE_BPS + impactBps * 2n;
  return scaled > MAX_SLIPPAGE_BPS ? MAX_SLIPPAGE_BPS : scaled;
}

const MULTICALL_DEADLINE_SECONDS = 1200; // 20 minutes, matches Uniswap's own frontend

// Sentinel recipient address from Uniswap/swap-router-contracts'
// libraries/Constants.sol. Passing this as `recipient` keeps swap output in
// the router itself so a follow-up call (unwrapWETH9) can act on it.
// Getting this wrong would strand real funds in the router contract.
const ADDRESS_THIS_SENTINEL = "0x0000000000000000000000000000000000000002" as const;

const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "exactInput",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "unwrapWETH9",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "refundETH",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

async function buildApprovalIfNeeded(
  client: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  amountNeeded: bigint,
): Promise<UnsignedTx | null> {
  const currentAllowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, config.uniswap.v3SwapRouterAddress],
  });
  if (currentAllowance >= amountNeeded) return null;

  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [config.uniswap.v3SwapRouterAddress, amountNeeded],
    }),
    value: "0",
    chainId: config.robinhood.chainId,
  };
}

// v4 swaps go through Universal Router, which pulls funds via Permit2 rather
// than a direct ERC20 allowance to the router itself. Both are plain
// transactions, not an EIP-712 signature -- Permit2's on-chain
// AllowanceTransfer.approve, not Permit2's signature-based flow.
const PERMIT2_EXPIRATION_SECONDS = 1200; // 20 minutes, matches the v3 multicall deadline

const PERMIT2_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

async function buildV4Approvals(
  client: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  amountNeeded: bigint,
): Promise<UnsignedTx[]> {
  const approvals: UnsignedTx[] = [];

  const erc20Allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, config.uniswap.permit2Address],
  });
  if (erc20Allowance < amountNeeded) {
    approvals.push({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [config.uniswap.permit2Address, amountNeeded],
      }),
      value: "0",
      chainId: config.robinhood.chainId,
    });
  }

  const [permit2Amount, permit2Expiration] = await client.readContract({
    address: config.uniswap.permit2Address,
    abi: PERMIT2_ABI,
    functionName: "allowance",
    args: [owner, token, config.uniswap.universalRouterAddress],
  });
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (permit2Amount < amountNeeded || permit2Expiration < nowSeconds) {
    approvals.push({
      to: config.uniswap.permit2Address,
      data: encodeFunctionData({
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [token, config.uniswap.universalRouterAddress, amountNeeded, nowSeconds + PERMIT2_EXPIRATION_SECONDS],
      }),
      value: "0",
      chainId: config.robinhood.chainId,
    });
  }

  return approvals;
}

const UNIVERSAL_ROUTER_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const V4_SWAP_COMMAND = "0x10" as const;
const V4_SWAP_DEADLINE_SECONDS = 1200;

// Actions.SWAP_EXACT_IN_SINGLE, Actions.SETTLE_ALL, Actions.TAKE_ALL.
function encodeV4Actions(): `0x${string}` {
  return "0x060c0f";
}

function buildV4SwapTx(
  routing: Extract<SwapRouting, { type: "v4" }>,
  amountInWei: bigint,
  amountOutMinimum: bigint,
): UnsignedTx {
  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "minHopPriceX36", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [
      {
        poolKey: routing.poolKey,
        zeroForOne: routing.zeroForOne,
        amountIn: amountInWei,
        amountOutMinimum,
        minHopPriceX36: 0n,
        hookData: "0x",
      },
    ],
  );

  const currencyIn = routing.zeroForOne ? routing.poolKey.currency0 : routing.poolKey.currency1;
  const currencyOut = routing.zeroForOne ? routing.poolKey.currency1 : routing.poolKey.currency0;
  const settleParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyIn, amountInWei],
  );
  const takeParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyOut, amountOutMinimum],
  );

  // BaseActionsRouter._unlockCallback expects abi.decode(data, (bytes
  // actions, bytes[] params)) as the single input entry for the V4_SWAP
  // command.
  const v4SwapInput = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [encodeV4Actions(), [swapParams, settleParams, takeParams]],
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + V4_SWAP_DEADLINE_SECONDS);

  return {
    to: config.uniswap.universalRouterAddress,
    data: encodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: "execute",
      args: [V4_SWAP_COMMAND, [v4SwapInput], deadline],
    }),
    value: "0",
    chainId: config.robinhood.chainId,
  };
}

// Always re-quotes internally rather than accepting a caller-supplied quote
// -- a plan built from a stale preview is exactly the kind of gap that lets
// a thin-pool swap's minimum-out fall out of date before it's even signed.
export async function planSwap(
  fromSymbol: string,
  toSymbol: string,
  amountIn: number,
  recipient: `0x${string}`,
): Promise<SwapPlan | null> {
  const [tokenIn, tokenOut] = await Promise.all([resolveToken(fromSymbol), resolveToken(toSymbol)]);
  if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) return null;

  const quote = await quoteSwap(fromSymbol, toSymbol, amountIn);
  if (!quote) return null;

  const client = getPublicClient();
  const decimalsIn = tokenIn.native
    ? 18
    : await client.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "decimals" });

  const amountInWei = parseUnits(amountIn.toString(), decimalsIn);
  const amountOutMinimum = (quote.amountOutWei * (10000n - slippageBpsFor(quote))) / 10000n;

  if (quote.routing.type === "v4") {
    // Never native ETH here -- quoteSwap only considers v4 for plain ERC20
    // pairs (see the skipV4 guard in uniswapV3.ts).
    const approvals = await buildV4Approvals(client, tokenIn.address, recipient, amountInWei);
    return {
      approvals,
      swap: buildV4SwapTx(quote.routing, amountInWei, amountOutMinimum),
      quote,
      amountInBaseUnits: amountInWei.toString(),
    };
  }

  // The swap step's own recipient must be the router itself (ADDRESS_THIS)
  // when the output needs unwrapping to native ETH afterward -- it can't go
  // straight to the user, or unwrapWETH9 would have nothing to act on.
  const swapRecipient = tokenOut.native ? ADDRESS_THIS_SENTINEL : recipient;

  const swapCall =
    quote.routing.type === "direct"
      ? encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              fee: quote.routing.fee,
              recipient: swapRecipient,
              amountIn: amountInWei,
              amountOutMinimum,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })
      : encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInput",
          args: [
            {
              path: encodeWethPath(tokenIn.address, quote.routing.feeIn, tokenOut.address, quote.routing.feeOut),
              recipient: swapRecipient,
              amountIn: amountInWei,
              amountOutMinimum,
            },
          ],
        });

  let swapData: `0x${string}` = swapCall;
  let value = "0";
  let approval: UnsignedTx | null = null;

  if (tokenIn.native) {
    // ETH in: no approval (paid via tx value, not ERC20 transferFrom).
    // Bundle swap + refundETH atomically so any rounding dust comes back.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + MULTICALL_DEADLINE_SECONDS);
    const refundCall = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: "refundETH", args: [] });
    swapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "multicall",
      args: [deadline, [swapCall, refundCall]],
    });
    value = amountInWei.toString();
  } else if (tokenOut.native) {
    // ETH out: swap output is held by the router (see swapRecipient above),
    // then unwrapped and sent to the real recipient in the same transaction.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + MULTICALL_DEADLINE_SECONDS);
    const unwrapCall = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "unwrapWETH9",
      args: [amountOutMinimum, recipient],
    });
    swapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "multicall",
      args: [deadline, [swapCall, unwrapCall]],
    });
    approval = await buildApprovalIfNeeded(client, tokenIn.address, recipient, amountInWei);
  } else {
    approval = await buildApprovalIfNeeded(client, tokenIn.address, recipient, amountInWei);
  }

  return {
    approvals: approval ? [approval] : [],
    swap: { to: config.uniswap.v3SwapRouterAddress, data: swapData, value, chainId: config.robinhood.chainId },
    quote,
    amountInBaseUnits: amountInWei.toString(),
  };
}
