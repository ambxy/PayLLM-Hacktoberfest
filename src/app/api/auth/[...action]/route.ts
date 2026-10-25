import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import {
  authState,
  AuthorizationError,
  cookieValue,
  issueHumanSession,
  requirePrincipal,
  revokeCredential,
  secret,
  sessionHeader,
} from "@/server/auth";
import {
  beginLogin,
  cancelLogin,
  cancelPendingLogins,
  completeLogin,
} from "@/features/auth/service";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req),
      action = new URL(req.url).pathname.slice("/api/auth/".length);
    const text = await req.text();
    if (text.length > 64000) throw new AuthorizationError(403);
    const body = JSON.parse(text);
    if (action === "logout") {
      revokeCredential(requirePrincipal(p, "human").credentialId);
      return Response.json(
        { loggedOut: true },
        {
          headers: {
            "Set-Cookie": sessionHeader(req, "", 0),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (action === "demo-login") {
      if (authState().mode !== "local-demo") throw new AuthorizationError(403);
      const owner = cookieValue(req, "bank_login");
      if (owner) cancelPendingLogins(owner);
      if (p) revokeCredential(p.credentialId);
      const s = issueHumanSession(null);
      return Response.json(
        { authenticated: true, authMode: "local-demo" },
        {
          headers: {
            "Set-Cookie": sessionHeader(req, s.token),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    const [purpose, step] = action.split("/");
    if (purpose !== "login" && purpose !== "enroll")
      throw new AuthorizationError(403);
    const owner = cookieValue(req, "bank_login");
    if (step === "begin") {
      const input = z
        .object({
          ticket: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        })
        .parse(body);
      const browser = owner ?? secret();
      cancelPendingLogins(browser);
      const challenge = beginLogin(purpose, browser, input.ticket);
      return Response.json(challenge, {
        headers: {
          "Set-Cookie": sessionHeader(req, browser, 300, "bank_login"),
          "Cache-Control": "no-store",
        },
      });
    }
    if (!owner) throw new AuthorizationError(401);
    const input = z
      .object({ id: z.string().uuid(), proof: z.unknown().optional() })
      .parse(body);
    if (step === "cancel") {
      cancelLogin(purpose, input.id, owner);
      return Response.json(
        { cancelled: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const s = await completeLogin(purpose, input.id, owner, input.proof);
    if (p) revokeCredential(p.credentialId);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionHeader(req, s.token));
    headers.append("Set-Cookie", sessionHeader(req, "", 0, "bank_login"));
    return Response.json(
      { authenticated: true, authMode: authState().mode },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function GET(req: Request) {
  try {
    const p = checkRequest(req);
    return Response.json(
      {
        authenticated: Boolean(p),
        authMode: authState().mode,
        ...(p ? { role: p.role } : {}),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(!p && cookieValue(req)
            ? { "Set-Cookie": sessionHeader(req, "", 0) }
            : {}),
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
