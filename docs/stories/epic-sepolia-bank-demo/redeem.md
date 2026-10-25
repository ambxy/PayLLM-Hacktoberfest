---
id: story-sepolia-redeem
type: story
title: 利用者がチャットから運用元本をTDへ戻す
epic: epic-sepolia-bank-demo
status: done
depends_on: [story-sepolia-invest]
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
---

# 利用者がチャットから運用元本をTDへ戻す

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者がチャットから運用元本をTDへ戻す。

## 背景・スコープ

[接続Epic](../../epics/sepolia-bank-demo.md)の当該段階を提供する。正常系、証拠照合、誤った資産操作を防ぐ最低限の拒否を含む。自動復旧、mainnet、利息換金は含まない。

### 正常系

- AC-1 [正常系]: Given 複数未償還order / When 全額償還を依頼 / Then 各元本のwithdraw・返却確認後だけ対応TDが元口座へ戻る。
- AC-2 [正常系]: Given 利息を含む持分 / When 元本を全額償還 / Then 元本0と残余Aave持分を分けて表示する。
- AC-3 [正常系]: Given public元本が残る / When reset / Then 拒否され鍵と履歴は保持される。償還後resetも同一walletと過去証拠を保持する。

### 異常系

復旧UXは延期。各Taskに示した鍵・外部境界の拒否テストは実施する。エラーを成功として扱わない。

## アーキテクチャ制約

ADR-0008、ADR-0009およびEpicの不変条件を適用する。実接続検証の完了状態はロードマップを参照する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| [task-sepolia-redeem-settlement](../../tasks/story-sepolia-redeem/settlement.md) | 引出しと返却証拠の照合 | done |
| [task-sepolia-redeem-lifecycle](../../tasks/story-sepolia-redeem/lifecycle.md) | 利息表示とreset時の資産保持 | done |

## 検証結果

償還・利息表示・reset保持を実装。unit9件/typecheck/buildとAnvil/stubブラウザ3件成功。public境界のACは実Sepolia最終verifyに残す。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。
