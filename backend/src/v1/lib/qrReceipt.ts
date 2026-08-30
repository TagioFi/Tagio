import QRCode from "qrcode";
import { config } from "../../config";

export function txExplorerUrl(txHash: string): string {
  return `${config.robinhood.explorerUrl}/tx/${txHash}`;
}

// A QR code of the tx hash alone wouldn't be "viewable" by scanning it --
// encode the explorer URL instead, so scanning it actually opens the
// transaction, matching the reply text's own promise ("scan to view your
// transaction onchain").
export async function generateReceiptQrPng(txHash: string): Promise<Buffer> {
  return QRCode.toBuffer(txExplorerUrl(txHash), { type: "png", width: 512, margin: 2 });
}
