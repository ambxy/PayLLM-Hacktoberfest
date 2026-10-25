import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.DEMO_DB = mkdtempSync(tmpdir() + "/custody-") + "/test.sqlite";
process.env.CUSTODY_MASTER_KEY = randomBytes(32).toString("hex");
const { ensureWallet, signer } = await import("../src/integrations/custody");
const { sqlite } = await import("../src/server/db");
test("custody is persistent, encrypted, idempotent and authenticated", () => {
  const w = ensureWallet("alice");
  assert.equal(w.chainId, 84532);
  assert.deepEqual(ensureWallet("alice"), w);
  assert.equal(signer("alice").address, w.address);
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "import {ensureWallet,signer} from './src/integrations/custody/index.ts'; console.log(ensureWallet('alice').address); console.log(signer('alice').address)",
    ],
    { env: process.env },
  ).toString();
  assert.equal(output.trim(), w.address + "\n" + w.address);
  const row = sqlite.prepare("SELECT data FROM custody_wallets").get() as {
    data: string;
  };
  const data = JSON.parse(row.data);
  assert.equal(data.privateKey, undefined);
  assert.equal(data.keyVersion, 1);
  const original = process.env.CUSTODY_MASTER_KEY;
  process.env.CUSTODY_MASTER_KEY = randomBytes(32).toString("hex");
  assert.throws(() => signer("alice"));
  process.env.CUSTODY_MASTER_KEY = original;
  data.address = "0x0000000000000000000000000000000000000001";
  sqlite.prepare("UPDATE custody_wallets SET data=?").run(JSON.stringify(data));
  assert.throws(() => signer("alice"));
  delete process.env.CUSTODY_MASTER_KEY;
  assert.throws(() => ensureWallet("bob"));
  assert.equal(
    (
      sqlite.prepare("SELECT COUNT(*) n FROM custody_wallets").get() as {
        n: number;
      }
    ).n,
    1,
  );
  sqlite.prepare("UPDATE custody_wallets SET chain_id=11155111").run();
  assert.throws(() => ensureWallet("alice"), /separate Base Sepolia database/);
});
