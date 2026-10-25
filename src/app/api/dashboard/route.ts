import { dashboard } from "@/features/demo/service";
import { checkRequest, failure } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(await dashboard());
  } catch (e) {
    return failure(e);
  }
}
