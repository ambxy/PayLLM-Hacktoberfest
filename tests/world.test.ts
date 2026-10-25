import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { hashSignal } from "@worldcoin/idkit/hashing";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/td-world-") + "/test.sqlite";
process.env.WORLD_MODE = "live";
process.env.WORLD_APP_ID = "app_test";
process.env.WORLD_RP_ID = "rp_test";
process.env.WORLD_RP_SIGNING_KEY = "11".repeat(32);
process.env.WORLD_ENVIRONMENT = "production";
process.env.PUBLIC_ASSET_MODE = "stub";
const { sqlite, save } = await import("../src/server/db");
const { put, get } = await import("../src/server/records");
const world = await import("../src/features/world/service");
const { accept, change } = await import("../src/features/rules/service");
const { reset } = await import("../src/features/demo/service");
const { inspectProof, verifyWorldProof } = await import(
  "../src/integrations/world"
);
const { POST } = await import("../src/app/api/world/route");
import type { Rule, Proposal } from "../src/shared/domain";
const session = "session_" + "1".repeat(128);
const owner = "test-browser";
const state = {
  id: "world-test",
  clock: "2026-09-22T00:00:00Z",
  token: "0x0000000000000000000000000000000000000001" as const,
  vault: "0x0000000000000000000000000000000000000002" as const,
  customer: "0x0000000000000000000000000000000000000003" as const,
  recipient: "0x0000000000000000000000000000000000000004" as const,
  publicMode: "stub",
  worldRequired: true,
};
const conditions: Proposal["conditions"] = {
  id: "payment",
  enabled: true,
  recipientId: "aoba",
  maxPaymentJpy: "200000",
  monthlyLimitJpy: "200000",
  minimumBalanceJpy: "100000",
  maxInvestmentJpy: "0",
  safetyBufferJpy: "0",
  payAt: "dueDate",
};
type C = Pick<
  ReturnType<typeof world.beginChallenge>,
  "rpContext" | "signal" | "environment"
>;
let count = 0;
function proof(c: C, nullifier = "0x" + (++count).toString(16)) {
  return {
    protocol_version: "4.0",
    user_presence_completed: true,
    nonce: c.rpContext.nonce,
    session_id: session,
    environment: "production",
    integrity_bundle: {
      version: 2,
      signature_format: "apple_app_attest",
      timestamp: Math.floor(Date.now() / 1000),
      signature: "test",
      jwt: "test",
    },
    responses: [
      {
        identifier: "proof_of_human",
        issuer_schema_id: 1,
        signal_hash: hashSignal(c.signal),
        session_nullifier: [nullifier, "0x11"],
        expires_at_min: c.rpContext.expires_at,
        // Compressed Groth16 elements are wider than 32 bytes.
        proof: ["0x" + "a".repeat(128), "0x2", "0x3", "0x4", "0x5"],
      },
    ],
  };
}
function success(p: ReturnType<typeof proof>) {
  return Response.json({
    success: true,
    session_id: p.session_id,
    environment: "production",
    results: [{ identifier: "proof_of_human", success: true }],
  });
}
function verifier() {
  return mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) =>
      success(JSON.parse(init!.body as string)),
  );
}
const auth = await import("../src/server/auth");
const login = await import("../src/features/auth/service");
const grants = await import("../src/features/delegations/service");
const { disableRule } = await import("../src/features/rules/service");
let human: import("../src/server/auth").Principal;
function humanSession(binding: string | null) {
  const issued = auth.issueHumanSession(binding);
  return auth.authenticateRequest(
    new Request("http://localhost", {
      headers: { cookie: `bank_session=${issued.token}` },
    }),
  )!;
}
function agent() {
  const issued = auth.issueAgentCredential();
  return auth.authenticateRequest(
    new Request("http://localhost", {
      headers: { authorization: `Bearer ${issued.token}` },
    }),
  )!;
}
async function enroll() {
  const c = login.beginLogin("enroll", owner, auth.issueEnrollmentTicket());
  await login.completeLogin("enroll", c.id, owner, proof(c));
  human = humanSession(session);
}
function proposal() {
  const st = auth.authState();
  put<Proposal>("proposals", {
    id: "p1",
    kind: "payment",
    baseVersion: get<Rule>("rules", "payment")?.version ?? 0,
    conditions,
    sourceIds: ["invoice"],
    status: "proposed",
    accountId: human.accountId,
    agentId: auth.fixedAgentId,
    authMode: st.mode,
    generation: st.generation,
    instanceId: state.id,
  });
  return world.beginChallenge(
    { purpose: "proposal", proposalId: "p1" },
    owner,
    human,
  );
}
async function approvedRule() {
  await enroll();
  const c = proposal();
  return (await world.completeChallenge(c.id, owner, proof(c), human)).rule!;
}
beforeEach(() => {
  process.env.BANK_AUTH_MODE = "world";
  process.env.BANK_BIND_HOST = "127.0.0.1";
  process.env.WORLD_MODE = "live";
  process.env.WORLD_RP_ID = "rp_test";
  world.worldStatus();
  for (const t of [
    "world_accounts",
    "world_challenges",
    "world_used_proofs",
    "rules",
    "rule_versions",
    "proposals",
    "messages",
  ])
    sqlite.exec(`DELETE FROM ${t}`);
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO demo_instances(id,state,status) VALUES(?,?,?)",
    )
    .run(state.id, JSON.stringify(state), "ready");
  sqlite
    .prepare("UPDATE control SET active_instance=?,active_run=NULL WHERE id=1")
    .run(state.id);
});
afterEach(() => mock.restoreAll());
test("World verification requires complete Orb success; HTTP 200 or other credential is insufficient", async () => {
  const c = login.beginLogin("enroll", owner, auth.issueEnrollmentTicket());
  const p = proof(c);
  for (const result of [
    { success: false },
    {
      success: true,
      session_id: session,
      results: [{ identifier: "proof_of_human", success: false }],
    },
    {
      success: true,
      session_id: session,
      results: [{ identifier: "selfie", success: true }],
    },
    {
      success: true,
      session_id: "session_" + "2".repeat(128),
      results: [{ identifier: "proof_of_human", success: true }],
    },
  ]) {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ environment: "production", ...result }),
    );
    await assert.rejects(
      verifyWorldProof(p, {
        nonce: c.rpContext.nonce,
        signal: c.signal,
        expiresAt: c.rpContext.expires_at,
        environment: c.environment,
        flow: "session",
      }),
    );
    mock.restoreAll();
  }
  assert.equal(world.worldStatus().enrolled, false);
});
test("nonce, signal, session, credential, environment, legacy and credential expiry tampering is rejected before external verification", async () => {
  verifier();
  await enroll();
  const c = proposal();
  const expectation = {
    nonce: c.rpContext.nonce,
    signal: c.signal,
    expiresAt: c.rpContext.expires_at,
    environment: c.environment,
    flow: "session" as const,
    sessionId: session,
  };
  const edits = [
    (p: any) => (p.nonce = "0x1"),
    (p: any) => (p.responses[0].signal_hash = "0x1"),
    (p: any) => (p.session_id = "session_" + "2".repeat(128)),
    (p: any) => (p.responses[0].issuer_schema_id = 11),
    (p: any) => (p.responses[0].identifier = "selfie"),
    (p: any) => (p.responses[0].proof[0] = "not-hex"),
    (p: any) => (p.environment = "sandbox"),
    (p: any) => (p.protocol_version = "3.0"),
    (p: any) => (p.user_presence_completed = false),
    (p: any) => p.responses.push(p.responses[0]),
    (p: any) => (p.action = "uniqueness"),
  ];
  for (const edit of edits) {
    const p = proof(c);
    edit(p);
    assert.throws(() => inspectProof(p, expectation));
  }
  // Optional fields: presence is not requested and World App may omit or
  // version the integrity bundle; World's verify API validates it.
  const optional: any = proof(c);
  delete optional.user_presence_completed;
  optional.integrity_bundle.version = 3;
  assert.equal(inspectProof(optional, expectation).sessionId, session);
  delete optional.integrity_bundle;
  assert.equal(inspectProof(optional, expectation).sessionId, session);
  // Request flow: the action's nullifier identifies the human; the nonce keeps replay keys unique.
  const request = (p: any, nullifier = "0xabc") => {
    delete p.session_id;
    p.action = "agent-bank-account";
    p.responses[0].nullifier = nullifier;
    delete p.responses[0].session_nullifier;
    return p;
  };
  const requested = {
    ...expectation,
    flow: "request" as const,
    action: "agent-bank-account",
    sessionId: "nullifier_abc",
  };
  const ok = inspectProof(request(proof(c)), requested);
  assert.equal(ok.sessionId, "nullifier_abc");
  assert.match(ok.nullifier, /^nullifier_abc:/);
  assert.throws(() => inspectProof(request(proof(c), "0xdef"), requested));
  assert.throws(() =>
    inspectProof(request(proof(c)), { ...requested, action: "other" }),
  );
  assert.throws(() => inspectProof(request(proof(c)), expectation));
  assert.throws(() => inspectProof(proof(c), requested));
  assert.equal(get("rules", "payment"), undefined);
});
test("World applies exact policy atomically, records scopes and rejects bearer apply", async () => {
  const fetch = verifier();
  const rule = await approvedRule();
  assert.equal(rule.version, 1);
  world.assertRuleApproval(rule);
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(rule.authorization?.scopes, ["payment"]);
  assert.equal(rule.authorization?.approvalMethod, "world");
  await assert.rejects(accept("p1", "consent", rule.worldApprovalId));
  await assert.rejects(
    change({ baseVersion: 1, conditions, approvalId: rule.worldApprovalId }),
  );
  const a = agent();
  assert.ok(grants.assertScope(a, "payment"));
  assert.throws(() => grants.assertScope(a, "mail"));
  await disableRule("payment", human);
  assert.throws(() => grants.assertScope(a, "payment"));
});
test("mail uses human screen confirmation and one World proof approves both initial rules", async () => {
  const fetch = verifier();
  await enroll();
  const mail = grants.createDelegationProposal(human, [
    "aoba-mail",
    "sakura-mail",
  ]);
  const confirmed = world.confirmMailDelegation(mail.id, human);
  const a = agent();
  assert.deepEqual(grants.allowedMailIds(a), ["aoba-mail", "sakura-mail"]);
  assert.equal(
    confirmed.delegation!.authorization.approvalMethod,
    "human-confirmation",
  );
  assert.equal(fetch.mock.callCount(), 1, "only login uses World so far");
  const st = auth.authState();
  for (const [id, kind, value] of [
    ["payment-setup", "payment", conditions],
    [
      "investment-setup",
      "investment",
      {
        ...conditions,
        id: "investment",
        recipientId: "",
        maxPaymentJpy: "0",
        monthlyLimitJpy: "0",
        maxInvestmentJpy: "400000",
        safetyBufferJpy: "100000",
      },
    ],
  ] as const)
    put<Proposal>("proposals", {
      id,
      kind,
      conditions: value,
      baseVersion: 0,
      sourceIds: [],
      status: "proposed",
      accountId: human.accountId,
      agentId: auth.fixedAgentId,
      authMode: st.mode,
      generation: st.generation,
      instanceId: state.id,
    });
  const c = world.beginChallenge(
    {
      purpose: "setup",
      paymentProposalId: "payment-setup",
      investmentProposalId: "investment-setup",
    },
    owner,
    human,
  );
  assert.deepEqual(c.policy!.scopes, ["payment", "investment", "redemption"]);
  const result = await world.completeChallenge(c.id, owner, proof(c), human);
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(result.rules?.length, 2);
  for (const id of ["payment", "investment"] as const) {
    const rule = get<Rule>("rules", id)!;
    assert.equal(rule.authorization?.approvalId, c.id);
    world.assertRuleApproval(rule);
    assert.ok(grants.assertScope(a, id));
  }
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
});
test("changed policy or target, stale version, browser, expiry and cancellation cannot apply", async () => {
  verifier();
  await enroll();
  let c = proposal();
  await assert.rejects(world.completeChallenge(c.id, "other", proof(c), human));
  world.cancelChallenge(c.id, owner, human);
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  c = proposal();
  put("proposals", {
    ...get<Proposal>("proposals", "p1")!,
    conditions: { ...conditions, maxPaymentJpy: "900000" },
  });
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  c = proposal();
  save({ ...state, recipient: state.customer });
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  save(state);
  c = proposal();
  mock.method(Date, "now", () => c.rpContext.expires_at * 1000);
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  assert.equal(get("rules", "payment"), undefined);
});
test("parallel completion consumes once and failed persistence rolls back proof and rule", async () => {
  verifier();
  await enroll();
  let c = proposal();
  const p = proof(c);
  const results = await Promise.allSettled([
    world.completeChallenge(c.id, owner, p, human),
    world.completeChallenge(c.id, owner, p, human),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  c = proposal();
  sqlite.exec(
    "CREATE TEMP TRIGGER reject_world_rule BEFORE INSERT ON rules BEGIN SELECT RAISE(ABORT,'write fail'); END",
  );
  try {
    await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  } finally {
    sqlite.exec("DROP TRIGGER reject_world_rule");
  }
  assert.equal(get<Rule>("rules", "payment")?.version, 1);
  assert.equal(
    JSON.parse(
      (
        sqlite
          .prepare("SELECT data FROM world_challenges WHERE id=?")
          .get(c.id) as { data: string }
      ).data,
    ).status,
    "failed",
  );
  assert.equal(
    (
      sqlite.prepare("SELECT count(*) n FROM world_used_proofs").get() as {
        n: number;
      }
    ).n,
    2,
  );
});
test("Gateway rejects altered rule binding and authority generation", async () => {
  verifier();
  const rule = await approvedRule();
  for (const changed of [
    { ...rule, maxPaymentJpy: "9" },
    { ...rule, version: 2 },
    { ...rule, authorization: undefined },
  ])
    assert.throws(() => world.assertRuleApproval(changed));
  save({ ...state, publicWallet: "changed" });
  assert.throws(() => world.assertRuleApproval(rule));
  save(state);
  process.env.BANK_AUTH_MODE = "local-demo";
  auth.authState();
  process.env.BANK_AUTH_MODE = "world";
  assert.throws(() => world.assertRuleApproval(rule));
});
test("proof replay, in-flight cancellation and network failure cannot apply", async () => {
  verifier();
  await enroll();
  let c = proposal();
  await world.completeChallenge(c.id, owner, proof(c, "0xabc"), human);
  c = proposal();
  await assert.rejects(
    world.completeChallenge(c.id, owner, proof(c, "0x0ABC"), human),
  );
  mock.restoreAll();
  let resolve!: (r: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    () => new Promise<Response>((r) => (resolve = r)),
  );
  c = proposal();
  const p = proof(c);
  const pending = world.completeChallenge(c.id, owner, p, human);
  world.cancelChallenge(c.id, owner, human);
  resolve(success(p));
  await assert.rejects(pending);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => {
    throw new Error("network");
  });
  c = proposal();
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), human));
  assert.equal(get<Rule>("rules", "payment")?.version, 1);
});
test("World APIs reject anonymous and agent principals including forged objects", async () => {
  verifier();
  await enroll();
  const c = proposal(),
    a = agent();
  assert.throws(() =>
    world.beginChallenge({ purpose: "proposal", proposalId: "p1" }, owner, a),
  );
  await assert.rejects(world.completeChallenge(c.id, owner, proof(c), a));
  assert.throws(() =>
    world.beginChallenge({ purpose: "proposal", proposalId: "p1" }, owner, {
      ...human,
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/world", {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "begin", input: { purpose: "enroll" } }),
    }),
  );
  assert.equal(response.status, 401);
});
function demo() {
  process.env.BANK_AUTH_MODE = "local-demo";
  human = humanSession(null);
  return agent();
}
function demoProposal() {
  const st = auth.authState();
  put<Proposal>("proposals", {
    id: "p1",
    kind: "payment",
    baseVersion: get<Rule>("rules", "payment")?.version ?? 0,
    conditions,
    sourceIds: [],
    status: "proposed",
    accountId: human.accountId,
    agentId: auth.fixedAgentId,
    authMode: st.mode,
    generation: st.generation,
    instanceId: state.id,
  });
  return world.beginDemoApproval(
    { purpose: "proposal", proposalId: "p1" },
    human,
  );
}
test("explicit demo approval grants scoped mail access; revoke is immediate and no World proof is created", async () => {
  const a = demo();
  assert.throws(() => grants.assertScope(a, "mail"));
  const ids = (
    JSON.parse(
      (await import("node:fs")).readFileSync("fixtures/mail.json", "utf8"),
    ) as { id: string }[]
  ).map((m) => m.id);
  const p = grants.createDelegationProposal(human, [ids[0]]),
    c = world.beginDemoApproval(
      { purpose: "delegation", proposalId: p.id },
      human,
    );
  const result = await world.completeDemoApproval(c.id, human);
  assert.deepEqual(grants.allowedMailIds(a), [ids[0]]);
  assert.deepEqual(result.delegation.authorization.scopes, [
    "read",
    "propose",
    "mail",
  ]);
  assert.equal(result.delegation.authorization.approvalMethod, "local-demo");
  assert.equal(world.worldStatus().enrolled, false);
  assert.throws(() => grants.assertScope(a, "payment"));
  await assert.rejects(grants.revokeDelegation(result.delegation.id, a));
  await grants.revokeDelegation(result.delegation.id, human);
  assert.throws(() => grants.allowedMailIds(a));
  await assert.rejects(world.completeDemoApproval(c.id, human));
});
test("demo requires real human principal, exact version, expiry and one use", async () => {
  const a = demo();
  let c = demoProposal();
  await assert.rejects(world.completeDemoApproval(c.id, a));
  await assert.rejects(world.completeDemoApproval(c.id, { ...human }));
  const r = await world.completeDemoApproval(c.id, human);
  world.assertRuleApproval(r.rule!);
  await assert.rejects(world.completeDemoApproval(c.id, human));
  c = demoProposal();
  await disableRule("payment", human);
  await assert.rejects(world.completeDemoApproval(c.id, human));
  c = demoProposal();
  mock.method(Date, "now", () => c.expiresAt * 1000);
  await assert.rejects(world.completeDemoApproval(c.id, human));
});
test("demo continuation cancels in-flight World; late World completion cannot duplicate", async () => {
  process.env.BANK_AUTH_MODE = "local-demo";
  verifier();
  await enroll();
  const c = proposal();
  mock.restoreAll();
  let resolve!: (r: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    () => new Promise<Response>((r) => (resolve = r)),
  );
  const p = proof(c),
    pending = world.completeChallenge(c.id, owner, p, human);
  const d = world.beginDemoApproval(
    { purpose: "proposal", proposalId: "p1" },
    human,
  );
  await world.completeDemoApproval(d.id, human);
  resolve(success(p));
  await assert.rejects(pending);
  assert.equal(get<Rule>("rules", "payment")?.version, 1);
  assert.equal(
    get<Rule>("rules", "payment")?.authorization?.approvalMethod,
    "local-demo",
  );
});
test("mode change invalidates demo approval and grant without promoting either", async () => {
  demo();
  const c = demoProposal();
  await world.completeDemoApproval(c.id, human);
  const rule = get<Rule>("rules", "payment")!;
  process.env.BANK_AUTH_MODE = "world";
  assert.throws(() => world.assertRuleApproval(rule));
  assert.throws(() =>
    world.beginDemoApproval({ purpose: "proposal", proposalId: "p1" }, human),
  );
  process.env.BANK_AUTH_MODE = "local-demo";
  assert.throws(() => world.assertRuleApproval(rule));
});

test("demo and World HTTP endpoints enforce principals and apply server-saved conditions", async () => {
  demo();
  const humanToken = auth.issueHumanSession(null).token;
  const agentToken = auth.issueAgentCredential().token;
  const demoApi = await import("../src/app/api/demo/approvals/route");
  const delegationApi = await import(
    "../src/app/api/delegations/proposals/route"
  );
  const ids = (
    JSON.parse(
      (await import("node:fs")).readFileSync("fixtures/mail.json", "utf8"),
    ) as { id: string }[]
  ).map((m) => m.id);
  function request(path: string, body: unknown, agent = false) {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "content-type": "application/json",
        ...(agent
          ? { authorization: `Bearer ${agentToken}` }
          : { cookie: `bank_session=${humanToken}` }),
      },
      body: JSON.stringify(body),
    });
  }
  assert.equal(
    (
      await delegationApi.POST(
        request("/api/delegations/proposals", { mailIds: ids }, true),
      )
    ).status,
    403,
  );
  const proposed = await delegationApi.POST(
    request("/api/delegations/proposals", { mailIds: ids }),
  );
  assert.equal(proposed.status, 200);
  const p = await proposed.json();
  const started = await demoApi.POST(
    request("/api/demo/approvals", {
      action: "begin",
      input: { purpose: "delegation", proposalId: p.id },
    }),
  );
  assert.equal(started.status, 200);
  const c = await started.json();
  assert.deepEqual(c.policy.scopes, ["read", "propose", "mail"]);
  assert.equal(
    (
      await demoApi.POST(
        request("/api/demo/approvals", { action: "confirm", id: c.id }, true),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await demoApi.POST(
        request("/api/demo/approvals", { action: "confirm", id: c.id }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await demoApi.POST(
        request("/api/demo/approvals", { action: "confirm", id: c.id }),
      )
    ).status,
    409,
  );
});

test("approval binds account, agent, scope and conditions, rejects legacy proposals", async () => {
  demo();
  const c = demoProposal();
  const original = get<Proposal>("proposals", "p1")!;
  for (const edits of [
    { accountId: "other" },
    { agentId: "other" },
    { generation: 0 },
    { authMode: "world" },
    { instanceId: "other" },
    { accountId: undefined },
  ]) {
    put("proposals", { ...original, ...edits });
    await assert.rejects(world.completeDemoApproval(c.id, human));
  }
  put("proposals", original);
  const result = await world.completeDemoApproval(c.id, human);
  const changed = {
    ...result.rule!,
    authorization: {
      ...result.rule!.authorization!,
      scopes: ["payment", "investment"],
    },
  };
  assert.throws(() => world.assertRuleApproval(changed));
});

test("revoking delegation cancels pending demo and in-flight World rule approval", async () => {
  verifier();
  await approvedRule();
  let resolve!: (r: Response) => void;
  mock.restoreAll();
  mock.method(
    globalThis,
    "fetch",
    () => new Promise<Response>((r) => (resolve = r)),
  );
  const c = proposal(),
    p = proof(c),
    pending = world.completeChallenge(c.id, owner, p, human);
  const ref = grants.assertScope(agent(), "payment");
  await grants.revokeDelegation(ref.id, human);
  resolve(success(p));
  await assert.rejects(pending);
  assert.throws(() => grants.assertScope(agent(), "payment"));
  assert.equal(get<Rule>("rules", "payment")?.version, 1);
  mock.restoreAll();
  demo();
  const approved = demoProposal();
  await world.completeDemoApproval(approved.id, human);
  const next = demoProposal();
  await grants.revokeDelegation(
    grants.assertScope(agent(), "payment").id,
    human,
  );
  await assert.rejects(world.completeDemoApproval(next.id, human));
  assert.throws(() => grants.assertScope(agent(), "payment"));
});

test("explicit demo cancellation invalidates the pending approval and checks its owner", async () => {
  demo();
  const c = demoProposal();
  const otherHuman = humanSession(null);
  await assert.rejects(world.cancelDemoApproval(c.id, otherHuman));
  await assert.rejects(world.cancelDemoApproval(c.id, agent()));
  assert.deepEqual(await world.cancelDemoApproval(c.id, human), {
    cancelled: true,
  });
  await assert.rejects(world.completeDemoApproval(c.id, human));
  assert.equal(get<Rule>("rules", "payment"), undefined);
  const fresh = demoProposal();
  await world.completeDemoApproval(fresh.id, human);
  await assert.rejects(world.cancelDemoApproval(fresh.id, human));
  assert.equal(get<Rule>("rules", "payment")?.version, 1);
});

test("sandbox enrolls on the first World login without a ticket only when enabled", async () => {
  verifier();
  assert.throws(() => login.beginLogin("enroll", owner), auth.AuthorizationError);
  process.env.WORLD_ENROLL_WITHOUT_TICKET = "true";
  try {
    const stale = login.beginLogin("enroll", owner);
    delete process.env.WORLD_ENROLL_WITHOUT_TICKET;
    await assert.rejects(
      login.completeLogin("enroll", stale.id, owner, proof(stale)),
    );
    process.env.WORLD_ENROLL_WITHOUT_TICKET = "true";
    const c = login.beginLogin("enroll", owner);
    const s = await login.completeLogin("enroll", c.id, owner, proof(c));
    assert.ok(s.token);
    assert.equal(world.worldStatus().enrolled, true);
    assert.throws(
      () => login.beginLogin("enroll", owner),
      auth.AuthorizationError,
    );
    const again = login.beginLogin("login", owner);
    assert.ok(await login.completeLogin("login", again.id, owner, proof(again)));
  } finally {
    delete process.env.WORLD_ENROLL_WITHOUT_TICKET;
  }
});
