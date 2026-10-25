import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { payDue } from "@/features/banking/payment";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    const b = z
      .object({ requestId: z.uuid() })
      .strict()
      .parse(await req.json());

    return Response.json(await payDue(p, b.requestId));
  } catch (e) {
    return failure(e);
  }
}
