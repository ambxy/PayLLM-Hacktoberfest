import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(tmpdir() + "/external-redemption-");
Object.assign(process.env, {
  DEMO_DB: directory + "/test.sqlite",
  BANK_AGENT_CREDENTIAL_FILE: directory + "/agent",
  BANK_AUTH_MODE: "local-demo",
  BANK_BIND_HOST: "127.0.0.1",
  PUBLIC_ASSET_MODE: "stub",
  PUBLIC_TRANSACTIONS_ENABLED: "false",
  DEMO_PROFILE: "standard",
  AI_MODE: "stub",
  WORLD_AGENTS_CLIENT_ID: "integration-client",
  WORLD_AGENTS_CLIENT_SECRET: "integration-secret",
  WORLD_AGENTS_REDIRECT_URI: "https://bank.example/api/world-agents/callback",
});
const auth = await import("../../src/server/auth");
const { sqlite } = await import("../../src/server/db");
const { reset, dashboard } = await import("../../src/features/demo/service");
const { chat } = await import("../../src/features/chat/service");
const { grantPaymentDataRequest } = await import(
  "../../src/features/demo-plan/service"
);
const world = await import("../../src/features/world-agents/service");
const { worldAgentsConfig } = await import(
  "../../src/integrations/world-agents"
);
const external = await import("../../src/features/external-agents/service");
const route = await import(
  "../../src/app/api/external-agent/redemptions/route"
);
const human = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { cookie: `bank_session=${auth.issueHumanSession(null).token}` },
  }),
)!;
const browser = "a".repeat(64);
function verifiedProofFixture() {
  // Test-only verified identity fixture. Official OIDC verification is covered separately.
  world.worldCheckStatus(browser);
  const state = randomUUID(),
    owner = auth.hashSecret(browser);
  const data = {
    state,
    browser: owner,
    startedAt: Date.now(),
    expiresAt: Date.now() + 300000,
    status: "verified",
    config: auth.hashSecret(JSON.stringify(worldAgentsConfig())),
    identity: {
      issuer: "https://sandbox.auth.world.org",
      subject: "test-human",
      authTime: Math.floor(Date.now() / 1000),
    },
  };
  sqlite
    .prepare(
      "INSERT INTO world_agent_checks VALUES(?,?,?) ON CONFLICT(browser) DO UPDATE SET state=excluded.state,data=excluded.data",
    )
    .run(owner, state, JSON.stringify(data));
}
function request(token: string) {
  return new Request("http://localhost/api/external-agent/redemptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "redeem-approved" }),
  });
}
before(async () => {
  writeFileSync(
    process.env.BANK_AGENT_CREDENTIAL_FILE!,
    auth.issueAgentCredential().token,
    { mode: 0o600 },
  );
  await reset(human);
  const messages = await chat(human, grantPaymentDataRequest);
  const proposal = messages.at(-1)!.data!.proposal as { id: string };
  await chat(human, "Yes", proposal.id);
  const d = await dashboard();
  assert.ok("td" in d);
  assert.equal(d.td, "0");
  assert.equal(d.locked, "1000000");
  verifiedProofFixture();
  external.connectAccount(human, browser);
});
test("external agent without redemption permission cannot move funds", async () => {
  const grant = external.grantBalance(human, browser, "Read-only AI");
  const response = await route.POST(request(grant.token));
  assert.equal(response.status, 403);
  const d = await dashboard();
  assert.ok("td" in d);
  assert.equal(d.td, "0");
  assert.equal(d.locked, "1000000");
  assert.equal(d.positionUsdc, "6250000000");
});
test("authorized external agent returns Aave funds through token account to deposit", async () => {
  verifiedProofFixture();
  const quote = external.connectionStatus(human, browser).redemptionQuote!;
  const grant = external.grantBalance(
    human,
    browser,
    "Redemption AI",
    undefined,
    quote.hash,
  );
  const response = await route.POST(request(grant.token));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "completed");
  const d = await dashboard();
  assert.ok("td" in d);
  assert.equal(d.td, "1000000");
  assert.equal(d.locked, "0");
  assert.equal(d.positionUsdc, "0");
  assert.equal(d.looseUsdc, "0");
});
