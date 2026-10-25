import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeEventTopics,
  encodeAbiParameters,
  type TransactionReceipt,
} from "viem";
import { addresses, tokenAbi } from "../src/integrations/aave/config";
import { verifyEvidence } from "../src/integrations/aave/evidence";
const from = "0x0000000000000000000000000000000000000001",
  to = "0x0000000000000000000000000000000000000002";
test("settlement evidence binds asset sender recipient amount and receipt target", () => {
  const log = {
    address: addresses.token,
    logIndex: 3,
    topics: encodeEventTopics({
      abi: tokenAbi,
      eventName: "Transfer",
      args: { from, to },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [10000000n]),
  };
  const receipt = {
    status: "success",
    from,
    to: addresses.token,
    logs: [log],
  } as unknown as TransactionReceipt;
  assert.equal(verifyEvidence(receipt, "transfer", from, to, 10000000n), 3);
  assert.throws(() => verifyEvidence(receipt, "transfer", from, to, 10000001n));
  assert.throws(() =>
    verifyEvidence(receipt, "transfer", from, from, 10000000n),
  );
  assert.throws(() =>
    verifyEvidence(
      { ...receipt, to: addresses.pool },
      "transfer",
      from,
      to,
      10000000n,
    ),
  );
  assert.throws(() =>
    verifyEvidence(
      { ...receipt, logs: [{ ...receipt.logs[0], address: addresses.aToken }] },
      "transfer",
      from,
      to,
      10000000n,
    ),
  );
  assert.throws(() =>
    verifyEvidence(
      { ...receipt, status: "reverted" },
      "transfer",
      from,
      to,
      10000000n,
    ),
  );
});
