import { activateApprovedInvestment } from "@/features/world/activation";
import { sqlite, current } from "@/server/db";
import { authState, AuthorizationError } from "@/server/auth";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { checkRequest, failure as httpFailure } from "@/server/http";
import {
  beginChallenge,
  cancelChallenge,
  completeChallenge,
  worldStatus,
} from "@/features/world/service";
import { enrollmentTicketRequired } from "@/features/auth/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "world_browser";
function owner(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(
      {
        ...worldStatus(),
        enrollTicketRequired: enrollmentTicketRequired(),
        authMode: authState().mode,
        configuredMode: process.env.PUBLIC_ASSET_MODE ?? "stub",
        persistedMode: current()?.publicMode ?? "stub",
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return httpFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    const principal = checkRequest(req);
    const text = await req.text();
    if (text.length > 64000) throw new Error("World request too large");
    const body = z
      .object({
        action: z.enum(["begin", "verify", "cancel"]),
        input: z.unknown().optional(),
        id: z.string().uuid().optional(),
        proof: z.unknown().optional(),
      })
      .parse(JSON.parse(text));
    const token = owner(req);
    if (body.action === "begin") {
      if (
        typeof body.input === "object" &&
        body.input !== null &&
        "purpose" in body.input &&
        body.input.purpose === "enroll"
      )
        throw new AuthorizationError(403);
      const browser = token ?? randomBytes(32).toString("hex");
      return Response.json(beginChallenge(body.input, browser, principal), {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${cookieName}=${browser}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
        },
      });
    }
    if (!token || !body.id) throw new Error("World browser challenge required");
    const saved = sqlite
      .prepare("SELECT data FROM world_challenges WHERE id=?")
      .get(body.id) as { data: string } | undefined;
    if (saved && JSON.parse(saved.data).purpose === "enroll")
      throw new AuthorizationError(403);
    if (body.action === "cancel") {
      cancelChallenge(body.id, token, principal);
      return Response.json({ cancelled: true });
    }
    return Response.json(
      await activateApprovedInvestment(
        await completeChallenge(body.id, token, body.proof, principal),
      ),
    );
  } catch (e) {
    return httpFailure(e);
  }
}
