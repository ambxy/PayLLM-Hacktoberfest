---
id: task-demo-invest-investment-ui
type: task
title: 運用提案と資金計画画面
story: story-demo-invest
status: done
blocked_by: [task-demo-invest-investment-service]
---

# 運用提案と資金計画画面

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

内訳・根拠付きの提案/同意、余力チェック操作、運用結果カード、lock対応・模擬資産を表示。

## 完了条件

利用可能TDと運用資産を表示し、lock額を資産合計に重ねない。

## 検証方法

ブラウザで同意→チェック→運用完了を確認。APY未取得・利息0・stub表示と各画面の金額を照合。

## 検証結果

AC-1/2: pnpm build成功、unit 4件成功。Playwright invest.spec.ts 1件成功。実AnvilのTD40万円/lock40万円、実SQLiteの銀行在庫7,500/position2,500 USDCを確認し、資金計画画面を目視。AC-3: 同じ運用requestIdを再送し、lock/position/銀行在庫が不変であることをPlaywrightで確認。静的レビューCRITICAL/HIGH 0件、完了文言を実金額から生成する修正済み。public資産はstub。

## Blocked

なし。

