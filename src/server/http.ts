import "server-only";
import {
  authenticateRequest,
  authState,
  AuthorizationError,
  requirePrincipal,
} from "./auth";
export const apiPolicy: ReadonlyArray<{
  method: string;
  path: RegExp;
  role: "public" | "human" | "agent";
}> = [
  {
    method: "POST",
    path: /^\/api\/external-agent\/redemptions$/,
    role: "agent",
  },
  {
    method: "GET",
    path: /^\/api\/external-agent\/redemptions$/,
    role: "agent",
  },
  { method: "GET", path: /^\/api\/world-agents\/connection$/, role: "human" },
  {
    method: "POST",
    path: /^\/api\/world-agents\/(connect|grant|revoke|begin-connection|complete-connection)$/,
    role: "human",
  },
  { method: "GET", path: /^\/api\/external-agent\/balance$/, role: "agent" },
  {
    method: "GET",
    path: /^\/api\/world-agents\/(status|callback)$/,
    role: "public",
  },
  {
    method: "POST",
    path: /^\/api\/world-agents\/(begin|cancel)$/,
    role: "public",
  },
  { method: "GET", path: /^\/api\/(world|auth\/session)$/, role: "public" },
  {
    method: "POST",
    path: /^\/api\/auth\/(enroll|login)\/(begin|verify|cancel)$/,
    role: "public",
  },
  { method: "POST", path: /^\/api\/auth\/demo-login$/, role: "public" },
  { method: "POST", path: /^\/api\/auth\/logout$/, role: "human" },
  {
    method: "GET",
    path: /^\/api\/(demo\/clock|ai|dashboard|investments|invoices|cashflow|rules|delegations|chat\/messages|runs\/[^/]+)$/,
    role: "human",
  },
  {
    method: "POST",
    path: /^\/api\/(world|chat\/messages|demo\/(events|reset|approvals|clock)|redemptions|delegations\/(proposals|confirm)|delegations\/[^/]+\/revoke|rules\/[^/]+\/disable)$/,
    role: "human",
  },
  { method: "PATCH", path: /^\/api\/rules$/, role: "human" },
  {
    method: "POST",
    path: /^\/api\/agent\/(read|proposals|payments|investments|redemptions)$/,
    role: "agent",
  },
];
export function checkRequest(req: Request) {
  const url = new URL(req.url),
    state = authState();
  const host = req.headers.get("host");
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host))
    throw new AuthorizationError(403);
  const external = new URL(`${url.protocol}//${host}`);
  const loopback = (hostname: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  // Next normalizes the loopback request URL to localhost.
  if (
    external.host !== url.host &&
    !(
      loopback(external.hostname) &&
      loopback(url.hostname) &&
      external.port === url.port
    )
  )
    throw new AuthorizationError(403);

  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new AuthorizationError(403);
  if (
    state.mode === "local-demo" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new AuthorizationError(403);
  const rule = apiPolicy.find(
    (p) => p.method === req.method && p.path.test(url.pathname),
  );
  if (!rule) throw new AuthorizationError(403);
  let principal;
  try {
    principal = authenticateRequest(req);
  } catch (e) {
    if (
      !(
        rule.role === "public" &&
        !req.headers.has("authorization") &&
        e instanceof AuthorizationError &&
        e.status === 401
      )
    )
      throw e;
  }
  const mutation = !["GET", "HEAD"].includes(req.method);
  const origin = req.headers.get("origin");
  if (
    (origin && origin !== external.origin) ||
    (mutation && principal?.role !== "agent" && origin !== external.origin)
  )
    throw new AuthorizationError(403);
  if (
    mutation &&
    !req.headers.get("content-type")?.includes("application/json")
  )
    throw new AuthorizationError(403);
  if (rule.role === "public") {
    if (mutation && principal?.role === "agent")
      throw new AuthorizationError(403);
  } else requirePrincipal(principal, rule.role);
  return principal;
}
export function failure(e: unknown) {
  return Response.json(
    {
      error:
        "Unable to complete the operation. Check authentication, permissions, and execution records.",
    },
    {
      status: e instanceof AuthorizationError ? e.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
