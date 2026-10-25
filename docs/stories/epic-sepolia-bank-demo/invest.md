---
id: story-sepolia-invest
type: story
title: Agentが余力をSepoliaのAaveへ預ける
epic: epic-sepolia-bank-demo
status: done
depends_on: [story-sepolia-prepare]
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
---

# Agentが余力をSepoliaのAaveへ預ける

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

Agentが余力をSepoliaのAaveへ預ける。

## 背景・スコープ

[接続Epic](../../epics/sepolia-bank-demo.md)の当該段階を提供する。正常系、証拠照合、誤った資産操作を防ぐ最低限の拒否を含む。自動復旧、mainnet、利息換金は含まない。

### 正常系

- AC-1 [正常系]: Given 有効ルールと資金 / When 余力チェック / Then 実TD lock後にUSDC受渡し・approve・supplyが順番に実行される。
- AC-2 [正常系]: Given 同じ実行ID / When 再要求 / Then 二重lock/transfer/supplyがなく既存結果を返す。
- AC-3 [正常系]: Given 預入確定 / When 運用画面を開く / Then 元本とオンチェーンaToken残高、各txリンクを確認できる。

### 異常系

復旧UXは延期。各Taskに示した鍵・外部境界の拒否テストは実施する。エラーを成功として扱わない。

## アーキテクチャ制約

ADR-0008、ADR-0009およびEpicの不変条件を適用する。実接続検証の完了状態はロードマップを参照する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| [task-sepolia-invest-adapter](../../tasks/story-sepolia-invest/adapter.md) | public実行台帳と預入adapter | done |
| [task-sepolia-invest-flow](../../tasks/story-sepolia-invest/flow.md) | 運用サービスと画面の接続 | done |

## 検証結果

預入経路実装、typecheck/build、unit8件、既存Anvil/stubブラウザ10件成功。ACの実Sepolia receipt・画面は最終verify Storyで確認し、現時点で実預入済みとは扱わない。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。
