import "server-only";
import { readFileSync } from "node:fs";
import { readMail } from "../../integrations/mail";
import { extract } from "../../integrations/ai";
import { put, all, get } from "../../server/records";
import type { Invoice, Mail, Rule } from "../../shared/domain";
import { paymentLimit } from "../rules/payment-limits";
import { AuthorizationError, type Principal } from "../../server/auth";
import { assertScope, allowedMailIds } from "../delegations/service";
export async function readAuthorized(principal: Principal) {
  const grant = assertScope(principal, "mail");
  const mailIds = allowedMailIds(principal);
  const mails = readMail().filter((mail) => mailIds.includes(mail.id));
  const invoices = await Promise.all(
    mails.map((mail) => {
      assertScope(principal, "mail");
      return extract(mail);
    }),
  );
  const latest = assertScope(principal, "mail");
  if (latest.id !== grant.id || latest.version !== grant.version)
    throw new AuthorizationError(403, "Mail permission changed");
  for (const mail of mails) {
    put("emails", mail);
    put("attachments", { id: mail.id, ...mail.attachment });
  }
  for (const invoice of invoices) {
    if (!get("invoices", invoice.id)) put("invoices", invoice);
  }
  for (const h of JSON.parse(readFileSync("fixtures/history.json", "utf8")))
    put("payment_history", h);
  return all<Invoice>("invoices").filter((invoice) =>
    mailIds.includes(invoice.emailId),
  );
}
export function listInvoices() {
  const rule = get<Rule>("rules", "payment");
  const invoices = all<Invoice>("invoices").filter(
    (invoice) =>
      invoice.status === "paid" ||
      (rule?.enabled && !!paymentLimit(rule, invoice.recipientId)),
  );
  return { invoices, emails: all<Mail>("emails") };
}
