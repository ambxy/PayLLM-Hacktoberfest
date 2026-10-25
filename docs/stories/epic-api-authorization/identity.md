---
id: story-api-auth-identity
type: story
title: 本人がログインし主体別APIを使う
epic: epic-api-authorization
status: done
depends_on: []
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# 本人がログインし主体別APIを使う

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

固定デモ口座の本人がWorldでログインし、自分の銀行情報を閲覧する。内部Agentは別credentialで接続する。

## 背景

[API権限分離Epic](../../epics/api-authorization.md)を構成する。ADR-0011と実装承認に従い認証境界を実装する。

### 含むもの

- 認証Principal/共通ガード/全ルート既定拒否、初回enrollment ticket、Worldログイン、セッション失効。
- Agent credentialのローカル発行/失効と秘密値保管、Cookie/CSRF/同一origin対策。

### 含まないもの

- 複数口座の登録、World binding復旧、モデル接続、権限変更UI。

## 受け入れ条件

World必須・失敗時拒否の条件はworldモードに適用する。local-demoの追加ACでは本人在席確認を省略するが、主体別API権限と銀行Policyを維持する。

### 正常系

- AC-1 [正常系]: Given 固定口座にWorld bindingがある / When 本人が新しいログインchallengeを検証 / Then 口座に紐づく30分のhumanセッションだけが発行され情報を閲覧できる。
- AC-2 [正常系]: Given 初回のローカル管理者発行ticketがある / When 利用者がticketとWorld検証を完了 / Then 一回だけ紐づけ、既存口座のbindingを置換しない。
- AC-3 [正常系]: Given 専用Agent credentialがある / When Agentが許可された入口へ要求 / Then agentとして識別されhumanセッションを必要とせず、未委任操作は拒否される。

- AC-7 [正常系]: Given local-demo起動でWorld未設定/未登録/検証失敗 / When 利用者がデモとして続ける / Then 固定口座のデモセッションを発行しWorld bindingとenrollment ticketなしで進める。

### 異常系

- AC-4 [異常系]: Given 匿名/偽role/不正credential/期限切れ/失効済み/別口座 / When 保護APIを呼ぶ / Then 401・403・404の契約どおり拒否し口座情報や副作用を返さない。
- AC-5 [異常系]: Given Agent credentialまたはCookieとBearer混在 / When human専用API、World完了、旧ルートを呼ぶ / Then 拒否し、Worldログイン証明をポリシー承認へ転用できない。
- AC-6 [異常系]: Given Originなし/不一致のCookie更新要求、replayしたticket、World無効 / When 認証/保護処理を要求 / Then fail closed。非ブラウザのAgent Bearer要求はOriginを認証代わりにせず別検証する。

- AC-8 [異常系]: Given world起動またはAgent credential / When demo-loginを呼ぶ / Then 拒否する。local-demo→world切替後は旧デモセッションを拒否する。

## アーキテクチャ制約

[ADR-0011](../../adr/0011-human-agent-api-authorization.md)、ADR-0010/0004、EpicのI1〜I8を適用する。API権限表と所有口座/Agentの境界を維持する。Node/SQLiteの同一プロセスをOS隔離と扱わない。World verifierのmockはテスト専用。runtimeのlocal-demoは別承認方法として検証する。publicはstub、TDは非fork Anvilで検証する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| task-api-auth-identity-principals | [主体別の認証基盤とAPIガード](../../tasks/story-api-auth-identity/principals.md) | done |
| task-api-auth-identity-login | [Worldログインと初回登録を接続](../../tasks/story-api-auth-identity/login.md) | done |

## 検証結果

- AC-1/2: auth.test.tsのticket＋World enrollment/loginテストで同一binding、別binding拒否、用途分離、ticket再利用拒否、並行verifyの1回成功を確認。外部verifierはテスト内fetch差替え。
- AC-3/4/5/6: API行列テストでhuman/agent/匿名、偽role、構造的に偽造したPrincipal、期限切れ、失効、Cookie/Bearer混在、未知method/path、Origin欠落/不一致を拒否。旧World enroll APIは閉鎖。業務scope判定は依存Storyのサービスへ接続する。
- AC-7/8: World disabledで明示デモログイン200、world/Agentでは403。モード往復、HTTPなしのstartup世代更新、期限切れCookieからログインへの復帰を検証。
- Node24 unit全体32件成功後、追加startup/Host回帰を含むauth7件成功。TypeScriptとNext production build --webpack成功。
- 実起動: loopback 127.0.0.1:28546、別DB、public stub/送信false。匿名dashboard401 → demo-login200 → session200 → dashboard200 → logout200 → 旧Cookie401をHTTPで確認。Nextのloopback URL正規化と外部Originの照合を回帰テスト化。
- World実機・public実送信は未実施。コントラクト変更なし。UI接続は後続Story。

## Blocked

なし。依存Storyの統合とEpic側レビューへ進む。
