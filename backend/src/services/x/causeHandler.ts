import { formatUnits } from "viem";
import {
  getCauseDetails,
  getLeaderboard,
  findCauseIdByName,
  buildUnsignedCreateCause,
  buildUnsignedDonate,
  buildUnsignedWithdraw,
} from "./causeService";
import { createPendingCause } from "./pendingTransactionService";
import type { ParsedCauseCommand, ParsedDonateToNameCommand, BotToken } from "./commandParser";

const REPLY_CAUSE_CREATED = (name: string) =>
  `Cause created: "${name}". Tap the link in my bio to review and sign the creation in your dashboard.`;
const REPLY_DONATION_CREATED = "Donation created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_WITHDRAWAL_CREATED =
  "Withdrawal created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_CAUSE_NOT_FOUND = "Couldn't find that cause -- double check the #CAUSE-<id> and try again.";
const REPLY_CAUSE_NAME_NOT_FOUND =
  "Couldn't find a cause by that exact name (or more than one matched) -- try #CAUSE-<id> instead.";
const REPLY_NOT_ORGANIZER = "Only that cause's organizer can withdraw from it.";

function decimalsFor(token: BotToken): number {
  return token === "native" ? 18 : 6;
}

export async function handleCauseCommand(
  command: ParsedCauseCommand,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  if (command.action === "create") {
    const { createCause } = buildUnsignedCreateCause(
      command.name!,
      command.organizerWallet!,
      command.goalAmount!,
      command.goalToken!,
    );
    const created = await createPendingCause({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      causeAction: "create",
      causeId: null,
      token: command.goalToken!,
      amount: command.goalAmount!,
      amountBaseUnits: "0",
      approvals: [],
      primary: createCause,
    });
    if (created) await reply(REPLY_CAUSE_CREATED(command.name!));
    return;
  }

  if (command.action === "leaderboard") {
    const cause = await getCauseDetails(command.causeId!).catch(() => null);
    if (!cause) {
      await reply(REPLY_CAUSE_NOT_FOUND);
      return;
    }
    const leaderboard = await getLeaderboard(command.causeId!, 5);
    const decimals = cause.token === "0x0000000000000000000000000000000000000000" ? 18 : 6;
    const raised = formatUnits(cause.totalRaised, decimals);
    const goal = formatUnits(cause.goal, decimals);
    const top = leaderboard.map((e) => `${e.donor.slice(0, 6)}…${formatUnits(e.total, decimals)}`).join(", ");
    await reply(`"${cause.name}": ${raised} / ${goal} raised. Top donors: ${top || "none yet"}.`);
    return;
  }

  if (command.action === "donate") {
    const cause = await getCauseDetails(command.causeId!).catch(() => null);
    if (!cause) {
      await reply(REPLY_CAUSE_NOT_FOUND);
      return;
    }
    const { approvals, donate } = await buildUnsignedDonate(
      command.causeId!,
      requesterWallet,
      command.amount!,
      command.token!,
    );
    const decimals = decimalsFor(command.token!);
    const created = await createPendingCause({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      causeAction: "donate",
      causeId: command.causeId!,
      token: command.token!,
      amount: command.amount!,
      amountBaseUnits: (BigInt(Math.round(parseFloat(command.amount!) * 10 ** decimals))).toString(),
      approvals,
      primary: donate,
    });
    if (created) await reply(REPLY_DONATION_CREATED);
    return;
  }

  if (command.action === "withdraw") {
    const cause = await getCauseDetails(command.causeId!).catch(() => null);
    if (!cause) {
      await reply(REPLY_CAUSE_NOT_FOUND);
      return;
    }
    if (cause.organizer.toLowerCase() !== requesterWallet.toLowerCase()) {
      await reply(REPLY_NOT_ORGANIZER);
      return;
    }
    const token: BotToken = cause.token === "0x0000000000000000000000000000000000000000" ? "native" : "usdg";
    const withdraw = buildUnsignedWithdraw(command.causeId!, command.amount!, token, command.reason ?? "");
    const decimals = decimalsFor(token);
    const created = await createPendingCause({
      requestedByWallet: requesterWallet,
      requestedByXUserId: requesterXUserId,
      sourceRef,
      causeAction: "withdraw",
      causeId: command.causeId!,
      token,
      amount: command.amount!,
      amountBaseUnits: (BigInt(Math.round(parseFloat(command.amount!) * 10 ** decimals))).toString(),
      approvals: [],
      primary: withdraw,
    });
    if (created) await reply(REPLY_WITHDRAWAL_CREATED);
    return;
  }
}

export async function handleDonateToName(
  command: ParsedDonateToNameCommand,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const causeId = await findCauseIdByName(command.causeName);
  if (causeId === null) {
    await reply(REPLY_CAUSE_NAME_NOT_FOUND);
    return;
  }

  await handleCauseCommand(
    { action: "donate", causeId, amount: command.amount, token: command.token },
    requesterWallet,
    requesterXUserId,
    sourceRef,
    reply,
  );
}
