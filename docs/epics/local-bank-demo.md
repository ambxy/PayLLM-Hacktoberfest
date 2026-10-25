---
id: epic-local-bank-demo
type: epic
title: チャット設定による請求書支払いと月末余力の模擬運用
status: review
adrs: [adr-0001-demo-baseline, adr-0002-local-runtime, adr-0003-private-td-lock, adr-0004-rules-intents, adr-0005-money-cashflow, adr-0006-execution-evidence, adr-0007-usdc-td-redemption]
error_acceptance: deferred
error_acceptance_reason: 初期は正常系デモを優先し障害復旧シナリオは後段とする
---

# ローカル銀行デモの設計枠

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## 背景・ゴール

利用者がチャットでルールを設定し、サンプル請求書からのTD送金と、月末までの必要資金を残した模擬USDC運用を説明可能な形で実行できるようにする。

## スコープ

Next.js/TSの5画面、SQLite/Drizzle、Hardhat/Anvilの実TD振替・lock・償還解除、AI/USDC/Aaveのstub、固定デモユーザーを含む。実メール、Vertex AI、World、public実行、保留・失敗のUIと自動復旧、部分償還は対象外。

## アーキテクチャ

[全体設計](../architecture.md)がコンポーネント、フロー、on/off-chain境界、権限、DB/API/contractインターフェース、状態遷移、不変条件を定義する。ADR-0001に初期条件、ADR-0002〜0007に個別の設計判断を記す。

## 成功条件

- チャットで保存・有効化した支払い/運用ルールを確認・変更・停止できる。
- 100万円から当日請求20万円を同一銀行内TDで払い、receiptと履歴を確認できる。
- 月末までの必要資金30万円と安全余裕10万円を残し、40万円をlockして2,500 USDC相当を模擬運用できる。
- 運用USDCを模擬返却して対応TD40万円を解除し、利用可能なTDが80万円に戻る。
- 5画面で根拠・現在状態・実TDとstubの違いを確認できる。
- 全TDの保存とlock禁止、同じ支払い・運用の再実行防止を確認できる。

## 検証範囲

実AnvilのTDとSQLiteを使う業務/API/E2E、金額と照合のunit test、5画面の実操作。AI解釈とUSDC/Aave接続はstubの契約だけを検証し、実サービスの成功とは扱わない。

## Story・Task・依存グラフ

7 Story、各2 Task、合計14 Task。新たな機能追加はなく、合意済みの体験を実装単位へ分解した。全Storyの実装・検証・Epicへの取り込みが完了。

| ID | Story | Depends on | Status |
|---|---|---|---|
| [story-demo-initialize](../stories/epic-local-bank-demo/initialize.md) | 開発者がローカル銀行を初期化する | なし | done |
| [story-demo-read-mail](../stories/epic-local-bank-demo/read-mail.md) | 利用者が許可した請求メールをAgentに読ませる | story-demo-initialize | done |
| [story-demo-configure](../stories/epic-local-bank-demo/configure.md) | 利用者が会話で自動支払いを設定する | story-demo-read-mail | done |
| [story-demo-pay](../stories/epic-local-bank-demo/pay.md) | Agentが期日に請求書を自動支払いする | story-demo-configure | done |
| [story-demo-invest](../stories/epic-local-bank-demo/invest.md) | 利用者が余力運用を設定しAgentが運用する | story-demo-pay | done |
| [story-demo-redeem](../stories/epic-local-bank-demo/redeem.md) | 利用者がチャットで全額TDに戻す | story-demo-invest | done |
| [story-demo-demo](../stories/epic-local-bank-demo/demo.md) | デモ担当者が全フローを通して再現する | story-demo-redeem | done |

依存レイヤーはL1初期化 → L2メール読取り → L3設定 → L4支払い → L5運用 → L6償還 → L7通しデモ。各Storyでサービスと画面を完結させ、次のStoryへ進む。並列実行を前提にしない。

共通不変条件：TD総供給100万円、vault残高＝lock残額合計、同じ請求書は1回だけ支払い、ルール変更で月次使用額をリセットしない。実TDと模擬資産を二重計上せず、USDC返却前にTDを解除しない。


## 実行承認

計画の状態は各文書のfrontmatterに記載する。
