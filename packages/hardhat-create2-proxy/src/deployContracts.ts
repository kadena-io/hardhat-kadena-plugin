import { Create2Helpers, DeployUsingCreate2 } from './type';
import { Signer, Overrides, getBytes } from 'ethers';
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

function createSalt(sender: string, userSalt: string) {
  const ADDRESS_LENGTH = 20;
  const USER_SALT_LENGTH = 12;
  // Convert the sender address and user salt to bytes
  // The sender address is expected to be 20 bytes (Ethereum address)
  const senderBytes = getBytes(sender);

  // The user salt is expected to be 12 bytes (Kadena user salt)
  const userSaltBytes = getBytes(
    ethers.dataSlice(ethers.id(userSalt), 0, USER_SALT_LENGTH),
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
  result.set(userSaltBytes, ADDRESS_LENGTH);
  return [result, ethers.toBigInt(userSaltBytes)] as const;
}

const getSigner = async (address?: string) => {
  const signer = await ethers.provider.getSigner(address);
  if (!signer) {
    throw new Error(`Signer not found for address: ${address}`);
  }
  return signer;
};

export const predictContractAddress: Create2Helpers['predictContractAddress'] =
  async (
    contractBytecode: string,
    salt: string,
    create2proxy?: string,
    signer?: Signer,
  ) => {
    const signer2 = await getSigner(await signer?.getAddress());

    const factoryAddress =
      create2proxy ?? (await getCreate2FactoryAddress(signer2));

    const [saltBytes] = createSalt(signer2.address, salt);

    const predictedAddress = ethers.getCreate2Address(
      factoryAddress,
      saltBytes,
      ethers.keccak256(contractBytecode),
    );

    return predictedAddress;
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
  const factoryAddress = create2proxy ?? (await getCreate2FactoryAddress());

  const Factory = await hre.ethers.getContractFactory(
    create2Artifacts.abi,
    create2Artifacts.bin,
    signer,
  );

  const create2 = Factory.attach(factoryAddress);

  // Compute the predicted address

  const [saltBytes, userSaltBigInt] = createSalt(
    await signer.getAddress(),
    salt,
  );

  const predictedAddress = ethers.getCreate2Address(
    factoryAddress,
    saltBytes,
    ethers.keccak256(contractBytecode),
  );

  const computedAddress = await create2.computeAddress(
    contractBytecode,
    userSaltBigInt,
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

  // Deploy using CREATE2
  const tx = await create2.deploy(
    contractBytecode,
    userSaltBigInt,
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
}) => {
  const deployments = await chainweb.runOverChains(async (cwId) => {
    try {
      const signerAddress =
        (await signer?.getAddress()) ??
        (await factoryOptions?.signer?.getAddress());

      const contractDeployer = await getSigner(signerAddress);

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

      const contractAddress = await deployContract({
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
