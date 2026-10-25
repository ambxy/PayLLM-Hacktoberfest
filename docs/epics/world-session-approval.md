---
id: epic-world
type: epic
title: Worldによる口座紐づけとポリシー承認
status: review
adrs: [adr-0010]
---

# Worldによる口座紐づけとポリシー承認

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## スコープ

単一ローカルデモ口座のsession登録、チャット/ルール画面の承認、バックエンド検証・一回消費・Gateway照合、ローカル異常系テスト、実機操作手順。実機検証結果は未実施として明確に分離する。公開ログイン、KYC、session復旧、実資金送信は対象外。

## アーキテクチャ

[ADR-0010](../adr/0010-world-session-approval.md)。World adapterは外部検証のみ、承認サービスはSQLite永続化と内容/版/期限の照合、UIは承認内容表示とIDKit、Gatewayは承認条件を実行直前に確認する。RPC・資金単位・custodyは変更しない。

## Storyと依存レイヤー

レイヤー1: [story-world-approve](../stories/epic-world/approve.md)（依存なし）。登録を前提に、本人がポリシーを承認する1つのユーザーアクションを届ける。

## 検証範囲

単体/API異常系、既存テスト、build/typecheck、localhostアプリ+非fork AnvilでUI/従来の自動支払・運用を検証。World verifierはテスト内だけmock。実機はApp/RPと本人のWorld Appが必要なため、手順と未実施項目を残す。

## 検証結果

単体/API 26件、World承認からAnvil Gatewayへの統合1件、Hardhat 1件、Playwright 5件、build/typecheckが成功。初期session計画のWorld実機検証は未実施。後続のOrb実機検証はWorld振り返りを参照。
