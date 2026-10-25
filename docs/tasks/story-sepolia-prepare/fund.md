---
id: task-sepolia-prepare-fund
type: task
title: 明示的な資金準備
story: story-sepolia-prepare
status: done
blocked_by: [task-sepolia-prepare-config]
---

# 明示的な資金準備

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

銀行担当者がSepoliaで運用準備を整えるための明示的な資金準備。

## 作業

数量を指定するFaucet mintとETH補充CLI、dry-run既定と明示send、専用ウォレット表示を用意する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

ローカルで送信内容照合。実ネットワークでは鍵/ETH/操作範囲の許可が揃った場合のみreceipt確認。

## 検証結果

typecheck・unit7件成功。実Sepoliaのchain/contract/decimals/reserve照合とETH/USDC残高読取り成功。mint 10 dry-runはETH残高0で意図どおり停止、送信なし。残高ありと準備完了を区別し、receiptの資産/宛先/数量照合と準備tx永続化を実装。実gas見積・取得・補充の確認はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

