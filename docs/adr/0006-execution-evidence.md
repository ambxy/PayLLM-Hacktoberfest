---
id: adr-0006-execution-evidence
type: adr
title: 実TDと模擬運用の段階・証跡・停止境界
epic: epic-local-bank-demo
status: accepted
---

# 実TDと模擬運用の段階・証跡・停止境界

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

Anvilの確定結果とSQLiteは同一transactionにできず、stubと実資産の証拠を混同してはいけない。

## Decision

DBにoperation予定を保存→Anvil送信→receipt/event照合→DB結果記録とする。資産runは直列化し、requestId/instanceId、請求書業務キー、on-chain operationIdの各段階で重複を抑止する。

投資はlock確定→模擬USDC供給→模擬Aave計上。stubもoperationIdごとに在庫と顧客持分を一度だけ更新し、mode=stubを保持する。結果不明時はneeds_attentionで停止し、新しい資産操作を止める。自動再送・補償は行わない。

resetは新instance・新contracts・seedを準備し、確認後に切り替える。旧TDをburn/unlockしない。途中停止は新instanceをreadyにしない。外部接続は別計画で確定性・復旧を追加する。

## Alternatives

成功booleanだけでは送信と確定を区別できない。完全なqueue/outbox・自動照合・補償は将来有用だが初期の正常系範囲を超える。stubを無条件成功にすると資産整合性を検証できない。

## Consequences

正常系を検証可能にし、結果不明のまま資産操作を継続しない。停止からの復旧手順の自動化・public reorg対策は未実装範囲となる。

