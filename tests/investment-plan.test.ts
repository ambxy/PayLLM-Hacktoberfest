import { test } from "node:test";
import assert from "node:assert/strict";
import { conditions } from "../src/shared/rule-conditions";
const plan = {
  id: "investment",
  enabled: true,
  recipientId: "",
  maxPaymentJpy: "0",
  monthlyLimitJpy: "0",
  safetyBufferJpy: "0",
  maxInvestmentJpy: "1000000",
  minimumBalanceJpy: "0",
  payAt: "dueDate",
  investmentAllocations: [
    {
      id: "invoice",
      paymentId: "invoice",
      amountJpy: "200000",
      dueAt: "2026-09-22T03:00:00.000Z",
    },
    { id: "remaining", amountJpy: "800000" },
  ],
};
test("full-deposit allocations cannot spend protected minimum or buffer", () => {
  assert.equal(conditions.safeParse(plan).success, true);
  for (const field of ["safetyBufferJpy", "minimumBalanceJpy"])
    assert.equal(
      conditions.safeParse({ ...plan, [field]: "100000" }).success,
      false,
    );
});
test("full-deposit allocation totals and payment dates must match their terms", () => {
  assert.equal(
    conditions.safeParse({ ...plan, maxInvestmentJpy: "900000" }).success,
    false,
  );
  assert.equal(
    conditions.safeParse({
      ...plan,
      investmentAllocations: [
        ...plan.investmentAllocations,
        plan.investmentAllocations[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    conditions.safeParse({
      ...plan,
      investmentAllocations: [
        { id: "invoice", paymentId: "invoice", amountJpy: "1000000" },
      ],
    }).success,
    false,
  );
});

test("only a pre-transaction funding failure permits retry", async () => {
  const { canRetryPlan } = await import("../src/features/investment/plan");
  const run: import("../src/shared/domain").Run = {
    id: "approval",
    kind: "investment",
    status: "needs_attention",
    steps: [],
    error: "Bank USDC inventory insufficient",
  };
  assert.equal(canRetryPlan(run), true);
  assert.equal(canRetryPlan({ ...run, intentId: "signed-intent" }), false);
  assert.equal(canRetryPlan({ ...run, status: "completed" }), false);
  assert.equal(
    canRetryPlan({
      ...run,
      steps: [{ label: "Sent", mode: "stub", ref: "sent" }],
    }),
    false,
  );
  assert.equal(canRetryPlan({ ...run, error: "Transaction reverted" }), false);
});
