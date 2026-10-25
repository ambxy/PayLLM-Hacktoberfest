import { activateApprovedInvestment } from "@/features/world/activation";
import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { requirePrincipal } from "@/server/auth";
import {
  beginDemoApproval,
  completeDemoApproval,
  cancelDemoApproval,
} from "@/features/world/service";
export async function POST(req: Request) {
  try {
    const principal = requirePrincipal(checkRequest(req), "human");
    const b = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("begin"), input: z.unknown() }),
        z.object({ action: z.literal("confirm"), id: z.string().uuid() }),
        z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
      ])
      .parse(await req.json());
    return Response.json(
      b.action === "begin"
        ? beginDemoApproval(b.input, principal)
        : b.action === "cancel"
          ? await cancelDemoApproval(b.id, principal)
          : await activateApprovedInvestment(
              await completeDemoApproval(b.id, principal),
            ),
    );
  } catch (e) {
    return failure(e);
  }
}
