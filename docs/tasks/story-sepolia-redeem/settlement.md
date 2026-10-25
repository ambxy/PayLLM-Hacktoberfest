---
id: task-sepolia-redeem-settlement
type: task
title: 引出しと返却証拠の照合
story: story-sepolia-redeem
status: done
blocked_by: []
---

# 引出しと返却証拠の照合

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者がチャットから運用元本をTDへ戻すための引出しと返却証拠の照合。

## 作業

withdraw、銀行返却、log一意消費とsettlementRef、既存Vault.releaseを接続する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

誤token/from/to/amount・返却log再利用・未確定で解除しないテスト。複数orderと停止ルール下の償還確認。

## 検証結果

unit9件/typecheck/build成功。返却log再利用拒否・未償還public reset拒否をテスト。Anvil/stubで全画面デモと単一/複数元本償還のPlaywright3件成功。独立レビューのreset競合を修正し、排他内で再確認する。実Sepolia引出し/返却はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

