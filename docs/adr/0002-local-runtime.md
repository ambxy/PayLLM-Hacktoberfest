---
id: adr-0002-local-runtime
type: adr
title: 単一Nodeプロセスと機能別境界
epic: epic-local-bank-demo
status: accepted
---

# 単一Nodeプロセスと機能別境界

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

初期は単一アプリかつローカルデモ。長期workerや外部queueは合意スコープにない。

## Decision

Node runtimeのNext.jsにUI・API・業務サービスを置く。featuresをchat/rules/invoices/cashflow/agents/banking/investment/demoに分け、接続実装をintegrations、DB・構成組立をserverへ置く。SQLiteはbetter-sqlite3、schema検証はZod。AIは`integrations/ai`を境界にstubまたはGemini Developer APIを選ぶ。正確な候補版と確認元は全体設計§11および[ADR-0011](0011-gemini-ai-integration.md)。

資産操作・デモ時計変更・初期化をactiveRunで排他し、一つの資産runをawaitして実行する。進捗をDBへ記録し、UIはpollする。ルール変更を未実行の操作へ反映する。署名・送信の確定区間を設定更新と短く排他し、その直前に最新ルール版を検証する。DB transactionはRPC待ちと分離。localhostの固定ユーザー運用とし、秘密鍵とDB/RPC呼出しをserver-onlyに限定する。

## Alternatives

独立worker＋queueは耐障害性に有利だが初期の環境と運用を増やす。serverlessはSQLiteファイル・Anvil・request実行寿命を別途設計する必要がある。

## Consequences

ローカルの2フローを少ない構成で実装できる。複数プロセス・公開サービス・クラッシュ自動復旧の保証はない。処理停止時はneeds_attentionに残す。

