---
id: task-demo-initialize-ledger
type: task
title: 銀行専用TDと初期化
story: story-demo-initialize
status: done
blocked_by: [task-demo-initialize-runtime]
---

# 銀行専用TDと初期化

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

BankTDとTDLockVaultの全入口・eventを実装。deploy/bind/mint/reset、run排他、receipt照合、デモ時計、fixture seedと初期ホームを接続。

## 完了条件

実Anvilの顧客100万円・受取先0・vault0・総供給100万円を照会できる。

## 検証方法

Hardhatで振替/lock/releaseと権限・重複ID・供給保存の契約不変条件を確認。実Anvilで初期化とresetを実行。

## 検証結果

pnpm install、pnpm db:migrate、pnpm typecheck、pnpm build成功。pnpm contracts:testは1件成功（振替・lock・解除・権限・一意操作・供給保存）。pnpm test:e2e -- tests/e2e/initialize.spec.ts は1件成功。実Anvil 1.5.1/31337で初期化とresetを実行し、顧客100万円・相手先0・lock0、新instance/contractを確認。Chromium画像も目視確認。AI/public接続は未実施。

## Blocked

なし。

