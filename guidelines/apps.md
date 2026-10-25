# Application Guidelines

- Next.js＋TypeScriptの単一アプリとし、TypeScriptはstrict modeを使う。
- `src/app` は表示・入出力、`src/features` は銀行業務・Policy・Intent・資金計算、`src/integrations` は外部接続とstubの境界とする。
- 外部入力とstub出力を境界で検証する。具体的な検証ライブラリ・DB・バージョンは承認済みADRに従う。
- 金額は通貨と最小単位を明示し、浮動小数点で残高・換算・上限判定を行わない。請求書と予測支出を二重計上しない。
- AIは情報抽出・予測・Intent候補を返す。受取先照合、重複判定、金額計算、Policy判定、実行は銀行側コードで検証する。
- DB・秘密鍵・資産移転署名はサーバー専用。AgentのIntent署名と銀行の資産移転署名を分け、鍵をブラウザやログへ出さない。
- 初期stubはサンプルに対し決定論的な結果を返す。UIと実行記録にstub利用を明示し、本物のtransaction hashやAave利回り実績に見せない。
- AI・World・Aave接続を使わない初期フローは、それらの認証情報なしで実行・検証できること。
- 画面変更はアプリを起動して対象操作を確認する。build成功だけでは完了としない。
