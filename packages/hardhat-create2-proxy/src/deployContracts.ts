import { DeployUsingCreate2 } from './type';
import { Signer, Overrides, BytesLike } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { getNetworkStem } from '@kadena/hardhat-chainweb';

import hre from 'hardhat';

import {
  create2Artifacts,
  getCreate2FactoryAddress,
} from './deployCreate2Factory';

const networkStem = getNetworkStem(hre.config.defaultChainweb);

const { ethers, chainweb } = hre;

function isContractDeployed(address: string): Promise<boolean> {
  return ethers.provider.getCode(address).then((code) => code !== '0x');
}

function createSalt(
  sender: string,
  userSalt: string,
  bindToSender: boolean,
): [BytesLike, BytesLike] {
  // Convert string salt to bytes32
  const userSaltBytes32 = ethers.id(userSalt);

  if (bindToSender) {
    // Calculate combined salt including sender
    const combinedSalt = ethers.solidityPackedKeccak256(
      ['address', 'bytes32'],
      [sender, userSaltBytes32],
    );

    // Return [salt for ethers.getCreate2Address, salt for contract call]
    return [ethers.getBytes(combinedSalt), userSaltBytes32];
  } else {
    // Standard CREATE2 - use salt directly
    // Return [salt for ethers.getCreate2Address, salt for contract call]
    return [ethers.getBytes(userSaltBytes32), userSaltBytes32];
  }
}

/**
 * Predicts the address where a contract will be deployed using CREATE2.
 * This is useful for calculating addresses before actual deployment.
 *
 * @param contractBytecode - The compiled bytecode of the contract
 * @param salt - The salt to use for address generation
 * @param signer - Optional signer (defaults to first signer)
 * @param create2proxy - Optional Create2Factory address
 * @param bindToSender - Whether to include the sender address in the salt calculation
 * @returns The predicted contract address
 */
export const predictContractAddress = async (
  contractBytecode: string,
  salt: string,
  create2proxy?: string,
  signer?: Signer,
  bindToSender = false
): Promise<string> => {
  // Get signer if not provided
  const [defaultDeployer] = await ethers.getSigners();
  const contractDeployer = signer ?? defaultDeployer;
  const senderAddress = await contractDeployer.getAddress();

  // Get factory address
  const factoryAddress = create2proxy ?? (await getCreate2FactoryAddress());

  // Create salt bytes with or without sender binding
  const [saltBytes] = createSalt(senderAddress, salt, bindToSender);

  // Hash bytecode
  const bytecodeHash = ethers.keccak256(contractBytecode);

  // Calculate predicted address
  return ethers.getCreate2Address(factoryAddress, saltBytes, bytecodeHash);
};


async function deployContract({
  contractBytecode,
  signer,
  overrides,
  salt,
  create2proxy,
}: {
  contractBytecode: string;
  signer: Signer | HardhatEthersSigner;
  overrides: Overrides | undefined;
  salt: string;
  create2proxy?: string;
}) {
  const create2FactoryAddress =
    create2proxy ?? (await getCreate2FactoryAddress());

  const CREATE2Factory = await hre.ethers.getContractFactory(
    create2Artifacts.abi,
    create2Artifacts.bin,
    signer,
  );

  const create2 = CREATE2Factory.attach(create2FactoryAddress);

  // Standard CREATE2 - don't include sender in salt
  const [saltBytes, userSaltBytes32] = createSalt(
    await signer.getAddress(),
    salt,
    false, // bindToSender = false
  );

  const bytecodeHash = ethers.keccak256(contractBytecode);

  const predictedAddress = ethers.getCreate2Address(
    create2FactoryAddress,
    saltBytes,
    bytecodeHash,
  );

  const computedAddress = await create2.computeAddress(
    contractBytecode,
    userSaltBytes32,
  );

  if (computedAddress !== predictedAddress) {
    console.log(
      `ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`,
    );
    throw new Error(
      `ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`,
    );
  }

  if (await isContractDeployed(predictedAddress)) {
    console.log(
      `Contract already deployed at ${predictedAddress}. Skipping deployment.`,
    );
    return predictedAddress;
  }

  // Deploy using CREATE2,
  const tx = await create2.deploy(
    contractBytecode,
    userSaltBytes32,
    overrides || {},
  );
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

async function deployContractBound({
  contractBytecode,
  signer,
  overrides,
  salt,
  create2proxy,
}: {
  contractBytecode: string;
  signer: Signer | HardhatEthersSigner;
  overrides: Overrides | undefined;
  salt: string;
  create2proxy?: string;
}) {
  const create2FactoryAddress =
    create2proxy ?? (await getCreate2FactoryAddress());

  const CREATE2Factory = await hre.ethers.getContractFactory(
    create2Artifacts.abi,
    create2Artifacts.bin,
    signer,
  );

  const create2 = CREATE2Factory.attach(create2FactoryAddress);

  // Compute the predicted address
  const [saltBytes, userSaltBytes32] = createSalt(
    await signer.getAddress(),
    salt,
    true, // bindToSender = true
  );

  const bytecodeHash = ethers.keccak256(contractBytecode);

  const predictedAddress = ethers.getCreate2Address(
    create2FactoryAddress,
    saltBytes,
    bytecodeHash,
  );

  const computedAddress = await create2.computeAddressBound(
    contractBytecode,
    userSaltBytes32,
  );

  if (computedAddress !== predictedAddress) {
    console.log(
      `ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`,
    );
    throw new Error(
      `ADDRESS MISMATCH: computed address (${computedAddress}) != predicted address (${predictedAddress})`,
    );
  }

  if (await isContractDeployed(predictedAddress)) {
    console.log(
      `Contract already deployed at ${predictedAddress}. Skipping deployment.`,
    );
    return predictedAddress;
  }

  // Deploy using CREATE2, bound to the sender
  const tx = await create2.deployBound(
    contractBytecode,
    userSaltBytes32,
    overrides || {},
  );
  await tx.wait();

  if (!(await isContractDeployed(predictedAddress))) {
    console.log(
      `CREATE2 failed: No contract at predicted address ${predictedAddress}`,
    );
    throw new Error(
      `CREATE2 failed: No contract at predicted address ${predictedAddress}`,
    );
  }
  return predictedAddress;
}

/**
 * Deploy a contract on all chains in the network using create2.
 */
export const deployUsingCreate2: DeployUsingCreate2 = async ({
  name,
  signer,
  factoryOptions,
  constructorArgs = [],
  overrides,
  salt,
  create2proxy,
  bindToSender = false,
}) => {
  const deployments = await chainweb.runOverChains(async (cwId) => {
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
      const contractBytecode = transaction.data;

      // Choose create2 deployment function based on bindToSender flag
      const contractAddress = bindToSender
        ? await deployContractBound({
          contractBytecode,
          signer: contractDeployer,
          overrides,
          salt,
          create2proxy,
        })
        : await deployContract({
          contractBytecode,
          signer: contractDeployer,
          overrides,
          salt,
          create2proxy,
        });

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
