import { get } from "@/server/records";
import { checkRequest, failure } from "@/server/http";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkRequest(req);
    const { id } = await params;
    const run = get("runs", id);
    return run
      ? Response.json(run)
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
