import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

process.env.DEMO_DB = mkdtempSync(tmpdir() + "/api-boundary-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.WORLD_MODE = "disabled";
process.env.PUBLIC_ASSET_MODE = "stub";
process.env.PUBLIC_TRANSACTIONS_ENABLED = "false";
const auth = await import("../src/server/auth");
const { apiPolicy } = await import("../src/server/http");
const { sqlite, current } = await import("../src/server/db");
const human = auth.issueHumanSession(null);
const agent = auth.issueAgentCredential();
const apiRoot = resolve("src/app/api");
const files = readdirSync(apiRoot, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith("/route.ts"));
function request(path: string, method: string, credential?: "human" | "agent") {
  return new Request("http://localhost" + path, {
    method,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "content-type": "application/json",
      ...(credential === "human"
        ? { cookie: `bank_session=${human.token}` }
        : {}),
      ...(credential === "agent"
        ? { authorization: `Bearer ${agent.token}` }
        : {}),
    },
    ...(["GET", "HEAD"].includes(method) ? {} : { body: "{}" }),
  });
}

test("every implemented protected method rejects anonymous and the opposite credential before any business effects", async () => {
  let checked = 0;
  for (const file of files) {
    if (file.includes("[...action]")) continue;
    const path =
      "/api/" +
      file
        .replace(/\/route\.ts$/, "")
        .replace("[id]", "00000000-0000-4000-8000-000000000001");
    const source = readFileSync(resolve(apiRoot, file), "utf8");
    const module = await import(resolve(apiRoot, file));
    for (const method of [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ]) {
      if (!new RegExp(`export (?:async )?function ${method}\\b`).test(source))
        continue;
      const policy = apiPolicy.find(
        (p) =>
          p.method === method &&
          p.path.test(
            path.replace("[action]", method === "GET" ? "status" : "begin"),
          ),
      );
      assert.ok(policy, `${method} ${path} must have an explicit policy`);
      if (policy.role === "public") continue;
      const context = {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      };
      assert.equal(
        (await module[method](request(path, method), context)).status,
        401,
        `anonymous ${method} ${path}`,
      );
      assert.equal(
        (
          await module[method](
            request(path, method, policy.role === "human" ? "agent" : "human"),
            context,
          )
        ).status,
        403,
        `wrong role ${method} ${path}`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 20, `checked ${checked} protected methods`);
  assert.equal(
    current(),
    null,
    "Denied requests never initialize a bank instance",
  );
  assert.equal(
    (
      sqlite.prepare("SELECT COUNT(*) AS n FROM demo_instances").get() as {
        n: number;
      }
    ).n,
    0,
  );
});

test("every public authentication mutation rejects Agent credentials, including enrollment and demo fallback", async () => {
  const route = await import("../src/app/api/auth/[...action]/route");
  for (const action of [
    "demo-login",
    "logout",
    "enroll/begin",
    "enroll/verify",
    "enroll/cancel",
    "login/begin",
    "login/verify",
    "login/cancel",
  ]) {
    assert.equal(
      (await route.POST(request("/api/auth/" + action, "POST", "agent")))
        .status,
      403,
      action,
    );
  }
  const response = await route.GET(
    request("/api/auth/session", "GET", "agent"),
  );
  assert.deepEqual(await response.json(), {
    authenticated: true,
    authMode: "local-demo",
    role: "agent",
  });
  const world = await import("../src/app/api/world/route");
  const state = await (await world.GET(request("/api/world", "GET"))).json();
  assert.equal(state.authMode, "local-demo");
  assert.equal(state.configuredMode, "stub");
  for (const key of ["sessionId", "credential", "token", "accountId", "proof"])
    assert.equal(key in state, false, key);
});
