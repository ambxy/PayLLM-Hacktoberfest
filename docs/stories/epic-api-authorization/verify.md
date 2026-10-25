---
id: story-api-auth-verify
type: story
title: 開発者が権限境界と既存資産の継続利用を確認する
epic: epic-api-authorization
status: done
depends_on: [story-api-auth-ui]
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# 開発者が権限境界と既存資産の継続利用を確認する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

開発者が既存DBの資産を維持して移行し、全APIの権限境界とデモの資金往復を再現する。

## 背景

[API権限分離Epic](../../epics/api-authorization.md)を構成する。

### 含むもの

- 既存ルール/grantの再承認待ち移行、失効/World記録のreset耐性、全API/内部入口の監査。
- ローカル検証の記録、既存World設定手順更新と実機チェック項目。

### 含まないもの

- 実資金送信、World本人操作の代行、Geminiの品質評価、World binding復旧。

## 受け入れ条件

World必須・失敗時拒否の条件はworldモードに適用する。local-demoの追加ACでは本人在席確認を省略するが、主体別API権限と銀行Policyを維持する。

### 正常系

- AC-1 [正常系]: Given 既存DB/World binding/未償還注文のコピー / When 移行し本人ログイン / Then 資産と履歴を保持し新規運用は再承認待ち、本人の全額償還は可能。
- AC-2 [正常系]: Given 新規テストDBとAnvil / When 初回登録から支払い/運用/償還を実行 / Then ルール・主体・承認・transactionの関連を追跡できる。
- AC-5 [正常系]: Given World実機未準備 / When ローカル監査を完了 / Then mockで検証した項目と実機未実施を明記し実機成立とは記載しない。

- AC-6 [正常系]: Given local-demoとWorld設定なし / When 初期化から承認・支払い・運用・償還 / Then 完了でき、World実機成立とは記録しない。

### 異常系

- AC-3 [異常系]: Given World無効/旧ルート/デモreset/他口座/Agentからhuman API/競合/replay / When 一覧の全method/pathを検証 / Then 承認と認証の迂回は起きず資金副作用がない。
- AC-4 [異常系]: Given 途中停止のlock/未確定public step / When resetや再試行 / Then 既存保護を維持し二重送信や未返却のTD解除を起こさない。

- AC-7 [異常系]: Given デモの既存セッション/credential/ルール / When worldへ切替、さらにモードを往復 / Then 古い認証は復活せず、デモルールはWorld再承認待ち、資産と履歴は保持される。

## アーキテクチャ制約

[ADR-0011](../../adr/0011-human-agent-api-authorization.md)、ADR-0010/0004、EpicのI1〜I8を適用する。API権限表と所有口座/Agentの境界を維持する。Node/SQLiteの同一プロセスをOS隔離と扱わない。World verifierのmockはテスト専用。runtimeのlocal-demoは別承認方法として検証する。publicはstub、TDは非fork Anvilで検証する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| task-api-auth-verify-migration | [既存データの移行と再承認を検証](../../tasks/story-api-auth-verify/migration.md) | done |
| task-api-auth-verify-audit | [全入口の監査と通し検証を記録](../../tasks/story-api-auth-verify/audit.md) | done |

## 検証結果

- AC-1/7: `tests/integration/auth-migration.ts`でlegacy fixture DBコピーを使用。旧ルールは再承認待ちとして新規運用を拒否、Worldへの切替/往復で旧credential/requestは復活しない。新しい本人World mockログインの限定requestで元本を1回だけ償還。元のDB・World binding・過去receiptを保持。
- AC-2/6: 実Anvilの支払い/lock/releaseとpublic stubで資金往復。UIで16種類の操作を確認。Worldなしの明示デモ承認で進行し、World成功とは区別。
- AC-3: `tests/api-boundary.test.ts`で実routeを列挙し全保護methodの匿名401/逆role403を確認。auth/World/AgentテストでCSRF、replay、期限切れ、条件変更、旧経路、任意calldata等を拒否。
- AC-4: lock後取消で次段public前に停止、lockを保持。取消後も送信済みreceiptを追跡。未償還/active runがあるresetを拒否。
- AC-5: World実機、Gemini、public実送信は未実施。通常worldモードとlocal-demoの切替手順を既存World設定・READMEへ反映。
- 最終統合時Unit/API 56/56、typecheck、webpack production build成功。Hardhat 1/1成功。詳細コマンド/外部境界/修正指摘はAuditに記録。

## Blocked

なし。World実機は計画どおり後段。
