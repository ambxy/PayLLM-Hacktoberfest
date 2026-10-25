---
id: task-demo-pay-payment-ui
type: task
title: 期日操作と支払い結果
story: story-demo-pay
status: done
blocked_by: [task-demo-pay-payment-service]
---

# 期日操作と支払い結果

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

デモ時計操作、runの進捗照会、チャット実行結果・共通実行詳細・ホーム予定を接続。

## 完了条件

都度承認なしで送金し、画面再表示でも実残高と結果を確認できる。

## 検証方法

実ブラウザで初期化から支払いまで通し操作し、残高80万/20万・総供給100万を照会。

## 検証結果

AC-1/2/3: pnpm build成功。Playwright pay.spec.ts 1件成功、実Anvilで顧客80万/取引先20万、receipt event照合、期日再実行後も80万円。pnpm testのpolicy.test.tsで月次予約→確定の一回集計・JST月境界・ルール変更後の保持、署名の金額/宛先/版束縛を検証。チャット画面目視済み。public取引なし。

## Blocked

なし。

