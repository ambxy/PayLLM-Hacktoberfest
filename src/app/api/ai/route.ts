import { aiMode } from "@/integrations/ai";
import { checkRequest, failure } from "@/server/http";

export const dynamic = "force-dynamic";
export function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json({ mode: aiMode() });
  } catch (e) {
    return failure(e);
  }
}
