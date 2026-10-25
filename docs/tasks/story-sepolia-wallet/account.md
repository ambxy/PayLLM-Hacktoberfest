---
id: task-sepolia-wallet-account
type: task
title: 口座作成とウォレット表示の接続
story: story-sepolia-wallet
status: done
blocked_by: [task-sepolia-wallet-store]
---

# 口座作成とウォレット表示の接続

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者が口座とpublicウォレットを同時に作るための口座作成とウォレット表示の接続。

## 作業

既存初期化APIに冪等な作成を接続しホームにアドレスと準備状態を表示する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

ブラウザで初期化と再読込を実操作。APIレスポンスとHTMLに秘密情報がないことを確認。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。


## 検証結果

typecheck/build、unit 6件、Playwright wallet 1件が成功。暗号化・改ざん拒否・別プロセス復号・冪等再作成、画面のアドレス表示、reset保持、APIへの秘密非露出を確認。
