import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sqlite, current } from "../../server/db";
import {
  authState,
  internalAgentPrincipal,
  hashSecret,
  secret,
  requirePrincipal,
  AuthorizationError,
  type Principal,
} from "../../server/auth";
import {
  beginWorldCheck,
  consumeWorldCheck,
  verifiedWorldCheck,
} from "../world-agents/service";
import { worldAgentsConfig } from "../../integrations/world-agents";
import { balance } from "../../integrations/td-ledger";

import { all, get } from "../../server/records";
import { createRedemptionRequest, redeem } from "../investment/redemption";
import type { Investment } from "../investment/service";
import type { Run } from "../../shared/domain";

const ttl = 15 * 60_000;
export const externalTokenPattern =
  /^abg\.([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([a-f0-9]{64})$/;
type Link = {
  accountId: string;
  identity: string;
  generation: number;
  mode: string;
  config: string;
};
type Grant = Link & {
  id: string;
  name: string;
  hash: string;
  instanceId: string;
  expiresAt: number;
  revoked: boolean;
  scope: "balance:read" | "balance:read redemption:execute";
  redemptionRequestId?: string;
};
type ConnectionRequest = {
  requestId: string;
  accountId: string;
  generation: number;
  mode: string;
  instanceId: string;
  expiresAt: number;
  name: string;
  redemptionHash?: string;
};
const configHash = () => hashSecret(JSON.stringify(worldAgentsConfig()));
function tables() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS external_world_accounts (account_id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS external_agent_grants (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, proof TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS external_agent_connection_requests (browser TEXT PRIMARY KEY, data TEXT NOT NULL);`);
}
export async function beginAgentConnection(
  p: Principal,
  browser: string,
  input: unknown,
) {
  requirePrincipal(p, "human");
  const selection = z
    .object({
      name: z.string().trim().min(1).max(60),
      redemptionHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict()
    .parse(input);
  const bank = current();
  if (!bank) throw new AuthorizationError(409);
  if (
    selection.redemptionHash &&
    redemptionQuote()?.hash !== selection.redemptionHash
  )
    throw new AuthorizationError(409);
  const expiresAt = Date.now() + 300_000;
  const url = await beginWorldCheck(browser);
  const request: ConnectionRequest = {
    ...selection,
    requestId: url.searchParams.get("state")!,
    accountId: p.accountId,
    generation: p.generation,
    mode: p.authMode,
    instanceId: bank.id,
    expiresAt,
  };
  tables();
  sqlite
    .prepare(
      "INSERT INTO external_agent_connection_requests VALUES(?,?) ON CONFLICT(browser) DO UPDATE SET data=excluded.data",
    )
    .run(hashSecret(browser), JSON.stringify(request));
  return url;
}
function connectionRequest(browser: string): ConnectionRequest | undefined {
  tables();
  const row = sqlite
    .prepare(
      "SELECT data FROM external_agent_connection_requests WHERE browser=?",
    )
    .get(hashSecret(browser)) as { data: string } | undefined;
  return row && JSON.parse(row.data);
}
export function hasPendingAgentConnection(browser: string) {
  const request = connectionRequest(browser);
  return Boolean(
    request &&
      request.expiresAt > Date.now() &&
      request.requestId === verifiedWorldCheck(browser).requestId,
  );
}
export function completeAgentConnection(
  p: Principal,
  browser: string,
  routingId?: string,
) {
  requirePrincipal(p, "human");
  return sqlite.transaction(() => {
    const request = connectionRequest(browser);
    if (!request) throw new AuthorizationError(403);
    const proof = verifiedWorldCheck(browser);
    if (
      request.requestId !== proof.requestId ||
      request.expiresAt <= Date.now() ||
      request.accountId !== p.accountId ||
      request.generation !== p.generation ||
      request.mode !== p.authMode ||
      request.instanceId !== current()?.id
    )
      throw new AuthorizationError(403);
    connectAccount(p, browser);
    const credential = grantBalance(
      p,
      browser,
      request.name,
      routingId,
      request.redemptionHash,
    );
    sqlite
      .prepare("DELETE FROM external_agent_connection_requests WHERE browser=?")
      .run(hashSecret(browser));
    return credential;
  })();
}
function linked(accountId: string): Link | undefined {
  tables();
  const row = sqlite
    .prepare("SELECT data FROM external_world_accounts WHERE account_id=?")
    .get(accountId) as { data: string } | undefined;
  return row && JSON.parse(row.data);
}
function owner(p: Principal, browser: string) {
  requirePrincipal(p, "human");
  const proof = verifiedWorldCheck(browser);
  return {
    proof,
    identity: hashSecret(
      JSON.stringify([proof.identity.issuer, proof.identity.subject]),
    ),
  };
}
function checkLink(p: Principal, browser: string) {
  const { proof, identity } = owner(p, browser);
  const link = linked(p.accountId);
  if (
    !link ||
    link.identity !== identity ||
    link.generation !== p.generation ||
    link.mode !== p.authMode ||
    link.config !== configHash()
  )
    throw new AuthorizationError(403);
  return { link, proof };
}
export function connectAccount(p: Principal, browser: string) {
  const { identity } = owner(p, browser);
  const old = linked(p.accountId);
  if (old && old.identity !== identity) throw new AuthorizationError(409);
  const link: Link = {
    accountId: p.accountId,
    identity,
    generation: p.generation,
    mode: p.authMode,
    config: configHash(),
  };
  sqlite
    .prepare(
      "INSERT INTO external_world_accounts VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET data=excluded.data",
    )
    .run(p.accountId, JSON.stringify(link));
}
function redemptionQuote() {
  if (!current()) return null;
  const orders = all<Investment>("investment_orders")
    .filter((o) => o.status === "invested")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!orders.length) return null;
  return {
    hash: hashSecret(JSON.stringify(orders)),
    totalJpy: orders.reduce((s, o) => s + BigInt(o.amountJpy), 0n).toString(),
    count: orders.length,
  };
}
export function connectionStatus(p: Principal, browser: string) {
  requirePrincipal(p, "human");
  let connected = false;
  try {
    checkLink(p, browser);
    connected = true;
  } catch {
    /* Expired verification must be renewed before granting access. */
  }
  tables();
  const rows = sqlite
    .prepare("SELECT data FROM external_agent_grants")
    .all() as { data: string }[];
  const state = current();
  return {
    connected,
    initialized: Boolean(state),
    accountLabel: "Account A",
    redemptionQuote: redemptionQuote(),
    grants: rows
      .map((r) => JSON.parse(r.data) as Grant)
      .filter(
        (g) =>
          g.accountId === p.accountId &&
          !g.revoked &&
          g.expiresAt > Date.now() &&
          g.generation === p.generation &&
          g.mode === p.authMode &&
          g.instanceId === state?.id,
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        scope: g.scope,
        expiresAt: g.expiresAt,
      })),
  };
}
export function grantBalance(
  p: Principal,
  browser: string,
  name: string,
  routingId?: string,
  redemptionHash?: string,
) {
  const agentName = z.string().trim().min(1).max(60).parse(name);
  return sqlite.transaction(() => {
    const { link, proof } = checkLink(p, browser);
    const state = current();
    if (!state) throw new AuthorizationError(409);
    const used = sqlite
      .prepare("SELECT id FROM external_agent_grants WHERE proof=?")
      .get(hashSecret(proof.requestId));
    if (used) throw new AuthorizationError(409);
    let redemption;
    if (redemptionHash !== undefined) {
      const quote = redemptionQuote();
      if (!quote || quote.hash !== redemptionHash)
        throw new AuthorizationError(409);
      redemption = createRedemptionRequest(p);
    }
    const sandbox = routingId ? z.uuid().parse(routingId) : randomUUID();
    const token = `abg.${sandbox}.${secret()}`;
    const grant: Grant = {
      ...link,
      id: randomUUID(),
      name: agentName,
      hash: hashSecret(token),
      instanceId: state.id,
      expiresAt: redemption ? redemption.expiresAt : Date.now() + ttl,
      revoked: false,
      scope: redemption ? "balance:read redemption:execute" : "balance:read",
      ...(redemption ? { redemptionRequestId: redemption.id } : {}),
    };
    sqlite
      .prepare("INSERT INTO external_agent_grants VALUES(?,?,?,?)")
      .run(
        grant.id,
        grant.hash,
        hashSecret(proof.requestId),
        JSON.stringify(grant),
      );
    consumeWorldCheck(browser);
    return {
      token,
      grantId: grant.id,
      expiresAt: grant.expiresAt,
      scope: grant.scope,
    };
  })();
}
export function revokeBalance(p: Principal, id: string) {
  requirePrincipal(p, "human");
  tables();
  const row = sqlite
    .prepare("SELECT data FROM external_agent_grants WHERE id=?")
    .get(id) as { data: string } | undefined;
  if (!row || (JSON.parse(row.data) as Grant).accountId !== p.accountId)
    throw new AuthorizationError(404);
  sqlite
    .prepare(
      "UPDATE external_agent_grants SET data=json_set(data,'$.revoked',json('true')) WHERE id=?",
    )
    .run(id);
}
function authenticate(token: string) {
  if (!externalTokenPattern.test(token)) throw new AuthorizationError(401);
  tables();
  const row = sqlite
    .prepare("SELECT data FROM external_agent_grants WHERE hash=?")
    .get(hashSecret(token)) as { data: string } | undefined;
  if (!row) throw new AuthorizationError(401);
  const g: Grant = JSON.parse(row.data),
    state = authState(),
    bank = current(),
    link = linked(g.accountId);
  if (
    g.revoked ||
    g.expiresAt <= Date.now() ||
    !["balance:read", "balance:read redemption:execute"].includes(g.scope) ||
    g.generation !== state.generation ||
    g.mode !== state.mode ||
    !bank ||
    bank.id !== g.instanceId ||
    !link ||
    link.identity !== g.identity ||
    link.config !== g.config ||
    configHash() !== g.config
  )
    throw new AuthorizationError(401);
  return { grant: g, bank };
}
export async function externalBalance(token: string) {
  const { bank } = authenticate(token);
  const [available, locked] = await Promise.all([
    balance(bank.token, bank.customer),
    balance(bank.token, bank.vault),
  ]);
  authenticate(token); // Cancellation and account reset can occur while the ledger is being read.
  return {
    account: "Account A",
    asset: "TD",
    unit: "JPY",
    available,
    locked,
    scope: "balance:read",
    environment: "demo",
  };
}

export async function externalRedeem(token: string) {
  const guard = () => {
    const { grant } = authenticate(token);
    if (
      grant.scope !== "balance:read redemption:execute" ||
      !grant.redemptionRequestId
    )
      throw new AuthorizationError(403);
    return grant;
  };
  const grant = guard();
  const run = await redeem(
    internalAgentPrincipal(),
    grant.redemptionRequestId!,
    guard,
  );
  return { runId: run.id, status: run.status, steps: run.steps };
}
export function externalRedemptionStatus(token: string) {
  const { grant } = authenticate(token);
  if (
    grant.scope !== "balance:read redemption:execute" ||
    !grant.redemptionRequestId
  )
    throw new AuthorizationError(403);
  const run = get<Run>("runs", grant.redemptionRequestId);
  return run
    ? { runId: run.id, status: run.status, steps: run.steps }
    : { status: "ready", steps: [] };
}
