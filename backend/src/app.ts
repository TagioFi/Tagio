import express from "express";
import cors from "cors";
import { config } from "./config";
import healthRoutes from "./routes/health";
import hashtagRoutes from "./routes/hashtags";
import resolveRoutes from "./routes/resolve";
import transactionRoutes from "./routes/transactions";
import pendingTransactionRoutes from "./routes/pendingTransactions";
import swapRoutes from "./routes/swap";
import walletRoutes from "./routes/wallet";
import causeRoutes from "./routes/causes";
import escrowRoutes from "./routes/escrows";
import privateSendRoutes from "./routes/privateSends";
import authRoutes from "./routes/auth";
import xAuthCallbackRoutes from "./routes/xAuthCallback";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

export const app = express();

app.use(requestLogger);
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.use(healthRoutes);
app.use(hashtagRoutes);
app.use(resolveRoutes);
app.use(transactionRoutes);
app.use(pendingTransactionRoutes);
app.use(swapRoutes);
app.use(walletRoutes);
app.use(causeRoutes);
app.use(escrowRoutes);
app.use(privateSendRoutes);
app.use(authRoutes);
app.use(xAuthCallbackRoutes);

app.use(errorHandler);
