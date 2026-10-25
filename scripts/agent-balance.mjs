import { callBank } from "./agent-connection.mjs";
const path = process.argv[2];
if (!path) {
  console.error(
    "Usage: node scripts/agent-balance.mjs /path/to/agent-bank-connection.json",
  );
  process.exit(1);
}
try {
  const r = await callBank(path, "balance");
  if (!r.ok) {
    console.error(
      `Balance request rejected (HTTP ${r.status}). Check expiry, revocation and account availability.`,
    );
    process.exitCode = 1;
  } else console.log(JSON.stringify(r.body, null, 2));
} catch {
  console.error(
    "Unable to read the balance. Check the connection file and network.",
  );
  process.exitCode = 1;
}
