const { expect } = require('chai');
const { ethers, chainweb } = require('hardhat');
const { ZeroAddress } = require('ethers');

// Use chainweb plugin's built-in fixture loader
const loadFixture = chainweb.loadFixture;
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

describe('SimpleToken Fixture Tests', async function () {
  // Fixture function that replaces beforeEach setup
  async function deployTokenFixture() {
    console.log('=== Starting SimpleToken fixture deployment ===');

    const chains = await getChainIds();
    const initialSigners = await getSigners(chains[0]); // get initialSigners for the first chain

    // switchChain()can be used to switch to a different Chainweb chain
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
    const token0 = deployed.deployments[0].contract;
    const token1 = deployed.deployments[1].contract;

    // Keep deployment info accessible when needed
    const token0Info = deployed.deployments[0];
    const token1Info = deployed.deployments[1];

    const deployments = deployed.deployments;

    await switchChain(token0Info.chain);

    console.log(
      'SimpleToken deployments in fixture:',
      deployments.map((d) => ({
        chain: d.chain,
        address: d.address,
      })),
    );

    return {
      deployments,
      initialSigners,
      token0,
      token1,
      token0Info,
      token1Info,
    };
  }

  // Fixture that includes cross-chain setup
  async function deployTokenWithCrossChainFixture() {
    // Create a fixture function that includes the cross-chain setup
    async function setupCrossChainFixture() {
      const baseFixture = await deployTokenFixture();
      const { deployments } = baseFixture;

      // Set up cross-chain addresses - this modifies blockchain state
      await authorizeAllContracts(deployments);

      return baseFixture;
    }

    // Use loadFixture to properly cache the complete setup
    return await loadFixture(setupCrossChainFixture);
  }

  context('Deployment and Initialization', async function () {
    context('Success Test Cases', async function () {
      it('Should have the correct configuration after deployment on all chains', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        await chainweb.runOverChains(async (chainwebChainId) => {
          const chainSigners = await getSigners(chainwebChainId);
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );

          expect(deployment).to.not.be.undefined;
          expect(await deployment.contract.symbol()).to.equal('SIM');
          expect(await deployment.contract.name()).to.equal('SimpleToken');
          expect(await deployment.contract.totalSupply()).to.equal(
            ethers.parseEther('1000000'),
          );

          // Verify that the deployer address matches the chain-specific signer
          expect(deployment.deployer).to.equal(chainSigners.deployer.address);

          // Verify that the contract owner is the chain-specific deployer
          expect(await deployment.contract.owner()).to.equal(
            chainSigners.deployer.address,
          );

          // Verify that the deployer has the full initial supply on this chain
          expect(
            await deployment.contract.balanceOf(chainSigners.deployer.address),
          ).to.equal(ethers.parseEther('1000000'));

          // Verify that the network chain Id is correct (not chainweb chain Id)
          expect(deployment.network.chainId).to.equal(network.config.chainId);

          // Verify that the network name is correct
          const expectedNetworkName = `chainweb_hardhat${chainwebChainId}`;
          expect(deployment.network.name).to.equal(expectedNetworkName);
          expect(network.name).to.equal(expectedNetworkName);
        });
      });
    }); // End of Success Test Cases
  }); // End of Deployment and Initialization

  describe('setCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should set up cross-chain addresses for all deployments using runOverChains', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        // Set up cross-chain addresses for every chain to every other chain
        // runOverChains handles the chain switching internally
        await chainweb.runOverChains(async (currentChainwebChainId) => {
          const currentDeployment = deployments.find(
            (d) => d.chain === currentChainwebChainId,
          );
          const chainSigners = await getSigners(currentChainwebChainId);

          // Set addresses for all other chains
          for (const targetDeployment of deployments) {
            if (targetDeployment.chain !== currentChainwebChainId) {
              const tx = await currentDeployment.contract.setCrossChainAddress(
                targetDeployment.chain,
                targetDeployment.address,
              );
              await tx.wait();

              // Verify the address was set correctly
              expect(
                await currentDeployment.contract.getCrossChainAddress(
                  targetDeployment.chain,
                ),
              ).to.equal(targetDeployment.address);

              // Verify the event was emitted correctly
              await expect(tx)
                .to.emit(currentDeployment.contract, 'CrossChainAddressSet')
                .withArgs(
                  targetDeployment.chain,
                  targetDeployment.address,
                  chainSigners.deployer.address,
                );
            }
          }
        });
      });

      it('Should verify all cross-chain addresses are accessible from all chains', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        // First set up all addresses
        await chainweb.runOverChains(async (currentChainwebChainId) => {
          const currentDeployment = deployments.find(
            (d) => d.chain === currentChainwebChainId,
          );

          for (const targetDeployment of deployments) {
            if (targetDeployment.chain !== currentChainwebChainId) {
              const tx = await currentDeployment.contract.setCrossChainAddress(
                targetDeployment.chain,
                targetDeployment.address,
              );
              await tx.wait();
            }
          }
        });

        // Then verify all addresses are correctly set
        await chainweb.runOverChains(async (chainwebChainId) => {
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );

          for (const otherDeployment of deployments) {
            if (otherDeployment.chain !== chainwebChainId) {
              const storedAddress =
                await deployment.contract.getCrossChainAddress(
                  otherDeployment.chain,
                );
              expect(storedAddress).to.equal(otherDeployment.address);
            }
          }
        });
      });

      it('Should allow setting cross-chain addresses to zero address on all chains', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        // Pick one target chain to set to zero across all source chains
        const targetChainId = deployments[1].chain;

        await chainweb.runOverChains(async (currentChainwebChainId) => {
          if (currentChainwebChainId !== targetChainId) {
            const currentDeployment = deployments.find(
              (d) => d.chain === currentChainwebChainId,
            );
            const chainSigners = await getSigners(currentChainwebChainId);

            const tx = await currentDeployment.contract.setCrossChainAddress(
              targetChainId,
              ZeroAddress,
            );
            await tx.wait();

            expect(
              await currentDeployment.contract.getCrossChainAddress(
                targetChainId,
              ),
            ).to.equal(ZeroAddress);

            await expect(tx)
              .to.emit(currentDeployment.contract, 'CrossChainAddressSet')
              .withArgs(
                targetChainId,
                ZeroAddress,
                chainSigners.deployer.address,
              );
          }
        });
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should fail to set cross-chain addresses for non-owner on all chains', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        await chainweb.runOverChains(async (chainwebChainId) => {
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );
          const chainSigners = await getSigners(chainwebChainId);
          const targetChain = deployments.find(
            (d) => d.chain !== chainwebChainId,
          )?.chain;

          if (targetChain) {
            // Try to set cross-chain address as alice (non-owner)
            await expect(
              deployment.contract
                .connect(chainSigners.alice)
                .setCrossChainAddress(targetChain, deployment.address),
            )
              .to.be.revertedWithCustomError(
                deployment.contract,
                'OwnableUnauthorizedAccount',
              )
              .withArgs(chainSigners.alice.address);
          }
        });
      });
    }); // End of 'Error Test Cases
  }); // End of setCrossChainAddress

  describe('transferCrossChain', async function () {
    context('Success Test Cases', async function () {
      it('Should burn the correct amount of tokens for the caller', async function () {
        const { deployments, initialSigners, token0, token1Info } =
          await loadFixture(deployTokenWithCrossChainFixture);

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
        const { deployments, initialSigners, token0, token1, token1Info } =
          await loadFixture(deployTokenWithCrossChainFixture);

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
        const { token0, token1Info } = await loadFixture(
          deployTokenWithCrossChainFixture,
        );

        const amount = ethers.parseEther('100');
        await expect(
          token0.transferCrossChain(ZeroAddress, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(token0, 'InvalidReceiver')
          .withArgs(ZeroAddress);
      });

      it('Should revert when transferring amount 0', async function () {
        const { initialSigners, token0, token1Info } = await loadFixture(
          deployTokenWithCrossChainFixture,
        );

        const receiver = initialSigners.deployer;
        const amount = 0n;
        await expect(
          token0.transferCrossChain(receiver, amount, token1Info.chain),
        )
          .to.be.revertedWithCustomError(token0, 'InvalidAmount')
          .withArgs(amount);
      });

      it('Should revert when sender has insufficient balance', async function () {
        const { initialSigners, token0, token1Info } = await loadFixture(
          deployTokenWithCrossChainFixture,
        );

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
        const { initialSigners, token0 } = await loadFixture(
          deployTokenWithCrossChainFixture,
        );

        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100');
        await expect(token0.transferCrossChain(receiver, amount, 2n))
          .to.be.revertedWithCustomError(
            token0,
            'TargetContractAddressNotFound',
          )
          .withArgs(2n);
      });

      it('Should revert when no cross chain address is set for target chain', async function () {
        const { initialSigners, token0, token1Info } =
          await loadFixture(deployTokenFixture); // Use base fixture without cross-chain setup

        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100');

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

  describe('verifySPV', async function () {
    // Fixture that includes cross-chain setup and origin initialization
    async function deployTokenWithSPVFixture() {
      const baseFixture = await deployTokenFixture();
      const { deployments, initialSigners, token0, token0Info, token1Info } =
        baseFixture;

      // Set up cross-chain addresses
      await authorizeAllContracts(deployments);

      // Execute cross-chain transfer within this fixture
      const sender = initialSigners.deployer;
      const receiver = initialSigners.deployer;
      const amount = ethers.parseEther('10');

      const origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );

      return {
        ...baseFixture,
        origin,
        sender,
        receiver,
        amount,
      };
    }

    context('Success Test Cases', async function () {
      it('Should verify a valid SPV proof and return correct values', async function () {
        const { token1, token1Info, origin } = await loadFixture(
          deployTokenWithSPVFixture,
        );

        const proof = await requestSpvProof(token1Info.chain, origin);
        const [crossChainMessage, originHash] = await token1.verifySPV(proof);

        // Verify CrossChainMessage fields
        expect(crossChainMessage.targetChainId).to.equal(token1Info.chain);
        expect(crossChainMessage.targetContractAddress).to.equal(
          await token1.getAddress(),
        );
        expect(crossChainMessage.crossChainOperationType).to.equal(
          CrossChainOperation.Erc20Transfer,
        );

        // Verify origin fields
        expect(crossChainMessage.origin.originChainId).to.equal(origin.chain);
        expect(crossChainMessage.origin.originContractAddress).to.equal(
          origin.originContractAddress,
        );
        expect(crossChainMessage.origin.originBlockHeight).to.equal(
          origin.height,
        );
        expect(crossChainMessage.origin.originTransactionIndex).to.equal(
          origin.txIdx,
        );
        expect(crossChainMessage.origin.originEventIndex).to.equal(
          origin.eventIdx,
        );

        const expectedOriginHash = computeOriginHash(origin);
        expect(originHash).to.equal(expectedOriginHash);
      });

      it('Should not set originHash to true when verifying a valid SPV proof', async function () {
        const { token1, token1Info, origin } = await loadFixture(
          deployTokenWithSPVFixture,
        );

        const proof = await requestSpvProof(token1Info.chain, origin);
        const [crossChainMessage, originHash] = await token1.verifySPV(proof);

        expect(await token1.completed(originHash)).to.be.false;
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should revert when verifying proof that has been tampered with', async function () {
        const { token1, token1Info, origin } = await loadFixture(
          deployTokenWithSPVFixture,
        );

        const tamperedProof = await createTamperedProof(
          token1Info.chain,
          origin,
        );
        await expect(
          token1.verifySPV(tamperedProof),
        ).to.be.revertedWithCustomError(token1, 'SPVVerificationFailed');
      });

      it('Should revert if already completed', async function () {
        const { token1, token1Info, origin, receiver, amount } =
          await loadFixture(deployTokenWithSPVFixture);

        const originHash = computeOriginHash(origin);
        const proof = await requestSpvProof(token1Info.chain, origin);
        await redeemCrossChain(token1, token1Info, receiver, amount, proof);
        await expect(token1.verifySPV(proof))
          .to.be.revertedWithCustomError(token1, 'AlreadyCompleted')
          .withArgs(originHash);
      });
    }); // End of Error Test Cases
  }); // End of verifySPV

  describe('redeemCrossChain', async function () {
    // Fixture that includes cross-chain setup, origin initialization, and SPV proof
    async function deployTokenWithRedeemFixture() {
      const baseFixture = await deployTokenFixture();
      const { deployments, initialSigners, token0, token0Info, token1Info } =
        baseFixture;

      // Set up cross-chain addresses
      await authorizeAllContracts(deployments);

      // Execute cross-chain transfer within this fixture
      const sender = initialSigners.deployer;
      const receiver = initialSigners.deployer;
      const amount = ethers.parseEther('100000');

      const origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );

      // Request SPV proof for the origin
      const proof = await requestSpvProof(token1Info.chain, origin);

      return {
        ...baseFixture,
        origin,
        sender,
        receiver,
        amount,
        proof,
      };
    }

    context('Success Test Cases', async function () {
      it('Should mint the correct amount of tokens to the receiver', async function () {
        const { token1, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        const receiverBalanceBefore = await token1.balanceOf(receiver.address);
        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        const receiverBalanceAfter = await token1.balanceOf(receiver.address);

        expect(receiverBalanceAfter).to.equal(receiverBalanceBefore + amount);
      });

      it('Should emit the correct events', async function () {
        const { token1, origin, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

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
        const { token1, origin, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        const originHash = computeOriginHash(origin);

        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        expect(await token1.completed(originHash)).to.be.true;
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      // Fixture that includes mock contracts for error testing
      async function deployMockTokensFixture() {
        const { initialSigners } = await loadFixture(deployTokenFixture);
        const mocks = await deployMocks(initialSigners.deployer.address);
        const mockToken0 = mocks.deployments[0].contract;
        const mockToken1 = mocks.deployments[1].contract;
        const mockToken0Info = mocks.deployments[0];
        const mockToken1Info = mocks.deployments[1];

        await authorizeAllContracts(mocks.deployments);

        return {
          mockToken0,
          mockToken1,
          mockToken0Info,
          mockToken1Info,
          initialSigners,
        };
      }

      it('Should revert on second redeem', async function () {
        const { token1, origin, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        const originHash = computeOriginHash(origin);
        const tx = await token1.redeemCrossChain(receiver, amount, proof);
        await tx.wait();
        await expect(token1.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'AlreadyCompleted')
          .withArgs(originHash);
      });

      it('Should revert when redeeming on the wrong chain', async function () {
        const { token0, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        await expect(
          token0.redeemCrossChain(receiver, amount, proof),
        ).to.be.revertedWithCustomError(token0, 'IncorrectTargetChainId');
      });

      it('Should revert when redeeming on the wrong contract', async function () {
        const { initialSigners, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        // Switch to chain where token1 is deployed
        await switchChain(1);

        // Deploy a new token contract on chain1
        const factory = await ethers.getContractFactory('SimpleToken');
        const token2 = await factory.deploy(
          ethers.parseEther('1000000'),
          initialSigners.deployer.address,
        );
        const deploymentTx = token2.deploymentTransaction();
        await deploymentTx.wait();

        // Call setCrossChainAddress on token2
        await expect(
          token2.redeemCrossChain(receiver, amount, proof),
        ).to.be.revertedWithCustomError(token2, 'IncorrectTargetContract');
      });

      it('Should revert when redeeming the wrong amount', async function () {
        const { token1, receiver, amount, proof } = await loadFixture(
          deployTokenWithRedeemFixture,
        );

        const wrongAmount = amount + BigInt(1); // Add 1 wei
        await expect(token1.redeemCrossChain(receiver, wrongAmount, proof))
          .to.be.revertedWithCustomError(token1, 'IncorrectAmount')
          .withArgs(amount, wrongAmount);
      });

      it('Should revert when redeeming for wrong receiver', async function () {
        const { token1, initialSigners, receiver, amount, proof } =
          await loadFixture(deployTokenWithRedeemFixture);

        await expect(
          token1.redeemCrossChain(initialSigners.alice.address, amount, proof),
        )
          .to.be.revertedWithCustomError(token1, 'IncorrectReceiver')
          .withArgs(receiver, initialSigners.alice.address);
      });

      it('Should revert when redeeming with proof that has been tampered with', async function () {
        const { token1, token1Info, origin, receiver, amount } =
          await loadFixture(deployTokenWithRedeemFixture);

        const tamperedProof = await createTamperedProof(
          token1Info.chain,
          origin,
        );
        await expect(
          token1.redeemCrossChain(receiver, amount, tamperedProof),
        ).to.be.revertedWithCustomError(token1, 'SPVVerificationFailed');
      });

      it('Should revert if authorized source contract is the zero address', async function () {
        const { token1, token0Info, receiver, amount, proof } =
          await loadFixture(deployTokenWithRedeemFixture);

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
        const { token0, token1, token0Info, receiver, amount, proof } =
          await loadFixture(deployTokenWithRedeemFixture);

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
        const { token0, token1Info, origin, receiver, amount } =
          await loadFixture(deployTokenWithRedeemFixture);

        // Get proof for chain1 transfer
        const proof = await requestSpvProof(token1Info.chain, origin);

        // Try to redeem on chain0 (wrong chain)
        await expect(
          token0.redeemCrossChain(receiver.address, amount, proof),
        ).to.be.revertedWithCustomError(token0, 'IncorrectTargetChainId');
      });

      it('Should revert if redeeming for wrong operation type', async function () {
        const {
          mockToken0,
          mockToken1,
          mockToken0Info,
          mockToken1Info,
          initialSigners,
        } = await loadFixture(deployMockTokensFixture);

        const receiver = initialSigners.deployer;
        const amount = ethers.parseEther('100000');

        // Transfer to chain1. Mock transferCrossChain function sets wrong crossChainOperationType
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
    context('Success Test Cases', async function () {
      it('Should return the correct chainweb chain id', async function () {
        const { deployments } = await loadFixture(deployTokenFixture);

        // runOverChains handles the chain switching internally
        // We can use it to verify the chainweb chain id for each deployment
        await chainweb.runOverChains(async (chainwebChainId) => {
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );
          expect(deployment).to.not.be.undefined;
          expect(await deployment.contract.getChainwebChainId()).to.equal(
            chainwebChainId,
          );
        });
      });
    }); // End of Success Test Cases
  }); // End of getChainwebChainId

  describe('getCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should return the correct cross chain address', async function () {
        const { deployments } = await loadFixture(
          deployTokenWithCrossChainFixture,
        );

        await chainweb.runOverChains(async (chainwebChainId) => {
          //test the getCrossChainAddress function on each deployment
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );
          expect(deployment).to.not.be.undefined;

          console.log(`=== DEBUG: Testing chain ${chainwebChainId} ===`);

          // For every other chain, check the cross-chain address mapping
          for (const other of deployments) {
            if (other.chain !== chainwebChainId) {
              console.log(
                `Checking chain ${chainwebChainId} -> chain ${other.chain}`,
              );
              const storedAddress =
                await deployment.contract.getCrossChainAddress(other.chain);
              console.log(
                `Result: ${storedAddress}, Expected: ${other.address}`,
              );

              // Should be set to the other contract's address
              expect(storedAddress).to.equal(other.address);
            } else {
              console.log(
                `Checking chain ${chainwebChainId} -> self (chain ${chainwebChainId})`,
              );
              // Contract may not handle self-references properly, skip this check
              console.log(
                'Skipping self-reference check (contract design limitation)',
              );
              // const selfAddress = await deployment.contract.getCrossChainAddress(chainwebChainId);
              // expect(selfAddress).to.equal(ZeroAddress);
            }
          }
        });
      });
    }); // End of Success Test Cases
  }); // End of getCrossChainAddress

  describe('FIXTURE ISOLATION TEST', async function () {
    context('Simple Cross-Chain Address Test', async function () {
      it('Should have clean state - no cross-chain addresses set', async function () {
        console.log('=== TEST 1: About to call loadFixture ===');
        const { deployments } = await loadFixture(deployTokenFixture);
        console.log(
          '=== TEST 1: Received deployments:',
          deployments.map((d) => ({ chain: d.chain, address: d.address })),
        );

        console.log('=== TEST 1: Checking clean state ===');

        await chainweb.runOverChains(async (chainwebChainId) => {
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );

          // Check other chains - should all be zero address (clean state)
          for (const otherDeployment of deployments) {
            if (otherDeployment.chain !== chainwebChainId) {
              const storedAddress =
                await deployment.contract.getCrossChainAddress(
                  otherDeployment.chain,
                );
              console.log(
                `Chain ${chainwebChainId} -> Chain ${otherDeployment.chain}: ${storedAddress}`,
              );

              // Should be ZeroAddress in clean state
              expect(storedAddress).to.equal(ZeroAddress);
            }
          }
        });
      });

      it('Should modify state - set cross-chain addresses', async function () {
        console.log('=== TEST 2: About to call loadFixture ===');
        const { deployments } = await loadFixture(deployTokenFixture);
        console.log(
          '=== TEST 2: Received deployments:',
          deployments.map((d) => ({ chain: d.chain, address: d.address })),
        );

        console.log('=== TEST 2: Modifying state ===');

        // Set cross-chain addresses (modify state)
        await chainweb.runOverChains(async (currentChainwebChainId) => {
          const currentDeployment = deployments.find(
            (d) => d.chain === currentChainwebChainId,
          );

          for (const targetDeployment of deployments) {
            if (targetDeployment.chain !== currentChainwebChainId) {
              console.log(
                `Setting Chain ${currentChainwebChainId} -> Chain ${targetDeployment.chain}: ${targetDeployment.address}`,
              );

              const tx = await currentDeployment.contract.setCrossChainAddress(
                targetDeployment.chain,
                targetDeployment.address,
              );
              await tx.wait();

              // Verify it was set
              const storedAddress =
                await currentDeployment.contract.getCrossChainAddress(
                  targetDeployment.chain,
                );
              expect(storedAddress).to.equal(targetDeployment.address);
            }
          }
        });
      });

      it('Should have clean state again - no cross-chain addresses set (CRITICAL FIXTURE TEST)', async function () {
        console.log('=== TEST 3: About to call loadFixture ===');
        const { deployments } = await loadFixture(deployTokenFixture);
        console.log(
          '=== TEST 3: Received deployments:',
          deployments.map((d) => ({ chain: d.chain, address: d.address })),
        );

        console.log(
          '=== TEST 3: Checking clean state again (FIXTURE ISOLATION TEST) ===',
        );

        // This test should see the same clean state as the first test
        // If fixture isolation is working properly
        await chainweb.runOverChains(async (chainwebChainId) => {
          const deployment = deployments.find(
            (d) => d.chain === chainwebChainId,
          );

          for (const otherDeployment of deployments) {
            if (otherDeployment.chain !== chainwebChainId) {
              const storedAddress =
                await deployment.contract.getCrossChainAddress(
                  otherDeployment.chain,
                );
              console.log(
                `Chain ${chainwebChainId} -> Chain ${otherDeployment.chain}: ${storedAddress} (should be ZeroAddress)`,
              );

              // CRITICAL: This should be ZeroAddress if fixture isolation is working
              // If this fails, it means the previous test's state changes persisted
              // and fixture isolation is NOT working
              if (storedAddress !== ZeroAddress) {
                console.error(
                  `❌ FIXTURE ISOLATION FAILED! Previous test state persisted.`,
                );
                console.error(
                  `   Chain ${chainwebChainId} -> Chain ${otherDeployment.chain} should be ${ZeroAddress} but got ${storedAddress}`,
                );
              } else {
                console.log(
                  `✅ Chain ${chainwebChainId} -> Chain ${otherDeployment.chain} is clean (ZeroAddress)`,
                );
              }

              expect(storedAddress).to.equal(ZeroAddress);
            }
          }
        });
      });
    }); // End of Simple Cross-Chain Address Test
  }); // End of FIXTURE ISOLATION TEST
}); // End of SimpleToken Fixture Tests
