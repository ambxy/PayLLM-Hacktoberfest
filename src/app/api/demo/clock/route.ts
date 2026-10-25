import { z } from "zod";
import { checkRequest, failure } from "@/server/http";
import { advanceClock, clockStatus } from "@/features/demo-plan/clock";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(clockStatus());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    const principal = checkRequest(req)!;
    const { date, requestId } = z
      .object({ date: z.iso.date(), requestId: z.uuid() })
      .strict()
      .parse(await req.json());
    return Response.json(await advanceClock(principal, date, requestId));
  } catch (error) {
    return failure(error);
  }
}
