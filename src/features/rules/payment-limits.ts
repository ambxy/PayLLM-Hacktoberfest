import type { PaymentRecipientLimit, Rule } from "../../shared/domain";

export function paymentLimit(
  rule: Pick<
    Rule,
    "recipientId" | "maxPaymentJpy" | "monthlyLimitJpy" | "paymentRecipients"
  >,
  recipientId: string,
): PaymentRecipientLimit | undefined {
  if (rule.paymentRecipients)
    return rule.paymentRecipients.find(
      (recipient) => recipient.recipientId === recipientId,
    );
  return rule.recipientId === recipientId
    ? {
        recipientId: rule.recipientId as PaymentRecipientLimit["recipientId"],
        maxPaymentJpy: rule.maxPaymentJpy,
        monthlyLimitJpy: rule.monthlyLimitJpy,
      }
    : undefined;
}
