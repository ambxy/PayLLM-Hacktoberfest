---
id: adr-0001-demo-baseline
type: adr
title: 承認済みの初期デモ条件
epic: epic-local-bank-demo
status: accepted
---

# 承認済みの初期デモ条件

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

外部接続なしでも、請求書支払い・余力運用・元本償還の一連の流れを検証できる初期構成を定める。

## Decision

Next.js＋TypeScriptの単一アプリ、Hardhat＋Solidity、非forkローカルAnvil、SQLite＋Drizzleを使う。1 TD＝1円でAnvilを確定残高の正本とし、銀行のみ発行・振替する。同一銀行内の請求書支払いと月末余力による自動運用を扱う。

運用TDは専用コントラクトへlockし、顧客・Intentとの対応を持つ。burnしない。1 USDC＝160円、手数料0、USDC最小単位で端数を切り捨てる。100万円から20万円支払い、40万円を残し、40万円をlockして2,500 USDC相当を模擬運用する。

## Alternatives

本番チェーン、実メール、Vertex AI先行、TD burn、DB残高正本は今回採用しない。

## Consequences

外部認証情報なしで初期デモを作れる。実AI・実DeFi・本番銀行機能の検証済みとは扱わない。

## 後続判断

AIは[Gemini接続](0011-gemini-ai-integration.md)、外部運用は[Sepolia接続](0009-sepolia-settlement.md)、認証は[API権限分離](0011-human-agent-api-authorization.md)で拡張する。
