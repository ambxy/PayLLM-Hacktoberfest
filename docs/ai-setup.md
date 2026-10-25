# Gemini接続

AIチャットの依頼判定とサンプル請求書の抽出にGemini Developer APIを利用できます。ルールの承認、金額計算、受取先の照合、Intent署名、送金・運用の可否は銀行側のコードが決めます。

自身のGoogle AI StudioでAPIキーを用意し、`.env.local`へ設定します。

```dotenv
AI_MODE=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

`GEMINI_API_KEY`に自身のキーを設定してアプリを再起動します。キーをGit、チャット、`NEXT_PUBLIC_`環境変数へ入れないでください。利用可能なモデル・料金・データの取扱条件は利用するアカウントで確認してください。

既定の`AI_MODE=stub`は外部APIを呼びません。GeminiモードではAPIキー不足、APIエラー、抽出値の不一致で処理を停止し、自動でstubへ切り替えません。

Geminiに送る対象はサンプルメール・請求書とユーザーが入力した依頼文です。実顧客の情報や秘密情報を入力しないでください。定型応答文とルール案の組み立てはTypeScriptで行います。
