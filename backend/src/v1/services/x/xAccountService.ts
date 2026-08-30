import { pool } from "../../../db/pool";

export interface XAccount {
  walletAddress: string;
  solanaWalletAddress?: string | null;
  evmWalletAddress?: string | null;
  xUserId: string;
  xHandle: string;
}

export function isSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Case-insensitive / dual-chain lookup: checks wallet_address, solana_wallet_address, or evm_wallet_address
export async function getLinkedXAccountByWallet(walletAddress: string): Promise<XAccount | null> {
  const { rows } = await pool.query(
    `SELECT wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle 
     FROM x_accounts 
     WHERE LOWER(wallet_address) = LOWER($1) 
        OR LOWER(solana_wallet_address) = LOWER($1) 
        OR LOWER(evm_wallet_address) = LOWER($1)`,
    [walletAddress],
  );
  if (rows.length === 0) return null;
  return {
    walletAddress: rows[0].wallet_address,
    solanaWalletAddress: rows[0].solana_wallet_address,
    evmWalletAddress: rows[0].evm_wallet_address,
    xUserId: rows[0].x_user_id,
    xHandle: rows[0].x_handle,
  };
}

export async function getWalletByXUserId(xUserId: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT wallet_address, solana_wallet_address FROM x_accounts WHERE x_user_id = $1",
    [xUserId],
  );
  if (rows.length === 0) return null;
  return rows[0].solana_wallet_address || rows[0].wallet_address;
}

export async function getWalletByXHandle(handle: string): Promise<string | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  const { rows } = await pool.query(
    "SELECT wallet_address, solana_wallet_address FROM x_accounts WHERE lower(x_handle) = $1",
    [normalized],
  );
  if (rows.length === 0) return null;
  return rows[0].solana_wallet_address || rows[0].wallet_address;
}

export async function getLinkedXAccountByHandle(handle: string): Promise<XAccount | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  const { rows } = await pool.query(
    `SELECT wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle 
     FROM x_accounts WHERE lower(x_handle) = $1`,
    [normalized],
  );
  if (rows.length === 0) return null;
  return {
    walletAddress: rows[0].wallet_address,
    solanaWalletAddress: rows[0].solana_wallet_address,
    evmWalletAddress: rows[0].evm_wallet_address,
    xUserId: rows[0].x_user_id,
    xHandle: rows[0].x_handle,
  };
}

export async function linkXAccount(
  walletAddress: string,
  xUserId: string,
  xHandle: string,
  chainType: "solana" | "robinhood" = "solana",
): Promise<void> {
  const solanaAddr = chainType === "solana" || isSolanaAddress(walletAddress) ? walletAddress : null;
  const evmAddr = chainType === "robinhood" || isEvmAddress(walletAddress) ? walletAddress.toLowerCase() : null;

  try {
    await pool.query(
      `INSERT INTO x_accounts (wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (x_user_id) DO UPDATE SET 
         x_handle = EXCLUDED.x_handle,
         solana_wallet_address = COALESCE(EXCLUDED.solana_wallet_address, x_accounts.solana_wallet_address),
         evm_wallet_address = COALESCE(EXCLUDED.evm_wallet_address, x_accounts.evm_wallet_address)`,
      [walletAddress, solanaAddr, evmAddr, xUserId, xHandle],
    );
  } catch (err: any) {
    if (err.code === "23505") {
      const error: any = new Error("This wallet address or X account is already linked to another user.");
      error.status = 409;
      throw error;
    }
    throw err;
  }
}
