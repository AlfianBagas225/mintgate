# MintGate — deploy guide

**Status: NOT deployed.** Everything below is prepared; the actual broadcast
needs the execute step + boss approval in the Binance app (path B) or boss's
own MetaMask signature (path A).

## Facts (verified 18 Nov 2026)

| Item | Value |
|---|---|
| Contract | `MintGate` — `contracts/MintGate.sol` (solc 0.8.30, optimizer 200, evmVersion paris) |
| Constructor args | registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, owner = Agentic Wallet `0x00139A62B5800B1F58920ff5fB0944e955b3526A` |
| Init code | `build/MintGate.initcode.txt` (4,605 bytes) |
| Deploy method (path B) | deterministic deployment proxy `0x4e59b44847b379578588920ca78fbf26c0b4956c`, calldata = `salt ++ initCode`, salt = `keccak256("MintGate-v1")` = `0x3878a5f1…ff9e3db8b` |
| **Predicted MintGate address (CREATE2)** | **`0x6254543dB7C211369E988BEd8ec7C82fdb89FBfc`** |
| Factory sim on mainnet | eth_call of the exact deploy calldata returned the predicted address (verified 18 Nov ~22:05 WIB) |
| Measured deploy gas (local) | 997,352 + ~100k factory overhead → suggested gas limit **1,200,000** |
| BSC gas price at measurement | **0.05 gwei** (18 Nov ~22:00 WIB) |
| Agentic Wallet BNB | **0.000831 BNB (~$0.49)** — see funding analysis below |
| devMode | **ACTIVE until 25 Nov 2026 21:13 WIB**, daily limit $1,000, used $0 (verified `baw wallet settings --json`, 18 Nov 21:56 WIB) |
| Session | alive until 20 Nov 14:53 UTC (keep-alive maintains it) |
| `abnormalTxnHandling` | `NeedConfirmation` — contract calls go **PENDING_CONFIRMATION**; boss approves in the Binance app |

## Funding analysis — read before deploying

| Gas price | Deploy (~1.1M gas) | 5× `registerMint` (~825k gas) | Total | Fits in 0.000831 BNB? |
|---|---|---|---|---|
| 0.05 gwei (now) | ~$0.03 | ~$0.024 | **~$0.06** | ✅ yes, easily |
| 0.5 gwei | ~$0.32 | ~$0.24 | ~$0.56 | ❌ no (over by ~$0.07) |
| 1 gwei | ~$0.65 | ~$0.48 | ~$1.13 | ❌ no |

**Rule: deploy only while BSC gas price is ≤ ~0.7 gwei for the deploy alone,
and ≤ ~0.3 gwei if the 5 registrations go in the same session.** Check the
gas price immediately before previewing (the preview script prints it).
If gas is high: wait for a low-gas window, or fund ~0.001–0.002 BNB more into
the Agentic Wallet first (boss decision — never move trading funds without asking).
Registrations can be done later, one at a time, when gas is low.

## Path B (PRIMARY) — deploy via Agentic Wallet

Chosen by boss 18 Nov 21:52 WIB. `baw contract-call` only calls *existing*
contracts (`--to` is required), so deployment goes through the deterministic
deployment proxy factory (an existing contract): the factory's raw calldata
executes `CREATE2(salt, initCode)` and returns the new contract address.
The MintGate constructor takes the owner explicitly, so the owner is the
Agentic Wallet even though `msg.sender` at construction is the factory.

### Step 1 — preview (read-only, nothing broadcast)

```bash
cd ~/workspace/hackathon-agent-id/mintgate
./scripts/deploy-preview.sh            # uses gas limit 1,200,000
# or: ./scripts/deploy-preview.sh --gas-limit 1200000
```

The script prints the BSC gas price first — **stop if it is above ~0.7 gwei** —
then runs `baw contract-call preview` and returns a `requestId`.

### Step 2 — execute (broadcasts; needs boss approval)

```bash
export PATH="$HOME/.local/npm/bin:$PATH"
baw contract-call execute --requestId <requestId-dari-preview> --json
```

Expected result: **PENDING_CONFIRMATION**. The transaction is NOT on-chain yet.

### Step 3 — boss approves in the Binance app

Boss opens the Binance app → Agentic Wallet → pending transaction → **Approve**.
The deploy then broadcasts. **NEVER re-execute the same requestId** — a second
execute would deploy a second copy (same salt would revert; a different salt
would create a duplicate contract).

### Step 4 — verify the deployment

```bash
# 1. Code exists at the predicted address:
curl -s -X POST https://bsc-dataseed.binance.org/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x6254543dB7C211369E988BEd8ec7C82fdb89FBfc","latest"]}'
#    -> long 0x6080... hex (not 0x). Empty = not deployed yet.
# 2. BscScan: https://bscscan.com/address/0x6254543dB7C211369E988BEd8ec7C82fdb89FBfc
#    Check "Read Contract": agentIdRegistry == 0x60B9...022F, owner == 0x00139A...3526A.
# 3. Verify source on BscScan: single file contracts/MintGate.sol, compiler
#    0.8.30, optimization ON (200 runs), EVM version paris, constructor args =
#    last 64 bytes of build/MintGate.initcode.txt (registry + owner, ABI-encoded).
```

### Step 5 — register the 5 curated mints (after deploy)

```bash
node scripts/mint-registration-calls.js
# prints 5 baw contract-call preview commands (one per mint).
# Run each preview, then its execute; each goes PENDING_CONFIRMATION and
# needs boss approval in the app. Gas ~165k each — do them when gas is low.
# If a mint died meanwhile, skip it (re-verify with scripts/verify-mints.js).
```

### Step 6 — flip the frontend live

In `frontend/index.html`, change the "Predicted CREATE2 address — deployment
pending" note to "Live" + add the BscScan verification link. Update the GitHub
repo link once published (see "Publish" below).

## Path A (BACKUP) — deploy via MetaMask + Remix

Use only if path B is blocked (e.g. devMode expires, or the factory call is
rejected by the backend).

1. Boss opens https://remix.ethereum.org, creates `MintGate.sol`, pastes
   `contracts/MintGate.sol`.
2. Compile: Solidity **0.8.30**, optimizer **ON, 200 runs**, EVM version **paris**.
3. Environment: **Injected Provider – MetaMask**, network **BNB Smart Chain**.
4. Deploy with constructor args: `_agentIdRegistry` =
   `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, `_initialOwner` = boss's
   MetaMask BSC address (the address that will own the listings).
5. Gas: same ~997k + MetaMask's estimate. **Funding blocker:** boss's MetaMask
   BSC balance was **0 BNB** (checked 9 Nov 2026 — recheck at deploy time).
   At 1 gwei the deploy needs ~0.001 BNB (~$0.59); fund the wallet first.
6. Verify source on BscScan with the same compiler settings as path B step 4.3.
   (Note: Remix deploy uses CREATE, so the address will differ from the
   predicted CREATE2 address — update the frontend + registration scripts
   with the real address: `node scripts/mint-registration-calls.js <address>`.)

## Publish (repo)

`gh` CLI is **not logged in** on this VM (`gh auth status`: no hosts).
To publish:

```bash
cd ~/workspace/hackathon-agent-id/mintgate
git init && git add -A && git commit -m "MintGate: Agent ID-gated free-mint board (hackathon entry)"
# Boss (or an authed session) then:
gh auth login            # boss's GitHub account (never share password/token)
gh repo create mintgate --public --source=. --push
```

The hackathon requires the repo public + the contract verified + open-source on
BscScan. Do the BscScan verification (step 4.3) right after deploy, before submitting.

## After deploy — submit checklist (before 9 Dec 15:00 WIB)

- [ ] Contract deployed + code on BscScan at the predicted address
- [ ] Source verified on BscScan (exact compiler settings above)
- [ ] 5 mints registered on-chain (checkInCount / getMint readable)
- [ ] Frontend live with the real address + ABI
- [ ] Repo public on GitHub (MIT)
- [ ] Submit: project name, website, contract address, Agent ID usage description
- [ ] Distribution running (X / Square / Telegram) toward 30 interacting Agent ID addresses
