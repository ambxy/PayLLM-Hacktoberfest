---
id: task-demo-pay-payment-service
type: task
title: 署名Intentと銀行の支払い実行
story: story-demo-pay
status: done
blocked_by: []
---

# 署名Intentと銀行の支払い実行

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

EIP-712判別union、Agent鍵と銀行鍵、銀行検証、期日抽出、月次実績/予約、run/steps/operation一意性を実装。最新設定を送信直前に参照し、Anvil receipt後に実績確定。

## 完了条件

実TDが一度だけ振り替わり、月次使用額20万円と請求書支払済みが保存される。

## 検証方法

実SQLite＋Anvilで署名→銀行→送金→receiptを検証。月次集計はルール変更でも保持され、予約から実績へ置換されることを確認。

## 検証結果

AC-1/2/3: pnpm build成功。Playwright pay.spec.ts 1件成功、実Anvilで顧客80万/取引先20万、receipt event照合、期日再実行後も80万円。pnpm testのpolicy.test.tsで月次予約→確定の一回集計・JST月境界・ルール変更後の保持、署名の金額/宛先/版束縛を検証。チャット画面目視済み。public取引なし。

## Blocked

なし。

