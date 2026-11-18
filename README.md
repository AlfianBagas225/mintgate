# MintGate — verified free mints for Agent ID holders

Entry for the **Binance Agent ID Hackathon** (18 Nov – 9 Dec 2026, 60,000 USDC).
Concept A from `../RESEARCH_PLAN.md`: a curated board of **verified free mints on
BNB Chain**, where the full list and slot reservations are usable only by wallets
that hold a Binance Agent ID.

## What it is

- **Contract `MintGate` (BNB Chain):** `checkIn()` proves you hold an Agent ID
  (`balanceOf >= 1` on the SPACE ID registry) and records one check-in per wallet.
  `reserveSlot(mintId)` reserves one free-mint slot per wallet per mint. Both are
  gas-only — no payment, no fee.
- **Curation:** every listing passed MINTS score ≥ 85 with no risk flags, is live on
  BSC, source-verified, had its zero-value mint simulated from an Agent ID wallet,
  and has no upgrade / self-destruct / blacklist. The audit evidence is hashed
  on-chain per listing (`auditHash`). See `CURATION.md` + `curation.json`.
- **Frontend (`frontend/index.html`):** static, read-only. No login, no connect-wallet
  button, no QR — by design. Holders interact through their own AI agent and confirm
  every transaction in the Binance app.

## What the contract can and cannot do (owner powers, red line #4)

| Power | Who | Notes |
|---|---|---|
| `registerMint` / `setMintActive` | owner only | Manage the mint listings. Deactivation never affects existing reservations or check-ins. |
| `transferOwnership` / `renounceOwnership` | owner only | Ownership can be moved (e.g. to a multisig) or given up forever; listings then become immutable. |
| Hold / withdraw user funds | — | **Impossible by construction:** the contract has no payable function and no `receive`/`fallback`. Sending BNB to it reverts. There is nothing to withdraw. |
| Mint / freeze / pause user actions | — | Does not exist in the contract. No pause, no freeze, no tax, no fee. |
| Look up other people's wallets by name | — | Never. `checkIn` stores only a keccak256 hash of the caller's *own* `.ai` name, supplied voluntarily; the gate is `balanceOf`, nothing else. |

## Repo layout

```
contracts/MintGate.sol       # the submission (single file, no dependencies)
contracts/MockAgentID.sol    # TEST-ONLY mock registry (local tests only, never deployed to BSC)
test/test-mintgate.js         # 37 assertions on local ganache (chainId 56)
test/gas-report.json          # measured gas (deploy 997,352; checkIn 118,070; reserveSlot 80,381)
scripts/verify-mints.js      # BSC mainnet verification of the 5 curated mints (read-only)
scripts/verification.json    # results of the above
scripts/build-deploy-artifacts.js  # init code + CREATE2 factory calldata + predicted address
scripts/deploy-preview.sh    # baw preview of the factory deploy (read-only preview step)
scripts/mint-registration-calls.js # baw preview commands for registerMint x5
build/                       # compiled ABI + bytecode + init code (generated)
deploy-artifacts.json        # factory, salt, predicted address, calldata, gas budget
curation.json / CURATION.md  # the 5 launch mints + audit hashes + evidence
frontend/index.html          # static read-only site (+ MintGate.abi.json)
DEPLOY.md                    # deploy path B (Agentic Wallet, primary) + path A (MetaMask, backup)
```

## Build & test

```bash
npm install
npx ganache --port 8546 --chain.chainId 56 --logging.quiet &   # separate shell
node test/test-mintgate.js                                     # expect: 37 passed, 0 failed
```

Compiler: solc-js 0.8.30, optimizer 200 runs, `evmVersion: paris` (no PUSH0 —
safest for BSC + Remix + BscScan verification). Tests run on ganache with chainId 56.

## Deploy

See **`DEPLOY.md`**. Primary path: Agentic Wallet (devMode active until 25 Nov 2026
21:13 WIB) via the deterministic deployment proxy factory — CREATE2 address is
already predicted and simulated on mainnet:
**`0x6254543dB7C211369E988BEd8ec7C82fdb89FBfc`**. Backup path: MetaMask + Remix.
Nothing in this repo deploys or spends anything on its own.

## Gas (measured, 18 Nov 2026)

BSC gas price at measurement: **0.05 gwei**. BNB ≈ $586.

| Action | Gas | @ 0.05 gwei | @ 1 gwei |
|---|---|---|---|
| Deploy (via factory, +~100k overhead) | ~1,100,000 | ~$0.03 | ~$0.65 |
| `checkIn` | 118,070 | ~$0.0035 | ~$0.07 |
| `reserveSlot` | 80,381 | ~$0.002 | ~$0.05 |
| `registerMint` | 164,539 | ~$0.005 | ~$0.10 |

The Agentic Wallet holds **0.000831 BNB (~$0.49)** — the deploy fits only while gas
is ≲ 0.7 gwei. See `DEPLOY.md` for the funding analysis.

## Hackathon red-line compliance

1. No web QR login / pairing codes / session storage — frontend has no login at all.
2. No bypassing user confirmation — every transaction is previewed and confirmed by the user in the Binance app.
3. No unauthorized transfers — the contract moves no funds, ever.
4. Contracts open-source, owner permissions documented — this file + NatSpec in the contract.
5. No Binance/BNB brand impersonation — name "MintGate", no Binance/BNB marks.
6. No seed phrases / private keys / API secrets / pairing codes collected — none, anywhere.
7. No promised returns — the site states free mints are not income and not investment advice.
8. Trading products must show risk warnings — MintGate is not a trading product, but the site still carries a risk warning.
9. Agent ID is never used to look up other people's wallets — gate only, by `balanceOf`.
10. No fake volume / mass fake accounts — distribution is organic posting only.

## License

MIT — see `LICENSE`.
