import js from '@eslint/js';

import { expect } from 'chai';
import pkg from 'hardhat';
import {
  ZeroAddress,
  Wallet,
  getBytes,
  AbiCoder,
  ethers,
  hexlify,
  randomBytes,
  BytesLike,
  AddressLike,
  BigNumberish,
  Block,
  Signer
} from 'ethers';

import { getSigners } from './utils/utils';

import consensus from '@kadena/chainwebjs';

import { StateRootProof } from '@kadena/xchan/lib/src/stateproof';
import { XChan, BalanceProof, ElHeader, ChainId, XChanProof, Account, RedeemProof, d4k4ShortestPath } from '@kadena/xchan';
import { ClHeader } from '@kadena/xchan/lib/src/clheader';

const { header } = consensus;

const { network, chainweb } = pkg;

const {
  deployContractOnChains,
  switchChain,
  getChainIds,
} = chainweb;

// const { header } = consensus.default;

const HARDHAT = pkg.network.name.includes('hardhat');

const chainwebConfig = pkg.config.chainweb[pkg.config.defaultChainweb];
const redeemAddress = chainwebConfig.precompiles.redeem;

/* *************************************************************************** */
/* Utilities */

async function getSigner(chainId: ChainId, name: string = 'deployer') {
  const signers = await getSigners(chainId);
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

const coder = AbiCoder.defaultAbiCoder();

async function ethCall(to: AddressLike, input: BytesLike) {
  console.log(`Calling contract ${to} with input:`, input);
  const result = await pkg.ethers.provider.send('eth_call', [
    { to, input },
    'latest',
  ]);
  console.log('result:', result);
  return result;
}

async function ethGetProof(address: AddressLike) {
  const block = await pkg.ethers.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ]);
  console.log(`latest block number: ${block.number}`);
  const result = await pkg.ethers.provider.send('eth_getProof', [
    address,
    [],
    block.number,
  ]);
  return {
    block: block,
    proof: result
  };
}

async function debugTraceTransaction(txHash: BytesLike) {
  console.log(`Tracing transaction ${txHash}`);
  const result = await pkg.ethers.provider.send('debug_traceTransaction', [
    txHash,
    {
      disableMemory: false,
      disableStorage: true,
      disableStack: true,
    }
  ]);
  return result;
}

async function getStorageAt(address: AddressLike, slot: BigNumberish) {
  const result = await pkg.ethers.provider.send('eth_getStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
  ]);
  return result;
}

async function getCode(address: AddressLike) {
  const result = await pkg.ethers.provider.send('eth_getCode', [address]);
  return result;
}

async function setStorageAt(address: AddressLike, slot: BigNumberish, value: BytesLike) {
  await pkg.ethers.provider.send('hardhat_setStorageAt', [
    address,
    coder.encode(['uint256'], [slot]),
    coder.encode(['uint256'], [value]),
  ]);
}

async function updateHeaderOracle(block: ElHeader) {
  const slot = Number(block.timestamp) % 0x001fff;
  const t = coder.encode(['uint256'], [block.timestamp]);
  await setStorageAt(beaconHeaderOracle, slot, t);
  await setStorageAt(
    beaconHeaderOracle,
    slot + 0x001fff,
    block.parentBeaconBlockRoot,
  );
}

/* *************************************************************************** */
/* Test Functions */

async function createXChanOn0(targetAccounts: Account[], nonce = '0x123456') {
  var [CHAIN_0, CHAIN_1, ...CHAIN_IDS] = await chainweb.getChainIds();
  return createXChan(CHAIN_0, CHAIN_1, targetAccounts, nonce);
}

async function createXChanOn1(targetAccounts: Account[], nonce = '0x123456') {
  var [CHAIN_0, CHAIN_1, ...CHAIN_IDS] = await chainweb.getChainIds();
  return createXChan(CHAIN_1, CHAIN_0, targetAccounts, nonce);
}

function createXChan(
  sourceChainId: ChainId,
  targetChainId: ChainId,
  targetAccounts: Account[],
  nonce = '0x123456',
) {
  const xChan = new XChan(targetChainId, targetAccounts, sourceChainId, nonce);
  console.log(`xChan send address: ${xChan.sendAddress}, redeem address: ${xChan.redeemAddress}`);
  return xChan;
}

async function sendXChan(xChan: XChan, signer: string, amount: bigint) {
  const sender = await getSigner(xChan.sourceChainId, signer);
  const oldBalance = await sender.provider.getBalance(xChan.sendAddress);
  const tx = await sender.sendTransaction({
    to: xChan.sendAddress,
    value: amount,
  });
  const receipt = await tx.wait();
  console.log(
    `Sent ${amount} wei to XChan ${xChan.sendAddress} on chain ${xChan.sourceChainId}`,
  );
  const newBalance = await sender.provider.getBalance(xChan.sendAddress);
  expect(newBalance).to.equal(oldBalance + amount);
  return receipt;
}

async function xChanRedeemParams(
  xChan: XChan,
  receiver: string,
  amount: bigint,
  proof: XChanProof | null = null
): Promise<BytesLike> {
  if (!proof) {
    proof = await xChanProof(xChan, receiver);
  }
  return ethers.concat([getBytes(ethers.toBeHex(amount, 32)), proof.encode()]);
}

async function xChanProof(xChan: XChan, receiver: string) {

  const srcChainSender = (await getSigners(xChan.sourceChainId)).deployer;
  const xChanBalance = await srcChainSender.provider.getBalance(xChan.sendAddress);

  // This is how we guarantee for the hardhat network that the proof is available.
  if (HARDHAT) {
    await pkg.network.provider.send('evm_mine', []);
  }

  await chainweb.switchChain(xChan.targetChainId);
  const targetChainSender = (await getSigners(xChan.targetChainId)).deployer;
  const block: ElHeader = await targetChainSender.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ]) as ElHeader;
  const proofRoot = block.parentBeaconBlockRoot;
  const rootTimestamp = block.timestamp;

  const proof = xChan.createProof(receiver);
  if (HARDHAT) {
    await updateHeaderOracle(block);
  }
  return proof;
}

async function receiveXChan(
  xChan: XChan,
  receiverAddress: string,
  amount: bigint,
  proof: XChanProof,
) {
  const params = await xChanRedeemParams(xChan, receiverAddress, amount, proof);
  const sender = (await getSigners(xChan.targetChainId)).deployer;
  const tx = await sender.sendTransaction({
    to: redeemAddress,
    data: hexlify(params),
  });
  const result = await tx.wait();
  return result;
}

async function receiveAndCheckXChan(
  xChan: XChan,
  receiverAddress: string,
  amount: bigint,
  proof: XChanProof
) {
  const sender = (await getSigners(xChan.targetChainId)).deployer;
  const oldBalance = await sender.provider.getBalance(receiverAddress);
  await receiveXChan(xChan, receiverAddress, amount, proof);
  const newBalance = await sender.provider.getBalance(receiverAddress);
  expect(newBalance).to.equal(oldBalance + amount);
  console.log(
    `Received ${amount} wei from ${sender.address} to ${receiverAddress}`,
  );
  return newBalance;
}

async function sendProof(sender: Signer, xChanProof: XChanProof, to = redeemAddress) {
  const tx = await sender.sendTransaction({
    to: to,
    data: hexlify(xChanProof.encode()),
  });
  const result = await tx.wait();
  return result;
}

/* *************************************************************************** */
/* Redeem Tests */

// In order to create proofs we need to call eth_getProof which is not
// supported by the hardhat network.
// So, we need to use the sandbox network for testing the redeem contract.
// However, changing a system contract requires to change the genesis
// information with leads to very long rundtrip times during development.
// Therefore, for testing, we deploy the redeem contract as a normal contract.
//
// Once it is stable we also run the tests against the actual system contract.
//
// On hardhat we have to work around the missing eth_getProof support and use a
// "fake" contract.

describe('XChanProof Tests', async function () {
  console.log(pkg.network.name, HARDHAT, await chainweb.getChainIds());

  var [CHAIN_0, CHAIN_1, ...CHAIN_IDS] = await chainweb.getChainIds();

  describe('Proof creation tests', async function () {
    it('Should log to the hardhat console', async function () {
      const consoleContract = "0x000000000000000000636F6e736F6c652e6c6f67";
      const result = await ethCall(consoleContract,
        ethers.concat([
          "0x21c215e9000000000000000000000000000000000000000000000000",
          "0x00000000000000000000000000000000000000000000000000ff00ff"
        ])
      );
    });

    it(('Should compute EL header hashes'), async function () {
      // this is required to initialize the provider
      const _signers0 = await getSigners(CHAIN_0);

      // Get EL header
      const eip1193Provider = pkg.network.provider;
      const elHeader = await ElHeader.request(eip1193Provider, 'latest');

      // Get consensus header
      const header = await requestConsensus(CHAIN_0, Number(elHeader.number));
      const phash = decodeBase64Url(header.payloadHash);
      console.log(`elHeader payloadHash: ${hexlify(elHeader.payloadHash)}`);
      console.log(`consensus payloadHash: ${hexlify(phash)}`);
      expect(hexlify(phash)).to.equal(hexlify(getBytes(elHeader.payloadHash)));
    });

    it(('Should compute EL state root proof'), async function () {
      const _signers0 = await getSigners(CHAIN_0);
      const eip1193Provider = pkg.network.provider;
      const elHeader = await ElHeader.request(eip1193Provider, 'latest');
      // create state root proof
      const stateRootProof = elHeader.stateRootProof();
      const payloadHash = stateRootProof.run();
      console.log(`computed payloadHash: ${hexlify(payloadHash)}`);
      expect(hexlify(payloadHash)).to.equal(hexlify(elHeader.payloadHash));
    });

    it(('Should create a redeem proof for an unfunded account'), async function () {
      const signers0 = await getSigners(CHAIN_0);

      // create and fund XChan
      const xChan = await createXChanOn0([signers0.alice.address, signers0.bob.address]);

      // // create XChan proof
      // const xChanProof = xChan.createProof(signers0.alice.address);

      // // create balance proof
      // const balanceProof = await BalanceProof.request(network.provider, xChan.sendAddress, 'latest');
      // const encoded = balanceProof.encodeCbor();

      // // create state root proof
      // const elHeader = await ElHeader.request(network.provider, 'latest');
      // const stateRootProof = elHeader.stateRootProof();
      // const payloadHash = stateRootProof.run();
      // expect(hexlify(payloadHash)).to.equal(hexlify(elHeader.payloadHash));

      // // print proofs
      // console.log(`Encoded XChanProof: ${Buffer.from(xChanProof.encodeCbor()).toString('hex')}`);
      // console.log(`Encoded BalanceProof: ${Buffer.from(encoded).toString('hex')}`);
      // console.log(`Encoded StateRootProof: ${Buffer.from(stateRootProof.encodeCbor()).toString('hex')}`);

      // // create redeem proof
      // const redeemProof = RedeemProof.create(xChanProof, balanceProof, stateRootProof);
      // console.log(`Encoded RedeemProof: ${Buffer.from(redeemProof.encodeCbor()).toString('hex')}`);

      // request redeem proof
      const redeemProof = await RedeemProof.request(
        "evm-development",
        "http://localhost:1848",
        network.provider,
        xChan,
        signers0.alice.address,
        'latest',
      );
      console.log(`RedeemProof: ${Buffer.from(redeemProof.encodeCbor()).toString('hex')}`);
    });

    it(('Should request a consensus header and create a payload hash proof'), async function () {
      const signers0 = await getSigners(CHAIN_0);
      const networkName = "evm-development";
      const nodeUrl = "http://localhost:1848";
      console.log(`Requesting consensus header for chain ${CHAIN_0} on network ${networkName} at ${nodeUrl}`);
      const header = await ClHeader.request(
        CHAIN_0,
        networkName,
        nodeUrl,
        -3,
      );
      console.log(`Consensus header: ${JSON.stringify(header.asJson(true), null, 2)}`);
      console.log(`Consensus header: ${JSON.stringify(header.asJson(false), null, 2)}`);

      const payloadHashProof = header.payloadHashProof();
      const blockHash = payloadHashProof.run();
      console.log(`Computed Block hash: ${hexlify(blockHash)}`);
      expect(hexlify(blockHash)).to.equal(hexlify(header.hash));
    });

    it('Should lookup the shorteset path between CHAIN_0 and CHAIN_1', async function () {
      const [CHAIN_0, CHAIN_1, ...CHAIN_IDS] = await chainweb.getChainIds();
      const path = d4k4ShortestPath(CHAIN_0, CHAIN_1);
      console.log(`Shortest path from ${CHAIN_0} to ${CHAIN_1}: ${path.join(' -> ')}`);
      expect(path.length).to.be.lessThan(6, `Path length is ${path.length}, expected less than 6`);
      expect(path[0]).to.equal(CHAIN_0, `Path does not start with ${CHAIN_0}`);
      expect(path[path.length - 1]).to.equal(CHAIN_1, `Path does not end with ${CHAIN_1}`);
    });

    // Putting it all together
    it(('Should create a redeem proof for a funded account'), async function () {
      const signers0 = await getSigners(CHAIN_0);

      // create and fund XChan
      const xChan = await createXChanOn0([signers0.alice.address, signers0.bob.address]);
      await sendXChan(xChan, 'alice', ethers.parseEther('1'));
      await sendXChan(xChan, 'alice', ethers.parseEther('1'));
      await sendXChan(xChan, 'alice', ethers.parseEther('1'));
      await sendXChan(xChan, 'alice', ethers.parseEther('1'));

      // request redeem proof
      const redeemProof = await RedeemProof.request(
        "evm-development",
        "http://localhost:1848",
        network.provider,
        xChan,
        signers0.alice.address,
        'latest',
      );
      console.log(`RedeemProof: ${Buffer.from(redeemProof.encodeCbor()).toString('hex')}`);
    });
  });

  describe('Redeem contract tests', async function () {

    let redeemAddress: string[] = [];

    // Deploy redeem contract and set redeemAddress
    // It would be nice to do this in parallel, but that seems non-trivial with
    // hardhat.
    before(async function () {
      this.timeout(60000); // 60 seconds timeout for deployment
      for (const chainId of [CHAIN_0, CHAIN_1]) {
        const signers = await getSigners(chainId);
        const bytecode = "0x335f556104068061000f5f395ff3fe61000934156102f6565b610011610264565b610019610196565b906100226101d1565b9061008161002e610202565b61007b610039610233565b9561004e6011198836030160051c9515610305565b6100736004601c5f80739b02c3e2df42533e0fd166798b5a616f59dbd2cc5afa610316565b5f5114610327565b15610338565b60025f813761008e610299565b6004600260243761009d6102ae565b5f80535f6001536100ac61027e565b5f6100b683610349565b9260015b84811061016d57506100cb816102de565b90916100e5600888018481600a82376001198101906102c5565b5f6022535f6023535f915b8683106101345787868660208760225e61010861027e565b8181106101155760206002f35b806020601260019360051b86010160223761012e61027e565b01610108565b849350602090601260019660051b8a01019037831c9083610154836102de565b909590926101618761028b565b019301939291906100f0565b6001809160206012866005999697991b8a010160223761018b61027e565b0194019190936100ba565b366006116101c75760023562ff00ff63ff00ff008260d81c169160e81c16178060101b9060101c1763ffffffff1690565b6101075f5260205ffd5b36600a116101c75760063562ff00ff63ff00ff008260d81c169160e81c16178060101b9060101c1763ffffffff1690565b36600e116101c757600a3562ff00ff63ff00ff008260d81c169160e81c16178060101b9060101c1763ffffffff1690565b366012116101c757600e3562ff00ff63ff00ff008260d81c169160e81c16178060101b9060101c1763ffffffff1690565b366002116101c7575f3561ff008160f81c9160e81c161790565b6020600260425f825afa50565b6020906042602260025afa50565b60015f535f6001536020600260045f825afa50565b60026022535f6023536020602260068160025afa50565b906002602093600483535f6001840153019060025afa50565b600116156102ee57604490602490565b602490604490565b156102fd57565b5f805260205ffd5b1561030c57565b6102005f5260205ffd5b1561031d57565b6102015f5260205ffd5b1561032e57565b6102025f5260205ffd5b1561033f57565b6102035f5260205ffd5b5f919080600160801b81116103f7575b508068010000000000000000600292116103eb575b64010000000081116103df575b6201000081116103d3575b61010081116103c7575b601081116103bb575b600481116103b0575b116103a957565b9060010190565b92810192811c6103a2565b6004938401931c610399565b6008938401931c610390565b6010938401931c610386565b6020938401931c61037b565b6040938401931c61036e565b60809350831c9050600261035956";
        const tx = await signers.deployer.sendTransaction({ data: bytecode, });
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
        if (receipt !== null) {
          console.log("Contract deployed: ", receipt);
          expect(receipt.status).to.equal(1);
          expect(receipt.contractAddress).to.not.be.null;
          console.log(`Contract deployed to ${receipt.contractAddress}`);
          redeemAddress[chainId] = receipt.contractAddress as string;
        }
      }
    });

    it(('Should accept an XChan proof with eth_call'), async function () {
      const signers = await getSigners(CHAIN_0);
      const xChan = await createXChanOn0([signers.alice.address, signers.bob.address]);
      console.log('xChan:', xChan);
      const proof = xChan.createProof(signers.alice.address);
      await chainweb.switchChain(CHAIN_1);
      const result = await ethCall(redeemAddress[CHAIN_1], proof.encode());
      console.log('result:', result);
      expect(result).to.equal(xChan.xChanId);
    });

    it(('Should accept an XChan proof with send'), async function () {
      const signers0 = await getSigners(CHAIN_0);
      const xChan = await createXChanOn0([signers0.alice.address, signers0.bob.address]);
      console.log('xChan:', xChan);
      const proof = xChan.createProof(signers0.alice.address);
      console.log('proof:', proof);
      const signers1 = await getSigners(CHAIN_1);
      const result = await ethCall(redeemAddress[CHAIN_1], proof.encode());
      console.log('result:', result);
      const receipt = await sendProof(signers1.alice, proof, redeemAddress[CHAIN_1]);
      console.log('receipt:', receipt);
      expect(receipt).to.not.be.null;
      if (receipt !== null) {
        expect(receipt.status).to.equal(1);
      }
    });

    // Putting it all together
    it(('Should accept a funded XChan proof with send'), async function () {
      const signers0 = await getSigners(CHAIN_0);

      // create and fund XChan
      const xChan = await createXChanOn0([signers0.alice.address, signers0.bob.address]);
      await sendXChan(xChan, 'alice', ethers.parseEther('1'));

      // create XChan proof
      const xChanProof = xChan.createProof(signers0.alice.address);

      // create balance proof
      const balanceProof = await BalanceProof.request(network.provider, xChan.sendAddress, 'latest');
      const encoded = balanceProof.encodeCbor();

      // create state root proof
      const elHeader = await ElHeader.request(network.provider, 'latest');
      const stateRootProof = StateRootProof.create(elHeader);
      const payloadHash = stateRootProof.run();
      expect(hexlify(payloadHash)).to.equal(hexlify(elHeader.payloadHash));

      // print proofs
      console.log(`Encoded XChanProof: ${Buffer.from(xChanProof.encodeCbor()).toString('hex')}`);
      console.log(`Encoded BalanceProof: ${Buffer.from(encoded).toString('hex')}`);
      console.log(`Encoded StateRootProof: ${Buffer.from(stateRootProof.encodeCbor()).toString('hex')}`);

      // create redeem proof
      const redeemProof = RedeemProof.create(xChanProof, balanceProof, stateRootProof);
      console.log(`Encoded RedeemProof: ${Buffer.from(redeemProof.encodeCbor()).toString('hex')}`);

      // request redeem proof
      const redeemProofRequest = await RedeemProof.request(
        xChan,
        signers0.alice.address,
        network.provider,
        'latest'
      );
      console.log(`Encoded RedeemProofRequest: ${Buffer.from(redeemProofRequest.encodeCbor()).toString('hex')}`);

      // submit proof on chain 1
      const signers1 = await getSigners(CHAIN_1);
      const receipt = await sendProof(signers1.alice, xChanProof, redeemAddress[CHAIN_1]);
      console.log('receipt:', receipt);
      expect(receipt).to.not.be.null;
      if (receipt !== null) {
        expect(receipt.status).to.equal(1);
      }
    });
  });
});

describe('Unpriviledged Redeem', async function () {
});

/* *************************************************************************** */
/* Debugging */


async function requestConsensus(cid: ChainId, blockNumber: number) {
  const networkName = "evm-development";
  const nodeUrl = "http://localhost:1848"
  let hdr = await header.height(cid, blockNumber, networkName, nodeUrl);
  return hdr;
}

function decodeBase64Url(base64Url: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64Url, 'base64url'));
}

async function debug(receipt: any) {
  const fs = await import('fs');
  const trace = await debugTraceTransaction(receipt.hash);
  fs.writeFile('trace.json', JSON.stringify(trace, null, 2), (err) => {
    if (err) {
      console.error('Error writing trace to file:', err);
    } else {
      console.log('Trace written to trace.json');
    }
  });
}
