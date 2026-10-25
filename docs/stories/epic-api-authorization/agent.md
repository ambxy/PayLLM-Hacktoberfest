---
id: story-api-auth-agent
type: story
title: Agentが許可範囲内で銀行に依頼する
epic: epic-api-authorization
status: done
depends_on: [story-api-auth-identity]
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# Agentが許可範囲内で銀行に依頼する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../../roadmap.md)を参照してください。

## ユーザーアクション

Agentが許可済み情報を読み、支払い・余剰運用・本人依頼の全額償還を銀行APIへ依頼する。

## 背景

[API権限分離Epic](../../epics/api-authorization.md)を構成する。

### 含むもの

- 専用read/proposals/payments/investments/redemptions APIと固定scope、署名Intentの主体束縛。
- チャット内の内部呼出しにもPrincipalを適用し、全送信前に権限を確認。

### 含まないもの

- Gemini SDK、汎用送信/署名、銀行鍵アクセス、同一OSプロセス侵害への隔離。

## 受け入れ条件

World必須・失敗時拒否の条件はworldモードに適用する。local-demoの追加ACでは本人在席確認を省略するが、主体別API権限と銀行Policyを維持する。

### 正常系

- AC-1 [正常系]: Given World承認済み委任と銀行計算に合う依頼 / When Agentが専用APIを呼ぶ / Then private支払い/lockとstub運用/償還が銀行サービスを通り実行される。
- AC-2 [正常系]: Given 運用ルール停止中で本人の全額償還依頼と有効な償還scopeがある / When Agentが対象request IDを提出 / Then 元本と返却証拠を照合して本人へTDを返す。

- AC-7 [正常系]: Given local-demoで明示承認した有効scopeとルール / When Agentが銀行APIを呼ぶ / Then 同じ銀行Policy検証を通して処理できる。

### 異常系

- AC-3 [異常系]: Given 未許可メール、未知の受取先、上限超過、他口座/他AgentのID、偽の償還依頼 / When Agentが読み取り/実行 / Then データ漏えいと資金移転を起こさず拒否する。
- AC-4 [異常系]: Given ルール/委任を検証後に停止、credential期限切れ、同時実行 / When 次のtransaction送信を開始 / Then 最新権限を確認し停止・二重送信を防ぐ。送信済みreceiptは追跡する。
- AC-5 [異常系]: Given TD lock後に権限取消 / When 未送信public処理へ進む / Then needs_attentionで停止し、USDC未返却のTDを解除しない。
- AC-6 [異常系]: Given モデルがuser role/approvalId/宛先calldata/任意RPCを指定 / When tool runnerが銀行を呼ぶ / Then schema/認可で拒否し本人権限を継承しない。

- AC-8 [異常系]: Given worldへ切替後のデモcredential/承認 / When Agentが実行 / Then 拒否してWorld再承認を要求し、デモ成功をWorld成功扱いしない。

## アーキテクチャ制約

[ADR-0011](../../adr/0011-human-agent-api-authorization.md)、ADR-0010/0004、EpicのI1〜I8を適用する。API権限表と所有口座/Agentの境界を維持する。Node/SQLiteの同一プロセスをOS隔離と扱わない。World verifierのmockはテスト専用。runtimeのlocal-demoは別承認方法として検証する。publicはstub、TDは非fork Anvilで検証する。

## Task

| ID | Task | Status |
| --- | --- | --- |
| task-api-auth-agent-tools | [Agent専用APIと認可付きサービスを実装](../../tasks/story-api-auth-agent/tools.md) | done |
| task-api-auth-agent-execution | [銀行の送信直前検証と償還依頼を束縛](../../tasks/story-api-auth-agent/execution.md) | done |

## 検証結果

隔離DB・非fork Anvil `127.0.0.1:28545` で検証。AI/publicはstub、World verifierはテスト用HTTP mock、World実機・public実送信・本番鍵分離は未実施。

- AC-1: `tests/integration/world-gateway.ts`。World mock承認→実Anvil支払い→最低残高に従うTD lockとpublic stub運用。自動実行で再度Worldを要求しない。
- AC-2: `tests/integration/agent-authorization.ts`。運用停止後、本人の銀行発行requestで凍結済み注文の元本を返却。償還の認可根拠はrequest自体に限定し、旧/取消済みの運用scopeを復活させない。発行元本人credentialも各stageで検証する。
- AC-3/6: `tests/agent-authorization.test.ts`。未委任・偽Principal・人間credentialでAgent API・未許可メール・Intentの主体/金額/宛先改変・raw message償還・任意calldataを拒否。実行記録/clock変更より前に拒否する。
- AC-4: 上記unitと`tests/integration/public-stage-authorization.ts`。取消を直列化し、cached run返却より前にも認可。publicのtransfer/approve/supply/withdraw/return各stageは送信直前に最新権限を再検証。送信済みreceiptは取消後も確定追跡。
- AC-5: Anvil integrationでTD lock送信直後に委任取消をqueue。public stub供給を拒否し、TD40万円のlockを維持、public持分0、needs_attention。
- AC-7: Anvil integrationでlocal-demoの明示承認→メール→20万円支払い→40万円運用→全額償還。未償還stub lockがあるresetも拒否。
- AC-8: unitでworldへのmode切替後のdemo credential/承認拒否。

実行コマンド（Node24をPATHに設定）:

```sh
node --conditions=react-server --import tsx --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
ANVIL_RPC_URL=http://127.0.0.1:28545 node --conditions=react-server --import tsx tests/integration/agent-authorization.ts
ANVIL_RPC_URL=http://127.0.0.1:28545 node --conditions=react-server --import tsx tests/integration/world-gateway.ts
node --experimental-test-module-mocks --conditions=react-server --import tsx tests/integration/public-stage-authorization.ts
git diff --check
```

公開APIはstrict schema。Agent readはbalance/invoices/cashflow/rules/runのresource enumに限定し、残高・資金計算のRPC待ち後もscope再検査、メール由来情報は現在のmail許可を確認する。内部runnerはserver credentialのみ使い、human Cookieを継承しない。チャットは承認requestを返し、実際の承認・反映は本人APIに限定。画面接続と通しブラウザ確認は後続UI Story。

## Blocked

なし。外部World実機の未準備はローカル検証のブロッカーとしない。
