import { expect } from 'chai';
import { BytesLike, getBytes } from 'ethers';
import {
  TargetAccountPolicy,
  XChan,
  XChanProof,
  XChanPolicy,
} from '../src/xchan';

/* ************************************************************************** */
/* Utils */

// flip a bit in a BytesLike value
function flipBit(value: BytesLike, bitIndex: number): BytesLike {
  const byteArray = getBytes(value);
  const byteIndex = Math.floor(bitIndex / 8);
  const bitPosition = bitIndex % 8;
  byteArray[byteIndex] ^= 1 << bitPosition;
  return byteArray;
}

const accounts: { [name: string]: { address: BytesLike } } = {
  alice: { address: '0x8849BAbdDcfC1327Ad199877861B577cEBd8A7b6' },
  bob: { address: '0xFB8Fb7f9bdc8951040a6D195764905138F7462Ed' },
  charlie: { address: '0x92f60275a4585348Cb43f5F0Bc90dF6b932fe8F7' },
};

type XChanProofData = {
  version: number;
  targetChain: number;
  policyIndex: number;
  policy: XChanPolicy;
  roots: string[];
};

/* ************************************************************************** */
/* Specs */

describe('XChan', () => {
  // let xchan: XChan;

  it('Should create an XChan', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0xaabb',
    );
    expect(xChan).to.be.an.instanceOf(XChan);
    console.log('XChan ID:', xChan.xChanId);
  });

  it('Should have the correct XChan ID', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    // the exppected value was computed with the Haskell reference implementation
    expect(xChan.xChanId).to.equal(
      '0xb56ca67947bcb9a39905981892f60275a4585348cb43f5f0bc90df6b932fe8f7',
    );
  });

  it('Should have the correct addresses', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    expect(xChan.address).to.equal(
      '0x92f60275a4585348Cb43f5F0Bc90dF6b932fe8F7',
    );
  });

  it('Should create an XChan for different numbers of target acconts', async function () {
    const xChan0 = new XChan(0, [], 1, '0x00ff00ff');
    expect(xChan0.targetAccounts).to.deep.equal([]);
    const xChan1 = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    expect(xChan1.targetAccounts).to.deep.equal([accounts.alice.address]);
    const xChan2 = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    expect(xChan2.targetAccounts).to.deep.equal([
      accounts.alice.address,
      accounts.bob.address,
    ]);
    const xChan3 = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
      1,
      '0x00ff00ff',
    );
    expect(xChan3.targetAccounts).to.deep.equal([
      accounts.alice.address,
      accounts.bob.address,
      accounts.charlie.address,
    ]);
  });

  it('Should have different IDs for different XChan parameters', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );

    const xChan1 = new XChan(
      0,
      [flipBit(accounts.alice.address, 10), accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const xChan2 = new XChan(
      0,
      [accounts.alice.address, flipBit(accounts.bob.address, 11)],
      1,
      '0x00ff00ff',
    );
    const xChan3 = new XChan(
      1,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const xChan4 = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      2,
      '0x00ff00ff',
    );
    const xChan5 = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ffa0ff',
    );

    expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
    expect(xChan.xChanId).to.not.equal(xChan2.xChanId);
    expect(xChan.xChanId).to.not.equal(xChan3.xChanId);
    expect(xChan.xChanId).to.not.equal(xChan4.xChanId);
    expect(xChan.xChanId).to.not.equal(xChan5.xChanId);
  });

  it('Should have different IDs for different order of target accounts', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const xChan1 = new XChan(
      0,
      [accounts.bob.address, accounts.alice.address],
      1,
      '0x00ff00ff',
    );
    expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
  });

  it('Should have different IDs for different numbers of target accounts', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const xChan1 = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
      1,
      '0x00ff00ff',
    );
    const xChan2 = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff'); // only one target account
    expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
    expect(xChan.xChanId).to.not.equal(xChan2.xChanId);
  });

  it('Should create a proof for the first target account XChan', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const proof0 = xChan.createProof(accounts.alice.address);
    expect(proof0).to.be.an('object');
  });

  it('Should create a proof for the second target account XChan', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const proof1 = xChan.createProof(accounts.bob.address);
    expect(proof1).to.be.an('object');
  });

  it('Should fail to create a proof for an invalid targetAccount', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    expect(() => xChan.createProof(accounts.charlie.address)).to.throw(
      `Target account ${accounts.charlie.address} is not in the target accounts list`,
    );
  });
});

describe('XChanProof', () => {
  it('Should have the expected claim', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );
    const proof = xChan.createProof(accounts.bob.address);
    const claim = proof.claim();
    expect(claim).to.be.an('object');
    expect(claim.version).to.equal(0);
    expect(claim.targetChain).to.equal(0);
    expect(claim.policy).to.deep.equal(
      new TargetAccountPolicy(accounts.bob.address),
    );
  });

  it('Running the proof for one account should return the XChan Id', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address);
    const result = proof.run();
    expect(result).to.equal(xChan.xChanId);
  });

  it('Running the proofs for two accounts should return the XChan Id', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address],
      1,
      '0x00ff00ff',
    );

    const proof0 = xChan.createProof(accounts.alice.address);
    const result0 = proof0.run();
    expect(result0).to.equal(xChan.xChanId);

    const proof1 = xChan.createProof(accounts.bob.address);
    const result1 = proof1.run();
    expect(result1).to.equal(xChan.xChanId);
  });

  it('Running the proofs for three accounts should return the XChan Id', async function () {
    const xChan = new XChan(
      0,
      [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
      1,
      '0x00ff00ff',
    );

    const proof0 = xChan.createProof(accounts.alice.address);
    const result0 = proof0.run();
    expect(result0).to.equal(xChan.xChanId);

    const proof1 = xChan.createProof(accounts.bob.address);
    const result1 = proof1.run();
    expect(result1).to.equal(xChan.xChanId);

    const proof2 = xChan.createProof(accounts.charlie.address);
    const result2 = proof2.run();
    expect(result2).to.equal(xChan.xChanId);
  });

  it('Tampering with target chain should cause running the proof to return an invalid XChan ID', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
    proof.targetChain = 1;
    const result = (proof as XChanProof).run();
    expect(result).to.not.equal(xChan.xChanId);
  });

  it('Tampering with version should cause running the proof to return an invalid XChan ID', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
    proof.version = 1;
    const result = (proof as XChanProof).run();
    expect(result).to.not.equal(xChan.xChanId);
  });

  it('Tampering with policy index should cause running the proof to return an invalid XChan ID', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
    proof.policyIndex = 2; // tamper with the policy index
    const result = (proof as XChanProof).run();
    expect(result).to.not.equal(xChan.xChanId);
  });

  it('Tampering with policy should cause running the proof to return an invalid XChan ID', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
    proof.policy = new TargetAccountPolicy(accounts.bob.address); // tamper with the policy
    const result = (proof as XChanProof).run();
    expect(result).to.not.equal(xChan.xChanId);
  });

  it('Tampering with proof roots should cause running the proof to return an invalid XChan ID', async function () {
    const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
    const proof = xChan.createProof(accounts.alice.address);
    proof.roots[0] = flipBit(proof.roots[0], 10); // tamper with the proof
    const result = proof.run();
    expect(result).to.not.equal(xChan.xChanId);
  });
});
