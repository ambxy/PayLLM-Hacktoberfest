---
id: adr-0009-sepolia-settlement
type: adr
title: Sepoliaでの元本運用と返却証拠によるTD解除
epic: epic-sepolia-bank-demo
status: accepted
---

# Sepoliaでの元本運用と返却証拠によるTD解除

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

## Context

TDはAnvil、public資産はAave対応疑似USDCという既存方針を実接続へ進める。当初はEthereum Sepoliaを検討し、供給上限の問題からBase Sepoliaへ変更した。利息・public資産が残る状態でのリセット・取引確定条件は初期stubから追加で定義する。

## Decision

- 接続先はBase Sepolia（chainId 84532）。公開コントラクト構成は `src/integrations/aave/config.ts` を正本とし、実行前にcode・decimals・reserve状態・供給上限・引出し流動性を照合する。Circle USDCは対象外。
- 明示設定 `PUBLIC_ASSET_MODE=stub|sepolia`。instance作成後はmodeを固定し、stub残高を実資産へ引き継がない。接続失敗をstub成功に置き換えない。stubのデモを維持する。
- 運用順は事前確認→Policy再検証→Anvil TD lock receipt→在庫から顧客へUSDC transfer→必要額のみapprove→Pool.supply。すべてのpublic送信直前にchain、宛先、数量、顧客の対応を固定構成と照合する。
- 償還はチャットの既存全額依頼から、未償還orderごとの元本をPool.withdrawし、顧客から銀行へ同額transferする。銀行返却receiptのUSDC Transferイベントを照合後、元lockの元顧客へTDを解除する。新規mint/burnはしない。
- **利息案**：本Epicの「全額」は全orderのTD対応元本。利息は顧客のaTokenとして残し、運用元本と別表示する。利息をTD化せず銀行にも移さない。チャットは「元本をTDへ戻しました。利息相当のAave持分は残っています」と結果を正確に示す。部分元本償還・利息換金は対象外。
- receipt successに加え、送信先contract・eventの資産/送信元/宛先/実額を照合する。初期設定は2 confirmations。これはデモ用待機条件でありfinalizedの保証ではない。receiptのblockHashを再照会し、TD解除直前にも返却証拠を確認する。変化/不明時は停止する。
- settlementRefはchainId・token・返却txHash・logIndex・orderIdをcanonical encodeしたhash。返却logはunique消費し、別lockへの流用を防ぐ。private Vaultは銀行の検証を信頼し、Sepolia証拠を自ら検証しない。
- public取引台帳はinstanceを越えて永続化し、operationId・step・chainId・wallet・nonce・txHash・receipt・logIndex・statusを保持する。送信前に一意stepを確保、hashをreceipt待機前に保存する。送信成否不明なら再送しない。自動復旧は対象外。既存単一プロセスのrun排他に加え、同じ署名者のnonce使用を直列化する。
- public modeのresetは未完了run/lock/未償還元本がある間拒否する。償還後は新しいTD instanceを作れるが、顧客鍵・過去public証拠・残余aTokenは保持し、前instance由来の利息も表示する。Anvil再起動で契約が消えた場合も既存public資産を初期化扱いせず停止する。
- ガスは銀行負担。運用者向けCLIが銀行/顧客のETH、在庫USDC、見積gasを表示する。ETH補充とFaucet mintは明示的な準備操作で、デモresetや口座作成の副作用にしない。初回10 USDC=1,600 TDの確認を別プロフィールで行い、通常の2,500 USDCデモは維持する。

## Alternatives

全aTokenを引き出し利息もTDへ換算する方式は追加の利息精算・TD発行設計が必要になる。銀行在庫と運用ウォレットの統合は資産受渡しの実証にならない。publicをforkだけで検証すると実Sepolia接続の確認にならない。

## Consequences

public/privateをまたぐ処理は原子的ではない。中断時は止めて証拠を保持し、資金移動を成功扱いしない。ハッピーパス限定でも二重送信・未返却のTD解除・鍵破棄を防ぐ最低限の拒否は実装する。利息残高の表示は継続するが、本Epicで利息の出口は提供しない。

## References

- [既存のFaucet調査](../../llm-wiki/wiki/queries/testnet-usdc-faucets.md)
- [Aave公式アドレス帳](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol)
- [元の償還ADR](0007-usdc-td-redemption.md)
- [接続Epic](../epics/sepolia-bank-demo.md)

## 接続先の変更理由

Ethereum Sepoliaでは預入前の供給上限検査で停止したため、Base Sepoliaへ切り替えた。接続先を変えても既存DBを別chainのDBとして解釈せず、chainIdを含むAADで鍵を保管する。元本withdraw前には持分とシミュレーション結果を確認し、返却証拠が揃うまでTDを解除しない。
