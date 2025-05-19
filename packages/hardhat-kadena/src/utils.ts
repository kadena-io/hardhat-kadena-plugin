import { ContractMethodArgs, Overrides, Signer } from 'ethers';
import './type.js';
import { CHAIN_ID_ABI } from './utils/network-contracts.js';
import { FactoryOptions } from 'hardhat/types';
import { BaseContract } from 'ethers';
import { ContractTransactionResponse } from 'ethers';
import { ChainwebNetwork } from './utils/chainweb.js';
import hre from 'hardhat';
import { getNetworkStem, Origin } from './pure-utils.js';

const networkStem = getNetworkStem(hre.config.defaultChainweb);

export function getNetworks() {
  return Object.keys(hre.config.networks).filter((net) =>
    net.includes(networkStem),
  );
}

export function getChainIdContract() {
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  return new hre.ethers.Contract(
    chainweb.precompiles.chainwebChainId,
    CHAIN_ID_ABI,
    hre.ethers.provider,
  );
}

export async function callChainIdContract() {
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  const hex = await hre.ethers.provider.send('eth_call', [
    { to: chainweb.precompiles.chainwebChainId },
    'latest',
    {},
  ]);
  return parseInt(hex, 16);
}

export async function runOverChains<T>(
  callback: (chainId: number) => Promise<T>,
) {
  const result: Array<T> = [];
  const chainwebChainIds = await hre.chainweb.getChainIds();
  for (const cid of chainwebChainIds) {
    await hre.chainweb.switchChain(cid);
    result.push(await callback(cid));
  }
  return result;
}

export const deployContractOnChains: DeployContractOnChains = async ({
  name,
  signer,
  factoryOptions,
  constructorArgs = [],
  overrides,
}) => {
  const deployments = await runOverChains(async (cwId) => {
    try {
      const signers = await hre.ethers.getSigners();

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
        `Deploying with signer: ${deployerAddress} on network ${cwId}`,
      );

      /* Deploy the contract */
      const factory = await hre.ethers.getContractFactory(name, {
        signer: contractDeployer,
        ...factoryOptions,
      });
      const contract = await factory.deploy(
        ...(overrides ? [...constructorArgs, overrides] : constructorArgs),
      );
      const deploymentTx = contract.deploymentTransaction();
      if (!deploymentTx) {
        throw new Error('Deployment transaction failed');
      }
      await deploymentTx.wait();
      const tokenAddress = await contract.getAddress();

      // Store deployment info in both formats
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contract: contract as any,
        address: tokenAddress,
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

/* *************************************************************************** */
/* Off-Chain: SPV Proof Creation */

// Call our chainweb SPV api with the necesasry proof parameters
async function getProof(
  trgChain: number,
  origin: Omit<Origin, 'originContractAddress'>,
) {
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  if (chainweb.type === 'in-process') {
    throw new Error('call requestSpvProof for in-process chainweb');
  }
  if (!chainweb.externalHostUrl) {
    throw new Error(
      'You need to set chainweb.externalHostUrl in hardhat.config.js for external chainweb access',
    );
  }
  const url = `${chainweb.externalHostUrl}/chain/${trgChain}/spv/chain/${origin.chain}/height/${origin.height}/transaction/${origin.txIdx}/event/${origin.eventIdx}`;
  return fetch(url);
}

// Request cross-chain transfer SPV proof
export async function requestSpvProof(
  targetChain: number,
  origin: Omit<Origin, 'originContractAddress'>,
  chainwebNetwork?: ChainwebNetwork,
) {
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  if (chainweb.type === 'in-process' && chainwebNetwork) {
    const hexProof = await chainwebNetwork.getSpvProof(targetChain, origin);
    console.log(`Hex proof: ${hexProof}`);
    return hexProof;
  } else {
    const spvCall = await getProof(targetChain, origin);
    const proof = await spvCall.text();
    if (proof.startsWith('0x')) return proof;
    const proofStr = proof;
    const hexProof = '0x' + Buffer.from(proofStr, 'utf8').toString('hex');
    return hexProof;
  }
}

export async function createTamperedProof(
  targetChain: number,
  origin: Origin,
  chainwebNetwork?: ChainwebNetwork,
) {
  const spvString = await requestSpvProof(targetChain, origin, chainwebNetwork);
  const proofBytes = Buffer.from(spvString.replace(/^0x/, ''), 'hex').buffer;
  const bytes = new Uint8Array(proofBytes);

  // Corrupt middle of proof
  const midPoint = Math.floor(bytes.length / 2);
  bytes[midPoint] = 0xff; // Change single byte to invalid value

  return '0x' + Buffer.from(bytes).toString('hex');
}

export const getChainIds = async () => {
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  return Promise.resolve(
    new Array(chainweb.chains)
      .fill(0)
      .map((_, i) => i + chainweb.chainwebChainIdOffset),
  );
};

export type DeployedContractsOnChains<T extends BaseContract = BaseContract> = {
  contract: T & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  address: string;
  chain: number;
  network: {
    name: string;
  };
};

export type DeployContractProperties<A extends unknown[] = unknown[]> = {
  name: string;
  signer?: Signer;
  factoryOptions?: FactoryOptions;
  constructorArgs?: ContractMethodArgs<A>;
  overrides?: Overrides;
};

export type DeployContractOnChains = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProperties<A>,
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;
