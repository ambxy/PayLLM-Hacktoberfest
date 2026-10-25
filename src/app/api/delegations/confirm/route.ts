import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { requirePrincipal } from "@/server/auth";
import { confirmMailDelegation } from "@/features/world/service";

export async function POST(req: Request) {
  try {
    const principal = requirePrincipal(checkRequest(req), "human");
    const { proposalId } = z
      .object({ proposalId: z.string().uuid() })
      .parse(await req.json());
    return Response.json(confirmMailDelegation(proposalId, principal));
  } catch (e) {
    return failure(e);
  }
}
