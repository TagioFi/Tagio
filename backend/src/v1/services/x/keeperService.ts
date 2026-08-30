import { config } from "../../../config";
import { getPublicClient } from "../onchain/client";
import { getKeeperClient, getKeeperAddress } from "../onchain/keeperClient";
import { privateSendPoolAbi } from "../onchain/privateSendPoolAbi";
import {
  listClaimableForKeeper,
  markPrivateSendClaimed,
  recordKeeperAttemptFailure,
  type PrivateSendRow,
} from "./privateSendService";
import { log } from "../../lib/logger";

// The first background loop in TagioPay that signs and broadcasts real
// transactions on the backend's own behalf (see keeperClient.ts) -- every
// other poll loop in this codebase only reads, or builds unsigned calldata
// for a *user's* wallet to sign. Runs one full pass over every 'sent'
// private_sends row, claiming on the recipient's behalf so it lands in
// their wallet without them lifting a finger; the recipient's manual
// $claim command is the fallback if this loop is paused, unfunded, or
// simply hasn't gotten to a row yet.
export async function runKeeperCycle(): Promise<void> {
  if (!config.keeper.privateKey) {
    return; // keeper not configured -- manual $claim remains the only path, silently
  }

  const balance = await getPublicClient().getBalance({ address: getKeeperAddress() });
  if (balance < BigInt(config.keeper.minBalanceWei)) {
    log.warn("keeper_low_balance", { balance: balance.toString(), minBalanceWei: config.keeper.minBalanceWei });
    return;
  }

  const claimable = await listClaimableForKeeper();
  for (const row of claimable) {
    await claimOne(row);
  }
}

async function claimOne(row: PrivateSendRow): Promise<void> {
  const client = getKeeperClient();
  const publicClient = getPublicClient();

  try {
    const hash = await client.writeContract({
      address: config.robinhood.privateSendPoolAddress,
      abi: privateSendPoolAbi,
      functionName: "claim",
      args: [row.commitment as `0x${string}`, row.recipient_wallet as `0x${string}`, row.secret as `0x${string}`],
      chain: client.chain,
      account: client.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("claim reverted onchain");

    await markPrivateSendClaimed(row.commitment, hash, "keeper");
    log.info("keeper_claimed", { privateSendId: row.id, commitment: row.commitment, txHash: hash });
  } catch (err) {
    // The recipient may have self-claimed between our read and our attempt
    // (AlreadyClaimed revert) -- check the real on-chain state before
    // logging this as a failure; if it's genuinely already claimed, reconcile
    // the local row instead of retrying forever.
    const allocation = await publicClient
      .readContract({
        address: config.robinhood.privateSendPoolAddress,
        abi: privateSendPoolAbi,
        functionName: "getAllocation",
        args: [row.commitment as `0x${string}`],
      })
      .catch(() => null);

    if (allocation?.claimed) {
      await markPrivateSendClaimed(row.commitment, row.sent_tx_hash ?? "", "self");
      log.info("keeper_found_already_claimed", { privateSendId: row.id, commitment: row.commitment });
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    await recordKeeperAttemptFailure(row.id, message);
    log.error("keeper_claim_failed", { privateSendId: row.id, commitment: row.commitment, error: message });
  }
}
