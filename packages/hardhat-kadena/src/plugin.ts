import { extendEnvironment, extendConfig } from 'hardhat/config';
import { ChainwebNetwork } from './utils/chainweb.js';
import { ChainwebConfig, ChainwebPluginApi } from './type.js';
import { getKadenaNetworks } from './utils/configure.js';
import { createGraph } from './utils/chainweb-graph.js';
import { getUtils } from './utils.js';
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider.js';
import Web3 from 'web3';

extendConfig((config, userConfig) => {
  if (!userConfig.chainweb) {
    throw new Error(
      'hardhat_kadena plugins is imported but chainweb configuration is not presented in hardhat.config.js',
    );
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

  const chainwebConfig: Required<ChainwebConfig> = {
    networkStem: 'kadena_hardhat_',
    accounts: config.networks.hardhat.accounts,
    chains,
    graph: userConfig.chainweb.graph ?? createGraph(userConfig.chainweb.chains),
    logging: userConfig.chainweb.logging ?? 'info',
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
  config.defaultNetwork =
    userConfig.defaultNetwork ?? `${chainwebConfig.networkStem}0`;
});

// extendEnvironment((hre) => {
//   console.log(hre.config.networks.hardhat.accounts);
//   process.exit(0);
// });

extendEnvironment((hre) => {
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
    getProvider: (cid: number) => {
      const provider = chainwebNetwork.getProvider(cid);
      const networkName = `${hre.config.chainweb.networkStem}${cid}`;
      return new HardhatEthersProvider(provider, networkName);
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
    getChainIds: () =>
      new Array(hre.config.chainweb.chains).fill(0).map((_, i) => i),
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: utils.createTamperedProof,
    computeOriginHash: utils.computeOriginHash,
    deployMocks: utils.deployMocks,
  };

  hre.chainweb = api;
});
