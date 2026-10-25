---
id: adr-0011-gemini-ai-integration
type: adr
title: ローカルデモのGemini Developer API接続
epic: epic-local-bank-demo
status: accepted
---

# ローカルデモのGemini Developer API接続

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

初期デモではAIを決定的stubに置き、将来Vertex AIへ接続する想定だった。ローカルデモで実AIの請求情報抽出と会話分類を確認する必要がある。

## Decision

- Gemini Developer APIをserver-only adapterから呼び出し、既定モデルを`gemini-3.5-flash-lite`とする。`AI_MODE=stub|gemini`でstubと実接続を明示的に切り替える。
- APIキーは`GEMINI_API_KEY`から読み、ブラウザへ出さない。自由入力とサンプル請求メールだけを送信する。
- 請求書抽出はZodで検証し、金額・受取先ID・番号・期日・recurrence keyをfixture添付と照合する。不一致、未設定キー、APIエラーで取込みを止める。
- 会話分類が返せるのはメール確認、運用提案、その他だけ。ユーザーの明示同意、資金計算、Policy判定、送金先、Intent署名、実行は既存の銀行側処理が保持する。
- Geminiの無料枠では送信内容がGoogleの製品改善に使われ得るため、サンプル以外の個人・顧客情報を送らない。

## Alternatives

- Vertex AIは当初方針だが、無料で短時間にAPI統合を確認する今回のデモにはGoogle AI StudioのDeveloper APIが簡便。Vertex AIへの移行は別途認証・運用・品質評価を設計する。
- SDKを追加せず、server-onlyのREST呼び出しにする。現状の用途で追加依存を増やさない。

## Consequences

サンプルメール抽出と依頼分類に実モデルを使える。無料枠・モデル提供状況に依存し、上限超過やAPI失敗時はその操作が停止する。AI出力だけで資産操作や承認を実行しない。

## References

- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini API key security](https://ai.google.dev/gemini-api/docs/api-key)
- [Local Gemini setup](../ai-setup.md)
