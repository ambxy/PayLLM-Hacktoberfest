import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { invest } from "@/features/investment/service";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    const b = z
      .object({ requestId: z.uuid() })
      .strict()
      .parse(await req.json());

    return Response.json(await invest(p, b.requestId));
  } catch (e) {
    return failure(e);
  }
}
