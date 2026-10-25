import { z } from "zod";
import {
  externalRedeem,
  externalRedemptionStatus,
} from "@/features/external-agents/service";
import { cookieValue, AuthorizationError } from "@/server/auth";
import { failure } from "@/server/http";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function token(req: Request) {
  if (cookieValue(req)) throw new AuthorizationError(403);
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new AuthorizationError(401);
  return auth.slice(7);
}
export async function POST(req: Request) {
  try {
    const credential = token(req);
    z.object({ action: z.literal("redeem-approved") })
      .strict()
      .parse(await req.json());
    return Response.json(await externalRedeem(credential), { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    return Response.json(externalRedemptionStatus(token(req)), { headers });
  } catch (e) {
    return failure(e);
  }
}
