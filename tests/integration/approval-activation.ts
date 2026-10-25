import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const directory = mkdtempSync(tmpdir() + "/approval-activation-");
process.env.DEMO_DB = directory + "/test.sqlite";
process.env.BANK_AGENT_CREDENTIAL_FILE = directory + "/agent";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.PUBLIC_ASSET_MODE = "stub";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "false";
process.env.DEMO_PROFILE = "standard";
process.env.AI_MODE = "stub";
const auth = await import("../../src/server/auth");
const secret = auth.issueHumanSession(null).token;
const agentSecret = auth.issueAgentCredential().token;
writeFileSync(process.env.BANK_AGENT_CREDENTIAL_FILE, agentSecret, {
  mode: 0o600,
});
const human = auth.authenticateRequest(
  new Request("http://127.0.0.1", {
    headers: { cookie: `bank_session=${secret}` },
  }),
)!;
const agent = auth.internalAgentPrincipal();
const { reset, dashboard } = await import("../../src/features/demo/service");
const { createDelegationProposal } = await import(
  "../../src/features/delegations/service"
);
const { beginDemoApproval, completeDemoApproval } = await import(
  "../../src/features/world/service"
);
const { readAuthorized } = await import("../../src/features/invoices/service");
const { proposeInvestment } = await import(
  "../../src/features/investment/service"
);
const { all, get } = await import("../../src/server/records");
const { POST } = await import("../../src/app/api/demo/approvals/route");
const confirm = (id: string) =>
  POST(
    new Request("http://127.0.0.1/api/demo/approvals", {
      method: "POST",
      headers: {
        host: "127.0.0.1",
        origin: "http://127.0.0.1",
        "content-type": "application/json",
        cookie: `bank_session=${secret}`,
      },
      body: JSON.stringify({ action: "confirm", id }),
    }),
  );
await reset(human);
const mail = createDelegationProposal(human, ["aoba-mail", "sakura-mail"]);
const mailChallenge = beginDemoApproval(
  { purpose: "delegation", proposalId: mail.id },
  human,
);
await completeDemoApproval(mailChallenge.id, human);
await readAuthorized(agent);
const proposal = await proposeInvestment(agent);
const challenge = beginDemoApproval(
  { purpose: "proposal", proposalId: proposal.proposal.id },
  human,
);
const result = await confirm(challenge.id);
assert.equal(result.status, 200);
const applied = await result.json();
assert.equal(applied.applied, true);
assert.equal(applied.activation.status, "completed");
assert.equal(all("investment_orders").length, 1);
const state = await dashboard();
assert.ok("locked" in state);
assert.equal(state.locked, "400000");
assert.equal(state.positionUsdc, "2500000000");
assert.equal((await confirm(challenge.id)).status, 409);
assert.equal(all("investment_orders").length, 1);
const rule = get<any>("rules", "investment");
const disabled = beginDemoApproval(
  {
    purpose: "change",
    change: {
      baseVersion: rule.version,
      conditions: { ...proposal.proposal.conditions, enabled: false },
    },
  },
  human,
);
const stopped = await (await confirm(disabled.id)).json();
assert.equal(stopped.activation, undefined);
assert.equal(all("investment_orders").length, 1);
// Approval remains valid even if the bank cannot begin execution.
const failedProposal = await proposeInvestment(agent);
const failedChallenge = beginDemoApproval(
  { purpose: "proposal", proposalId: failedProposal.proposal.id },
  human,
);
process.env.BANK_AGENT_CREDENTIAL_FILE = directory + "/missing-agent";
const failed = await (await confirm(failedChallenge.id)).json();
assert.equal(failed.applied, true);
assert.equal(failed.activation.status, "failed");
assert.ok(
  all<any>("messages")
    .at(-1)
    .text.includes("Investment terms are saved, but investing could not start"),
);
assert.equal(all("investment_orders").length, 1);
assert.equal((await confirm(failedChallenge.id)).status, 409);
console.log(
  "Passed: approval starts investment; duplicate approval cannot repeat; disable does not execute; execution failure preserves approval and is reported separately.",
);
