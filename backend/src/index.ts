import "dotenv/config";
import { app } from "./app";
import { runMigrations } from "./db/migrate";
import { config } from "./config";

async function main() {
  await runMigrations();
  app.listen(config.port, () => {
    console.log(`tagiopay backend listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
