import { ContractMethodArgs, Overrides, Signer } from 'ethers';
import './type.js';
import { CHAIN_ID_ABI } from './utils/network-contracts.js';
import { FactoryOptions, HardhatRuntimeEnvironment, KadenaNetworkConfig } from 'hardhat/types';
import { BaseContract } from 'ethers';
import { ContractTransactionResponse } from 'ethers';
import { ChainwebNetwork } from './utils/chainweb.js';
import {
  CREATE2_PROXY_ADDRESS,
  CREATE2_PROXY_ABI,
  CREATE2_PROXY_BYTE_CODE
} from './utils/network-contracts.js';



interface Create2Proxy extends BaseContract {
  deploy(
    salt: string | Uint8Array,
    initCode: string,
    overrides?: Overrides
  ): Promise<ContractTransactionResponse>;
  connect(signer: Signer): Create2Proxy;
}


export const getNetworkStem = (chainwebName: string) =>
  `chainweb_${chainwebName}`;

export interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}

export const getUtils = (
  hre: HardhatRuntimeEnvironment,
  chainwebNetwork?: ChainwebNetwork,
) => {
  const networkStem = getNetworkStem(hre.config.defaultChainweb);
  const { ethers } = hre;

  function getNetworks() {
    return Object.keys(hre.config.networks).filter((net) =>
      net.includes(networkStem),
    );
  }

  function getChainIdContract() {
    const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
    return new ethers.Contract(
      chainweb.precompiles.chainwebChainId,
      CHAIN_ID_ABI,
      ethers.provider,
    );
  }

  async function callChainIdContract() {
    const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
    const hex = await ethers.provider.send('eth_call', [
      { to: chainweb.precompiles.chainwebChainId },
      'latest',
      {},
    ]);
    return parseInt(hex, 16);
  }

  async function runOverChains<T>(callback: (cid: number) => Promise<T>) {
    const result: Array<T> = [];
    for (const cid of hre.chainweb.getChainIds()) {
      await hre.chainweb.switchChain(cid);
      console.log(`Switched to network ${cid}`);
      result.push(await callback(cid));
    }
    return result;
  }

  const deployContractOnChains: DeployContractOnChains = async ({
    name,
    signer,
    factoryOptions,
    constructorArgs = [],
    overrides,
  }) => {
    const deployments = await runOverChains(async (chainId) => {
      try {
        await hre.chainweb.switchChain(chainId);
        const cid = (hre.network.config as KadenaNetworkConfig).chainwebChainId;
        console.log(`Switched to network ${cid}`);
        const [deployer] = await ethers.getSigners();
        console.log(
          `Deploying with signer: ${deployer.address} on network ${chainId}`,
        );

        /* Deploy the contract */
        const factory = await ethers.getContractFactory(name, {
          signer: signer ?? factoryOptions?.signer ?? deployer,
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
          chain: cid,
          network: {
            chainId,
            name: `${networkStem}${chainId}`,
          },
        };
      } catch (error) {
        console.error(`Failed to deploy to network ${chainId}:`, error);
        return null;
      }
    });

    return {
      deployments: deployments.filter((d) => d !== null),
    };
  };



  function computeOriginHash(origin: Origin) {
    // Create a proper ABI encoding matching Solidity struct layout
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(uint32,address,uint64,uint64,uint64)'],
      [
        [
          origin.chain, // uint32 originChainId
          origin.originContractAddress, // address originContractAddress
          origin.height, // uint64 originBlockHeight
          origin.txIdx, // uint64 originTransactionIndex
          origin.eventIdx, // uint64 originEventIndex
        ],
      ],
    );

    // Hash it using keccak256
    return ethers.keccak256(abiEncoded);
  }





  /**
   * Deploys a contract deterministically using CREATE2 to multiple chains,
   * ensuring the same address across all chains.
   * @param salt - Required parameter to ensure deterministic addresses
   */
  const deployContractOnChainsDeterministic: DeployContractOnChainsDeterministic = async ({
    name,
    constructorArgs,
    overrides,
    salt,
  }) => {
    console.log("******** inside deployContractOnChainsDeterministic ****");
    if (!salt) {
      throw new Error('Salt is required for deterministic deployment');
    }

    const chainweb = hre.config.chainweb[hre.config.defaultChainweb];

    // Use the precompiled Create2 proxy to deploy deterministically
    const create2Proxy = new ethers.Contract(
      chainweb.precompiles.create2Proxy,
      CREATE2_PROXY_ABI,
      ethers.provider
    ) as unknown as Create2Proxy;

    // Get contract factory for the contract to be deployed
    const contractFactory = await ethers.getContractFactory(name);

    // Prepare bytecode with constructor args
    const args = constructorArgs || [];
    const encodedArgs = contractFactory.interface.encodeDeploy(args);
    const bytecodeWithArgs = contractFactory.bytecode + encodedArgs.slice(2);

    // Calculate salt
    const create2Salt = typeof salt === 'string'
      ? (!salt.startsWith('0x') ? ethers.id(salt) : salt)
      : salt;

    console.log("Calculating expected address with:", {
      salt: create2Salt,
      bytecodeLength: bytecodeWithArgs.length
    });

    const deployments = await runOverChains(async (cid) => {
      try {
        console.log(`Deploying to chain ${cid} using CREATE2 precompile...`);
        const [signer] = await ethers.getSigners();

        // Deploy using precompile
        const tx = await create2Proxy.connect(signer).deploy(
          create2Salt,
          bytecodeWithArgs,
          { ...overrides, gasLimit: 6000000 }
        );
        const receipt = await tx.wait();

        console.log(`Transaction hash: ${tx.hash}`);
        console.log("receipt", receipt);

        // Get the deployed address from the raw response
        const response = await ethers.provider.call({
          to: chainweb.precompiles.create2Proxy,
          data: create2Proxy.interface.encodeFunctionData('deploy', [
            create2Salt,
            bytecodeWithArgs
          ])
        });

        // Find deployed address from receipt events
        //const deployedAddress = tx.result;
        const deployedAddress = ethers.getAddress(`0x${response.slice(-40)}`);
        if (!deployedAddress) {
          throw new Error(`Failed to get deployed contract address on chain ${cid}`);
        }

        console.log(`Deployed to ${deployedAddress} on chain ${cid}`);

        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contract: contractFactory.attach(deployedAddress) as any,
          address: deployedAddress,
          chain: cid,
          network: {
            chainId: cid,
            name: `${networkStem}${cid}`,
          },
          alreadyDeployed: false
        };
      } catch (error) {
        console.error(`Failed to deploy to chain ${cid}:`, error);
        return null;
      }
    });

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  async function requestSpvProof(
    targetChain: number,
    origin: Omit<Origin, 'originContractAddress'>,
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

  async function createTamperedProof(targetChain: number, origin: Origin) {
    const spvString = await requestSpvProof(targetChain, origin);
    const proofBytes = Buffer.from(spvString.replace(/^0x/, ''), 'hex').buffer;
    const bytes = new Uint8Array(proofBytes);

    // Corrupt middle of proof
    const midPoint = Math.floor(bytes.length / 2);
    bytes[midPoint] = 0xff; // Change single byte to invalid value

    return '0x' + Buffer.from(bytes).toString('hex');
  }
  return {
    getNetworks,
    getChainIdContract,
    callChainIdContract,
    deployContractOnChains,
    deployContractOnChainsDeterministic,
    computeOriginHash,
    requestSpvProof,
    createTamperedProof,
    runOverChains,
  };
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


export type DeployContractOnChains = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(args: {
  name: string;
  signer?: Signer;
  factoryOptions?: FactoryOptions;
  constructorArgs?: ContractMethodArgs<A>;
  overrides?: Overrides;
}) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export type DeployContractOnChainsDeterministic = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(args: {
  name: string;
  signer?: Signer;
  factoryOptions?: FactoryOptions;
  constructorArgs?: ContractMethodArgs<A>;
  overrides?: Overrides;
  salt: string | Uint8Array;  // Required for deterministic deployment
}) => Promise<{
  deployments: (DeployedContractsOnChains<T> & { alreadyDeployed?: boolean })[];
}>;
