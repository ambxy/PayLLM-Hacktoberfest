---
id: task-api-auth-approval-binding
type: task
title: 提案と委任の承認内容を固定
story: story-api-auth-approval
status: done
blocked_by: []
---

# 提案と委任の承認内容を固定

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

本人が具体的な支払い/運用条件とメール閲覧範囲をWorldで承認し、必要なら直ちに停止する。

## 作業

- 承認方法と適用モードを保存し、デモ承認をWorld binding/成功proofとして保存しない。

- rule/grant/proposalにaccountId/agentId/scope/版を追加。承認画面用の正規化データとWorld signalを同じ保存内容から作る。
- [Story](../../stories/epic-api-authorization/approval.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- 条件・所有者・Agent・chain・scope・版の各改変がsignal/照合で拒否されるテストを行う。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

口座/Agent/世代/条件/対象改変、並行verify、replay、期限、DB rollback、取消、デモ継続との競合、Agent/偽Principal拒否、scope付与と即時取消を検証。`tsc --noEmit`、`next build --webpack`、`git diff --check`成功。外部World検証はfetch mock、publicはstubで実送信なし。

## Blocked

なし。

追加境界レビュー: 委任取消時に同じscopeのpending/verifying承認を同一transactionで取消し、遅延World完了や保留デモ承認で権限が復活しない回帰テスト成功。

