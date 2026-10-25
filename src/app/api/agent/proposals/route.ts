import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { proposePayment } from "@/features/rules/service";
import { proposeInvestment } from "@/features/investment/service";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    const b = z
      .object({ kind: z.enum(["payment", "investment"]) })
      .strict()
      .parse(await req.json());

    return Response.json(
      b.kind === "payment" ? proposePayment(p) : await proposeInvestment(p),
    );
  } catch (e) {
    return failure(e);
  }
}
