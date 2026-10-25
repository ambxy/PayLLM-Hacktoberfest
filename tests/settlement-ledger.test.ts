import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/returns-") + "/db.sqlite";
const { consumeReturn, assertResettable, publicTables } = await import(
  "../src/integrations/aave/sepolia"
);
const { sqlite } = await import("../src/server/db");
test("return logs cannot settle two orders and reset preserves unfinished public principal", () => {
  const e = {
    action: "transfer" as const,
    hash: ("0x" + "ab".repeat(32)) as `0x${string}`,
    block: "1",
    blockHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
    logIndex: 1,
    from: "0x0000000000000000000000000000000000000001" as const,
    to: "0x0000000000000000000000000000000000000002" as const,
    units: "10",
  };
  consumeReturn("one", e);
  consumeReturn("one", e);
  assert.throws(() => consumeReturn("two", e));
  assert.throws(() => consumeReturn("one", { ...e, logIndex: 2 }));
  publicTables();
  assertResettable();
  sqlite
    .prepare("INSERT INTO public_orders VALUES(?,?,?,?,?,?)")
    .run("one", "old", e.from, "10", "invested", "lock");
  assert.throws(() => assertResettable());
  sqlite.prepare("UPDATE public_orders SET status='redeemed'").run();
  assertResettable();
  assert.equal(
    (
      sqlite.prepare("SELECT COUNT(*) n FROM consumed_returns").get() as {
        n: number;
      }
    ).n,
    1,
  );
});
