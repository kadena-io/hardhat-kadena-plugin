import { BytesLike, ContractMethodArgs, Overrides, Signer } from 'ethers';
import './type.js';
import {
  callCreate2Factory,
  CHAIN_ID_ABI,
  sendCreate2Factory,
} from './utils/network-contracts.js';
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

export async function create2Address(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructorArgs: any[] = [],
  salt: BytesLike,
): Promise<string> {
  if (salt.length > 32) {
    throw new Error('Salt must be at most 32 bytes');
  } else if (typeof salt == 'string' && !salt.startsWith('0x')) {
    salt = hre.ethers.encodeBytes32String(salt);
  }
  const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
  const factory = await hre.ethers.getContractFactory(name);
  const encodedConstructorArgs =
    factory.interface.encodeDeploy(constructorArgs);
  return hre.ethers.getCreate2Address(
    chainweb.precompiles.create2Factory,
    salt,
    hre.ethers.keccak256(
      hre.ethers.concat([factory.bytecode, encodedConstructorArgs]),
    ),
  );
}

/**
 * Checks if a contract is deployed at the specified address.
 *
 * @param address - The address to check for contract deployment
 * @returns A promise that resolves to true if a contract exists at the address, false otherwise
 */
function isContractDeployed(address: string): Promise<boolean> {
  return hre.ethers.provider.getCode(address).then((code) => code !== '0x');
}

export const deployContractOnChains: DeployContractOnChains = async ({
  name,
  signer,
  factoryOptions,
  constructorArgs = [],
  overrides,
  salt,
}) => {
  const deployments = await runOverChains(async (cwId) => {
    try {
      const signers = await hre.ethers.getSigners();
      const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
      if (!chainweb) {
        throw new Error(
          `Chainweb configuration not found for ${hre.config.defaultChainweb}`,
        );
      }

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

      let contract;

      // Use CREATE2 factory for deployment if salt is provided.
      if (salt !== undefined) {
        // Validate and format salt
        if (salt.length > 32) {
          throw new Error('Salt must be at most 32 bytes');
        } else if (typeof salt == 'string' && !salt.startsWith('0x')) {
          salt = hre.ethers.encodeBytes32String(salt);
        }

        // encode constructor arguments
        const encodedConstructorArgs = factory.interface.encodeDeploy(
          overrides ? [...constructorArgs, overrides] : constructorArgs,
        );

        const predictedAddress = await create2Address(
          name,
          constructorArgs,
          salt,
        );

        const isDeployed = await isContractDeployed(predictedAddress);

        // Check if contract is already deployed at the predicted address
        if (isDeployed) {
          console.log(`Contract is already deployed at ${predictedAddress}`);
          return {
            contract: factory.attach(predictedAddress),
            address: predictedAddress,
            chain: cwId,
            deployer: deployerAddress,
            network: {
              chainId: hre.config.networks[`${networkStem}${cwId}`].chainId,
              name: `${networkStem}${cwId}`,
            },
            contractAlreadyDeployed: true,
          };
        }

        // get contract address
        const tokenAddress = callCreate2Factory(
          hre.ethers.provider,
          salt,
          factory.bytecode,
          encodedConstructorArgs,
          chainweb.precompiles.create2Factory,
        );

        // send deployment transaction
        const deploymentTx = await sendCreate2Factory(
          contractDeployer,
          salt,
          factory.bytecode,
          encodedConstructorArgs,
        );
        if (!deploymentTx) {
          throw new Error('Deployment transaction failed');
        }
        await deploymentTx.wait();
        contract = factory.attach(await tokenAddress);
      } else {
        // initializat contract
        contract = await factory.deploy(
          ...(overrides ? [...constructorArgs, overrides] : constructorArgs),
        );
        // deploy contract
        const deploymentTx = contract.deploymentTransaction();
        if (!deploymentTx) {
          throw new Error('Deployment transaction failed');
        }
        await deploymentTx.wait();
      }

      const tokenAddress = await contract.getAddress();

      // Store deployment info in both formats
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contract: contract as any,
        address: tokenAddress,
        chain: cwId,
        deployer: deployerAddress,
        network: {
          chainId: hre.config.networks[`${networkStem}${cwId}`].chainId,
          name: `${networkStem}${cwId}`,
        },
        ...(salt !== undefined ? { contractAlreadyDeployed: false } : {}),
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

export interface DeployContractOnChains {
  /**
   * Standard deployment across chains.
   *
   * @param args - Deployment properties
   * @returns Deployed contract information across chains
   */
  <T extends BaseContract = BaseContract, A extends unknown[] = unknown[]>(
    args: DeployContractProperties<A> & { salt?: undefined },
  ): Promise<{
    deployments: DeployedContractsOnChains<T>[];
  }>;
  /**
   * Deterministic deployment using CREATE2 factory precompile.
   *
   * @param args - Deployment properties including salt for CREATE2
   * @returns Deployed contract information across chains
   */
  <T extends BaseContract = BaseContract, A extends unknown[] = unknown[]>(
    args: DeployContractProperties<A> & { salt: BytesLike },
  ): Promise<{
    deployments: Array<
      DeployedContractsOnChains<T> & { contractAlreadyDeployed: boolean }
    >;
  }>;
}
