import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sqlite } from "../../server/db";
import {
  oidc,
  worldAgentsClient,
  worldAgentsConfig,
  worldAgentsAcr,
  verifiedIdentity,
  type VerifiedWorldIdentity,
} from "../../integrations/world-agents";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const browserSecret = () => randomBytes(32).toString("hex");
type Status =
  | "pending"
  | "verifying"
  | "verified"
  | "used"
  | "cancelled"
  | "expired"
  | "failed";
type Attempt = {
  state: string;
  browser: string;
  startedAt: number;
  expiresAt: number;
  status: Status;
  verifier?: string;
  nonce?: string;
  config: string;
  previous?: VerifiedWorldIdentity;
  identity?: VerifiedWorldIdentity;
  sameHuman?: boolean;
};
function tables() {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS world_agent_checks (browser TEXT PRIMARY KEY, state TEXT UNIQUE NOT NULL, data TEXT NOT NULL)",
  );
}
function read(browser: string): Attempt | undefined {
  tables();
  const row = sqlite
    .prepare("SELECT data FROM world_agent_checks WHERE browser=?")
    .get(hash(browser)) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
function save(a: Attempt) {
  sqlite
    .prepare(
      "INSERT INTO world_agent_checks VALUES(?,?,?) ON CONFLICT(browser) DO UPDATE SET state=excluded.state,data=excluded.data",
    )
    .run(a.browser, a.state, JSON.stringify(a));
}
function terminal(a: Attempt, status: Status) {
  a.status = status;
  delete a.verifier;
  delete a.nonce;
  if (status !== "verified") delete a.identity;
  save(a);
}
const fingerprint = () => hash(JSON.stringify(worldAgentsConfig()));
function current(a: Attempt) {
  if (a.expiresAt <= Date.now()) {
    terminal(a, "expired");
    throw new Error("World request expired");
  }
  if (a.config !== fingerprint()) {
    terminal(a, "failed");
    throw new Error("World configuration changed");
  }
}

export async function beginWorldCheck(browser: string) {
  const config = await worldAgentsClient();
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const previous = read(browser);
  const startedAt = Date.now();
  sqlite
    .prepare(
      "DELETE FROM world_agent_checks WHERE json_extract(data,'$.expiresAt')<?",
    )
    .run(startedAt - 1_800_000);
  const a: Attempt = {
    state: oidc.randomState(),
    browser: hash(browser),
    startedAt,
    expiresAt: startedAt + 300_000,
    status: "pending",
    verifier,
    nonce: oidc.randomNonce(),
    config: fingerprint(),
    previous:
      previous && previous.expiresAt > startedAt
        ? (previous.identity ?? previous.previous)
        : undefined,
  };
  save(a);
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: worldAgentsConfig().redirectUri,
    scope: "openid",
    response_type: "code",
    state: a.state,
    nonce: a.nonce!,
    code_challenge: challenge,
    code_challenge_method: "S256",
    max_age: "0",
    acr_values: worldAgentsAcr,
  });
}

export function worldCheckStatus(browser?: string) {
  if (!browser) return { status: "idle" as const };
  const a = read(browser);
  if (!a) return { status: "idle" as const };
  if (["pending", "verifying", "verified"].includes(a.status)) {
    try {
      if (a.config !== fingerprint()) terminal(a, "failed");
    } catch {
      terminal(a, "failed");
    }
  }
  if (
    a.expiresAt <= Date.now() &&
    ["pending", "verifying", "verified"].includes(a.status)
  )
    terminal(a, "expired");
  return {
    status: a.status,
    ...(a.status === "verified" ? { sameHuman: a.sameHuman ?? false } : {}),
  };
}

export function cancelWorldCheck(browser: string) {
  const a = read(browser);
  if (a && ["pending", "verifying"].includes(a.status))
    terminal(a, "cancelled");
}

export async function completeWorldCheck(browser: string, url: URL) {
  const a = sqlite.transaction(() => {
    const a = read(browser);
    if (
      !a ||
      a.status !== "pending" ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== a.state
    )
      throw new Error("World request unavailable");
    current(a);
    a.status = "verifying";
    save(a);
    return a;
  })();
  try {
    const config = await worldAgentsClient();
    const tokens = await oidc.authorizationCodeGrant(config, url, {
      expectedState: a.state,
      expectedNonce: a.nonce!,
      pkceCodeVerifier: a.verifier!,
      idTokenExpected: true,
    });
    const identity = verifiedIdentity(tokens.claims()!, a.startedAt);
    if (
      a.previous &&
      (a.previous.issuer !== identity.issuer ||
        a.previous.subject !== identity.subject)
    ) {
      throw new Error("World identity changed");
    }
    sqlite.transaction(() => {
      const latest = read(browser);
      if (!latest || latest.state !== a.state || latest.status !== "verifying")
        throw new Error("World request cancelled");
      current(latest);
      latest.identity = identity;
      latest.sameHuman = Boolean(a.previous);
      delete latest.previous;
      terminal(latest, "verified");
    })();
  } catch (e) {
    const latest = read(browser);
    if (latest?.state === a.state && latest.status === "verifying") {
      terminal(
        latest,
        e instanceof oidc.AuthorizationResponseError &&
          e.error === "access_denied"
          ? "cancelled"
          : "failed",
      );
    }
    throw new Error("World verification did not complete");
  }
}

export function consumeWorldCheck(browser: string) {
  const a = read(browser)!;
  a.previous = a.identity;
  terminal(a, "used");
}

// This accessor stays server-only; callers must separately prove account ownership.
export function verifiedWorldCheck(browser: string) {
  if (worldCheckStatus(browser).status !== "verified")
    throw new Error("Fresh World verification required");
  const a = read(browser)!;
  return { requestId: a.state, identity: a.identity! };
}
