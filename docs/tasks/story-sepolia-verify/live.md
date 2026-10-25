---
id: task-sepolia-verify-live
type: task
title: Sepolia往復と証拠記録
story: story-sepolia-verify
status: blocked
blocked_by: [task-sepolia-verify-regression]
---

# Sepolia往復と証拠記録

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

デモ担当者が実Sepoliaの往復を確認するためのSepolia往復と証拠記録。

## 作業

小額→通常額の順に実操作しchainId、address、txHash、block、残高差、TD保存を監査へ記録する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

実Sepolia receiptと5画面を照合。資金未準備の場合は外部検証未実施として記録しEpic完了にしない。

## 検証結果

Base Sepoliaで10 USDCの預入・元本引出し・銀行返却・対応する1,600 TDの解除を確認。通常2,500 USDCの往復検証は未完了のため、最終Story/Taskはblockedを維持する。Faucetの取得制約と対象市場の状態は再実行時に確認する。

## 再開条件

対象環境で生成・設定したwalletの残高、gas、在庫、chainと宛先を確認し、dry-runを経て許可した数量のみ送信する。既存の取引・残高を引き継いだと仮定しない。
