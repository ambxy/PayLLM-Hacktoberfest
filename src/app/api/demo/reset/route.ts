import { reset } from "@/features/demo/service";
import { checkRequest, failure } from "@/server/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const principal = checkRequest(req)!;
    return Response.json(await reset(principal));
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "Redeem all positions before reset",
        "Redeem all public principal before reset",
        "TD locks remain",
      ].includes(e.message)
    ) {
      return Response.json(
        {
          code: "OUTSTANDING_ASSETS",
          error:
            "Cannot reset while funds are invested or transactions are pending. Send 'Redeem all investments to TD' in chat and wait for redemption before resetting. If an execution record says 'Needs review', check that operation first.",
        },
        { status: 409 },
      );
    }
    if (e instanceof Error && e.message === "Another operation is active") {
      return Response.json(
        {
          code: "OPERATION_IN_PROGRESS",
          error:
            "Cannot reset while a transaction is processing. Wait for it to complete.",
        },
        { status: 409 },
      );
    }
    return failure(e);
  }
}
