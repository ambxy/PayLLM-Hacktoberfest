import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { requirePrincipal } from "@/server/auth";
import { createDelegationProposal } from "@/features/delegations/service";
export async function POST(req: Request) {
  try {
    const principal = requirePrincipal(checkRequest(req), "human");
    const b = z
      .object({ mailIds: z.array(z.string()) })
      .parse(await req.json());
    return Response.json(createDelegationProposal(principal, b.mailIds));
  } catch (e) {
    return failure(e);
  }
}
