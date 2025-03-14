import {
  HardhatNetworkAccountsConfig,
  HardhatNetworkConfig,
  HttpNetworkAccountsConfig,
  HttpNetworkAccountsUserConfig,
  HttpNetworkConfig,
  HttpNetworkUserConfig,
  KadenaNetworkConfig,
  NetworksUserConfig,
} from 'hardhat/types';

interface INetworkOptions {
  availableNetworks: undefined | NetworksUserConfig;
  hardhatNetwork: HardhatNetworkConfig;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: HardhatNetworkAccountsConfig | undefined;
  loggingEnabled?: boolean | undefined;
}

export const getKadenaNetworks = ({
  availableNetworks = {},
  hardhatNetwork,
  networkStem = 'kadena_devnet_',
  chainIdOffset = 0,
  numberOfChains = 2,
  accounts,
  loggingEnabled = false,
}: INetworkOptions): Record<string, HardhatNetworkConfig> => {
  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const networks = chainIds.reduce(
    (acc, chainId, index) => {
      const networkConfig: KadenaNetworkConfig = {
        ...hardhatNetwork,
        chainId: 626000 + chainId,
        chainwebChainId: chainId,
        accounts: accounts ?? hardhatNetwork.accounts,
        type: 'chainweb:in-process',
        loggingEnabled,
        ...availableNetworks[`${networkStem}${index}`],
      } as KadenaNetworkConfig;
      acc[`${networkStem}${index}`] = networkConfig;
      return acc;
    },
    {} as Record<string, KadenaNetworkConfig>,
  );

  return networks;
};

interface IExternalNetworkOptions {
  availableNetworks: undefined | NetworksUserConfig;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: HttpNetworkAccountsConfig;
  baseUrl?: string;
}

const toHttpNetworkAccountsConfig = (
  accounts: HttpNetworkAccountsUserConfig,
): HttpNetworkAccountsConfig => {
  if (accounts === 'remote') {
    return accounts;
  }
  if (Array.isArray(accounts)) {
    return accounts;
  }
  return {
    initialIndex: 0,
    count: 20,
    passphrase: '',
    path: "m/44'/60'/0'/0",
    ...accounts,
  };
};

export const getKadenaExternalNetworks = ({
  availableNetworks = {},
  networkStem = 'kadena_devnet_',
  chainIdOffset = 0,
  numberOfChains = 2,
  accounts = 'remote',
  baseUrl = 'http://localhost:8545',
}: IExternalNetworkOptions): Record<string, HttpNetworkConfig> => {
  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const networks = chainIds.reduce(
    (acc, chainId, index) => {
      const userConfig = availableNetworks[`${networkStem}${index}`] as
        | HttpNetworkUserConfig
        | undefined;
      const networkConfig: HttpNetworkConfig = {
        chainId: 626000 + chainId,
        chainwebChainId: chainId,
        type: 'chainweb:external',
        gasPrice: 'auto',
        gas: 'auto',
        gasMultiplier: 1,
        timeout: 20000,
        httpHeaders: {},
        url: `${baseUrl}/chain/${chainId}`,
        ...userConfig,
        accounts: userConfig?.accounts
          ? toHttpNetworkAccountsConfig(userConfig.accounts)
          : accounts,
      };
      acc[`${networkStem}${index}`] = networkConfig;
      return acc;
    },
    {} as Record<string, HttpNetworkConfig>,
  );

  return networks;
};
