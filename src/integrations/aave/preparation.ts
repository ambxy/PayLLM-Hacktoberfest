import "server-only";
import { parseUnits } from "viem";
export function preparationAmount(action: string, amount: string | undefined) {
  if (!amount || !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount))
    throw new Error("Explicit positive amount required");
  const decimals = action === "fund" ? 18 : action === "mint" ? 6 : 0;
  if (!decimals || (amount.split(".")[1]?.length ?? 0) > decimals)
    throw new Error("Invalid preparation amount");
  const units = parseUnits(amount, decimals);
  const maximum = action === "fund" ? parseUnits("0.1", 18) : 10000n * 1000000n;
  if (units <= 0n || units > maximum)
    throw new Error("Preparation amount out of range");
  return units;
}
