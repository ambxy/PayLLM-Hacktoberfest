import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { redeem } from "@/features/investment/redemption";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    const b = z
      .object({ requestId: z.uuid() })
      .strict()
      .parse(await req.json());

    return Response.json(await redeem(p, b.requestId));
  } catch (e) {
    return failure(e);
  }
}
