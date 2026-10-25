---
id: task-api-auth-ui-flow
type: task
title: 会話とWorld承認画面を接続
story: story-api-auth-ui
status: done
blocked_by: []
---

# 会話とWorld承認画面を接続

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者がAgentの提案にOKと答え、銀行の条件カードを確認してWorld認証し、その後の自動実行を確認する。

## 作業

- World未設定/失敗/タイムアウト/取消でもlocal-demoなら「デモとして続ける」を表示し、同じ具体条件への明示承認で進める。World省略可能の表示と履歴を追加する。

- OKから保存済み条件カードとWorldへ進め、銀行側verify完了で反映する。ログイン/未設定/セッション切れ表示、メール閲覧許可、ルール停止、償還依頼を接続。
- [Story](../../stories/epic-api-authorization/ui.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- 実アプリで画面を操作し、OKのみでは反映されずworldではWorld成功、local-demoでは明示的デモ承認で有効になることを確認。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

Storyの検証結果を参照。ログイン/承認/取消/停止/失効の実ブラウザ検証と、型検査・build・format・planningが成功。World begin失敗から明示デモ承認へ継続でき、取消challengeの再confirmは409。実機World/publicは未実施。

## Blocked

なし。

