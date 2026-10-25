---
id: task-demo-invest-investment-service
type: task
title: 余力計算と模擬運用
story: story-demo-invest
status: done
blocked_by: []
---

# 余力計算と模擬運用

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

確定未払/履歴予測の重複排除、bigint計算、snapshot、運用proposal/同意、署名Intentと銀行再計算を実装。lock確定→在庫供給→模擬預入を操作IDで接続。

## 完了条件

30万＋10万を残し40万lock、銀行在庫7,500・position2,500・顧客手元0となる。

## 検証方法

金額unitと実SQLite/Anvilで40万円lockまで確認。stub台帳の数量保存と再送時の不変を確認。

## 検証結果

AC-1/2: pnpm build成功、unit 4件成功。Playwright invest.spec.ts 1件成功。実AnvilのTD40万円/lock40万円、実SQLiteの銀行在庫7,500/position2,500 USDCを確認し、資金計画画面を目視。AC-3: 同じ運用requestIdを再送し、lock/position/銀行在庫が不変であることをPlaywrightで確認。静的レビューCRITICAL/HIGH 0件、完了文言を実金額から生成する修正済み。public資産はstub。

## Blocked

なし。

