import { Router } from "express";
import {
  createPublicClient,
  http,
  isAddress,
  encodeFunctionData,
  parseAbi,
  keccak256,
  toHex,
} from "viem";
import { getHandleDetails } from "../services/handleService";
import { pool } from "../../db/pool";

const router = Router();

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const CHAIN_ID = 4663;
export const HASHTAG_NFT_ADDRESS = "0x364469b9709D7E0E2bf6a049Aca3a8B436FbcEa3" as `0x${string}`;

const client = createPublicClient({
  transport: http(RPC_URL),
});

const ERC721_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
]);

// GET /v2/nfts/resolve-target/:target — Resolve recipient handle or address
router.get("/v2/nfts/resolve-target/:target", async (req, res, next) => {
  try {
    const rawTarget = req.params.target.trim();

    if (isAddress(rawTarget)) {
      // Check if this wallet is linked to a handle
      const identityRes = await pool.query(
        "SELECT x_handle, display_name, avatar_url FROM v2_handles WHERE LOWER(owner_wallet) = LOWER($1) LIMIT 1",
        [rawTarget]
      );
      const identity = identityRes.rows[0];

      return res.json({
        resolved: true,
        walletAddress: rawTarget.toLowerCase(),
        handle: identity?.x_handle ? `@${identity.x_handle}` : null,
        displayName: identity?.display_name || null,
        avatarUrl: identity?.avatar_url || null,
        isHandle: false,
      });
    }

    // Treat as handle
    const details = await getHandleDetails(rawTarget);
    if (!details) {
      return res.status(404).json({
        resolved: false,
        error: `Handle '${rawTarget}' is not registered on TagioFi yet.`,
      });
    }

    return res.json({
      resolved: true,
      walletAddress: details.ownerWallet.toLowerCase(),
      handle: `@${details.handle}`,
      displayName: details.displayName || details.handle,
      avatarUrl: details.avatarUrl || null,
      isHandle: true,
    });
  } catch (err) {
    next(err);
  }
});

// POST /v2/nfts/transfer-plan — Build an atomic NFT safeTransferFrom transaction
router.post("/v2/nfts/transfer-plan", async (req, res, next) => {
  try {
    const { fromWallet, target, contractAddress, tokenId } = req.body || {};

    if (!fromWallet || !isAddress(fromWallet)) {
      return res.status(400).json({ error: "Invalid sender wallet address." });
    }

    if (!target || typeof target !== "string") {
      return res.status(400).json({ error: "Target recipient handle or address is required." });
    }

    const nftContract = (contractAddress?.trim() || HASHTAG_NFT_ADDRESS) as `0x${string}`;
    if (!isAddress(nftContract)) {
      return res.status(400).json({ error: "Invalid NFT contract address." });
    }

    if (tokenId === undefined || tokenId === null || tokenId === "") {
      return res.status(400).json({ error: "Token ID is required." });
    }

    let parsedTokenId: bigint;
    try {
      parsedTokenId = BigInt(tokenId);
    } catch {
      return res.status(400).json({ error: "Invalid token ID format (must be a valid numeric integer)." });
    }

    // 1. Resolve Target
    let recipientWallet: `0x${string}`;
    let recipientHandle: string | null = null;
    let recipientDisplayName: string | null = null;
    let recipientAvatarUrl: string | null = null;

    if (isAddress(target.trim())) {
      recipientWallet = target.trim().toLowerCase() as `0x${string}`;
    } else {
      const details = await getHandleDetails(target);
      if (!details) {
        return res.status(404).json({
          error: `Recipient handle '${target}' is not registered. Cannot route NFT transfer.`,
        });
      }
      recipientWallet = details.ownerWallet.toLowerCase() as `0x${string}`;
      recipientHandle = `@${details.handle}`;
      recipientDisplayName = details.displayName;
      recipientAvatarUrl = details.avatarUrl;
    }

    if (recipientWallet.toLowerCase() === fromWallet.toLowerCase()) {
      return res.status(400).json({ error: "Sender and recipient addresses cannot be identical." });
    }

    // 2. Onchain Metadata & Ownership Verification
    let tokenName = "Unknown Collection";
    let tokenSymbol = "NFT";
    let currentOwner: string | null = null;

    try {
      tokenName = await client.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "name",
      });
    } catch {}

    try {
      tokenSymbol = await client.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "symbol",
      });
    } catch {}

    try {
      currentOwner = await client.readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: "ownerOf",
        args: [parsedTokenId],
      });
    } catch (err: any) {
      return res.status(400).json({
        error: `Could not verify token #${parsedTokenId.toString()} on contract ${nftContract}: token may not exist or contract is not ERC-721.`,
      });
    }

    if (currentOwner && currentOwner.toLowerCase() !== fromWallet.toLowerCase()) {
      return res.status(403).json({
        error: `Wallet ${fromWallet} is not the current owner of token #${parsedTokenId.toString()} (Owner: ${currentOwner}).`,
      });
    }

    // 3. Build Calldata: safeTransferFrom(from, to, tokenId)
    const calldata = encodeFunctionData({
      abi: ERC721_ABI,
      functionName: "safeTransferFrom",
      args: [fromWallet as `0x${string}`, recipientWallet, parsedTokenId],
    });

    const transaction = {
      to: nftContract,
      data: calldata,
      value: "0",
      chainId: CHAIN_ID,
    };

    return res.json({
      success: true,
      token: {
        contractAddress: nftContract,
        tokenId: parsedTokenId.toString(),
        name: tokenName,
        symbol: tokenSymbol,
        isHashtagNFT: nftContract.toLowerCase() === HASHTAG_NFT_ADDRESS.toLowerCase(),
      },
      sender: {
        walletAddress: fromWallet.toLowerCase(),
      },
      recipient: {
        walletAddress: recipientWallet,
        handle: recipientHandle,
        displayName: recipientDisplayName,
        avatarUrl: recipientAvatarUrl,
      },
      transaction,
    });
  } catch (err) {
    next(err);
  }
});

// GET /v2/nfts/tags/:walletAddress — List Tagio Hashtag NFTs owned by this wallet
router.get("/v2/nfts/tags/:walletAddress", async (req, res, next) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();

    // Query registered handles for this wallet
    const { rows } = await pool.query(
      `SELECT id, handle, display_name, avatar_url, created_at
       FROM v2_handles WHERE LOWER(owner_wallet) = $1`,
      [wallet]
    );

    const tagsWithTokens = await Promise.all(
      rows.map(async (row) => {
        const normalized = row.handle.toLowerCase();
        // HashtagNFT uses uint256(keccak256(bytes(normalized)))
        const hash = keccak256(toHex(normalized));
        const tokenId = BigInt(hash).toString();

        let isVerifiedOnchain = false;
        try {
          const onchainOwner = await client.readContract({
            address: HASHTAG_NFT_ADDRESS,
            abi: ERC721_ABI,
            functionName: "ownerOf",
            args: [BigInt(tokenId)],
          });
          isVerifiedOnchain = onchainOwner.toLowerCase() === wallet;
        } catch {
          // May not be minted to contract yet if soft-registered
        }

        return {
          handle: row.handle,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          contractAddress: HASHTAG_NFT_ADDRESS,
          tokenId,
          isVerifiedOnchain,
          createdAt: row.created_at,
        };
      })
    );

    res.json({ tags: tagsWithTokens });
  } catch (err) {
    next(err);
  }
});

export default router;
