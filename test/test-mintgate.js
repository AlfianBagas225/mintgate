'use strict';
/* MintGate local test: compile with solc-js, deploy on in-process ganache,
 * simulate the full agent flow (holder / non-holder / loss-of-ID / owner).
 * Exit 0 only if EVERY assertion passes. Writes build artifacts + gas report.
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const ganache = require('ganache');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
fs.mkdirSync(BUILD, { recursive: true });

const AGENT_REGISTRY_MAINNET = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

function compile() {
  const input = {
    language: 'Solidity',
    sources: {
      'MintGate.sol': { content: fs.readFileSync(path.join(ROOT, 'contracts', 'MintGate.sol'), 'utf8') },
      'MockAgentID.sol': { content: fs.readFileSync(path.join(ROOT, 'contracts', 'MockAgentID.sol'), 'utf8') },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris', // no PUSH0: safest for BSC + Remix + BscScan verification
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  const warnings = (out.errors || []).filter((e) => e.severity === 'warning');
  for (const w of warnings) console.log('WARN:', w.formattedMessage.split('\n')[0]);
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error('compile failed');
  }
  return out.contracts;
}

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}
async function reverts(promise, name) {
  try {
    const tx = await promise;
    // state-changing call mined: a revert shows up as receipt status 0
    if (tx && typeof tx.wait === 'function') {
      const rc = await tx.wait();
      check(name, rc.status === 0, `(tx mined, status ${rc.status})`);
    } else {
      check(name, false, '(returned without reverting)');
    }
  } catch (e) { check(name, /revert|call revert|execution reverted/i.test(e.message || ''), `(err: ${(e.message || '').slice(0, 80)})`); }
}

async function main() {
  const contracts = compile();
  const mg = contracts['MintGate.sol'].MintGate;
  const mock = contracts['MockAgentID.sol'].MockAgentID;

  // write artifacts (MintGate only is the submission; mock is test-only)
  fs.writeFileSync(path.join(BUILD, 'MintGate.abi.json'), JSON.stringify(mg.abi, null, 2));
  fs.writeFileSync(path.join(BUILD, 'MintGate.bytecode.txt'), '0x' + mg.evm.bytecode.object);
  fs.writeFileSync(path.join(BUILD, 'MintGate.deployedBytecode.txt'), '0x' + mg.evm.deployedBytecode.object);
  console.log(`compiled: MintGate bytecode ${(mg.evm.bytecode.object.length - 2) / 2} bytes`);

  const rpcUrl = process.env.MINTGATE_RPC_URL || 'http://127.0.0.1:8546';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    await runTests(provider, mg, mock);
  } finally {
    // server lifecycle is owned by the caller (ganache CLI process)
  }
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log(`mainnet Agent ID registry (constructor arg for deploy): ${AGENT_REGISTRY_MAINNET}`);
  process.exit(fail ? 1 : 0);
}

async function runTests(provider, mg, mock) {
  const [owner, holderA, holderB, stranger] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const ownerAddr = await owner.getAddress();
  const holderAAddr = await holderA.getAddress();
  const holderBAddr = await holderB.getAddress();
  const strangerAddr = await stranger.getAddress();

  // deploy mock registry, mint Agent IDs to A and B
  const MockFactory = new ethers.ContractFactory(mock.abi, '0x' + mock.evm.bytecode.object, owner);
  const registry = await MockFactory.deploy();
  await registry.waitForDeployment();
  await (await registry.mint(holderAAddr)).wait();
  await (await registry.mint(holderBAddr)).wait();
  check('mock: holderA balanceOf == 1', (await registry.balanceOf(holderAAddr)) === 1n);
  check('mock: stranger balanceOf == 0', (await registry.balanceOf(strangerAddr)) === 0n);

  // deploy MintGate (registry = mock, owner = deployer)
  const MgFactory = new ethers.ContractFactory(mg.abi, '0x' + mg.evm.bytecode.object, owner);
  const gate = await MgFactory.deploy(await registry.getAddress(), ownerAddr);
  const deployReceipt = await (await gate.deploymentTransaction().wait());
  await gate.waitForDeployment();
  const gateAddr = await gate.getAddress();
  console.log(`deployed MintGate at ${gateAddr} (local)`);

  check('constructor: agentIdRegistry stored', (await gate.agentIdRegistry()).toLowerCase() === (await registry.getAddress()).toLowerCase());
  check('constructor: owner == deployer', (await gate.owner()).toLowerCase() === ownerAddr.toLowerCase());
  check('constructor: checkInCount == 0', (await gate.checkInCount()) === 0n);
  check('isAgent(holderA) == true', await gate.isAgent(holderAAddr));
  check('isAgent(stranger) == false', !(await gate.isAgent(strangerAddr)));

  // --- checkIn ---
  await reverts(gate.connect(stranger).checkIn(ethers.ZeroHash), 'checkIn: non-holder reverts');
  const nameHashA = ethers.keccak256(ethers.toUtf8Bytes('schizo.ai'));
  const txIn = await gate.connect(holderA).checkIn(nameHashA);
  const rcIn = await txIn.wait();
  check('checkIn: holderA succeeds, count == 1', (await gate.checkInCount()) === 1n);
  check('checkIn: hasCheckedIn(A) == true', await gate.hasCheckedIn(holderAAddr));
  check('checkIn: name hash stored', (await gate.agentNameHash(holderAAddr)) === nameHashA);
  check('checkIn: emits CheckedIn', rcIn.logs.some((l) => { try { return gate.interface.parseLog(l).name === 'CheckedIn'; } catch { return false; } }));
  await reverts(gate.connect(holderA).checkIn(nameHashA), 'checkIn: second check-in reverts');

  // anonymous check-in (bytes32(0)) works for holderB
  await (await gate.connect(holderB).checkIn(ethers.ZeroHash)).wait();
  check('checkIn: anonymous (0x0 hash) allowed, count == 2', (await gate.checkInCount()) === 2n);

  // --- registerMint (owner) ---
  const auditHash = ethers.keccak256(ethers.toUtf8Bytes('MINTS:89:Worldygg Tree'));
  await reverts(gate.connect(holderA).registerMint(holderAAddr, 'X', 89, auditHash), 'registerMint: non-owner reverts');
  const txReg = await gate.registerMint('0x2ED9E0a6992BA22B48c2fc2def6bB2365301A0D0', 'Worldygg Tree', 89, auditHash);
  const rcReg = await txReg.wait();
  check('registerMint: owner succeeds, totalMints == 1', (await gate.totalMints()) === 1n);
  const m0 = await gate.getMint(0);
  check('getMint: fields stored', m0.mintContract.toLowerCase() === '0x2ed9e0a6992ba22b48c2fc2def6bb2365301a0d0' && m0.name === 'Worldygg Tree' && m0.score === 89n && m0.active === true);
  check('registerMint: emits MintRegistered', rcReg.logs.some((l) => { try { return gate.interface.parseLog(l).name === 'MintRegistered'; } catch { return false; } }));
  await reverts(gate.getMint(99), 'getMint: out of range reverts');

  // --- reserveSlot ---
  await reverts(gate.connect(stranger).reserveSlot(0), 'reserveSlot: never-checked-in stranger reverts');
  const txRes = await gate.connect(holderA).reserveSlot(0);
  const rcRes = await txRes.wait();
  check('reserveSlot: holderA succeeds', (await gate.hasReserved(0, holderAAddr)) === true);
  check('reserveSlot: reservedCount == 1', (await gate.getMint(0)).reservedCount === 1n);
  check('reserveSlot: emits SlotReserved', rcRes.logs.some((l) => { try { return gate.interface.parseLog(l).name === 'SlotReserved'; } catch { return false; } }));
  await reverts(gate.connect(holderA).reserveSlot(0), 'reserveSlot: duplicate reservation reverts');
  await reverts(gate.connect(holderA).reserveSlot(99), 'reserveSlot: unknown mintId reverts');

  // holderB loses Agent ID -> reserveSlot must fail even though checked in
  await (await registry.connect(holderB).transfer(strangerAddr, 2)).wait();
  check('setup: holderB balanceOf == 0 after transfer', (await registry.balanceOf(holderBAddr)) === 0n);
  await reverts(gate.connect(holderB).reserveSlot(0), 'reserveSlot: ex-holder (ID lost) reverts');

  // deactivate listing -> reserve fails; reactivate -> works
  await (await gate.setMintActive(0, false)).wait();
  check('setMintActive(false): active == false', (await gate.getMint(0)).active === false);
  await reverts(gate.connect(holderA).reserveSlot(0), 'reserveSlot: inactive mint reverts (already-reserved user hits MintNotActive first)');
  await (await gate.setMintActive(0, true)).wait();
  // holderA already reserved; use a fresh holder for reactivated mint
  const holderC = await provider.getSigner(4);
  const holderCAddr = await holderC.getAddress();
  await (await registry.mint(holderCAddr)).wait();
  await (await gate.connect(holderC).checkIn(ethers.ZeroHash)).wait();
  await (await gate.connect(holderC).reserveSlot(0)).wait();
  check('reserveSlot: works again after reactivation', (await gate.getMint(0)).reservedCount === 2n);

  // --- no funds: contract has no payable function; sending BNB reverts ---
  await reverts(owner.sendTransaction({ to: gateAddr, value: ethers.parseEther('0.001') }), 'funds: sending BNB to contract reverts (no receive/fallback)');
  check('funds: contract balance == 0', (await provider.getBalance(gateAddr)) === 0n);

  // --- ownership ---
  await reverts(gate.connect(holderA).transferOwnership(holderAAddr), 'transferOwnership: non-owner reverts');
  await (await gate.transferOwnership(holderAAddr)).wait();
  check('transferOwnership: owner == holderA', (await gate.owner()).toLowerCase() === holderAAddr.toLowerCase());
  await reverts(gate.registerMint(holderBAddr, 'Y', 85, auditHash), 'registerMint: old owner can no longer register');
  await (await gate.connect(holderA).renounceOwnership()).wait();
  check('renounceOwnership: owner == 0x0', (await gate.owner()) === ethers.ZeroAddress);
  await reverts(gate.connect(holderA).registerMint(holderBAddr, 'Y', 85, auditHash), 'registerMint: renounced owner reverts');

  // --- gas report ---
  const gas = {
    deploy: Number(deployReceipt.gasUsed),
    checkIn: Number(rcIn.gasUsed),
    reserveSlot: Number(rcRes.gasUsed),
    registerMint: Number(rcReg.gasUsed),
    note: 'ganache local; BSC gas price measured separately (see DEPLOY.md)',
  };
  fs.writeFileSync(path.join(ROOT, 'test', 'gas-report.json'), JSON.stringify(gas, null, 2));
  console.log('\nGAS (local):', JSON.stringify(gas));
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
