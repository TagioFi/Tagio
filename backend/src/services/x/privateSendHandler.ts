import { getUserByUsername } from "./botClient";
import { getWalletByXUserId } from "./xAccountService";
import { resolveTargetWallet } from "./targetResolver";
import { preparePrivateSend, buildUnsignedClaim, createPrivateSendRow, linkPendingTransaction, findClaimableForRecipient } from "./privateSendService";
import { createPendingPrivateSend, createPendingPrivateSendClaim } from "./pendingTransactionService";
import type { ParsedPrivateSendCommand } from "./commandParser";

const REPLY_PSEND_CREATED =
  "Private send created. Tap the link in my bio to review and sign it -- the recipient's wallet will only ever see a transfer from TagioPay's pool, never yours.";
const REPLY_RECIPIENT_NOT_FOUND =
  "Couldn't find that recipient -- double check the @handle, #hashtag, or wallet address and try again.";
const REPLY_HANDLE_NOT_LINKED = "That X account hasn't linked a TagioPay wallet yet -- double check the @handle and try again.";
const REPLY_CLAIM_CREATED = "Claim created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_NOTHING_TO_CLAIM = "You don't have any private sends waiting to be claimed right now.";

export async function handlePrivateSendCommand(
  command: ParsedPrivateSendCommand,
  senderWallet: `0x${string}`,
  senderXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  // Same three target kinds as a plain send: a #hashtag or raw 0xaddress
  // resolves straight to a concrete wallet with no X account involved at
  // all -- only the @handle path needs the recipient to already be linked
  // (there's no unlinked-@handle path here the way plain sends have
  // ClaimEscrow, since the commitment needs a concrete address at send time).
  let recipientWallet: string | null;
  let recipientXUserId: string | null = null;

  if (command.targetType === "x_account") {
    const target = await getUserByUsername(command.targetValue).catch(() => null);
    if (!target) {
      await reply(REPLY_RECIPIENT_NOT_FOUND);
      return;
    }
    recipientWallet = await getWalletByXUserId(target.id);
    if (!recipientWallet) {
      await reply(REPLY_HANDLE_NOT_LINKED);
      return;
    }
    recipientXUserId = target.id;
  } else {
    recipientWallet = await resolveTargetWallet(command);
    if (!recipientWallet) {
      await reply(REPLY_RECIPIENT_NOT_FOUND);
      return;
    }
  }

  const prepared = await preparePrivateSend(senderWallet, recipientWallet as `0x${string}`, command.amount, command.token);

  const row = await createPrivateSendRow({
    commitment: prepared.commitment,
    secret: prepared.secret,
    senderWallet,
    senderXUserId,
    recipientWallet: recipientWallet as `0x${string}`,
    recipientXUserId,
    token: command.token,
    amount: command.amount,
    amountBaseUnits: prepared.amountBaseUnits,
    keeperFeeBaseUnits: prepared.keeperFeeBaseUnits,
  });

  const created = await createPendingPrivateSend({
    requestedByWallet: senderWallet,
    requestedByXUserId: senderXUserId,
    sourceRef,
    commitment: prepared.commitment,
    token: command.token,
    amount: command.amount,
    amountBaseUnits: prepared.amountBaseUnits,
    approvals: prepared.approvals,
    send: prepared.send,
  });

  if (created) {
    await linkPendingTransaction(row.id, created.id);
    await reply(REPLY_PSEND_CREATED);
  }
}

export async function handleClaimCommand(
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const claimable = await findClaimableForRecipient(requesterXUserId);
  if (!claimable) {
    await reply(REPLY_NOTHING_TO_CLAIM);
    return;
  }

  const claim = buildUnsignedClaim(
    claimable.commitment as `0x${string}`,
    requesterWallet,
    claimable.secret as `0x${string}`,
  );

  const created = await createPendingPrivateSendClaim({
    requestedByWallet: requesterWallet,
    requestedByXUserId: requesterXUserId,
    sourceRef,
    commitment: claimable.commitment,
    token: claimable.token,
    amount: claimable.amount,
    claim,
  });

  if (created) await reply(REPLY_CLAIM_CREATED);
}
