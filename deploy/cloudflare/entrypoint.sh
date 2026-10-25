#!/bin/bash
# Boots one disposable visitor sandbox: fresh keys, SQLite and Anvil state.
set -euo pipefail

anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent &
until node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:'{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\"}'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do
  sleep 0.2
done

node scripts/setup-env.mjs stub
node --env-file=.env.local --conditions=react-server --import tsx scripts/migrate.ts
node --env-file=.env.local --conditions=react-server --import tsx scripts/auth.ts agent

node scripts/start-bank.mjs start &
until node -e "fetch('http://127.0.0.1:3000/api/world').then(()=>process.exit(0),()=>process.exit(1))"; do
  sleep 0.3
done

# Listen publicly only once the app is ready, so the Worker's port wait
# doubles as the readiness check.
node deploy/cloudflare/proxy.mjs &

# If any process dies, stop the sandbox; the next request boots a fresh one.
wait -n
exit 1
