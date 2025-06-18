import {
  HardhatConfig,
  HardhatNetworkAccountsConfig,
  HardhatNetworkAccountsUserConfig,
  HardhatNetworkChainConfig,
  HardhatNetworkChainsConfig,
  HardhatNetworkConfig,
  HardhatNetworkUserConfig,
  HttpNetworkAccountsConfig,
  HttpNetworkAccountsUserConfig,
  HttpNetworkConfig,
  HttpNetworkUserConfig,
  KadenaNetworkConfig,
  NetworksUserConfig,
} from 'hardhat/types';
import { mapChainIdToRoute } from '../server/utils';

interface INetworkOptions {
  availableNetworks: undefined | NetworksUserConfig;
  hardhatNetwork: HardhatNetworkConfig;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: HardhatNetworkAccountsConfig | undefined;
  loggingEnabled?: boolean | undefined;
  forking?: HardhatNetworkUserConfig['forking'];
  networkOptions?: HardhatNetworkUserConfig;
  chainwebChainIdOffset: number;
  etherscan?: {
    apiKey: string;
    apiURLTemplate: string;
    browserURLTemplate: string;
  };
}

// This function takes a default chains config and user chains config
// Copied from hardhat source code hardhat/src/internal/core/config/config-resolution.ts
const getChains = (
  defaultChains: HardhatNetworkChainsConfig,
  userChains?: HardhatNetworkUserConfig['chains'],
) => {
  const chains: HardhatNetworkChainsConfig = new Map(defaultChains);
  if (userChains !== undefined) {
    for (const [chainId, userChainConfig] of Object.entries(userChains)) {
      const chainConfig: HardhatNetworkChainConfig = {
        hardforkHistory: new Map(),
      };
      if (userChainConfig.hardforkHistory !== undefined) {
        for (const [name, block] of Object.entries(
          userChainConfig.hardforkHistory,
        )) {
          chainConfig.hardforkHistory.set(name, block as number);
        }
      }
      chains.set(parseInt(chainId, 10), chainConfig);
    }
  }
  return chains;
};

function normalizeHexString(str: string): string {
  const normalized = str.trim().toLowerCase();
  if (normalized.startsWith('0x')) {
    return normalized;
  }

  return `0x${normalized}`;
}

// This function takes a default accounts config and user accounts config
// and returns a normalized accounts config
// Copied from hardhat source code hardhat/src/internal/core/config/config-resolution.ts
const getAccounts = (
  userAccounts: HardhatNetworkAccountsUserConfig | undefined,
  defaultAccounts: HardhatNetworkAccountsConfig,
) => {
  const accounts: HardhatNetworkAccountsConfig =
    userAccounts === undefined
      ? defaultAccounts
      : Array.isArray(userAccounts)
        ? userAccounts.map(({ privateKey, balance }) => ({
            privateKey: normalizeHexString(privateKey),
            balance,
          }))
        : {
            ...defaultAccounts,
            ...userAccounts,
          };

  return accounts;
};

const mapToEtherscan = ({
  networkStem,
  chainId,
  chainwebChainId,
  apiURLTemplate,
  browserURLTemplate,
}: {
  networkStem: string;
  chainId: number;
  chainwebChainId: number;
  apiURLTemplate: string;
  browserURLTemplate: string;
}): HardhatConfig['etherscan']['customChains'][number] => {
  return {
    chainId,
    network: `${networkStem}${chainwebChainId}`,
    urls: {
      apiURL: apiURLTemplate.replace('{cid}', String(chainwebChainId)),
      browserURL: browserURLTemplate.replace('{cid}', String(chainwebChainId)),
    },
  };
};

export const getKadenaNetworks = ({
  availableNetworks = {},
  hardhatNetwork,
  networkStem = 'kadena_devnet_',
  chainIdOffset = 626000,
  numberOfChains = 2,
  accounts,
  loggingEnabled = false,
  forking,
  networkOptions,
  chainwebChainIdOffset = 0,
  etherscan,
}: INetworkOptions): [
  Record<string, HardhatNetworkConfig>,
  HardhatConfig['etherscan']['customChains'],
  Record<string, string>,
] => {
  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const etherscanCustomChains: HardhatConfig['etherscan']['customChains'] = [];
  const etherscanApiKeys: Record<string, string> = {};
  const networks = chainIds.reduce(
    (acc, chainId, chainwebChainIndex) => {
      const chainwebChainId = chainwebChainIndex + chainwebChainIdOffset;
      const userNetworkConfig = availableNetworks[
        `${networkStem}${chainwebChainId}`
      ] as HardhatNetworkUserConfig | undefined;

      const networkForking = forking
        ? {
            enabled: true,
            ...forking,
          }
        : undefined;

      const networkConfig: KadenaNetworkConfig = {
        ...hardhatNetwork,
        ...networkOptions,
        chainId: chainId,
        chainwebChainId,
        type: 'chainweb:in-process',
        loggingEnabled,
        ...userNetworkConfig,
        forking: networkForking,
        mining: {
          ...hardhatNetwork.mining,
          ...userNetworkConfig?.mining,
          mempool: {
            ...hardhatNetwork.mining.mempool,
            ...userNetworkConfig?.mining?.mempool,
          },
        },
        minGasPrice: BigInt(
          userNetworkConfig?.minGasPrice ?? hardhatNetwork.minGasPrice,
        ),
        accounts: getAccounts(
          accounts ?? userNetworkConfig?.['accounts'],
          hardhatNetwork.accounts,
        ),
        chains: getChains(
          hardhatNetwork.chains,
          networkOptions?.chains ?? userNetworkConfig?.chains,
        ),
      };
      acc[`${networkStem}${chainwebChainId}`] = networkConfig;
      if (etherscan) {
        etherscanCustomChains.push(
          mapToEtherscan({
            networkStem,
            chainId,
            chainwebChainId,
            apiURLTemplate: etherscan.apiURLTemplate,
            browserURLTemplate: etherscan.browserURLTemplate,
          }),
        );
        etherscanApiKeys[`${networkStem}${chainwebChainId}`] =
          etherscan?.apiKey;
      }
      return acc;
    },
    {} as Record<string, KadenaNetworkConfig>,
  );

  return [networks, etherscanCustomChains, etherscanApiKeys];
};

interface IExternalNetworkOptions {
  availableNetworks: undefined | NetworksUserConfig;
  networkStem?: string | undefined;
  chainIdOffset?: number | undefined;
  numberOfChains?: number | undefined;
  accounts?: HttpNetworkAccountsConfig;
  baseUrl?: string;
  networkOptions?: HttpNetworkUserConfig;
  chainwebChainIdOffset: number;
  etherscan?: {
    apiKey: string;
    apiURLTemplate: string;
    browserURLTemplate: string;
  };
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
  chainIdOffset = 626000,
  numberOfChains = 2,
  accounts = 'remote',
  baseUrl = 'http://localhost:8545',
  networkOptions = {},
  chainwebChainIdOffset,
  etherscan,
}: IExternalNetworkOptions): [
  Record<string, HttpNetworkConfig>,
  HardhatConfig['etherscan']['customChains'],
  Record<string, string>,
] => {
  const etherscanCustomChains: HardhatConfig['etherscan']['customChains'] = [];
  const etherscanApiKeys: Record<string, string> = {};
  const chainIds = new Array(numberOfChains)
    .fill(0)
    .map((_, i) => i + chainIdOffset);
  const basePath = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const networks = chainIds.reduce(
    (acc, chainId, chainwebChainIndex) => {
      const chainwebChainId = chainwebChainIndex + chainwebChainIdOffset;

      const userConfig = availableNetworks[
        `${networkStem}${chainwebChainId}`
      ] as HttpNetworkUserConfig | undefined;

      const networkConfig: HttpNetworkConfig = {
        ...networkOptions,
        chainId: chainId,
        chainwebChainId,
        type: 'chainweb:external',
        gasPrice: 'auto',
        gas: 'auto',
        gasMultiplier: 1,
        timeout: 20000,
        httpHeaders: {},
        url: `${basePath}${mapChainIdToRoute(chainwebChainId)}`,
        ...userConfig,
        accounts: userConfig?.accounts
          ? toHttpNetworkAccountsConfig(userConfig.accounts)
          : accounts,
        ignition: {
          maxFeePerGasLimit: userConfig?.ignition?.maxFeePerGasLimit,
          maxPriorityFeePerGas: userConfig?.ignition?.maxPriorityFeePerGas,
          gasPrice: userConfig?.ignition?.gasPrice,
          disableFeeBumping: userConfig?.ignition?.disableFeeBumping,
          explorerUrl: userConfig?.ignition?.explorerUrl,
        },
      };
      acc[`${networkStem}${chainwebChainId}`] = networkConfig;
      if (etherscan) {
        etherscanCustomChains.push(
          mapToEtherscan({
            networkStem,
            chainId,
            chainwebChainId,
            apiURLTemplate: etherscan.apiURLTemplate,
            browserURLTemplate: etherscan.browserURLTemplate,
          }),
        );
        etherscanApiKeys[`${networkStem}${chainwebChainId}`] =
          etherscan?.apiKey;
      }
      return acc;
    },
    {} as Record<string, HttpNetworkConfig>,
  );

  return [networks, etherscanCustomChains, etherscanApiKeys];
};
