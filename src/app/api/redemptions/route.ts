import { z } from "zod";
import { createRedemptionRequest } from "@/features/investment/redemption";
import { checkRequest, failure } from "@/server/http";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    z.object({ action: z.literal("redeem-all") })
      .strict()
      .parse(await req.json());
    return Response.json(createRedemptionRequest(p));
  } catch (e) {
    return failure(e);
  }
}
