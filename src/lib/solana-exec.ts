/**
 * Solana execution layer — the "Executed on Solana" half of the spec.
 *
 * Two execution paths live here, matching the spec's Core Architectural
 * Execution Matrix (section 3):
 *
 *   1. Pure Solana  — native SOL / SPL transfers, no bridge and no Relay fee
 *      (matrix rows 1 and 2).
 *   2. Relay intent — deserialize the Solana instructions a Relay quote hands
 *      back, sign them with the connected wallet, then poll the intent to
 *      settlement on Robinhood Chain (matrix rows 3-10).
 *
 * SPL instructions are hand-encoded rather than pulled from @solana/spl-token:
 * that package isn't installed and `bun install` currently aborts in this repo
 * (utf-8-validate), so adding it is a build risk. The two instructions needed
 * (TransferChecked, idempotent ATA create) are small and stable.
 */
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { getRelayIntentStatus, type RelayInstructionJson, type RelayStep } from "./tagio";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Minimal shape of the wallet-adapter context this module needs. */
export interface SolanaSigner {
  publicKey: PublicKey | null;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  sendTransaction: (
    tx: VersionedTransaction,
    connection: Connection,
    options?: { skipPreflight?: boolean },
  ) => Promise<string>;
}

/* ------------------------------------------------------------------ */
/* base-unit helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Decimal string -> integer base units, without going through a float.
 * `parseFloat(amount) * 10 ** decimals` loses precision at 9 decimals (SOL),
 * which is exactly where an off-by-a-few-lamports rounding error would land.
 */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const raw = String(amount).trim();
  if (!/^\d*(\.\d*)?$/.test(raw) || raw === "" || raw === ".") {
    throw new Error("Enter a valid amount");
  }
  const [whole, frac = ""] = raw.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function fromBaseUnits(base: string | bigint, decimals: number): string {
  const v = BigInt(base);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return (neg ? "-" : "") + whole + (frac ? "." + frac : "");
}

/* ------------------------------------------------------------------ */
/* SPL token plumbing                                                  */
/* ------------------------------------------------------------------ */

/** Which token program owns this mint — classic SPL or Token-2022 (xStocks). */
export async function getMintProgramId(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** SPL Token `TransferChecked` (instruction 12). */
export function createTransferCheckedInstruction(args: {
  source: PublicKey;
  mint: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  amount: bigint;
  decimals: number;
  programId: PublicKey;
}): TransactionInstruction {
  const data = new Uint8Array(10);
  data[0] = 12;
  data.set(u64le(args.amount), 1);
  data[9] = args.decimals;

  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.source, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: args.owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Associated Token Account `CreateIdempotent` (instruction 1). Idempotent so a
 * recipient who already has the ATA doesn't turn the send into a failure.
 */
export function createAssociatedTokenAccountIdempotentInstruction(args: {
  payer: PublicKey;
  ata: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  programId: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: args.ata, isSigner: false, isWritable: true },
      { pubkey: args.owner, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: args.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/* ------------------------------------------------------------------ */
/* transaction assembly + send                                         */
/* ------------------------------------------------------------------ */

async function loadLookupTables(
  connection: Connection,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  const accounts = await Promise.all(
    addresses.map((a) =>
      connection
        .getAddressLookupTable(new PublicKey(a))
        .then((r) => r.value)
        .catch(() => null),
    ),
  );
  return accounts.filter((a): a is AddressLookupTableAccount => a !== null);
}

/**
 * Builds a v0 transaction, has the wallet sign and send it, then waits for
 * confirmation. Throws on an on-chain failure so a reverted transaction can
 * never be reported to the user as a success.
 */
export async function sendInstructions(
  connection: Connection,
  wallet: SolanaSigner,
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[] = [],
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect a Solana wallet first");

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables);

  const signature = await wallet.sendTransaction(new VersionedTransaction(message), connection);

  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new Error("Transaction failed on Solana: " + JSON.stringify(result.value.err));
  }
  return signature;
}

/* ------------------------------------------------------------------ */
/* matrix row 1 — direct send (pure Solana, no Relay fee)              */
/* ------------------------------------------------------------------ */

export async function sendNativeSol(
  connection: Connection,
  wallet: SolanaSigner,
  recipient: string,
  amount: string,
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect a Solana wallet first");
  const lamports = toBaseUnits(amount, 9);
  if (lamports <= 0n) throw new Error("Amount must be greater than zero");

  return sendInstructions(connection, wallet, [
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(recipient),
      lamports,
    }),
  ]);
}

export async function sendSplToken(
  connection: Connection,
  wallet: SolanaSigner,
  args: { recipient: string; mint: string; amount: string; decimals: number },
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect a Solana wallet first");
  const amount = toBaseUnits(args.amount, args.decimals);
  if (amount <= 0n) throw new Error("Amount must be greater than zero");

  const mint = new PublicKey(args.mint);
  const owner = new PublicKey(args.recipient);
  const programId = await getMintProgramId(connection, mint);

  const source = getAssociatedTokenAddress(mint, wallet.publicKey, programId);
  const destination = getAssociatedTokenAddress(mint, owner, programId);

  const instructions: TransactionInstruction[] = [];
  // A recipient who has never held this mint has no token account yet; without
  // this the transfer just fails with an unhelpful "invalid account" error.
  const destInfo = await connection.getAccountInfo(destination);
  if (!destInfo) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction({
        payer: wallet.publicKey,
        ata: destination,
        owner,
        mint,
        programId,
      }),
    );
  }

  instructions.push(
    createTransferCheckedInstruction({
      source,
      mint,
      destination,
      owner: wallet.publicKey,
      amount,
      decimals: args.decimals,
      programId,
    }),
  );

  return sendInstructions(connection, wallet, instructions);
}

/* ------------------------------------------------------------------ */
/* matrix rows 3-10 — Relay intents                                    */
/* ------------------------------------------------------------------ */

/**
 * Relay returns instruction `data` as base64 in the SVM step payload, but has
 * also been observed handing back hex and a plain byte array. Accept all three
 * rather than silently mis-decoding one of them into garbage calldata.
 */
function decodeInstructionData(data: string | number[]): Buffer {
  if (Array.isArray(data)) return Buffer.from(data);
  const trimmed = data.trim();
  if (/^0x[0-9a-fA-F]*$/.test(trimmed)) return Buffer.from(trimmed.slice(2), "hex");
  return Buffer.from(trimmed, "base64");
}

function toTransactionInstruction(ix: RelayInstructionJson): TransactionInstruction {
  const keys = ix.keys ?? ix.accounts ?? [];
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: Boolean(k.isSigner),
      isWritable: Boolean(k.isWritable),
    })),
    data: decodeInstructionData(ix.data),
  });
}

export interface RelayQuoteLike {
  requestId?: string;
  steps?: RelayStep[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fees?: any;
}

/**
 * Signs and sends every incomplete Solana item in a Relay quote, in order.
 * Returns each signature so the caller can surface them; the intent itself is
 * tracked separately via `waitForRelayIntent`.
 */
export async function executeRelayQuote(
  connection: Connection,
  wallet: SolanaSigner,
  quote: RelayQuoteLike,
  onProgress?: (description: string) => void,
): Promise<string[]> {
  const steps = quote.steps ?? [];
  if (steps.length === 0) {
    throw new Error("Relay returned no executable steps for this route");
  }

  const signatures: string[] = [];
  for (const step of steps) {
    for (const item of step.items ?? []) {
      if (item.status === "complete") continue;
      const instructionsJson = item.data?.instructions;
      if (!instructionsJson || instructionsJson.length === 0) continue;

      onProgress?.(step.description || step.action || "Confirm in your wallet…");

      const lookupTables = await loadLookupTables(
        connection,
        item.data?.addressLookupTableAddresses ?? [],
      );
      signatures.push(
        await sendInstructions(
          connection,
          wallet,
          instructionsJson.map(toTransactionInstruction),
          lookupTables,
        ),
      );
    }
  }

  if (signatures.length === 0) {
    throw new Error("Relay returned no Solana instructions to sign");
  }
  return signatures;
}

export type RelayIntentState = "pending" | "success" | "refund" | "failure" | "unknown";

function readIntentStatus(payload: unknown): RelayIntentState {
  const status = (payload as { status?: string } | null)?.status;
  if (status === "success" || status === "refund" || status === "failure" || status === "pending") {
    return status;
  }
  return "unknown";
}

/**
 * Polls the cross-chain intent until the Robinhood-side execution settles.
 * Resolves with the terminal state rather than throwing, so callers can tell a
 * refund (funds returned) apart from a hard failure and word it accordingly.
 */
export async function waitForRelayIntent(
  requestId: string,
  options: { timeoutMs?: number; intervalMs?: number; onTick?: (s: RelayIntentState) => void } = {},
): Promise<RelayIntentState> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const state = readIntentStatus(await getRelayIntentStatus({ data: requestId }));
      options.onTick?.(state);
      if (state === "success" || state === "refund" || state === "failure") return state;
    } catch {
      // A transient status-endpoint failure isn't an intent failure — the
      // solver keeps working regardless of whether we can read it right now.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "pending";
}

/* ------------------------------------------------------------------ */
/* Solana Pay URI (spec Module 4 — scan-to-pay QR)                      */
/* ------------------------------------------------------------------ */

export function buildSolanaPayUri(args: {
  recipient: string;
  amount?: string;
  splToken?: string;
  label?: string;
  message?: string;
}): string {
  const params = new URLSearchParams();
  if (args.amount && Number(args.amount) > 0) params.set("amount", args.amount);
  if (args.splToken) params.set("spl-token", args.splToken);
  if (args.label) params.set("label", args.label);
  if (args.message) params.set("message", args.message);
  const query = params.toString();
  return "solana:" + args.recipient + (query ? "?" + query : "");
}
