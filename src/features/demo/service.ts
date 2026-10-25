import { requirePrincipal, type Principal } from "../../server/auth";
import "server-only";
import {
  balances,
  assertResettable,
  publicTables,
} from "../../integrations/aave/sepolia";
import {
  ensureCustomerWallet,
  walletInfo,
  customerAccountId,
} from "../../integrations/custody";
import { all } from "../../server/records";
import type {
  AccountMovement,
  Invoice,
  Payment,
  Run,
} from "../../shared/domain";
import { randomUUID } from "node:crypto";
import {
  acquire,
  release,
  db,
  sqlite,
  instances,
  current,
} from "../../server/db";
import {
  deploy,
  write,
  op,
  customer,
  recipient,
  balance,
} from "../../integrations/td-ledger";
import { requireWorldEnrollment, worldRequired } from "../world/service";
export async function reset(principal: Principal) {
  requirePrincipal(principal, "human");
  requireWorldEnrollment();
  if (
    current() &&
    all<{ status: string }>("demo_date_changes").some(
      (change) => change.status !== "completed",
    )
  )
    throw new Error("Resolve the date operation before resetting");
  const profile = process.env.DEMO_PROFILE ?? "standard";
  if (!["standard", "ten-usdc"].includes(profile))
    throw new Error("Invalid demo profile");
  const publicMode = process.env.PUBLIC_ASSET_MODE ?? "stub";
  if (publicMode !== "stub" && publicMode !== "sepolia")
    throw new Error("Invalid asset mode");
  const id = randomUUID();
  const publicWallet = process.env.CUSTODY_MASTER_KEY
    ? ensureCustomerWallet()
    : null;
  if (process.env.PUBLIC_ASSET_MODE === "sepolia" && !publicWallet)
    throw new Error("Custody key required");
  acquire(id);
  let deployStarted = false;
  try {
    const old = current();
    if (
      old &&
      (all<{ status: string }>("investment_orders").some(
        (o) => o.status !== "redeemed",
      ) ||
        BigInt(await balance(old.token, old.vault)) !== 0n)
    )
      throw new Error("Redeem all positions before reset");
    if (old?.publicMode === "sepolia") {
      if (publicMode !== "sepolia")
        throw new Error("Cannot hide public assets by switching mode");
      assertResettable();
      if (BigInt(await balance(old.token, old.vault)) !== 0n)
        throw new Error("TD locks remain");
    }
    deployStarted = true;
    const { token, vault } = await deploy();
    const result = await write(token, "BankTD", "mintTo", [
      customer,
      1000000n,
      op(id + ":mint"),
    ]);
    if (!result.events.length) throw new Error("Missing mint evidence");
    const state = {
      id,
      clock: "2026-09-27T00:00:00.000Z",
      token,
      vault,
      customer,
      recipient,
      publicWallet,
      publicMode,
      profile,
      worldRequired: worldRequired(),
      initialization: { hash: result.hash, block: result.block },
      positionUsdc: "0",
      treasuryUsdc: publicMode === "stub" ? "10000000000" : "0",
    };
    sqlite.transaction(() => {
      db.insert(instances)
        .values({ id, status: "ready", state: JSON.stringify(state) })
        .run();
      sqlite.prepare("UPDATE control SET active_instance=? WHERE id=1").run(id);
    })();
    release(id);
    return state;
  } catch (e) {
    if (!deployStarted) release(id);
    throw e;
  }
}
export async function dashboard() {
  const s = current();
  if (!s)
    return {
      initialized: false,
      configuredMode: process.env.PUBLIC_ASSET_MODE ?? "stub",
    };
  const [td, recipientTd, locked] = await Promise.all([
    balance(s.token, s.customer),
    balance(s.token, s.recipient),
    balance(s.token, s.vault),
  ]);
  const payments = all<Payment>("payment_history").filter(
    (payment) => payment.status === "confirmed",
  );
  const publicBalances: Partial<Awaited<ReturnType<typeof balances>>> =
    s.publicMode === "sepolia" ? await balances() : {};
  if (s.publicMode === "sepolia") publicTables();
  const confirmedStep = (id: string) =>
    s.publicMode === "sepolia" &&
    (
      sqlite.prepare("SELECT status FROM public_steps WHERE id=?").get(id) as
        | { status: string }
        | undefined
    )?.status === "confirmed";
  const runs = all<Run>("runs");
  const investments = all<{
    id: string;
    amountJpy: string;
    usdcUnits: string;
    status: "locked" | "invested" | "redeemed";
    runId: string;
    publicOperationId?: string;
    funded?: boolean;
  }>("investment_orders").map((order) => ({
    ...order,
    transferred:
      order.status !== "locked" ||
      order.funded ||
      confirmedStep((order.publicOperationId ?? order.id) + ":bank:transfer"),
    supplied:
      order.status !== "locked" ||
      confirmedStep((order.publicOperationId ?? order.id) + ":supply"),
  }));
  const latestInvestment = [...runs]
    .reverse()
    .find((run) => run.kind === "investment");
  const latestOrder = investments.find(
    (order) => order.runId === latestInvestment?.id,
  );
  const investmentProgress =
    latestInvestment &&
    latestOrder?.status !== "redeemed" &&
    (latestInvestment.status !== "completed" || latestOrder)
      ? {
          runId: latestInvestment.id,
          status: latestInvestment.status,
          completedStages: latestOrder?.supplied
            ? 3
            : latestOrder?.transferred
              ? 2
              : latestOrder
                ? 1
                : 0,
        }
      : null;
  const completedRedemptions = all<{ id: string; status: string }>(
    "redemption_orders",
  ).filter((redemption) => redemption.status === "completed");
  const redemptions = completedRedemptions.map((redemption) =>
    redemption.id.slice(redemption.id.indexOf(":") + 1),
  );
  // Runs are stored in execution order, so they give the ledger its chronology.
  const runOrder = new Map(runs.map((run, index) => [run.id, index]));
  const paymentRun = new Map(
    runs
      .filter((run) => run.kind === "payment" && run.sourceId)
      .map((run) => [run.sourceId!, run.id]),
  );
  const redemptionRun = new Map(
    completedRedemptions.map((redemption) => [
      redemption.id.slice(redemption.id.indexOf(":") + 1),
      redemption.id.slice(0, redemption.id.indexOf(":")),
    ]),
  );
  const invoices = all<Invoice>("invoices");
  const payee = (id: string) => {
    const invoice = invoices.find((i) => i.id === id);
    return invoice?.source === "card" ? invoice.cardName : invoice?.issuer;
  };
  const position = (runId: string | undefined) =>
    runId === undefined ? runs.length : (runOrder.get(runId) ?? runs.length);
  const orderRun = new Map(investments.map((order) => [order.id, order.runId]));
  const redemptionSteps = [
    ":aave-out",
    ":token-withdraw",
    ":token-out",
    ":deposit-in",
  ];
  const chronology = (movement: AccountMovement) => {
    if (movement.id === s.id + ":initial") return -1;
    const split = movement.id.lastIndexOf(":");
    const orderId = movement.id.slice(0, split);
    if (orderRun.has(orderId))
      return redemptionSteps.includes(movement.id.slice(split))
        ? position(redemptionRun.get(orderId))
        : position(orderRun.get(orderId));
    return position(paymentRun.get(movement.id));
  };
  const movements: AccountMovement[] = [
    {
      id: s.id + ":initial",
      account: "deposit",
      direction: "in",
      amount: "1000000",
      unit: "JPY",
      label: "Initial demo balance",
    },
    ...payments.map((payment) => ({
      id: payment.id,
      account: "deposit" as const,
      direction: "out" as const,
      amount: payment.amountJpy,
      unit: "JPY" as const,
      label: payee(payment.id)
        ? `Paid ${payee(payment.id)}`
        : "Invoice payment",
    })),
    ...investments.flatMap((order) => [
      {
        id: order.id + ":deposit-out",
        account: "deposit" as const,
        direction: "out" as const,
        amount: order.amountJpy,
        unit: "JPY" as const,
        label: "Invested in Aave",
      },
      ...(order.transferred
        ? [
            {
              id: order.id + ":token-in",
              account: "token" as const,
              direction: "in" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Receive USDC from bank",
            },
          ]
        : []),
      ...(order.supplied
        ? [
            {
              id: order.id + ":token-deposit",
              account: "token" as const,
              direction: "out" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Deposit into Aave",
            },
            {
              id: order.id + ":aave-in",
              account: "aave" as const,
              direction: "in" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Deposit into Aave",
            },
          ]
        : []),
      ...(redemptions.includes(order.id)
        ? [
            {
              id: order.id + ":aave-out",
              account: "aave" as const,
              direction: "out" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Withdraw from Aave",
            },
            {
              id: order.id + ":token-withdraw",
              account: "token" as const,
              direction: "in" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Withdraw from Aave",
            },
            {
              id: order.id + ":token-out",
              account: "token" as const,
              direction: "out" as const,
              amount: order.usdcUnits,
              unit: "USDC" as const,
              label: "Return USDC to bank",
            },
            {
              id: order.id + ":deposit-in",
              account: "deposit" as const,
              direction: "in" as const,
              amount: order.amountJpy,
              unit: "JPY" as const,
              label: "Returned from Aave",
            },
          ]
        : []),
    ]),
  ];
  return {
    initialized: true,
    configuredMode: process.env.PUBLIC_ASSET_MODE ?? "stub",
    publicTransactionsEnabled:
      process.env.PUBLIC_TRANSACTIONS_ENABLED === "true",
    ...s,
    td,
    recipientTd,
    locked,
    upcoming: invoices.filter((i) => i.status !== "paid"),
    recent: runs.slice(-3).reverse(),
    investmentProgress,
    movements: movements
      .map((movement, index) => ({ movement, index }))
      .sort(
        (a, b) =>
          chronology(a.movement) - chronology(b.movement) || a.index - b.index,
      )
      .map(({ movement }) => movement)
      .reverse(),
    publicWallet: walletInfo(customerAccountId),
    looseUsdc: (s.looseUsdc as string) ?? "0",
    ...publicBalances,
    mode: s.publicMode ?? "stub",
  };
}
