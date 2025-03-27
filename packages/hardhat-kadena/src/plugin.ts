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
import picocolors from 'picocolors';

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

  config.defaultChainweb =
    process.env['HK_ACTIVE_CHAINWEB_NAME'] ??
    userConfig.defaultChainweb ??
    'hardhat';

  const hardhatConfig = {
    chains: 2,
    ...userConfig.chainweb.hardhat,
    type: 'in-process',
  };

  const userConfigWithLocalhost = {
    ...userConfig.chainweb,
    hardhat: hardhatConfig,
    localhost: {
      chains: hardhatConfig.chains,
      chainIdOffset: hardhatConfig.chainIdOffset ?? 626000,
      externalHostUrl: 'http://localhost:8545',
      ...userConfig.chainweb['localhost'],
      type: 'external',
    },
  };

  if (!(config.defaultChainweb in userConfigWithLocalhost)) {
    throw new Error(
      `Default chainweb ${config.defaultChainweb} not found in hardhat.config.js`,
    );
  }

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

      if (type === 'in-process') {
        const chainwebInProcessUserConfig =
          chainwebUserConfig as ChainwebInProcessUserConfig;

        if (chainwebInProcessUserConfig.graph) {
          const graph = chainwebInProcessUserConfig.graph ?? {};
          if (
            chainwebInProcessUserConfig.chains &&
            Object.keys(graph).length != chainwebInProcessUserConfig.chains
          ) {
            throw new Error(
              'Number of chains in graph does not match the graph configuration',
            );
          }
        }
        // add networks to hardhat

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
            accounts:
              chainwebConfig.accounts ??
              chainwebConfig.networkOptions?.accounts,
            loggingEnabled: chainwebConfig.logging === 'debug',
            forking: chainwebConfig.networkOptions?.forking?.url
              ? { enabled: true, ...chainwebConfig.networkOptions.forking }
              : undefined,
            networkOptions: chainwebConfig.networkOptions,
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
            networkOptions: chainwebConfig.networkOptions,
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
    runOverChains: utils.runOverChains,
  };
};

const createInternalProvider = (
  hre: HardhatRuntimeEnvironment,
  chainwebName: string,
  overrideForking?: { url: string; blockNumber?: number },
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
    overrideForking,
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
    runOverChains: utils.runOverChains,
  };
};

// const spinupChainweb = () =>
extendEnvironment((hre) => {
  let api: Omit<ChainwebPluginApi, 'initialize'> | undefined = undefined;

  const safeCall =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T extends () => (...args: any) => any>(cb: T) =>
      (...args: Parameters<T>) => {
        if (api !== undefined) {
          return cb()(...args);
        }
        throw new Error('Chainweb plugin not initialized');
      };

  hre.chainweb = {
    initialize: async (args) => {
      if (api) return;
      const chainweb = hre.config.chainweb[hre.config.defaultChainweb];
      if (!chainweb) {
        throw new Error('Chainweb configuration not found');
      }

      console.log(
        'Chainweb:',
        picocolors.bgGreenBright(` ${hre.config.defaultChainweb} `),
        'Chains:',
        picocolors.bgGreenBright(` ${chainweb.chains} `),
        '\n',
      );

      if (chainweb.type === 'external') {
        api = createExternalProvider(hre, hre.config.defaultChainweb);
      } else {
        api = createInternalProvider(
          hre,
          hre.config.defaultChainweb,
          args?.forking,
        );
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
    runOverChains: safeCall(() => api!.runOverChains),
  };
  if (process.env['HK_INIT_CHAINWEB'] === 'true') {
    hre.chainweb.initialize();
  }
});

const chainwebSwitch = ['chainweb', 'The name of the chainweb to use'] as const;

task(
  'node',
  `Starts a JSON-RPC server on top of Default Chainweb; use ${picocolors.bgBlackBright(' --network ')} if you want to run a single network rather than a chainweb`,
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
      console.log(
        `Chainweb configuration ${hre.config.defaultChainweb} not found`,
      );
      return;
    }
    if (config.type === 'external') {
      console.error('You can only start a node for in-process chainweb');
      return;
    }

    let options:
      | undefined
      | { forking: { url: string; blockNumber?: number } } = undefined;

    if (taskArgs.fork) {
      options = {
        forking: {
          url: taskArgs.fork,
          blockNumber: taskArgs.forkBlockNumber,
        },
      };
    }

    await hre.chainweb.initialize(options);

    return runRPCNode(taskArgs, hre);
  });

task('test', `Run mocha tests; Supports Chainweb`)
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    if (!hre.chainweb.initialize) {
      console.error('Chainweb _initialize is not a function');
      return;
    }
    hre.config.defaultChainweb =
      taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';

    hre.chainweb.initialize();

    if (!process.argv.includes('--network')) {
      await hre.chainweb.switchChain(0);
    }

    return runSuper(taskArgs);
  });

task(
  'run',
  `Runs a user-defined script after compiling the project; Supports Chainweb`,
)
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    // Since hardhat run the script in a separate process, we need to set the following configurations
    // as environment variables then Hardhat forward them to the script process
    process.env['HK_ACTIVE_CHAINWEB_NAME'] = hre.config.defaultChainweb =
      taskArgs.chainweb ?? hre.config.defaultChainweb ?? 'hardhat';
    // then we know that the chainweb should run the initialization
    process.env['HK_INIT_CHAINWEB'] = 'true';
    return runSuper(taskArgs);
  });

task('print-config', 'print the final configuration').setAction(
  async (_taskArgs, hre) => {
    console.dir(hre.config, { depth: null, colors: true });
  },
);
