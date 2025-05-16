import {
  getCreateAddress,
  keccak256,
  Signer,
  toUtf8Bytes,
  Wallet,
} from 'ethers';

import create2Artifact from '../build/create2-factory/combined.json';
import hre, { chainweb, ethers } from 'hardhat';
import { getNetworkStem } from '@kadena/hardhat-chainweb';

const networkStem = getNetworkStem(hre.config.defaultChainweb);

function isContractDeployed(address: string): Promise<boolean> {
  return ethers.provider.getCode(address).then((code) => code !== '0x');
}

export const create2Artifacts =
  create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory'];

export const getCreate2FactoryAddress = async () => {
  const secondaryKey = await deriveSecondaryKey();
  const factoryAddress = getCreateAddress({
    from: secondaryKey.publicKey,
    nonce: 0,
  });

  return factoryAddress;
};

export async function deriveSecondaryKey() {
  const signer = await getMasterDeployer();
  const version = hre.config.create2proxy.version;

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

const getMasterDeployer = async () => {
  const signer = hre.config.create2proxy.deployerAddress;
  const signers = await ethers.getSigners();
  const masterDeployer = !signer
    ? signers[0]
    : signers.find((account) => account.address === signer);

  if (!masterDeployer) {
    throw new Error(`cant find the account with address ${signer}`);
  }
  return masterDeployer;
};

export const deployCreate2Factory = async () => {
  let secondaryPrivateKey: string | undefined = undefined;

  const getSecondaryWallet = async () => {
    if (secondaryPrivateKey) {
      return new Wallet(secondaryPrivateKey, ethers.provider);
    }
    secondaryPrivateKey = (await deriveSecondaryKey()).privateKey;

    return new Wallet(secondaryPrivateKey, ethers.provider);
  };

  return chainweb.runOverChains(async (cwId) => {
    const masterDeployer = await getMasterDeployer();

    const masterDeployerAddress = await masterDeployer.getAddress();

    if (!masterDeployer) {
      throw new Error(
        `cant find the account with address ${masterDeployerAddress}`,
      );
    }

    const secondaryKey = await getSecondaryWallet();
    const secondaryKeyAddress = await secondaryKey.getAddress();

    console.log(
      `========= master deployer address: ${masterDeployerAddress} - version: ${hre.config.create2proxy.version} ========`,
    );

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

    const factory = await hre.ethers.getContractFactory(
      create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
        .abi,
      create2Artifact.contracts['contracts/Create2Factory.sol:Create2Factory']
        .bin,
      secondaryKey,
    );

    const tx = await factory.getDeployTransaction();
    const gasLimit = await ethers.provider.estimateGas(tx);
    const gasPrice = (await ethers.provider.getFeeData()).gasPrice;

    let requiredEther: bigint;
    if (!gasPrice || !gasLimit) {
      console.warn('gasPrice or gasLimit is undefined; using default values');
      requiredEther = ethers.parseEther('0.001');
    } else {
      requiredEther = (gasPrice * gasLimit * BigInt(120)) / BigInt(100);
    }

    if (balance > BigInt(0)) {
      console.log('deployer address:', secondaryKeyAddress);
      console.log('balance:', ethers.formatEther(balance));
    } else {
      console.log('FUNDING DEPLOYER WITH', gasLimit);
      await fundAccount(masterDeployer, secondaryKey, requiredEther);
    }

    /* Deploy the contract */

    const contract = await factory.deploy({
      gasLimit: gasLimit,
      gasPrice: gasPrice,
    });

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
