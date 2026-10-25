import "server-only";
import { z } from "zod";
import { all, get, instance, put } from "@/server/records";
import { current, save, sqlite } from "@/server/db";
import {
  requirePrincipal,
  internalAgentPrincipal,
  type Principal,
} from "@/server/auth";
import {
  allowedPaymentSourceIds,
  assertScope,
} from "@/features/delegations/service";
import { assertRuleApproval } from "@/features/world/service";
import {
  createRedemptionRequest,
  redeem,
} from "@/features/investment/redemption";
import { payDue } from "@/features/banking/payment";
import { message } from "@/features/chat/service";
import type { Investment } from "@/features/investment/service";
import type { Invoice, Rule } from "@/shared/domain";

type DateChange = {
  id: string;
  date: string;
  status: "running" | "completed" | "needs_attention";
  redeemedJpy: string;
  paidJpy: string;
};
const day = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function clockStatus() {
  const s = current();
  if (!s) return { initialized: false, date: null, stages: [], ready: false };
  const rule = get<Rule>("rules", "investment");
  const dates = [
    ...new Set(
      rule?.investmentAllocations?.flatMap((lot) =>
        lot.dueAt ? [day(lot.dueAt)] : [],
      ) ?? [],
    ),
  ].sort();
  const first = dates[0];
  const previous = first
    ? day(
        new Date(
          Date.parse(first + "T12:00:00+09:00") - 86400000,
        ).toISOString(),
      )
    : undefined;
  return {
    initialized: true,
    date: day(s.clock),
    ready: !!rule?.investmentAllocations?.length,
    stages: [
      ...(previous
        ? [
            {
              date: previous,
              label: "Review before first payment",
              action: "Keep funds invested until the payment date",
            },
          ]
        : []),
      ...dates.map((date) => ({
        date,
        label: "Process payments",
        action: "Withdraw what is needed and pay amounts due",
      })),
    ],
    recent: all<DateChange>("demo_date_changes").slice(-1)[0],
  };
}
export async function advanceClock(
  principal: Principal,
  dateInput: string,
  requestId: string,
) {
  requirePrincipal(principal, "human");
  const date = z.iso.date().parse(dateInput);
  z.uuid().parse(requestId);
  const agent = internalAgentPrincipal();
  const guard = () => {
    requirePrincipal(principal, "human");
    assertScope(agent, "payment");
    assertScope(agent, "investment");
    assertScope(agent, "redemption");
    const payment = get<Rule>("rules", "payment");
    const investment = get<Rule>("rules", "investment");
    if (
      !payment?.enabled ||
      !investment?.enabled ||
      !investment.investmentAllocations
    )
      throw new Error("An approved payment plan is required");
    assertRuleApproval(payment);
    assertRuleApproval(investment);
    const permitted = allowedPaymentSourceIds(agent);
    if (
      investment.investmentAllocations.some(
        (lot) =>
          lot.paymentId &&
          !permitted.includes(
            get<Invoice>("invoices", lot.paymentId)?.emailId ?? "",
          ),
      )
    )
      throw new Error("Source permission changed");
    return investment;
  };
  const rule = guard();
  const existing = get<DateChange>("demo_date_changes", requestId);
  if (existing) {
    if (existing.date !== date) throw new Error("Date request mismatch");
    return existing;
  }
  const target = date + "T03:00:00.000Z";
  const change: DateChange = {
    id: requestId,
    date,
    status: "running",
    redeemedJpy: "0",
    paidJpy: "0",
  };
  sqlite.transaction(() => {
    guard();
    if (Date.parse(target) < Date.parse(instance().clock))
      throw new Error("Demo time cannot move backwards");
    if (
      all<DateChange>("demo_date_changes").some(
        (item) => item.status !== "completed",
      )
    )
      throw new Error("Resolve the previous date operation first");
    const control = sqlite
      .prepare("SELECT active_run FROM control WHERE id=1")
      .get() as { active_run: string | null };
    if (control.active_run) throw new Error("Another operation is active");
    put("demo_date_changes", change);
    save({ ...instance(), clock: target });
  })();
  try {
    const until = Date.parse(target);
    const needed = rule.investmentAllocations!.filter(
      (lot) =>
        lot.paymentId &&
        lot.dueAt &&
        Date.parse(lot.dueAt) <= until &&
        get<Invoice>("invoices", lot.paymentId)?.status !== "paid",
    );
    const orders = all<Investment>("investment_orders").filter(
      (order) =>
        order.status === "invested" &&
        order.consentId === rule.consentId &&
        needed.some((lot) => lot.id === order.allocationId),
    );
    if (orders.length) {
      guard();
      const request = createRedemptionRequest(
        principal,
        orders.map((order) => order.id),
      );
      const run = await redeem(agent, request.id);
      if (run.status !== "completed")
        throw new Error("Withdrawal needs attention");
      change.redeemedJpy = orders
        .reduce((sum, order) => sum + BigInt(order.amountJpy), 0n)
        .toString();
      put("demo_date_changes", change);
    }
    guard();
    const due = all<Invoice>("invoices").filter(
      (i) =>
        i.status !== "paid" &&
        Date.parse(i.dueAt) <= Date.parse(target) &&
        rule.investmentAllocations!.some((lot) => lot.paymentId === i.id),
    );
    const run = await payDue(agent, requestId, true);
    if (run.status !== "completed") throw new Error("Payment needs attention");
    change.paidJpy = due
      .filter((i) => get<Invoice>("invoices", i.id)?.status === "paid")
      .reduce((sum, i) => sum + BigInt(i.amountJpy), 0n)
      .toString();
    change.status = "completed";
    put("demo_date_changes", change);
    message(
      "assistant",
      `Demo date: ${date}. Withdrew ¥${BigInt(change.redeemedJpy).toLocaleString("en-US")} and paid ¥${BigInt(change.paidJpy).toLocaleString("en-US")}. Remaining funds continue to be invested.`,
    );
    return change;
  } catch (error) {
    put("demo_date_changes", { ...change, status: "needs_attention" });
    throw error;
  }
}
