import {
  getCreateAddress,
  keccak256,
  Signer,
  toUtf8Bytes,
  Wallet,
  TransactionRequest,
} from 'ethers';

import create2Artifact from '../build/create2-factory/combined.json';
import hre, { chainweb, ethers } from 'hardhat';
import { getNetworkStem } from '@kadena/hardhat-chainweb';
import { Create2Helpers } from './type';

const networkStem = getNetworkStem(hre.config.defaultChainweb);

function isContractDeployed(address: string): Promise<boolean> {
  return ethers.provider.getCode(address).then((code) => code !== '0x');
}

export const create2Artifacts =
  create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory'];

export const getCreate2FactoryAddress: Create2Helpers['getCreate2FactoryAddress'] =
  async (signer?: Signer, version: number | bigint = BigInt(1)) => {
    // Get default signer if none provided
    const signers = await ethers.getSigners();
    const masterDeployer = signer || signers[0];

    // Derive the secondary key directly with version parameter
    const secondaryKey = await deriveSecondaryKey(masterDeployer, version);

    // Calculate factory address
    const factoryAddress = getCreateAddress({
      from: secondaryKey.publicKey,
      nonce: 0,
    });

    return factoryAddress;
  };

export async function deriveSecondaryKey(
  signer: Signer,
  version: number | bigint = BigInt(1),
) {
  const message = `create deployer key for create2 factory version: ${version}`;
  const signature = await signer.signMessage(message);

  // Combine signature and label to get deterministic entropy
  const hash = keccak256(toUtf8Bytes(signature));

  // Use first 32 bytes (64 hex chars + '0x') as the private key
  const derivedPrivateKey = '0x' + hash.slice(2, 66);
  const wallet: Wallet = new Wallet(derivedPrivateKey, ethers.provider);
  return {
    publicKey: await wallet.getAddress(),
    privateKey: derivedPrivateKey,
  };
}

async function fundAccount(sender: Signer, receiver: Signer, amount: bigint) {
  const receiverAddress = await receiver.getAddress();

  const tx = await sender.sendTransaction({
    to: receiverAddress,
    value: amount,
  });
  await tx.wait();

  const receiverBalance = await ethers.provider.getBalance(receiverAddress);
  if (receiverBalance !== amount) {
    throw new Error(
      `funding deployer failed. receiver balance: ${receiverBalance} is not equal to funding amount: ${amount}`,
    );
  }
}

export const deployCreate2Factory: Create2Helpers['deployCreate2Factory'] =
  async (signer?: Signer, version: number | bigint = BigInt(1)) => {
    let secondaryPrivateKey: string | undefined = undefined;

    const getSecondaryWallet = async (signer: Signer) => {
      if (secondaryPrivateKey) {
        return new Wallet(secondaryPrivateKey, ethers.provider);
      }
      secondaryPrivateKey = (await deriveSecondaryKey(signer, version))
        .privateKey;

      return new Wallet(secondaryPrivateKey, ethers.provider);
    };

    const result = await chainweb.runOverChains(async (cwId) => {
      const signers = await ethers.getSigners();
      const masterDeployer = signer || signers[0];

      const secondaryKey = await getSecondaryWallet(masterDeployer);
      const secondaryKeyAddress = await secondaryKey.getAddress();

      const factoryAddress = ethers.getCreateAddress({
        from: secondaryKey.address,
        nonce: 0,
      });

      const isDeployed = await isContractDeployed(factoryAddress);

      if (isDeployed) {
        console.log(
          `the factory address ${factoryAddress} is already deployed`,
        );

        const Factory = await hre.ethers.getContractFactory(
          create2Artifacts.abi,
          create2Artifacts.bin,
        );
        const create2 = Factory.attach(factoryAddress);

        console.log(
          `the factory address ${factoryAddress} is already deployed on chain ${cwId}`,
        );

        return {
          contract: create2,
          address: factoryAddress,
          chain: cwId,
          deployer: secondaryKeyAddress,
          network: {
            chainId: cwId,
            name: `${networkStem}${cwId}`,
          },
        };
      }

      const nonce =
        await ethers.provider.getTransactionCount(secondaryKeyAddress);

      if (nonce > 0) {
        throw new Error(
          `This address has already been used for another type of transaction. you need a new address to deploy a create2 factory`,
        );
      }

      console.log(
        `the contract will be deploying with address: ${factoryAddress} and the deployer address: ${secondaryKeyAddress}`,
      );

      const balance = await ethers.provider.getBalance(secondaryKeyAddress);

      const factory = await hre.ethers.getContractFactory(
        create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
          .abi,
        create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
          .bin,
        secondaryKey,
      );

      // Get detailed fee data
      const tx = await factory.getDeployTransaction();
      const gasLimit = await ethers.provider.estimateGas(tx);
      const feeData = await ethers.provider.getFeeData();

      let requiredEther: bigint;
      let deployOptions: TransactionRequest;

      // Check if we can get proper EIP-1559 fee data
      if (gasLimit && feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // Use EIP-1559 fee structure
        const maxFeePerGas = feeData.maxFeePerGas;

        // Calculate required funding with 20% buffer (base fee can change between blocks)
        requiredEther = (maxFeePerGas * gasLimit * BigInt(120)) / BigInt(100);

        deployOptions = {
          gasLimit,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };

        console.log('Using EIP-1559 fee model');
      } else if (gasLimit && feeData.gasPrice) {
        // Fallback to legacy fee structure
        requiredEther =
          (feeData.gasPrice * gasLimit * BigInt(120)) / BigInt(100);

        deployOptions = {
          gasLimit,
          gasPrice: feeData.gasPrice,
        };

        console.warn(
          'Network returned legacy fee data instead of EIP-1559. Using legacy fee model.',
        );
      } else {
        // Something failed in estimation, use benchmark data
        console.warn(
          'Fee data unavailable. Using fallback values from benchmark.',
        );

        // Use benchmark-based values (266,268 gas with buffer)
        const benchmarkGasLimit = BigInt(300000); // Rounded up from 266,268
        deployOptions = {
          gasLimit: benchmarkGasLimit,
        };

        // 0.008 KDA (slightly higher than recommended 0.00798804)
        requiredEther = ethers.parseEther('0.008');

        console.warn(
          `Using fallback gas limit of ${benchmarkGasLimit} and funding amount of ${ethers.formatEther(requiredEther)} KDA`,
        );
      }

      if (balance >= requiredEther) {
        console.log(
          'Existing balance:',
          ethers.formatEther(balance),
          'KDA',
          '(sufficient for deployment)',
        );
      } else {
        // Calculate how much additional funding is needed
        const additionalFunding = requiredEther - balance;
        console.log(
          `Current balance: ${ethers.formatEther(balance)} KDA, required: ${ethers.formatEther(requiredEther)} KDA`,
        );
        console.log(
          `FUNDING DEPLOYER WITH ${ethers.formatEther(additionalFunding)} KDA`,
        );

        await fundAccount(masterDeployer, secondaryKey, additionalFunding);
      }

      // Use the appropriate gas options for deployment
      const contract = await factory.deploy(deployOptions);

      const deploymentTx = contract.deploymentTransaction();
      if (!deploymentTx) {
        throw new Error('Deployment transaction failed');
      }
      await deploymentTx.wait();

      if (factoryAddress !== (await contract.getAddress())) {
        throw new Error('Factory address mismatch');
      }

      console.log(
        `create2 factory deployed at ${factoryAddress} on chain ${cwId}`,
      );

      return {
        contract: contract,
        address: factoryAddress,
        chain: cwId,
        deployer: secondaryKeyAddress,
        network: {
          chainId: cwId,
          name: `${networkStem}${cwId}`,
        },
      };
    });
    if (result.length === 0) {
      throw new Error('no result from deployCreate2Factory');
    }
    return [result[0].address, result] as const;
  };
