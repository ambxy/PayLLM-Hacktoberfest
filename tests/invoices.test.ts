import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DEMO_DB = mkdtempSync(tmpdir() + "/td-invoices-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
const { sqlite } = await import("../src/server/db");
sqlite.prepare("INSERT INTO demo_instances(id,state,status) VALUES(?,?,?)").run(
  "test",
  JSON.stringify({
    id: "test",
    token: "0x0000000000000000000000000000000000000001",
    vault: "0x0000000000000000000000000000000000000002",
    customer: "0x0000000000000000000000000000000000000003",
    recipient: "0x0000000000000000000000000000000000000004",
  }),
  "ready",
);
sqlite.prepare("UPDATE control SET active_instance=?").run("test");
const { put } = await import("../src/server/records");
const { listInvoices } = await import("../src/features/invoices/service");
const { proposePayment } = await import("../src/features/rules/service");

const auth = await import("../src/server/auth");
const { createDelegationProposal } = await import(
  "../src/features/delegations/service"
);
const { beginDemoApproval, completeDemoApproval } = await import(
  "../src/features/world/service"
);
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
async function approve(input: unknown) {
  const c = beginDemoApproval(input, human);
  await completeDemoApproval(c.id, human);
}
test("payment consent schedules both explicitly proposed invoice recipients", async () => {
  const aoba = {
    id: "aoba-invoice",
    emailId: "aoba-mail",
    issuer: "Aoba",
    number: "A-1",
    recipientId: "aoba",
    amountJpy: "200000",
    dueAt: "2026-10-01T03:00:00.000Z",
    recurrenceKey: "aoba-services",
    status: "scheduled" as const,
  };
  const sakura = {
    ...aoba,
    id: "sakura-invoice",
    recipientId: "sakura",
    amountJpy: "100000",
    status: "scheduled" as const,
  };
  const paid = { ...aoba, id: "paid-invoice", status: "paid" as const };
  put("invoices", aoba);
  put("invoices", sakura);
  put("invoices", paid);

  assert.deepEqual(
    listInvoices().invoices.map((invoice) => invoice.id),
    ["paid-invoice"],
  );

  const grant = createDelegationProposal(human, ["aoba-mail", "sakura-mail"]);
  await approve({ purpose: "delegation", proposalId: grant.id });
  const proposal = proposePayment(agent);
  assert.deepEqual(
    proposal.conditions.paymentRecipients?.map((recipient) => [
      recipient.recipientId,
      recipient.maxPaymentJpy,
      recipient.monthlyLimitJpy,
    ]),
    [
      ["aoba", "200000", "200000"],
      ["sakura", "100000", "100000"],
    ],
  );
  put("messages", {
    id: "consent",
    role: "user",
    text: "Confirm these settings",
  });
  await approve({ purpose: "proposal", proposalId: proposal.id });
  assert.deepEqual(
    listInvoices().invoices.map((invoice) => invoice.id),
    ["aoba-invoice", "sakura-invoice", "paid-invoice"],
  );
});
