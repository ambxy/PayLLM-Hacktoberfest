---
id: adr-0011
type: adr
title: 利用者とAgentのAPI認証分離とWorldによる操作単位の承認
epic: epic-api-authorization
status: accepted
---

# 利用者とAgentのAPI認証分離とWorldによる操作単位の承認

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

銀行が資産操作を実行し、Agentは委任された範囲で銀行APIに依頼する。Gemini接続そのものは本ADRに含まない。

変更前の `src/server/http.ts` はlocalhost/Origin/JSONを確認するが、主体を認証しない。`world_browser` Cookieはchallengeの所有ブラウザを識別するだけで、ログインやAgentの権限ではない。`chat()` はルールのaccept、メール閲覧許可、償還を直接呼ぶ。APIルートだけにガードを加えても、この内部呼出しが利用者権限を引き継ぐと迂回できる。

[ADR-0010](0010-world-session-approval.md)のWorld承認には条件・対象・版・nonce・期限・一回消費がある。これを拡張し、利用者認証とAgent認証を区別する。Worldの口座紐づけはAPI用Bearer credentialとは分離する。

### 一時的なローカルデモモード

- サーバー起動時の `BANK_AUTH_MODE=world|local-demo` で切り替える。未指定/不正値でデモへ落とさず、未指定はworld、不正値は起動拒否。当面のローカル手順ではlocal-demoを明示設定する。リクエストやモデル出力からモード変更できない。
- local-demoは127.0.0.1等のloopbackへバインドしたローカル起動専用。Host headerだけを根拠にせず、起動設定で外部公開を禁止する。development/production buildの区別だけに依存しないため、ローカルのbuild/startでも利用できる。
- World未設定、未登録、検証失敗、タイムアウト、取消の場合でも「デモとして続ける」を選べる。ログイン/初回利用は固定デモ口座へのhumanデモセッション、権限変更は画面に表示した内容へのデモ承認として処理する。World登録やenrollment ticketの準備を当面のデモ利用の前提にしない。World bindingは作成/置換しない。
- 自動的にWorld成功へ書き換えない。デモ継続時は進行中のWorld challengeを終了させ、同じ保存済み条件・現行版へ別の短命デモchallengeを発行して明示操作で消費する。Worldとデモの完了が競合しても一度しか適用しない。失敗したproofは成功記録として保存しない。
- デモでもAPIのhuman/agent区別、利用者の明示操作、条件/口座/対象Agent/版/期限/一回消費、残高/上限/重複検証を維持する。ログインやデモ承認をAgentのツールへ公開せず、Agent credentialによる呼出しは拒否する。ただし人間の在席を証明しないため、ブラウザを操作できるAgentからの本人なりすまし耐性は保証しない。
- セッション/credential/承認/grantにauthModeと認証世代、承認には `approvalMethod=world|local-demo` を保存する。World APIの完了記録とは区別する。切替時は以前のセッション/credentialを失効させる。worldへ戻す際、デモ承認のルール/grantを自動昇格せずWorld再承認待ちにする。World→デモ→Worldと往復しても失効した認証を復活させない。
- 画面に「ローカルデモ：Worldでの人間であることの確認を省略可能」、履歴に実際の承認方法を表示する。worldモードではデモAPI/ボタンを無効にし、認証失敗を拒否する。環境変数、デモAPIと条件分岐はこの例外に集約し、後で削除できるようにする。
- public実送信の既存スイッチ・銀行側Policy・実行許可は別条件として維持する。デモモードを選んでもpublic送信を有効化しない。本計画の変更で実送信は行わない。

### 構成と認証

Next.js/Node/SQLiteの既存構成を維持し、共通認証・認可サービスで `human` と `agent` のPrincipalを生成する。Principalは認証済みサーバー処理だけが作る。HTTP body、role header、モデル出力のaccountId/agentIdから主体を決めない。サービスにもPrincipalと認可対象を渡し、ルート以外の入口も同じ判定を通す。

- 利用者: 銀行口座へ既に紐づくWorld bindingに対する新しいproof of humanをサーバーで検証して、銀行アプリの不透明なセッションを発行する。ログイン用challengeは用途を分け、ポリシー承認には流用不可。絶対有効期限30分、ログアウトで失効。ログインはルール変更を承認したことにはならない。
- セッション秘密値はHttpOnly/SameSite=Strict/Path=/のCookieにだけ置く。HTTPSではSecureとhost-only属性を使う。HTTP例外は既存のloopback開発環境だけ。localStorage、URL、会話、モデル入力、ログへ入れない。DBは秘密値のhash、accountId、World binding、発行/期限/失効日時を保持する。検証成功時にセッションIDを再生成する。
- Agent: 今回は固定の内部Agent 1体。サーバー限定の専用credentialを生成し、DBにhash・agentId・accountId・期限・失効を保持する。平文は権限0600のGit対象外ファイルに保持し、信頼済みtool runnerだけがAuthorization headerに付与する。24時間で失効し、ローカル運用CLIで再発行/失効できる。CLIはOS管理者の操作であり、モデルにshell/ファイルアクセスを渡さない。credentialの更新は既存の委任範囲を拡大しない。
- Agent credentialは本人の委任を代替しない。個々のメールアクセス/資金操作は、accountId・agentId・許可済みscope・有効なルールの共通部分で許可する。人間Cookieをtool runnerへ転送しない。CookieとBearerを同時に送った曖昧な要求は拒否する。
- 初回の固定デモ口座へのWorld紐づけは、ローカル管理者が発行する短命・一回限りのenrollment ticketとWorld検証を両方要求する。ticketは端末の標準出力やURLへ出さず、0600ファイルから利用者が画面へ入力する。5分の期限とDBのhash/消費状態を持つ。ticketだけでログインできず、未登録口座を「最初にAPIを叩いた人」に割り当てない。登録済みbindingの置換・復旧・複数顧客対応は対象外。

### World承認と状態の所有者

変更の承認状態はSQLiteを正本にする。ブラウザには提案/検証要求IDと処理中のproofが一時的に存在してよいが、永続的な汎用承認tokenを発行しない。完全なproofをDB/ログへ保存しない。

`proposal → challenge pending → verifying → consumed` を標準経路とし、検証失敗/取消/期限切れは適用しない。外部検証のRPC待機中はDB transactionを保持せず、成功後に短いtransactionで条件の再照合・承認消費・変更保存を一括実行する。二重verifyはcompare-and-setで防ぐ。ルール変更のためにAgentへapprovalIdを返してacceptを呼ばせる経路は廃止する。

承認のsignalは、用途、銀行口座、対象agentId、正規化した操作/scope/条件、提案ID、baseVersion、instance、実行先chain/token/pool/recipient、nonce、有効期限を固定する。本人が確認するカードはサーバーに保存した同じ条件から描画する。任意のモデル説明文を承認対象にしない。ADR-0010のOrb requestに基づく本人紐づけ・nonce・signal・credential・environment検証を維持し、5分の実時刻TTLを使う。

World承認が必要なのは支払い/運用ルールの新規設定・変更・再有効化、Agentへのメール閲覧許可の付与・拡大、資金操作scopeの付与。停止・取消・ログアウトは既存の本人セッションで直ちに許可し、World障害時にも権限を縮小できる。Agentの権限拡大は常に禁止する。銀行の固定chain/token/pool制限は管理コードで維持し、利用者が変更できるルールに混ぜない。

### 業務APIとモデルの境界

全method/pathを[API一覧](../epics/api-authorization.md#api権限表)で明示し、未登録の組合せは既定拒否。401は未認証/期限切れ、403は主体・scope違反、所有者の違う参照は404、版競合・使用済み・無効な状態遷移は409とする。拒否時に資金操作・ルール・grantを変更しない。

利用者のchat APIが保存したuser messageだけが利用者発話である。Agentはモデル出力をuser messageとして保存できない。チャットの「OK」は承認画面を開始する契機で、即時acceptしない。「メールを読んで」も有効grantなしでは銀行が取得を許可しない。

Agent用APIは登録済みIDを引数とするread/propose/payment/investment/redemptionの業務操作に限定する。任意のRPC・calldata・署名・DB書込みは公開しない。償還は本人の全額償還依頼をサーバーで対象元本へ紐づけた一回限りのrequest IDを必要とする。Agentが任意のmessageIdを指定して同意を捏造できない。自然言語の償還意図が曖昧な場合はチャット内で具体案を確認する。償還ごとのWorld再確認は本Epicに追加しない。償還のscopeはこの本人発行requestに限定して導出し、Intentの認可IDへ束縛する。各送信前に発行元本人credentialとAgent credentialの現行有効性も検査する。旧運用grantの再有効化は伴わないため、移行前やモード変更前の元本も、新しい本人ログイン後の限定依頼で償還できる。

署名付きIntentにもaccountId/agentId/認可根拠を束縛し、署名が正しいだけで許可しない。サービスは主体/対象/現在scope/ルール版/累計使用額/残高/重複を検証する。規則変更・権限取消と新たな送信開始を既存mutexで直列化し、銀行署名の直前に権限を再確認する。既に送信されたtransactionは取消し扱いにせずreceiptを追跡する。TD lock後などの未送信public操作が取消で止まったらneeds_attentionとして新規操作を止め、自動返却・自動解除しない。運用ルール停止中の本人による全額償還は既存の別許可根拠を維持する。

### 移行と検証の境界

worldモードはWorld無効/未設定/失敗で本人承認を省略せず、保護されたデータ・更新を拒否する。local-demoでは上記の明示的なデモセッション/承認で先へ進める。テストではWorld verifierをテストプロセス内で差し替える。runtimeのデモ承認をWorld verifierの成功mockとして実装せず、異なる承認方法として保存する。任意のrole headerやWorld失敗時の自動降格は認めない。

既存World binding、資産、DB、receiptは保持する。主体を結び付けられない既存ルール/grantは新規自動実行不可として再承認待ちへ移す。過去の承認は上書きせず履歴として保持する。未償還元本は本人ログインと既存の返却証拠検証を通じて償還可能にする。demo resetで認証/失効/使用済み証明を消さず、新instanceで前の承認を再利用しない。

ライブラリはpackage.json/lockfileの既存固定版を使用する。Next.js 16.3.5、Zod 4.6.5、IDKitはlockfileの固定版、better-sqlite3 13.0.3、viem 2.56.8。Node標準cryptoでopaque credentialを生成し、新規認証SaaS/SDKやGemini SDKは導入しない。IDKitのログイン用request検証はインストール済みコードとADR-0010のadapterを確認して実装する。未成立の実機機能をmock成功で保証しない。

## Alternatives

- フロントでボタンを隠す/AgentのツールからAPIを外すだけ: API直呼びと内部サービス呼出しを防げない。
- World成功後の汎用管理Bearerを一度発行する: 盗用/Agentへの転送により別の権限変更へ使えてしまう。
- 通常ログインだけで権限拡大を許可する: ブラウザ操作Agentと人間の区別にならないため変更ごとの確認が必要。
- すべての送金を毎回World承認する: 承認済みルール内の自動実行という既存合意を変えるため採用しない。
- 認証プロバイダー新設、銀行署名サービスの別プロセス化、オンチェーンPolicy追加: 今回のAPI境界の変更を超える。

## Consequences

worldモードではネットワーク経由のAgent credentialで本人専用APIを実行できず、本人セッションだけでも権限拡大できない。local-demoは本人の在席確認を省略する一時的な例外で、銀行側PolicyとAgent credentialの権限制限を検証するために使う。HTTP送信者が生物学的な人間かを判別する保証ではなく、口座に紐づくWorldでの人間であることの確認と対象操作への承認を銀行が要求する。

同一Node/OS内の責務分離を維持するため、プロセス侵害・OS管理者・共有テスト鍵保有者から資産を隔離する保証はしない。Geminiへshell/銀行ファイル/任意コード実行を許可する将来設計には別の実行環境分離が必要。公開用テンプレートには資産鍵を含めない。Solidity/Aaveコントラクトの変更は本ADRの対象外。

## References

- [ADR-0010：既存World承認](0010-world-session-approval.md)
- [ADR-0004：署名Intent](0004-rules-intents.md)
- 関連実装: `src/server/http.ts`、`src/features/world/service.ts`、`src/features/chat/service.ts`。記述した不足は変更前の状態を指す。
