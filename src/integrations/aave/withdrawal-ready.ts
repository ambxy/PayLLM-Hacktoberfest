import "server-only";
export async function waitForWithdrawal(
  units: bigint,
  balance: () => Promise<bigint>,
  simulate: () => Promise<void>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
) {
  const deadline = Date.now() + (options.timeoutMs ?? 600000);
  for (;;) {
    if ((await balance()) >= units) {
      try {
        await simulate();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (
          !message.includes("0x47bc4b2c") &&
          !message.includes("NotEnoughAvailableUserBalance")
        )
          throw error;
      }
    }
    if (Date.now() >= deadline)
      throw new Error("Aave principal balance not ready for withdrawal");
    await new Promise((resolve) =>
      setTimeout(resolve, options.intervalMs ?? 5000),
    );
  }
}
