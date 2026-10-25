---
id: task-demo-configure-rule-service
type: task
title: 提案・同意と版付き設定
story: story-demo-configure
status: done
blocked_by: []
---

# 提案・同意と版付き設定

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

proposals、rule_versions、同意messageを実装。条件を型検証してatomic保存。ルール変更と送信のmutex境界を作り、月次集計の顧客/相手先/月キーを定義。

## 完了条件

人間の同意が具体案へ紐付き、変更前の版を履歴で追える。

## 検証方法

実SQLiteで提案→同意→変更→停止→再有効化と保存内容を確認。再度同意しても同じ提案が増殖しない。

## 検証結果

AC-1/2/3: pnpm build（型検査含む）成功。Playwright configure.spec.ts 1件成功。読取り→根拠付き20万円/月20万円提案→肯定→有効化→月30万円へ変更→停止→再有効化→再読込みを実SQLiteで確認。版1〜4と確定カード・ルール画面を照合、画像目視済み。AI/public接続はstubまたは未実施。

## Blocked

なし。

