import "server-only";
import { randomUUID } from "node:crypto";
import { all, get, put } from "../../server/records";
import { sqlite } from "../../server/db";
import { serialized } from "../../server/mutex";
import type {
  Rule,
  Proposal,
  Invoice,
  PaymentRecipientLimit,
} from "../../shared/domain";
import { conditions } from "../../shared/rule-conditions";
import {
  requirePrincipal,
  AuthorizationError,
  type Principal,
} from "../../server/auth";
export { conditions };
import { invalidatePendingApprovals } from "../world/service";
import {
  proposalBinding,
  allowedPaymentSourceIds,
} from "../delegations/service";
export function proposePayment(principal: Principal) {
  const binding = proposalBinding(principal);
  const ids = allowedPaymentSourceIds(principal);
  const invoices = all<Invoice>("invoices").filter((i) =>
    ids.includes(i.emailId),
  );
  const aoba = invoices.find((invoice) => invoice.recipientId === "aoba");
  const sakura = invoices.find((invoice) => invoice.recipientId === "sakura");
  if (!aoba || !sakura) throw new Error("Read source first");
  const recipients: PaymentRecipientLimit[] = [
    "aoba",
    "sakura",
    "card",
  ].flatMap((id) => {
    const items = invoices.filter(
      (i) => i.recipientId === id && i.status !== "paid",
    );
    return items.length
      ? [
          {
            recipientId: id as PaymentRecipientLimit["recipientId"],
            maxPaymentJpy: items
              .reduce(
                (max, i) =>
                  BigInt(i.amountJpy) > max ? BigInt(i.amountJpy) : max,
                0n,
              )
              .toString(),
            monthlyLimitJpy: items
              .reduce((sum, i) => sum + BigInt(i.amountJpy), 0n)
              .toString(),
          },
        ]
      : [];
  });
  const existing = get<Rule>("rules", "payment");
  return put<Proposal>("proposals", {
    id: randomUUID(),
    ...binding,
    kind: "payment",
    baseVersion: existing?.version ?? 0,
    sourceIds: invoices.map((i) => i.id),
    status: "proposed",
    conditions: {
      id: "payment",
      enabled: true,
      recipientId: "aoba",
      maxPaymentJpy: aoba.amountJpy,
      monthlyLimitJpy: aoba.amountJpy,
      paymentRecipients: recipients,
      safetyBufferJpy: "0",
      maxInvestmentJpy: "0",
      minimumBalanceJpy: "0",
      payAt: "dueDate",
    },
  });
}
export async function accept(
  _id: string,
  _consentId: string,
  _approvalId?: string,
): Promise<Rule> {
  throw new AuthorizationError(403, "Approval must be applied by verification");
}
export async function change(_input: unknown): Promise<Rule> {
  throw new AuthorizationError(403, "Create an approval challenge for changes");
}
export async function disableRule(id: string, principal: Principal) {
  requirePrincipal(principal, "human");
  return serialized(() =>
    sqlite.transaction(() => {
      requirePrincipal(principal, "human");
      const rule = get<Rule>("rules", id);
      if (!rule) throw new AuthorizationError(404);
      invalidatePendingApprovals(
        principal.accountId,
        rule.authorization?.agentId ?? "bank-agent",
        id === "payment" ? ["payment"] : ["investment", "redemption"],
      );
      const updated = { ...rule, enabled: false, version: rule.version + 1 };
      put("rule_versions", { ...updated, id: id + ":" + updated.version });
      return put("rules", updated);
    })(),
  );
}
