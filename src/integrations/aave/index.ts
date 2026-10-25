import { serialized } from "../../server/mutex";
import "server-only";
import { instance } from "../../server/records";
import * as stub from "./stub";
import * as sepolia from "./sepolia";
export function mode() {
  const m = instance().publicMode ?? "stub";
  if (m !== "stub" && m !== "sepolia") throw new Error("Invalid asset mode");
  return m;
}
export async function preflight(units: string) {
  if (mode() === "sepolia") await sepolia.preflight(BigInt(units));
  else if (BigInt(instance().treasuryUsdc as string) < BigInt(units))
    throw new Error("Stub inventory insufficient");
}
export function recordOrder(id: string, units: string, lockId: string) {
  if (mode() === "sepolia")
    sepolia.recordPublicOrder(id, instance().id, units, lockId);
}
export async function supplyAndDeposit(
  id: string,
  units: string,
  guard: () => void,
) {
  if (mode() === "sepolia") return sepolia.supplyAndDeposit(id, units, guard);
  const result = await serialized(() => {
    guard();
    return stub.supplyAndDeposit(id, units);
  });
  return {
    id: result.id,
    steps: [
      {
        label: "Test USDC funding and simulated Aave deposit",
        mode: "stub" as const,
        ref: result.id,
      },
    ],
  };
}
export { balances } from "./sepolia";

export async function withdrawAndReturn(
  id: string,
  orderId: string,
  units: string,
  guard: () => void,
) {
  if (mode() === "sepolia") {
    const result = await sepolia.withdrawAndReturn(id, orderId, units, guard);
    return {
      ...result,
      owner: instance().customer,
      action: "withdraw-and-return",
    };
  }
  const result = await serialized(() => {
    guard();
    return stub.withdrawAndReturn(id, units);
  });
  return {
    ...result,
    evidence: undefined,
    steps: [
      {
        label: "Simulated Aave withdrawal and test USDC return to bank",
        mode: "stub" as const,
        ref: result.id,
      },
    ],
  };
}
export async function verifyReturn(evidence: sepolia.Evidence | undefined) {
  if (mode() === "sepolia") {
    if (!evidence) throw new Error("Return evidence required");
    await sepolia.confirmed(evidence);
  }
}
export function markRedeemed(orderId: string) {
  if (mode() === "sepolia") sepolia.markRedeemed(orderId);
}

export async function fund(id: string, units: string, guard: () => void) {
  if (mode() === "sepolia") return sepolia.fund(id, units, guard);
  await serialized(() => {
    guard();
    stub.fund(id, units);
  });
  return {
    id,
    steps: [
      {
        label: "Simulated token account funding",
        mode: "stub" as const,
        ref: id,
      },
    ],
  };
}
export async function deposit(
  id: string,
  units: string,
  guard: () => void,
  orderIds: string[],
) {
  if (mode() === "sepolia") return sepolia.deposit(id, units, guard, orderIds);
  await serialized(() => {
    guard();
    stub.deposit(id, units);
  });
  return {
    id,
    steps: [
      { label: "Simulated Aave deposit", mode: "stub" as const, ref: id },
    ],
  };
}
