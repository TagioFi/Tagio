import { getUserByUsername } from "./botClient";
import { getWalletByXUserId } from "./xAccountService";
import { preparePrivateSend, buildUnsignedClaim, createPrivateSendRow, linkPendingTransaction, findClaimableForRecipient } from "./privateSendService";
import { createPendingPrivateSend, createPendingPrivateSendClaim } from "./pendingTransactionService";
import type { ParsedPrivateSendCommand } from "./commandParser";

const REPLY_PSEND_CREATED =
  "Private send created. Tap the link in my bio to review and sign it -- the recipient's wallet will only ever see a transfer from TagioPay's pool, never yours.";
const REPLY_RECIPIENT_NOT_FOUND = "Couldn't find that X account -- double check the @handle and try again.";
const REPLY_CLAIM_CREATED = "Claim created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_NOTHING_TO_CLAIM = "You don't have any private sends waiting to be claimed right now.";

export async function handlePrivateSendCommand(
  command: ParsedPrivateSendCommand,
  senderWallet: `0x${string}`,
  senderXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const target = await getUserByUsername(command.recipientHandle).catch(() => null);
  // Same policy as escrow's create (Wave 6): the recipient must already be a
  // linked wallet. A private send's whole point is paying into a real
  // wallet the keeper (or the recipient themselves) can claim to -- there's
  // no unlinked-recipient path here the way plain sends have ClaimEscrow,
  // since the commitment already needs a concrete recipient address baked
  // into it at send time.
  if (!target) {
    await reply(REPLY_RECIPIENT_NOT_FOUND);
    return;
  }
  const recipientWallet = await getWalletByXUserId(target.id);
  if (!recipientWallet) {
    await reply(REPLY_RECIPIENT_NOT_FOUND);
    return;
  }

  const prepared = await preparePrivateSend(senderWallet, recipientWallet as `0x${string}`, command.amount, command.token);

  const row = await createPrivateSendRow({
    commitment: prepared.commitment,
    secret: prepared.secret,
    senderWallet,
    senderXUserId,
    recipientWallet: recipientWallet as `0x${string}`,
    recipientXUserId: target.id,
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
