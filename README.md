# PayLLM

PayLLM is a local AI-powered payment and banking automation assistant. It allows you to manage invoices, schedule automated payments, and plan treasury allocations using a **local Gemma 4 E4B** model running securely on your machine.

---

## Key Features

- **Local AI (`AI_MODE=local`)**: Runs entirely on your hardware via Ollama using Gemma 4 E4B with 128K context capability. No cloud dependencies or data leaks.
- **Fail-Closed Guardrails**: The local model acts solely as a parser and classifier. Bank-side code and strict Zod schema validation re-verify every amount, payee, and due date. Model output never directly grants permissions.
- **Automated Workflows**: Chat request classification, sample invoice extraction, card statement parsing, and secure payment scheduling.

---

## Prerequisites

- Node.js 24
- pnpm
- Foundry (Anvil)
- Ollama (running locally with `gemma4:e4b`)

---

## Getting Started

1. **Install dependencies:**
   ```sh
   pnpm install --frozen-lockfile
   ```

2. **Setup environment:**
   Configure your `.env.local` file (copy from `.env.example`):
   ```dotenv
   AI_MODE=local
   LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
   LOCAL_LLM_MODEL=gemma4:e4b
   BANK_AUTH_MODE=local-demo
   ```

3. **Build contracts and migrate database:**
   ```sh
   pnpm contracts:build
   pnpm db:migrate
   pnpm auth agent
   ```

4. **Start Anvil (Terminal 1):**
   ```sh
   anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --state .data/anvil.json
   ```

5. **Start PayLLM App (Terminal 2):**
   ```sh
   pnpm dev
   ```

6. Open **`http://127.0.0.1:3000`** in your browser.

---

## Testing & Evaluation

Run unit tests and local AI evaluation harnesses:
```sh
pnpm test
pnpm ai:eval
pnpm typecheck
```
