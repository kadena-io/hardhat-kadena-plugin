import { DeployUsingCreate2 } from './type';
import { BytesLike, getBytes, Signer } from 'ethers';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { getNetworkStem } from '@kadena/hardhat-chainweb';

import hre from 'hardhat';

import {
  create2Artifacts,
  getCreate2FactoryAddress,
} from './deployCreate2Factory';

const defaultSalt = getBytes(hre.ethers.id('KADENA/CREATE2/SALT'));

const networkStem = getNetworkStem(hre.config.defaultChainweb);

const { ethers, chainweb } = hre;

function isContractDeployed(address: string): Promise<boolean> {
  return ethers.provider.getCode(address).then((code) => code !== '0x');
}

export async function predictContractAddress(
  contractBytecode: string,
  signer: Signer | HardhatEthersSigner,
  salt: BytesLike = defaultSalt,
) {
  const factoryAddress = await getCreate2FactoryAddress(signer);

  const predictedAddress = ethers.getCreate2Address(
    factoryAddress,
    salt,
    ethers.keccak256(contractBytecode),
  );

  return predictedAddress;
}

async function deployContract(
  contractBytecode: string,
  signer: Signer | HardhatEthersSigner,
  salt: BytesLike,
) {
  const factoryAddress = await getCreate2FactoryAddress(signer);

  const Factory = await hre.ethers.getContractFactory(
    create2Artifacts.abi,
    create2Artifacts.bin,
    signer,
  );

  const create2 = Factory.attach(factoryAddress);

  // Compute the predicted address

  const predictedAddress = ethers.getCreate2Address(
    factoryAddress,
    salt,
    ethers.keccak256(contractBytecode),
  );

  const computedAddress = await create2.computeAddress(
    contractBytecode,
    ethers.toBigInt(salt),
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
  const tx = await create2.deploy(contractBytecode, ethers.toBigInt(salt));
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
  salt = defaultSalt,
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
      const bytecode = transaction.data;

      const contractAddress = await deployContract(
        bytecode,
        contractDeployer,
        salt,
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
