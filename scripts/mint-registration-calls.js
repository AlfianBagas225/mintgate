'use strict';
/* Print the 5 baw contract-call preview commands that register the curated
 * mints on the deployed MintGate (one preview per mint; each needs its own
 * execute + boss approval in the Binance app). READ-ONLY output: prints
 * commands, executes nothing. Run AFTER deploy, with the live MintGate address.
 * Usage: node scripts/mint-registration-calls.js [mintgate-address]
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GATE = process.argv[2]
  || JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy-artifacts.json'), 'utf8')).predictedAddressCREATE2;
const OWNER = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy-artifacts.json'), 'utf8')).constructorArgs.initialOwner;
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'MintGate.abi.json'), 'utf8'));
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'curation.json'), 'utf8'));
const iface = new ethers.Interface(abi);

console.log(`# MintGate: ${GATE}\n# Owner (from): ${OWNER}\n# Run each preview, then execute its requestId (boss approves in-app).\n`);
for (const m of curation.mints) {
  const data = iface.encodeFunctionData('registerMint', [m.contract, m.name, m.score, m.auditHash]);
  console.log(`# mintId ${m.mintId} — ${m.name} (score ${m.score}, audit ${m.auditHash.slice(0, 18)}…)`);
  console.log(`baw contract-call preview --binanceChainId 56 --from ${OWNER} --to ${GATE} --value 0 --inputData ${data} --gasLimit 300000 --json\n`);
}
