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
import { HardhatEthersProvider } from '@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider.js';
import Web3 from 'web3';
import { runRPCNode } from './server/runRPCNode.js';
import { CHAIN_ID_ADDRESS, VERIFY_ADDRESS } from './utils/network-contracts.js';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import picocolors from 'picocolors';
import { computeOriginHash, getNetworkStem } from './pure-utils.js';
import minimist from 'minimist';

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

  const argv = minimist(process.argv.slice(2));

  config.defaultChainweb =
    argv['chainweb'] ??
    process.env['HK_ACTIVE_CHAINWEB_NAME'] ??
    userConfig.defaultChainweb ??
    'hardhat';

  const defaultChainwebChainIdOffset = 0;

  const hardhatConfig: ChainwebInProcessUserConfig = {
    chains: 2,
    chainwebChainIdOffset: defaultChainwebChainIdOffset,
    ...userConfig.chainweb.hardhat,
    type: 'in-process',
  };

  const localhostConfig: ChainwebExternalUserConfig = {
    chains: hardhatConfig.chains,
    chainIdOffset: hardhatConfig.chainIdOffset ?? 626000,
    externalHostUrl: 'http://localhost:8545',
    chainwebChainIdOffset: hardhatConfig.chainwebChainIdOffset,
    ...userConfig.chainweb['localhost'],
    type: 'external',
  };

  const userConfigWithLocalhost = {
    ...userConfig.chainweb,
    hardhat: hardhatConfig,
    localhost: localhostConfig,
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

      const isDefaultChainweb = name === config.defaultChainweb;

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

        const offset = chainwebInProcessUserConfig.chainwebChainIdOffset ?? 0;

        const graphWithOffset = createGraph(
          chainwebInProcessUserConfig.chains,
        ).reduce(
          (acc, targets, source) => ({
            ...acc,
            [source + offset]: targets.map((target) => target + offset),
          }),
          {},
        );

        // add networks to hardhat

        const chainwebConfig: ChainwebInProcessConfig = {
          graph: chainwebInProcessUserConfig.graph ?? graphWithOffset,
          logging: 'info',
          type: 'in-process',
          chainIdOffset: 626000,
          accounts: config.networks.hardhat.accounts,
          precompiles: {
            chainwebChainId: CHAIN_ID_ADDRESS,
            spvVerify: VERIFY_ADDRESS,
          },
          chainwebChainIdOffset: defaultChainwebChainIdOffset,
          ...chainwebInProcessUserConfig,
        };

        const [networkConfig, etherscanCustomChains, etherscanApiKeys] =
          getKadenaNetworks({
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
            chainIdOffset: chainwebConfig.chainIdOffset,
            chainwebChainIdOffset: chainwebConfig.chainwebChainIdOffset,
            etherscan: isDefaultChainweb ? chainwebConfig.etherscan : undefined,
          });

        config.networks = {
          ...config.networks,
          ...networkConfig,
        };
        if (isDefaultChainweb && chainwebConfig.etherscan) {
          config.etherscan = {
            apiKey: etherscanApiKeys,
            customChains: etherscanCustomChains,
            enabled: true,
          };
        }
        config.chainweb[name] = chainwebConfig;
      } else {
        const externalUserConfig =
          chainwebUserConfig as ChainwebExternalUserConfig;
        const chainwebConfig: ChainwebExternalConfig = {
          type: 'external',
          chainIdOffset: 626000,
          externalHostUrl: 'http://localhost:8545',
          accounts: 'remote',
          chainwebChainIdOffset: defaultChainwebChainIdOffset,
          ...externalUserConfig,
          precompiles: {
            chainwebChainId:
              externalUserConfig.precompiles?.chainwebChainId ??
              CHAIN_ID_ADDRESS,
            spvVerify:
              externalUserConfig.precompiles?.spvVerify ?? VERIFY_ADDRESS,
          },
        };

        const [networkConfig, etherscanCustomChains, etherscanApiKeys] =
          getKadenaExternalNetworks({
            availableNetworks: userConfig.networks,
            networkStem: getNetworkStem(name),
            numberOfChains: chainwebConfig.chains,
            accounts: chainwebConfig.accounts,
            baseUrl: chainwebConfig.externalHostUrl,
            networkOptions: chainwebConfig.networkOptions,
            chainIdOffset: chainwebConfig.chainIdOffset,
            chainwebChainIdOffset: chainwebConfig.chainwebChainIdOffset,
            etherscan: isDefaultChainweb ? chainwebConfig.etherscan : undefined,
          });
        // add networks to hardhat
        config.networks = {
          ...config.networks,
          ...networkConfig,
        };
        config.chainweb[name] = chainwebConfig;

        if (isDefaultChainweb && chainwebConfig.etherscan) {
          config.etherscan = {
            apiKey: etherscanApiKeys,
            customChains: etherscanCustomChains,
            enabled: true,
          };
        }
      }
    },
  );
});

const createExternalProvider = async (
  hre: HardhatRuntimeEnvironment,
  chainwebName: string,
): Promise<Omit<ChainwebPluginApi, 'initialize'>> => {
  const utils = await import('./utils.js');
  const networkStem = getNetworkStem(chainwebName);
  return {
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: (cid: number) => {
      const name = `${networkStem}${cid}`;
      return createProvider(hre.config, name, hre.artifacts);
    },
    requestSpvProof: (targetChain, origin) =>
      utils.requestSpvProof(targetChain, origin),
    switchChain: async (cid: number | string) => {
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
        console.log(`Switched to ${cid}`);
      } else {
        console.log(`Switched to ${networkStem}${cid}`);
        await hre.switchNetwork(`${networkStem}${cid}`);
      }
    },
    getChainIds: utils.getChainIds,
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: (targetChain, origin) =>
      utils.createTamperedProof(targetChain, origin),
    computeOriginHash: computeOriginHash,
    runOverChains: utils.runOverChains,
    // External providers don't support snapshots - throw error
    takeSnapshot: async () => {
      throw new Error(
        'Snapshots are not supported for external chainweb providers. Use in-process chainweb for testing with fixtures.',
      );
    },
    revertToSnapshot: async () => {
      throw new Error(
        'Snapshots are not supported for external chainweb providers. Use in-process chainweb for testing with fixtures.',
      );
    },
    loadFixture: async () => {
      throw new Error(
        'Fixtures are not supported for external chainweb providers. Use in-process chainweb for testing with fixtures.',
      );
    },
    clearFixtureCache: () => {
      console.log('External providers do not support fixture cache');
    },
  };
};

const createInternalProvider = async (
  hre: HardhatRuntimeEnvironment,
  chainwebName: string,
  overrideForking?: { url: string; blockNumber?: number },
): Promise<Omit<ChainwebPluginApi, 'initialize'>> => {
  const chainweb = hre.config.chainweb[chainwebName];
  if (!chainweb || chainweb.type !== 'in-process') {
    throw new Error('Chainweb configuration not found');
  }
  const utils = await import('./utils.js');
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
      console.log(`Switched to ${cid}`);
      return;
    }
    originalSwitchNetwork(networkName);
  };

  spinupChainweb();

  // FRESH fixture cache per createInternalProvider call (like NetworkHelpers instances)
  const fixtureSnapshots: Array<{
    fixture: () => Promise<unknown>;
    result: unknown;
    snapshots: string[];
  }> = [];

  return {
    deployContractOnChains: utils.deployContractOnChains,
    getProvider: async (cid: number) => {
      await isNetworkReadyPromise;
      const provider = chainwebNetwork.getProvider(cid);
      return provider;
    },
    requestSpvProof: (targetChain, origin) =>
      utils.requestSpvProof(targetChain, origin, chainwebNetwork),
    switchChain: async (cid: number | string) => {
      await isNetworkReadyPromise;
      if (typeof cid === 'string') {
        await hre.switchNetwork(cid);
      } else {
        await hre.switchNetwork(`${networkStem}${cid}`);
      }
    },
    getChainIds: utils.getChainIds,
    callChainIdContract: utils.callChainIdContract,
    createTamperedProof: (targetChain, origin) =>
      utils.createTamperedProof(targetChain, origin, chainwebNetwork),
    computeOriginHash,
    runOverChains: utils.runOverChains,
    // Add snapshot functionality
    takeSnapshot: async () => {
      await isNetworkReadyPromise;
      return chainwebNetwork.takeSnapshot();
    },
    revertToSnapshot: async (snapshots: string[]) => {
      await isNetworkReadyPromise;
      return chainwebNetwork.revertToSnapshot(snapshots);
    },
    // Add chainweb-aware fixture loader - runs fixtures fresh every time to ensure test isolation
    loadFixture: async <T>(fixtureFunction: () => Promise<T>): Promise<T> => {
      await isNetworkReadyPromise;

      // Throw error for anonymous functions (same as official network-helpers)
      if (fixtureFunction.name === '') {
        throw new Error(
          'Anonymous functions cannot be used as fixtures. Use a named function instead.',
        );
      }

      // Always run fixture fresh to ensure proper test isolation
      console.log(`Running fixture: ${fixtureFunction.name || 'anonymous'}`);
      const result = await fixtureFunction();

      console.log(`Fixture completed: ${fixtureFunction.name || 'anonymous'}`);
      return result;
    },
    // Clear fixture cache for clean slate
    clearFixtureCache: () => {
      console.log('Clearing fixture cache...');
      fixtureSnapshots.length = 0; // Clear the per-connection array
    },
  };
};

// const spinupChainweb = () =>
extendEnvironment((hre) => {
  let api: Omit<ChainwebPluginApi, 'initialize'> | undefined = undefined;
  let initDone = () => {};
  const init = new Promise<void>((resolve) => {
    initDone = resolve;
  });

  const safeCall =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T extends () => (...args: any) => any>(cb: T) =>
      async (...args: Parameters<T>) => {
        await init;
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
        api = await createExternalProvider(hre, hre.config.defaultChainweb);
      } else {
        api = await createInternalProvider(
          hre,
          hre.config.defaultChainweb,
          args?.forking,
        );
      }
      initDone();
    },
    getProvider: safeCall(() => api!.getProvider),
    requestSpvProof: safeCall(() => api!.requestSpvProof),
    switchChain: safeCall(() => api!.switchChain),
    getChainIds: safeCall(() => api!.getChainIds),
    callChainIdContract: safeCall(() => api!.callChainIdContract),
    deployContractOnChains: safeCall(() => api!.deployContractOnChains),
    createTamperedProof: safeCall(() => api!.createTamperedProof),
    computeOriginHash,
    runOverChains: safeCall(() => api!.runOverChains),
    takeSnapshot: safeCall(() => api!.takeSnapshot),
    revertToSnapshot: safeCall(() => api!.revertToSnapshot),
    loadFixture: safeCall(() => api!.loadFixture),
    clearFixtureCache: safeCall(() => api!.clearFixtureCache),
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

// This allows to run the verify task with chainweb switch
task('verify')
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (taskArgs, hre, runSuper) => {
    return runSuper(taskArgs);
  });

task('print-config', 'print the final configuration')
  .addOptionalParam(...chainwebSwitch)
  .setAction(async (_taskArgs, hre) => {
    console.dir(hre.config, { depth: null, colors: true });
  });
