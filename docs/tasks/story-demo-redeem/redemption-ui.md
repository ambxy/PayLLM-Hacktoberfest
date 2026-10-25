---
id: task-demo-redeem-redemption-ui
type: task
title: 償還依頼と結果表示
story: story-demo-redeem
status: done
blocked_by: [task-demo-redeem-redemption-service]
---

# 償還依頼と結果表示

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

定型チャット依頼からrunを起動し、返却/解除の進捗と完了カード、ホーム・資金計画を更新する。

## 完了条件

明確な全額依頼に追加承認を挟まず実行し、完了後すぐ自動再運用しない。

## 検証方法

実ブラウザで全額償還し、画面とAnvilの80万円を照合。償還後は新たな余力イベントまで変化しないことを確認。

## 検証結果

AC-1/2: pnpm build成功。Playwright redeem.spec.ts 2件成功。単一40万円運用と上限20万円×2回運用→設定停止の両ケースで、チャット依頼から銀行返却→実Anvil解除を確認。顧客80万/相手先20万/lock0/position0/銀行在庫10,000 USDC。画像目視済み。レビューで複数order対応を修正し、再レビューCRITICAL/HIGH 0。

## Blocked

なし。

