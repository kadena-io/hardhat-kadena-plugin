import { HardhatUserConfig } from 'hardhat/config';
import { ConfigHooks } from 'hardhat/types/hooks';
import {
  ChainwebExternalConfig,
  ChainwebExternalUserConfig,
  ChainwebInProcessConfig,
  ChainwebInProcessUserConfig,
} from '../type.js';
import { createGraph } from './chainweb-graph.js';
import minimist from 'minimist';
import { getKadenaEdrNetworks, getKadenaHttpNetworks } from './configure.js';
import { CHAIN_ID_ADDRESS, VERIFY_ADDRESS } from './network-contracts.js';

export const getNetworkStem = (chainwebName: string) =>
  `chainweb_${chainwebName}`;

export default async (): Promise<Partial<ConfigHooks>> => ({
  extendUserConfig: extendConfig,
});

const extendConfig = async (
  config: HardhatUserConfig,
  next: (nextConfig: HardhatUserConfig) => Promise<HardhatUserConfig>,
) => {
  const extendedUserConfig = await next(config);

  if (!extendedUserConfig.chainweb) {
    throw new Error(
      'hardhat_kadena plugins is imported but chainweb configuration is not presented in hardhat.config.js',
    );
  }
  if (Object.keys(extendedUserConfig.chainweb).length === 0) {
    throw new Error(
      'You need to provide at least one chainweb configuration in hardhat.config.js',
    );
  }

  const argv = minimist(process.argv.slice(2));

  extendedUserConfig.defaultChainweb =
    argv['chainweb'] ??
    process.env['HK_ACTIVE_CHAINWEB_NAME'] ??
    extendedUserConfig.defaultChainweb ??
    'hardhat';

  const defaultChainwebChainIdOffset = 0;

  const hardhatConfig: ChainwebInProcessUserConfig = {
    chains: 2,
    chainwebChainIdOffset: defaultChainwebChainIdOffset,
    ...extendedUserConfig.chainweb.hardhat,
    type: 'edr-simulated',
  };

  const localhostConfig: ChainwebExternalUserConfig = {
    chains: hardhatConfig.chains,
    chainIdOffset: hardhatConfig.chainIdOffset ?? 626000,
    externalHostUrl: 'http://localhost:8545',
    chainwebChainIdOffset: hardhatConfig.chainwebChainIdOffset,
    ...extendedUserConfig.chainweb['localhost'],
    type: 'http',
  };

  const userConfigWithLocalhost = {
    ...extendedUserConfig.chainweb,
    hardhat: hardhatConfig,
    localhost: localhostConfig,
  };

  if (
    !extendedUserConfig.defaultChainweb ||
    !(extendedUserConfig.defaultChainweb in userConfigWithLocalhost)
  ) {
    throw new Error(
      `Default chainweb ${extendedUserConfig.defaultChainweb} not found in hardhat.config.js`,
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
      let type = chainwebUserConfig.type ?? 'edr-simulated';
      if (name === 'hardhat') {
        type = 'edr-simulated';
      }
      if (name === 'localhost') {
        type = 'http';
      }

      // this would be valid only for etherscan chainweb
      // const isDefaultChainweb = name === config.defaultChainweb;

      if (type === 'edr-simulated') {
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
          chainIdOffset: 626000,
          chainwebChainIdOffset: defaultChainwebChainIdOffset,
          ...chainwebInProcessUserConfig,
          type: 'edr-simulated',
          precompiles: {
            chainwebChainId: CHAIN_ID_ADDRESS,
            spvVerify: VERIFY_ADDRESS,
          },
        };

        const extendedNetworkConfig = getKadenaEdrNetworks({
          networks: extendedUserConfig.networks,
          networkStem: getNetworkStem(name),
          numberOfChains: chainwebConfig.chains,
          accounts:
            chainwebConfig.accounts ?? chainwebConfig.networkOptions?.accounts,
          loggingEnabled: chainwebConfig.logging === 'debug',
          forking: chainwebConfig.networkOptions?.forking?.url
            ? { enabled: true, ...chainwebConfig.networkOptions.forking }
            : undefined,
          networkOptions: chainwebConfig.networkOptions,
          chainIdOffset: chainwebConfig.chainIdOffset,
          chainwebChainIdOffset: chainwebConfig.chainwebChainIdOffset,
        });

        extendedUserConfig.networks = {
          ...extendedUserConfig.networks,
          ...extendedNetworkConfig,
        };

        extendedUserConfig.chainweb[name] = chainwebConfig;
      } else {
        const externalUserConfig =
          chainwebUserConfig as ChainwebExternalUserConfig;
        const chainwebConfig: ChainwebExternalConfig = {
          type: 'http',
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

        const networkConfig = getKadenaHttpNetworks({
          networks: extendedUserConfig.networks,
          networkStem: getNetworkStem(name),
          numberOfChains: chainwebConfig.chains,
          accounts: chainwebConfig.accounts,
          baseUrl: chainwebConfig.externalHostUrl,
          networkOptions: chainwebConfig.networkOptions,
          chainIdOffset: chainwebConfig.chainIdOffset,
          chainwebChainIdOffset: chainwebConfig.chainwebChainIdOffset,
        });
        // add networks to hardhat
        extendedUserConfig.networks = {
          ...extendedUserConfig.networks,
          ...networkConfig,
        };
        extendedUserConfig.chainweb[name] = chainwebConfig;
      }
    },
  );
  return extendedUserConfig;
};
