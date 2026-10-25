---
id: task-sepolia-invest-adapter
type: task
title: public実行台帳と預入adapter
story: story-sepolia-invest
status: done
blocked_by: []
---

# public実行台帳と預入adapter

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

Agentが余力をSepoliaのAaveへ預けるためのpublic実行台帳と預入adapter。

## 作業

非同期adapterを定義しstub直importを差替える。step台帳、nonce直列化、receiptイベント照合、bank transfer/approve/supplyを実装する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

ローカルfixture receiptで金額/宛先改ざん・重複要求・順序を検証しstub既存テストを維持。

## 検証結果

typecheck/build成功、unit8件成功（receiptのtoken/from/to/amount/target/status照合）、Anvil＋stubのPlaywright10件成功。独立レビューHighなし、gas補正後上限と確定台帳nonce/chain保持を修正。実Sepolia送信はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

