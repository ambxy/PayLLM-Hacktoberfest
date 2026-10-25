import { serialized } from "../../server/mutex";
import "server-only";
import { waitForWithdrawal } from "./withdrawal-ready";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  formatEther,
  type Hash,
  type Address,
} from "viem";
import { baseSepolia as sepolia } from "viem/chains";
import { sqlite } from "../../server/db";
import {
  bankAccountId,
  customerAccountId,
  walletInfo,
  signer,
} from "../custody";
import {
  addresses,
  publicClient,
  checkNetwork,
  tokenAbi,
  poolAbi,
} from "./config";
import { verifyEvidence, type Action } from "./evidence";
import type { Run } from "../../shared/domain";
export type Evidence = {
  action: Action;
  hash: Hash;
  block: string;
  blockHash: Hash;
  logIndex: number;
  from: Address;
  to: Address;
  units: string;
};
export function publicTables() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS public_steps (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS public_orders (id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, wallet TEXT NOT NULL, units TEXT NOT NULL, status TEXT NOT NULL, lock_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS consumed_returns (chain_id INTEGER NOT NULL, hash TEXT NOT NULL, log_index INTEGER NOT NULL, order_id TEXT NOT NULL UNIQUE, PRIMARY KEY(chain_id,hash,log_index));`);
}
export async function preflight(units: bigint) {
  if (process.env.PUBLIC_TRANSACTIONS_ENABLED !== "true")
    throw new Error("Public transaction execution is not enabled");
  if (units <= 0n) throw new Error("Positive principal required");
  const { client, configuration } = await checkNetwork();
  const bank = signer(bankAccountId),
    customer = signer(customerAccountId);
  const [inventory, bankEth, customerEth, totalSupply, fees] =
    await Promise.all([
      client.readContract({
        address: addresses.token,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [bank.address],
      }),
      client.getBalance({ address: bank.address }),
      client.getBalance({ address: customer.address }),
      client.readContract({
        address: addresses.aToken,
        abi: parseAbi(["function totalSupply() view returns (uint256)"]),
        functionName: "totalSupply",
      }),
      client.estimateFeesPerGas(),
    ]);
  const cap = (configuration >> 116n) & ((1n << 36n) - 1n);
  if (cap && totalSupply + units > cap * 1000000n)
    throw new Error("Supply cap exceeded");
  if (inventory < units) throw new Error("Bank USDC inventory insufficient");
  const fee = fees.maxFeePerGas!;
  // Conservative round-trip budgets; each transaction is estimated again before signing.
  if (bankEth < fee * 150000n || customerEth < fee * 1500000n)
    throw new Error("Sepolia gas balance insufficient");
  return { bank: bank.address, customer: customer.address };
}
export function recordPublicOrder(
  id: string,
  instanceId: string,
  units: string,
  lockId: string,
) {
  publicTables();
  const customer = walletInfo(customerAccountId);
  if (!customer) throw new Error("Customer wallet missing");
  sqlite
    .prepare("INSERT INTO public_orders VALUES(?,?,?,?,?,?)")
    .run(id, instanceId, customer.address, units, "locked", lockId);
}
async function stableReceipt(hash: Hash) {
  const client = publicClient();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const r = await client.getTransactionReceipt({ hash });
    const head = await client.getBlockNumber({ cacheTime: 0 });
    if (head >= r.blockNumber + 2n) {
      const block = await client.getBlock({ blockNumber: r.blockNumber });
      if (block.hash === r.blockHash) return r;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Public receipt not stable; manual review required");
}
export async function confirmed(e: Evidence) {
  const client = publicClient();
  if ((await client.getChainId()) !== sepolia.id)
    throw new Error("Wrong public chain");
  const receipt = await stableReceipt(e.hash);
  if (
    receipt.blockHash !== e.blockHash ||
    (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
      e.blockHash
  )
    throw new Error("Public evidence block changed");
  if (
    verifyEvidence(receipt, e.action, e.from, e.to, BigInt(e.units)) !==
    e.logIndex
  )
    throw new Error("Public log changed");
  return receipt;
}
async function execute(
  orderId: string,
  action: Action,
  accountId: string,
  to: Address,
  units: bigint,
  guard: () => void,
): Promise<Evidence> {
  if (process.env.PUBLIC_TRANSACTIONS_ENABLED !== "true")
    throw new Error("Public transaction execution is not enabled");
  publicTables();
  if (units <= 0n) throw new Error("Positive amount required");
  const { client } = await checkNetwork();
  const account = signer(accountId);
  const target =
    action === "transfer" || action === "approve"
      ? addresses.token
      : addresses.pool;
  const data =
    action === "transfer" || action === "approve"
      ? encodeFunctionData({
          abi: tokenAbi,
          functionName: action,
          args: [to, units],
        })
      : action === "supply"
        ? encodeFunctionData({
            abi: poolAbi,
            functionName: "supply",
            args: [addresses.token, units, to, 0],
          })
        : encodeFunctionData({
            abi: poolAbi,
            functionName: "withdraw",
            args: [addresses.token, units, to],
          });
  const id = orderId + ":" + action;
  const old = sqlite
    .prepare("SELECT data,status FROM public_steps WHERE id=?")
    .get(id) as { data: string; status: string } | undefined;
  if (old) {
    if (old.status !== "confirmed")
      throw new Error(
        "Public step unresolved; automatic resubmission disabled",
      );
    const e = JSON.parse(old.data) as Evidence;
    if (
      e.from !== account.address ||
      e.to !== to ||
      e.units !== units.toString() ||
      e.action !== action
    )
      throw new Error("Public step binding mismatch");
    await confirmed(e);
    return e;
  }
  const nonce = await client.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const gas =
    ((await client.estimateGas({ account, to: target, data })) * 120n) / 100n;
  const fees = await client.estimateFeesPerGas();
  if (gas * fees.maxFeePerGas! > 5000000000000000n)
    throw new Error("Public transaction gas exceeds 0.005 ETH cap");
  const draft = {
    chainId: sepolia.id,
    action,
    from: account.address,
    to,
    units: units.toString(),
    nonce,
  };
  const hash = await serialized(async () => {
    guard();
    sqlite
      .prepare("INSERT INTO public_steps VALUES(?,?,?)")
      .run(id, JSON.stringify(draft), "submitting");
    const wallet = createWalletClient({
      account,
      chain: sepolia,
      transport: http(
        process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
        { retryCount: 0 },
      ),
    });
    guard();
    const hash = await wallet.sendTransaction({
      to: target,
      data,
      nonce,
      gas,
      ...fees,
    });
    sqlite
      .prepare("UPDATE public_steps SET data=?,status=? WHERE id=?")
      .run(JSON.stringify({ ...draft, hash }), "submitted", id);

    return hash;
  });
  await client.waitForTransactionReceipt({ hash, confirmations: 2 });
  const receipt = await stableReceipt(hash);
  const logIndex = verifyEvidence(receipt, action, account.address, to, units);
  const evidence: Evidence = {
    action,
    hash,
    block: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    logIndex,
    from: account.address,
    to,
    units: units.toString(),
  };
  await confirmed(evidence);
  sqlite
    .prepare("UPDATE public_steps SET data=?,status=? WHERE id=?")
    .run(JSON.stringify({ ...draft, ...evidence }), "confirmed", id);
  return evidence;
}
export const evidenceSteps = (evidence: Evidence[]): Run["steps"] =>
  evidence.map((e) => ({
    label: {
      transfer: "Test USDC transfer",
      approve: "Approve principal for Aave",
      supply: "Deposit into Aave",
      withdraw: "Withdraw principal from Aave",
    }[e.action],
    mode: "sepolia",
    chainId: 84532,
    hash: e.hash,
    block: e.block,
  }));
export async function fund(id: string, units: string, guard: () => void) {
  const customer = signer(customerAccountId);
  const evidence: Evidence[] = [];
  evidence.push(
    await execute(
      id + ":bank",
      "transfer",
      bankAccountId,
      customer.address,
      BigInt(units),
      guard,
    ),
  );
  return { id, steps: evidenceSteps(evidence) };
}
export async function deposit(
  id: string,
  units: string,
  guard: () => void,
  orderIds = [id],
) {
  const customer = signer(customerAccountId);
  const evidence: Evidence[] = [];
  evidence.push(
    await execute(
      id,
      "approve",
      customerAccountId,
      addresses.pool,
      BigInt(units),
      guard,
    ),
  );
  evidence.push(
    await execute(
      id,
      "supply",
      customerAccountId,
      customer.address,
      BigInt(units),
      guard,
    ),
  );
  for (const orderId of orderIds)
    sqlite
      .prepare("UPDATE public_orders SET status='invested' WHERE id=?")
      .run(orderId);
  return { id, steps: evidenceSteps(evidence) };
}
export async function supplyAndDeposit(
  id: string,
  units: string,
  guard: () => void,
) {
  const funding = await fund(id, units, guard);
  const supplied = await deposit(id, units, guard);
  return { id, steps: [...funding.steps, ...supplied.steps] };
}
export async function balances() {
  publicTables();
  const client = publicClient();
  if ((await client.getChainId()) !== 84532)
    throw new Error("Wrong public chain");
  const bank = walletInfo(bankAccountId),
    customer = walletInfo(customerAccountId);
  if (!bank || !customer) throw new Error("Wallets required");
  const [position, treasury, loose, eth] = await Promise.all([
    client.readContract({
      address: addresses.aToken,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [customer.address],
    }),
    client.readContract({
      address: addresses.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [bank.address],
    }),
    client.readContract({
      address: addresses.token,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [customer.address],
    }),
    client.getBalance({ address: customer.address }),
  ]);
  const rows = sqlite
    .prepare(
      "SELECT units FROM public_orders WHERE wallet=? AND status!='redeemed'",
    )
    .all(customer.address) as { units: string }[];
  const principal = rows.reduce((s, r) => s + BigInt(r.units), 0n);
  const bankEth = await client.getBalance({ address: bank.address });
  return {
    bankWallet: bank.address,
    bankEth: formatEther(bankEth),
    customerEth: formatEther(eth),
    positionUsdc: position.toString(),
    treasuryUsdc: treasury.toString(),
    looseUsdc: loose.toString(),
    principalUsdc: principal.toString(),
    interestUsdc: (position > principal ? position - principal : 0n).toString(),
    customerEthWei: eth.toString(),
  };
}

export function consumeReturn(orderId: string, e: Evidence) {
  publicTables();
  if (e.action !== "transfer")
    throw new Error("Return must be a token transfer");
  sqlite.transaction(() => {
    const previous = sqlite
      .prepare(
        "SELECT chain_id,hash,log_index FROM consumed_returns WHERE order_id=?",
      )
      .get(orderId) as
      | { chain_id: number; hash: string; log_index: number }
      | undefined;
    if (previous) {
      if (
        previous.chain_id !== 84532 ||
        previous.hash !== e.hash ||
        previous.log_index !== e.logIndex
      )
        throw new Error("Order settlement already bound");
      return;
    }
    sqlite
      .prepare("INSERT INTO consumed_returns VALUES(?,?,?,?)")
      .run(84532, e.hash, e.logIndex, orderId);
  })();
}
export async function withdrawAndReturn(
  id: string,
  orderId: string,
  units: string,
  guard: () => void,
) {
  publicTables();
  const order = sqlite
    .prepare("SELECT wallet,units,status FROM public_orders WHERE id=?")
    .get(orderId) as
    | { wallet: string; units: string; status: string }
    | undefined;
  const customer = signer(customerAccountId),
    bank = signer(bankAccountId);
  if (
    !order ||
    order.status !== "invested" ||
    order.wallet !== customer.address ||
    order.units !== units
  )
    throw new Error("Public order mismatch");
  const { client } = await checkNetwork();
  const liquidity = await client.readContract({
    address: addresses.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [addresses.aToken],
  });
  if (liquidity < BigInt(units))
    throw new Error("Aave withdrawal liquidity insufficient");
  await waitForWithdrawal(
    BigInt(units),
    () =>
      client.readContract({
        address: addresses.aToken,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [customer.address],
      }),
    async () => {
      await client.simulateContract({
        account: customer.address,
        address: addresses.pool,
        abi: poolAbi,
        functionName: "withdraw",
        args: [addresses.token, BigInt(units), customer.address],
      });
    },
  );
  const withdrawal = await execute(
    id,
    "withdraw",
    customerAccountId,
    customer.address,
    BigInt(units),
    guard,
  );
  const returned = await execute(
    id,
    "transfer",
    customerAccountId,
    bank.address,
    BigInt(units),
    guard,
  );
  await confirmed(returned);
  consumeReturn(orderId, returned);
  return {
    id,
    units,
    evidence: returned,
    steps: evidenceSteps([withdrawal, returned]),
  };
}
export function markRedeemed(orderId: string) {
  if (
    !sqlite
      .prepare("SELECT order_id FROM consumed_returns WHERE order_id=?")
      .get(orderId)
  )
    throw new Error("Return evidence required");
  sqlite
    .prepare("UPDATE public_orders SET status='redeemed' WHERE id=?")
    .run(orderId);
}
export function assertResettable() {
  publicTables();
  const remaining = sqlite
    .prepare("SELECT id FROM public_orders WHERE status!='redeemed' LIMIT 1")
    .get();
  const unresolved = sqlite
    .prepare("SELECT id FROM public_steps WHERE status!='confirmed' LIMIT 1")
    .get();
  if (remaining || unresolved)
    throw new Error("Redeem all public principal before reset");
}
