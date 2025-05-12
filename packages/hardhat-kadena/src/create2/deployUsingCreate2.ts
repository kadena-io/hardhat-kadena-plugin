import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployOnChainsUsingCreate2, getNetworkStem, getUtils } from '../utils';
import { ChainwebNetwork } from '../utils/chainweb';
import { getBytes, Signer } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { getCreate2FactoryUtils } from './deployCreate2Factory';

export const getCreate2Utils = (
  hre: HardhatRuntimeEnvironment,
  chainwebNetwork?: ChainwebNetwork,
) => {
  const { runOverChains } = getUtils(hre, chainwebNetwork);
  const networkStem = getNetworkStem(hre.config.defaultChainweb);
  const { ethers } = hre;
  const { getCreate2FactoryAddress } = getCreate2FactoryUtils(hre);

  function isContractDeployed(address: string): Promise<boolean> {
    return ethers.provider.getCode(address).then((code) => code !== '0x');
  }

  function createSalt(sender: string, userSalt: string) {
    const ADDRESS_LENGTH = 20;
    const USER_SALT_LENGTH = 12;
    // Convert the sender address and user salt to bytes
    // The sender address is expected to be 20 bytes (Ethereum address)
    const senderBytes = getBytes(sender);

    // The user salt is expected to be 12 bytes (Kadena user salt)
    const userSaltBytes = getBytes(
      ethers.dataSlice(ethers.id(userSalt), USER_SALT_LENGTH),
    );
    if (senderBytes.length !== ADDRESS_LENGTH) {
      throw new Error(`Sender address must be ${ADDRESS_LENGTH} bytes`);
    }
    if (userSaltBytes.length !== USER_SALT_LENGTH) {
      throw new Error(`User salt must be ${USER_SALT_LENGTH} bytes`);
    }
    // Concatenate the sender address and user salt
    const result = new Uint8Array(USER_SALT_LENGTH + ADDRESS_LENGTH);
    result.set(senderBytes, 0);
    result.set(userSaltBytes, USER_SALT_LENGTH);
    return result;
  }

  async function predictCreate2Address(
    contractBytecode: string,
    signer: Signer | HardhatEthersSigner,
    userSalt: string,
  ) {
    const factoryAddress = await getCreate2FactoryAddress(signer);

    const predictedAddress = ethers.getCreate2Address(
      factoryAddress,
      createSalt(await signer.getAddress(), userSalt),
      ethers.keccak256(contractBytecode),
    );

    return predictedAddress;
  }

  async function deployUsingCreate2(
    contractBytecode: string,
    signer: Signer | HardhatEthersSigner,
    userSalt: string,
  ) {
    const factoryAddress = await getCreate2FactoryAddress(signer);

    const Factory = await hre.ethers.getContractFactory('Create2Factory', {
      signer: signer,
    });

    const create2 = Factory.attach(factoryAddress);

    const senderAddress = await signer.getAddress();

    const salt = createSalt(senderAddress, userSalt);

    // Compute the predicted address

    const predictedAddress = ethers.getCreate2Address(
      factoryAddress,
      salt,
      ethers.keccak256(contractBytecode),
    );

    if (await isContractDeployed(predictedAddress)) {
      console.log(
        `Contract already deployed at ${predictedAddress}. Skipping deployment.`,
      );
      return predictedAddress;
    }

    // Deploy using CREATE2
    const tx = await create2.deploy(contractBytecode, userSalt);
    await tx.wait();

    if (!(await isContractDeployed(predictedAddress))) {
      console.log(
        `CREATE2 failed:  No contract at predicted address ${predictedAddress}`,
      );
      throw new Error(
        `CREATE2 failed:  No contract at predicted address ${predictedAddress}`,
      );
    }
    return predictedAddress;
  }

  /**
   * Deploy a contract on all chains in the network using create2.
   */
  const deployOnChainsUsingCreate2: DeployOnChainsUsingCreate2 = async ({
    name,
    signer,
    factoryOptions,
    constructorArgs = [],
    overrides,
    userSalt = 'KADENA/CREATE2/SALT',
  }) => {
    const deployments = await runOverChains(async (cwId) => {
      try {
        const [defaultDeployer] = await ethers.getSigners();

        const contractDeployer =
          signer ?? factoryOptions?.signer ?? defaultDeployer;

        const deployerAddress = await contractDeployer.getAddress();
        console.log(
          `Deploying with signer: ${deployerAddress} on network ${cwId}`,
        );

        const factory = await ethers.getContractFactory(name, {
          signer: contractDeployer,
          ...factoryOptions,
        });
        const transaction = await factory.getDeployTransaction(
          ...(overrides ? [...constructorArgs, overrides] : constructorArgs),
        );
        // Prepare the bytecode of the contract to deploy
        const bytecode = transaction.data;

        const contractAddress = await deployUsingCreate2(
          bytecode,
          contractDeployer,
          userSalt,
        );

        const contract = factory.attach(contractAddress);

        // Store deployment info in both formats
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contract: contract as any,
          address: contractAddress,
          chain: cwId,
          deployer: deployerAddress,
          network: {
            chainId: cwId,
            name: `${networkStem}${cwId}`,
          },
        };
      } catch (error) {
        console.error(`Failed to deploy to network ${cwId}:`, error);
        return null;
      }
    });

    return {
      deployments: deployments.filter((d) => d !== null),
    };
  };

  return {
    deployOnChainsUsingCreate2,
    predictCreate2Address,
  };
};
