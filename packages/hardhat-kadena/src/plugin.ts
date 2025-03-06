import { createProvider } from 'hardhat/internal/core/providers/construction';
import { extendEnvironment, extendConfig, task } from 'hardhat/config';
import { ChainwebNetwork } from './utils/chainweb.js';
import {
  ChainwebExternalConfig,
  ChainwebExternalUserConfig,
  ChainwebInProcessConfig,
  ChainwebInProcessUserConfig,
  ChainwebPluginApi,
} from './type.js';
import {
  getKadenaExternalNetworks,
  getKadenaNetworks,
} from './utils/configure.js';
import { createGraph } from './utils/chainweb-graph.js';
import { getNetworkStem, getUtils } from './utils.js';
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider.js';
import Web3 from 'web3';
import { runRPCNode } from './server/runRPCNode.js';
import { CHAIN_ID_ADDRESS, VERIFY_ADDRESS } from './utils/network-contracts.js';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

extendConfig((config, userConfig) => {
  if (!userConfig.chainweb) {
    throw new Error(
      'hardhat_kadena plugins is imported but chainweb configuration is not presented in hardhat.config.js',
    );
  }
  if (Object.keys(userConfig.chainweb).length === 0) {
    throw new Error(
      'You need to provide at least one chainweb configuration in hardhat.config.js',
    );
  }

  config.defaultChainweb = userConfig.defaultChainweb ?? 'hardhat';

  const hardhatConfig = userConfig.chainweb.hardhat || {
    chains: 2,
    type: 'in-process',
  };

  const userConfigWithLocalhost = {
    ...userConfig.chainweb,
    hardhatConfig,
    localhost: {
      chains: hardhatConfig.chains,
      chainIdOffset: hardhatConfig.chainIdOffset ?? 626000,
      type: 'external',
      externalHostUrl: 'http://localhost:8545',
    },
  };

  Object.entries(userConfigWithLocalhost).forEach(
    ([name, chainwebUserConfig]) => {
      if (chainwebUserConfig === undefined) return;
      if (!chainwebUserConfig.chains) {
        throw new Error(
          'Number of chains is not presented in hardhat.config.js',
        );
      }
      let type = chainwebUserConfig.type ?? 'in-process';
      if (name === 'hardhat') {
        type = 'in-process';
      }
      if (name === 'localhost') {
        type = 'external';
      }

      if (
        type === 'in-process' &&
        (chainwebUserConfig as ChainwebInProcessConfig).graph
      ) {
        const graph =
          (chainwebUserConfig as ChainwebInProcessConfig).graph ?? {};
        if (
          chainwebUserConfig.chains &&
          Object.keys(graph).length != chainwebUserConfig.chains
        ) {
          throw new Error(
            'Number of chains in graph does not match the graph configuration',
          );
        }
      }

      if (type === 'in-process') {
        // add networks to hardhat
        const chainwebInProcessUserConfig =
          chainwebUserConfig as ChainwebInProcessUserConfig;

        const chainwebConfig: ChainwebInProcessConfig = {
          graph:
            chainwebInProcessUserConfig.graph ??
            createGraph(chainwebInProcessUserConfig.chains),
          logging: 'info',
          type: 'in-process',
          chainIdOffset: 626000,
          accounts: config.networks.hardhat.accounts,
          precompiles: {
            chainwebChainId: CHAIN_ID_ADDRESS,
            spvVerify: VERIFY_ADDRESS,
          },
          ...chainwebInProcessUserConfig,
        };

        config.networks = {
          ...config.networks,
          ...getKadenaNetworks({
            availableNetworks: userConfig.networks,
            hardhatNetwork: config.networks.hardhat,
            networkStem: getNetworkStem(name),
            numberOfChains: chainwebConfig.chains,
            accounts: chainwebConfig.accounts,
            loggingEnabled: chainwebConfig.logging === 'debug',
          }),
        };
        config.chainweb[name] = chainwebConfig;
      } else {
        const externalUserConfig =
          chainwebUserConfig as ChainwebExternalUserConfig;
        const chainwebConfig: ChainwebExternalConfig = {
          type: 'external',
          chainIdOffset: 626000,
          externalHostUrl: 'http://localhost:8545',
          accounts: 'remote',
          ...externalUserConfig,
          precompiles: {
            chainwebChainId:
              externalUserConfig.precompiles?.chainwebChainId ??
              CHAIN_ID_ADDRESS,
            spvVerify:
              externalUserConfig.precompiles?.spvVerify ?? VERIFY_ADDRESS,
          },
        };
        // add networks to hardhat
        config.networks = {
          ...config.networks,
          ...getKadenaExternalNetworks({
            availableNetworks: userConfig.networks,
            networkStem: getNetworkStem(name),
            numberOfChains: chainwebConfig.chains,
            accounts: chainwebConfig.accounts,
            baseUrl: chainwebConfig.externalHostUrl,
          }),
        };
        config.chainweb[name] = chainwebConfig;
      }
    },
  );
});

const createExternalProvider = (
  hre: HardhatRuntimeEnvironment,
  chainwebName: string,
): Omit<ChainwebPluginApi, 'initialize'> => {
  const chainweb = hre.config.chainweb[chainwebName];
  const networkStem = getNetworkStem(chainwebName);
  const utils = getUtils(hre);
  return {
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: (cid: number) => {
      const name = `${networkStem}${cid}`;
      return createProvider(hre.config, name, hre.artifacts);
    },
    requestSpvProof: utils.requestSpvProof,
    switchChain: async (cid: number | string) => {
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
      } else {
        await hre.switchNetwork(`${networkStem}${cid}`);
      }
    },
    getChainIds: () => new Array(chainweb.chains).fill(0).map((_, i) => i),
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: utils.createTamperedProof,
    computeOriginHash: utils.computeOriginHash,
  };
};

const createInternalProvider = (
  hre: HardhatRuntimeEnvironment,
  chainwebName: string,
): Omit<ChainwebPluginApi, 'initialize'> => {
  const chainweb = hre.config.chainweb[chainwebName];
  if (!chainweb || chainweb.type !== 'in-process') {
    throw new Error('Chainweb configuration not found');
  }
  const networkStem = getNetworkStem(chainwebName);
  const chainwebNetwork = new ChainwebNetwork({
    chainweb,
    networks: hre.config.networks,
    chainwebName: chainwebName,
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

  let setNetworkReady: () => void;
  const isNetworkReadyPromise = new Promise<void>((resolve) => {
    setNetworkReady = resolve;
  });

  let started = false;
  const spinupChainweb = async () => {
    if (started) return;
    started = true;
    process.on('exit', stopHardhatNetwork);
    process.on('SIGINT', stopHardhatNetwork);
    process.on('SIGTERM', stopHardhatNetwork);
    process.on('uncaughtException', stopHardhatNetwork);
    console.log('Kadena plugin initialized chains', chainweb.chains);

    return startHardhatNetwork()
      .then(() => {
        setNetworkReady();
      })
      .catch(() => {
        process.exit(1);
      });
  };

  const originalSwitchNetwork = hre.switchNetwork;
  hre.switchNetwork = async (networkNameOrIndex: string | number) => {
    await isNetworkReadyPromise;
    const networkName =
      typeof networkNameOrIndex === 'number'
        ? `${networkStem}${networkNameOrIndex}`
        : networkNameOrIndex;
    if (networkName.startsWith(networkStem)) {
      const cid = parseInt(networkName.slice(networkStem.length));
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

  const utils = getUtils(hre, chainwebNetwork);

  spinupChainweb();

  return {
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: async (cid: number) => {
      await isNetworkReadyPromise;
      const provider = chainwebNetwork.getProvider(cid);
      return provider;
    },
    requestSpvProof: utils.requestSpvProof,
    switchChain: async (cid: number | string) => {
      await isNetworkReadyPromise;
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
      } else {
        await hre.switchNetwork(`${networkStem}${cid}`);
      }
    },
    getChainIds: () => new Array(chainweb.chains).fill(0).map((_, i) => i),
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: utils.createTamperedProof,
    computeOriginHash: utils.computeOriginHash,
  };
};

// const spinupChainweb = () =>
extendEnvironment((hre) => {
  // This is here for "run" task. because hardhat runs the script as a separate process
  // and we pass the chainweb_name to the new process via environment variable ACTIVE_CHAINWEB_NAME
  const envChainweb = process.env['ACTIVE_CHAINWEB_NAME'];
  if (envChainweb) {
    if (!hre.config.chainweb[envChainweb]) {
      throw new Error(
        `Chainweb configuration ${envChainweb} not found in hardhat.config.js`,
      );
    }
    hre.config.defaultChainweb = envChainweb;
  }
  let api: Omit<ChainwebPluginApi, 'initialize'> | undefined = undefined;

  const safeCall =
    <A extends unknown[], B, T extends () => (...args: A) => B>(cb: T) =>
    (...args: A) => {
      if (api !== undefined) {
        return cb()(...args);
      }
      throw new Error('Chainweb plugin not initialized');
    };

  hre.chainweb = {
    initialize: async () => {
      console.log('Initializing chainweb plugin');
      if (api) return;
      const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
      if (chainweb.type === 'external') {
        api = createExternalProvider(hre, hre.config.defaultChainweb);
      } else {
        api = createInternalProvider(hre, hre.config.defaultChainweb);
      }
    },
    getProvider: safeCall(() => api!.getProvider),
    requestSpvProof: safeCall(() => api!.requestSpvProof),
    switchChain: safeCall(() => api!.switchChain),
    getChainIds: safeCall(() => api!.getChainIds),
    callChainIdContract: safeCall(() => api!.callChainIdContract),
    deployContractOnChains: safeCall(() => api!.deployContractOnChains),
    createTamperedProof: safeCall(() => api!.createTamperedProof),
    computeOriginHash: safeCall(() => api!.computeOriginHash),
  };
  if (envChainweb) {
    hre.chainweb.initialize();
  }
});

const chainwebSwitch = ['chainweb', 'The name of the chainweb to use'] as const;

task(
  'node',
  'Starts a JSON-RPC server on top of Hardhat Network - or a Chainweb Network',
)
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    const hasNetwork = process.argv.includes('--network');
    if (taskArgs.chainweb && hasNetwork) {
      console.error(
        'You can only specify one of chainweb or network, not both',
      );
      return;
    }
    if (hasNetwork) {
      return runSuper(taskArgs);
    }
    hre.config.defaultChainweb =
      taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';

    const config = hre.config.chainweb[hre.config.defaultChainweb];
    if (!config) {
      console.error(
        `Chainweb configuration ${hre.config.defaultChainweb} not found`,
      );
      return;
    }
    if (config.type === 'external') {
      console.error('You can only start a node for in-process chainweb');
      return;
    }

    await hre.chainweb.initialize();

    return runRPCNode(taskArgs, hre);
  });

task('test', 'Run mocha tests; Modified to support chainweb')
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    if (!hre.chainweb.initialize) {
      console.error('Chainweb _initialize is not a function');
      return;
    }
    hre.config.defaultChainweb =
      taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';
    hre.chainweb.initialize();
    return runSuper(taskArgs);
  });

task(
  'run',
  'Runs a user-defined script after compiling the project; Modified to support chainweb',
)
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    process.env['ACTIVE_CHAINWEB_NAME'] = hre.config.defaultChainweb =
      taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';
    return runSuper(taskArgs);
  });

task('print-config', 'print the final configuration').setAction(
  async (_taskArgs, hre) => {
    console.dir(hre.config, { depth: null, colors: true });
  },
);
