import { test } from "node:test";
import assert from "node:assert/strict";
import {
  operatingAmount,
  type AmountRule,
} from "../src/features/rules/operating-amount";
const authorization = {
  approvalId: "plan",
  agentId: "agent",
  accountId: "account",
  scopes: ["payment", "investment"],
  approvalMethod: "local-demo" as const,
  authMode: "local-demo" as const,
  generation: 1,
  instanceId: "demo",
};
const payment: AmountRule = {
  id: "payment",
  enabled: true,
  status: "active",
  version: 1,
  recipientId: "aoba",
  maxPaymentJpy: "200000",
  monthlyLimitJpy: "200000",
  maxInvestmentJpy: "0",
  safetyBufferJpy: "0",
  minimumBalanceJpy: "0",
  payAt: "dueDate",
  consentId: "plan",
  authorization,
};
const investment: AmountRule = {
  ...payment,
  id: "investment",
  maxInvestmentJpy: "400000",
};
const grants = [{ status: "active", authorization }];
test("combines approved payment and investment allocations", () => {
  assert.equal(operatingAmount([payment, investment], grants), "600000");
  assert.equal(operatingAmount([], grants), "0");
});
test("does not count payment funds twice when invested under the same plan", () => {
  const plan = {
    ...investment,
    maxInvestmentJpy: "1000000",
    investmentAllocations: [
      { id: "bill", paymentId: "bill", amountJpy: "200000" },
      { id: "remaining", amountJpy: "800000" },
    ],
  };
  assert.equal(operatingAmount([payment, plan], grants), "1000000");
  assert.equal(
    operatingAmount([{ ...payment, enabled: false }, plan], grants),
    "1000000",
  );
});
test("excludes stopped, unapproved, revoked and mismatched permissions", () => {
  for (const rule of [
    { ...payment, enabled: false },
    { ...payment, status: "reapproval-required" },
    { ...payment, authorization: undefined },
  ]) {
    assert.equal(operatingAmount([rule], grants), "0");
  }
  assert.equal(
    operatingAmount([payment], [{ ...grants[0], status: "revoked" }]),
    "0",
  );
  assert.equal(
    operatingAmount(
      [payment],
      [
        {
          status: "active",
          authorization: { ...authorization, approvalId: "old" },
        },
      ],
    ),
    "0",
  );
  assert.equal(
    operatingAmount(
      [payment],
      [
        {
          status: "active",
          authorization: { ...authorization, scopes: ["read"] },
        },
      ],
    ),
    "0",
  );
});
test("sums recipient limits with integer precision", () => {
  const rule = {
    ...payment,
    paymentRecipients: [
      {
        recipientId: "aoba" as const,
        maxPaymentJpy: "9007199254740993",
        monthlyLimitJpy: "9007199254740993",
      },
      {
        recipientId: "sakura" as const,
        maxPaymentJpy: "2",
        monthlyLimitJpy: "2",
      },
    ],
  };
  assert.equal(operatingAmount([rule], grants), "9007199254740995");
});
