#!/usr/bin/env bash
# deploy-preview.sh — preview the MintGate deployment via the Agentic Wallet.
# READ-ONLY preview step: prints the preview result + requestId. NOTHING is
# broadcast by this script. The execute step is a separate, deliberate command.
# Usage: ./scripts/deploy-preview.sh [--gas-limit N]
# Requires: baw on PATH (~/.local/npm/bin), devMode active, session alive.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/npm/bin:$PATH"
GAS_LIMIT="${1:-1200000}"
if [ "${1:-}" = "--gas-limit" ]; then GAS_LIMIT="$2"; fi
ART=$(python3 -c "import json; d=json.load(open('deploy-artifacts.json')); print(d['deployCalldata'])")
FACTORY=$(python3 -c "import json; print(json.load(open('deploy-artifacts.json'))['factory']['address'])")
FROM=$(python3 -c "import json; print(json.load(open('deploy-artifacts.json'))['constructorArgs']['initialOwner'])")
echo "predicted MintGate: $(python3 -c "import json; print(json.load(open('deploy-artifacts.json'))['predictedAddressCREATE2'])")"
echo "factory: $FACTORY | gas limit: $GAS_LIMIT"
echo "--- check BSC gas price first (deploy only if <= ~0.7 gwei with current BNB) ---"
curl -s --max-time 15 -X POST https://bsc-dataseed.binance.org/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_gasPrice","params":[]}' | python3 -c "import json,sys; v=int(json.load(sys.stdin)['result'],16); print('gasPrice:', v, 'wei =', v/1e9, 'gwei')" || echo "(gas price check failed — check manually before executing)"
baw contract-call preview --binanceChainId 56 --from "$FROM" --to "$FACTORY" --value 0 --inputData "$ART" --gasLimit "$GAS_LIMIT" --json
