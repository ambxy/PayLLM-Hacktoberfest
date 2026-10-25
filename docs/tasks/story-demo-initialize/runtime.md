---
id: task-demo-initialize-runtime
type: task
title: 起動環境とDBの土台
story: story-demo-initialize
status: done
blocked_by: []
---

# 起動環境とDBの土台

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

Next.js/TS・Drizzle/SQLite・Zod・viem・Hardhatを導入。Node/pnpm/Anvilの動作版とlockfileを固定。migration・server-only境界・固定ユーザー・共通DTO・5画面のナビを用意する。

## 完了条件

クリーン環境で導入・migration・buildし、アプリとAnvilを起動できる。

## 検証方法

導入・型検査・buildと実ブラウザのホーム表示を確認。再実行可能なコマンドをREADMEに記録。

## 検証結果

pnpm install、pnpm db:migrate、pnpm typecheck、pnpm build成功。pnpm contracts:testは1件成功（振替・lock・解除・権限・一意操作・供給保存）。pnpm test:e2e -- tests/e2e/initialize.spec.ts は1件成功。実Anvil 1.5.1/31337で初期化とresetを実行し、顧客100万円・相手先0・lock0、新instance/contractを確認。Chromium画像も目視確認。AI/public接続は未実施。

## Blocked

なし。

