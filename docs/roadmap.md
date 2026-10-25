# 計画と設計判断

開発計画、受け入れ条件、技術的な選択理由を公開用に整理した索引です。実作業日時、個人の承認履歴、旧PR・コミット、実ウォレット・取引ログは掲載していません。日付を架空の作業日に置き換えてはいません。

各文書のstatusは対象となる計画の範囲で保持しています。doneはその文書の受け入れ条件の完了を示し、外部接続や後続仕様まで検証済みという意味ではありません。reviewは公開レビューの承認済みを意味しません。古い計画のsession、AI stub、認証のないAPIなどは後続ADRで変更されています。起動・現行仕様は[README](../README.md)と[アーキテクチャ](architecture.md)を参照してください。

| 範囲 | 計画 | 状態・検証境界 |
| --- | --- | --- |
| ローカルTD・支払い・運用・償還 | [初期デモ](epics/local-bank-demo.md) | 7 Story・14 Task完了。TDは非fork Anvil、public資産とAIはstubとして検証 |
| public資産の運用と返却 | [Sepolia接続](epics/sepolia-bank-demo.md) | 4 Story完了、最終verifyはblocked。Base Sepoliaの10 USDC往復を確認、通常2,500 USDCは未完了 |
| 口座紐づけ・操作承認 | [World](epics/world-session-approval.md) | 初期session計画のローカル検証後、Orb requestへ更新。[実機確認の範囲](world-integration-debrief.md)を分離 |
| human/agentの認証・認可 | [API権限分離](epics/api-authorization.md) | 5 Story・10 Task完了。ローカル検証と外部実証を区別 |
| AI adapter | [Gemini ADR](adr/0011-gemini-ai-integration.md) | server-only接続・出力照合。設定と利用範囲は[AI設定](ai-setup.md) |

## 後続の設計判断

- 初期の[ルールとIntent](adr/0004-rules-intents.md)を[API権限分離](adr/0011-human-agent-api-authorization.md)で拡張。チャットのOKだけで即時承認せず、本人に束縛した操作単位の承認を使う。
- [custody](adr/0008-public-custody.md)で鍵の永続化と暗号化、[精算](adr/0009-sepolia-settlement.md)で元本返却証拠とTD解除を定義。公開設定の鍵は空欄。
- [World ADR](adr/0010-world-session-approval.md)はSelfie/sessionからOrb requestへの変更理由を記載。初期のEpic/Story内のsession方式は設計の検討過程として読む。
- [公開資料の調査ノート](../llm-wiki/wiki/index.md)は外部資料と検討観点を整理したもので、銀行商品の提供条件や本デモの実装完了を保証するものではない。

詳細監査ログと旧開発スキルは公開対象外です。このコピーには旧計画validatorの日時・承認履歴要件を持ち込まず、文書のID・参照・依存関係・状態の整合性を確認しています。
