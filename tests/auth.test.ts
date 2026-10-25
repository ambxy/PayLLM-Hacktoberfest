import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { hashSignal } from "@worldcoin/idkit/hashing";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/bank-auth-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.WORLD_MODE = "live";
process.env.WORLD_APP_ID = "app_test";
process.env.WORLD_RP_ID = "rp_test";
process.env.WORLD_RP_SIGNING_KEY = "11".repeat(32);
const auth = await import("../src/server/auth");
const { checkRequest } = await import("../src/server/http");
const { sqlite } = await import("../src/server/db");
const login = await import("../src/features/auth/service");
const route = await import("../src/app/api/auth/[...action]/route");
afterEach(() => {
  mock.restoreAll();
  process.env.BANK_AUTH_MODE = "local-demo";
  process.env.BANK_BIND_HOST = "127.0.0.1";
  process.env.WORLD_MODE = "live";
});
function req(
  path: string,
  method = "POST",
  credential?: string,
  agent = false,
  origin = true,
) {
  return new Request("http://localhost" + path, {
    method,
    headers: {
      host: "localhost",
      ...(origin ? { origin: "http://localhost" } : {}),
      "content-type": "application/json",
      ...(credential
        ? agent
          ? { authorization: "Bearer " + credential }
          : { cookie: "bank_session=" + credential }
        : {}),
    },
    ...(method !== "GET" ? { body: "{}" } : {}),
  });
}
function code(fn: () => unknown, status: number) {
  assert.throws(
    fn,
    (e: unknown) => e instanceof auth.AuthorizationError && e.status === status,
  );
}
test("principal is authentic, expires, revokes, and cannot revive across modes", () => {
  const human = auth.issueHumanSession(null);
  const p = checkRequest(req("/api/dashboard", "GET", human.token))!;
  assert.equal(p.role, "human");
  code(() => auth.requirePrincipal({ ...p }), 401);
  auth.revokeCredential(human.credentialId);
  code(() => auth.requirePrincipal(p), 401);
  const a = auth.issueAgentCredential();
  const ap = checkRequest(req("/api/agent/read", "POST", a.token, true))!;
  process.env.BANK_AUTH_MODE = "world";
  auth.authState();
  code(() => auth.requirePrincipal(ap), 401);
  process.env.BANK_AUTH_MODE = "local-demo";
  auth.authState();
  code(() => auth.requirePrincipal(ap), 401);
  const exp = auth.issueAgentCredential();
  sqlite
    .prepare(
      "UPDATE bank_credentials SET data=json_set(data,'$.expiresAt',0) WHERE id=?",
    )
    .run(exp.credentialId);
  code(
    () => checkRequest(req("/api/agent/read", "POST", exp.token, true)),
    401,
  );
});
test("API matrix rejects anonymous, wrong role, mixed auth, fake role, unknown method and CSRF", () => {
  const h = auth.issueHumanSession(null),
    a = auth.issueAgentCredential();
  for (const path of [
    "/api/dashboard",
    "/api/rules",
    "/api/invoices",
    "/api/chat/messages",
    "/api/runs/run",
  ]) {
    code(() => checkRequest(req(path, "GET")), 401);
    code(() => checkRequest(req(path, "GET", a.token, true)), 403);
    assert.equal(checkRequest(req(path, "GET", h.token))!.role, "human");
  }
  for (const path of [
    "/api/agent/read",
    "/api/agent/proposals",
    "/api/agent/payments",
    "/api/agent/investments",
    "/api/agent/redemptions",
  ]) {
    code(() => checkRequest(req(path, "POST", h.token)), 403);
    assert.equal(
      checkRequest(req(path, "POST", a.token, true, false))!.role,
      "agent",
    );
  }
  for (const path of [
    "/api/world",
    "/api/auth/demo-login",
    "/api/auth/login/begin",
    "/api/auth/enroll/verify",
    "/api/demo/reset",
  ]) {
    code(() => checkRequest(req(path, "POST", a.token, true)), 403);
  }
  const mixed = req("/api/dashboard", "GET", h.token);
  mixed.headers.set("authorization", "Bearer " + a.token);
  code(() => checkRequest(mixed), 403);
  code(
    () => checkRequest(req("/api/demo/reset", "POST", h.token, false, false)),
    403,
  );
  code(() => checkRequest(req("/api/unregistered", "POST", h.token)), 403);
  code(() => checkRequest(req("/api/dashboard", "DELETE", h.token)), 403);
  const fake = req("/api/dashboard", "GET");
  fake.headers.set("role", "human");
  code(() => checkRequest(fake), 401);
});
test("explicit demo login issues HttpOnly session; world and agent cannot use it", async () => {
  process.env.WORLD_MODE = "disabled";
  let r = await route.POST(req("/api/auth/demo-login"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  assert.equal((await r.json()).authMode, "local-demo");
  const a = auth.issueAgentCredential();
  assert.equal(
    (await route.POST(req("/api/auth/demo-login", "POST", a.token, true)))
      .status,
    403,
  );
  process.env.BANK_AUTH_MODE = "world";
  assert.equal((await route.POST(req("/api/auth/demo-login"))).status, 403);
  process.env.BANK_AUTH_MODE = "local-demo";
  process.env.BANK_BIND_HOST = "0.0.0.0";
  assert.throws(() => auth.authState(), /loopback/);
});
let nonce = 0;
function proof(
  c: ReturnType<typeof login.beginLogin>,
  session = "session_" + "1".repeat(128),
) {
  return {
    protocol_version: "4.0",
    user_presence_completed: true,
    nonce: c.rpContext.nonce,
    session_id: session,
    environment: "production",
    integrity_bundle: {
      version: 2,
      signature_format: "apple_app_attest",
      timestamp: 1,
      signature: "test",
      jwt: "test",
    },
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        signal_hash: hashSignal(c.signal),
        session_nullifier: ["0x" + (++nonce).toString(16), "0x1"],
        expires_at_min: c.rpContext.expires_at,
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
      },
    ],
  };
}
test("ticket plus World enrollment, login binding, one use and concurrent verify", async () => {
  process.env.BANK_AUTH_MODE = "world";
  const ticket = auth.issueEnrollmentTicket();
  const c = login.beginLogin("enroll", "browser", ticket);
  assert.equal(c.flow, "session");
  assert.equal(c.sessionId, undefined);
  assert.equal(c.action, undefined);
  mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const p = JSON.parse(init.body as string);
    return Response.json({
      success: true,
      session_id: p.session_id,
      environment: "production",
      results: [{ identifier: "proof_of_human", success: true }],
    });
  });
  const p = proof(c);
  const results = await Promise.allSettled([
    login.completeLogin("enroll", c.id, "browser", p),
    login.completeLogin("enroll", c.id, "browser", p),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  code(() => login.beginLogin("enroll", "browser", ticket), 409);
  const challenge = login.beginLogin("login", "browser");
  assert.equal(challenge.flow, "session");
  assert.equal(challenge.sessionId, p.session_id);
  await assert.rejects(
    login.completeLogin("enroll", challenge.id, "browser", proof(challenge)),
  );
  await assert.rejects(
    login.completeLogin(
      "login",
      challenge.id,
      "browser",
      proof(challenge, "session_" + "2".repeat(128)),
    ),
  );
  const good = login.beginLogin("login", "browser");
  const session = await login.completeLogin(
    "login",
    good.id,
    "browser",
    proof(good),
  );
  assert.equal(
    checkRequest(req("/api/dashboard", "GET", session.token))!.authMode,
    "world",
  );
  process.env.WORLD_FLOW = "request";
  code(() => checkRequest(req("/api/dashboard", "GET", session.token)), 401);
  process.env.WORLD_FLOW = "session";
  await assert.rejects(
    login.completeLogin("login", good.id, "browser", proof(good)),
  );
  process.env.WORLD_MODE = "disabled";
  assert.throws(() => login.beginLogin("login", "browser"));
});

test("stale human cookie recovers through public session and fresh demo login", async () => {
  const old = auth.issueHumanSession(null);
  process.env.BANK_AUTH_MODE = "world";
  auth.authState();
  process.env.BANK_AUTH_MODE = "local-demo";
  auth.authState();
  const response = await route.GET(req("/api/auth/session", "GET", old.token));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authenticated, false);
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(
    (await route.POST(req("/api/auth/demo-login", "POST", old.token))).status,
    200,
  );
  code(() => checkRequest(req("/api/dashboard", "GET", old.token)), 401);
});

test("startup synchronizes generation without HTTP and rejects invalid mode", async () => {
  const { spawnSync } = await import("node:child_process");
  const old = auth.issueAgentCredential();
  const run = (mode: string) =>
    spawnSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/auth-start.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, BANK_AUTH_MODE: mode },
        encoding: "utf8",
      },
    );
  assert.equal(run("world").status, 0);
  assert.equal(run("local-demo").status, 0);
  code(
    () => checkRequest(req("/api/agent/read", "POST", old.token, true)),
    401,
  );
  assert.notEqual(run("invalid").status, 0);
  const rejected = spawnSync(
    process.execPath,
    ["scripts/start-bank.mjs", "start", "--hostname", "0.0.0.0"],
    { encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /loopback/);
});

test("Next loopback normalization keeps exact external Origin and rejects other Host", () => {
  const human = auth.issueHumanSession(null);
  const r = req("/api/demo/reset", "POST", human.token);
  r.headers.set("host", "127.0.0.1");
  r.headers.set("origin", "http://127.0.0.1");
  assert.equal(checkRequest(r)!.role, "human");
  r.headers.set("origin", "http://localhost");
  code(() => checkRequest(r), 403);
  r.headers.set("host", "evil.test");
  r.headers.set("origin", "http://evil.test");
  code(() => checkRequest(r), 403);
});

test("demo login cancels an in-flight World enrollment without consuming proof or binding", async () => {
  sqlite.exec("DELETE FROM world_accounts; DELETE FROM world_used_proofs");
  const c = login.beginLogin(
    "enroll",
    "demo-browser",
    auth.issueEnrollmentTicket(),
  );
  let finish!: (value: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = login.completeLogin("enroll", c.id, "demo-browser", proof(c));
  const rejected = assert.rejects(
    pending,
    (e: unknown) => e instanceof auth.AuthorizationError && e.status === 409,
  );
  const request = req("/api/auth/demo-login");
  request.headers.set("cookie", "bank_login=demo-browser");
  const response = await route.POST(request);
  assert.equal(response.status, 200);
  finish(
    Response.json({
      success: true,
      session_id: "session_" + "1".repeat(128),
      environment: "production",
      results: [{ identifier: "proof_of_human", success: true }],
    }),
  );
  await rejected;
  assert.equal(login.worldBinding(), undefined);
  assert.equal(
    (
      sqlite.prepare("SELECT COUNT(*) AS n FROM world_used_proofs").get() as {
        n: number;
      }
    ).n,
    0,
  );
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    auth.authenticateRequest(
      new Request("http://localhost", { headers: { cookie } }),
    )!.role,
    "human",
  );
});
