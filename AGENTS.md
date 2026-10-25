# Agent Bank 開発ルール

- 作業開始時にREADMEと `docs/architecture.md` を確認する。
- 変更前に `guidelines/common.md` を読み、TypeScript・画面・API変更時は `guidelines/apps.md`、Solidity変更時は `guidelines/contracts.md` も読む。
- 人間の承認、Agentの委任、銀行の実行検証を分離する。モデル出力だけで権限を追加しない。
- TDはHardhatで開発し、非forkのローカルAnvilで検証する。stubの成功を外部接続の実証として扱わない。
- 秘密鍵・APIキー・認証credential・実データ・個人情報・内部資料・実際の作業日時・個人の承認履歴はGitへ追加しない。
- サンプルの日付は架空データとして保持できる。PDFの作成・更新日時メタデータは生成時に除去する。
- 画面変更はアプリを起動して確認し、機能変更に対応するテストを実行する。

- 計画・ADRは `docs/roadmap.md`、公開調査ノートは `llm-wiki/wiki/operations.md` を参照する。技術的な比較・理由・検証範囲は公開できるが、実施日を架空の日付へ置き換えない。
