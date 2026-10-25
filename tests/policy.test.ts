import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/td-policy-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
const { sqlite } = await import("../src/server/db");
const state = {
  id: "test",
  clock: "2026-09-22T03:00:00.000Z",
  token: "0x0000000000000000000000000000000000000001",
  vault: "0x0000000000000000000000000000000000000002",
  customer: "0x0000000000000000000000000000000000000003",
  recipient: "0x0000000000000000000000000000000000000004",
};
sqlite
  .prepare("INSERT INTO demo_instances(id,state,status) VALUES(?,?,?)")
  .run("test", JSON.stringify(state), "ready");
sqlite.prepare("UPDATE control SET active_instance=?").run("test");
const { put } = await import("../src/server/records");
const { monthlyUsed } = await import("../src/features/banking/payment");
const { prepare, verify } = await import("../src/features/agents/service");
const auth = await import("../src/server/auth");
const { createDelegationProposal } = await import(
  "../src/features/delegations/service"
);
const { beginDemoApproval, completeDemoApproval } = await import(
  "../src/features/world/service"
);
const { readAuthorized } = await import("../src/features/invoices/service");
const { proposePayment } = await import("../src/features/rules/service");
const human = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { cookie: `bank_session=${auth.issueHumanSession(null).token}` },
  }),
)!;
const principal = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { authorization: `Bearer ${auth.issueAgentCredential().token}` },
  }),
)!;
async function approve(input: unknown) {
  const c = beginDemoApproval(input, human);
  await completeDemoApproval(c.id, human);
}
test("month totals count reservations once, survive rule changes and respect JST", () => {
  put("payment_history", {
    id: "invoice",
    recipientId: "aoba",
    amountJpy: "200000",
    paidAt: "2026-08-31T15:00:00Z",
    status: "reserved",
  });
  assert.equal(monthlyUsed("aoba", state.clock), 200000n);
  put("payment_history", {
    id: "invoice",
    recipientId: "aoba",
    amountJpy: "200000",
    paidAt: "2026-08-31T15:00:00Z",
    status: "confirmed",
  });
  put("rules", { id: "payment", version: 2 });
  assert.equal(monthlyUsed("aoba", state.clock), 200000n);
  assert.equal(monthlyUsed("other", state.clock), 0n);
  assert.equal(monthlyUsed("aoba", "2026-08-31T14:59:59Z"), 0n);
});
test("agent signature binds amount, recipient and authorization", async () => {
  const delegation = createDelegationProposal(human, [
    "aoba-mail",
    "sakura-mail",
  ]);
  await approve({ purpose: "delegation", proposalId: delegation.id });
  await readAuthorized(principal);
  const p = proposePayment(principal);
  await approve({ purpose: "proposal", proposalId: p.id });
  const intent = await prepare(principal, {
    kind: "payment",
    sourceId: "invoice",
    ruleVersion: 1,
    amountJpy: "200000",
    recipient: state.recipient,
  });
  await verify(principal, intent);
  await assert.rejects(verify(principal, { ...intent, amountJpy: "200001" }));
  await assert.rejects(verify(principal, { ...intent, ruleVersion: 2 }));
  await assert.rejects(
    verify(principal, { ...intent, recipient: state.customer }),
  );
});
