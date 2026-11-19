'use strict';
/* Register ONE curated mint on the live MintGate (preview -> execute).
 * Usage: node scripts/register-mint.js <mintId>
 * Reads curation.json + deploy-artifacts.json + build/MintGate.abi.json and
 * encodes registerMint(contract, name, score, auditHash) fresh with ethers.
 * Runs ONE `baw contract-call preview`, then executes its requestId ONCE.
 * Prints the execute result JSON. If the execute comes back
 * PENDING_CONFIRMATION, it stops here — the boss approves in the app;
 * never re-execute the same requestId.
 */
const { ethers } = require('ethers');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mintId = Number(process.argv[2]);
const artifacts = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy-artifacts.json'), 'utf8'));
const GATE = artifacts.predictedAddressCREATE2;
const OWNER = artifacts.constructorArgs.initialOwner;
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'MintGate.abi.json'), 'utf8'));
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, 'curation.json'), 'utf8'));
const m = curation.mints.find((x) => x.mintId === mintId);
if (!m) { console.error('mintId not found:', mintId); process.exit(1); }

const iface = new ethers.Interface(abi);
const data = iface.encodeFunctionData('registerMint', [m.contract, m.name, m.score, m.auditHash]);
console.log(`# mintId ${m.mintId} — ${m.name} (score ${m.score}, contract ${m.contract})`);
console.log(`# gate ${GATE} from ${OWNER}`);

const env = { ...process.env, PATH: `${process.env.HOME}/.local/npm/bin:${process.env.PATH}` };
const previewRaw = execFileSync('baw', ['contract-call', 'preview', '--binanceChainId', '56', '--from', OWNER, '--to', GATE, '--value', '0', '--inputData', data, '--gasLimit', '300000', '--json'], { env }).toString();
const preview = JSON.parse(previewRaw);
const requestId = preview.data.requestId;
console.log('requestId:', requestId);
const execRaw = execFileSync('baw', ['contract-call', 'execute', '--requestId', requestId, '--json'], { env }).toString();
console.log(execRaw);
