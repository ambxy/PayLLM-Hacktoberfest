---
id: task-demo-demo-e2e
type: task
title: ローカル通し検証
story: story-demo-demo
status: done
blocked_by: []
---

# ローカル通し検証

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

Playwrightで実アプリ/SQLite/Anvilを使う正常系を作成。残高・署名対応・月次実績・stub台帳・resetの結果を検証し、型検査/build/契約テストも実行。

## 完了条件

採用ACを実行結果と対応付け、実TDとstubの証拠を区別して記録する。

## 検証方法

型検査・build・unit/contract・統合・Playwrightを実行。正確なコマンドと結果をTaskに残す。

## Blocked

なし。


## 検証結果

typecheck/build/db:migrate、unit 5件、Hardhat 1件、E2E 9件が成功。全フロー2回、5画面、設定停止と再開、複数position償還、同一要求の再送で数量が変わらないことを確認。外部接続と失敗復旧は対象外。
