# World組み込みの振り返り

この記録は特定の開発環境で得た技術的な観察を、実施日時・個人情報・認証データを除いて整理したものです。World全体の提供状況を断定するものではありません。

## World ID for Agents / Stage A

公式OIDCサンドボックスのdiscovery取得と認証開始URLの生成を確認しました。認証完了・公式結果の検証成功は公開先で未確認です。最初の成功までの時間はまだ計測結果がありません。

IDKit用App/RPとAgents用OIDC clientが別設定である点、HTTPS callbackとブラウザcookie・保存先の一致が必要な点が最初の摩擦でした。`openid-client`ではTLS経由のID token処理に加え、`enableNonRepudiationChecks`で署名検査を明示的に有効化しました。公式ガイドのOIDC/step-up仕様を元に、銀行権限を発行しない単独の確認画面へ切り出したことが切り分けに役立ちました。

テスト専用IdPではPKCE、nonce、署名・issuer・audience・期限・auth_time・acr/amr、不一致の本人、取消と競合、再利用拒否を検証しています。このテスト成功を公式IdPの認証完了として扱いません。公開テスト後に成功までの所要時間と、エラー調査に不足した情報を追記します。

## 試した方式と観察

| 方式 | 観察 | 判断 |
| --- | --- | --- |
| Selfie Check credential | `credential_unavailable` | Face Authの設定とSelfie credentialの利用可能性を同一視できなかった |
| session方式 | credentialを変えても `verification_rejected` | 拒否原因を特定できず、実機成立とは扱わない |
| Orb + `IDKit.request` | Portal verify、口座登録、メール閲覧の委任承認まで成功 | この組合せを採用し、用途・口座・操作条件をchallengeへ固定 |

IDKit 4.2.3/4.3.0を確認する過程で、proof要素やintegrity bundleの形式が実装側の固定した想定と異なった。SDK結果の形式確認とPortalによる暗号学的検証を分け、推測した配列長や版だけを認証の本体にしないよう修正した。

## 設計を変えた理由

最初に口座登録とポリシー承認をまとめて実装したため、credentialの可用性、session対応、RP署名、verify形式のどこで失敗したか切り分けにくかった。以後は単独のrequestから始め、Portal verify、口座との一致、保存済み条件へのsignal束縛、一回消費の順に確認する。

同じ人・actionのnullifierは繰り返し使われるため、それ自体の重複を操作の再利用とみなさない。操作ごとのnonce・期限・challenge状態を検査し、同じ要求の再利用や別条件への転用を防ぐ。Worldの結果は銀行アプリのログインや委任範囲の代わりにはしない。

## 未確認の範囲

支払い・運用ルールの全実機経路、認証障害・復旧の全組合せ、銀行KYC、本番運用はこの実機成功からは保証しない。local-demoで先へ進めたこととWorldが成功したことも区別する。

再検証ではSDK版、credential、flow、RP/app/environment、action、エラー種別を整理する。proof・秘密鍵・個人識別子をログや公開資料へ添付しない。

[採用した設計](adr/0010-world-session-approval.md) / [設定手順](world-setup.md) / [API権限分離](adr/0011-human-agent-api-authorization.md)

## 検証結果

単体/API 26件、World承認からAnvil Gatewayへの統合1件、Hardhat 1件、Playwright 5件、build/typecheckが成功。初期session計画のWorld実機検証は未実施。後続のOrb実機検証はWorld振り返りを参照。
