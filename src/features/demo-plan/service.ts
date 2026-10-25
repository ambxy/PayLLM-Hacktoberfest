import "server-only";
import { randomUUID } from "node:crypto";
import { all, get, instance, put } from "@/server/records";
import { balance } from "@/integrations/td-ledger";
import {
  allowedPaymentSourceIds,
  proposalBinding,
} from "@/features/delegations/service";
import { proposePayment } from "@/features/rules/service";
import type { Principal } from "@/server/auth";
import type {
  Invoice,
  InvestmentAllocation,
  Proposal,
  Rule,
} from "@/shared/domain";

export const grantPaymentDataRequest =
  "I grant access to my card payment information and invoices.";
export type PaymentPlanProposal = Proposal & { paymentProposalId: string };
export async function proposePaymentPlan(agent: Principal) {
  const binding = proposalBinding(agent);
  const ids = allowedPaymentSourceIds(agent);
  const invoices = all<Invoice>("invoices")
    .filter((i) => ids.includes(i.emailId) && i.status !== "paid")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
  if (!invoices.length || !invoices.some((i) => i.source === "card"))
    throw new Error("Payment sources required");
  const s = instance();
  if (invoices.some((i) => Date.parse(i.dueAt) <= Date.parse(s.clock)))
    throw new Error("Start a fresh demo before the payment dates");
  const td = await balance(s.token, s.customer);
  const total = invoices.reduce((sum, i) => sum + BigInt(i.amountJpy), 0n);
  if (total > BigInt(td))
    throw new Error("Deposit does not cover scheduled payments");
  const payment = proposePayment(agent);
  const allocations: InvestmentAllocation[] = invoices.map((i) => ({
    id: i.id,
    paymentId: i.id,
    amountJpy: i.amountJpy,
    dueAt: i.dueAt,
  }));
  if (BigInt(td) > total)
    allocations.push({
      id: "remaining-deposit",
      amountJpy: (BigInt(td) - total).toString(),
    });
  const proposal = put<PaymentPlanProposal>("proposals", {
    id: randomUUID(),
    ...binding,
    kind: "investment",
    paymentProposalId: payment.id,
    baseVersion: get<Rule>("rules", "investment")?.version ?? 0,
    sourceIds: invoices.map((i) => i.id),
    status: "proposed",
    conditions: {
      id: "investment",
      enabled: true,
      recipientId: "",
      maxPaymentJpy: "0",
      monthlyLimitJpy: "0",
      safetyBufferJpy: "0",
      minimumBalanceJpy: "0",
      maxInvestmentJpy: td,
      payAt: "dueDate",
      investmentAllocations: allocations,
    },
  });
  return { proposal, invoices, depositJpy: td };
}
