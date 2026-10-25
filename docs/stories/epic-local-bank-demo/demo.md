---
id: story-demo-demo
type: story
title: デモ担当者が全フローを通して再現する
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-redeem]
adrs: [adr-0001-demo-baseline, adr-0002-local-runtime, adr-0003-private-td-lock, adr-0004-rules-intents, adr-0005-money-cashflow, adr-0006-execution-evidence, adr-0007-usdc-td-redemption]
---

# デモ担当者が全フローを通して再現する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

デモ担当者が全フローを通して再現する。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 新しいinstance / When 担当者が許可→読取り→設定→支払い→運用→償還 / Then 5画面で根拠・状態・金額が一致する。
- AC-2 [正常系]: Given 一巡完了 / When 担当者がresetし再演 / Then 外部認証情報なしで同じ結果を再現できる。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-demo-e2e](../../tasks/story-demo-demo/e2e.md) | ローカル通し検証 | done |
| [task-demo-demo-walkthrough](../../tasks/story-demo-demo/walkthrough.md) | 5画面確認と再現手順 | done |

## Blocked

なし。実行開始前。
