import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DEMO_DB = mkdtempSync(tmpdir() + "/world-agents-") + "/test.sqlite";
process.env.WORLD_AGENTS_CLIENT_ID = "test-client";
process.env.WORLD_AGENTS_CLIENT_SECRET = "test-secret";
process.env.WORLD_AGENTS_REDIRECT_URI =
  "https://bank.example/api/world-agents/callback";
const service = await import("../src/features/world-agents/service");
const integration = await import("../src/integrations/world-agents");
const route = await import("../src/app/api/world-agents/[action]/route");
const { sqlite } = await import("../src/server/db");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const issuer = integration.worldAgentsIssuer;
let authorization: URL;
let overrides: Record<string, unknown>;
let invalidSignature: boolean;
let exchangeCount: number;
let duringExchange: (() => void) | undefined;
const owner = "a".repeat(64);

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      sub: "test-human",
      aud: "test-client",
      exp: now + 300,
      iat: now,
      auth_time: now,
      nonce: authorization.searchParams.get("nonce"),
      acr: integration.worldAgentsAcr,
      amr: ["pop"],
      ...overrides,
    }),
  ).toString("base64url");
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    privateKey,
  );
  if (invalidSignature) signature[0] ^= 1;
  return `${header}.${payload}.${signature.toString("base64url")}`;
}
beforeEach(() => {
  service.worldCheckStatus(owner);
  sqlite.exec("DELETE FROM world_agent_checks");
  overrides = {};
  invalidSignature = false;
  exchangeCount = 0;
  duringExchange = undefined;
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration"))
        return Response.json({
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
          response_types_supported: ["code"],
          subject_types_supported: ["pairwise"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        });
      if (url.endsWith("/jwks"))
        return Response.json({
          keys: [
            {
              ...publicKey.export({ format: "jwk" }),
              kid: "test-key",
              alg: "RS256",
              use: "sig",
            },
          ],
        });
      if (url.endsWith("/token")) {
        exchangeCount++;
        assert.match(
          new Headers(init?.headers).get("authorization")!,
          /^Basic /,
        );
        const body = new URLSearchParams(String(init?.body));
        assert.equal(
          body.get("redirect_uri"),
          process.env.WORLD_AGENTS_REDIRECT_URI,
        );
        assert.ok(body.get("code_verifier"));
        duringExchange?.();
        return Response.json({
          id_token: token(),
          access_token: "not-for-bank-access",
          token_type: "Bearer",
          expires_in: 300,
        });
      }
      throw new Error("Unexpected test URL");
    },
  );
});
afterEach(() => mock.restoreAll());
async function begin() {
  authorization = await service.beginWorldCheck(owner);
}
function callback(extra: Record<string, string> = {}) {
  const url = new URL(process.env.WORLD_AGENTS_REDIRECT_URI!);
  url.search = new URLSearchParams({
    state: authorization.searchParams.get("state")!,
    code: "test-code",
    ...extra,
  }).toString();
  return url;
}
test("official contract uses fresh proof, PKCE and nonce; signature-verified identity stays on backend", async () => {
  await begin();
  assert.equal(authorization.searchParams.get("scope"), "openid");
  assert.equal(authorization.searchParams.get("max_age"), "0");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("nonce"));
  await service.completeWorldCheck(owner, callback());
  assert.deepEqual(service.worldCheckStatus(owner), {
    status: "verified",
    sameHuman: false,
  });
  const row = sqlite.prepare("SELECT data FROM world_agent_checks").get() as {
    data: string;
  };
  assert.equal(JSON.parse(row.data).verifier, undefined);
  assert.equal(JSON.parse(row.data).nonce, undefined);
  assert.equal(row.data.includes("not-for-bank-access"), false);
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(exchangeCount, 1);
  await begin();
  await service.completeWorldCheck(owner, callback());
  assert.deepEqual(service.worldCheckStatus(owner), {
    status: "verified",
    sameHuman: true,
  });
});
test("wrong browser and state never exchange a code", async () => {
  await begin();
  await assert.rejects(service.completeWorldCheck("b".repeat(64), callback()));
  await assert.rejects(
    service.completeWorldCheck(owner, callback({ state: "wrong" })),
  );
  assert.equal(exchangeCount, 0);
  assert.equal(service.worldCheckStatus(owner).status, "pending");
});
test("cancelled and expired attempts cannot authenticate", async () => {
  await begin();
  service.cancelWorldCheck(owner);
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(service.worldCheckStatus(owner).status, "cancelled");
  await begin();
  sqlite
    .prepare(
      "UPDATE world_agent_checks SET data=json_set(data,'$.expiresAt',0)",
    )
    .run();
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(service.worldCheckStatus(owner).status, "expired");
  assert.equal(exchangeCount, 0);
});
test("provider denial is a failed path, and cancelling during exchange wins", async () => {
  await begin();
  const denied = callback({ error: "access_denied" });
  denied.searchParams.delete("code");
  await assert.rejects(service.completeWorldCheck(owner, denied));
  assert.equal(service.worldCheckStatus(owner).status, "cancelled");
  assert.equal(exchangeCount, 0);
  await begin();
  duringExchange = () => service.cancelWorldCheck(owner);
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(service.worldCheckStatus(owner).status, "cancelled");
});
test("forged signature, wrong issuer/audience/nonce, stale proof and unsupported assurance fail", async () => {
  for (const claims of [
    { iss: "https://other.example" },
    { aud: "other-client" },
    { nonce: "wrong" },
    { exp: 1 },
    { auth_time: 1 },
    { auth_time: Math.floor(Date.now() / 1000) + 300 },
    { acr: "other" },
    { amr: ["pwd"] },
  ]) {
    await begin();
    overrides = claims;
    await assert.rejects(service.completeWorldCheck(owner, callback()));
    assert.equal(service.worldCheckStatus(owner).status, "failed");
  }
  await begin();
  overrides = {};
  invalidSignature = true;
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(service.worldCheckStatus(owner).status, "failed");
});
test("reauthentication as another identity is rejected", async () => {
  await begin();
  await service.completeWorldCheck(owner, callback());
  await begin();
  overrides = { sub: "different-human" };
  await assert.rejects(service.completeWorldCheck(owner, callback()));
  assert.equal(service.worldCheckStatus(owner).status, "failed");
});
test("HTTP rejects cross-origin starts and exposes neither identity nor bank permissions", async () => {
  const request = (origin: string) =>
    new Request("https://bank.example/api/world-agents/begin", {
      method: "POST",
      headers: {
        host: "bank.example",
        origin,
        "content-type": "application/json",
      },
      body: "{}",
    });
  assert.equal((await route.POST(request("https://evil.example"))).status, 403);
  const started = await route.POST(request("https://bank.example"));
  assert.equal(started.status, 200);
  assert.match(
    started.headers.get("set-cookie")!,
    /HttpOnly; SameSite=Lax; Path=\/; Max-Age=1800; Secure/,
  );
  authorization = new URL((await started.json()).authorizationUrl);
  const cookie = started.headers.get("set-cookie")!.split(";")[0];
  const result = await route.GET(
    new Request(callback(), { headers: { cookie } }),
  );
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "/world-agents");
  const status = await route.GET(
    new Request("https://bank.example/api/world-agents/status", {
      headers: { cookie },
    }),
  );
  assert.deepEqual(await status.json(), {
    configured: true,
    status: "verified",
    sameHuman: false,
    environment: "sandbox",
    bankAccess: false,
  });
});

const external = await import("../src/features/external-agents/service");
const bankAuth = await import("../src/server/auth");
const ledger = await import("../src/integrations/td-ledger");
const externalRoute = await import(
  "../src/app/api/external-agent/balance/route"
);
function bankFixture() {
  process.env.BANK_AUTH_MODE = "local-demo";
  process.env.BANK_BIND_HOST = "127.0.0.1";
  const human = bankAuth.issueHumanSession(null);
  const request = new Request("https://bank.example", {
    headers: { cookie: `bank_session=${human.token}` },
  });
  const p = bankAuth.authenticateRequest(request)!;
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS external_world_accounts (account_id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS external_agent_grants (id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,proof TEXT UNIQUE NOT NULL,data TEXT NOT NULL); DELETE FROM external_world_accounts; DELETE FROM external_agent_grants;",
  );
  const state = {
    id: "external-demo",
    token: "0x0000000000000000000000000000000000000001",
    customer: ledger.customer,
    vault: "0x0000000000000000000000000000000000000002",
  };
  sqlite
    .prepare("INSERT OR REPLACE INTO demo_instances VALUES(?,?,?)")
    .run(state.id, JSON.stringify(state), "active");
  sqlite
    .prepare("UPDATE control SET active_instance=? WHERE id=1")
    .run(state.id);
  return { p, human };
}
test("authorized external agent can read the account balance", async () => {
  const { p } = bankFixture();
  await begin();
  await service.completeWorldCheck(owner, callback());
  external.connectAccount(p, owner);
  const grant = external.grantBalance(p, owner, "Demo AI");
  mock.method(ledger.client, "readContract", async () => 1250n);
  const response = await externalRoute.GET(
    new Request("https://bank.example/api/external-agent/balance", {
      headers: { authorization: `Bearer ${grant.token}` },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    account: "Account A",
    asset: "TD",
    unit: "JPY",
    available: "1250",
    locked: "1250",
    scope: "balance:read",
    environment: "demo",
  });
  assert.equal(service.worldCheckStatus(owner).status, "used");
  assert.throws(() => external.grantBalance(p, owner, "Second AI"));
  await begin();
  overrides = { sub: "different-human" };
  await assert.rejects(service.completeWorldCheck(owner, callback()));
});

test("external agent without permission cannot read the account balance", async () => {
  const { p } = bankFixture();
  await begin();
  await service.completeWorldCheck(owner, callback());
  external.connectAccount(p, owner);
  const read = mock.method(ledger.client, "readContract", async () => 1250n);
  const response = await externalRoute.GET(
    new Request("https://bank.example/api/external-agent/balance", {
      headers: {
        authorization: `Bearer abg.00000000-0000-4000-8000-000000000001.${"b".repeat(64)}`,
      },
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(read.mock.callCount(), 0);
});

function connectionPost(action: string, humanToken: string, body: object = {}) {
  return new Request(`https://bank.example/api/world-agents/${action}`, {
    method: "POST",
    headers: {
      host: "bank.example",
      origin: "https://bank.example",
      "content-type": "application/json",
      cookie: `bank_session=${humanToken}; world_agents_browser=${owner}`,
    },
    body: JSON.stringify(body),
  });
}
function grantCount() {
  return (
    sqlite.prepare("SELECT COUNT(*) AS n FROM external_agent_grants").get() as {
      n: number;
    }
  ).n;
}

test("connection approval starts before World and completes once after the callback", async () => {
  const { human } = bankFixture();
  const started = await route.POST(
    connectionPost("begin-connection", human.token, {
      name: "My approved agent",
    }),
  );
  assert.equal(started.status, 200);
  authorization = new URL((await started.json()).authorizationUrl);
  assert.equal(authorization.searchParams.get("max_age"), "0");
  assert.equal(grantCount(), 0);
  const early = await route.POST(
    connectionPost("complete-connection", human.token),
  );
  assert.notEqual(early.status, 200);
  assert.equal(grantCount(), 0);
  const result = await route.GET(
    new Request(callback(), {
      headers: { cookie: `world_agents_browser=${owner}` },
    }),
  );
  assert.equal(result.headers.get("location"), "/world-agents/connect");
  assert.equal(grantCount(), 0);
  const tampered = await route.POST(
    connectionPost("complete-connection", human.token, {
      name: "Changed",
      redemptionHash: "a".repeat(64),
    }),
  );
  assert.equal(tampered.status, 400);
  assert.equal(grantCount(), 0);
  const completed = await route.POST(
    connectionPost("complete-connection", human.token),
  );
  assert.equal(completed.status, 200);
  const credential = await completed.json();
  assert.equal(credential.scope, "balance:read");
  assert.match(credential.token, external.externalTokenPattern);
  const stored = sqlite
    .prepare("SELECT data FROM external_agent_grants")
    .get() as { data: string };
  assert.equal(JSON.parse(stored.data).name, "My approved agent");
  assert.equal(stored.data.includes(credential.token), false);
  assert.equal(
    (await route.POST(connectionPost("complete-connection", human.token)))
      .status,
    403,
  );
  assert.equal(grantCount(), 1);
});

test("cancelled, expired, denied and invalid World verification never issue connection credentials", async () => {
  for (const outcome of [
    "cancelled",
    "expired",
    "denied",
    "invalid-signature",
  ] as const) {
    const { p, human } = bankFixture();
    invalidSignature = false;
    authorization = await external.beginAgentConnection(p, owner, {
      name: "Demo AI",
    });
    if (outcome === "cancelled") service.cancelWorldCheck(owner);
    if (outcome === "expired")
      sqlite
        .prepare(
          "UPDATE world_agent_checks SET data=json_set(data,'$.expiresAt',0)",
        )
        .run();
    if (outcome === "invalid-signature") invalidSignature = true;
    const url = callback(
      outcome === "denied" ? { error: "access_denied" } : {},
    );
    if (outcome === "denied") url.searchParams.delete("code");
    const result = await route.GET(
      new Request(url, {
        headers: { cookie: `world_agents_browser=${owner}` },
      }),
    );
    assert.equal(result.headers.get("location"), "/world-agents");
    assert.notEqual(
      (await route.POST(connectionPost("complete-connection", human.token)))
        .status,
      200,
    );
    assert.equal(grantCount(), 0);
    assert.equal(
      (
        sqlite
          .prepare("SELECT COUNT(*) AS n FROM external_world_accounts")
          .get() as { n: number }
      ).n,
      0,
    );
  }
});

test("pending selection cannot use an unrelated verification or survive an account reset", async () => {
  const { p } = bankFixture();
  authorization = await external.beginAgentConnection(p, owner, {
    name: "Demo AI",
  });
  await begin();
  await service.completeWorldCheck(owner, callback());
  assert.throws(() => external.completeAgentConnection(p, owner));
  assert.equal(grantCount(), 0);
  authorization = await external.beginAgentConnection(p, owner, {
    name: "Demo AI",
  });
  await service.completeWorldCheck(owner, callback());
  sqlite.prepare("UPDATE control SET active_instance=NULL WHERE id=1").run();
  assert.throws(() => external.completeAgentConnection(p, owner));
  assert.equal(grantCount(), 0);
});

test("expired connection selection is rejected even with a fresh verified result", async () => {
  const { p } = bankFixture();
  authorization = await external.beginAgentConnection(p, owner, {
    name: "Demo AI",
  });
  await service.completeWorldCheck(owner, callback());
  sqlite
    .prepare(
      "UPDATE external_agent_connection_requests SET data=json_set(data,'$.expiresAt',0)",
    )
    .run();
  assert.throws(() => external.completeAgentConnection(p, owner));
  assert.equal(grantCount(), 0);
});

test("connection requests require bank login and cannot approve an unavailable redemption", async () => {
  const { human } = bankFixture();
  assert.equal(
    (
      await route.POST(
        connectionPost("begin-connection", "invalid", { name: "Demo AI" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await route.POST(
        connectionPost("begin-connection", human.token, {
          name: "Demo AI",
          redemptionHash: "a".repeat(64),
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await route.POST(
        connectionPost("begin-connection", human.token, {
          name: "Demo AI",
          scope: "admin",
        }),
      )
    ).status,
    400,
  );
  assert.equal(grantCount(), 0);
});

test("operation approval binds selected positions and rolls back if they change during verification", async () => {
  const records = await import("../src/server/records");
  const { p } = bankFixture();
  const order = {
    id: "approved-position",
    status: "invested",
    amountJpy: "800000",
  };
  records.put("investment_orders", order);
  const quote = external.connectionStatus(p, owner).redemptionQuote!;
  authorization = await external.beginAgentConnection(p, owner, {
    name: "Deposit agent",
    redemptionHash: quote.hash,
  });
  await service.completeWorldCheck(owner, callback());
  records.put("investment_orders", { ...order, amountJpy: "900000" });
  assert.throws(() => external.completeAgentConnection(p, owner));
  assert.equal(grantCount(), 0);
  assert.equal(
    (
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM external_world_accounts")
        .get() as { n: number }
    ).n,
    0,
  );
  assert.equal(records.all("redemption_requests").length, 0);
  const updated = external.connectionStatus(p, owner).redemptionQuote!;
  authorization = await external.beginAgentConnection(p, owner, {
    name: "Deposit agent",
    redemptionHash: updated.hash,
  });
  await service.completeWorldCheck(owner, callback());
  const credential = external.completeAgentConnection(p, owner);
  assert.equal(credential.scope, "balance:read redemption:execute");
  assert.ok(credential.expiresAt <= Date.now() + 300000);
  const requests = records.all<{ orders: { amountJpy: string }[] }>(
    "redemption_requests",
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].orders[0].amountJpy, "900000");
});
