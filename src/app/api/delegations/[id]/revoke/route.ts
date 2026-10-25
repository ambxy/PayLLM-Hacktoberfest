import { checkRequest, failure } from "@/server/http";
import { requirePrincipal } from "@/server/auth";
import { revokeDelegation } from "@/features/delegations/service";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await revokeDelegation(
        (await params).id,
        requirePrincipal(checkRequest(req), "human"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
