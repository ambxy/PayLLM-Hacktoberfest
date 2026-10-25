---
id: adr-0010
type: adr
title: Worldによる口座紐づけと操作単位の承認
epic: epic-world
status: accepted
---

# Worldによる口座紐づけと操作単位の承認

## 背景と比較した方式

当初はSelfie Checkとsessionによって同一人の再確認を行う方式を検討した。実機ではSelfie credentialの利用不可とsessionの検証拒否が発生した。Face Authの設定からSelfie credentialの利用可否を推定した点、SDKとverifyの形式を早期に固定した点を見直し、Orbと一回ごとのrequestへ変更した。これは確認した環境での観察であり、session方式全般の不成立を主張するものではない。

## 採用する方式

- Orbのproof_of_humanを使い、登録・ログイン・承認を固定action `agent-bank-account` に対する一回ごとのrequestとして扱う。口座に登録したRP単位nullifierとの一致を検証する。
- challengeには用途・口座・instance・提案・baseVersion・正規化した条件・実行先を固定し、digestをsignalへ結び付ける。5分の実時刻TTLを用い、デモ時計を使わない。
- 同じ人・actionのnullifierは繰り返し現れるため、nullifierだけを再利用拒否キーにしない。nonceとchallengeの一回消費で操作の再利用を防ぐ。
- 完全な結果をPortal verifyへ渡す。ローカルで形式・nonce・signal・credential・environment・成功結果を照合し、暗号学的検証はPortalへ委ねる。SDKの返却形式を推測した要素数だけで拒否しない。
- 外部検証の待機中はDB transactionを保持しない。成功後に内容・版・instance・期限を再照合し、承認の消費と変更を短いtransactionで確定する。
- 生体画像、完全なproof、integrity JWTはDBやログへ保存しない。RP秘密鍵はサーバー環境だけに置く。
- Gatewayは承認の内容・版・宛先を再照合したうえで銀行Policyを実行する。World成功だけで任意の資金操作を許可しない。

## 不採用の方式と制約

クライアント申告のsession IDや検証済みbooleanだけを保存する方式は、承認対象と一回限りの適用を保証できない。初期session案は現行の設定手順では使用しない。Worldのproofを銀行アプリのログインCookieやAgent credentialとして流用しない。

Orbの検証を、個々の銀行操作に対する人間の在席、銀行KYC、法的署名と同一視しない。local-demoでの明示継続はWorld成功と分離する。ログイン・主体分離・モード切替の詳細は[API権限分離ADR](0011-human-agent-api-authorization.md)を参照する。

## 検証範囲

実機で確認した範囲と未確認部分は[振り返り](../world-integration-debrief.md)、現行の設定は[World設定](../world-setup.md)に記す。ローカルmock成功は実機成立の証拠にしない。

## 検証結果

単体/API 26件、World承認からAnvil Gatewayへの統合1件、Hardhat 1件、Playwright 5件、build/typecheckが成功。初期session計画のWorld実機検証は未実施。後続のOrb実機検証はWorld振り返りを参照。
