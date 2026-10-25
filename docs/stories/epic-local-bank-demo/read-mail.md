---
id: story-demo-read-mail
type: story
title: 利用者が許可した請求メールをAgentに読ませる
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-initialize]
adrs: [adr-0001-demo-baseline, adr-0002-local-runtime, adr-0004-rules-intents]
---

# 利用者が許可した請求メールをAgentに読ませる

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者が許可した請求メールをAgentに読ませる。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 未閲覧のfixture / When 利用者がサンプルの閲覧を許可し読取りを依頼 / Then 本文・添付の抽出結果と根拠カードが表示される。
- AC-2 [正常系]: Given 読取り完了・支払い条件未承認 / When 利用者が送金予定を開く / Then 未払い請求書は送金予定に表示せず、抽出結果と元メールはチャットで確認できる。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-read-mail-fixtures](../../tasks/story-demo-read-mail/fixtures.md) | サンプルと閲覧・抽出サービス | done |
| [task-demo-read-mail-mail-ui](../../tasks/story-demo-read-mail/mail-ui.md) | 読取り結果のチャットと資料表示 | done |

## 検証結果

AC-1/AC-2: 元メール本文と抽出結果をチャットに表示し、同意前の送金予定は空にする。`tests/invoices.test.ts`で同意前表示なしを検証。全unit 27件、typecheck、build成功。今回のPlaywright E2Eは未実施。外部メール/AI接続は未実施。

## Blocked

なし。実行開始前。
