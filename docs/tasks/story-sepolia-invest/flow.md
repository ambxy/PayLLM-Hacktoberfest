---
id: task-sepolia-invest-flow
type: task
title: 運用サービスと画面の接続
story: story-sepolia-invest
status: done
blocked_by: [task-sepolia-invest-adapter]
---

# 運用サービスと画面の接続

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

Agentが余力をSepoliaのAaveへ預けるための運用サービスと画面の接続。

## 作業

既存Intent/Policy/lockにadapterを組込み、残高はchain読取りへ、run表示はmode/chain/hashを保持する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

実Anvilとローカルadapterテスト、ブラウザの運用フロー。実Sepolia確認は最終Story。

## 検証結果

typecheck/build成功、unit8件成功（receiptのtoken/from/to/amount/target/status照合）、Anvil＋stubのPlaywright10件成功。独立レビューHighなし、gas補正後上限と確定台帳nonce/chain保持を修正。実Sepolia送信はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

