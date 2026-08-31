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

// Case-insensitive / dual-chain lookup: checks v2_wallet_identities, v2_handles, and x_accounts
export async function getLinkedXAccountByWallet(walletAddress: string): Promise<XAccount | null> {
  const normalized = walletAddress.toLowerCase();

  // 1. Check v2_wallet_identities
  const v2IdRes = await pool.query(
    "SELECT wallet_address, x_user_id, x_handle FROM v2_wallet_identities WHERE LOWER(wallet_address) = $1 LIMIT 1",
    [normalized]
  );
  if (v2IdRes.rows.length > 0 && v2IdRes.rows[0].x_user_id) {
    return {
      walletAddress: v2IdRes.rows[0].wallet_address,
      evmWalletAddress: v2IdRes.rows[0].wallet_address,
      xUserId: v2IdRes.rows[0].x_user_id,
      xHandle: v2IdRes.rows[0].x_handle,
    };
  }

  // 2. Check v2_handles
  const v2HandleRes = await pool.query(
    "SELECT owner_wallet, x_user_id, x_handle FROM v2_handles WHERE LOWER(owner_wallet) = $1 AND x_user_id IS NOT NULL LIMIT 1",
    [normalized]
  );
  if (v2HandleRes.rows.length > 0) {
    return {
      walletAddress: v2HandleRes.rows[0].owner_wallet,
      evmWalletAddress: v2HandleRes.rows[0].owner_wallet,
      xUserId: v2HandleRes.rows[0].x_user_id,
      xHandle: v2HandleRes.rows[0].x_handle || "",
    };
  }

  // 3. Check legacy x_accounts
  const { rows } = await pool.query(
    `SELECT wallet_address, solana_wallet_address, evm_wallet_address, x_user_id, x_handle 
     FROM x_accounts 
     WHERE LOWER(wallet_address) = $1 
        OR LOWER(solana_wallet_address) = $1 
        OR LOWER(evm_wallet_address) = $1`,
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

export async function getWalletByXUserId(xUserId: string): Promise<string | null> {
  // 1. Check v2_wallet_identities
  const v2IdRes = await pool.query(
    "SELECT wallet_address FROM v2_wallet_identities WHERE x_user_id = $1 LIMIT 1",
    [xUserId]
  );
  if (v2IdRes.rows.length > 0) return v2IdRes.rows[0].wallet_address;

  // 2. Check v2_handles
  const v2HandleRes = await pool.query(
    "SELECT owner_wallet FROM v2_handles WHERE x_user_id = $1 LIMIT 1",
    [xUserId]
  );
  if (v2HandleRes.rows.length > 0) return v2HandleRes.rows[0].owner_wallet;

  // 3. Check legacy x_accounts
  const { rows } = await pool.query(
    "SELECT wallet_address, solana_wallet_address FROM x_accounts WHERE x_user_id = $1",
    [xUserId],
  );
  if (rows.length === 0) return null;
  return rows[0].solana_wallet_address || rows[0].wallet_address;
}

export async function getWalletByXHandle(handle: string): Promise<string | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();

  // 1. Check v2_wallet_identities
  const v2IdRes = await pool.query(
    "SELECT wallet_address FROM v2_wallet_identities WHERE LOWER(x_handle) = $1 LIMIT 1",
    [normalized]
  );
  if (v2IdRes.rows.length > 0) return v2IdRes.rows[0].wallet_address;

  // 2. Check v2_handles
  const v2HandleRes = await pool.query(
    "SELECT owner_wallet FROM v2_handles WHERE LOWER(x_handle) = $1 OR LOWER(handle) = $1 LIMIT 1",
    [normalized]
  );
  if (v2HandleRes.rows.length > 0) return v2HandleRes.rows[0].owner_wallet;

  // 3. Check legacy x_accounts
  const { rows } = await pool.query(
    "SELECT wallet_address, solana_wallet_address FROM x_accounts WHERE lower(x_handle) = $1",
    [normalized],
  );
  if (rows.length === 0) return null;
  return rows[0].solana_wallet_address || rows[0].wallet_address;
}

export async function getLinkedXAccountByHandle(handle: string): Promise<XAccount | null> {
  const normalized = handle.replace(/^@/, "").toLowerCase();

  // 1. Check v2_wallet_identities
  const v2IdRes = await pool.query(
    "SELECT wallet_address, x_user_id, x_handle FROM v2_wallet_identities WHERE LOWER(x_handle) = $1 LIMIT 1",
    [normalized]
  );
  if (v2IdRes.rows.length > 0) {
    return {
      walletAddress: v2IdRes.rows[0].wallet_address,
      evmWalletAddress: v2IdRes.rows[0].wallet_address,
      xUserId: v2IdRes.rows[0].x_user_id,
      xHandle: v2IdRes.rows[0].x_handle,
    };
  }

  // 2. Check v2_handles
  const v2HandleRes = await pool.query(
    "SELECT owner_wallet, x_user_id, x_handle FROM v2_handles WHERE LOWER(x_handle) = $1 OR LOWER(handle) = $1 LIMIT 1",
    [normalized]
  );
  if (v2HandleRes.rows.length > 0) {
    return {
      walletAddress: v2HandleRes.rows[0].owner_wallet,
      evmWalletAddress: v2HandleRes.rows[0].owner_wallet,
      xUserId: v2HandleRes.rows[0].x_user_id || "",
      xHandle: v2HandleRes.rows[0].x_handle || normalized,
    };
  }

  // 3. Check legacy x_accounts
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
  chainType: "solana" | "robinhood" = "robinhood",
): Promise<void> {
  const normalized = walletAddress.toLowerCase();
  await pool.query(
    `INSERT INTO v2_wallet_identities (wallet_address, x_user_id, x_handle, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wallet_address) DO UPDATE SET
       x_user_id = EXCLUDED.x_user_id,
       x_handle = EXCLUDED.x_handle,
       updated_at = NOW()`,
    [normalized, xUserId, xHandle]
  );
}
