---
id: task-demo-configure-rule-ui
type: task
title: 設定案・設定完了カードとルール画面
story: story-demo-configure
status: done
blocked_by: [task-demo-configure-rule-service]
---

# 設定案・設定完了カードとルール画面

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的・作業

チャットの提案/同意/設定完了、一覧からの変更・停止を同じサービスへ接続する。

## 完了条件

別保存ボタンなしで確定し、再読込みでも有効条件が一致する。

## 検証方法

実ブラウザで会話設定とルール変更・停止を確認。前後の版と表示を記録。

## 検証結果

AC-1/2/3: pnpm build（型検査含む）成功。Playwright configure.spec.ts 1件成功。読取り→根拠付き20万円/月20万円提案→肯定→有効化→月30万円へ変更→停止→再有効化→再読込みを実SQLiteで確認。版1〜4と確定カード・ルール画面を照合、画像目視済み。AI/public接続はstubまたは未実施。

## Blocked

なし。

