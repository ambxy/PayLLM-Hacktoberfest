import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "../../server/db";
import {
  authState,
  AuthorizationError,
  hashSecret,
  issueHumanSession,
} from "../../server/auth";
import { customerAccountId } from "../../integrations/custody";
import {
  createRpContext,
  inspectProof,
  verifyWorldProof,
  worldConfig,
  worldCredential,
  type WorldFlow,
} from "../../integrations/world";
type Binding = {
  sessionId: string;
  appId: string;
  rpId: string;
  environment: string;
  // Missing on Selfie Check session bindings, which are no longer accepted.
  credential?: string;
  flow?: WorldFlow;
};
type Challenge = ReturnType<typeof createRpContext> & {
  id: string;
  owner: string;
  purpose: "login" | "enroll";
  signal: string;
  sessionId?: string;
  ticketHash?: string;
  status: string;
  generation: number;
  authMode: string;
};
function tables() {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS world_accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS world_used_proofs(id TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS bank_login_challenges(id TEXT PRIMARY KEY,data TEXT NOT NULL);`,
  );
}
export function worldBinding(): Binding | undefined {
  tables();
  const row = sqlite
    .prepare("SELECT data FROM world_accounts WHERE id=?")
    .get(customerAccountId) as { data: string } | undefined;
  return row && JSON.parse(row.data);
}
function read(id: string): Challenge {
  tables();
  const r = sqlite
    .prepare("SELECT data FROM bank_login_challenges WHERE id=?")
    .get(id) as { data: string } | undefined;
  if (!r) throw new AuthorizationError(404);
  return JSON.parse(r.data);
}
function save(c: Challenge) {
  sqlite
    .prepare(
      "INSERT INTO bank_login_challenges VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .run(c.id, JSON.stringify(c));
}
// Public demo sandboxes are disposable and per visitor, so the first World
// login enrolls the account without an out-of-band ticket.
export function enrollmentTicketRequired() {
  return process.env.WORLD_ENROLL_WITHOUT_TICKET !== "true";
}
function ticketValid(hash: string | undefined) {
  const t = sqlite
    .prepare(
      "SELECT expires,consumed FROM bank_enrollment_tickets WHERE hash=?",
    )
    .get(hash ?? "") as { expires: number; consumed: number } | undefined;
  if (!t || t.consumed || t.expires <= Date.now())
    throw new AuthorizationError(403);
}
function fresh(c: Challenge) {
  const config = worldConfig(),
    state = authState();
  if (
    c.generation !== state.generation ||
    c.authMode !== state.mode ||
    Date.now() >= c.rpContext.expires_at * 1000 ||
    config.appId !== c.appId ||
    config.rpId !== c.rpContext.rp_id ||
    config.environment !== c.environment ||
    c.credential !== worldCredential ||
    config.flow !== c.flow
  )
    throw new AuthorizationError(409);
  const b = worldBinding();
  if (c.purpose === "enroll") {
    if (b) throw new AuthorizationError(409);
    if (c.ticketHash || enrollmentTicketRequired()) ticketValid(c.ticketHash);
  } else if (
    !b ||
    b.sessionId !== c.sessionId ||
    b.appId !== c.appId ||
    b.rpId !== c.rpContext.rp_id ||
    b.environment !== c.environment ||
    b.credential !== worldCredential ||
    b.flow !== config.flow
  )
    throw new AuthorizationError(403);
}
export function beginLogin(
  purpose: "login" | "enroll",
  owner: string,
  ticket?: string,
) {
  const state = authState(),
    context = createRpContext(),
    b = worldBinding();
  if (purpose === "enroll") {
    if (b) throw new AuthorizationError(409);
    if (enrollmentTicketRequired())
      ticketValid(ticket ? hashSecret(ticket) : undefined);
  } else if (!b) throw new AuthorizationError(403);
  const id = randomUUID();
  const c: Challenge = {
    ...context,
    id,
    owner: hashSecret(owner),
    purpose,
    signal: hashSecret(
      JSON.stringify({
        domain: "bank-auth/v1",
        purpose,
        id,
        accountId: customerAccountId,
        context,
        generation: state.generation,
      }),
    ),
    ...(purpose === "login"
      ? { sessionId: b!.sessionId }
      : enrollmentTicketRequired()
        ? { ticketHash: hashSecret(ticket!) }
        : {}),
    status: "pending",
    generation: state.generation,
    authMode: state.mode,
  };
  fresh(c);
  save(c);
  return {
    id,
    purpose,
    appId: c.appId,
    environment: c.environment,
    credential: c.credential,
    flow: c.flow,
    ...(c.action ? { action: c.action } : {}),
    rpContext: c.rpContext,
    signal: c.signal,
    ...(c.sessionId ? { sessionId: c.sessionId } : {}),
  };
}
export async function completeLogin(
  purpose: "login" | "enroll",
  id: string,
  owner: string,
  proof: unknown,
) {
  const c = sqlite.transaction(() => {
    const c = read(id);
    if (c.owner !== hashSecret(owner) || c.purpose !== purpose)
      throw new AuthorizationError(403);
    if (c.status !== "pending") throw new AuthorizationError(409);
    fresh(c);
    save({ ...c, status: "verifying" });
    return c;
  })();
  try {
    const expected = {
      nonce: c.rpContext.nonce,
      signal: c.signal,
      expiresAt: c.rpContext.expires_at,
      environment: c.environment,
      flow: c.flow,
      action: c.action,
      sessionId: c.sessionId,
    };
    const checked = inspectProof(proof, expected);
    const replay = hashSecret(
      JSON.stringify([c.rpContext.rp_id, c.environment, checked.nullifier]),
    );
    if (
      sqlite.prepare("SELECT id FROM world_used_proofs WHERE id=?").get(replay)
    )
      throw new AuthorizationError(409);
    const result = await verifyWorldProof(proof, expected);
    return sqlite.transaction(() => {
      const latest = read(id);
      if (latest.status !== "verifying") throw new AuthorizationError(409);
      fresh(latest);
      sqlite.prepare("INSERT INTO world_used_proofs VALUES(?)").run(replay);
      if (purpose === "enroll") {
        if (c.ticketHash) {
          const used = sqlite
            .prepare(
              "UPDATE bank_enrollment_tickets SET consumed=1 WHERE hash=? AND consumed=0 AND expires>?",
            )
            .run(c.ticketHash, Date.now());
          if (used.changes !== 1) throw new AuthorizationError(409);
        }
        sqlite.prepare("INSERT INTO world_accounts VALUES(?,?)").run(
          customerAccountId,
          JSON.stringify({
            sessionId: result.sessionId,
            appId: c.appId,
            rpId: c.rpContext.rp_id,
            environment: c.environment,
            credential: c.credential,
            flow: c.flow,
          }),
        );
      }
      save({ ...latest, status: "consumed" });
      return issueHumanSession(result.sessionId);
    })();
  } catch (e) {
    console.warn("World login verification failed:", (e as Error).message);
    const latest = read(id);
    if (latest.status === "verifying") save({ ...latest, status: "failed" });
    throw e;
  }
}
export function cancelLogin(
  purpose: "login" | "enroll",
  id: string,
  owner: string,
) {
  const c = read(id);
  if (c.owner !== hashSecret(owner) || c.purpose !== purpose)
    throw new AuthorizationError(403);
  if (c.status === "consumed") throw new AuthorizationError(409);
  save({ ...c, status: "cancelled" });
}

export function cancelPendingLogins(owner: string) {
  tables();
  sqlite
    .prepare(
      `UPDATE bank_login_challenges
    SET data=json_set(data,'$.status','cancelled')
    WHERE json_extract(data,'$.owner')=?
      AND json_extract(data,'$.status') IN ('pending','verifying')`,
    )
    .run(hashSecret(owner));
}
