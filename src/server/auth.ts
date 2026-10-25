import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { worldConfig } from "../integrations/world";
import { sqlite } from "./db";
import { customerAccountId } from "../integrations/custody";
export class AuthorizationError extends Error {
  constructor(
    public status: 401 | 403 | 404 | 409,
    message = "Request not authorized",
  ) {
    super(message);
  }
}
export type AuthMode = "world" | "local-demo";
export type Principal = Readonly<{
  role: "human" | "agent";
  accountId: string;
  agentId?: string;
  credentialId: string;
  authMode: AuthMode;
  generation: number;
  expiresAt: number;
}>;
type Credential = Principal & {
  hash: string;
  revoked: number;
  binding: string | null;
};
const authentic = new WeakSet<object>();
export const sessionCookie = "bank_session";
export const fixedAgentId = "bank-agent";
export const hashSecret = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const secret = () => randomBytes(32).toString("hex");
export function authState() {
  const mode = process.env.BANK_AUTH_MODE ?? "world";
  if (mode !== "world" && mode !== "local-demo")
    throw new Error("Invalid BANK_AUTH_MODE");
  if (
    mode === "local-demo" &&
    !["127.0.0.1", "localhost", "::1"].includes(
      process.env.BANK_BIND_HOST ?? "",
    )
  )
    throw new Error("local-demo requires loopback startup");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS bank_auth_state(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,generation INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS bank_credentials(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS bank_enrollment_tickets(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);`);
  return sqlite.transaction(() => {
    const old = sqlite
      .prepare("SELECT mode,generation FROM bank_auth_state WHERE id=1")
      .get() as { mode: AuthMode; generation: number } | undefined;
    if (!old)
      sqlite.prepare("INSERT INTO bank_auth_state VALUES(1,?,1)").run(mode);
    else if (old.mode !== mode)
      sqlite
        .prepare(
          "UPDATE bank_auth_state SET mode=?,generation=generation+1 WHERE id=1",
        )
        .run(mode);
    return sqlite
      .prepare("SELECT mode,generation FROM bank_auth_state WHERE id=1")
      .get() as { mode: AuthMode; generation: number };
  })();
}
function issue(role: Principal["role"], binding: string | null) {
  const state = authState(),
    token = secret();
  const data: Credential = {
    role,
    accountId: customerAccountId,
    ...(role === "agent" ? { agentId: fixedAgentId } : {}),
    credentialId: randomUUID(),
    authMode: state.mode,
    generation: state.generation,
    expiresAt: Date.now() + (role === "human" ? 30 * 60_000 : 24 * 60 * 60_000),
    hash: hashSecret(token),
    revoked: 0,
    binding,
  };
  sqlite
    .prepare("INSERT INTO bank_credentials VALUES(?,?,?)")
    .run(data.credentialId, data.hash, JSON.stringify(data));
  return { token, expiresAt: data.expiresAt, credentialId: data.credentialId };
}
export function issueHumanSession(binding: string | null) {
  if (authState().mode === "world" && !binding)
    throw new AuthorizationError(403);
  return issue("human", binding);
}
export function issueAgentCredential() {
  return issue("agent", null);
}
export function revokeCredential(id: string) {
  authState();
  sqlite
    .prepare(
      "UPDATE bank_credentials SET data=json_set(data,'$.revoked',1) WHERE id=?",
    )
    .run(id);
}
function validate(c: Credential) {
  const state = authState();
  if (
    c.revoked ||
    c.expiresAt <= Date.now() ||
    c.authMode !== state.mode ||
    c.generation !== state.generation
  )
    throw new AuthorizationError(401);
  if (c.accountId !== customerAccountId) throw new AuthorizationError(404);
  if (c.role === "human" && c.authMode === "world") {
    const row = sqlite
      .prepare("SELECT data FROM world_accounts WHERE id=?")
      .get(c.accountId) as { data: string } | undefined;
    let config;
    try {
      config = worldConfig();
    } catch {
      throw new AuthorizationError(401);
    }
    const binding = row && JSON.parse(row.data);
    if (
      !binding ||
      binding.sessionId !== c.binding ||
      binding.appId !== config.appId ||
      binding.rpId !== config.rpId ||
      binding.environment !== config.environment ||
      binding.credential !== "proof_of_human" ||
      binding.flow !== config.flow
    )
      throw new AuthorizationError(401);
  }
}
function fromToken(token: string, role: Principal["role"]) {
  authState();
  const row = sqlite
    .prepare("SELECT data FROM bank_credentials WHERE hash=?")
    .get(hashSecret(token)) as { data: string } | undefined;
  if (!row) throw new AuthorizationError(401);
  const c: Credential = JSON.parse(row.data);
  validate(c);
  if (c.role !== role) throw new AuthorizationError(401);
  const { hash, revoked, binding, ...publicPart } = c;
  void hash;
  void revoked;
  void binding;
  const principal = Object.freeze(publicPart);
  authentic.add(principal);
  return principal;
}
export function requireCredential(
  id: string,
  role: Principal["role"],
  accountId = customerAccountId,
) {
  const row = sqlite
    .prepare("SELECT data FROM bank_credentials WHERE id=?")
    .get(id) as { data: string } | undefined;
  if (!row) throw new AuthorizationError(401);
  const credential: Credential = JSON.parse(row.data);
  validate(credential);
  if (credential.role !== role || credential.accountId !== accountId)
    throw new AuthorizationError(403);
}
export function requirePrincipal(
  p: Principal | undefined,
  role?: Principal["role"],
  accountId = customerAccountId,
): Principal {
  if (!p || !authentic.has(p)) throw new AuthorizationError(401);
  const row = sqlite
    .prepare("SELECT data FROM bank_credentials WHERE id=?")
    .get(p.credentialId) as { data: string } | undefined;
  if (!row) throw new AuthorizationError(401);
  validate(JSON.parse(row.data));
  if (role && p.role !== role) throw new AuthorizationError(403);
  if (p.accountId !== accountId) throw new AuthorizationError(404);
  return p;
}
export function cookieValue(req: Request, name = sessionCookie) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function authenticateRequest(req: Request): Principal | undefined {
  const cookie = cookieValue(req),
    bearer = req.headers.get("authorization");
  if (cookie && bearer) throw new AuthorizationError(403);
  if (bearer) {
    if (!/^Bearer [a-f0-9]{64}$/.test(bearer))
      throw new AuthorizationError(401);
    return fromToken(bearer.slice(7), "agent");
  }
  return cookie ? fromToken(cookie, "human") : undefined;
}
export function internalAgentPrincipal() {
  const path =
    process.env.BANK_AGENT_CREDENTIAL_FILE ?? ".data/agent-credential";
  if ((statSync(/* turbopackIgnore: true */ path).mode & 0o777) !== 0o600)
    throw new AuthorizationError(403);
  return fromToken(
    readFileSync(/* turbopackIgnore: true */ path, "utf8").trim(),
    "agent",
  );
}
export function issueEnrollmentTicket() {
  authState();
  const token = secret();
  sqlite
    .prepare("INSERT INTO bank_enrollment_tickets(hash,expires) VALUES(?,?)")
    .run(hashSecret(token), Date.now() + 300_000);
  return token;
}
export function sessionHeader(
  req: Request,
  token: string,
  maxAge = 1800,
  name = sessionCookie,
) {
  return `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
