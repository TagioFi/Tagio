import { pool } from "../../db/pool";

export interface XAccount {
  walletAddress: string;
  xUserId: string;
  xHandle: string;
}

export async function getLinkedXAccountByWallet(walletAddress: string): Promise<XAccount | null> {
  const { rows } = await pool.query(
    "SELECT wallet_address, x_user_id, x_handle FROM x_accounts WHERE wallet_address = $1",
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

export async function linkXAccount(walletAddress: string, xUserId: string, xHandle: string): Promise<void> {
  await pool.query(
    `INSERT INTO x_accounts (wallet_address, x_user_id, x_handle)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET x_user_id = EXCLUDED.x_user_id, x_handle = EXCLUDED.x_handle`,
    [walletAddress, xUserId, xHandle],
  );
}
