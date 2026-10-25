---
id: story-demo-configure
type: story
title: 利用者が会話で自動支払いを設定する
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-read-mail]
adrs: [adr-0001-demo-baseline, adr-0002-local-runtime, adr-0004-rules-intents]
---

# 利用者が会話で自動支払いを設定する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者が会話で自動支払いを設定する。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 抽出済み20万円請求 / When Agentが条件を提案 / Then 取引先・1件20万円・月20万円・期日払いがカードに明示される。
- AC-2 [正常系]: Given 具体案の提示済み / When 利用者が「そうしてください」 / Then その版の条件が保存・有効化され、設定カードとルール一覧が一致する。
- AC-3 [正常系]: Given 有効ルール / When 利用者が条件変更・停止 / Then 新版と状態が保存され未実行分に適用される。
- AC-4 [正常系]: Given サンプル請求書2件 / When 利用者が両社の上限案に同意 / Then アオバデザイン月20万円・サクラオフィス月10万円までの支払いが有効になり、両社分が送金予定に表示される。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-configure-rule-service](../../tasks/story-demo-configure/rule-service.md) | 提案・同意と版付き設定 | done |
| [task-demo-configure-rule-ui](../../tasks/story-demo-configure/rule-ui.md) | 設定案・設定完了カードとルール画面 | done |

## 検証結果

AC-1/2/3: pnpm build（型検査含む）成功。Playwright configure.spec.ts 1件成功。読取り→根拠付き20万円/月20万円提案→肯定→有効化→月30万円へ変更→停止→再有効化→再読込みを実SQLiteで確認。版1〜4と確定カード・ルール画面を照合、画像目視済み。AI/public接続はstubまたは未実施。

## Blocked

なし。実行開始前。

回帰テスト`tests/invoices.test.ts`と隔離Anvilの`tests/e2e/pay.spec.ts`で同意後に両社の請求を表示することを確認。全unit 27件、typecheck、build成功。ルール変更UIのE2Eは未実施。

