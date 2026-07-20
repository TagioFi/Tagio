import { Router } from "express";
import { listCauses, getCauseDetails, getLeaderboard } from "../services/x/causeService";

const router = Router();

function serializeCause(cause: { causeId?: number; name: string; organizer: string; token: string; goal: bigint; totalRaised: bigint; totalWithdrawn: bigint }) {
  return {
    ...(cause.causeId !== undefined ? { causeId: cause.causeId } : {}),
    name: cause.name,
    organizer: cause.organizer,
    token: cause.token,
    goal: cause.goal.toString(),
    totalRaised: cause.totalRaised.toString(),
    totalWithdrawn: cause.totalWithdrawn.toString(),
  };
}

router.get("/causes", async (_req, res, next) => {
  try {
    const causes = await listCauses();
    res.json(causes.map(serializeCause));
  } catch (err) {
    next(err);
  }
});

router.get("/causes/:id", async (req, res, next) => {
  try {
    const causeId = Number(req.params.id);
    if (!Number.isInteger(causeId) || causeId <= 0) {
      res.status(400).json({ error: "invalid cause id" });
      return;
    }
    const cause = await getCauseDetails(causeId).catch(() => null);
    if (!cause) {
      res.status(404).json({ error: "cause not found" });
      return;
    }
    res.json(serializeCause(cause));
  } catch (err) {
    next(err);
  }
});

router.get("/causes/:id/leaderboard", async (req, res, next) => {
  try {
    const causeId = Number(req.params.id);
    if (!Number.isInteger(causeId) || causeId <= 0) {
      res.status(400).json({ error: "invalid cause id" });
      return;
    }
    const leaderboard = await getLeaderboard(causeId, 10);
    res.json(leaderboard.map((e) => ({ donor: e.donor, total: e.total.toString() })));
  } catch (err) {
    next(err);
  }
});

export default router;
