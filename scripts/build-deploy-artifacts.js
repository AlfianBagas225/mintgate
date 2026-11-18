'use strict';
/* Build deploy artifacts for MintGate (NO deployment, NO signing, NO funds).
 *  - init code = creation bytecode + ABI-encoded constructor args
 *    (registry, initialOwner = Agentic Wallet)
 *  - CREATE2 deploy via the deterministic deployment proxy factory on BSC:
 *    verifies the factory interface on-chain (computeAddress eth_call),
 *    predicts the MintGate address, encodes the factory calldata.
 * Writes build/MintGate.initcode.txt + deploy-artifacts.json.
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const RPCS = ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.bnbchain.org/'];

const REGISTRY = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F'; // SPACE ID Agent ID
const OWNER = '0x00139A62B5800B1F58920ff5fB0944e955b3526A'; // Agentic Wallet (schizo.ai)
const FACTORY = '0x4e59b44847b379578588920ca78fbf26c0b4956c'; // deterministic deployment proxy
const SALT_LABEL = 'MintGate-v1';
const GAS = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'gas-report.json'), 'utf8'));

async function main() {
  const abi = JSON.parse(fs.readFileSync(path.join(BUILD, 'MintGate.abi.json'), 'utf8'));
  const bytecode = fs.readFileSync(path.join(BUILD, 'MintGate.bytecode.txt'), 'utf8').trim();
  const iface = new ethers.Interface(abi);
  const initCode = ethers.solidityPacked(['bytes', 'bytes'], [bytecode, iface.encodeDeploy([REGISTRY, OWNER])]);
  fs.writeFileSync(path.join(BUILD, 'MintGate.initcode.txt'), initCode);
  console.log('init code bytes:', (initCode.length - 2) / 2);

  const salt = ethers.keccak256(ethers.toUtf8Bytes(SALT_LABEL));
  const initCodeHash = ethers.keccak256(initCode);
  const predictedCreate2 = ethers.getCreate2Address(FACTORY, salt, initCodeHash);
  console.log('salt:', salt);
  console.log('initCodeHash:', initCodeHash);
  console.log('predicted MintGate (CREATE2):', predictedCreate2);

  // The proxy has NO ABI functions (69-byte Yul runtime: salt ++ initCode
  // as raw calldata -> CREATE2). Verify by simulating the deploy call
  // (read-only eth_call): a successful call returns the deployed address.
  const deployCalldata = ethers.concat([salt, initCode]);
  let factoryVerified = false;
  let factorySimAddress = null;
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      const ret = await p.call({ to: FACTORY, from: OWNER, value: 0, data: deployCalldata });
      factorySimAddress = ethers.getAddress('0x' + ret.slice(-40));
      factoryVerified = factorySimAddress.toLowerCase() === predictedCreate2.toLowerCase();
      console.log(`factory deploy-sim via ${url}: returned ${factorySimAddress} (match predicted: ${factoryVerified})`);
      break;
    } catch (e) { console.log('factory sim fail via', url, '-', (e.message || '').slice(0, 100)); }
  }
  const gas = {
    measuredDeployGasLocal: GAS.deploy,
    factoryOverheadBudget: 100000,
    suggestedGasLimit: 1200000,
    note: 'BSC gas price at measurement (18 Nov ~22:00 WIB): 0.05 gwei. At 0.05 gwei deploy ≈ $0.03; at 1 gwei ≈ $0.70 (EXCEEDS wallet BNB 0.000831 ≈ $0.49) — deploy only while gas ≤ ~0.7 gwei, or fund more BNB first.',
  };

  const artifacts = {
    contract: 'MintGate',
    solidity: '0.8.30 (solc-js), optimizer 200 runs, evmVersion paris',
    constructorArgs: { agentIdRegistry: REGISTRY, initialOwner: OWNER },
    factory: { address: FACTORY, name: 'deterministic deployment proxy (Arachnid, Yul runtime, no ABI fns)', howItWorks: 'calldata = salt (32 bytes) ++ initCode; proxy does CREATE2(salt, initCode) and returns the deployed address', saltLabel: SALT_LABEL, salt, initCodeHash },
    predictedAddressCREATE2: predictedCreate2,
    factoryDeploySimulatedOnChain: factoryVerified,
    factorySimAddress,
    deployCalldata,
    deployCalldataBytes: (deployCalldata.length - 2) / 2,
    gas,
    bawContractCall: {
      preview: `baw contract-call preview --binanceChainId 56 --from ${OWNER} --to ${FACTORY} --value 0 --inputData ${deployCalldata} --gasLimit 1200000 --json`,
      note: 'preview returns requestId; execute with: baw contract-call execute --requestId <id> --json. Expect PENDING_CONFIRMATION (abnormalTxnHandling=NeedConfirmation + devMode): boss approves in the Binance app; NEVER re-execute a pending order.',
    },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(ROOT, 'deploy-artifacts.json'), JSON.stringify(artifacts, null, 2));
  console.log('\nwrote build/MintGate.initcode.txt + deploy-artifacts.json');
  console.log('factory interface verified on-chain:', factoryVerified);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
