import { Router } from "express";
import { getEscrowDetails, listEscrowsForWallet, type EscrowDetails } from "../services/x/escrowService";

const router = Router();

function serializeEscrow(escrow: EscrowDetails & { escrowId?: number }) {
  return {
    ...(escrow.escrowId !== undefined ? { escrowId: escrow.escrowId } : {}),
    creator: escrow.creator,
    counterparty: escrow.counterparty,
    token: escrow.token,
    amount: escrow.amount.toString(),
    description: escrow.description,
    status: escrow.status,
    deliverDeadline: escrow.deliverDeadline.toString(),
    releaseDeadline: escrow.releaseDeadline.toString(),
    proofUrl: escrow.proofUrl,
  };
}

router.get("/escrows", async (req, res, next) => {
  try {
    const wallet = typeof req.query.wallet === "string" ? req.query.wallet : null;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      res.status(400).json({ error: "wallet query param required" });
      return;
    }
    const escrows = await listEscrowsForWallet(wallet as `0x${string}`);
    res.json(escrows.map(serializeEscrow));
  } catch (err) {
    next(err);
  }
});

router.get("/escrows/:id", async (req, res, next) => {
  try {
    const escrowId = Number(req.params.id);
    if (!Number.isInteger(escrowId) || escrowId <= 0) {
      res.status(400).json({ error: "invalid escrow id" });
      return;
    }
    const escrow = await getEscrowDetails(escrowId).catch(() => null);
    if (!escrow) {
      res.status(404).json({ error: "escrow not found" });
      return;
    }
    res.json(serializeEscrow(escrow));
  } catch (err) {
    next(err);
  }
});

export default router;
