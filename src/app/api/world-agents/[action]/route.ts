import { z } from "zod";
import {
  authenticateRequest,
  requirePrincipal,
  cookieValue,
  AuthorizationError,
} from "@/server/auth";
import { failure } from "@/server/http";
import {
  connectAccount,
  connectionStatus,
  grantBalance,
  revokeBalance,
  beginAgentConnection,
  completeAgentConnection,
  hasPendingAgentConnection,
} from "@/features/external-agents/service";
import {
  beginWorldCheck,
  browserSecret,
  cancelWorldCheck,
  completeWorldCheck,
  worldCheckStatus,
} from "@/features/world-agents/service";
import { worldAgentsConfig, callbackPath } from "@/integrations/world-agents";

export const dynamic = "force-dynamic";
const cookieName = "world_agents_browser";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
function browser(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
function action(req: Request) {
  return new URL(req.url).pathname.split("/").at(-1);
}
function settingsReady() {
  try {
    worldAgentsConfig();
    return true;
  } catch {
    return false;
  }
}
function checkOrigin(req: Request) {
  if (req.headers.has("authorization"))
    throw new Error("Browser authentication required");
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const host = req.headers.get("host");
  if (!host || !/^[a-zA-Z0-9.:[\]-]+$/.test(host))
    throw new Error("Invalid host");
  const external = new URL(`${url.protocol}//${host}`);
  const loopback = (h: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(h);
  if (
    external.host !== url.host &&
    !(
      loopback(external.hostname) &&
      loopback(url.hostname) &&
      external.port === url.port
    )
  )
    throw new Error("Invalid host");
  if (
    origin !== external.origin ||
    (url.protocol !== "https:" && !loopback(url.hostname))
  )
    throw new Error("Invalid origin");
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new Error("Invalid content type");
}
function redirect(location = "/world-agents") {
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: location },
  });
}

export async function GET(req: Request) {
  if (action(req) === "connection") {
    try {
      const p = requirePrincipal(authenticateRequest(req), "human");
      return Response.json(connectionStatus(p, browser(req) ?? ""), {
        headers,
      });
    } catch (e) {
      return failure(e);
    }
  }
  if (action(req) === "status") {
    const configured = settingsReady();
    return Response.json(
      {
        configured,
        ...worldCheckStatus(browser(req)),
        environment: "sandbox",
        bankAccess: false,
      },
      { headers },
    );
  }
  if (action(req) !== "callback")
    return new Response(null, { status: 404, headers });
  const owner = browser(req);
  if (!owner)
    return new Response(
      "Verification session missing. Start again from /world-agents.",
      { status: 400, headers },
    );
  try {
    const callback = new URL(worldAgentsConfig().redirectUri);
    callback.search = new URL(req.url).search;
    if (callback.pathname !== callbackPath) throw new Error("Invalid callback");
    await completeWorldCheck(owner, callback);
    return redirect(
      hasPendingAgentConnection(owner)
        ? "/world-agents/connect"
        : "/world-agents",
    );
  } catch {
    // Never include callback parameters, tokens or upstream error descriptions.
    return redirect();
  }
}

export async function POST(req: Request) {
  try {
    checkOrigin(req);
  } catch {
    return Response.json(
      { error: "Request not allowed" },
      { status: 403, headers },
    );
  }
  if (
    ["connect", "grant", "revoke", "complete-connection"].includes(
      action(req) ?? "",
    )
  ) {
    try {
      const p = requirePrincipal(authenticateRequest(req), "human");
      const body = await req.json();
      if (action(req) === "complete-connection") {
        z.object({}).strict().parse(body);
        return Response.json(
          completeAgentConnection(
            p,
            browser(req) ?? "",
            cookieValue(req, "demo_sandbox"),
          ),
          { headers },
        );
      }
      if (action(req) === "connect") {
        z.object({}).strict().parse(body);
        connectAccount(p, browser(req) ?? "");
        return Response.json({ connected: true }, { headers });
      }
      if (action(req) === "grant") {
        const input = z
          .object({
            name: z.string(),
            redemptionHash: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
          })
          .strict()
          .parse(body);
        return Response.json(
          grantBalance(
            p,
            browser(req) ?? "",
            input.name,
            cookieValue(req, "demo_sandbox"),
            input.redemptionHash,
          ),
          { headers },
        );
      }
      const input = z.object({ id: z.uuid() }).strict().parse(body);
      revokeBalance(p, input.id);
      return Response.json({ revoked: true }, { headers });
    } catch (e) {
      return failure(e);
    }
  }
  if (action(req) === "cancel") {
    const owner = browser(req);
    if (owner) cancelWorldCheck(owner);
    return Response.json({ cancelled: true }, { headers });
  }
  if (!["begin", "begin-connection"].includes(action(req) ?? ""))
    return new Response(null, { status: 404, headers });
  if (!settingsReady())
    return Response.json(
      { error: "World Agents setup required" },
      { status: 503, headers },
    );
  const owner = browser(req) ?? browserSecret();
  let selection:
    | { p: ReturnType<typeof requirePrincipal>; input: unknown }
    | undefined;
  if (action(req) === "begin-connection") {
    try {
      selection = {
        p: requirePrincipal(authenticateRequest(req), "human"),
        input: await req.json(),
      };
    } catch (e) {
      return failure(e);
    }
  }
  try {
    const authorizationUrl = selection
      ? await beginAgentConnection(selection.p, owner, selection.input)
      : await beginWorldCheck(owner);
    return Response.json(
      { authorizationUrl: authorizationUrl.href },
      {
        headers: {
          ...headers,
          "Set-Cookie": `${cookieName}=${owner}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${worldAgentsConfig().origin.startsWith("https:") ? "; Secure" : ""}`,
        },
      },
    );
  } catch (e) {
    if (e instanceof AuthorizationError || e instanceof z.ZodError)
      return failure(e);
    return Response.json(
      { error: "World authentication is unavailable. Please try again." },
      { status: 502, headers },
    );
  }
}
