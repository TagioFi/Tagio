import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./db/migrate";
import { config } from "./config";
import { pollXBot } from "./services/x/poller";
import { XApiError } from "./services/x/botClient";

// 402 (credits/billing exhausted) and 429 (rate limited) mean "stop hitting this
// endpoint for a while", not "retry in 30s forever" -- the latter just spams
// logs and, if credits are pay-per-call, can make the depletion worse.
const BACKOFF_MS = 30 * 60 * 1000;

function startXBotPolling(): void {
  if (!config.x.clientId) {
    console.log("X bot polling disabled: X_CLIENT_ID not configured");
    return;
  }

  let running = false;
  let pausedUntil = 0;

  setInterval(() => {
    if (running) return; // skip this tick if the previous poll is still in flight
    if (Date.now() < pausedUntil) return; // back off silently, already logged once below

    running = true;
    pollXBot()
      .catch((err) => {
        if (err instanceof XApiError && (err.status === 402 || err.status === 429)) {
          pausedUntil = Date.now() + BACKOFF_MS;
          console.error(
            `X bot poll error (${err.status}): ${err.message} -- pausing polling for ${BACKOFF_MS / 60000}m`,
          );
          return;
        }
        console.error("X bot poll error:", err);
      })
      .finally(() => {
        running = false;
      });
  }, config.x.botPollIntervalMs);
}

async function main() {
  await runMigrations();
  startXBotPolling();
  app.listen(config.port, () => {
    console.log(`tagiopay backend listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
