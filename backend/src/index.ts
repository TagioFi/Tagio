import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./db/migrate";
import { config } from "./config";
import { pollXBot } from "./services/x/poller";

function startXBotPolling(): void {
  if (!config.x.clientId) {
    console.log("X bot polling disabled: X_CLIENT_ID not configured");
    return;
  }

  let running = false;
  setInterval(() => {
    if (running) return; // skip this tick if the previous poll is still in flight
    running = true;
    pollXBot()
      .catch((err) => console.error("X bot poll error:", err))
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
