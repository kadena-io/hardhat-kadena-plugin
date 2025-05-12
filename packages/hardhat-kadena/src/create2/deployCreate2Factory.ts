import {
  getCreateAddress,
  keccak256,
  Signer,
  toUtf8Bytes,
  Wallet,
} from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getNetworkStem, getUtils } from '../utils';

export const getCreate2FactoryUtils = (hre: HardhatRuntimeEnvironment) => {
  const { ethers } = hre;
  const { runOverChains } = getUtils(hre);
  const networkStem = getNetworkStem(hre.config.defaultChainweb);

  async function deriveSecondaryKey(
    signer: Signer,
    version: number = 1,
  ): Promise<Wallet> {
    const message = `create deployer key for create2 factory version: ${version}`;
    const signature = await signer.signMessage(message);

    // Combine signature and label to get deterministic entropy
    const hash = keccak256(toUtf8Bytes(signature));

    // Use first 32 bytes (64 hex chars + '0x') as the private key
    const derivedPrivateKey = '0x' + hash.slice(2, 66);
    return new Wallet(derivedPrivateKey);
  }

  const getCreate2FactoryAddress = async (
    signer: Signer,
    version: number = 1,
  ) => {
    const secondaryKey = await deriveSecondaryKey(signer, version);
    const factoryAddress = getCreateAddress({
      from: secondaryKey.address,
      nonce: 0,
    });

    return factoryAddress;
  };

  const deployCreate2Factory = async ({
    signer,
    version = 1,
    fundingDeployerWith = 0.01,
  }: {
    signer: Signer;
    version?: number;
    fundingDeployerWith?: number;
  }) => {
    function isContractDeployed(address: string): Promise<boolean> {
      return ethers.provider.getCode(address).then((code) => code !== '0x');
    }

    return runOverChains(async (cwId) => {
      console.log(`deploying create2 factory on chain ${cwId}`);

      const [defaultDeployer] = await ethers.getSigners();

      const masterDeployer = signer ?? defaultDeployer;

      const secondaryKey = await deriveSecondaryKey(masterDeployer, version);

      const secondaryKeyAddress = await masterDeployer.getAddress();

      const nonce =
        await hre.ethers.provider.getTransactionCount(secondaryKeyAddress);

      const factoryAddress = getCreateAddress({
        from: secondaryKey.address,
        nonce: 0,
      });

      const isDeployed = await isContractDeployed(factoryAddress);

      if (isDeployed) {
        console.log(
          `the factory address ${factoryAddress} is already deployed`,
        );

        const Factory = await hre.ethers.getContractFactory('Create2Factory');
        const create2 = Factory.attach(factoryAddress);

        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contract: create2 as any,
          address: factoryAddress,
          chain: cwId,
          deployer: secondaryKeyAddress,
          network: {
            chainId: cwId,
            name: `${networkStem}${cwId}`,
          },
        };
      }

      if (nonce > 0) {
        throw new Error(
          `This address has already been used for another type of transaction. you need a new address to deploy a create2 factory`,
        );
      }

      console.log(
        `the contract will be deploying with address: ${factoryAddress} and the deployer address: ${secondaryKeyAddress}`,
      );

      const balance = await ethers.provider.getBalance(secondaryKeyAddress);

      if (balance > BigInt(0)) {
        console.log('deployer address:', secondaryKeyAddress);
        console.log('balance:', ethers.formatEther(balance));
      } else {
        if (fundingDeployerWith < 0) {
          throw new Error(
            `the fundingDeployerWith amount must be greater than 0`,
          );
        }
        console.log(
          `deployer (${secondaryKeyAddress}) has no balance. funding the account with (${fundingDeployerWith}) ...`,
        );
        const tx = await masterDeployer.sendTransaction({
          to: secondaryKeyAddress,
          value: ethers.parseEther(fundingDeployerWith.toString()),
        });
        await tx.wait();
        console.log(
          `the secondary key address ${secondaryKeyAddress} has been funded`,
        );
      }

      console.log(
        `the factory address is ${factoryAddress} and the deployer address is ${secondaryKeyAddress}`,
      );

      /* Deploy the contract */
      const factory = await ethers.getContractFactory('Create2Factory', {
        signer: secondaryKey,
      });
      const contract = await factory.deploy();
      const deploymentTx = contract.deploymentTransaction();
      if (!deploymentTx) {
        throw new Error('Deployment transaction failed');
      }
      await deploymentTx.wait();

      if (factoryAddress !== (await contract.getAddress())) {
        throw new Error('Factory address mismatch');
      }

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contract: contract as any,
        address: factoryAddress,
        chain: cwId,
        deployer: secondaryKeyAddress,
        network: {
          chainId: cwId,
          name: `${networkStem}${cwId}`,
        },
      };
    });
  };

  return {
    getCreate2FactoryAddress,
    deployCreate2Factory,
  };
};
