---
id: story-demo-redeem
type: story
title: 利用者がチャットで全額TDに戻す
epic: epic-local-bank-demo
status: done
depends_on: [story-demo-invest]
adrs: [adr-0002-local-runtime, adr-0003-private-td-lock, adr-0004-rules-intents, adr-0006-execution-evidence, adr-0007-usdc-td-redemption]
---

# 利用者がチャットで全額TDに戻す

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者がチャットで全額TDに戻す。[設計](../../architecture.md)の責務境界を維持する。

## スコープ

下記Taskのローカル正常系。保留・失敗の専用画面、復旧、実メール、Vertex AI、World、public取引、部分償還は含めない。

### 正常系

- AC-1 [正常系]: Given 運用2,500 USDC・lock40万円 / When 利用者が「運用分を全部TDに戻して」 / Then Agentが償還Intentを作り、返却確認後に元顧客へTDを解除する。
- AC-2 [正常系]: Given 償還完了 / When 利用者が結果を確認 / Then 顧客TD80万円・受取先20万円・lock0・position0・銀行模擬在庫10,000となる。

### 異常系

正常系を支える権限・金額・二重実行防止の不変条件は維持し、異常系の体験全体を検証済みとはしない。

## アーキテクチャ制約

AnvilがTD正本。AIは候補のみ、銀行が再検証して実行する。金額は整数。鍵はサーバー専用。模擬USDC/Aaveの記録は実transactionと区別する。参照ADRとEpicの共通不変条件を適用する。

## Task

| ID | Task | Status |
|---|---|---|
| [task-demo-redeem-redemption-service](../../tasks/story-demo-redeem/redemption-service.md) | チャット依頼に基づく償還 | done |
| [task-demo-redeem-redemption-ui](../../tasks/story-demo-redeem/redemption-ui.md) | 償還依頼と結果表示 | done |

## 検証結果

AC-1/2: pnpm build成功。Playwright redeem.spec.ts 2件成功。単一40万円運用と上限20万円×2回運用→設定停止の両ケースで、チャット依頼から銀行返却→実Anvil解除を確認。顧客80万/相手先20万/lock0/position0/銀行在庫10,000 USDC。画像目視済み。レビューで複数order対応を修正し、再レビューCRITICAL/HIGH 0。

## Blocked

なし。実行開始前。
