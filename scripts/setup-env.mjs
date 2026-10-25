import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [mode = "base-sepolia", ...extra] = process.argv.slice(2);
if (extra.length || !["stub", "base-sepolia"].includes(mode)) {
  console.error("Usage: pnpm setup:env [stub|base-sepolia]");
  process.exit(1);
}
let contents = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
contents = contents.replace("CUSTODY_MASTER_KEY=", `CUSTODY_MASTER_KEY=${randomBytes(32).toString("hex")}`);
if (mode === "stub") {
  contents = contents
    .replace("DEMO_DB=.data/base-sepolia.sqlite", "DEMO_DB=.data/demo.sqlite")
    .replace("PUBLIC_ASSET_MODE=sepolia", "PUBLIC_ASSET_MODE=stub")
    .replace("DEMO_PROFILE=ten-usdc", "DEMO_PROFILE=standard");
}
try {
  writeFileSync(".env.local", contents, { flag: "wx", mode: 0o600 });
  console.log(`Created .env.local (${mode}); public transactions are disabled.`);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.error(".env.local already exists; retained unchanged. Edit it explicitly to switch modes. Keep the existing custody key and DB.");
  process.exitCode = 1;
}
