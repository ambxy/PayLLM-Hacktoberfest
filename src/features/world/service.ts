import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { sqlite } from "../../server/db";
import { all, get, put, instance } from "../../server/records";
import { conditions, ruleChange } from "../../shared/rule-conditions";
import type { Proposal, Rule, AuthorizationBinding } from "../../shared/domain";
import { customerAccountId } from "../../integrations/custody";
import { addresses } from "../../integrations/aave/config";
import {
  createRpContext,
  inspectProof,
  verifyWorldProof,
  worldConfig,
  worldMode,
  worldCredential,
  type WorldFlow,
} from "../../integrations/world";

import {
  authState,
  requirePrincipal,
  fixedAgentId,
  AuthorizationError,
  type Principal,
} from "../../server/auth";
import { serialized } from "../../server/mutex";
import {
  delegationProposal,
  applyDelegation,
  type DelegationProposal,
} from "../delegations/service";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Binding = {
  sessionId: string;
  appId: string;
  rpId: string;
  environment: string;
  // Missing on Selfie Check session bindings, which are no longer accepted.
  credential?: string;
  flow?: WorldFlow;
};
export type Policy = {
  operation: "proposal" | "change" | "delegation" | "setup";
  proposalId?: string;
  investmentProposalId?: string;
  investmentBaseVersion?: number;
  investmentConditions?: Proposal["conditions"];
  baseVersion: number;
  conditions: Proposal["conditions"] | DelegationProposal["conditions"];
  agentId: string;
  scopes: string[];
  authMode: "world" | "local-demo";
  generation: number;
  instanceId: string;
  accountId: string;
  target: ReturnType<typeof executionTarget>;
};
type Challenge = ReturnType<typeof createRpContext> & {
  id: string;
  owner: string;
  purpose: "enroll" | "policy";
  status:
    | "pending"
    | "verifying"
    | "verified"
    | "consumed"
    | "cancelled"
    | "failed";
  signal: string;
  sessionId?: string;
  policy?: Policy;
  verifiedAt?: string;
  approvalMethod?: "world" | "local-demo" | "human-confirmation";
  credentialId?: string;
};
function tables() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS world_accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS world_challenges (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS world_used_proofs (id TEXT PRIMARY KEY);`);
}
function binding(): Binding | undefined {
  tables();
  const row = sqlite
    .prepare("SELECT data FROM world_accounts WHERE id=?")
    .get(customerAccountId) as { data: string } | undefined;
  return row && JSON.parse(row.data);
}
function read(id: string): Challenge {
  tables();
  const row = sqlite
    .prepare("SELECT data FROM world_challenges WHERE id=?")
    .get(id) as { data: string } | undefined;
  if (!row) throw new Error("Unknown World challenge");
  return JSON.parse(row.data);
}
function save(c: Challenge) {
  sqlite
    .prepare(
      "INSERT INTO world_challenges(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(c.id, JSON.stringify(c));
}
export function worldRequired() {
  return authState().mode === "world";
}
export function worldStatus() {
  const enrolled = Boolean(binding());
  let configured = false;
  try {
    worldConfig();
    configured = true;
  } catch {
    /* Status must work before Portal setup. */
  }
  return { required: worldRequired(), enrolled, configured, mode: worldMode() };
}
export function requireWorldEnrollment() {
  if (!worldRequired()) return;
  const b = binding();
  const c = worldConfig();
  if (
    !b ||
    b.appId !== c.appId ||
    b.rpId !== c.rpId ||
    b.environment !== c.environment ||
    b.credential !== worldCredential ||
    b.flow !== c.flow
  )
    throw new Error("Enroll World session for this account first");
}
function executionTarget() {
  const s = instance();
  const publicMode = s.publicMode ?? "stub";
  if (publicMode !== (process.env.PUBLIC_ASSET_MODE ?? "stub"))
    throw new Error("Asset mode changed");
  return {
    tdChainId: 31337,
    tdToken: s.token,
    customer: s.customer,
    recipient: s.recipient,
    vault: s.vault,
    publicWallet: s.publicWallet ?? null,
    investment:
      publicMode === "sepolia"
        ? {
            mode: "sepolia",
            chainId: 84532,
            protocol: "Aave V3",
            token: addresses.token,
            pool: addresses.pool,
          }
        : {
            mode: "stub",
            chainId: 0,
            protocol: "Aave stub",
            token: "stub-USDC",
            pool: "stub",
          },
  };
}
function policy(
  operation: Policy["operation"],
  baseVersion: number,
  value: unknown,
  proposalId?: string,
): Policy {
  const state = authState();
  const normalized =
    operation === "delegation"
      ? delegationProposal(proposalId!).conditions
      : conditions.parse(value);
  return {
    operation,
    ...(proposalId ? { proposalId } : {}),
    baseVersion,
    conditions: normalized,
    instanceId: instance().id,
    accountId: customerAccountId,
    agentId: fixedAgentId,
    scopes:
      operation === "delegation"
        ? delegationProposal(proposalId!).conditions.scopes
        : conditions.parse(value).id === "payment"
          ? ["payment"]
          : ["investment", "redemption"],
    authMode: state.mode,
    generation: state.generation,
    target: executionTarget(),
  };
}
function setupPolicy(paymentId: string, investmentId: string): Policy {
  const payment = get<Proposal>("proposals", paymentId);
  const investment = get<Proposal>("proposals", investmentId);
  if (
    !payment ||
    !investment ||
    payment.kind !== "payment" ||
    investment.kind !== "investment"
  )
    throw new AuthorizationError(404);
  return {
    ...policy("proposal", payment.baseVersion, payment.conditions, payment.id),
    operation: "setup",
    investmentProposalId: investment.id,
    investmentBaseVersion: investment.baseVersion,
    investmentConditions: conditions.parse(investment.conditions),
    scopes: ["payment", "investment", "redemption"],
  };
}
function checkPolicy(p: Policy) {
  if (p.operation === "setup") {
    if (
      digest(setupPolicy(p.proposalId!, p.investmentProposalId!)) !== digest(p)
    )
      throw new AuthorizationError(409, "Setup target changed");
    for (const [id, kind, version, value] of [
      [p.proposalId, "payment", p.baseVersion, p.conditions],
      [
        p.investmentProposalId,
        "investment",
        p.investmentBaseVersion,
        p.investmentConditions,
      ],
    ] as const) {
      const source = get<Proposal>("proposals", id!);
      if (
        !source ||
        source.status !== "proposed" ||
        source.kind !== kind ||
        source.baseVersion !== version ||
        (get<Rule>("rules", kind)?.version ?? 0) !== version ||
        digest(conditions.parse(source.conditions)) !== digest(value)
      )
        throw new AuthorizationError(409, "Setup proposal changed");
    }
    return;
  }
  if (
    digest(policy(p.operation, p.baseVersion, p.conditions, p.proposalId)) !==
    digest(p)
  )
    throw new AuthorizationError(409, "Policy target changed");
  if (p.operation === "delegation") {
    const source = delegationProposal(p.proposalId!);
    if (
      source.status !== "proposed" ||
      source.baseVersion !== p.baseVersion ||
      digest(source.conditions) !== digest(p.conditions)
    )
      throw new AuthorizationError(409);
  } else {
    const normalized = conditions.parse(p.conditions);
    if ((get<Rule>("rules", normalized.id)?.version ?? 0) !== p.baseVersion)
      throw new AuthorizationError(409, "Rule version changed");
    if (p.operation === "proposal") {
      const source = get<Proposal>("proposals", p.proposalId!);
      if (
        !source ||
        source.accountId !== p.accountId ||
        source.agentId !== p.agentId ||
        source.authMode !== p.authMode ||
        source.generation !== p.generation ||
        source.instanceId !== p.instanceId ||
        source.status !== "proposed" ||
        source.baseVersion !== p.baseVersion ||
        source.kind !== normalized.id ||
        digest(conditions.parse(source.conditions)) !== digest(normalized)
      )
        throw new AuthorizationError(409, "Proposal changed");
    }
  }
}
const challengeInput = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("setup"),
    paymentProposalId: z.string().min(1).max(100),
    investmentProposalId: z.string().min(1).max(100),
  }),
  z.object({
    purpose: z.literal("delegation"),
    proposalId: z.string().min(1).max(100),
  }),
  z.object({
    purpose: z.literal("proposal"),
    proposalId: z.string().min(1).max(100),
  }),
  z.object({ purpose: z.literal("change"), change: ruleChange }),
]);
function requestedPolicy(input: unknown): Policy {
  const body = challengeInput.parse(input);
  if (body.purpose === "setup") {
    const p = setupPolicy(body.paymentProposalId, body.investmentProposalId);
    checkPolicy(p);
    return p;
  }
  if (body.purpose === "delegation") {
    const proposal = delegationProposal(body.proposalId);
    const p = policy(
      "delegation",
      proposal.baseVersion,
      proposal.conditions,
      proposal.id,
    );
    checkPolicy(p);
    return p;
  }
  if (body.purpose === "proposal") {
    const proposal = get<Proposal>("proposals", body.proposalId);
    if (!proposal) throw new AuthorizationError(404);
    const p = policy(
      "proposal",
      proposal.baseVersion,
      proposal.conditions,
      proposal.id,
    );
    checkPolicy(p);
    return p;
  }
  if (!get<Rule>("rules", body.change.conditions.id))
    throw new AuthorizationError(404);
  const p = policy("change", body.change.baseVersion, body.change.conditions);
  checkPolicy(p);
  return p;
}
export function beginChallenge(
  input: unknown,
  owner: string,
  principal?: Principal,
) {
  requirePrincipal(principal, "human");
  tables();
  const p = requestedPolicy(input);
  requireWorldEnrollment();
  const context = createRpContext();
  const b = binding();
  if (!b) throw new AuthorizationError(403);
  const id = randomUUID();
  const signal = digest({
    domain: "agent-td-bank/world/v1",
    id,
    accountId: customerAccountId,
    appId: context.appId,
    rpId: context.rpContext.rp_id,
    environment: context.environment,
    purpose: "policy",
    policy: p ?? null,
    nonce: context.rpContext.nonce,
    expiresAt: context.rpContext.expires_at,
  });
  const c: Challenge = {
    ...context,
    id,
    owner: digest(owner),
    purpose: "policy",
    approvalMethod: "world",
    credentialId: principal!.credentialId,
    status: "pending",
    signal,
    ...(p ? { policy: p, sessionId: b!.sessionId } : {}),
  };
  save(c);
  const { owner: hidden, status, ...visible } = c;
  void hidden;
  void status;
  return visible;
}
function checkFresh(c: Challenge) {
  if (c.approvalMethod === "local-demo") {
    if (
      Date.now() >= c.rpContext.expires_at * 1000 ||
      authState().mode !== "local-demo" ||
      !c.policy
    )
      throw new AuthorizationError(409);
    checkPolicy(c.policy);
    return;
  }
  if (Date.now() >= c.rpContext.expires_at * 1000)
    throw new Error("World challenge expired");
  const config = worldConfig();
  if (
    config.appId !== c.appId ||
    config.rpId !== c.rpContext.rp_id ||
    config.environment !== c.environment ||
    c.credential !== worldCredential ||
    config.flow !== c.flow
  )
    throw new Error("World configuration changed");
  if (c.policy) {
    requireWorldEnrollment();
    if (c.sessionId !== binding()?.sessionId)
      throw new Error("World account session changed");
    checkPolicy(c.policy);
  }
}
const expected = (c: Challenge) => ({
  nonce: c.rpContext.nonce,
  signal: c.signal,
  expiresAt: c.rpContext.expires_at,
  environment: c.environment,
  flow: c.flow,
  action: c.action,
  sessionId: c.sessionId,
});
const replayId = (c: Challenge, nullifier: string) =>
  digest([c.rpContext.rp_id, c.environment, nullifier]);
export async function completeChallenge(
  id: string,
  owner: string,
  proof: unknown,
  principal?: Principal,
) {
  requirePrincipal(principal, "human");
  const c = sqlite.transaction(() => {
    const c = read(id);
    if (
      c.owner !== digest(owner) ||
      c.credentialId !== principal!.credentialId ||
      c.approvalMethod !== "world" ||
      c.status !== "pending"
    )
      throw new Error("World challenge unavailable");
    checkFresh(c);
    c.status = "verifying";
    save(c);
    return c;
  })();
  try {
    const checked = inspectProof(proof, expected(c));
    if (
      sqlite
        .prepare("SELECT id FROM world_used_proofs WHERE id=?")
        .get(replayId(c, checked.nullifier))
    )
      throw new Error("World proof replay");
    const verified = await verifyWorldProof(proof, expected(c));
    return await serialized(() =>
      sqlite.transaction(() => {
        requirePrincipal(principal, "human");
        const latest = read(id);
        if (latest.status !== "verifying")
          throw new Error("World challenge cancelled");
        checkFresh(latest);
        sqlite
          .prepare("INSERT INTO world_used_proofs(id) VALUES(?)")
          .run(replayId(c, verified.nullifier));
        const result = applyPolicy(latest);
        save({
          ...latest,
          status: "consumed",
          verifiedAt: new Date().toISOString(),
        });
        return result;
      })(),
    );
  } catch (e) {
    console.warn("World approval verification failed:", (e as Error).message);
    const latest = read(id);
    if (latest.status === "verifying") save({ ...latest, status: "failed" });
    throw new Error("World verification failed; start a new check");
  }
}
export function cancelChallenge(
  id: string,
  owner: string,
  principal?: Principal,
) {
  requirePrincipal(principal, "human");
  sqlite.transaction(() => {
    const c = read(id);
    if (c.owner !== digest(owner) || c.credentialId !== principal!.credentialId)
      throw new Error("World challenge owner mismatch");
    if (c.status !== "consumed") save({ ...c, status: "cancelled" });
  })();
}
function authorization(c: Challenge): AuthorizationBinding {
  const p = c.policy!;
  return {
    approvalId: c.id,
    approvalMethod: c.approvalMethod!,
    accountId: p.accountId,
    agentId: p.agentId,
    authMode: p.authMode,
    generation: p.generation,
    instanceId: p.instanceId,
    scopes: p.scopes,
  };
}
function applyPolicy(c: Challenge) {
  const p = c.policy!;
  checkPolicy(p);
  const binding = authorization(c);
  if (p.operation === "delegation")
    return {
      applied: true,
      delegation: applyDelegation(p.proposalId!, binding),
    };
  if (p.operation === "setup") {
    const payment = applyRule(c, p.conditions, p.baseVersion, p.proposalId!);
    const investment = applyRule(
      c,
      p.investmentConditions!,
      p.investmentBaseVersion!,
      p.investmentProposalId!,
    );
    return {
      applied: true,
      rules: [payment.rule, investment.rule],
      rule: investment.rule,
      delegation: investment.delegation,
    };
  }
  return {
    applied: true,
    ...applyRule(c, p.conditions, p.baseVersion, p.proposalId),
  };
}
function applyRule(
  c: Challenge,
  value: Policy["conditions"],
  baseVersion: number,
  proposalId?: string,
) {
  const binding = authorization(c);
  const normalized = conditions.parse(value);
  const rule: Rule = {
    ...normalized,
    version: baseVersion + 1,
    approvedDemoDate: instance().clock,
    consentId: c.id,
    worldApprovalId: c.id,
    authorization: binding,
  };
  put("rule_versions", { ...rule, id: rule.id + ":" + rule.version });
  put("rules", rule);
  if (proposalId)
    put("proposals", {
      ...get<Proposal>("proposals", proposalId)!,
      status: "accepted",
      consentId: c.id,
    });
  if (
    !c.policy?.investmentConditions?.investmentAllocations &&
    !normalized.investmentAllocations
  )
    put("messages", {
      id: randomUUID(),
      role: "assistant",
      kind: "rule",
      text:
        rule.id === "payment"
          ? "Automatic payments are set up. Eligible invoices will be paid on their due dates."
          : rule.enabled
            ? "Automatic investing is set up. I will verify the approved terms and start investing."
            : "Automatic investing is paused.",
      data: { rule },
    });
  if (normalized.investmentAllocations) {
    for (const row of all<import("../../shared/domain").Message>("messages")) {
      if (
        row.kind === "payment-plan" &&
        (row.data?.proposal as Proposal | undefined)?.id === proposalId
      )
        put("messages", {
          ...row,
          data: {
            ...row.data,
            proposal: get<Proposal>("proposals", proposalId!),
          },
        });
    }
  }
  const delegation = applyDelegation(undefined, binding, rule);
  return { rule, delegation };
}
export function assertRuleApproval(rule: Rule) {
  const a = rule.authorization,
    state = authState();
  if (
    !a ||
    a.accountId !== customerAccountId ||
    a.agentId !== fixedAgentId ||
    a.authMode !== state.mode ||
    a.generation !== state.generation ||
    a.instanceId !== instance().id ||
    (state.mode === "world" && a.approvalMethod !== "world")
  )
    throw new AuthorizationError(403, "Rule needs approval");
  const c = read(a.approvalId),
    p = c.policy;
  if (
    !p ||
    c.status !== "consumed" ||
    digest(authorization(c)) !== digest(a) ||
    p.instanceId !== instance().id ||
    (rule.id === "investment" && p.operation === "setup"
      ? p.investmentBaseVersion! + 1 !== rule.version ||
        digest(p.investmentConditions) !== digest(conditions.parse(rule))
      : p.baseVersion + 1 !== rule.version ||
        digest(p.conditions) !== digest(conditions.parse(rule))) ||
    digest(p.target) !== digest(executionTarget())
  )
    throw new AuthorizationError(403, "Gateway requires approved policy");
  if (a.approvalMethod === "world") {
    requireWorldEnrollment();
    if (c.sessionId !== binding()?.sessionId) throw new AuthorizationError(403);
  }
  return p.target;
}
export function assertDelegationApproval(
  approvalId: string,
  authorizationBinding: AuthorizationBinding,
) {
  const c = read(approvalId),
    p = c.policy;
  if (
    !p ||
    c.status !== "consumed" ||
    digest(authorization(c)) !== digest(authorizationBinding) ||
    p.instanceId !== instance().id ||
    digest(p.target) !== digest(executionTarget())
  )
    throw new AuthorizationError(403);
  if (c.approvalMethod === "world") {
    requireWorldEnrollment();
    if (c.sessionId !== binding()?.sessionId) throw new AuthorizationError(403);
  }
  return p;
}
export function confirmMailDelegation(
  proposalId: string,
  principal: Principal,
) {
  requirePrincipal(principal, "human");
  tables();
  return sqlite.transaction(() => {
    const source = delegationProposal(proposalId);
    if (source.status !== "proposed") throw new AuthorizationError(409);
    const p = policy(
      "delegation",
      source.baseVersion,
      source.conditions,
      source.id,
    );
    checkPolicy(p);
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const c: Challenge = {
      id,
      owner: digest(principal.credentialId),
      credentialId: principal.credentialId,
      purpose: "policy",
      status: "consumed",
      approvalMethod: "human-confirmation",
      policy: p,
      appId: "human-confirmation",
      environment: "production",
      credential: worldCredential,
      flow: "session",
      rpContext: {
        rp_id: "human-confirmation",
        nonce: randomUUID(),
        created_at: now,
        expires_at: now + 300,
        signature: "human-confirmation",
      },
      signal: digest({ p, id }),
      verifiedAt: new Date().toISOString(),
    };
    save(c);
    return applyPolicy(c);
  })();
}
export function beginDemoApproval(input: unknown, principal: Principal) {
  requirePrincipal(principal, "human");
  if (authState().mode !== "local-demo") throw new AuthorizationError(403);
  tables();
  return sqlite.transaction(() => {
    const p = requestedPolicy(input);
    const rows = sqlite.prepare("SELECT data FROM world_challenges").all() as {
      data: string;
    }[];
    for (const row of rows) {
      const old: Challenge = JSON.parse(row.data);
      if (
        old.policy &&
        digest(old.policy) === digest(p) &&
        ["pending", "verifying"].includes(old.status)
      )
        save({ ...old, status: "cancelled" });
    }
    const id = randomUUID(),
      expiresAt = Math.floor(Date.now() / 1000) + 300;
    const c: Challenge = {
      id,
      owner: digest(principal.credentialId),
      credentialId: principal.credentialId,
      purpose: "policy",
      status: "pending",
      approvalMethod: "local-demo",
      policy: p,
      appId: "demo",
      environment: "production",
      credential: worldCredential,
      flow: "session",
      rpContext: {
        rp_id: "demo",
        nonce: randomUUID(),
        created_at: Math.floor(Date.now() / 1000),
        expires_at: expiresAt,
        signature: "demo",
      },
      signal: digest({ p, id, expiresAt }),
    };
    save(c);
    return { id, policy: p, expiresAt };
  })();
}
export async function completeDemoApproval(id: string, principal: Principal) {
  requirePrincipal(principal, "human");
  return serialized(() =>
    sqlite.transaction(() => {
      requirePrincipal(principal, "human");
      const c = read(id);
      if (
        c.credentialId !== principal.credentialId ||
        c.approvalMethod !== "local-demo" ||
        c.status !== "pending"
      )
        throw new AuthorizationError(409);
      checkFresh(c);
      const result = applyPolicy(c);
      save({ ...c, status: "consumed", verifiedAt: new Date().toISOString() });
      return result;
    })(),
  );
}

export function invalidatePendingApprovals(
  accountId: string,
  agentId: string,
  scopes: string[],
) {
  tables();
  const rows = sqlite.prepare("SELECT data FROM world_challenges").all() as {
    data: string;
  }[];
  for (const row of rows) {
    const c: Challenge = JSON.parse(row.data);
    if (
      c.policy?.accountId === accountId &&
      c.policy.agentId === agentId &&
      c.policy.scopes.some((scope) => scopes.includes(scope)) &&
      ["pending", "verifying"].includes(c.status)
    )
      save({ ...c, status: "cancelled" });
  }
}

export async function cancelDemoApproval(id: string, principal: Principal) {
  requirePrincipal(principal, "human");
  if (authState().mode !== "local-demo") throw new AuthorizationError(403);
  return serialized(() =>
    sqlite.transaction(() => {
      requirePrincipal(principal, "human");
      const c = read(id);
      if (
        c.credentialId !== principal.credentialId ||
        c.approvalMethod !== "local-demo"
      )
        throw new AuthorizationError(403);
      if (c.status === "consumed") throw new AuthorizationError(409);
      save({ ...c, status: "cancelled" });
      return { cancelled: true };
    })(),
  );
}
