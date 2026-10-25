import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/gemini-auth-") + "/test.sqlite";
process.env.BANK_AUTH_MODE = "local-demo";
process.env.BANK_BIND_HOST = "127.0.0.1";
process.env.AI_MODE = "gemini";
process.env.GEMINI_API_KEY = "fixture-key";
process.env.PUBLIC_ASSET_MODE = "stub";
const { sqlite } = await import("../src/server/db");
const state = {
  id: "gemini-auth",
  clock: "2026-09-22T00:00:00Z",
  token: "0x0000000000000000000000000000000000000001",
  vault: "0x0000000000000000000000000000000000000002",
  customer: "0x0000000000000000000000000000000000000003",
  recipient: "0x0000000000000000000000000000000000000004",
  publicMode: "stub",
};
sqlite
  .prepare("INSERT INTO demo_instances VALUES(?,?,?)")
  .run(state.id, JSON.stringify(state), "ready");
sqlite.prepare("UPDATE control SET active_instance=?").run(state.id);
const auth = await import("../src/server/auth");
const grants = await import("../src/features/delegations/service");
const world = await import("../src/features/world/service");
const { readAuthorized } = await import("../src/features/invoices/service");
const { all } = await import("../src/server/records");
const { chat } = await import("../src/features/chat/service");
const humanSecret = auth.issueHumanSession(null).token;
const agentSecret = auth.issueAgentCredential().token;
const human = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { cookie: `bank_session=${humanSecret}` },
  }),
)!;
const agent = auth.authenticateRequest(
  new Request("http://localhost", {
    headers: { authorization: `Bearer ${agentSecret}` },
  }),
)!;
function answer(value: unknown) {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  });
}
let payload: { attachment: unknown };
let calls = 0;
let resolveModel: ((response: Response) => void) | undefined;
let hold = false;
mock.method(
  globalThis,
  "fetch",
  async (_input: unknown, init?: RequestInit) => {
    calls++;
    const text = String(init!.body);
    assert.equal(text.includes(humanSecret), false);
    assert.equal(text.includes(agentSecret), false);
    const prompt = JSON.parse(text).contents[0].parts[0].text as string;
    payload = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
    return hold
      ? new Promise<Response>((resolve) => {
          resolveModel = resolve;
        })
      : answer(payload.attachment);
  },
);
test("Gemini receives only currently approved mail; revocation during extraction prevents persistence", async () => {
  await assert.rejects(readAuthorized(agent));
  assert.equal(calls, 0, "No model request before mail approval");
  const proposal = grants.createDelegationProposal(human, ["aoba-mail"]);
  const challenge = world.beginDemoApproval(
    { purpose: "delegation", proposalId: proposal.id },
    human,
  );
  await world.completeDemoApproval(challenge.id, human);
  const result = await readAuthorized(agent);
  assert.equal(calls, 1);
  assert.deepEqual(
    result.map((i) => i.emailId),
    ["aoba-mail"],
  );
  sqlite.exec(
    "DELETE FROM emails; DELETE FROM attachments; DELETE FROM invoices",
  );
  hold = true;
  const pending = readAuthorized(agent);
  const rejected = assert.rejects(pending);
  await grants.revokeDelegation(grants.assertScope(agent, "mail").id, human);
  resolveModel!(answer(payload.attachment));
  await rejected;
  assert.equal(all("emails").length, 0);
  assert.equal(all("attachments").length, 0);
  assert.equal(all("invoices").length, 0);
  mock.restoreAll();
});
test("expired human during Gemini classification cannot create an approval proposal", async () => {
  mock.method(globalThis, "fetch", async () => {
    auth.revokeCredential(human.credentialId);
    return answer({ action: "read_mail" });
  });
  await assert.rejects(chat(human, "請求メールを見たいです"));
  assert.equal(
    all<{ role: string }>("messages").filter((m) => m.role === "assistant")
      .length,
    0,
  );
  assert.equal(all("proposals").length, 0);
  mock.restoreAll();
});
