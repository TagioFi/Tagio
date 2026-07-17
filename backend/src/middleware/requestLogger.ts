import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/logger";
import type { AuthedRequest } from "./auth";

// Logs method/path/status/duration for every request. Deliberately never logs
// request/response bodies, headers, or query strings -- those can carry JWTs,
// wallet signatures, or OAuth codes. walletAddress is included when requireAuth
// has already populated it, since it's just an address, not a secret.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    log.info("http_request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      walletAddress: (req as AuthedRequest).walletAddress,
    });
  });
  next();
}
