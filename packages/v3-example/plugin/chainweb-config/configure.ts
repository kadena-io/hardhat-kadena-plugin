import {
  EdrNetworkUserConfig,
  HttpNetworkAccountsUserConfig,
  HttpNetworkUserConfig,
  NetworkUserConfig,
} from 'hardhat/types/config';

interface INetworkOptions {
  networks: undefined | Record<string, NetworkUserConfig>;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: EdrNetworkUserConfig['accounts'] | undefined;
  loggingEnabled?: boolean | undefined;
  forking?: EdrNetworkUserConfig['forking'];
  networkOptions?: EdrNetworkUserConfig;
  chainwebChainIdOffset: number;
}

export const mapChainIdToRoute = (id: number): string => {
  return `/chain/${id}/evm/rpc`;
};

export const getKadenaEdrNetworks = ({
  networks = {},
  networkStem = 'kadena_devnet_',
  chainIdOffset = 626000,
  numberOfChains = 2,
  accounts,
  loggingEnabled = false,
  forking,
  networkOptions,
  chainwebChainIdOffset = 0,
}: INetworkOptions): Record<string, EdrNetworkUserConfig> => {
  const hardhatNetwork: Partial<EdrNetworkUserConfig> = {
    ...(networks.default as EdrNetworkUserConfig),
  };

  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const extendedNetworks = chainIds.reduce(
    (acc, chainId, chainwebChainIndex) => {
      const chainwebChainId = chainwebChainIndex + chainwebChainIdOffset;
      const networkName = `${networkStem}${chainwebChainId}`;

      const userOverrideConfig: Partial<EdrNetworkUserConfig> = {
        ...(networks[networkName] as EdrNetworkUserConfig),
      };

      const networkForking = forking
        ? {
            enabled: true,
            ...forking,
          }
        : undefined;

      const networkConfig: EdrNetworkUserConfig = {
        ...hardhatNetwork,
        ...networkOptions,
        chainId: chainId,
        loggingEnabled,
        ...userOverrideConfig,
        type: 'edr-simulated',
        ...(networkForking ? { forking: networkForking } : {}),
        ...(accounts ? { accounts } : {}),
      };
      acc[`${networkStem}${chainwebChainId}`] = networkConfig;
      return acc;
    },
    {} as Record<string, EdrNetworkUserConfig>,
  );

  return extendedNetworks;
};

interface IExternalNetworkOptions {
  networks: undefined | Record<string, NetworkUserConfig>;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: HttpNetworkAccountsUserConfig;
  baseUrl?: string;
  networkOptions?: Partial<HttpNetworkUserConfig>;
  chainwebChainIdOffset: number;
}

export const getKadenaHttpNetworks = ({
  networks = {},
  networkStem = 'kadena_devnet_',
  chainIdOffset = 626000,
  numberOfChains = 2,
  accounts = 'remote',
  baseUrl = 'http://localhost:8545',
  networkOptions = {},
  chainwebChainIdOffset,
}: IExternalNetworkOptions): Record<string, HttpNetworkUserConfig> => {
  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const basePath = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const extendedNetworks = chainIds.reduce(
    (acc, chainId, chainwebChainIndex) => {
      const chainwebChainId = chainwebChainIndex + chainwebChainIdOffset;

      const userConfig = networks[`${networkStem}${chainwebChainId}`] as
        | HttpNetworkUserConfig
        | undefined;

      const networkConfig: HttpNetworkUserConfig = {
        ...networkOptions,
        chainId: chainId,
        url: `${basePath}${mapChainIdToRoute(chainwebChainId)}`,
        ...userConfig,
        ...(userConfig?.accounts || accounts
          ? { accounts: userConfig?.accounts || accounts }
          : {}),
        type: 'http',
      };
      acc[`${networkStem}${chainwebChainId}`] = networkConfig;
      return acc;
    },
    {} as Record<string, HttpNetworkUserConfig>,
  );

  return extendedNetworks;
};
