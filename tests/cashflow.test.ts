import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../src/features/cashflow/calculate";
const invoice = {
  id: "office",
  emailId: "office-mail",
  issuer: "office",
  number: "1",
  recipientId: "office",
  amountJpy: "100000",
  dueAt: "2026-09-28T03:00:00Z",
  recurrenceKey: "office",
  status: "scheduled" as const,
};
const history = ["07", "08"].map((m) => ({
  id: m,
  recipientId: "cloud",
  amountJpy: "200000",
  paidAt: `2026-${m}-25T03:00:00Z`,
  recurrenceKey: "cloud",
  source: "fixture",
}));
test("reserve 400k, invest 400k and exact 2500 USDC", () => {
  const f = calculate(
    [invoice],
    history,
    "2026-09-22T03:00:00Z",
    "800000",
    "100000",
    "400000",
  );
  assert.equal(f.reserveJpy, "400000");
  assert.equal(f.investJpy, "400000");
  assert.equal(f.usdcUnits, "2500000000");
});
test("confirmed cloud invoice replaces forecast without double counting", () => {
  const f = calculate(
    [
      invoice,
      {
        ...invoice,
        id: "cloud",
        recipientId: "cloud",
        recurrenceKey: "cloud",
        amountJpy: "200000",
      },
    ],
    history,
    "2026-09-22T03:00:00Z",
    "800000",
    "100000",
    "400000",
  );
  assert.equal(f.predictedJpy, "0");
  assert.equal(f.reserveJpy, "400000");
});
test("USDC display floors fractional units without floating point", async () => {
  const { formatUsdc } = await import("../src/shared/format");
  assert.equal(formatUsdc("6250"), "0");
  assert.equal(formatUsdc("2500000300"), "2,500");
  assert.equal(formatUsdc("9007199254740993999999"), "9,007,199,254,740,993");
  assert.equal(formatUsdc("2500000000"), "2,500");
});
