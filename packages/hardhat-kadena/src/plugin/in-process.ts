import {
  HardhatConfig,
  HardhatRuntimeEnvironment,
  HardhatUserConfig,
} from 'hardhat/types';
import { ChainwebNetwork } from '../utils/chainweb';
import { getUtils } from '../utils';
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider';
import Web3 from 'web3';
import { ChainwebHardhatUserConfig, ChainwebPluginApi } from '../type';
import { createGraph } from '../utils/chainweb-graph';
import { getKadenaNetworks } from '../utils/configure';

export const setChainwebInProcessConfig = (
  config: HardhatConfig,
  userConfig: Readonly<HardhatUserConfig>,
) => {
  if (
    userConfig.chainweb.networkType &&
    userConfig.chainweb.networkType !== 'hardhat'
  ) {
    throw new Error(`${userConfig.chainweb.networkType} is not supported`);
  }
  let chains = 2;
  if (userConfig.chainweb.graph) {
    if (
      userConfig.chainweb.chains &&
      Object.keys(userConfig.chainweb.graph).length !=
        userConfig.chainweb.chains
    ) {
      throw new Error(
        'Number of chains in graph does not match the graph configuration',
      );
    }
    chains = Object.keys(userConfig.chainweb.graph).length;
  }
  const chainsCount = chains ?? 2;
  const chainwebConfig: Required<
    ChainwebHardhatUserConfig & { chainIds: number[] }
  > = {
    networkStem: 'kadena_hardhat_',
    accounts: config.networks.hardhat.accounts,
    chains: chainsCount,
    chainIds: chainsCount
      ? Array.from({ length: chains }).map((_, i) => i)
      : [],
    graph: userConfig.chainweb.graph ?? createGraph(userConfig.chainweb.chains),
    logging: userConfig.chainweb.logging ?? 'info',
    networkType: 'hardhat' as const,
    ...userConfig.chainweb,
  };

  config.chainweb = chainwebConfig;

  // add networks to hardhat
  config.networks = {
    ...config.networks,
    ...getKadenaNetworks({
      availableNetworks: userConfig.networks,
      hardhatNetwork: config.networks.hardhat,
      networkStem: chainwebConfig.networkStem,
      numberOfChains: chainwebConfig.chains,
      accounts: chainwebConfig.accounts,
      loggingEnabled: chainwebConfig.logging === 'debug',
    }),
  };
  return;
};

export function inProcessPlugin(hre: HardhatRuntimeEnvironment) {
  if (hre.config.chainweb.networkType !== 'hardhat') {
    throw new Error(
      'This in process Plugin only works with hardhat networkType',
    );
  }
  const chainwebNetwork = new ChainwebNetwork({
    chainweb: hre.config.chainweb,
    networks: hre.config.networks,
  });

  async function startHardhatNetwork() {
    await chainwebNetwork.start();
  }

  let stopped = false;
  async function stopHardhatNetwork() {
    if (stopped) return;

    await chainwebNetwork.stop();
    stopped = true;
    process.exit(0);
  }

  process.on('exit', stopHardhatNetwork);
  process.on('SIGINT', stopHardhatNetwork);
  process.on('SIGTERM', stopHardhatNetwork);
  process.on('uncaughtException', stopHardhatNetwork);

  console.log('Kadena plugin initialized chains', hre.config.chainweb.chains);
  const startNetwork = startHardhatNetwork().catch(() => {
    process.exit(1);
  });

  const utils = getUtils(hre);

  const originalSwitchNetwork = hre.switchNetwork;
  hre.switchNetwork = async (networkNameOrIndex: string | number) => {
    const networkName =
      typeof networkNameOrIndex === 'number'
        ? `${hre.config.chainweb.networkStem}${networkNameOrIndex}`
        : networkNameOrIndex;
    if (networkName.startsWith(hre.config.chainweb.networkStem)) {
      const cid = parseInt(
        networkName.slice(hre.config.chainweb.networkStem.length),
      );
      const provider = chainwebNetwork.getProvider(cid);
      hre.network.name = networkName;
      hre.network.config = hre.config.networks[networkName];
      hre.network.provider = provider;
      // update underlying library's provider data
      if ('ethers' in hre) {
        hre.ethers.provider = new HardhatEthersProvider(provider, networkName);
      }
      if ('web3' in hre) {
        hre.web3 = new Web3(provider);
      }
      console.log(`Switched to chain ${cid}`);
      return;
    }
    originalSwitchNetwork(networkName);
  };

  const api: ChainwebPluginApi = {
    network: chainwebNetwork,
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: async (cid: number) => {
      const provider = chainwebNetwork.getProvider(cid);
      return provider;
    },
    requestSpvProof: utils.requestSpvProof,
    switchChain: async (cid: number | string) => {
      await startNetwork;
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
      } else {
        await hre.switchNetwork(`${hre.config.chainweb.networkStem}${cid}`);
      }
    },
    getChainIds: () => hre.config.chainweb.chainIds,
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: utils.createTamperedProof,
    computeOriginHash: utils.computeOriginHash,
    deployMocks: utils.deployMocks,
  };

  hre.chainweb = api;
}
