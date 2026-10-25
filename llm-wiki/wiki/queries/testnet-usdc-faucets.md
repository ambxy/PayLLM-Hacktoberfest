# テスト資産の準備

USDCという記号だけで資産を同一視しません。[Aave公式address book](https://github.com/aave-dao/aave-address-book)で対象chainのPool・reserve構成を確認し、[Circle faucet](https://faucet.circle.com/)で取得した資産がそのPoolの対象だと仮定しないようにします。

本デモの接続先・資産は `src/integrations/aave/config.ts` が正本です。準備CLIのstatusとdry-runで、chainId・contract code・decimals・reserve状態・供給上限・流動性・gas・在庫を確認してから明示送信します。Faucetの取得量や待機間隔は固定情報として転載せず、操作時に確認します。

過去のwallet、取引hash、block、着金・取得日時、実残高は掲載しません。テスト資産の準備ができたことと、実際の預入・返却・TD解除が成功したことは別に確認します。[検証Task](../../../docs/tasks/story-sepolia-verify/live.md)
