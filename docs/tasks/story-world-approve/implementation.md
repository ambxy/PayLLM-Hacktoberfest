---
id: task-world-approve-implementation
type: task
title: World連携と承認境界を実装して検証
story: story-world-approve
status: done
blocked_by: []
---

# World連携と承認境界を実装して検証

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 作業・完了条件

ADR-0010に沿うadapter、永続challenge/紐づけ/承認、登録UI、設定/変更UI、Gateway検査を実装しStoryのACをテストする。実機設定手順と未検証事項を記録する。

## 検証方法

単体/APIテスト、build、typecheck、関連Playwright、Anvil統合を実施し、外部mockと実機の結果を分ける。



## 検証結果

単体/API 26件、World承認からAnvil Gatewayへの統合1件、Hardhat 1件、Playwright 5件、build/typecheckが成功。初期session計画のWorld実機検証は未実施。後続のOrb実機検証はWorld振り返りを参照。
