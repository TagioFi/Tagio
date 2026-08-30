import { pool } from "../../db/pool";
import { getAccount, getTransactionReceipt, decodeResolverEvents, hashtagOwner as readHashtagOwner } from "./onchain/client";
import { normalizeHashtag } from "./hashtagValidation";
import type { Hash } from "viem";

async function hydrateFromContract(hashtag: string): Promise<void> {
  // Ownership has exactly one source of truth on the contract side (the NFT's
  // ownerOf), so it's fetched separately rather than trusted from getAccount.
  const [account, owner] = await Promise.all([getAccount(hashtag), readHashtagOwner(hashtag)]);

  await pool.query(
    `INSERT INTO hashtags (hashtag, owner_wallet, name, image_url, website_url, nft_token_id, recovery_hash, registered_at, expires_at, active, total_volume_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), to_timestamp($9), true, $10)
     ON CONFLICT (hashtag) DO UPDATE SET
       owner_wallet = EXCLUDED.owner_wallet,
       name = EXCLUDED.name,
       image_url = EXCLUDED.image_url,
       website_url = EXCLUDED.website_url,
       nft_token_id = EXCLUDED.nft_token_id,
       recovery_hash = EXCLUDED.recovery_hash,
       expires_at = EXCLUDED.expires_at,
       active = true,
       last_interaction_at = now()`,
    [
      hashtag,
      owner,
      account.name,
      account.imageUrl,
      account.websiteUrl,
      account.nftTokenId.toString(),
      account.recoveryHash,
      Number(account.registeredAt),
      Number(account.expiresAt),
      Number(account.totalVolume),
    ],
  );

  await pool.query("DELETE FROM social_links WHERE hashtag = $1", [hashtag]);
  for (const social of account.socials) {
    await pool.query(
      "INSERT INTO social_links (hashtag, key, value) VALUES ($1, $2, $3)",
      [hashtag, social.key, social.value],
    );
  }

  await pool.query("DELETE FROM payout_recipients WHERE hashtag = $1", [hashtag]);
  for (const payout of account.payouts) {
    await pool.query(
      "INSERT INTO payout_recipients (hashtag, wallet, percentage_bps) VALUES ($1, $2, $3)",
      [hashtag, payout.wallet, payout.percentageBps],
    );
  }
}

// Frontend calls this after every on-chain action (register/renew/pay/update),
// mirroring the confirm-base-transaction pattern already proven on Base.
export async function confirmTransaction(txHash: Hash, hashtagRaw: string): Promise<void> {
  const hashtag = normalizeHashtag(hashtagRaw);
  const receipt = await getTransactionReceipt(txHash);
  const events = decodeResolverEvents(receipt);

  for (const event of events) {
    switch (event.eventName) {
      case "HashtagRegistered":
      case "MetadataUpdated":
      case "PayoutsUpdated":
        await hydrateFromContract(hashtag);
        break;

      case "PaymentReceived": {
        const { amount, isNative } = event.args;
        await pool.query(
          `INSERT INTO transactions (tx_hash, hashtag, amount, token, is_native)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tx_hash) DO NOTHING`,
          [txHash, hashtag, amount.toString(), isNative ? "native" : "token", isNative],
        );
        break;
      }

      case "SubscriptionRenewed": {
        const { newExpiry } = event.args;
        await pool.query(
          "UPDATE hashtags SET expires_at = to_timestamp($1), active = true WHERE hashtag = $2",
          [Number(newExpiry), hashtag],
        );
        break;
      }

      case "HashtagTransferred": {
        const { newOwner } = event.args;
        await pool.query(
          "UPDATE hashtags SET owner_wallet = $1 WHERE hashtag = $2",
          [newOwner, hashtag],
        );
        break;
      }

      // No DB action needed: a reclaim always fires HashtagRegistered in the same
      // transaction, which already upserts the row and wipes stale payouts/socials.
      case "HashtagReclaimed":
        break;
    }
  }
}
