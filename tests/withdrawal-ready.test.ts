import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForWithdrawal } from "../src/integrations/aave/withdrawal-ready";
test("withdraw waits for principal, refuses timeout, and propagates simulation rejection", async () => {
  let reads = 0,
    simulated = 0;
  await waitForWithdrawal(
    10n,
    async () => (++reads < 2 ? 9n : 10n),
    async () => {
      simulated++;
    },
    { intervalMs: 1 },
  );
  let attempts = 0;
  await waitForWithdrawal(
    10n,
    async () => 10n,
    async () => {
      if (++attempts === 1) throw new Error("0x47bc4b2c");
    },
    { intervalMs: 1 },
  );
  assert.equal(attempts, 2);
  assert.equal(reads, 2);
  assert.equal(simulated, 1);
  await assert.rejects(
    waitForWithdrawal(
      10n,
      async () => 9n,
      async () => {
        simulated++;
      },
      { timeoutMs: 0 },
    ),
    /not ready/,
  );
  assert.equal(simulated, 1);
  await assert.rejects(
    waitForWithdrawal(
      10n,
      async () => 10n,
      async () => {
        throw new Error("Pool rejected");
      },
    ),
    /Pool rejected/,
  );
});
