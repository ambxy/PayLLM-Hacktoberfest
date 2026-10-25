import "server-only";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia as sepolia } from "viem/chains";
export const addresses = {
  token: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
  pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
  aToken: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
  faucet: "0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc",
} as const;
export const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
export const poolAbi = parseAbi([
  "function getConfiguration(address asset) view returns ((uint256 data))",
  "function getReserveData(address asset) view returns ((uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
  "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve,address indexed user,address indexed to,uint256 amount)",
]);
export function publicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(
      process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      { retryCount: 1, timeout: 15000 },
    ),
  });
}
export async function checkNetwork() {
  const client = publicClient();
  if ((await client.getChainId()) !== sepolia.id)
    throw new Error("Base Sepolia required");
  for (const address of Object.values(addresses))
    if (!(await client.getCode({ address })))
      throw new Error("Missing Sepolia contract");
  const decimals = await client.readContract({
    address: addresses.token,
    abi: tokenAbi,
    functionName: "decimals",
  });
  if (decimals !== 6) throw new Error("USDC decimals mismatch");
  const aTokenBindings = parseAbi([
    "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
    "function POOL() view returns (address)",
  ]);
  const [underlying, pool, configuration] = await Promise.all([
    client.readContract({
      address: addresses.aToken,
      abi: aTokenBindings,
      functionName: "UNDERLYING_ASSET_ADDRESS",
    }),
    client.readContract({
      address: addresses.aToken,
      abi: aTokenBindings,
      functionName: "POOL",
    }),
    client.readContract({
      address: addresses.pool,
      abi: poolAbi,
      functionName: "getConfiguration",
      args: [addresses.token],
    }),
  ]);
  if (
    underlying.toLowerCase() !== addresses.token.toLowerCase() ||
    pool.toLowerCase() !== addresses.pool.toLowerCase()
  )
    throw new Error("Reserve token mismatch");
  const reserve = await client.readContract({
    address: addresses.pool,
    abi: poolAbi,
    functionName: "getReserveData",
    args: [addresses.token],
  });
  if (reserve.aTokenAddress.toLowerCase() !== addresses.aToken.toLowerCase())
    throw new Error("Pool reserve token mismatch");
  const config = configuration.data;
  if (!(config & (1n << 56n)) || config & ((1n << 57n) | (1n << 60n)))
    throw new Error("Aave reserve unavailable");
  return { client, configuration: config };
}
