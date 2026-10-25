import { randomUUID } from "node:crypto";
import { sqlite, acquire, release } from "../src/server/db";
import { preparationAmount } from "../src/integrations/aave/preparation";
import {
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
  formatEther,
  formatUnits,
  parseEventLogs,
} from "viem";
import { baseSepolia as sepolia } from "viem/chains";
import {
  ensureCustomerWallet,
  ensureBankWallet,
  walletInfo,
  signer,
  bankAccountId,
  customerAccountId,
} from "../src/integrations/custody";
import {
  addresses,
  checkNetwork,
  tokenAbi,
} from "../src/integrations/aave/config";
async function main() {
  const [command = "status", amountText, flag] = process.argv.slice(2);
  if (flag && flag !== "--send") throw new Error("Unknown flag");
  if (!["wallets", "status", "fund", "mint"].includes(command))
    throw new Error("Unknown command");
  if (command === "wallets") {
    // Local key generation only. Existing encrypted keys are verified, never replaced.
    console.log(
      JSON.stringify(
        {
          bank: ensureBankWallet(),
          customer: ensureCustomerWallet(),
        },
        null,
        2,
      ),
    );
  } else {
    const { client } = await checkNetwork();
    const bank = walletInfo(bankAccountId),
      customer = walletInfo(customerAccountId);
    if (!bank || !customer) throw new Error("Run wallets preparation first");
    const [bankEth, customerEth, inventory] = await Promise.all([
      client.getBalance({ address: bank.address }),
      client.getBalance({ address: customer.address }),
      client.readContract({
        address: addresses.token,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [bank.address],
      }),
    ]);
    const fees = await client.estimateFeesPerGas();
    const faucetAbi = parseAbi([
      "function getTokenConfig(address) view returns (uint256 timelockPerMint,uint256 maxAmountPerMint)",
      "function getUserLastUpdated(address,address) view returns (uint256)",
    ]);
    const [mintConfig, lastMint] = await Promise.all([
      client.readContract({
        address: addresses.faucet,
        abi: faucetAbi,
        functionName: "getTokenConfig",
        args: [addresses.token],
      }),
      // Deployed Faucet stores the nested mapping as [token][recipient].
      client.readContract({
        address: addresses.faucet,
        abi: faucetAbi,
        functionName: "getUserLastUpdated",
        args: [addresses.token, bank.address],
      }),
    ]);
    console.log(
      JSON.stringify(
        {
          maxFeePerGasWei: fees.maxFeePerGas?.toString(),
          balancesPresent: bankEth > 0n && customerEth > 0n && inventory > 0n,
          chainId: sepolia.id,
          bank: bank.address,
          customer: customer.address,
          bankEth: formatEther(bankEth),
          customerEth: formatEther(customerEth),
          inventoryUsdc: formatUnits(inventory, 6),
          faucetTimelockSeconds: mintConfig[0].toString(),
          faucetMaximumPerMint: mintConfig[1].toString(),
          faucetNextMintAt: new Date(
            Number(lastMint + mintConfig[0]) * 1000,
          ).toISOString(),
        },
        null,
        2,
      ),
    );
    if (command !== "status") {
      if (!amountText || !/^(0|[1-9]\d*)(\.\d+)?$/.test(amountText))
        throw new Error("Explicit positive amount required");
      const account = signer(bankAccountId);
      const wallet = createWalletClient({
        account,
        chain: sepolia,
        transport: http(
          process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
        ),
      });
      if (command === "fund") {
        const value = preparationAmount("fund", amountText);
        console.log(
          JSON.stringify({
            action: "fund",
            to: customer.address,
            valueWei: value.toString(),
            send: flag === "--send",
          }),
        );
        if (bankEth < value)
          throw new Error("Bank needs Sepolia ETH before gas estimation");
        const gas = await client.estimateGas({
          account,
          to: customer.address,
          value,
        });
        const fee = await client.estimateFeesPerGas();
        console.log(
          JSON.stringify({
            action: "fund",
            to: customer.address,
            valueWei: value.toString(),
            gas: gas.toString(),
            maxFeePerGas: fee.maxFeePerGas?.toString(),
            send: flag === "--send",
          }),
        );
        if (flag === "--send") {
          if (gas * (fee.maxFeePerGas ?? 0n) > parseUnits("0.005", 18))
            throw new Error("Gas estimate exceeds preparation cap");
          const operationId = randomUUID();
          acquire(operationId);
          sqlite.exec(
            "CREATE TABLE IF NOT EXISTS preparation_transactions (id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL, action TEXT NOT NULL, hash TEXT, status TEXT NOT NULL)",
          );
          sqlite
            .prepare(
              "INSERT INTO preparation_transactions VALUES(?,?,?,NULL,?)",
            )
            .run(operationId, sepolia.id, command, "submitting");
          const hash = await wallet.sendTransaction({
            to: customer.address,
            value,
            gas,
            ...fee,
          });
          sqlite
            .prepare(
              "UPDATE preparation_transactions SET hash=?,status=? WHERE id=?",
            )
            .run(hash, "submitted", operationId);
          console.log({ hash });
          const r = await client.waitForTransactionReceipt({
            hash,
            confirmations: 2,
          });
          if (r.status !== "success") throw new Error("Funding reverted");
          const tx = await client.getTransaction({ hash });
          if (
            tx.from.toLowerCase() !== bank.address.toLowerCase() ||
            tx.to?.toLowerCase() !== customer.address.toLowerCase() ||
            tx.value !== value
          )
            throw new Error("Funding evidence mismatch");
          sqlite
            .prepare("UPDATE preparation_transactions SET status=? WHERE id=?")
            .run("confirmed", operationId);
          release(operationId);
          console.log({ confirmed: hash });
        }
      } else if (command === "mint") {
        const units = preparationAmount("mint", amountText);
        const abi = parseAbi([
          "function mint(address token,address to,uint256 amount)",
        ]);
        const { request } = await client.simulateContract({
          address: addresses.faucet,
          abi,
          functionName: "mint",
          args: [addresses.token, bank.address, units],
          account,
        });
        console.log(
          JSON.stringify({
            action: "mint",
            token: addresses.token,
            to: bank.address,
            units: units.toString(),
            send: flag === "--send",
          }),
        );
        if (bankEth === 0n)
          throw new Error("Bank needs Sepolia ETH before gas estimation");
        const gas = await client.estimateContractGas(request);
        const fee = await client.estimateFeesPerGas();
        console.log(
          JSON.stringify({
            action: "mint",
            to: bank.address,
            token: addresses.token,
            units: units.toString(),
            gas: gas.toString(),
            maxFeePerGas: fee.maxFeePerGas?.toString(),
            send: flag === "--send",
          }),
        );
        if (flag === "--send") {
          if (gas * (fee.maxFeePerGas ?? 0n) > parseUnits("0.005", 18))
            throw new Error("Gas estimate exceeds preparation cap");
          const operationId = randomUUID();
          acquire(operationId);
          sqlite.exec(
            "CREATE TABLE IF NOT EXISTS preparation_transactions (id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL, action TEXT NOT NULL, hash TEXT, status TEXT NOT NULL)",
          );
          sqlite
            .prepare(
              "INSERT INTO preparation_transactions VALUES(?,?,?,NULL,?)",
            )
            .run(operationId, sepolia.id, command, "submitting");
          const hash = await wallet.writeContract({
            address: addresses.faucet,
            abi,
            functionName: "mint",
            args: [addresses.token, bank.address, units],
            gas,
            ...fee,
          });
          sqlite
            .prepare(
              "UPDATE preparation_transactions SET hash=?,status=? WHERE id=?",
            )
            .run(hash, "submitted", operationId);
          console.log({ hash });
          const r = await client.waitForTransactionReceipt({
            hash,
            confirmations: 2,
          });
          if (r.status !== "success") throw new Error("Mint reverted");
          const transfer = parseEventLogs({
            abi: tokenAbi,
            logs: r.logs.filter(
              (l) => l.address.toLowerCase() === addresses.token.toLowerCase(),
            ),
            eventName: "Transfer",
          }).find(
            (e) =>
              e.args.to.toLowerCase() === bank.address.toLowerCase() &&
              e.args.value === units &&
              e.args.from === "0x0000000000000000000000000000000000000000",
          );
          if (!transfer) throw new Error("Mint evidence mismatch");
          sqlite
            .prepare("UPDATE preparation_transactions SET status=? WHERE id=?")
            .run("confirmed", operationId);
          release(operationId);
          console.log({ confirmed: hash });
        }
      } else
        throw new Error(
          "Use wallets | status | fund ETH [--send] | mint USDC [--send]",
        );
    }
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? "shortMessage" in error
        ? error.shortMessage
        : error.message
      : "Preparation failed",
  );
  process.exitCode = 1;
});
