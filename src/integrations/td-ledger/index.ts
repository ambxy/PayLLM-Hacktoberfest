import "server-only";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEventLogs,
  type Address,
  type Hash,
} from "viem";
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
const rpc = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
const url = new URL(rpc);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error("Local RPC required");
// Publicly known Anvil development key; never used with a public RPC.
export const bank = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export const client = createPublicClient({
  chain: anvil,
  transport: http(rpc),
});
export const wallet = createWalletClient({
  account: bank,
  chain: anvil,
  transport: http(rpc),
});
export const customer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
export const recipient =
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
export const op = (id: string) => keccak256(toHex(id));
export function artifact(name: string) {
  return JSON.parse(
    readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, "utf8"),
  );
}
export async function receipt(hash: Hash) {
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return r;
}
export async function ensureLocal() {
  if ((await client.getChainId()) !== 31337)
    throw new Error("Local chain 31337 required");
}
export async function deploy() {
  await ensureLocal();
  const td = artifact("BankTD"),
    v = artifact("TDLockVault");
  const token = (
    await receipt(
      await wallet.deployContract({
        abi: td.abi,
        bytecode: td.bytecode,
        args: [bank.address],
      }),
    )
  ).contractAddress!;
  const vault = (
    await receipt(
      await wallet.deployContract({
        abi: v.abi,
        bytecode: v.bytecode,
        args: [token, bank.address],
      }),
    )
  ).contractAddress!;
  await receipt(
    await wallet.writeContract({
      address: token,
      abi: td.abi,
      functionName: "bindVault",
      args: [vault],
    }),
  );
  return { token, vault };
}
export async function write(
  address: Address,
  name: string,
  fn: string,
  args: unknown[],
) {
  await ensureLocal();
  const a = artifact(name);
  const r = await receipt(
    await wallet.writeContract({ address, abi: a.abi, functionName: fn, args }),
  );
  return {
    hash: r.transactionHash,
    block: r.blockNumber.toString(),
    events: parseEventLogs({
      abi: a.abi,
      logs: r.logs.filter(
        (l) => l.address.toLowerCase() === address.toLowerCase(),
      ),
    }),
  };
}
export async function balance(token: Address, owner: Address) {
  return (
    (await client.readContract({
      address: token,
      abi: artifact("BankTD").abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint
  ).toString();
}
export async function submit(
  address: Address,
  name: string,
  fn: string,
  args: unknown[],
  guard: () => void,
) {
  await ensureLocal();
  guard();
  return wallet.writeContract({
    address,
    abi: artifact(name).abi,
    functionName: fn,
    args,
  });
}
