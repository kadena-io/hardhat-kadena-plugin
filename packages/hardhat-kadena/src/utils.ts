import { ContractMethodArgs, Overrides, Signer } from 'ethers';
import './type.js';
import { CHAIN_ID_ABI, CREATE2_PROXY_ABI } from './utils/network-contracts.js';
import {
  FactoryOptions,
  HardhatRuntimeEnvironment,
  KadenaNetworkConfig,
} from 'hardhat/types';
import { BaseContract } from 'ethers';
import { ContractTransactionResponse } from 'ethers';
import { ChainwebNetwork } from './utils/chainweb.js';

export const getNetworkStem = (chainwebName: string) =>
  `chainweb_${chainwebName}`;

export interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}

interface Create2Proxy extends BaseContract {
  connect(signer: Signer): Create2Proxy;
  deploy(
    salt: string | Uint8Array,
    bytecode: string,
    overrides?: Overrides,
  ): Promise<ContractTransactionResponse>;
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

  function getCreate2Contract() {
    const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
    return new ethers.Contract(
      chainweb.precompiles.create2Proxy,
      CREATE2_PROXY_ABI,
      ethers.provider,
    ) as unknown as Create2Proxy;
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

  function isContractDeployed(address: string): Promise<boolean> {
    return ethers.provider.getCode(address).then((code) => code !== '0x');
  }

  async function callCreate2Contract(
    contractBytecode: string,
    saltString: string,
  ) {
    const factoryAddress =
      hre.config.chainweb[hre.config.defaultChainweb].precompiles.create2Proxy;

    const Factory = await hre.ethers.getContractFactory('Create2Factory');

    const create2 = Factory.attach(factoryAddress);

    const salt = ethers.id(saltString);

    const predictedAddress = ethers.getCreate2Address(
      factoryAddress,
      salt,
      ethers.keccak256(contractBytecode),
    );

    if (await isContractDeployed(predictedAddress)) {
      console.log(
        `Contract already deployed at ${predictedAddress}. Skipping deployment.`,
      );
      return predictedAddress;
    }

    // Deploy using CREATE2
    const tx = await create2.deploy(contractBytecode, salt);
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
        const cid = chainId;
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

  const deployContractOnChainsUsingCreate2: DeployContractOnChains = async ({
    name,
    signer,
    factoryOptions,
    constructorArgs = [],
    overrides,
  }) => {
    const deployments = await runOverChains(async (chainId) => {
      try {
        const cid = chainId;
        const [deployer] = await ethers.getSigners();
        console.log(
          `Deploying with signer: ${deployer.address} on network ${chainId}`,
        );

        /* Deploy the contract */
        const factory = await ethers.getContractFactory(name, {
          signer: signer ?? factoryOptions?.signer ?? deployer,
          ...factoryOptions,
        });
        const transaction = await factory.getDeployTransaction(
          ...(overrides ? [...constructorArgs, overrides] : constructorArgs),
        );
        // Prepare the bytecode of the contract to deploy
        const bytecode = transaction.data;

        const contractAddress = await hre.chainweb.callCreate2Contract(
          bytecode,
          'kadena_hardhat_plugin',
        );

        const contract = factory.attach(contractAddress);

        // Store deployment info in both formats
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contract: contract as any,
          address: contractAddress,
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
  const deployContractOnChainsDeterministic: DeployContractOnChainsDeterministic =
    async ({ name, constructorArgs, salt }) => {
      console.log('******** inside deployContractOnChainsDeterministic ****');
      if (!salt) {
        throw new Error('Salt is required for deterministic deployment');
      }

      const chainweb = hre.config.chainweb[hre.config.defaultChainweb];

      // Get the CREATE2 proxy contract
      const create2Proxy = getCreate2Contract() as Create2Proxy;

      // Get contract factory for the contract to be deployed
      const contractFactory = await ethers.getContractFactory(name);

      // Prepare bytecode with constructor args
      const args = constructorArgs || [];
      const encodedArgs = contractFactory.interface.encodeDeploy(args);
      const bytecodeWithArgs = contractFactory.bytecode + encodedArgs.slice(2);

      // Calculate salt
      const create2Salt =
        typeof salt === 'string'
          ? !salt.startsWith('0x')
            ? ethers.id(salt)
            : salt
          : salt;

      console.log('Calculating expected address with:', {
        salt: create2Salt,
        bytecodeLength: bytecodeWithArgs.length,
      });

      const deployments = await runOverChains(async (cid) => {
        try {
          await hre.chainweb.switchChain(cid);
          const chainwebChainId = (hre.network.config as KadenaNetworkConfig)
            .chainwebChainId;
          console.log(
            `Switched to chain ${chainwebChainId} using CREATE2 precompile...`,
          );

          // Use hre's provider instead of creating new one
          const provider = hre.ethers.provider;

          const [signer] = await ethers.getSigners();
          console.log(`Using signer: ${signer.address}`);

          // Get the expected CREATE2 address
          const expectedAddress = ethers.getCreate2Address(
            chainweb.precompiles.create2Proxy,
            create2Salt,
            ethers.keccak256(bytecodeWithArgs),
          );

          const tx = await create2Proxy
            .connect(signer)
            .deploy(create2Salt, bytecodeWithArgs, { gasLimit: 1000000 });

          await tx.wait();

          const receipt = await tx.wait();
          if (receipt?.status === 0) {
            throw new Error(`Transaction failed on chain ${cid}`);
          }

          console.log(`Transaction hash: ${tx.hash}`);
          console.log('receipt', receipt);

          // Verify code exists
          const code = await provider.getCode(expectedAddress);
          if (code.length <= 2) {
            throw new Error(`No code at deployed address ${expectedAddress}`);
          }

          console.log(`Deployed to ${expectedAddress} on chain ${cid}`);

          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contract: contractFactory.attach(expectedAddress) as any,
            address: expectedAddress,
            chain: cid,
            network: {
              chainId: cid,
              name: `${networkStem}${cid}`,
            },
            alreadyDeployed: false,
          };
        } catch (error) {
          console.error(`Failed to deploy to chain ${cid}:`, error);
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
    callCreate2Contract,
    getNetworks,
    getChainIdContract,
    callChainIdContract,
    deployContractOnChains,
    deployContractOnChainsUsingCreate2,
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
  salt: string | Uint8Array; // Required for deterministic deployment
}) => Promise<{
  deployments: (DeployedContractsOnChains<T> & { alreadyDeployed?: boolean })[];
}>;
