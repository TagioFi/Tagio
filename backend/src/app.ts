import express from "express";
import cors from "cors";
import { config } from "./config";
import { v1Router } from "./v1/routes";
import { v2Router } from "./v2/routes";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

export const app = express();

app.use(requestLogger);
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

// Legacy endpoints mounted directly at root paths (preserving full compatibility for existing clients)
app.use(v1Router);

// New TagioFi v2 endpoints mounted with /v2/ routing
app.use(v2Router);

app.use(errorHandler);
