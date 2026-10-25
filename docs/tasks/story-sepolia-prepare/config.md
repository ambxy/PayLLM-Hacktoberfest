---
id: task-sepolia-prepare-config
type: task
title: 接続設定と事前確認
story: story-sepolia-prepare
status: done
blocked_by: []
---

# 接続設定と事前確認

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

銀行担当者がSepoliaで運用準備を整えるための接続設定と事前確認。

## 作業

mode固定、アドレス/chain許可リスト、銀行鍵の非表示取込み、reserveと残高確認CLIを実装する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

誤chain/token/Anvil既知鍵拒否をローカルテスト。Sepolia read-only照合。

## 検証結果

typecheck・unit7件成功。実Sepoliaのchain/contract/decimals/reserve照合とETH/USDC残高読取り成功。mint 10 dry-runはETH残高0で意図どおり停止、送信なし。残高ありと準備完了を区別し、receiptの資産/宛先/数量照合と準備tx永続化を実装。実gas見積・取得・補充の確認はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

