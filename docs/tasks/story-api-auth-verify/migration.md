---
id: task-api-auth-verify-migration
type: task
title: 既存データの移行と再承認を検証
story: story-api-auth-verify
status: done
blocked_by: []
---

# 既存データの移行と再承認を検証

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

開発者が既存DBの資産を維持して移行し、全APIの権限境界とデモの資金往復を再現する。

## 作業

- local-demo→worldと往復切替で旧セッション/credentialが復活せずデモ承認が再承認待ちになること、既存資産/World bindingを保持することを検証する。

- 主体未束縛の旧rule/grantを再承認待ちに移す。認証記録をinstance resetから隔離し、既存binding/資産/元本の本人償還を維持する。
- [Story](../../stories/epic-api-authorization/verify.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- コピーしたfixture DBで移行の再実行、未償還注文、旧approval、resetをテスト。実資産DBは変更しない。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## Blocked

なし。実機World/public/Geminiは本Taskの対象外。


## 検証結果

Unit/API 56件、Hardhat 1件、typecheck/buildとブラウザ検証を確認。API境界と旧DB移行を検査。実機World・public・Geminiはこの検証の対象外。
