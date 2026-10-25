export function formatUsdc(units: string) {
  return (BigInt(units) / 1000000n).toLocaleString("en-US");
}
