import { pool } from "../../db/pool";

export interface XAccount {
  walletAddress: string;
  xUserId: string;
  xHandle: string;
}

// Case-insensitive: callers pass whatever case their source has the
// address in (a connected wallet's checksummed form, a raw route param,
// etc.), while wallet_address here was written from the JWT/link flow,
// which normalizes to lowercase -- an exact match would silently return
// null on a case mismatch instead of erroring (see the same class of bug
// fixed in privateSendService.ts's listPrivateSendsForWallet).
export async function getLinkedXAccountByWallet(walletAddress: string): Promise<XAccount | null> {
  const { rows } = await pool.query(
    "SELECT wallet_address, x_user_id, x_handle FROM x_accounts WHERE LOWER(wallet_address) = LOWER($1)",
    [walletAddress],
  );
  if (rows.length === 0) return null;
  return { walletAddress: rows[0].wallet_address, xUserId: rows[0].x_user_id, xHandle: rows[0].x_handle };
}

export async function getWalletByXUserId(xUserId: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT wallet_address FROM x_accounts WHERE x_user_id = $1", [xUserId]);
  return rows.length === 0 ? null : rows[0].wallet_address;
}

export async function getWalletByXHandle(handle: string): Promise<string | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  const { rows } = await pool.query("SELECT wallet_address FROM x_accounts WHERE lower(x_handle) = $1", [
    normalized,
  ]);
  return rows.length === 0 ? null : rows[0].wallet_address;
}

// Same lookup as getWalletByXHandle but returns the full linked row --
// dapp-triggered flows (e.g. a dashboard "Private Send" form) need the
// recipient's xUserId too, and can resolve straight from our own x_accounts
// table instead of an X API call, unlike the bot's own handler which only
// has the raw @handle text to start from.
export async function getLinkedXAccountByHandle(handle: string): Promise<XAccount | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  const { rows } = await pool.query(
    "SELECT wallet_address, x_user_id, x_handle FROM x_accounts WHERE lower(x_handle) = $1",
    [normalized],
  );
  if (rows.length === 0) return null;
  return { walletAddress: rows[0].wallet_address, xUserId: rows[0].x_user_id, xHandle: rows[0].x_handle };
}

export async function linkXAccount(walletAddress: string, xUserId: string, xHandle: string): Promise<void> {
  await pool.query(
    `INSERT INTO x_accounts (wallet_address, x_user_id, x_handle)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET x_user_id = EXCLUDED.x_user_id, x_handle = EXCLUDED.x_handle`,
    [walletAddress, xUserId, xHandle],
  );
}
