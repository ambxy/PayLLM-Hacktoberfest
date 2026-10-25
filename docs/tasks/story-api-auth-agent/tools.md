---
id: task-api-auth-agent-tools
type: task
title: Agent専用APIと認可付きサービスを実装
story: story-api-auth-agent
status: done
blocked_by: []
---

# Agent専用APIと認可付きサービスを実装

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

Agentが許可済み情報を読み、支払い・余剰運用・本人依頼の全額償還を銀行APIへ依頼する。

## 作業

- local-demoでもAgent credentialからdemo-login/デモ承認への呼出しは拒否する。

- read/propose/実行の業務APIと固定schemaを追加。tool runnerへAgent credentialだけを注入し、UI要求からのuser context継承を禁止。メールgrantも検証する。
- [Story](../../stories/epic-api-authorization/agent.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- API所有者/scope行列、未許可情報の非開示、旧chat/ルール/償還経由の迂回拒否をテスト。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

Agent auth unit、既存policy/invoices unitを認証済みPrincipalと明示承認へ更新し成功。strict Agent API・本人との分離・未許可情報・raw message償還拒否を確認。 実行コマンド・AC対応・外部未検証範囲は[Story](../../stories/epic-api-authorization/agent.md)に記録。typecheck/build/diff/planning検査成功。

## Blocked

なし。

