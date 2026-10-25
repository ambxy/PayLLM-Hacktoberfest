import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  generatePrivateKey,
  privateKeyToAccount,
  mnemonicToAccount,
} from "viem/accounts";
import type { Hex } from "viem";
import { sqlite } from "../../server/db";
export const customerAccountId = "demo-customer";
export const bankAccountId = "bank-treasury";
export const publicChainId = 84532;
type Wallet = {
  accountId: string;
  chainId: number;
  address: Hex;
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};
function master() {
  const key = process.env.CUSTODY_MASTER_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("CUSTODY_MASTER_KEY must be a 32-byte hex key");
  return Buffer.from(key, "hex");
}
function table() {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS custody_wallets (account_id TEXT NOT NULL, chain_id INTEGER NOT NULL, address TEXT NOT NULL UNIQUE, data TEXT NOT NULL, PRIMARY KEY(account_id,chain_id))",
  );
  const foreign = sqlite
    .prepare("SELECT chain_id FROM custody_wallets WHERE chain_id != ? LIMIT 1")
    .get(publicChainId);
  if (foreign)
    throw new Error(
      "Use a separate Base Sepolia database; existing chain wallets must not be reinterpreted",
    );
}
function aad(
  w: Pick<Wallet, "accountId" | "chainId" | "address" | "keyVersion">,
) {
  return Buffer.from(
    JSON.stringify([w.accountId, w.chainId, w.address, w.keyVersion]),
  );
}
export function walletInfo(accountId: string) {
  table();
  const row = sqlite
    .prepare(
      "SELECT data FROM custody_wallets WHERE account_id=? AND chain_id=?",
    )
    .get(accountId, publicChainId) as { data: string } | undefined;
  if (!row) return null;
  const w = JSON.parse(row.data) as Wallet;
  if (w.accountId !== accountId || w.chainId !== publicChainId)
    throw new Error("Wallet binding mismatch");
  return { accountId: w.accountId, chainId: w.chainId, address: w.address };
}
export function ensureBankWallet() {
  return ensureConfiguredWallet(
    bankAccountId,
    process.env.DEMO_BANK_PRIVATE_KEY,
  );
}
export function ensureCustomerWallet() {
  return ensureConfiguredWallet(
    customerAccountId,
    process.env.DEMO_CUSTOMER_PRIVATE_KEY,
  );
}
function ensureConfiguredWallet(accountId: string, configured?: string) {
  if (!configured) return ensureWallet(accountId);
  if (!/^0x[a-fA-F0-9]{64}$/.test(configured))
    throw new Error("Invalid demo wallet key format");
  let address: Hex;
  try {
    address = privateKeyToAccount(configured as Hex).address;
  } catch {
    throw new Error("Invalid demo wallet key");
  }
  const existing = walletInfo(accountId);
  if (existing) {
    if (existing.address !== address)
      throw new Error(
        "Configured wallet differs from existing wallet; existing assets retained",
      );
    signer(accountId);
    return existing;
  }
  return ensureWallet(accountId, configured as Hex);
}
export function ensureWallet(accountId: string, imported?: Hex) {
  table();
  return sqlite.transaction(() => {
    const old = walletInfo(accountId);
    if (old) {
      if (imported) throw new Error("Wallet already exists");
      signer(accountId);
      return old;
    }
    const key = master();
    const privateKey = imported ?? generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    if (
      Array.from({ length: 20 }, (_, addressIndex) =>
        mnemonicToAccount(
          "test test test test test test test test test test test junk",
          { addressIndex },
        ).address.toLowerCase(),
      ).includes(account.address.toLowerCase())
    )
      throw new Error("Known Anvil keys are forbidden");
    const iv = randomBytes(12);
    const w: Wallet = {
      accountId,
      chainId: publicChainId,
      address: account.address,
      keyVersion: 1,
      ciphertext: "",
      iv: iv.toString("hex"),
      tag: "",
    };
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(w));
    w.ciphertext = Buffer.concat([
      cipher.update(privateKey, "utf8"),
      cipher.final(),
    ]).toString("hex");
    w.tag = cipher.getAuthTag().toString("hex");
    sqlite
      .prepare("INSERT INTO custody_wallets VALUES (?,?,?,?)")
      .run(accountId, publicChainId, w.address, JSON.stringify(w));
    return walletInfo(accountId)!;
  })();
}
export function signer(accountId: string) {
  table();
  const row = sqlite
    .prepare(
      "SELECT data FROM custody_wallets WHERE account_id=? AND chain_id=?",
    )
    .get(accountId, publicChainId) as { data: string } | undefined;
  if (!row) throw new Error("Wallet not prepared");
  const w = JSON.parse(row.data) as Wallet;
  if (
    w.accountId !== accountId ||
    w.chainId !== publicChainId ||
    w.keyVersion !== 1
  )
    throw new Error("Wallet binding mismatch");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    master(),
    Buffer.from(w.iv, "hex"),
  );
  decipher.setAAD(aad(w));
  decipher.setAuthTag(Buffer.from(w.tag, "hex"));
  const key = Buffer.concat([
    decipher.update(Buffer.from(w.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8") as Hex;
  const account = privateKeyToAccount(key);
  if (account.address !== w.address) throw new Error("Wallet address mismatch");
  return account;
}
