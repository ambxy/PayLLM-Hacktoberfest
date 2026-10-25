import { checkRequest, failure } from "@/server/http";
import { requirePrincipal } from "@/server/auth";
import { authorizations } from "@/features/delegations/service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    return Response.json(
      authorizations(requirePrincipal(checkRequest(req), "human")),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
