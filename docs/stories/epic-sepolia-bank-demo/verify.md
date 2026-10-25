---
id: story-sepolia-verify
type: story
title: デモ担当者が実Sepoliaの往復を確認する
epic: epic-sepolia-bank-demo
status: blocked
depends_on: [story-sepolia-redeem]
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
---

# デモ担当者が実Sepoliaの往復を確認する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

デモ担当者が実Sepoliaの往復を確認する。

## 背景・スコープ

[接続Epic](../../epics/sepolia-bank-demo.md)の当該段階を提供する。正常系、証拠照合、誤った資産操作を防ぐ最低限の拒否を含む。自動復旧、mainnet、利息換金は含まない。

### 正常系

- AC-1 [正常系]: Given 専用鍵・ETH・USDCと実行許可 / When 10 USDCプロフィールを実行 / Then TD 1,600 lockからAave預入・銀行返却・TD解除まで実receiptが揃う。
- AC-2 [正常系]: Given 小額往復確認済みで在庫と許可範囲が十分 / When 通常デモを実行 / Then 40万円=2,500 USDCの往復と5画面の表示を確認する。
- AC-3 [正常系]: Given 実行証拠 / When 監査記録を読む / Then stub/local/Sepoliaの検証結果と未実施項目を区別できる。

### 異常系

復旧UXは延期。各Taskに示した鍵・外部境界の拒否テストは実施する。エラーを成功として扱わない。

## アーキテクチャ制約

ADR-0008、ADR-0009およびEpicの不変条件を適用する。実接続検証の完了状態はロードマップを参照する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| [task-sepolia-verify-regression](../../tasks/story-sepolia-verify/regression.md) | ローカル回帰と小額プロフィール | done |
| [task-sepolia-verify-live](../../tasks/story-sepolia-verify/live.md) | Sepolia往復と証拠記録 | blocked |

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

## 検証結果

Base Sepoliaで10 USDCの預入・元本引出し・銀行返却・対応する1,600 TDの解除を確認。通常2,500 USDCの往復検証は未完了のため、最終Story/Taskはblockedを維持する。Faucetの取得制約と対象市場の状態は再実行時に確認する。
