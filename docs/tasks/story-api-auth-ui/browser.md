---
id: task-api-auth-ui-browser
type: task
title: 承認と自動実行のブラウザ検証
story: story-api-auth-ui
status: done
blocked_by: [task-api-auth-ui-flow]
---

# 承認と自動実行のブラウザ検証

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## 目的

利用者がAgentの提案にOKと答え、銀行の条件カードを確認してWorld認証し、その後の自動実行を確認する。

## 作業

- local-demoで設定なしから最後まで進めることとWorld失敗後の継続、worldで同じAPIが拒否されることを確認する。

- テストプロセスで外部verifierを差し替えたPlaywrightを用意し、登録/ログイン/承認/停止/取消/償還のフローを検証。
- [Story](../../stories/epic-api-authorization/ui.md)のACと[ADR-0011](../../adr/0011-human-agent-api-authorization.md)の対象条件を実装へ対応付ける。

## 完了条件

- 上記作業が対象ACの観測可能な動作として成立し、許可と拒否の証拠を記録する。
- 秘密値・資産・World bindingを漏えい/破棄せず、担当箇所の異常系でも未認可の副作用を起こさない。

## 検証方法

- Anvil＋stubでUIの条件表示・残高・履歴と拒否状態を確認し、ネットワーク応答とストレージに秘密値がないことを記録。
- 変更した責務の検証結果を本TaskとStoryへ記録する。外部実機/public実送信の未実施をローカル成功と区別する。

## 検証結果

Storyの検証結果を参照。ログイン/承認/取消/停止/失効の実ブラウザ検証と、型検査・build・format・planningが成功。World begin失敗から明示デモ承認へ継続でき、取消challengeの再confirmは409。実機World/publicは未実施。

## Blocked

なし。

