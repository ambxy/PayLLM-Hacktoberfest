import { externalBalance } from "@/features/external-agents/service";
import { cookieValue, AuthorizationError } from "@/server/auth";
import { failure } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    if (cookieValue(req)) throw new AuthorizationError(403);
    const header = req.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new AuthorizationError(401);
    return Response.json(await externalBalance(header.slice(7)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
