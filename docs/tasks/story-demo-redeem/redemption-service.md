---
id: task-demo-redeem-redemption-service
type: task
title: チャット依頼に基づく償還
story: story-demo-redeem
status: done
blocked_by: []
---

# チャット依頼に基づく償還

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

本人messageIdに紐付く償還Intent、元lock/残元本照合、Aave stub引出し→銀行返却→Vault.release→receiptの順序を実装。運用ルールの有効状態とは独立させる。

## 完了条件

返却と解除が一度だけ行われ、総TD100万円のまま元顧客へ戻る。

## 検証方法

実SQLite/Anvilで往復と償還IDの一意性、返却参照・release event・残高を確認。

## 検証結果

AC-1/2: pnpm build成功。Playwright redeem.spec.ts 2件成功。単一40万円運用と上限20万円×2回運用→設定停止の両ケースで、チャット依頼から銀行返却→実Anvil解除を確認。顧客80万/相手先20万/lock0/position0/銀行在庫10,000 USDC。画像目視済み。レビューで複数order対応を修正し、再レビューCRITICAL/HIGH 0。

## Blocked

なし。

