/**
 * Account Recovery Phrase — spec Module 3.
 *
 * A 12-word BIP-39 phrase (128 bits of entropy) is generated in the browser at
 * registration time. Only its keccak256 hash is committed onchain as the
 * hashtag's `recoveryHash`; the phrase itself never leaves the device and is
 * never sent to the backend. Later, from any wallet, presenting the phrase to
 * `transferViaRecoveryPhrase` moves the handle to a new owner without needing
 * the original wallet or an admin.
 *
 * `generateMnemonic`/`english` come from viem — already a direct dependency —
 * rather than a new bip39 package, which would risk this repo's known
 * `bun install` breakage.
 */
import { keccak256, stringToBytes } from "viem";
import { english, generateMnemonic } from "viem/accounts";

/** Twelve words, space-separated, matching what the contract will hash. */
export function generateRecoveryPhrase(): string {
  return generateMnemonic(english, 128);
}

/**
 * Whitespace is normalized before hashing so a phrase re-typed with a stray
 * double space or a trailing newline still hashes to the committed value — the
 * contract compares `keccak256(bytes(recoveryPhrase))` exactly, so what's
 * hashed at registration and what's hashed at recovery must match byte for byte.
 */
export const normalizeRecoveryPhrase = (phrase: string) =>
  phrase.trim().toLowerCase().replace(/\s+/g, " ");

export const recoveryHash = (phrase: string): `0x${string}` =>
  keccak256(stringToBytes(normalizeRecoveryPhrase(phrase)));

export const RECOVERY_WORD_COUNT = 12;

/** Shape check only — a wrong-but-well-formed phrase fails onchain, not here. */
export function isWellFormedRecoveryPhrase(phrase: string): boolean {
  const words = normalizeRecoveryPhrase(phrase).split(" ").filter(Boolean);
  return words.length === RECOVERY_WORD_COUNT && words.every((w) => /^[a-z]+$/.test(w));
}
