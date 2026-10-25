# 本人確認・委任・実行

[World credentialの説明](https://docs.world.org/world-id/credentials/1)と[verify API](https://docs.world.org/api-reference/developer-portal/verify)は、証明の意味と検証入口を確認するための資料です。銀行操作の権限はアプリ側で別に定義します。

本デモでは次を分離します。

| 層 | 本デモでの責務 |
| --- | --- |
| 本人と口座の紐づけ | World bindingと操作ごとのproof照合 |
| API呼出し元の認証 | human Cookie / agent credential |
| 委任と同意 | scope、対象、条件、版、期限を固定した承認 |
| 資金操作 | 銀行Policy、署名Intent、残高・重複・receipt照合 |

World成功だけでAgentの権限は増えません。モデルが提案した内容を人間の発話や承認と扱わず、サーバーに保存した具体的条件を一回だけ適用します。[API権限分離ADR](../../../docs/adr/0011-human-agent-api-authorization.md)
