import { all } from "@/server/records";
import { checkRequest, failure } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(all("investment_orders"));
  } catch (e) {
    return failure(e);
  }
}
