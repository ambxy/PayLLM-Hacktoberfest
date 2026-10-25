---
id: story-api-auth-ui
type: story
title: 利用者が会話から承認・停止する
epic: epic-api-authorization
status: done
depends_on: [story-api-auth-approval, story-api-auth-agent]
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# 利用者が会話から承認・停止する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

利用者がAgentの提案にOKと答え、銀行の条件カードを確認してWorld認証し、その後の自動実行を確認する。

## 背景

[API権限分離Epic](../../epics/api-authorization.md)を構成する。承認済みADRに従い実装する。

### 含むもの

- 登録/ログイン、チャット/ルール/メール許可のWorld承認導線、状態表示、停止/取消。
- 既存画面とAPIの接続変更、Agent credentialの非露出、本人発話の保存経路整理。

### 含まないもの

- 画面デザインの全面変更、自由文理解モデルの実接続、全送金への都度World承認。

## 受け入れ条件

World必須・失敗時拒否の条件はworldモードに適用する。local-demoの追加ACでは本人在席確認を省略するが、主体別API権限と銀行Policyを維持する。

### 正常系

- AC-1 [正常系]: Given 本人ログインとAgentの提案 / When 利用者がOKしWorldを完了 / Then 対象Agent・支払先・額・運用先・閲覧範囲を表示した内容だけが有効になる。
- AC-2 [正常系]: Given 承認済みルール / When 期日/余力イベントを実行 / Then 毎回Worldを要求せず銀行側検証で処理され履歴に結果が出る。
- AC-3 [正常系]: Given 有効委任 / When 利用者が停止する / Then 停止を画面に反映しAgentの次の操作が拒否される。

- AC-7 [正常系]: Given local-demoでWorld未設定/失敗/タイムアウト/取消 / When 利用者が「デモとして続ける」を選ぶ / Then 条件を確認して次へ進め、デモ表示と承認方法を履歴に残す。

### 異常系

- AC-4 [異常系]: Given World取消/失敗/期限切れ/条件競合 / When 承認画面を閉じるまたは再試行 / Then 未反映を示し、必要なら新提案で確認する。
- AC-5 [異常系]: Given セッション切れ/World未設定/Agentからの偽のOK / When 画面操作またはchat呼出し / Then 認証/設定案内または拒否となり既存の無認証更新へ戻らない。
- AC-6 [異常系]: Given ブラウザレスポンス/ストレージ/モデル入出力を観測 / When 通し操作 / Then Agent credential・本人Cookie値・汎用承認tokenは露出しない。

- AC-8 [異常系]: Given worldモード / When 同じ画面を表示またはデモAPIへ直アクセス / Then デモ継続ボタンを提供せずAPIでも拒否する。

## アーキテクチャ制約

[ADR-0011](../../adr/0011-human-agent-api-authorization.md)、ADR-0010/0004、EpicのI1〜I8を適用する。API権限表と所有口座/Agentの境界を維持する。Node/SQLiteの同一プロセスをOS隔離と扱わない。World verifierのmockはテスト専用。runtimeのlocal-demoは別承認方法として検証する。publicはstub、TDは非fork Anvilで検証する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| task-api-auth-ui-flow | [会話とWorld承認画面を接続](../../tasks/story-api-auth-ui/flow.md) | done |
| task-api-auth-ui-browser | [承認と自動実行のブラウザ検証](../../tasks/story-api-auth-ui/browser.md) | done |

## Blocked

なし。実機Worldとpublic送信は計画どおり未実施。
