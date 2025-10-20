import {
  EdrNetworkAccountsUserConfig,
  EdrNetworkUserConfig,
  HttpNetworkAccountsUserConfig,
  HttpNetworkUserConfig,
} from 'hardhat/types/config';
import { NetworkConnection } from 'hardhat/types/network';

type OptionalOnly<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

export interface ChainwebInProcessUserConfig {
  accounts?: EdrNetworkAccountsUserConfig;
  chains: number;
  graph?: { [key: number]: number[] };
  logging?: 'none' | 'info' | 'debug';
  type?: 'edr-simulated';
  chainIdOffset?: number;
  networkOptions?: Partial<EdrNetworkUserConfig>;
  chainwebChainIdOffset?: number;
  etherscan?: {
    apiKey: string;
    apiURLTemplate: string;
    browserURLTemplate: string;
  };
}

export interface ChainwebInProcessConfig
  extends OptionalOnly<
    Required<ChainwebInProcessUserConfig>,
    'networkOptions' | 'etherscan' | 'accounts'
  > {
  precompiles: {
    chainwebChainId: string;
    spvVerify: string;
  };
}

export interface ChainwebExternalUserConfig {
  accounts?: HttpNetworkAccountsUserConfig;
  chains: number;
  type?: 'http';
  externalHostUrl?: string;
  chainIdOffset?: number;
  precompiles?: {
    chainwebChainId?: string;
    spvVerify?: string;
  };
  chainwebChainIdOffset?: number;
  networkOptions?: Omit<HttpNetworkUserConfig, 'chainId' | 'url'>;
  etherscan?: {
    apiKey: string;
    apiURLTemplate: string;
    browserURLTemplate: string;
  };
}

export interface ChainwebExternalConfig
  extends OptionalOnly<
    Required<ChainwebExternalUserConfig>,
    'networkOptions' | 'etherscan'
  > {
  precompiles: {
    chainwebChainId: string;
    spvVerify: string;
  };
}

export type ChainwebUserConfig =
  | ChainwebInProcessUserConfig
  | ChainwebExternalUserConfig;

export type ChainwebConfig = ChainwebInProcessConfig | ChainwebExternalConfig;

declare module 'hardhat/types/config' {
  interface HardhatUserConfig {
    chainweb: {
      hardhat?: ChainwebInProcessUserConfig;
      localhost?: ChainwebExternalUserConfig;
      [chainwebName: string]: ChainwebUserConfig | undefined;
    };
    defaultChainweb?: string;
  }
  interface HardhatConfig {
    chainweb: {
      hardhat: ChainwebInProcessConfig;
      localhost: ChainwebExternalConfig;
      [chainwebName: string]: ChainwebConfig;
    };
    defaultChainweb: string;
  }
}

declare module 'hardhat/types/hre' {
  interface HardhatRuntimeEnvironment {
    chainweb: {
      getCwChainIds: () => number[];
      connect: (options: {
        cwId: number;
      }) => Promise<NetworkConnection<'generic'>>;
    };
  }
}
