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

  console.log(
    `Derived secondary key for create2 factory version ${version}: ${derivedPrivateKey}`,
  );

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
  if (receiverBalance < amount) {
    throw new Error(
      `Funding deployer failed. Receiver balance: ${receiverBalance} is less than funding amount: ${amount}`,
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

      let masterDeployer;
      if (!signer) {
        masterDeployer = signers[0];
      } else {
        // Get the address of the passed-in signer
        const signerAddress = await signer.getAddress();

        // Find the matching signer from the current chain's signers
        masterDeployer = signers.find(
          (account) => account.address === signerAddress,
        );

        if (!masterDeployer) {
          throw new Error(`Can't find account with address ${signerAddress}`);
        }
      }

      console.log('masterDeployer in deployCreate2Factory', masterDeployer);
      if (masterDeployer) {
        const address = await masterDeployer.getAddress();
        console.log('masterDeployer address in deployCreate2Factory', address);
        const balance = await ethers.provider.getBalance(address);
        console.log(
          'masterDeployer balance in deployCreate2Factory',
          ethers.formatEther(balance),
          'ETH',
        );
      }

      const secondaryKey = await getSecondaryWallet(masterDeployer);
      const secondaryKeyAddress = await secondaryKey.getAddress();

      const create2FactoryAddress = ethers.getCreateAddress({
        from: secondaryKey.address,
        nonce: 0,
      });

      const isDeployed = await isContractDeployed(create2FactoryAddress);

      if (isDeployed) {
        const Factory = await hre.ethers.getContractFactory(
          create2Artifacts.abi,
          create2Artifacts.bin,
        );
        const create2 = Factory.attach(create2FactoryAddress);

        console.log(
          `The create2 factory address ${create2FactoryAddress} is already deployed on chain ${cwId}`,
        );

        return {
          contract: create2,
          address: create2FactoryAddress,
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
          `This derived deployer address ${secondaryKeyAddress} has already been used for another type of transaction. You need a new address to deploy a create2 factory.
          Please use a different signer or version.`,
        );
      }

      console.log(
        `The create2 factory contract will be deployed to address: ${create2FactoryAddress} with deployer address: ${secondaryKeyAddress}`,
      );

      const balance = await ethers.provider.getBalance(secondaryKeyAddress);

      const CREATE2Factory = await hre.ethers.getContractFactory(
        create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
          .abi,
        create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
          .bin,
        secondaryKey,
      );

      // Get detailed fee data
      const tx = await CREATE2Factory.getDeployTransaction();
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

        // 0.008 KDA (slightly higher than benchmarked 0.00798804)
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
          `FUNDING create2 factory derived deployer with ${ethers.formatEther(additionalFunding)} KDA`,
        );

        await fundAccount(masterDeployer, secondaryKey, additionalFunding);
      }

      // Use the appropriate gas options for deployment
      const contract = await CREATE2Factory.deploy(deployOptions);

      const deploymentTx = contract.deploymentTransaction();
      if (!deploymentTx) {
        throw new Error('Create2 factory deployment transaction failed');
      }
      await deploymentTx.wait();

      if (create2FactoryAddress !== (await contract.getAddress())) {
        throw new Error('Create2 factory address mismatch');
      }

      console.log(
        `Create2 factory deployed at ${create2FactoryAddress} on chain ${cwId}`,
      );

      return {
        contract: contract,
        address: create2FactoryAddress,
        chain: cwId,
        deployer: secondaryKeyAddress,
        network: {
          chainId: cwId,
          name: `${networkStem}${cwId}`,
        },
      };
    });
    if (result.length === 0) {
      throw new Error('No result from deployCreate2Factory');
    }
    // Clear the private key from memory when done
    secondaryPrivateKey = undefined;

    return [result[0].address, result] as const;
  };
