---
id: task-sepolia-wallet-store
type: task
title: 暗号化鍵と口座の永続化
story: story-sepolia-wallet
status: done
blocked_by: []
---

# 暗号化鍵と口座の永続化

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者が口座とpublicウォレットを同時に作るための暗号化鍵と口座の永続化。

## 作業

独立walletテーブル、unique口座chain制約、AES-GCM、master key設定、既存口座移行を実装する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

暗号化復号・AAD改ざん拒否・並行作成・再起動のテスト。平文鍵がDB/ログに出ないことを検査。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。


## 検証結果

typecheck/build、unit 6件、Playwright wallet 1件が成功。暗号化・改ざん拒否・別プロセス復号・冪等再作成、画面のアドレス表示、reset保持、APIへの秘密非露出を確認。
