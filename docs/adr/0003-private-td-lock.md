---
id: adr-0003-private-td-lock
type: adr
title: BankTDとTDLockVaultの移転・lock強制
epic: epic-local-bank-demo
status: accepted
---

# BankTDとTDLockVaultの移転・lock強制

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

銀行のみTDを操作でき、別段口座へ移したTDを再利用できないことが必要。専用lock契約の入口を制限する。

## Decision

BankTDはdecimals=0。銀行専用mintTo/bankTransferとvault専用lockTransferを提供する。通常ERC-20 transfer/transferFrom/approveは禁止。bankTransferからvaultへの出入を禁止し、通常入口でのvault移転は禁止し、vault専用unlockTransferで元顧客への償還を可能にする。

Vault.lockForは銀行のみ。顧客address・JPY額・operationIdを記録し、同一transactionでTDを移す。BankTDのvault登録は初期化時一度だけ。全資産操作に一意operationIdを要求する。任意withdraw/rescue/upgrade入口は設けない。銀行専用release→vault専用unlockTransferを追加し、元lock残額と顧客を束縛する。BankTD.balanceOf(vault)＝Vault.totalLockedを不変条件とする。

## Alternatives

通常の銀行EOAへ移すだけでは再振替を防げない。汎用ERC-20とallowanceではbank-onlyとlock禁止を別々に強制する必要がある。3契約のRouter構成はこのデモには不要。

## Consequences

同一chain内の移転とlock記録が原子的になる。一般ERC-20の自由な移転とは非互換。償還はADR-0007の専用経路を使う。ローカルデモのresetは償還と区別して旧instanceを使わなくする。

