import { Router } from "express";
import {
  ALL_ROBINHOOD_ASSETS,
  FEATURED_ROBINHOOD_ASSETS,
  ETH,
  USDG,
  resolveV2Token,
} from "../lib/robinhoodTokens";

const router = Router();

// GET /v2/assets — Directory of Robinhood RWA assets, tokenized stocks, and base currencies
router.get("/v2/assets", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const featuredOnly = req.query.featured === "true";

  let list = featuredOnly ? FEATURED_ROBINHOOD_ASSETS : ALL_ROBINHOOD_ASSETS;

  if (query) {
    list = list.filter(
      (a) =>
        a.symbol.toLowerCase().includes(query) ||
        a.name.toLowerCase().includes(query) ||
        a.underlyingTicker?.toLowerCase().includes(query) ||
        a.address.toLowerCase() === query
    );
  }

  res.json({
    baseCurrencies: [ETH, USDG],
    featured: FEATURED_ROBINHOOD_ASSETS,
    total: list.length,
    assets: list,
  });
});

// GET /v2/assets/:symbolOrAddress — Single asset lookup
router.get("/v2/assets/:symbolOrAddress", (req, res) => {
  const token = resolveV2Token(req.params.symbolOrAddress);
  if (!token) {
    res.status(404).json({ error: `Asset not found: ${req.params.symbolOrAddress}` });
    return;
  }
  res.json(token);
});

export default router;
