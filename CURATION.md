# MintGate launch curation — 5 verified free mints

**Curated:** 18 Nov 2026 ~22:00 WIB, from the MINTS feed
(`https://mints-bnb.pages.dev/projects.json`, 70 projects).
**Selection rule:** `status == free_live` AND `score >= 85` AND NOT `sold_out`
AND `risk_flags == []`. 28 projects qualified; these 5 were picked for the
launch list (highest scores + still-mintable free lots + Agent ID gate confirmed).

Machine-readable: `curation.json`. Verification script: `scripts/verify-mints.js`
(results: `scripts/verification.json`).

## The 5

| mintId | Mint | Score | Mint function | Terms | Minted / supply |
|---|---|---|---|---|---|
| 0 | [Worldygg Tree](https://bscscan.com/address/0x2ED9E0a6992BA22B48c2fc2def6bB2365301A0D0) | 89 | `mint(uint256)` | First Tree free, then $1.50 each. Up to 9 per wallet. | 20,264 / 99,999 |
| 1 | [AgentPad Pass](https://bscscan.com/address/0x01c106835091c09D5c69737631Af133530093C89) | 89 | `mint()` | Free mint pass. | 5,930 / 10,000 |
| 2 | [M3MO Genesis](https://bscscan.com/address/0x08BE8a0727b6fc801171c1F4F4Dd547EA44Ca339) | 89 | `mint()` | 1 free per Agent ID wallet. | — / 10,000 |
| 3 | [Dreadnought](https://bscscan.com/address/0x8d0619c59418ed042e43838bb6e83038303d27f6) | 85 | `mint(uint256)` | 2 free per Agent ID wallet (4,444 free pool), then 0.0005 BNB each, max 20. | 1,143 / 6,666 |
| 4 | [Mine Card](https://bscscan.com/address/0xF8A72C4538Cd9d570B2C771f01A0d561a90A64Eb) | 85 | `mintCard(uint256)` | 1st card free per Agent ID wallet, then 0.0005 BNB, max 20. | 1,353 / 8,888 |

## Verification performed (18 Nov 2026 ~22:03 WIB)

For **each** of the 5, all of these hold:

1. **MINTS feed:** `source_verified`, `zero_value_mint_simulated: true`,
   `agent_gate_confirmed_onchain: true`, `risk: low`, `risk_flags: []`, and
   checks `contract_live + source_verified + zero_value_mint_simulated +
   agent_id_gate_enforced + not_upgradeable + no_self_destruct + no_blacklist`
   all true.
2. **Live on BSC mainnet (our own check):** `eth_getCode` non-empty
   (6,784–14,048 bytes of runtime code).
3. **Zero-value mint sim (our own check):** `eth_call` of the mint function with
   value 0 **from the Agentic Wallet address** (`0x00139A62…3526A`, which holds
   an Agent ID — `balanceOf` verified = 1 on the registry) succeeded without
   revert. M3MO returned tokenId 6497, Mine Card returned 1386 — the calls
   would succeed on-chain.

## fastmint recon — honest note

`fastmint/recon.js` was run read-only for these contracts (18 Nov 22:03 WIB).
It returned almost nothing: its site fetch came back empty from this VM and its
`agentId` detector reported `NONE` for the Agentic Wallet — **contradicted by the
direct on-chain `balanceOf = 1`** for the same wallet. The simulation step was
therefore performed directly with ethers `eth_call` (results above), which is
the authoritative check. Recon is not a blocker for these listings; its agentId
detector needs investigation before it is trusted for gating decisions.

## Audit hash

Each listing's `auditHash` (stored on-chain by `registerMint`) is:

```
keccak256("MintGate-audit-v1|<contract-lower>|<name>|score=<score>|fn=<fn>
  |mints_feed=2026-11-18T15:00Z|sim=ok-from-agent-wallet|gate=agent_id_onchain
  |checks=live+source_verified+zero_value_sim+not_upgradeable+no_selfdestruct+no_blacklist")
```

Values are in `curation.json` (recomputable with ethers `keccak256`).

## Excluded deliberately

- **Glitchronin** (score 85, free_live): the team wallet already minted it
  (tokenId 1068, 18 Nov 08:08 WIB), so it is not a fresh opportunity for the
  team. It can be added later for other holders.
- Everything below score 85, anything with risk flags, anything sold out, and
  anything paid/featured. Watchlist candidates (score 70–84) may be shown
  later with a clear "not yet passed" label — never as verified listings.

## Maintenance

Re-verify a listing before registering it, and re-check listed mints daily
from the MINTS pipeline. If a mint dies, turns paid, or gains a risk flag,
the owner deactivates it with `setMintActive(mintId, false)` — existing
reservations and check-ins are unaffected.
