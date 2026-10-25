import { z } from "zod";
import { chat } from "@/features/chat/service";
import { all } from "@/server/records";
import { checkRequest, failure } from "@/server/http";
export const dynamic = "force-dynamic";
function chatFailure(e: unknown) {
  if (
    e instanceof Error &&
    [
      "Reset the demo before creating a new payment plan",
      "Start a fresh demo before the payment dates",
    ].includes(e.message)
  )
    return Response.json(
      {
        error:
          "Redeem any remaining investments, then reset the demo from Demo controls to start this plan.",
      },
      { status: 400 },
    );

  if (e instanceof Error && e.message === "Initialize demo first") {
    return Response.json(
      {
        error:
          "The demo account is not initialized. Initialize the demo on the Home page.",
        code: "DEMO_NOT_INITIALIZED",
      },
      { status: 409 },
    );
  }
  return failure(e);
}
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(all("messages"));
  } catch (e) {
    return chatFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    const principal = checkRequest(req)!;
    const input = z
      .object({
        text: z.string().min(1).max(1000),
        proposalId: z.string().optional(),
      })
      .strict()
      .parse(await req.json());
    return Response.json(await chat(principal, input.text, input.proposalId));
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.startsWith("Gemini request failed") ||
        e.message.startsWith("GEMINI_API_KEY is required") ||
        e.message.startsWith("AI invoice extraction differs"))
    ) {
      console.error(e.message);
      return Response.json(
        { error: `Unable to complete the AI request: ${e.message}` },
        { status: 502 },
      );
    }
    return chatFailure(e);
  }
}
