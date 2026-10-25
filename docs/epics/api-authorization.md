---
id: epic-api-authorization
type: epic
title: 利用者とAgentのAPI権限を分離しWorldで変更を承認する
status: review
adrs: [adr-0011, adr-0010, adr-0004-rules-intents]
---

# 利用者とAgentのAPI権限を分離しWorldで変更を承認する

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## 背景

AgentをGeminiへ差し替える前に、銀行APIへの依頼権限と利用者の権限付与を分ける。現行のlocalhost/Origin検査は認証ではなく、chat内部でのaccept/grant/redeem呼出しも認可境界の対象となる。

銀行を資金操作主体とし、APIの主体分離と具体的な操作への承認を実装する。[ADR-0011](../adr/0011-human-agent-api-authorization.md)にworld/local-demoの境界を定める。

## ゴール

利用者がAgentの具体的な権限提案を承認すると、その範囲だけでAgentが銀行APIに支払い/運用を依頼できる。Agent credentialでは権限付与・本人発話の偽造・任意のチェーン操作を許可しない。local-demoは人間の在席を証明しない。

### 含むもの

- 固定デモ口座・内部Agent 1体の別認証、全既存APIのmethod/path別認可、内部呼出しの認可。
- Worldによる初回紐づけ/ログイン、変更内容に紐づく一回承認、メール閲覧grantを含む委任。
- 当面のlocal-demoでWorld未設定/失敗/取消時も明示的に継続する経路と、worldへ戻す際の失効・再承認。
- チャット/ルール画面の承認UI、失効/停止、現在の有効条件表示。
- Agent専用業務API、送信直前の権限再照合、移行、監査ログ、正常系と権限拒否系の検証。

### 含まないもの

- Gemini/Vertex AIの接続、実メール連携、動的な複数Agent/顧客登録、World binding復旧、公開サービス化。
- コントラクト改修、KMS/HSM、別プロセスへの署名隔離、障害時の資産補償/自動復旧。
- public実送信、Faucet、本番デプロイ。World実機は別の証拠として後段に残す。

### コンポーネントと責務

認証サービスがhuman/agent Principalを生成し、認可サービスがscope・所有口座・対象操作を検証する。Worldサービスが本人再確認と変更の承認/一回消費を行う。業務サービスがルール/残高等を再検証し銀行署名処理を呼ぶ。tool runnerはAgent credentialだけを付与し、ブラウザの認証情報を継承しない。

### データフロー

利用者ログイン → Agentの変更案 → 利用者のOKで承認画面 → 銀行が正規化した条件を表示 → World検証 → 銀行が条件再照合/消費/保存 → Agentの業務依頼 → scope/ルール/残高検証 → 銀行署名 → receipt記録。

セッション、Agent credential hash、委任、approval、認可判定をSQLiteへ保存。TD残高は引き続きAnvil。public確定証拠は既存adapterが照合する。承認、口座所有権、秘密値の正本をLLMの履歴へ置かない。

### On-chain / Off-chain境界

今回の変更はoff-chainのAPIと業務境界。銀行だけがprivate TDとpublic USDC/Aaveを操作する。既存契約の銀行専用入口・重複防止を維持する。

### 認証・権限・秘密情報

詳細はADR-0011。利用者セッション30分、World操作challenge5分、Agent credential24時間。World登録/ログインとポリシー承認を用途分離する。銀行署名鍵とAgent認証情報はモデルへ渡さない。worldではWorldなしに保護APIを開放しない。当面は起動時にBANK_AUTH_MODE=local-demoを明示設定し、画面からデモセッション/デモ承認で継続できる。デモ承認をWorld成功に偽装せず、外部verifierのmockはテスト専用。

### API権限表

Worldが必要と記載した行はworldモードの契約。local-demoの例外は下記の専用APIとADR-0011に限定する。以下は実装後の契約。旧ルートを残す場合も同じ制限を適用し、未分類ルートは拒否する。URLの命名だけで認可せずmethodごとにサーバーで判定する。

| Method / API | 利用者 | Agent | 制約・移行 |
| --- | --- | --- | --- |
| GET `/api/auth/session` | 未ログイン可 | 自身の認証状態のみ | authenticated/authMode/roleだけを返す。秘密値・口座情報なし |
| GET `/api/world` | 未ログイン可 | 公開状態のみ | configured/enrolled等の最小状態のみ。口座情報/session IDは返さない |
| POST `/api/auth/enroll/*` | enrollment ticket＋World | 不可 | 初回だけ。管理CLIでticket発行、置換不可 |
| POST `/api/auth/login/*` | 対象口座のWorld再確認 | 不可 | 短命challengeから本人Cookieを発行。challenge開始自体は未ログイン可 |
| POST `/api/auth/logout` | 本人 | 不可 | 現セッション失効 |
| POST `/api/auth/demo-login` | デモ開始の明示操作 | 不可 | local-demo＋loopback起動のみ。固定口座のデモセッションを発行し、World bindingは作らない |
| POST `/api/demo/approvals` | デモセッション＋具体条件への確認 | 不可 | local-demoのみ。World challengeを終了して別デモchallengeを一回消費。条件/版/期限は再検証 |
| POST `/api/world` | 本人 | 不可 | 既存begin/verify/cancelを用途別認可。検証成功時に対象変更を一括反映 |
| GET `/api/ai`, `/api/dashboard`, `/api/investments`, `/api/invoices`, `/api/cashflow`, `/api/rules`, `/api/runs/:id` | 自口座 | 直接不可 | Agent向け情報は専用read APIへ限定 |
| GET/POST `/api/chat/messages` | 自口座 | 不可 | 本人発話の保存。OKはWorld画面への遷移。モデルはuser messageを作れない |
| PATCH `/api/rules` | 旧経路は拒否 | 不可 | 変更案は `/api/world` またはデモ承認のbeginへ送る。直接保存不可。停止は下記専用API |
| POST `/api/rules/:id/disable` | 本人 | 不可 | 権限縮小だけ。再有効化はWorld承認が必要 |
| GET `/api/delegations` | 自口座 | 不可 | 委任と承認方法・再承認状態の一覧 |
| POST `/api/delegations/proposals` | 本人 | 不可 | grant/scopeの変更案。Agentからは専用proposal APIを使う |
| POST `/api/delegations/:id/revoke` | 本人 | 不可 | メール/資金操作scopeを停止。World不要、復旧/再付与はWorld |
| POST `/api/demo/events` | 本人 | 不可 | 既存デモ時計/イベント再現。資金操作は同じ銀行側検証を適用 |
| POST `/api/demo/reset` | 本人 | 不可 | 初期化/リセット。未償還/未確定取引の既存拒否を維持。World/失効記録は消さない |
| POST `/api/redemptions` | 本人の償還依頼だけ | 不可 | 生のmessageIdによる直接実行を廃止。一回限りrequest IDを銀行で生成 |
| POST `/api/agent/read` | 不可 | read scope | balance/invoices/cashflow/rules/runの列挙した操作。口座はcredentialから確定。メール資料はgrant範囲のみ |
| POST `/api/agent/proposals` | 不可 | propose scope | 条件schema/根拠IDを検証してdraft作成。承認・user message生成不可 |
| POST `/api/agent/payments` | 不可 | payment scope＋有効ルール | invoice ID/request ID。銀行が相手先/金額/期日/月次上限を照合 |
| POST `/api/agent/investments` | 不可 | investment scope＋有効ルール | request ID。銀行が最新余力/上限/換算を計算 |
| POST `/api/agent/redemptions` | 不可 | 本人requestに限定した償還scope | 銀行発行request ID/所有者/対象元本/発行元credentialを照合。旧grantや運用ルール停止と独立 |
| 署名、任意calldata送信、mint、custody鍵取得 | 公開APIなし | 公開APIなし | 銀行内部/ローカル運用CLIのみ |

scope付与はworldではWorld、local-demoでは明示的デモ承認で行い、適用モードを記録する。Agent credential作成だけでは個人情報read/資金操作scopeを持たせない。提案機能も自口座の許可済み情報だけを参照する。ブラウザがAgent用APIを呼ぶために秘密値を取得する設計にしない。

### Storyをまたぐ不変条件

- I1: Agent credentialでhumanの権限や承認を生成/転用できない。actorはモデル入力/HTTP任意値から決めない。local-demoの本人在席確認省略はADRに明記した例外。
- I2: 固定条件＋有効期限＋未使用＋所有者一致に加え、worldではWorldでの人間であることの確認、local-demoでは利用者の明示的デモ承認を要求し原子的に適用する。
- I3: grant/ルール/最新残高を銀行が検証し、Agent署名だけで送信しない。
- I4: 同じID、同じ承認、同じ請求書、同じ償還を繰り返しても二重適用/送信しない。
- I5: 取消・停止後に新しい送信を始めない。送信済みは追跡し、途中停止のlockを自動解除しない。
- I6: メール・モデル出力は本人発話/承認にならず、情報アクセスにも委任範囲を適用する。
- I7: 全API/ページ/内部呼出しを検証し、worldでWorld無効・demo reset・旧ルート・デモAPIから迂回しない。local-demo例外は起動設定で限定し、切替時にデモ承認をWorld承認へ昇格させない。
- I8: 資産/World binding/監査履歴を移行で失わず、未償還分の本人償還を保つ。

## Story

| ID | Story | Depends on | Status |
| --- | --- | --- | --- |
| story-api-auth-identity | [本人がログインし主体別APIを使う](../stories/epic-api-authorization/identity.md) | なし | done |
| story-api-auth-approval | [本人がWorldでAgentへの委任を承認する](../stories/epic-api-authorization/approval.md) | story-api-auth-identity | done |
| story-api-auth-agent | [Agentが許可範囲内で銀行に依頼する](../stories/epic-api-authorization/agent.md) | story-api-auth-identity | done |
| story-api-auth-ui | [利用者が会話から承認・停止する](../stories/epic-api-authorization/ui.md) | story-api-auth-approval, story-api-auth-agent | done |
| story-api-auth-verify | [開発者が権限境界と既存資産の継続利用を確認する](../stories/epic-api-authorization/verify.md) | story-api-auth-ui | done |

## 依存グラフ

Layer 1: identity → Layer 2: approval / agent → Layer 3: ui → Layer 4: verify。

Layer 2の仕様はADRで共有し、API統合はui/verifyで確認する。

## 成功条件

worldで本人のWorld承認を経て設定した条件内で、AgentがTD支払い・lock・stub運用・償還を依頼できる。local-demoではWorldが通らなくても利用者の明示的デモ承認で同じ業務フローを完了でき、承認方法を区別して表示・記録する。Agentによる承認/権限拡大、Cookieの代用、未知の口座、replay、旧APIによる迂回が拒否される。正常系だけでなく権限違反と競合は本Epicの必須ACであり、初期Epicの異常系延期を継承しない。

## 検証範囲

- unit/API: hash/TTL/失効/所有者、全method/pathの匿名/human/agent行列、Worldのbinding/nonce/signal/一回消費、原子的適用、送信直前の停止、認可エラーの副作用なし。
- UI/E2E: 実アプリ＋非fork Anvil 31337、AI/publicはstub。worldは外部検証をテストプロセスでmockし、local-demoはWorld設定なしと検証失敗/タイムアウト/取消後の明示継続を確認する。両モードでログイン→提案→OK→承認→支払い→運用→償還を確認し、切替後の認証失効/再承認も検証する。
- 実機World: App/RP設定と本人のWorld Appが揃った後、本人が操作して確認する。別人/取消/期限切れ/承認内容の表示を確認する。未実施のまま実機成立と記載しない。
- Gemini接続やpublic実送信の成功を本Epicの完了条件にしない。既存送信adapterの認可前後はmock/ローカル証拠で区別する。
