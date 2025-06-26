import { DeployedContractsOnChains, Origin } from '@kadena/hardhat-chainweb';
import { HardhatEthersSigner, Signers } from './utils/utils';

import { expect } from 'chai';

import { ethers, chainweb } from 'hardhat';
import { ZeroAddress } from 'ethers';
import {
  authorizeAllContracts,
  initCrossChain,
  CrossChainOperation,
  redeemCrossChain,
  getSigners,
  deployMocks,
} from './utils/utils';
import {
  SimpleToken,
  SimpleToken__factory,
  WrongOperationTypeToken,
} from '../typechain-types';

const {
  deployContractOnChains,
  computeOriginHash,
  requestSpvProof,
  createTamperedProof,
  switchChain,
  getChainIds
} = chainweb;

describe('SimpleToken Unit Tests', async function () {
  let deployments: DeployedContractsOnChains<SimpleToken>[];
  let initialSigners: Signers;
  let token0: SimpleToken;
  let token1: SimpleToken;
  let origin: Origin;
  let sender: HardhatEthersSigner;
  let receiver: HardhatEthersSigner;
  let amount: bigint;
  let token0Info: DeployedContractsOnChains<SimpleToken>;
  let token1Info: DeployedContractsOnChains<SimpleToken>;

  beforeEach(async function () {
    const chains = await getChainIds();
    initialSigners = await getSigners(chains[0]); // get initialSigners for the first chain

    // switchChain()can be used to switch to a different Chainweb chain
    // deployContractOnChains switches chains before deploying on each one
    // Because this contract takes an address as a constructor param, we pass it in here as an address.
    // In solidity, the address has no specific network affiliation like a signer does in Hardhat.

    const deployed = await deployContractOnChains<SimpleToken>({
      name: 'SimpleToken',
      constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
    });

    console.log("deployed", deployed);

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
      it('Should have the correct configuration after deployment on both chains', async function () {
        expect(await token0.symbol()).to.equal('SIM');
        expect(await token0.totalSupply()).to.equal(
          ethers.parseEther('1000000'),
        );
        expect(await token1.totalSupply()).to.equal(
          ethers.parseEther('1000000'),
        );
        expect(await token1.name()).to.equal('SimpleToken');
        expect(await token1.symbol()).to.equal('SIM');
      });
    }); // End of Success Test Cases
  }); // End of Deployment and Initialization

  describe('setCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should correctly set cross chain addresses', async function () {
        // Explicitly set cross-chain addresses for token0
        const tx1 = await token0.setCrossChainAddress(
          token1Info.chain,
          await token1.getAddress(),
        );
        await tx1.wait();
        expect(await token0.getCrossChainAddress(token1Info.chain)).to.equal(
          await token1.getAddress(),
        );

        await expect(tx1)
          .to.emit(token0, 'CrossChainAddressSet')
          .withArgs(
            token1Info.chain,
            await token1.getAddress(),
            initialSigners.deployer.address,
          );

        // Explicitly set cross-chain addresses for token1
        await switchChain(token1Info.chain);
        const tx2 = await token1.setCrossChainAddress(
          token0Info.chain,
          await token0.getAddress(),
        );
        await tx2.wait();
        expect(await token1.getCrossChainAddress(token0Info.chain)).to.equal(
          await token0.getAddress(),
        );

        await expect(tx2)
          .to.emit(token1, 'CrossChainAddressSet')
          .withArgs(
            token0Info.chain,
            await token0.getAddress(),
            initialSigners.deployer.address,
          );
      });

      it('Should allow a cross chain address to be set to the zero address', async function () {
        // Explicitly set cross-chain addresses for token0
        const tx1 = await token0.setCrossChainAddress(
          token1Info.chain,
          ZeroAddress,
        );
        await tx1.wait();
        expect(await token0.getCrossChainAddress(token1Info.chain)).to.equal(
          ZeroAddress,
        );

        await expect(tx1)
          .to.emit(token0, 'CrossChainAddressSet')
          .withArgs(token1Info.chain, ZeroAddress, initialSigners.deployer.address);
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      it('Should fail to set cross chain addresses for non-owner', async function () {
        // Attempt to set cross-chain addresses for token0 from a non-owner
        await expect(
          token0
            .connect(initialSigners.alice)
            .setCrossChainAddress(token1Info.chain, await token1.getAddress()),
        )
          .to.be.revertedWithCustomError(token0, 'OwnableUnauthorizedAccount')
          .withArgs(initialSigners.alice.address);
      });
    });
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
      it('Should verify a valid SPV proof and return correct values', async function () {
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
        expect(crossChainMessage.origin.originChainId).to.equal(
          token0Info.chain,
        );
        expect(crossChainMessage.origin.originContractAddress).to.equal(
          await token0.getAddress(),
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
        const proof = await requestSpvProof(token1Info.chain, origin);
        const [, originHash] = await token1.verifySPV(proof);

        await expect(await token1.completed(originHash)).to.be.false;
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

      await switchChain(token0Info.chain); // make sure we start on the first chain
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

      it('Should revert when no cross chain address is set for target chain', async function () {
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
    let proof: string;

    beforeEach(async function () {
      await authorizeAllContracts(deployments);

      // Get sender on the "from" chain
      const fromChainSigners = await getSigners(token0Info.chain);
      sender = fromChainSigners.deployer;

      // Need to get the receiver associated with the "to" chain
      const toChainSigners = await getSigners(token1Info.chain);
      receiver = toChainSigners.deployer;
      amount = ethers.parseEther('100000');

      origin = await initCrossChain(
        token0,
        token0Info,
        token1Info,
        sender,
        receiver,
        amount,
      );
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
        await expect(await token1.completed(originHash)).to.be.true;
      });
    }); // End of Success Test Cases

    context('Error Test Cases', async function () {
      let mockToken0: WrongOperationTypeToken;
      let mockToken1: WrongOperationTypeToken;
      let mockToken0Info: DeployedContractsOnChains;
      let mockToken1Info: DeployedContractsOnChains;

      beforeEach(async function () {
        const mocks = await deployMocks(initialSigners.deployer.address);
        mockToken0 = mocks.deployments[0]
          .contract as unknown as WrongOperationTypeToken;
        mockToken1 = mocks.deployments[1]
          .contract as unknown as WrongOperationTypeToken;

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
        await switchChain(token0Info.chain);
        await expect(token0.redeemCrossChain(receiver, amount, proof))
          .to.be.revertedWithCustomError(token1, 'IncorrectTargetChainId')
          .withArgs(token1Info.chain, token0Info.chain);
      });

      it('Should revert when redeeming on the wrong contrct', async function () {
        // Switch to chain1, where token1 is deployed
        await switchChain(token1Info.chain);

        const signers = await getSigners(token1Info.chain);

        // Deploy a new token contract on chain1
        const factory = await ethers.getContractFactory('SimpleToken');
        const token2 = await factory.deploy(ethers.parseEther('1000000'), signers.deployer.address);
        const deploymentTx = token2.deploymentTransaction();
        if (!deploymentTx) {
          throw new Error('Deployment transaction failed');
        }
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

        if (!receipt) {
          throw new Error('Transfer transaction failed, no receipt');
        }

        // Find CrossChainInitialized event index
        const eventIndex = receipt.logs.findIndex(
          (log) =>
            log.topics[0] ===
            ethers.id('CrossChainInitialized(uint32,address,uint64,bytes)'),
        );

        // Create origin object matching initCrossChain structure
        const mockOrigin = {
          chain: BigInt(mockToken0Info.chain),
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
        // Token0 is deployed on chain 0
        // Token1 is deployed on chain 1
        // getChainwebChainId() should return the correct chain id for each token, regardless of the current network
        const chains = await getChainIds();
        expect(await token0.getChainwebChainId()).to.equal(chains[0]);
        expect(await token1.getChainwebChainId()).to.equal(chains[1]);
        await switchChain(token1Info.chain);
        expect(await token1.getChainwebChainId()).to.equal(chains[1]);
        expect(await token0.getChainwebChainId()).to.equal(chains[0]);
      });
    }); // End of Success Test Cases
  }); // End of getChainwebChainId

  describe('getCrossChainAddress', async function () {
    context('Success Test Cases', async function () {
      it('Should return the correct cross chain address', async function () {
        // Explicitly set cross-chain addresses for token0
        const tx1 = await token0.setCrossChainAddress(
          token1Info.chain,
          await token1.getAddress(),
        );
        await tx1.wait();
        expect(await token0.getCrossChainAddress(token1Info.chain)).to.equal(
          await token1.getAddress(),
        );
        expect(await token0.getCrossChainAddress(token0Info.chain)).to.equal(
          ZeroAddress,
        );

        // Explicitly set cross-chain addresses for token1
        await switchChain(token1Info.chain);
        const tx2 = await token1.setCrossChainAddress(
          token0Info.chain,
          await token0.getAddress(),
        );
        await tx2.wait();
        expect(await token1.getCrossChainAddress(token0Info.chain)).to.equal(
          await token0.getAddress(),
        );
        expect(await token1.getCrossChainAddress(token1Info.chain)).to.equal(
          ZeroAddress,
        );
      });
    }); // End of Success Test Cases
  }); // End of getCrossChainAddress

  describe('CREATE2 Deployment Tests', function () {
    let initialSigners: Signers;
    let create2FactoryAddress: string;

    describe('Create2 Factory Deployment', function () {
      beforeEach(async function () {
        const chains = await getChainIds();
        initialSigners = await getSigners(chains[0]);
      });
      context('Success Test Cases', async function () {
        it('Should deploy the CREATE2 factory on all chains with the same address', async function () {
          const [factoryAddress, deployments] =
            await chainweb.create2.deployCreate2Factory();

          create2FactoryAddress = factoryAddress;
          expect(factoryAddress).to.be.a('string');
          expect(ethers.isAddress(factoryAddress)).to.equal(true);

          // Verify factory deployed on all chains
          const allChains = await getChainIds();
          expect(deployments.length).to.equal(allChains.length);

          // Verify all deployments have the same address
          for (const deployment of deployments) {
            expect(deployment.address).to.equal(factoryAddress);

            // Check contract code exists at address on each chain
            await chainweb.switchChain(deployment.chain);
            const code = await ethers.provider.getCode(factoryAddress);
            expect(code).to.not.equal('0x');
          }
        });

        it('Should deploy factory with a specific version resulting in different address', async function () {
          // First deploy with default version (1) - default is 1
          const [defaultFactoryAddress] =
            await chainweb.create2.deployCreate2Factory();

          // Then deploy with a different version
          const version = 2;
          const [versionedFactoryAddress, deployments] =
            await chainweb.create2.deployCreate2Factory({ version });

          // Addresses should be different due to different versions
          expect(versionedFactoryAddress).to.not.equal(defaultFactoryAddress);
          expect(ethers.isAddress(versionedFactoryAddress)).to.equal(true);

          // Verify factory deployed on all chains
          const allChains = await getChainIds();
          expect(deployments.length).to.equal(allChains.length);

          // Verify all deployments have the same address across chains
          for (const deployment of deployments) {
            expect(deployment.address).to.equal(versionedFactoryAddress);

            // Check contract code exists at address on each chain
            await chainweb.switchChain(deployment.chain);
            const code = await ethers.provider.getCode(versionedFactoryAddress);
            expect(code).to.not.equal('0x');
          }
        });

        it('Should deploy factory with a different signer resulting in different address', async function () {
          // First deploy with default signer
          const [defaultFactoryAddress] =
            await chainweb.create2.deployCreate2Factory();

          // Use Alice from the initialSigners object that was set up in beforeEach
          const [aliceFactoryAddress, deployments] =
            await chainweb.create2.deployCreate2Factory({
              signer: initialSigners.alice,
            });

          // Addresses should be different due to different initialSigners
          expect(aliceFactoryAddress).to.not.equal(defaultFactoryAddress);
          expect(ethers.isAddress(aliceFactoryAddress)).to.equal(true);

          // Verify factory deployed on all chains
          const allChains = await getChainIds();
          expect(deployments.length).to.equal(allChains.length);

          // Verify all deployments have the same address across chains
          for (const deployment of deployments) {
            expect(deployment.address).to.equal(aliceFactoryAddress);

            // Check contract code exists at address on each chain
            await chainweb.switchChain(deployment.chain);
            const code = await ethers.provider.getCode(aliceFactoryAddress);
            expect(code).to.not.equal('0x');
          }
        });

        it('Should deploy factory with both custom signer and version', async function () {
          // Deploy with custom signer and version
          const version = 999;
          const [customFactoryAddress, deployments] =
            await chainweb.create2.deployCreate2Factory({
              signer: initialSigners.bob,
              version,
            });

          expect(ethers.isAddress(customFactoryAddress)).to.equal(true);

          // Verify factory deployed on all chains
          const allChains = await getChainIds();
          expect(deployments.length).to.equal(allChains.length);

          // Verify all deployments have the same address across chains
          for (const deployment of deployments) {
            expect(deployment.address).to.equal(customFactoryAddress);

            // Check contract code exists at address on each chain
            await chainweb.switchChain(deployment.chain);
            const code = await ethers.provider.getCode(customFactoryAddress);
            expect(code).to.not.equal('0x');
          }

          // Compare with other combinations to ensure uniqueness
          const [defaultFactoryAddress] =
            await chainweb.create2.deployCreate2Factory();
          const [versionedFactoryAddress] =
            await chainweb.create2.deployCreate2Factory({ version });
          const [signerFactoryAddress] =
            await chainweb.create2.deployCreate2Factory({
              signer: initialSigners.bob,
            });

          // All addresses should be different
          expect(customFactoryAddress).to.not.equal(defaultFactoryAddress);
          expect(customFactoryAddress).to.not.equal(versionedFactoryAddress);
          expect(customFactoryAddress).to.not.equal(signerFactoryAddress);
        });

        it('Should reuse existing factory if already deployed with same parameters', async function () {
          // Deploy factory first time
          const [firstAddress] = await chainweb.create2.deployCreate2Factory();

          // Deploy "again" with same parameters
          const [secondAddress, secondDeployments] =
            await chainweb.create2.deployCreate2Factory();

          // Should return same address without redeploying
          expect(secondAddress).to.equal(firstAddress);

          // Verify factory is still deployed on all chains
          const allChains = await getChainIds();
          expect(secondDeployments.length).to.equal(allChains.length);

          for (const deployment of secondDeployments) {
            expect(deployment.address).to.equal(firstAddress);
          }
        });
      }); // End of Success Test Cases
    }); // End of Create2 Factory Deployment

    describe('Contract deployment with CREATE2', function () {
      beforeEach(async function () {
        // Get all chains
        const chains = await getChainIds();

        // Initialize initialSigners - 
        initialSigners = await getSigners(chains[0]);

        // Deploy a fresh factory for each test
        [create2FactoryAddress] = await chainweb.create2.deployCreate2Factory();
      });

      describe('Success Test Cases', async function () {
        it('Should deploy SimpleToken using CREATE2 on all chains with the same address', async function () {
          const salt = 'SimpleToken_v1'; // Deterministic salt

          const deployResult =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: create2FactoryAddress,
            });

          // Check all chains have deployments
          const allChains = await getChainIds();
          expect(deployResult.deployments.length).to.equal(allChains.length);

          // Get first deployment address to compare with others
          const expectedAddress = deployResult.deployments[0].address;

          // Check each deployment has the same address and works correctly
          await Promise.all(
            deployResult.deployments.map(async (deployment) => {
              // Verify same address on all chains
              expect(deployment.address).to.equal(expectedAddress);

              // Switch to the chain for this deployment
              await chainweb.switchChain(deployment.chain);

              // Verify contract works correctly
              const token = deployment.contract as SimpleToken;
              expect(await token.symbol()).to.equal('SIM');
              expect(await token.totalSupply()).to.equal(
                ethers.parseEther('1000000'),
              );
            }),
          );
        });

        it('Should support ethers address prediction', async function () {
          const salt = 'SimpleToken_prediction_test';

          // Get the compiled bytecode
          const factory = await ethers.getContractFactory('SimpleToken');
          const tx = await factory.getDeployTransaction(
            ethers.parseUnits('1000000'), initialSigners.deployer.address
          );
          const bytecode = tx.data as string;

          const bytecodeHash = ethers.keccak256(bytecode);

          // Convert salt to bytes
          const saltBytes = ethers.getBytes(ethers.id(salt));

          // Predict address using ethers.getCreate2Address
          const predictedAddress = ethers.getCreate2Address(
            create2FactoryAddress,
            saltBytes,
            bytecodeHash,
          );

          // Test prediction across all chains
          const results = await chainweb.runOverChains(async (chainId) => {
            // Deploy on this chain
            const deployOptions = {
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: create2FactoryAddress,
              bindToSender: false,
            };

            // Use deployOnChainsUsingCreate2 with a specific chain
            const deployed =
              await chainweb.create2.deployOnChainsUsingCreate2(deployOptions);
            const deployedAddress = deployed.deployments[0].address;

            // Verify the address matches the prediction
            expect(deployedAddress).to.equal(predictedAddress);

            // Verify contract code exists at the address
            const code = await ethers.provider.getCode(deployedAddress);
            expect(code).to.not.equal('0x');

            return { chainId, deployedAddress };
          });

          // Verify all chains deployed to the same address
          for (const result of results) {
            expect(result.deployedAddress).to.equal(predictedAddress);
          }
        });

        it('Should deploy SimpleToken using CREATE2 on all chains with the same address using runOverChains', async function () {
          const salt = 'SimpleToken_runOverChains_test'; // Different salt

          // Deploy on all chains
          const deployResult =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: create2FactoryAddress,
            });

          // Get the deployed address to compare across chains
          const expectedAddress = deployResult.deployments[0].address;

          // Using runOverChains to verify each deployment properly
          const results = await chainweb.runOverChains(async (chainId) => {
            // Switch to the correct chain
            await chainweb.switchChain(chainId);

            // Verify contract code exists
            const code = await ethers.provider.getCode(expectedAddress);
            expect(code).to.not.equal('0x');

            // Connect to the contract on this chain
            const token = SimpleToken__factory.connect(
              expectedAddress,
              initialSigners.deployer,
            );

            // Verify contract functionality
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();

            // Return verification data
            return {
              chainId,
              address: expectedAddress,
              symbol,
              totalSupply,
            };
          });

          // Verify all chains have the correct contract with the same address
          for (const result of results) {
            expect(result.address).to.equal(expectedAddress);
            expect(result.symbol).to.equal('SIM');
            expect(result.totalSupply).to.equal(ethers.parseEther('1000000'));
          }
        });

        it('Should deploy contracts to different addresses when using different salts', async function () {
          // Deploy with first salt
          const salt1 = 'SimpleToken_salt_1';
          const deployResult1 =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt: salt1,
              create2Factory: create2FactoryAddress,
            });
          const address1 = deployResult1.deployments[0].address;

          // Deploy with second salt
          const salt2 = 'SimpleToken_salt_2';
          const deployResult2 =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt: salt2,
              create2Factory: create2FactoryAddress,
            });
          const address2 = deployResult2.deployments[0].address;

          // Addresses should be different due to different salts
          expect(address1).to.not.equal(address2);
          expect(ethers.isAddress(address1)).to.equal(true);
          expect(ethers.isAddress(address2)).to.equal(true);

          // Verify both contracts are deployed and working correctly on all chains
          const allChains = await getChainIds();

          for (const chain of allChains) {
            await chainweb.switchChain(chain);

            // Check first contract
            const code1 = await ethers.provider.getCode(address1);
            expect(code1).to.not.equal('0x');
            const token1 = SimpleToken__factory.connect(
              address1,
              initialSigners.deployer,
            );
            expect(await token1.symbol()).to.equal('SIM');

            // Check second contract
            const code2 = await ethers.provider.getCode(address2);
            expect(code2).to.not.equal('0x');
            const token2 = SimpleToken__factory.connect(
              address2,
              initialSigners.deployer,
            );
            expect(await token2.symbol()).to.equal('SIM');
          }
        });

        it('Should deploy contracts to the same address when using same salt but different signer', async function () {
          const salt = 'SimpleToken_different_initialSigners_test';

          // Deploy with deployer
          const deployerResult =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              signer: initialSigners.deployer,
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: create2FactoryAddress,
            });
          const deployerAddress = deployerResult.deployments[0].address;

          // Deploy with Alice
          const aliceResult = await chainweb.create2.deployOnChainsUsingCreate2(
            {
              name: 'SimpleToken',
              signer: initialSigners.alice,
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: create2FactoryAddress,
            },
          );
          const aliceAddress = aliceResult.deployments[0].address;

          // Addresses should be the same despite different initialSigners.
          // The Create2Factory is the deployer in both cases.
          expect(deployerAddress).to.be.equal(aliceAddress);

          // Verify both contracts are deployed correctly on all chains
          const allChains = await getChainIds();

          for (const chain of allChains) {
            await chainweb.switchChain(chain);

            // Check deployer's contract
            const code1 = await ethers.provider.getCode(deployerAddress);
            expect(code1).to.not.equal('0x');

            // Check Alice's contract
            const code2 = await ethers.provider.getCode(aliceAddress);
            expect(code2).to.not.equal('0x');
          }
        });

        it('Should deploy using a factory address from a specific version', async function () {
          // Get factory addresses for two different versions
          const factoryAddressV1 =
            await chainweb.create2.getCreate2FactoryAddress();
          const factoryAddressV2 =
            await chainweb.create2.getCreate2FactoryAddress({ version: 2 });

          // Ensure they're different addresses due to version difference
          expect(factoryAddressV1).to.not.equal(factoryAddressV2);

          // Deploy the factory for version 2 if not already deployed
          await chainweb.create2.deployCreate2Factory({ version: 2 });

          // Create a consistent salt for both deployments
          const salt = 'SimpleToken_factory_version_test';

          // Deploy using factory V1 (default)
          const deployResultV1 =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: factoryAddressV1,
            });
          const addressV1 = deployResultV1.deployments[0].address;

          // Deploy using factory V2 (specific version)
          const deployResultV2 =
            await chainweb.create2.deployOnChainsUsingCreate2({
              name: 'SimpleToken',
              constructorArgs: [ethers.parseUnits('1000000'), initialSigners.deployer.address],
              salt,
              create2Factory: factoryAddressV2, // Using the factory address from version 2
            });
          const addressV2 = deployResultV2.deployments[0].address;

          // Addresses should be different because different factories were used
          expect(addressV1).to.not.equal(addressV2);

          // Verify both contracts are deployed and working correctly on all chains
          const allChains = await getChainIds();

          for (const chain of allChains) {
            await chainweb.switchChain(chain);

            // Check V1 contract
            const codeV1 = await ethers.provider.getCode(addressV1);
            expect(codeV1).to.not.equal('0x');
            const tokenV1 = SimpleToken__factory.connect(
              addressV1,
              initialSigners.deployer,
            );
            expect(await tokenV1.symbol()).to.equal('SIM');

            // Check V2 contract
            const codeV2 = await ethers.provider.getCode(addressV2);
            expect(codeV2).to.not.equal('0x');
            const tokenV2 = SimpleToken__factory.connect(
              addressV2,
              initialSigners.deployer,
            );
            expect(await tokenV2.symbol()).to.equal('SIM');
          }
        });
      }); // End of Success Test Cases
    }); // End of Contract deployment with CREATE2
  }); // End of CREATE2 Deployment Tests
}); // End of SimpleToken Unit Tests
