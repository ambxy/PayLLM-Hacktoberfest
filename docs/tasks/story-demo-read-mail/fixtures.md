---
id: task-demo-read-mail-fixtures
type: task
title: サンプルと閲覧・抽出サービス
story: story-demo-read-mail
status: done
blocked_by: []
---

# サンプルと閲覧・抽出サービス

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

設計§19の架空メール・ローカル添付・履歴を作成。grantを保存するメールadapter、決定論AI抽出stub、登録受取先照合とinvoiceKey保存を実装。

## 完了条件

対象メールと請求書・履歴が対応し、抽出は許可範囲の資料を根拠にする。

## 検証方法

実SQLiteでgrant→読取り→抽出保存を確認。fixturesの金額・期日・recurrenceKey対応を確認。

## 検証結果

AC-1/AC-2: pnpm build（型検査含む）成功。Playwright mail.spec.ts 1件成功。実SQLite/Anvilの初期化後に閲覧許可→読取り→抽出カード→元メールと請求書20万円の表示を確認。画像目視済み。ルール・送金は未作成、外部メール/AI接続は未実施。

## Blocked

なし。

