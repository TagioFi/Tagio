import { generateReceiptQrPng } from "../../lib/qrReceipt";
import { uploadMedia, replyToMentionWithMedia } from "./botClient";
import { log } from "../../lib/logger";

const RECEIPT_TEXT = "Transaction Completed! Scan the QR Code to view your transaction onchain.";

// Called after a bot-initiated transaction's own onchain success has
// already been verified (see routes/pendingTransactions.ts) -- a failure
// here (rate limit, media upload hiccup) must never fail that response,
// since the settlement itself already happened. Best-effort, logged only.
export async function postReceiptReply(tweetId: string, txHash: string): Promise<void> {
  try {
    const png = await generateReceiptQrPng(txHash);
    const mediaId = await uploadMedia(png, "image/png");
    await replyToMentionWithMedia(tweetId, RECEIPT_TEXT, mediaId);
    log.info("x_bot_receipt_reply_sent", { tweetId, txHash });
  } catch (err) {
    log.error("x_bot_receipt_reply_failed", { tweetId, txHash, error: (err as Error).message });
  }
}
