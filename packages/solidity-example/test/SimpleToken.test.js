const { expect } = require('chai');
const { ethers, chainweb } = require('hardhat');
const { ZeroAddress } = require('ethers');
const {
  authorizeAllContracts,
  initCrossChain,
  CrossChainOperation,
  redeemCrossChain,
  getSigners,
  deployMocks,
} = require('./utils/utils');
const {
  deployContractOnChains,
  computeOriginHash,
  requestSpvProof,
  createTamperedProof,
  switchChain,
  getChainIds,
} = chainweb;

describe('SimpleToken Unit Tests', async function () {
  let deployments = [];
  let initialSigners;
  let token0;
  let token1;
  let origin;
  let sender;
  let receiver;
  let amount;

  beforeEach(async function () {
    const chains = await getChainIds();
    initialSigners = await getSigners(chains[0]); // get initialSigners for the first chain

    // switchChain()can be used to switch to a different Chainweb chain
    // deployContractOnChains switches chains before deploying on each one
    // Because this contract takes an address as a constructor param, we pass it in here as an address.
    // In solidity, the address has no specific network affiliation like a signer does in Hardhat.
    const deployed = await deployContractOnChains({
      name: 'SimpleToken',
      constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
    });

    // Store contract instances for direct calls
    token0 = deployed.deployments[0].contract;
    token1 = deployed.deployments[1].contract;

    // Keep deployment info accessible when needed
    token0Info = deployed.deployments[0];
    token1Info = deployed.deployments[1];

    deployments = deployed.deployments;

    await switchChain(token0Info.chain);
  });

  context('Deployment and Initialization', async function () {
    context('Success Test Cases', async function () {
      it('Should have the correct configuration after deployment on all chains', async function () {
        await chainweb.runOverChains(async (chainId) => {
          const chainSigners = await getSigners(chainId);
          const deployment = deployments.find(d => d.chain === chainId);

          expect(deployment).to.not.be.undefined;
          expect(await deployment.contract.symbol()).to.equal('SIM');
          expect(await deployment.contract.name()).to.equal('SimpleToken');
          expect(await deployment.contract.totalSupply()).to.equal(
            ethers.parseEther('1000000'),
          );

          // Verify that the deployer address matches the chain-specific signer
          expect(deployment.deployer).to.equal(chainSigners.deployer.address);

          // Verify that the contract owner is the chain-specific deployer
          expect(await deployment.contract.owner()).to.equal(chainSigners.deployer.address);

          // Verify that the deployer has the full initial supply on this chain
          expect(await deployment.contract.balanceOf(chainSigners.deployer.address))
            .to.equal(ethers.parseEther('1000000'));
        });
      });
    }); // End of Success Test Cases
  }); // End of Deployment and Initialization

  describe('setCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should set up cross-chain addresses for all deployments using runOverChains', async function () {
        // Set up cross-chain addresses for every chain to every other chain
        // runOverChains handles the chain switching internally
        await chainweb.runOverChains(async (currentChainId) => {
          const currentDeployment = deployments.find(d => d.chain === currentChainId);
          const chainSigners = await getSigners(currentChainId);

          // Set addresses for all other chains
          for (const targetDeployment of deployments) {
            if (targetDeployment.chain !== currentChainId) {
              const tx = await currentDeployment.contract.setCrossChainAddress(
                targetDeployment.chain,
                targetDeployment.address
              );
              await tx.wait();

              // Verify the address was set correctly
              expect(await currentDeployment.contract.getCrossChainAddress(targetDeployment.chain))
                .to.equal(targetDeployment.address);

              // Verify the event was emitted correctly
              await expect(tx)
                .to.emit(currentDeployment.contract, 'CrossChainAddressSet')
                .withArgs(
                  targetDeployment.chain,
                  targetDeployment.address,
                  chainSigners.deployer.address
                );
            }
          }
        });
      });

      it('Should verify all cross-chain addresses are accessible from all chains', async function () {
        // First set up all addresses (could be in beforeEach)
        await chainweb.runOverChains(async (currentChainId) => {
          const currentDeployment = deployments.find(d => d.chain === currentChainId);

          for (const targetDeployment of deployments) {
            if (targetDeployment.chain !== currentChainId) {
              const tx = await currentDeployment.contract.setCrossChainAddress(
                targetDeployment.chain,
                targetDeployment.address
              );
              await tx.wait();
            }
          }
        });

        // Then verify all addresses are correctly set
        await chainweb.runOverChains(async (chainId) => {
          const deployment = deployments.find(d => d.chain === chainId);

          for (const otherDeployment of deployments) {
            if (otherDeployment.chain !== chainId) {
              const storedAddress = await deployment.contract.getCrossChainAddress(otherDeployment.chain);
              expect(storedAddress).to.equal(otherDeployment.address);
            }
          }
        });
      });

      it('Should allow setting cross-chain addresses to zero address on all chains', async function () {
        // Pick one target chain to set to zero across all source chains
        const targetChainId = deployments[1].chain;

        await chainweb.runOverChains(async (currentChainId) => {
          if (currentChainId !== targetChainId) {
            const currentDeployment = deployments.find(d => d.chain === currentChainId);
            const chainSigners = await getSigners(currentChainId);

            const tx = await currentDeployment.contract.setCrossChainAddress(
              targetChainId,
              ZeroAddress
            );
            await tx.wait();

            expect(await currentDeployment.contract.getCrossChainAddress(targetChainId))
              .to.equal(ZeroAddress);

            await expect(tx)
              .to.emit(currentDeployment.contract, 'CrossChainAddressSet')
              .withArgs(targetChainId, ZeroAddress, chainSigners.deployer.address);
          }
        });
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should fail to set cross-chain addresses for non-owner on all chains', async function () {
        await chainweb.runOverChains(async (chainId) => {
          const deployment = deployments.find(d => d.chain === chainId);
          const chainSigners = await getSigners(chainId);
          const targetChain = deployments.find(d => d.chain !== chainId)?.chain;

          if (targetChain) {
            // Try to set cross-chain address as alice (non-owner)
            await expect(
              deployment.contract
                .connect(chainSigners.alice)
                .setCrossChainAddress(targetChain, deployment.address)
            )
              .to.be.revertedWithCustomError(deployment.contract, 'OwnableUnauthorizedAccount')
              .withArgs(chainSigners.alice.address);
          }
        });
      });
    }); // End of 'Error Test Cases
  }); // End of setCrossChainAddress

  describe('verifySPV', async function () {
    beforeEach(async function () {
      await authorizeAllContracts(deployments);

      sender = initialSigners.deployer;
      receiver = initialSigners.deployer;
      amount = ethers.parseEther('10');

      origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );
    });

    context('Success Test Cases', async function () {
      it("Should verify a valid SPV proof and return correct values", async function () {
        const proof = await requestSpvProof(token1Info.chain, origin);
        const [crossChainMessage, originHash] = await token1.verifySPV(proof);

        // Verify CrossChainMessage fields
        expect(crossChainMessage.targetChainId).to.equal(token1Info.chain);
        expect(crossChainMessage.targetContractAddress).to.equal(await token1.getAddress());
        expect(crossChainMessage.crossChainOperationType).to.equal(CrossChainOperation.Erc20Transfer);

        // Verify origin fields
        expect(crossChainMessage.origin.originChainId).to.equal(token0Info.chain);
        expect(crossChainMessage.origin.originContractAddress).to.equal(await token0.getAddress());
        expect(crossChainMessage.origin.originBlockHeight).to.equal(origin.height);
        expect(crossChainMessage.origin.originTransactionIndex).to.equal(origin.txIdx);
        expect(crossChainMessage.origin.originEventIndex).to.equal(origin.eventIdx);

        const expectedOriginHash = computeOriginHash(origin);
        expect(originHash).to.equal(expectedOriginHash);
      });

      it('Should not set originHash to true when verifying a valid SPV proof', async function () {
        const proof = await requestSpvProof(token1Info.chain, origin);
        const [crossChainMessage, originHash] = await token1.verifySPV(proof);

        expect(await token1.completed(originHash)).to.be.false;
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should revert when verifying proof that has been tampered with', async function () {
        const tamperedProof = await createTamperedProof(
          token1Info.chain,
          origin,
        );
        await expect(
          token1.verifySPV(tamperedProof),
        ).to.be.revertedWithCustomError(token1, 'SPVVerificationFailed');
      });

      it('Should revert if already completed', async function () {
        const originHash = computeOriginHash(origin);
        const proof = await requestSpvProof(token1Info.chain, origin);
        await redeemCrossChain(token1, token1Info, receiver, amount, proof);
        await expect(token1.verifySPV(proof))
          .to.be.revertedWithCustomError(token1, 'AlreadyCompleted')
          .withArgs(originHash);
      });
    }); // End of Error Test Cases
  }); // End of verifySPV

  describe('transferCrossChain', async function () {
    beforeEach(async function () {
      await authorizeAllContracts(deployments);
    });
    context('Success Test Cases', async function () {
      it('Should burn the correct amount of tokens for the caller', async function () {
        const sender = initialSigners.deployer;
        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('10');

        const senderBalanceBefore = await token0.balanceOf(sender.address);
        const tx = await token0.transferCrossChain(
          receiver.address,
          amount,
          token1Info.chain,
        );
        await tx.wait();
        const senderBalanceAfter = await token0.balanceOf(sender.address);

        expect(senderBalanceAfter).to.equal(senderBalanceBefore - amount);
      });

      it('Should emit the correct events', async function () {
        const sender = initialSigners.deployer;
        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('500000');

        // Create and encode CrossChainData
        const expectedCrossChainData = ethers.AbiCoder.defaultAbiCoder().encode(
          ['tuple(address,uint256)'],
          [
            [
              receiver.address, // receiver
              amount, // value
            ],
          ],
        );

        const tx = await token0.transferCrossChain(
          receiver.address,
          amount,
          token1Info.chain,
        );
        await tx.wait();

        await expect(tx)
          .to.emit(token0, 'Transfer')
          .withArgs(sender.address, ZeroAddress, amount)
          .and.to.emit(token0, 'CrossChainInitialized')
          .withArgs(
            token1Info.chain,
            await token1.getAddress(),
            CrossChainOperation.Erc20Transfer,
            expectedCrossChainData,
          );
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should revert when transferring to the zero address', async function () {
        const amount = ethers.parseEther('100');
        await expect(
          token0.transferCrossChain(ZeroAddress, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(token0, 'InvalidReceiver')
          .withArgs(ZeroAddress);
      });

      it('Should revert when transferring amount 0', async function () {
        const receiver = initialSigners.deployer;
        const amount = 0n;
        await expect(
          token0.transferCrossChain(receiver, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(token0, 'InvalidAmount')
          .withArgs(amount);
      });

      it('Should revert when sender has insufficient balance', async function () {
        const sender = initialSigners.alice;
        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100');

        await expect(
          token0
            .connect(sender)
            .transferCrossChain(receiver.address, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(token0, 'ERC20InsufficientBalance')
          .withArgs(sender.address, 0n, amount);
      });

      it('Should revert when transferring to a nonexistent chain', async function () {
        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100');
        await expect(token0.transferCrossChain(receiver, amount, 2n))
          .to.be.revertedWithCustomError(
            token0,
            'TargetContractAddressNotFound',
          )
          .withArgs(2n);
      });

      it('Should revernt when no cross chain address is set for target chain', async function () {
        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100');

        const tx1 = await token0.setCrossChainAddress(
          token1Info.chain,
          ZeroAddress,
        );
        await tx1.wait();

        await expect(
          token0.transferCrossChain(receiver, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(
            token0,
            'TargetContractAddressNotFound',
          )
          .withArgs(token1Info.chain);
      });
    }); // End of Error Test Cases
  }); // End of transferCrossChain

  describe('redeemCrossChain', async function () {
    let proof;

    beforeEach(async function () {
      await authorizeAllContracts(deployments);
      sender = initialSigners.deployer;
      receiver = initialSigners.deployer;
      amount = ethers.parseEther('100000');

      origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );

      // Request SPV proof for the origin
      proof = await requestSpvProof(token1Info.chain, origin);
    });

    context('Success Test Cases', async function () {
      it('Should mint the correct amount of tokens to the receiver', async function () {
        const receiverBalanceBefore = await token1.balanceOf(receiver.address);
        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        const receiverBalanceAfter = await token1.balanceOf(receiver.address);

        expect(receiverBalanceAfter).to.equal(receiverBalanceBefore + amount);
      });

      it('Should emit the correct events', async function () {
        // Create and encode CrossChainData
        const expectedCrossChainData = ethers.AbiCoder.defaultAbiCoder().encode(
          ['tuple(address,uint256)'],
          [
            [
              receiver.address, // receiverAccount
              amount, // value
            ],
          ],
        );

        // Create array matching CrossChainOrigin struct order
        const expectedOrigin = [
          origin.chain, // originChainId
          origin.originContractAddress, // originContractAddress
          origin.height, // originBlockHeight
          origin.txIdx, // originTransactionIndex
          origin.eventIdx, // originEventIndex
        ];

        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();

        await expect(tx)
          .to.emit(token1, 'Transfer')
          .withArgs(ZeroAddress, receiver.address, amount)
          .and.to.emit(token1, 'CrossChainCompleted')
          .withArgs(
            CrossChainOperation.Erc20Transfer,
            expectedCrossChainData,
            expectedOrigin,
          );
      });

      it('Should mark the originHash as completed', async function () {
        const originHash = computeOriginHash(origin);

        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        expect(await token1.completed(originHash)).to.be.true;
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      let mockToken0;
      let mockToken1;
      let mockToken0Info;
      let mockToken1Info;

      beforeEach(async function () {
        const mocks = await deployMocks(initialSigners.deployer.address);
        mockToken0 = mocks.deployments[0].contract;
        mockToken1 = mocks.deployments[1].contract;

        // Keep deployment info accessible when needed
        mockToken0Info = mocks.deployments[0];
        mockToken1Info = mocks.deployments[1];

        await authorizeAllContracts(mocks.deployments);
      });

      it('Should revert on second redeem', async function () {
        const originHash = computeOriginHash(origin);
        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        await expect(token1.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'AlreadyCompleted')
          .withArgs(originHash);
      });

      it('Should revert when redeeming on the wrong chain', async function () {
        await expect(token0.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'IncorrectTargetChainId')
          .withArgs(token1Info.chain, token0Info.chain);
      });

      it('Should revert when redeeming on the wrong contrct', async function () {
        // Switch to chain where token1 is deployed
        await switchChain(token1Info.chain);

        // Deploy a new token contract on chain1
        const factory = await ethers.getContractFactory('SimpleToken');
        const token2 = await factory.deploy(ethers.parseEther('1000000'), initialSigners.deployer.address);
        const deploymentTx = token2.deploymentTransaction();
        await deploymentTx.wait();

        // Call setCrossChainAddress on token2
        await expect(token2.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'IncorrectTargetContract')
          .withArgs(await token1.getAddress(), await token2.getAddress());
      });

      it('Should revert when redeeming the wrong amount', async function () {
        const wrongAmount = amount + BigInt(1); // Add 1 wei
        await expect(token1.redeemCrossChain(receiver, wrongAmount, proof))
          .to.be.revertedWithCustomError(token1, 'IncorrectAmount')
          .withArgs(amount, wrongAmount);
      });

      it('Should revert when redeeming for wrong receiver', async function () {
        await expect(
          token1.redeemCrossChain(initialSigners.alice.address, amount, proof),
        )
          .to.be.revertedWithCustomError(token1, 'IncorrectReceiver')
          .withArgs(receiver, initialSigners.alice.address);
      });

      it('Should revert when redeeming with proof that has been tampered with', async function () {
        const tamperedProof = await createTamperedProof(
          token1Info.chain,
          origin,
        );
        await expect(
          token1.redeemCrossChain(receiver, amount, tamperedProof),
        ).to.be.revertedWithCustomError(token1, 'SPVVerificationFailed');
      });

      it('Should revert if authorized source contract is the zero address', async function () {
        const tx = await token1.setCrossChainAddress(
          token0Info.chain,
          ZeroAddress,
        );
        await tx.wait();
        await expect(token1.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(
            token1,
            'OriginContractAddressNotFound',
          )
          .withArgs(token0Info.chain);
      });

      it('Should revert if authorized source contract does not match origin contract address', async function () {
        // Generate a random Ethereum address
        const randomAddress = ethers.Wallet.createRandom().address;

        const tx = await token1.setCrossChainAddress(
          token0Info.chain,
          randomAddress,
        );
        await tx.wait();
        await expect(token1.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'UnauthorizedOriginContract')
          .withArgs(await token0.getAddress(), randomAddress);
      });

      it('Should revert if redeeming on a chain that is not the target chain Id', async function () {
        // Transfer to chain1
        const tx = await token0.transferCrossChain(
          receiver.address,
          amount,
          token1Info.chain,
        );
        await tx.wait();

        // Get proof for chain1 transfer
        const proof = await requestSpvProof(token1Info.chain, origin);

        // Try to redeem on chain0 (wrong chain)
        await expect(token0.redeemCrossChain(receiver.address, amount, proof))
          .to.be.revertedWithCustomError(token0, 'IncorrectTargetChainId')
          .withArgs(token1Info.chain, token0Info.chain);
      });

      it('Should revert if redeeming for wrong operation type', async function () {
        // Transfer to chain1. Mock transferCrossChain function sets wrong crossChainOperatonType
        const transferTx = await mockToken0.transferCrossChain(
          receiver.address,
          amount,
          mockToken1Info.chain,
        );
        const receipt = await transferTx.wait();

        // Find CrossChainInitialized event index
        const eventIndex = receipt.logs.findIndex(
          (log) =>
            log.topics[0] ===
            ethers.id('CrossChainInitialized(uint32,address,uint64,bytes)'),
        );

        // Create origin object matching initCrossChain structure
        const mockOrigin = {
          chain: mockToken0Info.chain,
          originContractAddress: await mockToken0.getAddress(),
          height: BigInt(receipt.blockNumber),
          txIdx: BigInt(receipt.index),
          eventIdx: BigInt(eventIndex),
        };

        // Get proof for chain1 transfer
        const proof = await requestSpvProof(mockToken1Info.chain, mockOrigin);

        // Try to redeem on chain1
        await expect(
          mockToken1.redeemCrossChain(receiver.address, amount, proof),
        )
          .to.be.revertedWithCustomError(mockToken1, 'IncorrectOperation')
          .withArgs(
            CrossChainOperation.Erc20TransferFrom,
            CrossChainOperation.Erc20Transfer,
          );
      });
    }); // End of Error Test Cases
  }); // End of redeemCrossChain

  describe('getChainwebChainId', async function () {
    // Can't test error cases without changing the precompile implementation
    context('Success Test Cases', async function () {
      it('Should return the correct chainweb chain id', async function () {
        // runOverChains handles the chain switching internally
        // We can use it to verify the chainweb chain id for each deployment
        await chainweb.runOverChains(async (chainId) => {
          const deployment = deployments.find(d => d.chain === chainId);
          expect(deployment).to.not.be.undefined;
          expect(await deployment.contract.getChainwebChainId()).to.equal(chainId);
        });
      });
    }); // End of Success Test Cases
  }); // End of getChainwebChainId

  describe('getCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should return the correct cross chain address', async function () {
        await authorizeAllContracts(deployments);

        await chainweb.runOverChains(async (chainId) => {
          //test the getCrossChainAddress function on each deployment
          const deployment = deployments.find(d => d.chain === chainId);
          expect(deployment).to.not.be.undefined;

          // For every other chain, check the cross-chain address mapping
          for (const other of deployments) {
            if (other.chain !== chainId) {
              // Should be set to the other contract's address
              expect(await deployment.contract.getCrossChainAddress(other.chain))
                .to.equal(other.address);
            } else {
              // Should be ZeroAddress for self
              expect(await deployment.contract.getCrossChainAddress(chainId))
                .to.equal(ZeroAddress);
            }
          }
        });
      });
    }); // End of Success Test Cases
  }); // End of getCrossChainAddress
}); // End of SimpleToken Unit Tests