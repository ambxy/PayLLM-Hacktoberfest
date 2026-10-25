---
id: adr-0007-usdc-td-redemption
type: adr
title: USDC返却確認に基づくTDの償還
epic: epic-local-bank-demo
status: accepted
---

# USDC返却確認に基づくTDの償還

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

USDC運用からTDへ戻す経路が必要。旧来の「初期はlock解除なし」を更新する。今回の対応は既存lockに紐付く元本の償還であり、新しい一般的なUSDC購入サービスではない。

## Decision

初期はAave引出し・銀行へのUSDC返却をstub、TD解除を実Anvilで行う。固定レート160円を維持し、返却確認後にlockの元の顧客へTDを戻す。AIチャットの明示依頼からAgentが償還Intentを作り、銀行が検証して実行する。lockIDごとの残元本の全額償還を初期対象とし、部分償還・資金不足時の自律償還は後段とする。

銀行専用Vault.release(lockId, amountJpy, redemptionId, settlementRef)は正額・残額との一致・一意IDを確認し、元顧客と残額を契約から解決する。記録更新とToken.unlockTransferは原子的に処理する。受取人をリクエストで差し替えられない。BankTDの通常振替からvaultを動かすことは引き続き禁止する。burnも再mintもしない。

public側の返却証拠は銀行backendで検証し、契約へ参照を記録する。private契約は他chainのreceiptを直接検証しない。redemption orderはrequested→withdrawing→usdc_available→usdc_returned→release_submitted→completedを保持する。二重返却・二重解除を操作IDで防ぎ、未確定時は停止する。並行償還や自動運用は既存のrun排他を使う。

元本JPY額×6,250を必要USDC最小単位とする。解除累計は元lockを超えない。初期stubは利息0とし、元本より多いTDを解除しない。実利息の処理はpublic接続時の別設計とする。不足時は解除しない。初期は利息0のstubで正常系を検証する。償還直後の自動再運用は開始せず、別の余力チェックイベントでのみ再評価する。

## Alternatives

先にTDを解除するとUSDC未返却の二重利用が起こる。償還のたびにmintすると既存lockが残り総供給も増える。USDC返却とprivate TD解除の原子性は仮定しない。

## Consequences

初期デモで運用と償還の往復を確認できる。TD総供給は変わらない。実testnetの引出し流動性・返却確認・利息・損失・障害復旧は後段で検証する。チャットからのAgent全額償還は採用。実利息の扱いは初期スコープ外。

