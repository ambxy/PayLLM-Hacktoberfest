import assert from "node:assert/strict";
import { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB =
  mkdtempSync(tmpdir() + "/dashboard-progress-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.PUBLIC_ASSET_MODE = "stub";
const { sqlite, current, save } = await import("../../src/server/db");
let looseUsdc = "0",
  positionUsdc = "0";
const publicTables = () =>
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS public_steps (id TEXT PRIMARY KEY, data TEXT, status TEXT)",
  );
mock.module("../../src/integrations/aave/sepolia.ts", {
  namedExports: {
    publicTables,
    assertResettable: () => {},
    balances: async () => ({ looseUsdc, positionUsdc }),
  },
});
const auth = await import("../../src/server/auth");
const human = auth.authenticateRequest(
  new Request("http://127.0.0.1", {
    headers: { cookie: `bank_session=${auth.issueHumanSession(null).token}` },
  }),
)!;
const { reset, dashboard } = await import("../../src/features/demo/service");
const { put } = await import("../../src/server/records");
await reset(human);
save({ ...current()!, publicMode: "sepolia" });
put("runs", { id: "run", kind: "investment", status: "running", steps: [] });
let result = await dashboard();
assert.ok("investmentProgress" in result);
assert.equal(result.investmentProgress?.completedStages, 0);
put("investment_orders", {
  id: "order",
  runId: "run",
  status: "locked",
  amountJpy: "400000",
  usdcUnits: "2500000000",
});
result = await dashboard();
assert.ok("movements" in result);
assert.equal(result.investmentProgress?.completedStages, 1);
assert.deepEqual(
  result.movements.filter((m) => m.id.startsWith("order")).map((m) => m.id),
  ["order:deposit-out"],
);
publicTables();
sqlite
  .prepare("INSERT INTO public_steps VALUES(?,?,?)")
  .run("order:bank:transfer", "{}", "submitted");
result = await dashboard();
assert.ok("movements" in result);
assert.equal(
  result.movements.some((m) => m.id === "order:token-in"),
  false,
);
sqlite
  .prepare("UPDATE public_steps SET status='confirmed' WHERE id=?")
  .run("order:bank:transfer");
looseUsdc = "2500000000";
result = await dashboard();
assert.ok("movements" in result);
assert.equal(result.investmentProgress?.completedStages, 2);
assert.equal(result.looseUsdc, "2500000000");
assert.equal(
  result.movements.some((m) => m.id === "order:token-in"),
  true,
);
assert.equal(
  result.movements.some((m) => m.id === "order:aave-in"),
  false,
);
put("runs", {
  id: "run",
  kind: "investment",
  status: "needs_attention",
  steps: [],
});
result = await dashboard();
assert.ok("investmentProgress" in result);
assert.equal(result.investmentProgress?.status, "needs_attention");
assert.equal(result.investmentProgress?.completedStages, 2);
sqlite
  .prepare("INSERT INTO public_steps VALUES(?,?,?)")
  .run("order:supply", "{}", "confirmed");
looseUsdc = "0";
positionUsdc = "2500000000";
put("runs", { id: "run", kind: "investment", status: "completed", steps: [] });
result = await dashboard();
assert.ok("movements" in result);
assert.equal(result.investmentProgress?.completedStages, 3);
assert.equal(
  result.movements.some((m) => m.id === "order:token-deposit"),
  true,
);
assert.equal(
  result.movements.some((m) => m.id === "order:aave-in"),
  true,
);
assert.equal(result.looseUsdc, "0");
assert.equal(result.positionUsdc, "2500000000");
console.log(
  "Passed: lock -> confirmed USDC receipt -> confirmed Aave supply; unconfirmed stages hidden; failure preserves confirmed progress.",
);
