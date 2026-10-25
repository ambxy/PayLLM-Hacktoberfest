import { createDecipheriv } from "node:crypto";
import Database from "better-sqlite3";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  ensureWallet,
  bankAccountId,
  customerAccountId,
  publicChainId,
} from "../src/integrations/custody";
import { sqlite } from "../src/server/db";
// Explicit local migration into a separate DB; no public transactions.
const sourcePath = process.env.SOURCE_CUSTODY_DB;
if (
  !sourcePath ||
  sourcePath === process.env.DEMO_DB ||
  publicChainId !== 84532
)
  throw new Error("Separate source and Base destination required");
const source = new Database(sourcePath, {
  readonly: true,
  fileMustExist: true,
});
try {
  sqlite.transaction(() => {
    for (const accountId of [bankAccountId, customerAccountId]) {
      const row = source
        .prepare(
          "SELECT data FROM custody_wallets WHERE account_id=? AND chain_id=11155111",
        )
        .get(accountId) as { data: string } | undefined;
      if (!row) throw new Error("Source wallet missing");
      const w = JSON.parse(row.data);
      if (
        w.accountId !== accountId ||
        w.chainId !== 11155111 ||
        w.keyVersion !== 1
      )
        throw new Error("Source binding mismatch");
      const master = process.env.CUSTODY_MASTER_KEY;
      if (!master || !/^[a-fA-F0-9]{64}$/.test(master))
        throw new Error("Master key required");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(master, "hex"),
        Buffer.from(w.iv, "hex"),
      );
      decipher.setAAD(
        Buffer.from(
          JSON.stringify([w.accountId, w.chainId, w.address, w.keyVersion]),
        ),
      );
      decipher.setAuthTag(Buffer.from(w.tag, "hex"));
      const key = Buffer.concat([
        decipher.update(Buffer.from(w.ciphertext, "hex")),
        decipher.final(),
      ]).toString("utf8") as Hex;
      if (privateKeyToAccount(key).address !== w.address)
        throw new Error("Source address mismatch");
      console.log(ensureWallet(accountId, key));
    }
  })();
} finally {
  source.close();
}
