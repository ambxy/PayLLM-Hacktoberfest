import { listInvoices } from "@/features/invoices/service";
import { checkRequest, failure } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    checkRequest(req);
    return Response.json(listInvoices());
  } catch (e) {
    return failure(e);
  }
}
