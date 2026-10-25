# Agent Bank

請求書の確認、自動支払いルールの設定、余剰資金の運用を体験するローカルデモです。人間が条件を承認し、Agentがその条件内で操作を依頼し、銀行側が権限と金額を検証します。

Next.js・TypeScript・SQLite・Hardhat/Solidityを使用します。TDは非forkローカルAnvil上で扱い、1 TDを1円として表示します。メール・請求書は架空サンプルです。AIはstubとGemini、運用はstubとBase SepoliaのAave疑似USDCに対応しています。疑似USDCはCircle USDCとは異なるテスト用tokenです。

このアプリは固定のデモ口座・単一Nodeプロセス・localhost向けです。公開サービスや実資産の銀行として運用するための実装ではありません。

## ETHGlobal Tokyo 2026 submission

### Summary

Agent Bank lets people delegate payments and fund management from their bank deposits to an AI agent, while humans set the rules and the bank verifies every action against them.

Live demo: https://agent-bank-demo.barabara0224.workers.dev (each visitor gets a disposable sandbox with stub assets)

### Team

We are Pacific Meta. We support banks and crypto exchanges in building new businesses and services.

| Name | Role | Social |
|---|---|---|
| Takuma Abe | Developer | [@takupesoo](https://x.com/takupesoo) |
| Toi Kobara | Developer | [@brto_0224](https://x.com/brto_0224) |
| Go Fukushima | Speaker | [@PacificMeta_Go](https://x.com/PacificMeta_Go) |

### How it works

1. The customer deposits funds as tokenized deposits (TD) on a private chain (local Anvil in this demo).
2. The customer verifies with World and approves rules for payments and investments.
3. The agent reads invoices and card statements, then plans payments and investments.
4. The bank's policy engine checks the approved rules and the balance before each execution.
5. Payments settle in TD. Funds for investment are exchanged for stablecoins and supplied to DeFi (Aave stub, or Aave on Base Sepolia with test USDC).

Model output alone never adds permissions. Human approval, agent delegation, and bank-side verification are separate steps.

### World integration

- **IDKit**: login and rule approval use `IDKitSessionWidget` with an Orb proof (`proof_of_human`). The bank checks nonce, signal, session ID, and environment, verifies the proof with the Developer Portal, and rejects reused proofs.
- **World ID for Agents**: `/world-agents` connects an external agent (for example, Claude through the MCP server) to the account using the official event OIDC sandbox. The customer reviews the agent name, account, allowed operations, and expiry, then verifies with World. Only after successful verification does the bank issue a scoped credential once.
- **Backend validation**: Code + S256 PKCE, state, nonce, RS256 signature, issuer, audience, expiry, acr/amr, and auth_time are checked on the server. The client secret stays in Worker secrets.
- **Unsuccessful paths**: cancellation, expiry, or failed validation never issues a credential. Requests without a valid credential return 401. Revoked or expired connections stop working.

Details: [docs/world-setup.md](docs/world-setup.md)

### World integration debrief

- **Time to first success**: About 8 hours to the first successful IDKit verification.
- **Friction**: Our first attempt used Selfie Check, and verification kept failing. We could not identify the cause, and switching to an Orb proof (`proof_of_human`) worked. The World ID for Agents OIDC flow must also start and return on the same HTTPS origin, so we could not test it end to end from localhost.
- **Missing capability or documentation**: Error codes were hard to map to a cause and a fix. It would also help to state clearly which credentials and features are not yet available in beta.
- **Most impactful improvement**: Error responses that explain the cause and the next step, such as "this credential is not available in this environment", would have saved us most of the debugging time.

### MultiBaas

We did not use MultiBaas in this project.

### Setup and testing

Requirements: Node.js 24, pnpm, Anvil (Foundry), Python 3, and C/C++ build tools.

```sh
pnpm install --frozen-lockfile
pnpm setup:env stub
pnpm contracts:build
pnpm db:migrate
pnpm auth agent
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --state .data/anvil.json   # terminal 1
pnpm dev                                                                         # terminal 2
```

Open http://127.0.0.1:3000 and continue with the local demo.

```sh
pnpm test
pnpm contracts:test
pnpm typecheck
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

The Japanese sections below describe the demo steps, Base Sepolia, and deployment in detail.

## ローカルデモを起動する

Node.js 24、pnpm（`package.json`指定版）、Anvil、Python 3、C/C++ビルドツールが必要です。AnvilはFoundryに含まれます。macOSではXcode Command Line Toolsを利用できます。

```sh
git clone git@github.com:takupeso/agent-bank.git
cd agent-bank
pnpm install --frozen-lockfile
pnpm setup:env stub
pnpm contracts:build
pnpm db:migrate
pnpm auth agent
```

`setup:env`は`.env.local`にランダムなカストディ暗号化鍵を生成します。既存ファイルは上書きしません。`auth agent`はAgent credentialを`.data/agent-credential`へ保存し、値を標準出力には表示しません。credentialの発行だけでメール閲覧や資金操作が許可されることはありません。

ターミナル1でAnvilを起動します。

```sh
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --state .data/anvil.json
```

ターミナル2でアプリを起動します。

```sh
pnpm dev
```

http://127.0.0.1:3000 を開き、ローカルデモでの継続を選んでログインし、「デモを初期化」を押します。`pnpm dev`と`pnpm start`はloopbackへバインドする専用起動スクリプトを使います。

1. Homeの「Initialize demo」で初期化する。
2. 右下の丸いボタンを開いて「Grant card & invoice access」を押す。カード支払い情報と請求書情報へのアクセス許可を本人のチャットとして送信する。
3. AIが支払い先・金額・期日と預金全額の運用計画を提示する。「Chat」を押すか、チャットで「Yes」と返答すると支払い予定を登録し、運用を開始する。Worldモードでは既存のWorld確認も行う。
4. 「Change date」で最初の支払前日・各支払日へ順に進める。前日は運用を継続し、10/1・10/10・10/20の期日に必要額を預金へ戻して支払う。同じ日付で再実行しても二重払いしない。
5. Paymentsで支払い結果を確認する。残りの資金は運用を続ける。リセット前にはチャットで「Redeem all investments to TD」と依頼する。

カード情報はHarp Business Cardの架空サンプルで、実際のカード会社には接続しない。日付変更は銀行デモ内の時刻にのみ適用し、OSやpublic chainの時刻・利息を進めない。メールだけの確認や従来の余剰資金運用はチャットへの入力で利用できる。

デモ承認はWorldでの人間であることの確認や、銀行の本人確認を意味しません。デモログイン・承認でpublic送信スイッチが有効になることはありません。

再起動時は`.env.local`、SQLite、Anvil stateを保持してください。暗号化鍵を失うと保存済みウォレットを復元できません。データを初期化し直す場合も、運用中の元本を先に償還してください。

## Base Sepoliaでの運用

外部テストネットを使う場合は、新しい環境で`pnpm setup:env base-sepolia`を実行します。stubとテストネットのDBは分けてください。共有ウォレットの鍵は同梱していません。

```sh
pnpm sepolia wallets
pnpm sepolia status
```

銀行・顧客のウォレットは各環境で生成して暗号化保存します。既存のテスト専用ウォレットを取り込む場合だけ、`.env.local`の`DEMO_BANK_PRIVATE_KEY`・`DEMO_CUSTOMER_PRIVATE_KEY`へ設定してください。メインネット用の鍵を使用しないでください。

表示された自分の銀行アドレスへBase Sepolia ETHを用意します。`status`で在庫・gas・Faucet制限を確認し、必要分だけ準備します。

```sh
# 事前シミュレーション
pnpm sepolia mint 10000
pnpm sepolia fund 0.002

# 内容を確認した場合だけ実送信
pnpm sepolia mint 10000 --send
pnpm sepolia fund 0.002 --send
```

アプリの実送信は`PUBLIC_TRANSACTIONS_ENABLED=true`を明示した場合のみ有効です。既定はfalseです。`ten-usdc`プロファイルは10 USDC、従来の余剰資金運用は2,500 USDCを上限に運用します。短いデモの全額運用（預金100万円）には銀行在庫6,250疑似USDCが必要です。在庫不足で送信前に失敗した場合、在庫補充後に同じ計画へ「Yes」と返すと再試行できます。固定換算は1 USDC＝160円です。運用中はDB・Anvil state・鍵を一緒に保持し、全額償還後に実送信を無効にしてください。

## 公開デモ（Cloudflare Containers）

ETHGlobal等で誰でも触れるデモとして、Cloudflare Containersへデプロイできます。訪問者ごとに使い捨てのコンテナ（アプリ＋ローカルAnvil＋SQLite、資産はstub）を割り当て、他の訪問者と状態を共有しません。コンテナは2時間操作がないと停止し、状態は破棄されます。

```sh
pnpm exec wrangler login
pnpm cf:deploy
```

Docker（Rancher Desktop等）とWorkers Paidプランが必要です。`/new-sandbox`を開くと新しいサンドボックスに切り替わります。

- コンテナ内でアプリはloopbackにバインドしたままです。`deploy/cloudflare/proxy.mjs`が同一オリジンのリクエストだけをloopbackとして中継します。架空資産のみを扱う隔離サンドボックスであることが前提です。
- 設定は`wrangler.jsonc`の`vars`、キーはWorker secretで渡します。secretは`pnpm exec wrangler secret put GEMINI_API_KEY`（`WORLD_RP_SIGNING_KEY`も同様）で登録します。値の入力が必要なため、対話できるターミナルで実行してください（入力できない環境では空の値が登録されます）。`AI_MODE=gemini`か`WORLD_MODE=live`のときだけコンテナの外部通信を有効にします。
- 公開デモは`BANK_AUTH_MODE=world`です。サンドボックスでは最初のWorldログインで口座にsession IDを紐づけます（`WORLD_ENROLL_WITHOUT_TICKET=true`、イメージで有効）。デモログインにする場合は`local-demo`を指定します。localhostでも同じ設定を使えます。後のログイン・承認では登録したsession IDを照合します。
- 公開デモでは誰でもGeminiを呼べるため、AI Studio側で利用上限を設定してください。資産はstub固定で、Base Sepoliaは使いません。
- 同時に起動するサンドボックスは最大10台です（`max_instances`）。`standard-1`で全台が起動し続けた場合、Workers Paidの込み分を超えると約$0.36/時です。

## 認証・AI

- [World（人間であることの確認）・Agent credential](docs/world-setup.md)
- [Gemini接続](docs/ai-setup.md)
- [アーキテクチャ](docs/architecture.md)

`BANK_AUTH_MODE`省略時の既定は`world`です。ローカルデモではテンプレートの`BANK_AUTH_MODE=local-demo`を明示します。本人はHttpOnly Cookie、Agentは専用credentialを使います。認証モードの切替時は古い認証情報を再利用できません。

## 検証

```sh
pnpm test
pnpm contracts:test
pnpm build
pnpm typecheck
pnpm exec playwright install chromium
```

独立したstub環境を起動して、ブラウザテストを実行します。テストはデモ状態を変更するため、作業中のDBを使わないでください。

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

devとbuildは同時実行しないでください。ビルド済みのアプリは`pnpm start`で起動します。

## 請求書PDFの再生成

`fixtures/mail.json`のサンプルからPDFと照合用manifestを生成します。Playwright Chromiumと日本語フォントが必要です。

```sh
pnpm invoices:pdf
```

PDFの本文には架空の請求日・支払期日を記載し、ファイルの実作成・更新日時を含むメタデータは保存しません。

## 公開ファイルの扱い

`.env.local`、`.data/`、秘密鍵、APIキー、credential、実際のメール・請求書、内部資料や作業記録をGitへ追加しないでください。ソースにはAnvilの公開済み開発用鍵と、その既知の鍵をpublic側で拒否するための公開テストニーモニックがあります。いずれも個人の認証情報ではなく、実資産には使用しません。

## 設計・計画

[ロードマップ](docs/roadmap.md)からEpic・Story・Task・ADRを参照できます。[公開資料の調査](llm-wiki/wiki/index.md)は実装仕様とは分けて整理しています。
