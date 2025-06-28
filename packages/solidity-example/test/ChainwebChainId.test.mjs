import js from '@eslint/js';
import { expect } from 'chai';
import pkg from 'hardhat';
import { Wallet, getBytes, keccak256, AbiCoder, ethers, randomBytes, } from 'ethers';
// import ethers from 'ethers';

// import { getSigners, } from './utils/utils.js';

const { network, chainweb } = pkg;

describe('ChainwebChainId Tests', async function () {
  it('Should return the chainweb chain id', async function () {
    for (const chainId of await chainweb.getChainIds()) {
      await chainweb.switchChain(chainId);
      const cid = network.config.chainwebChainId;
      const a = await chainweb.callChainIdContract();
      expect(a).to.equal(cid);
    }
  });
});

/* *************************************************************************** */
/* Utilities */

const chainwebConfig = pkg.config.chainweb[pkg.config.defaultChainweb];
const redeemAddress = chainwebConfig.precompiles.redeem;

const HARTHAT = pkg.network.name.includes('hardhat');
console.log(pkg.network.name, HARTHAT, await chainweb.getChainIds());

var [CHAIN_0, CHAIN_1, ...CHAIN_IDS] = await chainweb.getChainIds();

async function getSigners() {
  const [deployer, alice, bob, carol] = await pkg.ethers.getSigners();
  return {
    deployer,
    alice,
    bob,
    carol,
  };
}

async function getSigner(name = 'deployer') {
  const signers = await getSigners();
  switch (name) {
    case 'deployer':
      return signers.deployer;
    case 'alice':
      return signers.alice;
    case 'bob':
      return signers.bob;
    case 'carol':
      return signers.carol;
    default:
      throw new Error(`Unknown signer: ${name}`);
  }
}

const coder = AbiCoder.defaultAbiCoder()

async function ethCall(to, input) {
  console.log(`Calling contract ${to} with input:`, input);
  const result = await pkg.ethers.provider.send('eth_call', [
    { to, input },
    'latest',
  ]);
  console.log("result:", result);
  return result;
}

async function getStorageAt(address, slot) {
  console.log(`Getting storage at address ${address} and slot ${slot}`);
  const result = await pkg.ethers.provider.send('eth_getStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
  ]);
  console.log("Storage at slot:", slot, result);
  return result;
}

async function setStorageAt(address, slot, value) {
  console.log(`Setting storage at address ${address}, slot ${slot}, value ${value}`);
  await pkg.ethers.provider.send('hardhat_setStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
    coder.encode(['uint256'], [value]),
  ]);
}

async function updateHeaderOracle(block) {
  const slot = parseInt(block.timestamp, 16) % 0x001fff;
  const t = coder.encode(['uint256'], [block.timestamp]);
  await setStorageAt(beaconHeaderOracle, slot, t);
  await setStorageAt(beaconHeaderOracle, slot + 0x001fff, block.parentBeaconBlockRoot);
}

/* *************************************************************************** */
/* EIP-4788 Header Oracle Tests */

// EIP-4788 Header Oracle address
const beaconHeaderOracle = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";

describe('EIP-4788 Header Oracle Tests', async function () {
  it('Should call the beacon header contract', async function () {
    await chainweb.switchChain(CHAIN_0);
    await pkg.network.provider.send('evm_mine', []);

    const code = await pkg.ethers.provider.getCode(beaconHeaderOracle);
    console.log('Beacon Header Oracle Code:', code);

    const block = await pkg.ethers.provider.send('eth_getBlockByNumber', ['latest', false]);
    const parent = await pkg.ethers.provider.send('eth_getBlockByNumber', [block.number - 1, false]);
    console.log('Block:', block);
    console.log('Parent:', parent);

    const t = coder.encode(['uint256'], [parent.timestamp])
    const slot = parseInt(parent.timestamp, 16) % 0x001fff
    console.log('Slot:', slot);

    await getStorageAt(beaconHeaderOracle, slot);
    await setStorageAt(beaconHeaderOracle, slot, t);
    await getStorageAt(beaconHeaderOracle, slot + 0x001fff);
    await setStorageAt(beaconHeaderOracle, slot + 0x001fff, parent.parentBeaconBlockRoot);
    const result = await ethCall(beaconHeaderOracle, t);
    expect(result).to.equal(parent.parentBeaconBlockRoot);
  });
});

/* *************************************************************************** */
/* Redeem Tests */

describe('XChan Tests', async function () {
  it('Should create an XChan', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    console.log('XChan ID:', xChan.xChanId);
  });

  it('Should create redeem parameters for an XChan', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    const redeemParams = await xChanRedeemParams(xChan, xChan.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan Redeem Parameters:', redeemParams);
  });

  it('Should revert when redeeming an unfunded XChan', async function () {
    const signers = await getSigners();
    const nonce = randomBytes(4);
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address], nonce);
    // reverts with code 0x9
    await expect(receiveXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1')))
      .to.be.reverted;
  });

  it("Should fund a XChan on two chains", async function () {
    const signers0 = await getSigners()
    const xChan0 = createXChanOn0([signers0.alice.address, signers0.bob.address]);
    // This internally checks that balances are updated correctly
    await sendXChan(xChan0, 'alice', ethers.parseEther('1'));
    await sendXChan(xChan0, 'alice', ethers.parseEther('2'));

    await chainweb.switchChain(CHAIN_1);
    const signers1 = await getSigners();
    const xChan1 = createXChanOn1([signers1.alice.address, signers1.bob.address]);
    // This internally checks that balances are updated correctly
    await sendXChan(xChan1, 'alice', ethers.parseEther('1'));
    await sendXChan(xChan1, 'alice', ethers.parseEther('2'));
  });

  it('Should redeem an XChan to the first target account on first chain', async function () {
    const signers = await getSigners();
    const xChan0 = createXChanOn0([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan0, 'deployer', ethers.parseEther('1'));
    const result = await receiveAndCheckXChan(xChan0, xChan0.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan Redeem Result:', result);
  });

  it('Should redeem an XChan to the first target account on second chain', async function () {
    const signers = await getSigners();
    const xChan1 = createXChanOn1([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan1, 'deployer', ethers.parseEther('1'));
    const result = await receiveAndCheckXChan(xChan1, xChan1.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan Redeem Result:', result);
  });

  it('Should redeem an XChan to the second target account', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan, 'deployer', ethers.parseEther('1'));
    const result = await receiveAndCheckXChan(xChan, xChan.targetAccounts[1], ethers.parseEther('1'));
    console.log('XChan Redeem Result:', result);
  });

  it('Should be able to redeem more than once from an XChan', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan, 'deployer', ethers.parseEther('2'));
    const result0 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan First Redeem Result:', result0);
    const result1 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan Second Redeem Result:', result1);
  });

  it('Should be able to redeem more than once from an XChan to different accounts', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan, 'deployer', ethers.parseEther('2'));
    const result0 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan First Redeem Result:', result0);
    const result1 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[1], ethers.parseEther('1'));
    console.log('XChan Second Redeem Result:', result1);
  });

  it('Should be able to redeem more than once from an XChan with the same proof to the same account', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address]);
    await sendXChan(xChan, 'deployer', ethers.parseEther('2'));
    const proof = await xChanProof(xChan, xChan.targetAccounts[0]);
    const result0 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'), proof);
    console.log('XChan First Redeem Result:', result0);
    const result1 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'), proof);
    console.log('XChan Second Redeem Result:', result1);
  });

  it('Should revert when redeeming more than what is available in the XChan', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    await sendXChan(xChan, 'deployer', ethers.parseEther('2'));
    const result0 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1'));
    console.log('XChan First Redeem Result:', result0);
    const result1 = await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('0.5'));
    console.log('XChan Second Redeem Result:', result1);

    // drain the XChan to 0.5 ETH
    // FIXME: query the redeemed amount from the contract
    const redeemed = await signers.bob.provider.getBalance(xChan.address);
    const drainAmount = ethers.parseEther('4') - ethers.parseEther('0.5');
    await receiveAndCheckXChan(xChan, xChan.targetAccounts[0], drainAmount);

    // reverts with code 0x9
    await expect(receiveXChan(xChan, xChan.targetAccounts[0], ethers.parseEther('1')))
      .to.be.reverted;
  });

  it('Should fail to create proof for an unauthorized account', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    expect(xChanRedeemParams(xChan, signers.alice.address, ethers.parseEther('1')))
      .to.throw;
  });

  // TODO: create a proof with a valid signature but non-existing root hash
  // it('Should revert when redeeming an XChan to an invalid root hash', async function () {
  // });

  it('Should revert when redeeming an XChan with the wrong root hash timestamp', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    const proof = await xChanRedeemParams(xChan, signers.alice.address, ethers.parseEther('1'));
    const badProof = proof.slice(0, 452) + '0000';
    // reverts with code 0x7
    await expect(signers.alice.sendTransaction({
      to: redeemAddress,
      data: badProof,
    })).to.be.reverted;
  });
  it('Should revert when redeeming an XChan with a proof of wrong size', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    const proof = await xChanRedeemParams(xChan, signers.alice.address, ethers.parseEther('1'));
    const badProof = proof.slice(0, 200) + proof.slice(202);
    // reverts with code 0x1
    await expect(signers.alice.sendTransaction({
      to: redeemAddress,
      data: badProof,
    })).to.be.reverted;
  });

  it('Should revert when redeeming an XChan with an invalid proof', async function () {
    const signers = await getSigners();
    const xChan = createXChanOn0([signers.alice.address, signers.bob.address]);
    const proof = await xChanRedeemParams(xChan, signers.alice.address, ethers.parseEther('1'));
    const badProof = proof.slice(0, 200) + '00' + proof.slice(202);
    // reverts with code 0x6
    await expect(signers.alice.sendTransaction({
      to: redeemAddress,
      data: badProof,
    })).to.be.reverted;
  });
});

/* *************************************************************************** */
/* Test Methods */

function createXChanOn0(targetAccounts, nonce = "0x123456") {
  return createXChan(CHAIN_0, CHAIN_1, targetAccounts, nonce);
}

function createXChanOn1(targetAccounts, nonce = "0x123456") {
  return createXChan(CHAIN_1, CHAIN_0, targetAccounts, nonce);
}

function createXChan(sourceChainId, targetChainId, targetAccounts, nonce = "0x123456") {
  const xChan = new XChan(targetChainId, targetAccounts, sourceChainId, nonce);
  console.log("xChan address:", xChan.address);
  return xChan;
}

async function sendXChan(xChan, signer, amount) {
  await chainweb.switchChain(xChan.sourceChainId);
  const sender = await getSigner(signer);
  const oldBalance = await sender.provider.getBalance(xChan.address);
  const tx = await sender.sendTransaction({
    to: xChan.address,
    value: amount,
  });
  const receipt = await tx.wait();
  console.log(`Sent ${amount} wei to XChan ${xChan.address} on chain ${xChan.sourceChainId}`);
  const newBalance = await sender.provider.getBalance(xChan.address);
  expect(newBalance).to.equal(oldBalance + amount);
  return receipt;
}

async function xChanRedeemParams(xChan, receiver, amount, proof = null) {
  if (!proof) {
    proof = await xChanProof(xChan, receiver);
  }
  return ethers.concat([
    getBytes(ethers.toBeHex(amount, 32)),
    proof
  ]);
}

async function xChanProof(xChan, receiver) {
  const proofKey = '0xef69d5fcb4e94dd638d7fe71cb4da99a679bb817ca706340b3901c1139f50a90';
  const proverWallet = new Wallet(proofKey);

  // TODO:
  // 1. Obtain xChan balance from source chain
  // 2. Check that the balance is available/included in the root block
  // 3. double check that the XChan ID is correct

  await chainweb.switchChain(xChan.sourceChainId);
  const srcChainSender = (await getSigners()).deployer;
  const xChanBalance = await srcChainSender.provider.getBalance(xChan.address);

  // This is how we guarantee for the hardhat network that the proof is available.
  if (HARTHAT) {
    await pkg.network.provider.send('evm_mine', []);
  }

  await chainweb.switchChain(xChan.targetChainId);
  const targetChainSender = (await getSigners()).deployer;
  const block = await targetChainSender.provider.send('eth_getBlockByNumber', ['latest', false]);
  const proofRoot = block.parentBeaconBlockRoot;
  const rootTimestamp = block.timestamp;

  const proof = createProof(
    proverWallet,
    xChan,
    receiver,
    xChanBalance,
    proofRoot,
    rootTimestamp,
  );
  if (HARTHAT) {
    await updateHeaderOracle(block);
  }
  return proof;
}

async function receiveXChan(xChan, receiverAddress, amount, proof = null) {
  const params = await xChanRedeemParams(xChan, receiverAddress, amount, proof);
  await chainweb.switchChain(xChan.targetChainId);
  const sender = (await getSigners()).deployer;
  const tx = await sender.sendTransaction({
    to: redeemAddress,
    data: params,
  });
  const result = await tx.wait();
  return result;
}

async function receiveAndCheckXChan(xChan, receiverAddress, amount, proof = null) {
  await chainweb.switchChain(xChan.targetChainId);
  const sender = (await getSigners()).deployer;
  const oldBalance = await sender.provider.getBalance(receiverAddress);
  await receiveXChan(xChan, receiverAddress, amount, proof);
  const newBalance = await sender.provider.getBalance(receiverAddress);
  expect(newBalance).to.equal(oldBalance + amount);
  console.log(`Received ${amount} wei from ${sender.address} to ${receiverAddress}`);
  return newBalance;
}

/* *************************************************************************** */
/* XChans */

const VERSION = 0;

const TagInner = 0;
const TagVersion = 1;
const TagTrgChain = 2;
const TagData = 3;
const TagPolicy = 4;

function uint16Le(value) {
  const value_ = ethers.getNumber(value, "value");
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint16(0, value_, true);
  return new Uint8Array(buf);
}
function uint32Le(value) {
  const value_ = ethers.getNumber(value, "value");
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, value_, true);
  return new Uint8Array(buf);
}
function uint64Le(value) {
  const value_ = ethers.getNumber(value, "value");
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint64(0, value_, true);
  return new Uint8Array(buf);
}

function merkleHash(bytes) {
  return ethers.sha256(getBytes(bytes));
}

function merkleNode(tag, bytes) {
  const tagged = ethers.concat([
    uint16Le(tag),
    getBytes(bytes)
  ]);
  return merkleHash(tagged);
}

const emptyNode = merkleNode(TagInner, new Uint8Array());

function innerNode(left, right) {
  return merkleNode(TagInner, ethers.concat([getBytes(left), getBytes(right)]));
}

function merkleRoot(nodes) {
  const stack = [];
  var i = 0;
  while (i < 20) {
    i++;
    // console.log(`stack: ${stack.length}, nodes: ${nodes.length}`);
    if (stack.length == 1 && nodes.length == 0) {
      return stack.pop()[1];
    }
    if (stack.length > 1) {
      const [h0, n0] = stack.at(-1);
      const [h1, n1] = stack.at(-2);
      // console.log(`    h0: ${h0}, n0: ${n0}\n    h1: ${h1}, n1: ${n1}`);
      if (h0 === h1) {
        stack.pop();
        stack.pop();
        stack.push([h0 + 1, innerNode(n1, n0)]);
        continue;
      }
    }
    if (nodes.length > 0) {
      stack.push([0, nodes.shift()]);
      continue;
    }
    if (nodes.length == 0) {
      stack.push([0, emptyNode]);
      continue;
    }
  }
}

function encodeChainId(chainId) {
  return uint32Le(chainId);
}

function encodeVersion(version) {
  return uint16Le(version);
}

function encodeData(chainId, nonce) {
  const nonceBytes = getBytes(nonce);
  return ethers.concat([
    encodeChainId(chainId),
    nonceBytes
  ]);
}

function encodeTargetAccountPolicy(account) {
  const accountBytes = getBytes(account);
  const trgAccountPolicyTag = uint32Le(0);
  const size = uint32Le(accountBytes.length);
  return ethers.concat([trgAccountPolicyTag, size, accountBytes]);
}

class XChan {
  constructor(targetChainId, targetAccounts, sourceChainId, nonce) {
    this.sourceChainId = sourceChainId;
    this.targetChainId = targetChainId;
    this.targetAccounts = targetAccounts;
    this.nonce = nonce;
    this.xChanId = this.root();
  }

  get address() {
    return ethers.getAddress(ethers.dataSlice(this.xChanId, 12));
  }

  root() {
    const nodes = [
      merkleNode(TagVersion, encodeVersion(VERSION)),
      merkleNode(TagTrgChain, encodeChainId(this.targetChainId)),
      merkleNode(TagData, encodeData(this.sourceChainId, this.nonce)),
    ].concat(this.targetAccounts.map(account =>
      merkleNode(TagPolicy, encodeTargetAccountPolicy(account))
    ));
    return merkleRoot(nodes);
  }
}

/* Create a proof for the xChan.
 *
 * The xChanBalance and proofRoot must be correct. This is not checked. The
 * root timestamp is not a requirement for soundness, however, proof
 * verification will fail if it is not correct.
 *
 * NOTE, that the inclusion of the amount in the proof is a bug The specs do
 * not require this. Future version will not include the amount in the proof.
 */
function createProof(proverWallet, xChan, targetAccount, xChanBalance, proofRoot, rootTimestamp) {
  // check that targetAccount is in the targetAccounts list
  if (!xChan.targetAccounts.includes(targetAccount)) {
    throw new Error(`Target account ${targetAccount} is not in the target accounts list`);
  }

  // The proof uses an EVM specific encoding:
  const msg = ethers.concat([
    getBytes(ethers.toBeHex(VERSION, 2)),
    getBytes(ethers.toBeHex(xChan.targetChainId, 4)),
    getBytes(targetAccount),
    getBytes(ethers.toBeHex(xChanBalance, 32)),
    getBytes(xChan.xChanId),
    getBytes(proofRoot),
  ]);
  const digest = keccak256(getBytes(msg));

  const sig = proverWallet.signingKey.sign(digest)
  const proof = ethers.concat([
    msg,
    getBytes(ethers.toBeHex(sig.v, 1)),
    getBytes(sig.r),
    getBytes(sig.s),
    getBytes(ethers.toBeHex(rootTimestamp, 8))
  ]);
  return proof;
}
