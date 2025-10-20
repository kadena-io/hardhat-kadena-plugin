import { DeployOnChainsUsingCreate2 } from './type';
import { Signer, Overrides, BytesLike } from 'ethers';
import { getNetworkStem } from '@kadena/hardhat-chainweb';

import hre from 'hardhat';

import {
  create2Artifacts,
  getCreate2FactoryAddress,
} from './deploy-create2-factory';

const networkStem = getNetworkStem(hre.config.defaultChainweb);

const { ethers, chainweb } = hre;

/**
 * Checks if a contract is deployed at the specified address.
 *
 * @param address - The address to check for contract deployment
 * @returns A promise that resolves to true if a contract exists at the address, false otherwise
 */
function isContractDeployed(address: string): Promise<boolean> {
  return ethers.provider.getCode(address).then((code) => code !== '0x');
}

/**
 * Creates salt values for CREATE2 deployment with optional sender binding.
 *
 * @param sender - The address of the deploying account
 * @param userSalt - The user-provided salt string
 * @returns A tuple containing [saltBytes for ethers.getCreate2Address, userSaltBytes32 for contract call]
 */
function convertToByte(userSalt: string): BytesLike {
  const userSaltBytes32 = ethers.id(userSalt);
  return ethers.getBytes(userSaltBytes32);
}

/**
 * Deploy a contract on all configured chainweb chains using CREATE2.
 * This ensures the contract is deployed to the same address on all chains.
 *
 * @param name - The name of the contract to deploy
 * @param signer - Optional signer for deployment (defaults to first account)
 * @param factoryOptions - Optional additional options for the contract factory
 * @param constructorArgs - Arguments to pass to the contract constructor
 * @param overrides - Optional transaction overrides for the deployment
 * @param salt - The salt to use for the CREATE2 deployment
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * @returns Object containing deployment information for each chain
 */
export const deployOnChainsUsingCreate2: DeployOnChainsUsingCreate2 = async ({
  name,
  signer,
  factoryOptions,
  constructorArgs = [],
  overrides,
  salt,
  create2Factory,
}) => {
  const deployments = await chainweb.runOverChains(async (cwId) => {
    try {
      // Get chain-specific signers (this is the key part)
      const signers = await ethers.getSigners();

      // Determine the appropriate signer for this chain
      let contractDeployer;

      // First check if custom signer was provided
      if (signer) {
        const signerAddress = await signer.getAddress();
        contractDeployer = signers.find(
          (account) => account.address === signerAddress,
        );
        if (!contractDeployer) {
          throw new Error(
            `Can't find signer with address ${signerAddress} on chain ${cwId}`,
          );
        }
      }
      // Then check factory options signer
      else if (factoryOptions?.signer) {
        const optionsSignerAddress = await factoryOptions.signer.getAddress();
        contractDeployer = signers.find(
          (account) => account.address === optionsSignerAddress,
        );
        if (!contractDeployer) {
          throw new Error(
            `Can't find factory options signer with address ${optionsSignerAddress} on chain ${cwId}`,
          );
        }
      }
      // Finally use default
      else {
        contractDeployer = signers[0];
      }

      const deployerAddress = await contractDeployer.getAddress();
      console.log(
        `Deploying contract deterministically with signer: ${deployerAddress} on chain ${cwId}`,
      );
      const factory = await ethers.getContractFactory(name, {
        signer: contractDeployer,
        ...factoryOptions,
      });
      const transaction = await factory.getDeployTransaction(
        ...(overrides ? [...constructorArgs, overrides] : constructorArgs),
      );

      // Prepare the bytecode of the contract to deploy
      const contractBytecode = transaction.data;

      // Deploy the contract using CREATE2
      const { address: contractAddress, alreadyDeployed } =
        await deployContract({
          contractBytecode,
          signer: contractDeployer,
          overrides,
          salt,
          create2Factory,
        });

      const contract = factory.attach(contractAddress);

      // Store deployment info in both formats
      // Note: 'chain' represent the Chainweb chain ID (0, 1, etc.) and 'network.chainId' represent the EVM chain ID (626000, 626001, etc.)
      // not the EVM chainId. The EVM chainId can be accessed via hre.network.config.chainId
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contract: contract as any,
        address: contractAddress,
        chain: cwId,
        deployer: deployerAddress,
        network: {
          chainId: hre.config.networks[`${networkStem}${cwId}`].chainId,
          name: `${networkStem}${cwId}`,
        },
        contractAlreadyDeployed: alreadyDeployed,
      };
    } catch (error) {
      console.error(
        `Failed to deploy contract to chainweb chain ${cwId}:`,
        error,
      );
      return null;
    }
  });

  return {
    deployments: deployments.filter((d) => d !== null),
  };
};
