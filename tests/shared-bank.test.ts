import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const shared = generatePrivateKey();
const customerKey = generatePrivateKey();
process.env.DEMO_DB = mkdtempSync("/tmp/shared-bank-") + "/test.sqlite";
process.env.CUSTODY_MASTER_KEY = randomBytes(32).toString("hex");
process.env.DEMO_BANK_PRIVATE_KEY = shared;
process.env.DEMO_CUSTOMER_PRIVATE_KEY = customerKey;
const { ensureBankWallet, ensureCustomerWallet } = await import(
  "../src/integrations/custody"
);
test("shared demo bank and customer persist across independent stores", () => {
  const bank = ensureBankWallet();
  assert.equal(bank.address, privateKeyToAccount(shared).address);
  assert.deepEqual(ensureBankWallet(), bank);
  const customer = ensureCustomerWallet();
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "import {ensureBankWallet,ensureCustomerWallet} from './src/integrations/custody/index.ts';console.log(JSON.stringify([ensureBankWallet().address,ensureCustomerWallet().address]))",
    ],
    {
      env: {
        ...process.env,
        DEMO_DB: mkdtempSync("/tmp/shared-bank-other-") + "/test.sqlite",
        CUSTODY_MASTER_KEY: randomBytes(32).toString("hex"),
      },
    },
  ).toString();
  const [otherBank, otherCustomer] = JSON.parse(output);
  assert.equal(otherBank, bank.address);
  assert.equal(otherCustomer, customer.address);
  assert.equal(customer.address, privateKeyToAccount(customerKey).address);
  const originalCustomer = process.env.DEMO_CUSTOMER_PRIVATE_KEY;
  process.env.DEMO_CUSTOMER_PRIVATE_KEY = generatePrivateKey();
  assert.throws(() => ensureCustomerWallet(), /differs from existing/);
  process.env.DEMO_CUSTOMER_PRIVATE_KEY = originalCustomer;
  assert.deepEqual(ensureCustomerWallet(), customer);
  process.env.DEMO_BANK_PRIVATE_KEY = generatePrivateKey();
  assert.throws(() => ensureBankWallet(), /differs from existing/);
  process.env.DEMO_BANK_PRIVATE_KEY = shared;
  assert.deepEqual(ensureBankWallet(), bank);
});

test("public environment template contains no configured credentials", () => {
  const template = readFileSync(".env.example", "utf8");
  for (const name of [
    "DEMO_BANK_PRIVATE_KEY",
    "DEMO_CUSTOMER_PRIVATE_KEY",
    "CUSTODY_MASTER_KEY",
    "GEMINI_API_KEY",
    "WORLD_RP_SIGNING_KEY",
  ]) {
    assert.match(template, new RegExp(`^${name}=$`, "m"));
  }
  assert.match(template, /^PUBLIC_TRANSACTIONS_ENABLED=false$/m);
});
