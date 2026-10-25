import assert from "node:assert/strict";
import { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as viem from "viem";
process.env.DEMO_DB =
  mkdtempSync(tmpdir() + "/bank-public-stage-") + "/test.sqlite";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "true";
const bank = "0x0000000000000000000000000000000000000001",
  customer = "0x0000000000000000000000000000000000000002";
const addresses = {
  token: "0x0000000000000000000000000000000000000003",
  pool: "0x0000000000000000000000000000000000000004",
  aToken: "0x0000000000000000000000000000000000000005",
};
const blockHash = "0x" + "aa".repeat(32),
  hash = "0x" + "bb".repeat(32);
let sends = 0,
  afterSend = () => {};
const client = {
  getChainId: async () => 84532,
  getTransactionCount: async () => 0,
  estimateGas: async () => 21000n,
  estimateFeesPerGas: async () => ({
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
  }),
  waitForTransactionReceipt: async () => ({}),
  getTransactionReceipt: async () => ({ blockNumber: 1n, blockHash, logs: [] }),
  getBlockNumber: async () => 3n,
  getBlock: async () => ({ hash: blockHash }),
  readContract: async () => 10000000000n,
  simulateContract: async () => ({}),
};
mock.module("viem", {
  namedExports: {
    ...viem,
    createWalletClient: () => ({
      sendTransaction: async () => {
        sends++;
        afterSend();
        return hash;
      },
    }),
  },
});
mock.module("../../src/integrations/aave/config.ts", {
  namedExports: {
    addresses,
    checkNetwork: async () => ({ client, configuration: 0n }),
    publicClient: () => client,
    tokenAbi: viem.parseAbi([
      "function transfer(address,uint256)",
      "function approve(address,uint256)",
    ]),
    poolAbi: viem.parseAbi([
      "function supply(address,uint256,address,uint16)",
      "function withdraw(address,uint256,address)",
    ]),
  },
});
mock.module("../../src/integrations/aave/evidence.ts", {
  namedExports: { verifyEvidence: () => 0 },
});
mock.module("../../src/integrations/custody/index.ts", {
  namedExports: {
    bankAccountId: "bank",
    customerAccountId: "customer",
    signer: (id: string) => ({ address: id === "bank" ? bank : customer }),
    walletInfo: () => ({ address: customer }),
  },
});
const { supplyAndDeposit, withdrawAndReturn, recordPublicOrder } = await import(
  "../../src/integrations/aave/sepolia"
);
const { sqlite } = await import("../../src/server/db");
let allowed = true,
  checks = 0;
const guard = () => {
  checks++;
  if (!allowed) throw new Error("revoked");
};
recordPublicOrder("normal", "instance", "100", "lock");
await supplyAndDeposit("normal", "100", guard);
assert.equal(sends, 3);
assert.equal(checks, 6);
recordPublicOrder("cancel-after-transfer", "instance", "100", "lock2");
afterSend = () => {
  allowed = false;
};
await assert.rejects(
  supplyAndDeposit("cancel-after-transfer", "100", guard),
  /revoked/,
);
assert.equal(sends, 4);
assert.equal(
  (
    sqlite
      .prepare("SELECT status FROM public_steps WHERE id=?")
      .get("cancel-after-transfer:bank:transfer") as { status: string }
  ).status,
  "confirmed",
);
assert.equal(
  sqlite
    .prepare("SELECT id FROM public_steps WHERE id=?")
    .get("cancel-after-transfer:approve"),
  undefined,
);
allowed = true;
afterSend = () => {
  allowed = false;
};
await assert.rejects(
  withdrawAndReturn("return", "normal", "100", guard),
  /revoked/,
);
assert.equal(sends, 5);
assert.equal(
  (
    sqlite
      .prepare("SELECT status FROM public_steps WHERE id=?")
      .get("return:withdraw") as { status: string }
  ).status,
  "confirmed",
);
assert.equal(
  sqlite
    .prepare("SELECT id FROM public_steps WHERE id=?")
    .get("return:transfer"),
  undefined,
);
console.log(
  "Mocked public adapter: three deposit stages guarded; cancellation after transfer/withdraw preserves confirmed receipt and prevents next approve/return submission. No public network or signing used.",
);
