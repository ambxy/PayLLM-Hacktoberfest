---
id: story-demo-initialize
type: story
title: 開発者がローカル銀行を初期化する
epic: epic-local-bank-demo
status: done
depends_on: []
adrs: [adr-0001-demo-baseline, adr-0002-local-runtime, adr-0003-private-td-lock, adr-0006-execution-evidence]
---

# 開発者がローカル銀行を初期化する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

開発者がローカル銀行を初期化する。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 新規環境 / When 開発者が起動・初期化 / Then ホームにTD100万円、送金先0円、lock0、運用0が表示される。
- AC-2 [正常系]: Given 初期化済み環境 / When 開発者がreset / Then 新instance・新contractで同じ開始状態となり旧履歴が混ざらない。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-initialize-runtime](../../tasks/story-demo-initialize/runtime.md) | 起動環境とDBの土台 | done |
| [task-demo-initialize-ledger](../../tasks/story-demo-initialize/ledger.md) | 銀行専用TDと初期化 | done |

## 検証結果

AC-1/AC-2: Playwright initialize.spec.ts成功。実Anvilから100万円/0/0を取得し、reset後のinstanceとcontract変更を確認。型検査・build・SQLite migration成功、Hardhat 1 test成功。静的レビューCRITICAL/HIGH 0件。運用0表示とmint hash/block保存を追加済み。

## Blocked

なし。実行開始前。
