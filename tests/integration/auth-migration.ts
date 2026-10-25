import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashSignal } from "@worldcoin/idkit/hashing";
import type { Rule } from "../../src/shared/domain";

const copied = process.env.AUTH_MIGRATION_COPY === "1";
const directory = copied
  ? process.env.AUTH_MIGRATION_DIR!
  : mkdtempSync(tmpdir() + "/auth-migration-");
process.env.DEMO_DB = directory + (copied ? "/copy.sqlite" : "/source.sqlite");
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.PUBLIC_ASSET_MODE = "stub";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "false";
process.env.DEMO_PROFILE = "standard";
process.env.WORLD_MODE = "live";
process.env.WORLD_APP_ID = "app_test";
process.env.WORLD_RP_ID = "rp_test";
process.env.WORLD_RP_SIGNING_KEY = "11".repeat(32);
process.env.WORLD_ENVIRONMENT = "production";
delete process.env.CUSTODY_MASTER_KEY;
const rpc = new URL(process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:28549");
assert.ok(["localhost", "127.0.0.1"].includes(rpc.hostname));
process.env.ANVIL_RPC_URL = rpc.href;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://developer.world.org/api/v4/verify/rp_test") {
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
    "No external network in migration test",
  );
  return fetchOriginal(input, init);
};
const auth = await import("../../src/server/auth");
const login = await import("../../src/features/auth/service");
const world = await import("../../src/features/world/service");
const grants = await import("../../src/features/delegations/service");
const { sqlite } = await import("../../src/server/db");
const { get, put, instance, all } = await import("../../src/server/records");
const { reset, dashboard } = await import("../../src/features/demo/service");
const { readAuthorized } = await import("../../src/features/invoices/service");
const { proposePayment } = await import("../../src/features/rules/service");
const { payDue } = await import("../../src/features/banking/payment");
const { proposeInvestment, invest } = await import(
  "../../src/features/investment/service"
);
const { createRedemptionRequest, redeem } = await import(
  "../../src/features/investment/redemption"
);
let sequence = copied ? 100 : 0;
function proof(c: ReturnType<typeof login.beginLogin>) {
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
        session_nullifier: ["0x" + (++sequence).toString(16), "0x11"],
        expires_at_min: c.rpContext.expires_at,
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      },
    ],
  };
}
function principal(token: string, role: "human" | "agent") {
  return auth.authenticateRequest(
    new Request("http://localhost", {
      headers:
        role === "human"
          ? { cookie: `bank_session=${token}` }
          : { authorization: `Bearer ${token}` },
    }),
  )!;
}
async function worldLogin() {
  const c = login.beginLogin("login", "migration-browser");
  return principal(
    (await login.completeLogin("login", c.id, "migration-browser", proof(c)))
      .token,
    "human",
  );
}
if (!copied) {
  const human = principal(auth.issueHumanSession(null).token, "human");
  const agent = principal(auth.issueAgentCredential().token, "agent");
  await reset(human);
  const approve = async (input: unknown) =>
    world.completeDemoApproval(world.beginDemoApproval(input, human).id, human);
  const mail = grants.createDelegationProposal(human, [
    "aoba-mail",
    "sakura-mail",
  ]);
  await approve({ purpose: "delegation", proposalId: mail.id });
  await readAuthorized(agent);
  await approve({ purpose: "proposal", proposalId: proposePayment(agent).id });
  await payDue(agent, crypto.randomUUID());
  await approve({
    purpose: "proposal",
    proposalId: (await proposeInvestment(agent)).proposal.id,
  });
  await invest(agent, crypto.randomUUID());
  const enrollment = login.beginLogin(
    "enroll",
    "migration-browser",
    auth.issueEnrollmentTicket(),
  );
  await login.completeLogin(
    "enroll",
    enrollment.id,
    "migration-browser",
    proof(enrollment),
  );
  // A legacy copy retains assets/history but lacks the new actor-bound approvals.
  for (const rule of all<Rule>("rules")) {
    const { authorization, ...legacy } = rule;
    void authorization;
    put("rules", legacy);
  }
  sqlite.exec("DELETE FROM bank_delegations");
  await sqlite.backup(directory + "/copy.sqlite");
  const result = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      fileURLToPath(import.meta.url),
    ],
    {
      env: {
        ...process.env,
        AUTH_MIGRATION_COPY: "1",
        AUTH_MIGRATION_DIR: directory,
      },
      encoding: "utf8",
    },
  );
  process.stdout.write(result);
  assert.equal(
    all<{ status: string }>("investment_orders")[0].status,
    "invested",
    "Source fixture DB was not migrated or rewritten",
  );
} else {
  const oldHuman = principal(auth.issueHumanSession(null).token, "human");
  const oldAgent = principal(auth.issueAgentCredential().token, "agent");
  const oldRequest = createRedemptionRequest(oldHuman);
  const savedInstance = instance().id;
  const savedBinding = login.worldBinding();
  const history = all("payment_history");
  const orders = all("investment_orders");
  const before = await dashboard();
  assert.ok("locked" in before);
  assert.equal(before.locked, "400000");
  for (let i = 0; i < 2; i++)
    for (const rule of all<Rule>("rules"))
      assert.throws(() => world.assertRuleApproval(rule));
  assert.deepEqual(all("investment_orders"), orders);
  process.env.BANK_AUTH_MODE = "world";
  auth.authState();
  assert.throws(() => auth.requirePrincipal(oldHuman));
  assert.throws(() => auth.requirePrincipal(oldAgent));
  const human = await worldLogin();
  const agent = principal(auth.issueAgentCredential().token, "agent");
  await assert.rejects(invest(agent, crypto.randomUUID()));
  await assert.rejects(redeem(agent, oldRequest.id));
  await assert.rejects(reset(human), /Redeem all positions/);
  assert.deepEqual(all("payment_history"), history);
  assert.deepEqual(all("investment_orders"), orders);
  assert.equal(instance().id, savedInstance);
  assert.deepEqual(login.worldBinding(), savedBinding);
  const request = createRedemptionRequest(human);
  const [first, second] = await Promise.all([
    redeem(agent, request.id),
    redeem(agent, request.id),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(first.status, "completed");
  assert.equal(
    all("redemption_orders").length,
    1,
    "Only one frozen order is returned",
  );
  const after = await dashboard();
  assert.ok("td" in after);
  assert.equal(after.td, "800000");
  assert.equal(after.locked, "0");
  assert.equal(after.positionUsdc, "0");
  assert.equal(first.steps.filter((s) => s.mode === "anvil").length, 1);
  process.env.BANK_AUTH_MODE = "local-demo";
  auth.authState();
  process.env.BANK_AUTH_MODE = "world";
  auth.authState();
  for (const p of [oldHuman, oldAgent, human, agent])
    assert.throws(() => auth.requirePrincipal(p));
  const nextHuman = await worldLogin();
  const count = (table: string) =>
    (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
        n: number;
      }
    ).n;
  const proofs = count("world_used_proofs"),
    credentials = count("bank_credentials");
  await reset(nextHuman);
  assert.equal(count("world_used_proofs"), proofs);
  assert.equal(count("bank_credentials"), credentials);
  assert.deepEqual(login.worldBinding(), savedBinding);
  assert.notEqual(instance().id, savedInstance);
  assert.ok(
    (
      sqlite.prepare("SELECT COUNT(*) AS n FROM investment_orders").get() as {
        n: number;
      }
    ).n > 0,
    "Old asset history is retained across reset",
  );
  console.log(
    "Copied legacy fixture: no new execution without reapproval; mode changes invalidate sessions/requests; new World-mock login redeems original Anvil TD principal once; reset preserves binding/proof/auth/history. No public network used.",
  );
}
