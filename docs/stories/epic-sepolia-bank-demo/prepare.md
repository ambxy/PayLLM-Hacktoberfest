---
id: story-sepolia-prepare
type: story
title: 銀行担当者がSepoliaで運用準備を整える
epic: epic-sepolia-bank-demo
status: done
depends_on: [story-sepolia-wallet]
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
---

# 銀行担当者がSepoliaで運用準備を整える

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

銀行担当者がSepoliaで運用準備を整える。

## 背景・スコープ

[接続Epic](../../epics/sepolia-bank-demo.md)の当該段階を提供する。正常系、証拠照合、誤った資産操作を防ぐ最低限の拒否を含む。自動復旧、mainnet、利息換金は含まない。

### 正常系

- AC-1 [正常系]: Given 専用銀行鍵とRPC設定 / When preflightを実行 / Then chain・contract・ETH・USDC在庫・顧客アドレス・gas見積が表示される。
- AC-2 [正常系]: Given 専用walletと準備数量 / When dry-run / Then Faucet取得とETH補充の送信先・数量・gasを確認でき、明示send以外は送信しない。実送信receiptのACは最終verify Storyで検証する。

### 異常系

復旧UXは延期。各Taskに示した鍵・外部境界の拒否テストは実施する。エラーを成功として扱わない。

## アーキテクチャ制約

ADR-0008、ADR-0009およびEpicの不変条件を適用する。実接続検証の完了状態はロードマップを参照する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| [task-sepolia-prepare-config](../../tasks/story-sepolia-prepare/config.md) | 接続設定と事前確認 | done |
| [task-sepolia-prepare-fund](../../tasks/story-sepolia-prepare/fund.md) | 明示的な資金準備 | done |

## 検証結果

unit7件/typecheck成功。実read-only接続成功。鍵/資金不足は送信せず停止。実public送信確認はverify Storyで実施する。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。
