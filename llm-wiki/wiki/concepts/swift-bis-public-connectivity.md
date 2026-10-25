# 相互接続を読む観点

国際決済やAMMの実証は、[Agorá報告書](https://www.bis.org/publications/project-agora-shared-programmable-platform-wholesale-cross-border-payments.pdf)、[Mariana報告書](https://www.bis.org/publications/project-mariana-cross-border-exchange-wholesale-cbdcs-using-automated-market-makers-final-report.pdf)を一次資料の入口とします。

以下は資料を比較するための問いです。PoCの報告を一般提供の事実と読み替えません。

- メッセージを接続したのか、資産台帳を接続したのか。
- 決済資産は銀行預金・中央銀行マネー・別のトークンのどれか。
- どの参加者が指図し、検証し、決済を完了させるか。
- 片側が失敗した場合の資産と債務はどう扱われるか。
- 技術的実証、参加者限定運用、一般サービスのどの段階を示すか。

本デモのAnvilとAaveの処理は原子的ではありません。相互接続の成功と同一視せず、各stepの証拠を保管して返却確認前のTD解除を拒否します。[精算ADR](../../../docs/adr/0009-sepolia-settlement.md)
