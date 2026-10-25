---
id: story-world-approve
type: story
title: 登録した人がWorldでポリシーを承認する
epic: epic-world
status: done
depends_on: []
adrs: [adr-0010]
---

# 登録した人がWorldでポリシーを承認する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

Selfie Check/sessionを口座へ登録し、その人が提示されたルールの設定・変更を承認する。

## 受け入れ条件

- AC-1 [正常系]: Given 未登録口座 / When session作成がサーバーで検証成功 / Then 口座へ一度だけ紐づき初期化できる。
- AC-2 [正常系]: Given 登録sessionと具体的提案 / When 同じsessionの新しい証明で再確認 / Then 正確な内容・版だけを一度保存し、Gatewayが条件内で自動実行する。
- AC-3 [異常系]: Given 未確認・別session・誤ったnonce/signal/credential/environment・検証失敗 / When 登録/設定/変更 / Then 口座紐づけ・ルールを変更しない。
- AC-4 [異常系]: Given 取消・期限切れ・使用済みproof/承認・別instance・古い版・変更された条件/実行先 / When 適用またはGateway実行 / Then 拒否する。
- AC-5 [正常系]: Given World未設定の既存デモ / When disabledで実行 / Then 従来フローが動く。登録済み口座はdisabled変更で迂回できない。

## Task

- [task-world-approve-implementation](../../tasks/story-world-approve/implementation.md): 実装・検証・実機手順。


## 検証結果

単体/API 26件、World承認からAnvil Gatewayへの統合1件、Hardhat 1件、Playwright 5件、build/typecheckが成功。初期session計画のWorld実機検証は未実施。後続のOrb実機検証はWorld振り返りを参照。
