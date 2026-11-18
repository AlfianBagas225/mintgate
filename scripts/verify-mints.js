'use strict';
/* Verify the 5 curated free mints against BSC mainnet (READ-ONLY):
 *  - eth_getCode: contract is live
 *  - eth_call of the zero-value mint function FROM the Agentic Wallet
 *    address (which holds an Agent ID): proves the free mint does not
 *    revert for an Agent ID holder right now.
 * Writes scripts/verification.json. Exit 0 only if ALL 5 pass.
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPCS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.bnbchain.org/',
  'https://bsc-dataseed2.bnbchain.org/',
];
const AGENTIC_WALLET = '0x00139A62B5800B1F58920ff5fB0944e955b3526A';

const MINTS = [
  { name: 'Worldygg Tree', contract: '0x2ED9E0a6992BA22B48c2fc2def6bB2365301A0D0', score: 89, fn: 'mint(uint256)', args: [1] },
  { name: 'AgentPad Pass', contract: '0x01c106835091c09D5c69737631Af133530093C89', score: 89, fn: 'mint()', args: [] },
  { name: 'M3MO Genesis', contract: '0x08BE8a0727b6fc801171c1F4F4Dd547EA44Ca339', score: 89, fn: 'mint()', args: [] },
  { name: 'Dreadnought', contract: '0x8d0619c59418ed042e43838bb6e83038303d27f6', score: 85, fn: 'mint(uint256)', args: [1] },
  { name: 'Mine Card', contract: '0xF8A72C4538Cd9d570B2C771f01A0d561a90A64Eb', score: 85, fn: 'mintCard(uint256)', args: [1] },
];

async function getProvider() {
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      console.log('RPC OK:', url);
      return p;
    } catch (e) { console.log('RPC fail:', url, '-', (e.message || '').slice(0, 60)); }
  }
  throw new Error('no working BSC RPC');
}

async function main() {
  const provider = await getProvider();
  const results = [];
  let allOk = true;
  for (const m of MINTS) {
    const r = { name: m.name, contract: m.contract, score: m.score, fn: m.fn };
    try {
      const code = await provider.getCode(m.contract);
      r.codeBytes = (code.length - 2) / 2;
      r.live = r.codeBytes > 0;
      const iface = new ethers.Interface([`function ${m.fn}`]);
      const data = iface.encodeFunctionData(m.fn.split('(')[0], m.args);
      const sim = await provider.call({ to: m.contract, from: AGENTIC_WALLET, value: 0, data });
      r.simOk = true;
      r.simReturn = sim.slice(0, 66);
    } catch (e) {
      r.simOk = false;
      r.simError = (e.message || String(e)).slice(0, 200);
    }
    r.ok = r.live && r.simOk;
    if (!r.ok) allOk = false;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${m.name} (${m.contract}) code=${r.codeBytes || 0}B sim=${r.simOk ? 'OK ' + (r.simReturn || '') : 'REVERT: ' + (r.simError || '')}`);
    results.push(r);
  }
  fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), from: AGENTIC_WALLET, results }, null, 2));
  console.log(allOk ? '\nALL 5 MINTS VERIFIED (live + zero-value sim OK from Agent ID wallet)' : '\nSOME MINTS FAILED — see verification.json');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
