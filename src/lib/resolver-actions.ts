import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  erc20Abi,
  keccak256,
  parseEther,
  stringToBytes,
  zeroAddress,
  zeroHash,
  type Hash,
} from "viem";
import {
  connect,
  getAccount,
  getConnectors,
  readContract,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { RESOLVER_ADDRESS, resolverAbi, robinhoodChain } from "./chain";
import { normalizeHashtag, confirmTransaction } from "./tagio";
import { wagmiConfig } from "./wagmi";

/** Connects the injected wallet if needed and makes sure it's on Robinhood Chain. */
export async function ensureWallet(): Promise<`0x${string}`> {
  let account = getAccount(wagmiConfig);
  if (!account.isConnected) {
    // RainbowKit registers WalletConnect-based connectors too; only an injected
    // (browser-extension) one can be connected without going through the modal.
    const connectors = getConnectors(wagmiConfig);
    const connector = connectors.find((c) => c.type === "injected") ?? connectors[0];
    if (!connector)
      throw new Error("No wallet found — use the Connect wallet button first");
    await connect(wagmiConfig, { connector });
    account = getAccount(wagmiConfig);
  }
  if (!account.address) throw new Error("Wallet connection failed");
  if (account.chainId !== robinhoodChain.id) {
    await switchChain(wagmiConfig, { chainId: robinhoodChain.id });
  }
  return account.address;
}

async function readResolver<T>(functionName: "settlementToken" | "registrationFee" | "renewalFee") {
  return (await readContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName,
  })) as T;
}

/**
 * Fees are denominated in whatever `settlementToken` currently is: address(0) means
 * native ETH sent as msg.value; a real ERC-20 means approve + zero msg.value.
 * Returns the msg.value to attach to the payable call.
 */
async function prepareFee(
  owner: `0x${string}`,
  feeKind: "registrationFee" | "renewalFee",
): Promise<bigint> {
  const [token, fee] = await Promise.all([
    readResolver<`0x${string}`>("settlementToken"),
    readResolver<bigint>(feeKind),
  ]);
  if (fee === 0n) return 0n;
  if (token === zeroAddress) return fee;

  const allowance = await readContract(wagmiConfig, {
    abi: erc20Abi,
    address: token,
    functionName: "allowance",
    args: [owner, RESOLVER_ADDRESS],
  });
  if (allowance < fee) {
    const approveHash = await writeContract(wagmiConfig, {
      abi: erc20Abi,
      address: token,
      functionName: "approve",
      args: [RESOLVER_ADDRESS, fee],
      chainId: robinhoodChain.id,
    });
    await waitForReceiptOrThrow(approveHash);
  }
  return 0n;
}

async function waitForReceiptOrThrow(hash: Hash) {
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId: robinhoodChain.id,
  });
  if (receipt.status !== "success") {
    throw new Error("Transaction reverted onchain");
  }
  return receipt;
}

/** Sends the tx hash to the backend so it decodes events and syncs Postgres. */
async function syncWithBackend(hash: Hash, hashtag: string) {
  try {
    await confirmTransaction({ data: { txHash: hash, hashtag } });
  } catch {
    // The onchain action already succeeded; indexing can be retried from the
    // record page's "Sync a transaction" form.
  }
}

export async function registerOnchain(input: {
  hashtag: string;
  name?: string;
  recoveryPhrase?: string;
}): Promise<Hash> {
  const hashtag = normalizeHashtag(input.hashtag);
  const owner = await ensureWallet();
  const value = await prepareFee(owner, "registrationFee");
  const hash = await writeContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName: "registerHashtag",
    args: [
      hashtag,
      input.name ?? hashtag,
      "",
      "",
      [],
      input.recoveryPhrase ? keccak256(stringToBytes(input.recoveryPhrase)) : zeroHash,
    ],
    value,
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  await syncWithBackend(hash, hashtag);
  return hash;
}

export async function renewOnchain(input: { hashtag: string }): Promise<Hash> {
  const hashtag = normalizeHashtag(input.hashtag);
  const owner = await ensureWallet();
  const value = await prepareFee(owner, "renewalFee");
  const hash = await writeContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName: "renewSubscription",
    args: [hashtag],
    value,
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  await syncWithBackend(hash, hashtag);
  return hash;
}

/** Native payment — receivePayment is always available regardless of settlementToken. */
export async function payOnchain(input: {
  hashtag: string;
  amountEth: string;
}): Promise<Hash> {
  const hashtag = normalizeHashtag(input.hashtag);
  await ensureWallet();
  const hash = await writeContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName: "receivePayment",
    args: [hashtag],
    value: parseEther(input.amountEth),
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  await syncWithBackend(hash, hashtag);
  return hash;
}

/** Rewrites the payout split table onchain. Splits must sum to exactly 10000 bps. */
export async function updatePayoutsOnchain(input: {
  hashtag: string;
  payouts: { wallet: string; percentageBps: number }[];
}): Promise<Hash> {
  const hashtag = normalizeHashtag(input.hashtag);
  await ensureWallet();
  const hash = await writeContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName: "updatePayouts",
    args: [
      hashtag,
      input.payouts.map((p) => ({
        wallet: p.wallet as `0x${string}`,
        percentageBps: p.percentageBps,
      })),
    ],
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  await syncWithBackend(hash, hashtag);
  return hash;
}

export async function updateMetadataOnchain(input: {
  hashtag: string;
  name: string;
  imageUrl: string;
  websiteUrl: string;
  socials: { key: string; value: string }[];
}): Promise<Hash> {
  const hashtag = normalizeHashtag(input.hashtag);
  await ensureWallet();
  const hash = await writeContract(wagmiConfig, {
    abi: resolverAbi,
    address: RESOLVER_ADDRESS,
    functionName: "updateMetadata",
    args: [hashtag, input.name, input.imageUrl, input.websiteUrl, input.socials],
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  await syncWithBackend(hash, hashtag);
  return hash;
}

/**
 * Signs and broadcasts an already-built unsigned transaction -- e.g. one the
 * X bot created after a "send X to Y" mention/DM. Plain to/data/value, no ABI
 * needed since the calldata was already encoded server-side (see
 * FRONTEND-INTEGRATION.md's pending-transactions section).
 */
export async function signPendingTransaction(input: {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
}): Promise<Hash> {
  await ensureWallet();
  const hash = await sendTransaction(wagmiConfig, {
    to: input.to,
    data: input.data,
    value: BigInt(input.value || "0"),
    chainId: robinhoodChain.id,
  });
  await waitForReceiptOrThrow(hash);
  return hash;
}

const REVERT_MESSAGES: Record<string, string> = {
  HashtagAlreadyExists: "That hashtag is already registered and active",
  InvalidHashtag: "Invalid hashtag — 3–32 lowercase letters, numbers, or underscores",
  HashtagNotFound: "That hashtag isn't registered",
  NotOwner: "Your wallet doesn't own this hashtag",
  SubscriptionExpired: "Subscription expired — this hashtag can't accept payments",
  EnforcedPause: "Payments are temporarily paused by TagioPay — try again later",
  IncorrectNativeFee: "Fee mismatch — the registration fee changed, try again",
  UnexpectedNativeValue: "Fee is paid in tokens — don't send ETH with this call",
  SettlementTokenNotSet: "Token payments aren't enabled yet — pay in native ETH",
  ZeroAmount: "Amount must be greater than zero",
  FeeTransferFailed: "Fee payment failed",
  PaymentFailed: "Payment transfer failed",
  TokenDistributionFailed: "Split distribution failed",
};

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const rejected = err.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return "Transaction rejected in wallet";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      if (name) return `Contract reverted: ${name}`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong — try again";
}
