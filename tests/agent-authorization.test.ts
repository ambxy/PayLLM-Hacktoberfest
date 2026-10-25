import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB =
  mkdtempSync(tmpdir() + "/bank-agent-auth-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
const { sqlite } = await import("../src/server/db");
const state = {
  id: "auth",
  clock: "2026-09-22T00:00:00Z",
  token: "0x0000000000000000000000000000000000000001",
  vault: "0x0000000000000000000000000000000000000002",
  customer: "0x0000000000000000000000000000000000000003",
  recipient: "0x0000000000000000000000000000000000000004",
  publicMode: "stub",
  treasuryUsdc: "10000000000",
  positionUsdc: "0",
};
sqlite
  .prepare("INSERT INTO demo_instances(id,state,status) VALUES(?,?,?)")
  .run(state.id, JSON.stringify(state), "ready");
sqlite.prepare("UPDATE control SET active_instance=?").run(state.id);
const auth = await import("../src/server/auth");
const records = await import("../src/server/records");
const delegations = await import("../src/features/delegations/service");
const world = await import("../src/features/world/service");
const rules = await import("../src/features/rules/service");
const invoices = await import("../src/features/invoices/service");
const { payDue } = await import("../src/features/banking/payment");
const { invest } = await import("../src/features/investment/service");
const { redeem, createRedemptionRequest } = await import(
  "../src/features/investment/redemption"
);
const { prepare, verify } = await import("../src/features/agents/service");
const { supplyAndDeposit } = await import("../src/integrations/aave");
const { serialized } = await import("../src/server/mutex");
const humanToken = auth.issueHumanSession(null).token,
  agentToken = auth.issueAgentCredential().token;
const human = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { cookie: `bank_session=${humanToken}` },
  }),
)!;
const agent = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { authorization: `Bearer ${agentToken}` },
  }),
)!;
async function mailGrant() {
  const p = delegations.createDelegationProposal(human, [
    "aoba-mail",
    "sakura-mail",
  ]);
  const c = world.beginDemoApproval(
    { purpose: "delegation", proposalId: p.id },
    human,
  );
  await world.completeDemoApproval(c.id, human);
}
async function paymentGrant() {
  await invoices.readAuthorized(agent);
  const p = rules.proposePayment(agent);
  const c = world.beginDemoApproval(
    { purpose: "proposal", proposalId: p.id },
    human,
  );
  await world.completeDemoApproval(c.id, human);
}
test("agent API boundaries and immutable authorization", async (t) => {
  await t.test(
    "no scope/human/spoofed principal rejected before run or clock mutation",
    async () => {
      for (const p of [agent, human, { ...agent }]) {
        await assert.rejects(payDue(p, "denied-payment"));
        await assert.rejects(invest(p, "denied-investment"));
        await assert.rejects(redeem(p, "fake-message"));
      }
      assert.equal(records.all("runs").length, 0);
      assert.equal(records.instance().clock, state.clock);
    },
  );
  await t.test(
    "explicit demo approval permits only authorized source read",
    async () => {
      await mailGrant();
      assert.equal((await invoices.readAuthorized(agent)).length, 2);
      records.put("invoices", {
        id: "secret",
        emailId: "unapproved",
        amountJpy: "1",
      });
      assert.equal((await invoices.readAuthorized(agent)).length, 2);
    },
  );
  await t.test(
    "read resources are strict and derived data require current source permissions",
    async () => {
      const { agentRead, readRequest } = await import(
        "../src/features/agents/read"
      );
      assert.throws(() => readRequest.parse({ resource: "run" }));
      assert.throws(() =>
        readRequest.parse({ resource: "balance", rpc: "http://attacker" }),
      );
      assert.throws(() => readRequest.parse({ resource: "unknown" }));
      assert.deepEqual(await agentRead(agent, { resource: "rules" }), {
        rules: [],
      });
      await assert.rejects(
        agentRead(agent, { resource: "cashflow" }),
        /Unpermitted source/,
      );
      await assert.rejects(
        agentRead(agent, { resource: "run", runId: crypto.randomUUID() }),
        /Unpermitted source/,
      );
    },
  );
  await t.test(
    "Intent binds principal, credential, delegation, amount and destination",
    async () => {
      await paymentGrant();
      const intent = await prepare(agent, {
        kind: "payment",
        sourceId: "invoice",
        ruleVersion: 1,
        amountJpy: "200000",
        recipient: state.recipient,
      });
      await verify(agent, intent);
      for (const patch of [
        { amountJpy: "200001" },
        { accountId: "foreign" },
        { agentId: "foreign" },
        { recipient: state.customer },
        { generation: 0 },
        { delegationVersion: 999 },
      ])
        await assert.rejects(verify(agent, { ...intent, ...patch }));
      await assert.rejects(verify(human, intent));
      await assert.rejects(verify({ ...agent }, intent));
    },
  );
  await t.test(
    "raw user message is never a redemption capability",
    async () => {
      records.put("messages", {
        id: "fake",
        role: "user",
        text: "Redeem all investments to TD",
      });
      await assert.rejects(redeem(agent, "fake"));
      assert.throws(() => createRedemptionRequest(agent));
    },
  );
  await t.test(
    "human redemption request freezes orders and expires with source credential",
    async () => {
      const issuer = auth.issueHumanSession(null);
      const source = auth.authenticateRequest(
        new Request("http://localhost", {
          headers: { cookie: `bank_session=${issuer.token}` },
        }),
      )!;
      records.put("investment_orders", {
        id: "original",
        status: "invested",
        customer: state.customer,
        lockId: "0x01",
        amountJpy: "1600",
        usdcUnits: "10000000",
        intentId: "original",
        runId: "original",
      });
      const request = createRedemptionRequest(source);
      assert.equal(request.orders.length, 1);
      records.put("investment_orders", {
        ...request.orders[0],
        amountJpy: "9999",
      });
      await assert.rejects(redeem(agent, request.id), /Position changed/);
      records.put("investment_orders", request.orders[0]);
      auth.revokeCredential(issuer.credentialId);
      await assert.rejects(redeem(agent, request.id));
      assert.equal(records.get("runs", request.id), undefined);
    },
  );
  await t.test("unknown tool arguments and human Cookie denied", async () => {
    const { POST } = await import("../src/app/api/agent/payments/route");
    const request = (body: unknown, credential: string) =>
      new Request("http://localhost/api/agent/payments", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "application/json",
          authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await POST(
          request(
            { requestId: crypto.randomUUID(), calldata: "0x" },
            agentToken,
          ),
        )
      ).status,
      400,
    );
    const humanRequest = new Request("http://localhost/api/agent/payments", {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": "application/json",
        cookie: `bank_session=${humanToken}`,
      },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    assert.equal((await POST(humanRequest)).status, 403);
  });
  await t.test(
    "queued cancellation beats unsent stub stage and cached response",
    async () => {
      const before = records.instance().treasuryUsdc;
      let release!: () => void;
      const held = serialized(() => new Promise<void>((r) => (release = r)));
      await Promise.resolve();
      const delegation = delegations.assertScope(agent, "payment");
      const revoked = delegations.revokeDelegation(delegation.id, human);
      const stage = supplyAndDeposit("blocked-public", "100", () =>
        delegations.assertScope(agent, "payment"),
      );
      release();
      await held;
      await revoked;
      await assert.rejects(stage);
      assert.equal(records.instance().treasuryUsdc, before);
      records.put("runs", {
        id: "cached",
        kind: "payment",
        status: "completed",
        steps: [],
      });
      await assert.rejects(payDue(agent, "cached"));
    },
  );
  await t.test(
    "balance response rechecks read authority after awaited RPC",
    async () => {
      const { agentRead } = await import("../src/features/agents/read");
      const { client } = await import("../src/integrations/td-ledger");
      const original = client.readContract;
      let release!: (amount: bigint) => void;
      const pending = new Promise<bigint>((resolve) => (release = resolve));
      client.readContract = (() => pending) as typeof original;
      try {
        const response = agentRead(agent, { resource: "balance" });
        const d = delegations.assertScope(agent, "read");
        await delegations.revokeDelegation(d.id, human);
        release(0n);
        await assert.rejects(response);
      } finally {
        client.readContract = original;
      }
      await mailGrant();
    },
  );
  await t.test(
    "revoked mail hides previously loaded content; world rejects demo credentials",
    async () => {
      const d = delegations.assertScope(agent, "mail");
      await delegations.revokeDelegation(d.id, human);
      await assert.rejects(invoices.readAuthorized(agent));
      process.env.BANK_AUTH_MODE = "world";
      assert.throws(() => auth.requirePrincipal(agent));
      await assert.rejects(payDue(agent, "cached"));
    },
  );
});
