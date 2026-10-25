import { checkRequest, failure } from "@/server/http";
import { agentRead, readRequest } from "@/features/agents/read";
export async function POST(req: Request) {
  try {
    const p = checkRequest(req)!;
    const input = readRequest.parse(await req.json());
    return Response.json(await agentRead(p, input));
  } catch (e) {
    return failure(e);
  }
}
