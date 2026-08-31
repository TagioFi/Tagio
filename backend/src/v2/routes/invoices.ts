import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "../../db/pool";
import { getHandleDetails } from "../services/handleService";

const router = Router();

// POST /v2/invoices — Create a pay-link / invoice
router.post("/v2/invoices", async (req, res, next) => {
  try {
    const { recipientHandle, targetAmount, targetTokenSymbol, memo, expiryMinutes } = req.body as {
      recipientHandle?: string;
      targetAmount?: number;
      targetTokenSymbol?: string;
      memo?: string;
      expiryMinutes?: number;
    };

    if (!recipientHandle || !targetAmount || targetAmount <= 0) {
      res.status(400).json({ error: "recipientHandle and positive targetAmount are required" });
      return;
    }

    const handleDetails = await getHandleDetails(recipientHandle);
    if (!handleDetails) {
      res.status(404).json({ error: `Handle not found: #${recipientHandle}` });
      return;
    }

    const invoiceId = `inv_${randomBytes(12).toString("hex")}`;
    const expiryAt = new Date(Date.now() + (expiryMinutes || 1440) * 60 * 1000); // default 24h

    const { rows } = await pool.query(
      `INSERT INTO v2_invoices (
        invoice_id, recipient_handle, recipient_wallet, target_amount, target_token_symbol, memo, expiry_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        invoiceId,
        handleDetails.handle,
        handleDetails.ownerWallet,
        targetAmount,
        targetTokenSymbol || "USDG",
        memo || null,
        expiryAt,
      ]
    );

    res.status(201).json({
      invoice: rows[0],
      payUrl: `https://tagiopay.com/pay/${invoiceId}`,
      handleDetails,
    });
  } catch (err) {
    next(err);
  }
});

// GET /v2/invoices/owner/:walletAddress — List invoices minted by a wallet
router.get("/v2/invoices/owner/:walletAddress", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v2_invoices 
       WHERE LOWER(recipient_wallet) = LOWER($1)
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.walletAddress]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /v2/pending/wallet/:walletAddress — List all actionable pending transactions / bot mentions
router.get("/v2/pending/wallet/:walletAddress", async (req, res, next) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();

    // Look up X handle if wallet is linked
    const identityRes = await pool.query(
      "SELECT x_handle FROM v2_wallet_identities WHERE LOWER(wallet_address) = $1 LIMIT 1",
      [wallet]
    );
    const xHandle = identityRes.rows[0]?.x_handle || "";

    // Query pending_transactions where this wallet or their X handle is sender or recipient
    const { rows } = await pool.query(
      `SELECT pt.*, pt.created_at as time
       FROM pending_transactions pt
       WHERE (
         LOWER(pt.sender_address) = $1 
         OR LOWER(pt.recipient_address) = $1
         OR ($2 != '' AND (LOWER(pt.sender_handle) = LOWER($2) OR LOWER(pt.recipient_identifier) = LOWER($2) OR LOWER(pt.recipient_identifier) = LOWER('@' || $2)))
       )
       ORDER BY pt.created_at DESC LIMIT 50`,
      [wallet, xHandle]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /v2/invoices/:invoiceId — Get invoice details
router.get("/v2/invoices/:invoiceId", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM v2_invoices WHERE invoice_id = $1", [
      req.params.invoiceId,
    ]);
    if (rows.length === 0) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const invoice = rows[0];
    const handleDetails = await getHandleDetails(invoice.recipient_handle);

    res.json({
      invoice,
      isExpired: new Date(invoice.expiry_at) < new Date(),
      handleDetails,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
