import { test } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toHex } from "viem";
test("bank-only transfer, lock and full redemption preserve TD", async () => {
  const { viem } = await network.create();
  const [bank, customer, recipient] = await viem.getWalletClients();
  const td = await viem.deployContract("BankTD", [bank.account.address]);
  const vault = await viem.deployContract("TDLockVault", [
    td.address,
    bank.account.address,
  ]);
  const id = (s: string) => keccak256(toHex(s));
  await td.write.bindVault([vault.address]);
  await td.write.mintTo([customer.account.address, 1000000n, id("mint")]);
  await td.write.bankTransfer([
    customer.account.address,
    recipient.account.address,
    200000n,
    id("pay"),
  ]);
  await vault.write.lockFor([customer.account.address, 400000n, id("lock")]);
  assert.equal(await td.read.balanceOf([customer.account.address]), 400000n);
  assert.equal(
    await td.read.balanceOf([vault.address]),
    await vault.read.totalLocked(),
  );
  await assert.rejects(
    td.write.transfer([recipient.account.address, 1n], {
      account: customer.account,
    }),
  );
  await assert.rejects(
    td.write.bankTransfer([
      vault.address,
      recipient.account.address,
      1n,
      id("steal"),
    ]),
  );
  await assert.rejects(
    vault.write.release([id("lock"), 400000n, id("redeem"), id("return")], {
      account: customer.account,
    }),
  );
  await vault.write.release([id("lock"), 400000n, id("redeem"), id("return")]);
  assert.equal(await td.read.balanceOf([customer.account.address]), 800000n);
  assert.equal(await td.read.totalSupply(), 1000000n);
  assert.equal(await vault.read.totalLocked(), 0n);
  await assert.rejects(
    vault.write.release([id("lock"), 400000n, id("redeem"), id("return")]),
  );
  await assert.rejects(
    td.write.mintTo([customer.account.address, 1000000n, id("mint")]),
  );
});

test("batch locks the full deposit atomically and allows each payment to redeem", async () => {
  const { viem } = await network.create();
  const [bank, customer] = await viem.getWalletClients();
  const td = await viem.deployContract("BankTD", [bank.account.address]);
  const vault = await viem.deployContract("TDLockVault", [
    td.address,
    bank.account.address,
  ]);
  const id = (s: string) => keccak256(toHex(s));
  await td.write.bindVault([vault.address]);
  await td.write.mintTo([customer.account.address, 1000000n, id("mint")]);
  const amounts = [200000n, 100000n, 300000n, 400000n];
  const ids = amounts.map((_, i) => id(String(i)));
  await assert.rejects(
    vault.write.lockBatchFor([customer.account.address, amounts, ids], {
      account: customer.account,
    }),
  );
  await assert.rejects(
    vault.write.lockBatchFor([
      customer.account.address,
      amounts,
      [ids[0], ids[0], ids[2], ids[3]],
    ]),
  );
  assert.equal(await td.read.balanceOf([customer.account.address]), 1000000n);
  assert.equal(await vault.read.totalLocked(), 0n);
  await vault.write.lockBatchFor([customer.account.address, amounts, ids]);
  assert.equal(await td.read.balanceOf([customer.account.address]), 0n);
  assert.equal(await vault.read.totalLocked(), 1000000n);
  await vault.write.release([ids[0], 200000n, id("redeem"), id("return")]);
  assert.equal(await td.read.balanceOf([customer.account.address]), 200000n);
  assert.equal(await vault.read.totalLocked(), 800000n);
  assert.equal(await td.read.totalSupply(), 1000000n);
});
