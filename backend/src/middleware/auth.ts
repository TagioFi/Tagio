import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export interface AuthedRequest extends Request {
  walletAddress?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwtAccessSecret) as { walletAddress: string };
    req.walletAddress = payload.walletAddress;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
