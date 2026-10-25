# World（人間であることの確認）・Agent credential

## ローカルデモ

`.env.local`に`BANK_AUTH_MODE=local-demo`、`WORLD_MODE=disabled`を設定し、`pnpm dev`または`pnpm start`で起動します。画面でデモ継続を明示的に選びます。本人のログインと、メール閲覧・支払い条件などの操作単位の承認は別です。

```sh
pnpm auth agent
```

Agent credentialは`.data/agent-credential`に0600の権限で保存します。本人セッションは30分、Agent credentialは24時間です。更新は新しいファイルへ発行し、`BANK_AGENT_CREDENTIAL_FILE`を変更して再起動します。

```sh
pnpm auth agent .data/agent-credential-next
pnpm auth revoke <credential-id>
```

認証CLIはアプリと同じ`DEMO_DB`・`BANK_AUTH_MODE`で実行してください。credentialを発行するだけでは業務権限は与えません。

## Worldモード

Developer Portalで自身のApp・RPを設定し、Orb認証済みのWorld IDを用意します。RP署名鍵は`.env.local`だけに保存してください。

```dotenv
BANK_AUTH_MODE=world
WORLD_MODE=live
WORLD_APP_ID=app_your_app
WORLD_RP_ID=rp_your_rp
WORLD_RP_SIGNING_KEY=
WORLD_ENVIRONMENT=production
WORLD_FLOW=session
WORLD_ENROLL_WITHOUT_TICKET=true
PUBLIC_ASSET_MODE=stub
PUBLIC_TRANSACTIONS_ENABLED=false
```

`WORLD_RP_SIGNING_KEY`へ自分のRP署名鍵を設定します。アプリを停止したうえで、同じモードの認証情報を準備します。

```sh
pnpm auth agent .data/world-agent-credential
```

`BANK_AGENT_CREDENTIAL_FILE=.data/world-agent-credential`を設定して起動します。localhostでは最初のWorldログインでsession IDを口座に紐づけるため、登録チケットの入力は不要です。登録済みなら同じsession IDを使ってログインします。モード切替前のセッションやAgent credentialは再利用できません。`WORLD_ENROLL_WITHOUT_TICKET=true`は使い捨てのデモ環境または自分だけがアクセスするlocalhostで使ってください。

本実装は`IDKitSessionWidget`のOrb proof（`proof_of_human`）を使います。最初のログインで得たsession IDを口座に保存し、以後のログイン・承認ではそのIDをWorld Appへ指定します。銀行側でnonce・signal・session ID・environmentを照合し、Developer Portalで証明を検証します。各証明の再利用も拒否します。Selfie Checkは受け付けません。

従来の`WORLD_FLOW=request`で登録した口座はsession IDへ自動移行できません。既存DBを保持したまま設定だけを変えるとログインできないため、ローカルの新しいデモ環境・DBで登録し直してください。公開サンドボックスは使い捨てなので、新しいサンドボックスで登録します。

ログインはWorldで確認します。サンプルメール閲覧の委任は、ログイン済み本人が画面に示された対象と範囲を確認して許可します。初期の支払い・運用条件は1件のWorld確認でまとめて承認します。以後の条件変更や再有効化には新しい承認が必要です。worldモードではデモ継続へ自動的に切り替わりません。停止・取消は本人が実行できます。

`pnpm world:status`は設定や登録の状態を確認するコマンドです。DBには本人識別子・承認内容を保存するため、DB、proof、cookie、ticket、credentialをGitや会話へ貼り付けないでください。World連携は銀行KYCの代替ではありません。

## 検証結果

Worldの実機接続結果は環境とフローに依存します。ローカルテストの成功をWorld Appでの動作確認として扱わないでください。

## World ID for Agents（エージェント接続）

`/world-agents`は銀行にログインした本人が、エージェントへの権限付与を確認する画面です。上記のIDKit連携とは独立した公式イベント用OIDCサンドボックスを使います。操作条件を確認してWorld認証を開始すると、銀行が条件を認証要求に紐づけて保存します。認証成功後は口座紐づけと権限発行を一括で行い、接続ファイルのダウンロード画面へ進みます。World認証だけで銀行セッションを発行することはありません。

[Agents Portal](https://sandbox.auth.world.org/portal)でconfidential clientを作成し、認証方式を`client_secret_basic`、Redirect URIを`https://agent-bank-demo.barabara0224.workers.dev/api/world-agents/callback`に設定します。`.env.local`には`WORLD_AGENTS_CLIENT_ID`、`WORLD_AGENTS_CLIENT_SECRET`、`WORLD_AGENTS_REDIRECT_URI`を保存します。Cloudflare公開時は同名のWorker secretsとして設定してください。値を会話やGitへ貼り付けないでください。

HTTPSの公開先から開始して同じブラウザへ戻る必要があります。localhostで開始して公開先へ戻ると認証要求のcookieとDBが一致しません。公式サンドボックスのmock proofを使用し、実在の人間の証明や銀行KYCとは区別します。

Code + S256 PKCE、state、nonce、RS256署名、issuer、audience、期限、acr/amr、auth_timeをバックエンドで検査します。再認証時には直前の有効な認証との同一性も照合します。取消・期限切れ・検証失敗では成功に遷移しません。単体テストの偽IdPは検証処理のテスト専用で、公式接続成功の証拠ではありません。

## 外部エージェントの残高照会デモ

1. 銀行画面でログインし、デモ口座を初期化します。
2. `/world-agents`でエージェント名・対象口座・許可する操作・有効期間を確認します。
3. `Verify with World and allow`を押し、World認証を完了します。取消・失敗・期限切れでは権限を発行しません。
4. 銀行側が認証結果と保存した条件を検証し、自動で接続を確定します。権限は1回だけ発行され、接続済み一覧や追加の口座接続ボタンは表示しません。
5. 接続ファイルをダウンロードし、選んだエージェントの秘密情報保管先へ渡します。会話やGitへ貼り付けないでください。接続ファイルはBearer credentialを含み、再表示できません。
6. 外部エージェントから `node scripts/agent-balance.mjs /path/to/agent-bank-connection.json` を実行します。`GET /api/external-agent/balance`からTDの利用可能残高とlock残高を返します。

許可なしの照会は401です。取消・期限切れ・口座リセットでも接続は無効になります。新たな接続発行には新しいWorld認証が必要です。支払い・送金・メール閲覧には使えません。名前は利用者が付けるラベルで、エージェント自身の認証証明ではありません。

Cloudflareではcredential内のルーティングIDで同じサンドボックスへ到達し、バックエンドがcredential全体のハッシュと委任を検証します。Cookieの受け渡しは不要です。ローカルでも同じAPIを利用できますが、Worldのcallbackとブラウザの接続先は一致させてください。

## 外部エージェントによる預金への戻し入れ

運用中の口座では、接続内容の確認画面で `Allow deposit and token account operations` を選べます。この許可で実行できる資金操作は、接続開始時の運用分を元のAccount Aへ戻す1件の償還です。銀行は対象の運用分を認証要求に紐づけ、認証中に金額・対象が変わった場合は接続を確定せず、再確認を求めます。許可は最大5分間で、残高照会専用の接続情報には償還権限を追加しません。

外部Agentはダウンロードした接続情報を使って実行します。

```sh
node scripts/agent-redeem.mjs /path/to/agent-bank-connection.json
node scripts/agent-redeem.mjs /path/to/agent-bank-connection.json --status
```

実行APIは `POST /api/external-agent/redemptions`、bodyは `{"action":"redeem-approved"}`、状態確認は同じパスのGETです。銀行側の既存償還処理がAaveからToken accountへの引出し、銀行へのtoken返却、元の預金口座へのTD解除を検証します。Agentは金額・送金先・別の償還依頼を指定できません。取消・失効の検査は実行段階ごとにも行います。通信が途切れた場合は状態を確認してください。失敗途中の処理を新しい許可で無条件に再実行しないでください。

公開デモはAaveのstub＋ローカルAnvilです。Sepolia接続では既存adapterを使いますが、実Aaveでの外部Agent実行は未検証です。元本を戻す既存仕様を引き継ぎ、利息相当のAave保有分はSepolia側に残ります。

### MCPサーバー

Claude Code・Claude DesktopなどのMCPクライアントからは、同じ接続ファイルを使うstdioサーバーを登録します。ツールは`get_balance`・`redeem_approved_investments`・`get_redemption_status`の3つで、上記の外部Agent APIだけを呼びます。引数は受け付けず、権限の付与・拡大や金額・送金先の指定はできません。

```sh
claude mcp add agent-bank -- node /absolute/path/to/agent-bank/scripts/agent-bank-mcp.mjs /absolute/path/to/agent-bank-connection.json
```

Claude Desktopでは設定ファイルの`mcpServers`へ同じコマンドを`command`・`args`として追加します。接続ファイルはツール呼出しごとに読み込むため、再発行した接続ファイルで同じパスを上書きすれば再登録は不要です。credentialは会話やツール結果へ出力しません。

## ローカルでのデザイン確認

開発サーバーの `/world-agents?preview=1` で、接続内容の確認・模擬認証・ファイルダウンロードを確認できます。`Complete preview verification` で成功経路、`Cancel verification` で取消経路へ進みます。開発環境のloopback接続でのみ有効で、銀行APIを呼び出さず、接続ファイルにも無効な確認用tokenを使います。通常URLやproduction buildでは認証を省略しません。
