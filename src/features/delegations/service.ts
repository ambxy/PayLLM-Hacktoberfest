import "server-only";
import { customerAccountId } from "../../integrations/custody";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { sqlite } from "../../server/db";
import { instance, put, get } from "../../server/records";
import { serialized } from "../../server/mutex";
import {
  authState,
  requirePrincipal,
  fixedAgentId,
  AuthorizationError,
  type Principal,
} from "../../server/auth";
import {
  assertDelegationApproval,
  assertRuleApproval,
  invalidatePendingApprovals,
} from "../world/service";
import type {
  AuthorizationBinding,
  Rule,
  Mail,
  CardPayment,
} from "../../shared/domain";
export type Scope =
  | "read"
  | "propose"
  | "mail"
  | "card"
  | "payment"
  | "investment"
  | "redemption";
export type DelegationProposal = {
  id: string;
  baseVersion: number;
  status: "proposed" | "accepted";
  accountId: string;
  agentId: string;
  instanceId: string;
  authMode: string;
  generation: number;
  conditions: { mailIds: string[]; cardIds?: string[]; scopes: string[] };
};
type Delegation = {
  id: string;
  version: number;
  enabled: boolean;
  mailIds: string[];
  cardIds?: string[];
  authorization: AuthorizationBinding;
  rule?: Rule;
};
function table() {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS bank_delegations(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS bank_delegation_proposals(id TEXT PRIMARY KEY,data TEXT NOT NULL);",
  );
}
function read<T>(
  name: "bank_delegations" | "bank_delegation_proposals",
  id: string,
): T | undefined {
  table();
  const row = sqlite.prepare(`SELECT data FROM ${name} WHERE id=?`).get(id) as
    | { data: string }
    | undefined;
  return row && JSON.parse(row.data);
}
function write<T extends { id: string }>(
  name: "bank_delegations" | "bank_delegation_proposals",
  row: T,
) {
  table();
  sqlite
    .prepare(
      `INSERT INTO ${name} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
    )
    .run(row.id, JSON.stringify(row));
  return row;
}
function delegationId(kind: string) {
  return `${instance().id}:${fixedAgentId}:${kind}`;
}
export function proposalBinding(principal: Principal) {
  requirePrincipal(principal, "agent");
  assertScope(principal, "propose");
  return {
    accountId: principal.accountId,
    agentId: principal.agentId!,
    authMode: principal.authMode,
    generation: principal.generation,
    instanceId: instance().id,
  };
}
export function createDelegationProposal(
  principal: Principal,
  mailIds: string[],
  cardIds?: string[],
) {
  requirePrincipal(principal);
  if (principal.role === "agent") assertScope(principal, "propose");
  const ids = [
    ...new Set(z.array(z.string().min(1)).min(1).max(100).parse(mailIds)),
  ].sort();
  const samples = JSON.parse(
    readFileSync("fixtures/mail.json", "utf8"),
  ) as Mail[];
  if (ids.some((id) => !samples.some((m) => m.id === id)))
    throw new AuthorizationError(404);
  const cards =
    cardIds === undefined
      ? undefined
      : [
          ...new Set(z.array(z.string().min(1)).min(1).max(100).parse(cardIds)),
        ].sort();
  if (cards) {
    const samples = JSON.parse(
      readFileSync("fixtures/card-payments.json", "utf8"),
    ) as CardPayment[];
    if (cards.some((id) => !samples.some((card) => card.id === id)))
      throw new AuthorizationError(404);
  }
  return write<DelegationProposal>("bank_delegation_proposals", {
    id: randomUUID(),
    baseVersion:
      read<Delegation>("bank_delegations", delegationId("mail"))?.version ?? 0,
    status: "proposed",
    accountId: principal.accountId,
    agentId: fixedAgentId,
    instanceId: instance().id,
    authMode: principal.authMode,
    generation: principal.generation,
    conditions: {
      mailIds: ids,
      ...(cards ? { cardIds: cards } : {}),
      scopes: ["read", "propose", "mail", ...(cards ? ["card"] : [])],
    },
  });
}
export function delegationProposal(id: string) {
  const p = read<DelegationProposal>("bank_delegation_proposals", id),
    state = authState();
  if (!p || p.instanceId !== instance().id) throw new AuthorizationError(404);
  if (
    p.accountId !== customerAccountId ||
    p.agentId !== fixedAgentId ||
    p.authMode !== state.mode ||
    p.generation !== state.generation ||
    p.baseVersion !==
      (read<Delegation>("bank_delegations", delegationId("mail"))?.version ?? 0)
  )
    throw new AuthorizationError(409);
  return p;
}
// Invoked only by world service while atomically consuming its immutable approval.
export function applyDelegation(
  proposalId: string | undefined,
  authorization: AuthorizationBinding,
  rule?: Rule,
) {
  const p = proposalId ? delegationProposal(proposalId) : undefined;
  const id = delegationId(rule?.id ?? "mail"),
    old = read<Delegation>("bank_delegations", id);
  const d: Delegation = {
    id,
    version: (old?.version ?? 0) + 1,
    enabled: true,
    mailIds: p?.conditions.mailIds ?? [],
    ...(p?.conditions.cardIds ? { cardIds: p.conditions.cardIds } : {}),
    authorization,
    ...(rule ? { rule } : {}),
  };
  write("bank_delegations", d);
  if (p) {
    write("bank_delegation_proposals", { ...p, status: "accepted" });
    put("mail_access_grants", {
      id: "samples",
      enabled: true,
      scope: d.mailIds,
      authorization,
      delegationId: d.id,
      version: d.version,
    });
  }
  return d;
}
function active(d: Delegation, principal: Principal, scope: Scope) {
  const a = d.authorization;
  if (
    !d.enabled ||
    a.accountId !== principal.accountId ||
    a.agentId !== principal.agentId ||
    a.instanceId !== instance().id ||
    a.authMode !== principal.authMode ||
    a.generation !== principal.generation ||
    (principal.authMode === "world" &&
      a.approvalMethod !== "world" &&
      !(
        a.approvalMethod === "human-confirmation" &&
        !d.rule &&
        ["mail", "card", "read", "propose"].includes(scope)
      ))
  )
    throw new AuthorizationError(403);
  const p = assertDelegationApproval(a.approvalId, a);
  if (d.rule && scope === "redemption") assertRuleApproval(d.rule);
  else if (d.rule) {
    const rule = get<Rule>("rules", d.rule.id);
    if (!rule?.enabled || rule.version !== d.rule.version)
      throw new AuthorizationError(403);
    assertRuleApproval(rule);
  } else if (
    JSON.stringify((p.conditions as { mailIds: string[] }).mailIds) !==
      JSON.stringify(d.mailIds) ||
    (!d.rule &&
      JSON.stringify((p.conditions as { cardIds?: string[] }).cardIds ?? []) !==
        JSON.stringify(d.cardIds ?? []))
  )
    throw new AuthorizationError(403);
}
export function assertScope(principal: Principal, scope: Scope) {
  requirePrincipal(principal, "agent");
  table();
  const rows = sqlite.prepare("SELECT data FROM bank_delegations").all() as {
    data: string;
  }[];
  for (const row of rows) {
    const d: Delegation = JSON.parse(row.data);
    if (!d.authorization.scopes.includes(scope)) continue;
    try {
      active(d, principal, scope);
      return { id: d.id, version: d.version };
    } catch (e) {
      if (!(e instanceof AuthorizationError)) throw e;
    }
  }
  throw new AuthorizationError(403, "Approved delegation required");
}
export function allowedMailIds(principal: Principal) {
  const ref = assertScope(principal, "mail");
  return read<Delegation>("bank_delegations", ref.id)!.mailIds;
}
export function allowedCardIds(principal: Principal) {
  const ref = assertScope(principal, "card");
  return read<Delegation>("bank_delegations", ref.id)!.cardIds ?? [];
}
export function allowedPaymentSourceIds(principal: Principal) {
  const mailIds = allowedMailIds(principal);
  const ref = assertScope(principal, "mail");
  const d = read<Delegation>("bank_delegations", ref.id)!;
  return [
    ...mailIds,
    ...(d.cardIds?.length
      ? allowedCardIds(principal).map((id) => "card:" + id)
      : []),
  ];
}
export function authorizations(principal: Principal) {
  requirePrincipal(principal, "human");
  table();
  const state = authState();
  return (
    sqlite.prepare("SELECT data FROM bank_delegations").all() as {
      data: string;
    }[]
  )
    .map((r) => JSON.parse(r.data) as Delegation)
    .filter(
      (d) =>
        d.authorization.accountId === principal.accountId &&
        d.authorization.instanceId === instance().id,
    )
    .map((d) => ({
      ...d,
      status: !d.enabled
        ? "revoked"
        : d.authorization.authMode !== state.mode ||
            d.authorization.generation !== state.generation
          ? "reapproval-required"
          : "active",
    }));
}
export async function revokeDelegation(id: string, principal: Principal) {
  requirePrincipal(principal, "human");
  return serialized(() =>
    sqlite.transaction(() => {
      requirePrincipal(principal, "human");
      const d = read<Delegation>("bank_delegations", id);
      if (
        !d ||
        d.authorization.accountId !== principal.accountId ||
        d.authorization.instanceId !== instance().id
      )
        throw new AuthorizationError(404);
      invalidatePendingApprovals(
        principal.accountId,
        d.authorization.agentId,
        d.authorization.scopes,
      );
      return write("bank_delegations", {
        ...d,
        enabled: false,
        version: d.version + 1,
      });
    })(),
  );
}
