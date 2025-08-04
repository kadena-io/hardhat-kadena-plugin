import js from '@eslint/js';
import { expect } from 'chai';
import pkg from 'hardhat';
import { AbiCoder } from 'ethers';

const { chainweb } = pkg;

/* *************************************************************************** */
/* Utilities */

async function getStorageAt(address, slot) {
  console.log(`Getting storage at address ${address} and slot ${slot}`);
  const result = await pkg.ethers.provider.send('eth_getStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
  ]);
  console.log('Storage at slot:', slot, result);
  return result;
}

async function setStorageAt(address, slot, value) {
  console.log(
    `Setting storage at address ${address}, slot ${slot}, value ${value}`,
  );
  await pkg.ethers.provider.send('hardhat_setStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
    coder.encode(['uint256'], [value]),
  ]);
}

async function ethCall(to, input) {
  console.log(`Calling contract ${to} with input:`, input);
  const result = await pkg.ethers.provider.send('eth_call', [
    { to, input },
    'latest',
  ]);
  console.log('result:', result);
  return result;
}

/* *************************************************************************** */
/* EIP-4788 Header Oracle Tests */

// EIP-4788 Header Oracle address
const beaconHeaderOracle = '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02';

var [CHAIN_0, ...CHAIN_IDS] = await chainweb.getChainIds();

const coder = AbiCoder.defaultAbiCoder();

describe('EIP-4788 Header Oracle Tests', async function () {
  it('Should call the beacon header contract', async function () {
    await chainweb.switchChain(CHAIN_0);
    await pkg.network.provider.send('evm_mine', []);

    const code = await pkg.ethers.provider.getCode(beaconHeaderOracle);
    console.log('Beacon Header Oracle Code:', code);

    const block = await pkg.ethers.provider.send('eth_getBlockByNumber', [
      'latest',
      false,
    ]);
    const parent = await pkg.ethers.provider.send('eth_getBlockByNumber', [
      block.number - 1,
      false,
    ]);
    console.log('Block:', block);
    console.log('Parent:', parent);

    const t = coder.encode(['uint256'], [parent.timestamp]);
    const slot = parseInt(parent.timestamp, 16) % 0x001fff;
    console.log('Slot:', slot);

    await getStorageAt(beaconHeaderOracle, slot);
    await setStorageAt(beaconHeaderOracle, slot, t);
    await getStorageAt(beaconHeaderOracle, slot + 0x001fff);
    await setStorageAt(
      beaconHeaderOracle,
      slot + 0x001fff,
      parent.parentBeaconBlockRoot,
    );
    const result = await ethCall(beaconHeaderOracle, t);
    expect(result).to.equal(parent.parentBeaconBlockRoot);
  });
});
