import { ContractMethodArgs, Overrides, Signer } from 'ethers';
import './type.js';
import { CHAIN_ID_ABI } from './utils/network-contracts.js';
import { FactoryOptions, HardhatRuntimeEnvironment } from 'hardhat/types';
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

  const deployContractOnChains: DeployContractOnChains = async <
    T extends BaseContract = BaseContract,
    A extends unknown[] = unknown[],
  >({
    name,
    signer,
    factoryOptions,
    constructorArgs,
    overrides,
  }: Omit<DeployContractProps<A>, 'salt'>) => {
    const deployments = await runOverChains(async (cid) => {
      try {
        const [deployer] = await ethers.getSigners();
        console.log(
          `Deploying with signer: ${deployer.address} on network ${cid}`,
        );

        /* Deploy the contract */
        const factory = await ethers.getContractFactory(name, {
          signer: signer ?? factoryOptions?.signer ?? deployer,
          ...factoryOptions,
        });
        const args = constructorArgs || [];
        const contract = (await factory.deploy(
          ...(overrides ? [...args, overrides] : args),
        )) as unknown as T;
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
            chainId: cid,
            name: `${networkStem}${cid}`,
          },
        };
      } catch (error) {
        console.error(`Failed to deploy to network ${cid}:`, error);
        return null;
      }
    });

    return {
      deployments: deployments.filter((d) => d !== null),
    };
  };

  /**
   * Deploys a contract deterministically using CREATE2 to multiple chains,
   * ensuring the same address across all chains.
   * @param salt - Required parameter to ensure deterministic addresses
   */
  const deployContractOnChainsDeterministic: DeployContractOnChainsDeterministic =
    async <
      T extends BaseContract = BaseContract,
      A extends unknown[] = unknown[],
    >({
      name,
      signer,
      factoryOptions,
      constructorArgs,
      overrides,
      salt, // Required CREATE2 salt parameter
    }: DeployContractProps<A>) => {
      // Format and validate salt for CREATE2
      let create2Salt;

      if (!salt) {
        throw new Error('Salt is required for deterministic deployment');
      } else if (typeof salt === 'string') {
        // If it's a string but doesn't start with 0x, hash it
        create2Salt = !salt.startsWith('0x') ? ethers.id(salt) : salt;
      } else if (salt instanceof Uint8Array) {
        // If it's already bytes, use as is
        create2Salt = salt;
      } else {
        throw new Error('Salt must be a string or Uint8Array');
      }
      console.log(`Using CREATE2 with salt: ${create2Salt}`);

      const deployments = await runOverChains(async (cid) => {
        try {
          const [deployer] = await ethers.getSigners();
          console.log(
            `Deploying with signer: ${deployer.address} on chain ${cid} using CREATE2`,
          );

          // Get contract factory
          const factory = await ethers.getContractFactory(name, {
            signer: signer ?? factoryOptions?.signer ?? deployer,
            ...factoryOptions,
          });

          // Get bytecode with encoded constructor arguments
          const encodedArgs = factory.interface.encodeDeploy(constructorArgs);
          const bytecodeWithArgs = factory.bytecode + encodedArgs.slice(2);

          // Calculate the CREATE2 address
          const effectiveSigner = signer ?? factoryOptions?.signer ?? deployer;
          const signerAddress = await effectiveSigner.getAddress();

          // Use ethers v6 getCreate2Address method
          const create2Address = ethers.getCreate2Address(
            signerAddress,
            create2Salt,
            ethers.keccak256(bytecodeWithArgs),
          );

          console.log(
            `Predicted deployment address on chain ${cid}: ${create2Address}`,
          );

          // Check if contract is already deployed at this address
          const code = await ethers.provider.getCode(create2Address);
          if (code !== '0x') {
            console.log(
              `Contract already deployed at ${create2Address} on chain ${cid}`,
            );

            // Get contract instance for already deployed contract
            const contract = new ethers.Contract(
              create2Address,
              factory.interface,
              signer ?? factoryOptions?.signer ?? deployer,
            ) as unknown as T;

            return {
              contract,
              address: create2Address,
              chain: cid,
              network: {
                chainId: cid,
                name: `${networkStem}${cid}`,
              },
              alreadyDeployed: true,
            };
          }

          // Create transaction with CREATE2
          // First extract customData from overrides to handle it separately
          const { customData, ...otherOverrides } = overrides || {};

          // Create properly structured transaction request
          const txRequest = {
            data: bytecodeWithArgs,
            gasLimit:
              otherOverrides.gasLimit !== undefined
                ? otherOverrides.gasLimit
                : 6000000,
            ...otherOverrides,
            // Merge existing customData with our CREATE2 salt
            customData: {
              ...(customData || {}),
              create2Salt: create2Salt,
            },
          };

          const tx = await effectiveSigner.sendTransaction(txRequest);

          console.log(`Deployment transaction on chain ${cid}: ${tx.hash}`);
          const receipt = await tx.wait();

          // Get deployed contract instance
          const contract = new ethers.Contract(
            receipt?.contractAddress || create2Address,
            factory.interface,
            effectiveSigner,
          );

          const deployedAddress = await contract.getAddress();
          console.log(
            `Contract deployed on chain ${cid} at address: ${deployedAddress}`,
          );

          // Verify the address matches prediction
          if (deployedAddress.toLowerCase() === create2Address.toLowerCase()) {
            console.log(
              `✅ Chain ${cid}: Deployment address matches prediction`,
            );
          } else {
            console.error(
              `❌ Chain ${cid}: Deployment address doesn't match prediction!`,
            );
            console.error(`Expected: ${create2Address}`);
            console.error(`Actual: ${deployedAddress}`);
          }

          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contract: contract as any,
            address: deployedAddress,
            chain: cid,
            network: {
              chainId: cid,
              name: `${networkStem}${cid}`,
            },
            alreadyDeployed: false,
          };
        } catch (error) {
          console.error(`Failed to deploy to network ${cid}:`, error);
          return null;
        }
      });

      const validDeployments = deployments.filter((d) => d !== null);

      // Check if all addresses are the same
      if (validDeployments.length > 1) {
        const addresses = validDeployments.map((d) => d?.address.toLowerCase());
        const allSame = addresses.every((addr) => addr === addresses[0]);

        if (allSame) {
          console.log(
            `✅ SUCCESS: Contract deployed to the same address on all chains: ${addresses[0]}`,
          );
        } else {
          console.error(`❌ ERROR: Contract addresses differ across chains!`);
          for (const deployment of validDeployments) {
            console.error(`Chain ${deployment?.chain}: ${deployment?.address}`);
          }
        }
      }

      return {
        deployments: validDeployments,
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

export type DeployContractProps<A extends unknown[] = unknown[]> = {
  name: string;
  signer?: Signer;
  factoryOptions?: FactoryOptions;
  constructorArgs?: ContractMethodArgs<A>;
  overrides?: Overrides;
  salt?: string | Uint8Array; // Additional parameter for CREATE2
};

export type DeployContractOnChains = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: Omit<DeployContractProps<A>, 'salt'>,
) => Promise<{
  deployments: DeployedContractsOnChains<T>[];
}>;

export type DeployContractOnChainsDeterministic = <
  T extends BaseContract = BaseContract,
  A extends unknown[] = unknown[],
>(
  args: DeployContractProps<A>,
) => Promise<{
  deployments: (DeployedContractsOnChains<T> & { alreadyDeployed?: boolean })[];
}>;
