import { internalAgentPrincipal } from "@/server/auth";
import { z } from "zod";
import { invest } from "@/features/investment/service";
import { payDue } from "@/features/banking/payment";
import { checkRequest, failure } from "@/server/http";
export async function POST(req: Request) {
  try {
    checkRequest(req);
    const b = z
      .object({
        type: z.enum(["due_date_reached", "surplus_check"]),
        requestId: z.uuid(),
      })
      .strict()
      .parse(await req.json());
    return Response.json(
      await (b.type === "surplus_check"
        ? invest(internalAgentPrincipal(), b.requestId)
        : payDue(internalAgentPrincipal(), b.requestId)),
    );
  } catch (e) {
    return failure(e);
  }
}
