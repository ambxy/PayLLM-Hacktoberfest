---
id: story-demo-invest
type: story
title: 利用者が余力運用を設定しAgentが運用する
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-pay]
adrs: [adr-0002-local-runtime, adr-0003-private-td-lock, adr-0004-rules-intents, adr-0005-money-cashflow, adr-0006-execution-evidence]
---

# 利用者が余力運用を設定しAgentが運用する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者が余力運用を設定しAgentが運用する。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 支払い後80万円 / When 利用者が運用を依頼 / Then 必要資金30万円・予備10万円・運用可能40万円の根拠と条件が表示される。
- AC-2 [正常系]: Given 運用案を提示済み / When 利用者が同意し余力チェックを起動 / Then TD40万円lock・利用可能40万円・模擬運用2,500 USDCになる。
- AC-3 [正常系]: Given 運用完了 / When 同じrunを再照会・再送 / Then 供給と預入が増えず資産合計80万円相当を表示する。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-invest-investment-service](../../tasks/story-demo-invest/investment-service.md) | 余力計算と模擬運用 | done |
| [task-demo-invest-investment-ui](../../tasks/story-demo-invest/investment-ui.md) | 運用提案と資金計画画面 | done |

## 検証結果

AC-1/2: pnpm build成功、unit 4件成功。Playwright invest.spec.ts 1件成功。実AnvilのTD40万円/lock40万円、実SQLiteの銀行在庫7,500/position2,500 USDCを確認し、資金計画画面を目視。AC-3: 同じ運用requestIdを再送し、lock/position/銀行在庫が不変であることをPlaywrightで確認。静的レビューCRITICAL/HIGH 0件、完了文言を実金額から生成する修正済み。public資産はstub。

## Blocked

なし。実行開始前。
