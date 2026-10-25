---
id: task-sepolia-verify-regression
type: task
title: ローカル回帰と小額プロフィール
story: story-sepolia-verify
status: done
blocked_by: []
---

# ローカル回帰と小額プロフィール

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

デモ担当者が実Sepoliaの往復を確認するためのローカル回帰と小額プロフィール。

## 作業

既存デモを維持したまま明示的な10 USDC用プロフィールと正常系E2Eを追加する。

## 完了条件

上記作業がStoryの受け入れ条件に接続され、以下の検証結果が記録されている。外部未実施を成功扱いしない。

## 検証方法

pnpm typecheck、pnpm test、pnpm contracts:test、pnpm build、pnpm test:e2e。

## 検証結果

ten-usdc用別起動で小額E2E1件成功。public previewでAnvil初期化・実Sepolia残高0・補充アドレス表示・送信無効をブラウザ確認。通常E2Eをpublic previewへ向けるとglobal setupで期待どおり拒否。

## Blocked

外部検証はローカル検証と分離し、対象環境の鍵・資金・実行範囲を確認して実施する。

