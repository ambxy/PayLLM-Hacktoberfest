---
id: epic-sepolia-bank-demo
type: epic
title: 口座連動ウォレットとSepolia Aaveでの運用償還
status: in-progress
adrs: [adr-0008-public-custody, adr-0009-sepolia-settlement]
error_acceptance: deferred
error_acceptance_reason: 正常系デモを維持し保留画面と自動復旧は後段とする
---

# 口座連動ウォレットとSepolia Aaveでの運用償還

> この文書は開発段階ごとの計画・判断を整理したものです。状態と検証結果はその範囲に限ります。後続の変更と現行仕様は[ロードマップ](../roadmap.md)を参照してください。

### 含むもの

口座作成時の鍵生成・暗号化保存、銀行在庫用鍵の設定、Sepolia準備CLI、Faucet、実transfer/approve/supply/withdraw、返却証拠、TD解除、5画面の実資産表示、10 USDCと通常2,500 USDCでの検証。

### 含まないもの

Vertex AI、World、実メール、mainnet、実金銭の購入、クラウドKMS、公開認証、部分元本償還、利息換金、保留・復旧画面、自動リトライ、常駐cron。新しいpublic contractをdeployしない。TD契約の変更は原則不要。

### コンポーネントと責務

- `integrations/custody`: 鍵生成・暗号化・復号・サーバー署名。Agentから資産鍵を分離。
- `integrations/aave`: stub/Sepolia adapter、ERC20とPool通信、receipt照合、chain残高取得。
- `features/banking` / `features/demo`: 口座とwallet対応、instance作成、reset制約。
- `features/investment`: 既存Policy/Intent検証、lock→預入、返却→releaseの順序とorder管理。
- `server`: walletとpublic step台帳をinstance非依存で永続化。UIとCLIには公開情報だけを返す。
- `app`: アドレス、接続準備、元本/残余持分、chain名、Explorer証拠を既存画面に表示。

### データフロー

口座作成→専用鍵保存→運用者が資金準備→利用者が運用条件に同意→余力イベント→銀行が再検証→Anvil lock→銀行在庫から顧客へUSDC→approve→Aave supply。

チャット償還依頼→orderごとのwithdraw→銀行へ元本返却→receipt検証→Anvil release→元本完了と残余Aave持分を表示。

### On-chain / Off-chain境界

TDとlockの正本はAnvil31337。USDC/aToken残高とpublic送信証拠はBase Sepolia84532。SQLiteは口座、暗号化鍵、同意、order、stepと証拠の対応を記録する。DB上の数値更新だけでpublic実行成功にしない。private契約は銀行の証拠検証を信頼する。

### 認証・権限・秘密情報

固定ユーザー/loopbackサーバーを維持。銀行カストディ、内部Agent署名、Policy再検証を維持する。[ADR-0008](../adr/0008-public-custody.md)で鍵保管を定義。新規鍵を計画作成中には生成しない。実行用環境は `SEPOLIA_RPC_URL`、`PUBLIC_ASSET_MODE`、master key設定を用意し、秘密値はGit/画面/会話に出さない。

### インターフェース・データ

非同期 `PublicAssetAdapter.preflight / supplyAndDeposit / withdrawAndReturn / balances` を設ける。引数は永続operationId、顧客walletId、元本units、orderId。戻り値はmode/chainId/step証拠。償還結果は正確な返却額・from/to・token・txHash・logIndexを含む。既存stubも同じ型へ移行する。

walletはaccountId/chainId/address/ciphertext/keyVersion/nonce/tagを持つ。public stepはoperationId/step/walletId/nonce/txHash/blockHash/logIndex/statusを持つ。DB更新は短いトランザクション、RPC待機はその外で行う。APIルートは現状を維持し、公開dashboardにwalletとchain残高を追加する。準備操作はローカルCLIのみ。

依存は現行lockfileを維持：Node24.21.0、pnpm12.5.1、viem2.56.8、Next16.3.5、Drizzle0.45.3、better-sqlite3 13.0.3、Hardhat3.17.0。暗号化はNode標準cryptoを使い、新たなクラウドSDKは導入しない。

### Storyをまたぐ不変条件

1 TD=1円、USDC decimals6、固定160円、元本units=JPY×6,250。lockはburnしない。返却確認前に解除しない。元lockの顧客・元本を変更しない。同じstepや返却証拠を二重使用しない。利息を元本/TDへ二重計上しない。public資産のある口座の鍵・証拠をresetで消さない。既存stubの成功はSepoliaの実証にしない。

## Story

| ID | Story | Depends on | Status |
| --- | --- | --- | --- |
| [story-sepolia-wallet](../stories/epic-sepolia-bank-demo/wallet.md) | 利用者が口座とpublicウォレットを同時に作る | なし | done |
| [story-sepolia-prepare](../stories/epic-sepolia-bank-demo/prepare.md) | 銀行担当者がSepoliaで運用準備を整える | story-sepolia-wallet | done |
| [story-sepolia-invest](../stories/epic-sepolia-bank-demo/invest.md) | Agentが余力をSepoliaのAaveへ預ける | story-sepolia-prepare | done |
| [story-sepolia-redeem](../stories/epic-sepolia-bank-demo/redeem.md) | 利用者がチャットから運用元本をTDへ戻す | story-sepolia-invest | done |
| [story-sepolia-verify](../stories/epic-sepolia-bank-demo/verify.md) | デモ担当者が実Sepoliaの往復を確認する | story-sepolia-redeem | blocked |

## 依存グラフ

L1 wallet → L2 prepare → L3 invest → L4 redeem → L5 verify。5 Story・10 Task。各Story内は実装→接続/検証の順。独立Agentの並列作業を前提にしない。

## 成功条件

新規口座で専用アドレスが生成され、再起動後も同じ鍵で動く。実Sepoliaで元本の預入・返却と対応Anvil TDの保存を確認できる。初回10 USDC=1,600 TD、次に既存100万円→20万円支払い→40万円lock=2,500 USDC→元本償還→利用可能80万円を確認する。全取引にreceipt証拠と画面表示がある。

## 検証範囲

ローカルではunit、契約、API、ブラウザE2Eで既存stub回帰と外部境界の照合を検証する。必要な拒否テストも含む。実Sepoliaは資金と実行範囲の許可が揃ってから別途実施する。forkやfixtureを実接続成功と呼ばない。実証がない間は最終Story未完了、Epic完了としない。

## 検証状況

Base Sepoliaで10 USDCの預入・元本引出し・銀行返却・対応する1,600 TDの解除を確認。通常2,500 USDCの往復検証は未完了のため、最終Story/Taskはblockedを維持する。Faucetの取得制約と対象市場の状態は再実行時に確認する。
