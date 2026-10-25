---
id: task-demo-demo-walkthrough
type: task
title: 5画面確認と再現手順
story: story-demo-demo
status: done
blocked_by: [task-demo-demo-e2e]
---

# 5画面確認と再現手順

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

実ブラウザで5画面・カード・原資料・実行詳細を目視確認し、既存READMEへ起動/reset/操作手順を記載。

## 完了条件

別の担当者が手順どおりローカルデモを再現できる。

## 検証方法

一巡とreset後の再演を記録。Vertex AI/World/public接続は未検証と明記し、完了範囲を照合。

## Blocked

なし。


## 検証結果

typecheck/build/db:migrate、unit 5件、Hardhat 1件、E2E 9件が成功。全フロー2回、5画面、設定停止と再開、複数position償還、同一要求の再送で数量が変わらないことを確認。外部接続と失敗復旧は対象外。
