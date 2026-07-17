import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./db/migrate";
import { config } from "./config";
import { pollMentions, pollDirectMessages } from "./services/x/poller";
import { XApiError } from "./services/x/botClient";
import { log } from "./lib/logger";

// 402 (credits/billing exhausted) and 429 (rate limited) mean "stop hitting this
// endpoint for a while", not "retry immediately forever" -- the latter just spams
// logs and, if credits are pay-per-call, can make the depletion worse.
const BACKOFF_MS = 30 * 60 * 1000;

// Mentions and DMs run on independent timers with independent backoff state --
// they have very different X API rate limits (300/15min vs 15/15min for DMs), so
// a 429 on one must never pause the other.
function startPollLoop(name: string, intervalMs: number, poll: () => Promise<void>): void {
  let running = false;
  let pausedUntil = 0;

  setInterval(() => {
    if (running) return; // skip this tick if the previous poll is still in flight
    if (Date.now() < pausedUntil) return; // back off silently, already logged once below

    running = true;
    poll()
      .catch((err) => {
        if (err instanceof XApiError && (err.status === 402 || err.status === 429)) {
          pausedUntil = Date.now() + BACKOFF_MS;
          log.warn("x_bot_poll_backoff", {
            stream: name,
            status: err.status,
            pausedForMinutes: BACKOFF_MS / 60000,
          });
          return;
        }
        log.error("x_bot_poll_error", { stream: name, error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}

function startXBotPolling(): void {
  if (!config.x.botEnabled) {
    log.info("x_bot_disabled", { reason: "X_BOT_ENABLED=false" });
    return;
  }
  if (!config.x.clientId) {
    log.info("x_bot_disabled", { reason: "X_CLIENT_ID not configured" });
    return;
  }

  startPollLoop("mentions", config.x.mentionsPollIntervalMs, pollMentions);
  startPollLoop("dms", config.x.dmPollIntervalMs, pollDirectMessages);
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
