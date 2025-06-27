const { expect } = require('chai');
const { ethers, chainweb } = require('hardhat');
const {
  authorizeAllContracts,
  crossChainTransfer,
  initCrossChain,
  redeemCrossChain,
  getSigners,
} = require('./utils/utils');

const { requestSpvProof, switchChain, deployContractOnChains, getChainIds } =
  chainweb;

describe('SimpleToken Integration Tests', async function () {
  let deployments = [];
  let initialSigners;
  let token0;
  let token1;
  let token0Info;
  let token1Info;
  let chains;

  beforeEach(async function () {
    chains = await getChainIds();
    initialSigners = await getSigners(chains[0]); // get initialSigners for the first chain

    // switchChain() can be used to switch to a different Chainweb chain
    // deployContractOnChains switches chains before deploying on each one
    // Because this contract takes an address as a constructor param, we pass it in here as an address.
    // In solidity, the address has no specific network affiliation like a signer does in Hardhat.
    const deployed = await deployContractOnChains({
      name: 'SimpleToken',
      constructorArgs: [
        ethers.parseUnits('1000000'),
        initialSigners.deployer.address,
      ],
    });

    // Store contract instances for direct calls
    token0 = deployed.deployments[0].contract;
    token1 = deployed.deployments[1].contract;

    // Keep deployment info accessible when needed
    token0Info = deployed.deployments[0];
    token1Info = deployed.deployments[1];

    deployments = deployed.deployments;

    // The owner/deployer transfers tokens to other accounts so that they can transfer tokens cross-chain. This is a setup step.
    await token0.transfer(
      initialSigners.alice.address,
      ethers.parseEther('1000000'),
    ); // Alice has 1M tokens on the "from" chain
    await token1.transfer(
      initialSigners.bob.address,
      ethers.parseEther('1000000'),
    ); // Bob has 1M tokens on the "to" chain

    await authorizeAllContracts(deployments);

    await switchChain(token0Info.chain);
  });

  context('Success Test Cases', async function () {
    it('Should transfer tokens to same address from one chain to another', async function () {
      const sender = initialSigners.alice;
      const receiver = initialSigners.alice;
      const amount = ethers.parseEther('500');

      const senderBalanceBefore = await token0.balanceOf(sender.address);
      const receiverBalanceBefore = await token1.balanceOf(receiver.address);
      await crossChainTransfer(
        token0,
        token0Info,
        token1,
        token1Info,
        sender,
        receiver,
        amount,
      );
      const senderBalanceAfter = await token0.balanceOf(sender.address);
      const receiverBalanceAfter = await token1.balanceOf(receiver.address);
      expect(senderBalanceBefore - amount).to.equal(senderBalanceAfter);
      expect(receiverBalanceBefore + amount).to.equal(receiverBalanceAfter);
    });

    it('Should transfer tokens to different address from one chain to another', async function () {
      const sender = initialSigners.alice;
      const receiver = initialSigners.bob;
      const amount = ethers.parseEther('250000');

      const senderBalanceBefore = await token0.balanceOf(sender.address);
      const receiverBalanceBefore = await token1.balanceOf(receiver.address);
      await crossChainTransfer(
        token0,
        token0Info,
        token1,
        token1Info,
        sender,
        receiver,
        amount,
      );
      const senderBalanceAfter = await token0.balanceOf(sender.address);
      const receiverBalanceAfter = await token1.balanceOf(receiver.address);
      expect(senderBalanceBefore - amount).to.equal(senderBalanceAfter);
      expect(receiverBalanceBefore + amount).to.equal(receiverBalanceAfter);
    });

    it('Should transfer tokens to different address from chain in position 1 to chain in poistion 0', async function () {
      // Switch to chain in position 1 and get signer bob on that chain. This is a hardhat thing - a signer has a network context.
      // Not needed in other test cases because the contract is by default called by the first signer on the chain where the contract is deployed.
      // This shows an alternate way of getting a signer on another chain as alternative to using the function in utils.js

      await switchChain(chains[1]);
      const [, , chain1Bob] = await ethers.getSigners(); // Get Bob's signer on that chain
      const sender = chain1Bob; // Use this Bob as sender
      const receiver = initialSigners.alice; // Use other chain's  Alice as receiver
      const amount = ethers.parseEther('10');

      // Verify Bob has tokens on "from" chain
      const bobBalance = await token1.balanceOf(sender.address);
      expect(bobBalance).to.be.gte(amount);

      const senderBalanceBefore = await token1.balanceOf(sender.address);
      const receiverBalanceBefore = await token0.balanceOf(receiver.address);

      await crossChainTransfer(
        token1,
        token1Info,
        token0,
        token0Info,
        sender,
        receiver,
        amount,
      );

      const senderBalanceAfter = await token1.balanceOf(sender.address);
      const receiverBalanceAfter = await token0.balanceOf(receiver.address);
      expect(senderBalanceBefore - amount).to.equal(senderBalanceAfter);
      expect(receiverBalanceBefore + amount).to.equal(receiverBalanceAfter);
    });

    it("Should transfer sender's full balance", async function () {
      const sender = initialSigners.alice;
      const receiver = initialSigners.bob;

      const senderBalanceBefore = await token0.balanceOf(sender.address);
      const receiverBalanceBefore = await token1.balanceOf(receiver.address);
      const amount = senderBalanceBefore;
      await crossChainTransfer(
        token0,
        token0Info,
        token1,
        token1Info,
        sender,
        receiver,
        amount,
      );
      const senderBalanceAfter = await token0.balanceOf(sender.address);
      const receiverBalanceAfter = await token1.balanceOf(receiver.address);
      expect(senderBalanceAfter).to.equal(0n);
      expect(receiverBalanceBefore + amount).to.equal(receiverBalanceAfter);
    });

    it('Should complete multiple consecutive transfers from sender to different receivers correctly', async function () {
      const sender = initialSigners.alice;
      const receiver1 = initialSigners.bob;
      const receiver2 = initialSigners.carol;
      const amount1 = ethers.parseEther('100');
      const amount2 = ethers.parseEther('200');

      // Transfer 1
      const senderBalanceBeforeTransfer1 = await token0.balanceOf(
        sender.address,
      );
      const receiver1BalanceBeforeTransfer1 = await token1.balanceOf(
        receiver1.address,
      );

      const origin1 = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver1,
        amount1,
      );

      // Transfer 2
      const receiver2BalanceBeforeTransfer2 = await token1.balanceOf(
        receiver2.address,
      );
      const origin2 = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver2,
        amount2,
      );

      const proof1 = await requestSpvProof(token1Info.chain, origin1);

      // Redeem Transfer 1
      await redeemCrossChain(token1, token1Info, receiver1, amount1, proof1);

      const proof2 = await requestSpvProof(token1Info.chain, origin2);

      // Redeem Transfer 2
      await redeemCrossChain(token1, token1Info, receiver2, amount2, proof2);

      const senderBalanceAfter = await token0.balanceOf(sender.address);
      const receiver1BalanceAfter = await token1.balanceOf(receiver1.address);
      const receiver2BalanceAfter = await token1.balanceOf(receiver2.address);
      expect(senderBalanceAfter).to.equals(
        senderBalanceBeforeTransfer1 - amount1 - amount2,
      );
      expect(receiver1BalanceAfter).to.equal(
        receiver1BalanceBeforeTransfer1 + amount1,
      );
      expect(receiver2BalanceAfter).to.equal(
        receiver2BalanceBeforeTransfer2 + amount2,
      );
    });

    it('Should allow third party to redeem on behalf of receiver', async function () {
      // Switch to chain in position 1 and get signer bob on that chain. This is a hardhat thing - a signer has a network context.
      // Not needed in other test cases because the contract is by default called by the first signer on the chain where the contract is deployed.
      // This shows an alternate way of getting a signer on another chain as alternative to using the function in utils.js
      await switchChain(chains[1]);
      const [, , , chain1Carol] = await ethers.getSigners(chains[1]);
      const sender = initialSigners.alice;
      const receiver = initialSigners.bob;
      const redeemer = chain1Carol;
      const amount = ethers.parseEther('100');

      const senderBalanceBefore = await token0.balanceOf(sender.address);
      const receiverBalanceBefore = await token1.balanceOf(receiver.address);
      const redeemerBalanceBefore = await token1.balanceOf(redeemer.address);

      // Start transfer
      const origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );
      const proof = await requestSpvProof(token1Info.chain, origin);

      // Redeem transfer
      const tx = await token1
        .connect(redeemer)
        .redeemCrossChain(receiver, amount, proof);
      await tx.wait();

      const senderBalanceAfter = await token0.balanceOf(sender.address);
      const receiverBalanceAfter = await token1.balanceOf(receiver.address);
      const recdeemerBalanceAfter = await token1.balanceOf(redeemer.address);

      expect(senderBalanceAfter).to.equals(senderBalanceBefore - amount);
      expect(receiverBalanceAfter).to.equal(receiverBalanceBefore + amount);
      expect(recdeemerBalanceAfter).to.equal(redeemerBalanceBefore);
    });
  });

  context('Error Test Cases', async function () {
    it('Should fail when attempting multiple transfers that exceed balance', async function () {
      const sender = initialSigners.alice;
      const receiver = initialSigners.bob;
      const balance = await token0.balanceOf(sender.address);
      const amount = balance / 2n + ethers.parseEther('1');

      // First transfer should succeed
      await crossChainTransfer(
        token0,
        token0Info,
        token1,
        token1Info,
        sender,
        receiver,
        amount,
      );

      // Second transfer should fail
      await expect(
        crossChainTransfer(
          token0,
          token0Info,
          token1,
          token1Info,
          sender,
          receiver,
          amount,
        ),
      ).to.be.revertedWithCustomError(token0, 'ERC20InsufficientBalance');
    });

    // This test case is skipped because the VALIDATE_PROOF_PRECOMPILE is not yet fully implemented
    it.skip('Should fail when trying to redeem before transfer is initiated', async function () {
      const receiver = initialSigners.bob;
      const amount = ethers.parseEther('100');

      // Create fake origin
      const fakeOrigin = {
        chain: BigInt(token0Info.chain),
        originContractAddress: token0Info.address,
        height: 999999n,
        txIdx: 0n,
        eventIdx: 0n,
      };

      // Create fake proof bytes matching precompile input format
      const fakeProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'uint256', 'uint32', 'uint32'],
        [
          fakeOrigin.height,
          fakeOrigin.txIdx,
          fakeOrigin.eventIdx,
          token1Info.chain, // target chain
          token0Info.chain, // origin chain
        ],
      );

      await expect(
        token1
          .connect(receiver)
          .redeemCrossChain(receiver.address, amount, fakeProof),
      ).to.be.revertedWithCustomError(token1, 'SPVVerificationFailed');
    });
  }); // End of Error Test Cases
}); // End of Integration Tests
