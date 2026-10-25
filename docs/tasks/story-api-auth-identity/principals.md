---
id: task-api-auth-identity-principals
type: task
title: 主体別の認証基盤とAPIガード
story: story-api-auth-identity
status: done
blocked_by: []
---

# 主体別の認証基盤とAPIガード

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

固定デモ口座の本人がWorldでログインし、自分の銀行情報を閲覧する。内部Agentは別credentialで接続する。

## 作業

- authMode/認証世代をセッション・credentialへ保存し、モード切替で失効する。loopback起動制約と既定worldを検証する。

- Principal生成、hash付きセッション/credentialテーブル、Agent credentialの0600保管/更新、method/pathガードと401/403/404/409を実装。保護APIのキャッシュ共有を防ぎ、秘密値をログやモデルへ出さない。
- [Story](../../stories/epic-api-authorization/identity.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- 匿名/human/agentのAPI行列テスト、期限・失効・混在・偽装のunit/APIテストで拒否と副作用なしを確認。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

`tests/auth.test.ts`、`tests/world.test.ts`、TypeScript、production build --webpack、および実HTTP認証フロー成功。詳細はStoryのAC別記録を参照。World外部実機は未実施。

## Blocked

なし。

