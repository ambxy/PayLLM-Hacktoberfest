import { callBank } from "./agent-connection.mjs";
const path = process.argv[2];
const statusOnly = process.argv[3] === "--status";
if (!path || (process.argv[3] && !statusOnly)) {
  console.error(
    "Usage: node scripts/agent-redeem.mjs /path/to/agent-bank-connection.json [--status]",
  );
  process.exit(1);
}
try {
  const r = statusOnly
    ? await callBank(path, "redemptions")
    : await callBank(path, "redemptions", "POST", {
        action: "redeem-approved",
      });
  if (!r.ok) {
    console.error(
      `Redemption request rejected (HTTP ${r.status}). Check expiry, revocation and account availability.`,
    );
    process.exitCode = 1;
  } else console.log(JSON.stringify(r.body, null, 2));
} catch {
  console.error(
    "Unable to complete the redemption request. Use --status to check progress before trying again.",
  );
  process.exitCode = 1;
}
