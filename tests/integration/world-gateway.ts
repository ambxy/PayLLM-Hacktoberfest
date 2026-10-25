import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { hashSignal } from "@worldcoin/idkit/hashing";
import type { Rule } from "../../src/shared/domain";

process.env.DEMO_DB =
  mkdtempSync(tmpdir() + "/world-gateway-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "world";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.WORLD_MODE = "live";
process.env.WORLD_APP_ID = "app_test";
process.env.WORLD_RP_ID = "rp_test";
process.env.WORLD_RP_SIGNING_KEY = "11".repeat(32);
process.env.WORLD_ENVIRONMENT = "production";
process.env.PUBLIC_ASSET_MODE = "stub";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "false";
process.env.DEMO_PROFILE = "standard";
delete process.env.CUSTODY_MASTER_KEY;
const rpc = new URL(process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:18545");
assert.ok(["localhost", "127.0.0.1"].includes(rpc.hostname));
process.env.ANVIL_RPC_URL = rpc.href;
const world = await import("../../src/features/world/service");
const { reset, dashboard } = await import("../../src/features/demo/service");
const auth = await import("../../src/server/auth");
const login = await import("../../src/features/auth/service");
const { createDelegationProposal } = await import(
  "../../src/features/delegations/service"
);
const { readAuthorized } = await import("../../src/features/invoices/service");
const { proposePayment } = await import("../../src/features/rules/service");
const { proposeInvestment } = await import(
  "../../src/features/investment/service"
);
let human: import("../../src/server/auth").Principal;
let agent: import("../../src/server/auth").Principal;
const { get, put } = await import("../../src/server/records");
const { payDue } = await import("../../src/features/banking/payment");
const { invest } = await import("../../src/features/investment/service");
let n = 0;
function proof(
  c: Pick<ReturnType<typeof world.beginChallenge>, "rpContext" | "signal">,
) {
  return {
    protocol_version: "4.0",
    user_presence_completed: true,
    session_id: "session_" + "1".repeat(128),
    environment: "production",
    nonce: c.rpContext.nonce,
    integrity_bundle: {
      version: 2,
      signature_format: "apple_app_attest",
      signature: "fixture",
      jwt: "fixture",
      timestamp: Math.floor(Date.now() / 1000),
    },
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        signal_hash: hashSignal(c.signal),
        session_nullifier: ["0x" + (++n).toString(16), "0x11"],
        expires_at_min: c.rpContext.expires_at,
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      },
    ],
  };
}
async function verify(c: ReturnType<typeof world.beginChallenge>) {
  return world.completeChallenge(c.id, "browser", proof(c), human);
}
test("World-authorized Gateway pays real local TD and respects approved minimum on automatic stub investment", async () => {
  const originalFetch = globalThis.fetch;
  let verifications = 0;
  mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://developer.world.org/api/v4/verify/rp_test") {
        verifications++;
        const p = JSON.parse(init!.body as string);
        return Response.json({
          success: true,
          session_id: p.session_id,
          environment: "production",
          results: [{ identifier: "proof_of_human", success: true }],
        });
      }
      assert.equal(
        new URL(url).origin,
        rpc.origin,
        "No external RPC permitted in this test",
      );
      return originalFetch(input, init);
    },
  );
  try {
    const enrollment = login.beginLogin(
      "enroll",
      "browser",
      auth.issueEnrollmentTicket(),
    );
    const enrolled = await login.completeLogin(
      "enroll",
      enrollment.id,
      "browser",
      proof(enrollment),
    );
    human = auth.authenticateRequest(
      new Request("http://localhost", {
        headers: { cookie: `bank_session=${enrolled.token}` },
      }),
    )!;
    agent = auth.authenticateRequest(
      new Request("http://localhost", {
        headers: {
          authorization: `Bearer ${auth.issueAgentCredential().token}`,
        },
      }),
    )!;
    await reset(human);
    const mail = createDelegationProposal(human, ["aoba-mail", "sakura-mail"]);
    await verify(
      world.beginChallenge(
        { purpose: "delegation", proposalId: mail.id },
        "browser",
        human,
      ),
    );
    await readAuthorized(agent);
    const payment = proposePayment(agent);
    const cp = world.beginChallenge(
      { purpose: "proposal", proposalId: payment.id },
      "browser",
      human,
    );
    await verify(cp);
    const approvedPayment = get<Rule>("rules", "payment")!;
    put("rules", {
      ...approvedPayment,
      minimumBalanceJpy: "0",
      maxPaymentJpy: "900000",
    });
    await assert.rejects(
      payDue(agent, randomUUID()),
      /Approved delegation required/,
    );
    put("rules", approvedPayment);
    const paid = await payDue(agent, randomUUID());
    assert.equal(paid.status, "completed");
    assert.ok(paid.steps.some((s) => s.mode === "anvil" && s.hash));
    const afterPayment = await dashboard();
    assert.ok("td" in afterPayment);
    assert.equal(afterPayment.td, "800000");
    const { proposal: investment } = await proposeInvestment(agent);
    const ci = world.beginChallenge(
      { purpose: "proposal", proposalId: investment.id },
      "browser",
      human,
    );
    await verify(ci);
    const rule = get<Rule>("rules", "investment")!;
    const input = {
      baseVersion: rule.version,
      conditions: { ...investment.conditions, minimumBalanceJpy: "700000" },
    };
    const cc = world.beginChallenge(
      { purpose: "change", change: input },
      "browser",
      human,
    );
    await verify(cc);
    const callsBefore = verifications;
    const invested = await invest(agent, randomUUID());
    assert.equal(invested.status, "completed");
    assert.equal(
      verifications,
      callsBefore,
      "Automatic execution does not prompt World again",
    );
    const after = await dashboard();
    assert.ok("td" in after);
    assert.equal(after.td, "700000");
    assert.equal(after.locked, "100000");
    assert.equal(after.positionUsdc, "625000000");
    const authorized = get<Rule>("rules", "investment")!;
    put("rules", { ...authorized, minimumBalanceJpy: "0" });
    await assert.rejects(
      invest(agent, randomUUID()),
      /Approved delegation required/,
    );
    const rejected = await dashboard();
    assert.ok("locked" in rejected);
    assert.equal(rejected.locked, "100000");
  } finally {
    mock.restoreAll();
  }
});
