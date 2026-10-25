---
id: story-demo-pay
type: story
title: Agentが期日に請求書を自動支払いする
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-configure]
adrs: [adr-0002-local-runtime, adr-0003-private-td-lock, adr-0004-rules-intents, adr-0006-execution-evidence]
---

# Agentが期日に請求書を自動支払いする

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

Agentが期日に請求書を自動支払いする。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 支払いルール有効・未払20万円 / When 利用者が期日到来を起動 / Then AgentのIntentを銀行が実行して顧客80万円・相手先20万円になる。
- AC-2 [正常系]: Given 送金確定 / When 利用者がチャットと請求書を開く / Then 支払済み・receipt・根拠・適用ルールが対応する。
- AC-3 [正常系]: Given 支払済み / When 同じ期日イベントを再実行 / Then TDと月次支払実績は増減しない。
- AC-4 [正常系]: Given アオバデザイン・サクラオフィスの受取先別上限に同意済み / When 送金予定を開く / Then 両社の未払請求書を表示し、期日到来時に各受取先の上限内で処理する。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-pay-payment-service](../../tasks/story-demo-pay/payment-service.md) | 署名Intentと銀行の支払い実行 | done |
| [task-demo-pay-payment-ui](../../tasks/story-demo-pay/payment-ui.md) | 期日操作と支払い結果 | done |

## 検証結果

AC-1/2/3: pnpm build成功。Playwright pay.spec.ts 1件成功、実Anvilで顧客80万/取引先20万、receipt event照合、期日再実行後も80万円。pnpm testのpolicy.test.tsで月次予約→確定の一回集計・JST月境界・ルール変更後の保持、署名の金額/宛先/版束縛を検証。チャット画面目視済み。public取引なし。

## Blocked

なし。実行開始前。

`tests/e2e/pay.spec.ts`が一時DB・一時Anvil環境で成功し、両社の予定表示、期日支払いreceipt、再実行時の残高不変を確認。全unit 27件、typecheck、build成功。実Sepolia送金は未実施。

