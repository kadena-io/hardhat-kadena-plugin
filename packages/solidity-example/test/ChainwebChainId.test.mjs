import js from '@eslint/js';
import { expect } from 'chai';
import pkg from 'hardhat';
import { Wallet, getBytes, keccak256, AbiCoder, ethers } from 'ethers';

import { getSigners, } from './utils/utils.js';

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
/* EIP-4788 Header Oracle Tests */

const coder = AbiCoder.defaultAbiCoder()

const beaconHeaderOracle = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";

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

describe('EIP-4788 Header Oracle Tests', async function () {
  it('Should call the beacon header contract', async function () {
    await chainweb.switchChain(0);
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

// TODO move to separate file

async function mkTestProof(receiver, amount) {

  const block = await pkg.ethers.provider.send('eth_getBlockByNumber', ['latest', false]);

  const sk = '0xef69d5fcb4e94dd638d7fe71cb4da99a679bb817ca706340b3901c1139f50a90';
  const wallet = new Wallet(sk);
  console.log('address:', wallet.address);

  const xChanBalance = ethers.parseEther('1');

  // this is probably not the right way to implement a binary encoding :-)
  const amount_ = amount.toString(16).padStart(64, '0');
  const version = (0).toString(16).padStart(4, '0');
  const targetChain = (0).toString(16).padStart(8, '0');
  const targetAccount = receiver.address.slice(2);
  const xChanBalance_ = xChanBalance.toString(16).padStart(64, '0');
  const xchanId = (4).toString(16).padStart(64, '0');
  const targetBlockHash = block.parentBeaconBlockRoot.slice(2).padStart(64, '0');
  const timestamp = block.timestamp.slice(2).padStart(16, '0');

  console.log('amount:', amount);

  console.log('block:', block);

  const msg = "0x"
    + amount_
    + version
    + targetChain
    + targetAccount
    + xChanBalance_
    + xchanId
    + targetBlockHash

  const digest = keccak256(getBytes(msg));
  console.log('digest:', digest);

  const sig = wallet.signingKey.sign(digest)
  console.log('sig3.v:', sig.v);
  console.log('sig3.r', sig.r);
  console.log('sig3.s', sig.s);

  const proof = msg
    + sig.v.toString(16).padStart(2, '0')
    + sig.r.slice(2)
    + sig.s.slice(2)
    + timestamp;
  console.log('proof:', proof);

  // This updates the header oracle such that the root of the proof is valid.
  await updateHeaderOracle(block);
  console.log('Header Oracle updated');
  return proof;
}

describe('Redeem Tests', async function () {
  it('Should call the redeem contract', async function () {

    await chainweb.switchChain(0);
    const signers = await getSigners();
    const receiver = signers.deployer;
    const amount = ethers.parseEther('0.1');
    const oldBalance = await pkg.ethers.provider.getBalance(receiver.address);

    await pkg.network.provider.send('evm_mine', []);

    const proof = await mkTestProof(receiver, amount);
    const chainwebConfig = pkg.config.chainweb[pkg.config.defaultChainweb];
    const result = await ethCall(chainwebConfig.precompiles.redeem, proof);
    expect(result).to.equal('0x');

    // const newBalance = await pkg.ethers.provider.getBalance(receiver.address);
    // expect(newBalance).to.equal(oldBalance + amount);
  });
});
