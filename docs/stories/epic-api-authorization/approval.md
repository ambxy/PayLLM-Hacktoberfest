---
id: story-api-auth-approval
type: story
title: 本人がWorldでAgentへの委任を承認する
epic: epic-api-authorization
status: done
depends_on: [story-api-auth-identity]
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# 本人がWorldでAgentへの委任を承認する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

本人が具体的な支払い/運用条件とメール閲覧範囲をWorldで承認し、必要なら直ちに停止する。

## 背景

[API権限分離Epic](../../epics/api-authorization.md)を構成する。詳細設計はADR、検証範囲は本Storyに記載する。

### 含むもの

- proposal/approvalをaccountId/agentId/scopeへ拡張し、一回消費と変更保存を原子的にする。
- メールgrant、資金操作scope、ルールの付与・拡大・再有効化と停止/取消。

### 含まないもの

- Agentによる承認代行、銀行固定chain/token/poolの編集、管理者UIの新設。

## 受け入れ条件

World必須・失敗時拒否の条件はworldモードに適用する。local-demoの追加ACでは本人在席確認を省略するが、主体別API権限と銀行Policyを維持する。

### 正常系

- AC-1 [正常系]: Given 保存済み提案と本人セッション / When 対象Agentと条件を確認してWorld検証を完了 / Then 対象のgrant/ルールだけが新しい版で一度反映される。
- AC-2 [正常系]: Given 有効な委任と本人セッション / When 停止/取消する / Then Worldの再確認なしで範囲を縮小し再有効化にはモードに応じた新しい承認を要求する。

- AC-6 [正常系]: Given local-demoと本人デモセッション / When World失敗/取消後に表示条件をデモ承認 / Then approvalMethod=local-demoで一度だけ適用しWorld成功履歴を作らない。

### 異常系

- AC-3 [異常系]: Given 別Agent/口座/用途/条件/実行先、古い版、期限切れ、取消済み、使用済みproof / When verifyまたは保存を要求 / Then 承認・ルール・grantは適用されない。
- AC-4 [異常系]: Given 同じapprovalの並行完了または保存時の失敗 / When transactionを処理 / Then 消費と反映が一組で成功またはrollbackし、二重更新しない。
- AC-5 [異常系]: Given Agentが承認IDを知っている / When apply/accept/変更を直呼び / Then Agent主体では消費できず、会話のOKやモデル生成承認で迂回できない。

- AC-7 [異常系]: Given デモ承認の別条件/古い版/期限切れ/replay、またはWorldとデモの同時完了 / When 適用 / Then 不一致を拒否し同じ提案を二重反映しない。

## アーキテクチャ制約

[ADR-0011](../../adr/0011-human-agent-api-authorization.md)、ADR-0010/0004、EpicのI1〜I8を適用する。API権限表と所有口座/Agentの境界を維持する。Node/SQLiteの同一プロセスをOS隔離と扱わない。World verifierのmockはテスト専用。runtimeのlocal-demoは別承認方法として検証する。publicはstub、TDは非fork Anvilで検証する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| task-api-auth-approval-binding | [提案と委任の承認内容を固定](../../tasks/story-api-auth-approval/binding.md) | done |
| task-api-auth-approval-consume | [本人承認の一回適用と取消を実装](../../tasks/story-api-auth-approval/consume.md) | done |

## 検証結果

World実機とpublic実送信は未実施。

- AC-1: World applies exact policy / HTTP endpoints テスト。保存済み条件だけを同一transactionで反映。
- AC-2: scope grant/revoke、disableRule直後のpayment拒否。停止にWorld再検証不要。
- AC-3: 改変・期限・取消・replay・対象変更とGateway検証。
- AC-4: parallel completion / failed persistence テスト。proof・rule保存をrollback。
- AC-5: agent/forged principal拒否、旧accept/change常時拒否。
- AC-6: explicit demo approvalテスト。World binding/proofを作成せずlocal-demoとして保存。
- AC-7: demo version/expiry/replayとin-flight World競合テスト。

GET /api/delegationsを本人専用の委任一覧として追加し、停止UIに保存済み条件と状態を提供する。UI接続は後続Story。

## Blocked

なし。外部World実機の未準備はローカル検証のブロッカーとしない。
