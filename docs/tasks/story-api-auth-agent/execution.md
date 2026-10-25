---
id: task-api-auth-agent-execution
type: task
title: 銀行の送信直前検証と償還依頼を束縛
story: story-api-auth-agent
status: done
blocked_by: [task-api-auth-agent-tools]
---

# 銀行の送信直前検証と償還依頼を束縛

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

Agentが許可済み情報を読み、支払い・余剰運用・本人依頼の全額償還を銀行APIへ依頼する。

## 作業

- 送信前にauthModeと認証世代も照合し、worldでデモ承認による実行を拒否する。

- IntentへAgent/口座/認可根拠を束縛。本人発話に基づく一回償還requestを生成。private/publicの各新規送信と取消/版更新を直列化し監査理由を保存する。
- [Story](../../stories/epic-api-authorization/agent.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- Anvilとpublic stub/mockで正常フロー、残高/上限、replay、停止との競合、lock後停止を確認する。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

実Anvil TD送金/lock/解除、public stub入出金、運用停止後償還、lock後取消によるpublic停止、未償還reset拒否が成功。public adapter mockで全stage送信前検証と送信済みreceipt追跡が成功。 実行コマンド・AC対応・外部未検証範囲は[Story](../../stories/epic-api-authorization/agent.md)に記録。typecheck/build/diff/planning検査成功。

## Blocked

なし。

