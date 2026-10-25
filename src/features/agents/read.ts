import "server-only";
import { z } from "zod";
import { AuthorizationError, type Principal } from "../../server/auth";
import { all, get, instance } from "../../server/records";
import { balance } from "../../integrations/td-ledger";
import { assertScope, allowedMailIds } from "../delegations/service";
import { readAuthorized } from "../invoices/service";
import { cashflow } from "../cashflow/service";
import type { Invoice, Mail, Rule, Run } from "../../shared/domain";
export const readRequest = z.discriminatedUnion("resource", [
  z
    .object({ resource: z.enum(["balance", "invoices", "cashflow", "rules"]) })
    .strict(),
  z.object({ resource: z.literal("run"), runId: z.uuid() }).strict(),
]);
export async function agentRead(
  p: Principal,
  input: z.infer<typeof readRequest>,
) {
  assertScope(p, "read");
  if (input.resource === "balance") {
    const s = instance();
    const result = {
      td: await balance(s.token, s.customer),
      locked: await balance(s.token, s.vault),
      currency: "JPY",
    };
    assertScope(p, "read");
    return result;
  }
  if (input.resource === "rules") return { rules: all<Rule>("rules") };
  allowedMailIds(p);
  if (input.resource === "invoices") {
    const invoices = await readAuthorized(p);
    assertScope(p, "read");
    const currentIds = allowedMailIds(p);
    return {
      invoices: invoices.filter((invoice) =>
        currentIds.includes(invoice.emailId),
      ),
      emails: all<Mail>("emails").filter((mail) =>
        currentIds.includes(mail.id),
      ),
    };
  }
  const checkSources = () => {
    assertScope(p, "read");
    const currentIds = allowedMailIds(p);
    if (
      all<Invoice>("invoices").some(
        (invoice) => !currentIds.includes(invoice.emailId),
      )
    )
      throw new Error("Unpermitted source");
  };
  checkSources();
  if (input.resource === "cashflow") {
    const result = await cashflow();
    checkSources();
    return result;
  }
  if (!("runId" in input)) throw new Error("Run ID required");
  const run = get<Run>("runs", input.runId);
  if (!run) throw new AuthorizationError(404);
  return { run };
}
