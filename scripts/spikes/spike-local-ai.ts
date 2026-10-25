import "server-only";

async function runSpike() {
  console.log("Running local AI spike with gemma4:e4b...");
  const baseUrl = process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:11434";
  const model = process.env.LOCAL_LLM_MODEL ?? "gemma4:e4b";

  // Test 1: Classification
  const classifyPrompt = 'ユーザーの依頼を分類してください。JSONのみで返してください。read_mail: サンプルメール・請求書を確認したい。propose_investment: 余力の運用条件を提案してほしい。other: それ以外。\nユーザー文: "請求書を確認したい"';

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: classifyPrompt,
      format: "json",
      stream: false,
      options: { temperature: 0, num_ctx: 8192 }
    })
  });

  if (!res.ok) {
    console.error("Spike classify failed:", res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json() as { response: string };
  console.log("Classification response:", data.response);

  // Test 2: Extraction
  const extractPrompt = '次のメールと請求書添付から請求情報をJSONで抽出してください。余計なテキストは含めず、純粋なJSONのみを返してください。\n' +
    JSON.stringify({
      sender: "billing@aoba.example",
      subject: "Invoice",
      body: "Invoice for September",
      attachment: {
        number: "AOBA-202609-001",
        issuer: "Aoba Design",
        recipientId: "aoba",
        amountJpy: "200000",
        dueAt: "2026-10-01T03:00:00.000Z",
        recurrenceKey: "aoba-services"
      }
    }) +
    '\n出力スキーマ: {"number": "string", "issuer": "string", "recipientId": "aoba|sakura", "amountJpy": "string", "dueAt": "string", "recurrenceKey": "string"}';

  const res2 = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: extractPrompt,
      format: "json",
      stream: false,
      options: { temperature: 0, num_ctx: 8192 }
    })
  });

  if (!res2.ok) {
    console.error("Spike extract failed:", res2.status, await res2.text());
    process.exit(1);
  }

  const data2 = await res2.json() as { response: string };
  console.log("Extraction response:", data2.response);
  console.log("Spike completed successfully.");
}

runSpike().catch(console.error);
