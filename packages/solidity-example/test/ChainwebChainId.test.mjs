import js from '@eslint/js';
import { expect } from 'chai';
import pkg from 'hardhat';
import { Wallet, getBytes, keccak256 } from 'ethers';
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
/* Redeem Tests */

// TODO move to separate file

async function mkTestData(block) {

  const sk = '0xef69d5fcb4e94dd638d7fe71cb4da99a679bb817ca706340b3901c1139f50a90';
  const wallet = new Wallet(sk);
  console.log('address:', wallet.address);

  const amount = (1).toString(16).padStart(64, '0');
  const version = (0).toString(16).padStart(4, '0');
  const targetChain = (0).toString(16).padStart(8, '0');
  const targetAccount = (2).toString(16).padStart(40, '0');
  const xchanBalance = (3).toString(16).padStart(64, '0');
  const xchanId = (4).toString(16).padStart(64, '0');
  const targetBlockHash = block.parentBeaconBlockRoot.slice(2).padStart(64, '0');
  const timestamp = block.timestamp.slice(2).padStart(16, '0');
  const msg = "0x"
    + amount
    + version
    + targetChain
    + targetAccount
    + xchanBalance
    + xchanId
    + targetBlockHash

  const digest = keccak256(getBytes(msg));
  console.log('digest:', digest);

  const sig = await wallet.signingKey.sign(digest)
  console.log('sig3.v:', sig.v);
  console.log('sig3.r', sig.r);
  console.log('sig3.s', sig.s);

  const proof = msg
    + sig.v.toString(16).padStart(2, '0')
    + sig.r.slice(2)
    + sig.s.slice(2)
    + timestamp;
  console.log('proof:', proof);
  return proof;
}

describe('Redeem Tests', async function () {
  it('Should call the redeem contract', async function () {
    await chainweb.switchChain(0);
    console.log(pkg.config.chainweb);
    const block = await pkg.ethers.provider.send('eth_getBlockByNumber', ['latest', false]);
    const proof = await mkTestData(block);
    const chainwebConfig = pkg.config.chainweb[pkg.config.defaultChainweb];
    const result = await pkg.ethers.provider.send('eth_call', [
      { to: chainwebConfig.precompiles.redeem, input: proof },
      'latest',
    ]);
    console.log('Result:', result);
    expect(result).to.equal('0x');
  });
});
