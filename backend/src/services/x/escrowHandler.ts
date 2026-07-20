import { getUserByUsername } from "./botClient";
import { getWalletByXUserId } from "./xAccountService";
import {
  getEscrowDetails,
  buildUnsignedCreateEscrow,
  buildUnsignedAccept,
  buildUnsignedDeliver,
  buildUnsignedRelease,
  buildUnsignedCancelBeforeAccept,
} from "./escrowService";
import { createPendingEscrow } from "./pendingTransactionService";
import { amountToBaseUnits } from "./txBuilder";
import type { ParsedEscrowCommand } from "./commandParser";

const REPLY_ESCROW_CREATED = "Escrow created. Tap the link in my bio to review and sign the creation in your dashboard.";
const REPLY_ACCEPT_CREATED = "Acceptance created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_DELIVER_CREATED = "Delivery created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_RELEASE_CREATED = "Release created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_CANCEL_CREATED = "Cancellation created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_ESCROW_NOT_FOUND = "Couldn't find that escrow -- double check the #<id> and try again.";
const REPLY_COUNTERPARTY_NOT_FOUND = "Couldn't find that X account -- double check the @handle and try again.";
const REPLY_NOT_A_PARTY = "You're not the creator or counterparty on that escrow.";

export async function handleEscrowCommand(
  command: ParsedEscrowCommand,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  if (command.action === "create") {
    const target = await getUserByUsername(command.counterpartyHandle!).catch(() => null);
    // Note: the counterparty must already be a linked TagioPay wallet to
    // receive an escrow release -- unlike sends/giveaways, escrow doesn't
    // route an unlinked counterparty through ClaimEscrow (a freelancer
    // waiting on a real fund release should be a real, linked wallet, not
    // an IOU sitting in escrow indefinitely).
    if (!target) {
      await reply(REPLY_COUNTERPARTY_NOT_FOUND);
      return;
    }
    const counterpartyWallet = await getWalletByXUserId(target.id);
    if (!counterpartyWallet) {
      await reply(REPLY_COUNTERPARTY_NOT_FOUND);
      return;
    }

    const { approvals, create } = await buildUnsignedCreateEscrow(
      requesterWallet,
      counterpartyWallet as `0x${string}`,
      command.amount!,
      command.token!,
      command.description!,
    );
    const created = await createPendingEscrow({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      escrowAction: "create",
      escrowId: null,
      token: command.token!,
      amount: command.amount!,
      amountBaseUnits: amountToBaseUnits(command.token!, command.amount!),
      approvals,
      primary: create,
    });
    if (created) await reply(REPLY_ESCROW_CREATED);
    return;
  }

  const escrow = await getEscrowDetails(command.escrowId!).catch(() => null);
  if (!escrow) {
    await reply(REPLY_ESCROW_NOT_FOUND);
    return;
  }
  const isCreator = escrow.creator.toLowerCase() === requesterWallet.toLowerCase();
  const isCounterparty = escrow.counterparty.toLowerCase() === requesterWallet.toLowerCase();
  if (!isCreator && !isCounterparty) {
    await reply(REPLY_NOT_A_PARTY);
    return;
  }

  const token = escrow.token === "0x0000000000000000000000000000000000000000" ? "native" : "usdg";

  if (command.action === "accept") {
    const created = await createPendingEscrow({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      escrowAction: "accept",
      escrowId: command.escrowId!,
      token,
      amount: "0",
      amountBaseUnits: "0",
      approvals: [],
      primary: buildUnsignedAccept(command.escrowId!),
    });
    if (created) await reply(REPLY_ACCEPT_CREATED);
  } else if (command.action === "deliver") {
    const created = await createPendingEscrow({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      escrowAction: "deliver",
      escrowId: command.escrowId!,
      token,
      amount: "0",
      amountBaseUnits: "0",
      approvals: [],
      primary: buildUnsignedDeliver(command.escrowId!, command.proofUrl!),
    });
    if (created) await reply(REPLY_DELIVER_CREATED);
  } else if (command.action === "release") {
    const created = await createPendingEscrow({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      escrowAction: "release",
      escrowId: command.escrowId!,
      token,
      amount: "0",
      amountBaseUnits: "0",
      approvals: [],
      primary: buildUnsignedRelease(command.escrowId!),
    });
    if (created) await reply(REPLY_RELEASE_CREATED);
  } else if (command.action === "cancel") {
    const created = await createPendingEscrow({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      escrowAction: "cancel",
      escrowId: command.escrowId!,
      token,
      amount: "0",
      amountBaseUnits: "0",
      approvals: [],
      primary: buildUnsignedCancelBeforeAccept(command.escrowId!),
    });
    if (created) await reply(REPLY_CANCEL_CREATED);
  }
}
