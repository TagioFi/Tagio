import { pool } from "../../db/pool";
import { resolveV2Token, USDG, V2TokenInfo } from "../lib/robinhoodTokens";

export interface V2ElectionInput {
  symbol: string;
  tokenAddress?: string;
  basisPoints: number; // e.g. 6000 = 60.00%
}

export interface V2ElectionRow {
  id: number;
  handleId: number;
  symbol: string;
  tokenAddress: string;
  decimals: number;
  basisPoints: number;
  percentage: number;
  isActive: boolean;
  token?: V2TokenInfo | null;
}

export interface V2HandleDetails {
  id: number;
  handle: string;
  ownerWallet: string;
  xUserId: string | null;
  xHandle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  metadata: Record<string, any>;
  elections: V2ElectionRow[];
  totalBasisPoints: number;
  createdAt: string;
  updatedAt: string;
}

export async function getHandleDetails(handle: string): Promise<V2HandleDetails | null> {
  const cleanHandle = handle.replace(/^#|^@/, "").trim().toLowerCase();

  const handleRes = await pool.query(
    `SELECT id, handle, owner_wallet, x_user_id, x_handle, display_name, avatar_url, bio, metadata, created_at, updated_at
     FROM v2_handles WHERE LOWER(handle) = $1`,
    [cleanHandle]
  );

  if (handleRes.rows.length === 0) return null;
  const h = handleRes.rows[0];

  const electionsRes = await pool.query(
    `SELECT id, handle_id, symbol, token_address, decimals, basis_points, percentage, is_active
     FROM v2_elections WHERE handle_id = $1 AND is_active = TRUE ORDER BY basis_points DESC`,
    [h.id]
  );

  const elections: V2ElectionRow[] = electionsRes.rows.map((r: any) => ({
    id: r.id,
    handleId: r.handle_id,
    symbol: r.symbol,
    tokenAddress: r.token_address,
    decimals: r.decimals,
    basisPoints: r.basis_points,
    percentage: parseFloat(r.percentage),
    isActive: r.is_active,
    token: resolveV2Token(r.symbol) || resolveV2Token(r.token_address),
  }));

  const totalBasisPoints = elections.reduce((sum, e) => sum + e.basisPoints, 0);

  return {
    id: h.id,
    handle: h.handle,
    ownerWallet: h.owner_wallet,
    xUserId: h.x_user_id,
    xHandle: h.x_handle,
    displayName: h.display_name,
    avatarUrl: h.avatar_url,
    bio: h.bio,
    metadata: h.metadata || {},
    elections,
    totalBasisPoints,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  };
}

export async function registerHandle(params: {
  handle: string;
  ownerWallet: string;
  xUserId?: string;
  xHandle?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  metadata?: Record<string, any>;
  elections?: V2ElectionInput[];
}): Promise<V2HandleDetails> {
  const cleanHandle = params.handle.replace(/^#|^@/, "").trim().toLowerCase();

  if (!/^[a-z0-9_]{3,32}$/.test(cleanHandle)) {
    throw new Error("Handle must be 3-32 characters, lowercase alphanumeric and underscores only.");
  }

  // Verify election sum if provided
  let inputElections = params.elections || [];
  if (inputElections.length === 0) {
    // Default to 100% USDG
    inputElections = [{ symbol: "USDG", tokenAddress: USDG.address, basisPoints: 10000 }];
  }

  const totalBps = inputElections.reduce((acc, e) => acc + e.basisPoints, 0);
  if (totalBps !== 10000) {
    throw new Error(`Total election basis points must equal 10,000 (100.00%). Received: ${totalBps}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertHandleRes = await client.query(
      `INSERT INTO v2_handles (handle, owner_wallet, x_user_id, x_handle, display_name, avatar_url, bio, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, handle, owner_wallet, x_user_id, x_handle, display_name, avatar_url, bio, metadata, created_at, updated_at`,
      [
        cleanHandle,
        params.ownerWallet.toLowerCase(),
        params.xUserId || null,
        params.xHandle || null,
        params.displayName || cleanHandle,
        params.avatarUrl || null,
        params.bio || null,
        JSON.stringify(params.metadata || {}),
      ]
    );
    const newHandle = insertHandleRes.rows[0];

    for (const e of inputElections) {
      const token = resolveV2Token(e.symbol) || (e.tokenAddress ? resolveV2Token(e.tokenAddress) : null);
      if (!token) throw new Error(`Unknown or unverified token: ${e.symbol}`);

      await client.query(
        `INSERT INTO v2_elections (handle_id, symbol, token_address, decimals, basis_points, percentage, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [
          newHandle.id,
          token.symbol,
          token.address,
          token.decimals,
          e.basisPoints,
          (e.basisPoints / 100).toFixed(2),
        ]
      );
    }

    await client.query("COMMIT");
    return (await getHandleDetails(cleanHandle))!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateHandleElections(
  handle: string,
  ownerWallet: string,
  elections: V2ElectionInput[]
): Promise<V2HandleDetails> {
  const cleanHandle = handle.replace(/^#|^@/, "").trim().toLowerCase();
  const existing = await getHandleDetails(cleanHandle);
  if (!existing) throw new Error(`Handle not found: #${cleanHandle}`);

  if (existing.ownerWallet.toLowerCase() !== ownerWallet.toLowerCase()) {
    throw new Error("Unauthorized: Only the handle owner can update elections.");
  }

  const totalBps = elections.reduce((acc, e) => acc + e.basisPoints, 0);
  if (totalBps !== 10000) {
    throw new Error(`Total election basis points must equal 10,000 (100.00%). Received: ${totalBps}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Deactivate previous elections
    await client.query("UPDATE v2_elections SET is_active = FALSE, updated_at = NOW() WHERE handle_id = $1", [
      existing.id,
    ]);

    // Insert new elections
    for (const e of elections) {
      const token = resolveV2Token(e.symbol) || (e.tokenAddress ? resolveV2Token(e.tokenAddress) : null);
      if (!token) throw new Error(`Unknown or unverified token: ${e.symbol}`);

      await client.query(
        `INSERT INTO v2_elections (handle_id, symbol, token_address, decimals, basis_points, percentage, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [
          existing.id,
          token.symbol,
          token.address,
          token.decimals,
          e.basisPoints,
          (e.basisPoints / 100).toFixed(2),
        ]
      );
    }

    await client.query("UPDATE v2_handles SET updated_at = NOW() WHERE id = $1", [existing.id]);
    await client.query("COMMIT");

    return (await getHandleDetails(cleanHandle))!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listHandlesByOwner(ownerWallet: string): Promise<V2HandleDetails[]> {
  const { rows } = await pool.query(
    "SELECT handle FROM v2_handles WHERE LOWER(owner_wallet) = LOWER($1) ORDER BY created_at DESC",
    [ownerWallet]
  );
  const handles: V2HandleDetails[] = [];
  for (const r of rows) {
    const details = await getHandleDetails(r.handle);
    if (details) handles.push(details);
  }
  return handles;
}
