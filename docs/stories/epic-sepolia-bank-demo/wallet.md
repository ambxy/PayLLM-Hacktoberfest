---
id: story-sepolia-wallet
type: story
title: 利用者が口座とpublicウォレットを同時に作る
epic: epic-sepolia-bank-demo
status: done
depends_on: []
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
---

# 利用者が口座とpublicウォレットを同時に作る

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者が口座とpublicウォレットを同時に作る。

## 背景・スコープ

[接続Epic](../../epics/sepolia-bank-demo.md)の当該段階を提供する。正常系、証拠照合、誤った資産操作を防ぐ最低限の拒否を含む。自動復旧、mainnet、利息換金は含まない。

### 正常系

- AC-1 [正常系]: Given 未作成口座 / When 口座を作成 / Then Sepoliaアドレスが表示され暗号化鍵が永続化される。
- AC-2 [正常系]: Given 作成済み口座 / When 再要求またはサーバー再起動 / Then 同一アドレスが返り余分な鍵を作らない。

### 異常系

復旧UXは延期。各Taskに示した鍵・外部境界の拒否テストは実施する。エラーを成功として扱わない。

## アーキテクチャ制約

ADR-0008、ADR-0009およびEpicの不変条件を適用する。実接続検証の完了状態はロードマップを参照する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| [task-sepolia-wallet-store](../../tasks/story-sepolia-wallet/store.md) | 暗号化鍵と口座の永続化 | done |
| [task-sepolia-wallet-account](../../tasks/story-sepolia-wallet/account.md) | 口座作成とウォレット表示の接続 | done |

## 検証結果

AC-1/2: unit custodyとPlaywright walletで検証。typecheck/build成功。独立レビューの事前鍵検証によるactive_run残留を修正。既存口座の移行はmaster key設定後の明示resetで実施。public残高・資金準備状態は次Storyで接続。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。
