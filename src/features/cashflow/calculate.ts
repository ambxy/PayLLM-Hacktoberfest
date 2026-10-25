import type { Invoice, Payment } from "../../shared/domain";
const monthKey = (d: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(d));
export function calculate(
  invoices: Invoice[],
  history: Payment[],
  clock: string,
  td: string,
  buffer: string,
  maximum: string,
  minimum = "0",
) {
  const targetMonth = monthKey(clock);
  const unpaid = invoices.filter(
    (i) => i.status !== "paid" && monthKey(i.dueAt) === targetMonth,
  );
  const confirmed = unpaid.reduce((a, i) => a + BigInt(i.amountJpy), 0n);
  const patterns = new Map<string, Payment[]>();
  for (const p of history.filter(
    (p) => p.source === "fixture" && Date.parse(p.paidAt) < Date.parse(clock),
  )) {
    const key = p.recipientId + ":" + p.recurrenceKey;
    patterns.set(key, [...(patterns.get(key) ?? []), p]);
  }
  const predictions = [];
  for (const [key, items] of patterns) {
    const distinct = new Set(items.map((i) => monthKey(i.paidAt)));
    if (distinct.size < 2) continue;
    const latest = items.toSorted((a, b) =>
      b.paidAt.localeCompare(a.paidAt),
    )[0];
    const covered =
      invoices.some(
        (i) =>
          i.recipientId + ":" + i.recurrenceKey === key &&
          monthKey(i.dueAt) === targetMonth,
      ) ||
      history.some(
        (p) =>
          p.recipientId + ":" + p.recurrenceKey === key &&
          monthKey(p.paidAt) === targetMonth,
      );
    if (!covered)
      predictions.push({
        id: key,
        recipientId: latest.recipientId,
        amountJpy: latest.amountJpy,
        sourceIds: items.map((p) => p.id),
      });
  }
  const predicted = predictions.reduce((a, p) => a + BigInt(p.amountJpy), 0n);
  const required = confirmed + predicted + BigInt(buffer);
  const reserve = required > BigInt(minimum) ? required : BigInt(minimum);
  const surplus = BigInt(td) > reserve ? BigInt(td) - reserve : 0n;
  const invest = surplus < BigInt(maximum) ? surplus : BigInt(maximum);
  return {
    td,
    confirmedJpy: confirmed.toString(),
    predictedJpy: predicted.toString(),
    bufferJpy: buffer,
    reserveJpy: reserve.toString(),
    investJpy: invest.toString(),
    usdcUnits: ((invest * 1000000n) / 160n).toString(),
    unpaid,
    predictions,
    asOf: clock,
  };
}
