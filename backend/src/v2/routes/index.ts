import { Router } from "express";
import assetsRoutes from "./assets";
import handlesRoutes from "./handles";
import settleRoutes from "./settle";
import invoicesRoutes from "./invoices";
import botRoutes from "./bot";
import authRoutes from "./auth";
import xAuthCallbackRoutes from "./xAuthCallback";
import waitlistRoutes from "./waitlist";

export const v2Router = Router();

v2Router.use(assetsRoutes);
v2Router.use(handlesRoutes);
v2Router.use(settleRoutes);
v2Router.use(invoicesRoutes);
v2Router.use(botRoutes);
v2Router.use(authRoutes);
v2Router.use(xAuthCallbackRoutes);
v2Router.use(waitlistRoutes);

export default v2Router;
