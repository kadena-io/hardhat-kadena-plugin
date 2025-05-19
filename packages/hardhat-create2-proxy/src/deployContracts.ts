import { DeployUsingCreate2 } from './type';
import { Signer, Overrides, BytesLike } from 'ethers';
import { getNetworkStem } from '@kadena/hardhat-chainweb';

import hre from 'hardhat';

import {
  create2Artifacts,
  getCreate2FactoryAddress,
} from './deployCreate2Factory';

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
 * @param bindToSender - Whether to include the sender address in the salt calculation
 * @returns A tuple containing [saltBytes for ethers.getCreate2Address, userSaltBytes32 for contract call]
 */
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
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * For sender-bound deployments, must also implement:
 * - function deployBound(bytes memory bytecode, bytes32 userSalt) public payable returns (address)
 * - function computeAddressBound(bytes memory bytecode, bytes32 userSalt) public view returns (address)
 * @param signer - Optional signer (defaults to first signer)
 * @param bindToSender - Whether to include the sender address in the salt calculation
 * @param create2FactoryVersion - Optional version for the CREATE2 factory that will be used.
 * Note: This parameter is only used when create2Factory is not provided.
 * @returns The predicted contract address
 */
export const predictContractAddress = async (
  contractBytecode: string,
  salt: string,
  create2Factory?: string,
  signer?: Signer,
  bindToSender = false,
  create2FactoryVersion: number | bigint = BigInt(1),
): Promise<string> => {
  // Get signer if not provided
  const [defaultDeployer] = await ethers.getSigners();
  const contractDeployer = signer ?? defaultDeployer;
  const senderAddress = await contractDeployer.getAddress();

  // Get create2 factory address
  const create2FactoryAddress =
    create2Factory ??
    (await getCreate2FactoryAddress(signer, create2FactoryVersion));

  // Create salt bytes with or without sender binding
  const [saltBytes] = createSalt(senderAddress, salt, bindToSender);

  // Hash bytecode
  const bytecodeHash = ethers.keccak256(contractBytecode);

  // Calculate predicted address
  return ethers.getCreate2Address(
    create2FactoryAddress,
    saltBytes,
    bytecodeHash,
  );
};

/**
 * Deploys a contract using standard CREATE2 functionality.
 *
 * @param contractBytecode - The compiled bytecode of the contract to deploy
 * @param signer - The signer that will deploy the contract
 * @param overrides - Optional transaction overrides for the deployment
 * @param salt - The salt to use for the CREATE2 deployment
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * For sender-bound deployments, must also implement:
 * - function deployBound(bytes memory bytecode, bytes32 userSalt) public payable returns (address)
 * - function computeAddressBound(bytes memory bytecode, bytes32 userSalt) public view returns (address)
 * @param create2FactoryVersion - Optional version for the CREATE2 factory that will be used.
 * Note: This parameter is only used when create2Factory is not provided.
 * @returns The deployed contract address
 */
async function deployContract({
  contractBytecode,
  signer,
  overrides,
  salt,
  create2Factory,
  create2FactoryVersion = BigInt(1),
}: {
  contractBytecode: string;
  signer: Signer;
  overrides: Overrides | undefined;
  salt: string;
  create2Factory?: string;
  create2FactoryVersion?: number | bigint;
}) {
  const create2FactoryAddress =
    create2Factory ??
    (await getCreate2FactoryAddress(signer, create2FactoryVersion));

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

/**
 * Deploys a contract using CREATE2 with the deployer address bound to the salt.
 * This prevents anyone else from deploying to the same address with the same salt.
 *
 * @param contractBytecode - The compiled bytecode of the contract to deploy
 * @param signer - The signer that will deploy the contract
 * @param overrides - Optional transaction overrides for the deployment
 * @param salt - The salt to use for the CREATE2 deployment
 * @param create2Factory - Optional custom CREATE2 factory address.
 * Must implement:
 * - function deploy(bytes memory bytecode, bytes32 salt) public payable returns (address)
 * - function computeAddress(bytes memory bytecode, bytes32 salt) public view returns (address)
 * For sender-bound deployments, must also implement:
 * - function deployBound(bytes memory bytecode, bytes32 userSalt) public payable returns (address)
 * - function computeAddressBound(bytes memory bytecode, bytes32 userSalt) public view returns (address)
 * @param create2FactoryVersion - Optional version for the CREATE2 factory that will be used.
 * Note: This parameter is only used when create2Factory is not provided.
 * @returns The deployed contract address
 */
async function deployContractBound({
  contractBytecode,
  signer,
  overrides,
  salt,
  create2Factory,
  create2FactoryVersion = BigInt(1),
}: {
  contractBytecode: string;
  signer: Signer;
  overrides: Overrides | undefined;
  salt: string;
  create2Factory?: string;
  create2FactoryVersion?: number | bigint;
}) {
  const create2FactoryAddress =
    create2Factory ??
    (await getCreate2FactoryAddress(signer, create2FactoryVersion));

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
 * Deploy a contract on all chains in the network using CREATE2.
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
 * For sender-bound deployments, must also implement:
 * - function deployBound(bytes memory bytecode, bytes32 userSalt) public payable returns (address)
 * - function computeAddressBound(bytes memory bytecode, bytes32 userSalt) public view returns (address)
 * @param bindToSender - Whether to bind the deployment to the sender address (prevents address front-running)
 * @returns Object containing deployment information for each chain
 */
export const deployUsingCreate2: DeployUsingCreate2 = async ({
  name,
  signer,
  factoryOptions,
  constructorArgs = [],
  overrides,
  salt,
  create2Factory,
  bindToSender = false,
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
        `Deploying contract deterministically with signer: ${deployerAddress} on network ${cwId}`,
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
            create2Factory,
          })
        : await deployContract({
            contractBytecode,
            signer: contractDeployer,
            overrides,
            salt,
            create2Factory,
          });

      const contract = factory.attach(contractAddress);

      // Store deployment info in both formats
      // Note: 'chain' and 'network.chainId' represent the Chainweb chain ID (0, 1, etc.)
      // not the EVM chainId. The EVM chainId can be accessed via hre.network.config.chainId
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
