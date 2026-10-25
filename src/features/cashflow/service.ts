import "server-only";
import { all, instance, get } from "../../server/records";
import { balance } from "../../integrations/td-ledger";
import type { Invoice, Payment, Rule } from "../../shared/domain";
import { calculate } from "./calculate";
export async function cashflow(override?: Rule) {
  const s = instance();
  const rule = override ?? get<Rule>("rules", "investment");
  const result = calculate(
    all<Invoice>("invoices"),
    all<Payment>("payment_history"),
    s.clock,
    await balance(s.token, s.customer),
    rule?.safetyBufferJpy ?? "100000",
    rule?.maxInvestmentJpy ?? "400000",
    rule?.minimumBalanceJpy ?? "0",
  );
  if (rule?.investmentAllocations) {
    const requiredSoon = result.unpaid
      .filter(
        (i) =>
          rule.investmentAllocations!.some((lot) => lot.paymentId === i.id) &&
          Date.parse(i.dueAt) <= Date.parse(s.clock) + 86400000,
      )
      .reduce((sum, i) => sum + BigInt(i.amountJpy), 0n);
    return {
      ...result,
      paymentPlan: true,
      predictedJpy: "0",
      predictions: [],
      reserveJpy: result.confirmedJpy,
      investJpy: (BigInt(result.td) > requiredSoon
        ? BigInt(result.td) - requiredSoon
        : 0n
      ).toString(),
    };
  }
  return result;
}
