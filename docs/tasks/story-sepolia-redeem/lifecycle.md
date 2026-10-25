---
id: task-sepolia-redeem-lifecycle
type: task
title: 利息表示とreset時の資産保持
story: story-sepolia-redeem
status: done
blocked_by: [task-sepolia-redeem-settlement]
---

# 利息表示とreset時の資産保持

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者がチャットから運用元本をTDへ戻すための利息表示とreset時の資産保持。

## 作業

元本と利息の表示、チャット文言、public台帳の独立保持、resetガード、旧instance参照を実装する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

ブラウザで償還前reset拒否と償還後reset保持を確認。aToken丸めによるごく小さな差額は不足として誤表示しない数値テスト。

## 検証結果

unit9件/typecheck/build成功。返却log再利用拒否・未償還public reset拒否をテスト。Anvil/stubで全画面デモと単一/複数元本償還のPlaywright3件成功。独立レビューのreset競合を修正し、排他内で再確認する。実Sepolia引出し/返却はverify Storyへ集約し未実施。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

