import { Contract } from 'ethers';
import './type.js';
import { CHAIN_ID_ABI, CHAIN_ID_ADDRESS } from './utils/network-contracts.js';
import { HardhatRuntimeEnvironment, KadenaNetworkConfig } from 'hardhat/types';
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
  const { ethers, network } = hre;

  function getNetworks() {
    return Object.keys(hre.config.networks).filter((net) =>
      net.includes(networkStem),
    );
  }

  function getChainIdContract() {
    return new ethers.Contract(CHAIN_ID_ADDRESS, CHAIN_ID_ABI, ethers.provider);
  }

  async function callChainIdContract() {
    const hex = await ethers.provider.send('eth_call', [
      { to: CHAIN_ID_ADDRESS },
      'latest',
      {},
    ]);
    return parseInt(hex, 16);
  }

  async function deployContractOnChains(name: string) {
    const chains = hre.chainweb.getChainIds();
    console.log(
      `Found ${chains.length} Kadena devnet networks: ${chains.join(', ')}`,
    );

    const deployments = []; // Array for individual token access

    for (const chainId of chains) {
      try {
        await hre.chainweb.switchChain(chainId);
        const cid = (network.config as KadenaNetworkConfig).chainwebChainId;
        console.log(`Switched to network ${cid}`);
        const [deployer] = await ethers.getSigners();
        console.log(
          `Deploying with signer: ${deployer.address} on network ${chainId}`,
        );

        /* Deploy the contract */
        const factory = await ethers.getContractFactory(name);
        const contract = await factory.deploy(ethers.parseEther('1000000'));
        const deploymentTx = contract.deploymentTransaction();
        if (!deploymentTx) {
          throw new Error('Deployment transaction failed');
        }
        await deploymentTx.wait();
        const tokenAddress = await contract.getAddress();

        // Store deployment info in both formats
        const deploymentInfo = {
          contract,
          address: tokenAddress,
          chain: cid,
          network: {
            chainId,
            name: `${networkStem}${chainId}`,
          },
        };

        deployments.push(deploymentInfo);
      } catch (error) {
        console.error(`Failed to deploy to network ${chainId}:`, error);
      }
    }

    return {
      deployments,
      tokens: deployments,
    };
  }

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
    computeOriginHash,
    requestSpvProof,
    createTamperedProof,
  };
};

export type DeployedContractsOnChains = {
  contract: BaseContract & {
    deploymentTransaction(): ContractTransactionResponse;
  } & Omit<Contract, keyof BaseContract>;
  address: string;
  chain: number;
  network: {
    name: string;
  };
};

export type DeployContractOnChains = (name: string) => Promise<{
  deployments: DeployedContractsOnChains[];
  /**
   * @deprecated Use `deployments` instead
   */
  tokens: DeployedContractsOnChains[];
}>;
