import { Router } from "express";
import healthRoutes from "./health";
import hashtagRoutes from "./hashtags";
import resolveRoutes from "./resolve";
import transactionRoutes from "./transactions";
import pendingTransactionRoutes from "./pendingTransactions";
import swapRoutes from "./swap";
import walletRoutes from "./wallet";
import causeRoutes from "./causes";
import escrowRoutes from "./escrows";
import privateSendRoutes from "./privateSends";
import authRoutes from "./auth";
import xAuthCallbackRoutes from "./xAuthCallback";
import relayRoutes from "./relay";

export const v1Router = Router();

v1Router.use(healthRoutes);
v1Router.use(hashtagRoutes);
v1Router.use(resolveRoutes);
v1Router.use(transactionRoutes);
v1Router.use(pendingTransactionRoutes);
v1Router.use(swapRoutes);
v1Router.use(walletRoutes);
v1Router.use(causeRoutes);
v1Router.use(escrowRoutes);
v1Router.use(privateSendRoutes);
v1Router.use(authRoutes);
v1Router.use(xAuthCallbackRoutes);
v1Router.use(relayRoutes);

export default v1Router;
