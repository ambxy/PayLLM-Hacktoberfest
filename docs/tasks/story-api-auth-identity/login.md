---
id: task-api-auth-identity-login
type: task
title: Worldログインと初回登録を接続
story: story-api-auth-identity
status: done
blocked_by: [task-api-auth-identity-principals]
---

# Worldログインと初回登録を接続

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

固定デモ口座の本人がWorldでログインし、自分の銀行情報を閲覧する。内部Agentは別credentialで接続する。

## 作業

- local-demo専用の明示的demo-loginを追加し、World未設定/未登録/失敗でもticketなしで固定口座へ進める。worldとAgent credentialでは拒否する。

- 既存World adapterへ用途分離したログインchallengeを接続。初回ticket CLI、本人Cookie、CSRF/Origin、logout、公開status最小化を実装。
- [Story](../../stories/epic-api-authorization/identity.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- テストverifierで同一/別World binding、nonce、期限、並行verify、ticketの再利用、disabledで拒否を確認。World verifierのruntime成功mockは作らず、デモ継続は別経路とする。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

`tests/auth.test.ts`、`tests/world.test.ts`、TypeScript、production build --webpack、および実HTTP認証フロー成功。詳細はStoryのAC別記録を参照。World外部実機は未実施。

## Blocked

なし。

