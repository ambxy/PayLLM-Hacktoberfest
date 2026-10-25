# Local AI Setup (`AI_MODE=local`)

Agent Bank supports running classification and invoice extraction locally using **Gemma 4 E4B** via a local runtime (Ollama) instead of cloud APIs like Gemini.

> **Core Principle:** The local model is a fallible parser, not a decision-maker. Bank-side code re-validates every extracted field, amount, payee, and operation. Model output never grants permissions or authorizes payments.

## Prerequisites

1. Install [Ollama](https://ollama.com).
2. Pull the local Gemma 4 E4B model:
   ```sh
   ollama pull gemma4:e4b
   ```
3. Ensure the Ollama server is running locally (default: `http://127.0.0.1:11434`).

## Configuration

In your `.env.local` file, configure `AI_MODE=local` and optional parameters:

```dotenv
AI_MODE=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=gemma4:e4b
LOCAL_LLM_NUM_CTX=16384
LOCAL_LLM_MAX_OUTPUT_TOKENS=2048
LOCAL_LLM_TIMEOUT_MS=30000
LOCAL_LLM_TEMPERATURE=0
LOCAL_LLM_MAX_RETRIES=1
```

## Failure & Safety Policy

- **No Fallback:** If `AI_MODE=local` is active and the local LLM server is unreachable, times out, or returns invalid JSON/schema, the operation **fails closed** with an `AiError`. It never silently falls back to `stub` or `gemini`.
- **Untrusted Input/Output:** All invoice texts, emails, and chat messages are treated as untrusted data. Model outputs are strictly validated against JSON schemas and cross-checked against source fixtures.
- **Loopback Only:** Local LLM requests are restricted to loopback (`127.0.0.1` / `localhost`). No AI configuration or prompts are exposed to the browser (`NEXT_PUBLIC_` is never used).
- **No Secrets:** Credentials, private keys, session tokens, or env values are never included in prompts.
