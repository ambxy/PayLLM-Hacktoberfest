import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB =
  mkdtempSync(tmpdir() + "/bank-agent-e2e-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.PUBLIC_ASSET_MODE = "stub";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "false";
const auth = await import("../../src/server/auth");
const { reset, dashboard } = await import("../../src/features/demo/service");
const { readAuthorized } = await import("../../src/features/invoices/service");
const { createDelegationProposal } = await import(
  "../../src/features/delegations/service"
);
const { beginDemoApproval, completeDemoApproval } = await import(
  "../../src/features/world/service"
);
const { proposePayment } = await import("../../src/features/rules/service");
const { payDue } = await import("../../src/features/banking/payment");
const { proposeInvestment, invest } = await import(
  "../../src/features/investment/service"
);
const { createRedemptionRequest, redeem } = await import(
  "../../src/features/investment/redemption"
);
const { get, put } = await import("../../src/server/records");
const human = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { cookie: `bank_session=${auth.issueHumanSession(null).token}` },
  }),
)!;
const agent = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { authorization: `Bearer ${auth.issueAgentCredential().token}` },
  }),
)!;
await reset(human);
const approve = async (input: unknown) => {
  const c = beginDemoApproval(input, human);
  return completeDemoApproval(c.id, human);
};
const mail = createDelegationProposal(human, ["aoba-mail", "sakura-mail"]);
await approve({ purpose: "delegation", proposalId: mail.id });
await readAuthorized(agent);
const { agentRead } = await import("../../src/features/agents/read");
const accountBalance = await agentRead(agent, { resource: "balance" });
assert.ok("td" in accountBalance);
assert.equal(accountBalance.td, "1000000");
const projected = await agentRead(agent, { resource: "cashflow" });
assert.ok("investJpy" in projected);
const payment = proposePayment(agent);
await approve({ purpose: "proposal", proposalId: payment.id });
const paid = await payDue(agent, crypto.randomUUID());
assert.equal(paid.status, "completed");
const readRun = await agentRead(agent, { resource: "run", runId: paid.id });
assert.ok("run" in readRun && readRun.run);
assert.equal(readRun.run.id, paid.id);
const afterPayment = await dashboard();
assert.ok("td" in afterPayment);
assert.equal(afterPayment.td, "800000");
const unpaid = get<any>("invoices", "sakura:SAKURA-202609-001");
put("invoices", { ...unpaid, amountJpy: "200000" });
const reduced = await proposeInvestment(agent);
assert.equal(reduced.snapshot.investJpy, "300000");
assert.equal(reduced.proposal.conditions.maxInvestmentJpy, "300000");
assert.equal(
  get<any>("proposals", reduced.proposal.id).conditions.maxInvestmentJpy,
  "300000",
);
put("invoices", unpaid);
const proposal = await proposeInvestment(agent);
assert.equal(proposal.snapshot.investJpy, "400000");
assert.equal(proposal.proposal.conditions.maxInvestmentJpy, "400000");
await approve({ purpose: "proposal", proposalId: proposal.proposal.id });
assert.equal(get<any>("rules", "investment").maxInvestmentJpy, "400000");
const invested = await invest(agent, crypto.randomUUID());
assert.equal(invested.status, "completed");
const afterInvestment = await dashboard();
assert.ok("locked" in afterInvestment);
assert.equal(afterInvestment.locked, "400000");
await assert.rejects(reset(human), /Redeem all positions/);
const rule = get<any>("rules", "investment");
await approve({
  purpose: "change",
  change: {
    baseVersion: rule.version,
    conditions: { ...proposal.proposal.conditions, enabled: false },
  },
});
const request = createRedemptionRequest(human);
const result = await redeem(agent, request.id);
assert.equal(result.status, "completed");
const final = await dashboard();
assert.ok("td" in final);
assert.equal(final.td, "800000");
assert.equal(final.locked, "0");
assert.equal(final.positionUsdc, "0");
assert.equal((await redeem(agent, request.id)).id, result.id);
console.log(
  "Authenticated local-demo: Anvil TD payment/lock/release and public stub investment/redemption passed; disabled investment permits original-owner redemption; outstanding reset denied.",
);

// Reapproval restores investment only. Revocation queued after TD submission must stop public movement.
const { revokeDelegation, assertScope } = await import(
  "../../src/features/delegations/service"
);
const { wallet } = await import("../../src/integrations/td-ledger");
const nextProposal = await proposeInvestment(agent);
await approve({ purpose: "proposal", proposalId: nextProposal.proposal.id });
const reference = assertScope(agent, "investment");
const originalWrite = wallet.writeContract;
let revoked: Promise<unknown> | undefined;
wallet.writeContract = (async (
  parameters: Parameters<typeof originalWrite>[0],
) => {
  const hash = await originalWrite(parameters);
  if (parameters.functionName === "lockFor")
    revoked = revokeDelegation(reference.id, human);
  return hash;
}) as typeof originalWrite;
try {
  await assert.rejects(invest(agent, crypto.randomUUID()));
} finally {
  wallet.writeContract = originalWrite;
}
await revoked;
const stopped = await dashboard();
assert.ok("locked" in stopped);
assert.equal(stopped.locked, "400000");
assert.equal(stopped.positionUsdc, "0");
console.log(
  "Actual Anvil TD lock followed by delegation revocation stopped unsent public stub; funds remain locked, no automatic release.",
);
