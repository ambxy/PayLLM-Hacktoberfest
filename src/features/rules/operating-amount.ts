import type { Rule } from "../../shared/domain";

export type AmountRule = Rule & { status: string };
export type AmountGrant = {
  status: string;
  authorization: { scopes: string[]; approvalId?: string; agentId: string };
};

// An approved payment allocation is also part of the investment plan's principal.
export function operatingAmount(rules: AmountRule[], grants: AmountGrant[]) {
  const permitted = (rule: AmountRule) =>
    rule.enabled &&
    rule.status === "active" &&
    rule.authorization &&
    grants.some(
      (grant) =>
        grant.status === "active" &&
        grant.authorization.agentId === rule.authorization!.agentId &&
        grant.authorization.approvalId === rule.authorization!.approvalId &&
        grant.authorization.scopes.includes(rule.id),
    );
  const payment = rules.find(
    (rule) => rule.id === "payment" && permitted(rule),
  );
  const investment = rules.find(
    (rule) => rule.id === "investment" && permitted(rule),
  );
  const payments = payment
    ? (payment.paymentRecipients ?? [payment]).reduce(
        (sum, recipient) =>
          sum +
          (BigInt(recipient.maxPaymentJpy) > 0n
            ? BigInt(recipient.monthlyLimitJpy)
            : 0n),
        0n,
      )
    : 0n;
  const invested = BigInt(investment?.maxInvestmentJpy ?? "0");
  const shared =
    investment?.authorization?.approvalId === payment?.authorization?.approvalId
      ? (investment?.investmentAllocations ?? []).reduce(
          (sum, allocation) =>
            sum + (allocation.paymentId ? BigInt(allocation.amountJpy) : 0n),
          0n,
        )
      : 0n;
  const overlap = shared < payments ? shared : payments;
  return (payments + invested - overlap).toString();
}
