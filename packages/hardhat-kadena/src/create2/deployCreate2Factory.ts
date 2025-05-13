import {
  getCreateAddress,
  keccak256,
  Signer,
  toUtf8Bytes,
  Wallet,
} from 'ethers';

import create2Artifact from '../../build/create2-factory/combined.json';
import { getNetworkStem } from '../pure-utils';
import { runOverChains } from '../utils';
import hre, { ethers } from 'hardhat';

export const create2Artifacts =
  create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory'];

const networkStem = getNetworkStem(hre.config.defaultChainweb);

export const getCreate2FactoryAddress = async (
  signer: Signer,
  version: number = 1,
) => {
  const secondaryKey = await deriveSecondaryKey(signer, version);
  const factoryAddress = getCreateAddress({
    from: secondaryKey.publicKey,
    nonce: 0,
  });

  return factoryAddress;
};

async function deriveSecondaryKey(signer: Signer, version: number = 1) {
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

async function fundDeployer(
  sender: Signer,
  receiver: Signer,
  amountStr: string,
) {
  const amount = ethers.parseEther(amountStr); // 1 ether

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

export const deployCreate2Factory = async (props?: {
  signer?: string;
  version?: number;
  fundingDeployerWith?: string;
}) => {
  const { signer, version = 1, fundingDeployerWith = '1.0' } = props ?? {};
  function isContractDeployed(address: string): Promise<boolean> {
    return ethers.provider.getCode(address).then((code) => code !== '0x');
  }

  let secondaryPrivateKey: string | undefined = undefined;

  const getSecondaryWallet = async (signer: Signer, version?: number) => {
    if (secondaryPrivateKey) {
      return new Wallet(secondaryPrivateKey, ethers.provider);
    }
    secondaryPrivateKey = (await deriveSecondaryKey(signer, version))
      .privateKey;

    return new Wallet(secondaryPrivateKey, ethers.provider);
  };

  return runOverChains(async (cwId) => {
    console.log(`deploying create2 factory on chain ${cwId}`);

    const signers = await ethers.getSigners();
    const masterDeployer = !signer
      ? signers[0]
      : signers.find((account) => account.address === signer);

    if (!masterDeployer) {
      throw new Error(`cant find the account with address ${signer}`);
    }

    const secondaryKey = await getSecondaryWallet(masterDeployer, version);
    const secondaryKeyAddress = await secondaryKey.getAddress();

    const factoryAddress = ethers.getCreateAddress({
      from: secondaryKey.address,
      nonce: 0,
    });

    const isDeployed = await isContractDeployed(factoryAddress);

    if (isDeployed) {
      console.log(`the factory address ${factoryAddress} is already deployed`);

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

    if (balance > BigInt(0)) {
      console.log('deployer address:', secondaryKeyAddress);
      console.log('balance:', ethers.formatEther(balance));
    } else {
      if (+fundingDeployerWith < 0) {
        throw new Error(
          `the fundingDeployerWith amount must be greater than 0`,
        );
      }

      console.log('FUNDING DEPLOYER WITH', fundingDeployerWith);
      await fundDeployer(masterDeployer, secondaryKey, fundingDeployerWith);
    }

    /* Deploy the contract */
    const factory = await hre.ethers.getContractFactory(
      create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
        .abi,
      create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
        .bin,
      secondaryKey,
    );
    const contract = await factory.deploy();
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
};

// return {
//   getCreate2FactoryAddress,
//   deployCreate2Factory,
// };
